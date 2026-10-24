// Installed operation queue, controlled block store and notes: no real-chain acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {OperationQueue} from '../../node_modules/@aztec-labs/pxe/dest/operation_queue.js';
import {createSynchronizedRollingApplication} from './synchronized-application.mjs';
const names=['readWithdrawalReadiness','readBokAccounting','readBalances','readWithdrawal','readModeratorStatus','readBokStatus','prepareBokPost','prepareBokRelease','readAccountStatus','readPreferenceHead','readProfile','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile','inspectRecovery','prepareReplacement','prepareInterrupted','resumeSaved'];
test('explicit synchronization exposes a newly included name through the actual autoSync:false SDK queue',async()=>{
 let anchor=14,head=14,closed=0,syncs=0;
 const synchronizer={sync:async()=>{syncs++;anchor=head;}};
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop:()=>closed++})},synchronizer,
  anchorBlockStore:{getBlockHeader:async()=>({number:anchor})},contributors:[],
  stagedWriteCoordinator:{begin:()=>1,commit:async()=>{},abort:()=>{}},log:{debug(){},verbose(){},warn(){}}});queue.start();
 try{
  const raw=Object.fromEntries(names.map(name=>[name,()=>queue.runSynced(({anchorBlockHeader})=>({identities:anchorBlockHeader.number>=15?['registered-name']:[]}))]));
  head=15;assert.deepEqual((await raw.ownedIdentities()).identities,[]);
  const application=createSynchronizedRollingApplication({application:raw,synchronize:()=>queue.run(()=>synchronizer.sync()),contextGuard:()=>{}});
  assert.deepEqual((await application.ownedIdentities()).identities,['registered-name']);assert.equal(syncs,1);assert.equal(closed,2);
 }finally{await queue.stop();}
});
test('failed synchronization and context changes prevent every private operation without retry',async()=>{
 for(const name of names.filter(name=>name!=='readModeratorStatus'))for(const failure of ['before','sync','after']){
  let guards=0,syncs=0,calls=0;const error=Error(failure);
  const application=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(n=>[n,()=>{calls++;}])),
   contextGuard:()=>{guards++;if(failure==='before'||failure==='after'&&guards===2)throw error;},
   synchronize:()=>{syncs++;if(failure==='sync')throw error;}});
  await assert.rejects(application[name](...(name==='resumeSaved'?['intent',{expectedTxHash:'0x'+'11'.repeat(32)}]:name==='prepareBokRelease'?['intent',{type:'cancel-bok-request'}]:[])),value=>value===error);assert.equal(calls,0);assert.equal(syncs,failure==='before'?0:1);
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
test('preference head observes the synchronized anchor through the supported operation queue',async()=>{
 let anchor=14,head=15,syncs=0,reads=0;
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop(){}})},synchronizer:{},
  anchorBlockStore:{getBlockHeader:async()=>({number:anchor})},contributors:[],
  stagedWriteCoordinator:{begin:()=>1,commit:async()=>{},abort:()=>{}},log:{debug(){},verbose(){},warn(){}}});queue.start();
 try{
  const raw=Object.fromEntries(names.map(name=>[name,()=>{}]));
  raw.readPreferenceHead=()=>queue.runSynced(({anchorBlockHeader})=>{reads++;return {initialized:true,schema:1,revision:anchorBlockHeader.number>=15?'2':'1',digest:anchorBlockHeader.number>=15?'22':'11'};});
  const application=createSynchronizedRollingApplication({application:raw,synchronize:()=>queue.run(()=>{syncs++;anchor=head;}),contextGuard:()=>{}});
  assert.equal((await raw.readPreferenceHead()).revision,'1');assert.equal((await application.readPreferenceHead()).revision,'2');
  assert.equal(reads,2);assert.equal(syncs,1);
 }finally{await queue.stop();}
});

test('saved resume options are captured before synchronization without invoking accessors',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),hash='0x'+'11'.repeat(32),input={expectedTxHash:hash};
 const raw=Object.fromEntries(names.map(name=>[name,(...args)=>args]));
 const application=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},synchronize:()=>gate});
 const pending=application.resumeSaved('intent',input);await Promise.resolve();input.expectedTxHash='0x'+'22'.repeat(32);release();
 assert.deepEqual(await pending,['intent',{expectedTxHash:hash}]);
 let reads=0,calls=0;const guarded=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{calls++;},synchronize:()=>{calls++;}});
 await assert.rejects(guarded.resumeSaved('intent',{get expectedTxHash(){reads++;throw Error('PRIVATE_SENTINEL');}}),{code:'ROLLING_INVALID_ACTION'});
 assert.equal(reads,0);assert.equal(calls,0);
});
test('RC22 balance cursor is captured before synchronization and accessor input is never evaluated',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),input={cursor:'original-page'};
 const raw=Object.fromEntries(names.map(name=>[name,(...args)=>args]));const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},synchronize:()=>gate});
 const pending=app.readBalances(input);input.cursor='replacement';release();assert.deepEqual(await pending,[{cursor:'original-page'}]);
 let reads=0;await assert.rejects(app.readBalances({get cursor(){reads++;return 0;}}),{code:'ROLLING_BALANCE_CURSOR_INVALID'});assert.equal(reads,0);
});

test('interrupted Bok release captures exact id and action before synchronization without getters or extra fields',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),input={type:'cancel-bok-request'};
 const raw=Object.fromEntries(names.map(name=>[name,(...args)=>args]));
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},synchronize:()=>gate});
 const pending=app.prepareBokRelease('original-intent',input);input.type='expire-bok-request';release();
 assert.deepEqual(await pending,['original-intent',{type:'cancel-bok-request'}]);
 let reads=0,syncs=0;const guarded=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{syncs++;},synchronize:()=>{syncs++;}});
 for(const bad of [{get type(){reads++;return 'cancel-bok-request';}},{type:'expire-bok-request',requestId:'other'},{type:'post'},Object.create({type:'cancel-bok-request'})])await assert.rejects(guarded.prepareBokRelease('original-intent',bad),{code:'ROLLING_INVALID_ACTION'});
 assert.equal(reads,0);assert.equal(syncs,0);
});

test('one flow reuses its anchor and refreshes after its own confirmed transaction',async()=>{
 let scope={synchronized:false},syncs=0,guards=0,calls=0;
 const raw=Object.fromEntries(names.map(name=>[name,async()=>{calls++;return {status:name==='submitPrepared'?'confirmed':'prepared'};}]));
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{guards++;},synchronize:()=>{syncs++;},operationScope:()=>scope});
 await app.readAccountStatus();await app.prepare({type:'post'});await app.submitPrepared('id');assert.equal(syncs,1);
 await app.readAccountStatus();assert.equal(syncs,2);assert.equal(calls,4);assert.equal(guards,8);
 scope={synchronized:false};await app.readAccountStatus();assert.equal(syncs,3);
});
test('public moderator identity does not synchronize private state',async()=>{
 const raw=Object.fromEntries(names.map(name=>[name,async()=>({authorized:true})]));let guards=0;
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{guards++;},synchronize:()=>assert.fail('public identity has no private anchor')});
 assert.deepEqual(await app.readModeratorStatus(),{authorized:true});assert.equal(guards,2);
});

for(const failure of [null,'sync','context'])test(`parallel readiness and synchronization ${failure??'succeed'} drain before private application`,async()=>{
 const scope={},gates=[Promise.withResolvers(),Promise.withResolvers()],entered=Promise.withResolvers(),error=Error('Exact failure');let started=0,calls=0,settled=false;
 const work=index=>async()=>{if(++started===2)entered.resolve();await gates[index].promise;if((failure==='sync'?0:failure==='context'?1:-1)===index)throw error;};
 const app=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(name=>[name,()=>{calls++;return 'ready';}])),contextGuard:()=>{},operationScope:()=>scope,synchronize:work(0),prepareContext:work(1)});
 const result=app.prepare({type:'post'}).finally(()=>{settled=true;});const observed=failure?assert.rejects(result,e=>e===error):result;
 await entered.promise;assert.equal(started,2);assert.equal(calls,0);
 gates[failure==='context'?1:0].resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert.equal(scope.synchronized,undefined);
 gates[0].resolve();gates[1].resolve();await observed;assert.equal(calls,failure?0:1);assert.equal(scope.synchronized,failure?undefined:true);
});
test('prefetched readiness is scoped to the held operation and replacement ownership rejects before application',async()=>{
 let scope={},contexts=0,syncs=0,calls=0;const gate=Promise.withResolvers(),entered=Promise.withResolvers();
 const raw=Object.fromEntries(names.map(name=>[name,()=>{calls++;}]));
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},operationScope:()=>scope,synchronize:async()=>{syncs++;},prepareContext:async()=>{contexts++;if(contexts===2){entered.resolve();await gate.promise;}}});
 await app.prepare({type:'post'});await app.prepare({type:'post'});assert.equal(contexts,1);assert.equal(syncs,1);
 scope={};const pending=app.prepare({type:'post'});await entered.promise;scope={};gate.resolve();await assert.rejects(pending,{code:'ROLLING_CONTEXT_CHANGED'});assert.equal(calls,2);assert.equal(scope.synchronized,undefined);
});

test('only new preparation requests an overlapping predecessor observation',async()=>{
 const seen=[];let scope={};const raw=Object.fromEntries(names.map(name=>[name,()=>({})]));
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},operationScope:()=>scope,synchronize:()=>{},prepareContext:options=>seen.push(options)});
 await app.prepare({type:'post'});scope={};await app.submitPrepared('id');scope={};await app.readAccountStatus();
 assert.deepEqual(seen,[{predecessor:true},{predecessor:false},{predecessor:false}]);
});
test('only one-click ordinary posting starts payment metadata during synchronization',async()=>{
 const seen=[];let scope={preparationReads:[]};const raw=Object.fromEntries(names.map(name=>[name,()=>({})]));
 const app=createSynchronizedRollingApplication({application:raw,contextGuard:()=>{},operationScope:()=>scope,synchronize:()=>{},prepareContext:options=>seen.push(options)});
 await app.prepare({type:'post'},{immediate:true});scope={preparationReads:[]};await app.prepare({type:'bok'},{immediate:true});scope={};await app.prepare({type:'post'},{immediate:true});
 assert.deepEqual(seen,[{predecessor:true,ordinaryPayment:true},{predecessor:true},{predecessor:true}]);
});

test('captured policy read is requested only for synchronized ordinary main-board preparation',async()=>{
 for(const [input,options,wanted] of [
  [{type:'post'},{immediate:true},true],[{type:'reply',subboard:'0'},{immediate:true},true],
  [{type:'quote',subboard:'0x'+'0'.repeat(64)},{immediate:true},true],
  [{type:'repost',subboard:'2'},{immediate:true},false],[{type:'bok'},{immediate:true},false],
  [{type:'post'},undefined,false],[{type:'like'},{immediate:true},false],
 ]){
  const scope={},seen=[],raw=Object.fromEntries(names.map(name=>[name,()=>{}]));
  const app=createSynchronizedRollingApplication({application:raw,operationScope:()=>scope,contextGuard:()=>{},synchronize:options=>seen.push(options)});
  await app.prepare(input,options);assert.deepEqual(seen,[{ordinaryPolicy:wanted,ordinaryPost:Boolean(scope)&&options?.immediate===true&&['post','reply','quote','repost'].includes(input.type)}]);
 }
});

const genericBoardActions={like:'set_like',unlike:'set_like',preference:'set_preference','read-marker':'mark_thread_read',name:'register_name',bio:'set_bio',avatar:'set_avatar',subboard:'create_subboard','moderate-post':'remove_post','moderate-avatar':'remove_avatar','reject-subboard':'reject_subboard','set-main-policy':'set_main_policy','transfer-moderator':'transfer_moderator',screen:'screen',withdraw:'withdraw'};
test('known generic actions prepare exact native methods after sync; other financial/Bok/post paths remain separate',async()=>{
 for(const type of [...Object.keys(genericBoardActions),'bok','claim-bok','claim-deposit','cancel-deposit','withdraw-bok','cancel-bok-request','expire-bok-request','post']){
  const seen=[],scope={};const app=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(name=>[name,()=>seen.push('action')])),operationScope:()=>scope,contextGuard:()=>{},synchronize:()=>seen.push('sync'),prepareContractState:({method})=>seen.push(method)});
  await app.prepare({type});assert.deepEqual(seen,genericBoardActions[type]?['sync',genericBoardActions[type],'action']:['sync','action']);
 }
});
test('already synchronized preference context still prepares Board state without duplicate global sync',async()=>{
 const seen=[],scope={};const app=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(name=>[name,()=>seen.push(name)])),operationScope:()=>scope,contextGuard:()=>{},synchronize:()=>seen.push('sync'),prepareContractState:({method})=>seen.push(method)});
 await app.readPreferenceHead();await app.prepare({type:'preference'});assert.deepEqual(seen,['sync','readPreferenceHead','set_preference','prepare']);
});
for(const fail of ['discovery','scope'])test('generic preparation '+fail+' failure cannot enter application or release early',async()=>{
 const gate=Promise.withResolvers(),entered=Promise.withResolvers(),error=Error('discovery failed');let scope={},calls=0,done=false;
 const app=createSynchronizedRollingApplication({application:Object.fromEntries(names.map(name=>[name,()=>calls++])),operationScope:()=>scope,contextGuard:()=>{},synchronize:()=>{},prepareContractState:async()=>{entered.resolve();await gate.promise;if(fail==='discovery')throw error;}});
 const observed=assert.rejects(app.prepare({type:'like'}).finally(()=>done=true),fail==='discovery'?e=>e===error:{code:'ROLLING_CONTEXT_CHANGED'});await entered.promise;assert.equal(done,false);if(fail==='scope')scope={};gate.resolve();await observed;assert.equal(calls,0);
});
