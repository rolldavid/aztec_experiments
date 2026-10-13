// Real quote/ABI/signatures, AEAD slots and Ethereum journal; labelled finite RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {deriveBoardDepositSecret} from '../deposit-custody.mjs';
import {claimSecrets} from '../private-fee-funding.mjs';
import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {createEthereumJournal,verifyEthereumIntentReceipt} from '../ethereum-journal.mjs';
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
 const options={sdk:{Fr,computeSecretHash,poseidon2HashWithSeparator,deriveBoardDepositSecret,claimSecrets,createEncryptedJournalSlot,createEthereumJournal,verifyEthereumIntentReceipt,prepareAggregateFunding,aggregateFundingTransaction,validateAggregateFundingIntent},ethers,scope,
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
test('unrelated tx hash cannot load retained secret context',async()=>{const f=fixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();assert.equal(await app.loadAggregate(h(21)),null);});
test('gas increase stops before the original payment intent is written',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);f.options.provider.getFeeData=async()=>({maxFeePerGas:10000n});
 await assert.rejects(app.confirm(),{code:'ROLLING_FUNDING_GAS_CHANGED'});assert.equal(f.state.sends,0);assert.equal((await app.inspect()).paymentSaved,false);
});
test('private claim attempt survives encrypted reopen and cannot change its identity or erase attempted state',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();
 await app.checkpointClaim({intentId:h(100),attempted:false});await app.checkpointClaim({intentId:h(100),attempted:true});
 const reopened=await f.open();assert.deepEqual((await reopened.inspect()).claim,{intentId:h(100),attempted:true});assert.equal((await reopened.inspect()).privateFeeCap,'1000');
 await assert.rejects(reopened.checkpointClaim({intentId:h(101),attempted:true}));await assert.rejects(reopened.checkpointClaim({intentId:h(100),attempted:false}));assert.equal(f.state.sends,1);
});
test('direct receipt lookup remains available with no aggregate record or unrelated retained aggregate',async()=>{
 const f=fixture(),app=await f.open();assert.equal(await app.loadAggregate(h(81)),null);
 await app.prepare(f.allocation);assert.equal(await app.loadAggregate(h(81)),null);await app.confirm();assert.equal(await app.loadAggregate(h(81)),null);
});
test('matching aggregate pending or corrupted context is never treated as an unrelated direct receipt',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);f.state.unknown=true;await assert.rejects(app.confirm());
 await assert.rejects(app.loadAggregate(h(20)));assert.equal(f.state.sends,1);
 const key=[...f.records.keys()][0];const envelope=JSON.parse(f.records.get(key));envelope.data='00'+envelope.data.slice(2);f.records.set(key,JSON.stringify(envelope));await assert.rejects(app.loadAggregate(h(81)));
});
test('archive is durable before a successor quote; active collateral prevents overwrite and original secrets survive later draft',async()=>{
 const f=fixture();f.options.reconcileClaim=async()=>({status:'confirmed'});const app=await f.open();await app.prepare(f.allocation);await app.confirm();
 await app.checkpointClaim({intentId:h(100),attempted:true});const original=await app.loadAggregate(h(20));
 const send=f.options.provider.send;f.options.provider.send=async(method,params)=>{
  if(method==='eth_call'&&params[0].to===f.options.scope.collateralPortal&&portal.parseTransaction({data:params[0].data}).name==='getDeposit')return portal.encodeFunctionResult('getDeposit',[100]);
  return send(method,params);
 };
 await assert.rejects(app.prepare(f.allocation),{code:'AGGREGATE_EXISTING_DEPOSIT'});
 assert.equal(f.records.size,3);assert.equal((await app.inspect()).paymentSaved,true);
 f.options.provider.send=send;const reopened=await f.open();await reopened.prepare(f.allocation);assert.equal((await reopened.inspect()).paymentSaved,false);
 assert.deepEqual(await reopened.loadAggregate(h(20)),original);assert.equal(f.state.sends,1);
 const foreign=await createAggregateWallet({...f.options,owner:h(77)});assert.equal(await foreign.loadAggregate(h(20)),null);
});

import fs from 'node:fs';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {encodeArguments,loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {createRollingApplication} from './application.mjs';
import {advanceAggregateClaim} from './aggregate-wallet.mjs';
const boardArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const bokArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../../experiments/private-bok/target/private_bok-PrivateBok.json',import.meta.url))));
function durableClaimApplication(f,funding){
 // Original application, ABIs and AES-GCM/CAS workflow; the canonical L2
 // outcome and bridge witness adapter are labelled finite SDK fixtures.
 const state={sends:0,prepares:0,outcome:null},owner=new AztecAddress(Fr.fromString(f.options.owner));
 const node={getBlockData:async()=>({header:{globalVariables:{blockNumber:3}},blockHash:h(60)}),getNodeInfo:async()=>({l1ContractAddresses:{feeJuicePortalAddress:f.options.scope.feePortal,feeJuiceAddress:f.options.scope.feeToken}})};
 const journal={assertCanStart:async()=>{},inspectOutcome:async()=>state.outcome,inspect:async()=>state.outcome,confirmed:()=>{}};
 const wallet={aztecNode:node,pxe:{getSyncedBlockHeader:async()=>({globalVariables:{blockNumber:3},hash:async()=>h(60),state:{l1ToL2MessageTree:{root:new Fr(61)}}})},getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),sendTx:async(_payload,options)=>{
  state.sends++;state.outcome={operation:options.journalOperation,outcome:'success',txHash:h(70),receipt:{txHash:h(70),status:'checkpointed',blockNumber:3,blockHash:h(60),transactionFee:1n}};return {receipt:{}};
 }};
 const sdk={Fr,AztecAddress,encodeArguments,isTrustedPrivateNode:n=>n===node,isPrivateWalletForNode:(w,n)=>w===wallet&&n===node,isPrivatePXEForNode:(p,n)=>p===wallet.pxe&&n===node,inspectTrustedNode:async()=>{},
  Contract:{at:()=>({methods:new Proxy({},{get:(_,name)=>(...args)=>({name,args,simulate:async()=>({result:[0n,...Array(9).fill(0n)]})})})})},
  BatchCall:class{constructor(_wallet,interactions){this.interactions=interactions;}},
  preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async({interaction})=>{state.prepares++;return {maximumFee:10n,payload:interaction,gasSettings:{}};},
  prepareFundingClaim:async input=>({status:'claim-ready',claim:input.kind==='collateral'?{contract:f.options.board,method:'claim_deposit',args:[input.receipt.sender,input.receipt.amount,h(80),input.receipt.leafIndex]}:input.kind==='private-fee'?{contract:f.options.scope.privateFpc,kind:'private-fee-bridge',bridgeClaim:{amount:input.receipt.amount,salt:h(81),leafIndex:input.receipt.leafIndex}}:{contract:f.options.bok,method:'claim',args:[input.receipt.amount,input.secrets.recipientSalt,input.secrets.bridgeSecret,input.receipt.leafIndex]}})};
 const options={sdk,deployment:{board:{address:f.options.board,artifact:boardArtifact},network:f.options.network,portal:f.options.scope.collateralPortal,
  privateFee:{address:f.options.scope.privateFpc,artifact:{},gasSettings:{}},bok:{address:f.options.bok,operator:h(16),pluginId:h(17),artifact:bokArtifact}},
  accountSession:{owner,wallet,node,journal,walletSecret:f.options.walletSecret,walletSalt:f.options.walletSalt},privateStore:f.options.storage,contextGuard:async()=>{},funding:{provider:f.options.provider,loadAggregate:hash=>funding.loadAggregate(hash)}};
 return {state,open:()=>createRollingApplication(options)};
}
test('original encrypted application workflow relinks after prepare-before-checkpoint interruption and sends once',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();
 const workflow=durableClaimApplication(f,funding),first=workflow.open(),prepared=await first.prepare({type:'claim-deposit',...receipts});assert.equal((await funding.inspect()).claim,null);
 const next=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(next.state,'complete');assert.equal(next.intent.intentId,prepared.intentId);assert.equal(workflow.state.sends,1);assert.equal(f.state.sends,1);
 assert.equal((await advanceAggregateClaim({application:workflow.open(),funding:await f.open()})).state,'complete');assert.equal(workflow.state.sends,1);
});
test('original encrypted application exposes prepared recovery after attempted checkpoint before submission',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();const workflow=durableClaimApplication(f,funding);
 const prepared=await workflow.open().prepare({type:'claim-deposit',...receipts});await funding.checkpointClaim({intentId:prepared.intentId,attempted:true});
 const next=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(next.state,'review-saved');assert.equal(next.intent.intentId,prepared.intentId);assert.equal(workflow.state.sends,0);assert.equal(f.state.sends,1);
});

for(const code of ['ACTION_REJECTED','INSUFFICIENT_FUNDS'])test('original journal '+code+' rollback permits a fresh quote without erasing unknown outcomes',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);const send=f.wallet.signer.sendTransaction;
 f.wallet.signer.sendTransaction=async()=>{throw Object.assign(Error('labelled wallet refusal'),{code});};
 await assert.rejects(app.confirm(),{code:code==='ACTION_REJECTED'?'BB_ETH_REQUEST_CANCELLED':'BB_ETH_INSUFFICIENT_FUNDS'});
 assert.equal((await app.inspect()).paymentSaved,false);assert.equal(f.state.sends,0);
 f.wallet.signer.sendTransaction=send;await app.prepare(f.allocation);await app.confirm();assert.equal(f.state.sends,1);
});
