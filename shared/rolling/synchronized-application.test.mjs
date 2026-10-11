// Installed operation queue, controlled block store and notes: no real-chain acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {OperationQueue} from '../../node_modules/@aztec-labs/pxe/dest/operation_queue.js';
import {createSynchronizedRollingApplication} from './synchronized-application.mjs';
const names=['readAccountStatus','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile'];
test('explicit synchronization exposes a newly included name through the actual autoSync:false SDK queue',async()=>{
 let anchor=14,head=14,closed=0,syncs=0;
 const synchronizer={sync:async()=>{syncs++;anchor=head;}};
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop:()=>closed++})},synchronizer,
  anchorBlockStore:{getBlockHeader:async()=>({number:anchor})},contributors:[],
  stagedWriteCoordinator:{begin:()=>1,commit:async()=>{},abort:()=>{}},log:{verbose(){},warn(){}}});queue.start();
 try{
  const raw=Object.fromEntries(names.map(name=>[name,()=>queue.runSynced(({anchorBlockHeader})=>({identities:anchorBlockHeader.number>=15?['registered-name']:[]}))]));
  head=15;assert.deepEqual((await raw.ownedIdentities()).identities,[]);
  const application=createSynchronizedRollingApplication({application:raw,synchronize:()=>queue.run(()=>synchronizer.sync()),contextGuard:()=>{}});
  assert.deepEqual((await application.ownedIdentities()).identities,['registered-name']);assert.equal(syncs,1);assert.equal(closed,2);
 }finally{await queue.stop();}
});
test('failed synchronization and context changes prevent every private operation without retry',async()=>{
 for(const name of names)for(const failure of ['before','sync','after']){
  let guards=0,syncs=0,calls=0;const error=Error(failure);
  const application=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(n=>[n,()=>{calls++;}])),
   contextGuard:()=>{guards++;if(failure==='before'||failure==='after'&&guards===2)throw error;},
   synchronize:()=>{syncs++;if(failure==='sync')throw error;}});
  await assert.rejects(application[name](),value=>value===error);assert.equal(calls,0);assert.equal(syncs,failure==='before'?0:1);
 }
});
test('capabilities and method receivers are captured before asynchronous synchronization',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),order=[];
 const raw=Object.fromEntries(names.map(name=>[name,function(...args){assert.equal(this,raw);order.push('call');return args;}]));
 const options={application:raw,contextGuard:()=>order.push('guard'),synchronize:()=>{order.push('sync');return gate;}};
 const application=createSynchronizedRollingApplication(options),pending=application.prepare('exact-intent');
 await Promise.resolve();raw.prepare=()=>assert.fail('replacement');options.contextGuard=()=>assert.fail('replacement');options.synchronize=()=>assert.fail('replacement');
 release();assert.deepEqual(await pending,['exact-intent']);assert.deepEqual(order,['guard','sync','guard','call']);assert(Object.isFrozen(application));
});
