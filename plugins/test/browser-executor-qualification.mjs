// Explicit operator-run component acceptance. Disposable public fixtures only;
// no application account, wallet, provider, credentials, network or service edits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createIsolatedExecution,STATIC_IMAGE,STATIC_SECCOMP_SHA256} from '../isolated-execution.mjs';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bok-browser-accept-'))),output=path.join(root,'output');await fs.mkdir(output,{mode:0o700});
const runner=createIsolatedExecution({workspaceRoot:root,outputRoot:output,docker:'/usr/bin/docker',origin:'https://dy2q03rao3se7.cloudfront.net',boardOrigin:'https://d30njln0kead8n.cloudfront.net'});
const results=[];
try{
 await runner.assertAvailable();
 for(const [name,script,steps,pass] of [
  ['working fragment state','value.textContent=location.hash.slice(1)||"0";go.onclick=()=>{location.replace("#1");value.textContent="1";};',[{action:'click',selector:'#go'},{action:'expectText',selector:'#value',text:'1'},{action:'reload'},{action:'expectText',selector:'#value',text:'1'}],true],
  ['startup storage','localStorage.getItem("x");',[],false],
  ['interaction storage','go.onclick=()=>localStorage.setItem("x","1");',[{action:'click',selector:'#go'}],false],
 ]){
  const source=path.join(root,'source-'+results.length);await fs.mkdir(source,{mode:0o700});
  const plan={version:1,scenarios:[{name:'exercise',path:'index.html',steps:[...steps,{action:'reload'},{action:'expectVisible',selector:'body'}]}]};
  const html='<!doctype html><title>Browser boundary fixture</title><p>Fixture</p><button id="go">Go</button><output id="value"></output><script>'+script+'</script>';
  const files={'package.json':JSON.stringify({scripts:{build:'node build.cjs'}}),'main.test.cjs':"require('node:test')('labelled passing Node boundary fixture',()=>require('node:assert/strict').equal(1,1));",'build.cjs':"const fs=require('node:fs');fs.mkdirSync('dist');fs.writeFileSync('dist/index.html',"+JSON.stringify(html)+");",'browser-tests.json':JSON.stringify(plan)};
  for(const [name,data] of Object.entries(files))await fs.writeFile(path.join(source,name),data,{mode:0o600});
  const started=Date.now();let result;
  try{const receipt=await runner.execute({sourceDirectory:source,revision:String(results.length+1).repeat(40)});assert(pass,'Broken app was accepted');result={name,accepted:true,browser:receipt.browser,image:receipt.image};}
  catch(error){if(pass)throw error;assert.equal(error.code,'STATIC_FAILED');assert.equal(error.result.phase,'browser');assert.equal(error.result.outcome.test.code,0);assert.equal(error.result.outcome.build.code,0);assert.match(error.result.log,/localStorage|SecurityError/);result={name,accepted:false,phase:error.result.phase,diagnostic:error.result.log.slice(-1200)};}
  for(const dir of await fs.readdir(output))assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,dir,'cleanup.json'))),{ownedContainerAbsent:true});
  results.push({...result,durationMs:Date.now()-started,ownedContainersAbsent:true});
 }
 process.stdout.write(JSON.stringify({passed:true,image:STATIC_IMAGE,seccompSha256:STATIC_SECCOMP_SHA256,results},null,2)+'\n');
}finally{await fs.rm(root,{recursive:true,force:true});}
