// Real quote/ABI/signatures, AEAD slots and Ethereum journal; labelled finite RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {deriveBoardDepositSecret} from '../deposit-custody.mjs';
import {claimSecrets} from '../private-fee-funding.mjs';
import {derivePrivateFeeBridgeSecret} from '../private-fee-client.mjs';
import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {createEthereumJournal,verifyEthereumIntentReceipt} from '../ethereum-journal.mjs';
import {prepareAggregateFunding,validateAggregateFundingQuote,encodeAggregateFundingTransaction,aggregateFundingTransaction,prepareAggregateUsdcFunding,aggregateUsdcFundingTransaction,aggregateFundingAbi} from './aggregate-funding.mjs';
import {validateAggregateFundingIntent} from './aggregate-recovery.mjs';
import {createAggregateWallet} from './aggregate-wallet.mjs';
import {verifyRollingTopupClaim} from '../../apps/rolling/wallet-session.mjs';
import {requireSuccessfulReceipt} from '../transaction-outcomes.mjs';
const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const router=new ethers.Interface(aggregateFundingAbi),portal=new ethers.Interface(['function depositNonces(address) view returns(uint256)','function depositsEnabled() view returns(bool)','function getDeposit(address) view returns(uint128)','function MIN_DEPOSIT() view returns(uint256)','function MAX_DEPOSIT() view returns(uint256)','event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const bok=new ethers.Interface(['function active() view returns(bool)','event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const fee=new ethers.Interface(['event DepositToAztecPublic(bytes32 indexed to,uint256 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const quoter=new ethers.Interface(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);
function fixture({chainId='31337'}={}){
 const scope={chainId,router:a(1),routerCodeHash:ethers.keccak256('0x6000'),collateralPortal:a(2),feePortal:a(3),bokPortal:a(4),weth:a(5),swapRouter:a(6),feeToken:a(7),bokToken:a(8),privateFpc:h(9),quoter:a(10),quoterCodeHash:ethers.keccak256('0x6000')};
 const signer=new ethers.Wallet(h(99)),address=signer.address.toLowerCase(),records=new Map();
 const state={sends:0,signatures:0,nonce:7,pendingTime:1000,connected:true,invalid:false,unknown:false,landed:false,reads:0};
 const allocation={asset:'ETH',collateralWei:'100',feeAmount:'200',bokAmount:'300',feePoolFee:3000,bokPoolFee:500,slippageBps:100,gasBudgetWei:'10000',privateFeeCap:'1000'};
 const storage={read:async key=>records.get(key)??null,compareAndSwap:async(key,old,value)=>{assert.equal(records.get(key)??null,old);records.set(key,value);}};
 let tx,receipt;
 const provider={getNetwork:async()=>({chainId:BigInt(chainId)}),getTransactionCount:async()=>state.nonce,getBlockNumber:async()=>state.landed?17:16,
  getBlock:async number=>({number:number==='latest'?16:number,hash:h(number==='latest'?16:number),parentHash:h(Number(number)-1||15),prefetchedTransactions:state.landed?[tx]:[]}),
  getFeeData:async()=>({maxFeePerGas:2n,maxPriorityFeePerGas:1n}),estimateGas:async()=>100n,getCode:async()=> '0x6000',getTransaction:async()=>tx,getTransactionReceipt:async()=>state.landed?receipt:null,
  async send(method,params){state.reads++;
   if(method==='eth_chainId')return '0x'+BigInt(chainId).toString(16);
   if(method==='eth_getBlockByNumber'&&params[0]==='pending')return {number:null,hash:null,timestamp:'0x'+state.pendingTime.toString(16)};
   if(method==='eth_getBlockByNumber')return {number:'0x10',hash:h(16),timestamp:'0x3e8'};
   if(method==='eth_getCode')return '0x6000';if(method==='eth_getBalance')return '0xffffff';
   assert.equal(method,'eth_call');if(params[1]==='pending'){assert(['fund','fundUsdc'].includes(router.parseTransaction(params[0]).name));if(state.simulationFails)throw Error('PRIVATE_SENTINEL');return '0x';}const {to,data}=params[0];
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
    ...(p.bok.amount>0n?[log(scope.bokPortal,bok,'Deposited',[p.bokCommitment,p.bok.amount,h(32),3])]:[])
   ]};if(state.unknown)throw Error('Lost acknowledgement');state.landed=true;return {hash:h(20)};
  }}};
 const options={sdk:{Fr,prepareBokCreditPurchase,computeSecretHash,poseidon2HashWithSeparator,deriveBoardDepositSecret,claimSecrets,createEncryptedJournalSlot,createEthereumJournal,verifyEthereumIntentReceipt,prepareAggregateFunding,validateAggregateFundingQuote,encodeAggregateFundingTransaction,aggregateFundingTransaction,validateAggregateFundingIntent},ethers,scope,
  network:{chainId,version:'1',rollup:a(11)},board:h(12),bok:h(13),owner:h(14),walletSecret:h(15),walletSalt:'0',storage,provider,
  reconcileClaim:id=>state.workflow.open().reconcile(id),verifyClaim:async hash=>assert.equal(hash,h(70)),
  verifyFeeCredit:async amount=>{assert.equal(typeof amount,'string');state.creditChecks=(state.creditChecks??0)+1;if(state.creditRejected)throw Object.assign(Error('Insufficient credit'),{code:'ROLLING_FUNDING_FEE_CREDIT_INSUFFICIENT',minimumFeeCredit:'1000'});},
  captureWallet:async()=>{if(!state.connected)throw Error('No wallet');return wallet;},contextGuard:async()=>{if(state.invalid)throw Error('Context changed');},verifyScope:async()=>async()=>{}};
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
for(const mode of ['expired','account','signature','pending-state'])test('aggregate confirmation fails closed for '+mode,async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);
 if(mode==='expired')f.state.pendingTime=1901;if(mode==='pending-state')f.state.simulationFails=true;if(mode==='account')f.state.invalid=true;if(mode==='signature')f.wallet.signer.signTypedData=(...args)=>new ethers.Wallet(h(98)).signTypedData(...args);
 await assert.rejects(app.confirm());assert.equal(f.state.sends,0);if(mode==='expired')assert.equal(f.state.signatures,0);
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
test('an earlier deposit does not block a successor quote and original payment records remain intact',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();
 const workflow=durableClaimApplication(f,app);await advanceAggregateClaim({application:workflow.open(),funding:app});const original=await app.loadAggregate(h(20));
 const send=f.options.provider.send;f.options.provider.send=async(method,params)=>{
  if(method==='eth_call'&&params[0].to===f.options.scope.collateralPortal&&portal.parseTransaction({data:params[0].data}).name==='getDeposit')return portal.encodeFunctionResult('getDeposit',[100]);
  return send(method,params);
 };
 assert.equal((await app.inspect()).paymentSaved,true);
 const reopened=await f.open();await reopened.prepare(f.allocation);assert.equal((await reopened.inspect()).paymentSaved,false);
 assert.deepEqual(await reopened.loadAggregate(h(20)),original);assert.equal(f.state.sends,1);
 const foreign=await createAggregateWallet({...f.options,owner:h(77)});assert.equal(await foreign.loadAggregate(h(20)),null);
});

import fs from 'node:fs';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {encodeArguments,loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {createRollingApplication} from './application.mjs';
import {normalizePrivateFeeGasSettings} from '../private-fee-client.mjs';
import {advanceAggregateClaim} from './aggregate-wallet.mjs';
const boardArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const bokArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../../experiments/private-bok/target/private_bok-PrivateBok.json',import.meta.url))));
function durableClaimApplication(f,funding,{proposed=false}={}){
 // Original application, ABIs and AES-GCM/CAS workflow; the canonical L2
 // outcome and bridge witness adapter are labelled finite SDK fixtures.
 const state={sends:0,prepares:0,outcome:null},owner=new AztecAddress(Fr.fromString(f.options.owner));
 const node={getBlockData:async()=>({header:{globalVariables:{blockNumber:3}},blockHash:h(60)}),getNodeInfo:async()=>({l1ContractAddresses:{feeJuicePortalAddress:f.options.scope.feePortal,feeJuiceAddress:f.options.scope.feeToken}})};
 const journal={assertCanStart:async()=>{},inspectOutcome:async()=>state.outcome,inspect:async()=>state.outcome,confirmed:()=>{},included:async receipt=>assert.equal(receipt.status,'proposed')};
 const wallet={aztecNode:node,pxe:{getSyncedBlockHeader:async()=>({globalVariables:{blockNumber:3},hash:async()=>h(60),state:{l1ToL2MessageTree:{root:new Fr(61)}}})},getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),sendTx:async(_payload,options)=>{
  state.sends++;state.outcome={operation:options.journalOperation,outcome:'success',txHash:h(70),receipt:{txHash:h(70),status:options.confirmationTier==='proposed'?'proposed':'checkpointed',executionResult:'success',blockNumber:3,blockHash:h(60),transactionFee:1n}};return {receipt:{}};
 }};
 const sdk={Fr,AztecAddress,encodeArguments,normalizePrivateFeeGasSettings,isTrustedPrivateNode:n=>n===node,isPrivateWalletForNode:(w,n)=>w===wallet&&n===node,isPrivatePXEForNode:(p,n)=>p===wallet.pxe&&n===node,inspectTrustedNode:async()=>{},
  Contract:{at:()=>({methods:new Proxy({},{get:(_,name)=>(...args)=>({name,args,simulate:async()=>({result:[0n,...Array(9).fill(0n)]})})})})},
  BatchCall:class{constructor(_wallet,interactions){this.interactions=interactions;}},
  preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async({interaction})=>{state.prepares++;return {maximumFee:10n,payload:interaction,gasSettings:{}};},
  prepareFundingClaim:async input=>({status:'claim-ready',claim:input.kind==='collateral'?{contract:f.options.board,method:'claim_deposit',args:[input.receipt.sender,input.receipt.amount,h(80),input.receipt.leafIndex]}:input.kind==='private-fee'?{contract:f.options.scope.privateFpc,kind:'private-fee-bridge',bridgeClaim:{amount:input.receipt.amount,salt:h(81),leafIndex:input.receipt.leafIndex}}:{contract:f.options.bok,method:'claim',args:[input.receipt.amount,input.secrets.recipientSalt,input.secrets.bridgeSecret,input.receipt.leafIndex]}})};
 const options={sdk,deployment:{board:{address:f.options.board,artifact:boardArtifact},network:f.options.network,portal:f.options.scope.collateralPortal,
  privateFee:{address:f.options.scope.privateFpc,artifact:{},gasSettings:{gasLimits:{daGas:5,l2Gas:5},teardownGasLimits:{daGas:0,l2Gas:1},maxFeesPerGas:{feePerDaGas:1,feePerL2Gas:1},maxPriorityFeesPerGas:{feePerDaGas:0,feePerL2Gas:0}}},bok:{address:f.options.bok,operator:h(16),pluginId:h(17),artifact:bokArtifact}},
  accountSession:{proposedTransactions:proposed,owner,wallet,node,journal,walletSecret:f.options.walletSecret,walletSalt:f.options.walletSalt},privateStore:f.options.storage,contextGuard:async()=>{},funding:{provider:f.options.provider,loadAggregate:hash=>funding.loadAggregate(hash)}};
 const workflow={state,open:()=>createRollingApplication(options)};f.state.workflow=workflow;return workflow;
}
test('original encrypted application workflow relinks after prepare-before-checkpoint interruption and sends once',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();
 const workflow=durableClaimApplication(f,funding),first=workflow.open(),prepared=await first.prepare({type:'claim-deposit',...receipts});assert.equal((await funding.inspect()).claim,null);
 const next=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(next.state,'complete');assert.equal(next.intent.intentId,prepared.intentId);assert.equal(workflow.state.sends,1);assert.equal(f.state.sends,1);
 assert.equal((await advanceAggregateClaim({application:workflow.open(),funding:await f.open()})).state,'complete');assert.equal(workflow.state.sends,1);
});
test('aggregate confirmed claim permits a fresh quote after the current application intent is replaced',async()=>{
 const f=fixture();let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);f.options.verifyClaim=async hash=>assert.equal(hash,h(70));
 const funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();workflow=durableClaimApplication(f,funding);
 const complete=await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(complete.state,'complete');
 const original=await funding.loadAggregate(h(20));
 f.options.reconcileClaim=async()=>{throw Object.assign(Error('The later post/preferences intent replaced the funding intent'),{code:'ROLLING_INTENT_NOT_FOUND'});};
 const reopened=await f.open();await reopened.prepare(f.allocation);
 assert.deepEqual(await reopened.loadAggregate(h(20)),original);assert.equal(f.state.sends,1);assert.equal(workflow.state.sends,1);
});
test('aggregate retained completion rechecks canonical L2 receipt before preparation and again before payment',async()=>{
 const f=fixture();let canonical=true;
 f.options.verifyClaim=async txHash=>verifyRollingTopupClaim({sdk:{TxHash:{fromString:value=>value},boundedTransactionRead:fn=>fn(),requireSuccessfulReceipt},
  node:{getTxReceipt:async()=>({txHash:h(70),status:'checkpointed',executionResult:'success',blockNumber:3,blockHash:h(60)}),getBlock:async()=>({hash:canonical?h(60):h(61)})},txHash,contextGuard:f.options.contextGuard});
 const funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();const workflow=durableClaimApplication(f,funding);
 await advanceAggregateClaim({application:workflow.open(),funding});f.options.reconcileClaim=async()=>{throw Error('later unrelated workflow');};
 canonical=false;await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_SESSION_CONFIG'});
 canonical=true;const next=await f.open();await next.prepare(f.allocation);canonical=false;
 await assert.rejects(next.confirm(),{code:'ROLLING_SESSION_CONFIG'});await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_SESSION_CONFIG'});
 assert.equal(f.state.sends,1);assert.equal(workflow.state.sends,1);
});

test('aggregate completion rejects substituted intent hash and receipts, unknown or reverted outcomes, and incomplete old records',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();const workflow=durableClaimApplication(f,funding);
 const app=workflow.open(),prepared=await app.prepare({type:'claim-deposit',...receipts});await funding.checkpointClaim({intentId:prepared.intentId,attempted:true});
 const done=await app.submitPrepared(prepared.intentId);
 await assert.rejects(funding.prepare(f.allocation),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
 await assert.rejects(funding.recordClaimCompletion({...done,txHash:h(71)}),{code:'ROLLING_FUNDING_MISMATCH'});
 for(const key of ['receipt','feeReceipt','bokReceipt'])await assert.rejects(funding.recordClaimCompletion({...done,action:{...done.action,[key]:{...done.action[key],amount:'999'}}}),{code:'ROLLING_FUNDING_MISMATCH'});
 for(const status of ['unknown','reverted']){
  await funding.recordClaimCompletion({...done,status});await assert.rejects(funding.prepare(f.allocation),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
 }
 const outcome=workflow.state.outcome;workflow.state.outcome={...outcome,outcome:'reverted'};
 await assert.rejects(funding.recordClaimCompletion(done),{code:'ROLLING_FUNDING_MISMATCH'});workflow.state.outcome=outcome;
 await funding.recordClaimCompletion(done);await (await f.open()).prepare(f.allocation);assert.equal(f.state.sends,1);assert.equal(workflow.state.sends,1);
});

test('aggregate manual over-cap confirmation checkpoints before send and retains completion for the next quote',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare({...f.allocation,privateFeeCap:'1'});await funding.confirm();const workflow=durableClaimApplication(f,funding);
 const review=await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(review.state,'review');assert.equal((await funding.inspect()).claim.attempted,false);
 const app=workflow.open(),application={...app,submitPrepared:async id=>{assert.equal((await funding.inspect()).claim.attempted,true);return app.submitPrepared(id);}};
 const tampered={...application,reconcile:async id=>{const current=await app.reconcile(id);return {...current,action:{...current.action,bokReceipt:{...current.action.bokReceipt,amount:'999'}}};}};
 await assert.rejects(submitWithFundingCheckpoint({application:tampered,aggregate:funding,intentId:review.intent.intentId}),{code:'ROLLING_FUNDING_MISMATCH'});assert.equal(workflow.state.sends,0);
 const done=await submitWithFundingCheckpoint({application,aggregate:funding,intentId:review.intent.intentId});assert.equal(done.status,'confirmed');
 f.options.reconcileClaim=async()=>{throw Error('later post/preferences workflow');};await (await f.open()).prepare(f.allocation);assert.equal(f.state.sends,1);assert.equal(workflow.state.sends,1);
});

test('USDC aggregate confirmed completion survives later workflow without another relay POST',async()=>{
 const f=usdcWalletFixture(),funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();const workflow=durableClaimApplication(f,funding);
 const done=await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(done.state,'complete');const original=await funding.loadAggregate(h(200));
 f.options.reconcileClaim=async()=>{throw Error('later post/preferences workflow');};const next=await f.open();await next.prepare(f.allocation);
 assert.deepEqual(await next.loadAggregate(h(200)),original);assert.equal(f.state.posts,1);assert.equal(workflow.state.sends,1);
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

function usdcWalletFixture(){
 const f=fixture(),s=f.options.scope,relayer=a(71),claims=new Map();
 Object.assign(s,{usdcCodeHash:ethers.keccak256('0x6000'),usdcImplementation:a(70),usdcImplementationCodeHash:ethers.keccak256('0x6000'),usdcDomain:{name:'USDC',version:'2'},usdcRelayAddress:relayer});
 Object.assign(f.options.sdk,{prepareAggregateUsdcFunding,aggregateUsdcFundingTransaction,derivePrivateFeeBridgeSecret});
 const usdc=new ethers.Interface(['function implementation() view returns(address)','function DOMAIN_SEPARATOR() view returns(bytes32)','function balanceOf(address) view returns(uint256)','function authorizationState(address,bytes32) view returns(bool)']);
 const original=f.options.provider.send;f.state.posts=0;f.state.statusReads=0;f.state.withhold=false;f.state.lost=false;f.state.usdcTx=null;f.state.usdcReceipt=null;
 f.options.provider.send=async(method,params)=>{
  if(method==='eth_getBalance'){assert.equal(params[0],relayer);return '0xffffff';}
  if(method==='eth_call'){
   const {to,data}=params[0];
   if(to===s.bokToken){const c=usdc.parseTransaction({data});return usdc.encodeFunctionResult(c.name,[{implementation:s.usdcImplementation,DOMAIN_SEPARATOR:ethers.TypedDataEncoder.hashDomain({...s.usdcDomain,chainId:s.chainId,verifyingContract:s.bokToken}),balanceOf:999999999n,authorizationState:false}[c.name]]);}
   if(to===s.router&&router.parseTransaction({data}).name==='usdcAuthorizationNonce'){
    const plan=router.parseTransaction({data}).args[0],hash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([router.getFunction('fundUsdc').inputs[0]],[plan]));
    return router.encodeFunctionResult('usdcAuthorizationNonce',[ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address','bytes32'],[ethers.encodeBytes32String('ROLLING_USDC_FUNDING_V1'),s.chainId,s.router,hash]))]);
   }
  }
  return original(method,params);
 };
 f.options.claimStore={save:async(scope,record)=>{assert.equal(f.state.signatures%2,0);assert.equal(scope.depositor,f.wallet.address);claims.set(record.secretHash,{scope,record});}};
 f.options.provider.getTransactionCount=async()=>{throw Error('USDC custody must not derive an Ethereum nonce');};
 f.options.provider.getTransaction=async()=>f.state.usdcTx;f.options.provider.getTransactionReceipt=async()=>f.state.usdcReceipt;
 f.options.relay={terms:async()=>({relayer,feeUsdc:'50',gasBudgetWei:'10000'}),submit:async data=>{
  f.state.posts++;assert.equal(f.state.signatures,2);assert.equal(claims.size,1);assert(f.records.size>0);
  if(f.state.lost)throw Error('labelled lost relay reply');
  const p=router.parseTransaction({data}).args.p,hash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([router.getFunction('fundUsdc').inputs[0]],[p]));
  f.state.usdcTx={hash:h(200),from:relayer,to:s.router,nonce:42,chainId:31337n,value:0n,data};
  const log=(address,iface,name,args)=>({address,...iface.encodeEventLog(iface.getEvent(name),args)});
  f.state.usdcReceipt={hash:h(200),from:relayer,to:s.router,blockNumber:17,blockHash:h(17),status:1,logs:[
   log(s.router,router,'UsdcFunded',[p.beneficiary,hash,p.relayer,p.collateral.amount,p.fee.amount,p.bokAmount,p.collateral.maxUsdc,p.fee.maxUsdc,p.relayFeeUsdc,0]),
   log(s.collateralPortal,portal,'Deposited',[p.beneficiary,p.collateral.amount,p.collateralSecretHash,h(30),1]),
   log(s.feePortal,fee,'DepositToAztecPublic',[s.privateFpc,p.fee.amount,p.feeSecretHash,h(31),2]),
   log(s.bokPortal,bok,'Deposited',[p.bokCommitment,p.bokAmount,h(32),3])
  ]};return {status:'unresolved',scope:'aggregate-funding',canonical:false,planHash:hash,transactionHash:h(200)};
 },status:async planHash=>{f.state.statusReads++;return {status:f.state.usdcTx&&!f.state.withhold?'succeeded':'absent',scope:'aggregate-funding',canonical:!!f.state.usdcTx,planHash,...(f.state.usdcTx&&!f.state.withhold?{transactionHash:h(200)}:{})};}};
 f.wallet.signer.sendTransaction=async()=>{throw Error('USDC user must never send an Ethereum transaction');};
 f.allocation={asset:'USDC',collateralWei:'100',feeAmount:'200',bokAmount:'300',collateralPoolFee:500,feePoolFee:3000,slippageBps:100,privateFeeCap:'1000'};
 return {...f,claims};
}
test('USDC uses two real signatures, retained random custody and one relay post without user Ethereum send',async()=>{
 const f=usdcWalletFixture(),app=await f.open(),q=await app.prepare(f.allocation);assert.equal(q.kind,'rolling-aggregate-usdc-v1');assert.equal(f.state.signatures,0);assert.equal(f.claims.size,1);
 assert.deepEqual(await app.confirm(),{pending:true});assert.equal(f.state.posts,1);assert.equal(f.state.sends,0);
 f.state.connected=false;const reopened=await f.open(),r=await reopened.recover();assert.equal(r.receipt.sender,a(71));assert.equal(r.receipt.nonce,'42');
 const context=await reopened.loadAggregate(h(200));assert.equal(context.aggregateCustody.beneficiary,f.wallet.address);assert.equal(context.intent.from,a(71));assert.equal(context.intent.nonce,42);assert.equal(f.state.posts,1);
 const original=await f.options.sdk.computeSecretHash(Fr.fromString([...f.claims.values()][0].record.secret));assert.equal(original.toString(),r.receipt.secretHash);
});
test('USDC lost relay acknowledgement and absent status never authorize a second POST after reopen',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);f.state.lost=true;assert.deepEqual(await app.confirm(),{pending:true});
 const reopened=await f.open();await assert.rejects(reopened.recover(),{code:'ROLLING_FUNDING_PENDING'});await assert.rejects(reopened.prepare(f.allocation),{code:'ROLLING_FUNDING_PENDING'});await assert.rejects(reopened.confirm(),{code:'ROLLING_FUNDING_QUOTE_REQUIRED'});assert.equal(f.state.posts,1);assert.equal(f.state.sends,0);
 assert.equal((await advanceAggregateClaim({application:{},funding:reopened})).state,'waiting');assert.equal(f.state.posts,1);
});
test('USDC terms cannot change the pinned relayer and failed custody stops before either signature',async()=>{
 const f=usdcWalletFixture();f.options.relay.terms=async()=>({relayer:a(72),feeUsdc:'50',gasBudgetWei:'10000'});await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_FUNDING_RELAY_SCOPE'});assert.equal(f.state.signatures,0);
 const g=usdcWalletFixture();g.options.claimStore.save=async()=>{throw Error('durable storage failed');};await assert.rejects((await g.open()).prepare(g.allocation));assert.equal(g.state.signatures,0);assert.equal(g.state.posts,0);
});
test('USDC service success cannot replace exact canonical transaction and all three effect checks',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();f.state.usdcTx.data='0x1234';await assert.rejects(app.recover(),{code:'ROLLING_FUNDING_MISMATCH'});assert.equal(f.state.posts,1);
});

test('USDC exact canonical saved calldata can recover after relay status is lost, while wrong chain and incomplete effects fail',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();f.state.withhold=true;
 const found=await app.loadAggregate(h(200));assert.equal(found.intent.nonce,42);assert.equal(found.aggregateCustody.beneficiary,f.wallet.address);assert.equal(f.state.posts,1);
 f.options.provider.getNetwork=async()=>({chainId:1n});await assert.rejects(app.loadAggregate(h(200)),{code:'ROLLING_FUNDING_MISMATCH'});
 f.options.provider.getNetwork=async()=>({chainId:31337n});f.state.usdcReceipt.logs.pop();await assert.rejects(app.loadAggregate(h(200)));assert.equal(f.state.posts,1);
});

test('unrelated direct receipts do not depend on a pending USDC relay and verified transaction hashes survive lost status',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();await app.recover();
 f.state.withhold=true;assert.equal((await(await f.open()).recover()).receipt.txHash,h(200));
 f.options.relay.status=async()=>{throw Error('relay unavailable');};assert.equal(await app.loadAggregate(h(999)),null);assert.equal(f.state.posts,1);
});

test('canonical reverted private claim is explicitly re-reviewed without repeat payment or automatic send, and manual confirmation relinks',async()=>{
 const f=fixture();let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);const funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();workflow=durableClaimApplication(f,funding);
 await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(workflow.state.sends,1);workflow.state.outcome={...workflow.state.outcome,outcome:'reverted'};
 assert.equal((await advanceAggregateClaim({application:workflow.open(),funding})).state,'reverted');
 await funding.reviewRevertedClaim();const reviewed=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(reviewed.state,'review');assert.equal(workflow.state.sends,1);assert.equal(f.state.sends,1);
 await workflow.open().submitPrepared(reviewed.intent.intentId);const final=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(final.state,'complete');assert.equal((await funding.inspect()).claim.attempted,true);assert.equal(workflow.state.sends,2);assert.equal(f.state.sends,1);
 await assert.rejects(funding.reviewRevertedClaim(),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
});
test('USDC crash after durable one-shot checkpoint but before POST remains status-only even when relay says absent',async()=>{
 const f=usdcWalletFixture(),cas=f.options.storage.compareAndSwap;let writes=0;
 f.options.storage.compareAndSwap=async(...args)=>{await cas(...args);if(++writes===2)throw Error('labelled lost local checkpoint reply');};
 const app=await f.open();await app.prepare(f.allocation);await assert.rejects(app.confirm());assert.equal(f.state.signatures,2);assert.equal(f.state.posts,0);
 const recovered=await f.open();assert.equal((await recovered.inspect()).paymentSaved,true);await assert.rejects(recovered.recover(),{code:'ROLLING_FUNDING_PENDING'});await assert.rejects(recovered.prepare(f.allocation),{code:'ROLLING_FUNDING_PENDING'});assert.equal(f.state.posts,0);
});

test('canonical reverted ETH payment archives the original before explicit fresh quote and original journal acknowledgement',async()=>{
 const f=fixture(),get=f.options.provider.getTransactionReceipt;let reverted=true;
 f.options.provider.getTransactionReceipt=async(...args)=>{const r=await get(...args);return r?{...r,status:reverted?0:1,logs:reverted?[]:r.logs}:r;};
 const funding=await f.open();await funding.prepare(f.allocation);await assert.rejects(funding.confirm(),{code:'BB_ETH_TRANSACTION_FAILED'});
 const before=f.records.size;const q=await(await f.open()).prepare(f.allocation);assert.equal(q.ethereumNonce,8);assert.equal(f.state.sends,1);assert.equal(f.records.size,before+1);
 // A new explicit confirmation uses the original Ethereum journal, which
 // rechecks the acknowledged reverted request before its nonce successor.
 const next=await f.open();await next.prepare(f.allocation);const send=f.wallet.signer.sendTransaction;f.wallet.signer.sendTransaction=async request=>{const sent=await send(request);reverted=false;return sent;};await next.confirm();assert.equal(f.state.sends,2);
});
test('reverted payment successor rejects reorg, replacement, missing finality and archive persistence failure',async()=>{
 for(const mode of ['reorg','replacement','archive']){
  const f=fixture(),get=f.options.provider.getTransactionReceipt;
  f.options.provider.getTransactionReceipt=async(...args)=>{const r=await get(...args);return r?{...r,status:0,logs:[]}:r;};
  const funding=await f.open();await funding.prepare(f.allocation);await assert.rejects(funding.confirm());
  if(mode==='reorg'){const getBlock=f.options.provider.getBlock;let calls=0;f.options.provider.getBlock=async n=>({...await getBlock(n),...(n===17&&++calls>1?{hash:h(999)}:{})});}
  if(mode==='replacement'){const getTx=f.options.provider.getTransaction;f.options.provider.getTransaction=async(...a)=>({...await getTx(...a),data:'0x1234'});}
  if(mode==='archive'){const cas=f.options.storage.compareAndSwap;f.options.storage.compareAndSwap=async(key,...args)=>{if(!f.records.has(key))throw Error('archive unavailable');return cas(key,...args);};}
  await assert.rejects((await f.open()).prepare(f.allocation));assert.equal(f.state.sends,1);assert.equal((await funding.inspect()).paymentSaved,true);
 }
});
test('canonical mined reverted payment permits fresh review without finalized head',async()=>{
 const f=fixture({chainId:'1'}),get=f.options.provider.getTransactionReceipt,block=f.options.provider.getBlock;
 f.options.provider.getTransactionReceipt=async(...args)=>{const r=await get(...args);return r?{...r,status:0,logs:[]}:r;};
 f.options.provider.getBlock=async n=>{assert.notEqual(n,'finalized');return block(n);};
 const funding=await f.open();await funding.prepare(f.allocation);await assert.rejects(funding.confirm());
 assert(await (await f.open()).prepare(f.allocation));assert.equal(f.state.sends,1);
});
test('USDC canonical revert permits only a fresh reviewed plan and keeps the failed original encrypted',async()=>{
 const f=usdcWalletFixture(),funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();f.state.usdcReceipt.status=0;f.state.usdcReceipt.logs=[];
 await assert.rejects(funding.recover(),{code:'ROLLING_FUNDING_REVERTED'});
 const original=[...f.records.values()],q=await(await f.open()).prepare(f.allocation);assert.equal(q.kind,'rolling-aggregate-usdc-v1');assert.equal(f.state.posts,1);assert.equal(f.state.signatures,2);assert.equal(f.records.size,original.length+1);assert.equal(f.state.sends,0);
});
test('cancelled saved private claim pauses and requires explicit re-review without repeated payment',async()=>{
 const f=fixture();let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);const funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();workflow=durableClaimApplication(f,funding);
 const prepared=await workflow.open().prepare({type:'claim-deposit',...receipts});await funding.checkpointClaim({intentId:prepared.intentId,attempted:false});await workflow.open().cancelPrepared(prepared.intentId);
 assert.equal((await advanceAggregateClaim({application:workflow.open(),funding})).state,'cancelled');assert.equal(workflow.state.sends,0);
 await funding.reviewRevertedClaim();assert.equal((await advanceAggregateClaim({application:workflow.open(),funding})).state,'review');assert.equal(workflow.state.sends,0);assert.equal(f.state.sends,1);
});

test('USDC matching imported and retained canonical transaction hashes recover while relay status throws',async()=>{
 const f=usdcWalletFixture(),funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();
 f.options.relay.status=async()=>{throw Error('labelled HTTP503');};
 const reopened=await f.open(),context=await reopened.loadAggregate(h(200));assert.equal(context.intent.nonce,42);assert.equal(context.aggregateCustody.beneficiary,f.wallet.address);
 assert.equal((await(await f.open()).recover()).receipt.txHash,h(200));assert.equal(f.state.posts,1);assert.equal(f.state.statusReads,0);
 f.state.usdcReceipt.logs.pop();await assert.rejects(reopened.loadAggregate(h(200)));assert.equal(f.state.posts,1);
});

import {createStandaloneTopupWallet} from './aggregate-wallet.mjs';
function topupFixture(kind='bok'){
 const f=fixture(),s=f.options.scope,scope={portal:kind==='bok'?s.bokPortal:s.feePortal,token:kind==='bok'?s.bokToken:s.feeToken,recipient:kind==='bok'?f.options.bok:s.privateFpc};
 const token=new ethers.Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','event Approval(address indexed owner,address indexed spender,uint256 value)']);
 const deposit=new ethers.Interface(kind==='bok'?['function deposit(bytes32,uint128,bytes32)']:['function depositToAztecPublic(bytes32,uint256,bytes32)']);
 const transactions=new Map(),receipts=new Map();f.state.allowance=0n;f.state.balance=100000n;f.state.unknown=false;f.state.revert=false;
 f.options.provider.getTransactionCount=async()=>7+f.state.sends;
 f.options.provider.getBlockNumber=async()=>16+f.state.sends;
 f.options.provider.getBlock=async number=>{number=number==='latest'?16+f.state.sends:number;return {number,hash:h(number),parentHash:h(number-1),prefetchedTransactions:[...transactions.values()].filter(t=>t.blockNumber===number)};};
 f.options.provider.getTransaction=async hash=>transactions.get(hash)??null;f.options.provider.getTransactionReceipt=async hash=>receipts.get(hash)??null;
 f.options.provider.call=async({to,data})=>{assert.equal(to,scope.token);const parsed=token.parseTransaction({data});return token.encodeFunctionResult(parsed.name,[parsed.name==='balanceOf'?f.state.balance:f.state.allowance]);};
 f.wallet.signer.sendTransaction=async request=>{
  f.state.sends++;const hash=h(300+f.state.sends),blockNumber=16+f.state.sends,tx={...request,hash,blockNumber,value:String(request.value),chainId:String(request.chainId)};transactions.set(hash,tx);
  let log;
  if(request.to===scope.token){const parsed=token.parseTransaction({data:request.data});assert.equal(parsed.name,'approve');assert.equal(parsed.args[0].toLowerCase(),scope.portal);if(!f.state.revert)f.state.allowance=parsed.args[1];log={address:scope.token,...token.encodeEventLog('Approval',[f.wallet.address,scope.portal,parsed.args[1]])};}
  else{assert.equal(request.to,scope.portal);const p=deposit.parseTransaction({data:request.data});const abi=kind==='bok'?bok:fee;log={address:scope.portal,...abi.encodeEventLog(kind==='bok'?'Deposited':'DepositToAztecPublic',kind==='bok'?[p.args[0],p.args[1],h(32),3]:[p.args[0],p.args[1],p.args[2],h(31),2])};}
  receipts.set(hash,{hash,from:f.wallet.address,to:request.to,blockNumber,blockHash:h(blockNumber),status:f.state.revert?0:1,logs:f.state.revert?[]:[log]});
  if(f.state.unknown)throw Error('labelled lost acknowledgement');return {hash};
 };
 f.options.verifyClaim=async hash=>assert.equal(hash,h(70));f.options.resolveScope=async()=>scope;f.options.kind=kind;f.options.reconcileClaim=async()=>({status:'confirmed'});
 return {...f,scope,transactions,receipts,allocation:{amount:'300',gasBudgetWei:'10000',privateFeeCap:'1000'},open:()=>createStandaloneTopupWallet(f.options)};
}
for(const kind of ['private-fee','bok'])test(`direct ${kind} top-up reviews approval and deposit separately, with real journal receipts and no collateral`,async()=>{
 const f=topupFixture(kind),cap=await f.open();assert.equal((await cap.prepare(f.allocation)).phase,'approval');assert.equal(f.state.sends,0);
 assert.deepEqual(await cap.confirm(),{approved:true});assert.equal(f.state.sends,1);
 assert.equal((await advanceAggregateClaim({funding:cap,application:{}})).state,'review-payment');
 const reopened=await f.open();assert.equal((await reopened.prepare(f.allocation)).phase,'deposit');assert.equal(f.state.sends,1);
 const result=await reopened.confirm();assert.equal(result.receipt.amount,'300');assert.equal(result.receipt.nonce,'8');assert.equal(f.state.sends,2);
 const context=await reopened.loadAggregate(result.receipt.txHash);if(kind==='bok'){assert.equal(context.bokScope.recipient,f.scope.recipient);assert(context.bridgeSecret);assert.equal(context.intent,undefined);}else assert.equal(context,null);
 await assert.rejects(reopened.prepare(f.allocation),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
 await reopened.checkpointClaim({intentId:h(900),attempted:true});await reopened.prepare(f.allocation);assert.equal(f.state.sends,2);if(kind==='bok')assert.deepEqual(await reopened.loadAggregate(result.receipt.txHash),context);
});
test('direct top-up lost submission reply only recovers original receipt; changed scope and extra effects fail',async()=>{
 const f=topupFixture(),cap=await f.open();f.state.allowance=1000n;await cap.prepare(f.allocation);f.state.unknown=true;await assert.rejects(cap.confirm(),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
 const reopened=await f.open(),result=await reopened.recover();assert.equal(f.state.sends,1);assert.equal(result.receipt.txHash,h(301));
 const receipt=f.receipts.get(h(301));receipt.logs.push(receipt.logs[0]);await assert.rejects(reopened.recover());assert.equal(f.state.sends,1);
 f.options.resolveScope=async()=>({...f.scope,portal:a(999)});assert.equal(await (await f.open()).inspect(),null);
});
for(const code of ['ACTION_REJECTED','INSUFFICIENT_FUNDS'])test(`direct top-up ${code} restores only the never-sent draft for explicit review`,async()=>{
 const f=topupFixture(),cap=await f.open();await cap.prepare(f.allocation);f.wallet.signer.sendTransaction=async()=>{throw Object.assign(Error('labelled'),{code});};
 await assert.rejects(cap.confirm());assert.equal(await cap.inspect(),null);assert.equal(f.state.sends,0);assert.equal((await cap.prepare(f.allocation)).phase,'approval');
});
test('direct top-up re-reviews changed amount after approval and stops changed account or gas before send',async()=>{
 const f=topupFixture(),cap=await f.open();await cap.prepare(f.allocation);await cap.confirm();assert.equal((await cap.prepare({...f.allocation,amount:'301'})).phase,'approval');assert.equal(f.state.sends,1);
 await cap.prepare(f.allocation);f.state.invalid=true;await assert.rejects(cap.confirm());assert.equal(f.state.sends,1);
 f.state.invalid=false;await cap.prepare(f.allocation);f.options.provider.getFeeData=async()=>({maxFeePerGas:99999n});await assert.rejects(cap.confirm());assert.equal(f.state.sends,1);
});

for(const kind of ['private-fee','bok'])for(const cut of ['prepare','attempt'])test(`direct ${kind} original private claim resumes ${cut} crash without collateral or repeat payment`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);const funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();workflow=durableClaimApplication(f,funding);
 const prepared=await workflow.open().prepare({type:kind==='bok'?'claim-bok':'claim-private-fee',...receipts});if(cut==='attempt')await funding.checkpointClaim({intentId:prepared.intentId,attempted:true});
 const result=await advanceAggregateClaim({application:workflow.open(),funding:await f.open()});assert.equal(result.state,cut==='attempt'?'review-saved':'complete');assert.equal(result.intent.action.type,kind==='bok'?'claim-bok':'claim-private-fee');assert.equal(workflow.state.sends,cut==='attempt'?0:1);assert.equal(f.state.sends,1);
});
for(const kind of ['private-fee','bok'])test(`direct ${kind} canonical reverted payment needs fresh review and retains failed custody`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;f.state.revert=true;const funding=await f.open();await funding.prepare(f.allocation);await assert.rejects(funding.confirm(),{code:'BB_ETH_TRANSACTION_FAILED'});const before=f.records.size;
 const q=await(await f.open()).prepare(f.allocation);assert.equal(q.phase,'deposit');assert.equal(f.state.sends,1);assert.equal(f.records.size,before+1);
 const receipt=f.receipts.get(h(301));receipt.blockHash=h(999);await assert.rejects(funding.prepare(f.allocation));assert.equal(f.state.sends,1);
});

for(const kind of ['private-fee','bok'])test(`direct ${kind} confirmed claim survives later workflow replacement but rejects a reorg`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);const funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();workflow=durableClaimApplication(f,funding);
 const complete=await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(complete.state,'complete');assert.equal(workflow.state.sends,1);
 f.options.reconcileClaim=async()=>{throw Error('labelled subsequent workflow replaced old slot');};
 await (await f.open()).prepare(f.allocation);assert.equal(f.state.sends,1);
 const successor=await f.open();await successor.prepare(f.allocation);f.options.verifyClaim=async()=>{throw Error('labelled canonical claim reorg');};await assert.rejects((await f.open()).prepare(f.allocation),/canonical claim reorg/);assert.equal(f.state.sends,1);
 // The captured callback can observe a chain change after review, before send.
 f.options.verifyClaim=async()=>{};let canonical=true;f.options.verifyClaim=async()=>{if(!canonical)throw Error('claim changed after review');};const race=await f.open();await race.prepare(f.allocation);canonical=false;await assert.rejects(race.confirm(),/claim changed after review/);assert.equal(f.state.sends,1);
});

import {submitWithFundingCheckpoint} from './aggregate-wallet.mjs';
for(const kind of ['private-fee','bok'])test(`direct ${kind} manual over-cap claim checkpoints before send and retains confirmed successor`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);const funding=await f.open();await funding.prepare({...f.allocation,privateFeeCap:'1'});await funding.confirm();workflow=durableClaimApplication(f,funding);
 const review=await advanceAggregateClaim({application:workflow.open(),funding});assert.equal(review.state,'review');assert.equal((await funding.inspect()).claim.attempted,false);assert.equal(workflow.state.sends,0);
 const original=workflow.open(),application={...original,submitPrepared:async id=>{assert.equal((await funding.inspect()).claim.attempted,true);return original.submitPrepared(id);}};
 const done=await submitWithFundingCheckpoint({application,topups:{[kind]:funding},intentId:review.intent.intentId});assert.equal(done.status,'confirmed');assert.equal(workflow.state.sends,1);
 f.options.reconcileClaim=async()=>{throw Error('later unrelated workflow');};await (await f.open()).prepare(f.allocation);assert.equal(f.state.sends,1);
});

test('direct top-up manual checkpoint rejects substituted receipt and leaves unrelated imported claim alone',async()=>{
 const f=topupFixture(),funding=await f.open();f.state.allowance=1000n;await funding.prepare(f.allocation);const {receipt}=await funding.confirm();await funding.checkpointClaim({intentId:h(901),attempted:false});let sends=0;
 const app=id=>({reconcile:async()=>({intentId:id,status:'prepared',action:{type:'claim-bok',receipt:{...receipt,amount:'999'}}}),submitPrepared:async()=>{sends++;return {status:'unknown'};}});
 await assert.rejects(submitWithFundingCheckpoint({application:app(h(901)),topups:{bok:funding},intentId:h(901)}),{code:'ROLLING_FUNDING_MISMATCH'});assert.equal(sends,0);assert.equal((await funding.inspect()).claim.attempted,false);
 await submitWithFundingCheckpoint({application:app(h(902)),topups:{bok:funding},intentId:h(902)});assert.equal(sends,1);assert.equal((await funding.inspect()).claim.attempted,false);
});

function claimProgressFixture(failureStep,original){
 const rows=[],calls=[],run=(name,value)=>async()=>{calls.push(name);if(name===failureStep)throw original;return value;};
 const saved={paymentSaved:true,privateFeeCap:'10',claim:failureStep==='reconcile'?{intentId:'PRIVATE_ID',attempted:true}:null};
 const prepared={intentId:'PRIVATE_ID',status:'prepared',maximumFee:'10'},confirmed={...prepared,status:'confirmed'};
 return {rows,calls,input:{onProgress:row=>rows.push(row),funding:{inspect:run('inspect',saved),recover:run('recover',{receipt:{private:'SECRET_RECEIPT'}}),checkpointClaim:run('checkpoint'),recordClaimCompletion:run('record')},application:{readFundingState:run('account-status',{status:'ready'}),prepare:run('prepare',prepared),submitPrepared:run('submit',confirmed),reconcile:run('reconcile',confirmed)}}};
}
for(const step of ['inspect','recover','account-status','prepare','checkpoint','submit','reconcile'])test('claim progress reports exact failing '+step+' without exposing original exception or values',async()=>{
 const original=Object.assign(Error('PRIVATE_SENTINEL'),{code:'ROLLING_FUNDING_MISMATCH'}),f=claimProgressFixture(step,original);
 await assert.rejects(advanceAggregateClaim(f.input),e=>e===original);assert.deepEqual(f.rows.at(-1),{stage:'funding-claim',step,deploymentStep:null,state:'failed',code:'ROLLING_FUNDING_MISMATCH'});
 assert.equal(f.rows.filter(r=>r.state==='failed').length,1);assert(f.rows.every(Object.isFrozen));assert(!JSON.stringify(f.rows).match(/PRIVATE|SECRET/));assert(!f.calls.includes('submit')||step==='submit');
});
test('claim progress preserves successful order and diagnostics cannot change submission',async()=>{
 const f=claimProgressFixture();f.input.onProgress=row=>{f.rows.push(row);if(row.state==='started')throw Error('OBSERVER');return Promise.reject(Error('OBSERVER'));};
 assert.equal((await advanceAggregateClaim(f.input)).state,'complete');assert.deepEqual(f.calls,['inspect','recover','account-status','prepare','checkpoint','checkpoint','submit','record']);
 assert.deepEqual(f.rows.filter(r=>r.state==='started').map(r=>r.step),['inspect','recover','account-status','prepare','checkpoint','checkpoint','submit','checkpoint']);assert(f.rows.every(r=>r.code===null));
});
for(const original of [undefined,null,false,0,'PRIVATE_SENTINEL',Object.assign(Error('PRIVATE_SENTINEL'),{code:'PRIVATE_SENTINEL'}),Object.defineProperty({},'code',{get(){throw Error('GETTER_SENTINEL');}})])test('claim progress retains original unusual failure '+String(typeof original),async()=>{
 const f=claimProgressFixture('prepare',original);let caught=false;try{await advanceAggregateClaim(f.input);}catch(e){caught=true;assert.equal(e,original);}assert(caught);assert.equal(f.rows.at(-1).code,'unknown');assert.equal(f.rows.filter(r=>r.state==='failed').length,1);assert(!JSON.stringify(f.rows).includes('SENTINEL'));
});
test('claim progress retains waiting semantics for bridge and claim availability failures',async()=>{
 for(const [step,code]of [['recover','ROLLING_FUNDING_PENDING'],['prepare','ROLLING_FUNDING_NOT_READY']]){const f=claimProgressFixture(step,Object.assign(Error('private'),{code}));assert.deepEqual(await advanceAggregateClaim(f.input),{state:'waiting',phase:step==='recover'?'payment':'bridge'});assert.equal(f.rows.at(-1).code,code);assert(!f.calls.includes('submit'));}
});

test('USDC lost submit response recovers the original relay hash and pending receipt without another POST',async()=>{
 const f=usdcWalletFixture(),original=f.options.relay.submit;let landed=false,waits=0;
 f.options.relay.submit=async data=>{await original(data);throw Error('lost HTTP response');};
 f.options.provider.getTransactionReceipt=async()=>landed?f.state.usdcReceipt:null;
 const get=f.options.provider.getTransaction;f.options.provider.getTransaction=async hash=>{const tx=await get(hash);return tx&&Object.assign(tx,{replaceableTransaction:start=>{assert.equal(start,16);return {wait:async(confirmations,timeout)=>{assert.equal(confirmations,1);assert.equal(timeout,undefined);waits++;landed=true;return f.state.usdcReceipt;}};}});};
 const app=await f.open();await app.prepare(f.allocation);await app.confirm();
 f.options.relay.status=async()=>{throw Error('hash already retained');};
 assert.equal((await app.recover({wait:true})).receipt.txHash,h(200));assert.equal(waits,1);assert.equal(f.state.posts,1);
});
test('USDC malformed or changed submit hash never becomes verified funding',async()=>{
 const f=usdcWalletFixture(),original=f.options.relay.submit;
 f.options.relay.submit=async data=>({...await original(data),planHash:h(999)});
 const app=await f.open();await app.prepare(f.allocation);await assert.rejects(app.confirm(),{code:'ROLLING_FUNDING_RELAY_SCOPE'});
 assert.equal(f.state.posts,1);assert.equal((await app.recover()).receipt.txHash,h(200));assert.equal(f.state.posts,1);
});
test('known original ETH hash waits for receipt then rechecks canonical effects without rebroadcast',async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();f.state.landed=false;let waits=0;
 const get=f.options.provider.getTransaction;f.options.provider.getTransaction=async hash=>{const tx=await get(hash);return tx&&Object.assign(tx,{replaceableTransaction:start=>{assert.equal(start,16);return {wait:async(confirmations,timeout)=>{assert.equal(confirmations,1);assert.equal(timeout,undefined);waits++;f.state.landed=true;return {};}};}});};
 assert.equal((await app.recover({wait:true})).receipt.txHash,h(20));assert.equal(waits,1);assert.equal(f.state.sends,1);
});

for(const [asset,make] of [['ETH',fixture],['USDC',usdcWalletFixture]])for(const code of [4001,'ACTION_REJECTED'])test(`${asset} rejected consent preserves custody and permits only a fresh reviewed quote (${code})`,async()=>{
 const f=make(),funding=await f.open();await funding.prepare(f.allocation);const original=f.wallet.signer.signTypedData;
 f.wallet.signer.signTypedData=async()=>{throw Object.assign(Error('PRIVATE_SENTINEL'),{code});};
 await assert.rejects(funding.confirm(),{code:'ROLLING_FUNDING_SIGNATURE_CANCELLED'});
 assert.equal((await funding.inspect()).paymentSaved,false);assert.equal(f.state.invalid,false);assert.equal(f.state.sends,0);assert.equal(f.state.posts??0,0);
 await assert.rejects(funding.confirm(),{code:'ROLLING_FUNDING_QUOTE_REQUIRED'});
 f.wallet.signer.signTypedData=original;await funding.prepare(f.allocation);await funding.confirm();
 assert.equal(asset==='ETH'?f.state.sends:f.state.posts,1);
});
test('consent opens before repeated scope reads, but a changed scope prevents payment and durable intent',async()=>{
 const f=fixture();let checks=0;f.options.verifyScope=async()=>{checks++;return async()=>{checks++;assert.equal(f.state.signatures,1);throw Error('Changed scope');};};
 const funding=await f.open();await funding.prepare(f.allocation);await assert.rejects(funding.confirm(),/Changed scope/);
 assert.equal(checks,2);assert.equal(f.state.sends,0);assert.equal((await funding.inspect()).paymentSaved,false);
});
test('rejected consent does not hide an actual changed account',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);
 f.wallet.signer.signTypedData=async()=>{f.state.invalid=true;throw Object.assign(Error('Cancelled'),{code:4001});};
 await assert.rejects(funding.confirm(),/Context changed/);assert.equal(f.state.sends,0);
});

test('USDC consent delay cannot open an already expired authorization prompt',async()=>{
 const f=usdcWalletFixture(),funding=await f.open();await funding.prepare(f.allocation);const sign=f.wallet.signer.signTypedData;
 f.wallet.signer.signTypedData=async(...args)=>{const value=await sign(...args);f.state.pendingTime=1901;return value;};
 await assert.rejects(funding.confirm(),{code:'AGGREGATE_STALE_QUOTE'});assert.equal(f.state.signatures,1);assert.equal(f.state.posts,0);assert.equal((await funding.inspect()).paymentSaved,false);
});

for(const asset of ['ETH','USDC'])test(asset+' funding rejects unaffordable new payment before quote RPC or signatures',async()=>{
 const f=asset==='ETH'?fixture():usdcWalletFixture();f.state.creditRejected=true;
 const funding=await f.open();await assert.rejects(funding.prepare(f.allocation),{code:'ROLLING_FUNDING_FEE_CREDIT_INSUFFICIENT'});
 assert.equal(f.state.reads,0);assert.equal(f.state.signatures,0);assert.equal(f.state.sends,0);assert.equal(f.state.posts??0,0);assert.equal(f.records.size,0);
});
for(const asset of ['ETH','USDC'])test(asset+' rechecks private credit before first signature and before dispatch',async()=>{
 const f=asset==='ETH'?fixture():usdcWalletFixture(),funding=await f.open();await funding.prepare(f.allocation);
 f.state.creditRejected=true;await assert.rejects(funding.confirm(),{code:'ROLLING_FUNDING_FEE_CREDIT_INSUFFICIENT'});assert.equal(f.state.signatures,0);
 f.state.creditRejected=false;await funding.prepare(f.allocation);const sign=f.wallet.signer.signTypedData;
 f.wallet.signer.signTypedData=async(...args)=>{const result=await sign(...args);f.state.creditRejected=true;return result;};
 await assert.rejects(funding.confirm(),{code:'ROLLING_FUNDING_FEE_CREDIT_INSUFFICIENT'});assert.equal(f.state.sends,0);assert.equal(f.state.posts??0,0);
});
test('already-paid funding recovery does not rerun new-payment eligibility',async()=>{
 const f=fixture(),funding=await f.open();await funding.prepare(f.allocation);await funding.confirm();const checks=f.state.creditChecks;
 f.state.creditRejected=true;const receipt=await funding.recover();assert(receipt.receipt.txHash);assert.equal(f.state.creditChecks,checks);assert.equal(f.state.sends,1);
});

for(const asset of ['ETH','USDC'])test(asset+' expiry during final credit check prevents payment dispatch',async()=>{
 const f=asset==='ETH'?fixture():usdcWalletFixture();const verify=f.options.verifyFeeCredit;let checks=0;
 f.options.verifyFeeCredit=async amount=>{await verify(amount);if(++checks===3)f.state.pendingTime=1901;};
 const funding=await f.open();await funding.prepare(f.allocation);
 await assert.rejects(funding.confirm(),{code:'AGGREGATE_STALE_QUOTE'});
 assert.equal(checks,3);assert.equal(f.state.sends,0);assert.equal(f.state.posts??0,0);assert.equal((await funding.inspect()).paymentSaved,false);
});

test('starter funding derives the minimum deposit and funds the claim plus another action',async()=>{
 const {starterFundingAllocation}=await import('./aggregate-wallet.mjs');let reads=0;
 const eth=await starterFundingAllocation({asset:'ETH',minDeposit:'123456789',privateFeeCap:'700',provider:{async getFeeData(){reads++;return {maxFeePerGas:2n,gasPrice:1n};}}});
 assert.deepEqual(eth,{asset:'ETH',collateralWei:'123456789',feeAmount:'1400',bokAmount:'0',feePoolFee:3000,slippageBps:100,privateFeeCap:'700',bokPoolFee:0,gasBudgetWei:'10000000'});assert.equal(reads,1);
 const usdc=await starterFundingAllocation({asset:'USDC',minDeposit:'400',privateFeeCap:'11',provider:{getFeeData(){throw Error('USDC must use relay pricing');}}});
 assert.equal(usdc.bokAmount,'0');assert.equal(usdc.feeAmount,'22');assert.equal(usdc.collateralWei,'400');assert.equal(usdc.gasBudgetWei,undefined);assert.equal(usdc.collateralPoolFee,3000);
 await assert.rejects(starterFundingAllocation({asset:'ETH',minDeposit:'1',privateFeeCap:'1',provider:{async getFeeData(){return {maxFeePerGas:null,gasPrice:null};}}}),{code:'ROLLING_FUNDING_GAS_UNAVAILABLE'});
});

test('direct top-up estimates fees without imposing an unapproved stale gas-price ceiling',async()=>{
 const f=topupFixture(),cap=await f.open();const {gasBudgetWei,...input}=f.allocation;
 const quote=await cap.prepare(input);assert.equal(quote.gasBudgetWei,'400');assert.equal(f.state.sends,0);
 f.options.provider.getFeeData=async()=>({maxFeePerGas:3n});await cap.confirm();assert.equal(f.state.sends,1);assert.equal([...f.transactions.values()][0].maxFeePerGas,3n);
});


test('zero Bok aggregate payment retains two exact receipts without any Bok secret or claim',async()=>{
 const f=fixture(),scopes=[];f.options.bok=undefined;
 f.options.verifyScope=async value=>{scopes.push(value);return async()=>{};};
 f.options.sdk.poseidon2HashWithSeparator=()=>{throw Error('Zero Bok must not derive plugin custody');};
 const app=await f.open();await app.prepare({...f.allocation,bokAmount:'0',bokPoolFee:0});
 assert.deepEqual(scopes,[{includeBok:false,asset:'ETH'}]);
 const receipts=await app.confirm();assert.deepEqual(Object.keys(receipts).sort(),['feeReceipt','receipt']);
 const reopened=await f.open(),custody=await reopened.loadAggregate(receipts.receipt.txHash);
 assert.equal(custody.bokScope,null);assert.equal(custody.recipientSalt,null);assert.equal(custody.bridgeSecret,null);
 assert.deepEqual(await reopened.recover(),receipts);assert.equal(f.state.sends,1);assert.equal(f.state.signatures,1);
 await reopened.checkpointClaim({intentId:h(100),attempted:false});
 await reopened.checkpointSubmission(h(100),{type:'claim-deposit',...receipts});
 await assert.rejects(reopened.checkpointSubmission(h(100),{type:'claim-deposit',receipt:receipts.receipt}),{code:'ROLLING_FUNDING_MISMATCH'});
 await assert.rejects(reopened.checkpointSubmission(h(100),{type:'claim-deposit',...receipts,bokReceipt:receipts.feeReceipt}),{code:'ROLLING_FUNDING_MISMATCH'});
});

import {prepareBokCreditPurchase,bokCreditPurchaseAbi,validateBokCreditPurchaseIntent} from './bok-credit-purchase.mjs';
const purchaseInterface=new ethers.Interface(bokCreditPurchaseAbi);
import {runTopupPayment,aggregateFundingFailure} from '../../apps/rolling/wallet-panel.mjs';
function ethTopupFixture(){
 const f=topupFixture(),s=f.options.scope;f.options.topupScope=s;f.state.balance=0n;
 const call=f.options.provider.call,getBlock=f.options.provider.getBlock,send=f.wallet.signer.sendTransaction;
 f.options.provider.getBlock=async tag=>({...await getBlock(tag),timestamp:1000});
 f.options.provider.call=async request=>request.to===f.scope.token?call(request):f.options.provider.send('eth_call',[request,'0x10']);
 f.wallet.signer.sendTransaction=async request=>{
  if(request.to!==s.router)return send(request);
  assert.equal(request.to,s.router);f.state.sends++;
  const hash=h(300+f.state.sends),blockNumber=16+f.state.sends,tx={...request,hash,blockNumber,value:String(request.value),chainId:String(request.chainId)};
  const parsed=purchaseInterface.parseTransaction({data:request.data}),p=parsed.args[0];assert.equal(parsed.name,'buyCredit');
  assert.equal(String(p.deadline),'1900');assert.equal(String(p.amount),'300');
  f.transactions.set(hash,tx);
  f.receipts.set(hash,{hash,from:f.wallet.address,to:request.to,blockNumber,blockHash:h(blockNumber),status:1,logs:[
   {address:s.router,...purchaseInterface.encodeEventLog('CreditPurchased',[f.wallet.address,p.commitment,p.amount,p.secretHash,h(32),3,300,3])},
   {address:f.scope.portal,...bok.encodeEventLog('Deposited',[p.commitment,p.amount,h(32),3])},
  ]});
  if(f.state.unknown)throw Error('Lost payment acknowledgement.');return {hash};
 };
 return {...f,allocation:{...f.allocation,asset:'ETH'}};
}

test('USDC top-up reports insufficient wallet tokens before any payment',async()=>{
 const f=topupFixture();f.state.balance=0n;
 await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_FUNDING_TOKEN_BALANCE'});
 assert.equal(f.state.sends,0);
});

test('ETH Bok purchase swaps and bridges with one wallet transaction',async()=>{
 const f=ethTopupFixture(),cap=await f.open(),quote=await cap.prepare(f.allocation),phases=[];
 assert.equal(quote.phase,'deposit');assert.equal(quote.maximumSwapWei,'303');assert.equal(f.state.sends,0);
 const result=await runTopupPayment(cap,f.allocation,quote,phase=>phases.push(phase));
 assert.deepEqual(phases,['deposit','confirmation']);assert.equal(f.state.sends,1);assert.equal(result.receipt.amount,'300');
 assert.deepEqual([...f.transactions.values()].map(tx=>tx.to),[f.options.scope.router]);
 assert.deepEqual([...f.transactions.values()].map(tx=>tx.value),['303']);
 const custody=await cap.loadAggregate(result.receipt.txHash);assert(custody.bridgeSecret&&custody.recipientSalt);
});
test('confirmed ETH purchase survives reopen without a second payment',async()=>{
 const f=ethTopupFixture(),first=await f.open();await first.prepare(f.allocation);const result=await first.confirm();
 const next=await f.open();assert.deepEqual(await next.recover(),result);assert.equal(f.state.sends,1);
 await assert.rejects(next.prepare(f.allocation),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
});
test('lost ETH purchase reply reconciles the original receipt without repeating payment',async()=>{
 const f=ethTopupFixture(),cap=await f.open();await cap.prepare(f.allocation);f.state.unknown=true;
 await assert.rejects(cap.confirm(),{code:'BB_ETH_SUBMISSION_UNKNOWN'});assert.equal(f.state.sends,1);
 f.state.unknown=false;const result=await (await f.open()).recover();assert.equal(result.receipt.amount,'300');assert.equal(f.state.sends,1);
});
test('ETH purchase validates configured router code and refuses altered recipient or value',async()=>{
 const f=ethTopupFixture();f.options.topupScope={...f.options.scope,routerCodeHash:h(901)};
 await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_FUNDING_PURCHASE_SCOPE'});assert.equal(f.state.sends,0);
 const g=ethTopupFixture(),cap=await g.open();await cap.prepare(g.allocation);await cap.confirm();
 const saved=await (await g.options.sdk.createEthereumJournal({storage:g.options.storage,walletSecret:g.options.walletSecret,walletSalt:g.options.walletSalt,
  scope:{account:g.options.owner,...g.options.network,board:g.scope.recipient,portal:g.options.scope.router,token:g.scope.token,depositor:g.wallet.address},provider:g.options.provider})).inspectRequest();
 const scope={portal:g.options.scope.router,token:g.scope.token};validateBokCreditPurchaseIntent(saved,scope);
 assert.throws(()=>validateBokCreditPurchaseIntent({...saved,expected:{...saved.expected,recipient:a(999)}},scope));
 assert.throws(()=>validateBokCreditPurchaseIntent({...saved,value:'999'},scope));
});

test('payment continuation stops at failed wallet stage and preserves actionable code',async()=>{
 let prepares=0,sends=0;const events=[];
 const cap={async confirm(){sends++;throw Object.assign(Error('private detail'),{code:'BB_ETH_REQUEST_CANCELLED'});},async prepare(){prepares++;}};
 await assert.rejects(runTopupPayment(cap,{}, {phase:'swap'},phase=>events.push(phase)),error=>error.code==='BB_ETH_REQUEST_CANCELLED'&&error.topupStage==='swap'&&!error.message.includes('private detail'));
 assert.deepEqual(events,['swap']);assert.equal(sends,1);assert.equal(prepares,0);
});


test('credit errors identify missing USDC, cancelled exchange, and retained USDC after later cancellation',async()=>{
 assert.match(aggregateFundingFailure({code:'ROLLING_FUNDING_TOKEN_BALANCE'}),/Choose Pay with ETH/);
 assert.equal(aggregateFundingFailure({code:'BB_ETH_REQUEST_CANCELLED',topupStage:'swap'}),'ETH exchange cancelled. No ETH was spent.');
 let confirms=0;
 const cap={async confirm(){if(++confirms===1)return {swapped:true};throw Object.assign(Error('private detail'),{code:'BB_ETH_REQUEST_CANCELLED'});},async prepare(){return {phase:'approval'};}};
 await assert.rejects(runTopupPayment(cap,{}, {phase:'swap'}),error=>{
  assert.equal(error.topupStage,'approval');assert.equal(error.topupExchanged,true);
  assert.match(aggregateFundingFailure(error),/USDC is in your wallet/);return true;
 });
 assert.match(aggregateFundingFailure({code:'UNKNOWN',topupStage:'claim'}),/payment was sent/);
});

test('ETH credit continuation awaits native receipt completion with no second wallet prompt',async()=>{
 const f=ethTopupFixture(),send=f.wallet.signer.sendTransaction,getBlock=f.options.provider.getBlock,getHead=f.options.provider.getBlockNumber;
 let pending=false,release,waitStarted;
 const started=new Promise(resolve=>{waitStarted=resolve;});
 f.options.provider.getBlockNumber=()=>pending?Promise.resolve(16):getHead();
 f.options.provider.getBlock=tag=>pending&&(tag==='latest'||tag===16)?Promise.resolve({number:16,hash:h(16),timestamp:1000,prefetchedTransactions:[]}):getBlock(tag);
 f.wallet.signer.sendTransaction=async request=>{
  const response=await send(request);
  if(request.to!==f.options.scope.router)return response;
  pending=true;const receipt=f.receipts.get(response.hash);f.receipts.delete(response.hash);
  const tx=f.transactions.get(response.hash);tx.replaceableTransaction=()=>({wait:()=>new Promise(resolve=>{
   release=()=>{pending=false;f.receipts.set(response.hash,receipt);resolve(receipt);};waitStarted();
  })});
  return response;
 };
 const cap=await f.open(),quote=await cap.prepare(f.allocation),phases=[];
 const result=runTopupPayment(cap,f.allocation,quote,phase=>phases.push(phase));
 await started;assert.equal(f.state.sends,1);assert.deepEqual(phases,['deposit','confirmation']);
 release();await result;assert.deepEqual(phases,['deposit','confirmation']);assert.equal(f.state.sends,1);
});

test('ETH purchase completes the original private Bok claim and allows a later independent credit purchase',async()=>{
 const f=ethTopupFixture();let workflow;f.options.reconcileClaim=id=>workflow.open().reconcile(id);
 const funding=await f.open();await runTopupPayment(funding,f.allocation,await funding.prepare(f.allocation));
 workflow=durableClaimApplication(f,funding);
 const done=await advanceAggregateClaim({application:workflow.open(),funding});
 assert.equal(done.state,'complete');assert.equal(done.intent.action.type,'claim-bok');assert.equal(workflow.state.sends,1);assert.equal(f.state.sends,1);
 const next=await f.open(),quote=await next.prepare(f.allocation);assert.equal(quote.phase,'deposit');
 await runTopupPayment(next,f.allocation,quote);assert.equal(f.state.sends,2);
});

test('posting token balance failure does not suggest USDC or an unavailable ETH option',async()=>{
 const f=topupFixture('private-fee');f.state.balance=0n;
 await assert.rejects((await f.open()).prepare(f.allocation),error=>{
  assert.equal(error.code,'ROLLING_FUNDING_FEE_TOKEN_BALANCE');
  const text=aggregateFundingFailure(error);assert.match(text,/fee tokens/);assert.doesNotMatch(text,/USDC|ETH/);return true;
 });assert.equal(f.state.sends,0);
});

test('fresh ETH funding uses the verified waiter result without a second receipt recovery',async()=>{
 const f=fixture(),recoverCalls=[];const original=f.options.sdk.createEthereumJournal;
 f.options.sdk.createEthereumJournal=async options=>{
  const journal=await original(options);
  return {...journal,recover:async options=>{recoverCalls.push(options);if(options.wait)f.state.landed=true;return journal.recover(options);}};
 };
 const app=await f.open();await app.prepare(f.allocation);await app.confirm();f.state.landed=false;
 const result=await app.recover({wait:true});
 assert.equal(result.receipt.txHash,h(20));assert.equal(f.state.sends,1);
 assert.deepEqual(recoverCalls,[{retry:false},{retry:false,wait:true}]);
});

test('automatic funding prepares directly for submission, including after bridge readiness',async()=>{
 const f=claimProgressFixture(),prepare=f.input.application.prepare,calls=[];let bridgeWaits=0;
 f.input.application.prepare=async(action,options)=>{
  calls.push({action,options});
  if(calls.length===1)throw Object.assign(Error('bridge pending'),{code:'ROLLING_FUNDING_NOT_READY',reason:'l2-delivery'});
  return prepare(action,options);
 };
 f.input.waits={bridge:async()=>{bridgeWaits++;},claim:()=>assert.fail('Already confirmed')};
 assert.equal((await advanceAggregateClaim(f.input)).state,'complete');assert.equal(bridgeWaits,1);assert.equal(calls.length,2);
 for(const call of calls)assert.deepEqual(call,{action:{type:'claim-deposit',receipt:{private:'SECRET_RECEIPT'}},options:{immediate:true}});
 assert.equal(f.calls.filter(call=>call==='submit').length,1);
});
test('automatic ETH topup fee refresh accepts current gas price at wallet confirmation',async()=>{
 const f=ethTopupFixture(),input={amount:'300',asset:'ETH',privateFeeCap:'1000'},cap=await f.open();
 await cap.prepare(input);f.options.provider.getFeeData=async()=>({maxFeePerGas:3n,maxPriorityFeePerGas:1n});
 await cap.confirm();assert.equal(f.state.sends,1);assert.equal([...f.transactions.values()][0].maxFeePerGas,3n);
});
test('explicit fee cap failure occurs before wallet call and permits a fresh quote',async()=>{
 const f=ethTopupFixture(),cap=await f.open();await cap.prepare(f.allocation);
 f.options.provider.getFeeData=async()=>({maxFeePerGas:100000n,maxPriorityFeePerGas:1n});
 await assert.rejects(cap.confirm(),{code:'BB_ETH_PREFLIGHT_FAILED',ethereumStage:'preflight'});assert.equal(f.state.sends,0);
 assert.equal(await cap.inspect(),null);f.options.provider.getFeeData=async()=>({maxFeePerGas:1n,maxPriorityFeePerGas:0n});await cap.prepare(f.allocation);
});
test('atomic ETH purchase does not query unused wallet token balance or allowance',async()=>{
 const f=ethTopupFixture(),call=f.options.provider.call;f.options.provider.call=request=>{assert.notEqual(request.to,f.scope.token);return call(request);};
 await (await f.open()).prepare(f.allocation);
});

test('switching an unfinished USDC approval to ETH creates an atomic purchase without requiring USDC',async()=>{
 const f=ethTopupFixture();f.state.balance=300n;const first=await f.open();
 assert.equal((await first.prepare({...f.allocation,asset:'USDC'})).phase,'approval');assert.deepEqual(await first.confirm(),{approved:true});
 f.state.balance=0n;const next=await f.open(),quote=await next.prepare(f.allocation);assert.equal(quote.phase,'deposit');assert.equal(quote.asset,'ETH');assert.equal(quote.maximumSwapWei,'303');
 assert.equal((await next.confirm()).receipt.amount,'300');assert.equal(f.state.sends,2);
 assert.deepEqual([...f.transactions.values()].map(tx=>tx.to),[f.scope.token,f.options.topupScope.router]);
});

test('ETH confirmation estimates exact encoded calldata then simulates it once before journal intent/broadcast',async()=>{
 const f=fixture(),app=await f.open(),seen=[],original=f.options.provider.send,estimate=f.options.provider.estimateGas;
 f.options.provider.send=async(method,params)=>{if(method==='eth_call'&&params[1]==='pending'){seen.push({phase:'simulate',request:params[0]});assert.equal(f.state.sends,0);assert.equal((await app.inspect()).paymentSaved,false);}return original(method,params);};
 f.options.provider.estimateGas=async request=>{seen.push({phase:'estimate',request:{...request}});return estimate(request);};
 await app.prepare(f.allocation);await app.confirm();
 assert.deepEqual(seen.map(value=>value.phase),['estimate','simulate','estimate']);
 for(const key of ['from','to','data'])assert.equal(seen[0].request[key],seen[1].request[key]);
 assert.equal(BigInt(seen[0].request.value),BigInt(seen[1].request.value));assert.equal(f.state.sends,1);assert.equal(f.state.signatures,1);
});
for(const change of ['pending-state','expiry','encoded-request'])test(`ETH final authority rejects ${change} changed during gas estimation without sending`,async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);
 const original=f.options.provider.estimateGas;
 f.options.provider.estimateGas=async request=>{
  if(change==='pending-state')f.state.simulationFails=true;
  if(change==='expiry')f.state.pendingTime=1901;
  return original(request);
 };
 if(change==='encoded-request'){
  const encode=f.options.sdk.encodeAggregateFundingTransaction;
  f.options.sdk.encodeAggregateFundingTransaction=(...args)=>({...encode(...args),value:'1'});
 }
 await assert.rejects(app.confirm());assert.equal(f.state.sends,0);assert.equal((await app.inspect()).paymentSaved,false);
});

for(const owned of [false,true])test(`top-up phase checks stay fresh while owned slot reads reuse scope: ${owned}`,async()=>{
 const f=topupFixture();f.state.allowance=1000n;let operation={},scopes=0;
 f.options.resolveScope=async()=>{scopes++;return f.scope;};if(owned)f.options.operationScope=()=>operation;
 const cap=await f.open();await cap.prepare(f.allocation);assert.equal(scopes,1);
 operation={};scopes=0;await cap.confirm();assert.equal(scopes,owned?2:3,'Fresh confirm and presend phase checks remain');
 operation={};scopes=0;
 await cap.inspect();await cap.recover();await cap.checkpointClaim({intentId:h(900),attempted:false});await cap.checkpointClaim({intentId:h(900),attempted:true});
 assert.equal(scopes,owned?1:4,'Only journal plumbing reuses same-operation qualification');
 operation={};await cap.inspect();assert.equal(scopes,owned?2:5,'New operation always qualifies afresh');
});
for(const change of ['scope','guard','operation'])test(`top-up scope reuse refuses ${change} changes`,async()=>{
 const f=topupFixture();let operation={},calls=0,invalid=false;
 f.options.operationScope=()=>operation;
 f.options.contextGuard=async()=>{if(invalid)throw Error('Account replaced');};
 f.options.resolveScope=async()=>{calls++;return f.scope;};
 const cap=await f.open();await cap.inspect();assert.equal(calls,1);
 if(change==='guard'){invalid=true;await assert.rejects(cap.inspect(),/Account replaced/);assert.equal(calls,1);}
 else if(change==='scope'){operation={};f.scope.portal=a(999);await assert.rejects(cap.inspect(),{code:'ROLLING_FUNDING_MISMATCH'});assert.equal(calls,2);}
 else{
  operation={};const before=operation;f.options.resolveScope=async()=>f.scope;
  // Captured resolver switches the owned operation while it is being qualified.
  const g=topupFixture();g.options.operationScope=()=>operation;g.options.resolveScope=async()=>{operation={};return g.scope;};
  await assert.rejects((await g.open()).inspect(),{code:'ROLLING_FUNDING_MISMATCH'});assert.notEqual(operation,before);
 }
});
test('top-up presend qualification failure invalidates earlier same-operation scope',async()=>{
 const f=topupFixture();f.state.allowance=1000n;let operation={},calls=0,reject=false;
 f.options.operationScope=()=>operation;f.options.resolveScope=async()=>{calls++;if(reject)throw Error('Portal disabled');return f.scope;};
 const cap=await f.open();await cap.prepare(f.allocation);operation={};
 const guard=f.wallet.guard;let guards=0;f.wallet.guard=async()=>{await guard();if(++guards===2)reject=true;};
 await assert.rejects(cap.confirm());assert.equal(f.state.sends,0);
 const before=calls;await assert.rejects(cap.inspect(),/Portal disabled/);assert(calls>before);
});

for(const asset of ['ETH','USDC'])test(`standalone ${asset} quote overlaps independent RPC waves without changing calls or final authority`,async()=>{
 const f=asset==='ETH'?ethTopupFixture():topupFixture();const cap=await f.open(),seen=[];
 let releaseHead,releaseGas,headEntered,nonceEntered,gasEntered,feeEntered;
 const headGate=new Promise(r=>releaseHead=r),gasGate=new Promise(r=>releaseGas=r);
 const headStarted=new Promise(r=>headEntered=r),nonceStarted=new Promise(r=>nonceEntered=r),gasStarted=new Promise(r=>gasEntered=r),feeStarted=new Promise(r=>feeEntered=r);
 const p=f.options.provider,head=p.getBlock,nonce=p.getTransactionCount,gas=p.estimateGas,fees=p.getFeeData;
 p.getBlock=async tag=>{if(tag==='latest'&&!seen.includes('head')){seen.push('head');headEntered();await headGate;}return head(tag);};
 p.getTransactionCount=async(...args)=>{seen.push('nonce');nonceEntered();return nonce(...args);};
 p.estimateGas=async request=>{seen.push('gas');gasEntered();await gasGate;return gas(request);};
 p.getFeeData=async()=>{seen.push('fees');feeEntered();return fees();};
 const preparation=cap.prepare(f.allocation);await headStarted;await nonceStarted;assert.deepEqual(seen,['head','nonce']);releaseHead();
 await gasStarted;await feeStarted;assert.deepEqual(seen,['head','nonce','gas','fees']);releaseGas();const quote=await preparation;
 assert.equal(quote.phase,asset==='ETH'?'deposit':'approval');assert.equal(f.state.sends,0);assert.equal(seen.filter(v=>v==='nonce').length,1);assert.equal(seen.filter(v=>v==='fees').length,1);
 p.getTransactionCount=async()=>8;await assert.rejects(cap.confirm(),{code:'ROLLING_FUNDING_NONCE_CHANGED'});assert.equal(f.state.sends,0);
});
for(const wave of ['head-nonce','gas-fees','secret-commitment'])test(`standalone funding drains ${wave} siblings before a synchronous rejection escapes`,async()=>{
 const f=ethTopupFixture();let entered,release,settled=false;
 const started=new Promise(r=>entered=r),held=new Promise(r=>release=r),failure=Error('controlled first branch failure');
 if(wave==='head-nonce'){
  f.options.provider.getBlock=()=>{throw failure;};f.options.provider.getTransactionCount=async()=>{entered();await held;return 7;};
 }else if(wave==='gas-fees'){
  f.options.provider.estimateGas=()=>{throw failure;};f.options.provider.getFeeData=async()=>{entered();await held;return {maxFeePerGas:2n};};
 }else{
  f.options.sdk.computeSecretHash=()=>{throw failure;};const original=f.options.sdk.poseidon2HashWithSeparator;
  f.options.sdk.poseidon2HashWithSeparator=async(...args)=>{entered();await held;return original(...args);};
 }
 const cap=await f.open(),pending=cap.prepare(f.allocation).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
 await started;await new Promise(r=>setImmediate(r));assert.equal(settled,false);release();assert.equal(await pending,failure);assert.equal(f.state.sends,0);await assert.rejects(cap.confirm(),{code:'ROLLING_FUNDING_QUOTE_REQUIRED'});
});
test('parallel quote retains final canonical block and wallet guards after independent work',async()=>{
 for(const change of ['canonical','wallet']){
  const f=ethTopupFixture(),getBlock=f.options.provider.getBlock,fees=f.options.provider.getFeeData;let changed=false;
  f.options.provider.getFeeData=async()=>{changed=true;if(change==='wallet')f.state.invalid=true;return fees();};
  f.options.provider.getBlock=async tag=>{const block=await getBlock(tag);return changed&&change==='canonical'&&typeof tag==='number'?{...block,hash:h(999)}:block;};
  await assert.rejects((await f.open()).prepare(f.allocation));assert.equal(f.state.sends,0);
 }
});

for(const kind of ['aggregate','private-fee','bok'])test(`included ${kind} claim retains authenticated custody and permits a successor payment without checkpoint`,async()=>{
 const f=kind==='aggregate'?fixture():topupFixture(kind);f.state.allowance=1000n;let workflow,canonical=true,verified=0;
 const slots=[],createSlot=f.options.sdk.createEncryptedJournalSlot;f.options.sdk.createEncryptedJournalSlot=async options=>{const slot=await createSlot(options);slots.push(slot);return slot;};
 f.options.reconcileClaim=id=>workflow.open().reconcile(id);
 f.options.verifyClaim=async txHash=>{verified++;return verifyRollingTopupClaim({sdk:{TxHash:{fromString:value=>value},boundedTransactionRead:fn=>fn(),requireSuccessfulReceipt},node:{getTxReceipt:async()=>({txHash:h(70),status:'proposed',executionResult:'success',blockNumber:3,blockHash:h(60)}),getBlock:async()=>({hash:canonical?h(60):h(61)})},txHash,contextGuard:f.options.contextGuard,confirmationTier:'proposed'});};
 const funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();workflow=durableClaimApplication(f,funding,{proposed:true});
 const result=await advanceAggregateClaim({application:workflow.open(),funding,waits:{claim:async()=>assert.fail('included claim must not wait for checkpoint')}});
 assert.equal(result.state,'included');assert.equal(result.intent.status,'included');assert.equal(workflow.state.sends,1);assert.equal(f.state.sends,1);assert.equal(verified,0,'fresh application reconciliation is the sole completion check');
 const original=await funding.loadAggregate(receipts.receipt.txHash);
 // The completion field must remain stable when the confirmation tier changes.
 // Otherwise an already completed payment is mistaken for a pending workflow.
 const savedRecords=await Promise.all(slots.map(async slot=>({slot,saved:await slot.read()})));
 const completed=savedRecords.find(({saved})=>saved.value?.confirmedClaim);
 assert(completed,'completion is durable under the established field name');
 assert.equal(completed.saved.value.claimCompletion,undefined);
 const value=structuredClone(completed.saved.value);delete value.confirmedClaim.status;
 await completed.slot.write(completed.saved,value);
 if(kind!=='aggregate')assert.equal((await funding.inspect()).completed,true);
 f.options.reconcileClaim=async()=>{throw Error('a later ordinary action has replaced the single workflow');};
 const reopened=await f.open();await reopened.prepare(f.allocation);assert(verified>0,'a later payment independently rechecks the completed claim');assert.deepEqual(await reopened.loadAggregate(receipts.receipt.txHash),original);assert.equal(f.state.sends,1);
 canonical=false;await assert.rejects((await f.open()).prepare(f.allocation),{code:'ROLLING_SESSION_CONFIG'});assert.equal(f.state.sends,1);
});

for(const kind of ['private-fee','bok'])test(`direct ${kind} forwards durable payment submission feedback before receipt completion`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;const cap=await f.open();await cap.prepare(f.allocation);
 let observed=0,release,entered;const held=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve});const receipt=f.options.provider.getTransactionReceipt;
 f.options.provider.getTransactionReceipt=async hash=>{entered();await held;return receipt(hash);};
 let done=false;const pending=cap.confirm({onSubmitted:()=>{observed++;assert.equal(f.state.sends,1);}}).then(value=>{done=true;return value;});
 await started;assert.equal(observed,1);assert.equal(done,false);release();const result=await pending;assert.equal(result.receipt.amount,'300');assert.equal(observed,1);assert.equal(f.state.sends,1);
});


for(const mode of ['success','gas-failure','fee-failure','changed-account'])test('aggregate ETH confirm drains independent gas and fee reads: '+mode,{timeout:5000},async()=>{
 const f=fixture(),app=await f.open();await app.prepare(f.allocation);
 const gates=[Promise.withResolvers(),Promise.withResolvers()],entered=Promise.withResolvers(),error=Error('read failed');let started=0,settled=false,feeCalls=0;
 const run=async i=>{if(++started===2)entered.resolve();await gates[i].promise;return i===0?100n:{maxFeePerGas:2n,maxPriorityFeePerGas:1n};};
 f.options.provider.estimateGas=()=>{const pending=run(0);if(mode==='gas-failure'){gates[0].resolve();throw error;}return pending;};
 f.options.provider.getFeeData=()=>{feeCalls++;if(feeCalls>1)return {maxFeePerGas:2n,maxPriorityFeePerGas:1n};const pending=run(1);if(mode==='fee-failure'){gates[1].resolve();throw error;}return pending;};
 const result=app.confirm().finally(()=>settled=true),observed=mode==='success'?result:assert.rejects(result,mode==='changed-account'?/Context changed/:e=>e===error);
 await entered.promise;assert.equal(started,2);assert.equal(f.state.sends,0);assert.equal((await app.inspect()).paymentSaved,false);
 if(mode==='changed-account')f.state.invalid=true;
 gates[mode==='fee-failure'?1:0].resolve();await new Promise(setImmediate);assert.equal(settled,false,'sibling read still owns the flow');
 gates[0].resolve();gates[1].resolve();await observed;assert.equal(f.state.sends,mode==='success'?1:0);
 if(mode==='success')assert(feeCalls>=2,'fresh final fee validation remains');
});


for(const mode of ['wrong-claim','mismatched-receipt','locked'])test('claim workflow inspection cannot bypass an unrelated or unusable saved workflow: '+mode,async()=>{
 const f=claimProgressFixture();f.input.application.readAccountStatus=()=>assert.fail('must not scan unrelated balances');
 f.input.application.readFundingState=async()=>mode==='locked'?{status:'locked'}:{status:'recovering',intent:{intentId:'other',status:'prepared',action:{type:mode==='wrong-claim'?'claim-bok':'claim-deposit',receipt:{private:'different'}}}};
 await assert.rejects(advanceAggregateClaim(f.input),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});
 assert(!f.calls.includes('prepare'));assert(!f.calls.includes('submit'));
});
test('claim workflow inspection failure drains before continuation and never scans balances',async()=>{
 const f=claimProgressFixture(),entered=Promise.withResolvers(),held=Promise.withResolvers(),error=Error('context changed');let settled=false;
 f.input.application.readAccountStatus=()=>assert.fail('must not scan unrelated balances');
 f.input.application.readFundingState=async()=>{entered.resolve();await held.promise;throw error;};
 const result=advanceAggregateClaim(f.input).finally(()=>settled=true),observed=assert.rejects(result,e=>e===error);
 await entered.promise;assert.equal(settled,false);assert(!f.calls.includes('prepare'));held.resolve();await observed;assert(!f.calls.includes('submit'));
});

test('exact unknown claim remains pending without preparing or sending another claim',async()=>{
 const f=claimProgressFixture(),intent={intentId:'saved',status:'unknown',action:{type:'claim-bok',receipt:{private:'SECRET_RECEIPT'}}};
 f.input.funding.inspect=async()=>({paymentSaved:true,privateFeeCap:'10',claim:null,claimAction:'claim-bok'});
 f.input.application.readFundingState=async()=>({status:'recovering',intent});
 assert.deepEqual(await advanceAggregateClaim(f.input),{state:'pending',intent});assert(!f.calls.includes('prepare'));assert(!f.calls.includes('submit'));
});


for(const mode of ['no-bok','unexpected-bok','missing-bok','changed-bok','missing-fee'])test('current aggregate claim relinks optional Bok receipt exactly: '+mode,async()=>{
 const f=fixture(),funding=await f.open(),hasBok=['missing-bok','changed-bok'].includes(mode);
 await funding.prepare({...f.allocation,...(hasBok?{}:{bokAmount:'0',bokPoolFee:0})});const receipts=await funding.confirm();
 const workflow=durableClaimApplication(f,funding),first=workflow.open(),prepared=await first.prepare({type:'claim-deposit',...receipts});
 assert.equal((await funding.inspect()).claim,null);
 const app=workflow.open(),application=mode==='no-bok'?app:{...app,readFundingState:async()=>{
  const value=await app.readFundingState(),action=structuredClone(value.intent.action);
  if(mode==='unexpected-bok')action.bokReceipt={...receipts.feeReceipt};
  if(mode==='missing-bok')delete action.bokReceipt;
  if(mode==='changed-bok')action.bokReceipt={...action.bokReceipt,amount:'1'};
  if(mode==='missing-fee')delete action.feeReceipt;
  return {...value,intent:{...value.intent,action}};
 }};
 if(mode==='no-bok'){
  const result=await advanceAggregateClaim({application,funding:await f.open()});assert.equal(result.state,'complete');assert.equal(result.intent.intentId,prepared.intentId);assert.equal(workflow.state.sends,1);
 }else{await assert.rejects(advanceAggregateClaim({application,funding:await f.open()}),{code:'ROLLING_FUNDING_RECOVERY_REQUIRED'});assert.equal(workflow.state.sends,0);}
 assert.equal(f.state.sends,1);
});

for(const mode of ['normal','throw','reject','pending'])test(`aggregate ETH reports durable submission before receipt without awaiting callback: ${mode}`,{timeout:3000},async()=>{
 const f=fixture(),receipt=Promise.withResolvers(),receiptStarted=Promise.withResolvers(),ack=Promise.withResolvers(),read=f.options.provider.getTransactionReceipt;let calls=0;
 f.options.provider.getTransactionReceipt=async(...args)=>{if(f.state.sends){receiptStarted.resolve();await receipt.promise;}return read(...args);};
 const app=await f.open();await app.prepare(f.allocation);let finished=false;
 const work=app.confirm({onSubmitted:(...args)=>{assert.deepEqual(args,[]);calls++;ack.resolve();if(mode==='throw')throw Error('observer');if(mode==='reject')return Promise.reject(Error('observer'));if(mode==='pending')return new Promise(()=>{});}}).then(value=>{finished=true;return value;});
 await ack.promise;await receiptStarted.promise;assert.equal(calls,1);assert.equal(finished,false);assert.equal((await app.inspect()).paymentSaved,true);
 receipt.resolve();const result=await work;assert.equal(result.receipt.txHash,h(20));assert.equal(f.state.sends,1);assert.equal(calls,1);
});
for(const mode of ['hash','no-hash','malformed'])test(`aggregate USDC submission notification requires validated saved relay hash: ${mode}`,{timeout:3000},async()=>{
 const f=usdcWalletFixture(),submit=f.options.relay.submit,slots=[],create=f.options.sdk.createEncryptedJournalSlot;let calls=0,checked;
 f.options.sdk.createEncryptedJournalSlot=async options=>{const value=await create(options);slots.push(value);return value;};
 f.options.relay.submit=async data=>{const state=await submit(data);if(mode==='no-hash')delete state.transactionHash;if(mode==='malformed')state.transactionHash='invalid';return state;};
 const app=await f.open();await app.prepare(f.allocation);
 const work=app.confirm({onSubmitted:(...args)=>{assert.deepEqual(args,[]);calls++;checked=slots[0].read().then(saved=>assert.equal(saved.value.relay.transactionHash,h(200)));}});
 if(mode==='malformed')await assert.rejects(work,{code:'ROLLING_FUNDING_RELAY_SCOPE'});else assert.equal((await work).pending,true);
 if(checked)await checked;assert.equal(calls,mode==='hash'?1:0);assert.equal(f.state.posts,1);
});

for(const mode of ['success','wrong-request','wrong-block','context-change'])test(`USDC reconciliation captures one exact transaction and preserves fresh authority: ${mode}`,async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();
 let txReads=0,receiptReads=0,codeReads=0,blockReads=0;const getTx=f.options.provider.getTransaction,getReceipt=f.options.provider.getTransactionReceipt,getBlock=f.options.provider.getBlock,getCode=f.options.provider.getCode;
 if(mode==='wrong-request')f.state.usdcTx.data='0x1234';
 f.options.provider.getTransaction=async hash=>{txReads++;return getTx(hash);};
 f.options.provider.getTransactionReceipt=async hash=>{receiptReads++;if(mode==='context-change')f.state.invalid=true;return getReceipt(hash);};
 f.options.provider.getBlock=async number=>{blockReads++;const block=await getBlock(number);return mode==='wrong-block'?{...block,hash:h(999)}:block;};
 f.options.provider.getCode=async(...args)=>{codeReads++;return getCode(...args);};
 if(mode==='success'){
  await app.recover();assert.equal(codeReads,1);assert.equal(blockReads,2);assert.equal(receiptReads,1);assert.equal(txReads,1);
  await app.recover();assert.equal(txReads,2,'No reuse across separate recovery operations');
 }else await assert.rejects(app.recover());
 assert.equal(txReads,mode==='success'?2:1);assert.equal(f.state.posts,1);assert.equal(f.state.sends,0);
});
test('USDC immutable transaction snapshot is detached before the receipt await',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);await app.confirm();const receipt=f.options.provider.getTransactionReceipt;
 f.options.provider.getTransactionReceipt=async hash=>{f.state.usdcTx.nonce=99;f.state.usdcTx.data='0x1234';return receipt(hash);};
 const result=await app.recover();assert.equal(result.receipt.nonce,'42');assert.equal(f.state.posts,1);
});
test('USDC confirmation retains all five fresh state boundaries and exact signed simulation',async()=>{
 const f=usdcWalletFixture(),app=await f.open();await app.prepare(f.allocation);const send=f.options.provider.send,calls=[];
 f.options.provider.send=async(method,params)=>{calls.push({method,params,signatures:f.state.signatures});return send(method,params);};
 await app.confirm();
 assert.deepEqual(calls.filter(x=>x.method==='eth_chainId').map(x=>x.signatures),[0,1,2,2,2]);
 for(const tag of ['0x10','pending'])assert.equal(calls.filter(x=>x.method==='eth_getBlockByNumber'&&x.params[0]===tag).length,5);
 const simulations=calls.filter(x=>x.method==='eth_call'&&x.params[1]==='pending');assert.equal(simulations.length,1);assert.equal(simulations[0].signatures,2);
 assert.equal(simulations[0].params[0].data,f.state.usdcTx.data);assert.equal(f.state.posts,1);
});

for(const kind of ['private-fee','bok'])for(const phase of ['approval','deposit'])test(`terminal reuse: ${kind} ${phase} projects only its successful current send without recovery`,async()=>{
 const f=topupFixture(kind);if(phase==='deposit')f.state.allowance=1000n;
 let recoveries=0,receiptReads=0,txReads=0;const native=f.options.sdk.createEthereumJournal,receipt=f.options.provider.getTransactionReceipt,transaction=f.options.provider.getTransaction;
 f.options.sdk.createEthereumJournal=async options=>{const j=await native(options);return {...j,recover:async(...args)=>{recoveries++;return j.recover(...args);}};};
 f.options.provider.getTransactionReceipt=async hash=>{receiptReads++;return receipt(hash);};f.options.provider.getTransaction=async hash=>{txReads++;return transaction(hash);};
 const cap=await f.open();await cap.prepare(f.allocation);recoveries=receiptReads=txReads=0;
 const result=await cap.confirm();assert.equal(recoveries,0);assert.equal(receiptReads,1);assert.equal(txReads,1);assert.equal(f.state.sends,1);
 if(phase==='approval')assert.deepEqual(result,{approved:true});else assert.equal(result.receipt.amount,'300');
 await cap.recover();assert.equal(recoveries,1);assert.equal(receiptReads,2);assert.equal(txReads,2);
});
for(const change of ['request','outcome','canonical','owner','custody'])test(`terminal reuse: ${change} change after authenticated send prevents effect projection`,async()=>{
 const f=topupFixture();f.state.allowance=1000n;const native=f.options.sdk.createEthereumJournal;
 f.options.sdk.createEthereumJournal=async options=>{const j=await native(options);return {...j,send:async(...args)=>{const result=await j.send(...args);
  if(change==='request')result.request={...result.request,nonce:result.request.nonce+1};
  if(change==='outcome')result.outcome='reverted';
  if(change==='canonical'){const block=f.options.provider.getBlock;f.options.provider.getBlock=async n=>({...await block(n),hash:h(999)});}
  if(change==='owner')f.state.invalid=true;
  if(change==='custody'){for(const key of f.records.keys())f.records.set(key,'changed ciphertext');}
  return result;
 }};};
 const cap=await f.open();await cap.prepare(f.allocation);await assert.rejects(cap.confirm());assert.equal(f.state.sends,1);
});
test('terminal reuse: final canonical read stays held before returning deposit receipt',async()=>{
 const f=topupFixture();f.state.allowance=1000n;const native=f.options.sdk.createEthereumJournal,held=Promise.withResolvers(),entered=Promise.withResolvers();
 f.options.sdk.createEthereumJournal=async options=>{const j=await native(options);return {...j,send:async(...args)=>{const result=await j.send(...args),block=f.options.provider.getBlock;f.options.provider.getBlock=async n=>{entered.resolve();await held.promise;return block(n);};return result;}};};
 const cap=await f.open();await cap.prepare(f.allocation);let done=false;const work=cap.confirm().finally(()=>{done=true;});await entered.promise;assert.equal(done,false);held.resolve();assert.equal((await work).receipt.amount,'300');
});

for(const kind of ['private-fee','bok'])test(`direct ${kind} completion binds the exact receipt and holds custody through final reconciliation`,async()=>{
 const f=topupFixture(kind);f.state.allowance=1000n;let workflow,hold=false;const gate=Promise.withResolvers(),entered=Promise.withResolvers();
 f.options.reconcileClaim=async id=>{if(hold){entered.resolve();await gate.promise;}return workflow.open().reconcile(id);};
 const funding=await f.open();await funding.prepare(f.allocation);const receipts=await funding.confirm();workflow=durableClaimApplication(f,funding,{proposed:true});
 const app=workflow.open(),prepared=await app.prepare({type:kind==='bok'?'claim-bok':'claim-private-fee',...receipts});await funding.checkpointClaim({intentId:prepared.intentId,attempted:true});const done=await app.submitPrepared(prepared.intentId);
 await assert.rejects(funding.recordClaimCompletion({...done,action:{...done.action,receipt:{...done.action.receipt,amount:'999'}}}),{code:'ROLLING_FUNDING_MISMATCH'});assert.equal((await funding.inspect()).completed,false);
 hold=true;const pending=funding.recordClaimCompletion(done);await entered.promise;assert.equal((await funding.inspect()).completed,false);
 workflow.state.outcome={...workflow.state.outcome,outcome:'reverted'};const rejected=assert.rejects(pending,{code:'ROLLING_FUNDING_MISMATCH'});gate.resolve();await rejected;assert.equal((await funding.inspect()).completed,false);
});
