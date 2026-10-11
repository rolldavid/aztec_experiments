// DEVELOPMENT UNIT FIXTURES. No actual chain/proof/browser acceptance is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertRollingApplicationViews,assertRollingPublicFootprint,closeRollingResources,loadRollingFixtureSDK} from './rolling-application-fixture.mjs';
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
  assert.equal((source.match(/await prepareW01PrivateFees\(/g)||[]).length,1);
  for(const type of ['name','subboard','post','reply','like'])assert(source.includes(`await action({type:'${type}'`));
  assert(source.includes('app.submitPrepared(prepared.intentId)'));assert(source.includes('app.reconcile(lastIntent)'));
  assert(source.includes('for(const hash of hashes)rebuilt.stage(await decoder.decodeTransaction(ctx.node,hash)).apply()'));
  assert(!source.includes('setTime('));assert(!source.includes('nowSeconds:'));assert(!source.includes('runPrivateBokFixture('));
  assert(source.includes('proverJobs.completed,5'));assert(source.includes('rollingApplicationObservation=report'));
});
