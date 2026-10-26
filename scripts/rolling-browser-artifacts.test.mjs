import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,before,after} from 'node:test';
import {BarretenbergSync,BackendType} from '@aztec-foundation/bb.js';
import {loadContractArtifact,ContractArtifactSchema,getFunctionDebugMetadata,contractArtifactToBuffer,contractArtifactFromBuffer} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact,computeFunctionArtifactHash,SerializableContractInstance,computeContractAddressFromInstance} from '@aztec-labs/stdlib/contract';
import {browserContractArtifact} from './rolling-browser-artifacts.mjs';
const root=process.env.ROLLING_ARTIFACT_ROOT||fileURLToPath(new URL('../',import.meta.url));
const files={board:'billboard/target/rolling_contract-RollingBoard.json',privateFee:'apps/src/billboard/private_fee_artifact.json',bok:'experiments/private-bok/target/private_bok-PrivateBok.json'};
before(async()=>{await BarretenbergSync.initSingleton({backend:BackendType.Wasm});});
after(async()=>{await BarretenbergSync.destroySingleton();});
for(const [name,file] of Object.entries(files))test(`${name}: browser metadata projection preserves native contract and function identity`,async()=>{
 const bytes=await fs.readFile(path.join(root,file)),raw=JSON.parse(bytes),originalJson=JSON.stringify(raw),projected=browserContractArtifact(raw);
 assert.equal(JSON.stringify(raw),originalJson,'projection must not mutate compiler input');
 const restored=structuredClone(projected);restored.file_map=raw.file_map;
 restored.functions.forEach((fn,i)=>{fn.debug_symbols=raw.functions[i].debug_symbols;});
 assert.deepEqual(restored,raw,'only debug source metadata may change');
 const original=loadContractArtifact(raw),browser=loadContractArtifact(projected);
 ContractArtifactSchema.parse(JSON.parse(contractArtifactToBuffer(browser).toString()));
 const roundtrip=contractArtifactFromBuffer(contractArtifactToBuffer(browser));
 assert.equal(contractArtifactToBuffer(roundtrip).equals(contractArtifactToBuffer(browser)),true);
 const [originalClass,browserClass]=await Promise.all([getContractClassFromArtifact(original),getContractClassFromArtifact(browser)]);
 assert.deepEqual(browserClass,originalClass,'native class ID, artifact hash, verification keys and public bytecode must match');
 for(let i=0;i<original.functions.length;i++){
  const a=original.functions[i],b=browser.functions[i];
  assert.deepEqual({...b,debugSymbols:a.debugSymbols},a,'native ABI, bytecode, error types and assertion messages must match');
  assert.equal(getFunctionDebugMetadata(browser,b),undefined);
  assert.equal((await computeFunctionArtifactHash(b)).toString(),(await computeFunctionArtifactHash(a)).toString());
 }
 const instance=SerializableContractInstance.default();
 instance.currentContractClassId=originalClass.id;instance.originalContractClassId=originalClass.id;
 const originalAddress=await computeContractAddressFromInstance(instance);
 instance.currentContractClassId=browserClass.id;instance.originalContractClassId=browserClass.id;
 assert.equal((await computeContractAddressFromInstance(instance)).toString(),originalAddress.toString());
 if(name!=='bok'){
  const registration=JSON.parse(await fs.readFile(path.join(root,'.build/rolling-wallet/deployment-registration.json'),'utf8'));
  const record=registration.instances[name],deployed=SerializableContractInstance.fromBuffer(Buffer.from(record.bytes,'hex'));
  assert.equal(browserClass.id.toString(),record.classId,'projected class must match captured live deployment');
  assert.equal(deployed.originalContractClassId.toString(),browserClass.id.toString());
  assert.equal((await computeContractAddressFromInstance(deployed)).toString(),record.address);
 }
 assert.equal((await fs.readFile(path.join(root,file))).equals(bytes),true,'compiler bytes remain unchanged');
 console.log(JSON.stringify({artifact:name,originalBytes:bytes.length,browserBytes:Buffer.byteLength(JSON.stringify(projected)+'\n'),nativeSerializedBefore:contractArtifactToBuffer(original).length,nativeSerializedAfter:contractArtifactToBuffer(browser).length,functions:browser.functions.length,classId:browserClass.id.toString()}));
});
test('projection rejects malformed compiler metadata',()=>{
 assert.throws(()=>browserContractArtifact({functions:[],file_map:null}));
 assert.throws(()=>browserContractArtifact({functions:[{}],file_map:{}}));
});
