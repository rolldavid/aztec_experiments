// Real quote/ABI/signatures, AEAD slots and Ethereum journal; labelled finite RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {deriveBoardDepositSecret} from '../deposit-custody.mjs';
import {derivePrivateFeeBridgeSecret} from '../private-fee-client.mjs';
import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {createEthereumJournal} from '../ethereum-journal.mjs';
import {prepareAggregateFunding,aggregateFundingTransaction,aggregateFundingAbi} from './aggregate-funding.mjs';
import {validateAggregateFundingIntent} from './aggregate-recovery.mjs';
import {createAggregateWallet} from './aggregate-wallet.mjs';
const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const router=new ethers.Interface(aggregateFundingAbi),portal=new ethers.Interface(['function depositNonces(address) view returns(uint256)','function depositsEnabled() view returns(bool)','function getDeposit(address) view returns(uint128)','function MIN_DEPOSIT() view returns(uint256)','function MAX_DEPOSIT() view returns(uint256)','event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const bok=new ethers.Interface(['function active() view returns(bool)','event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const fee=new ethers.Interface(['event DepositToAztecPublic(bytes32 indexed to,uint256 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const quoter=new ethers.Interface(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);
function fixture(){
 const scope={chainId:'31337',router:a(1),routerCodeHash:ethers.keccak256('0x6000'),collateralPortal:a(2),feePortal:a(3),bokPortal:a(4),weth:a(5),swapRouter:a(6),feeToken:a(7),bokToken:a(8),privateFpc:h(9),quoter:a(10),quoterCodeHash:ethers.keccak256('0x6000')};
 const signer=new ethers.Wallet(h(99)),address=signer.address.toLowerCase(),records=new Map();
 const state={sends:0,signatures:0,nonce:7,clock:1000,connected:true,invalid:false,unknown:false,landed:false,reads:0};
 const allocation={asset:'ETH',collateralWei:'100',feeAmount:'200',bokAmount:'300',feePoolFee:3000,bokPoolFee:500,slippageBps:100,gasBudgetWei:'10000',privateFeeCap:'1000'};
 const storage={read:async key=>records.get(key)??null,compareAndSwap:async(key,old,value)=>{assert.equal(records.get(key)??null,old);records.set(key,value);}};
 let tx,receipt;
 const provider={getNetwork:async()=>({chainId:31337n}),getTransactionCount:async()=>state.nonce,getBlockNumber:async()=>state.landed?17:16,
  getBlock:async number=>({number:number==='latest'?16:number,hash:h(number==='latest'?16:number),parentHash:h(Number(number)-1||15),prefetchedTransactions:state.landed?[tx]:[]}),
  getFeeData:async()=>({maxFeePerGas:2n,maxPriorityFeePerGas:1n}),estimateGas:async()=>100n,getCode:async()=> '0x6000',getTransaction:async()=>tx,getTransactionReceipt:async()=>state.landed?receipt:null,
  async send(method,params){state.reads++;
   if(method==='eth_chainId')return '0x7a69';
   if(method==='eth_getBlockByNumber')return {number:'0x10',hash:h(16),timestamp:'0x3e8'};
   if(method==='eth_getCode')return '0x6000';if(method==='eth_getBalance')return '0xffffff';
   assert.equal(method,'eth_call');const {to,data}=params[0];
   if(to===scope.router){const call=router.parseTransaction({data});return router.encodeFunctionResult(call.name,[scope[call.name]]);}
   if(to===scope.collateralPortal){const call=portal.parseTransaction({data});return portal.encodeFunctionResult(call.name,[{depositNonces:2n,depositsEnabled:true,getDeposit:0n,MIN_DEPOSIT:1n,MAX_DEPOSIT:200n}[call.name]]);}
   if(to===scope.bokPortal)return bok.encodeFunctionResult('active',[true]);
   const call=quoter.parseTransaction({data});return quoter.encodeFunctionResult(call.name,[call.args[0].amount,1,0,1]);
  }};
 const wallet={address,name:'Test named wallet',guard:async()=>{if(!state.connected||state.invalid)throw Error('Context changed');},signer:{
  getAddress:async()=>address,signTypedData:async(...args)=>{state.signatures++;return signer.signTypedData(...args);},
  sendTransaction:async request=>{state.sends++;tx={...request,value:String(request.value),chainId:String(request.chainId),hash:h(20)};
   const p=router.parseTransaction({data:request.data}).args.p;const expectedHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([router.getFunction('fund').inputs[0]],[p]));
   const log=(address,iface,name,args)=>({address,...iface.encodeEventLog(iface.getEvent(name),args)});
   receipt={hash:h(20),from:address,to:scope.router,blockNumber:17,blockHash:h(17),status:1,logs:[
    log(scope.router,router,'Funded',[address,expectedHash,p.collateral,p.fee.amount,p.bok.amount,p.fee.maxEth,p.bok.maxEth,0]),
    log(scope.collateralPortal,portal,'Deposited',[address,p.collateral,p.collateralSecretHash,h(30),1]),
    log(scope.feePortal,fee,'DepositToAztecPublic',[scope.privateFpc,p.fee.amount,p.feeSecretHash,h(31),2]),
    log(scope.bokPortal,bok,'Deposited',[p.bokCommitment,p.bok.amount,h(32),3])
   ]};if(state.unknown)throw Error('Lost acknowledgement');state.landed=true;return {hash:h(20)};
  }}};
 // Until the exported original claimSecrets is composed, this labelled salt
 // derivation double exercises the real FPC bridge hash without a new key API.
 const claimSecrets=async({owner,record})=>{assert.equal(record.nonce,7);const salt=new Fr(18),secret=await derivePrivateFeeBridgeSecret({salt,owner});return {salt,secret,secretHash:await computeSecretHash(secret)};};
 const options={sdk:{Fr,computeSecretHash,poseidon2HashWithSeparator,deriveBoardDepositSecret,claimSecrets,createEncryptedJournalSlot,createEthereumJournal,prepareAggregateFunding,aggregateFundingTransaction,validateAggregateFundingIntent},ethers,scope,
  network:{chainId:'31337',version:'1',rollup:a(11)},board:h(12),bok:h(13),owner:h(14),walletSecret:h(15),walletSalt:'0',storage,provider,
  captureWallet:async()=>{if(!state.connected)throw Error('No wallet');return wallet;},contextGuard:async()=>{if(state.invalid)throw Error('Context changed');},verifyScope:async()=>{},nowSeconds:()=>state.clock};
 return {options,state,allocation,records,wallet,open:()=>createAggregateWallet(options)};
}
test('aggregate review never signs/sends; explicit confirm uses Ethereum nonce, distinct consent nonce, and authenticates three receipts',async()=>{
 const f=fixture(),app=await f.open(),review=await app.prepare(f.allocation);assert.equal(review.ethereumNonce,7);assert.equal(review.consentNonce,'2');assert.equal(f.state.sends,0);assert.equal(f.state.signatures,0);
 assert(!JSON.stringify(review).includes('recipientSalt'));assert(!JSON.stringify([...f.records.values()]).includes('recipientSalt'));
 const result=await app.confirm();assert.equal(f.state.sends,1);assert.equal(f.state.signatures,1);assert.equal(result.bokReceipt.nonce,'7');assert.equal(result.feeReceipt.amount,'200');
 f.state.connected=false;const reopened=await f.open(),context=await reopened.loadAggregate(result.receipt.txHash);assert.equal(context.intent.nonce,7);assert.equal(context.bokScope.portal,f.options.scope.bokPortal);
 assert.equal((await reopened.recover()).receipt.txHash,result.receipt.txHash);assert.equal(f.state.sends,1);await assert.rejects(reopened.confirm(),{code:'ROLLING_FUNDING_QUOTE_REQUIRED'});
 await assert.rejects(reopened.prepare(f.allocation),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
});
test('changed Ethereum nonce rejects inside original journal callback before encrypted intent and broadcast',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);f.state.nonce=8;
 await assert.rejects(app.confirm(),{code:'ROLLING_FUNDING_NONCE_CHANGED'});assert.equal(f.state.sends,0);
 f.state.nonce=7;assert.equal((await app.prepare(f.allocation)).ethereumNonce,7);
});
test('lost send reply retains original context; recovery never rebroadcasts',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);f.state.unknown=true;
 await assert.rejects(app.confirm(),{code:'BB_ETH_SUBMISSION_UNKNOWN'});f.state.connected=false;
 const reopened=await f.open();await assert.rejects(reopened.recover());assert.equal(f.state.sends,1);
 f.state.landed=true;f.state.nonce=8;assert.equal((await reopened.recover()).receipt.txHash,h(20));assert.equal(f.state.sends,1);
});
for(const mode of ['expired','account','signature'])test('aggregate confirmation fails closed for '+mode,async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);
 if(mode==='expired')f.state.clock=1121;if(mode==='account')f.state.invalid=true;if(mode==='signature')f.wallet.signer.signTypedData=(...args)=>new ethers.Wallet(h(98)).signTypedData(...args);
 await assert.rejects(app.confirm());assert.equal(f.state.sends,0);
});
test('unrelated tx hash cannot load retained secret context',async()=>{const f=fixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();await assert.rejects(app.loadAggregate(h(21)),{code:'ROLLING_FUNDING_MISMATCH'});});
