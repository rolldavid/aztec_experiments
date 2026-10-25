import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {contractArtifactToBuffer,loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {startupProtocolProvider} from '../shared/pxe-startup-cache.mjs';
import {prepareNativeContractAssets,relocateNativeContract,verifyNativeContractCopy,browserSdkEntry,browserSchnorrEntry} from './native-contract-assets.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),records=await prepareNativeContractAssets(root),nativeFetch=globalThis.fetch;
const methods={ContractClassRegistry:'getCanonicalClassRegistry',ContractInstanceRegistry:'getCanonicalInstanceRegistry',FeeJuice:'getCanonicalFeeJuice',MultiCallEntrypoint:'getStandardMultiCallEntrypoint',AuthRegistry:'getStandardAuthRegistry',HandshakeRegistry:'getStandardHandshakeRegistry'};
after(async()=>{await BarretenbergSync.destroySingleton();});
for(const [loader,record]of records)test('actual '+record.name+' native provider retains artifact/class pins with exact fetched bytes',async()=>{
 const original=await readFile(path.join(root,loader),'utf8'),bytes=await readFile(path.join(root,record.input));
 let code=assertTransformBindings(original,relocateNativeContract(original,record),loader);
 verifyNativeContractCopy(bytes,record);assert.throws(()=>verifyNativeContractCopy(Buffer.concat([bytes,Buffer.from([0])]),record),/bytes changed/);
 assert.throws(()=>relocateNativeContract(original+'\n',record),/loader changed/);
 code=code.replaceAll('import.meta.url',JSON.stringify('https://board.test/wallet/aztec_bundle.js')).replace(/(from\s+)(['"])([^'"]+)\2/g,(_,prefix,quote,name)=>prefix+JSON.stringify(name.startsWith('.')?pathToFileURL(path.resolve(root,path.dirname(loader),name)).href:import.meta.resolve(name)));
 const integrity='sha256-'+Buffer.from(record.sha256,'hex').toString('base64');let requests=0,tamper=false;
 globalThis.fetch=async request=>{
  assert(request instanceof Request);assert.equal(request.url,'https://board.test/wallet/'+record.output+'?sha256='+record.sha256);
  assert.equal(request.integrity,integrity);assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');requests++;
  const delivered=Buffer.from(bytes);if(tamper)delivered[delivered.length-1]^=1;
  return nativeFetch(new Request('data:application/json;base64,'+delivered.toString('base64'),{integrity:request.integrity}));
 };
 try{
  const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const value=await native[methods[record.name]]();assert.equal(requests,1);
  assert.deepEqual(contractArtifactToBuffer(value.artifact),contractArtifactToBuffer(loadContractArtifact(JSON.parse(bytes))));
  const verified=startupProtocolProvider({getProtocolContractArtifact:async()=>value},contractArtifactToBuffer);
  assert.equal((await verified.getProtocolContractArtifact(record.name)).contractClass.id.toString(),value.contractClass.id.toString());
  assert.equal(await native[methods[record.name]](),value);assert.equal(requests,1,'native provider singleton still owns successful initialization');
  tamper=true;const fresh=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// fresh test module').toString('base64'));
  await assert.rejects(fresh[methods[record.name]](),error=>/integrity/i.test(String(error.cause??error)));assert.equal(requests,2);
 }finally{globalThis.fetch=nativeFetch;}
});
test('browser entry removes only obsolete eager exports while CLI source stays intact',async()=>{
 const source=await readFile(path.join(root,'shared/sdk-entry.mjs'),'utf8'),browser=browserSdkEntry(source);
 assert(source.includes('export { FeeJuiceArtifact }'));assert(!browser.includes('export { FeeJuiceArtifact }'));
 assert(!browser.includes('SchnorrAccountContractArtifact'));assert(browser.includes('SchnorrInitializerlessAccountContractArtifact'));
 assert.throws(()=>browserSdkEntry(source.replace('FeeJuiceArtifact','ChangedArtifact')),/boundary changed/);
 const barrel=await readFile(path.join(root,'node_modules/@aztec-labs/accounts/dest/schnorr/index.js'),'utf8');
 assert.equal(browserSchnorrEntry(barrel),"export * from './initializerless/index.js';\n");
 assert.throws(()=>browserSchnorrEntry(barrel+'\n'),/boundary changed/);
});
