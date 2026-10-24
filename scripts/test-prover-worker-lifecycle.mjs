import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// Actual harmless child processes use the production owner/IPC/cleanup code.
// Only the worker entry is replaced; no native prover, browser or network runs.
const module=new URL('../prover/process-worker.mjs',import.meta.url).href;
function run(body){
 const script=`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'proof-worker-lifetime-')),entry=path.join(dir,'child.cjs'),original=cp.fork;let worker;const children=[],assignments=[];
 const until=async predicate=>{while(!predicate())await new Promise(setImmediate);};
 try{
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",value=>{process.send({mode:"real",pid:process.pid,file:value.file},()=>process.disconnect());});');
 cp.fork=(_file,args,options)=>{assert.deepEqual(args,['--standby']);const child=original(entry,[],options);children.push(child);child.on('message',message=>{if(message.ready)child.ready=true;});const send=child.send.bind(child);child.send=(message,...rest)=>{assignments.push({pid:child.pid,message});return send(message,...rest);};return child;};syncBuiltinESMExports();
 const {createProcessWorker}=await import(${JSON.stringify(module)});
 ${body}
 }finally{if(worker)await worker.close();cp.fork=original;syncBuiltinESMExports();await fs.rm(dir,{recursive:true,force:true});}
 `;
 const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);
}
test('one unused worker is initialized before job, each proof gets a different disposable process',()=>run(`
 worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].ready);
 assert.equal(assignments.length,0);const firstPid=children[0].pid;
 const first=await worker.prove('/first-private-job');assert.equal(first.pid,firstPid);assert.equal(first.file,'/first-private-job');
 assert.equal(children.length,2);await until(()=>children[1].ready);assert.equal(assignments.length,1);
 assert.throws(()=>process.kill(firstPid,0),{code:'ESRCH'});
 const second=await worker.prove('/second-private-job');assert.notEqual(second.pid,first.pid);assert.equal(second.file,'/second-private-job');
 assert.deepEqual(assignments.map(x=>x.message),[{file:'/first-private-job'},{file:'/second-private-job'}]);
 assert.equal(children.length,3);await worker.close();assert.equal(children.length,3);await assert.rejects(worker.prove('/after-close'),/Worker closed/);
`));
test('closing unused worker stops owned process without assigning any private job',()=>run(`
 worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].ready);const pid=children[0].pid;
 await worker.close();await worker.close();assert.equal(assignments.length,0);assert.equal(children.length,1);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
`));
test('failed idle initialization cannot spin, replay or create an unhandled rejection',()=>run(`
 await fs.writeFile(entry,'process.exit(1);');worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].exitCode!==null);
 await new Promise(r=>setTimeout(r,20));assert.equal(children.length,1);assert.equal(assignments.length,0);
 await assert.rejects(worker.prove('/only-attempt'),/Proof worker failed/);assert.equal(children.length,2);assert.equal(assignments.length,0);await worker.close();
`));
test('active worker rejects another assignment and close kills only its owned child',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",()=>setInterval(()=>{},1000));');
 worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].ready);const job=worker.prove('/held');job.catch(()=>{});
 await assert.rejects(worker.prove('/second'),/Worker busy/);assert.equal(assignments.length,1);await worker.close();await assert.rejects(job,/Proof worker failed/);assert.equal(children.length,1);
`));

test('numeric worker timing cannot alter result or throw through proof completion',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",()=>{process.send({mode:"real",compressedProof:"proof",timings:{read:1,decompress:2,"board-binding":3,prove:4,"native-prove":5,"bb-load":1,"bb-accumulate":2,"bb-prove":1,"bb-verify":0.5,"bb-compress":0.25,"bb-start":0.25,"bb-secret":99,"result-encode":6,totalMs:21,secret:"hidden"}},()=>setTimeout(()=>process.disconnect(),15));});');
 worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].ready);let timing;
 assert.deepEqual(await worker.prove('/numeric',{onTimings:value=>{timing=value;throw Error('diagnostic failed');}}),{mode:'real',compressedProof:'proof'});
 assert.equal(timing.nativeProveMs,5);assert.equal(timing.bbLoadMs,1);assert.equal(timing.bbAccumulateMs,2);assert.equal(timing.bbProveMs,1);assert.equal(timing.bbVerifyMs,0.5);assert.equal(timing.bbCompressMs,0.25);assert.equal(timing.bbStartMs,0.25);assert(!Object.hasOwn(timing,"bbSecretMs"));assert.equal(timing.childTotalMs,21);assert.equal(timing.resultEncodeMs,6);
 assert(timing.readyWaitMs>=0);assert(timing.resultToExitMs>=0);assert(!Object.hasOwn(timing,'secret'));
`));


test('rejected async timing callback cannot escape successful proof completion',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",()=>process.send({mode:"disabled"},()=>process.disconnect()));');
 worker=createProcessWorker({proofsEnabled:false});await until(()=>children[0].ready);
 assert.deepEqual(await worker.prove('/numeric-async',{onTimings:async()=>{throw Error('diagnostic rejected');}}),{mode:'disabled'});
 await new Promise(resolve=>setImmediate(resolve));
`));

test('proof IPC delivers once before teardown while the process slot stays reserved',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.on("message",value=>{if(value.exit){process.disconnect();return;}process.send({mode:"real",compressedProof:"proof",timings:{"native-prove":5,totalMs:7}});process.send({mode:"real",compressedProof:"ignored duplicate",timings:{"native-prove":99,totalMs:999}});});');
 worker=createProcessWorker({proofsEnabled:true});await until(()=>children[0].ready);
 let deliveries=0,done=false,earlyTiming,finalTiming;
 const proving=worker.prove('/early',{onTimings:t=>{finalTiming=t;},onResult:r=>{deliveries++;earlyTiming=finalTiming;assert.deepEqual(r,{mode:'real',compressedProof:'proof'});}}).then(r=>{done=true;return r;});
 await until(()=>deliveries>0);await new Promise(setImmediate);
 assert.equal(done,false);assert.equal(deliveries,1);assert.equal(children.length,1);assert.equal(earlyTiming.nativeProveMs,5);assert.equal(earlyTiming.resultToExitMs,undefined);assert.equal(earlyTiming.warmReplacementMs,undefined);
 process.kill(children[0].pid,0);await assert.rejects(worker.prove('/second'),/Worker busy/);
 children[0].send({exit:true});assert.deepEqual(await proving,{mode:'real',compressedProof:'proof'});assert.equal(deliveries,1);
 assert(finalTiming.resultToExitMs>=0);assert(finalTiming.warmReplacementMs>=0);assert.equal(children.length,2);
`));

test('failed or mismatched worker IPC cannot publish an early proof',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",()=>{process.send({mode:"disabled"});process.send({mode:"real",compressedProof:""});process.send({errorStage:"native-verification"},()=>{process.exitCode=1;process.disconnect();});});');
 worker=createProcessWorker({proofsEnabled:true});let deliveries=0;
 await assert.rejects(worker.prove('/bad',{onResult:()=>deliveries++}),{code:'native-verification'});assert.equal(deliveries,0);
`));

test('early result callback failure never interrupts worker cleanup or its returned proof',()=>run(`
 await fs.writeFile(entry,'process.send({ready:true});process.once("message",()=>process.send({mode:"real",compressedProof:"proof"},()=>process.disconnect()));');
 worker=createProcessWorker({proofsEnabled:true});
 for(const onResult of [()=>{throw Error('observer failure');},async()=>{throw Error('observer rejected');}]){
  assert.deepEqual(await worker.prove('/observer',{onResult}),{mode:'real',compressedProof:'proof'});
 }
 await new Promise(setImmediate);
`));
