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
test('rc3 queue pressure, wait timer cleanup and error handling remain byte-identical',()=>{
  for(const pin of PREFERENCE_PAGE_PINS.filter(p=>p.path.includes('operation_queue.'))){
    const original=source[pin.path],output=transformPreferencePage(original,pin.path);
    const synced=pin.path.endsWith('.ts')?'public runSynced<T>(':'runSynced(fn,';
    const before=original.slice(0,original.indexOf(synced));
    assert.match(before,/pxe_operation_queue_pressure/);
    assert.match(before,/pxe_operation_started/);
    assert.match(before,/clearTimeout\(waitWarning\)/);
    assert.match(before,/\.finally\(/);
    assert.equal(output.slice(0,output.indexOf(synced)),before);
    const contextualize='#contextualizeError(';
    assert.equal(output.slice(output.lastIndexOf(contextualize)),original.slice(original.lastIndexOf(contextualize)));
    assert.match(output,/beforeCommit,/);
  }
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
  for(const pin of PREFERENCE_PAGE_PINS.filter(p=>p.path.endsWith('/pxe.ts')||p.path.endsWith('/pxe.js'))){
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
  for(const pin of PREFERENCE_PAGE_PINS.filter(p=>p.path.endsWith('.js'))){
    const result=spawnSync(process.execPath,['--check',join(dir,pin.path)],{encoding:'utf8',timeout:5000});
    assert.equal(result.status,0,result.stderr);
  }
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
// PrivateEventStore and the actual application IndexedDB adapter on explicitly
// labelled fake-indexeddb. This is not native Chromium storage qualification.
// Transactions/inclusion are synthetic; processed ACIR is a separate opt-in.
if(process.env.ROLLING_PREFERENCE_PAGE_NATIVE==='1') {
  const {pathToFileURL}=await import('node:url');
  const {after}=await import('node:test');
  // Bind the reviewed b440 atomicity repair before importing the adapter. No
  // shared dependency is patched by this test. Historical v1 failures remain
  // unresolved evidence; selecting the application's store does not fix v1.
  for(const [path,expected] of [
    ['shared/sdk-store.mjs','474807edf283d8166f93442ccfe4485ccaa7c056fefa5d4e9b2a4669554a5bfa'],
    ['node_modules/@aztec-labs/kv-store/src/deprecated/indexeddb/store.ts','e71b52af584c9e2285c80f635503c1f4d1989948a3b8b21db860d8178f7ae0f6'],
    ['node_modules/@aztec-labs/kv-store/dest/deprecated/indexeddb/store.js','e6efed86ab1f05b268cf11bfe02ecd0e9fe6462e6747585285090d00232c3100'],
  ])assert.equal(sha(await readFile(join(root,path))),expected,'Unreviewed application store fixture');
  // Match the CLI actor's platform setup, preserving every previous descriptor.
  // One fresh factory belongs to this test process; every receiver owns a unique
  // full network/account/schema namespace and must delete it before restoration.
  const idb=await import('fake-indexeddb'),factory=new idb.IDBFactory();
  const idbKeys=Object.keys(idb).filter(key=>key.startsWith('IDB')||key==='indexedDB');
  const previousGlobals=idbKeys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  for(const [,descriptor] of previousGlobals)assert(!descriptor||descriptor.configurable,'IndexedDB global is not owned');
  after(async()=>{
    try {
      for(const key of idbKeys)assert.equal(globalThis[key],key==='indexedDB'?factory:idb[key],'IndexedDB global ownership changed');
      assert.equal((await factory.databases()).length,0,'Application fixture database leaked');
    } finally {
      for(const [key,descriptor] of previousGlobals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  });
  for(const key of idbKeys)Object.defineProperty(globalThis,key,{value:key==='indexedDB'?factory:idb[key],writable:true,configurable:true});
  const {openPXEStore,getPXEStoreIdentity}=await import('../shared/sdk-store.mjs');
  // Optional source-bound artifact prerequisite checks. They do NOT run ACIR or
  // replace class registration: raw utility extraction is distinct from a usable
  // normal artifact. Enable only with the retained exact raw compile-2 fixture.
  if(process.env.ROLLING_PREFERENCE_PAGE_ARTIFACT_PREFLIGHT==='1') {
    const {loadContractArtifact,loadContractArtifactForPublic,FunctionType}=await import('@aztec-labs/stdlib/abi');
    const {computeVerificationKeyHash}=await import('@aztec-labs/stdlib/contract');
    const rawBytes=await readFile(join(root,'execution/evidence/G07/preference-page/raw-RollingBoard.json'));
    assert.equal(sha(rawBytes),'bdd685dc8fe525e2b813c6c7e46312a37317d85f4b914b8aac871ad9420bb649','Wrong raw utility fixture');
    const raw=JSON.parse(rawBytes),rawFunction=raw.functions.find(fn=>fn.name==='__aztec_nr_internals__recover_preference_page');
    test('actual official loader rejects unprocessed candidate rather than claiming normal artifact authority',()=>{
      assert.equal(raw.transpiled,undefined);
      assert.throws(()=>loadContractArtifact(raw),/public bytecode has not been transpiled/);
    });
    test('actual public loader preserves raw utility bytes but cannot supply missing private verification keys',async()=>{
      const artifact=loadContractArtifactForPublic(raw);
      const utility=artifact.functions.find(fn=>fn.name===rawFunction.name);
      assert.equal(utility.functionType,FunctionType.UTILITY);
      assert.deepEqual(utility.bytecode,Buffer.from(rawFunction.bytecode,'base64'));
      assert.equal(artifact.functions.some(fn=>fn.name==='recover_preference_page'),false);
      assert.equal(utility.parameters.length,6);
      const privateFunctions=artifact.functions.filter(fn=>fn.functionType===FunctionType.PRIVATE);
      assert(privateFunctions.length>0);
      for(const fn of privateFunctions) {
        assert.equal(fn.verificationKey,undefined);
        await assert.rejects(computeVerificationKeyHash(fn),/must have a verification key/);
      }
    });
  }
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
  const {BarretenbergSync}=await import('@aztec-foundation/bb.js');
  const imp=p=>import(pathToFileURL(join(installed,'dest',p)));
  const {OperationQueue:PristineOperationQueue}=await imp('operation_queue.js');
  // Import exact transformed queue/lifecycle from an isolated directory. Their
  // original SDK imports resolve normally; shared installed files stay untouched.
  const queueDirectory=await realpath(await mkdtemp(join(root,'.build/preference-page-queue-')));
  after(()=>rm(queueDirectory,{recursive:true,force:true}));
  await writeFile(join(queueDirectory,'package.json'),JSON.stringify({type:'module'}));
  for(const path of ['dest/operation_queue.js','dest/operation_lifecycle.js']){
    await writeFile(join(queueDirectory,path.slice(5)),transformPreferencePage(source[path],path));
  }
  const {OperationQueue}=await import(pathToFileURL(join(queueDirectory,'operation_queue.js')));
  const {BlockSynchronizer}=await imp('block_synchronizer/block_synchronizer.js');
  const {StagedWriteCoordinator}=await imp('storage/staged_write_coordinator.js');
  const {PrivateEventStore}=await imp('storage/private_event_store/private_event_store.js');
  const {EventService}=await imp('events/event_service.js');
  after(()=>BarretenbergSync.destroySingleton());
  const quiet={debug(){},verbose(){},info(){},warn(){},error(){}};
  const address=n=>new AztecAddress(new Fr(n));
  async function applicationStore(t,owner,stop,log=quiet) {
    const directory=await realpath(await mkdtemp(join(tmpdir(),'rolling-preference-page-application-')));
    let db,identity;
    // Register ownership before open/metadata initialization can fail. No fake
    // transaction/coordinator is inserted: delete() drains the real adapter.
    t.after(async()=>{
      try {await stop();}
      finally {
        try {
          if(db)await db.delete();
          else if(identity)await new Promise((resolve,reject)=>{
            const removal=factory.deleteDatabase(identity.name);
            removal.onsuccess=()=>resolve();removal.onerror=()=>reject(Error('Fixture database deletion failed'));
            removal.onblocked=()=>reject(Error('Fixture database deletion blocked'));
          });
          if(identity)assert(!(await factory.databases()).some(entry=>entry.name===identity.name),'Owned application database remained');
        } finally {await rm(directory,{recursive:true,force:true});}
      }
    });
    const config={l1ChainId:31337,rollupAddress:request().network.rollup,accountAddress:owner.toString(),dataDirectory:directory};
    identity=getPXEStoreIdentity(config);
    assert(!(await factory.databases()).some(entry=>entry.name===identity.name),'Application namespace was not fresh');
    db=await openPXEStore(config,undefined,log);
    assert.equal(await db.openSingleton('billboardStoreIdentity').getAsync(),identity.metadata);
    return db;
  }
  test('application store fixture owns full isolated namespaces and deletes them after settled hooks',async t=>{
    const before=(await factory.databases()).map(entry=>entry.name).sort();let stops=0;
    await t.test('real application metadata and isolated data on labelled Node IndexedDB',async sub=>{
      const first=await applicationStore(sub,address(2),async()=>{stops++;});
      const second=await applicationStore(sub,address(2),async()=>{stops++;});
      const foreign=await applicationStore(sub,address(3),async()=>{stops++;});
      const identities=await Promise.all([first,second,foreign].map(db=>db.openSingleton('billboardStoreIdentity').getAsync()));
      assert.equal(new Set(identities).size,3);
      const parsed=identities.map(text=>JSON.parse(text));
      for(const identity of parsed){assert.equal(identity[4],31337);assert.equal(identity[5],request().network.rollup);}
      assert.equal(parsed[0][7],address(2).toString());assert.equal(parsed[2][7],address(3).toString());
      await first.openMap('labelled-fixture-isolation').set('value',17);
      assert.equal(await second.openMap('labelled-fixture-isolation').getAsync('value'),undefined);
      assert.equal(await foreign.openMap('labelled-fixture-isolation').getAsync('value'),undefined);
    });
    assert.equal(stops,3);assert.deepEqual((await factory.databases()).map(entry=>entry.name).sort(),before);
    await t.test('failed identity preparation retains cleanup ownership without opening a database',async sub=>{
      await assert.rejects(applicationStore(sub,{toString:()=> 'invalid'},async()=>{stops++;}),/valid account address/);
    });
    assert.equal(stops,4);assert.deepEqual((await factory.databases()).map(entry=>entry.name).sort(),before);
  });
  async function stores(t, contributors=[]) {
    const scope=address(2);let queue;
    const db=await applicationStore(t,scope,async()=>{if(queue)await queue.stop();});
    const events=new PrivateEventStore(db);events.logger=quiet;
    const coordinator=new StagedWriteCoordinator({kvStore:db,stagedStores:[events]});
    const header=BlockHeader.empty();header.globalVariables.blockNumber=5;
    queue=new OperationQueue({node:{startRecording:()=>({stop(){}})},synchronizer:{sync:async()=>{}},anchorBlockStore:{getBlockHeader:async()=>header},stagedWriteCoordinator:coordinator,contributors,autoSync:false,log:quiet});queue.start();
    const contract=address(1),selector=new EventSelector(11),txHash=TxHash.fromBigInt(22n),blockHash=new BlockHash(new Fr(33));
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
  // Separate opt-in: real processed ACIR, encryption, scoped keys and original
  // validators. Only the chain is synthetic. No proof, mining or fee acceptance.
  if(process.env.ROLLING_PREFERENCE_PAGE_ACIR==='1') {
    const {loadContractArtifact,FunctionType,decodeFunctionSignature}=await import('@aztec-labs/stdlib/abi');
    const {computeArtifactHash,getContractClassFromArtifact,SerializableContractInstance,computeContractAddressFromInstance,getContractInstanceFromInstantiationParams,CompleteAddress}=await import('@aztec-labs/stdlib/contract');
    const {deriveKeys}=await import('@aztec-labs/stdlib/keys');
    const {EthAddress}=await import('@aztec-labs/foundation/eth-address');
    const {computeSiloedPrivateInitializationNullifier}=await import('@aztec-labs/stdlib/hash');
    const {getStandardHandshakeRegistry}=await import('@aztec-labs/standard-contracts/handshake-registry');
    const {TxExecutionRequest,TxContext,HashedValues}=await import('@aztec-labs/stdlib/tx');
    const {MerkleTreeId}=await import('@aztec-labs/stdlib/trees');
    const {WASMSimulator}=await import('@aztec-labs/simulator/client');
    const {openPxeStores}=await imp('storage/open_pxe_stores.js');
    const {ContractClassService}=await imp('contract/contract_class_service.js');
    const {ContractSyncService}=await imp('contract/contract_sync_service.js');
    const {ContractFunctionSimulator,generateSimulatedProvingResult}=await imp('contract_function_simulator/contract_function_simulator.js');
    const {TxResolverService}=await imp('messages/tx_resolver_service.js');
    const artifactBytes=await readFile(join(root,'.build/preference-page-processed-321/RollingBoard.json'));
    assert.equal(sha(artifactBytes),'799b44cd8901140dfda8c3fbd80fa11ebe708417afbd000d44eb92d39eafa781','Wrong processed ACIR fixture');
    const artifact=loadContractArtifact(JSON.parse(artifactBytes));
    const log={...quiet,getBindings:()=>({}),createChild(){return this;}};
    async function acirFixture(t) {
      const contractClass=await getContractClassFromArtifact(artifact),artifactHash=await computeArtifactHash(artifact);
      // A real, deterministically derived instance of the actual processed class.
      // Its chain registration/initialization is synthetic test data, not a claim
      // that this instance has been deployed or its transactions proven/mined.
      const instance=await getContractInstanceFromInstantiationParams(artifact,{salt:new Fr(551),
        deployer:AztecAddress.fromFieldUnsafe(new Fr(555)),constructorArgs:[Array(32).fill(Fr.ZERO),0,31337,
          EthAddress.fromString(request().network.rollup),1,1n,1000n,1,1,1,1]}),board=instance.address;
      const registry=await getStandardHandshakeRegistry();
      // Source-derived synthetic chain initialization only. The original macro
      // and generateSimulatedProvingResult still check these actual nullifiers.
      const initializationNullifiers=await Promise.all([instance,registry.instance].map(i=>
        computeSiloedPrivateInitializationNullifier(i.address,i.initializationHash)));
      const instances=new Map([instance,registry.instance].map(i=>[i.address.toString(),i]));
      const derived=await deriveKeys(Fr.random());
      const keys={masterNullifierHidingSecretKey:derived.masterNullifierHidingSecretKey,
        masterIncomingViewingSecretKey:derived.masterIncomingViewingSecretKey,
        masterOutgoingViewingSecretKey:derived.masterOutgoingViewingSecretKey,
        masterTaggingSecretKey:derived.masterTaggingSecretKey,
        masterMessageSigningPublicKey:derived.masterMessageSigningPublicKey,
        masterFallbackPublicKey:derived.masterFallbackPublicKey};
      const partialAddress=new Fr(552);let header=BlockHeader.empty();
      header.globalVariables.blockNumber=2;header.globalVariables.chainId=new Fr(31337);header.globalVariables.version=new Fr(1);
      let block,effect,canonicalChanged=false;const counters={tagQueries:0,unexpectedCalls:0};
      const api={
        getNodeInfo:async()=>({l1ChainId:31337,rollupVersion:1,realProofs:false,l1ContractAddresses:{rollupAddress:{toString:()=>request().network.rollup}}}),
        getContract:async address=>{const value=instances.get(address.toString());assert(value,'Unexpected synthetic contract');return value;},
        getBlockData:async number=>{assert.equal(number,header.getBlockNumber());return {header,blockHash:canonicalChanged?BlockHash.random():await header.hash()};},
        getBlock:async()=>block,
        findLeavesIndexes:async(_anchor,tree,values)=>{
          assert.equal(tree,MerkleTreeId.NULLIFIER_TREE);
          return Promise.all(values.map(async value=>{const index=[...initializationNullifiers,...(effect?.nullifiers??[])].findIndex(x=>x.equals(value));
            return index<0?undefined:{data:BigInt(index),l2BlockNumber:header.getBlockNumber(),l2BlockHash:await header.hash()};}));
        },
        getPrivateLogsByTags:async query=>{counters.tagQueries++;assert.equal(header.getBlockNumber(),2);return query.tags.map(()=>[]);},
        getPublicLogsByTags:async query=>{counters.tagQueries++;assert.equal(header.getBlockNumber(),2);return query.tags.map(()=>[]);},
        getTxReceipt:async hash=>{assert(effect&&hash.equals(effect.txHash));return MinedTxReceipt.from({txHash:effect.txHash,status:'proposed',executionResult:'success',transactionFee:effect.transactionFee.toBigInt(),blockNumber:header.getBlockNumber(),blockHash:await header.hash(),slotNumber:header.globalVariables.slotNumber,epochNumber:0,txIndexInBlock:0,txEffect:TxEffect.fromBuffer(effect.toBuffer())});},
        getTxEffectMembershipWitness:async hash=>{assert(effect&&hash.equals(effect.txHash));return {...await computeTxEffectMembershipWitness([effect],0),blockNumber:header.getBlockNumber()};},
      };
      const node=new Proxy(api,{get(target,key){if(key==='then')return undefined;if(key in target)return Reflect.get(target,key);
        return ()=>{counters.unexpectedCalls++;throw Error('UNIMPLEMENTED_SYNTHETIC_CHAIN_METHOD');};}});
      async function receiver({withKeys=true,completeAddress,contributor,pristine=false,extraStore}={}) {
        const expectedComplete=withKeys?await CompleteAddress.fromPublicKeysAndPartialAddress(derived.publicKeys,partialAddress):completeAddress;
        assert(expectedComplete);let queue;
        const db=await applicationStore(t,expectedComplete.address,async()=>{if(queue)await queue.stop();},log);
        const stores=openPxeStores(db,await header.hash());
        await stores.contractStore.addContractArtifact(artifact);await stores.contractStore.addContractInstance(instance);
        await stores.contractStore.addContractArtifact(registry.artifact);await stores.contractStore.addContractInstance(registry.instance);
        const complete=withKeys?await stores.keyStore.addAccount(keys,partialAddress):completeAddress;
        assert(complete);assert(complete.address.equals(expectedComplete.address),'Application store owner differs from actual key registration');
        await stores.addressStore.addCompleteAddress(complete);
        const classService=new ContractClassService(node,stores.contractStore);
        const syncService=new ContractSyncService(node,stores.contractStore,classService,stores.noteStore,log,{concurrentContractSyncEnabled:false});
        const simulator=new WASMSimulator();
        const args={...stores,contractClassService:classService,contractSyncService:syncService,
          aztecNode:node,txResolver:new TxResolverService(node),simulator};
        const functionSimulator=new ContractFunctionSimulator(args);
        const stagedStores=[stores.capsuleStore,stores.senderTaggingStore,stores.recipientTaggingStore,stores.privateEventStore,stores.noteStore,stores.factStore,...(extraStore?[extraStore]:[])];
        queue=new (pristine?PristineOperationQueue:OperationQueue)({node:{startRecording:()=>({stop(){}})},synchronizer:{sync:async()=>{throw Error('UNEXPECTED_FULL_SYNC');}},
          anchorBlockStore:{getBlockHeader:async()=>BlockHeader.fromBuffer(header.toBuffer())},
          stagedWriteCoordinator:new StagedWriteCoordinator({kvStore:db,stagedStores}),contributors:[syncService,...(contributor?[contributor]:[])],autoSync:false,log});
        queue.start();
        const output=transformPreferencePage(source['dest/pxe.js'],'dest/pxe.js'),start=output.indexOf('async processRollingPreferencePage'),end=output.indexOf('/**\n   * Executes a contract utility',start);
        const bindings={RollingPageFr:Fr,RollingPageAddress:AztecAddress,RollingPageTxHash:TxHash,RollingPageBlockHash:BlockHash,
          RollingPageHeader:BlockHeader,RollingPageEffect:TxEffect,RollingPageReceipt:MinedTxReceipt,RollingPageSiblingPath:SiblingPath,
          rollingPageVerifyWitness:verifyTxEffectMembershipWitness,rollingPageCompact:authenticateCompactBlock,
          rollingPageArtifactHash:computeArtifactHash,rollingPageClass:getContractClassFromArtifact,
          computeContractAddressFromInstance,BlockNumber:x=>x,FunctionType,ContractFunctionSimulator,RollingPageInstance:SerializableContractInstance,
          RP_NOTES:constants.MAX_NOTE_HASHES_PER_TX,RP_NULLIFIERS:constants.MAX_NULLIFIERS_PER_TX,RP_MESSAGES:constants.MAX_L2_TO_L1_MSGS_PER_TX,
          RP_WRITES:constants.MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,RP_LOGS:constants.MAX_PRIVATE_LOGS_PER_TX,RP_LOG_FIELDS:constants.PRIVATE_LOG_SIZE_IN_FIELDS,
          RP_PUBLIC_FIELDS:constants.FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,RP_PUBLIC_HEADER:constants.PUBLIC_LOG_HEADER_LENGTH,
          RP_CLASS_LOGS:constants.MAX_CONTRACT_CLASS_LOGS_PER_TX,RP_CLASS_FIELDS:constants.CONTRACT_CLASS_LOG_SIZE_IN_FIELDS};
        // Exact generated page method; utility bridge is the original PXE bridge's
        // runUtility call, not a mocked return or directly enqueued event.
        const Class=Function(...Object.keys(bindings),`return class {
          async #executeUtility(simulator,call,authwits,scopes,anchor,changeSetId) {
            const result=await simulator.runUtility(call,authwits,anchor,scopes,changeSetId);
            this.acirCompleted=(this.acirCompleted??0)+1;
            this.stagedNoteCount=(await this.noteStore.getNotes({contractAddress:call.to,scopes},changeSetId)).length;
            this.afterUtility?.();
            return result;
          }
          ${output.slice(start,end).trim()}
        }`)(...Object.values(bindings));
        const page=new Class();Object.assign(page,stores,{node,proverEnabled:false,operationQueue:queue,
          contractClassService:classService,contractSyncService:syncService,txResolver:args.txResolver,simulator});
        const eventAbi=artifact.outputs.structs.events.find(e=>e.path==='RollingBoard::PreferenceChanged');
        const selector=await EventSelector.fromSignature(decodeFunctionSignature('PreferenceChanged',eventAbi.fields));
        const read=()=>queue.runSynced(async({changeSetId})=>({
          events:await stores.privateEventStore.getPrivateEvents(selector,{contractAddress:board,scopes:[complete.address],fromBlock:1,toBlock:header.getBlockNumber()+1},changeSetId),
          notes:await stores.noteStore.getNotes({contractAddress:board,owner:complete.address,scopes:[complete.address]},changeSetId),
        }));
        return {stores,queue,complete,functionSimulator,page,read,syncService,db,stagedStores};
      }
      const sender=await receiver();
      const call=await sender.stores.contractStore.getFunctionCall('set_preference',[0n,1,new Fr(77),true],board,contractClass.id);
      const hashed=await HashedValues.fromArgs(call.args),txRequest=new TxExecutionRequest(board,call.selector,hashed.hash,TxContext.empty(31337,1),[hashed],[],[],Fr.random());
      const simulated=await sender.queue.runSynced(async({changeSetId})=>{
        const execution=await sender.functionSimulator.run(txRequest,{msgSender:sender.complete.address,anchorBlockHeader:header,scopes:[sender.complete.address],senderForTags:sender.complete.address,changeSetId});
        return generateSimulatedProvingResult(execution,async()=> 'synthetic.preference',node);
      });
      assert(simulated.publicInputs.forRollup,'Preference fixture must remain private-only');
      const data=simulated.publicInputs.forRollup.end;
      effect=new TxEffect(RevertCode.OK,TxHash.fromBigInt(553n),Fr.ZERO,
        data.noteHashes.filter(x=>!x.isZero()),data.nullifiers.filter(x=>!x.isZero()),[],[],data.privateLogs.filter(x=>!x.isEmpty()),[],[]);
      // Keep all genuine simulation effects, including standard handshake
      // delivery. Only the board head/event may be admitted by the page gate.
      assert(effect.noteHashes.length>=1);assert(effect.privateLogs.length>=2&&effect.privateLogs.length<=8);
      assert(effect.privateLogs.every(x=>x.emittedLength>0&&x.emittedLength<=16),'Bounded encrypted envelope expected');
      // BlockHeader.hash caches; never mutate an already hashed header into a
      // different canonical block. This copy has no cached hash.
      header=BlockHeader.fromBuffer(header.toBuffer());
      header.globalVariables.blockNumber=4;const body=new Body([effect]);header.txEffectsTreeRoot=await body.computeTxEffectsTreeRoot();
      block=new L2Block(AppendOnlyTreeSnapshot.empty(),header,body,1,0);
      const input={...request(),contractAddress:board.toString(),scope:sender.complete.address.toString(),
        expectedClassId:contractClass.id.toString(),expectedArtifactHash:artifactHash.toString(),blockNumber:4,
        blockHash:(await header.hash()).toString(),txHash:effect.txHash.toString(),firstLog:0,logCount:effect.privateLogs.length,
        compactFields:block.toBlobFields().map(x=>x.toString()),headerFields:header.toFields().map(x=>x.toString())};
      const tagsBefore=counters.tagQueries;
      return {receiver,sender,input,header,board,contractClass,counters,tagsBefore,node,block,
        invalidate:()=>{canonicalChanged=true;},restore:()=>{canonicalChanged=false;}};
    }
    test('real processed ACIR: emitted encrypted preference head/event, scoped keys, validators and atomic discard',async t=>{
      const f=await acirFixture(t);
      await t.test('absent owner key rejects even though the complete public address is registered',async()=>{
        const r=await f.receiver({withKeys:false,completeAddress:f.sender.complete});
        await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      await t.test('absent head and absent key cannot turn recovery into a successful empty result',async()=>{
        const foreign=await CompleteAddress.fromSecretKeyAndPartialAddress(Fr.random(),new Fr(554));
        const r=await f.receiver({withKeys:false,completeAddress:foreign});
        await assert.rejects(r.page.processRollingPreferencePage({...f.input,scope:foreign.address.toString()},{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
        assert.equal(r.page.acirCompleted,undefined);
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      await t.test('original utility denies owner key outside actual execution scope',async()=>{
        const r=await f.receiver();
        const call=await r.stores.contractStore.getFunctionCall('recover_preference_page',[r.complete.address,TxHash.fromString(f.input.txHash).hash,4,Fr.fromString(f.input.blockHash),0,f.input.logCount],f.board,f.contractClass.id);
        await assert.rejects(r.queue.runSynced(({changeSetId})=>r.functionSimulator.runUtility(call,[],f.header,[],changeSetId)),/Key validation request denied: no scoped account/);
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      await t.test('late account failure drains and discards real decrypted staged records',async()=>{
        const r=await f.receiver();let guards=0;
        await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{
          guards++;if(guards===8){assert.equal(r.page.acirCompleted,1);assert.equal(r.page.stagedNoteCount,1);throw Error('SYNTHETIC_ACCOUNT_LOCK');}
        }}),/PXE_PREFERENCE_PAGE_FAILED/);
        assert.equal(guards,8);assert.equal(r.page.acirCompleted,1);assert.equal(r.page.stagedNoteCount,1);
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      await t.test('canonical change after actual decryption discards both staged stores',async()=>{
        const r=await f.receiver();r.page.afterUtility=f.invalidate;
        try {
          await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
          assert.equal(r.page.acirCompleted,1);assert.equal(r.page.stagedNoteCount,1);
        } finally {f.restore();}
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      await t.test('original lifecycle contributor veto after final guard discards decrypted staged records',async()=>{
        let fail=true,settled=0,r;
        const contributor={settle:async()=>{if(fail){settled++;assert.equal(r.page.acirCompleted,1);assert.equal(r.page.stagedNoteCount,1);throw Error('SYNTHETIC_CONTRIBUTOR_FAILURE');}}};
        r=await f.receiver({contributor});let guards=0;
        await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{guards++;}}),/PXE_PREFERENCE_PAGE_FAILED/);
        assert.equal(guards,8);assert.equal(settled,2);fail=false;
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);assert.equal(r.syncService.syncedContracts.size,0);
      });
      for(const race of ['canonical','account'])await t.test(`successful settlement ${race} race: pristine commits, patched discards actual ACIR rows`,async()=>{
        for(const pristine of [true,false]){
          let enabled=true,locked=false,settled=0;
          const contributor={onOperationEnd(){},settle:async()=>{if(enabled){settled++;if(race==='canonical')f.invalidate();else locked=true;}}};
          const r=await f.receiver({pristine,contributor});
          const run=r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{if(locked)throw Error('SYNTHETIC_ACCOUNT_LOCK');}});
          try{
            if(pristine)assert.equal((await run).admitted,2);
            else await assert.rejects(run,/PXE_PREFERENCE_PAGE_FAILED/);
            assert.equal(r.page.acirCompleted,1);assert.equal(r.page.stagedNoteCount,1);
            assert.equal(settled,pristine?1:2);
          }finally{enabled=false;locked=false;f.restore();}
          const state=await r.read();assert.equal(state.events.length,pristine?1:0);assert.equal(state.notes.length,pristine?1:0);
        }
      });
      await t.test('receipt mutation during successful settlement is rejected by original-node revalidation',async()=>{
        let enabled=true,changed=false;
        const original=f.node.getTxReceipt;
        f.node.getTxReceipt=async(...args)=>{const receipt=await original(...args);if(changed)receipt.transactionFee+=1n;return receipt;};
        const contributor={onOperationEnd(){},settle:async()=>{if(enabled)changed=true;}};
        const r=await f.receiver({contributor});
        try{await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);}
        finally{enabled=false;changed=false;f.node.getTxReceipt=original;}
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);
      });
      await t.test('held successful contributor prevents commit and next operation until fresh context veto and complete drain',async()=>{
        let enter,release,enabled=true,settled=0,secondEntered=false;
        const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
        const contributor={onOperationEnd(_id,outcome){if(outcome==='discarded'){enabled=false;f.restore();}},settle:async()=>{if(enabled){settled++;enter();await gate;}}};
        const r=await f.receiver({contributor});
        const first=r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}});
        const rejection=assert.rejects(first,/PXE_PREFERENCE_PAGE_FAILED/);
        await entered;
        const second=r.queue.runSynced(async()=>{secondEntered=true;});
        await Promise.resolve();assert.equal(secondEntered,false);assert.equal(r.page.stagedNoteCount,1);
        f.invalidate();release();await rejection;enabled=false;f.restore();await second;
        assert.equal(settled,2);assert.equal(secondEntered,true);
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);
      });
      await t.test('failure in a later staged store rolls back actual note and event database writes',async()=>{
        let fail=true,commits=0;
        const extraStore={storeName:'labelled-late-failure',beginChangeSet(){},discardChangeSet(){},async commitChangeSet(){commits++;if(fail)throw Error('SYNTHETIC_LATE_STORE');}};
        const r=await f.receiver({extraStore});
        await assert.rejects(r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}}),/PXE_PREFERENCE_PAGE_FAILED/);
        assert.equal(r.page.acirCompleted,1);assert.equal(commits,1);fail=false;
        const state=await r.read();assert.equal(state.events.length,0);assert.equal(state.notes.length,0);
      });
      await t.test('actual BlockSynchronizer prunes committed ACIR head and event with indexes on canonical reorg',async()=>{
        const r=await f.receiver();await r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{}});
        let state=await r.read();assert.equal(state.notes.length,1);assert.equal(state.events.length,1);
        await r.stores.anchorBlockStore.setHeader(f.header);
        const canonical=BlockHeader.fromBuffer(f.header.toBuffer());canonical.globalVariables.blockNumber=3;canonical.txEffectsTreeRoot=Fr.ZERO;
        const hash=(await canonical.hash()).toString(),id={number:3,hash};
        const checkpoint={block:id,checkpoint:{number:1,hash}};
        const tips={proposed:id,checkpointed:checkpoint,proven:checkpoint,finalized:checkpoint};let cacheWipes=0;
        const node={getChainTips:async()=>tips,getBlock:async parameter=>{
          assert(parameter===3||parameter.hash instanceof BlockHash);return {header:canonical,hash:BlockHash.fromString(hash)};
        },wipeCache(){cacheWipes++;}};
        const synchronizer=new BlockSynchronizer(node,r.db,r.stores.anchorBlockStore,r.stagedStores,
          r.stores.l2TipsStore,r.syncService,{syncChainTip:'proposed'});
        try{
          await synchronizer.handleBlockStreamEvent({type:'chain-pruned',block:id,checkpointed:checkpoint,proven:checkpoint});
          state=await r.read();assert.equal(state.notes.length,0);assert.equal(state.events.length,0);
          assert.equal((await r.stores.anchorBlockStore.getBlockHeader()).getBlockNumber(),3);assert.equal(cacheWipes,1);
          assert.equal(r.syncService.syncedContracts.size,0);
          for(const name of ['note_nullifiers_by_block','note_nullifiers_by_contract','events_by_block_number','events_by_contract_selector']){
            const rows=[];for await(const entry of r.db.openMultiMap(name).entriesAsync())rows.push(entry);assert.deepEqual(rows,[]);
          }
        }finally{await synchronizer.stop();}
      });
      await t.test('canonical encrypted head and event commit without contract-sync completion',async()=>{
        let settled=false,postSettleGuards=0;const contributor={onOperationEnd(){},settle:async()=>{settled=true;}};
        const r=await f.receiver({contributor});assert.deepEqual(await r.page.processRollingPreferencePage(f.input,{contextGuard:async()=>{if(settled)postSettleGuards++;}}),{schemaVersion:1,processed:f.input.logCount,admitted:2});
        assert.equal(postSettleGuards,2,'One post-settle canonical guard plus final account guard');
        const state=await r.read();assert.equal(state.events.length,1);assert.equal(state.notes.length,1);
        assert.deepEqual(state.events[0].packedEvent.map(x=>x.toBigInt()),[1n,1n,1n,77n,1n,0n,0n,0n]);
        assert(state.notes[0].owner.equals(r.complete.address));assert.equal(state.notes[0].note.items.length,4);
        assert.equal(state.notes[0].note.items[0].toBigInt(),1n);assert.equal(state.notes[0].note.items[1].toBigInt(),1n);
        assert.equal(r.syncService.syncedContracts.size,0);assert.equal(f.counters.tagQueries,f.tagsBefore);
        assert.equal(f.counters.unexpectedCalls,0);
      });
    });
  }
  test('patched real queue: post-settle hook once, callback capture, no-hook defaults and failure drainage',async t=>{
    const order=[];let calls=0;const contributor={onOperationEnd(){order.push('end');},settle:async()=>{order.push('settle');}};
    const f=await stores(t,[contributor]);
    const options={beforeCommit:async()=>{calls++;order.push('guard');}};
    let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);
    const first=f.queue.runSynced(async()=>{order.push('work');entered();await gate;return 17;},options);
    await start;options.beforeCommit=()=>{throw Error('MUTATED_CALLBACK');};release();assert.equal(await first,17);
    assert.equal(calls,1);assert.deepEqual(order,['work','settle','guard','end']);
    assert.equal(await f.queue.runSynced(async()=>29),29);
    let getter=0;const invalid=Object.defineProperty({},'beforeCommit',{get(){getter++;return ()=>{};}});
    assert.throws(()=>f.queue.runSynced(async()=>{throw Error('MUST_NOT_RUN');},invalid),/PXE_OPERATION_COMMIT_GUARD/);assert.equal(getter,0);
    assert.throws(()=>f.queue.runSynced(async()=>{}, {beforeCommit:null}),/PXE_OPERATION_COMMIT_GUARD/);
    await assert.rejects(f.queue.runSynced(({changeSetId})=>f.validate(changeSetId),{beforeCommit:async()=>{throw Error('GUARD_VETO');}}),/GUARD_VETO/);
    assert.equal((await f.read()).length,0);
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
  test('actual application store/SDK on labelled Node IndexedDB: valid event commits, forged payload/missing nullifier does not',async t=>{
    const f=await stores(t);
    const forged={...f.request,serializedEvent:[new Fr(999),...f.request.serializedEvent.slice(1)]};
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId,[forged]));assert.equal((await f.read()).length,0);
    const absent=new Map([...f.data].map(([k,v])=>[k,{...v,nullifiers:[]} ]));
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId,[f.request],absent));assert.equal((await f.read()).length,0);
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId));assert.equal((await f.read()).length,1);
  });
  test('actual application store/SDK on labelled Node IndexedDB: staged valid event discarded on final context or canonical receipt failure',async t=>{
    const f=await stores(t);
    for(const label of ['context changed','canonical receipt changed']){
      await assert.rejects(f.queue.runSynced(async({changeSetId})=>{await f.validate(changeSetId);throw Error(label);}),new RegExp(label));
      assert.equal((await f.read()).length,0);
    }
    await f.queue.runSynced(({changeSetId})=>f.validate(changeSetId));assert.equal((await f.read()).length,1);
    await f.db.transactionAsync(()=>f.events.rollbackToBlock(3));assert.equal((await f.read()).length,0);
  });
  test('actual application store/SDK on labelled Node IndexedDB retains operation until awaited validator settles; no detached write',async t=>{
    const f=await stores(t);let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let finished=false;
    const run=f.queue.runSynced(async({changeSetId})=>{entered();await gate;await f.validate(changeSetId);throw Error('late context');});
    const caught=run.catch(e=>{assert.equal(e.message,'late context');finished=true;});
    await started;await Promise.resolve();assert.equal(finished,false);release();await caught;assert.equal((await f.read()).length,0);
  });
}
