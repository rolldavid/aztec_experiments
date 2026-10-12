import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {applicationNativeProfile} from './c01-native-profile.mjs';
test('private prover profile defaults to one and explicitly supports two',()=>{
  assert.deepEqual(applicationNativeProfile('/private/tmp/test',{}),{threads:1,bbPath:'/private/tmp/test/bb-one-thread'});
  for(const threads of ['1','2']) assert.deepEqual(applicationNativeProfile('/private/tmp/test',{C01_APPLICATION_BB_THREADS:threads}),{threads:Number(threads),bbPath:`/private/tmp/test/bb-${threads==='1'?'one-thread':'two-threads'}`});
});
test('invalid counts and relative directories fail before singleton initialization',()=>{
  for(const value of ['',0,1,2,'0','3','02',' 2','2\n','auto',null]) assert.throws(()=>applicationNativeProfile('/private/tmp/test',{C01_APPLICATION_BB_THREADS:value}));
  for(const directory of ['', 'relative',undefined,1])assert.throws(()=>applicationNativeProfile(directory,{}));
});
test('scenario resource choices retain established native budgets',async()=>{
 const {getScenario}=await import('./testing/scenarios.mjs');
 assert.equal(getScenario('contention').applicationThreads,2);
 assert.equal(getScenario('rolling-notification-browser').applicationThreads,2);
 for(const name of ['browser-firefox-post','browser-webkit-post','browser-post','browser-journey','browser-post-recovery','private-fees','censor-commands'])assert.equal(getScenario(name).applicationThreads,1);
});

test('local timing has an SDK-valid build window and Inbox readiness headroom',async()=>{
 const {LOCAL_TIMING}=await import('./testing/fixture-worker.mjs');
 const {buildProposerTimetable}=await import('@aztec-labs/stdlib/timetable');
 const timetable=buildProposerTimetable(LOCAL_TIMING,{slotDuration:LOCAL_TIMING.aztecSlotDuration,ethereumSlotDuration:LOCAL_TIMING.ethereumSlotDuration,l1GenesisTime:0n});
 assert(timetable.getMaxBlocksPerCheckpoint()>=1);
 assert.equal(LOCAL_TIMING.inboxLag,2);
 const nominalBridgeSeconds=(LOCAL_TIMING.inboxLag+1)*LOCAL_TIMING.aztecSlotDuration+LOCAL_TIMING.blockDurationMs/1000+LOCAL_TIMING.ethereumSlotDuration;
 assert(nominalBridgeSeconds<20,'Local protocol delay must fit the unchanged browser readiness bound');
});

// Execute the actual option/assertion blocks with labelled singleton doubles.
// No native proof or wallet acceptance is claimed by these composition checks.
test('collateral claim preserves selected profile and rejects stale singleton before wallet work',async()=>{
 const source=await fs.readFile(new URL('./c01-deposit-flow.mjs',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('    const native='),source.indexOf("    mark(ownsWallet?'reopen-claim-wallet'"));assert(block);
 const run=new Function('directory','applicationNativeProfile','BackendType','Barretenberg','assert',block+'return native;');
 for(const threads of ['1','2']){
  const profile=directory=>applicationNativeProfile(directory,{C01_APPLICATION_BB_THREADS:threads}),expected={backend:'native',...profile('/private/tmp/test')};
  let options={...expected};const bb={getSingleton:()=>({options})};
  assert.deepEqual(run('/private/tmp/test',profile,{NativeUnixSocket:'native'},bb,assert),expected);
  for(const key of ['backend','bbPath','threads']){options={...expected,[key]:'wrong'};assert.throws(()=>run('/private/tmp/test',profile,{NativeUnixSocket:'native'},bb,assert));}
 }
});
test('private-fee wallet open and reopen honor both profiles and reject singleton changes before allocation',async()=>{
 const source=await fs.readFile(new URL('./w01-unfunded-wallet.mjs',import.meta.url),'utf8');
 const block=source.slice(source.indexOf(' const open='),source.indexOf(' const close='));assert(block);
 const make=new Function('directory','applicationNativeProfile','BackendType','Barretenberg','assert','EmbeddedWallet','applicationProver','node','persistentDirectory',block+'return open;');
 for(const threads of ['1','2'])for(const persistentDirectory of [undefined,'/private/tmp/test/wallet']){
  const profile=directory=>applicationNativeProfile(directory,{C01_APPLICATION_BB_THREADS:threads}),expected={backend:'native',...profile('/private/tmp/test')};
  let options={...expected};const calls=[],bb={getSingleton:()=>({options})},node={};
  const open=make('/private/tmp/test',profile,{NativeUnixSocket:'native'},bb,assert,{create:async(n,o)=>{assert.equal(n,node);calls.push(o);return {}; }},x=>x,node,persistentDirectory);
  await open();await open();assert.equal(calls.length,2);
  for(const c of calls){assert.deepEqual(c.pxe.proverOrOptions,expected);assert.equal(c.ephemeral,persistentDirectory===undefined);assert.equal(c.pxe.dataDirectory,persistentDirectory);}
  for(const key of ['backend','bbPath','threads']){options={...expected,[key]:'wrong'};assert.throws(()=>open());assert.equal(calls.length,2);}
 }
});
