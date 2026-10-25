import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Buffer} from 'node:buffer';
import {efficientPxeStartup,PXE_STARTUP_PINS} from './pxe-startup.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
import {beginPXEConstruction,readPXEConstruction,endPXEConstruction,retainedContractClass,rememberContractClass,startupProtocolProvider,startupPreloadedContracts,sameRegisteredBytes,nativeClassBytes} from '../shared/pxe-startup-cache.mjs';
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
 let derivations=0,writes=0,fail=false;const maps=new Map();
 const kv={openMap(name){const values=maps.get(name)??new Map();maps.set(name,values);return{getAsync:async key=>values.get(key),set:async(key,value)=>{if(fail){fail=false;throw Error('write failed');}writes++;values.set(key,Buffer.from(value));}};},async transactionAsync(fn){const backups=[...maps].map(([k,v])=>[k,new Map(v)]);try{return await fn();}catch(e){for(const [k,v]of backups){maps.get(k).clear();for(const [a,b]of v)maps.get(k).set(a,b);}throw e;}}};
 const args={Buffer,rollingRetainedClass:retainedContractClass,rollingRegisteredBytes:sameRegisteredBytes,contractArtifactToBuffer:serialize,getContractClassFromArtifact:async()=>{derivations++;return classValue();},FunctionType:{PRIVATE:'private'},allToCompletion:values=>Promise.all(values),FunctionSelector:{fromNameAndParameters:async name=>({toString:()=>name})},numToUInt8:n=>n,serializeToBuffer:(...values)=>serialize(values),SerializableContractInstancePreimage:class{constructor(value){this.value=value;}toBuffer(){return serialize(this.value);}}};
 const ContractStore=Function(...Object.keys(args),source+'\nreturn ContractStore;')(...Object.values(args));
 return {maps,create:()=>new ContractStore(kv),counts:()=>({derivations,writes}),fail:()=>{fail=true;}};
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
