import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileState,readHostedPrivateFile} from './operations.mjs';
import {STATIC_SOURCE_REQUIREMENTS} from './isolated-execution.mjs';
const exec=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
const revision=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
/** Trusted fixed Git operations only. Never use this port to execute generated
 * programs. No developer environment, Git configuration or credentials propagate.
 */
export const repositoryGit=(args,options={})=>exec('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','core.fsync=all','-c','credential.helper=',...args],{
 maxBuffer:4*1024*1024,...options,env:{PATH:'/usr/bin:/bin',HOME:'/var/empty',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Bok',GIT_AUTHOR_EMAIL:'bok@invalid',GIT_COMMITTER_NAME:'Bok',GIT_COMMITTER_EMAIL:'bok@invalid',LC_ALL:'C'}});
/** One request keeps its admitted repository lease through agent execution.
 * The preflight and toolbox consume the same exact session, including a failed
 * open promise. Closing is safe even when admission fails before agent startup. */
export function admittedRepositorySession(repositories,input){
 const identity=Object.freeze({...input});let opening,closed=false;
 const open=async candidate=>{assert(!closed,'Admitted repository closed');assert.deepEqual(candidate,identity);return opening??=(repositories.open(identity));};
 return Object.freeze({admit:()=>open(identity),open,async close(){if(closed)return;closed=true;if(opening){let session;try{session=await opening;}catch{return;}await session.close();}}});
}
/** One manager under the existing hosted lease. Its queues serialize a thread,
 * while different threads have independent repositories and invocation drafts.
 * This stores source revisions only; the paid-call journal remains authoritative
 * for provider recovery and must never be replayed because a draft exists.
 */
export function threadRepositories({directory,namespace,lease,git=repositoryGit,validateRevision,maxBytes=64*1024*1024,maxRevisions=1000,startEmpty=false,onAccepted,connections,ensureThread}){
 assert(path.isAbsolute(directory)&&typeof namespace==='string'&&namespace.length>0&&typeof lease?.assertHeld==='function');
 assert(Number.isSafeInteger(maxBytes)&&maxBytes>=1024&&Number.isSafeInteger(maxRevisions)&&maxRevisions>0);
 assert(validateRevision===undefined||typeof validateRevision==='function');
 assert(connections===undefined||(typeof connections.connectionFor==='function'&&typeof connections.readConnected==='function'));assert.equal(typeof startEmpty,'boolean');assert(onAccepted===undefined||typeof onAccepted==='function');
 assert(ensureThread===undefined||typeof ensureThread==='function');
 const queues=new Map();
 async function size(directory){let total=0;for(const entry of await fs.readdir(directory)){const file=path.join(directory,entry),stat=await fs.lstat(file);assert(!stat.isSymbolicLink(),'Repository symlink rejected');if(stat.isDirectory())total+=await size(file);else{assert(stat.isFile());total+=stat.size;}assert(total<=maxBytes,'Thread storage limit reached');}return total;}
 async function open({threadId,invocationId,repository,revision:expectedRevision},recovery=false){
  let recoverAccepted=recovery==='accepted';
  assert(/^0x[0-9a-f]{64}$/.test(threadId)&&/^0x[0-9a-f]{64}$/.test(invocationId));
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository));
  const key=sha(namespace+'\0'+threadId),previous=queues.get(key)||Promise.resolve();let unlock;
  const turn=new Promise(resolve=>{unlock=resolve;});queues.set(key,turn);await previous;
  let draft,closed=false;
  const release=()=>{if(queues.get(key)===turn)queues.delete(key);unlock();};
  try{
   await lease.assertHeld();
   if(recovery)await fs.access(path.join(directory,key,'revisions.json'));
   await fs.mkdir(directory,{recursive:true,mode:0o700});assert.equal(await fs.realpath(directory),directory);assert.equal((await fs.stat(directory)).mode&0o777,0o700);
   const root=path.join(directory,key);await fs.mkdir(root,{mode:0o700,recursive:true});assert.equal(await fs.realpath(root),root);
   const store=await fileState(path.join(root,'revisions.json')),repo=path.join(root,'repository.git');let state=store.read();
   const connection=connections?.connectionFor(threadId)??null;
   if(connection)repository=connection.fullName;
   const identity={namespace,threadId,repository,startEmpty,...(connection?{connection}:{})};
   if(state.identity)assert.deepEqual(state.identity,identity);
   if(!recovery&&!connection&&ensureThread)await ensureThread({repositoryId:key,threadId});
   if(!state.identity){
    assert(!recovery,'No accepted repository identity');
    await git(['init','--bare',repo]);await store.write({identity,acceptedRevision:null,operations:{}});state=store.read();
   }
   assert.deepEqual(state.identity,identity);assert.equal(await fs.realpath(repo),repo);
   const head=async()=>{const r=await git(['for-each-ref','--format=%(objectname)','refs/heads/accepted'],{cwd:repo});return r.stdout.trim()||null;};
   // Recover only an already advanced exact ref after interrupted acknowledgement.
   // A prepared but unapplied intent stays explicit; no ambiguous write replay.
   for(const [id,record] of Object.entries(state.operations))if(record.status==='prepared'){
    assert(revision(record.producedRevision));const current=await head();
    if(current!==record.producedRevision)throw Error('Repository acceptance requires reconciliation');
    await store.write({...state,acceptedRevision:current,operations:{...state.operations,[id]:{...record,status:'accepted'}}});state=store.read();
   }
   assert.equal(await head(),state.acceptedRevision,'Accepted repository ref changed');
   const receipt=record=>({repositoryId:key,threadId,invocationId:record.invocationId,readRevision:record.readRevision,acceptedRevision:record.producedRevision,validation:record.validation,...(connection?{connection:structuredClone(connection)}:{})});
   async function publish(record,verify=false){
    if(!onAccepted||record.publication?.status==='complete'&&!verify)return record.publication?.result;
    await lease.assertHeld();const result=await onAccepted(receipt(record));
    await store.write({...state,operations:{...state.operations,[record.invocationId]:{...record,publication:{status:'complete',result}}}});state=store.read();return result;
   }
   async function acceptRecord({produced,validation,readRevision}){
    const record={threadId,invocationId,readRevision,producedRevision:produced,validation,status:'prepared',...(onAccepted?{publication:{status:'pending'}}:{})};
    await store.write({...state,operations:{...state.operations,[invocationId]:record}});state=store.read();
    await lease.assertHeld();await git(['update-ref','refs/heads/accepted',produced,readRevision||'0'.repeat(40)],{cwd:repo});
    await store.write({...state,acceptedRevision:produced,operations:{...state.operations,[invocationId]:{...record,status:'accepted'}}});state=store.read();
    const publication=await publish(state.operations[invocationId]);
    return Object.freeze({...receipt(record),...(publication?{publication}:{})});
   }
   if(recovery==='candidate'){
    assert(revision(expectedRevision),'Exact candidate revision required');
    if(state.operations[invocationId]?.status==='accepted'){
     assert.equal(state.operations[invocationId].producedRevision,expectedRevision,'Candidate revision changed');recoverAccepted=true;
    }else{
     assert(!state.operations[invocationId],'Acceptance requires reconciliation');
     const candidate=state.candidates?.[invocationId];
     assert(candidate&&candidate.threadId===threadId&&candidate.invocationId===invocationId&&candidate.producedRevision===expectedRevision,'Exact retained candidate required');
     assert.equal(candidate.readRevision,state.acceptedRevision,'Accepted base changed');
     assert(typeof validateRevision==='function'&&typeof onAccepted==='function','Trusted validation and publication required');
     const ref=`refs/candidates/${invocationId.slice(2)}/${expectedRevision}`;
     assert.equal((await git(['rev-parse','--verify',ref],{cwd:repo})).stdout.trim(),expectedRevision,'Retained candidate ref changed');
     assert.equal((await git(['rev-parse',expectedRevision+'^{tree}'],{cwd:repo})).stdout.trim(),candidate.tree,'Retained candidate tree changed');
     assert.equal((await git(['rev-list','--parents','-n','1',expectedRevision],{cwd:repo})).stdout.trim(),expectedRevision+' '+candidate.parent,'Retained candidate parent changed');
     draft=await fs.mkdtemp(path.join(root,'draft-'));const work=path.join(draft,'repository');let recovered;
     try{
      await git(['init',work]);await git(['fetch','--no-tags',repo,ref],{cwd:work});await git(['checkout','--detach',expectedRevision],{cwd:work});await size(root);
      // Explicit operator continuation performs one normal isolated validation.
      // Merely retaining a candidate never makes it an automatic recovery hint.
      const validation=await validateRevision({sourceDirectory:work,revision:expectedRevision});
      assert(validation?.passed===true&&validation.revision===expectedRevision&&validation.testsPassed===true&&validation.buildPassed===true,'Candidate validation required');
      for(const name of ['sourceDigest','sourceArchiveSha256','artifactArchiveSha256'])assert(/^[0-9a-f]{64}$/.test(validation[name]),'Candidate validation digest required');
      assert.equal((await git(['status','--porcelain','--untracked-files=all'],{cwd:work})).stdout,'','Validated candidate source changed');
      await lease.assertHeld();assert.equal(await head(),candidate.readRevision,'Accepted base changed during validation');
      if(!connection&&ensureThread)await ensureThread({repositoryId:key,threadId});
      const importedRef=`refs/invocations/${invocationId.slice(2)}`,imported=(await git(['for-each-ref','--format=%(objectname)',importedRef],{cwd:repo})).stdout.trim();
      assert(!imported||imported===expectedRevision,'Candidate invocation ref changed');
      if(!imported)await git(['update-ref',importedRef,expectedRevision,'0'.repeat(40)],{cwd:repo});
      await git(['fsck','--connectivity-only','--no-dangling'],{cwd:repo});
      recovered=await acceptRecord({produced:expectedRevision,validation,readRevision:candidate.readRevision});
     }finally{await fs.rm(draft,{recursive:true,force:true});}
     release();return recovered;
    }
   }
   if(recoverAccepted){
    const record=state.operations[invocationId];
    assert(record?.status==='accepted'&&record.threadId===threadId&&record.invocationId===invocationId&&record.producedRevision===state.acceptedRevision,'Exact accepted invocation required');
    assert(record.validation?.passed===true&&record.validation.revision===record.producedRevision&&record.validation.testsPassed===true&&record.validation.buildPassed===true,'Accepted validation required');
    for(const name of ['sourceDigest','sourceArchiveSha256','artifactArchiveSha256'])assert(/^[0-9a-f]{64}$/.test(record.validation[name]),'Accepted validation digest required');
    await git(['cat-file','-e',record.producedRevision+'^{commit}'],{cwd:repo});
    assert.equal((await git(['rev-parse','--verify',`refs/invocations/${invocationId.slice(2)}`],{cwd:repo})).stdout.trim(),record.producedRevision,'Accepted invocation ref changed');
    assert(typeof onAccepted==='function','Accepted publication required');
    // Validate the exact retained invocation before admitting its mirror slot.
    if(!connection&&ensureThread)await ensureThread({repositoryId:key,threadId});
    const publication=await publish(record,true);
    await lease.assertHeld();assert.equal(await head(),record.producedRevision,'Accepted repository ref changed');
    const recovered=Object.freeze({...receipt(record),publication});release();return recovered;
   }
   // Trusted publication/mirror capabilities reconcile their durable intents;
   // never re-enter provider work or retransmit an uncertain external write.
   for(const record of Object.values(state.operations))if(record.status==='accepted'&&record.publication?.status==='pending')await publish(record);
   if(state.operations[invocationId])throw Error('Invocation already has an accepted revision');
   assert(new Set([...Object.keys(state.operations),...Object.keys(state.candidates??{})]).size<maxRevisions,'Thread revision limit reached');
   const readRevision=state.acceptedRevision;draft=await fs.mkdtemp(path.join(root,'draft-'));const work=path.join(draft,'repository');let accepted=null,acceptStarted=false;
   let checked=null,failedCheck=null,snapshot=null;
   const retain=async(force=false)=>{
    assert(!closed);await lease.assertHeld();
    const parent=(await git(['rev-parse','HEAD'],{cwd:work})).stdout.trim();assert(revision(parent));if(readRevision)assert.equal(parent,readRevision);
    const used=await size(root),scratch=await size(draft);assert(used+scratch<=maxBytes,'Thread storage limit reached');
    await git(['add','--all','--force','--','.'],{cwd:work});const tree=(await git(['write-tree'],{cwd:work})).stdout.trim();assert(revision(tree));
    if(snapshot?.tree===tree&&snapshot.parent===parent&&(!force||snapshot.retained))return snapshot;
    const produced=(await git(['commit-tree',tree,'-p',parent,'-m',`Bok thread invocation ${invocationId}`],{cwd:work})).stdout.trim();assert(revision(produced));
    const unchanged=(startEmpty||connection)&&tree===(await git(['rev-parse',parent+'^{tree}'],{cwd:work})).stdout.trim();
    if(!unchanged||force){
     // Custody is independent of validation and acceptance. Successful tool
     // writes survive a later billing/transport failure or process interruption.
     // Keep it distinct from accepted refs and ordinary recovery operations.
     const candidateRef=`refs/candidates/${invocationId.slice(2)}/${produced}`;
     await git(['fetch','--no-tags','--update-shallow',work,`${produced}:${candidateRef}`],{cwd:repo});
     assert.equal((await git(['rev-parse','--verify',candidateRef],{cwd:repo})).stdout.trim(),produced,'Candidate source was not retained');
     await size(root);
     const candidate={threadId,invocationId,readRevision,producedRevision:produced,parent,tree};
     await store.write({...state,candidates:{...state.candidates,[invocationId]:candidate}});state=store.read();
    }
    snapshot={tree,parent,produced,unchanged,retained:!unchanged||force};return snapshot;
   };
   const prepare=async(forceCheck=false)=>{
    const {tree,parent,produced,unchanged}=await retain(forceCheck);
    if(checked?.tree===tree&&checked.parent===parent&&(!forceCheck||checked.validation))return checked;
    checked=null;
    if(failedCheck?.tree===tree&&failedCheck.parent===parent)throw failedCheck.error;
    failedCheck=null;
    let validation;
    try{validation=(!unchanged||forceCheck)&&validateRevision?await validateRevision({sourceDirectory:work,revision:produced}):null;}
    catch(error){
     // Only pure source prerequisites are deterministic. Test/build/browser
     // execution can fail transiently (daemon, transport, resource limits or
     // handoff), even when its outer code is STATIC_FAILED. Never cache those.
     const r=error.result,f=r?.failure;
     if(error.code==='STATIC_FAILED'&&r?.passed===false&&r.revision===produced&&r.phase==='input'&&
      Object.hasOwn(STATIC_SOURCE_REQUIREMENTS,r.requirement)&&!r.transport&&!r.outcome&&!r.cleanupFailure&&
      f?.phase==='input'&&f.kind==='validation'&&f.operation===null&&f.exitCode===null)failedCheck={tree,parent,error};
     throw error;
    }
    if((!unchanged||forceCheck)&&validateRevision){assert(validation?.passed===true&&validation.revision===produced&&/^[0-9a-f]{64}$/.test(validation.sourceDigest),'Isolated revision validation failed');await git(['diff','--quiet',produced,'--'],{cwd:work});}
    checked={tree,parent,produced,validation,unchanged};return checked;
   };
   return Object.freeze({work,repositoryPath:repo,readRevision,startEmpty,connection,
    retain:()=>{assert(!acceptStarted);return retain();},
    initialSource:connection?async()=>{const source=await connections.readConnected(threadId);assert.deepEqual(source.mapping,connection);return source.files;}:undefined,
    async check(){assert(!acceptStarted);assert(validateRevision,'Isolated revision validation unavailable');return (await prepare(true)).validation;},
    async accept(){
     assert(!closed);if(accepted)return accepted;assert(!acceptStarted,'Acceptance already attempted; reopen and reconcile');acceptStarted=true;await lease.assertHeld();
     const {produced,validation,unchanged}=await prepare();
     if(unchanged)return null;
     // Import objects before persisting the intended CAS. The ref is internal and
     // never selects a source revision for publication by itself.
     const importedRef=`refs/invocations/${invocationId.slice(2)}`;
     await git(['fetch','--no-tags','--update-shallow',work,`${produced}:${importedRef}`],{cwd:repo});
     assert.equal((await git(['rev-parse','--verify',importedRef],{cwd:repo})).stdout.trim(),produced,'Produced revision was not imported');
     await git(['fsck','--connectivity-only','--no-dangling'],{cwd:repo});
     accepted=await acceptRecord({produced,validation,readRevision});return accepted;
    },
    async close(){
     if(closed)return;
     try{
      if(!state.operations[invocationId]){
       let initialized=false;try{await fs.access(path.join(work,'.git'));initialized=true;}catch(error){if(error.code!=='ENOENT')throw error;}
       // Direct workspace changes also retain custody. If the lease, Git import
       // or journal write fails, leave the only scratch copy intact and fail.
       if(initialized)await retain();
      }
      await fs.rm(draft,{recursive:true,force:true});
     }finally{closed=true;release();}
    }
   });
  }catch(error){release();throw error;}
 }
 /** Only a local recovery candidate hint. The normal recovery still validates
  * exact Git refs, billing, artifacts and publication before any reply. */
 async function hasAcceptedRecovery({threadId,invocationId,repository}){
  await lease.assertHeld();assert(/^0x[0-9a-f]{64}$/.test(threadId)&&/^0x[0-9a-f]{64}$/.test(invocationId));assert(/^[\w.-]+\/[\w.-]+$/.test(repository));
  const root=path.join(directory,sha(namespace+'\0'+threadId)),file=path.join(root,'revisions.json');
  try{await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return false;throw error;}
  assert.equal(await fs.realpath(root),root,'Repository path changed');
  const state=JSON.parse((await readHostedPrivateFile(file)).toString('utf8')),connection=connections?.connectionFor(threadId)??null;
  assert.deepEqual(state.identity,{namespace,threadId,repository:connection?.fullName??repository,startEmpty,...(connection?{connection}:{})});
  const record=state.operations?.[invocationId];
  if(!record)return false;
  assert(record.threadId===threadId&&record.invocationId===invocationId,'Accepted invocation identity changed');
  if(!['prepared','accepted'].includes(record.status)||!revision(record.producedRevision))return false;
  if(record.status==='accepted'&&record.producedRevision!==state.acceptedRevision)return false;
  const v=record.validation;
  return v?.passed===true&&v.revision===record.producedRevision&&v.testsPassed===true&&v.buildPassed===true&&['sourceDigest','sourceArchiveSha256','artifactArchiveSha256'].every(name=>/^[0-9a-f]{64}$/.test(v[name]));
 }
 return Object.freeze({open:input=>open(input),recoverAccepted:input=>open(input,'accepted'),recoverCandidate:input=>open(input,'candidate'),hasAcceptedRecovery});
}
