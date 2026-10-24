import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {OWNER_DISCOVERY_PINS,transformOwnerDiscovery,inspectOwnerDiscovery,patchOwnerDiscovery} from './patch-pxe-owner-discovery.mjs';
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
const hook=registerHooks({load(url,context,next){const result=next(url,context);const pin=OWNER_DISCOVERY_PINS.find(p=>url===pathToFileURL(join(nativeRoot,p.path)).href);return pin?{...result,source:sha(String(result.source))===pin.after?String(result.source):transformOwnerDiscovery(String(result.source),pin.path)}:result;}});
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
 const args={callContext:{contractAddress:contract},scopes:[owner],changeSetId,
  anchorBlockHeader:{toBlockParameter:async()=>anchor,globalVariables:{timestamp:1000n}},
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
