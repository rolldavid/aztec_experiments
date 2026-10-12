import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PREFERENCE_PAGE_PINS,PREFERENCE_PAGE_COMPACT_PIN,transformPreferencePage,inspectPreferencePage,patchPreferencePage} from './patch-pxe-preference-page.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const installed=await realpath(join(root,'node_modules/@aztec-labs/pxe'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const source=Object.fromEntries(await Promise.all(PREFERENCE_PAGE_PINS.map(async p=>[p.path,await readFile(join(installed,p.path),'utf8')])));
async function copy(t) {
  const directory=await realpath(await mkdtemp(join(tmpdir(),'rolling-preference-page-')));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const pin of PREFERENCE_PAGE_PINS){await mkdir(join(directory,pin.path,'..'),{recursive:true});await writeFile(join(directory,pin.path),source[pin.path]);}
  return directory;
}

test('source pin is exact installed original; transformed TS and JS are exact output pins',()=>{
  for(const pin of PREFERENCE_PAGE_PINS){assert.equal(sha(source[pin.path]),pin.before);assert.equal(sha(transformPreferencePage(source[pin.path],pin.path)),pin.after);}
});
test('unknown source and already transformed source cannot be transformed again',()=>{
  for(const pin of PREFERENCE_PAGE_PINS){assert.throws(()=>transformPreferencePage(source[pin.path]+' ',pin.path),/PATCH_SOURCE/);assert.throws(()=>transformPreferencePage(transformPreferencePage(source[pin.path],pin.path),pin.path),/PATCH_SOURCE/);}
});
test('isolated complete apply, verify and repeated apply preserve exact bytes',async t=>{
  const dir=await copy(t);assert.equal((await inspectPreferencePage(dir)).state,'original');assert.equal((await patchPreferencePage(dir)).state,'patched');assert.deepEqual(await patchPreferencePage(dir),await inspectPreferencePage(dir));
});
test('mixed/unknown state rejects before changing either copied file',async t=>{
  const dir=await copy(t),[a,b]=PREFERENCE_PAGE_PINS;
  await writeFile(join(dir,b.path),'unknown');
  await assert.rejects(patchPreferencePage(dir),/PATCH_STATE/);assert.equal(await readFile(join(dir,a.path),'utf8'),source[a.path]);
  await writeFile(join(dir,b.path),source[b.path]);await writeFile(join(dir,a.path),transformPreferencePage(source[a.path],a.path));
  await assert.rejects(inspectPreferencePage(dir),/PATCH_STATE/);await assert.rejects(patchPreferencePage(dir),/PATCH_STATE/);
});
test('shared installed package and symlink target are never writable by prototype',async t=>{
  await assert.rejects(patchPreferencePage(installed),/ISOLATED_ONLY/);
  const dir=await copy(t);await rm(join(dir,'src/pxe.ts'));await symlink(join(installed,'src/pxe.ts'),join(dir,'src/pxe.ts'));
  await assert.rejects(patchPreferencePage(dir),/PATCH_SYMLINK/);
});
test('isolated helper is exact reviewed source and a missing/tampered copy fails verification',async t=>{
  const dir=await copy(t);await patchPreferencePage(dir);
  assert.equal(sha(await readFile(join(dir,PREFERENCE_PAGE_COMPACT_PIN.generated))),PREFERENCE_PAGE_COMPACT_PIN.sha256);
  await writeFile(join(dir,PREFERENCE_PAGE_COMPACT_PIN.generated),'unknown');await assert.rejects(inspectPreferencePage(dir),/PATCH_STATE/);
  await rm(join(dir,PREFERENCE_PAGE_COMPACT_PIN.generated));await assert.rejects(inspectPreferencePage(dir),/PATCH_STATE/);
});
test('added method does not rewrite original executeUtility, discovery, private calls or event retrieval',()=>{
  for(const pin of PREFERENCE_PAGE_PINS){
    const original=source[pin.path],output=transformPreferencePage(original,pin.path);
    const needle=pin.path.endsWith('.ts')?'  public executeUtility(':'executeUtility(call, {';
    assert.equal(output.slice(output.indexOf(needle)),original.slice(original.indexOf(needle)));
    assert.equal((output.match(/processRollingPreferencePage\(/g)||[]).length,1);
    const added=output.slice(output.indexOf('async processRollingPreferencePage'),output.indexOf(needle));
    assert.doesNotMatch(added,/ensureContractSynced|syncedContracts|skipSync|applyRollback|\.commit\(/);
    assert.match(added,/operationQueue\.runSynced/);
  }
});
test('transformed JS parses without importing SDK or starting native work',async t=>{
  const dir=await copy(t);await patchPreferencePage(dir);
  const result=spawnSync(process.execPath,['--check',join(dir,'dest/pxe.js')],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
});
test('Noir page uses original dispatcher and original validator, has no direct store or sync frontier',async()=>{
  const text=await readFile(join(root,'billboard/rolling_contract/src/preference_recovery.nr'),'utf8');
  assert.match(text,/process_message_ciphertext\(contract_address, compute_note_hash/);
  assert.match(text,/validate_and_store_enqueued_notes_and_events\(owner\)/);
  assert.doesNotMatch(text,/enqueue_note|enqueue_event|sync_state|get_pending_tagged_logs|set_capsule|get_capsule/);
});

// The following execution fixture runs the EXACT generated method, with a labelled
// SDK/queue double. It verifies argument capture and pre-queue safety only. It is
// not ACIR, store, membership, ciphertext or genuine-recovery qualification.
function captureFixture() {
  const output=transformPreferencePage(source['dest/pxe.js'],'dest/pxe.js');
  const start=output.indexOf('async processRollingPreferencePage'),end=output.indexOf('/**\n   * Executes a contract utility',start);
  const body=output.slice(start,end).trim();
  const Class=Function('RollingPageFr','RollingPageAddress','RollingPageTxHash','RP_LOGS',`return class {
    constructor(){this.proverEnabled=false;this.queued=0;this.operationQueue={runSynced:()=>{this.queued++;return Promise.reject(Error('fixture stop'));}};}
    #executeUtility() {throw Error('must not execute');}
    ${body}
  }`)({MODULUS:1n<<254n,fromString:x=>x},{fromFieldUnsafe:x=>x},{fromString:x=>({hash:x})},64);
  return new Class();
}
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function request(){return {contractAddress:hex(1),scope:hex(2),expectedClassId:hex(3),expectedArtifactHash:hex(4),network:{chainId:31337,version:1,rollup:'0x'+'1'.repeat(40)},proofsEnabled:false,blockNumber:2,blockHash:hex(5),txHash:hex(6),firstLog:0,logCount:2,compactFields:Array(7).fill(hex(0)),headerFields:Array(23).fill(hex(0))};}
for(const [label,mutate] of [
  ['zero count',x=>x.logCount=0],['nine logs',x=>x.logCount=9],['past physical log bound',x=>{x.firstLog=63;x.logCount=2;}],
  ['unknown key',x=>x.skipSync=true],['negative block',x=>x.blockNumber=-1],['malformed hash',x=>x.txHash='secret'],
  ['scope getter',x=>Object.defineProperty(x,'scope',{get(){throw Error('private sentinel');}})],
  ['network getter',x=>Object.defineProperty(x.network,'rollup',{get(){throw Error('private sentinel');}})],
  ['proof policy',x=>x.proofsEnabled=true],['symbol property',x=>x[Symbol()]=1],
  ['oversize compact input before traversal',x=>x.compactFields=new Array(24576)],
  ['wrong header width',x=>x.headerFields=Array(22).fill(hex(0))],
  ['compact field accessor',x=>Object.defineProperty(x.compactFields,0,{get(){throw Error('private sentinel');}})],
])test(`labelled boundary double rejects ${label} before queue or utility`,async()=>{
  const f=captureFixture(),p=request();mutate(p);await assert.rejects(f.processRollingPreferencePage(p,{contextGuard:()=>{}}),e=>e.message==='PXE_PREFERENCE_PAGE_FAILED');assert.equal(f.queued,0);
});
test('labelled boundary double preserves account guard failure and exposes no raw cause',async()=>{
  const f=captureFixture();await assert.rejects(f.processRollingPreferencePage(request(),{contextGuard:async()=>{throw Error('private sentinel');}}),e=>e.message==='PXE_PREFERENCE_PAGE_FAILED'&&!e.cause);assert.equal(f.queued,0);
});
test('labelled boundary double calls exactly one existing queue after valid capture',async()=>{
  const f=captureFixture();let guards=0;await assert.rejects(f.processRollingPreferencePage(request(),{contextGuard:async()=>{guards++;}}),/PXE_PREFERENCE_PAGE_FAILED/);assert.equal(guards,1);assert.equal(f.queued,1);
});

// Explicit separate invocation, ONLY after the lead grants the native slot:
// ROLLING_PREFERENCE_PAGE_NATIVE=1 LOG_LEVEL=silent node --test this-file
// Uses actual SDK Poseidon/membership, EventService, OperationQueue/coordinator,
// PrivateEventStore and LMDB. Transactions/events are labelled synthetic fixtures;
// this does not exercise compiled new Noir ACIR or qualify real cold recovery.
if(process.env.ROLLING_PREFERENCE_PAGE_NATIVE==='1') {
  const {pathToFileURL}=await import('node:url');
  const {after}=await import('node:test');
  const {Fr}=await import('@aztec-labs/foundation/curves/bn254');
  const {AztecAddress}=await import('@aztec-labs/stdlib/aztec-address');
  const {BlockHash,Body,L2Block}=await import('@aztec-labs/stdlib/block');
  const {AppendOnlyTreeSnapshot}=await import('@aztec-labs/stdlib/trees');
  const {SiblingPath}=await import('@aztec-labs/foundation/trees');
  const {PrivateLog}=await import('@aztec-labs/stdlib/logs');
  const {RevertCode}=await import('@aztec-labs/stdlib/avm');
  const constants=await import('@aztec-labs/constants');
  const {authenticateCompactBlock}=await import('../shared/rolling/compact-block.mjs');
  const {BlockHeader,TxHash,TxEffect,MinedTxReceipt,computeTxEffectMembershipWitness,verifyTxEffectMembershipWitness}=await import('@aztec-labs/stdlib/tx');
  const {EventSelector}=await import('@aztec-labs/stdlib/abi');
  const {computePrivateEventCommitment,siloNullifier}=await import('@aztec-labs/stdlib/hash');
  const {AztecLmdbStore}=await import('@aztec-labs/kv-store/lmdb');
  const {BarretenbergSync}=await import('@aztec-foundation/bb.js');
  const imp=p=>import(pathToFileURL(join(installed,'dest',p)));
  const {OperationQueue}=await imp('operation_queue.js');
  const {StagedWriteCoordinator}=await imp('storage/staged_write_coordinator.js');
  const {PrivateEventStore}=await imp('storage/private_event_store/private_event_store.js');
  const {EventService}=await imp('events/event_service.js');
  after(()=>BarretenbergSync.destroySingleton());
  const quiet={debug(){},verbose(){},info(){},warn(){},error(){}};
  const address=n=>new AztecAddress(new Fr(n));
  async function stores(t) {
    const directory=await realpath(await mkdtemp(join(tmpdir(),'rolling-preference-page-native-')));
    const db=AztecLmdbStore.open(join(directory,'db'),64*1024,true,quiet);
    const events=new PrivateEventStore(db);events.logger=quiet;
    const coordinator=new StagedWriteCoordinator({kvStore:db,stagedStores:[events]});
    const header=BlockHeader.empty();header.globalVariables.blockNumber=5;
    const queue=new OperationQueue({node:{startRecording:()=>({stop(){}})},synchronizer:{sync:async()=>{}},anchorBlockStore:{getBlockHeader:async()=>header},stagedWriteCoordinator:coordinator,contributors:[],autoSync:false,log:quiet});queue.start();
    t.after(async()=>{await queue.stop();await db.delete();await rm(directory,{recursive:true,force:true});});
    const scope=address(2),contract=address(1),selector=new EventSelector(11),txHash=TxHash.fromBigInt(22n),blockHash=new BlockHash(new Fr(33));
    const content=[1,1,1,4,1,0,0,0].map(n=>new Fr(n)),randomness=new Fr(99);
    const commitment=await computePrivateEventCommitment(randomness,selector.toField(),content);
    const request={contractAddress:contract,eventTypeId:selector,randomness,serializedEvent:content,eventCommitment:commitment,txHash};
    const data=new Map([[txHash.toString(),{nullifiers:[await siloNullifier(contract,commitment)],l2BlockNumber:4,l2BlockHash:blockHash,txIndexInBlock:0}]]);
    const read=()=>queue.runSynced(({changeSetId})=>events.getPrivateEvents(selector,{contractAddress:contract,scopes:[scope],fromBlock:1,toBlock:6},changeSetId));
    const validate=(id,requests=[request],context=data)=>new EventService(header,events,id,quiet).validateAndStoreEvents(requests,scope,context);
    return {db,events,queue,header,scope,contract,selector,request,data,validate,read};
  }
  async function generatedPage(t, mode='valid') {
    const f=await stores(t),p=request();p.blockNumber=4;p.firstLog=0;p.logCount=1;
    const effects=[10,20,30].map((n,i)=>new TxEffect(RevertCode.OK,TxHash.fromBigInt(BigInt(n)),new Fr(3),[],
      i===2?[...f.data.values()][0].nullifiers:[new Fr(n+100)],[],[],[PrivateLog.fromBlobFields(2,[new Fr(n),new Fr(n+1)])],[],[]));
    const effect=effects[2];p.txHash=effect.txHash.toString();
    f.request.txHash=effect.txHash;
    const body=new Body(effects);
    f.header.globalVariables.blockNumber=4;f.header.globalVariables.chainId=new Fr(31337);f.header.globalVariables.version=new Fr(1);
    f.header.txEffectsTreeRoot=await body.computeTxEffectsTreeRoot();
    p.blockHash=(await f.header.hash()).toString();p.headerFields=f.header.toFields().map(x=>x.toString());
    p.compactFields=new L2Block(AppendOnlyTreeSnapshot.empty(),f.header,body,1,0).toBlobFields().map(x=>x.toString());
    const state={utilityCalls:0,receiptReads:0,changed:false,pinnedIndex:null};
    const receipt=()=>MinedTxReceipt.from({txHash:effect.txHash,status:'proposed',executionResult:mode==='wrong execution'?'reverted':'success',
      transactionFee:mode==='wrong fee'?4n:3n,blockHash:BlockHash.fromString(p.blockHash),blockNumber:4,
      slotNumber:mode==='wrong slot'?1:0,txIndexInBlock:mode==='wrong ordinal'?1:2,epochNumber:0,txEffect:TxEffect.fromBuffer(effect.toBuffer())});
    let initial;
    const node={
      getNodeInfo:async()=>({l1ChainId:31337,rollupVersion:1,realProofs:false,l1ContractAddresses:{rollupAddress:{toString:()=>p.network.rollup}}}),
      getBlockData:async()=>({header:f.header,blockHash:BlockHash.fromString(p.blockHash)}),
      getContract:async()=>({currentContractClassId:Fr.fromString(p.expectedClassId),originalContractClassId:Fr.fromString(p.expectedClassId)}),
      getTxReceipt:async()=>{state.receiptReads++;const r=receipt();if(state.changed)r.txIndexInBlock=1;if(!initial)initial=r;return r;},
      getTxEffectMembershipWitness:async()=>{
        if(mode==='mutated original receipt'){initial.blockHash.hash=new Fr(999);initial.txIndexInBlock=1;initial.transactionFee=99n;}
        return {...await computeTxEffectMembershipWitness(effects,2),blockNumber:4};
      },
    };
    const output=transformPreferencePage(source['dest/pxe.js'],'dest/pxe.js');
    const start=output.indexOf('async processRollingPreferencePage'),end=output.indexOf('/**\n   * Executes a contract utility',start),method=output.slice(start,end).trim();
    // Only class registry / ACIR are labelled doubles here. Actual effect/root,
    // whole ordered compact verifier, generated method, EventService and stores
    // run unchanged. Candidate-ABI ACIR remains a separate mandatory test.
    const bindings={RollingPageFr:Fr,RollingPageAddress:AztecAddress,RollingPageTxHash:TxHash,RollingPageBlockHash:BlockHash,
      RollingPageHeader:BlockHeader,RollingPageEffect:TxEffect,RollingPageReceipt:MinedTxReceipt,RollingPageSiblingPath:SiblingPath,
      rollingPageVerifyWitness:verifyTxEffectMembershipWitness,rollingPageCompact:authenticateCompactBlock,
      rollingPageArtifactHash:async()=>Fr.fromString(p.expectedArtifactHash),rollingPageClass:async()=>({id:Fr.fromString(p.expectedClassId)}),
      computeContractAddressFromInstance:async()=>AztecAddress.fromFieldUnsafe(Fr.fromString(p.contractAddress)),BlockNumber:x=>x,FunctionType:{UTILITY:'utility'},
      ContractFunctionSimulator:class {constructor(args){Object.assign(this,args);}},
      RollingPageInstance:class {constructor(value){this.value=value;}toBuffer(){return this.value;}static fromBuffer(value){return value;}},
      RP_NOTES:constants.MAX_NOTE_HASHES_PER_TX,RP_NULLIFIERS:constants.MAX_NULLIFIERS_PER_TX,RP_MESSAGES:constants.MAX_L2_TO_L1_MSGS_PER_TX,
      RP_WRITES:constants.MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,RP_LOGS:constants.MAX_PRIVATE_LOGS_PER_TX,RP_LOG_FIELDS:constants.PRIVATE_LOG_SIZE_IN_FIELDS,
      RP_PUBLIC_FIELDS:constants.FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,RP_PUBLIC_HEADER:constants.PUBLIC_LOG_HEADER_LENGTH,
      RP_CLASS_LOGS:constants.MAX_CONTRACT_CLASS_LOGS_PER_TX,RP_CLASS_FIELDS:constants.CONTRACT_CLASS_LOG_SIZE_IN_FIELDS};
    const Class=Function(...Object.keys(bindings),`return class {
      constructor(){this.proverEnabled=false;}
      async #executeUtility(simulator,call,authwits,scopes,anchor,changeSetId) {return this.execute(simulator,changeSetId);}
      ${method}
    }`)(...Object.values(bindings));
    const page=new Class();page.node=node;page.operationQueue=f.queue;
    page.contractStore={getContractArtifact:async()=>({name:'RollingBoard'}),getFunctionCall:async()=>({type:'utility'})};
    page.execute=async(sim,id)=>{
      state.utilityCalls++;const pinned=await sim.aztecNode.getTxReceipt(effect.txHash,{includeTxEffect:true});
      state.pinnedIndex=pinned.txIndexInBlock;assert.equal(pinned.blockHash.toString(),p.blockHash);assert.equal(pinned.transactionFee,3n);
      await assert.rejects(sim.aztecNode.getTxReceipt(TxHash.fromBigInt(999n),{includeTxEffect:true}));
      await assert.rejects(sim.aztecNode.getTxReceipt(effect.txHash,{includeTxEffect:true,extra:true}));
      const data=new Map([[effect.txHash.toString(),{nullifiers:pinned.txEffect.nullifiers,l2BlockNumber:4,l2BlockHash:pinned.blockHash,txIndexInBlock:pinned.txIndexInBlock}]]);
      await f.validate(id,[f.request],data);
      if(mode==='changed receipt after utility')state.changed=true;
      return {result:[new Fr(1)],offchainEffects:[]};
    };
    return {...f,p,page,state};
  }
  for(const mode of ['wrong ordinal','wrong fee','wrong execution','wrong slot'])test('generated page / actual SDK rejects consistent '+mode+' before utility',async t=>{
    const f=await generatedPage(t,mode);await assert.rejects(f.page.processRollingPreferencePage(f.p,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
    assert.equal(f.state.utilityCalls,0);assert.equal((await f.read()).length,0);
  });
  test('generated multi-tx page uses authenticated ordinal and detaches original mutable receipt',async t=>{
    const f=await generatedPage(t,'mutated original receipt');
    assert.deepEqual(await f.page.processRollingPreferencePage(f.p,{contextGuard:async()=>{}}),{schemaVersion:1,processed:1,admitted:1});
    assert.equal(f.state.pinnedIndex,2);assert.equal((await f.read()).length,1);
  });
  test('generated page final original-node receipt change discards validated staged event',async t=>{
    const f=await generatedPage(t,'changed receipt after utility');
    await assert.rejects(f.page.processRollingPreferencePage(f.p,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
    assert.equal(f.state.utilityCalls,1);assert.equal((await f.read()).length,0);
  });
  test('actual SDK synthetic complete effect membership rejects changed ciphertext and changed root',async()=>{
    const effect=await TxEffect.random({numNoteHashes:1,numNullifiers:1,numL2ToL1Msgs:0,numPublicDataWrites:0,numPrivateLogs:1,numPublicCallsPerTx:0,numPublicLogsPerCall:0,numContractClassLogs:0});
    const witness=await computeTxEffectMembershipWitness([effect],0);
    const leaf=await effect.computeTxEffectsTreeLeaf();
    assert.equal(await verifyTxEffectMembershipWitness(leaf,witness,witness.root),true);
    const changed=TxEffect.fromBuffer(effect.toBuffer());
    assert(changed.privateLogs.length>0);
    changed.privateLogs[0].fields[0]=new Fr(12345);
    assert.equal(await verifyTxEffectMembershipWitness(await changed.computeTxEffectsTreeLeaf(),witness,witness.root),false);
    assert.equal(await verifyTxEffectMembershipWitness(leaf,witness,new Fr(88)),false);
  });
  test('actual LMDB/SDK validator: valid event commits, forged payload/missing nullifier does not',async t=>{
    const f=await stores(t);
    const forged={...f.request,serializedEvent:[new Fr(999),...f.request.serializedEvent.slice(1)]};
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId,[forged]));assert.equal((await f.read()).length,0);
    const absent=new Map([...f.data].map(([k,v])=>[k,{...v,nullifiers:[]} ]));
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId,[f.request],absent));assert.equal((await f.read()).length,0);
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId));assert.equal((await f.read()).length,1);
  });
  test('actual LMDB/SDK queue: staged valid event discarded on final context or canonical receipt failure',async t=>{
    const f=await stores(t);
    for(const label of ['context changed','canonical receipt changed']){
      await assert.rejects(f.queue.runSynced(async({changeSetId})=>{await f.validate(changeSetId);throw Error(label);}),new RegExp(label));
      assert.equal((await f.read()).length,0);
    }
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId));assert.equal((await f.read()).length,1);
    await f.db.transactionAsync(()=>f.events.rollbackToBlock(3));assert.equal((await f.read()).length,0);
  });
  test('actual LMDB/SDK queue retains operation until awaited validator settles; no detached write',async t=>{
    const f=await stores(t);let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let finished=false;
    const run=f.queue.runSynced(async({changeSetId})=>{entered();await gate;await f.validate(changeSetId);throw Error('late context');});
    const caught=run.catch(e=>{assert.equal(e.message,'late context');finished=true;});
    await started;await Promise.resolve();assert.equal(finished,false);release();await caught;assert.equal((await f.read()).length,0);
  });
}
