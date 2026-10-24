import test from 'node:test';
import assert from 'node:assert/strict';
import {withBokTiming,measureBokStage,measureBokObjectStages,recordBokProofProfile} from '../bok-timing.mjs';
const id=n=>'0x'+String(n).repeat(64);
test('timing records only bounded public identifiers and monotonic durations, retaining original outcomes',async()=>{
 const records=[],secret=Error('PRIVATE_PROMPT_OR_CREDENTIAL');
 await withBokTiming(id(1),async()=>{
  assert.equal(await measureBokStage('agent.model',async()=>42),42);
  await assert.rejects(measureBokStage('provider.completion',async()=>{throw secret;}),error=>error===secret);
  await measureBokStage('PRIVATE_PROMPT_OR_CREDENTIAL',async()=>true);
 },{emit:record=>records.push(record)});
 assert.equal(records.length,4);assert(!JSON.stringify(records).includes('PRIVATE_'));
 for(const row of records){assert.deepEqual(Object.keys(row).sort(),['durationMs','requestId','result','span','stage']);assert.equal(row.requestId,id(1));assert(Number.isFinite(row.durationMs)&&row.durationMs>=0);}
 assert.deepEqual(records.map(row=>row.result),['started','success','started','error']);
 assert.equal(records[0].span,records[1].span);assert.equal(records[2].span,records[3].span);
});
test('parallel timing contexts stay isolated and nested same-request context preserves span identity',async()=>{
 const a=[],b=[];
 await Promise.all([withBokTiming(id(1),()=>measureBokStage('agent.model',()=>withBokTiming(id(1),()=>measureBokStage('provider.completion',async()=>true))),{emit:r=>a.push(r)}),withBokTiming(id(2),()=>measureBokStage('agent.model',async()=>true),{emit:r=>b.push(r)})]);
 assert.equal(a.length,4);assert.equal(b.length,2);assert(a.every(r=>r.requestId===id(1)));assert(b.every(r=>r.requestId===id(2)));
 assert.equal(a[0].span,1);assert.equal(a[1].span,2);
});
test('logging failure and record bound cannot fail or retry business operations',async()=>{
 let calls=0;await withBokTiming(id(1),()=>measureBokStage('agent.model',async()=>++calls),{emit:()=>{throw Error('logging failure');}});assert.equal(calls,1);
 const records=[];await withBokTiming(id(1),async()=>{for(let i=0;i<1030;i++)await measureBokStage('agent.model',async()=>++calls);},{emit:r=>records.push(r)});
 assert.equal(records.length,2048);assert.equal(calls,1031);
});
test('long multi-call runs retain final proof and checkpoint timing after 128 earlier spans',async()=>{
 const records=[];
 await withBokTiming(id(1),async()=>{
  for(let call=0;call<64;call++)for(let stage=0;stage<10;stage++)await measureBokStage('agent.model',async()=>true);
  await measureBokStage('escrow.prove',async()=>true);await measureBokStage('escrow.wait',async()=>true);
 },{emit:r=>records.push(r)});
 assert.deepEqual(records.slice(-4).map(r=>[r.stage,r.result]),[['escrow.prove','started'],['escrow.prove','success'],['escrow.wait','started'],['escrow.wait','success']]);
 assert.equal(records.at(-1).span,642);
});
test('fixed port wrapper retains receiver and metadata without exposing unknown names',async()=>{
 const records=[],port=Object.freeze({identity:'public',reserve(){return this.identity;},privateName(){return true;}});
 const wrapped=measureBokObjectStages(port,'escrow');await withBokTiming(id(1),async()=>{assert.equal(await wrapped.reserve('SECRET_ARGUMENT'),'public');assert(await wrapped.privateName());},{emit:r=>records.push(r)});
 assert.equal(records.length,2);assert.equal(records[0].stage,'escrow.reserve');assert(!JSON.stringify(records).includes('SECRET_ARGUMENT'));
});
test('whole-request and adapter-open stages retain enclosing and child durations',async()=>{
 const records=[];
 await withBokTiming(id(1),()=>measureBokStage('request.total',()=>measureBokStage('escrow.open',async()=>true)),{emit:r=>records.push(r)});
 assert.deepEqual(records.map(r=>[r.stage,r.result]),[['request.total','started'],['escrow.open','started'],['escrow.open','success'],['request.total','success']]);
 assert(records.at(-1).durationMs>=records[2].durationMs);
});

test('native proof profile emits fixed numeric aggregates without function or oracle data',async()=>{
 const records=[];
 await withBokTiming(id(1),async()=>recordBokProofProfile({timings:{total:10.12345,sync:1,proving:6,validation:1,unaccounted:0.5,secret:'SECRET',perFunction:[{time:1,functionName:'SECRET',oracles:{SECRET:99}},{time:0.5}]},nodeRPCCalls:{SECRET:'SECRET'}}),{emit:r=>records.push(r)});
 assert.deepEqual(records,[{requestId:id(1),event:'escrow.proof_profile',totalMs:10.123,syncMs:1,provingMs:6,validationMs:1,unaccountedMs:0.5,witnessMs:1.5,functionCount:2}]);
});
test('native proof profile ignores malformed values and cannot interrupt transaction processing',async()=>{
 const records=[];
 recordBokProofProfile({timings:{total:1}});
 await withBokTiming(id(1),async()=>{
  recordBokProofProfile({timings:{total:Infinity,sync:NaN,proving:-1,validation:'SECRET',perFunction:[{time:'SECRET'}]}});
  recordBokProofProfile({get timings(){throw Error('SECRET');}});
  for(let i=0;i<20;i++)recordBokProofProfile({timings:{total:1}});
 },{emit:r=>records.push(r)});
 assert.equal(records.length,16);assert(records.every(r=>r.totalMs===1));assert(!JSON.stringify(records).includes('SECRET'));
 await withBokTiming(id(1),async()=>recordBokProofProfile({timings:{total:1}}),{emit:()=>{throw Error('logging failure');}});
 await withBokTiming(id(1),async()=>recordBokProofProfile({timings:{total:1}}),{emit:async()=>{throw Error('async logging failure');}});
});

test('operation diagnostic retains only fixed classifications and never raw error content',async()=>{
 const {recordBokOperationFailure}=await import('../bok-timing.mjs');const records=[];
 const error=Object.assign(Error('PRIVATE_MESSAGE'),{code:'ERR_ASSERTION',name:'AssertionError',stack:'Error: PRIVATE_MESSAGE\n    at BlockSynchronizer.checkedSelectedAnchor (/PRIVATE_PATH:1:2)\n    at async OperationQueue.runSynced (/PRIVATE_PATH:1:2)\n    at PRIVATE_METHOD (/PRIVATE_PATH:1:2)'});
 await withBokTiming(id(1),async()=>{recordBokOperationFailure(error,{phase:'prove',method:'finalize_reply'});recordBokOperationFailure(Object.assign(Error('PRIVATE_MESSAGE'),{code:'PRIVATE_CODE',name:'PRIVATE_NAME'}),{phase:'prove',method:'finalize_reply'});recordBokOperationFailure(error,{phase:'PRIVATE_PHASE',method:'finalize_reply'});},{emit:r=>records.push(r)});
 assert.equal(records.length,2);assert.deepEqual(records[0],{requestId:id(1),event:'escrow.operation_failure',phase:'prove',method:'finalize_reply',errorCode:'ERR_ASSERTION',errorName:'AssertionError',frames:['checkedSelectedAnchor','runSynced']});assert.equal(records[1].errorCode,'unclassified');assert.equal(records[1].errorName,'unclassified');assert(!JSON.stringify(records).includes('PRIVATE'));
});
test('operation diagnostics are bounded and isolate malformed errors and rejecting loggers',async()=>{
 const {recordBokOperationFailure}=await import('../bok-timing.mjs');const records=[];
 await withBokTiming(id(1),async()=>{for(let i=0;i<20;i++)recordBokOperationFailure(Error('private'),{phase:'prove',method:'finalize_reply'});},{emit:r=>records.push(r)});assert.equal(records.length,16);
 for(const emit of [()=>{throw Error('private');},async()=>{throw Error('private');}])await withBokTiming(id(1),async()=>{recordBokOperationFailure(null,{phase:'prove',method:'finalize_reply'});recordBokOperationFailure(new Proxy({},{getOwnPropertyDescriptor(){throw Error('private');}}),{phase:'prove',method:'finalize_reply'});recordBokOperationFailure(Error('private'),{phase:'prove',method:'finalize_reply'});},{emit});
});
