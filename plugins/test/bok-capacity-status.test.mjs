import test from 'node:test';import assert from 'node:assert/strict';
import {hostedRequestFailure,startEscrowService} from '../escrow-service.mjs';
test('repository capacity diagnostic is fixed and other failures remain opaque',()=>{
 const error=hostedRequestFailure(Object.assign(Error('SYNTHETIC_PRIVATE_REQUEST'),{code:'GITHUB_BROKER_POOL_EXHAUSTED'}));assert.equal(error.code,'GITHUB_BROKER_POOL_EXHAUSTED');assert.equal(error.message,'Bok is waiting for repository capacity');
 for(const input of [null,Error('SYNTHETIC_PRIVATE_REQUEST'),{code:'SYNTHETIC_PRIVATE_REQUEST'},Object.defineProperty({},'code',{get(){throw Error('no getter');}})]){const result=hostedRequestFailure(input);assert.equal(result.code,undefined);assert.equal(result.message,'Rolling hosted request requires reconciliation');}
});
test('HTTP health exposes only fixed capacity code after pre-agent admission failure',async()=>{
 let resolve;const failed=new Promise(r=>resolve=r),request={requestId:'0x'+'1'.repeat(64),threadId:'0x'+'2'.repeat(64),postId:'3',order:'1'};let runs=0;
 const server=await startEscrowService({descriptor:{},profile:'rolling',port:0,pollMs:60000,board:{pending:async()=>({requests:[request],nextCursor:null}),readRequest:async()=>({predecessorsClear:true})},run:async()=>{runs++;throw Object.assign(Error('SYNTHETIC_PRIVATE_REQUEST'),{code:'GITHUB_BROKER_POOL_EXHAUSTED'});},onError:resolve});
 try{await failed;const response=await(await fetch('http://127.0.0.1:'+server.address.port+'/health')).json();assert.equal(response.status,'degraded');assert.equal(response.active,0);assert.equal(response.lastFailure.code,'GITHUB_BROKER_POOL_EXHAUSTED');assert.equal(runs,1);assert(!JSON.stringify(response).includes('SYNTHETIC_PRIVATE_REQUEST'));assert(!JSON.stringify(response).includes(request.requestId));}finally{await server.close();}
});
