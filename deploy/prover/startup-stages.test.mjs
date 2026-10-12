// Development-only tests: real Node parser/filesystem, labelled synthetic operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,writeFileSync,mkdtempSync,chmodSync,symlinkSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {SOURCE_PLAN,PHASES,transformSource,createRecorder,readRecord,validateRecord,MAX_RECORD_BYTES,RECORD_NAME,createLoadHook} from './startup-stages.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest='a'.repeat(64);
const temporary=fn=>{const dir=mkdtempSync(join(tmpdir(),'rolling-stages-'));chmodSync(dir,0o700);try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
const record=history=>({schemaVersion:1,instrumented:true,helperSha256:digest,history});

test('all exact pinned SDK modules hash-bind, retain original bytes, and parse without execution',()=>temporary(dir=>{
 for(const plan of SOURCE_PLAN){
  const local=resolve('node_modules/@aztec-labs',plan.path.replace('/usr/src/yarn-project/',''));
  const source=readFileSync(local,'utf8'); const transformed=transformSource(source,plan);
  assert.equal(transformed.replace(/^import \{ mark as __rollingStartupStage \}[^\n]*\n/,'').replace(/__rollingStartupStage\("[a-z0-9-]+","(?:begin|complete)"\);\n/g,''),source);
  const file=join(dir,'module.mjs');writeFileSync(file,transformed);
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,'actual Node syntax check failed');
 }
}));

test('source hash, duplicate/missing anchors, reversed offsets and unknown phase reject',()=>{
 const source='before();\nafter();\n';const plan={sha256:sha(source),points:[{phase:PHASES[0],before:'before();',after:'after();'}]};
 assert.throws(()=>transformSource(source+'x',plan));
 for(const point of [{before:'absent'}, {before:'();'}, {before:'after();',after:'before();'},{phase:'SECRET'}])assert.throws(()=>transformSource(source,{...plan,points:[{...plan.points[0],...point}]}));
});

test('synthetic awaited operation preserves receiver, argument identity, pending state, result and exact rejection',async()=>{
 const source='export async function run(object,value) {\n const result = await object.call(value);\n return result;\n}\n';
 const plan={sha256:sha(source),points:[{phase:'factory',before:' const result',after:' return result'}]};
 const sink='data:text/javascript,export function mark(p,s){globalThis.__stageTest.push([p,s]);}';
 const code=transformSource(source,plan,sink);const {run}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 globalThis.__stageTest=[];
 try {
  let resolvePromise;const value={};const object={call(arg){assert.equal(this,object);assert.equal(arg,value);return new Promise(resolve=>{resolvePromise=resolve;});}};
  const pending=run(object,value);assert.deepEqual(globalThis.__stageTest,[['factory','begin']]);resolvePromise(value);assert.equal(await pending,value);
  assert.deepEqual(globalThis.__stageTest,[['factory','begin'],['factory','complete']]);
  for(const sync of [false,true]){globalThis.__stageTest=[];const failure={private:'NEVER_SERIALIZE'};const bad={call(){if(sync)throw failure;return Promise.reject(failure);}};await assert.rejects(run(bad,value),error=>error===failure);assert.deepEqual(globalThis.__stageTest,[['factory','begin']]);}
 }finally{delete globalThis.__stageTest;}
});

test('real dedicated atomic record retains nested begin/complete and no caller data',()=>temporary(dir=>{
 const write=createRecorder(dir,digest);assert.equal(write('factory','begin'),true);assert.equal(write('factory-bb','begin'),true);assert.equal(write('factory-bb','complete'),true);
 assert.deepEqual(readRecord(dir,digest),record([['factory','begin'],['factory-bb','begin'],['factory-bb','complete']]));
 assert.equal(write('factory','complete'),true);assert.ok(readFileSync(join(dir,RECORD_NAME)).length<MAX_RECORD_BYTES);
 assert.equal(write('SECRET_TOKEN','begin'),false);assert.equal(write('admin-auth','begin'),false);assert.equal(readRecord(dir,digest).history.length,4);
 assert.throws(()=>createRecorder(dir,digest));
}));

test('malformed, forged-hash, nonnested, duplicate, overflow and extra-field records reject',()=>{
 const cases=[null,{...record([]),secret:'PRIVATE'}, {...record([]),helperSha256:'b'.repeat(64)}, {...record([]),schemaVersion:true},record([['factory','complete']]),record([['factory','begin'],['factory-bb','begin'],['factory','complete']]),record([['factory','begin'],['factory','complete'],['factory','begin']]),record([['SECRET','begin']]),record(Array(100).fill(['factory','begin']))];
 for(const value of cases)assert.throws(()=>validateRecord(value,digest));
});

test('symlinks, public permissions, wrong-size and malformed dedicated files reject',()=>temporary(dir=>{
 const file=join(dir,RECORD_NAME);const outside=join(dir,'outside');writeFileSync(outside,JSON.stringify(record([])),{mode:0o600});symlinkSync(outside,file);assert.throws(()=>readRecord(dir,digest));rmSync(file);
 for(const bytes of ['not json','x'.repeat(MAX_RECORD_BYTES+1)]){writeFileSync(file,bytes,{mode:0o600});assert.throws(()=>readRecord(dir,digest));}
 writeFileSync(file,JSON.stringify(record([])));chmodSync(file,0o644);assert.throws(()=>readRecord(dir,digest));chmodSync(file,0o600);
 chmodSync(dir,0o755);assert.throws(()=>readRecord(dir,digest));chmodSync(dir,0o700);
 const link=join(dir,'link');symlinkSync(dir,link);assert.throws(()=>readRecord(link,digest));
}));

test('recording failure is sticky and cannot change application success or error',()=>temporary(dir=>{
 const write=createRecorder(dir,digest);mkdirSync(join(dir,'.stages.tmp'));
 assert.equal(write('factory','begin'),false);assert.equal(write('factory','complete'),false);assert.throws(()=>readRecord(dir,digest));
 const value={};function actual(){write('factory','begin');return value;}assert.equal(actual(),value);
 const error={secret:'NOT_OUTPUT'};assert.throws(()=>{write('factory','begin');throw error;},e=>e===error);
}));

test('loader forwards unrelated return/error identity and validates exact target bytes before substitution',()=>{
 const source='before();after();';const plan={sha256:sha(source)};const url='file:///fixed/module.js';const hook=createLoadHook(new Map([[url,{plan,transformed:'insertions'}]]));const context={};const result={format:'module',source};
 assert.equal(hook('file:///other.js',context,(u,c)=>{assert.equal(u,'file:///other.js');assert.equal(c,context);return result;}),result);
 const error={secret:'NEVER_OUTPUT'};assert.throws(()=>hook('file:///other.js',context,()=>{throw error;}),e=>e===error);
 assert.deepEqual(hook(url,context,()=>result),{format:'module',source:'insertions'});
 assert.throws(()=>hook(url,context,()=>({...result,source:source+'x'})),/ROLLING_STARTUP_DIAGNOSTIC_UNAVAILABLE/);
 assert.throws(()=>hook(url,context,()=>({...result,format:'commonjs'})),/ROLLING_STARTUP_DIAGNOSTIC_UNAVAILABLE/);
});

test('actual Node24 synchronous load hook substitutes only exact target and deregisters',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rolling-hook-'));
 let hook;
 try {
  const file=join(dir,'target.mjs'), other=join(dir,'other.mjs');writeFileSync(file,'export const value = 1;');writeFileSync(other,'export const value = 3;');
  const url=pathToFileURL(realpathSync(file)).href;
  hook=registerHooks({load:createLoadHook(new Map([[url,{plan:{sha256:sha('export const value = 1;')},transformed:'export const value = 2;'}]]))});
  assert.equal((await import(url)).value,2);assert.equal((await import(pathToFileURL(other).href)).value,3);
  hook.deregister();hook=undefined;
  assert.equal((await import(url+'?unhooked')).value,1);
 }finally{hook?.deregister();rmSync(dir,{recursive:true,force:true});}
});

test('dangling record and temporary symlinks are rejected before recording',()=>temporary(dir=>{
 for(const name of [RECORD_NAME,'.stages.tmp']){const path=join(dir,name);symlinkSync(join(dir,'absent'),path);assert.throws(()=>createRecorder(dir,digest));rmSync(path);}
}));
