// Development fakes: no proving, network, funding or real transaction acceptance.
// Real pinned ABI encoding and encrypted CAS journal are exercised below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {encodeArguments,loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {createRollingApplication} from './application.mjs';
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
function fixture(){
  const state={calls:[],sends:0,fee:10n,outcome:null,privateReads:[],failSend:false,failCAS:false,guard:true,policy:1,estimates:0};
  const values=new Map();const privateStore={read:async k=>values.get(k)??null,compareAndSwap:async(k,old,next)=>{
    if(state.failCAS||values.get(k)!==old&&!(old===null&&!values.has(k)))throw Error('CAS conflict');values.set(k,next);
  }};
  const board={methods:new Proxy({},{get:(_,name)=>(...args)=>({name,args,simulate:async()=>{
    state.privateReads.push({name,args});
    const replies={owned_names:[5n,0n,0n,0n,0n,0n,0n,0n],get_deposit_ids:[9n,0n,0n,0n,0n,0n,0n,0n,0n,0n],
      main_policy:[BigInt(state.policy),1n],effective_policy:[BigInt(state.policy),1n,1n,2n,false],get_screen_hints:state.hints??[null,null]};
    return {result:replies[name]};
  }})})};
  const journal={assertCanStart:async()=>{},inspectOutcome:async()=>state.outcome,inspect:async()=>state.outcome};
  const owner=new AztecAddress(new Fr(3n));
  const wallet={getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),sendTx:async(payload,opts)=>{
    state.sends++;state.sent={payload,opts};assert.ok([...values.values()].every(x=>!x.includes('Private Sentinel')));
    assert.equal(opts.transactionJournal,journal);if(state.failSend)throw Error('unknown after send');
    state.outcome={operation:opts.journalOperation,outcome:'success',txHash:hex(77)};return {receipt:{}};
  }};
  const node={};wallet.aztecNode=node;let random=100n;
  const sdk={Fr:class extends Fr {static random(){return new Fr(random++);}},AztecAddress,encodeArguments,Contract:{at:()=>board},isTrustedPrivateNode:n=>n===node,
    inspectTrustedNode:async()=>{if(!state.guard)throw Error('stale trusted node');},
    preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async input=>{
      await input.guard();state.estimates++;state.calls.push(input.interaction);
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
    {type:'like',post:'10'},{type:'unlike',post:'10'},{type:'withdraw',deposit:'9'}];
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
  const f=fixture();assert.deepEqual(await f.app.ownedIdentities({cursor:8}),{identities:[hex(5)],nextCursor:null});
  assert.equal(f.state.privateReads[0].args[1],8);
  const status=await f.app.readAccountStatus();assert.equal(status.status,'fee-ready');assert.equal(status.postEligibility,'requires-action-simulation');
  f.state.guard=false;await assert.rejects(f.app.ownedIdentities());await assert.rejects(f.app.readAccountStatus());
});
test('reconcile uses exact operation identity and preserves reverted outcomes',async()=>{
  const f=fixture(),p=await f.app.prepare({type:'like',post:'5'});f.state.failSend=true;await assert.rejects(f.app.submitPrepared(p.intentId));
  f.state.outcome={operation:'different',outcome:'success',txHash:hex(88)};assert.equal((await f.app.reconcile(p.intentId)).status,'unknown');
  f.state.outcome={operation:`ROLLING_WORKFLOW_V1:${p.intentId}`,outcome:'reverted',txHash:hex(77)};
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
