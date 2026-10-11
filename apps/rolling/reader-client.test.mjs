import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicReader} from './reader-client.mjs';
const body={schemaVersion:1,scope:{boardAddress:'public'},complete:true,posts:[]};
test('public HTTP reader sends no account credentials and encodes untrusted query values',async()=>{
 let called;const read=createPublicReader({fetch:async(url,options)=>{called={url,options};return Response.json(body);}});
 assert.deepEqual(await read('directory',{query:'a&cursor=private'}),body);
 assert.equal(called.url,'/api/directory?query=a%26cursor%3Dprivate');assert.equal(called.options.credentials,'omit');assert.equal(called.options.redirect,'error');
 await assert.rejects(read('wallet'));await assert.rejects(read('feed',{account:'private'}));
});
test('reader rejects unready, oversized, nonJSON and malformed responses',async()=>{
 for(const response of [Response.json(body,{status:503}),Response.json({...body,complete:false}),new Response('<html>'),Response.json({...body,schemaVersion:2}),new Response('{',{headers:{'content-type':'application/json'}}),Response.json({...body,text:'a'.repeat(200)})]){
  const read=createPublicReader({fetch:async()=>response,maxBytes:150});await assert.rejects(read('feed'));
 }
});
test('streaming size gate cancels before reading an unbounded response',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(151));},cancel(){cancelled=true;}});
 const read=createPublicReader({fetch:async()=>new Response(stream,{headers:{'content-type':'application/json'}}),maxBytes:150});
 await assert.rejects(read('feed'));assert(cancelled);
});
