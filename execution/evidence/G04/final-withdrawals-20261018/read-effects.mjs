import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {JsonRpcProvider,Contract,Interface,AbiCoder,encodeBytes32String,getBytes} from 'ethers';
import {OutboxAbi} from '@aztec-foundation/l1-artifacts';
import {createAztecNodeClient} from '@aztec-labs/aztec.js/node';
import {TxHash} from '@aztec-labs/stdlib/tx';import {Fr} from '@aztec-labs/foundation/curves/bn254';import {EthAddress} from '@aztec-labs/foundation/eth-address';import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';import {computeL2ToL1MessageHash} from '@aztec-labs/stdlib/hash';
import {verifyEthereumIntentReceipt} from '../../shared/ethereum-journal.mjs';import {requireSuccessfulReceipt} from '../../shared/transaction-outcomes.mjs';import {encodeEscrowCommitment,sha256Field} from '../../shared/protocol-commitments.mjs';
const read=async f=>JSON.parse(await fs.readFile(f,'utf8')),root='/private/tmp/rolling-dev.ohvnkp4p/state';
const browser=await read('../aztec_experiments/execution/evidence/G04/final-withdrawals-20261018/browser-result.json'),config=(await read(root+'/rolling-wallet-public.json')).config,deployment=await read(root+'/deployment.json');
const l2={bok:{hash:'0x09cece8f37f78b5360db3fdba6db89bd233a7e5d4604bd53410ad62e1e81989c',block:20,blockHash:'0x1dc34789a412f2d52a4dcdd19f3f0c14fc53bd829645da9e76f59033d8442e7a'},collateral:{hash:'0x1ac032c7a4c3fb4135bccabb504b70a9c984c1ab75701913915e44a6f3a64241',block:21,blockHash:'0x0293b4bcf2c0322de37717a0ea2abb8f24fafedcda32359269fc5af85fa90371'}};
const p=new JsonRpcProvider(config.network.ethRpcUrl,undefined,{cacheTimeout:-1}),node=createAztecNodeClient(deployment.network.nodeUrl),outbox=new Contract(deployment.network.outbox,OutboxAbi,p),token=new Contract(config.aggregateFunding.bokToken,['function balanceOf(address) view returns(uint256)'],p),outboxAbi=new Interface(OutboxAbi);
const report={observedAt:new Date().toISOString(),source:browser.source,walletRuntime:browser.walletRuntime,chainId:31337,proofsEnabled:false,withdrawals:[],limits:['Read-only observed effects, not independent source review.','Browser private journals and backups not opened or decrypted.','Native locally settled proof-disabled chain; no real-proof/testnet assurance.']};
try{
 assert.equal(String((await p.getNetwork()).chainId),'31337');
 for(const kind of ['bok','collateral']){
  const recorded=browser[kind],isBok=kind==='bok',portal=isBok?config.aggregateFunding.bokPortal:config.board.portalAddress,sender=isBok?config.bok.contractAddress:config.board.contractAddress;
  const tx=await p.getTransaction(recorded.txHash);assert.equal(tx.to.toLowerCase(),portal);
  const abi=new Interface([isBok?'function withdraw(address recipient,uint128 amount,bytes32 nonce,uint256 epoch,uint256 checkpoints,uint256 index,bytes32[] path)':'function withdraw(uint256 epoch,uint256 checkpoints,uint256 index,bytes32[] path)']);
  const args=abi.parseTransaction(tx).args,recipient=isBok?args.recipient.toLowerCase():tx.from.toLowerCase();assert.equal(recipient,tx.from.toLowerCase());assert.equal(tx.value,0n);
  const expected={kind:isBok?'bok-withdraw':'withdraw',amount:recorded.amount,...(isBok?{recipient,exitNonce:args.nonce}:{})};
  const intent={from:tx.from.toLowerCase(),to:portal,chainId:'31337',nonce:tx.nonce,data:tx.data.toLowerCase(),value:'0',expected};
  const checked=await verifyEthereumIntentReceipt(p,intent,recorded.txHash);assert.equal(checked.outcome,'success');const receipt=checked.receipt,block=await p.getBlock(receipt.blockNumber);assert.equal(block.transactions.length,1);
  const gas=receipt.gasUsed*receipt.gasPrice;assert.equal(String(gas),recorded.gasCostWei);
  const beforeEth=await p.getBalance(recipient,receipt.blockNumber-1),afterEth=await p.getBalance(recipient,receipt.blockNumber),deltaEth=afterEth-beforeEth;
  assert.equal(deltaEth,isBok?-gas:BigInt(recorded.amount)-gas);
  const row={kind,l1Hash:recorded.txHash,l1Block:receipt.blockNumber,l1BlockHash:receipt.blockHash,canonical:true,recipient,portal,amount:recorded.amount,gasCostWei:String(gas),recipientEthBeforeWei:String(beforeEth),recipientEthAfterWei:String(afterEth),recipientEthDeltaWei:String(deltaEth),gasAdjustedAmountMatches:true};
  if(isBok){const before=await token.balanceOf(recipient,{blockTag:receipt.blockNumber-1}),after=await token.balanceOf(recipient,{blockTag:receipt.blockNumber});assert.equal(after-before,BigInt(recorded.amount));Object.assign(row,{recipientMicroUsdcBefore:String(before),recipientMicroUsdcAfter:String(after),recipientMicroUsdcDelta:String(after-before)});}
  else{const collateral=new Contract(portal,['function getDeposit(address) view returns(uint128)'],p);assert.equal(await collateral.getDeposit(recipient,{blockTag:receipt.blockNumber-1}),BigInt(recorded.amount));assert.equal(await collateral.getDeposit(recipient,{blockTag:receipt.blockNumber}),0n);row.collateralRecordCleared=true;}
  const content=Fr.fromHexString(await sha256Field(isBok?getBytes(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address','bytes32','uint256','address','uint128','bytes32'],[encodeBytes32String('PLUGIN_EXIT_V1'),config.network.chainId,portal,sender,config.network.rollupVersion,recipient,recorded.amount,args.nonce])):encodeEscrowCommitment('exit',{l1ChainId:config.network.chainId,rollupAddress:config.network.rollupAddress,rollupVersion:config.network.rollupVersion,boardAddress:sender,portalAddress:portal},{depositor:recipient,amount:recorded.amount})));
  const leaf=computeL2ToL1MessageHash({l2Sender:new AztecAddress(new Fr(BigInt(sender))),l1Recipient:EthAddress.fromString(portal),content,rollupVersion:new Fr(BigInt(config.network.rollupVersion)),chainId:new Fr(BigInt(config.network.chainId))});
  const messages=receipt.logs.filter(l=>l.address.toLowerCase()===deployment.network.outbox).map(l=>{try{return outboxAbi.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='MessageConsumed');assert.equal(messages.length,1);const event=messages[0].args;
  assert.equal(event.messageHash,leaf.toString());assert.equal(event.epoch,args.epoch);assert.equal(event.numCheckpointsInEpoch,args.checkpoints);assert.equal(event.leafId,(1n<<BigInt(args.path.length))+args.index);
  assert.equal(await outbox.hasMessageBeenConsumedAtEpoch(args.epoch,event.leafId,{blockTag:receipt.blockNumber}),true);
  const original=l2[kind],hash=TxHash.fromString(original.hash),l2receipt=await node.getTxReceipt(hash);requireSuccessfulReceipt(l2receipt,hash);assert.equal(l2receipt.blockNumber,original.block);assert.equal(String(l2receipt.blockHash),original.blockHash);
  const effect=await node.getTxEffect(hash),l2block=await node.getBlockData(original.block);assert.equal(String(l2block.blockHash),original.blockHash);assert.equal(Number(effect.l2BlockNumber),original.block);assert.equal(String(effect.l2BlockHash),original.blockHash);assert.equal(effect.data.l2ToL1Msgs.filter(m=>String(m)===String(leaf)).length,1);
  assert.equal(String(l2receipt.transactionFee),browser[kind].privateFee);
  row.l2={hash:original.hash,block:original.block,blockHash:original.blockHash,status:l2receipt.status,executionResult:l2receipt.executionResult,privateFee:String(l2receipt.transactionFee),exactExitMessageInEffect:true};row.outbox={messageHash:String(leaf),epoch:String(event.epoch),checkpoints:String(event.numCheckpointsInEpoch),leafIndex:String(args.index),leafId:String(event.leafId),consumed:true};report.withdrawals.push(row);
 }
 report.passed=true;report.sourceHashes={};for(const f of ['shared/ethereum-journal.mjs','shared/protocol-commitments.mjs','shared/transaction-outcomes.mjs'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(f)).digest('hex');
 await fs.writeFile(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{p.destroy();}
