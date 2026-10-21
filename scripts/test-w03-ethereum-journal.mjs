import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Interface} from 'ethers';
import {IDBFactory} from 'fake-indexeddb';
import {createEthereumJournal} from '../shared/ethereum-journal.mjs';
import {createFileJournalStorage} from '../apps/src/billboard/user/transaction-journal-store.mjs';
import {createBrowserJournalStorage} from '../shared/journal-indexeddb.mjs';
const field=()=> '0x'+randomBytes(31).toString('hex').padStart(64,'0'),addr=()=> '0x'+randomBytes(20).toString('hex');
const blockHash=n=>'0x'+BigInt(n+1).toString(16).padStart(64,'0');
const iface=new Interface(['function deposit(bytes32 secretHash) payable','function withdraw(bytes32,uint256,uint256,uint256,bytes32[])','event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)','event Withdrawn(address indexed depositor,uint128 amount,bytes32 indexed depositId)','function requestRefund(bytes32 depositId)','function refund(address depositor,bytes32 depositId,uint256,uint256,uint256,bytes32[])','event RefundRequested(address indexed depositor,bytes32 indexed depositId,uint128 amount,bytes32 key,uint256 index)','event Refunded(address indexed depositor,bytes32 indexed depositId,uint128 amount)']);
const bokInterface=new Interface(['function withdraw(address recipient,uint128 amount,bytes32 nonce,uint256,uint256,uint256,bytes32[])','event Withdrawn(address indexed recipient,uint128 amount,bytes32 nonce)','function deposit(bytes32 account,uint128 amount,bytes32 secretHash)','event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
function fixture(storage,kind='deposit') {
 const scope={account:field(),chainId:'31337',rollup:addr(),version:'5',board:field(),portal:addr(),depositor:addr()};
 if(['bok-deposit','bok-withdraw'].includes(kind))scope.token=addr();
 const requests=[],transactions=new Map(),receipts=new Map(),blocks=new Map();let head=10,nonce=4,mode='normal',fork=false;
 const expected={kind,amount:'100',...(['withdraw','request-refund','deposit-refund'].includes(kind)?{depositId:field()}:{}),...(kind==='bok-withdraw'?{recipient:addr(),exitNonce:field()}:{}),...(['deposit','bok-deposit'].includes(kind)?{secretHash:field()}:{}),...(kind==='bok-deposit'?{recipient:field()}:{})};
 const data=kind==='request-refund'?iface.encodeFunctionData('requestRefund',[expected.depositId]):kind==='deposit-refund'?iface.encodeFunctionData('refund',[scope.depositor,expected.depositId,1,1,0,[]]):kind==='bok-withdraw'?bokInterface.encodeFunctionData('withdraw',[expected.recipient,100,expected.exitNonce,1,1,0,[]]):kind==='bok-deposit'?bokInterface.encodeFunctionData('deposit',[expected.recipient,expected.amount,expected.secretHash]):kind==='deposit'?iface.encodeFunctionData('deposit',[expected.secretHash]):iface.encodeFunctionData('withdraw',[expected.depositId,1,1,0,[]]);
 const intent={data,value:kind==='deposit'?'100':'0',expected};
 const provider={getNetwork:async()=>({chainId:31337n}),getBlockNumber:async()=>head,getTransactionCount:async()=>nonce,
  estimateGas:async()=>100000n,
  getBlock:async n=>{n=n==='latest'?head:n;return {number:n,hash:fork?blockHash(n+9000):blockHash(n),parentHash:blockHash(n-1),prefetchedTransactions:blocks.get(n)||[]};},
  getTransaction:async h=>transactions.get(h)||null,getTransactionReceipt:async h=>receipts.get(h)||null,waitForTransaction:async h=>receipts.get(h)||null};
 const signer={getAddress:async()=>scope.depositor,sendTransaction:async request=>{
  if(['deposit','request-refund'].includes(kind))assert(request.gasLimit>=150000n,'Inbox state can require more gas than the estimate');
  requests.push(request);if([4001,'ACTION_REJECTED','INSUFFICIENT_FUNDS'].includes(mode))throw Object.assign(new Error('private wallet detail'),{code:mode});if(mode==='reject')throw new Error('private wallet response');
  if(request.nonce!==nonce)throw new Error('nonce already used');
  const hash=field(),body={...request,hash};transactions.set(hash,body);head++;nonce++;blocks.set(head,[body]);
  const event=kind==='request-refund'?iface.encodeEventLog(iface.getEvent('RefundRequested'),[scope.depositor,expected.depositId,100,field(),2]):kind==='deposit-refund'?iface.encodeEventLog(iface.getEvent('Refunded'),[scope.depositor,expected.depositId,100]):kind==='bok-withdraw'?bokInterface.encodeEventLog(bokInterface.getEvent('Withdrawn'),[expected.recipient,100,expected.exitNonce]):kind==='bok-deposit'?bokInterface.encodeEventLog(bokInterface.getEvent('Deposited'),[expected.recipient,100,field(),2]):kind==='deposit'?iface.encodeEventLog(iface.getEvent('Deposited'),[scope.depositor,100,expected.secretHash,field(),2]):iface.encodeEventLog(iface.getEvent('Withdrawn'),[scope.depositor,100,expected.depositId]);
  receipts.set(hash,{hash,from:scope.depositor,to:scope.portal,blockNumber:head,blockHash:blockHash(head),status:1,logs:[{address:scope.portal,...event}]});
  if(mode==='lost')throw new Error('lost response PRIVATE_SENTINEL');return body;
 }};
 const options={storage,walletSecret:field(),walletSalt:field(),scope,provider,signer,timeoutMs:1000};
 return {scope,intent,provider,signer,requests,transactions,receipts,blocks,newSession:extra=>createEthereumJournal({...options,...extra}),options,
  mode:value=>mode=value,fork:()=>fork=true,setHead:value=>head=value,head:()=>head};
}
for(const backend of ['file','indexeddb']) {
 async function use(fn,kind='deposit') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-eth-journal-'));
  try{const storage=backend==='file'?createFileJournalStorage(dir):createBrowserJournalStorage(new IDBFactory());await fn(fixture(storage,kind),{storage,dir});}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 for(const kind of ['request-refund','deposit-refund']){
  test(`${backend}: ${kind} exact receipt survives lost response and reopen with no resend`,()=>use(async f=>{
   f.mode('lost');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
   const result=await (await f.newSession({signer:null})).recover({retry:false});
   assert.equal(result.outcome,'success');assert.equal(result.event.depositId,f.intent.expected.depositId);assert.equal(result.event.depositor.toLowerCase(),f.scope.depositor);assert.equal(String(result.event.amount),'100');assert.equal(f.requests.length,1);
   assert.equal((await (await f.newSession({signer:null})).recover()).txHash,result.txHash);assert.equal(f.requests.length,1);
  },kind));
  test(`${backend}: ${kind} recovered prior request permits a second distinct deposit on the same journal`,()=>use(async f=>{
   const first=await (await f.newSession()).send(f.intent),oldId=f.intent.expected.depositId;
   const reopened=await f.newSession();assert.equal((await reopened.recover({retry:false})).txHash,first.txHash);
   f.intent.expected.depositId=field();assert.notEqual(f.intent.expected.depositId,oldId);
   f.intent.data=kind==='request-refund'?iface.encodeFunctionData('requestRefund',[f.intent.expected.depositId]):iface.encodeFunctionData('refund',[f.scope.depositor,f.intent.expected.depositId,1,1,0,[]]);
   const second=await reopened.send(f.intent);assert.equal(second.outcome,'success');assert.notEqual(second.txHash,first.txHash);assert.equal(second.event.depositId,f.intent.expected.depositId);
   assert.equal(f.requests.length,2);assert.equal(f.requests[1].nonce,f.requests[0].nonce+1);assert.notEqual(f.requests[1].data,f.requests[0].data);
  },kind));
  for(const mutation of ['missing','zero','different','value','owner'])test(`${backend}: ${kind} rejects ${mutation} intent before signing`,()=>use(async f=>{
   const intent=structuredClone(f.intent);
   if(mutation==='missing')delete intent.expected.depositId;
   if(mutation==='zero')intent.expected.depositId='0x'+'00'.repeat(32);
   if(mutation==='different')intent.expected.depositId=field();
   if(mutation==='value')intent.value='1';
   if(mutation==='owner'){
    if(kind==='deposit-refund')intent.data=iface.encodeFunctionData('refund',[addr(),intent.expected.depositId,1,1,0,[]]);
    else f.signer.getAddress=async()=>addr();
   }
   await assert.rejects((await f.newSession()).send(intent));assert.equal(f.requests.length,0);
  },kind));
  for(const mutation of ['depositId','owner','amount','duplicate','missing','reorg'])test(`${backend}: ${kind} rejects changed ${mutation} receipt`,()=>use(async f=>{
   const result=await (await f.newSession()).send(f.intent),receipt=f.receipts.get(result.txHash);
   if(mutation==='reorg')f.fork();else if(mutation==='duplicate')receipt.logs.push(receipt.logs[0]);else if(mutation==='missing')receipt.logs=[];
   else {
    const args=[mutation==='owner'?addr():f.scope.depositor,mutation==='depositId'?field():f.intent.expected.depositId,mutation==='amount'?101:100,...(kind==='request-refund'?[field(),2]:[])];
    receipt.logs=[{address:f.scope.portal,...iface.encodeEventLog(iface.getEvent(kind==='request-refund'?'RefundRequested':'Refunded'),args)}];
   }
   await assert.rejects((await f.newSession({signer:null})).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
  },kind));
 }
 for(const cancelled of [false,true])test(`${backend}: native replacement completion reconciles ${cancelled?'cancellation':'speed-up'} without sending again`,()=>use(async f=>{
  const send=f.signer.sendTransaction;let waits=0,originalHash;
  f.signer.sendTransaction=async request=>{
   const tx=await send(request);originalHash=tx.hash;
   const receipt=f.receipts.get(tx.hash);f.receipts.delete(tx.hash);
   f.provider.getTransactionCount=async()=>waits?5:4;
   tx.replaceableTransaction=start=>{assert.equal(start,10);return {wait:async(confirmations,timeout)=>{
    assert.equal(confirmations,1);assert.equal(timeout,undefined);waits++;
    const hash=field(),replacement={...tx,hash,...(cancelled?{to:tx.from,data:'0x',value:0n}:{})};
    f.setHead(12);f.transactions.set(hash,replacement);f.blocks.set(12,[replacement]);
    f.receipts.set(hash,{...receipt,hash,blockNumber:12,blockHash:blockHash(12),to:replacement.to,logs:cancelled?[]:receipt.logs});
    throw Object.assign(Error('replacement'),{code:'TRANSACTION_REPLACED',replacement:{hash}});
   }}};return tx;
  };
  const journal=await f.newSession(),submitted=await journal.send(f.intent,{waitForReceipt:false});
  assert.equal(submitted.outcome,'submitted');
  // Fresh continuation retains the genuine response even before RPC can return it.
  const get=f.provider.getTransaction;f.provider.getTransaction=hash=>hash===originalHash?null:get(hash);
  const result=await journal.recover({wait:true});
  assert.equal(result.outcome,cancelled?'replaced':'success');assert.notEqual(result.txHash,originalHash);
  assert.equal(waits,1);assert.equal(f.requests.length,1);
 }));
 test(`${backend}: restored absent original transaction stays unknown without a hash-only waiter`,()=>use(async f=>{
  const send=f.signer.sendTransaction;f.signer.sendTransaction=async request=>{const tx=await send(request);f.receipts.clear();return tx;};
  f.provider.getTransactionCount=async()=>4;
  await (await f.newSession()).send(f.intent,{waitForReceipt:false});
  f.provider.getTransaction=async()=>null;f.provider.waitForTransaction=()=>{throw Error('hash-only waiter must not run');};
  await assert.rejects((await f.newSession({signer:null})).recover({wait:true}),{code:'BB_ETH_RECOVERY_REQUIRED'});
  assert.equal(f.requests.length,1);
 }));
 test(`${backend}: saved request inspection authenticates and returns detached immutable review data without sending`,()=>use(async f=>{
  const j=await f.newSession();assert.equal(await j.inspectRequest(),null);f.mode('reject');await assert.rejects(j.send(f.intent));
  const saved=await j.inspectRequest();assert.equal(saved.nonce,4);assert.equal(saved.data,f.intent.data);assert.equal(saved.txHash,null);
  saved.data='0x00';saved.expected.amount='999';const again=await (await f.newSession()).inspectRequest();assert.equal(again.data,f.intent.data);assert.equal(again.expected.amount,'100');assert.equal(f.requests.length,1);
 },'withdraw'));
 for(const mutation of ['missing','zero','different'])test(`${backend}: withdrawal rejects ${mutation} deposit ID before signing`,()=>use(async f=>{
  const request=structuredClone(f.intent);if(mutation==='missing')delete request.expected.depositId;else request.expected.depositId=mutation==='zero'?'0x'+'00'.repeat(32):field();
  await assert.rejects((await f.newSession()).send(request),{code:'BB_JOURNAL_INVALID'});assert.equal(f.requests.length,0);
 },'withdraw'));
 test(`${backend}: withdrawal event for another deposit cannot prove refund`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),receipt=f.receipts.get(result.txHash);
  receipt.logs=[{address:f.scope.portal,...iface.encodeEventLog(iface.getEvent('Withdrawn'),[f.scope.depositor,100,field()])}];
  await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
 },'withdraw'));
 test(`${backend}: Bok withdrawal exact receipt survives lost response and reopen without resend`,()=>use(async f=>{
  f.mode('lost');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
  const result=await (await f.newSession({signer:null})).recover({retry:false});assert.equal(result.outcome,'success');assert.equal(result.event.recipient.toLowerCase(),f.intent.expected.recipient);assert.equal(f.requests.length,1);
 },'bok-withdraw'));
 for(const mutation of ['recipient','amount','exitNonce','duplicate','missing','reorg','calldata'])test(`${backend}: Bok withdrawal rejects changed ${mutation}`,()=>use(async f=>{
  const r=await (await f.newSession()).send(f.intent),receipt=f.receipts.get(r.txHash);
  if(mutation==='reorg')f.fork();else if(mutation==='duplicate')receipt.logs.push(receipt.logs[0]);else if(mutation==='missing')receipt.logs=[];
  else if(mutation==='calldata'){f.transactions.get(r.txHash).data='0x12345678';assert.equal((await (await f.newSession()).recover()).outcome,'replaced');return;}
  else receipt.logs=[{address:f.scope.portal,...bokInterface.encodeEventLog(bokInterface.getEvent('Withdrawn'),[mutation==='recipient'?addr():f.intent.expected.recipient,mutation==='amount'?101:100,mutation==='exitNonce'?field():f.intent.expected.exitNonce])}];
  await assert.rejects((await f.newSession({signer:null})).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
 },'bok-withdraw'));
 for(const mutation of ['recipient','amount','exitNonce','token'])test(`${backend}: Bok withdrawal rejects invalid ${mutation} before send`,()=>use(async f=>{
  const intent=structuredClone(f.intent);if(mutation==='token')delete f.scope.token;else intent.expected[mutation]=mutation==='recipient'?addr():mutation==='amount'?'101':field();
  await assert.rejects((await f.newSession()).send(intent),{code:'BB_JOURNAL_INVALID'});assert.equal(f.requests.length,0);
 },'bok-withdraw'));
 test(`${backend}: Bok deposit uses the existing encrypted journal and recovers a lost response without sending`,()=>use(async(f,{storage})=>{
  f.mode('lost');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].gasLimit,200000n);
  const recovered=await (await f.newSession({signer:null})).recover({retry:false});
  assert.equal(recovered.outcome,'success');assert.equal(recovered.event.account,f.intent.expected.recipient);assert.equal(String(recovered.event.amount),'100');
  assert.equal((await (await f.newSession({signer:null})).recover()).txHash,recovered.txHash);assert.equal(f.requests.length,1);
 },'bok-deposit'));
 for(const mutation of ['recipient','secret','amount','value','token'])test(`${backend}: Bok deposit rejects invalid ${mutation} before signing`,()=>use(async f=>{
  const intent=structuredClone(f.intent);
  if(mutation==='recipient')intent.expected.recipient=field();
  if(mutation==='secret')intent.expected.secretHash=field();
  if(mutation==='amount')intent.expected.amount='101';
  if(mutation==='value')intent.value='1';
  if(mutation==='token')delete f.scope.token;
  await assert.rejects((await f.newSession()).send(intent),{code:'BB_JOURNAL_INVALID'});assert.equal(f.requests.length,0);
 },'bok-deposit'));
 for(const mutation of ['recipient','amount','duplicate','missing','key','reorg'])test(`${backend}: Bok deposit requires canonical exact ${mutation} effect`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),receipt=f.receipts.get(result.txHash);
  if(mutation==='duplicate')receipt.logs.push(receipt.logs[0]);
  else if(mutation==='missing')receipt.logs=[];
  else if(mutation==='reorg')f.fork();
  else receipt.logs=[{address:f.scope.portal,...bokInterface.encodeEventLog(bokInterface.getEvent('Deposited'),[mutation==='recipient'?field():f.intent.expected.recipient,mutation==='amount'?101:100,mutation==='key'?blockHash(-1):field(),2])}];
  await assert.rejects((await f.newSession({signer:null})).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
 },'bok-deposit'));
 test(`${backend}: Bok event alone never authenticates a changed secret or wallet envelope`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),tx=f.transactions.get(result.txHash);
  tx.data=bokInterface.encodeFunctionData('deposit',[f.intent.expected.recipient,'100',field()]);
  assert.equal((await (await f.newSession({signer:null})).recover()).outcome,'replaced');
  tx.data='0x12345678';assert.equal((await (await f.newSession({signer:null})).recover()).outcome,'replaced');assert.equal(f.requests.length,1);
 },'bok-deposit'));
 test(`${backend}: deposit estimates exact intent with V6 Inbox allowance`,()=>use(async f=>{
  let estimated;f.provider.estimateGas=async request=>{estimated={...request};return 100000n;};
  await (await f.newSession()).send(f.intent);
  const {gasLimit,...sent}=f.requests[0];assert.equal(gasLimit,200000n);assert.deepEqual(sent,estimated);
 }));
 test(`${backend}: withdrawal does not estimate or set a deposit gas allowance`,()=>use(async f=>{
  f.provider.estimateGas=async()=>{throw Error('Unexpected estimate');};
  assert.equal((await (await f.newSession()).send(f.intent)).outcome,'success');assert.equal(f.requests[0].gasLimit,undefined);
 },'withdraw'));
 test(`${backend}: explicit deposit retry refreshes gas but preserves intent`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
  f.provider.estimateGas=async()=>140000n;f.mode('normal');await (await f.newSession()).recover({retry:true});
  const {gasLimit:first,...a}=f.requests[0],{gasLimit:second,...b}=f.requests[1];
  assert.equal(first,200000n);assert.equal(second,280000n);assert.deepEqual(a,b);
 }));
 for(const failure of ['reject','transport-failure','invalid'])test(`${backend}: ${failure} gas estimate fails before submission and permits fresh preparation`,()=>use(async f=>{
  f.provider.estimateGas=()=>failure==='transport-failure'?Promise.reject(Object.assign(Error('private RPC detail'),{code:'TIMEOUT'})):failure==='invalid'?0n:Promise.reject(Error('private RPC detail'));
  await assert.rejects((await f.newSession({timeoutMs:20})).send(f.intent),{code:'BB_ETH_PREFLIGHT_FAILED',ethereumStage:'preflight'});
  assert.equal(f.requests.length,0);await (await f.newSession()).assertCanStart();
 }));
 test(`${backend}: definitive insufficient funds during initial estimate permits fresh payment`,()=>use(async f=>{
  f.provider.estimateGas=async()=>{throw Object.assign(Error('private diagnostic'),{code:'INSUFFICIENT_FUNDS'});};
  await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_INSUFFICIENT_FUNDS'});
  assert.equal(f.requests.length,0);await (await f.newSession()).assertCanStart();
 }));
 for(const code of [4001,'ACTION_REJECTED','INSUFFICIENT_FUNDS']) {
 test(`${backend}: definitive ${code} first attempt permits fresh payment after restart`,()=>use(async f=>{
   f.mode(code);await assert.rejects((await f.newSession()).send(f.intent),{code:code==='INSUFFICIENT_FUNDS'?'BB_ETH_INSUFFICIENT_FUNDS':'BB_ETH_REQUEST_CANCELLED'});
   await (await f.newSession()).assertCanStart();f.mode('normal');
   const result=await (await f.newSession()).send(f.intent);assert.equal(result.outcome,'success');assert.equal(f.requests[0].nonce,f.requests[1].nonce);
 }));
 test(`${backend}: ${code} during retry cannot erase an uncertain original request`,()=>use(async f=>{
   f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
   f.mode(code);await assert.rejects((await f.newSession()).recover({retry:true}),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
   await assert.rejects((await f.newSession()).assertCanStart(),{code:'BB_ETH_RECOVERY_REQUIRED'});
   f.mode('normal');assert.equal((await (await f.newSession()).recover({retry:true})).outcome,'success');
   assert(f.requests.every(r=>r.nonce===f.requests[0].nonce&&r.data===f.requests[0].data));
 }));
 }
 test(`${backend}: cancellation preserves prior confirmed record and does not skip a nonce`,()=>use(async f=>{
   const first=await (await f.newSession()).send(f.intent);f.mode('ACTION_REJECTED');
   await assert.rejects((await f.newSession({acknowledgeTx:first.txHash})).send(f.intent),{code:'BB_ETH_REQUEST_CANCELLED'});
   const j=await f.newSession();assert.equal((await j.recover()).txHash,first.txHash);f.mode('normal');await j.send(f.intent);
   assert.equal(f.requests[1].nonce,f.requests[2].nonce);
 }));
 test(`${backend}: cancellation rollback storage failure retains recovery protection`,()=>use(async(f,{storage})=>{
   let writes=0;const failing={read:key=>storage.read(key),compareAndSwap:async(...args)=>{if(++writes===2)throw Error('disk full');return storage.compareAndSwap(...args);}};
   f.mode('ACTION_REJECTED');await assert.rejects((await f.newSession({storage:failing})).send(f.intent),{code:'BB_JOURNAL_INVALID'});
   await assert.rejects((await f.newSession()).assertCanStart(),{code:'BB_ETH_RECOVERY_REQUIRED'});
 }));
 test(`${backend}: empty Ethereum journal reports its own recovery route`,()=>use(async f=>{await assert.rejects((await f.newSession()).recover(),{code:'BB_NO_SAVED_ETHEREUM_TRANSACTION'});assert.equal(f.requests.length,0);}));
 for(const kind of ['deposit','withdraw'])test(`${backend}: ${kind} requires matching canonical receipt and event`,()=>use(async f=>{
  const j=await f.newSession(),result=await j.send(f.intent);assert.equal(result.outcome,'success');assert.equal(f.requests.length,1);
  await assert.rejects((await f.newSession()).assertCanStart(),{code:'BB_ETH_RECOVERY_REQUIRED'});
  const restored=await f.newSession({signer:null});assert.equal((await restored.recover()).txHash,result.txHash);assert.equal(f.requests.length,1);
  await (await f.newSession({acknowledgeTx:result.txHash})).assertCanStart();
 },kind));
 for(const kind of ['deposit','withdraw']) {
 test(`${backend}: ${kind}: lost response before hash storage finds original sender/nonce without another send`,()=>use(async f=>{
  f.mode('lost');await assert.rejects((await f.newSession()).send(f.intent),e=>e.code==='BB_ETH_SUBMISSION_UNKNOWN'&&!e.message.includes('PRIVATE_SENTINEL'));
  const result=await (await f.newSession()).recover();assert.equal(result.outcome,'success');assert.equal(f.requests.length,1);assert.equal(result.receipt.blockNumber,11);
 },kind));
 test(`${backend}: ${kind}: rejection/crash before broadcast retains exact nonce, calldata and value for explicit retry`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent),{code:'BB_ETH_SUBMISSION_UNKNOWN'});
  await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
  f.mode('normal');await (await f.newSession()).recover({retry:true});assert.equal(f.requests.length,2);assert.deepEqual(f.requests[0],f.requests[1]);
 },kind));
 test(`${backend}: ${kind}: storage failure stops before wallet request`,()=>use(async f=>{
  const journal=await f.newSession({storage:{read:async()=>null,compareAndSwap:async()=>{throw new Error('disk full');}}});await assert.rejects(journal.send(f.intent),{code:'BB_JOURNAL_INVALID'});assert.equal(f.requests.length,0);
 },kind));
 }
 for(const kind of ['deposit','withdraw'])for(const boundary of ['before','after'])test(`${backend}: ${kind} interruption ${boundary} hash persistence recovers original mined transaction`,()=>use(async(f,{storage})=>{
  let writes=0;
  const interrupted={read:key=>storage.read(key),compareAndSwap:async(...args)=>{
   writes++;
   if(writes===2&&boundary==='before')throw Error('interrupted before hash write');
   await storage.compareAndSwap(...args);
   if(writes===2&&boundary==='after')throw Error('interrupted after hash write');
  }};
  await assert.rejects((await f.newSession({storage:interrupted})).send(f.intent),{code:'BB_JOURNAL_INVALID'});
  assert.equal(writes,2);assert.equal(f.requests.length,1);assert.equal(f.transactions.size,1);
  const originalHash=f.transactions.keys().next().value;
  const recovered=await (await f.newSession({signer:null})).recover();
  assert.equal(recovered.outcome,'success');assert.equal(recovered.txHash,originalHash);
  assert.equal(String(recovered.event.amount),f.intent.expected.amount);
  assert.equal(recovered.event.depositor.toLowerCase(),f.scope.depositor);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].data,f.intent.data);assert.equal(String(f.requests[0].value),f.intent.value);
  assert.equal((await (await f.newSession({signer:null})).recover()).txHash,originalHash);assert.equal(f.requests.length,1);
 },kind));
 test(`${backend}: concurrent intent saves authorize only one signer request`,()=>use(async f=>{
  const a=await f.newSession(),b=await f.newSession();await Promise.allSettled([a.send(f.intent),b.send(f.intent)]);assert.equal(f.requests.length,1);
 }));
 test(`${backend}: reorg prevents acknowledgement and never reports paid`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent);f.fork();await assert.rejects((await f.newSession({acknowledgeTx:result.txHash})).assertCanStart(),{code:'BB_ETH_RECOVERY_REQUIRED'});await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});
 }));
 test(`${backend}: reverted or replaced transaction is not a successful payment`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent);f.receipts.get(result.txHash).status=0;
  assert.equal((await (await f.newSession()).recover()).outcome,'reverted');
  f.receipts.get(result.txHash).status=1;f.transactions.get(result.txHash).data='0x';f.receipts.get(result.txHash).logs=[];assert.equal((await (await f.newSession()).recover()).outcome,'replaced');
 }));
 for(const kind of ['deposit','withdraw'])test(`${backend}: wallet-wrapped ${kind} is recognized by its exact portal effect`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),tx=f.transactions.get(result.txHash),receipt=f.receipts.get(result.txHash);
  tx.to=addr();tx.value=0n;tx.data='0x12345678';receipt.to=tx.to;
  assert.equal((await (await f.newSession()).recover()).outcome,'success');
 },kind));
 for(const change of ['secret','amount','depositor','address','duplicate','reverted','reorg'])test(`${backend}: wrapped deposit rejects ${change}`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),tx=f.transactions.get(result.txHash),receipt=f.receipts.get(result.txHash);
  tx.to=addr();tx.value=0n;tx.data='0x12345678';receipt.to=tx.to;
  if(change==='address')receipt.logs[0].address=addr();
  if(change==='duplicate')receipt.logs.push(receipt.logs[0]);
  if(change==='reverted')receipt.status=0;
  if(change==='reorg')f.fork();
  if(['secret','amount','depositor'].includes(change))receipt.logs=[{address:f.scope.portal,...iface.encodeEventLog(iface.getEvent('Deposited'),[change==='depositor'?addr():f.scope.depositor,change==='amount'?101:100,change==='secret'?field():f.intent.expected.secretHash,field(),2])}];
  if(change==='address')assert.equal((await (await f.newSession()).recover()).outcome,'replaced');
  else if(change==='reverted')assert.equal((await (await f.newSession()).recover()).outcome,'reverted');
  else await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});
 }));
 for(const change of ['missing','amount','address','duplicate'])test(`${backend}: ${change} refund event cannot prove payment`,()=>use(async f=>{
  const result=await (await f.newSession()).send(f.intent),receipt=f.receipts.get(result.txHash);
  if(change==='missing')receipt.logs=[];
  if(change==='address')receipt.logs[0].address=addr();
  if(change==='duplicate')receipt.logs.push(receipt.logs[0]);
  if(change==='amount')receipt.logs=[{address:f.scope.portal,...iface.encodeEventLog(iface.getEvent('Withdrawn'),[f.scope.depositor,101,f.intent.expected.depositId])}];
  await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});
 },'withdraw'));
 test(`${backend}: full salt/authentication mismatch and chain change fail before signing`,()=>use(async f=>{
  await (await f.newSession()).send(f.intent);await assert.rejects((await f.newSession({walletSalt:field()})).recover(),{code:'BB_JOURNAL_INVALID'});
  f.provider.getNetwork=async()=>({chainId:1n});await assert.rejects((await f.newSession()).recover({retry:true}),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(f.requests.length,1);
 }));
 test(`${backend}: an unconsumed nonce skips old blocks and retries the original request`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent));f.setHead(100000);
  const original=f.provider.getBlock;let fullReads=0;
  f.provider.getBlock=async(n,full)=>{if(full)fullReads++;return original(n,full);};
  f.mode('normal');const result=await (await f.newSession()).recover({retry:true});
  assert.equal(result.outcome,'success');assert.equal(fullReads,0);assert.deepEqual(f.requests[0],f.requests[1]);
 }));
 test(`${backend}: failed or malformed confirmed nonce never permits broadcast`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent));
  for(const value of [undefined,-1,1.5]){
   f.provider.getTransactionCount=async()=>value;
   await assert.rejects((await f.newSession()).recover({retry:true}),{code:'BB_ETH_RECOVERY_REQUIRED'});
  }
  f.provider.getTransactionCount=async()=>{throw Error('RPC unavailable');};
  await assert.rejects((await f.newSession()).recover({retry:true}),{code:'BB_ETH_READ_FAILED'});
  assert.equal(f.requests.length,1);
 }));
 test(`${backend}: nonce lookup crossing a reorg cannot authorize retry`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent));f.setHead(100);
  f.provider.getTransactionCount=async()=>{f.fork();return 4;};
  await assert.rejects((await f.newSession()).recover({retry:true}),{code:'BB_ETH_RECOVERY_REQUIRED'});
  assert.equal(f.requests.length,1);
 }));
 test(`${backend}: long history checkpoints survive failed lookup and resume without skipping gaps`,()=>use(async f=>{
  f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent));f.setHead(1110);f.provider.getTransactionCount=async()=>5;
  const original=f.provider.getBlock,calls=[];let breakAt=31;
  f.provider.getBlock=async(n,full)=>{if(full){calls.push(n);if(n===breakAt)throw new Error('gap');}return original(n,full);};
  await assert.rejects((await f.newSession()).recover(),{code:'BB_ETH_READ_FAILED'});assert(calls.includes(30));calls.length=0;breakAt=-1;
  await assert.rejects((await f.newSession({timeoutMs:20000})).recover(),{code:'BB_ETH_RECOVERY_REQUIRED'});assert.equal(calls[0],31);assert.equal(calls.at(-1),1110);assert.equal(f.requests.length,1);
 }));
}
test('Ethereum lookup retains ownership until its provider completes',async t=>{
 const store=new Map(),storage={read:async k=>store.get(k)??null,compareAndSwap:async(k,old,next)=>{assert.equal(store.get(k)??null,old);store.set(k,next);}};
 const f=fixture(storage);f.mode('reject');await assert.rejects((await f.newSession()).send(f.intent));const held=Promise.withResolvers(),entered=Promise.withResolvers();f.provider.getNetwork=()=>{entered.resolve();return held.promise;};
 t.mock.timers.enable({apis:['setTimeout']});let settled=false;
 const result=(await f.newSession({timeoutMs:10})).recover().finally(()=>{settled=true;});
 await entered.promise;t.mock.timers.tick(60000);await Promise.resolve();assert.equal(settled,false);
 held.reject(Object.assign(Error('unavailable'),{code:'NETWORK_ERROR'}));await assert.rejects(result,{code:'BB_ETH_READ_FAILED',providerCode:'NETWORK_ERROR',ethereumStage:'read'});
});
test('wallet approval remains pending until wallet responds, regardless of elapsed time',async t=>{
 const values=new Map(),storage={read:async key=>values.get(key)??null,compareAndSwap:async(key,before,after)=>{assert.equal(values.get(key)??null,before);values.set(key,after);}};
 const f=fixture(storage),entered=Promise.withResolvers(),gate=Promise.withResolvers(),send=f.options.signer.sendTransaction;
 f.options.signer.sendTransaction=async request=>{entered.resolve();await gate.promise;return send(request);};
 const journal=await f.newSession();let settled=false;t.mock.timers.enable({apis:['setTimeout']});
 const pending=journal.send(f.intent).finally(()=>{settled=true;});await entered.promise;t.mock.timers.tick(3600000);await Promise.resolve();assert.equal(settled,false);assert.equal(f.requests.length,0);
 gate.resolve();assert.equal((await pending).outcome,'success');assert.equal(f.requests.length,1);
});
test('fee preflight callback failure is definitely unsent and cannot alter payment routing',async()=>{
 const values=new Map(),storage={read:async key=>values.get(key)??null,compareAndSwap:async(key,before,after)=>{assert.equal(values.get(key)??null,before);values.set(key,after);}};
 const f=fixture(storage);
 for(const prepareRequest of [async()=>{throw Object.assign(Error('private provider detail'),{code:'NETWORK_ERROR'});},async()=>({to:addr()})]){
  await assert.rejects((await f.newSession({prepareRequest})).send(f.intent),{code:'BB_ETH_PREFLIGHT_FAILED',ethereumStage:'preflight'});
  assert.equal(f.requests.length,0);await (await f.newSession()).assertCanStart();
 }
});
