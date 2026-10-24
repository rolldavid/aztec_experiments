import test from 'node:test';
import assert from 'node:assert/strict';
import {Tx,MinedTxReceipt,PendingTxReceipt} from '@aztec-labs/stdlib/tx';
import {createL2Journal} from '../shared/l2-journal.mjs';
import {readCanonicalReceipt,waitForSuccessfulReceipt} from '../shared/transaction-outcomes.mjs';
const f=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const e=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function fixture(){
 const records=new Map(),tx=Tx.random({randomProof:true}),next=Tx.random({randomProof:true});
 let owner={},height=12,anchorHash=f(12),status='proposed',execution='success',canonical=true,reads=0,writes=0;
 const scope={account:f(1),chainId:'31337',rollup:e(2),version:'6',board:f(3),portal:e(4)};
 const storage={read:async key=>records.get(key)??null,compareAndSwap:async(key,prior,value)=>{assert.equal(records.get(key)??null,prior);writes++;records.set(key,value);}};
 const receipt=hash=>status==='pending'?new PendingTxReceipt(hash):new MinedTxReceipt(hash,status,execution,0n,f(11),11,1,0,1);
 const node={getTxReceipt:async hash=>{reads++;return receipt(hash);},getBlock:async n=>({hash:canonical?f(n):f(999)}),sendTx:async()=>{throw Error('No automatic send');}};
 const opts={storage,scope,walletSecret:f(5),walletSalt:f(6),Tx,node,confirmationTier:'proposed',predecessorAnchor:async()=>({globalVariables:{blockNumber:height},hash:async()=>anchorHash}),operationScope:()=>owner,waitOptions:{intervalMs:1,timeoutMs:100}};
 return {tx,next,node,receipt,opts,get reads(){return reads},get writes(){return writes},get bytes(){return [...records.values()][0]},setOwner:v=>owner=v,newOwner:()=>owner={},setHeight:n=>{height=n;anchorHash=f(n)},fork:()=>canonical=false,setStatus:v=>status=v,setExecution:v=>execution=v,setAnchorHash:v=>anchorHash=v};
}
async function signed(f,tier='proposed'){
 const j=await createL2Journal(f.opts);j.setOperation('action:one',{confirmationTier:tier});await j.prepare(f.tx,await j.assertCanStart());return j;
}
test('native waiter accepts exact proposed success only with explicit minimum; default still waits checkpoint',async()=>{
 const f=fixture();const early=await waitForSuccessfulReceipt(f.node,f.tx,{confirmationTier:'proposed',intervalMs:1});assert.equal(early.status,'proposed');assert.equal(f.reads,1);
 let calls=0;const node={...f.node,getTxReceipt:async hash=>new MinedTxReceipt(hash,++calls===1?'proposed':'checkpointed','success',0n,'0x'+(11n).toString(16).padStart(64,'0'),11,1,0,1)};
 assert.equal((await waitForSuccessfulReceipt(node,f.tx,{intervalMs:1})).status,'checkpointed');assert.equal(calls,2);
});
test('proposed read still authenticates exact transaction and canonical block and never accepts reverted success',async()=>{
 const f=fixture();assert.equal(await readCanonicalReceipt(f.node,f.tx.getTxHash()),null);
 f.fork();await assert.rejects(readCanonicalReceipt(f.node,f.tx.getTxHash(),{confirmationTier:'proposed'}),{code:'BB_SUBMISSION_UNKNOWN'});
 const g=fixture();g.setExecution('reverted');await assert.rejects(waitForSuccessfulReceipt(g.node,g.tx,{confirmationTier:'proposed'}),{code:'BB_TRANSACTION_FAILED'});
 await assert.rejects(readCanonicalReceipt({...g.node,getTxReceipt:async()=>g.receipt(g.next.getTxHash())},g.tx.getTxHash(),{confirmationTier:'proposed'}),{code:'BB_SUBMISSION_UNKNOWN'});
});
test('exact signed tier permits included predecessor at native descendant anchor, retained only inside current scope',async()=>{
 const f=fixture(),j=await signed(f),found=await j.inspectOutcome();assert.equal(found.receipt.status,'proposed');await j.included(found.receipt);
 await j.assertCanStart();const initial=f.reads;await j.assertCanStart();assert.equal(f.reads,initial);
 f.newOwner();await j.assertCanStart();assert.equal(f.reads,initial+1);
 const previous=await j.assertCanStart();j.setOperation('action:two',{confirmationTier:'proposed'});await j.prepare(f.next,previous);
 assert.equal((await j.inspect()).txHash,String(f.next.getTxHash()));assert.equal(f.writes,2);
});
test('checkpoint-default signed records cannot use proposed even in proposed-capable account session',async()=>{
 const f=fixture(),j=await signed(f,'checkpointed');assert.equal((await j.inspectOutcome()).receipt,null);
 await assert.rejects(j.included(f.receipt(f.tx.getTxHash())),{code:'BB_RECOVERY_REQUIRED'});
 await assert.rejects(j.assertCanStart({predecessor:{operation:'action:one',txHash:String(f.tx.getTxHash())}}),{code:'BB_RECOVERY_REQUIRED'});
});
for(const mode of ['lower-anchor','anchor-fork','receipt-fork','pending','reverted','unowned'])test('proposed predecessor cannot authorize next action: '+mode,async()=>{
 const f=fixture(),j=await signed(f);await j.included(f.receipt(f.tx.getTxHash()));
 if(mode==='lower-anchor')f.setHeight(10);if(mode==='anchor-fork')f.setAnchorHash('0x'+(900n).toString(16).padStart(64,'0'));if(mode==='receipt-fork')f.fork();if(mode==='pending')f.setStatus('pending');if(mode==='reverted')f.setExecution('reverted');if(mode==='unowned')f.setOwner(null);
 await assert.rejects(j.assertCanStart({predecessor:{operation:'action:one',txHash:String(f.tx.getTxHash())}}));assert.equal(f.writes,1);
});
test('new scope and fresh proof boundary reject reorg rather than reuse previous proposed permit',async()=>{
 const f=fixture(),j=await signed(f);await j.included(f.receipt(f.tx.getTxHash()));await j.assertCanStart();f.fork();
 await assert.rejects(j.assertCanStart({fresh:true}),{code:'BB_SUBMISSION_UNKNOWN'});await assert.rejects(j.assertCanStart(),{code:'BB_SUBMISSION_UNKNOWN'});assert.equal(f.writes,1);
});
test('stale included observation cannot acknowledge or write over newer exact signed transaction',async()=>{
 const f=fixture(),j=await signed(f),old=f.receipt(f.tx.getTxHash());await j.included(old);
 const previous=await j.assertCanStart();j.setOperation('action:two',{confirmationTier:'proposed'});await j.prepare(f.next,previous);
 const bytes=f.bytes;await assert.rejects(j.included(old),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.bytes,bytes);assert.equal(f.writes,2);
 await assert.rejects(j.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
});

test('pre-sync receipt permit cannot authorize a predecessor removed by native higher-fork synchronization',async()=>{
 const f=fixture(),j=await signed(f),found=await j.inspectOutcome();await j.included(found.receipt);
 const original=f.node.getBlock;f.node.getBlock=async n=>n===11?{hash:'0x'+'f'.repeat(64)}:original(n);
 // Native selected anchor12 is current; predecessor11 has changed after inspectOutcome.
 await assert.rejects(j.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.writes,1);
});
