// Actual local Git repositories. No GitHub, provider, generated-code execution or proofs.
import test from 'node:test';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {threadRepositories,repositoryGit} from '../thread-repositories.mjs';
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
 const first=await h.open();await h.checkout(first);h.options.lease.assertHeld=async()=>{throw Error('lease lost');};await assert.rejects(first.accept(),/lease lost/);await first.close();
 h.options.lease.assertHeld=async()=>{};await assert.rejects(h.manager.open({threadId:id(1),invocationId:id(2),repository:'different/project'}));
});

test('existing toolbox edits and accepts actual thread source across independent invocations',async t=>{
 const {githubToolbox}=await import('../github-tools.mjs');const h=await fixture(t),seed=path.join(h.root,'seed');
 await repositoryGit(['init',seed]);await fs.writeFile(path.join(seed,'hello.txt'),'start');await repositoryGit(['add','.'],{cwd:seed});await repositoryGit(['commit','-m','seed'],{cwd:seed});await fs.writeFile(path.join(seed,'hello.txt'),'later');await repositoryGit(['commit','-am','second seed'],{cwd:seed});
 let apiCalls=0;const api=async(method,route)=>{apiCalls++;if(route.includes('/git/commits/'))return {tree:{sha:'fixture-tree'}};if(route.includes('/git/trees/'))return {sha:'fixture-tree',truncated:false,tree:[{path:'hello.txt',type:'blob',size:5}]};return {default_branch:'main'};};
 const toolbox=githubToolbox({repository:'owner/project',api,repositories:h.manager,runCommand:async(command,args,options)=>{assert.equal(command,'git');return repositoryGit(args.map(arg=>arg==='https://github.com/owner/project.git'?pathToFileURL(seed).href:arg),options);}});
 const first=await toolbox.open({threadId:id(1),id:id(1),postId:id(9)});
 assert(!first.definitions.some(d=>d.function.name==='create_pr'));
 await first.call('write_file',{path:'hello.txt',content:'accepted from first participant'});const revision=await first.accept();await first.close();
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
 const next=await h.open(2,1,threadRepositories({...h.options,maxBytes:1024}));await h.checkout(next);await assert.rejects(next.accept(),/storage limit/);await next.close();
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
