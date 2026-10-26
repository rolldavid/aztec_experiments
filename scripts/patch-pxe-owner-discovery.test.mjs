import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {OWNER_DISCOVERY_PINS,transformOwnerDiscovery,inspectOwnerDiscovery,patchOwnerDiscovery} from './patch-pxe-owner-discovery.mjs';
import {skipUnchangedOwnerFacts,OWNER_FACT_WRITE_PATH} from './pxe-owner-fact-writes.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const nativeRoot=await realpath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url));
const originals=new Map(await Promise.all(OWNER_DISCOVERY_PINS.map(async p=>[p.path,await readFile(new URL('./testing/fixtures/pxe-owner-discovery-6.0.0/'+p.path,import.meta.url),'utf8')])));
// These three production files do not overlap any other installed dependency patch.
for(const pin of OWNER_DISCOVERY_PINS)assert.equal(sha(originals.get(pin.path)),pin.before);
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'owner-oracle-patch-')));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),JSON.stringify({name:'@aztec-labs/pxe',version:'6.0.0'}));
 for(const [name,source]of originals){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),source);}
 return root;
}
test('all three pinned installed files apply idempotently and inspect exactly',async t=>{
 const root=await fixture(t);assert.equal((await inspectOwnerDiscovery(root)).state,'original');
 assert.equal((await patchOwnerDiscovery(root)).state,'patched');assert.equal((await patchOwnerDiscovery(root)).state,'patched');
 for(const pin of OWNER_DISCOVERY_PINS)assert.equal(sha(await readFile(join(root,pin.path))),pin.after);
});
test('whole set is authenticated before writes; unknown input changes nothing',async t=>{
 const root=await fixture(t),last=OWNER_DISCOVERY_PINS.at(-1);await writeFile(join(root,last.path),'unknown source');
 await assert.rejects(patchOwnerDiscovery(root),/PATCH_SOURCE/);
 assert.equal(sha(await readFile(join(root,OWNER_DISCOVERY_PINS[0].path))),OWNER_DISCOVERY_PINS[0].before);
});
test('interrupted exact partial installation completes, unknown version fails',async t=>{
 const root=await fixture(t),first=OWNER_DISCOVERY_PINS[0];
 await writeFile(join(root,first.path),transformOwnerDiscovery(originals.get(first.path),first.path));
 assert.equal((await inspectOwnerDiscovery(root)).state,'mixed');assert.equal((await patchOwnerDiscovery(root)).state,'patched');
 await writeFile(join(root,'package.json'),JSON.stringify({name:'@aztec-labs/pxe',version:'6.1.0'}));
 await assert.rejects(inspectOwnerDiscovery(root),/PATCH_VERSION/);
});
test('symlink target and changed source reject before mutation',async t=>{
 const root=await fixture(t),pin=OWNER_DISCOVERY_PINS[0],file=join(root,pin.path),outside=join(root,'outside');
 await writeFile(outside,originals.get(pin.path));await rm(file);await symlink(outside,file);
 await assert.rejects(patchOwnerDiscovery(root),/PATCH_PATH/);
 assert.throws(()=>transformOwnerDiscovery(originals.get(pin.path)+'\n',pin.path),/PATCH_SOURCE/);
});
// Execute the actual installed native classes through the same exact source
// transform, without changing the shared developer dependency tree.
const hook=registerHooks({load(url,context,next){const result=next(url,context);const pin=OWNER_DISCOVERY_PINS.find(p=>url===pathToFileURL(join(nativeRoot,p.path)).href);if(!pin)return result;
 const source=sha(String(result.source))===pin.after?String(result.source):transformOwnerDiscovery(String(result.source),pin.path);
 return {...result,source:pin.path.endsWith('/utility_execution_oracle.js')?assertTransformBindings(source,skipUnchangedOwnerFacts(source),OWNER_FACT_WRITE_PATH):source};}});
const {LogService}=await import(pathToFileURL(join(nativeRoot,'dest/logs/log_service.js')));
const {UtilityExecutionOracle}=await import(pathToFileURL(join(nativeRoot,'dest/contract_function_simulator/oracle/utility_execution_oracle.js')));
const {buildACIRCallback}=await import(pathToFileURL(join(nativeRoot,'dest/contract_function_simulator/oracle/acir_callback.js')));
const {ORACLE_REGISTRY}=await import(pathToFileURL(join(nativeRoot,'dest/contract_function_simulator/oracle/oracle_registry.js')));
const {EphemeralArray}=await import(pathToFileURL(join(nativeRoot,'dest/contract_function_simulator/noir-structs/ephemeral_array.js')));
const {Fr}=await import('@aztec-labs/foundation/curves/bn254');
const {AztecAddress}=await import('@aztec-labs/stdlib/aztec-address');
const {AppTaggingSecret,AppTaggingSecretKind}=await import('@aztec-labs/stdlib/logs');
hook.deregister();
function nativeFixture(){
 const owner=new AztecAddress(new Fr(42)),contract=new AztecAddress(new Fr(43)),changeSetId='owner-test',anchor={number:10,hash:new Fr(1)};
 const reads={address:0,key:0,queries:[],indexes:[]};
 const args={factService:{getFactCollection:async()=>undefined},callContext:{contractAddress:contract},scopes:[owner],changeSetId,
  anchorBlockHeader:{getBlockNumber:()=>10,toBlockParameter:async()=>anchor,globalVariables:{timestamp:1000n}},
  l2TipsStore:{getL2Tips:async()=>({finalized:{block:{number:8}}})},
  addressStore:{getCompleteAddress:async()=>{reads.address++;return undefined;}},
  keyStore:{hasAccount:async()=>{reads.key++;throw Error('owner stream must not enumerate keys');}},
  recipientTaggingStore:{getHighestFinalizedIndex:async(secret,scope)=>{reads.indexes.push([secret,scope]);return undefined;},getHighestAgedIndex:async()=>undefined},
  aztecNode:{getPrivateLogsByTags:async query=>{reads.queries.push(query);return query.tags.map(()=>[]);}},
 };
 const service=new LogService(args.aztecNode,args.anchorBlockHeader,args.l2TipsStore,args.keyStore,args.recipientTaggingStore,{},args.addressStore,args.scopes,changeSetId);
 return {args,service,owner,contract,reads,anchor};
}
test('actual native owner scan keeps scope, anchored native tagging window and supplied secret deduplication without ECDH',async()=>{
 const f=nativeFixture(),secret=new AppTaggingSecret(new Fr(99),f.contract,AppTaggingSecretKind.UNCONSTRAINED);
 assert.deepEqual(await f.service.fetchTaggedLogs(f.contract,f.owner,[secret,secret],true),[]);
 assert.equal(f.reads.address,0);assert.equal(f.reads.key,0);assert.equal(f.reads.indexes.length,1);
 assert.equal(f.reads.indexes[0][0],secret);assert.equal(f.reads.indexes[0][1],f.args.changeSetId);
 assert(f.reads.queries.length>0);for(const q of f.reads.queries){assert.equal(q.referenceBlock,f.anchor);assert.equal(q.toBlock,11);assert.equal(q.includeEffects,true);}
});
test('actual native owner scan rejects unauthorized scope before any node or key read',async()=>{
 const f=nativeFixture();await assert.rejects(f.service.fetchTaggedLogs(f.contract,new AztecAddress(new Fr(77)),[],true),/allowed scopes/);
 assert.equal(f.reads.address,0);assert.equal(f.reads.queries.length,0);
});
test('ordinary native oracle still performs native address discovery',async()=>{
 const f=nativeFixture();assert.deepEqual(await f.service.fetchTaggedLogs(f.contract,f.owner,[]),[]);assert.equal(f.reads.address,1);
});
test('actual native utility + registry route owner alias with identical ephemeral ABI',async()=>{
 const f=nativeFixture(),oracle=new UtilityExecutionOracle(f.args),secret=new Fr(99);
 const provided=EphemeralArray.fromValues(oracle.ephemeralArrayService,[{secret,mode:AppTaggingSecretKind.UNCONSTRAINED}]);
 const result=await oracle.getPendingOwnerTaggedLogsV1(f.owner,provided);
 assert.deepEqual(result.readAll(oracle.ephemeralArrayService),[]);assert.equal(f.reads.address,0);assert.equal(f.reads.indexes.length,1);
 assert.equal(ORACLE_REGISTRY.aztec_utl_getPendingOwnerTaggedLogsV1,ORACLE_REGISTRY.aztec_utl_getPendingTaggedLogsV2);
 const callbacks=buildACIRCallback(oracle);
 const slot=oracle.ephemeralArrayService.newArray([]);
 const wire=await callbacks.aztec_utl_getPendingOwnerTaggedLogsV1([f.owner.toField().toString()],[slot.toString()]);
 assert.equal(wire.length,1);assert.equal(f.reads.address,0);
 await assert.rejects(callbacks.aztec_utl_getPendingOwnerTaggedLogsV1([new AztecAddress(new Fr(77)).toField().toString()],[slot.toString()]),/allowed scopes/);
});


const {openTmpStore}=await import('@aztec-labs/kv-store/lmdb-v2');
const {FactStore,FactService}=await import(pathToFileURL(join(nativeRoot,'dest/storage/fact_store/index.js')));
const {RecipientTaggingStore}=await import(pathToFileURL(join(nativeRoot,'dest/storage/tagging_store/recipient_tagging_store.js')));
const {StagedWriteCoordinator}=await import(pathToFileURL(join(nativeRoot,'dest/storage/staged_write_coordinator.js')));
const {BlockHash}=await import('@aztec-labs/stdlib/block');
const {TxHash}=await import('@aztec-labs/stdlib/tx');
const {UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN:WINDOW}=await import(pathToFileURL(join(nativeRoot,'dest/tagging/constants.js')));
const {siloNoteHash,computeUniqueNoteHash}=await import('@aztec-labs/stdlib/hash');
function testLog(n,id=n){return {txHash:new TxHash(new Fr(id)),blockHash:new BlockHash(new Fr(n)),blockNumber:n,
 blockTimestamp:990n,txIndexWithinBlock:0,logIndex:0,logData:[new Fr(id),new Fr(id+100)],noteHashes:[],nullifiers:[new Fr(id+200)]};}
async function progressFixture(t){
 const f=nativeFixture(),db=await openTmpStore('owner-log-progress',true,16384);
 t.after(()=>db.close());
 const facts=new FactStore(db),tagging=new RecipientTaggingStore(db),writes=new StagedWriteCoordinator({kvStore:db,stagedStores:[facts,tagging]});
 f.args.factService=new FactService(facts,[f.owner]);f.args.recipientTaggingStore=tagging;
 const factWrites={deletes:0,records:0};
 for(const [method,counter] of [['deleteFactCollection','deletes'],['recordFact','records']]){const original=f.args.factService[method].bind(f.args.factService);f.args.factService[method]=(...args)=>{factWrites[counter]++;return original(...args);};}
 const state={logs:[],anchor:10,finalized:0,query:undefined,failValidation:false,stored:0};
 f.args.anchorBlockHeader={getBlockNumber:()=>state.anchor,toBlockParameter:async()=>({number:state.anchor,hash:new Fr(state.anchor)}),globalVariables:{timestamp:1000n}};
 f.args.l2TipsStore={getL2Tips:async()=>({finalized:{block:{number:state.finalized}}})};
 f.args.aztecNode={getPrivateLogsByTags:async q=>{f.reads.queries.push(q);return state.query?state.query(q):q.tags.map((_,i)=>i===0?state.logs:[]);},
  findLeavesIndexes:async()=>{if(state.failValidation)throw Error('validation failed');return [undefined];},
  getTxEffect:async()=>{throw Error('old partial transaction must stay in validation cache');}};
 f.args.noteStore={addNotes:async notes=>{state.stored+=notes.length;}};
 const start=()=>{
  const changeSetId=writes.begin(),oracle=new UtilityExecutionOracle({...f.args,changeSetId});
  const empty=()=>EphemeralArray.fromValues(oracle.ephemeralArrayService,[]);
  return {oracle,changeSetId,fetch:async(secret=new Fr(99),scope=f.owner)=>{
   const input=EphemeralArray.fromValues(oracle.ephemeralArrayService,[{secret,mode:AppTaggingSecretKind.UNCONSTRAINED}]);
   return (await oracle.getPendingOwnerTaggedLogsV1(scope,input)).readAll(oracle.ephemeralArrayService);
  },finish:async(notes=[])=>oracle.validateAndStoreEnqueuedNotesAndEvents(EphemeralArray.fromValues(oracle.ephemeralArrayService,notes),empty(),f.owner),
  commit:()=>writes.commit(changeSetId),abort:()=>writes.abort(changeSetId)};
 };
 const sync=async()=>{const op=start();try{const result=await op.fetch();await op.finish();await op.commit();return result;}catch(e){op.abort();throw e;}};
 return {...f,db,facts,writes,factWrites,state,start,sync};
}
test('owner progress skips exact committed logs, accepts late same-index arrivals and bounds retained identities',async t=>{
 const f=await progressFixture(t);f.state.logs=[testLog(8),testLog(9)];assert.equal((await f.sync()).length,2);
 f.state.anchor=11;assert.equal((await f.sync()).length,0);
 f.state.logs.push(testLog(11));assert.equal((await f.sync()).length,1);
 f.state.logs=[testLog(11)];assert.equal((await f.sync()).length,0);
 const op=f.start();await op.fetch();const progress=[...op.oracle.ownerDiscoveryProgress.values()][0];
 const stored=await f.facts.getFactCollection(progress.key,op.changeSetId);assert.equal(stored.facts.length,1);op.abort();
 f.state.logs=[testLog(8)];assert.equal((await f.sync()).length,1,'evicted identity is conservatively processed again');
});
test('native finality window expansion exposes an older unseen block without dropping it',async t=>{
 const f=await progressFixture(t),old=testLog(8),newlyExposed=testLog(9,99);let expanded=false;
 f.state.query=q=>q.tags.map((_,i)=>i===0?(q.tags.length===1?[newlyExposed]:q.tags.length===WINDOW&&!expanded?[old]:[]):[]);
 assert.equal((await f.sync()).length,1);
 f.state.anchor=11;f.state.finalized=10;
 f.state.query=q=>{if(q.tags.length===1){expanded=true;return [[newlyExposed]];}return q.tags.map((_,i)=>i===0&&!expanded?[old]:[]);};
 const result=await f.sync();assert.equal(result.length,1);assert.equal(result[0].context.blockNumber,9);assert(expanded);
});
test('unfinished or aborted owner processing never suppresses logs',async t=>{
 const f=await progressFixture(t);f.state.logs=[testLog(8)];
 let op=f.start();assert.equal((await op.fetch()).length,1);await op.commit();
 op=f.start();assert.equal((await op.fetch()).length,1);await op.finish();op.abort();
 assert.equal((await f.sync()).length,1);assert.equal((await f.sync()).length,0);
});
test('native fact rollback and changed origin rediscover logs; future anchor records never hide historical logs',async t=>{
 const f=await progressFixture(t);f.state.logs=[testLog(8),testLog(9)];await f.sync();
 await f.db.transactionAsync(()=>f.facts.rollbackToBlock(8));
 assert.equal((await f.sync()).length,1);
 f.state.logs=[{...testLog(9),blockHash:new BlockHash(new Fr(109))}];assert.equal((await f.sync()).length,1);
 f.state.anchor=8;f.state.logs=[testLog(8)];assert.equal((await f.sync()).length,1,'previous replacement evicted old identity; historical query remains conservative');
});
test('owner progress remains scoped to secret, owner and contract',async t=>{
 const f=await progressFixture(t);f.state.logs=[testLog(8)];await f.sync();
 let op=f.start();assert.equal((await op.fetch(new Fr(100))).length,1);op.abort();
 op=f.start();await assert.rejects(op.fetch(new Fr(99),new AztecAddress(new Fr(77))),/allowed scopes/);op.abort();
 const contract=f.args.callContext.contractAddress;f.args.callContext={contractAddress:new AztecAddress(new Fr(144))};
 assert.equal((await f.sync()).length,1);f.args.callContext={contractAddress:contract};assert.equal((await f.sync()).length,0);
});
test('old private partial ciphertext stays cached for later native note validation, and validation failure records no progress',async t=>{
 const f=await progressFixture(t),log=testLog(8),noteHash=new Fr(77),noteNonce=new Fr(78);
 log.noteHashes=[await computeUniqueNoteHash(noteNonce,await siloNoteHash(f.contract,noteHash))];f.state.logs=[log];
 const request={contractAddress:f.contract,owner:f.owner,storageSlot:new Fr(1),randomness:new Fr(2),noteNonce,content:[new Fr(5)],noteHash,nullifier:new Fr(7),txHash:log.txHash};
 let op=f.start();await op.fetch();f.state.failValidation=true;await assert.rejects(op.finish([request]),/validation failed/);op.abort();
 f.state.failValidation=false;assert.equal((await f.sync()).length,1);
 op=f.start();assert.equal((await op.fetch()).length,0);await op.finish([request]);await op.commit();assert.equal(f.state.stored,1);
});

test('owner progress does not mistake copied or changed ciphertext for an already processed log',async t=>{
 const f=await progressFixture(t),log=testLog(8);f.state.logs=[log];await f.sync();
 f.state.logs=[{...log,logData:[...log.logData,new Fr(99)]},{...log,txHash:new TxHash(new Fr(999))},{...log,noteHashes:[new Fr(33)]}];
 assert.equal((await f.sync()).length,3);
 const fresh=await progressFixture(t);fresh.state.logs=[log];assert.equal((await fresh.sync()).length,1,'empty native store restores without progress metadata');
});

test('identical native owner facts stage no delete or record writes, including empty collection',async t=>{
 const f=await progressFixture(t);await f.sync();assert.deepEqual(f.factWrites,{deletes:0,records:0});
 f.state.logs=[testLog(8),testLog(9)];await f.sync();assert.deepEqual(f.factWrites,{deletes:1,records:2});
 f.state.anchor=11;f.state.logs.reverse();await f.sync();assert.deepEqual(f.factWrites,{deletes:1,records:2},'order does not change fact set');
 f.state.logs=[testLog(9)];await f.sync();assert.deepEqual(f.factWrites,{deletes:2,records:3},'window shrink must prune');
 f.state.logs=[];await f.sync();assert.deepEqual(f.factWrites,{deletes:3,records:3},'empty window removes old records');
 await f.sync();assert.deepEqual(f.factWrites,{deletes:3,records:3});
});
for(const change of ['origin-number','origin-hash','payload','type','missing-origin'])test('native changed '+change+' is replaced before progress commit',async t=>{
 const f=await progressFixture(t);f.state.logs=[testLog(8)];await f.sync();
 const op=f.start();await op.fetch();const progress=[...op.oracle.ownerDiscoveryProgress.values()][0],record=[...progress.records.values()][0];
 // Write through the real native staged store after discovery, as another
 // operation contributor could. The final comparison must read this staged view.
 await f.facts.deleteFactCollection(progress.key,op.changeSetId);
 const origin=change==='missing-origin'?undefined:{...record.origin,...(change==='origin-number'?{blockNumber:7}:change==='origin-hash'?{blockHash:new Fr(777)}:{})};
 await f.facts.recordFact(progress.key,change==='type'?new Fr(777):progress.type,[change==='payload'?new Fr(778):record.digest],origin,op.changeSetId);
 const before={...f.factWrites};await op.finish();assert.deepEqual(f.factWrites,{deletes:before.deletes+1,records:before.records+1});await op.commit();
 const next=f.start();await next.fetch();const actual=await f.facts.getFactCollection(progress.key,next.changeSetId);assert.equal(actual.facts.length,1);
 assert(actual.facts[0].payload[0].equals(record.digest));assert(actual.facts[0].factTypeId.equals(progress.type));
 assert.equal(actual.facts[0].originBlock.blockNumber,8);assert(actual.facts[0].originBlock.blockHash.equals(record.origin.blockHash));next.abort();
 const saved={...f.factWrites};await f.sync();assert.deepEqual(f.factWrites,saved);
});

test('browser fact-write projection accepts only exact installed source and leaves it untouched',()=>{
 const pin=OWNER_DISCOVERY_PINS.find(pin=>pin.path.endsWith('/utility_execution_oracle.js'));
 const installed=transformOwnerDiscovery(originals.get(pin.path),pin.path),before=sha(installed);
 assert.notEqual(sha(skipUnchangedOwnerFacts(installed)),before);assert.equal(before,pin.after);
 assert.throws(()=>skipUnchangedOwnerFacts(installed+'\n'),/OWNER_FACT_WRITE_SOURCE/);
 assert.throws(()=>skipUnchangedOwnerFacts(originals.get(pin.path)),/OWNER_FACT_WRITE_SOURCE/);
 assert.throws(()=>skipUnchangedOwnerFacts(skipUnchangedOwnerFacts(installed)),/OWNER_FACT_WRITE_SOURCE/);
});
