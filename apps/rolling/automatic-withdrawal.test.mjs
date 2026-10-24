import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAutomaticWithdrawal} from './automatic-withdrawal.mjs';

function fixture(states){
 const calls=[],progress=[];let index=0,prepared;
 const application={
  readWithdrawalReadiness:async deposit=>{assert.equal(deposit,'9');return states[Math.min(index++,states.length-1)];},
  prepare:async(action,options)=>{assert.deepEqual(options,{immediate:true});prepared={intentId:String(calls.length),action};calls.push(action.type);return prepared;},
  submitPrepared:async id=>{assert.equal(id,prepared.intentId);return {...prepared,status:'confirmed'};}
 };
 return {application,calls,progress,options:{application,deposit:'9',guard:async()=>{},waitUntil:async()=>assert.fail('Unexpected wait'),onProgress:v=>progress.push(v)}};
}
const state=(screenedSequence,needsScreening,readyAt='100')=>({screenedSequence:String(screenedSequence),needsScreening,readyAt,anchor:{timestamp:'100'}});
test('one withdrawal request automatically clears multiple batches then withdraws',async()=>{
 const f=fixture([state(0,true),state(2,true),state(4,true),state(5,false)]);
 const result=await executeAutomaticWithdrawal(f.options);
 assert.equal(result.action.type,'withdraw');assert.equal(result.status,'confirmed');
 assert.deepEqual(f.calls,['screen','screen','screen','withdraw']);
 assert.deepEqual(f.progress.map(v=>v.stage),['preparing','preparing','preparing','withdrawing']);
});
test('an already eligible deposit withdraws without any screening transaction',async()=>{
 const f=fixture([state(5,false)]);await executeAutomaticWithdrawal(f.options);assert.deepEqual(f.calls,['withdraw']);
});
test('immature history waits for observed eligibility before sending anything',async()=>{
 const f=fixture([state(0,true,'200'),state(0,true),state(1,false)]);
 let release;f.options.waitUntil=async timestamp=>{assert.equal(timestamp,'200');assert.equal(f.calls.length,0);await new Promise(resolve=>release=resolve);};
 const running=executeAutomaticWithdrawal(f.options);
 while(!release)await Promise.resolve();assert.equal(f.calls.length,0);
 release();await running;assert.deepEqual(f.calls,['screen','withdraw']);
});
test('new cooldown after a screening batch waits before final withdrawal',async()=>{
 const f=fixture([state(0,true),state(2,false,'300'),state(2,false)]);
 f.options.waitUntil=async timestamp=>{assert.equal(timestamp,'300');assert.deepEqual(f.calls,['screen']);};
 await executeAutomaticWithdrawal(f.options);assert.deepEqual(f.calls,['screen','withdraw']);
});
for(const status of ['unknown','reverted'])test(`${status} screening stops without a resend or withdrawal`,async()=>{
 const f=fixture([state(0,true)]);f.application.submitPrepared=async()=>({status});
 assert.equal((await executeAutomaticWithdrawal(f.options)).status,status);assert.deepEqual(f.calls,['screen']);
});
test('a confirmed transaction that did not advance the cursor never loops or spends again',async()=>{
 const f=fixture([state(0,true)]);
 await assert.rejects(executeAutomaticWithdrawal(f.options),{code:'ROLLING_WITHDRAWAL_NO_PROGRESS'});assert.deepEqual(f.calls,['screen']);
});
test('account change while waiting prevents all sends',async()=>{
 const f=fixture([state(0,true,'200'),state(0,true)]);let changed=false;
 f.options.waitUntil=async()=>{changed=true;};f.options.guard=async()=>{if(changed)throw Error('Account changed');};
 await assert.rejects(executeAutomaticWithdrawal(f.options),/Account changed/);assert.equal(f.calls.length,0);
});
test('submission failure is propagated without automatically retrying',async()=>{
 const f=fixture([state(0,true)]);const failure=Error('Connection lost after send');f.application.submitPrepared=async()=>{throw failure;};
 await assert.rejects(executeAutomaticWithdrawal(f.options),e=>e===failure);assert.deepEqual(f.calls,['screen']);
});

test('included screening advances consecutive private batches but final exit keeps confirmed boundary',async()=>{
 const f=fixture([state(0,true),state(2,true),state(4,false)]),submit=f.application.submitPrepared;
 f.application.submitPrepared=async id=>{const result=await submit(id);return {...result,status:result.action.type==='screen'?'included':'confirmed'};};
 const result=await executeAutomaticWithdrawal(f.options);assert.equal(result.status,'confirmed');assert.deepEqual(f.calls,['screen','screen','withdraw']);
});
test('included screening still waits for changed time lock before withdrawal',async()=>{
 const f=fixture([state(0,true),state(1,false,'300'),state(1,false)]),submit=f.application.submitPrepared;let waited=false;
 f.application.submitPrepared=async id=>{const result=await submit(id);return {...result,status:result.action.type==='screen'?'included':'confirmed'};};
 f.options.waitUntil=async timestamp=>{assert.equal(timestamp,'300');assert.deepEqual(f.calls,['screen']);waited=true;};
 await executeAutomaticWithdrawal(f.options);assert(waited);assert.deepEqual(f.calls,['screen','withdraw']);
});
test('included screen with unchanged or rolled-back note cursor cannot spend again',async()=>{
 const f=fixture([state(2,true),state(1,true)]);f.application.submitPrepared=async()=>({status:'included'});
 await assert.rejects(executeAutomaticWithdrawal(f.options),{code:'ROLLING_WITHDRAWAL_NO_PROGRESS'});assert.deepEqual(f.calls,['screen']);
});
