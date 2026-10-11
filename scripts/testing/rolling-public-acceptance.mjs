// Actual canonical-node acceptance, called only after the five genuine actions.
// No synthetic events or in-memory index substitute are accepted here.
import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import {createRollingPublicIndex} from '../../shared/rolling/public-index.mjs';
import {publicFeedFileStorage} from '../../shared/public-feed-file-storage.mjs';
import {serveRollingReaderAsset} from '../../apps/rolling/start.mjs';
import {startRollingPublicServer} from '../rolling-public-server.mjs';
import {createPublicReader} from '../../apps/rolling/reader-client.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assertCanonicalSocialViews(projection,rows){
 for(const {route,parameters,expected}of rows){
  assert(['feed','thread','post'].includes(route));
  const actual=route==='post'?{post:projection.post(parameters.id)}:route==='thread'?projection.thread(parameters.root,parameters):projection.feed(parameters);
  // Raw projection owns canonical posts and cursors. The HTTP index enriches
  // names/boards; those remain mandatory in assertSocialHTTPView below.
  const keys=route==='post'?['post']:['posts','nextCursor'];
  assert(keys.every(key=>Object.hasOwn(expected,key)&&Object.hasOwn(actual,key)));
  assert.deepEqual(Object.fromEntries(keys.map(key=>[key,actual[key]])),Object.fromEntries(keys.map(key=>[key,expected[key]])));
 }
}
export function assertSocialHTTPView(actual,expected){
 assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key=>[key,actual[key]])),expected);
}
export function assertCanonicalOwnedNameProfiles(projection,profiles){
 assert(Array.isArray(profiles)&&profiles.length===4);
 const seen=new Set();for(const expected of profiles){
  assert(expected?.identity?.id&&!seen.has(expected.identity.id));seen.add(expected.identity.id);
  assert.deepEqual(expected.posts,[]);assert.equal(expected.nextCursor,null);
  assert.deepEqual(projection.profile(expected.identity.id,{limit:100}),expected);
 }
}
export async function verifyRollingPublicReader({node,artifact,scope,deployment,cacheDirectory,ids,scenario='conversation',expectedProfile,expectedProfiles,expectedHTTP,deadlineAt,observation}){
 assert(['conversation','profiles','anonymous-thread','repost-reactions','account-reactions','owned-names'].includes(scenario));
 const names=scenario==='owned-names';
 const social=['anonymous-thread','repost-reactions','account-reactions'].includes(scenario);
 if(names){assert(Array.isArray(expectedProfiles)&&expectedProfiles.length===4);assert.equal(new Set(expectedProfiles.map(p=>p.identity.id)).size,4);}
 if(social)assert(Array.isArray(expectedHTTP)&&expectedHTTP.length>0);
 if(scenario==='profiles')assert(expectedProfile&&expectedProfile.id===ids.nameId);
 assert(Number.isSafeInteger(deadlineAt)&&deadlineAt>Date.now());
 const deadline=Math.min(deadlineAt,Date.now()+30000);
 const storage=()=>publicFeedFileStorage(cacheDirectory,{maxRecordBytes:1048576,maxSnapshotBytes:67108864});
 const make=timeoutMs=>createRollingPublicIndex({node,artifact,scope,deployment,storage:storage(),rangeSize:10,pagesPerSync:20,timeoutMs});
 const routes=names?[...expectedProfiles.map(p=>['profile',{nameId:p.identity.id,limit:100},{...p,names:{},boards:{}}]),['feed',{}, {posts:[],nextCursor:null,names:{},boards:{}}],['directory',{}, {boards:[],nextCursor:null}]]:social?expectedHTTP.map(row=>[row.route,row.parameters,row.expected]):scenario==='profiles'?[['profile',{nameId:ids.nameId}],['feed',{}],['directory',{}]]:[['feed',{}],['thread',{root:ids.rootId}],['profile',{nameId:ids.nameId}],['directory',{}],['post',{id:ids.replyId}]];
 let first;
 observation.passed=false;observation.sessions=[];
 for(const phase of ['fresh','reopened']){
  const remaining=deadline-Date.now()-1500;assert(remaining>0,'No bounded public index budget remains');
  const index=await make(Math.min(20000,remaining));
  if(phase==='reopened'){const stored=await storage().load(index.key,20000);assert(stored.head!==null&&stored.ranges.length>0);observation.persistedRangesBeforeReopen=stored.ranges.length;}
  assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
  const session={phase,closed:false};observation.sessions.push(session);
  const server=await startRollingPublicServer({index,staticHandler:serveRollingReaderAsset,pollMs:30000});let failure;
  try{
   while(index.status().state!=='ready'){
    assert(Date.now()<deadline-1500,'Actual public index readiness deadline');
    assert.notEqual(index.status().state,'unavailable','Actual canonical index failed');await sleep(25);
   }
   const read=createPublicReader({timeoutMs:Math.max(1,deadline-Date.now()),fetch:(url,options)=>fetch(server.url+url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))])})});
   const views={};
   for(const [i,[route,params,expected]]of routes.entries()){assert(Date.now()<deadline);const key=social||names?String(i):route;views[key]=await read(route,params);assert.deepEqual(views[key].scope,scope);
    if(social||names)assertSocialHTTPView(views[key],expected);}
   if(scenario==='profiles'){assert.deepEqual(views.profile.identity,expectedProfile);assert.deepEqual(views.profile.posts,[]);assert.deepEqual(views.feed.posts,[]);assert.deepEqual(views.directory.boards,[]);}
   else if(!social&&!names){
   assert.deepEqual(views.thread.posts.map(p=>p.id),[ids.rootId,ids.replyId]);
   assert.deepEqual(views.profile.posts.map(p=>p.id).sort(),[ids.rootId,ids.replyId].sort());
   assert.equal(views.post.post.id,ids.replyId);assert.equal(views.post.post.likes,'1');assert.equal(views.post.post.bot,null);
   assert.equal(views.post.post.text,'A real application reply');assert.equal(views.post.post.record.parent,ids.rootId);
   assert.equal(views.post.names[ids.nameId].first,'River');assert.equal(views.post.names[ids.nameId].last,'Stone');
   assert.equal(views.post.boards[ids.subboardId].slug,'application-test');
   assert(views.directory.boards.some(board=>board.id===ids.subboardId&&board.slug==='application-test'));
   assert(views.feed.posts.some(post=>post.id===ids.rootId));
   }
   const content=Object.fromEntries(Object.entries(views).map(([key,{revision,checkpoint,...value}])=>[key,value]));
   if(first)assert.deepEqual(content,first);else first=content;
   session.checkpoint=(social||names?views['0']:scenario==='profiles'?views.profile:views.post).checkpoint;session.views=routes.map(([route])=>route);session.authenticatedRanges=index.status().authenticatedRanges;
   assert(session.authenticatedRanges>0);
  }catch(error){failure=error;throw error;}finally{
   try{await server.close();
   await new Promise((resolve,reject)=>{const socket=createConnection({port:Number(new URL(server.url).port),host:'127.0.0.1'});socket.setTimeout(1000,()=>{socket.destroy();reject(Error('Public reader close unconfirmed'));});
    socket.once('connect',()=>{socket.destroy();reject(Error('Public reader still open'));});socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));});
   session.closed=true;
   }catch(cleanupError){session.closed=false;if(failure)throw new AggregateError([failure,cleanupError],'Public reader failed and cleanup unconfirmed');throw cleanupError;}
  }
 }
 observation.passed=true;observation.scope='Actual canonical public index, SQLite reopen, HTTP API and browser transport; no DOM or browser-wallet claim';
}
