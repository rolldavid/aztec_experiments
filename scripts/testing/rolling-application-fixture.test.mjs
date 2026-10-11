// DEVELOPMENT UNIT FIXTURES. No actual chain/proof/browser acceptance is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {classifyRollingApplicationFootprint,recordRollingFundingFailure,assertRollingApplicationViews,assertRollingPublicFootprint,closeRollingResources,loadRollingFixtureSDK,observeRollingReadiness} from './rolling-application-fixture.mjs';
import {createRollingProjection} from '../../shared/rolling/public-projection.mjs';
import {createFileJournalStorage} from '../../apps/src/billboard/user/transaction-journal-store.mjs';
import {createEncryptedJournalSlot} from '../../shared/journal-record.mjs';
const ids={nameId:'2',subboardId:'3',rootId:'4',replyId:'5'};
const fields=(s,n)=>{const bytes=Buffer.from(s);return Array.from({length:n},(_,i)=>{const part=Buffer.alloc(31);bytes.subarray(i*31,(i+1)*31).copy(part);return BigInt('0x'+part.toString('hex')).toString();});};
function projectionFixture(change=()=>{}) {
  const events=[
    ['MainPolicyPublished',{version:'1',rules:fields('No threats.',32),length:'11'}],
    ['NameRegistered',{name_id:'2',first:fields('River',2),first_length:'5',last:fields('Stone',2),last_length:'5'}],
    ['SubboardCreated',{subboard_id:'3',main_policy_version:'1',slug:fields('application-test',2),slug_length:'16',name:fields('Application test',3),name_length:'16',description:fields('Real application acceptance',16),description_length:'27',rules:fields('Be helpful.',32),rules_length:'11'}],
    ['PostPublished',{id:'4',record:{name_id:'2',subboard:'3',parent:'0',root:'4',kind:'1',reference:'0'},main_policy_version:'1',local_policy_version:'1',message:fields('A real application root',32),length:'23',timestamp:'1'}],
    ['PostPublished',{id:'5',record:{name_id:'2',subboard:'3',parent:'4',root:'4',kind:'1',reference:'0'},main_policy_version:'1',local_policy_version:'1',message:fields('A real application reply',32),length:'24',timestamp:'2'}],
    ['LikeChanged',{post:'5',tag:'6',active:true,count:'1'}],
  ].map(([type,payload],i)=>({type,payload,scope:{unitFixture:true},position:{blockNumber:String(i+1),blockHash:'mock-'+i,txHash:'mock-'+i,txIndexWithinBlock:'0',logIndexWithinTx:'0'}}));
  change(events);
  // Deliberately NOT the SDK authenticated decoder: pure projection fixture.
  const projection=createRollingProjection({isValidatedEvent:e=>events.includes(e)});
  for(const event of events)projection.stage([event]).apply();
  return projection;
}
test('labelled projection fixture checks all five resulting views and bounded pages',()=>{
  const actual=assertRollingApplicationViews(projectionFixture(),ids);assert.equal(actual.thread.posts.length,2);assert.equal(actual.feed.posts[0].id,'5');
});
test('actual pure projection refuses wrong thread root before view acceptance',()=>{
  assert.throws(()=>projectionFixture(events=>events[4].payload.record.root='9'));
});
test('view acceptance rejects changed content, name, like total and bot impersonation',()=>{
  assert.throws(()=>assertRollingApplicationViews(projectionFixture(events=>events[4].payload.message=fields('X real application reply',32)),ids));
  assert.throws(()=>assertRollingApplicationViews(projectionFixture(),{...ids,nameId:'77'}));
  assert.throws(()=>projectionFixture(events=>events[5].payload.count='2'));
  assert.throws(()=>projectionFixture(events=>{events[4].payload.record.kind='4';events[4].payload.record.name_id='0';}));
});
function footprint(){return {sharedFeePayer:true,counts:{publicDataWrites:63},rolePresence:Object.fromEntries(['feePayer','publicCallSenders','publicCallTargets','publicCallCalldata','publicWriteSlots','publicWriteValues','publicLogContracts','publicLogFields'].map(k=>[k,{author:false}]))};}
test('public acceptance rejects each human-address category and excess writes',()=>{
  assertRollingPublicFootprint(footprint());
  for(const key of Object.keys(footprint().rolePresence)){const f=footprint();f.rolePresence[key].author=true;assert.throws(()=>assertRollingPublicFootprint(f));}
  const f=footprint();f.counts.publicDataWrites=64;assert.throws(()=>assertRollingPublicFootprint(f));
  f.counts.publicDataWrites=1;f.sharedFeePayer=false;assert.throws(()=>assertRollingPublicFootprint(f));
});
test('cleanup attempts every owner even after prior failure and preserves failure identity',async()=>{
  const seen=[],state={},error=new Error('labelled fixture failure');
  await assert.rejects(closeRollingResources([['pxe',async()=>{seen.push('pxe');throw error;}],['service',async()=>seen.push('service')],['rpc',async()=>seen.push('rpc')]],state),e=>e instanceof AggregateError&&e.errors[0]===error);
  assert.deepEqual(seen,['pxe','service','rpc']);assert.deepEqual(state,{pxe:false,service:true,rpc:true});
});
test('real file storage encrypts prepared operation, reopens and rejects ciphertext tampering',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-journal-unit-'));
  try{
    const options={walletSecret:'0x'+'0'.repeat(63)+'1',walletSalt:'2',scopeText:'labelled unit private workflow',keyDomain:'ROLLING_WORKFLOW_V1'};
    const first=await createEncryptedJournalSlot({...options,storage:createFileJournalStorage(directory)});
    const value={status:'prepared',privateMarker:'UNIT_PRIVATE_INTENT',nonce:'7'};
    await first.write(await first.read(),value);
    const storage=createFileJournalStorage(directory),keys=await storage.keys();assert.equal(keys.length,1);
    const ciphertext=await storage.read(keys[0]);assert(!ciphertext.includes(value.privateMarker));assert(!ciphertext.includes(options.walletSecret));
    const reopened=await createEncryptedJournalSlot({...options,storage});assert.deepEqual((await reopened.read()).value,value);
    const wrong=await createEncryptedJournalSlot({...options,walletSalt:'3',storage});await assert.rejects(wrong.read(),{code:'BB_JOURNAL_INVALID'});
    const data=JSON.parse(ciphertext);data.data=(data.data[0]==='0'?'1':'0')+data.data.slice(1);await storage.compareAndSwap(keys[0],ciphertext,JSON.stringify(data));
    await assert.rejects(reopened.read(),{code:'BB_JOURNAL_INVALID'});
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('native fixture facade imports genuine shared factories and rejects unconstructed wallet/PXE brands',async()=>{
  const sdk=await loadRollingFixtureSDK(),privatePXE=await import('../../shared/private-pxe.mjs'),trusted=await import('../../shared/trusted-private-node.mjs');
  assert.equal(sdk.createPXE,privatePXE.createPXE);assert.equal(sdk.isPrivatePXEForNode,privatePXE.isPrivatePXEForNode);
  assert.equal(sdk.createTrustedPrivateNode,trusted.createTrustedPrivateNode);assert.equal(sdk.isTrustedPrivateNode({}),false);
  assert.equal(sdk.isPrivatePXEForNode({node:{}},{}),false);
  await import('../../apps/src/billboard/user/engine.js');assert.equal(globalThis.BillboardPrivateFeeRouting.isPrivateWalletForNode({aztecNode:{}},{}),false);
});
test('fixture uses sole real journal send path, five actions and canonical decoder rebuild',async()=>{
  const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
  assert.equal((source.match(/await withC01ClientMining\(/g)||[]).length,2);
  assert(source.indexOf('report.setupMining.clientMining.stopped,true')<source.indexOf("await mark('real-wall-clock-readiness')"));
  assert(source.indexOf("await mark('real-wall-clock-readiness')")<source.indexOf('observation:report.applicationMining'));
  assert.equal((source.match(/await prepareW01PrivateFees\(/g)||[]).length,2);
  assert(source.includes("if(multi){fundingRole='b';feesB=await prepareW01PrivateFees"));
  assert(source.includes("assert(!feesB.authorAccount.address.equals(owner))"));
  for(const type of ['name','subboard','post','reply','like'])assert(source.includes(`await action({type:'${type}'`));
  assert(source.includes('app.submitPrepared(prepared.intentId)'));assert(source.includes('actor.application.reconcile(actorIntents.get(actor))'));
  assert(source.includes('for(const hash of hashes)rebuilt.stage(await decoder.decodeTransaction(ctx.node,hash)).apply()'));
  assert(!source.includes('setTime('));assert(!source.includes('nowSeconds:'));assert(!source.includes('runPrivateBokFixture('));
  assert(source.includes('proofsEnabled:real,allowLocalDev:true'));
  assert(source.includes("observation:report.applicationMining,mode:'real-wall',deadlineAt:ctx.applicationDeadlineAt"));
  for(const phase of ['node-rpc-startup','trusted-service-startup','trusted-client-construction','application-pxe'])assert(source.includes("mark('"+phase+"')"));
  assert(source.includes('assert.equal(info.l1ChainId,31337);assert.equal(info.realProofs,real)'));
  assert(source.includes("proofs:real?'real':'disabled'"));
  assert(!source.includes('allowLocalDev:!real'));
  assert(source.includes('proverJobs.completed,5'));assert(source.includes('rollingApplicationObservation=report'));
});

// These injected nodes/inspectors are diagnostic-only unit fixtures, not SDK acceptance.
test('public readiness observations retain actual wall/lag and fixed reason, omit arbitrary error fields',async()=>{
  const secret='UNIT_SECRET_NOT_FOR_EVIDENCE',node={getSyncedL1Timestamp:async()=>BigInt(Math.floor(Date.now()/1000)+5)};
  const before=Math.floor(Date.now()/1000);let seen;
  const row=await observeRollingReadiness({node,network:{chainId:'31337'},proofsEnabled:true},async(n,options)=>{assert.equal(n,node);seen=options;throw Object.assign(Error(secret),{code:'BB_TRUSTED_NODE_STALE',cause:secret});});
  assert(row.wallSeconds>=before);assert(row.lagSeconds<0);assert.equal(row.inspectorCode,'BB_TRUSTED_NODE_STALE');
  assert.equal(seen.nowSeconds,undefined);assert.equal(seen.maxLagSeconds,undefined);assert.equal(seen.proofsEnabled,true);
  assert(!JSON.stringify(row).includes(secret));
  const absent=await observeRollingReadiness({node:{getSyncedL1Timestamp:async()=>{throw Error(secret);}},network:{}},async()=>{throw Object.assign(Error(secret),{code:secret});});
  assert.equal(absent.timestampAvailable,false);assert.equal(absent.inspectorCode,'UNCLASSIFIED');assert(!JSON.stringify(absent).includes(secret));
});
test('readiness diagnostics do not project arbitrary inspector outputs or accept nonlocal health URLs',async()=>{
  const row=await observeRollingReadiness({node:{getSyncedL1Timestamp:async()=>1n},network:{},endpoint:'https://example.invalid'},async()=>({private:'UNIT_SECRET'}));
  assert.equal(row.inspectorCode,'READY');assert.equal(row.healthUnavailable,true);assert(!JSON.stringify(row).includes('UNIT_SECRET'));
});

test('labelled local HTTP health fixture projects only public flags and bounds response size',async()=>{
  const secret='UNIT_PRIVATE_NEVER_PERSIST';let oversized=false;
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(oversized?{extra:secret.repeat(2000)}:{ready:true,proofs:'real',query:{enabled:true,ready:false,reason:'unavailable',secret},private:secret}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const input={node:{getSyncedL1Timestamp:async()=>1n},network:{},endpoint:`http://127.0.0.1:${server.address().port}`};
    const row=await observeRollingReadiness(input,async()=>{});
    assert.deepEqual(row.health,{status:200,ready:true,proofs:'real',queryEnabled:true,queryReady:false,queryReason:'unavailable'});
    assert(!JSON.stringify(row).includes(secret));oversized=true;
    const bounded=await observeRollingReadiness(input,async()=>{});assert.equal(bounded.healthUnavailable,true);assert(!JSON.stringify(bounded).includes(secret));
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});

test('native loader cleanup remains after PXE and prover owners, including their failures',async()=>{
  const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
  assert(source.indexOf('nativeArtifacts=installRollingNativeArtifacts()')<source.indexOf('const sdkModule=await loadRollingFixtureSDK()'));
  assert(source.includes("'scripts/testing/rolling-native-artifacts.mjs'"));
  assert(source.indexOf("['applicationActorA'")<source.indexOf("['nativeArtifactLoader'"));
  assert(source.indexOf("['proverAndQuery'")<source.indexOf("['nativeArtifactLoader'"));
  assert(source.includes('nativeArtifacts.verify();report.nativeArtifacts=nativeArtifacts.observation()'));
  const {installRollingNativeArtifacts}=await import('./rolling-native-artifacts.mjs'),adapter=installRollingNativeArtifacts();
  const sentinel=Error('labelled PXE cleanup failure'),observation={};
  await assert.rejects(closeRollingResources([['pxe',async()=>{throw sentinel;}],['nativeArtifacts',()=>adapter.close()]],observation),e=>e.errors[0]===sentinel);
  assert.equal(adapter.observation().closed,true);assert.equal(observation.nativeArtifacts,true);
});

// Fault-injected public funding evidence; no actual payment in this unit test.
test('second actor paid setup failure retains first funding history and all cleanup attempts',async()=>{
 const paidA={funding:{l1TxHash:'synthetic-paid-a'},passed:true},paidB={funding:{l1TxHash:'synthetic-paid-b'},walletCleanup:'closed',passed:false};
 const report={privateFees:paidA,cleanup:{}};recordRollingFundingFailure(report,'b',paidB);
 assert.equal(report.privateFees,paidA);assert.equal(report.secondPrivateFees,paidB);assert.equal(report.fundingFailure.observation,paidB);
 const seen=[];await closeRollingResources([['fundingWallet',async()=>seen.push('a')],['remainingService',async()=>seen.push('service')]],report.cleanup);
 assert.deepEqual(seen,['a','service']);assert.deepEqual(report.cleanup,{fundingWallet:true,remainingService:true});
 const later={passed:false};recordRollingFundingFailure(report,undefined,later);assert.equal(report.privateFees,paidA);assert.equal(report.secondPrivateFees,paidB);
});

test('actual SDK footprint composition uses both supported human roles',async()=>{
 const {Tx,TxEffect,HashedValues}=await import('@aztec-labs/stdlib/tx');
 const {AztecAddress}=await import('@aztec-labs/stdlib/aztec-address');const {Fr}=await import('@aztec-labs/foundation/curves/bn254');
 const tx=Tx.random(),effect=TxEffect.empty(),owner=AztecAddress.fromBigIntUnsafe(101n),otherOwner=AztecAddress.fromBigIntUnsafe(102n),payer=AztecAddress.fromBigIntUnsafe(202n),board=AztecAddress.fromBigIntUnsafe(303n);
 effect.txHash=tx.getTxHash();tx.data.feePayer=payer;
 tx.publicFunctionCalldata.push(new HashedValues([owner.toField(),otherOwner.toField()],new Fr(600)));
 const result=classifyRollingApplicationFootprint({tx,effect,owner,otherOwner,payer,board});
 assert.equal(result.sharedFeePayer,true);assert.equal(result.rolePresence.publicCallCalldata.author,true);assert.equal(result.rolePresence.publicCallCalldata.otherAuthor,true);
 for(const key of ['author','otherAuthor'])assert.equal(result.rolePresence.feePayer[key],false);
});
