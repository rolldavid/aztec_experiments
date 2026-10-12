// Filesystem/budget controls only. No proof, chain or browser acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {notificationBrowserBudget,readNotificationSubscriptionSignal,settleNotificationEvidence,observeNotificationTransaction} from './rolling-notification-fixture.mjs';
import {getScenario} from './scenarios.mjs';
test('browser campaign retains 540s/4GiB parent and reserves 30s beyond 150s browser',()=>{
 const s=getScenario('rolling-notification-browser');assert.equal(s.deadlineMs,540000);assert.equal(s.fixtureHeapMiB,768);assert.equal(s.browser,'rolling-notifications');assert.equal(s.browserEngine,'chromium');assert.equal(s.applicationThreads,1);assert.equal(s.evidenceTask,'G07');
 assert.equal(notificationBrowserBudget(180001,1),150000);assert.throws(()=>notificationBrowserBudget(180000,1));
 for(const x of [NaN,Infinity,'180001',180001.1])assert.throws(()=>notificationBrowserBudget(x,1));
});
async function fixture(t){const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'notification-phase-')));await fs.chmod(directory,0o700);t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,file:path.join(directory,'browser-subscription-confirmed.json')};}
test('only exact private subscription phase file is accepted; absent file waits',async t=>{
 const {directory,file}=await fixture(t);assert.equal(await readNotificationSubscriptionSignal(directory),false);
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,phase:'subscription-confirmed'}),{mode:0o600});assert.equal(await readNotificationSubscriptionSignal(directory),true);
});
for(const [name,text]of [['command',JSON.stringify({schemaVersion:1,phase:'subscription-confirmed',command:'send'})],['wrong phase',JSON.stringify({schemaVersion:1,phase:'marker-confirmed'})],['large','x'.repeat(257)],['empty',''],['malformed','{']])test('rejects '+name+' signal',async t=>{
 const {directory,file}=await fixture(t);await fs.writeFile(file,text,{mode:0o600});await assert.rejects(readNotificationSubscriptionSignal(directory));
});
test('rejects symlink phase and nonprivate file/directory',async t=>{
 const {directory,file}=await fixture(t),other=path.join(directory,'other');await fs.writeFile(other,'{}',{mode:0o600});await fs.symlink(other,file);await assert.rejects(readNotificationSubscriptionSignal(directory));
 await fs.unlink(file);await fs.writeFile(file,JSON.stringify({schemaVersion:1,phase:'subscription-confirmed'}),{mode:0o644});await assert.rejects(readNotificationSubscriptionSignal(directory));
 await fs.chmod(file,0o600);await fs.chmod(directory,0o755);await assert.rejects(readNotificationSubscriptionSignal(directory));
});
// These failures execute the actual campaign collection functions with labelled
// node/accounting doubles. They cannot establish real canonicality or fees.
test('failed subscription evidence and A balance still collect marker and B balance before throwing',async()=>{
 const first=Error('subscription failure'),second=Error('A balance failure'),calls=[],observation={passed:true};let persisted;
 await assert.rejects(settleNotificationEvidence({observation,persist:async()=>{persisted=structuredClone(observation);},
  transactions:[{label:'subscription',run:async()=>{calls.push('subscription');throw first;}},{label:'marker',run:async()=>calls.push('marker')}],
  balances:[{label:'a',run:async()=>{calls.push('a');throw second;}},{label:'b',run:async()=>calls.push('b')}]}),e=>e instanceof AggregateError&&e.errors.length===2&&e.errors[0]===first&&e.errors[1]===second);
 assert.deepEqual(calls,['subscription','marker','a','b']);assert.deepEqual(persisted.outcomes,{transactions:[{label:'subscription',passed:false},{label:'marker',passed:true}],balances:[{label:'a',passed:false},{label:'b',passed:true}]});assert.equal(persisted.accountingVerified,false);assert.equal(persisted.passed,false);
});
test('independent successful balance checks retain accounting despite failed semantic transaction evidence',async()=>{
 const observation={};await assert.rejects(settleNotificationEvidence({observation,persist:async()=>{},transactions:[{label:'marker',run:async()=>{throw Error();}}],balances:[{label:'a',run:async()=>{}},{label:'b',run:async()=>{}}]}));
 assert.equal(observation.accountingVerified,true);assert.equal(observation.passed,false);
});
function receiptFixture(){
 const hash='0x'+'1'.repeat(64),blockHash='0x'+'2'.repeat(64),calls=[],saved=[],observation={};
 const receipt={txHash:hash,status:'checkpointed',executionResult:'success',transactionFee:9n,blockNumber:12,blockHash};
 const effect={txHash:hash,transactionFee:9n,toBuffer:()=>Buffer.from('actual-labelled-effect')};
 const node={getTxReceipt:async()=>receipt,getTxEffect:async()=>({data:effect,l2BlockHash:blockHash,l2BlockNumber:12}),getBlock:async()=>({hash:blockHash,body:{txEffects:[effect]}}),getBlockData:async()=>({blockHash})};
 return {calls,saved,receipt,observation,node,input:{tx:{getTxHash:()=>hash},node,TxHash:{fromString:value=>value},observation,persist:async()=>saved.push(structuredClone(observation)),accountFee:(hash,fee)=>calls.push(['fee',String(fee)]),writeEffect:async bytes=>{calls.push(['effect',bytes.toString()]);observation.effectSaved=true;},decode:async()=>{calls.push(['decode']);return [];}}};
}
test('paid reverted transaction persists fee and canonical effect before rejecting without decoder',async()=>{
 const f=receiptFixture();f.receipt.executionResult='app_logic_reverted';await assert.rejects(observeNotificationTransaction(f.input));
 assert.deepEqual(f.calls,[['fee','9'],['effect','actual-labelled-effect']]);assert.equal(f.saved.at(-1).transactionFee,'9');assert.equal(f.saved.at(-1).executionResult,'app_logic_reverted');assert.equal(f.saved.at(-1).canonical,true);assert.equal(f.saved.at(-1).effectSaved,true);
});
test('unavailable effect retains already-paid receipt and charge before rejection',async()=>{
 const f=receiptFixture();f.node.getTxEffect=async()=>undefined;await assert.rejects(observeNotificationTransaction(f.input));assert.equal(f.saved.at(-1).transactionFee,'9');assert.deepEqual(f.calls,[['fee','9']]);
});
test('pending outcome retained without claiming a fee, effect or canonical inclusion',async()=>{
 const f=receiptFixture();f.receipt.status='pending';await assert.rejects(observeNotificationTransaction(f.input));assert.equal(f.saved.at(-1).status,'pending');assert.deepEqual(f.calls,[]);assert.equal(f.observation.canonical,undefined);
});
test('changed canonical block retains paid effect but refuses canonical and semantic acceptance',async()=>{
 const f=receiptFixture();f.node.getBlockData=async()=>({blockHash:'0x'+'3'.repeat(64)});await assert.rejects(observeNotificationTransaction(f.input));assert.equal(f.observation.transactionFee,'9');assert.equal(f.observation.effectSaved,true);assert.equal(f.observation.canonical,undefined);assert.equal(f.calls.some(c=>c[0]==='decode'),false);
});
test('successful receipt returns ordered authenticated inputs only after full effect equality and decoder',async()=>{
 const f=receiptFixture(),result=await observeNotificationTransaction(f.input);assert.equal(result.record.transactionFee,'9');assert.equal(result.record.txIndexWithinBlock,'0');assert.equal(result.record.canonical,true);assert.deepEqual(result.record.events,[]);assert.equal(f.calls.at(-1)[0],'decode');
});
