import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {PerformanceObserver} from 'node:perf_hooks';
import {TxHash,MinedTxReceipt} from '@aztec-labs/stdlib/tx';
import {waitForSuccessfulReceipt} from '../shared/transaction-outcomes.mjs';
import {projectRollingTransactionProgress} from '../apps/rolling/wallet-session.mjs';
import {createRollingWorkerClient} from '../apps/rolling/wallet-worker-client.mjs';
import {observeRollingPerformance} from '../apps/rolling/performance.mjs';
for(const status of ['proposed','checkpointed'])test('native '+status+' receipt reaches optional profile evidence through existing worker progress',async()=>{
 const hash=TxHash.fromBigInt(10n),blockHash='0x'+'b'.repeat(64),intent='0x'+'c'.repeat(64),tx={getTxHash:()=>hash};
 const receipt=new MinedTxReceipt(hash,status,'success',0n,blockHash,42,1,0,1);
 const {port1,port2}=new MessageChannel();port1.start();port2.start();
 const observed=Promise.withResolvers(),progress=Promise.withResolvers();let reads=0,blocks=0;
 const stop=observeRollingPerformance({PerformanceObserver,onEntries(entries){const value=entries.find(x=>x.kind==='inclusion'&&x.status===status);if(value)observed.resolve(value);}});
 const client=createRollingWorkerClient({profile:true,worker:{postMessage:v=>port1.postMessage(v),addEventListener:(...args)=>port1.addEventListener(...args),terminate(){port1.close();port2.close();}},onProgress:value=>progress.resolve(value)});
 try{
  await waitForSuccessfulReceipt({getTxReceipt:async()=>{reads++;return receipt;},getBlock:async()=>{blocks++;return {hash:blockHash};}},tx,{confirmationTier:'proposed',onIncluded:inclusion=>{
   assert.equal(inclusion.status,status);
   port2.postMessage({type:'progress',value:projectRollingTransactionProgress('included',{...inclusion,journalOperation:'ROLLING_WORKFLOW_V1:'+intent,secret:'MUST_NOT_CROSS'})});
  }});
  const [evidence,value]=await Promise.all([observed.promise,progress.promise]);
  assert.deepEqual(value,{stage:'included',intentId:intent,txHash:hash.toString(),blockNumber:42,blockHash,status});
  assert.deepEqual({...evidence,start:0},{name:'rolling.transaction.inclusion',start:0,duration:0,kind:'inclusion',source:'native-receipt',txHash:hash.toString(),blockNumber:42,blockHash,status});
  assert(!JSON.stringify(evidence).includes(intent));assert(!JSON.stringify(evidence).includes('MUST_NOT_CROSS'));
  assert.equal(reads,1);assert.equal(blocks,1);
 }finally{stop();client.terminate();performance.clearMeasures('rolling.transaction.inclusion');}
});
test('progress projection never reads a status accessor or forwards unknown status',()=>{
 const details={txHash:'0x'+'a'.repeat(64),blockNumber:42,blockHash:'0x'+'b'.repeat(64),journalOperation:'ROLLING_WORKFLOW_V1:1',get status(){assert.fail('Accessor invoked');}};
 assert(!Object.hasOwn(projectRollingTransactionProgress('included',details),'status'));
 assert(!Object.hasOwn(projectRollingTransactionProgress('included',{...Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(details)).filter(([k])=>k!=='status').map(([k,v])=>[k,v.value])),status:'dropped'}),'status'));
});
