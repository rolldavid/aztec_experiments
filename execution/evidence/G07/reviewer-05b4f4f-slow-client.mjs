import http from 'node:http';
import assert from 'node:assert/strict';
import {startRollingReader} from '../../../../rolling-controls/apps/rolling/start.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let reads=0; const sockets=[];
const server=await startRollingReader({index:{sync:async()=>{},status:()=>({state:'ready'}),query:()=>({posts:[]})},wallet:{connectOrigins:[],read:async()=>{reads++;return {body:Buffer.alloc(16*1024*1024,65),type:'application/javascript'};}}});
try{
 const first=http.get(server.url+'/wallet/aztec_bundle.js',r=>r.pause());sockets.push(first);
 while(reads!==1)await wait(5);
 await wait(50);
 let secondDone=false;const second=http.get(server.url+'/wallet/runtime.mjs',r=>{r.resume();r.on('end',()=>secondDone=true);});sockets.push(second);second.on('error',()=>{});first.on('error',()=>{});
 await wait(300);
 assert.equal(reads,1);assert.equal(secondDone,false);
 first.destroy();
 for(let i=0;i<100&&!secondDone;i++)await wait(5);
 assert.equal(reads,2);assert.equal(secondDone,true);
 console.log(JSON.stringify({source:'05b4f4fa8b3974cf76c61b3bead95e980b62bac5',pausedClientBlocksSecond:true,secondStartsOnlyAfterFirstDestroyed:true,boundedObservationMs:300,actualProductionHandler:true,syntheticAssetBytes:16*1024*1024}));
}finally{for(const s of sockets)s.destroy();await server.close();}
