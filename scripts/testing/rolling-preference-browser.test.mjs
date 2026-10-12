// Labelled validation/transport fixtures only. No Chromium, proof or wallet
// recovery is performed by this unit suite; genuine driver runs are parent-owned.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validateRollingPreferenceBrowserControl,createRollingPreferenceTraffic,runRollingPreferenceBrowser} from './rolling-preference-browser.mjs';
let root,envelope;
before(async()=>{
 root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rolling-preferences-unit-')));await fs.chmod(root,0o700);
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array});vm.runInContext(await fs.readFile(new URL('../../shared/wallet-backup.js',import.meta.url),'utf8'),ctx);
 envelope=JSON.stringify(await ctx.BillboardWalletBackup.encrypt({schemaVersion:1,wallet:{secretKey:'0x'+'01'.repeat(32),salt:'0'},claims:[]},'PASSWORD_PRIVATE_SENTINEL'));
});
after(async()=>{await fs.rm(root,{recursive:true,force:true});});
const origins={origin:'http://127.0.0.1:11001',trustedOrigin:'http://127.0.0.1:11002',ethereumOrigin:'http://127.0.0.1:11003'};
async function fixture(){const directory=await fs.mkdtemp(path.join(root,'case-'));await fs.chmod(directory,0o700);const backupPath=path.join(directory,'backup.json');await fs.writeFile(backupPath,envelope,{mode:0o600});return {directory,control:{browserMode:'rolling-preferences',browserEngine:'chromium',...origins,backupPath,backupPassword:'PASSWORD_PRIVATE_SENTINEL',expected:{postId:'101',postText:'PUBLIC_EXPECTATION_SENTINEL'},timeoutMs:120000}};}
test('actual encrypted keys-only envelope; strict detached primitive snapshot before filesystem awaits',async()=>{
 const {directory,control}=await fixture();const pending=validateRollingPreferenceBrowserControl(control,{directory});control.expected.postId='999';control.expected.postText='Changed';control.backupPassword='Changed';control.trustedOrigin='http://outside.invalid';control.backupPath='/tmp/secret';
 const result=await pending;assert.equal(result.expected.postId,'101');assert.equal(result.expected.postText,'PUBLIC_EXPECTATION_SENTINEL');assert.equal(result.backupPassword,'PASSWORD_PRIVATE_SENTINEL');assert.equal(result.trustedOrigin,origins.trustedOrigin);assert.equal(result.backupPath,path.join(directory,'backup.json'));assert(Object.isFrozen(result));assert(Object.isFrozen(result.expected));
});
const defects={
 mode:c=>c.browserMode='rolling-composer',engine:c=>c.browserEngine='firefox',extra:c=>c.privateKey='PRIVATE_SENTINEL',
 origin:c=>c.origin='https://external.invalid',alias:c=>c.origin='http://localhost:11001',credentials:c=>c.origin='http://secret@127.0.0.1:11001',query:c=>c.origin+='?secret=x',path:c=>c.origin+='/',repeatedOrigin:c=>c.trustedOrigin=c.origin,
 nameId:c=>c.expected.nameId='1',missingText:c=>delete c.expected.postText,zeroId:c=>c.expected.postId='0',hexId:c=>c.expected.postId='0x01',overflowId:c=>c.expected.postId='9'.repeat(77),hugeText:c=>c.expected.postText='😀'.repeat(249),surrogate:c=>c.expected.postText='\ud800',emptyText:c=>c.expected.postText='',
 shortPassword:c=>c.backupPassword='short',longPassword:c=>c.backupPassword='x'.repeat(257),deadlineExtension:c=>c.timeoutMs=120001,deadlineZero:c=>c.timeoutMs=0,deadlineNaN:c=>c.timeoutMs=NaN,pathEscape:c=>c.backupPath='/tmp/private.json',
};
for(const [name,change]of Object.entries(defects))test('labelled control rejects '+name+' with fixed error',async()=>{const {directory,control}=await fixture();change(control);await assert.rejects(validateRollingPreferenceBrowserControl(control,{directory}),e=>e.message==='Invalid private preference browser control.');});
for(const place of ['origin','expected','postText'])test('labelled accessor is not invoked: '+place,async()=>{
 const {directory,control}=await fixture();let reads=0;Object.defineProperty(place==='postText'?control.expected:control,place,{get(){reads++;throw Error('PRIVATE_SENTINEL');},enumerable:true});await assert.rejects(validateRollingPreferenceBrowserControl(control,{directory}));assert.equal(reads,0);
});
for(const defect of ['file-mode','directory-mode','symlink','raw','oversize'])test('reused private file validation rejects '+defect,async()=>{
 const {directory,control}=await fixture();if(defect==='file-mode')await fs.chmod(control.backupPath,0o644);if(defect==='directory-mode')await fs.chmod(directory,0o755);if(defect==='symlink'){const real=path.join(directory,'real.json');await fs.rename(control.backupPath,real);await fs.symlink(real,control.backupPath);}if(defect==='raw')await fs.writeFile(control.backupPath,JSON.stringify({secretKey:'PRIVATE_SENTINEL'}));if(defect==='oversize')await fs.truncate(control.backupPath,32*1024*1024+4097);await assert.rejects(validateRollingPreferenceBrowserControl(control,{directory}));
});
test('invalid control never starts browser or exposes private assertion inputs',async()=>{
 const {directory,control}=await fixture();control.timeoutMs=120001;let stages=0;const report=await runRollingPreferenceBrowser({...control,directory,onStage(){stages++;}});assert.equal(stages,0);assert.equal(report.passed,false);assert.equal(report.stage,'validation');assert.deepEqual(report.cleanup,{contextClosed:true,browserClosed:true});
 const serialized=JSON.stringify(report);for(const secret of ['PASSWORD_PRIVATE_SENTINEL','PUBLIC_EXPECTATION_SENTINEL',directory,origins.origin])assert(!serialized.includes(secret));
});
const rpc=(method,params=[])=>JSON.stringify({jsonrpc:'2.0',id:1,method,params});
const req=(url,method='GET',body=null)=>({url,method,body});
test('labelled observation permits exact public pages and pinned read-only native/PXE transport, retaining only aggregates',()=>{
 const o=createRollingPreferenceTraffic(origins);
 for(const route of ['/', '/reader.mjs','/wallet/runtime.json','/wallet/aztec_bundle.js','/wallet/worker.worker.js','/crs/g1.dat'])assert(o.inspect(req(origins.origin+route)));
 assert(o.inspect(req(origins.origin+'/api/feed?limit=30')));assert(o.inspect(req(origins.origin+'/api/feed?limit=30&cursor=opaque-valid')));assert(o.inspect(req(origins.origin+'/api/board?id=0&limit=30')));
 assert(o.inspect(req(origins.trustedOrigin+'/healthz')));assert(o.inspect(req(origins.trustedOrigin+'/v1/node','OPTIONS')));assert(o.inspect(req(origins.trustedOrigin+'/v1/node','POST',rpc('aztec_getPrivateLogsByTags',['PRIVATE_SENTINEL']))));assert(o.inspect(req(origins.ethereumOrigin+'/','POST',rpc('eth_call',[{data:'PRIVATE_SENTINEL'},'latest']))));
 const s=o.snapshot();assert.equal(s.feedRequests,2);assert.equal(s.boardRequests,1);assert.equal(s.walletAssets,3);assert.equal(s.inspectionErrors,0);assert(!JSON.stringify(s).includes('PRIVATE_SENTINEL'));s.privateRequests=999;assert.notEqual(o.snapshot().privateRequests,999);
});
for(const [label,request,key]of [
 ['proof',req(origins.trustedOrigin+'/v1/jobs','POST','opaque'),'proofSubmits'],
 ['aztec send',req(origins.trustedOrigin+'/v1/node','POST',rpc('aztec_sendTx',['opaque'])),'nodeSubmissions'],
 ['node send',req(origins.trustedOrigin+'/v1/node','POST',rpc('node_sendTx',['opaque'])),'nodeSubmissions'],
 ['L1 send',req(origins.ethereumOrigin+'/','POST',rpc('eth_sendRawTransaction',['opaque'])),'l1Submissions'],
 ['batch send',req(origins.trustedOrigin+'/v1/node','POST',JSON.stringify([{jsonrpc:'2.0',id:1,method:'aztec_getNodeInfo',params:[]},{jsonrpc:'2.0',id:2,method:'node_sendTx',params:['opaque']}])),'nodeSubmissions'],
 ['outside',req('https://outside.invalid/private'),'blockedRequests'],
])test('labelled '+label+' is rejected and counted before route forwarding',()=>{const o=createRollingPreferenceTraffic(origins);assert.equal(o.inspect(request),false);assert.equal(o.snapshot()[key],1);});
const badRequests=[
 req(origins.origin+'/api/feed?limit=30&owner=PRIVATE_SENTINEL'),req(origins.origin+'/api/feed?limit=30&limit=30'),req(origins.origin+'/api/feed?cursor=x'),req(origins.origin+'/api/feed?limit=30&cursor='),req(origins.origin+'/api/feed?limit=30&cursor='+'x'.repeat(4097)),req(origins.origin+'/api/board?id=1&limit=30'),req(origins.origin+'/api/profile?nameId=1'),req(origins.origin+'/api/preferences'),req(origins.origin+'/api/feed?limit=30','POST','{}'),req(origins.origin+'/wallet/private?secret=x'),
 req(origins.trustedOrigin+'/v1/node','POST',rpc('aztec_getUnknownPrivateAPI')),req(origins.trustedOrigin+'/v1/node','POST',rpc('node_getNodeInfo')),req(origins.trustedOrigin+'/v1/node','POST','PRIVATE_SENTINEL'),req(origins.trustedOrigin+'/v1/node','POST','[]'),req(origins.trustedOrigin+'/v1/node','POST','x'.repeat(8*1024*1024+1)),req(origins.ethereumOrigin+'/','POST',rpc('eth_sign',[])),req(origins.trustedOrigin+'/wrong','POST',rpc('node_getNodeInfo')),
];
for(const [index,request]of badRequests.entries())test('labelled unknown/expanded traffic fails closed '+index,()=>{const o=createRollingPreferenceTraffic(origins);assert.equal(o.inspect(request),false);assert.equal(o.snapshot().inspectionErrors,1);assert(!JSON.stringify(o.snapshot()).includes('PRIVATE_SENTINEL'));});
test('pinned node read inventory matches installed SDK source without a submission method',async()=>{
 const source=await fs.readFile(new URL('../../node_modules/@aztec-labs/stdlib/dest/interfaces/aztec-node.js',import.meta.url),'utf8'),methods=[...source.matchAll(/^    ([A-Za-z][A-Za-z0-9]*): z.function/gm)].map(m=>m[1]);assert(methods.length>50);assert(methods.includes('getSyncedL1Timestamp'));assert(methods.includes('getL1ToL2MessageMembershipWitness'));
 const o=createRollingPreferenceTraffic(origins);for(const method of methods)assert.equal(o.inspect(req(origins.trustedOrigin+'/v1/node','POST',rpc('aztec_'+method))),method!=='sendTx',method);
 assert.equal(o.snapshot().inspectionErrors,0);assert.equal(o.snapshot().nodeSubmissions,1);
});

// Actual production transport request, with only the HTTP receiver replaced.
// The unavailable response is deliberate: no chain or recovery success is claimed.
test('production trusted node first request passes the read-only observer',async()=>{
 const {createTrustedPrivateNode}=await import('../../shared/trusted-private-node.mjs');
 const previous=globalThis.fetch,observed=[];const o=createRollingPreferenceTraffic(origins);
 globalThis.fetch=async(url,init)=>{observed.push({allowed:o.inspect(req(url,init.method,init.body)),methods:[JSON.parse(init.body)].flat().map(r=>r.method)});return new Response('',{status:503});};
 try{await assert.rejects(createTrustedPrivateNode({url:origins.trustedOrigin+'/v1/node',expectedNetworkScope:{chainId:'31337',version:'1',rollup:'0x'+'01'.repeat(20)},proofsEnabled:true,allowLocalDev:true}),{code:'BB_TRUSTED_NODE_UNAVAILABLE'});}
 finally{globalThis.fetch=previous;}
 assert.deepEqual(observed,[{allowed:true,methods:['aztec_getNodeInfo']}]);assert.equal(o.snapshot().inspectionErrors,0);
});
