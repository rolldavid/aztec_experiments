// Actual canonical-node acceptance, called only after the five genuine actions.
// No synthetic events or in-memory index substitute are accepted here.
import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import {createRollingPublicIndex} from '../../shared/rolling/public-index.mjs';
import {publicFeedFileStorage} from '../../shared/public-feed-file-storage.mjs';
import {startRollingReader} from '../../apps/rolling/start.mjs';
import {createPublicReader} from '../../apps/rolling/reader-client.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifyRollingPublicReader({node,artifact,scope,deployment,cacheDirectory,ids,deadlineAt,observation}){
 assert(Number.isSafeInteger(deadlineAt)&&deadlineAt>Date.now());
 const deadline=Math.min(deadlineAt,Date.now()+30000);
 const storage=()=>publicFeedFileStorage(cacheDirectory,{maxRecordBytes:1048576,maxSnapshotBytes:67108864});
 const make=()=>createRollingPublicIndex({node,artifact,scope,deployment,storage:storage(),rangeSize:10,pagesPerSync:20});
 const routes=[['feed',{}],['thread',{root:ids.rootId}],['profile',{nameId:ids.nameId}],['directory',{}],['post',{id:ids.replyId}]];
 let first;
 observation.passed=false;observation.sessions=[];
 for(const phase of ['fresh','reopened']){
  const index=await make();assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
  const session={phase,closed:false};observation.sessions.push(session);
  const server=await startRollingReader({index});
  try{
   while(index.status().state!=='ready'){
    assert(Date.now()<deadline,'Actual public index readiness deadline');
    assert.notEqual(index.status().state,'unavailable','Actual canonical index failed');await sleep(25);
   }
   const read=createPublicReader({timeoutMs:Math.max(1,deadline-Date.now()),fetch:(url,options)=>fetch(server.url+url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))])})});
   const views={};
   for(const [route,params]of routes){assert(Date.now()<deadline);views[route]=await read(route,params);assert.deepEqual(views[route].scope,scope);}
   assert.deepEqual(views.thread.posts.map(p=>p.id),[ids.rootId,ids.replyId]);
   assert.deepEqual(views.profile.posts.map(p=>p.id).sort(),[ids.rootId,ids.replyId].sort());
   assert.equal(views.post.post.id,ids.replyId);assert.equal(views.post.post.likes,'1');assert.equal(views.post.post.bot,null);
   assert.equal(views.post.post.text,'A real application reply');assert.equal(views.post.post.record.parent,ids.rootId);
   assert.equal(views.post.names[ids.nameId].first,'River');assert.equal(views.post.names[ids.nameId].last,'Stone');
   assert.equal(views.post.boards[ids.subboardId].slug,'application-test');
   assert(views.directory.boards.some(board=>board.id===ids.subboardId&&board.slug==='application-test'));
   assert(views.feed.posts.some(post=>post.id===ids.rootId));
   const content=Object.fromEntries(Object.entries(views).map(([key,{revision,checkpoint,...value}])=>[key,value]));
   if(first)assert.deepEqual(content,first);else first=content;
   session.checkpoint=views.post.checkpoint;session.views=routes.map(([route])=>route);session.authenticatedRanges=index.status().authenticatedRanges;
   assert(session.authenticatedRanges>0);
  }finally{
   await server.close();
   await new Promise((resolve,reject)=>{const socket=createConnection(new URL(server.url).port,'127.0.0.1');socket.setTimeout(1000,()=>{socket.destroy();reject(Error('Public reader close unconfirmed'));});
    socket.once('connect',()=>{socket.destroy();reject(Error('Public reader still open'));});socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));});
   session.closed=true;
  }
 }
 observation.passed=true;observation.scope='Actual canonical public index, SQLite reopen, HTTP API and browser transport; no DOM or browser-wallet claim';
}
