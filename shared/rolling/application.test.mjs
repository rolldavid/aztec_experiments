// Development fakes: no proving, network, funding or real transaction acceptance.
// Real pinned ABI encoding and encrypted CAS journal are exercised below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {after} from 'node:test';
import {nameRegistration,NAME_DOMAIN} from './name-policy.mjs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {encodeArguments,loadContractArtifact,decodeFromAbi,getFunctionReturnType} from '@aztec-labs/stdlib/abi';
import {createL2Journal} from '../l2-journal.mjs';
import {Tx} from '@aztec-labs/stdlib/tx';
import {BaseWallet} from '@aztec-labs/wallet-sdk/base-wallet';
import {FIELD_MODULUS} from './invocation.mjs';
import {createRollingApplication} from './application.mjs';
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
// REQUIRED: run only after normal profile-protocol build/processing. Never invent
// or patch an ABI to make these cases pass against an older application artifact.
const ownedRecordAbi=artifact.functions.find(f=>f.name==='owned_name_records');
const displayPack=value=>{const bytes=new TextEncoder().encode(value),words=[0n,0n];for(let i=0;i<bytes.length;i++)words[Math.floor(i/31)]|=BigInt(bytes[i])<<BigInt(8*(30-i%31));return words;};
async function ownershipPage(names=[['Jane','Smith']]){
 assert(ownedRecordAbi,'Normal processed profile ABI required');const fields=[];
 for(let i=0;i<8;i++){
  if(i>=names.length){fields.push(...Array(8).fill(0n));continue;}
  const [first,last]=names[i],registration=nameRegistration(first,last),id=await poseidon2HashWithSeparator(registration.preimage.map(n=>new Fr(n)),NAME_DOMAIN);
  fields.push(id.toBigInt(),1n,BigInt(first.length),...displayPack(first),BigInt(last.length),...displayPack(last));
 }
 return decodeFromAbi(getFunctionReturnType(ownedRecordAbi),fields.map(n=>new Fr(n)));
}
after(async()=>{await BarretenbergSync.destroySingleton();});

function fixture(){
  const state={calls:[],sends:0,fee:10n,outcome:null,privateReads:[],failSend:false,failCAS:false,guard:true,policy:1,estimates:0};
  const values=new Map();const privateStore={read:async k=>values.get(k)??null,compareAndSwap:async(k,old,next)=>{
    if(state.failCAS||values.get(k)!==old&&!(old===null&&!values.has(k)))throw Error('CAS conflict');values.set(k,next);
  }};
  const board={methods:new Proxy({},{get:(_,name)=>(...args)=>({name,args,simulate:async()=>{
    state.privateReads.push({name,args});
    if(name==='preference_head'&&state.preferenceHeadError)throw state.preferenceHeadError;
    if(name==='preference_head'&&state.beforePreferenceHead)await state.beforePreferenceHead();
    if(name==='effective_policy'&&state.policyReadError)throw state.policyReadError;
    if(name==='get_screen_hints'&&state.hintsReadError)throw state.hintsReadError;
    const replies={preference_head:('preferenceHead' in state)?state.preferenceHead:decodeFromAbi(getFunctionReturnType(artifact.functions.find(f=>f.name==='preference_head')),[Fr.ZERO,new Fr(1n),Fr.ZERO,Fr.ZERO]),profile_state:state.profileState??decodeFromAbi(getFunctionReturnType([...artifact.functions,...artifact.nonDispatchPublicFunctions].find(f=>f.name==='profile_state')),Array.from({length:8},()=>Fr.ZERO)),owned_name_records:('records' in state)?state.records:await ownershipPage(),get_deposit_ids:[9n,0n,0n,0n,0n,0n,0n,0n,0n,0n],
      main_policy:[BigInt(state.policy),1n],effective_policy:('effectivePolicy' in state)?state.effectivePolicy:[BigInt(state.policy),1n,1n,2n,false],get_screen_hints:state.hints??decodeFromAbi(getFunctionReturnType(artifact.functions.find(f=>f.name==='get_screen_hints')),Array.from({length:28},()=>Fr.ZERO))};
    return {result:replies[name]};
  }})})};
  const journal={assertCanStart:async()=>{},inspectOutcome:async()=>state.outcome,inspect:async()=>state.outcome,confirmed:()=>{}};
  const owner=new AztecAddress(new Fr(3n));
  const wallet={getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),sendTx:async(payload,opts)=>{
    state.sends++;state.sent={payload,opts};assert.ok([...values.values()].every(x=>!x.includes('Private Sentinel')));
    assert.equal(opts.transactionJournal,journal);if(state.failSend)throw Error('unknown after send');
    state.outcome={operation:opts.journalOperation,outcome:'success',txHash:hex(77),receipt:{txHash:hex(77),status:'checkpointed',blockNumber:1,blockHash:hex(42),transactionFee:2n}};return {receipt:{}};
  }};
  const node={getBlockData:async height=>({header:{globalVariables:{blockNumber:height}},blockHash:hex(42)})};wallet.aztecNode=node;wallet.pxe={};let random=100n;
  const sdk={poseidon2HashWithSeparator,Fr:class extends Fr {static random(){return new Fr(random++);}},AztecAddress,encodeArguments,Contract:{at:()=>board},isTrustedPrivateNode:n=>n===node,isPrivateWalletForNode:(w,n)=>w===wallet&&n===node,isPrivatePXEForNode:(p,n)=>p===wallet.pxe&&n===node,
    inspectTrustedNode:async()=>{if(!state.guard)throw Error('stale trusted node');},
    preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async input=>{
      await input.guard();state.estimates++;state.calls.push(input.interaction);
      if(['set_preference','mark_thread_read'].includes(input.interaction.name)&&state.preferenceError)throw state.preferenceError;
      if(input.interaction.name==='screen'&&state.screenError)throw state.screenError;
      if(['set_bio','set_avatar'].includes(input.interaction.name)){assert.equal(input.interaction.args[1],state.profileVersion??0,'stale profile version');assert((state.profileVersion??0)<0xffffffff,'profile version exhausted');}
      if(input.interaction.name==='post')assert.equal(input.interaction.args[2].expected_main_policy_version,state.policy,'policy changed');
      return {maximumFee:state.fee,payload:input.interaction,gasSettings:{ceiling:state.fee}};
    }};
  const deployment={board:{address:hex(1),artifact},network:{chainId:'31337',version:'1',rollup:'0x'+'11'.repeat(20)},
    portal:'0x'+'22'.repeat(20),privateFee:{address:hex(2),artifact:{},gasSettings:{}}};
  const accountSession={owner,wallet,node,journal,walletSecret:hex(8),walletSalt:'0'};
  const options={sdk,deployment,accountSession,privateStore,publicReader:new Proxy({},{get(){throw Error('Private access to public reader');}}),contextGuard:async()=>{assert.ok(state.guard);}};
  return {state,values,options,app:createRollingApplication(options),restart:()=>createRollingApplication(options)};
}
test('locked construction does not load or query a wallet',async()=>{
  assert.deepEqual(await createRollingApplication({}).readAccountStatus(),{status:'locked'});
});
test('name preparation is encrypted, real ABI encoded and immutable across mutation/restart',async()=>{
  const f=fixture(),action={type:'name',first:'Private Sentinel',last:'Moss'};
  const prepared=await f.app.prepare(action);action.first='Different';
  assert.equal(f.state.sends,0);assert.ok([...f.values.values()].every(v=>!v.includes('Private Sentinel')));
  const result=await f.restart().submitPrepared(prepared.intentId);
  assert.equal(result.status,'confirmed');assert.equal(f.state.sends,1);assert.equal(f.state.sent.payload.name,'register_name');
  assert.equal(f.state.sent.payload.args[1],16);assert.equal(result.action.first,'Private Sentinel');
  await assert.rejects(f.app.submitPrepared(prepared.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
});
test('all first-slice actions encode against the installed RollingBoard ABI',async()=>{
  const actions=[{type:'subboard',slug:'tiny-board',name:'Tiny',description:'Description',rules:''},
    {type:'post',deposit:'9',content:'héllo'}, {type:'reply',deposit:'9',content:'Reply',parent:'10',root:'11'},
    {type:'quote',deposit:'9',content:'Quote',reference:'10'}, {type:'repost',deposit:'9',content:'',reference:'10'},
    {type:'like',post:'10'},{type:'unlike',post:'10'},{type:'withdraw',deposit:'9'},{type:'screen',deposit:'9'}];
  for(const action of actions){const f=fixture(),p=await f.app.prepare(action);assert.equal(p.status,'prepared');
    assert.equal((await f.app.submitPrepared(p.intentId)).status,'confirmed');}
});
test('unknown send stays fenced across replacement instances; absent receipt never authorizes retry',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});f.state.failSend=true;
  await assert.rejects(f.app.submitPrepared(p.intentId));assert.equal(f.state.sends,1);
  const replacement=f.restart();assert.equal((await replacement.reconcile(p.intentId)).status,'unknown');
  await assert.rejects(replacement.submitPrepared(p.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
  await assert.rejects(replacement.prepare({type:'unlike',post:'5'}),{code:'ROLLING_RECOVERY_REQUIRED'});
  assert.equal(f.state.sends,1);assert.equal((await replacement.readAccountStatus()).status,'recovering');
});
test('durable fence failure prevents send; successfully saved pre-send fence cannot be retried',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});f.state.failCAS=true;
  await assert.rejects(f.app.submitPrepared(p.intentId),{code:'BB_JOURNAL_INVALID'});assert.equal(f.state.sends,0);
  f.state.failCAS=false;
  const original=f.options.contextGuard;let guards=0;
  f.options.contextGuard=async()=>{await original();if(++guards===4)throw Error('locked after fence');};
  await assert.rejects(f.restart().submitPrepared(p.intentId));assert.equal(f.state.sends,0);
  assert.equal((await f.app.reconcile(p.intentId)).status,'unknown');
});
test('saved fee ceiling and saved policy cannot be silently changed on submission',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'post',deposit:'9',content:'Hi'});
  f.state.fee=11n;await assert.rejects(f.app.submitPrepared(p.intentId),{code:'ROLLING_FEE_CHANGED'});assert.equal(f.state.sends,0);
  f.state.fee=10n;f.state.policy=2;await assert.rejects(f.app.submitPrepared(p.intentId),/policy changed/);assert.equal(f.state.sends,0);
});
test('rejects arbitrary calls, fabricated Bok flow and oversized content without truncating',async()=>{
  for(const action of [{type:'call',method:'withdraw'}, {type:'bok',budget:'10'}, {type:'like',post:'5',from:hex(99)},
    {type:'post',deposit:'9',content:'😀'.repeat(249)}, {type:'reply',deposit:'9',content:'Hi',parent:'10'},
    {type:'subboard',slug:'bad--slug',name:'Hi',description:'Hi',rules:''}]){
    const f=fixture();await assert.rejects(f.app.prepare(action));assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
  }
});
test('private ownership and status reads never invoke publicReader, and do not overclaim eligibility',async()=>{
  const f=fixture(),id=hex((await ownershipPage())[0].name_id);assert.deepEqual(await f.app.ownedIdentities({cursor:8}),{identities:[id],records:[{id,first:'Jane',last:'Smith'}],nextCursor:null});
  assert.equal(f.state.privateReads[0].name,'owned_name_records');
  assert.equal(f.state.privateReads[0].args[1],8);
  const status=await f.app.readAccountStatus();assert.equal(status.status,'fee-ready');assert.equal(status.postEligibility,'requires-action-simulation');
  f.state.guard=false;await assert.rejects(f.app.ownedIdentities());await assert.rejects(f.app.readAccountStatus());
});
test('reconcile uses exact operation identity and preserves reverted outcomes',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});f.state.failSend=true;await assert.rejects(f.app.submitPrepared(p.intentId));
  f.state.outcome={operation:'different',outcome:'success',txHash:hex(88)};assert.equal((await f.app.reconcile(p.intentId)).status,'unknown');
  f.state.outcome={operation:`ROLLING_WORKFLOW_V1:${p.intentId}`,outcome:'reverted',txHash:hex(77),receipt:{txHash:hex(77)}};
  assert.equal((await f.app.reconcile(p.intentId)).status,'reverted');assert.equal(f.state.sends,1);
});
test('CAS excludes concurrent writers from sending the same prepared intent twice',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});
  const results=await Promise.allSettled([f.app.submitPrepared(p.intentId),f.restart().submitPrepared(p.intentId)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state.sends,1);
});

test('cancellation only before send, including cancellation/submission CAS race',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});
  assert.equal((await f.app.cancelPrepared(p.intentId)).status,'cancelled');
  await assert.rejects(f.app.submitPrepared(p.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
  const next=await f.app.prepare({type:'unlike',post:'5'});
  const results=await Promise.allSettled([f.app.cancelPrepared(next.intentId),f.restart().submitPrepared(next.intentId)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.ok(f.state.sends<=1);
  if(f.state.sends)await assert.rejects(f.app.cancelPrepared(next.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
  const u=fixture(),q=await u.app.prepare({type:'like',post:'5'});u.state.failSend=true;
  await assert.rejects(u.app.submitPrepared(q.intentId));
  await assert.rejects(u.restart().cancelPrepared(q.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
});
test('live private screening hint round-trips through encrypted store and actual ABI',async()=>{
  const f=fixture();f.state.hints=[{note:{schema_version:1,deposit_chain_id:9n,sequence:1n,post_id:8n,anchor_timestamp:100n,previous_link:3n,is_dummy:false},
    contract_address:new AztecAddress(new Fr(1n)),owner:f.options.accountSession.owner,randomness:20n,storage_slot:21n,
    metadata:{stage:1,maybe_note_nonce:22n}},null];
  const p=await f.app.prepare({type:'post',deposit:'9',content:'next'});
  assert.equal((await f.restart().submitPrepared(p.intentId)).status,'confirmed');
  assert.equal(f.state.sent.payload.args[3].note.sequence,hex(1));
});
test('canonical receipt lost after a reported success returns recovering; changed deployment fails closed',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});await f.app.submitPrepared(p.intentId);
  f.state.outcome=null;assert.equal((await f.app.readAccountStatus()).status,'recovering');
  await assert.rejects(f.app.prepare({type:'unlike',post:'5'}),{code:'ROLLING_RECOVERY_REQUIRED'});
  f.options.deployment.network.version='2';await assert.rejects(f.app.ownedIdentities(),{code:'ROLLING_CONTEXT_CHANGED'});
});

test('wrong wallet node fails before any personalized wallet/utility call',async()=>{
  const f=fixture();f.options.accountSession.wallet.aztecNode={};
  f.options.accountSession.wallet.getChainInfo=()=>{assert.fail('must not query mismatched wallet');};
  f.options.accountSession.wallet.getAccounts=()=>{assert.fail('must not query mismatched wallet');};
  for(const action of [()=>f.app.readAccountStatus(),()=>f.app.ownedIdentities(),()=>f.app.prepare({type:'like',post:'5'})]){
    await assert.rejects(action(),{code:'ROLLING_CONTEXT_CHANGED'});
  }
  assert.equal(f.state.privateReads.length,0);assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);
});

class JournalTx {
  constructor(hash){this.hash=hash;}
  getTxHash(){return {toString:()=>this.hash};}
  toBuffer(){return Buffer.from(this.hash);}
  static fromBuffer(buffer){return new JournalTx(buffer.toString());}
}
async function realJournalFixture(){
  const f=fixture(),receipts=new Map();let sequence=700;
  const node=f.options.accountSession.node;
  node.getTxReceipt=async hash=>receipts.get(hash.toString());
  node.getBlock=async()=>({hash:{toString:()=>hex(42)}});
  const scope={account:hex(3),chainId:'31337',version:'1',rollup:'0x'+'11'.repeat(20),board:hex(1),portal:'0x'+'22'.repeat(20)};
  const newJournal=()=>createL2Journal({storage:f.options.privateStore,walletSecret:hex(8),walletSalt:'0',scope,Tx:JournalTx,node,waitOptions:{timeoutMs:1000,intervalMs:1}});
  f.options.accountSession.journal=await newJournal();
  async function install(operation,status='checkpointed',result='success'){
    const journal=f.options.accountSession.journal,previous=await journal.assertCanStart();
    const tx=new JournalTx(hex(sequence++));journal.setOperation(operation);await journal.prepare(tx,previous);
    const receipt={txHash:tx.getTxHash(),status,executionResult:result,blockNumber:1,blockHash:{toString:()=>hex(42)}};
    receipts.set(tx.hash,receipt);return receipt;
  }
  f.options.accountSession.wallet.sendTx=async(_,opts)=>{
    f.state.sends++;const receipt=await install(opts.journalOperation);opts.transactionJournal.confirmed(receipt);return {receipt};
  };
  f.app=f.restart();
  return {...f,receipts,install,restartJournal:async()=>{f.options.accountSession.journal=await newJournal();return f.restart();}};
}
test('actual encrypted L2 journal and workflow coexist; restart acknowledges only canonical predecessor',async()=>{
  const f=await realJournalFixture(),first=await f.app.prepare({type:'like',post:'5'});
  await f.app.submitPrepared(first.intentId);assert.equal(f.values.size,2,'distinct authenticated ciphertext slots');
  let replacement=await f.restartJournal();
  assert.equal((await replacement.reconcile(first.intentId)).status,'confirmed');
  const second=await replacement.prepare({type:'unlike',post:'5'});
  replacement=await f.restartJournal(); // prepared next action survives another loss of in-memory acknowledgement
  assert.equal((await replacement.submitPrepared(second.intentId)).status,'confirmed');assert.equal(f.state.sends,2);
});
test('actual journal pending transaction arriving after prepare blocks before private simulation',async()=>{
  const f=await realJournalFixture(),p=await f.app.prepare({type:'like',post:'5'});
  await f.install('OTHER_OPERATION','pending');const estimates=f.state.estimates;
  await assert.rejects(f.app.submitPrepared(p.intentId),{code:'BB_RECOVERY_REQUIRED'});
  assert.equal(f.state.estimates,estimates);assert.equal(f.state.sends,0);
});
test('actual restarted reverted journal still requires finality, and reorg prevents acknowledgement',async()=>{
  const f=await realJournalFixture(),p=await f.app.prepare({type:'like',post:'5'});
  f.options.accountSession.wallet.sendTx=async(_,opts)=>{await f.install(opts.journalOperation,'checkpointed','reverted');throw Error('reverted');};
  await assert.rejects(f.app.submitPrepared(p.intentId));let replacement=await f.restartJournal();
  assert.equal((await replacement.reconcile(p.intentId)).status,'reverted');
  await assert.rejects(replacement.prepare({type:'unlike',post:'5'}),{code:'BB_TRANSACTION_FINALITY_PENDING'});
  const receipt=[...f.receipts.values()][0];receipt.status='finalized';
  replacement=await f.restartJournal();assert.equal((await replacement.prepare({type:'unlike',post:'5'})).status,'prepared');
  const g=await realJournalFixture(),q=await g.app.prepare({type:'like',post:'5'});await g.app.submitPrepared(q.intentId);
  g.options.accountSession.node.getBlock=async()=>({hash:{toString:()=>hex(999)}});
  await assert.rejects((await g.restartJournal()).reconcile(q.intentId),{code:'BB_SUBMISSION_UNKNOWN'});
});
test('missing factory PXE provenance rejects before private wallet calls',async()=>{
  const f=fixture();f.options.sdk.isPrivatePXEForNode=()=>false;
  f.options.accountSession.wallet.getChainInfo=()=>assert.fail('private call before provenance');
  await assert.rejects(f.app.readAccountStatus(),{code:'ROLLING_CONTEXT_CHANGED'});
});

test('unverified captured wallet submission route is rejected before personalized calls',async()=>{
  const f=fixture();f.options.sdk.isPrivateWalletForNode=()=>false;
  f.options.accountSession.wallet.getChainInfo=()=>assert.fail('private call before raw submission provenance');
  await assert.rejects(f.app.prepare({type:'like',post:'5'}),{code:'ROLLING_CONTEXT_CHANGED'});
  assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);
});
test('newly acknowledged but non-final reverted transaction blocks pre-estimation too',async()=>{
  const f=await realJournalFixture(),p=await f.app.prepare({type:'like',post:'5'});
  const receipt=await f.install('OTHER_OPERATION','checkpointed','reverted');f.options.accountSession.journal.confirmed(receipt);
  const estimates=f.state.estimates;
  await assert.rejects(f.app.submitPrepared(p.intentId),{code:'BB_TRANSACTION_FINALITY_PENDING'});
  assert.equal(f.state.estimates,estimates);assert.equal(f.state.sends,0);
});

// Actual SDK chain conversion, with only getNodeInfo replaced by a local value source.
test('installed BaseWallet field-valued chain identity passes strict application binding',async()=>{
  const f=fixture();let chainId=31337,rollupVersion=1;
  let installed=new BaseWallet({}, {getNodeInfo:async()=>({l1ChainId:chainId,rollupVersion})});
  f.options.accountSession.wallet.getChainInfo=()=>installed.getChainInfo();
  assert.ok((await installed.getChainInfo()).chainId instanceof Fr);
  assert.equal((await f.app.readAccountStatus()).status,'fee-ready');
  for(const change of [()=>{chainId=31338;},()=>{chainId=31337;rollupVersion=2;}]){
    change();installed=new BaseWallet({}, {getNodeInfo:async()=>({l1ChainId:chainId,rollupVersion})});
    const reads=f.state.privateReads.length;
    await assert.rejects(f.app.readAccountStatus(),{code:'ROLLING_CONTEXT_CHANGED'});
    assert.equal(f.state.privateReads.length,reads);assert.equal(f.state.sends,0);
  }
});
test('chain binding rejects malformed, missing and out-of-field identities before private reads',async()=>{
  for(const value of [undefined,null,true,-1,1.5,Number.MAX_SAFE_INTEGER+1,' 31337','031337','0x7a69',FIELD_MODULUS,{},
    {toBigInt:()=>FIELD_MODULUS},{toBigInt:()=>{throw Error('private detail');}}]){
    for(const key of ['chainId','version']){
      const f=fixture();f.options.accountSession.wallet.getChainInfo=async()=>({...{chainId:31337,version:1},[key]:value});
      await assert.rejects(f.app.readAccountStatus(),{code:'ROLLING_CONTEXT_CHANGED',message:'ROLLING_CONTEXT_CHANGED'});
      assert.equal(f.state.privateReads.length,0);assert.equal(f.state.sends,0);
    }
  }
});

// These fixtures use the installed decoder, not a hand-written null substitute.
test('actual SDK Option None and Some preserve post ABI bytes across encrypted reopen',async()=>{
 const hintsType=getFunctionReturnType(artifact.functions.find(f=>f.name==='get_screen_hints'));
 const post=artifact.functions.find(f=>f.name==='post');
 const hintAbi={...post,parameters:post.parameters.slice(-2)};
 for(const some of [false,true]){
  const fields=Array.from({length:28},()=>Fr.ZERO);
  if(some){fields[0]=new Fr(1n);fields[1]=new Fr(1n);fields[2]=new Fr(9n);fields[3]=new Fr(1n);fields[4]=new Fr(8n);fields[5]=new Fr(100n);fields[6]=new Fr(3n);fields[8]=new Fr(1n);fields[9]=new Fr(3n);fields[10]=new Fr(20n);fields[11]=new Fr(21n);fields[12]=new Fr(1n);fields[13]=new Fr(22n);}
  const decoded=decodeFromAbi(hintsType,fields);assert.equal(decoded[1],undefined);assert.equal(decoded[0]===undefined,!some);
  const f=fixture();f.state.hints=decoded;
  const p=await f.app.prepare({type:'post',deposit:'9',content:'Optional hint roundtrip'});
  const prepared=f.state.calls.at(-1).args.slice(-2);assert.equal(prepared[1],null);
  assert.deepEqual(encodeArguments(hintAbi,prepared).map(String),fields.map(String));
  assert.equal((await f.restart().submitPrepared(p.intentId)).status,'confirmed');
  assert.deepEqual(f.state.sent.payload.args.slice(-2),prepared);
  assert.deepEqual(encodeArguments(hintAbi,f.state.sent.payload.args.slice(-2)).map(String),fields.map(String));
 }
});
test('utility ABI rejects missing required hint fields and malformed tuples before saving',async()=>{
 const hintsType=getFunctionReturnType(artifact.functions.find(f=>f.name==='get_screen_hints'));
 const fields=Array.from({length:28},()=>Fr.ZERO);fields[0]=new Fr(1n);
 const decoded=decodeFromAbi(hintsType,fields);
 const badField=structuredClone(decoded);badField[0].note.schema_version=undefined;
 for(const hints of [[undefined],[undefined,undefined,undefined],badField,[{},undefined]]){
  const f=fixture();f.state.hints=hints;
  await assert.rejects(f.app.prepare({type:'post',deposit:'9',content:'Must reject'}),{code:'ROLLING_INVALID_RESPONSE'});
  assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 }
});

// G05-A09/A10 cases bind to the normal processed protocol ABI above. RPC/session
// doubles model stale-version simulation; they do not replace actual proof acceptance.
test('profile actions encode with actual private ABI and survive encrypted restart',async()=>{
 const cases=[{type:'bio',name:'5',expectedVersion:'0',content:'é'.repeat(496)},
  {type:'bio',name:'5',expectedVersion:'0',content:''},
  {type:'avatar',name:'5',expectedVersion:'0',width:100,height:100,data:Buffer.alloc(8192,0xa5).toString('base64')},
  {type:'avatar',name:'5',expectedVersion:'0',width:0,height:0,data:''}];
 for(const action of cases){const f=fixture(),p=await f.app.prepare(action),call=f.state.calls.at(-1);assert.equal(f.state.sends,0);
  const abi=artifact.functions.find(fn=>fn.name===call.name);assert.equal(abi.functionType,'private');
  const encoded=encodeArguments(abi,call.args).map(value=>value.toBigInt());assert.equal(encoded.length,action.type==='bio'?35:270);assert.equal(encoded[0],5n);assert.equal(encoded[1],0n);
  const packed=action.type==='bio'?encoded.slice(2,34):encoded.slice(5);const recovered=Buffer.concat(packed.map(n=>Buffer.from(n.toString(16).padStart(64,'0'),'hex').subarray(1)));
  const expected=action.type==='bio'?Buffer.from(action.content):Buffer.from(action.data,'base64');assert.deepEqual(recovered.subarray(0,expected.length),expected);assert(recovered.subarray(expected.length).every(byte=>byte===0));
  const args=structuredClone(call.args);if(action.type==='bio'){assert.equal(args[2].length,32);assert.equal(args[3],new TextEncoder().encode(action.content).length);}
  else{assert.equal(args[5].length,265);assert.equal(args[4],Buffer.from(action.data,'base64').length);assert(BigInt(args[5][264])<(1n<<248n));assert.equal(BigInt(args[5][264])&((1n<<184n)-1n),0n);}
  assert.equal((await f.restart().submitPrepared(p.intentId)).status,'confirmed');assert.deepEqual(f.state.sent.payload.args,args);
 }
});
test('profile byte/version/dimension validation rejects without fee estimation or journal writes',async()=>{
 const bio={type:'bio',name:'5',expectedVersion:'0',content:'hi'},avatar={type:'avatar',name:'5',expectedVersion:'0',width:100,height:100,data:'AA=='};
 const actions=[{...bio,content:'é'.repeat(497)},{...bio,content:'\ud800'},{...bio,content:'x\0y'},{...bio,name:'0'},
  ...['01','-1','4294967296',' 0','1.0',0,null,undefined].map(expectedVersion=>({...bio,expectedVersion})),
  {...avatar,data:Buffer.alloc(8193).toString('base64')},...['AB==','AAB=','AA','AA==\n','__==','A==='].map(data=>({...avatar,data})),
  {...avatar,width:99},{...avatar,width:'100'},{...avatar,data:''},{...avatar,width:0,height:0},
  {...avatar,expectedVersion:'4294967296'}];
 for(const action of actions){const f=fixture();await assert.rejects(f.app.prepare(action));assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);}
});
test('stale profile version cannot be silently refreshed or sent after preparation',async()=>{
 for(const action of [{type:'bio',name:'5',expectedVersion:'0',content:'immutable'},
  {type:'avatar',name:'5',expectedVersion:'0',width:100,height:100,data:'AA=='}]){
  const f=fixture(),p=await f.app.prepare(action);f.state.profileVersion=1;
  await assert.rejects(f.restart().submitPrepared(p.intentId),/stale profile version/);assert.equal(f.state.sends,0);
  assert.equal((await f.app.reconcile(p.intentId)).status,'prepared');assert.equal(f.state.calls.at(-1).args[1],0);
 }
 const f=fixture();f.state.profileVersion=0xffffffff;await assert.rejects(f.app.prepare({type:'bio',name:'5',expectedVersion:'4294967295',content:''}),/profile version exhausted/);
 assert.equal(f.state.calls.at(-1).args[1],0xffffffff);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
});
test('owned metadata preserves display case, 32-byte boundary and cursor with only private utility calls',async()=>{
 const f=fixture(),names=Array.from({length:8},(_,i)=>['A'.repeat(32),`Last ${String.fromCharCode(65+i)}`]);f.state.records=await ownershipPage(names);
 const result=await f.app.ownedIdentities({cursor:16});assert.equal(result.nextCursor,24);assert.deepEqual(result.records.map(r=>[r.first,r.last]),names);assert.equal(result.identities.length,8);
 assert.deepEqual(f.state.privateReads.map(r=>r.name),['owned_name_records']);assert.equal(f.state.privateReads[0].args[1],16);
});
test('native campaign SDK recovers an actual ABI-decoded nonempty ownership page',async()=>{
 const {loadRollingFixtureSDK}=await import('../../scripts/testing/rolling-application-fixture.mjs');
 const native=await loadRollingFixtureSDK(),f=fixture();
 f.state.records=await ownershipPage([['River','Stone']]);
 f.options.sdk.poseidon2HashWithSeparator=native.poseidon2HashWithSeparator;
 const id='0x2682de94a1e9e9ebdc321ce593be34853b1587f715bc9f147e8daae17c7cf76b';
 assert.deepEqual(await f.app.ownedIdentities(),{identities:[id],records:[{id,first:'River',last:'Stone'}],nextCursor:null});
 assert.equal(native.poseidon2HashWithSeparator,poseidon2HashWithSeparator);
 const {preimage}=nameRegistration('River','Stone');
 assert.equal((await native.poseidon2HashWithSeparator(preimage.map(n=>new native.Fr(n)),NAME_DOMAIN)).toString(),id);
 assert.equal(f.state.sends,0);assert.deepEqual(f.state.privateReads.map(r=>r.name),['owned_name_records']);
});
test('owned metadata rejects forged IDs, bad schema, missing fields, padding, reserved/unsupported names and duplicates',async()=>{
 const mutations=[page=>{page[0].name_id=6n;},page=>{page[0].schema=2;},page=>{delete page[0].first;},page=>{page[0].first[0]+=1n;},page=>{page[0].first[1]=1n;},
  page=>{page[0].first[0]=1n<<248n;},page=>{page[0].first_length=33;},page=>{page[0].first[0]=255n<<240n;},
  page=>{page[0].first_length=3;page[0].first=displayPack('Bok');},page=>{page[1]=structuredClone(page[0]);},
  page=>{page[1].schema=1;},page=>{page[1].last[0]=1n;},page=>{page[2]=page[0];page[0]=structuredClone(page[1]);}];
 for(const mutate of mutations){const f=fixture();f.state.records=await ownershipPage();mutate(f.state.records);await assert.rejects(f.app.ownedIdentities(),{code:'ROLLING_INVALID_RESPONSE'});assert.equal(f.state.sends,0);assert.deepEqual(f.state.privateReads.map(r=>r.name),['owned_name_records']);}
});
test('missing new metadata ABI fails closed without legacy or public lookup',async()=>{
 const f=fixture();f.options.deployment.board.artifact={...artifact,functions:artifact.functions.filter(fn=>fn.name!=='owned_name_records')};
 await assert.rejects(f.app.ownedIdentities(),{code:'ROLLING_ABI_MISMATCH'});assert.deepEqual(f.state.privateReads,[]);
});
test('account lock during local metadata hashing suppresses the private result',async()=>{
 const f=fixture();f.options.sdk.poseidon2HashWithSeparator=async(...args)=>{const value=await poseidon2HashWithSeparator(...args);f.state.guard=false;return value;};
 await assert.rejects(f.app.ownedIdentities());assert.deepEqual(f.state.privateReads.map(r=>r.name),['owned_name_records']);
});

test('selected profile versions use the guarded private utility without public ownership queries or mutations',async()=>{
 const f=fixture();f.state.profileState=decodeFromAbi(getFunctionReturnType([...artifact.functions,...artifact.nonDispatchPublicFunctions].find(fn=>fn.name==='profile_state')),[2n,0n,0n,3n,0n,100n,100n,8192n].map(n=>new Fr(n)));
 assert.deepEqual(await f.app.readProfile({name:'9'}),{name:hex(9),bioVersion:'2',avatarVersion:'3'});
 assert.deepEqual(f.state.privateReads.map(read=>read.name),['profile_state']);assert.equal(f.state.sends,0);assert.equal(f.state.estimates,0);assert.equal(f.values.size,0);
 f.state.guard=false;await assert.rejects(f.app.readProfile({name:'9'}));assert.equal(f.state.privateReads.length,1);
});
test('profile snapshots reject anonymous names and malformed or overflowing versions without saving an action',async()=>{
 for(const name of ['0','01',undefined]){const f=fixture();await assert.rejects(f.app.readProfile({name}));assert.equal(f.state.privateReads.length,0);}
 for(const key of ['bio_version','avatar_version'])for(const value of [undefined,-1,4294967296,true,false,'',' ','0','01','+1','0x1',0,1]){
  const f=fixture();f.state.profileState={bio_version:0n,bio_digest:0n,bio_length:0,avatar_version:0n,avatar_digest:0n,avatar_width:0,avatar_height:0,avatar_length:0,[key]:value};
  await assert.rejects(f.app.readProfile({name:'9'}));assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 }
});

test('rejected subboard has a distinct pre-spend result without hiding malformed policy or outages',async()=>{
 const input={type:'post',deposit:'9',subboard:'17',name:'0',content:'A retained draft'};
 const rejected=fixture();rejected.state.effectivePolicy=[1n,1n,1n,2n,true];
 await assert.rejects(rejected.app.prepare(input),{code:'ROLLING_SUBBOARD_REJECTED'});
 for(const value of [null,[],[1n,1n,1n,2n], [1n,1n,1n,2n,'true']]){
  const malformed=fixture();malformed.state.effectivePolicy=value;
  await assert.rejects(malformed.app.prepare(input),error=>error.code==='ROLLING_INVALID_RESPONSE');
  assert.equal(malformed.state.estimates,0);assert.equal(malformed.state.sends,0);assert.equal(malformed.values.size,0);
 }
 const unavailable=fixture(),error=Object.assign(Error('test-only offline'),{code:'TEST_NODE_UNAVAILABLE'});unavailable.state.policyReadError=error;
 await assert.rejects(unavailable.app.prepare(input),e=>e===error);
 for(const f of [rejected,unavailable]){assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);assert(!f.state.privateReads.some(x=>x.name==='get_screen_hints'));}
 assert.equal(input.content,'A retained draft');
 const valid=fixture();await valid.app.prepare(input);assert.equal(valid.state.estimates,1);assert.equal(valid.state.sends,0);
});

// Labelled session doubles; actual normal ABI/decoder and encrypted persistence.
// These prove the adapter boundary, not on-chain maturity or a completed exit.
test('screen actual ABI snapshots None/Some pairs and submits once after explicit confirmation',async()=>{
 const hintsType=getFunctionReturnType(artifact.functions.find(f=>f.name==='get_screen_hints'));
 const screen=artifact.functions.find(f=>f.name==='screen');assert(screen);
 for(const count of [0,1,2]){
  const fields=Array.from({length:28},()=>Fr.ZERO);
  for(let i=0;i<count;i++){
   const offset=i*14,values=[1n,1n,9n,BigInt(i+1),BigInt(8+i),100n,3n,0n,1n,3n,20n,21n,1n,22n];
   values.forEach((n,j)=>{fields[offset+j]=new Fr(n);});
  }
  const f=fixture();f.state.hints=decodeFromAbi(hintsType,fields);
  const prepared=await f.app.prepare({type:'screen',deposit:'9'});assert.equal(prepared.status,'prepared');assert.equal(prepared.maximumFee,'10');
  assert.equal(f.state.sends,0);assert.deepEqual(f.state.privateReads.map(r=>r.name),['get_screen_hints']);
  const args=f.state.calls[0].args;assert.equal(args[0],hex(9));
  assert.deepEqual(encodeArguments(screen,args).map(String),[new Fr(9n),...fields].map(String));
  // A later utility response must not replace the confirmed immutable hints.
  f.state.hints=decodeFromAbi(hintsType,Array.from({length:28},()=>Fr.ZERO));
  const outcome=await f.restart().submitPrepared(prepared.intentId);assert.equal(outcome.status,'confirmed');
  assert.equal(f.state.sends,1);assert.equal(f.state.sent.payload.name,'screen');assert.deepEqual(f.state.sent.payload.args,args);
  assert.equal(f.state.privateReads.length,1);await assert.rejects(f.app.submitPrepared(prepared.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
 }
});
test('screen rejects malformed deposit, extra hints/content/call options and grandchild without child',async()=>{
 for(const action of [{type:'screen'},{type:'screen',deposit:'0'},{type:'screen',deposit:9},{type:'screen',deposit:'09'},
  {type:'screen',deposit:FIELD_MODULUS.toString()},{type:'screen',deposit:'9',child:null},{type:'screen',deposit:'9',content:''},{type:'screen',deposit:'9',from:hex(3)}]){
  const f=fixture();await assert.rejects(f.app.prepare(action),{code:'ROLLING_INVALID_ACTION'});assert.equal(f.state.privateReads.length,0);assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 }
 const f=fixture(),type=getFunctionReturnType(artifact.functions.find(fn=>fn.name==='get_screen_hints')),fields=Array.from({length:28},()=>Fr.ZERO);fields[14]=new Fr(1n);
 f.state.hints=decodeFromAbi(type,fields);await assert.rejects(f.app.prepare({type:'screen',deposit:'9'}),{code:'ROLLING_HISTORY_UNAVAILABLE'});assert.equal(f.state.estimates,0);assert.equal(f.values.size,0);
});
test('screen propagates private hint and fee-simulation failures without saving or sending',async()=>{
 for(const phase of ['hintsReadError','screenError']){
  const f=fixture(),error=Error('Labelled screening failure');f.state[phase]=error;
  await assert.rejects(f.app.prepare({type:'screen',deposit:'9'}),e=>e===error);assert.equal(f.values.size,0);assert.equal(f.state.sends,0);
 }
 const f=fixture();f.state.hints=[{},undefined];await assert.rejects(f.app.prepare({type:'screen',deposit:'9'}),{code:'ROLLING_INVALID_RESPONSE'});assert.equal(f.values.size,0);assert.equal(f.state.estimates,0);
});
test('screen retains saved fee ceiling, permits pre-send cancellation and fences uncertain send',async()=>{
 const f=fixture(),p=await f.app.prepare({type:'screen',deposit:'9'});f.state.fee=11n;
 await assert.rejects(f.restart().submitPrepared(p.intentId),{code:'ROLLING_FEE_CHANGED'});assert.equal(f.state.sends,0);
 assert.equal((await f.app.cancelPrepared(p.intentId)).status,'cancelled');
 f.state.fee=10n;const next=await f.app.prepare({type:'screen',deposit:'9'});f.state.failSend=true;
 await assert.rejects(f.app.submitPrepared(next.intentId));assert.equal(f.state.sends,1);
 const replacement=f.restart();assert.equal((await replacement.reconcile(next.intentId)).status,'unknown');
 await assert.rejects(replacement.submitPrepared(next.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
 await assert.rejects(replacement.prepare({type:'screen',deposit:'9'}),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(f.state.sends,1);
});
test('screen stale-state submission fails without refreshing immutable hints or spending',async()=>{
 const f=fixture(),p=await f.app.prepare({type:'screen',deposit:'9'}),error=Error('Labelled spent deposit simulation');
 f.state.screenError=error;await assert.rejects(f.restart().submitPrepared(p.intentId),e=>e===error);
 assert.equal(f.state.sends,0);assert.equal(f.state.privateReads.filter(r=>r.name==='get_screen_hints').length,1);
 assert.equal((await f.app.reconcile(p.intentId)).status,'prepared');assert.equal((await f.app.cancelPrepared(p.intentId)).status,'cancelled');
});

// Preference integration uses the normally processed d530 artifact. Only the
// transport/funding doubles are synthetic; ABI encoding and encrypted intent
// persistence use the production implementations. No chain acceptance claim.
const preferenceHead=(initialized,schema,revision,digest)=>decodeFromAbi(getFunctionReturnType(artifact.functions.find(f=>f.name==='preference_head')),
 [new Fr(initialized?1n:0n),new Fr(BigInt(schema)),new Fr(BigInt(revision)),new Fr(BigInt(digest))]);
test('preference and read marker encode actual ABI, preserve exact payer/journal and submit only after confirmation',async()=>{
 const cases=[
  [{type:'preference',expectedRevision:'0',kind:1,target:'42',enabled:true},'set_preference',[0n,1n,42n,1n]],
  [{type:'preference',expectedRevision:'18446744073709551615',kind:5,target:hex(0),enabled:false},'set_preference',[0xffffffffffffffffn,5n,0n,0n]],
  [{type:'read-marker',expectedRevision:'9007199254740993',thread:hex(42),throughBlock:'4294967295'},'mark_thread_read',[9007199254740993n,42n,0xffffffffn]],
 ];
 for(const [action,method,fields] of cases){
  const f=fixture();f.state.preferenceHead=preferenceHead(action.expectedRevision!=='0',1,action.expectedRevision,action.expectedRevision==='0'?'0':'11');const p=await f.app.prepare(action);assert.equal(p.status,'prepared');assert.equal(p.maximumFee,'10');assert.equal(f.state.sends,0);assert.deepEqual(f.state.privateReads.map(row=>row.name),['preference_head']);
  const call=f.state.calls[0],abi=artifact.functions.find(fn=>fn.name===method);assert(abi);assert.equal(call.name,method);
  assert.deepEqual(encodeArguments(abi,call.args).map(x=>x.toBigInt()),fields);
  const result=await f.restart().submitPrepared(p.intentId);assert.equal(result.status,'confirmed');assert.equal(f.state.sends,1);
  assert.equal(f.state.sent.opts.from.toString(),f.options.accountSession.owner.toString());assert.equal(f.state.sent.opts.transactionJournal,f.options.accountSession.journal);
  assert.equal(f.state.sent.opts.journalOperation,`ROLLING_WORKFLOW_V1:${p.intentId}`);assert.deepEqual(f.state.sent.payload.args,call.args);
  await assert.rejects(f.app.submitPrepared(p.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
 }
});
test('all five preference targets allow only their fixed ID shape before fee estimation',async()=>{
 for(const [kind,target] of [[1,'1'],[2,'0'],[2,'1'],[3,'1'],[4,'1'],[5,'0']]){
  const f=fixture();await f.app.prepare({type:'preference',expectedRevision:'0',kind,target,enabled:false});assert.equal(f.state.estimates,1);
 }
 const base={type:'preference',expectedRevision:'0',kind:1,target:'1',enabled:true};
 for(const patch of [{kind:0},{kind:6},{kind:'1'},{kind:1.5},{kind:null},{target:'0'},{kind:3,target:'0'},{kind:4,target:'0'},
  {kind:5,target:'1'},{target:'01'},{target:1},{target:FIELD_MODULUS.toString()},{enabled:1},{enabled:null},
  {expectedRevision:'01'},{expectedRevision:0},{expectedRevision:'-1'},{expectedRevision:'18446744073709551616'},{owner:hex(3)},{read_hash:hex(1)}]){
  const f=fixture();await assert.rejects(f.app.prepare({...base,...patch}),{code:'ROLLING_INVALID_ACTION'});assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 }
 for(const key of ['expectedRevision','kind','target','enabled']){const f=fixture(),action={...base};delete action[key];await assert.rejects(f.app.prepare(action));assert.equal(f.state.estimates,0);}
});
test('read marker validates canonical revision/thread/block without accepting a caller header hash',async()=>{
 const base={type:'read-marker',expectedRevision:'0',thread:'1',throughBlock:'0'};
 for(const patch of [{thread:'0'},{thread:'01'},{thread:1},{throughBlock:0},{throughBlock:'01'},{throughBlock:'-1'},
  {throughBlock:'4294967296'},{expectedRevision:'18446744073709551616'},{readHash:hex(9)},{owner:hex(3)},{enabled:true}]){
  const f=fixture();await assert.rejects(f.app.prepare({...base,...patch}),{code:'ROLLING_INVALID_ACTION'});assert.equal(f.state.estimates,0);assert.equal(f.values.size,0);
 }
});
test('preference saved maximum and revision remain immutable on retry-free stale simulation failure',async()=>{
 const f=fixture(),action={type:'preference',expectedRevision:'7',kind:1,target:'42',enabled:true};
 f.state.preferenceHead=preferenceHead(true,1,7,11);const prepared=await f.app.prepare(action);action.expectedRevision='8';action.enabled=false;f.state.fee=11n;
 await assert.rejects(f.restart().submitPrepared(prepared.intentId),{code:'ROLLING_FEE_CHANGED'});assert.equal(f.state.sends,0);
 f.state.fee=10n;const error=Object.assign(Error('Labelled stale expected revision'),{code:'LABELLED_REVISION_REJECTED'});f.state.preferenceError=error;
 await assert.rejects(f.app.submitPrepared(prepared.intentId),e=>e===error);assert.equal(f.state.sends,0);
 const retained=await f.app.reconcile(prepared.intentId);assert.equal(retained.status,'prepared');assert.equal(retained.action.expectedRevision,'7');assert.equal(retained.action.enabled,true);
 assert.deepEqual(f.state.privateReads.map(row=>row.name),['preference_head']);assert.equal((await f.app.cancelPrepared(prepared.intentId)).status,'cancelled');
});
test('uncertain preference submit keeps durable fence across replacement without another send',async()=>{
 const f=fixture(),p=await f.app.prepare({type:'read-marker',expectedRevision:'0',thread:'42',throughBlock:'10'});f.state.failSend=true;
 await assert.rejects(f.app.submitPrepared(p.intentId));assert.equal(f.state.sends,1);const replacement=f.restart();
 assert.equal((await replacement.reconcile(p.intentId)).status,'unknown');
 await assert.rejects(replacement.submitPrepared(p.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
 await assert.rejects(replacement.prepare({type:'preference',expectedRevision:'1',kind:2,target:'0',enabled:true}),{code:'ROLLING_RECOVERY_REQUIRED'});
 assert.equal(f.state.sends,1);
});
test('head utility returns exact replay format through owner only without fees/journal/public lookup',async()=>{
 const f=fixture();assert.deepEqual(await f.app.readPreferenceHead(),{initialized:false,schema:1,revision:'0',digest:'0'});
 f.state.preferenceHead=preferenceHead(true,1,9007199254740993n,42);const head=await f.app.readPreferenceHead();
 assert.deepEqual(head,{initialized:true,schema:1,revision:'9007199254740993',digest:'42'});assert(Object.isFrozen(head));
 assert(f.state.privateReads.every(r=>r.name==='preference_head'&&r.args.length===1&&r.args[0]===f.options.accountSession.owner));
 assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
});
test('head read rejects inconsistent absence, schema, revision overflow and malformed utility output',async()=>{
 const cases=[preferenceHead(false,1,1,0),preferenceHead(false,1,0,1),preferenceHead(true,1,0,1),preferenceHead(true,1,1,0),preferenceHead(true,2,1,2),
  {initialized:true,schema:1n,revision:1n<<64n,digest:1n},{initialized:false,schema:1n,revision:0n,digest:0n,owner:hex(3)},undefined,null,[],
  {initialized:0,schema:1n,revision:0n,digest:0n}];
 for(const record of cases){const f=fixture();f.state.preferenceHead=record;await assert.rejects(f.app.readPreferenceHead());assert.equal(f.values.size,0);assert.equal(f.state.sends,0);}
});
test('head utility failures preserve errors and never masquerade as no preferences',async()=>{
 const f=fixture(),error=Object.assign(Error('Labelled unavailable scoped NHK'),{code:'BB_TRUSTED_NODE_UNAVAILABLE'});f.state.preferenceHeadError=error;
 await assert.rejects(f.app.readPreferenceHead(),e=>e===error);assert.equal(f.state.privateReads.length,1);assert.equal(f.values.size,0);
 await assert.rejects(createRollingApplication({}).readPreferenceHead(),{code:'ROLLING_LOCKED'});
});
test('account change during contract acquisition prevents personalized head read',async()=>{
 const f=fixture(),original=f.options.sdk.Contract.at;f.options.sdk.Contract.at=async()=>{f.options.accountSession.owner=new AztecAddress(new Fr(4n));return original();};
 await assert.rejects(f.app.readPreferenceHead(),{code:'ROLLING_CONTEXT_CHANGED'});assert.equal(f.state.privateReads.length,0);
});
test('head read is exclusive and account change during utility prevents returning old private state',async()=>{
 const f=fixture();let release,entered;const gate=new Promise(r=>release=r),active=new Promise(r=>entered=r);
 f.state.beforePreferenceHead=async()=>{entered();await gate;};const pending=f.app.readPreferenceHead();await active;
 await assert.rejects(f.app.readPreferenceHead(),{code:'ROLLING_BUSY'});f.options.accountSession.owner=new AztecAddress(new Fr(4n));release();
 await assert.rejects(pending,{code:'ROLLING_CONTEXT_CHANGED'});assert.equal(f.state.privateReads.length,1);assert.equal(f.values.size,0);
});
test('preference and read-marker initial simulation errors propagate without intent or send',async()=>{
 for(const action of [{type:'preference',expectedRevision:'0',kind:2,target:'0',enabled:true},{type:'read-marker',expectedRevision:'0',thread:'1',throughBlock:'1'}]){
  const f=fixture(),error=Error('Labelled constrained preference failure');f.state.preferenceError=error;
  await assert.rejects(f.app.prepare(action),e=>e===error);assert.equal(f.state.estimates,1);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 }
});

// Actual SDK signed-transaction serialization + encrypted CAS records; the proof,
// receipts, fork and private utility head below are labelled chain doubles.
async function replacementFixture({marker=false,initialCrash=false}={}){
 const f=fixture(),node=f.options.accountSession.node,receipts=new Map(),validations=new Map(),transactions=[];
 const initial=marker?{initialized:true,schema:1,revision:'1',digest:'11'}:{initialized:false,schema:1,revision:'0',digest:'0'};
 f.state.preferenceHead=preferenceHead(initial.initialized,1,initial.revision,initial.digest);
 node.getTxReceipt=async hash=>receipts.get(String(hash))??{txHash:hash,status:'dropped'};
 node.isValidTx=async tx=>validations.get(String(tx.getTxHash()))??{result:'invalid',reason:['Block header not found']};
 node.getBlock=async()=>({hash:hex(42)});let markerHash=hex(43);
 node.getBlockData=async height=>({header:{globalVariables:{blockNumber:height}},blockHash:markerHash});
 f.options.accountSession.wallet.pxe.sync=async()=>{f.state.syncs=(f.state.syncs??0)+1;};
 const scope={account:hex(3),chainId:'31337',version:'1',rollup:'0x'+'11'.repeat(20),board:hex(1),portal:'0x'+'22'.repeat(20)};
 const newJournal=()=>createL2Journal({storage:f.options.privateStore,walletSecret:hex(8),walletSalt:'0',scope,Tx,node,waitOptions:{timeoutMs:1000,readTimeoutMs:1000,intervalMs:1},contextGuard:f.options.contextGuard});
 f.options.accountSession.journal=await newJournal();
 f.options.accountSession.wallet.sendTx=async(_,opts)=>{
  const journal=f.options.accountSession.journal;journal.setOperation(opts.journalOperation);const prior=await journal.assertCanStart();
  const tx=Tx.random({randomProof:true});transactions.push(tx);await journal.prepare(tx,prior);
  if(f.state.beforeSubmit)await f.state.beforeSubmit(tx);
  if(f.state.crashAfterPrepare)throw Error('Labelled crash after journal prepare');
  if(opts.beforeSubmit)await opts.beforeSubmit(String(tx.getTxHash()));
  f.state.sends++;const receipt={txHash:tx.getTxHash(),status:'checkpointed',blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:3n};
  receipts.set(String(tx.getTxHash()),receipt);journal.confirmed(receipt);
  f.state.preferenceHead=preferenceHead(true,1,BigInt(initial.revision)+1n,99);
  return {receipt};
 };
 node.sendTx=async tx=>{
  f.state.sends++;(f.state.resumedBytes??=[]).push(Buffer.from(tx.toBuffer()).toString('hex'));
  const receipt={txHash:tx.getTxHash(),status:'checkpointed',blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:3n};
  receipts.set(String(tx.getTxHash()),receipt);f.state.preferenceHead=preferenceHead(true,1,BigInt(initial.revision)+1n,99);
 };
 f.app=f.restart();const action=marker?{type:'read-marker',expectedRevision:'1',thread:'42',throughBlock:'10'}:{type:'preference',expectedRevision:'0',kind:1,target:'42',enabled:true};
 const prepared=await f.app.prepare(action);let confirmed;
 if(initialCrash){f.state.crashAfterPrepare=true;f.state.beforeSubmit=async tx=>validations.set(String(tx.getTxHash()),{result:'valid'});await assert.rejects(f.app.submitPrepared(prepared.intentId),/Labelled crash/);}
 else confirmed=await f.app.submitPrepared(prepared.intentId);
 const originalHash=String(transactions[0].getTxHash());
 function fork(){receipts.delete(originalHash);f.state.preferenceHead=preferenceHead(initial.initialized,1,initial.revision,initial.digest);markerHash=hex(44);}
 async function reopen(){f.options.accountSession.journal=await newJournal();f.app=f.restart();return f.app;}
 const review=()=>({expectedTxHash:originalHash,expectedHead:{...initial},...(marker?{expectedMarkerHash:markerHash}:{})});
 return {...f,prepared,confirmed,initial,originalHash,receipts,validations,transactions,fork,reopen,review};
}
test('replacement inspection is read-only across a fork and retains original canonical fee facts',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();const before=[...f.values];
 const result=await f.app.inspectRecovery(f.prepared.intentId);assert.deepEqual([...f.values],before);assert.equal(f.state.sends,1);
 assert.equal(result.status,'replacement-available');assert.equal(result.currentTxHash,f.originalHash);assert.deepEqual(result.head,f.initial);
 assert.deepEqual(result.inclusionHistory,[{txHash:f.originalHash,inclusions:[{blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:'3'}]}]);
 result.inclusionHistory[0].inclusions[0].transactionFee='999';assert.equal((await f.app.inspectRecovery(f.prepared.intentId)).inclusionHistory[0].inclusions[0].transactionFee,'3');
});
for(const marker of [false,true])test(`explicit replacement preserves immutable ${marker?'marker':'initial preference'} and renews fee consent`,async()=>{
 const f=await replacementFixture({marker});f.fork();await f.reopen();f.state.fee=12n;
 const proposed=await f.app.prepareReplacement(f.prepared.intentId,f.review());assert.equal(f.state.sends,1);assert.equal(proposed.status,'replacement-prepared');assert.equal(proposed.maximumFee,'10');assert.equal(proposed.replacementReview.maximumFee,'12');
 assert.deepEqual(proposed.action,f.prepared.action);assert.equal(proposed.nonce,f.prepared.nonce);assert.equal(proposed.intentId,f.prepared.intentId);
 await f.reopen();const complete=await f.app.submitPrepared(proposed.intentId);assert.equal(complete.status,'confirmed');assert.equal(f.state.sends,2);assert.equal(f.state.syncs,1);
 const report=await f.app.inspectRecovery(proposed.intentId);assert.equal(report.status,'canonical');assert.equal(report.inclusionHistory.length,2);assert.equal(report.inclusionHistory[0].txHash,f.originalHash);assert.equal(report.inclusionHistory[1].txHash,complete.txHash);
 assert.deepEqual(complete.action,f.prepared.action);assert.equal(complete.nonce,f.prepared.nonce);
});
test('marker replacement requires explicit same-height new canonical hash and retains original context',async()=>{
 const f=await replacementFixture({marker:true});f.fork();await f.reopen();const snapshot=await f.app.inspectRecovery(f.prepared.intentId);
 assert.deepEqual(snapshot.originalMarker,{throughBlock:'10',blockHash:hex(43)});assert.deepEqual(snapshot.marker,{throughBlock:'10',blockHash:hex(44)});
 await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,{...f.review(),expectedMarkerHash:hex(43)}),{code:'ROLLING_RECOVERY_CONTEXT_CHANGED'});
 const {expectedMarkerHash,...omitted}=f.review();await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,omitted),{code:'ROLLING_RECOVERY_CONTEXT_CHANGED'});assert.equal(f.state.sends,1);
});
for(const reason of ['pending','unknown','canonical','head-advanced','wrong-head','wrong-hash'])test(`replacement fences ${reason} without a new proof or send`,async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();const input=f.review();
 if(reason==='pending')f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'pending'});
 if(reason==='unknown')f.validations.set(f.originalHash,{result:'invalid',reason:['Existing nullifier']});
 if(reason==='canonical')f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'checkpointed',blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:3n});
 if(reason==='head-advanced')f.state.preferenceHead=preferenceHead(true,1,1,99);
 if(reason==='wrong-head')input.expectedHead={initialized:false,schema:1,revision:'0',digest:'1'};
 if(reason==='wrong-hash')input.expectedTxHash=hex(123);
 const before=f.state.estimates;await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,input));assert.equal(f.state.estimates,before);assert.equal(f.transactions.length,1);assert.equal(f.state.sends,1);
});
test('replacement fee growth needs renewed explicit review, not silent higher spending',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();await f.app.prepareReplacement(f.prepared.intentId,f.review());f.state.fee=11n;
 await assert.rejects(f.app.submitPrepared(f.prepared.intentId),{code:'ROLLING_FEE_CHANGED'});assert.equal(f.state.sends,1);
 const renewed=await f.app.prepareReplacement(f.prepared.intentId,f.review());assert.equal(renewed.replacementReview.maximumFee,'11');assert.equal(renewed.maximumFee,'10');await f.app.submitPrepared(renewed.intentId);assert.equal(f.state.sends,2);
});
for(const failure of ['head','marker','predecessor','account'])test(`replacement beforeSubmit rechecks ${failure} after proving and keeps signed evidence`,async()=>{
 const f=await replacementFixture({marker:failure==='marker'});f.fork();await f.reopen();await f.app.prepareReplacement(f.prepared.intentId,f.review());
 f.state.beforeSubmit=async()=>{if(failure==='head')f.state.preferenceHead=preferenceHead(true,1,7,77);if(failure==='marker')f.options.accountSession.node.getBlockData=async height=>({header:{globalVariables:{blockNumber:height}},blockHash:hex(45)});if(failure==='predecessor')f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'pending'});if(failure==='account')f.state.guard=false;};
 await assert.rejects(f.app.submitPrepared(f.prepared.intentId));assert.equal(f.state.sends,1);assert.equal(f.transactions.length,2);
});
test('crash after replacement journal prepare stays unknown and cannot automatically reprove or resend',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();await f.app.prepareReplacement(f.prepared.intentId,f.review());f.state.crashAfterPrepare=true;
 f.state.beforeSubmit=async tx=>f.validations.set(String(tx.getTxHash()),{result:'valid'});
 await assert.rejects(f.app.submitPrepared(f.prepared.intentId));await f.reopen();const report=await f.app.inspectRecovery(f.prepared.intentId);assert.equal(report.status,'unknown');assert.equal(report.attempts.length,2);
 await assert.rejects(f.app.submitPrepared(f.prepared.intentId));await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,{...f.review(),expectedTxHash:report.currentTxHash}));assert.equal(f.transactions.length,2);assert.equal(f.state.sends,1);
});
test('replacement review rejects accessor options before private work and snapshots data before awaiting',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();let reads=0;
 await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,{...f.review(),get expectedTxHash(){reads++;throw Error('private');}}),{code:'ROLLING_INVALID_ACTION'});assert.equal(reads,0);
 const input=f.review(),guard=f.options.contextGuard;f.options.contextGuard=async()=>{input.expectedHead.revision='99';return guard();};
 const app=f.restart();const result=await app.prepareReplacement(f.prepared.intentId,input);assert.equal(result.replacementReview.head.revision,'0');
});
test('replacement option proxies cannot expose arbitrary diagnostic errors',async()=>{
 const f=fixture(),input=new Proxy({},{getOwnPropertyDescriptor(){throw Error('PRIVATE_SENTINEL');}});
 await assert.rejects(f.app.prepareReplacement(hex(1),input),error=>error.code==='ROLLING_INVALID_ACTION'&&!error.message.includes('PRIVATE_SENTINEL'));
});
test('ordinary preference confirmation retains fee facts once, and missing fees fail closed',async()=>{
 const f=await replacementFixture();const before=await f.app.inspectRecovery(f.prepared.intentId);await f.app.reconcile(f.prepared.intentId);const after=await f.app.inspectRecovery(f.prepared.intentId);assert.deepEqual(before.inclusionHistory,after.inclusionHistory);
 const g=fixture(),prepared=await g.app.prepare({type:'preference',expectedRevision:'0',kind:1,target:'42',enabled:true}),send=g.options.accountSession.wallet.sendTx;
 g.options.accountSession.wallet.sendTx=async(...args)=>{const result=await send(...args);delete g.state.outcome.receipt.transactionFee;return result;};
 await assert.rejects(g.app.submitPrepared(prepared.intentId),{code:'ROLLING_INVALID_RESPONSE'});assert.equal(g.state.sends,1);
 await assert.rejects(g.app.submitPrepared(prepared.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(g.state.sends,1);
});
test('failed replacement review CAS preserves original ciphertext and inclusion facts',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();const before=[...f.values];f.state.failCAS=true;
 await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,f.review()),{code:'BB_JOURNAL_INVALID'});assert.deepEqual([...f.values],before);assert.equal(f.transactions.length,1);
 f.state.failCAS=false;assert.equal((await f.app.inspectRecovery(f.prepared.intentId)).inclusionHistory[0].inclusions[0].transactionFee,'3');
});
test('account invalidation during recovery head lookup prevents disclosure and review writes',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();const before=[...f.values];f.state.beforePreferenceHead=async()=>{f.state.guard=false;};
 await assert.rejects(f.app.inspectRecovery(f.prepared.intentId));assert.deepEqual([...f.values],before);assert.equal(f.state.sends,1);
});
test('replacement inspection attributes a canonical predecessor without naming current candidate winner',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();await f.app.prepareReplacement(f.prepared.intentId,f.review());f.state.crashAfterPrepare=true;
 await assert.rejects(f.app.submitPrepared(f.prepared.intentId));const latest=String(f.transactions[1].getTxHash());
 f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'checkpointed',blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:3n});
 const report=await f.app.inspectRecovery(f.prepared.intentId);assert.equal(report.status,'canonical');assert.equal(report.currentTxHash,latest);assert.equal(report.attempts.find(row=>row.txHash===f.originalHash).status,'canonical');assert.notEqual(report.attempts.find(row=>row.txHash===latest).status,'canonical');
 await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,{...f.review(),expectedTxHash:latest}));assert.equal(f.state.sends,1);
});
test('reopened account and inspection summaries restore detached replacement review and its exact ceiling',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();f.state.fee=12n;
 const proposed=await f.app.prepareReplacement(f.prepared.intentId,f.review());await f.reopen();
 const account=await f.app.readAccountStatus();assert.equal(account.status,'recovering');assert.equal(account.intent.status,'replacement-prepared');assert.deepEqual(account.intent.replacementReview,proposed.replacementReview);
 assert.equal(account.intent.maximumFee,'10');assert.deepEqual(account.intent.action,f.prepared.action);assert.equal(account.intent.nonce,f.prepared.nonce);
 account.intent.replacementReview.maximumFee='999';account.intent.replacementReview.head.revision='88';
 const inspected=await f.app.inspectRecovery(f.prepared.intentId);assert.deepEqual(inspected.intent.replacementReview,proposed.replacementReview);inspected.intent.replacementReview.maximumFee='777';
 assert.deepEqual((await f.app.readAccountStatus()).intent.replacementReview,proposed.replacementReview);
 f.state.fee=13n;await assert.rejects(f.app.submitPrepared(f.prepared.intentId),{code:'ROLLING_FEE_CHANGED'});assert.equal(f.state.sends,1);
 f.state.fee=12n;const confirmed=await f.app.submitPrepared(f.prepared.intentId);assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.replacementReview.maximumFee,'12');assert.equal(confirmed.maximumFee,'10');assert.equal(f.state.sends,2);
});
test('same revision with a different authenticated preference digest is context-changed, not replacement authority',async()=>{
 const f=await replacementFixture({marker:true});f.fork();await f.reopen();f.state.preferenceHead=preferenceHead(true,1,1,12);
 const changed={...f.review(),expectedHead:{initialized:true,schema:1,revision:'1',digest:'12'}};
 const result=await f.app.inspectRecovery(f.prepared.intentId);assert.equal(result.status,'context-changed');
 await assert.rejects(f.app.prepareReplacement(f.prepared.intentId,changed),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(f.state.sends,1);assert.equal(f.transactions.length,1);
});
test('initial preference preparation binds the full guarded head and refuses stale expected revision before fees',async()=>{
 const f=fixture();f.state.preferenceHead=preferenceHead(true,1,2,22);
 await assert.rejects(f.app.prepare({type:'preference',expectedRevision:'1',kind:1,target:'42',enabled:true}),{code:'ROLLING_RECOVERY_CONTEXT_CHANGED'});
 assert.equal(f.state.estimates,0);assert.equal(f.state.sends,0);assert.equal(f.values.size,0);
 const g=await replacementFixture({marker:true});g.fork();await g.reopen();const snapshot=await g.app.inspectRecovery(g.prepared.intentId);assert.deepEqual(snapshot.originalPreferenceHead,g.initial);
 snapshot.originalPreferenceHead.digest='999';assert.deepEqual((await g.app.inspectRecovery(g.prepared.intentId)).originalPreferenceHead,g.initial);
});


// Exact saved-byte recovery: real SDK Tx serialization + AEAD journals, labelled
// node/proof doubles. No genuine transaction or fork acceptance is claimed.
async function savedResumeFixture({marker=false,replacement=false}={}){
 const f=await replacementFixture({marker,initialCrash:!replacement});
 if(replacement){f.fork();await f.reopen();f.state.fee=12n;await f.app.prepareReplacement(f.prepared.intentId,f.review());
  f.state.crashAfterPrepare=true;f.state.beforeSubmit=async tx=>f.validations.set(String(tx.getTxHash()),{result:'valid'});
  await assert.rejects(f.app.submitPrepared(f.prepared.intentId),/Labelled crash/);
 }
 await f.reopen();return {...f,hash:String(f.transactions.at(-1).getTxHash())};
}
for(const marker of [false,true])for(const replacement of [false,true])test(`saved-byte ${replacement?'replacement':'original'} ${marker?'marker':'preference'} resumes once after restart without estimate or proof`,async()=>{
 const f=await savedResumeFixture({marker,replacement}),id=f.prepared.intentId,before=[...f.values],estimates=f.state.estimates,proofs=f.transactions.length,sends=f.state.sends;
 const inspection=await f.app.inspectRecovery(id);assert.deepEqual([...f.values],before);assert.equal(f.state.sends,sends);
 assert.equal(inspection.exactResume.status,'resumable');assert.equal(inspection.exactResume.txHash,f.hash);
 assert.equal(inspection.exactResume.feeSource,replacement?'replacement':'original');assert.equal(inspection.exactResume.maximumFee,replacement?'12':'10');
 assert.equal(inspection.intent.maximumFee,'10');assert.deepEqual(inspection.intent.inclusionHistory,inspection.inclusionHistory);
 inspection.exactResume.maximumFee='999';inspection.intent.inclusionHistory.length=0;
 const restored=await f.app.readAccountStatus();assert.equal(restored.intent.maximumFee,'10');assert.equal(restored.intent.inclusionHistory.length,replacement?1:0);
 const result=await f.app.resumeSaved(id,{expectedTxHash:f.hash});assert.equal(result.status,'confirmed');assert.equal(result.txHash,f.hash);
 assert.deepEqual(result.action,f.prepared.action);assert.equal(result.nonce,f.prepared.nonce);assert.equal(result.maximumFee,'10');
 assert.equal(f.state.sends,sends+1);assert.equal(f.state.estimates,estimates);assert.equal(f.transactions.length,proofs);
 assert.deepEqual(f.state.resumedBytes,[Buffer.from(f.transactions.at(-1).toBuffer()).toString('hex')]);
 assert.equal(result.inclusionHistory.length,replacement?2:1);assert.equal(result.inclusionHistory.at(-1).inclusions[0].transactionFee,'3');
 // Canonical reconciliation is read-only at the transport even after its head advanced.
 assert.equal((await f.app.inspectRecovery(id)).exactResume.status,'canonical');
 await f.app.resumeSaved(id,{expectedTxHash:f.hash});assert.equal(f.state.sends,sends+1);
});
for(const state of ['pending','unknown','invalid','head','marker','wrong-hash'])test(`saved-byte recovery fences ${state} without new fees or transport`,async()=>{
 const f=await savedResumeFixture({marker:true}),before=[...f.values],sends=f.state.sends,estimates=f.state.estimates;
 if(state==='pending')f.receipts.set(f.hash,{txHash:f.hash,status:'pending'});
 if(state==='unknown')f.options.accountSession.node.getTxReceipt=async()=>{throw Error('Labelled unavailable');};
 if(state==='invalid')f.validations.set(f.hash,{result:'invalid',reason:['Existing nullifier']});
 if(state==='head')f.state.preferenceHead=preferenceHead(true,1,1,12);
 if(state==='marker')f.options.accountSession.node.getBlockData=async height=>({header:{globalVariables:{blockNumber:height}},blockHash:hex(99)});
 const view=await f.app.inspectRecovery(f.prepared.intentId);if(['head','marker'].includes(state))assert.equal(view.exactResume.status,'context-changed');
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:state==='wrong-hash'?hex(999):f.hash}));
 assert.equal(f.state.sends,sends);assert.equal(f.state.estimates,estimates);assert.equal(f.transactions.length,1);assert.deepEqual([...f.values],before);
});
test('replacement quote cannot be attributed to unchanged old signed candidate',async()=>{
 const f=await replacementFixture();f.fork();await f.reopen();await f.app.prepareReplacement(f.prepared.intentId,f.review());
 f.validations.set(f.originalHash,{result:'valid'});
 const report=await f.app.inspectRecovery(f.prepared.intentId);assert.equal(report.exactResume.status,'unknown');assert.equal(report.exactResume.feeSource,null);assert.equal(report.exactResume.maximumFee,null);
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.originalHash}),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(f.state.sends,1);
});
for(const failure of ['head','marker','account','ciphertext'])test(`saved-byte beforeSubmit revalidates ${failure} after synchronization`,async()=>{
 const f=await savedResumeFixture({marker:true}),original=f.options.accountSession.wallet.pxe.sync;let syncs=0;
 f.options.accountSession.wallet.pxe.sync=async()=>{await original();if(++syncs===2){
  if(failure==='head')f.state.preferenceHead=preferenceHead(true,1,1,12);
  if(failure==='marker')f.options.accountSession.node.getBlockData=async height=>({header:{globalVariables:{blockNumber:height}},blockHash:hex(99)});
  if(failure==='account')f.state.guard=false;
  if(failure==='ciphertext'){for(const [key,value] of f.values)f.values.set(key,value+'x');}
 }};
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash}));assert.equal(syncs,2);assert.equal(f.state.sends,0);
});
test('saved-byte options reject accessors and snapshot exact hash before asynchronous context checks',async()=>{
 const f=await savedResumeFixture();let reads=0;await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{get expectedTxHash(){reads++;throw Error('PRIVATE_SENTINEL');}}),{code:'ROLLING_INVALID_ACTION'});assert.equal(reads,0);
 const input={expectedTxHash:f.hash},guard=f.options.contextGuard;f.options.contextGuard=async()=>{input.expectedTxHash=hex(999);await guard();};f.app=f.restart();
 await f.app.resumeSaved(f.prepared.intentId,input);assert.equal(f.state.sends,1);
});
test('saved-byte recovery owns the busy interval and cannot be concurrently confirmed',async()=>{
 const f=await savedResumeFixture();let release,entered;const gate=new Promise(r=>release=r),active=new Promise(r=>entered=r);
 f.options.accountSession.wallet.pxe.sync=async()=>{entered();await gate;};
 const pending=f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash});await active;
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash}),{code:'ROLLING_BUSY'});assert.equal(f.state.sends,0);
 release();await pending;assert.equal(f.state.sends,1);
});
test('unknown saved-byte send keeps bytes and intent; read reconciliation never rebroadcasts',async()=>{
 const f=await savedResumeFixture(),before=[...f.values];f.options.accountSession.node.sendTx=async tx=>{f.state.sends++;f.receipts.set(f.hash,{txHash:tx.getTxHash(),status:'pending'});throw Error('Labelled lost acknowledgement');};
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash}));assert.equal(f.state.sends,1);assert.deepEqual([...f.values],before);
 await f.reopen();assert.equal((await f.app.reconcile(f.prepared.intentId)).status,'unknown');assert.equal((await f.app.inspectRecovery(f.prepared.intentId)).exactResume.status,'pending');
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash}));assert.equal(f.state.sends,1);
});
test('saved-byte recovery is unavailable to unrelated action types',async()=>{
 const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});
 await assert.rejects(f.app.resumeSaved(p.intentId,{expectedTxHash:hex(77)}),{code:'ROLLING_RECOVERY_UNSUPPORTED'});assert.equal(f.state.sends,0);
});

for(const predecessor of ['pending','unknown','canonical'])test(`saved replacement cannot bypass ${predecessor} predecessor through app recovery`,async()=>{
 const f=await savedResumeFixture({replacement:true}),sends=f.state.sends,estimates=f.state.estimates,before=[...f.values];
 if(predecessor==='pending')f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'pending'});
 if(predecessor==='unknown')f.validations.set(f.originalHash,{result:'invalid',reason:['Existing nullifier']});
 if(predecessor==='canonical')f.receipts.set(f.originalHash,{txHash:f.originalHash,status:'checkpointed',blockNumber:1,blockHash:hex(42),executionResult:'success',transactionFee:3n});
 assert.equal((await f.app.inspectRecovery(f.prepared.intentId)).exactResume.status,'unknown');
 await assert.rejects(f.app.resumeSaved(f.prepared.intentId,{expectedTxHash:f.hash}));
 assert.equal(f.state.sends,sends);assert.equal(f.state.estimates,estimates);assert.deepEqual([...f.values],before);
});
