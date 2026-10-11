// Labelled SDK/PXE doubles for lifecycle boundaries. Uses actual processed board
// ABI, argument encoding, production application, encrypted journal and file CAS.
// No service, proof, real signature, funding or chain acceptance is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {loadContractArtifact,encodeArguments} from '@aztec-labs/stdlib/abi';
import {Tx} from '@aztec-labs/stdlib/tx';
import {SchnorrInitializerlessAccountContract} from '@aztec-labs/accounts/schnorr';
import {createL2Journal} from '../../shared/l2-journal.mjs';
import {createRollingApplicationActor} from './rolling-application-actor.mjs';
const artifact=loadContractArtifact(JSON.parse(await fs.readFile(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url),'utf8')));
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>AztecAddress.fromBigIntUnsafe(BigInt(n));
async function fixture(t,options={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-actor-unit-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const owner=address(options.owner??4),node={},state={calls:[],stops:0,closes:0,proofJobs:0,transportSends:0,fail:null,contract:null};
 const step=async label=>{state.calls.push(label);if(state.hook)await state.hook(label);if(state.fail===label)throw state.error;};
 const store={async close(){state.closes++;await step('close-store');}};
 const pxe={async registerAccount(){await step('register-account');},async registerContractClass(){await step('register-class');},async registerContract(){await step('register-contract');},async sync(){await step('sync');},async stop(){state.stops++;await step('stop');await store.close();}};
 const accountArtifact={functions:[]},account={address:owner,secret:new Fr(7),salt:Fr.ZERO,signingKey:new Fr(8)};
 class SyntheticAccountContract{
  constructor(){state.contract=this;this.provider={createAuthWit(...args){assert.equal(this,state.contract.provider);state.authArgs=args;if(state.authError)throw state.authError;return state.authResult;}};}
  getAuthWitnessProvider(...args){assert.equal(this,state.contract);state.providerArgs=args;return this.provider;}
  async getContractArtifact(){return accountArtifact;}async getImmutablesHash(){return undefined;}
  async getSigningPublicKey(){await step('signing-key');return {x:Fr.ONE,y:Fr.ONE};}
 }
 const wallet={pxe,aztecNode:node,async getAccounts(){return [owner];},async getChainInfo(){return {chainId:31337,version:1};},
  sendTx(...args){assert.equal(this,wallet);state.sendArgs=args;if(state.sendError)throw state.sendError;return state.sendResult;}};
 const routing={createAztecWallet(_sdk,p,n,raw,_log,secret,opts){assert.equal(p,pxe);assert.equal(n,node);assert.equal(raw,node);wallet._transactionJournal=opts.transactionJournal;return wallet;},isPrivateWalletForNode:(w,n)=>!state.wrongWallet&&w===wallet&&n===node};
 const sdk={Fr,AztecAddress,Tx,encodeArguments,createL2Journal,SchnorrInitializerlessAccountContract:SyntheticAccountContract,
  isTrustedPrivateNode:n=>!state.wrongNode&&n===node,isPrivatePXEForNode:(p,n)=>!state.wrongPXE&&p===pxe&&n===node,
  async inspectTrustedNode(n,c){assert.equal(n,node);assert.equal(c.proofsEnabled,true);await step('inspect');},
  async openPXEStore(config){state.storeConfig=config;await step('open-store');return store;},
  async createPXE(n,c,o){assert.equal(n,node);assert.equal(o.store,store);assert.deepEqual(c,{proverEnabled:true,autoSync:false,syncChainTip:'checkpointed'});state.remote=o.remoteProver;await step('create-pxe');return pxe;},
  deriveKeys:async()=>({publicKeys:{}}),getContractInstanceFromInstantiationParams:async()=>({address:owner}),computePartialAddress:async()=>Fr.ONE,
  AccountManager:{async create(w,secret,contract){assert.equal(w,wallet);assert.equal(contract,state.contract);await step('account-manager');return {address:owner};}},
  Contract:{at:()=>({methods:{register_name:(...args)=>({args}),get_deposit_ids:()=>({simulate:async()=>({result:options.collateral?[1n,...Array(9).fill(0n)]:Array(10).fill(0n)})})}})},
  preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async()=>({maximumFee:10n,payload:{},gasSettings:{}})};
 const input={sdk,routing,node,endpoint:'http://127.0.0.1:12345',network:{chainId:'31337',version:'1',rollup:'0x'+'1'.repeat(40)},proofsEnabled:true,
  board:{instance:{address:address(2)},artifact},fees:{authorAccount:account,browserFixture:{instance:{address:address(3)},artifact:{functions:[]},gas:{}}},
  portal:'0x'+'2'.repeat(40),storageDirectory:path.join(directory,'journals'),dataDirectory:directory,
  externalActivity:()=>({proofJobs:state.proofJobs,transportSends:state.transportSends})};
 return {input,state,account,wallet,pxe,store,directory};
}
test('installed account shape supplies synchronous provider shared by account and entrypoint',()=>{
 const contract=new SchnorrInitializerlessAccountContract(new Fr(8));
 const provider=contract.getAuthWitnessProvider(address(4));assert.equal(typeof provider.createAuthWit,'function');
 const account=contract.getAccount({address:address(4)});assert.equal(account.authWitnessProvider,account.entrypoint.auth);
});
test('separate actors use separate stores and actual application status without inventing collateral',async t=>{
 const a=await fixture(t,{collateral:true}),b=await fixture(t,{owner:5});let x,y;
 try{x=await createRollingApplicationActor(a.input);y=await createRollingApplicationActor(b.input);
  assert.notEqual(x.pxe,y.pxe);assert.notEqual(x.journal,y.journal);
  assert.equal((await x.application.readAccountStatus()).status,'fee-ready');assert.equal((await y.application.readAccountStatus()).status,'collateral-pending');
  assert.equal(a.state.storeConfig.accountAddress,String(x.owner));assert.equal(b.state.storeConfig.accountAddress,String(y.owner));
  assert.throws(()=>JSON.stringify(x));await x.close();assert.equal(b.state.stops,0);
  assert.equal((await y.application.readAccountStatus()).privateFeeCredit,'100');
 }finally{await x?.close();await y?.close();}assert.equal(a.state.stops,1);assert.equal(b.state.stops,1);
});
test('auth and wallet counters preserve receiver, arguments, promise identity and original errors',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input);try{
  f.state.authResult=Promise.resolve('synthetic witness');f.state.sendResult=Promise.resolve('synthetic submission');
  const provider=f.state.contract.getAuthWitnessProvider('address');assert.equal(f.state.contract.getAuthWitnessProvider('again'),provider);
  assert.equal(provider.createAuthWit('hash'),f.state.authResult);assert.deepEqual(f.state.authArgs,['hash']);
  assert.equal(actor.wallet.sendTx('payload','options'),f.state.sendResult);assert.deepEqual(f.state.sendArgs,['payload','options']);
  const original=Error('synthetic failure');f.state.authError=original;f.state.sendError=original;
  assert.throws(()=>provider.createAuthWit('hash'),e=>e===original);assert.throws(()=>actor.wallet.sendTx('payload'),e=>e===original);
  f.state.proofJobs=3;f.state.transportSends=2;assert.deepEqual(actor.activity(),{authWitnesses:2,proofJobs:3,walletSubmissions:2,transportSends:2});
 }finally{await actor.close();}
});
test('actual encrypted workflow survives journal reopen without proof or resend and wallet journal follows replacement',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input);try{
  const intent=await actor.application.prepare({type:'name',first:'River',last:'Stone'}),before=actor.activity(),old=actor.journal;
  const bytes=(await Promise.all((await fs.readdir(f.input.storageDirectory)).map(n=>fs.readFile(path.join(f.input.storageDirectory,n),'utf8')))).join('');assert(!bytes.includes('River'));
  const syncs=f.state.calls.filter(c=>c==='sync').length;await actor.reopenJournal();assert.notEqual(actor.journal,old);assert.equal(actor.wallet._transactionJournal,actor.journal);
  assert.equal(f.state.calls.filter(c=>c==='sync').length,syncs);assert.deepEqual(actor.activity(),before);
  assert.deepEqual(await actor.application.reconcile(intent.intentId),intent);await actor.application.cancelPrepared(intent.intentId);
 }finally{await actor.close();}
});
for(const failure of ['create-pxe','register-account','register-class','register-contract','sync','account-manager','signing-key'])test('partial initialization cleans only owned resources: '+failure,async t=>{
 const f=await fixture(t);f.state.fail=failure;f.state.error=Error('original');await assert.rejects(createRollingApplicationActor(f.input),e=>e===f.state.error);
 assert.equal(f.state.stops,failure==='create-pxe'?0:1);assert.equal(f.state.closes,1);
 f.state.fail=null;const actor=await createRollingApplicationActor(f.input);await actor.close();
});
test('initialization preserves original failure and cleanup failure',async t=>{
 const f=await fixture(t),original=Error('init'),cleanup=Error('cleanup');f.state.hook=label=>{if(label==='register-account')throw original;if(label==='stop')throw cleanup;};
 await assert.rejects(createRollingApplicationActor(f.input),e=>e instanceof AggregateError&&e.errors[0]===original&&e.errors[1]===cleanup);assert.equal(f.state.closes,1);
});
test('account replacement during store acquisition prevents PXE creation and closes store',async t=>{
 const f=await fixture(t);f.state.hook=label=>{if(label==='open-store')f.account.secret=new Fr(99);};await assert.rejects(createRollingApplicationActor(f.input),{code:'ROLLING_ACTOR_CONTEXT'});
 assert(!f.state.calls.includes('create-pxe'));assert.equal(f.state.closes,1);
});
test('duplicate store ownership fails before a second private allocation',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input);try{const n=f.state.calls.length;await assert.rejects(createRollingApplicationActor(f.input));assert.equal(f.state.calls.length,n);}finally{await actor.close();}
});
test('close immediately locks context, waits active sync and closes resources exactly once',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input);let release,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 f.state.hook=async label=>{if(label==='sync'){entered();await wait;}};
 const reading=actor.application.readAccountStatus();await started;const closing=actor.close();assert.equal(actor.close(),closing);assert.throws(actor.contextGuard);
 release();await assert.rejects(reading,{code:'ROLLING_ACTOR_CONTEXT'});await closing;assert.equal(f.state.stops,1);assert.equal(f.state.closes,1);
 await assert.rejects(actor.application.readAccountStatus(),{code:'ROLLING_ACTOR_CONTEXT'});await assert.rejects(actor.reopenJournal(),{code:'ROLLING_ACTOR_CONTEXT'});
});
test('external activity rejects unsafe or decreasing counters',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input);try{f.state.proofJobs=2;actor.activity();f.state.proofJobs=1;assert.throws(actor.activity);f.state.proofJobs=Number.MAX_SAFE_INTEGER+1;assert.throws(actor.activity);}finally{await actor.close();}
});
for(const fault of ['wrongNode','wrongPXE','wrongWallet'])test('rejects untrusted actor routing: '+fault,async t=>{
 const f=await fixture(t);f.state[fault]=true;await assert.rejects(createRollingApplicationActor(f.input));
 if(fault==='wrongNode')assert.equal(f.state.calls.length,0);else{assert.equal(f.state.stops,1);assert.equal(f.state.closes,1);}
});
test('closed actor cannot sign or submit through retained raw handle',async t=>{
 const f=await fixture(t),actor=await createRollingApplicationActor(f.input),provider=f.state.contract.getAuthWitnessProvider();await actor.close();
 assert.throws(()=>provider.createAuthWit('hash'),{code:'ROLLING_ACTOR_CONTEXT'});assert.throws(()=>actor.wallet.sendTx('payload'),{code:'ROLLING_ACTOR_CONTEXT'});
 assert.deepEqual(actor.activity(),{authWitnesses:0,proofJobs:0,walletSubmissions:0,transportSends:0});
});
