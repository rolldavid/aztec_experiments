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
  assert.equal((source.match(/await withC01ClientMining\(/g)||[]).length,4); // Separate awaited recovery scopes after the original miner stops.
  assert(source.includes('assert(report.applicationMining.clientMining.stopped&&report.applicationMining.clientMining.passed&&report.applicationMining.clientMining.autominingRestored)'));
  assert(source.includes('if(recovery){await completeTrustedRecovery();'));
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

import {rollingClockDeadline} from './rolling-application-fixture.mjs';
test('measured fixture catchup covers the observed 111-second lead without changing the campaign limit',()=>{
 const now=1791761013786,target=1791761124n,end=now+350000;
 assert.equal(rollingClockDeadline({now,chainSeconds:target,campaignDeadlineAt:end}),1791761126000);
 assert(rollingClockDeadline({now,chainSeconds:target,campaignDeadlineAt:end})<=end-180000);
 assert.equal(rollingClockDeadline({now,chainSeconds:BigInt(Math.floor(now/1000)-1),campaignDeadlineAt:end}),now+2000);
 assert.throws(()=>rollingClockDeadline({now,chainSeconds:target,campaignDeadlineAt:now+290000}),/Insufficient campaign budget/);
 assert.throws(()=>rollingClockDeadline({now,chainSeconds:2n**100n,campaignDeadlineAt:end}));
});

test('actual loopback upstream fault seam rejects before forwarding and restores the same listener',async()=>{
  const {startNodeRpc}=await import('./rolling-application-fixture.mjs');
  let calls=0;const node={getBlockNumber:async()=>{calls++;return 7;},getContract:async()=>{calls++;return undefined;}};
  const rpc=await startNodeRpc(node,()=>{throw Error('Unexpected transaction');},{faults:true});
  const request=async(method,params=[])=>{const r=await fetch(rpc.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'aztec_'+method,params})});return {status:r.status,text:await r.text()};};
  try{
    assert.equal(JSON.parse((await request('getBlockNumber')).text).result,7);assert.equal(calls,1);
    rpc.setFault('unavailable');assert.equal((await request('getBlockNumber')).status,503);assert.equal(calls,1);
    assert.equal(rpc.snapshot().unavailableRequests,1);assert.equal(rpc.snapshot().forwarded.getBlockNumber,1);
    rpc.setFault('healthy');assert.equal(JSON.parse((await request('getBlockNumber')).text).result,7);assert.equal(calls,2);
    rpc.setFault('personalized-once');const address='0x'+'1'.padStart(64,'0');
    const denied=await request('getContract',[address]);assert.equal(denied.status,400);assert(JSON.parse(denied.text).error);assert.equal(calls,2);
    assert.equal(rpc.snapshot().personalizedDenied,1);assert.equal(rpc.snapshot().forwarded.getContract,undefined);
    assert.equal(JSON.parse((await request('getContract',[address])).text).result,null);assert.equal(calls,3);
    assert.equal(rpc.snapshot().forwarded.getContract,1);assert.throws(()=>rpc.setFault('fallback'));
  }finally{await rpc.close();}
  await assert.rejects(()=>fetch(rpc.url));
});

test('upstream fault control is absent from ordinary fixture listeners',async()=>{
  const {startNodeRpc}=await import('./rolling-application-fixture.mjs');const rpc=await startNodeRpc({});
  try{assert.equal(rpc.setFault,undefined);assert.equal(rpc.snapshot,undefined);}finally{await rpc.close();}
});

function recoveryWireFixture(){
  const labels=['trusted-query','trusted-proof','trusted-upstream','ordinary-node','public-reader'];
  const rows=labels.map(label=>({label,count:1,outcome:'resolved',status:200,phase:'setup',roles:label==='trusted-query'?['a','b']:[]}));
  rows.push({label:'trusted-query',count:2,outcome:'resolved',status:503,phase:'outage',roles:[]});
  for(const label of ['trusted-query','trusted-upstream'])rows.push({label,count:1,outcome:'resolved',status:200,phase:'personalized-denial',roles:['a'],methods:['aztec_getContract']});
  return {requests:9,completed:9,pending:0,unknown:0,unsupported:0,truncated:0,observerErrors:0,privacyAcceptance:'not-evaluated',rows,
    receiver:{errors:0,requests:Object.fromEntries(labels.map(label=>[label,label==='trusted-query'?4:label==='trusted-upstream'?2:1]))}};
}
test('labelled recovery observation accepts only explicit outage503 with complete receiver accounting',async()=>{
 const {assertRollingRecoveryWire}=await import('./rolling-application-fixture.mjs');assert.equal(assertRollingRecoveryWire(recoveryWireFixture(),recoverySemanticFixture()).intentionalRejections,2);
});
for(const mutation of ['ordinary-failure','wrong-phase','missing-receiver','hidden-error','pending','human-public','missing-role','absent-fault','bad-status','rejected-transport'])test('recovery observer refuses '+mutation,async()=>{
 const {assertRollingRecoveryWire}=await import('./rolling-application-fixture.mjs');const value=recoveryWireFixture();
 const bad=value.rows.at(-3);
 if(mutation==='ordinary-failure')bad.label='ordinary-node';
 if(mutation==='wrong-phase')bad.phase='setup';
 if(mutation==='missing-receiver')value.receiver.requests['trusted-query']--;
 if(mutation==='hidden-error')value.observerErrors=1;
 if(mutation==='pending')value.pending=1;
 if(mutation==='human-public')value.rows[3].roles=['a'];
 if(mutation==='missing-role')value.rows[0].roles=['a'];
 if(mutation==='absent-fault')bad.status=200;
 if(mutation==='bad-status')bad.status=500;
 if(mutation==='rejected-transport')bad.outcome='rejected';
 assert.throws(()=>assertRollingRecoveryWire(value,recoverySemanticFixture()));
});

for(const mutation of ['method','phase','count','duplicate','missing'])test('personalized denial accounting refuses '+mutation,async()=>{
 const {assertRollingRecoveryWire}=await import('./rolling-application-fixture.mjs');const value=recoveryWireFixture(),row=value.rows.at(-1);
 if(mutation==='method')row.methods=['aztec_getNotes'];
 if(mutation==='phase')row.phase='setup';
 if(mutation==='count'){row.count=2;value.receiver.requests['trusted-upstream']++;value.requests++;value.completed++;}
 if(mutation==='duplicate'){value.rows.push({...row});value.receiver.requests['trusted-upstream']++;value.requests++;value.completed++;}
 if(mutation==='missing'){value.rows.pop();value.receiver.requests['trusted-upstream']--;value.requests--;value.completed--;}
 assert.throws(()=>assertRollingRecoveryWire(value,recoverySemanticFixture()));
});

function recoverySemanticFixture(){return {passed:true,personalizedDenial:{denied:1,forwarded:0,readiness:{getNodeInfo:1,getSyncedL1Timestamp:1}},afterReadiness:[{kind:'personalized',code:'BB_TRUSTED_NODE_UNAVAILABLE',checks:{failedClosed:true,ciphertextPreserved:true,noProofOrSubmission:true,noPublicFallback:true}}]};}
for(const mutation of ['missing','denied','forwarded','readiness','code','not-failed-closed','duplicate-error','http400','wrong-role','missing-query','duplicate-query'])test('SDK batch denial conjunction refuses '+mutation,async()=>{
 const {assertRollingRecoveryWire}=await import('./rolling-application-fixture.mjs');const wire=recoveryWireFixture(),semantic=recoverySemanticFixture();
 if(mutation==='missing')delete semantic.personalizedDenial;
 if(mutation==='denied')semantic.personalizedDenial.denied=0;
 if(mutation==='forwarded')semantic.personalizedDenial.forwarded=1;
 if(mutation==='readiness')semantic.personalizedDenial.readiness.getSyncedL1Timestamp=0;
 if(mutation==='code')semantic.afterReadiness[0].code='BB_TRUSTED_NODE_STALE';
 if(mutation==='not-failed-closed')semantic.afterReadiness[0].checks.failedClosed=false;
 if(mutation==='duplicate-error')semantic.afterReadiness.push(semantic.afterReadiness[0]);
 if(mutation==='http400')wire.rows.at(-1).status=400;
 if(mutation==='wrong-role')wire.rows.at(-1).roles=['b'];
 if(mutation==='missing-query'){wire.rows.splice(-2,1);wire.receiver.requests['trusted-query']--;wire.requests--;wire.completed--;}
 if(mutation==='duplicate-query'){wire.rows.push({...wire.rows.at(-2)});wire.receiver.requests['trusted-query']++;wire.requests++;wire.completed++;}
 assert.throws(()=>assertRollingRecoveryWire(wire,semantic));
});

test('installed SDK singleton batch rejects personalized RPC error with HTTP200 and zero forwarding',async()=>{
 const {startNodeRpc}=await import('./rolling-application-fixture.mjs');
 const {createSafeJsonRpcClient}=await import('@aztec-labs/foundation/json-rpc/client');
 const {AztecNodeApiSchema}=await import('@aztec-labs/stdlib/interfaces/client');
 const {AztecAddress}=await import('@aztec-labs/stdlib/aztec-address');
 let forwarded=0,status,batchLength;const rpc=await startNodeRpc({getContract:async()=>{forwarded++;return undefined;}},()=>{throw Error('Unexpected transaction');},{faults:true});
 try{
  const client=createSafeJsonRpcClient(rpc.url,AztecNodeApiSchema,{namespaceMethods:'aztec',fetch:async(host,body)=>{
   assert(Array.isArray(body));batchLength=body.length;
   const response=await fetch(host,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});status=response.status;
   return {response:await response.json(),headers:response.headers};
  }});
  rpc.setFault('personalized-once');await assert.rejects(()=>client.getContract(AztecAddress.fromBigIntUnsafe(1n)));
  assert.equal(status,200);assert.equal(batchLength,1);assert.equal(rpc.snapshot().personalizedDenied,1);assert.equal(rpc.snapshot().forwarded.getContract,undefined);assert.equal(forwarded,0);
  await client.getContract(AztecAddress.fromBigIntUnsafe(1n));assert.equal(forwarded,1);
 }finally{await rpc.close();}
});

test('partial race barrier failure preserves started actors canonical fees before rethrowing original failure',async()=>{
 const {collectRollingRaceOutcomes}=await import('./rolling-application-fixture.mjs');
 const barrier=Error('B preparation failed'),saved=[];
 await assert.rejects(collectRollingRaceOutcomes({count:1,priorErrors:[barrier],collect:async i=>{saved.push({actor:i,fee:'12',effect:'canonical'});return saved[0];}}),error=>error instanceof AggregateError&&error.errors[0]===barrier);
 assert.deepEqual(saved,[{actor:0,fee:'12',effect:'canonical'}]);
 const firstRead=Error('A receipt unavailable'),calls=[];
 await assert.rejects(collectRollingRaceOutcomes({count:2,priorErrors:[barrier],collect:async i=>{calls.push(i);if(i===0)throw firstRead;return {fee:'15'};}}),error=>error.errors[0]===barrier&&error.errors[1]===firstRead);
 assert.deepEqual(calls,[0,1]);
 assert.deepEqual(await collectRollingRaceOutcomes({count:2,collect:async i=>({fee:String(i+1)})}),[{fee:'1'},{fee:'2'}]);
});
test('terminal collision acceptance rejects late observer errors, conflicts, pending work or changed canonical match',async()=>{
 const {assertClosedCollisionObserver}=await import('./rolling-application-fixture.mjs');
 const clean={closed:true,restored:true,pending:0,errors:0,truncated:0,conflicts:0,ownershipLost:0,calls:2,observations:2,classified:1,metadataEnabled:2,metadataRestored:2,reasonAbsent:0,reasonNotSimulationError:0,classifierRejected:0};
 assertClosedCollisionObserver(clean,true);
 for(const key of ['pending','errors','truncated','conflicts','ownershipLost'])assert.throws(()=>assertClosedCollisionObserver({...clean,[key]:1},true));
 for(const key of ['closed','restored'])assert.throws(()=>assertClosedCollisionObserver({...clean,[key]:false},true));
 for(const key of ['calls','observations','classified'])assert.throws(()=>assertClosedCollisionObserver({...clean,[key]:0},true));
 for(const key of ['metadataEnabled','metadataRestored','reasonAbsent','reasonNotSimulationError','classifierRejected'])assert.throws(()=>assertClosedCollisionObserver({...clean,[key]:1},true));
 assert.throws(()=>assertClosedCollisionObserver(clean,false));
});

// Labelled orchestration doubles; original writer lifetimes and the production
// read deadline primitive are exercised, without a chain or a proof job.
test('resume failure and partial barrier still await every original writer before collection and close',async()=>{
 const {settleRollingRaceWriters,collectRollingRaceOutcomes}=await import('./rolling-application-fixture.mjs');
 const barrier=Error('partial barrier'),restart=Error('resume failed'),writer=Error('writer failed');
 let releaseA,releaseB;const calls=[];
 const a=new Promise(resolve=>{releaseA=()=>{calls.push('a-settled');resolve();};});
 const b=new Promise((_,reject)=>{releaseB=()=>{calls.push('b-settled');reject(writer);};});
 const work=(async()=>{
   const errors=await settleRollingRaceWriters({submissions:[a,b],priorErrors:[barrier],resume:async()=>{calls.push('resume');throw restart;}});
   try{await collectRollingRaceOutcomes({count:2,priorErrors:errors,collect:async i=>{calls.push('collect-'+i);return {fee:String(i+1)};}});}
   finally{calls.push('close');}
 })();
 const rejected=assert.rejects(work,error=>error instanceof AggregateError&&error.errors.length===3&&error.errors[0]===barrier&&error.errors[1]===restart&&error.errors[2]===writer);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['resume']);
 releaseB();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['resume','b-settled']);
 releaseA();await rejected;assert.deepEqual(calls,['resume','b-settled','a-settled','collect-0','collect-1','close']);
});
test('successfully resumed race settles all writers without resubmission',async()=>{
 const {settleRollingRaceWriters}=await import('./rolling-application-fixture.mjs');
 let release,resumes=0;const submission=new Promise(resolve=>{release=resolve;});
 assert.deepEqual(await settleRollingRaceWriters({submissions:[submission],resume:async()=>{resumes++;release();}}),[]);
 assert.equal(resumes,1);
 assert.deepEqual(await settleRollingRaceWriters({submissions:[],resume:async()=>{resumes++;}}),[]);assert.equal(resumes,2);
});
for(const stalled of ['receipt','effect'])test('bounded '+stalled+' read retains other actor fees and has no late evidence writer',async()=>{
 const {collectRollingRaceOutcomes}=await import('./rolling-application-fixture.mjs');
 const {boundedTransactionRead}=await import('../../shared/transaction-outcomes.mjs');
 let release;const stalledRead=new Promise(resolve=>{release=resolve;});const reads=[],rows=[{},{}],fees=[];
 await assert.rejects(collectRollingRaceOutcomes({count:2,collect:async i=>{
   const row=rows[i];row.receipt='unknown';row.effect='unknown';
   const receipt=await boundedTransactionRead(()=>{reads.push('receipt-'+i);return i===0&&stalled==='receipt'?stalledRead:{fee:String(i+1)};},20);
   row.receipt='canonical';fees.push(receipt.fee);
   const effect=await boundedTransactionRead(()=>{reads.push('effect-'+i);return i===0&&stalled==='effect'?stalledRead:{id:i};},20);
   row.effect='available';return effect;
 }}),error=>error instanceof AggregateError&&error.errors.length===1&&error.errors[0].code==='BB_SUBMISSION_UNKNOWN');
 assert.deepEqual(fees,stalled==='receipt'?['2']:['1','2']);assert.equal(rows[1].effect,'available');
 assert(reads.includes('receipt-1')&&reads.includes('effect-1'));
 const frozen=JSON.stringify({rows,fees,reads});release({fee:'late',id:9});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(JSON.stringify({rows,fees,reads}),frozen);
});
test('race proof admission allows 90 seconds before cutoff and preserves the separate 90-second cleanup reserve',async()=>{
 const {requireRollingRaceProofBudget}=await import('./rolling-application-fixture.mjs');
 const now=1000000,end=now+180000,confirmation=end-90000;
 requireRollingRaceProofBudget(confirmation,now);
 assert.throws(()=>requireRollingRaceProofBudget(confirmation,now+1),/Insufficient remaining race proof budget/);
 let submissions=0;assert.throws(()=>{requireRollingRaceProofBudget(confirmation,now+1);submissions++;});assert.equal(submissions,0);
 const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
 assert(source.includes('...(race?{confirmationDeadlineAt:ctx.applicationDeadlineAt-90000}:{})'));
 const race=source.slice(source.indexOf('      }else if(race){'),source.indexOf('      }else if(names){'));
 assert(race.includes('requireRollingRaceProofBudget(confirmationDeadlineAt)'));
 assert(race.indexOf('requireRollingRaceProofBudget(confirmationDeadlineAt)')<race.indexOf('submissions.push('));
 assert(!race.includes('Promise.race'));assert(race.includes('settleRollingRaceWriters({submissions'));
 assert(race.includes('Date.now()<confirmationDeadlineAt'));
 assert(race.includes('sdk.boundedTransactionRead(()=>actor.journal.inspectOutcome(),3000)'));
 assert(race.includes('sdk.boundedTransactionRead(()=>ctx.node.getTxEffect(TxHash.fromString(outcome.txHash)),3000)'));
});

test('measured second race start is admitted without changing proof timeout or pre-send expiry protection',async()=>{
 const {requireRollingRaceProofBudget}=await import('./rolling-application-fixture.mjs');
 // Inputs from independent name-race-timing-604-review.json. No runtime replay.
 const applicationDeadline=525000,firstStart=297984,secondStart=321341,cutoff=applicationDeadline-90000;
 assert.equal(secondStart-firstStart,23357);assert.equal(cutoff-secondStart,113659);
 assert(cutoff-secondStart<120000,'Historical120s admission rejected this measured start');
 requireRollingRaceProofBudget(cutoff,firstStart);requireRollingRaceProofBudget(cutoff,secondStart);
 assert.throws(()=>requireRollingRaceProofBudget(cutoff,cutoff-89999));
 const actor=await fs.readFile(new URL('./rolling-application-actor.mjs',import.meta.url),'utf8');
 assert(actor.includes('timeoutMs:120000,pollMs:100'),'Real remote timeout remains120s');
 assert(actor.includes('beforeSubmit:{value:()=>{contextGuard();if(remaining()<=0)throw expired();}'));
 // The companion actor suite executes this guard through the actual engine
 // with a late-resolving proof, zero node sends and retained encrypted journal.
});


test('preference campaigns keep real proof limits, actual decoder and fresh empty-store recovery',async()=>{
 const {getScenario}=await import('./scenarios.mjs');
 for(const name of ['rolling-preference-relationships','rolling-preference-notifications']){const s=getScenario(name);assert.equal(s.deadlineMs,540000);assert.equal(s.fixtureHeapMiB,768);assert.equal(s.boardProfile,'rolling');assert.equal(s.evidenceTask,'G07');assert.equal(s.browser,'none');}
 const browser=getScenario('rolling-preference-browser');assert.equal(browser.deadlineMs,540000);assert.equal(browser.fixtureHeapMiB,768);assert.equal(browser.boardProfile,'rolling');assert.equal(browser.evidenceTask,'G07');assert.equal(browser.browser,'rolling-preferences');assert.equal(browser.browserEngine,'chromium');assert.equal(browser.applicationThreads,1);
 const sdk=await loadRollingFixtureSDK(),abi=await import('@aztec-labs/stdlib/abi');assert.equal(sdk.decodeFunctionSignature,abi.decodeFunctionSignature);assert.equal(sdk.EventSelector,abi.EventSelector);
 const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
 const cold=source.slice(source.indexOf("await mark('preference-keys-only-recovery')"),source.indexOf("await mark('canonical-projection-rebuild')"));
 const closed=cold.indexOf('await old.close()'),constructed=cold.indexOf('await makeActor(fees,role,dataDirectory,metrics)');
 assert(closed>=0&&constructed>closed,'Original actor must close before the fresh observed actor is constructed');
 assert(cold.includes('assert.deepEqual(await fs.readdir(freshPath),[])'));assert(cold.includes('indexedDB.databases()'));
 assert(cold.includes('actorIntents.delete(old)'));assert(!cold.includes('copyFile'));assert(!cold.includes('submitPrepared'));
 assert(source.indexOf("await mark('encrypted-journal-reopen')")<source.indexOf("await mark('preference-keys-only-recovery')"));
});

test('saved preference scenario retains genuine two-proof limits and exact-byte recovery path',async()=>{
 const {getScenario}=await import('./scenarios.mjs');const s=getScenario('rolling-preference-saved');
 assert.equal(s.deadlineMs,540000);assert.equal(s.fixtureHeapMiB,768);assert.equal(s.boardProfile,'rolling');assert.equal(s.evidenceTask,'G07');assert.equal(s.applicationThreads,1);assert.equal(s.browser,'none');
 const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('if(preferenceSaved){\n'),source.indexOf('}else if(preferenceReorg){'));
 assert(part.includes('exerciseRollingSavedPreference'));assert(part.includes('actorA.application.resumeSaved(id,options)'));
 assert(part.includes("await makeActor(fees,'a',dataDirectory)"));assert(part.includes('namesBefore'));
 assert(part.includes('ctx.node.isValidTx(rpc.deniedTransaction())'));assert(part.includes('await fees.verify(feeTotal)'));
 assert(part.indexOf('accountFee(outcome.txHash,receipt.transactionFee)')<part.indexOf('assert.equal(outcome.txHash,expectedHash)'));
 assert(part.includes('deniedBytes'));assert(part.includes('saved.tx.toBuffer()'));assert(part.includes('forwardedBytes'));
 assert(!part.includes('prepareReplacement'));assert(!part.includes('deleteTx'));assert(!part.includes('keys-only'));
 assert(source.includes('if(preferences&&!preferenceBrowser&&!preferenceReorg&&!preferenceSaved&&!notificationBrowser)'));
 assert(source.includes('else if(preferenceSaved){assert.equal(report.proverJobs.completed,2);assert.equal(report.proverJobs.submitted,2);}'));
});
test('actual SDK serialized Tx is persistently denied before forward, then forwarded unchanged exactly once',async()=>{
 const {startNodeRpc}=await import('./rolling-application-fixture.mjs');const {Tx}=await import('@aztec-labs/stdlib/tx');
 const {jsonStringify}=await import('@aztec-labs/foundation/json-rpc');const tx=Tx.random(),calls=[],observed=[];await tx.recomputeHash(); // Tx.random intentionally assigns an unrelated hash; RPC schema authenticates the real hash.
 const rpc=await startNodeRpc({sendTx:async value=>{calls.push(value);}},value=>observed.push(value),{faults:true});
 const send=async()=>{const response=await fetch(rpc.url,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify({jsonrpc:'2.0',id:1,method:'aztec_sendTx',params:[tx]})});return {status:response.status,body:await response.json()};};
 try{rpc.setFault('send-before-forward');for(let i=0;i<2;i++){const result=await send();assert(result.body.error);assert.equal(calls.length,0);assert.equal(observed.length,0);}
  assert.equal(rpc.snapshot().sendDenied,2);assert.equal(rpc.snapshot().forwarded.sendTx,undefined);assert(Buffer.from(rpc.deniedTransaction().toBuffer()).equals(tx.toBuffer()));
  rpc.setFault('healthy');assert.equal((await send()).status,200);assert.equal(calls.length,1);assert.equal(observed.length,1);assert(Buffer.from(calls[0].toBuffer()).equals(tx.toBuffer()));assert.equal(String(observed[0].getTxHash()),String(tx.getTxHash()));
 }finally{await rpc.close();}
 await assert.rejects(fetch(rpc.url));
});

// Execute the actual checked-in dispatch fragments, not a duplicated model of
// their flags. Continuations are labelled test doubles; this is not chain work.
test('actual saved-versus-reorg dispatch selects job counts and only initialized continuations',async()=>{
 const source=await fs.readFile(new URL('./rolling-application-fixture.mjs',import.meta.url),'utf8');
 const modes=source.match(/  const notificationBrowser=.*\n  const preferenceSaved=.*\n  const preferences=.*\n  const rejectedWithdrawal=.*\n/);assert(modes);
 const start=source.indexOf('      assert.equal(report.proverJobs.failed,0);if(recovery)');
 const end=source.indexOf('      assert.equal(report.proverJobs.running,false);',start);assert(start>0&&end>start);
 const jobs=source.slice(start,end)+'assert.equal(report.proverJobs.running,false);';
 const terminal=source.match(/if\(preferenceReorg\)await pausePreferenceBoundary\(\);report\.passed=.*?await mark\(preferenceReorg\?[^\n]+?\);/);assert(terminal);
 const completion=source.match(/    if\(preferenceReorg\)\{await completePreferenceReorg\(\);[^\n]+\}/);assert(completion);
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const run=new AsyncFunction('scenario','assert','report','pausePreferenceBoundary','completePreferenceReorg','mark','sourceBinding','nativeArtifacts',modes[0]+jobs+terminal[0]+completion[0]+'return {preferences,preferenceSaved,preferenceReorg,markerReorg};');
 for(const [scenario,count,reorg]of [['preference-saved',2,false],['preference-reorg-initial',2,true],['preference-reorg-marker',3,true],['notification-browser',4,false]]){
  const calls=[],report={proverJobs:{failed:0,completed:count,submitted:count,running:false},sourceHashes:{}};
  const flags=await run(scenario,assert,report,reorg?async()=>calls.push('pause'):undefined,reorg?async()=>calls.push('complete'):undefined,async stage=>calls.push(stage),async()=>({}),{verify:()=>calls.push('verify')});
  assert.equal(flags.preferences,true);assert.equal(flags.preferenceSaved,scenario==='preference-saved');assert.equal(flags.preferenceReorg,reorg);assert.equal(flags.markerReorg,scenario==='preference-reorg-marker');
  assert.equal(report.passed,true);assert.deepEqual(calls,reorg?['pause','preference-reorg-prepared','complete','verify','complete']:['complete']);
  report.proverJobs.completed=count+1;await assert.rejects(run(scenario,assert,report,async()=>{},async()=>{},async()=>{},async()=>({}),{verify(){}}));
 }
});

// Labelled pure server-boundary controls: not encrypted-discovery qualification.
test('recovery observation forwards exact receiver args and Promise without extra calls',async()=>{
 const {forwardRecoveryObservedNodeCall}=await import('./rolling-application-fixture.mjs');
 const {createRollingPrivateRecoveryMetrics}=await import('./rolling-private-recovery-metrics.mjs');
 const metrics=createRollingPrivateRecoveryMetrics(),argument={tags:['PRIVATE_SENTINEL']};let calls=0;
 const result=Promise.resolve([[]]);const node={getPrivateLogsByTags(arg){assert.equal(this,node);assert.equal(arg,argument);calls++;return result;}};
 assert.equal(forwardRecoveryObservedNodeCall(node,'getPrivateLogsByTags',[argument],metrics),result);
 await result;const snapshot=metrics.snapshot();assert.equal(calls,1);assert.equal(snapshot.methods.getPrivateLogsByTags.calls,1);
 assert.equal(snapshot.methods.getPrivateLogsByTags.requestedTags,1);assert.equal(snapshot.methods.getPrivateLogsByTags.pageResponses,1);
 assert.equal(snapshot.transportBytesObserved,false);assert(!JSON.stringify(snapshot).includes('PRIVATE_SENTINEL'));
});
test('recovery observation keeps rejected and synchronous errors and unobserved methods unchanged',async()=>{
 const {forwardRecoveryObservedNodeCall}=await import('./rolling-application-fixture.mjs');
 const {createRollingPrivateRecoveryMetrics}=await import('./rolling-private-recovery-metrics.mjs');
 const metrics=createRollingPrivateRecoveryMetrics(),error=new Error('PRIVATE_SENTINEL'),rejection=Promise.reject(error);let calls=0;
 const node={getBlock(){calls++;return rejection;},getBlockData(){calls++;throw error;},sendTx(value){calls++;assert.equal(this,node);return value;}};
 assert.equal(forwardRecoveryObservedNodeCall(node,'getBlock',[],metrics),rejection);await assert.rejects(rejection,e=>e===error);
 assert.throws(()=>forwardRecoveryObservedNodeCall(node,'getBlockData',[],metrics),e=>e===error);
 const value={};assert.equal(forwardRecoveryObservedNodeCall(node,'sendTx',[value],metrics),value);
 assert.equal(forwardRecoveryObservedNodeCall(node,'sendTx',[value],undefined),value);assert.equal(calls,4);
 const snapshot=metrics.snapshot();assert.equal(snapshot.methods.getBlock.rejected,1);assert.equal(snapshot.methods.getBlockData.rejected,1);
 assert(!JSON.stringify(snapshot).includes('PRIVATE_SENTINEL'));assert.equal(snapshot.counters.pending,0);
});
