import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {Tx,TxHash,PendingTxReceipt,DroppedTxReceipt,MinedTxReceipt} from '@aztec-labs/stdlib/tx';
import {IDBFactory} from 'fake-indexeddb';
import {createL2Journal,l2JournalScopeText} from '../shared/l2-journal.mjs';
import {createBrowserJournalStorage} from '../shared/journal-indexeddb.mjs';
import {createFileJournalStorage} from '../apps/src/billboard/user/transaction-journal-store.mjs';
const field=()=> '0x'+randomBytes(31).toString('hex').padStart(64,'0');
const address=()=> '0x'+randomBytes(20).toString('hex');
function fixture(storage) {
 const tx=Tx.random({randomProof:true});let status='dropped',executionResult='success',canonical=true;const sent=[];
 const scope={account:field(),chainId:'31337',rollup:address(),version:'5',board:field(),portal:address()};
 const node={sendTx:async value=>{sent.push(Buffer.from(value.toBuffer()));status='checkpointed';},getTxReceipt:async()=>status==='dropped'?new DroppedTxReceipt(tx.getTxHash()):status==='pending'?new PendingTxReceipt(tx.getTxHash()):new MinedTxReceipt(tx.getTxHash(),status,executionResult,0n,'canonical',3,1,0,1),isValidTx:async()=>({result:'valid'}),getBlock:async()=>({hash:canonical?'canonical':'reorg'})};
 const opts={storage,walletSecret:field(),walletSalt:field(),scope,Tx,node,waitOptions:{timeoutMs:30,intervalMs:1}};
 return{tx,opts,sent,node,newSession:extra=>createL2Journal({...opts,...extra}),setStatus:value=>status=value,setExecution:value=>executionResult=value,reorg:()=>canonical=false};
}
for(const backend of ['file','indexeddb']) {
 async function withStorage(fn) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-journal-test-'));
  try {const idb=new IDBFactory(),storage=backend==='file'?createFileJournalStorage(temp):createBrowserJournalStorage(idb);await fn(fixture(storage),{temp,idb,storage});}finally{fs.rmSync(temp,{recursive:true,force:true});}
 }
 test(`${backend}: G07 strict replacement inspection leaves exact authenticated ciphertext and acknowledgement untouched`,()=>withStorage(async (f,{storage})=>{
  const j=await f.newSession();j.setOperation('ROLLING_WORKFLOW_V1:fixture');await j.prepare(f.tx,await j.assertCanStart());
  f.node.isValidTx=async()=>({result:'invalid',reason:['Block header not found']});
  const key=createHash('sha256').update(l2JournalScopeText(f.opts.scope)).digest('hex'),before=await storage.read(key);let writes=0;
  storage.compareAndSwap=async()=>{writes++;throw Error('Read-only inspection must not write');};
  const reopened=await f.newSession(),result=await reopened.inspectReplacement('ROLLING_WORKFLOW_V1:fixture',{requireMissingAnchor:true});
  assert.equal(result.status,'available');assert.equal(result.attempts[0].txHash,String(f.tx.getTxHash()));assert.equal(await storage.read(key),before);
  await assert.rejects(reopened.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(writes,0);assert.equal(reopened.lastTxHash,null);assert.equal(f.sent.length,0);
 }));
 test(`${backend}: same-operation metadata inspection reuses exact bytes without retaining mutable Tx`,()=>withStorage(async (f,{storage})=>{
  let reads=0,decodes=0,owner={};const originalRead=storage.read.bind(storage);
  storage.read=async(...args)=>{reads++;return originalRead(...args);};
  const j=await f.newSession({operationScope:()=>owner,Tx:{fromBuffer:(...args)=>{decodes++;return Tx.fromBuffer(...args);}}});
  j.setOperation('ordinary-post');await j.prepare(f.tx,await j.assertCanStart());reads=decodes=0;
  const first=await j.inspect();assert.deepEqual({reads,decodes},{reads:1,decodes:1});
  first.txHash=field();first.predecessorTxHashes.push(field());
  const second=await j.inspect();assert.equal(second.txHash,String(f.tx.getTxHash()));assert.deepEqual(second.predecessorTxHashes,[]);
  assert.deepEqual({reads,decodes},{reads:2,decodes:1},'fresh storage read, no second native transaction decode');
  owner={};await j.inspect();assert.deepEqual({reads,decodes},{reads:3,decodes:2},'new operation cannot reuse prior inspection');
  owner=null;await j.inspect();await j.inspect();assert.equal(decodes,4,'unowned callers do not reuse metadata');assert.equal(f.sent.length,0);
 }));
 test(`${backend}: metadata inspection rejects changed ciphertext and can observe a newly authenticated record`,()=>withStorage(async (f,{storage})=>{
  const owner={},j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());await j.inspect();
  const key=createHash('sha256').update(l2JournalScopeText(f.opts.scope)).digest('hex'),prior=await storage.read(key);
  await storage.compareAndSwap(key,prior,'invalid');await assert.rejects(j.inspect(),{code:'BB_JOURNAL_INVALID'});
  await storage.compareAndSwap(key,'invalid',prior);const restored=await j.inspect();assert.equal(restored.txHash,String(f.tx.getTxHash()));
  f.setStatus('checkpointed');const replacement=Tx.random({randomProof:true}),other=await f.newSession({acknowledgeTx:String(f.tx.getTxHash())});
  await other.prepare(replacement,await other.assertCanStart());assert.equal((await j.inspect()).txHash,String(replacement.getTxHash()));assert.equal(f.sent.length,0);
 }));
 test(`${backend}: metadata reuse checks operation and account again after its storage read`,()=>withStorage(async (f,{storage})=>{
  let owner={},valid=true,change=false;const originalRead=storage.read.bind(storage);
  const j=await f.newSession({operationScope:()=>owner,contextGuard:()=>{if(!valid)throw Error('account changed');}});
  await j.prepare(f.tx,await j.assertCanStart());await j.inspect();
  storage.read=async(...args)=>{const value=await originalRead(...args);if(change)owner={};return value;};
  change=true;await assert.rejects(j.inspect(),{code:'BB_RECOVERY_REQUIRED'});change=false;await j.inspect();
  valid=false;await assert.rejects(j.inspect(),/account changed/);valid=true;assert.equal((await j.inspect()).txHash,String(f.tx.getTxHash()));assert.equal(f.sent.length,0);
 }));
 test(`${backend}: outcome authenticates and decodes once while both freshness reads remain live`,()=>withStorage(async (f,{storage})=>{
  let reads=0,decodes=0,decrypts=0;const read=storage.read.bind(storage),subtle=globalThis.crypto.subtle;
  storage.read=async(...args)=>{reads++;return read(...args);};
  const crypto={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto),subtle:new Proxy(subtle,{get(target,key){
    if(key==='decrypt')return (...args)=>{decrypts++;return target.decrypt(...args);};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }})};
  const countedTx={fromBuffer:(...args)=>{decodes++;return Tx.fromBuffer(...args);}};
  const j=await f.newSession({crypto,Tx:countedTx,operationScope:()=>owner}),owner={};
  await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  reads=decodes=decrypts=0;const first=await j.inspectOutcome();
  assert.deepEqual({reads,decodes,decrypts},{reads:3,decodes:1,decrypts:2});
  reads=decodes=decrypts=0;assert.equal((await j.inspectOutcome({reuse:true})).txHash,first.txHash);
  assert.deepEqual({reads,decodes,decrypts},{reads:3,decodes:1,decrypts:2},'reuse still freshly authenticates the record');
  assert.equal(f.sent.length,0);
 }));
 test(`${backend}: each exact-ciphertext freshness boundary rejects concurrent journal mutation`,()=>withStorage(async (f,{storage})=>{
  const owner={},j=await f.newSession({operationScope:()=>owner});
  await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  const read=storage.read.bind(storage);
  for(const changedRead of [2,3]){
    let reads=0;storage.read=async(...args)=>{const value=await read(...args);return ++reads===changedRead?value+' ':value;};
    await assert.rejects(j.inspectOutcome(),{code:'BB_RECOVERY_REQUIRED'});
    assert.equal(reads,changedRead);assert.equal(f.sent.length,0);
  }
  storage.read=read;
  assert.equal((await j.inspectOutcome()).outcome,'success');
 }));
 test(`${backend}: owned predecessor checks reuse only within the exact operation and refresh both proof boundaries`,()=>withStorage(async f=>{
  let owner={},receipts=0,blocks=0;const receipt=f.node.getTxReceipt,block=f.node.getBlock;
  f.node.getTxReceipt=async(...args)=>{receipts++;return receipt(...args);};f.node.getBlock=async(...args)=>{blocks++;return block(...args);};
  const j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  const observe=async()=>{const found=await j.inspectOutcome();j.confirmed(found.receipt);};
  await observe();await j.assertCanStart(); // prepare
  await j.assertCanStart({predecessor:{operation:null,txHash:String(f.tx.getTxHash())}});await j.assertCanStart(); // submit + commitment
  await j.assertCanStart({fresh:true});await j.assertCanStart(); // pre-proof + engine
  assert.deepEqual({receipts,blocks},{receipts:2,blocks:2});
  await j.assertCanStart({fresh:true}); // post-proof, always live
  assert.deepEqual({receipts,blocks},{receipts:3,blocks:3});
  owner={};await j.assertCanStart();assert.equal(receipts,4); // separate action cannot reuse
  owner=null;await j.assertCanStart();await j.assertCanStart();assert.equal(receipts,6);
 }));
 test(`${backend}: explicit predecessor checks capture identity and reject changed scope, journal or reorg`,()=>withStorage(async f=>{
  let owner={},reads=0,onGuard=()=>{};const receipt=f.node.getTxReceipt;f.node.getTxReceipt=async(...args)=>{reads++;return receipt(...args);};
  const j=await f.newSession({operationScope:()=>owner,contextGuard:async()=>onGuard()});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  const expected={operation:null,txHash:String(f.tx.getTxHash())};
  const found=await j.inspectOutcome();j.confirmed(found.receipt);assert.equal(reads,1);
  const changing={...expected};onGuard=()=>{changing.txHash=field();};await j.assertCanStart({predecessor:changing});assert.equal(reads,1,'caller mutation cannot change captured expectation');onGuard=()=>{};
  await assert.rejects(j.assertCanStart({predecessor:{...expected,txHash:field()}}),{code:'BB_RECOVERY_REQUIRED'});
  await j.assertCanStart({predecessor:expected});assert.equal(reads,2,'identity mismatch invalidates permit');
  owner={};await j.assertCanStart({predecessor:expected});assert.equal(reads,3,'new operation requires fresh receipt');
  owner={};f.reorg();await assert.rejects(j.assertCanStart({predecessor:expected}),{code:'BB_SUBMISSION_UNKNOWN'});
  await assert.rejects(j.assertCanStart({predecessor:expected}),{code:'BB_SUBMISSION_UNKNOWN'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: predecessor permit never covers changed authenticated journal bytes`,()=>withStorage(async f=>{
  const owner={},j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  const found=await j.inspectOutcome();j.confirmed(found.receipt);const prior=await j.assertCanStart();
  j.setOperation('replacement-fixture');await j.prepare(Tx.random({randomProof:true}),prior);
  await assert.rejects(j.assertCanStart({predecessor:{operation:null,txHash:String(f.tx.getTxHash())}}),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: expected predecessor cannot acknowledge a pending transaction`,()=>withStorage(async f=>{
  const owner={},stable=await f.newSession({operationScope:()=>owner});
  await stable.prepare(f.tx,await stable.assertCanStart());f.setStatus('pending');
  await assert.rejects(stable.assertCanStart({predecessor:{operation:null,txHash:String(f.tx.getTxHash())}}),{code:'BB_RECOVERY_REQUIRED'});
  assert.equal(stable.lastTxHash,null);assert.equal(f.sent.length,0);
 }));
 test(`${backend}: separate prepare and submit operation scopes still revalidate and reuse their own checks`,()=>withStorage(async f=>{
  let owner={},reads=0;const receipt=f.node.getTxReceipt;f.node.getTxReceipt=async(...args)=>{reads++;return receipt(...args);};
  const j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  let found=await j.inspectOutcome();j.confirmed(found.receipt);await j.assertCanStart();assert.equal(reads,1);
  owner={};found=await j.inspectOutcome();j.confirmed(found.receipt);await j.assertCanStart();await j.assertCanStart();await j.assertCanStart({fresh:true});await j.assertCanStart();assert.equal(reads,3);
 }));
 test(`${backend}: fresh proof boundary rejects reorg and failed refresh cannot leave a reusable permit`,()=>withStorage(async f=>{
  const owner={},j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');const found=await j.inspectOutcome();j.confirmed(found.receipt);
  f.reorg();await assert.rejects(j.assertCanStart({fresh:true}),{code:'BB_SUBMISSION_UNKNOWN'});await assert.rejects(j.assertCanStart(),{code:'BB_SUBMISSION_UNKNOWN'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: operation and account changes during a canonical read cannot mint a permit`,()=>withStorage(async f=>{
  let owner={},valid=true;const j=await f.newSession({operationScope:()=>owner,contextGuard:()=>{if(!valid)throw Error('changed account');}});
  await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');const original=f.node.getBlock;f.node.getBlock=async(...args)=>{const result=await original(...args);owner={};return result;};
  await assert.rejects(j.inspectOutcome(),{code:'BB_RECOVERY_REQUIRED'});f.node.getBlock=original;
  const found=await j.inspectOutcome();j.confirmed(found.receipt);valid=false;await assert.rejects(j.assertCanStart(),/changed account/);valid=true;f.reorg();await assert.rejects(j.assertCanStart(),{code:'BB_SUBMISSION_UNKNOWN'});
 }));
 test(`${backend}: authenticated journal revision change invalidates the previous permit`,()=>withStorage(async f=>{
  const owner={},j=await f.newSession({operationScope:()=>owner});await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');const found=await j.inspectOutcome();j.confirmed(found.receipt);
  let reads=0;const receipt=f.node.getTxReceipt;f.node.getTxReceipt=async(...args)=>{reads++;return receipt(...args);};
  const previous=await j.assertCanStart();j.setOperation('new-envelope');await j.prepare(f.tx,previous);const revised=await j.assertCanStart();assert.equal(reads,1,'Same Tx hash in a new authenticated envelope needs a new canonical observation');
  await j.prepare(Tx.random(),revised);await assert.rejects(j.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: read-only outcome never rebroadcasts or acknowledges`,()=>withStorage(async f=>{
  const journal=await f.newSession();journal.setOperation('post');await journal.prepare(f.tx,await journal.assertCanStart());
  const reopened=await f.newSession();assert.equal((await reopened.inspectOutcome()).outcome,'pending');assert.equal(f.sent.length,0);await assert.rejects(reopened.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
  f.setStatus('checkpointed');assert.equal((await reopened.inspectOutcome()).outcome,'success');assert.equal(f.sent.length,0);await assert.rejects(reopened.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
  f.setExecution('reverted');assert.equal((await reopened.inspectOutcome()).outcome,'reverted');f.reorg();await assert.rejects(reopened.inspectOutcome(),{code:'BB_SUBMISSION_UNKNOWN'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: operation metadata survives restart and canonical recovery alone permits the next operation`,()=>withStorage(async f=>{
  const operation=JSON.stringify(['transfer_censor',['recipient']]),j=await f.newSession();
  assert.equal(await j.reconcilePrevious(),null);j.setOperation(operation);await j.prepare(f.tx,await j.assertCanStart());
  f.setStatus('checkpointed');const restarted=await f.newSession(),recovered=await restarted.reconcilePrevious();
  assert.equal(recovered.operation,operation);assert.equal(recovered.receipt.executionResult,'success');assert.equal(f.sent.length,0);
  await restarted.assertCanStart();f.reorg();await assert.rejects(restarted.reconcilePrevious(),{code:'BB_SUBMISSION_UNKNOWN'});
 }));
 test(`${backend}: operator reconcile-only mode preserves dropped valid intent without any resend`,()=>withStorage(async (f,{storage})=>{
  const first=await f.newSession();first.setOperation('deploy-rolling-board');await first.prepare(f.tx,await first.assertCanStart());
  const key=createHash('sha256').update(l2JournalScopeText(f.opts.scope)).digest('hex'),before=await storage.read(key);
  const reopened=await f.newSession({reconcileOnly:true});await assert.rejects(reopened.reconcilePrevious(),{code:'BB_RECOVERY_REQUIRED'});await assert.rejects(reopened.recover(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.sent.length,0);assert.equal(await storage.read(key),before);
  f.setStatus('checkpointed');assert.equal((await reopened.reconcilePrevious()).receipt.executionResult,'success');assert.equal(f.sent.length,0);
 }));
 test(`${backend}: reconcile-only still blocks canonical-to-dropped race`,()=>withStorage(async f=>{
  const j=await f.newSession();j.setOperation('deploy-rolling-board');await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');
  const reopened=await f.newSession({reconcileOnly:true});assert.equal((await reopened.inspectSavedRecovery('deploy-rolling-board',String(f.tx.getTxHash()))).status,'canonical');f.setStatus('dropped');await assert.rejects(reopened.reconcilePrevious(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: crash before broadcast recovers identical actual SDK transaction without a new proof`,()=>withStorage(async f=>{
  const first=await f.newSession();await first.prepare(f.tx,await first.assertCanStart());assert.equal(f.sent.length,0);
  const resumed=await f.newSession();await assert.rejects(resumed.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
  const receipt=await resumed.recover();assert.equal(receipt.executionResult,'success');assert.equal(f.sent.length,1);assert.deepEqual(f.sent[0],Buffer.from(f.tx.toBuffer()));
 }));
 test(`${backend}: crash after broadcast recovers receipt without resending; acknowledgement is explicit`,()=>withStorage(async f=>{
  const first=await f.newSession();await first.prepare(f.tx,await first.assertCanStart());await f.node.sendTx(f.tx);
  const resumed=await f.newSession();await resumed.recover();assert.equal(f.sent.length,1);
  const restarted=await f.newSession();await assert.rejects(restarted.assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
  const acknowledged=await f.newSession({acknowledgeTx:f.tx.getTxHash().toString()});assert.equal((await acknowledged.assertCanStart()).tx.getTxHash().toString(),f.tx.getTxHash().toString());
 }));
 // Actual engine intent shapes; transaction proofs and node responses are fixtures.
 for(const kind of ['claim','post','dummy','withdraw'])for(const boundary of ['prepared','response-lost','before-confirmed','after-confirmed'])test(`${backend}: ${kind} preserves exact intent at ${boundary}`,()=>withStorage(async f=>{
  const depositChain=field(),operation=JSON.stringify(kind==='claim'
   ?{schemaVersion:1,kind,depositor:address(),amount:'1000000000000000',leafIndex:'42',secretHash:field(),transactionHash:field(),depositChain}
   :kind==='post'?{schemaVersion:1,kind,nonce:field(),message:'original saved text',depositChain}
   :{schemaVersion:1,kind,depositChain,headSequence:'0'});
  const applicationNullifier=['dummy','withdraw'].includes(kind)?f.tx.data.getNonEmptyNullifiers()[0].toString():undefined;
  const first=await f.newSession();first.setOperation(operation);await first.prepare(f.tx,await first.assertCanStart(),{applicationNullifier});
  if(boundary==='response-lost'){
   const send=f.node.sendTx;await assert.rejects((async()=>{await send(f.tx);throw Error('accepted response lost');})());
  }else if(boundary!=='prepared')await f.node.sendTx(f.tx);
  if(boundary==='after-confirmed')first.confirmed(await f.node.getTxReceipt(f.tx.getTxHash()));
  const fresh=await f.newSession(),saved=await fresh.inspect();
  assert.equal(saved.operation,operation);assert.equal(saved.txHash,f.tx.getTxHash().toString());assert.equal(saved.applicationNullifier,applicationNullifier);
  const receipt=await fresh.recover();assert.equal(receipt.txHash.toString(),saved.txHash);assert.equal(receipt.executionResult,'success');
  assert.deepEqual(f.sent,[Buffer.from(f.tx.toBuffer())]);
  const reopened=await f.newSession();assert.equal((await reopened.inspect()).operation,operation);await reopened.recover();assert.equal(f.sent.length,1);
 }));
 test(`${backend}: canonical recheck rejects previously acknowledged receipt after reorg`,()=>withStorage(async f=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');f.reorg();
  await assert.rejects((await f.newSession({acknowledgeTx:f.tx.getTxHash().toString()})).assertCanStart(),{code:'BB_SUBMISSION_UNKNOWN'});
 }));
 test(`${backend}: concurrent prepare permits exactly one durable transaction`,()=>withStorage(async f=>{
  const [a,b]=await Promise.all([f.newSession(),f.newSession()]);const [pa,pb]=await Promise.all([a.assertCanStart(),b.assertCanStart()]);
  const results=await Promise.allSettled([a.prepare(f.tx,pa),b.prepare(Tx.random(),pb)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sent.length,0);
 }));
 test(`${backend}: wrong key and full-salt mismatch fail authentication`,()=>withStorage(async f=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());
  for(const changed of [{walletSecret:field()},{walletSalt:field()}])await assert.rejects((await f.newSession(changed)).assertCanStart(),{code:'BB_JOURNAL_INVALID'});
 }));
 test(`${backend}: scope separation never recovers another board or chain`,()=>withStorage(async f=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());
  for(const scope of [{...f.opts.scope,chainId:'31338'},{...f.opts.scope,board:field()}])await assert.rejects((await f.newSession({scope})).recover(),{code:'BB_NO_SAVED_TRANSACTION'});
 }));
 test(`${backend}: failed execution, uncertain drop, RPC error and foreign receipt never permit replacement`,()=>withStorage(async f=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());f.setStatus('checkpointed');f.setExecution('reverted');
  assert.equal((await (await f.newSession()).recover()).executionResult,'reverted');
  await assert.rejects((await f.newSession()).assertCanStart(),{code:'BB_RECOVERY_REQUIRED'});
  await (await f.newSession({acknowledgeTx:f.tx.getTxHash().toString()})).assertCanStart();
  f.setStatus('dropped');f.node.isValidTx=async()=>({result:'invalid',reason:['Existing nullifier']});await assert.rejects((await f.newSession()).recover(),{code:'BB_RECOVERY_REQUIRED'});
  f.node.getTxReceipt=async()=>{throw new Error('private diagnostic');};await assert.rejects((await f.newSession()).recover(),e=>e.code==='BB_RECOVERY_REQUIRED'&&!e.message.includes('private diagnostic'));
  f.node.getTxReceipt=async()=>({txHash:TxHash.random(),status:'checkpointed'});await assert.rejects((await f.newSession()).recover(),{code:'BB_RECOVERY_REQUIRED'});assert.equal(f.sent.length,0);
 }));
 test(`${backend}: acknowledged canonical revert permits a new action without wallet-wide finality wait`,()=>withStorage(async (f,{storage})=>{
  const journal=await f.newSession();journal.setOperation('post');await journal.prepare(f.tx,await journal.assertCanStart());
  f.setExecution('reverted');f.setStatus('checkpointed');
  const recovered=await f.newSession();assert.equal((await recovered.recover()).executionResult,'reverted');
  const original=await recovered.inspect();
  storage.compareAndSwap=async()=>{throw new Error('Acknowledgement does not mutate or resend the saved transaction');};
  for(const status of ['checkpointed','proven','finalized']) {
   f.setStatus(status);await recovered.assertCanStart();
   const restarted=await f.newSession({acknowledgeTx:f.tx.getTxHash().toString()});await restarted.assertCanStart();
   assert.deepEqual(await restarted.inspect(),original);assert.equal(f.sent.length,0);
  }
  f.reorg();await assert.rejects(recovered.assertCanStart(),{code:'BB_SUBMISSION_UNKNOWN'});assert.equal(f.sent.length,0);
 })); test(`${backend}: wallet context change prevents recovery broadcast`,()=>withStorage(async f=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());
  const changed=await f.newSession({contextGuard:async()=>{throw new Error('wallet changed');}});
  await assert.rejects(changed.recover(),/wallet changed/);assert.equal(f.sent.length,0);
 }));
 test(`${backend}: persisted envelope excludes transaction and wallet plaintext and tampering fails closed`,()=>withStorage(async(f,{temp,idb,storage})=>{
  const j=await f.newSession();await j.prepare(f.tx,await j.assertCanStart());let name;
  if(backend==='file')name=fs.readdirSync(temp).find(n=>n.endsWith('.json')).slice(0,-5);
  else {const db=await new Promise(resolve=>{const r=idb.open('aztec-billboard-transaction-journal-v1');r.onsuccess=()=>resolve(r.result);});name=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').getAllKeys();r.onsuccess=()=>resolve(r.result[0]);});db.close();}
  const encoded=await storage.read(name);for(const secret of [f.opts.walletSecret,f.tx.getTxHash().toString(),Buffer.from(f.tx.toBuffer()).toString('hex').slice(0,128)])assert(!encoded.includes(secret));
  const changed=JSON.parse(encoded);changed.data=(changed.data[0]==='0'?'1':'0')+changed.data.slice(1);await storage.compareAndSwap(name,encoded,JSON.stringify(changed));await assert.rejects((await f.newSession()).recover(),{code:'BB_JOURNAL_INVALID'});
 }));
}
test('file adapter rejects symlinks, unsafe modes and stale locks without replacing data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-journal-files-')),key=randomBytes(32).toString('hex');
 try {const store=createFileJournalStorage(dir),file=path.join(dir,key+'.json');fs.writeFileSync(file,'ciphertext',{mode:0o644});await assert.rejects(store.read(key));fs.chmodSync(file,0o600);fs.writeFileSync(file+'.lock','',{mode:0o600});await assert.rejects(store.compareAndSwap(key,'ciphertext','other'));assert.equal(fs.readFileSync(file,'utf8'),'ciphertext');fs.unlinkSync(file+'.lock');fs.unlinkSync(file);fs.symlinkSync('/dev/null',file);await assert.rejects(store.read(key));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('abrupt worker death after durable prepare preserves exact recovery transaction',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-journal-crash-'));
 try {
  const f=fixture(createFileJournalStorage(dir));
  const input=JSON.stringify({directory:dir,tx:Buffer.from(f.tx.toBuffer()).toString('hex'),walletSecret:f.opts.walletSecret,walletSalt:f.opts.walletSalt,scope:f.opts.scope});
  assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('./fixtures/w03-journal/crash.mjs',import.meta.url))],{input,stdio:['pipe','pipe','pipe'],timeout:10000}),e=>e.signal==='SIGKILL');
  const fresh=await f.newSession({storage:createFileJournalStorage(dir)});await fresh.recover();assert.deepEqual(f.sent,[Buffer.from(f.tx.toBuffer())]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
