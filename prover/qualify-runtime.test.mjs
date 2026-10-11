// Pure fake/filesystem unit coverage; no actual Linux/node/proof qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRelease,validateQualification,loopback,exerciseFreshness,expectedClientRejection} from './qualify-runtime.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const config=()=>({service:{applicationProfile:'legacy',proofs:'real',host:'127.0.0.1',port:0,chainId:'11155111',rollupVersion:'2914217885',board:'0x'+'01'.repeat(32),origins:[],queryNode:{url:'http://127.0.0.1:8080',rollupAddress:'0x'+'02'.repeat(20),maxLagSeconds:2}},adminUrl:'http://127.0.0.1:8880'});
test('pure configuration: only actual-network legacy real query qualification',()=>{
  assert.deepEqual(validateQualification(config()),{maxLagSeconds:2,recoveryTimeoutMs:180000});
  for(const change of [c=>c.service.proofs='disabled',c=>c.service.applicationProfile='rolling',c=>c.service.host='0.0.0.0',c=>c.service.port=8081,c=>c.service.chainId='31337',c=>c.service.queryNode.maxLagSeconds=121,c=>c.service.board='0x'+'00'.repeat(32),c=>c.service.bbPath='/override',c=>c.service.apiKey='PRIVATE_SENTINEL',c=>c.adminUrl='https://example.com/',c=>c.recoveryTimeoutMs=180001]){const c=config();change(c);assert.throws(()=>validateQualification(c));}
});
test('pure configuration: reject external, authenticated and redirected-path admin/upstream endpoints',()=>{
  for(const url of ['http://example.com','http://127.0.0.1/a','http://secret@127.0.0.1','http://127.0.0.1?token=secret','http://127.0.0.1#x','file:///tmp/x'])assert.throws(()=>loopback(url));
  assert.equal(loopback('http://[::1]:8880'),'http://[::1]:8880/');
});
async function packageFixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-unit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const files={};for(const name of ['prover/qualify-runtime.mjs','node/bin/node','toolchain.json','shared/trusted-private-node.mjs','prover/service.mjs','prover/rolling-artifacts.json']){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});const bytes=Buffer.from('FAKE '+name);await fs.writeFile(path.join(root,name),bytes);files[name]=sha(bytes);}
  const manifest={schemaVersion:1,platform:'linux-x64',applicationProfile:'rolling',sourceCommit:'a'.repeat(40),files};
  const write=async()=>{const raw=JSON.stringify(manifest);await fs.writeFile(path.join(root,'prover-release.json'),raw);return sha(raw);};
  return {root,manifest,write,digest:await write()};
}
test('fake package: every manifest file checked and external manifest digest required',async t=>{
  const f=await packageFixture(t);assert.deepEqual(await verifyRelease(f.root,f.digest),{manifestSha256:f.digest,sourceCommit:'a'.repeat(40),fileCount:6});
  await assert.rejects(verifyRelease(f.root,'0'.repeat(64)));await fs.writeFile(path.join(f.root,'node/bin/node'),'tampered');await assert.rejects(verifyRelease(f.root,f.digest));
});
test('fake package: missing helper, path traversal and external symlink cannot qualify',async t=>{
  const f=await packageFixture(t);delete f.manifest.files['shared/trusted-private-node.mjs'];await assert.rejects(verifyRelease(f.root,await f.write()));
  f.manifest.files['shared/trusted-private-node.mjs']=sha('FAKE shared/trusted-private-node.mjs');f.manifest.files['../outside']=sha('x');await assert.rejects(verifyRelease(f.root,await f.write()));delete f.manifest.files['../outside'];
  await fs.unlink(path.join(f.root,'shared/trusted-private-node.mjs'));const outside=path.join(f.root,'..',path.basename(f.root)+'-outside');await fs.writeFile(outside,'FAKE shared/trusted-private-node.mjs');t.after(()=>fs.rm(outside,{force:true}));await fs.symlink(outside,path.join(f.root,'shared/trusted-private-node.mjs'));await assert.rejects(verifyRelease(f.root,await f.write()));
});
function fakeFreshness({pauseError,staleCode='BB_TRUSTED_NODE_STALE',resumeError,neverRecover=false,rejectError}={}){
  let clock=100000,paused=false,resumed=false;const events=[],observation={};
  const stamp=()=>paused||!resumed?100n:neverRecover?100n:BigInt(Math.floor(clock/1000));
  const args={observation,maxLagSeconds:2,recoveryTimeoutMs:3000,now:()=>clock,wait:async ms=>{events.push(['wait',ms]);clock+=ms;},
    node:{getSyncedL1Timestamp:async()=>stamp()},admin:{pauseSync:async()=>{events.push('pause');paused=true;if(pauseError)throw pauseError;},resumeSync:async()=>{events.push('resume');if(resumeError)throw resumeError;paused=false;resumed=true;}},
    inspect:async()=>{if(paused)throw Object.assign(Error('PRIVATE_SENTINEL'),{code:staleCode});return {ready:true,syncedL1Timestamp:String(stamp())};},
    health:async()=>({query:{enabled:true,ready:!paused}}),rejectedQuery:async()=>{events.push('rejected');if(rejectError)throw rejectError;assert(paused);}};
  return {args,events,observation};
}
test('pure fake freshness: genuine elapsed wait, stale rejection, supported resume and advanced timestamp',async()=>{
  const f=fakeFreshness();assert.deepEqual(await exerciseFreshness(f.args),{paused:true,stale:true,queriesRejected:true,resumed:true,recovered:true});assert.deepEqual(f.events,['pause',['wait',3000],'rejected','resume']);
});
test('pure fake freshness: other unready categories cannot substitute for stale; resume retained on failure',async()=>{
  const f=fakeFreshness({staleCode:'BB_TRUSTED_NODE_UNSYNCED'});await assert.rejects(exerciseFreshness(f.args));assert(f.observation.resumed);assert(!f.observation.stale);assert(!JSON.stringify(f.observation).includes('PRIVATE_SENTINEL'));
});
test('pure fake freshness: failed pause still attempts resume exactly once',async()=>{
  const error=Error('PRIVATE_SENTINEL'),f=fakeFreshness({pauseError:error});await assert.rejects(exerciseFreshness(f.args),e=>e===error);assert.deepEqual(f.events,['pause','resume']);assert(f.observation.resumed);assert(!JSON.stringify(f.observation).includes(error.message));
});
test('pure fake freshness: failed query rejection or recovery cannot pass',async()=>{
  const f=fakeFreshness({rejectError:Error('PRIVATE_SENTINEL')});await assert.rejects(exerciseFreshness(f.args));assert(f.observation.resumed);assert(!f.observation.queriesRejected);
  const stalled=fakeFreshness({neverRecover:true});await assert.rejects(exerciseFreshness(stalled.args));assert(!stalled.observation.recovered);assert(stalled.observation.resumed);
});
test('pure fake freshness: failed resume remains failure with bounded safe observation',async()=>{
  const error=Error('PRIVATE_SENTINEL'),f=fakeFreshness({resumeError:error});await assert.rejects(exerciseFreshness(f.args),e=>e===error);assert(!f.observation.resumed);assert(!f.observation.recovered);assert(!JSON.stringify(f.observation).includes(error.message));
});

test('fake package: official-style internal symlink remains hash-bound within release',async t=>{
  const f=await packageFixture(t);await fs.mkdir(path.join(f.root,'node/lib'),{recursive:true});await fs.writeFile(path.join(f.root,'node/lib/npm.mjs'),'FAKE NPM');await fs.symlink('../lib/npm.mjs',path.join(f.root,'node/bin/npm'));f.manifest.files['node/bin/npm']=sha('FAKE NPM');f.manifest.files['node/lib/npm.mjs']=sha('FAKE NPM');assert.equal((await verifyRelease(f.root,await f.write())).fileCount,8);
});

test('fake package: added nested dependency invalidates complete file set after a passing check',async t=>{
  const f=await packageFixture(t);await verifyRelease(f.root,f.digest);
  const extra=path.join(f.root,'prover/node_modules/extra/index.mjs');await fs.mkdir(path.dirname(extra),{recursive:true});await fs.writeFile(extra,'UNMANIFESTED RUNTIME');
  await assert.rejects(verifyRelease(f.root,f.digest));await fs.rm(extra);await verifyRelease(f.root,f.digest);
});
test('fake package: actual inventory walk rejects directory symlinks and excessive depth',async t=>{
  const f=await packageFixture(t);await fs.symlink('../prover',path.join(f.root,'node/alias'));await assert.rejects(verifyRelease(f.root,f.digest));await fs.unlink(path.join(f.root,'node/alias'));
  await fs.mkdir(path.join(f.root,...Array(65).fill('d')),{recursive:true});await assert.rejects(verifyRelease(f.root,f.digest));
});
test('pure rejection policy: identity must never pass for transient unavailable errors',()=>{
  for(const kind of ['wrong-chain','wrong-version','wrong-rollup']){
    assert(expectedClientRejection(kind,{code:'BB_TRUSTED_NODE_IDENTITY'}));
    for(const code of ['BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_CONFIG','BB_TRUSTED_NODE_STALE',undefined])assert.equal(expectedClientRejection(kind,{code}),false);
  }
  assert(expectedClientRejection('stale',{code:'BB_TRUSTED_NODE_UNAVAILABLE'}));
  assert.equal(expectedClientRejection('stale',{code:'BB_TRUSTED_NODE_IDENTITY'}),false);
  assert(expectedClientRejection('proof-config-floor',{code:'BB_TRUSTED_NODE_CONFIG'}));
  assert.equal(expectedClientRejection('proof-config-floor',{code:'BB_TRUSTED_NODE_UNAVAILABLE'}),false);
  assert.equal(expectedClientRejection('unknown',{}),false);
});
