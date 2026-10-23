import test from 'node:test';
import assert from 'node:assert/strict';
import {withBokTiming,measureBokStage,measureBokObjectStages} from '../bok-timing.mjs';
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
 const records=[];await withBokTiming(id(1),async()=>{for(let i=0;i<140;i++)await measureBokStage('agent.model',async()=>++calls);},{emit:r=>records.push(r)});
 assert.equal(records.length,256);assert.equal(calls,141);
});
test('fixed port wrapper retains receiver and metadata without exposing unknown names',async()=>{
 const records=[],port=Object.freeze({identity:'public',reserve(){return this.identity;},privateName(){return true;}});
 const wrapped=measureBokObjectStages(port,'escrow');await withBokTiming(id(1),async()=>{assert.equal(await wrapped.reserve('SECRET_ARGUMENT'),'public');assert(await wrapped.privateName());},{emit:r=>records.push(r)});
 assert.equal(records.length,2);assert.equal(records[0].stage,'escrow.reserve');assert(!JSON.stringify(records).includes('SECRET_ARGUMENT'));
});
