import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JsonRpcProvider,Interface,AbiCoder,keccak256,Contract} from 'ethers';
import {aggregateFundingAbi} from '../../shared/rolling/aggregate-funding.mjs';
import {verifyEthereumIntentReceipt} from '../../shared/ethereum-journal.mjs';
const directory='/private/tmp/rolling-dev.ohvnkp4p/state';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const config=(await read(directory+'/rolling-wallet-public.json')).config,s=config.aggregateFunding;
const original='0x636352dcf72a69f5695c33257c6aa5684d31c0a96ff08e9a8710bbabb193e709';
const relayFile=directory+'/exchange-liquidity/relay-state/129481c79b0ca8da40e74b1df1bc8a8acc38322dbd3638bc8fb235ddc17613e0.json';
const relay=(await read(relayFile)).operations['relay-funding'];
const provider=new JsonRpcProvider(config.network.ethRpcUrl,undefined,{cacheTimeout:-1}),abi=new Interface(aggregateFundingAbi);
const token=new Contract(s.bokToken,['function balanceOf(address) view returns(uint256)'],provider);
const report={observedAt:new Date().toISOString(),chainId:'31337',scope:'read-only L1 funding effects; not independent source review or L2 claim verification',hashDiscovery:'Original ETH hash supplied by lead; USDC hash read only from the named original relay operation journal. No chain scan.',transactions:[]};
try{
 assert.equal(String((await provider.getNetwork()).chainId),'31337');
 for(const [kind,hash] of [['ETH',original],['USDC',relay.hash]]){
  const tx=await provider.getTransaction(hash);assert(tx);assert.equal(tx.to.toLowerCase(),s.router);
  const parsed=abi.parseTransaction(tx),plan=parsed.args[0],planHash=keccak256(AbiCoder.defaultAbiCoder().encode([abi.getFunction(parsed.name).inputs[0]],[plan]));
  const expected={kind:kind==='ETH'?'aggregate-funding':'aggregate-usdc-funding',routerCodeHash:s.routerCodeHash,collateralPortal:s.collateralPortal,feePortal:s.feePortal,bokPortal:s.bokPortal,privateFpc:s.privateFpc,planHash};
  const record=kind==='USDC'?{...relay.deployment.intent,nonce:relay.deployment.nonce}:{from:tx.from.toLowerCase(),to:tx.to.toLowerCase(),chainId:String(tx.chainId),nonce:tx.nonce,data:tx.data.toLowerCase(),value:String(tx.value),expected};
  assert.deepEqual(record.expected,expected);
  const verified=await verifyEthereumIntentReceipt(provider,record,hash);assert.equal(verified?.outcome,'success');
  const e=verified.event,r=verified.receipt,block=await provider.getBlock(r.blockNumber);assert.equal(block.transactions.length,1);
  const beneficiary=plan.beneficiary.toLowerCase(),gasWei=r.gasUsed*r.gasPrice;
  const row={kind,hash,blockNumber:r.blockNumber,blockHash:r.blockHash,canonical:true,from:tx.from.toLowerCase(),beneficiary,ethereumNonce:tx.nonce,planHash,successful:true,exactThreePortalEventsVerified:true,collateralWei:e.collateral.amount,privateFeeTokenBaseUnits:e.privateFee.amount,bokMicroUsdc:e.bok.amount,gasPaidWei:String(gasWei),gasPayer:tx.from.toLowerCase(),receiptMessageIndices:[e.collateral.leafIndex,e.privateFee.leafIndex,e.bok.leafIndex]};
  if(kind==='ETH'){
   const used=BigInt(e.collateral.amount)+BigInt(e.feeEth)+BigInt(e.bokEth),value=used+BigInt(e.refund);
   assert.equal(tx.value,value);
   const balanceChange=(await provider.getBalance(beneficiary,r.blockNumber-1))-(await provider.getBalance(beneficiary,r.blockNumber));assert.equal(balanceChange,used+gasWei);
   Object.assign(row,{sentWei:String(tx.value),feeSwapWei:e.feeEth,bokSwapWei:e.bokEth,refundWei:e.refund,netFundingWei:String(used),observedBeneficiaryEthDecreaseWei:String(balanceChange),fundingPlusGasBalanced:true});
  }else{
   const spent=BigInt(e.collateralUsdc)+BigInt(e.feeUsdc)+BigInt(e.bok.amount)+BigInt(e.relayFeeUsdc),authorized=spent+BigInt(e.refund);
   assert.equal(authorized,plan.collateral.maxUsdc+plan.fee.maxUsdc+plan.bokAmount+plan.relayFeeUsdc);assert.equal(tx.value,0n);
   const before=await token.balanceOf(beneficiary,{blockTag:r.blockNumber-1}),after=await token.balanceOf(beneficiary,{blockTag:r.blockNumber});assert.equal(before-after,spent);
   assert.equal(await provider.getBalance(beneficiary,r.blockNumber-1),0n);assert.equal(await provider.getBalance(beneficiary,r.blockNumber),0n);
   Object.assign(row,{collateralSwapMicroUsdc:e.collateralUsdc,feeSwapMicroUsdc:e.feeUsdc,relayFeeMicroUsdc:e.relayFeeUsdc,authorizedMicroUsdc:String(authorized),refundMicroUsdc:e.refund,spentMicroUsdc:String(spent),beneficiaryMicroUsdcBefore:String(before),beneficiaryMicroUsdcAfter:String(after),beneficiaryEthBeforeWei:'0',beneficiaryEthAfterWei:'0',tokenSpendBalanced:true});
  }
  report.transactions.push(row);
 }
 const user=report.transactions.find(v=>v.kind==='USDC').beneficiary;
 report.final={beneficiary:user,beneficiaryEthWei:String(await provider.getBalance(user)),beneficiaryNonce:await provider.getTransactionCount(user),relayer:s.usdcRelayAddress,relayLatestNonce:await provider.getTransactionCount(s.usdcRelayAddress,'latest'),relayPendingNonce:await provider.getTransactionCount(s.usdcRelayAddress,'pending')};
 assert.equal(report.final.beneficiaryEthWei,'0');assert.equal(report.final.beneficiaryNonce,0);assert.equal(report.final.relayLatestNonce,1);assert.equal(report.final.relayPendingNonce,1);
 report.sourceHashes={};for(const f of ['shared/rolling/aggregate-funding.mjs','shared/rolling/aggregate-recovery.mjs','shared/ethereum-journal.mjs'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(f)).digest('hex');
 report.passed=true;await fs.writeFile(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{provider.destroy();}
