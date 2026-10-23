// Actual local Git repositories. No GitHub, provider, generated-code execution or proofs.
import test from 'node:test';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {threadRepositories,repositoryGit,admittedRepositorySession} from '../thread-repositories.mjs';
const id=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
async function fixture(t,git=repositoryGit){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bok-thread-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=path.join(root,'threads'),lease={assertHeld:async()=>{}},options={directory,namespace:'local-chain/board/plugin',lease,git};
 const manager=threadRepositories(options),open=(n=1,thread=1,m=manager)=>m.open({threadId:id(thread),invocationId:id(n),repository:'owner/project'});
 async function checkout(session){
  if(session.readRevision)await repositoryGit(['clone','--no-hardlinks','--branch','accepted',session.repositoryPath,session.work]);
  else{await repositoryGit(['init',session.work]);await fs.writeFile(path.join(session.work,'file.txt'),'initial');await repositoryGit(['add','.'],{cwd:session.work});await repositoryGit(['commit','-m','initial'],{cwd:session.work});}
 }
 return {root,options,manager,open,checkout};
}
test('actual accepted commit survives restart; failed invocation leaves previous source intact',async t=>{
 const h=await fixture(t),first=await h.open();await h.checkout(first);await fs.writeFile(path.join(first.work,'file.txt'),'accepted');const receipt=await first.accept();assert.equal(receipt.readRevision,null);assert.match(receipt.acceptedRevision,/^[0-9a-f]{40}$/);await first.close();
 const reopened=await h.open(2,1,threadRepositories(h.options));assert.equal(reopened.readRevision,receipt.acceptedRevision);await h.checkout(reopened);assert.equal(await fs.readFile(path.join(reopened.work,'file.txt'),'utf8'),'accepted');await fs.writeFile(path.join(reopened.work,'file.txt'),'unaccepted');await reopened.close();
 const third=await h.open(3);await h.checkout(third);assert.equal(await fs.readFile(path.join(third.work,'file.txt'),'utf8'),'accepted');await third.close();
 await assert.rejects(h.open(1),/already has an accepted revision/);
});
test('same-thread operations wait; a different thread opens independently',async t=>{
 const h=await fixture(t),first=await h.open();let entered=false;
 const next=h.open(2).then(s=>{entered=true;return s;});const other=await h.open(1,2);assert.equal(entered,false);assert.notEqual(first.repositoryPath,other.repositoryPath);await other.close();await first.close();const second=await next;assert.equal(entered,true);await second.close();
});
test('restart reconciles exact accepted ref after lost acknowledgement without rerunning invocation',async t=>{
 let interrupt=true;const h=await fixture(t,async(args,options)=>{const result=await repositoryGit(args,options);if(args[0]==='update-ref'&&interrupt){interrupt=false;throw Error('lost acknowledgement');}return result;});
 const first=await h.open();await h.checkout(first);await fs.writeFile(path.join(first.work,'file.txt'),'durable');await assert.rejects(first.accept(),/lost acknowledgement/);await first.close();
 const second=await h.open(2,1,threadRepositories(h.options));assert.match(second.readRevision,/^[0-9a-f]{40}$/);await h.checkout(second);assert.equal(await fs.readFile(path.join(second.work,'file.txt'),'utf8'),'durable');await second.close();await assert.rejects(h.open(1),/already has an accepted revision/);
});
test('lease loss prevents acceptance; user paths and changed repository identity fail closed',async t=>{
 const h=await fixture(t);await assert.rejects(h.manager.open({threadId:'../x',invocationId:id(1),repository:'owner/project'}));
 const first=await h.open();await h.checkout(first);h.options.lease.assertHeld=async()=>{throw Error('lease lost');};await assert.rejects(first.accept(),/lease lost/);await assert.rejects(first.close(),/lease lost/);assert.equal(await fs.readFile(path.join(first.work,'file.txt'),'utf8'),'initial');
 h.options.lease.assertHeld=async()=>{};await assert.rejects(h.manager.open({threadId:id(1),invocationId:id(2),repository:'different/project'}));
});

test('existing toolbox edits and accepts actual thread source across independent invocations',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t),seed=path.join(h.root,'seed');
 await repositoryGit(['init',seed]);await fs.writeFile(path.join(seed,'hello.txt'),'start');await repositoryGit(['add','.'],{cwd:seed});await repositoryGit(['commit','-m','seed'],{cwd:seed});await fs.writeFile(path.join(seed,'hello.txt'),'later');await repositoryGit(['commit','-am','second seed'],{cwd:seed});
 let apiCalls=0;const api=async(method,route)=>{apiCalls++;if(route.includes('/git/commits/'))return {tree:{sha:'fixture-tree'}};if(route.includes('/git/trees/'))return {sha:'fixture-tree',truncated:false,tree:[{path:'hello.txt',type:'blob',size:5}]};return {default_branch:'main'};};
 let retains=0;const repositories={open:async input=>{const workspace=await h.manager.open(input);return {...workspace,retain:async()=>{retains++;return workspace.retain();}};}};
 const toolbox=githubToolbox({repository:'owner/project',api,repositories,runCommand:async(command,args,options)=>{assert.equal(command,'git');return repositoryGit(args.map(arg=>arg==='https://github.com/owner/project.git'?pathToFileURL(seed).href:arg),options);}});
 const first=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});
 assert(!first.definitions.some(d=>d.function.name==='create_pr'));
 await first.call('edit_file',{path:'hello.txt',old_text:'later',new_text:'accepted from first participant'});
 assert.equal(retains,1);
 const revision=await first.accept();await first.close();
 const check=await h.open(99);assert.equal((await repositoryGit(['rev-parse','--is-shallow-repository'],{cwd:check.repositoryPath})).stdout.trim(),'true');await repositoryGit(['fsck','--connectivity-only','--no-dangling'],{cwd:check.repositoryPath});await check.close();
 const before=apiCalls,second=await toolbox.open({threadId:id(1),id:id(2),postId:id(10)});
 assert.equal((await second.call('read_file',{path:'hello.txt'})).text,'accepted from first participant');assert.equal(apiCalls,before,'accepted local revision does not require invented remote commit');
 await second.call('write_file',{path:'next.txt',content:'second participant'});const next=await second.accept();assert.equal(next.readRevision,revision.acceptedRevision);assert.notEqual(next.acceptedRevision,revision.acceptedRevision);await second.close();
});

test('failed validation cannot advance accepted source and cannot be retried in same session',async t=>{
 const h=await fixture(t),first=await h.open();await h.checkout(first);const prior=await first.accept();await first.close();let validations=0;
 const manager=threadRepositories({...h.options,validateRevision:async()=>{validations++;return {passed:false};}});
 const next=await h.open(2,1,manager);await h.checkout(next);await fs.writeFile(path.join(next.work,'file.txt'),'rejected code');await assert.rejects(next.accept(),/validation failed/);await assert.rejects(next.accept(),/already attempted/);assert.equal(validations,1);await next.close();
 const last=await h.open(3);assert.equal(last.readRevision,prior.acceptedRevision);await last.close();
});
test('bounded revision and storage budgets refuse new accepted source',async t=>{
 const h=await fixture(t),first=await h.open();await h.checkout(first);await first.accept();await first.close();
 await assert.rejects(h.open(2,1,threadRepositories({...h.options,maxRevisions:1})),/revision limit/);
 const next=await h.open(2,1,threadRepositories({...h.options,maxBytes:1024}));await h.checkout(next);await assert.rejects(next.accept(),/storage limit/);await assert.rejects(next.close(),/storage limit/);await fs.access(next.work);
});

test('model can check and repair an empty thread; acceptance reuses only the exact checked source',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t);let validations=0;
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:async({sourceDirectory,revision})=>{validations++;const text=await fs.readFile(path.join(sourceDirectory,'app.js'),'utf8');if(text==='bad')throw Object.assign(Error('Isolated execution failed'),{code:'STATIC_FAILED',result:{passed:false,phase:'test',revision,log:'assertion failed'}});return {passed:true,revision,sourceDigest:'a'.repeat(64),log:'passed'};}});
 const toolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('Empty thread requires no external repository API')});
 const session=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});
 await session.call('write_file',{path:'app.js',content:'bad'});assert.equal((await session.call('check_workspace',{})).passed,false);
 await session.call('write_file',{path:'app.js',content:'good'});const checked=await session.call('check_workspace',{});assert.equal(checked.passed,true);assert.equal(validations,2);
 const accepted=await session.accept();assert.equal(accepted.acceptedRevision,checked.revision);assert.equal(validations,2,'unchanged source reuses exact isolated result');await session.close();
 const second=await toolbox.open({threadId:id(1),id:id(2),postId:id(10)});assert.equal((await second.call('read_file',{path:'app.js'})).text,'good');await second.call('check_workspace',{});await second.call('write_file',{path:'app.js',content:'changed'});await second.accept();assert.equal(validations,4,'edit invalidates previous isolated check');await second.close();
});

test('a text-only empty thread can answer without creating a fake static application',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t);let validations=0;
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:async()=>{validations++;assert.fail('No changed source');}});
 const toolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No API')});
 const session=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});assert.equal(await session.accept(),null);await session.close();assert.equal(validations,0);
});
test('publication lost acknowledgement reconciles the exact accepted receipt without model or validation replay',async t=>{
 const h=await fixture(t);let calls=0,validations=0,firstReceipt;
 const options={...h.options,validateRevision:async({revision})=>{validations++;return {passed:true,revision,sourceDigest:'a'.repeat(64)};},onAccepted:async receipt=>{calls++;if(!firstReceipt)firstReceipt=receipt;else assert.deepEqual(receipt,firstReceipt);if(calls===1)throw Error('lost publication acknowledgement');return {published:true,acceptedRevision:receipt.acceptedRevision};}};
 const first=await h.open(1,1,threadRepositories(options));await h.checkout(first);await fs.writeFile(path.join(first.work,'file.txt'),'publish exact source');await assert.rejects(first.accept(),/lost publication/);await first.close();
 const second=await h.open(2,1,threadRepositories(options));assert.equal(second.readRevision,firstReceipt.acceptedRevision);assert.equal(calls,2);assert.equal(validations,1);await second.close();
 const third=await h.open(3,1,threadRepositories(options));assert.equal(calls,2);await third.close();
});

test('actual isolated repair becomes the exact durable thread revision',{skip:process.env.BOK_THREAD_CONTAINER_TESTS!=='1',timeout:120000},async t=>{
 const {githubToolbox}=await import('../github-tools.mjs'),{createIsolatedExecution}=await import('../isolated-execution.mjs');
 const h=await fixture(t),output=path.join(h.root,'artifacts');await fs.mkdir(output,{mode:0o700});let validations=0;
 const execution=createIsolatedExecution({origin:'https://apps.example',boardOrigin:'https://board.example',workspaceRoot:h.root,outputRoot:output,workMs:30000});await execution.assertAvailable();
 const options={...h.options,startEmpty:true,validateRevision:input=>{validations++;return execution.execute(input).catch(error=>{console.log(JSON.stringify({isolatedFailure:error.result??{code:error.code}}));throw error;});}};
 const toolbox=manager=>githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No external GitHub')});
 const first=await toolbox(threadRepositories(options)).open({threadId:id(1),id:id(1),postId:id(9)});
 try{
  for(const [file,content] of Object.entries({'browser-tests.json':JSON.stringify({version:1,scenarios:[{name:'render',path:'index.html',steps:[{action:'reload'},{action:'expectVisible',selector:'p'}]}]}),'package.json':JSON.stringify({scripts:{build:'node build.cjs'}}),'app.cjs':"module.exports='broken';",'main.test.cjs':"require('node:test')('application value',()=>require('node:assert/strict').equal(require('./app.cjs'),'working'));",'build.cjs':"const fs=require('node:fs');fs.mkdirSync('dist');fs.writeFileSync('dist/index.html','<!doctype html><title>'+require('./app.cjs')+'</title><p>working</p>');"}))await first.call('write_file',{path:file,content});
  const failed=await first.call('check_workspace',{});console.log(JSON.stringify({negativeCheck:failed}));assert.equal(failed.passed,false);assert.match(failed.log,/application value/);
  await first.call('write_file',{path:'app.cjs',content:"module.exports='working';"});const checked=await first.call('check_workspace',{});assert.equal(checked.passed,true);
  const accepted=await first.accept();assert.equal(accepted.acceptedRevision,checked.revision);assert.equal(validations,2);assert.equal(accepted.validation.testsPassed,true);assert.equal(accepted.validation.buildPassed,true);
  assert.equal(await fs.readFile(path.join(accepted.validation.outputDirectory,'dist/index.html'),'utf8'),'<!doctype html><title>working</title><p>working</p>');
  console.log(JSON.stringify({acceptedRevision:accepted.acceptedRevision,sourceDigest:accepted.validation.sourceDigest,testsPassed:true,buildPassed:true,validations,proofs:'not involved; actual Git and isolated Node'}));
  await first.close();const next=await toolbox(threadRepositories(options)).open({threadId:id(1),id:id(2),postId:id(10)});
  try{assert.equal((await next.call('read_file',{path:'app.cjs'})).text,"module.exports='working';");assert.equal(await next.accept(),null);assert.equal(validations,2);}finally{await next.close();}
  for(const name of await fs.readdir(output))assert.equal(JSON.parse(await fs.readFile(path.join(output,name,'cleanup.json'))).ownedContainerAbsent,true);
 }finally{await first.close();}
});

test('actual accepted Git and isolated artifact publish matching source over separate HTTP origin',{skip:process.env.BOK_THREAD_PUBLICATION_TESTS!=='1',timeout:90000},async t=>{
 const http=await import('node:http'),{githubToolbox}=await import('../github-tools.mjs'),{createIsolatedExecution}=await import('../isolated-execution.mjs'),{createStaticPublication}=await import('../static-publication.mjs');
 const h=await fixture(t),output=path.join(h.root,'artifacts'),published=path.join(h.root,'published');for(const p of [output,published])await fs.mkdir(p,{mode:0o700});
 let publication,session;const server=http.createServer((req,res)=>{void publication.handle(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;publication=await createStaticPublication({directory:published,artifactRoot:output,origin,boardOrigin:'http://127.0.0.1:4317',development:true});
  const executor=createIsolatedExecution({origin,boardOrigin:'http://127.0.0.1:4317',workspaceRoot:h.root,outputRoot:output,workMs:30000});let validations=0;
  const options={...h.options,startEmpty:true,validateRevision:input=>{validations++;return executor.execute(input).catch(error=>{console.log(JSON.stringify({isolatedFailure:error.result??{code:error.code}}));throw error;});},onAccepted:receipt=>publication.publish(receipt)};
  const box=()=>githubToolbox({repository:'owner/project',repositories:threadRepositories(options),api:async()=>assert.fail('No external GitHub')});
  session=await box().open({threadId:id(1),id:id(1),postId:id(9)});
  for(const [file,content] of Object.entries({'browser-tests.json':JSON.stringify({version:1,scenarios:[{name:'render',path:'index.html',steps:[{action:'reload'},{action:'expectVisible',selector:'p'}]}]}),'package.json':JSON.stringify({scripts:{build:'node build.cjs'}}),'main.test.cjs':"require('node:test')('value',()=>require('node:assert/strict').equal(2+2,4));",'build.cjs':"const fs=require('node:fs');fs.mkdirSync('dist');fs.writeFileSync('dist/index.html','<!doctype html><title>Published</title><p>Published</p>');"}))await session.call('write_file',{path:file,content});
  const accepted=await session.accept(),app=await fetch(accepted.publication.latestUrl),source=await fetch(accepted.publication.latestSourceUrl);
  assert.equal(app.status,200);assert.equal(source.status,200);assert.equal(app.headers.get('x-source-revision'),accepted.acceptedRevision);assert.equal(await app.text(),'<!doctype html><title>Published</title><p>Published</p>');
  const archive=await source.json();assert.equal(archive.revision,accepted.acceptedRevision);assert(!archive.files.some(f=>f.path.startsWith('.git/')));assert(archive.files.some(f=>f.path==='build.cjs'));assert.equal(validations,1);
  console.log(JSON.stringify({acceptedRevision:accepted.acceptedRevision,sourceDigest:accepted.validation.sourceDigest,artifactSha256:accepted.validation.artifactSha256,matchingHttpRevision:true,realGit:true,realIsolatedExecution:true,realHttp:true,externalGitHub:false}));
  await session.close();session=await box().open({threadId:id(1),id:id(2),postId:id(10)});assert.equal(await session.accept(),null);assert.equal(validations,1);
  for(const name of await fs.readdir(output))assert.equal(JSON.parse(await fs.readFile(path.join(output,name,'cleanup.json'))).ownedContainerAbsent,true);
 }finally{await session?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});

test('connected thread keeps exact operator mapping and accepted source across participants; other threads stay empty',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);const connection={threadId:id(1),repositoryId:100,ownerId:10,fullName:'owner/connected',baseBranch:'main',workBranch:'bok/one',baseCommit:'1'.repeat(40)};let reads=0;const publications=[];
 const connections={connectionFor:thread=>thread===id(1)?structuredClone(connection):null,readConnected:async thread=>{assert.equal(thread,id(1));reads++;return {mapping:structuredClone(connection),files:[{path:'app.cjs',data:Buffer.from('initial private source').toString('base64'),mode:'100644'}]};}};
 const options={...h.options,startEmpty:true,connections,validateRevision:async({revision})=>({passed:true,revision,sourceDigest:'a'.repeat(64)}),onAccepted:async receipt=>{publications.push(receipt);return {connected:true,url:'https://github.com/owner/connected/pull/1'};}};
 const box=manager=>githubToolbox({repository:'owner/reference',repositories:manager,api:async()=>assert.fail('No ambient GitHub API or public clone')});
 let manager=threadRepositories(options),session=await box(manager).open({threadId:id(1),id:id(11),postId:id(20)});
 assert.equal(session.privateSource,true);assert(!session.definitions.some(d=>['create_pr','read_pr'].includes(d.function.name)));
 assert.equal((await session.call('read_file',{path:'app.cjs'})).text,'initial private source');await assert.rejects(session.call('write_file',{path:'.github/workflows/ci.yml',content:'unsafe'}));await assert.rejects(session.call('read_pr',{number:1}));
 await session.call('write_file',{path:'app.cjs',content:'first participant edit'});const first=await session.accept();assert.deepEqual(first.connection,connection);await session.close();
 manager=threadRepositories(options);session=await box(manager).open({threadId:id(1),id:id(12),postId:id(21)});assert.equal((await session.call('read_file',{path:'app.cjs'})).text,'first participant edit');assert.equal(reads,1);
 await session.call('write_file',{path:'app.cjs',content:'second participant edit'});const second=await session.accept();assert.equal(second.readRevision,first.acceptedRevision);await session.close();assert.equal(publications.length,2);
 const other=await box(manager).open({threadId:id(2),id:id(13),postId:id(22)});assert.equal(other.privateSource,false);assert.deepEqual((await other.call('list_files',{prefix:''})).files,[]);assert.equal(reads,1);await other.close();
 connection.workBranch='bok/rebound';await assert.rejects(box(threadRepositories(options)).open({threadId:id(1),id:id(14),postId:id(23)}));
});

for(const terminal of ['step-limit','output-limit','balance'])test('agent '+terminal+' exit retains the exact checked actual Git revision and publication',async t=>{
 const {createAgent}=await import('../agent.mjs'),{githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);let validations=0,published=0,calls=0,checked;
 // Actual Git acceptance and persistence; the narrow validation/publication ports
 // are injected. Real isolated build and external publication remain separate.
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:async({sourceDirectory,revision})=>{validations++;assert.equal(await fs.readFile(path.join(sourceDirectory,'app.js'),'utf8'),'valid source');checked=revision;return {passed:true,revision,sourceDigest:'a'.repeat(64)};},onAccepted:async()=>{published++;return {latestUrl:'https://apps.example/app/',latestSourceUrl:'https://apps.example/source.json'};}});
 const actualToolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No external GitHub call')}),toolbox={open:args=>actualToolbox.open({...args,threadId:id(9)})};
 const model={complete:async()=>{if(++calls===1)return {message:{role:'assistant',tool_calls:[{id:'write',function:{name:'write_file',arguments:JSON.stringify({path:'app.js',content:'valid source'})}},{id:'check',function:{name:'check_workspace',arguments:'{}'}}]}};if(terminal==='balance')throw Object.assign(Error('reservation unavailable'),{code:'INSUFFICIENT_BALANCE'});return {message:{role:'assistant',content:'x'.repeat(993)}};}};
 const result=await createAgent({model,toolbox,instructions:'Build',maxCalls:terminal==='step-limit'?1:2}).run({id:id(1),postId:id(9),text:'Build'});
 assert.equal(validations,1,'Acceptance reuses exact successful check, without another build');assert.equal(published,1);assert.equal(calls,terminal==='step-limit'?1:2);assert.equal(result.revision.acceptedRevision,checked);assert.match(result.replyText,/App: https:\/\/apps.example/);assert(Buffer.byteLength(result.replyText)<=992);
 const next=await manager.open({threadId:id(9),invocationId:id(2),repository:'owner/project'});try{assert.equal(next.readRevision,checked);await h.checkout(next);assert.equal(await fs.readFile(path.join(next.work,'app.js'),'utf8'),'valid source');}finally{await next.close();}
});

for(const changedAfterCheck of [false,true])test('agent terminal acceptance refuses invalid actual source, changed after check='+changedAfterCheck,async t=>{
 const {createAgent}=await import('../agent.mjs'),{githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);let validations=0,published=0,calls=0;
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:async({sourceDirectory,revision})=>{validations++;if(await fs.readFile(path.join(sourceDirectory,'app.js'),'utf8')!=='valid')throw Object.assign(Error('Invalid generated output'),{code:'STATIC_FAILED',result:{passed:false,phase:'test',revision}});return {passed:true,revision,sourceDigest:'a'.repeat(64)};},onAccepted:async()=>{published++;}});
 const actualToolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No external GitHub call')}),toolbox={open:args=>actualToolbox.open({...args,threadId:id(9)})};
 const model={complete:async()=>{calls++;const tools=calls===1?[{id:'write',function:{name:'write_file',arguments:JSON.stringify({path:'app.js',content:changedAfterCheck?'valid':'invalid'})}},{id:'check',function:{name:'check_workspace',arguments:'{}'}}]:[{id:'change',function:{name:'write_file',arguments:JSON.stringify({path:'app.js',content:'invalid after check'})}}];return {message:{role:'assistant',tool_calls:tools}};}};
 await assert.rejects(createAgent({model,toolbox,instructions:'Build',maxCalls:changedAfterCheck?2:1}).run({id:id(1),postId:id(9),text:'Build'}),/Invalid generated output/);assert.equal(published,0);assert.equal(validations,2);assert.equal(calls,changedAfterCheck?2:1);
 const next=await manager.open({threadId:id(9),invocationId:id(2),repository:'owner/project'});try{assert.equal(next.readRevision,null);}finally{await next.close();}
});


test('accepted recovery reuses exact Git objects and validation, requires publication, creates no draft',async t=>{
 const h=await fixture(t);let validations=0,publications=0,admissions=0,blocked=true,original;
 const options={...h.options,ensureThread:async()=>{admissions++;},validateRevision:async({revision})=>{validations++;return {passed:true,revision,testsPassed:true,buildPassed:true,sourceDigest:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),artifactArchiveSha256:'c'.repeat(64)};},onAccepted:async receipt=>{
  publications++;if(!original)original=structuredClone(receipt);else assert.deepEqual(receipt,original);
  if(blocked)throw Error('Mirror remains unresolved');return {artifactUrl:'https://apps.example/exact/index.html',sourceUrl:'https://apps.example/exact/source.json'};
 }};
 const manager=threadRepositories(options),first=await h.open(1,1,manager);await h.checkout(first);await fs.writeFile(path.join(first.work,'file.txt'),'accepted source');await assert.rejects(first.accept(),/Mirror/);const root=path.dirname(first.repositoryPath);await first.close();
 const input={threadId:id(1),invocationId:id(1),repository:'owner/project'};
 await assert.rejects(manager.recoverAccepted(input),/Mirror/);assert.equal(validations,1);assert.equal(publications,2);
 blocked=false;const receipt=await threadRepositories(options).recoverAccepted(input);assert.equal(receipt.acceptedRevision,original.acceptedRevision);assert.equal(validations,1);assert.equal(publications,3);assert.equal(receipt.publication.sourceUrl,'https://apps.example/exact/source.json');assert(!(await fs.readdir(root)).some(name=>name.startsWith('draft-')));
 await manager.recoverAccepted(input);assert.equal(publications,4,'recovery rechecks required publication');assert.equal(validations,1);
 await assert.rejects(manager.recoverAccepted({...input,invocationId:id(99)}),/Exact accepted/);assert.equal(publications,4);assert.equal(admissions,4);
 await assert.rejects(manager.recoverAccepted({...input,repository:'changed/project'}));assert.equal(publications,4);assert.equal(admissions,4);
 const file=path.join(root,'revisions.json'),state=JSON.parse(await fs.readFile(file));
 for(const change of [s=>s.operations[id(1)].validation.revision='d'.repeat(40),s=>s.operations[id(1)].validation.sourceDigest='invalid',s=>s.operations[id(1)].validation.testsPassed=false,s=>s.operations[id(1)].threadId=id(88)]){
  const altered=structuredClone(state);change(altered);await fs.writeFile(file,JSON.stringify(altered));await assert.rejects(manager.recoverAccepted(input));assert.equal(publications,4);assert.equal(admissions,4);
 }
 await fs.writeFile(file,JSON.stringify(state));await repositoryGit(['update-ref','refs/invocations/'+id(1).slice(2),receipt.acceptedRevision+'^'],{cwd:first.repositoryPath});await assert.rejects(manager.recoverAccepted(input),/invocation ref changed/);assert.equal(publications,4);assert.equal(admissions,4);
});
test('accepted recovery refuses absent and unaccepted source without executing validation or creating storage',async t=>{
 const h=await fixture(t),manager=threadRepositories({...h.options,validateRevision:()=>assert.fail('No execution'),onAccepted:()=>assert.fail('No publication')});
 await assert.rejects(manager.recoverAccepted({threadId:id(1),invocationId:id(1),repository:'owner/project'}));await assert.rejects(fs.stat(h.options.directory),{code:'ENOENT'});
 const session=await h.open(1,1,manager);await h.checkout(session);await session.close();await assert.rejects(manager.recoverAccepted({threadId:id(1),invocationId:id(1),repository:'owner/project'}),/Exact accepted/);
});

for(const hasHistory of [false,true])test('trusted allocation precedes every paid call, including summary='+hasHistory,async t=>{
 const {createAgent}=await import('../agent.mjs'),{githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t),events=[];let unavailable=true;
 const manager=threadRepositories({...h.options,startEmpty:true,ensureThread:async input=>{events.push('allocate');assert.match(input.repositoryId,/^[0-9a-f]{64}$/);assert.equal(input.threadId,id(9));if(unavailable)throw Object.assign(Error('Pool exhausted'),{code:'GITHUB_BROKER_POOL_EXHAUSTED'});}});
 const toolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No external GitHub API')});
 const conversation={load:async()=>({canonical:true,complete:true,threadId:id(9),assertCurrent:async()=>{},messages:[...(hasHistory?Array.from({length:9},(_,i)=>({id:id(20+i),role:'user',text:'Earlier request '+ 'x'.repeat(970)})):[]),{id:id(3),role:'user',text:'@bok Build'}]})};
 const model={complete:async input=>{events.push(input.modelId==='cheap'?'summary':'main');assert(!input.tools.some(tool=>tool.function?.name==='ensureThread'));return {message:{role:'assistant',content:'Done'}};}};
 const agent=createAgent({model,toolbox,instructions:'Build',conversation,summaryModelId:'cheap'}),request={id:id(1),postId:id(3),text:'@bok Build',modelId:'main'};
 await assert.rejects(agent.run(request),{code:'GITHUB_BROKER_POOL_EXHAUSTED'});assert.deepEqual(events,['allocate']);
 unavailable=false;await agent.run(request);assert.deepEqual(events,['allocate','allocate',...(hasHistory?['summary']:[]),'main']);
});
test('invalid or changed local identity cannot consume a remote pool slot',async t=>{
 const h=await fixture(t);let allocations=0;const manager=threadRepositories({...h.options,ensureThread:async()=>{allocations++;}});
 for(const input of [{threadId:'invalid',invocationId:id(1),repository:'owner/project'},{threadId:id(1),invocationId:'invalid',repository:'owner/project'},{threadId:id(1),invocationId:id(1),repository:'../invalid/path'}])await assert.rejects(manager.open(input));assert.equal(allocations,0);
 const first=await h.open(1,1,manager);await first.close();assert.equal(allocations,1);
 await assert.rejects(manager.open({threadId:id(1),invocationId:id(2),repository:'changed/project'}));assert.equal(allocations,1);
});
test('connected thread never consumes an empty-thread pool slot',async t=>{
 const h=await fixture(t),connection={fullName:'owner/connected',threadId:id(1)};
 const manager=threadRepositories({...h.options,connections:{connectionFor:()=>connection,readConnected:async()=>assert.fail('No source read requested')},ensureThread:async()=>assert.fail('Connected repository is not a pool slot')});
 const opened=await h.open(1,1,manager);assert.deepEqual(opened.connection,connection);await opened.close();
});

test('accepted recovery hint reads actual durable acceptance without publication or execution and survives restart',async t=>{
 const h=await fixture(t),input={threadId:id(1),invocationId:id(1),repository:'owner/project'};let publications=0,validations=0;
 const options={...h.options,validateRevision:async({revision})=>{validations++;return {passed:true,revision,testsPassed:true,buildPassed:true,sourceDigest:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),artifactArchiveSha256:'c'.repeat(64)};},onAccepted:async()=>{publications++;return {published:true};}},manager=threadRepositories(options);
 assert.equal(await manager.hasAcceptedRecovery(input),false);
 const first=await h.open(1,1,manager);await h.checkout(first);assert.equal(await manager.hasAcceptedRecovery(input),false);await fs.writeFile(path.join(first.work,'file.txt'),'accepted recovery');const accepted=await first.accept();await first.close();
 assert.equal(await manager.hasAcceptedRecovery(input),true);assert.equal(await threadRepositories(options).hasAcceptedRecovery(input),true);assert.equal(await manager.hasAcceptedRecovery({...input,invocationId:id(2)}),false);assert.equal(publications,1);assert.equal(validations,1);
 const file=path.join(path.dirname(first.repositoryPath),'revisions.json'),state=JSON.parse(await fs.readFile(file,'utf8'));state.operations[id(1)].status='prepared';state.acceptedRevision=null;await fs.writeFile(file,JSON.stringify(state));assert.equal(await manager.hasAcceptedRecovery(input),true,'lost acceptance acknowledgement remains eligible for exact recovery');
 state.operations[id(1)].validation.passed=false;await fs.writeFile(file,JSON.stringify(state));assert.equal(await manager.hasAcceptedRecovery(input),false);state.operations[id(1)].validation.passed=true;state.operations[id(1)].invocationId=id(2);await fs.writeFile(file,JSON.stringify(state));await assert.rejects(manager.hasAcceptedRecovery(input));assert.equal(publications,1);assert.equal(validations,1);assert.match(accepted.acceptedRevision,/^[0-9a-f]{40}$/);
});

test('failed validation retains exact candidate across draft cleanup and explicit continuation accepts without replay',async t=>{
 const h=await fixture(t),input={threadId:id(1),invocationId:id(1),repository:'owner/project'};let validations=0,publications=0,ready=false,candidate;
 const options={...h.options,validateRevision:async({sourceDirectory,revision})=>{
  validations++;const record=JSON.parse(await fs.readFile(path.join(path.dirname(sourceDirectory),'..','revisions.json'),'utf8')).candidates[id(1)];
  assert.equal(record.producedRevision,revision);assert.equal(await fs.readFile(path.join(sourceDirectory,'file.txt'),'utf8'),'retained exact source');candidate=record;
  if(!ready)throw Error('Controlled setup failure');return {passed:true,revision,testsPassed:true,buildPassed:true,sourceDigest:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),artifactArchiveSha256:'c'.repeat(64)};
 },onAccepted:async()=>{publications++;return {artifactUrl:'https://apps.example/exact/index.html',sourceUrl:'https://apps.example/exact/source.json'};}};
 let manager=threadRepositories(options);const session=await h.open(1,1,manager);await h.checkout(session);await fs.writeFile(path.join(session.work,'file.txt'),'retained exact source');await assert.rejects(session.check(),/setup failure/);await session.close();await assert.rejects(fs.access(session.work),{code:'ENOENT'});
 assert.equal((await repositoryGit(['show',candidate.producedRevision+':file.txt'],{cwd:session.repositoryPath})).stdout,'retained exact source');
 manager=threadRepositories(options);await assert.rejects(h.open(2,1,threadRepositories({...options,maxRevisions:1})),/revision limit/);assert.equal(await manager.hasAcceptedRecovery(input),false);await assert.rejects(manager.recoverAccepted(input),/Exact accepted invocation/);assert.equal(validations,1);assert.equal(publications,0);
 for(const changed of [{...input,invocationId:id(2)},{...input,repository:'other/repo'},{...input,revision:'c'.repeat(40)}])await assert.rejects(manager.recoverCandidate({...changed,revision:changed.revision??candidate.producedRevision}));assert.equal(validations,1);
 await assert.rejects(manager.recoverCandidate({...input,revision:candidate.producedRevision}),/setup failure/);assert.equal(publications,0);assert.equal(await manager.hasAcceptedRecovery(input),false);
 await repositoryGit(['update-ref',`refs/invocations/${id(1).slice(2)}`,candidate.producedRevision],{cwd:session.repositoryPath});
 ready=true;const accepted=await manager.recoverCandidate({...input,revision:candidate.producedRevision});assert.equal(accepted.acceptedRevision,candidate.producedRevision);assert.equal(validations,3);assert.equal(publications,1);assert.equal(await manager.hasAcceptedRecovery(input),true);
 await manager.recoverCandidate({...input,revision:candidate.producedRevision});assert.equal(validations,3,'accepted continuation never executes source again');assert.equal((await repositoryGit(['rev-parse','refs/heads/accepted'],{cwd:session.repositoryPath})).stdout.trim(),candidate.producedRevision);
});

test('retained candidate refuses failed tests, source mutation, stale base and changed Git binding',async t=>{
 const h=await fixture(t);let phase='setup',candidate,validations=0;
 const options={...h.options,validateRevision:async({sourceDirectory,revision})=>{validations++;candidate=JSON.parse(await fs.readFile(path.join(path.dirname(sourceDirectory),'..','revisions.json'),'utf8')).candidates[id(1)];if(phase==='setup')throw Error('setup');if(phase==='mutate')await fs.writeFile(path.join(sourceDirectory,'unrequested.txt'),'changed');return {passed:true,revision,testsPassed:phase!=='tests',buildPassed:true,sourceDigest:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),artifactArchiveSha256:'c'.repeat(64)};},onAccepted:async()=>assert.fail('Must not publish')};
 const manager=threadRepositories(options),session=await h.open(1,1,manager);await h.checkout(session);await fs.writeFile(path.join(session.work,'file.txt'),'candidate');await assert.rejects(session.check(),/setup/);await session.close();const input={threadId:id(1),invocationId:id(1),repository:'owner/project',revision:candidate.producedRevision};
 phase='tests';await assert.rejects(manager.recoverCandidate(input),/Candidate validation/);phase='mutate';await assert.rejects(manager.recoverCandidate(input),/source changed/);assert.equal(await manager.hasAcceptedRecovery(input),false);
 const before=validations,file=path.join(path.dirname(session.repositoryPath),'revisions.json'),state=JSON.parse(await fs.readFile(file,'utf8'));state.candidates[id(1)].readRevision='b'.repeat(40);await fs.writeFile(file,JSON.stringify(state));await assert.rejects(manager.recoverCandidate(input),/Accepted base changed/);state.candidates[id(1)].readRevision=null;await fs.writeFile(file,JSON.stringify(state));
 await repositoryGit(['update-ref',`refs/candidates/${id(1).slice(2)}/${candidate.producedRevision}`,candidate.parent],{cwd:session.repositoryPath});await assert.rejects(manager.recoverCandidate(input),/candidate ref changed/);assert.equal(validations,before);
});


test('workspace listing reflects staged, untracked, ignored and deleted files without adopting HEAD',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t);let workspace;
 const manager=threadRepositories({...h.options,startEmpty:true});
 const toolbox=githubToolbox({repository:'owner/project',repositories:{open:async input=>(workspace=await manager.open(input))},api:async()=>assert.fail('No API')});
 const session=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});t.after(()=>session.close());
 await session.call('write_file',{path:'index.html',content:'<!doctype html><title>Current draft</title>'});
 assert.deepEqual(await session.call('list_files',{prefix:''}),{files:['index.html'],truncated:false});
 await repositoryGit(['add','index.html'],{cwd:workspace.work});
 assert.deepEqual((await session.call('list_files',{prefix:''})).files,['index.html']);
 await session.call('write_file',{path:'new.js',content:'// new'});
 await session.call('write_file',{path:'.gitignore',content:'ignored.txt\n'});
 await session.call('write_file',{path:'ignored.txt',content:'intentional tool output'});
 await session.call('write_file',{path:'deleted.txt',content:'gone'});
 await repositoryGit(['add','deleted.txt'],{cwd:workspace.work});await repositoryGit(['commit','-m','listing baseline'],{cwd:workspace.work});await fs.rm(path.join(workspace.work,'deleted.txt'));
 assert.deepEqual((await session.call('list_files',{prefix:''})).files,['.gitignore','ignored.txt','index.html','new.js']);
 assert.deepEqual((await session.call('list_files',{prefix:'index'})).files,['index.html']);
 await fs.symlink('/etc/passwd',path.join(workspace.work,'unsafe.txt'));
 assert.deepEqual(await session.call('list_files',{prefix:'unsafe'}),{files:[],truncated:false});await assert.rejects(session.call('read_file',{path:'unsafe.txt'}),/Symlink/);await assert.rejects(session.call('write_file',{path:'unsafe.txt',content:'no follow'}),/Symlink/);
 await fs.rm(path.join(workspace.work,'unsafe.txt'));
 await Promise.all(Array.from({length:501},(_,n)=>fs.writeFile(path.join(workspace.work,`bounded-${String(n).padStart(3,'0')}.txt`),'')));
 const bounded=await session.call('list_files',{prefix:'bounded-'});assert.equal(bounded.files.length,500);assert.equal(bounded.truncated,true);
});

test('workspace prerequisite feedback identifies repair without leaking arbitrary source errors',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const {createIsolatedExecution}=await import('../isolated-execution.mjs');
 const h=await fixture(t),output=path.join(h.root,'output');await fs.mkdir(output);
 const execution=createIsolatedExecution({origin:'https://apps.example',boardOrigin:'https://board.example',workspaceRoot:h.options.directory,outputRoot:output,docker:path.join(h.root,'must-not-run-docker')});
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:input=>execution.execute(input)});let workspace;
 const session=await githubToolbox({repository:'owner/project',repositories:{open:async input=>(workspace=await manager.open(input))},api:async()=>assert.fail('No API')}).open({threadId:id(1),id:id(1),postId:id(9)});t.after(()=>session.close());
 await session.call('write_file',{path:'index.html',content:'<!doctype html><title>Standalone</title>'});
 for(const [content,code,expected] of [[undefined,'STATIC_PACKAGE_REQUIRED',/package.json/],['PRIVATE_PARSE_SENTINEL','STATIC_PACKAGE_INVALID',/valid JSON/],['{}','STATIC_BUILD_REQUIRED',/scripts.build/],[JSON.stringify({scripts:{build:'node build.cjs'}}),'STATIC_TEST_REQUIRED',/test file/]]){
  if(content!==undefined)await session.call('write_file',{path:'package.json',content});
  const result=await session.call('check_workspace',{});assert.equal(result.passed,false);assert.equal(result.phase,'input');assert.equal(result.requirement.code,code);assert.match(result.requirement.message,expected);assert(!JSON.stringify(result).includes('PRIVATE_PARSE_SENTINEL'));
 }
 await session.call('write_file',{path:'main.test.cjs',content:"require('node:test')('fixture',()=>{});"});
 let missing=await session.call('check_workspace',{});assert.equal(missing.requirement.code,'STATIC_BROWSER_TEST_REQUIRED');
 await assert.rejects(session.call('write_file',{path:'browser-tests.json',content:'PRIVATE_PARSE_SENTINEL'}),/valid JSON/);
 // The independent execution gate must still reject bad source not written by a tool.
 await fs.writeFile(path.join(workspace.work,'browser-tests.json'),'PRIVATE_PARSE_SENTINEL');
 missing=await session.call('check_workspace',{});assert.equal(missing.requirement.code,'STATIC_BROWSER_TEST_INVALID');assert(!JSON.stringify(missing).includes('PRIVATE_PARSE_SENTINEL'));
 assert.deepEqual(missing.requirement.detail,{code:'BROWSER_JSON',path:'$',message:'Use valid JSON in browser-tests.json.'});
 const steps=Array.from({length:63},()=>({action:'click',selector:'button'}));steps.push({action:'reload'},{action:'expectVisible',selector:'body'});
 await assert.rejects(session.call('write_file',{path:'browser-tests.json',content:JSON.stringify({version:1,scenarios:[{name:'use app',path:'index.html',steps}]})}),/64 steps/);
 await fs.writeFile(path.join(workspace.work,'browser-tests.json'),JSON.stringify({version:1,scenarios:[{name:'use app',path:'index.html',steps}]}));
 const excessive=await session.call('check_workspace',{});assert.equal(excessive.passed,false);assert.equal(excessive.phase,'input');
 assert.equal(excessive.requirement.code,'STATIC_BROWSER_TEST_INVALID');
 assert.deepEqual(excessive.requirement.detail,{code:'BROWSER_STEP_LIMIT',path:'scenarios[0].steps[64]',message:'Use at most 64 steps across all scenarios.'});

});

test('successful tool writes retain latest unaccepted source when later billing fails before validation',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);let validations=0,publications=0,workspace;
 const options={...h.options,startEmpty:true,validateRevision:async({sourceDirectory,revision})=>{validations++;assert.equal(await fs.readFile(path.join(sourceDirectory,'test.js'),'utf8'),'// exact test');return {passed:true,revision,testsPassed:true,buildPassed:true,sourceDigest:'a'.repeat(64),sourceArchiveSha256:'b'.repeat(64),artifactArchiveSha256:'c'.repeat(64)};},onAccepted:async()=>{publications++;return {published:true};}};
 const manager=threadRepositories(options),session=await githubToolbox({repository:'owner/project',repositories:{open:async input=>(workspace=await manager.open(input))},api:async()=>assert.fail('No GitHub')}).open({threadId:id(1),id:id(1),postId:id(9)});
 const files={'index.html':'<!doctype html><title>Retained</title>','package.json':'{"scripts":{"build":"node build.js"}}','build.js':'// exact build','test.js':'// exact test'};
 for(const [file,content]of Object.entries(files))await session.call('write_file',{path:file,content});
 const journal=path.join(path.dirname(workspace.repositoryPath),'revisions.json'),before=JSON.parse(await fs.readFile(journal));
 assert(before.candidates?.[id(1)],'successful writes must already have immutable custody');
 const candidate=before.candidates[id(1)];assert.equal(before.acceptedRevision,null);assert.deepEqual(before.operations,{});assert.equal(validations,0);assert.equal(publications,0);
 // Agent finally closes after a later billing failure, before check_workspace.
 await session.close();await assert.rejects(fs.access(workspace.work),{code:'ENOENT'});
 for(const [file,content]of Object.entries(files))assert.equal((await repositoryGit(['show',candidate.producedRevision+':'+file],{cwd:workspace.repositoryPath})).stdout,content);
 assert.equal(await manager.hasAcceptedRecovery({threadId:id(1),invocationId:id(1),repository:'owner/project'}),false);
 const result=await threadRepositories(options).recoverCandidate({threadId:id(1),invocationId:id(1),repository:'owner/project',revision:candidate.producedRevision});assert.equal(result.acceptedRevision,candidate.producedRevision);assert.equal(validations,1);assert.equal(publications,1);
});

test('candidate custody failure rejects write and preserves scratch through exceptional close',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);let workspace,failImport=false;
 const git=async(args,options)=>{if(failImport&&args[0]==='fetch'&&args.some(x=>String(x).includes(':refs/candidates/')))throw Error('Candidate import unavailable');return repositoryGit(args,options);};
 const manager=threadRepositories({...h.options,startEmpty:true,git,validateRevision:()=>assert.fail('No execution'),onAccepted:()=>assert.fail('No publication')});
 const session=await githubToolbox({repository:'owner/project',repositories:{open:async input=>(workspace=await manager.open(input))},api:async()=>assert.fail('No API')}).open({threadId:id(1),id:id(1),postId:id(9)});
 await session.call('write_file',{path:'index.html',content:'first retained'});const journal=path.join(path.dirname(workspace.repositoryPath),'revisions.json'),before=await fs.readFile(journal,'utf8');failImport=true;
 await assert.rejects(session.call('write_file',{path:'test.js',content:'last generated output'}),/Candidate import unavailable/);
 await assert.rejects(session.close(),/Candidate import unavailable/);
 assert.equal(await fs.readFile(path.join(workspace.work,'test.js'),'utf8'),'last generated output');assert.equal(await fs.readFile(journal,'utf8'),before);
 assert.equal(await manager.hasAcceptedRecovery({threadId:id(1),invocationId:id(1),repository:'owner/project'}),false);
 // Closing the failed owner releases its queue, but never deletes the retained scratch.
 const next=await manager.open({threadId:id(1),invocationId:id(2),repository:'owner/project'});await next.close();assert.equal(await fs.readFile(path.join(workspace.work,'test.js'),'utf8'),'last generated output');
});

test('exceptional direct workspace close retains latest candidate without validation',async t=>{
 const h=await fixture(t),manager=threadRepositories({...h.options,validateRevision:()=>assert.fail('No validation'),onAccepted:()=>assert.fail('No publication')});
 const session=await h.open(1,1,manager);await h.checkout(session);await fs.writeFile(path.join(session.work,'file.txt'),'latest unvalidated bytes');await session.close();
 const state=JSON.parse(await fs.readFile(path.join(path.dirname(session.repositoryPath),'revisions.json'))),candidate=state.candidates[id(1)];assert.equal(state.acceptedRevision,null);assert.deepEqual(state.operations,{});
 assert.equal((await repositoryGit(['show',candidate.producedRevision+':file.txt'],{cwd:session.repositoryPath})).stdout,'latest unvalidated bytes');
});

test('candidate journal failure preserves scratch even after immutable Git import succeeds',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs'),h=await fixture(t);let workspace;
 const manager=threadRepositories({...h.options,startEmpty:true}),session=await githubToolbox({repository:'owner/project',repositories:{open:async input=>(workspace=await manager.open(input))},api:async()=>assert.fail('No API')}).open({threadId:id(1),id:id(1),postId:id(9)});
 await session.call('write_file',{path:'index.html',content:'first'});
 const journal=path.join(path.dirname(workspace.repositoryPath),'revisions.json');await fs.rename(journal,journal+'.retained');await fs.mkdir(journal);
 await assert.rejects(session.call('write_file',{path:'test.js',content:'exact final bytes'}),{code:'STATE_PERSISTENCE_UNCERTAIN'});
 await assert.rejects(session.close(),{code:'STATE_PERSISTENCE_UNCERTAIN'});
 assert.equal(await fs.readFile(path.join(workspace.work,'test.js'),'utf8'),'exact final bytes');
 const before=JSON.parse(await fs.readFile(journal+'.retained'));assert.equal(before.acceptedRevision,null);assert.deepEqual(before.operations,{});
});

test('thread admission and toolbox share one lease/session and cleanup before agent startup',async()=>{
 const input={threadId:id(1),invocationId:id(2),repository:'owner/project'};let opens=0,closes=0;
 const session={close:async()=>{closes++;}},repositories={open:async candidate=>{assert.deepEqual(candidate,input);opens++;return session;}};
 const admitted=admittedRepositorySession(repositories,input);assert.equal(await admitted.admit(),session);assert.equal(await admitted.open({...input}),session);assert.equal(opens,1);
 await assert.rejects(admitted.open({...input,invocationId:id(3)}));await admitted.close();await admitted.close();assert.equal(closes,1);await assert.rejects(admitted.open(input),/closed/);
 const interrupted=admittedRepositorySession(repositories,input);await interrupted.admit();await interrupted.close();assert.equal(closes,2);
 let failures=0;const failed=admittedRepositorySession({open:async()=>{failures++;throw Error('admission failed');}},input);
 await assert.rejects(failed.admit(),/admission failed/);await assert.rejects(failed.open(input),/admission failed/);await failed.close();assert.equal(failures,1);
});

for(const phase of ['setup','execution','handoff','test','build','browser'])test('unchanged source retries transient '+phase+' validation failures',async t=>{
 const h=await fixture(t);let checks=0;
 const manager=threadRepositories({...h.options,validateRevision:async({revision})=>{
  if(++checks===1)throw Object.assign(Error('Temporary infrastructure failure'),{code:'STATIC_FAILED',result:{passed:false,revision,phase,transport:'transport',failure:{phase,kind:'transport',operation:'start',exitCode:null},outcome:{oomKilled:phase==='test',test:{code:null,limited:true}}}});
  return {passed:true,revision,sourceDigest:'a'.repeat(64)};
 }});
 const session=await h.open(1,1,manager);await h.checkout(session);await fs.writeFile(path.join(session.work,'file.txt'),'changed');
 await assert.rejects(session.check(),/Temporary infrastructure/);assert.equal((await session.check()).passed,true);await session.accept();assert.equal(checks,2);await session.close();
});
test('only known pure source prerequisites are reused until the source changes',async t=>{
 const h=await fixture(t);let checks=0;
 const manager=threadRepositories({...h.options,validateRevision:async({revision})=>{checks++;throw Object.assign(Error('Missing browser plan'),{code:'STATIC_FAILED',result:{passed:false,revision,phase:'input',requirement:'STATIC_BROWSER_TEST_REQUIRED',failure:{phase:'input',kind:'validation',operation:null,exitCode:null}}});}});
 const session=await h.open(1,1,manager);await h.checkout(session);
 await assert.rejects(session.check(),/Missing browser plan/);await assert.rejects(session.check(),/Missing browser plan/);assert.equal(checks,1);
 await fs.writeFile(path.join(session.work,'file.txt'),'edit');await assert.rejects(session.check(),/Missing browser plan/);assert.equal(checks,2);await session.close();
});

test('browser scenario patch keeps unchanged scenarios and validates whole plan before writing',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t);let validations=0;
 const manager=threadRepositories({...h.options,startEmpty:true,validateRevision:async({revision})=>{validations++;return {passed:true,revision,sourceDigest:'a'.repeat(64)};}});
 const toolbox=githubToolbox({repository:'owner/project',repositories:manager,api:async()=>assert.fail('No API')});
 const s=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});t.after(()=>s.close());
 const scenario=(name,n=2)=>({name,path:'index.html',steps:[{action:'reload'},...Array.from({length:n-1},()=>({action:'expectVisible',selector:'p'}))]});
 const original={version:1,scenarios:[scenario('untouched'),scenario('replace')]};
 assert.equal((await s.call('write_file',{path:'browser-tests.json',content:JSON.stringify(original)})).browserPlan.remainingSteps,60);
 const result=await s.call('edit_browser_plan',{remove:[],replace:[{index:1,scenario:scenario('replacement',3)}],append:[scenario('new')]});
 assert.equal(result.browserPlan.steps,7);assert.equal(result.browserPlan.remainingSteps,57);
 const before=(await s.call('read_file',{path:'browser-tests.json'})).text;assert.deepEqual(JSON.parse(before).scenarios[0],original.scenarios[0]);
 for(const args of [{remove:[0,0],replace:[],append:[]},{remove:[0],replace:[{index:0,scenario:scenario('bad')}],append:[]},{remove:[],replace:[],append:[scenario('too many',64)]}])await assert.rejects(s.call('edit_browser_plan',args));
 assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,before);
 await assert.rejects(s.call('write_file',{path:'browser-tests.json',content:JSON.stringify({version:1,scenarios:[scenario('over limit',65)]})}),/64 steps/);
 await assert.rejects(s.call('write_file',{path:'browser-tests.json',content:'{bad JSON'}),/valid JSON/);
 assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,before);
 assert.equal((await s.call('finish_workspace',{})).passed,true);await s.accept();assert.equal(validations,1,'finish and acceptance share exact source validation');
});
