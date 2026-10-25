import {inspectTrustedNode} from '../shared/trusted-private-node.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Buffer} from 'node:buffer';
import {efficientPxeStartup,PXE_STARTUP_PINS} from './pxe-startup.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
import {beginPXEConstruction,readPXEConstruction,endPXEConstruction,retainedContractClass,rememberContractClass,startupProtocolProvider,startupPreloadedContracts,sameRegisteredBytes,nativeClassBytes,preparePXEStartup,preparePXEArtifacts,readPXEStartup} from '../shared/pxe-startup-cache.mjs';
import {fileURLToPath} from 'node:url';
import {restoreNativePxe} from './patch-pxe-operation-guards.mjs';
const nativeRoot=fileURLToPath(new URL('../',import.meta.url));
// Normalize only the known retired PXE fixture variant; builds still require
// exact installed input pins and never mutate dependencies.
function nativeSource(name){const source=fs.readFileSync(nativeRoot+name,'utf8');return name.endsWith('/dest/pxe.js')?restoreNativePxe(source,'dest/pxe.js'):source;}
const serialize=value=>Buffer.from(JSON.stringify(value));
class Field{constructor(value){this.value=value;}toString(){return this.value;}toBuffer(){return Buffer.from(this.value);}}
const classValue=()=>({id:new Field('class'),artifactHash:new Field('artifact'),privateFunctionsRoot:new Field('functions'),publicBytecodeCommitment:new Field('public'),privateFunctions:[],packedBytecode:Buffer.from('program')});

test('one construction shares one exact-node snapshot and revokes it afterward',async()=>{
 let calls=0;const node={getNodeInfo:async()=>({serial:++calls})};const handle=await beginPXEConstruction(node);
 assert.equal(readPXEConstruction(handle,node).serial,1);assert.equal(readPXEConstruction(handle,node).serial,1);assert.equal(calls,1);
 for(const [h,n]of [[{},node],[structuredClone(handle),node],[handle,{...node}]])assert.throws(()=>readPXEConstruction(h,n),/provenance/);
 endPXEConstruction(handle);assert.throws(()=>readPXEConstruction(handle,node),/provenance/);
 const next=await beginPXEConstruction(node);assert.equal(readPXEConstruction(next,node).serial,2);endPXEConstruction(next);
});
test('native class memo binds complete artifact bytes and detaches every result',async()=>{
 const artifact={functions:[],utility:'original'},value=classValue();await rememberContractClass(artifact,serialize(artifact),value,serialize);
 value.id.value='mutated caller';value.packedBytecode[0]=0;
 const first=await retainedContractClass(artifact,serialize(artifact));assert.equal(first.id.toString(),'class');assert.equal(first.packedBytecode.toString(),'program');
 first.id.value='mutated result';assert.equal((await retainedContractClass(artifact,serialize(artifact))).id.toString(),'class');
 artifact.utility='different';assert.equal(await retainedContractClass(artifact,serialize(artifact)),undefined);
 assert.equal(await retainedContractClass({...artifact},serialize(artifact)),undefined);
});
test('six pinned native built-ins seed the memo; changed artifact or class bytes reject',async()=>{
 const module=async name=>import(pathToFileURL(nativeRoot+'node_modules/@aztec-labs/'+name));
 const {contractArtifactToBuffer}=await module('stdlib/dest/abi/index.js');
 const {BundledProtocolContractsProvider}=await module('protocol-contracts/dest/provider/bundle.js');
 const nativeProvider=new BundledProtocolContractsProvider(),provider=startupProtocolProvider(nativeProvider,contractArtifactToBuffer);
 for(const name of ['ContractInstanceRegistry','ContractClassRegistry','FeeJuice']){
  const value=await provider.getProtocolContractArtifact(name);
  assert.deepEqual(nativeClassBytes(await retainedContractClass(value.artifact,contractArtifactToBuffer(value.artifact))),nativeClassBytes(value.contractClass));
 }
 const standards=[];
 for(const [path,name]of [['multi-call-entrypoint','getStandardMultiCallEntrypoint'],['auth-registry','getStandardAuthRegistry'],['handshake-registry','getStandardHandshakeRegistry']])standards.push((await module('standard-contracts/dest/'+path+'/index.js'))[name]());
 assert.equal((await startupPreloadedContracts(standards,contractArtifactToBuffer)).length,3);
 const value=await nativeProvider.getProtocolContractArtifact('FeeJuice'),name=value.artifact.name;
 value.artifact.name='changed';
 try{await assert.rejects(provider.getProtocolContractArtifact('FeeJuice'),/provenance/);}finally{value.artifact.name=name;}
 const changed={...value,contractClass:{...value.contractClass,id:value.contractClass.artifactHash}};
 await assert.rejects(startupProtocolProvider({getProtocolContractArtifact:async()=>changed},contractArtifactToBuffer).getProtocolContractArtifact('FeeJuice'),/provenance/);
 let drained=false;await assert.rejects(startupPreloadedContracts([Promise.reject(Error('failed')),Promise.resolve().then(()=>{drained=true;return value;})],contractArtifactToBuffer),/failed/);assert.equal(drained,true);
});
test('actual native Fr, selector, bytes and full artifact serializer survive detached memo reuse',async()=>{
 const {Fr}=await import(pathToFileURL(nativeRoot+'node_modules/@aztec-labs/foundation/dest/curves/bn254/index.js'));
 const {FunctionSelector,contractArtifactToBuffer}=await import(pathToFileURL(nativeRoot+'node_modules/@aztec-labs/stdlib/dest/abi/index.js'));
 const artifact={name:'fixture',functions:[],utilityBytecode:Buffer.from('utility')};
 const value={id:new Fr(1n),privateFunctions:[{selector:FunctionSelector.fromString('0x00000001'),vkHash:new Fr(2n)}],packedBytecode:Buffer.from('program')};
 await rememberContractClass(artifact,contractArtifactToBuffer(artifact),value,contractArtifactToBuffer);
 const first=await retainedContractClass(artifact,contractArtifactToBuffer(artifact));
 assert(first.id instanceof Fr);assert(first.privateFunctions[0].selector instanceof FunctionSelector);
 assert.equal(first.id.toBigInt(),1n);assert.equal(first.privateFunctions[0].selector.toString(),'0x00000001');
 first.id.asBigInt=9n;first.privateFunctions[0].selector.value=9;first.packedBytecode[0]=0;
 const second=await retainedContractClass(artifact,contractArtifactToBuffer(artifact));
 assert.equal(second.id.toBigInt(),1n);assert.equal(second.privateFunctions[0].selector.toString(),'0x00000001');assert.equal(second.packedBytecode.toString(),'program');
 artifact.utilityBytecode[0]=0;assert.equal(await retainedContractClass(artifact,contractArtifactToBuffer(artifact)),undefined);
});
test('mutation during asynchronous digest never installs a class record',async()=>{
 const artifact={functions:[]},bytes=serialize(artifact),value=classValue();
 await assert.rejects(rememberContractClass(artifact,bytes,value,()=>{artifact.changed=true;return serialize(artifact);}),/provenance/);
 assert.equal(await retainedContractClass(artifact,bytes),undefined);
});
test('persisted registration requires both exact full blobs, never just matching class ID',async()=>{
 const artifact=Buffer.from('artifact'),data=Buffer.from('class-data');
 assert.equal(await sameRegisteredBytes(artifact,data,Buffer.from(artifact),Buffer.from(data)),true);
 for(const [a,c]of [[null,data],[artifact,null],[Buffer.from('artifacT'),data],[artifact,Buffer.from('class-datA')]])assert.equal(await sameRegisteredBytes(artifact,data,a,c),false);
});
for(const name of Object.keys(PXE_STARTUP_PINS))test('pinned native transform keeps complete binding closure: '+name,()=>{
 const original=nativeSource(name),transformed=efficientPxeStartup(original,name);assertTransformBindings(original,transformed,name);
 assert.throws(()=>efficientPxeStartup(original+'\n',name),/source mismatch/);
});
function contractStoreFixture(){
 const name='node_modules/@aztec-labs/pxe/dest/storage/contract_store/contract_store.js';
 const source=efficientPxeStartup(nativeSource(name),name).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 let derivations=0,writes=0,selectorCalls=0,serializations=0,reads=0,readHook=()=>{},fail=false;const maps=new Map();
 const kv={openMap(name){const values=maps.get(name)??new Map();maps.set(name,values);return{getAsync:async key=>{reads++;readHook();return values.get(key);},set:async(key,value)=>{if(fail){fail=false;throw Error('write failed');}writes++;values.set(key,Buffer.from(value));}};},async transactionAsync(fn){const backups=[...maps].map(([k,v])=>[k,new Map(v)]);try{return await fn();}catch(e){for(const [k,v]of backups){maps.get(k).clear();for(const [a,b]of v)maps.get(k).set(a,b);}throw e;}}};
 const args={Buffer,rollingRetainedClass:retainedContractClass,rollingRegisteredBytes:sameRegisteredBytes,contractArtifactToBuffer:value=>{serializations++;return serialize(value);},getContractClassFromArtifact:async()=>{derivations++;return classValue();},FunctionType:{PRIVATE:'private'},allToCompletion:values=>Promise.all(values),FunctionSelector:{fromNameAndParameters:async name=>{selectorCalls++;return {toString:()=>name};}},numToUInt8:n=>n,serializeToBuffer:(...values)=>serialize(values),SerializableContractInstancePreimage:class{constructor(value){this.value=value;}toBuffer(){return serialize(this.value);}}};
 const ContractStore=Function(...Object.keys(args),source+'\nreturn ContractStore;')(...Object.values(args));
 return {maps,create:()=>new ContractStore(kv),counts:()=>({derivations,writes}),selectorCalls:()=>selectorCalls,serializations:()=>serializations,reads:()=>reads,onRead:fn=>{readHook=fn;},fail:()=>{fail=true;}};
}
test('actual transformed ContractStore reuses authenticated persisted blobs and repairs changed bytes',async()=>{
 const f=contractStoreFixture(),artifact={functions:[]};await rememberContractClass(artifact,serialize(artifact),classValue(),serialize);
 await f.create().addContractArtifact(artifact);assert.deepEqual(f.counts(),{derivations:0,writes:2});
 await f.create().addContractArtifact(artifact);assert.deepEqual(f.counts(),{derivations:0,writes:2});
 for(const name of ['contract_artifacts','contract_classes']){f.maps.get(name).set('class',Buffer.from('tampered'));await f.create().addContractArtifact(artifact);}
 assert.deepEqual(f.counts(),{derivations:0,writes:6});
 await f.create().addContractArtifact({functions:[]});assert.equal(f.counts().derivations,1);
});
test('failed native registration does not publish an in-memory success cache',async()=>{
 const f=contractStoreFixture(),store=f.create(),artifact={functions:[]};await rememberContractClass(artifact,serialize(artifact),classValue(),serialize);f.fail();
 await assert.rejects(store.addContractArtifact(artifact),/write failed/);await store.addContractArtifact(artifact);assert.equal(f.maps.get('contract_artifacts').has('class'),true);assert.equal(f.counts().writes,2);
});

test('actual transformed ContractStore reuses authenticated selectors but validates caller-supplied classes',async()=>{
 const {FunctionSelector}=await import(pathToFileURL(nativeRoot+'node_modules/@aztec-labs/stdlib/dest/abi/index.js'));
 const f=contractStoreFixture(),selector=FunctionSelector.fromString('0x00000001');
 const artifact={functions:[{name:'foo',functionType:'private',parameters:[]}]};
 const value={...classValue(),privateFunctions:[{selector,vkHash:new Field('vk')}]};
 await rememberContractClass(artifact,serialize(artifact),value,serialize);
 await f.create().addContractArtifact(artifact);assert.equal(f.selectorCalls(),0,'no duplicate Poseidon selector derivation');
 const duplicate={functions:[...artifact.functions,...artifact.functions]};
 await rememberContractClass(duplicate,serialize(duplicate),{...value,privateFunctions:[...value.privateFunctions,...value.privateFunctions]},serialize);
 await assert.rejects(f.create().addContractArtifact(duplicate),/Repeated function selectors/);
 await assert.rejects(f.create().addContractArtifact(duplicate,{...value,privateFunctions:[]}),/Repeated function selectors/);
 assert.equal(f.selectorCalls(),2,'supplied class cannot suppress native artifact selector validation');
});

test('actual trusted readiness snapshot supplies construction metadata without a second node-info RPC',async()=>{
 const hash=n=>'0x'+n.toString(16).padStart(64,'0'),rollup='0x'+'12'.repeat(20);let calls=0;
 const info={l1ChainId:31337,rollupVersion:1,realProofs:false,l1ContractAddresses:{rollupAddress:rollup}};
 const id=n=>({number:n,hash:hash(n)}),tip=n=>({block:id(n)});
 const node={getNodeInfo:async()=>{calls++;return info;},getChainTips:async()=>({proposed:id(8),checkpointed:tip(7),proven:tip(4),finalized:tip(3)}),
  getWorldStateSyncStatus:async()=>({latestBlockNumber:8,latestBlockHash:hash(8),finalizedBlockNumber:3,oldestHistoricBlockNumber:0,treesAreSynched:true}),
  getSyncedL1Timestamp:async()=>990n,getBlockData:async n=>({header:{globalVariables:{blockNumber:n}},blockHash:hash(n)})};
 const snapshot=await inspectTrustedNode(node,{expectedNetworkScope:{chainId:'31337',version:'1',rollup},proofsEnabled:false,nowSeconds:1000});assert.equal(calls,1);
 const construction=await beginPXEConstruction(node,{nodeSnapshot:snapshot});assert.equal(calls,1);
 assert.equal(readPXEConstruction(construction,node).l1ChainId,31337);
 for(const [candidate,client]of [[{},node],[structuredClone(snapshot),node],[snapshot,{...node}]])await assert.rejects(beginPXEConstruction(client,{nodeSnapshot:candidate}));
 assert.equal(calls,1,'invalid supplied provenance never falls back to an RPC');endPXEConstruction(construction);
});


async function startupFixture(){
 const module=async name=>import(pathToFileURL(nativeRoot+'node_modules/@aztec-labs/'+name));
 const {contractArtifactToBuffer}=await module('stdlib/dest/abi/index.js');
 const {BundledProtocolContractsProvider}=await module('protocol-contracts/dest/provider/bundle.js');
 const nativeProvider=new BundledProtocolContractsProvider(),preloaded=[];
 for(const [path,name]of [['multi-call-entrypoint','getStandardMultiCallEntrypoint'],['auth-registry','getStandardAuthRegistry'],['handshake-registry','getStandardHandshakeRegistry']])preloaded.push((await module('standard-contracts/dest/'+path+'/index.js'))[name]);
 const hash=n=>'0x'+n.toString(16).padStart(64,'0'),rollup='0x'+'12'.repeat(20);let infoReads=0,genesisReads=0;
 const info={l1ChainId:31337,rollupVersion:1,realProofs:false,l1ContractAddresses:{rollupAddress:rollup}};
 const id=n=>({number:n,hash:hash(n)}),tip=n=>({block:id(n)});
 const node={getNodeInfo:async()=>{infoReads++;return info;},getChainTips:async()=>({proposed:id(8),checkpointed:tip(7),proven:tip(4),finalized:tip(3)}),
  getWorldStateSyncStatus:async()=>({latestBlockNumber:8,latestBlockHash:hash(8),finalizedBlockNumber:3,oldestHistoricBlockNumber:0,treesAreSynched:true}),
  getSyncedL1Timestamp:async()=>990n,getBlockData:async n=>({header:{globalVariables:{blockNumber:n}},blockHash:hash(n)}),getBlock:async n=>{assert.equal(n,0);genesisReads++;return {hash:hash(99)};}};
 const nodeSnapshot=await inspectTrustedNode(node,{expectedNetworkScope:{chainId:'31337',version:'1',rollup},proofsEnabled:false,nowSeconds:1000});
 return {node,nodeSnapshot,info,options:{nodeSnapshot,artifacts:preparePXEArtifacts({protocolProvider:nativeProvider,preloaded,serialize:contractArtifactToBuffer}),genesisFallback:hash(0)},artifactOptions:{protocolProvider:nativeProvider,preloaded,serialize:contractArtifactToBuffer},nativeProvider,counts:()=>({infoReads,genesisReads}),module};
}
test('native prewarm hands identical built-ins and genesis to construction without account/store work',async()=>{
 const f=await startupFixture(),preparation=await preparePXEStartup(f.node,f.options);
 assert.deepEqual(f.counts(),{infoReads:1,genesisReads:1});
 const handle=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot,preparation}),ready=readPXEStartup(handle,f.node);
 assert.equal(ready.initialBlockHash,'0x'+(99).toString(16).padStart(64,'0'));
 const {SerializableContractInstancePreimage}=await f.module('stdlib/dest/contract/index.js');
 const compare=(a,b)=>{assert.deepEqual(f.artifactOptions.serialize(a.artifact),f.artifactOptions.serialize(b.artifact));assert.deepEqual(nativeClassBytes(a.contractClass),nativeClassBytes(b.contractClass));assert.deepEqual(new SerializableContractInstancePreimage(a.instance).toBuffer(),new SerializableContractInstancePreimage(b.instance).toBuffer());assert.equal(a.address.toString(),b.address.toString());};
 for(const name of ['ContractInstanceRegistry','ContractClassRegistry','FeeJuice'])compare(await ready.protocolContractsProvider.getProtocolContractArtifact(name),await f.nativeProvider.getProtocolContractArtifact(name));
 assert(Object.isFrozen(ready.protocolContractsProvider)&&Object.isFrozen(ready.preloadedContractsProvider));
 const values=await ready.preloadedContractsProvider.getPreloadedContracts();for(let i=0;i<3;i++)compare(values[i],await f.artifactOptions.preloaded[i]());
 values[0].instance.salt={toString:()=>'-1'};assert.notEqual((await ready.preloadedContractsProvider.getPreloadedContracts())[0].instance.salt.toString(),'-1');
 for(const [candidate,node]of [[{},f.node],[structuredClone(preparation),f.node],[preparation,{...f.node}]])await assert.rejects(beginPXEConstruction(node,{nodeSnapshot:f.nodeSnapshot,preparation:candidate}));
 assert.deepEqual(f.counts(),{infoReads:1,genesisReads:1});endPXEConstruction(handle);assert.throws(()=>readPXEStartup(handle,f.node));
 const again=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot,preparation});assert(readPXEStartup(again,f.node));endPXEConstruction(again);
});
test('prewarmed built-in mutation rejects and failed preparation drains genesis',async()=>{
 const f=await startupFixture(),preparation=await preparePXEStartup(f.node,f.options),handle=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot,preparation}),ready=readPXEStartup(handle,f.node);
 const value=await f.nativeProvider.getProtocolContractArtifact('FeeJuice'),old=value.artifact.name;value.artifact.name='mutated';
 try{await assert.rejects(ready.protocolContractsProvider.getProtocolContractArtifact('FeeJuice'),/provenance/);}finally{value.artifact.name=old;endPXEConstruction(handle);}
 const held=Promise.withResolvers();let settled=false;f.node.getBlock=()=>held.promise;
 const failure=preparePXEStartup(f.node,{...f.options,artifacts:preparePXEArtifacts({...f.artifactOptions,preloaded:[()=>Promise.reject(Error('builtin failed'))]})}).finally(()=>{settled=true;});failure.catch(()=>{});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(settled,false);held.resolve(undefined);await assert.rejects(failure,/builtin failed/);
});
test('actual native genesis expression skips only an authenticated construction prewarm',async()=>{
 const name='node_modules/@aztec-labs/pxe/dest/pxe.js',source=efficientPxeStartup(nativeSource(name),name);
 const start=source.indexOf('const rollingStartup=rollingConstruction?'),end=source.indexOf('const proverEnabled',start);assert(start>0&&end>start);
 const run=Function('rollingCreationStartup','return async function(rollingConstruction,node,BlockNumber,GENESIS_BLOCK_HEADER_HASH){'+source.slice(start,end)+'return initialBlockHash;}')(readPXEStartup);
 const f=await startupFixture(),preparation=await preparePXEStartup(f.node,f.options),handle=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot,preparation});
 assert.equal(await run(handle,f.node,{ZERO:0},'fallback'),readPXEStartup(handle,f.node).initialBlockHash);assert.equal(f.counts().genesisReads,1);
 const plain=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot});await run(plain,f.node,{ZERO:0},'fallback');assert.equal(f.counts().genesisReads,2);
 f.node.getBlock=async()=>undefined;assert.equal(await run(undefined,f.node,{ZERO:0},'fallback'),'fallback');
 endPXEConstruction(handle);endPXEConstruction(plain);
});

test('immutable preparation starts without a node and node binding does not serialize genesis behind it',async()=>{
 const f=await startupFixture(),held=Promise.withResolvers();let reads=0;
 const artifacts=preparePXEArtifacts({...f.artifactOptions,protocolProvider:{getProtocolContractArtifact:async name=>{reads++;await held.promise;return f.nativeProvider.getProtocolContractArtifact(name);}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,3);assert.equal(f.counts().genesisReads,0);
 let finished=false;const binding=preparePXEStartup(f.node,{...f.options,artifacts}).then(value=>{finished=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.counts().genesisReads,1);assert.equal(finished,false);
 held.resolve();const preparation=await binding;
 const handle=await beginPXEConstruction(f.node,{nodeSnapshot:f.nodeSnapshot,preparation});assert(readPXEStartup(handle,f.node));endPXEConstruction(handle);
 await assert.rejects(preparePXEStartup(f.node,{...f.options,artifacts:{}}),/provenance/);
});

test('authenticated registration uses two full serializations and fixed numeric subspans',async()=>{
 const f=contractStoreFixture(),artifact={functions:[],utility:'original'};await rememberContractClass(artifact,serialize(artifact),classValue(),serialize);
 for(const name of ['registration-serialize','registration-class-cache','registration-stored-read','registration-stored-write'])performance.clearMeasures('rolling.proof.native.phase.'+name);
 await f.create().addContractArtifact(artifact);assert.equal(f.serializations(),2);
 for(const name of ['registration-serialize','registration-class-cache','registration-stored-read','registration-stored-write']){
  const entries=performance.getEntriesByName('rolling.proof.native.phase.'+name);assert.equal(entries.length,1);assert(Number.isFinite(entries[0].duration)&&entries[0].duration>=0);assert.equal(entries[0].detail,null);
 }
 const store=f.create();await store.addContractArtifact(artifact);assert.equal(f.serializations(),4);
 await store.addContractArtifact(artifact);assert.equal(f.serializations(),6,'memory-cache early return still fences asynchronous mutation');
});
test('mutation during stored reads rejects without poisoning the authenticated persisted snapshot',async()=>{
 const f=contractStoreFixture(),store=f.create(),artifact={functions:[],utility:'original'},original=serialize(artifact);
 await rememberContractClass(artifact,original,classValue(),serialize);
 f.onRead(()=>{artifact.utility='mutated';});
 await assert.rejects(store.addContractArtifact(artifact),/artifact changed/);
 assert.deepEqual(f.maps.get('contract_artifacts').get('class'),original);
 f.onRead(()=>{});artifact.utility='original';const before=f.serializations(),beforeReads=f.reads();await store.addContractArtifact(artifact);
 assert.equal(f.serializations()-before,2);assert.equal(f.reads()-beforeReads,2,'failed publication did not install the memory cache');assert.equal(f.counts().writes,2);
});
