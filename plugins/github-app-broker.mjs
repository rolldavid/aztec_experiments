// Trusted host capability, never exposed as a model tool or passed to generated code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,createPrivateKey,sign,randomUUID} from 'node:crypto';
import {fileState} from './operations.mjs';
const hash=(b,algorithm='sha256')=>createHash(algorithm).update(b).digest('hex');
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(v);
const integer=v=>Number.isSafeInteger(v)&&v>0;
const fail=(code='GITHUB_BROKER_REJECTED')=>Object.assign(Error('GitHub source mirror unavailable'),{code});
const git=(type,b)=>hash(Buffer.concat([Buffer.from(type+' '+b.length+'\0'),b]),'sha1');
const safe=p=>typeof p==='string'&&p.length<=240&&p.split('/').every(s=>/^[A-Za-z0-9.][A-Za-z0-9_.-]*$/.test(s)&&!['.','..','.git','.github','.aws','.ssh','.npmrc','node_modules','credentials','secrets'].includes(s.toLowerCase())&&!/^\.(?:env|yarnrc)(?:[.-]|$)/i.test(s));
async function privateDirectory(p){assert(path.isAbsolute(p)&&await fs.realpath(p)===p);const s=await fs.lstat(p);assert(s.isDirectory()&&(s.mode&0o077)===0);}
async function read(file,max,privateMode=false){const f=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();assert(s.isFile()&&s.nlink===1&&s.size<=max&&(!privateMode||(s.mode&0o077)===0));const b=Buffer.alloc(max+1);let n=0;while(n<b.length){const r=await f.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}const end=await f.stat();assert(n===s.size&&n<=max&&end.size===n&&end.mtimeMs===s.mtimeMs);return b.subarray(0,n);}finally{await f.close();}}
function treeHash(files){const root=new Map();for(const f of files){let dir=root;const parts=f.path.split('/');for(const name of parts.slice(0,-1)){if(!dir.has(name))dir.set(name,new Map());assert(dir.get(name) instanceof Map);dir=dir.get(name);}assert(!dir.has(parts.at(-1)));dir.set(parts.at(-1),f.gitSha);}
 const visit=dir=>git('tree',Buffer.concat([...dir.entries()].sort(([a,av],[b,bv])=>Buffer.compare(Buffer.from(a+(av instanceof Map?'/':'')),Buffer.from(b+(bv instanceof Map?'/':'')))).map(([name,value])=>Buffer.concat([Buffer.from((value instanceof Map?'40000':'100644')+' '+name+'\0'),Buffer.from(value instanceof Map?visit(value):value,'hex')]))));return visit(root);}
async function capture(receipt,artifactRoot){
 // Detached public fields; no auth/operator configuration is persisted with source identity.
 const r=structuredClone(receipt),v=r.validation;
 assert(hex(r.repositoryId,64)&&/^0x[0-9a-f]{64}$/.test(r.threadId)&&/^0x[0-9a-f]{64}$/.test(r.invocationId)&&hex(r.acceptedRevision,40)&&(r.readRevision===null||hex(r.readRevision,40)));
 assert(v?.passed===true&&v.testsPassed===true&&v.buildPassed===true&&v.revision===r.acceptedRevision&&integer(v.testCount)&&hex(v.sourceDigest,64)&&hex(v.sourceArchiveSha256,64));
 assert(typeof v.outputDirectory==='string'&&path.dirname(v.outputDirectory)===artifactRoot&&/^bok-static-[0-9a-f-]{36}$/.test(path.basename(v.outputDirectory)));await privateDirectory(v.outputDirectory);
 assert.deepEqual(JSON.parse(await read(path.join(v.outputDirectory,'cleanup.json'),128)),{ownedContainerAbsent:true});
 const bytes=await read(path.join(v.outputDirectory,'source-snapshot.json'),14*1024*1024);assert.equal(hash(bytes),v.sourceArchiveSha256);const source=JSON.parse(bytes);assert(source.schema===1&&source.revision===r.acceptedRevision&&Array.isArray(source.files)&&source.files.length>0&&source.files.length<=512);
 let total=0;const names=new Set(),files=[];
 for(const f of source.files){assert(safe(f.path)&&!names.has(f.path.toLowerCase())&&typeof f.data==='string'&&f.data.length<=1398104);names.add(f.path.toLowerCase());const b=Buffer.from(f.data,'base64');assert(b.toString('base64')===f.data&&b.length<=1048576&&b.length===f.bytes&&hash(b)===f.sha256);total+=b.length;assert(total<=8388608);files.push({...f,gitSha:git('blob',b)});}
 for(const name of names)assert(![...names].some(other=>other.startsWith(name+'/')));
 const manifest=files.map(({path,sha256,bytes})=>({path,sha256,bytes}));assert.deepEqual(source.manifest,manifest);assert.deepEqual(v.sourceManifest,manifest);assert.equal(hash(JSON.stringify(manifest)),v.sourceDigest);
 return {binding:{repositoryId:r.repositoryId,threadId:r.threadId,invocationId:r.invocationId,acceptedRevision:r.acceptedRevision,readRevision:r.readRevision,sourceDigest:v.sourceDigest,sourceArchiveSha256:v.sourceArchiveSha256},files,tree:treeHash(files)};
}

/** One trusted host owns directory. Disabled by default; no ambient gh/env tokens.
 * REST mirror commits are explicitly DISTINCT from local accepted Git commits. */
async function broker({enabled=false,directory,artifactRoot,organization,organizationId,appId,installationId,privateKeyFile,fetchImpl=globalThis.fetch,now=Date.now}){
 if(enabled!==true){const disabled=async()=>{throw fail('GITHUB_BROKER_DISABLED');};return Object.freeze({assertAvailable:disabled,sync:disabled});}
 assert(typeof organization==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(organization));for(const n of [organizationId,appId,installationId])assert(integer(n));
 await privateDirectory(directory);await privateDirectory(artifactRoot);assert(typeof privateKeyFile==='string'&&!privateKeyFile.startsWith(artifactRoot+path.sep));await privateDirectory(path.dirname(privateKeyFile));
 const key=createPrivateKey(await read(privateKeyFile,16384,true));assert(key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails.modulusLength>=2048);
 const config={organization,organizationId,appId,installationId},file=path.join(directory,'github-app-state.json');
 try{await read(file,8*1024*1024,true);}catch(e){if(e.code!=='ENOENT')throw fail();}
 const store=await fileState(file);let state=store.read(),busy=false,poisoned=false;
 if(state.schema===undefined){assert.deepEqual(state,{operations:{}});state={schema:1,config,repositories:{}};await store.write(state);}
 assert(state.schema===1);assert.deepEqual(state.config,config);assert(state.repositories&&Object.keys(state.repositories).length<=128);
 async function save(){try{assert(Buffer.byteLength(JSON.stringify(state))<=8*1024*1024);await store.write(state);}catch{poisoned=true;throw fail('GITHUB_BROKER_RECORD_FAILED');}}
 async function owned(fn){if(busy||poisoned)throw fail('GITHUB_BROKER_UNAVAILABLE');busy=true;try{return await fn();}catch(e){throw fail(['GITHUB_BROKER_UNRESOLVED','GITHUB_BROKER_RECORD_FAILED'].includes(e?.code)?e.code:undefined);}finally{busy=false;}}
 function session(){const deadline=now()+120000;let calls=0;
  const jwt=()=>{const t=Math.floor(now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({iat:t-60,exp:t+540,iss:String(appId)})).toString('base64url'),input=head+'.'+body;return input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');};
  async function request(method,route,body,token){assert(++calls<=540&&now()<deadline&&route.startsWith('/')&&!/[\r\n#]/.test(route));const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,deadline-now()));
   try{const response=await fetchImpl('https://api.github.com'+route,{method,redirect:'error',credentials:'omit',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json',Authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
    if(response.status===404){await response.body?.cancel();return null;}assert(response.ok);const chunks=[];let n=0;for await(const chunk of response.body){n+=chunk.length;assert(n<=2*1024*1024);chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
   }finally{clearTimeout(timer);}}
  async function available(){const i=await request('GET','/app/installations/'+installationId,undefined,jwt());assert(i?.id===installationId&&i.app_id===appId&&i.target_type==='Organization'&&i.account?.type==='Organization'&&i.account.id===organizationId&&i.account.login===organization&&i.suspended_at===null&&i.repository_selection==='all');assert(i.permissions?.administration==='write'&&i.permissions?.contents==='write');for(const [name,level] of Object.entries(i.permissions))assert((name==='metadata'&&level==='read')||(['administration','contents'].includes(name)&&level==='write'));return {available:true,organization,organizationId,appId,installationId};}
  async function token(repositoryId){const body={permissions:repositoryId?{contents:'write'}:{administration:'write'},...(repositoryId?{repository_ids:[repositoryId]}:{})},r=await request('POST','/app/installations/'+installationId+'/access_tokens',body,jwt());assert(typeof r?.token==='string'&&r.token.length>0&&r.token.length<=16384&&Date.parse(r.expires_at)>now()+120000);assert(r.permissions?.[repositoryId?'contents':'administration']==='write');for(const [name,level] of Object.entries(r.permissions))assert((name==='metadata'&&level==='read')||(name===(repositoryId?'contents':'administration')&&level==='write'));if(repositoryId)assert(Array.isArray(r.repositories)&&r.repositories.length===1&&r.repositories[0].id===repositoryId);return r.token;}
  return {request,available,token};
 }
 return Object.freeze({
  assertAvailable:()=>owned(()=>session().available()),
  sync:receipt=>owned(async()=>{
   const captured=await capture(receipt,artifactRoot),b=captured.binding,id=hash(JSON.stringify([b.repositoryId,b.threadId])),name='bok-'+id,route='/repos/'+organization+'/'+name,s=session();await s.available();
   let repo=state.repositories[id];
   if(!repo){assert(Object.keys(state.repositories).length<128&&b.readRevision===null);repo={repositoryId:b.repositoryId,threadId:b.threadId,marker:'Bok source mirror '+id+' '+randomUUID(),steps:{},revisions:{},latest:null};state.repositories[id]=repo;await save();}
   assert(repo.repositoryId===b.repositoryId&&repo.threadId===b.threadId);
   let entry=repo.revisions[b.acceptedRevision];
   if(entry){assert.deepEqual(entry.binding,b);}else{assert(repo.latest===b.readRevision&&Object.keys(repo.revisions).length<64&&!Object.values(repo.revisions).some(r=>r.binding.invocationId===b.invocationId));assert(!Object.values(repo.revisions).some(r=>!r.complete));entry={binding:b,date:new Date(Math.floor(now()/1000)*1000).toISOString().replace('.000Z','Z'),steps:{},complete:false};repo.revisions[b.acceptedRevision]=entry;await save();}
   async function once(steps,label,method,url,body,credential,project,reconcile){const identity=hash(JSON.stringify([method,url,body]));let record=steps[label];if(record){assert(record.identity===identity);if(record.done)return record.result;const found=await reconcile();if(found===null)throw fail('GITHUB_BROKER_UNRESOLVED');record.result=project(found);record.done=true;await save();return record.result;}
    record={identity,done:false};steps[label]=record;await save();const response=await s.request(method,url,body,credential);record.result=project(response);record.done=true;await save();return record.result;}
   const admin=await s.token();
   function repository(r){assert(r&&integer(r.id)&&r.name===name&&r.full_name===organization+'/'+name&&r.owner?.id===organizationId&&r.owner?.login===organization&&r.owner?.type==='Organization'&&r.private===true&&r.fork===false&&r.archived===false&&r.description===repo.marker&&typeof r.default_branch==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.default_branch));return {id:r.id,branch:r.default_branch};}
   // An existing name without OUR durable creation intent is never adopted.
   if(!repo.steps.create){assert(await s.request('GET',route,undefined,admin)===null);}
   const remote=await once(repo.steps,'create','POST','/orgs/'+organization+'/repos',{name,description:repo.marker,private:true,auto_init:true,has_issues:false,has_projects:false,has_wiki:false},admin,repository,()=>s.request('GET',route,undefined,admin));
   assert.deepEqual(repository(await s.request('GET',route,undefined,admin)),remote);
   const token=await s.token(remote.id),ref=route+'/git/ref/heads/'+remote.branch,refWrite=route+'/git/refs/heads/'+remote.branch;
   const head=async()=>{const r=await s.request('GET',ref,undefined,token);assert(r?.ref==='refs/heads/'+remote.branch&&r.object?.type==='commit'&&hex(r.object.sha,40));return r.object.sha;};
   if(entry.complete){if(repo.latest===b.acceptedRevision)assert.equal(await head(),entry.remoteCommit);return structuredClone(entry.result);}
   if(!entry.parent){entry.parent=repo.latest?repo.revisions[repo.latest].remoteCommit:await head();assert(hex(entry.parent,40));await save();}
   // Final ref write is non-forced, with exactly captured predecessor rechecked.
   const intendedRef=entry.steps.ref;const current=await head();assert(current===entry.parent||(intendedRef&&current===entry.remoteCommit));
   for(const f of captured.files)await once(entry.steps,'blob:'+f.path,'POST',route+'/git/blobs',{content:f.data,encoding:'base64'},token,r=>{assert(r?.sha===f.gitSha);return {sha:r.sha};},()=>s.request('GET',route+'/git/blobs/'+f.gitSha,undefined,token));
   const tree=await once(entry.steps,'tree','POST',route+'/git/trees',{tree:captured.files.map(f=>({path:f.path,mode:'100644',type:'blob',sha:f.gitSha}))},token,r=>{assert(r?.sha===captured.tree);return {sha:r.sha};},()=>s.request('GET',route+'/git/trees/'+captured.tree,undefined,token));
   const message='Accepted source '+b.acceptedRevision+'\n\nSource-Digest: '+b.sourceDigest+'\nRepository-ID: '+b.repositoryId+'\nThread-ID: '+b.threadId+'\nInvocation-ID: '+b.invocationId+'\n',author={name:'Bok source mirror',email:'bok-source@users.noreply.github.com',date:entry.date},seconds=Date.parse(entry.date)/1000;
   const commitBytes=Buffer.from('tree '+tree.sha+'\nparent '+entry.parent+'\nauthor '+author.name+' <'+author.email+'> '+seconds+' +0000\ncommitter '+author.name+' <'+author.email+'> '+seconds+' +0000\n\n'+message),expected=git('commit',commitBytes);
   const commit=await once(entry.steps,'commit','POST',route+'/git/commits',{message,tree:tree.sha,parents:[entry.parent],author,committer:author},token,r=>{assert(r?.sha===expected&&r.tree?.sha===tree.sha&&r.parents?.length===1&&r.parents[0].sha===entry.parent&&r.message===message);return {sha:r.sha};},()=>s.request('GET',route+'/git/commits/'+expected,undefined,token));
   if(!entry.remoteCommit){entry.remoteCommit=commit.sha;await save();}assert.equal(entry.remoteCommit,commit.sha);
   const before=await head();assert(before===entry.parent||(entry.steps.ref&&before===commit.sha));
   await once(entry.steps,'ref','PATCH',refWrite,{sha:commit.sha,force:false},token,r=>{assert(r?.ref==='refs/heads/'+remote.branch&&r.object?.sha===commit.sha&&r.object.type==='commit');return {sha:commit.sha};},async()=>{const r=await s.request('GET',ref,undefined,token);return r?.object?.sha===commit.sha?r:null;});
   assert.equal(await head(),commit.sha);
   entry.result={mirrored:true,repositoryId:b.repositoryId,threadId:b.threadId,acceptedRevision:b.acceptedRevision,sourceDigest:b.sourceDigest,remoteRepositoryId:remote.id,remoteCommit:commit.sha,remoteTree:tree.sha,remoteParent:entry.parent,operatorUrl:'https://github.com/'+organization+'/'+name+'/tree/'+commit.sha};entry.complete=true;repo.latest=b.acceptedRevision;await save();return structuredClone(entry.result);
  })
 });
}

export async function createGitHubAppBroker(options={}){try{return await broker(options);}catch{throw fail('GITHUB_BROKER_UNAVAILABLE');}}
