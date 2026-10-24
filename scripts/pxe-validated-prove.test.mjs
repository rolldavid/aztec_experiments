import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Gas,GasSettings} from '@aztec-labs/stdlib/gas';
import {PrivateKernelTailCircuitPublicInputs,PartialPrivateTailPublicInputsForPublic} from '@aztec-labs/stdlib/kernel';
import {PrivateSimulationResult,TxProvingResult} from '@aztec-labs/stdlib/tx';
import {validatedPxeProve,validatedKernelProve} from './pxe-validated-prove.mjs';
const pxeSource=await fs.readFile(new URL('../node_modules/@aztec-labs/pxe/dest/pxe.js',import.meta.url),'utf8');
const kernelSource=await fs.readFile(new URL('../node_modules/@aztec-labs/pxe/dest/private_kernel/private_kernel_execution_prover.js',import.meta.url),'utf8');
const pxe=validatedPxeProve(pxeSource),kernel=validatedKernelProve(kernelSource);
const nativeTimingBindings=vm.runInNewContext(pxe.slice(0,pxe.indexOf("import "))+';({beginRollingProofSpan,measureRollingProofPhase})',{performance});
// Resolve the enum through the transformed module's real import declaration.
// Supplying it independently to the extracted-method harness would hide a
// missing production binding after an otherwise successful expensive proof.
const kindImport=pxe.match(/^import \{CircuitKind\} from '([^']+)';$/m);
assert.ok(kindImport,'Transformed PXE must import the enum used by its timing aggregation');
const {CircuitKind}=await import('data:text/javascript,'+encodeURIComponent(`import {CircuitKind} from ${JSON.stringify(import.meta.resolve(kindImport[1]))};export {CircuitKind};`));
function method(source,start,end){const a=source.indexOf(start);assert.ok(a>=0);const b=source.indexOf(end,a);assert.ok(b>a);return source.slice(a,b);}
const Timer=class{ms(){return 0;}};
function inputs(){const value=PrivateKernelTailCircuitPublicInputs.empty();value.forRollup=undefined;value.forPublic=PartialPrivateTailPublicInputsForPublic.empty();value.forPublic.nonRevertibleAccumulatedData.nullifiers[0]=new Fr(1);value.feePayer=AztecAddress.fromFieldUnsafe(new Fr(2));return value;}
function kernelHarness(){
 const calls=[],tail=inputs(),output={publicInputs:{feePayer:tail.feePayer,minRevertibleSideEffectCounter:0},verificationKey:{keyAsBytes:Buffer.alloc(0)},outputWitness:new Map(),bytecode:Buffer.alloc(0)};
 const text=method(kernel,'async proveWithKernels(', '\n    /**');
 const Class=vm.runInNewContext(`(class {
  fakeProofs=false;maxBatchSize=1;log={info(){},debug(){}};oracle={};
  proofCreator={generateResetTailOutput:async()=>{calls.push('tail');return {...output,publicInputs:tail};},generateHidingToPublicOutput:async()=>{calls.push('hiding');return output;},createChonkProof:async()=>{calls.push('proof');return {removePublicInputs:()=> 'proof'};}};
  prefetchUpdatedClassIdHints=async()=>new Map();consumeNextApp=async stack=>stack.pop();
  runBatchedKernel=async()=>{calls.push('kernel');return output;};getVkData=async()=>({});ensurePublicInputsMatch=()=>calls.push('verify-proof');
  ${text}
 })`,{...nativeTimingBindings,calls,tail,output,Timer,NULL_SIMULATE_OUTPUT:output,CircuitKind:{Kernel:1,HidingKernel:2},PrivateKernelTailCircuitPublicInputs,
 collectNoteHashNullifierCounterMap:()=>new Map(),getFinalMinRevertibleSideEffectCounter:()=>0,
 BatchPlanner:class{decideBatchSize(){return 1;}},PrivateKernelResetPrivateInputsBuilder:class{needsReset(){return true;}async build(){return {}; }},
 PaddedSideEffectAmounts:{empty:()=>({})},computeTxExpirationTimestamp:()=>0n,PrivateKernelResetTailCircuitPrivateInputs:class{isForPublic(){return true;}},HidingKernelToPublicPrivateInputs:class{}});
 return {instance:new Class(),tail,calls,execution:{entrypoint:{},publicFunctionCalldata:[1]}};
}
test('real native kernel orchestration validates detached output once before proof generation',async()=>{
 const h=kernelHarness(),original=h.tail.toBuffer();
 await h.instance.proveWithKernels({},h.execution,{simulate:false,skipFeeEnforcement:false,profileMode:'none',beforeProof:async value=>{h.calls.push('validate');assert.notEqual(value,h.tail);value.feePayer=AztecAddress.ZERO;}});
 assert.deepEqual(h.calls,['kernel','tail','hiding','validate','proof','verify-proof']);assert.ok(h.tail.toBuffer().equals(original));
});
test('failed validation stops native kernel orchestration before expensive proof',async()=>{
 const h=kernelHarness();await assert.rejects(h.instance.proveWithKernels({},h.execution,{simulate:false,skipFeeEnforcement:false,profileMode:'none',beforeProof:async()=>{h.calls.push('validate');throw Error('revert');}}),/revert/);
 assert.deepEqual(h.calls,['kernel','tail','hiding','validate']);
});
function pxeHarness(failure,executionSteps=[],gates={}){
 const calls=[],publicInputs=inputs(),execution={entrypoint:{taggingIndexRanges:[],contractClassLogs:[],nestedExecutionResults:[]},publicFunctionCalldata:[]};
 const request={txContext:{gasSettings:GasSettings.empty()}};
 const ctx={changeSetId:3,syncTime:0,anchorBlockHeader:{},recording:{stats:()=>({})},totalMs:()=>0};
 const prove=method(pxe,'proveTx(txRequest, { scopes','\n    /**');
 const privateProve=method(pxe,'async #proveTx(', '\n    // Validate actual');
 const validate=method(pxe,'async #validateKernelPublicInputs(', '\n    // Public API');
 const Class=vm.runInNewContext(`(class {
  operationQueue={runSynced:async work=>{calls.push('queue');try{const result=await work(ctx);calls.push('commit');return result;}catch(e){calls.push('discard');throw e;}}};
  log={debug(){}};senderTaggingStore={};node={isValidTx:async(tx,opts)=>{calls.push('validate');await gates.validate?.();assert.equal(opts.isSimulation,true);assert.equal(opts.skipFeeEnforcement,false);return {result:failure==='invalid'?'invalid':'valid'};}};
  #executeUtility=async()=>{};#getSimulatorForTx=()=>({});#executePrivate=async()=>{calls.push('private');return execution;};
  #simulatePublicCalls=async(tx,skipFee)=>{calls.push('public');await gates.public?.();assert.equal(skipFee,false);return {txEffect:{revertCode:{isOK:()=>failure!=='revert'}},gasUsed:{totalGas:failure==='gas'?new Gas(2**32-1,2**32-1):Gas.empty(),teardownGas:Gas.empty()}};};
  #prove=async(_request,_creator,_execution,_anchor,config)=>{calls.push('kernel');await config.beforeProof?.(publicInputs);calls.push('proof');return {publicInputs,chonkProof:{},executionSteps};};
  ${prove}
  ${privateProve}
  ${validate}
 })`,{...nativeTimingBindings,calls,ctx,assert,request,publicInputs,execution,executionSteps,CircuitKind,failure,gates,Gas,Timer,PrivateSimulationResult,TxProvingResult,inspect:()=>'',persistSenderTaggingIndexRangesForTx:async()=>calls.push('tags')});
 return {instance:new Class(),request,calls};
}
test('native PXE validates actual kernel output inside one queue operation, then proves and persists tags',async()=>{
 const h=pxeHarness();await h.instance.proveTxWithPublicValidation(h.request,{scopes:[]});assert.deepEqual(h.calls,['queue','private','kernel','public','validate','proof','tags','commit']);
});
test('native proof aggregates use circuit kinds, preserve existing totals and execute no extra stages',async()=>{
 const steps=[{kind:CircuitKind.App,functionName:'private_kernel_reset',timings:{witgen:11}},
 {kind:CircuitKind.Kernel,functionName:'private-secret',timings:{witgen:7}},
 {kind:CircuitKind.HidingKernel,functionName:'private-secret-2',timings:{witgen:3}}];
 const h=pxeHarness(undefined,steps),proven=await h.instance.proveTxWithPublicValidation(h.request,{scopes:[]});
 assert.equal(proven.stats.timings.privateWitness,11);assert.equal(proven.stats.timings.kernelWitness,10);
 assert.equal(proven.stats.timings.unaccounted,-21,'new numeric aggregates are not subtracted again');
 assert.deepEqual(h.calls,['queue','private','kernel','public','validate','proof','tags','commit']);
});
for(const failure of ['revert','gas','invalid'])test('native PXE '+failure+' discards before proof or tag persistence',async()=>{
 const h=pxeHarness(failure);await assert.rejects(h.instance.proveTxWithPublicValidation(h.request,{scopes:[]}));
 assert.deepEqual(h.calls,['queue','private','kernel','public','validate','discard']);
});
test('native opt-in preserves the existing proof-only API',async()=>{
 const h=pxeHarness();await h.instance.proveTx(h.request,{scopes:[]});assert.deepEqual(h.calls,['queue','private','kernel','proof','tags','commit']);
});
test('exact native source pins reject changed dependencies',()=>{assert.throws(()=>validatedPxeProve(pxeSource+'\n'),/source mismatch/);assert.throws(()=>validatedKernelProve(kernelSource+'\n'),/source mismatch/);});
test('complete transformed PXE loads with its real module bindings',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pxe-timing-import-'));
 const original=await fs.realpath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url));
 try{
  await fs.mkdir(path.join(directory,'dest'));
  for(const name of await fs.readdir(original))if(!['dest','node_modules'].includes(name))await fs.symlink(path.join(original,name),path.join(directory,name));
  await fs.symlink(await fs.realpath(new URL('../node_modules',import.meta.url)),path.join(directory,'node_modules'));
  for(const name of await fs.readdir(path.join(original,'dest')))if(name!=='pxe.js')await fs.symlink(path.join(original,'dest',name),path.join(directory,'dest',name));
  const target=path.join(directory,'dest','pxe.js');await fs.writeFile(target,pxe);
  const loaded=await import(pathToFileURL(target));assert.equal(typeof loaded.PXE,'function');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

for(const failure of [null,'public','validate'])test(`public execution and admission ${failure??'succeed'} concurrently and drain before proof`,async()=>{
 const gates=[Promise.withResolvers(),Promise.withResolvers()],entered=Promise.withResolvers(),error=Error('Exact validation failure');let count=0,settled=false;
 const wait=index=>async()=>{if(++count===2)entered.resolve();await gates[index].promise;if((failure==='public'?0:failure==='validate'?1:-1)===index)throw error;};
 const h=pxeHarness(undefined,[],{public:wait(0),validate:wait(1)});
 const proving=h.instance.proveTxWithPublicValidation(h.request,{scopes:[]}).finally(()=>{settled=true;});const observed=failure?assert.rejects(proving,e=>e===error):proving;
 await entered.promise;assert.equal(count,2);assert(!h.calls.includes('proof'));assert(!h.calls.includes('tags'));
 gates[failure==='validate'?1:0].resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert(!h.calls.includes('discard'));
 gates[0].resolve();gates[1].resolve();await observed;
 assert.equal(h.calls.includes('proof'),!failure);assert.equal(h.calls.includes('tags'),!failure);assert.equal(h.calls.at(-1),failure?'discard':'commit');
});

const syncBindings={};
for(const line of pxe.split('\n').filter(line=>/^import .* as (Sync|sync)/.test(line))){
 const match=line.match(/^import \{(.+)\} from '([^']+)';$/);assert(match);
 const module=await import(match[2]);for(const item of match[1].split(',')){const [name,alias]=item.trim().split(' as ');syncBindings[alias??name]=module[name];}
}
const {DefaultAccountEntrypoint}=await import('@aztec-labs/entrypoints/account');
const {FunctionCall,FunctionSelector}=await import('@aztec-labs/stdlib/abi');
const {AuthWitness}=await import('@aztec-labs/stdlib/auth-witness');
const {ExecutionPayload}=await import('@aztec-labs/stdlib/tx');
const {allToCompletion}=await import('@aztec-labs/foundation/promise');
const {ContractSyncService}=await import('../node_modules/@aztec-labs/pxe/dest/contract/contract_sync_service.js');
const {ContractClassService}=await import('../node_modules/@aztec-labs/pxe/dest/contract/contract_class_service.js');
const {withCache}=await import('../node_modules/@aztec-labs/pxe/dest/node/caching_aztec_node.js');
const {BlockHash}=await import('@aztec-labs/stdlib/block');
const {ORDINARY_POST_GAS_PROFILE:syncProfile}=await import('../shared/ordinary-post-fees.mjs');
async function ordinarySyncFixture(){
 const owner=AztecAddress.fromFieldUnsafe(new Fr(100)),fee=AztecAddress.fromFieldUnsafe(new Fr(200)),board=AztecAddress.fromFieldUnsafe(new Fr(300));
 const calls=[FunctionCall.from({name:'pay_fee',to:fee,selector:FunctionSelector.fromString('0xc8772dde'),type:'private',hideMsgSender:false,isStatic:false,args:[new Fr(5)]}),FunctionCall.from({name:'post',to:board,selector:FunctionSelector.fromString(syncProfile.postSelector),type:'private',hideMsgSender:false,isStatic:false,args:[new Fr(6)]})];
 const entrypoint=new DefaultAccountEntrypoint(owner,{createAuthWit:async hash=>new AuthWitness(hash,[])});
 const request=await entrypoint.createTxExecutionRequest(new ExecutionPayload(calls,[],[],[],fee),GasSettings.empty(),{chainId:new Fr(31337),version:new Fr(1)},{txNonce:new Fr(7),cancellable:false,feePaymentMethodOptions:0});
 const classes=new Map([[owner.toString(),syncProfile.accountClassId],[fee.toString(),syncProfile.privateFeeClassId],[board.toString(),syncProfile.boardClassId]]),events=[],pending=[];
 let hold=false,failAddress=null;
 const anchorBlockHeader={toBlockParameter:async()=>({number:3,hash:BlockHash.fromString('0x'+'3'.padStart(64,'0'))})};
 const node=withCache({getContract:async(address,anchor)=>{events.push(['class',address.toString(),anchor]);return {currentContractClassId:Fr.fromString(classes.get(address.toString()))};}});
 const store={getContractInstance:async()=>assert.fail('All classes served by canonical fixture'),getFunctionCall:async(name,args,address)=>({name,args,to:address,selector:FunctionSelector.fromString('0x418ef5da')})};
 const classService=new ContractClassService(node,store);
 const noteStore={getNotes:async(_filter,id)=>{assert.equal(id,42);return [];}};
 const service=new ContractSyncService(node,store,classService,noteStore,{debug(){},warn(){}},{concurrentContractSyncEnabled:false});
 const ctx={changeSetId:42,anchorBlockHeader},scopes=[owner],simulator={identity:'same'};
 const utility=async(sim,call,auth,actualScopes,anchor,id)=>{
  assert.equal(sim,simulator);assert.equal(anchor,anchorBlockHeader);assert.equal(id,42);assert.deepEqual(actualScopes,scopes);assert.equal(auth.length,0);
  events.push(['sync-start',call.to.toString()]);if(hold)await new Promise((resolve,reject)=>pending.push({address:call.to.toString(),resolve,reject}));
  if(call.to.toString()===failAddress)throw Error('native sync failed');events.push(['sync-finish',call.to.toString()]);
 };
 const text=method(pxe,'async #syncOrdinaryPostCalls(', '\n    // Public API');
 const Class=vm.runInNewContext(`(class {contractClassService=classService;contractSyncService=service;#executeUtility=utility;${text}
 async run(){try{await this.#syncOrdinaryPostCalls(request,calls,simulator,ctx,scopes);await service.settle(ctx.changeSetId);events.push(['private-ready']);service.onOperationEnd(ctx.changeSetId,'committed');}catch(error){await service.settle(ctx.changeSetId);service.onOperationEnd(ctx.changeSetId,'discarded');events.push(['discard']);throw error;}}
 })`,{...nativeTimingBindings,...syncBindings,classService,service,utility,request,calls,simulator,ctx,scopes,events,allToCompletion});
 return {run:()=>new Class().run(),request,calls,events,pending,classes,hold:()=>{hold=true;},fail:address=>{failAddress=address;},owner,fee,board,service};
}
test('exact native account payload pre-syncs three known contracts concurrently in one change set without learned predictions',async()=>{
 const f=await ordinarySyncFixture();f.hold();const work=f.run();
 for(let i=0;i<50&&f.pending.length<3;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.pending.length,3);assert.equal(f.events.filter(e=>e[0]==='private-ready').length,0);
 f.pending.splice(0).forEach(p=>p.resolve());await work;
 assert.equal(f.events.filter(e=>e[0]==='class').length,3,'native cache serves syncScope class checks');
 assert.equal(f.events.filter(e=>e[0]==='sync-start').length,3);await f.run();
 assert.equal(f.events.filter(e=>e[0]==='sync-start').length,3,'normal repeated sync is deduplicated by native service');
});
test('a native contract sync failure drains peers before discarding staged writes and never proceeds to private execution',async()=>{
 const f=await ordinarySyncFixture();f.hold();const work=f.run();let settled=false;void work.catch(()=>{settled=true;});
 for(let i=0;i<50&&f.pending.length<3;i++)await new Promise(resolve=>setImmediate(resolve));
 f.pending[0].reject(Error('native sync failed'));await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert(!f.events.some(e=>e[0]==='discard'));
 f.pending.slice(1).forEach(p=>p.resolve());await assert.rejects(work,/native sync failed/);assert.equal(f.events.at(-1)[0],'discard');assert(!f.events.some(e=>e[0]==='private-ready'));
});
for(const mismatch of ['address','selector','args','class','entrypoint','extra-call','hash'])test('ordinary pre-sync rejects '+mismatch+' before any contract sync',async()=>{
 const f=await ordinarySyncFixture();
 if(mismatch==='address')f.calls[1].to=AztecAddress.fromFieldUnsafe(new Fr(301));
 if(mismatch==='selector')f.calls[1].selector=FunctionSelector.fromString('0x00000001');
 if(mismatch==='args')f.calls[1].args[0]=new Fr(66);
 if(mismatch==='class')f.classes.set(f.board.toString(),new Fr(99).toString());
 if(mismatch==='entrypoint')f.request.functionSelector=FunctionSelector.fromString('0x00000001');
 if(mismatch==='extra-call')f.calls.push(f.calls[1]);
 if(mismatch==='hash')f.request.firstCallArgsHash=new Fr(99);
 await assert.rejects(f.run());assert(!f.events.some(e=>e[0]==='sync-start'));assert(!f.events.some(e=>e[0]==='private-ready'));
});

test('queued prove request detaches known call fields before yielding and supplies the same native operation context',async()=>{
 const f=await ordinarySyncFixture(),original=f.calls[1].args[0].toString(),seen=[];let release;
 const wait=new Promise(resolve=>{release=resolve;}),context={anchorBlockHeader:{},changeSetId:81};
 const text=method(pxe,'proveTx(txRequest, { scopes','\n    /**');
 const Class=vm.runInNewContext(`(class {
 operationQueue={runSynced:async work=>{await wait;return work(context);}};
 #getSimulatorForTx=()=>({});#executePrivate=async value=>{seen.push(['private',value]);return {};};
 #syncOrdinaryPostCalls=async(...values)=>{seen.push(['sync',...values]);};
 #proveTx=async()=>{seen.push(['proof']);return 'done';};
 ${text}
 })`,{...nativeTimingBindings,...syncBindings,seen,wait,context,inspect:()=>''});
 const instance=new Class(),scopes=[f.owner],work=instance.proveTx(f.request,{scopes,validatePublic:true,preSyncCalls:f.calls});
 f.calls[1].args[0]=new Fr(999);f.calls[1].to=AztecAddress.ZERO;release();assert.equal(await work,'done');
 assert.equal(seen[0][0],'sync');assert.equal(seen[0][2][1].args[0].toString(),original);assert(seen[0][2][1].to.equals(f.board));assert.equal(seen[0][4],context);assert.equal(seen[0][5],scopes);
 assert.deepEqual(seen.map(entry=>entry[0]),['sync','private','proof']);
 assert.throws(()=>instance.proveTx(f.request,{scopes,preSyncCalls:f.calls}),/Invalid ordinary sync payload/);
});

test('captured-anchor read enters through the existing native operation queue',async()=>{
 const {OperationQueue}=await import('../node_modules/@aztec-labs/pxe/dest/operation_queue.js');
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop(){}})},synchronizer:{},anchorBlockStore:{getBlockHeader:async()=>({})},contributors:[],stagedWriteCoordinator:{begin:()=>1,commit:async()=>{},abort(){}},log:{debug(){},verbose(){},warn(){}}});queue.start();
 const text=method(pxe,'syncWithAnchorRead(read) {','\n    /**');
 const Class=vm.runInNewContext(`(class {${text}})`);const instance=new Class();instance.operationQueue=queue;
 const gate=Promise.withResolvers();let calls=0;const reader=()=>{};
 instance.blockStateSynchronizer={syncWithAnchorRead:async fn=>{calls++;assert.equal(fn,reader);return {anchor:'native',value:7};}};
 try{const prior=queue.run(()=>gate.promise),pending=instance.syncWithAnchorRead(reader);await new Promise(r=>setImmediate(r));assert.equal(calls,0);gate.resolve();await prior;assert.deepEqual(await pending,{anchor:'native',value:7});assert.equal(calls,1);}
 finally{await queue.stop();}
});
