import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=process.cwd(),load=name=>import(pathToFileURL(path.join(root,'scripts',name)).href);
const {runWithService,probeTcp}=await load('process-lifecycle.mjs');const {noirTestBatches}=await load('noir-test-batches.mjs');
const {assertNodeVersion,assertAztecPackages,nargoBinary}=await load('toolchain.mjs');const {checkNoirDependencyTrees,checkNoirEmbeddedSources}=await load('check-noir-dependencies.mjs');
assertNodeVersion();assertAztecPackages();checkNoirDependencyTrees();
const artifact=JSON.parse(fs.readFileSync(path.join(root,'billboard/target/rolling_contract-RollingBoard.json')));checkNoirEmbeddedSources(artifact);assert.equal(artifact.transpiled,true);
const privateFns=artifact.functions.filter(f=>f.custom_attributes?.includes('abi_private'));assert.equal(privateFns.length,14);assert(privateFns.every(f=>f.verification_key));
for(const name of ['main.nr','preferences.nr','preferences_tests.nr']){const file='billboard/rolling_contract/src/'+name;const entry=Object.values(artifact.file_map).find(v=>v.path===file);if(name!=='preferences_tests.nr')assert.equal(entry?.source,fs.readFileSync(path.join(root,file),'utf8'));}
const listing=fs.readFileSync('/tmp/rolling-g07-test-list-2.log','utf8').split('\n').filter(s=>/^rolling_contract preferences_tests::[a-z_]+$/.test(s)).join('\n');
const declared=[...fs.readFileSync(path.join(root,'billboard/rolling_contract/src/preferences_tests.nr'),'utf8').matchAll(/^#\[test(?:\([^\n]*\))?\]\n(?:unconstrained )?fn ([a-z_]+)\(/gm)].map(m=>'preferences_tests::'+m[1]).sort();
const batches=noirTestBatches(listing);assert.equal(declared.length,24);assert.deepEqual(batches.flatMap(b=>b.names).sort(),declared);
console.log(JSON.stringify({phase:'discovered',count:declared.length,names:declared,artifact:'normal14VK',realProofs:false}));
const children=[];let passed=false;
try{for(const batch of batches){
 const socket=net.createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 await runWithService({service:{command:process.execPath,args:['--preserve-symlinks','scripts/txe-c01-service.mjs'],options:{cwd:root,stdio:'inherit',env:{...process.env,TXE_PORT:String(port),TXE_WORKERS:'1',NODE_BACKEND:'js',LOG_LEVEL:'silent',HARDWARE_CONCURRENCY:'1'}}},
 tests:{command:nargoBinary(),args:['test',...batch.names,'--exact','--package','rolling_contract','--oracle-resolver',`http://127.0.0.1:${port}`,'--test-threads','1'],options:{cwd:path.join(root,'billboard'),stdio:'inherit',timeout:540000,killSignal:'SIGTERM'}},probe:()=>probeTcp(port),testTimeoutMs:540000,onSpawn:(role,child)=>{children.push(child);console.log(JSON.stringify({role,pid:child.pid,port}));}});
 }passed=true;
}finally{const cleanupComplete=children.every(c=>c.exitCode!==null||c.signalCode!==null);console.log(JSON.stringify({phase:'finished',passed,cleanupComplete,children:children.map(c=>({pid:c.pid,exitCode:c.exitCode,signal:c.signalCode}))}));assert(cleanupComplete);}
