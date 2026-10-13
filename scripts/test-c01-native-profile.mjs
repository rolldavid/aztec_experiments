import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {applicationNativeProfile,localApplicationInboxProfile} from './c01-native-profile.mjs';
test('development proof configuration defaults off and preserves explicit acceptance mode',async()=>{
 const {applicationProofsEnabled}=await import('./testing/proof-policy.mjs');
 const prior=process.env.BOARD_TEST_PROOFS;
 try{
  delete process.env.BOARD_TEST_PROOFS;assert.equal(applicationProofsEnabled(),false);
  const {runApplication}=await import('./testing/run-application.mjs');
  await assert.rejects(()=>runApplication('rolling-composer'),/Browser development is held/);
  process.env.BOARD_TEST_PROOFS='disabled';assert.equal(applicationProofsEnabled(),false);
  process.env.BOARD_TEST_PROOFS='real';assert.equal(applicationProofsEnabled(),true);
  for(const mode of ['', 'false', '0', 'REAL']){process.env.BOARD_TEST_PROOFS=mode;assert.throws(applicationProofsEnabled,/Invalid BOARD_TEST_PROOFS/);}
 }finally{if(prior===undefined)delete process.env.BOARD_TEST_PROOFS;else process.env.BOARD_TEST_PROOFS=prior;}
 const runner=await fs.readFile(new URL('./testing/run-application.mjs',import.meta.url),'utf8');
 assert(runner.includes("const proofMode=process.env.BOARD_TEST_PROOFS??'disabled'"));
 assert(runner.includes("applicationProofs:proofMode==='real'"));assert(runner.includes('BOARD_TEST_PROOFS:proofMode'));
 for(const name of ['./testing/fixture-worker.mjs','./c01-real-node.mjs']){
  const source=await fs.readFile(new URL(name,import.meta.url),'utf8');assert(source.includes('realProofs:applicationProofsEnabled()'));
 }
});
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

test('Inbox capacity exemption is confined to the disposable ordinary local fixture',()=>{
 const local={l1ChainId:31337,p2pEnabled:false,useAutomineSequencer:false,automineEnableProveEpoch:false,l1RpcUrls:['http://127.0.0.1:34567']};
 assert.deepEqual(localApplicationInboxProfile(local),{allowUnsafeInboxCatchupCapacity:true});
 for(const change of [{l1ChainId:11155111},{l1ChainId:'31337'},{p2pEnabled:true},{p2pEnabled:undefined},{useAutomineSequencer:true},{automineEnableProveEpoch:true},{l1RpcUrls:[]},{l1RpcUrls:[...local.l1RpcUrls,...local.l1RpcUrls]}])assert.throws(()=>localApplicationInboxProfile({...local,...change}));
 for(const url of ['https://127.0.0.1:34567','http://example.org:34567','http://127.0.0.1','http://user:password@127.0.0.1:34567','http://127.0.0.1:34567/private','http://127.0.0.1:34567/?key=value','http://127.0.0.1:34567/#value'])assert.throws(()=>localApplicationInboxProfile({...local,l1RpcUrls:[url]}));
});

test('actual SDK capacity guard rejects the short profile without its explicit local option',async()=>{
 const {Sequencer}=await import('@aztec-labs/sequencer-client');
 const {MIN_BLOCKS_FOR_INBOX_CATCHUP}=await import('@aztec-labs/stdlib/messaging');
 const {buildProposerTimetable}=await import('@aztec-labs/stdlib/timetable');
 const {LOCAL_TIMING}=await import('./testing/fixture-worker.mjs');
 const count=buildProposerTimetable(LOCAL_TIMING,{slotDuration:LOCAL_TIMING.aztecSlotDuration,ethereumSlotDuration:LOCAL_TIMING.ethereumSlotDuration,l1GenesisTime:0n}).getMaxBlocksPerCheckpoint();
 assert(count<MIN_BLOCKS_FOR_INBOX_CATCHUP);
 const warnings=[],receiver={log:{warn:(...args)=>warnings.push(args)}};
 const check=Sequencer.prototype.assertEffectiveCapacityClearsInboxBacklog;
 assert.throws(()=>check.call(receiver,{maxBlocksPerCheckpoint:MIN_BLOCKS_FOR_INBOX_CATCHUP,allowUnsafeInboxCatchupCapacity:false},count),/Rejecting sequencer configuration/);
 check.call(receiver,{maxBlocksPerCheckpoint:MIN_BLOCKS_FOR_INBOX_CATCHUP,allowUnsafeInboxCatchupCapacity:true},count);
 assert.equal(warnings.length,1);assert.equal(warnings[0][1].effectiveMaxBlocks,count);
 check.call(receiver,{maxBlocksPerCheckpoint:MIN_BLOCKS_FOR_INBOX_CATCHUP,allowUnsafeInboxCatchupCapacity:false},MIN_BLOCKS_FOR_INBOX_CATCHUP);
 assert.equal(warnings.length,1);
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
 const make=new Function('directory','applicationNativeProfile','BackendType','Barretenberg','assert','EmbeddedWallet','applicationProver','node','persistentDirectory','applicationProofsEnabled',block+'return open;');
 for(const proofsEnabled of [false,true])for(const threads of ['1','2'])for(const persistentDirectory of [undefined,'/private/tmp/test/wallet']){
  const profile=directory=>applicationNativeProfile(directory,{C01_APPLICATION_BB_THREADS:threads}),expected={backend:'native',...profile('/private/tmp/test')};
  let options={...expected};const calls=[],bb={getSingleton:()=>({options})},node={};
  const open=make('/private/tmp/test',profile,{NativeUnixSocket:'native'},bb,assert,{create:async(n,o)=>{assert.equal(n,node);calls.push(o);return {}; }},x=>x,node,persistentDirectory,()=>proofsEnabled);
  await open();await open();assert.equal(calls.length,2);
  for(const c of calls){assert.equal(c.pxe.proverEnabled,proofsEnabled);assert.deepEqual(c.pxe.proverOrOptions,expected);assert.equal(c.ephemeral,persistentDirectory===undefined);assert.equal(c.pxe.dataDirectory,persistentDirectory);}
  for(const key of ['backend','bbPath','threads']){options={...expected,[key]:'wrong'};assert.throws(()=>open());assert.equal(calls.length,2);}
 }
});
