import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// These are the six existing native lazy provider boundaries, not a second
// provider implementation. Native artifact/class/instance construction stays native.
export const NATIVE_CONTRACT_FILES=[
 ['protocol-contracts','class-registry','ContractClassRegistry'],
 ['protocol-contracts','instance-registry','ContractInstanceRegistry'],
 ['protocol-contracts','fee-juice','FeeJuice'],
 ['standard-contracts','multi-call-entrypoint','MultiCallEntrypoint'],
 ['standard-contracts','auth-registry','AuthRegistry'],
 ['standard-contracts','handshake-registry','HandshakeRegistry'],
].map(([pkg,provider,name])=>[
 `node_modules/@aztec-labs/${pkg}/dest/${provider}/lazy.js`,
 `node_modules/@aztec-labs/${pkg}/artifacts/${name}.json`,
 `native-contract-${name}.json`,name,
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareNativeContractAssets(root){
 return new Map(await Promise.all(NATIVE_CONTRACT_FILES.map(async([loader,input,output,name])=>{
  const [source,bytes]=await Promise.all([readFile(path.join(root,loader)),readFile(path.join(root,input))]);
  return [loader,Object.freeze({input,output,name,sourceSha:sha(source),sha256:sha(bytes)})];
 })));
}
export function relocateNativeContract(source,record){
 if(sha(source)!==record.sourceSha)throw Error('Native contract loader changed during build');
 const before=`import('../../artifacts/${record.name}.json')`;
 if(source.split(before).length!==2)throw Error('Native contract import boundary changed');
 const url=record.output+'?sha256='+record.sha256,integrity='sha256-'+Buffer.from(record.sha256,'hex').toString('base64');
 // Only the JSON transport changes. Fetch integrity verifies both uncontrolled
 // first loads and cache hits. The provider still receives the same default JSON.
 return source.replace(before,`globalThis.fetch(new globalThis.Request(new globalThis.URL(${JSON.stringify(url)}, import.meta.url),{integrity:${JSON.stringify(integrity)},credentials:'omit',redirect:'error'})).then(response=>{if(!response.ok)throw new Error('Native contract asset unavailable');return response.json();}).then(value=>({default:value}))`);
}
export function verifyNativeContractCopy(bytes,record){
 if(sha(bytes)!==record.sha256)throw Error('Native contract bytes changed during build');
}
export function browserSdkEntry(source){
 const fee="export { FeeJuiceArtifact } from '@aztec-labs/protocol-contracts/fee-juice';";
 const schnorr="export { SchnorrAccountContract, SchnorrAccountContractArtifact,\n  SchnorrInitializerlessAccountContract, SchnorrInitializerlessAccountContractArtifact,\n  getSchnorrAccountContractAddress, getSchnorrInitializerlessAccountContractAddress } from '@aztec-labs/accounts/schnorr';";
 if(source.split(fee).length!==2||source.split(schnorr).length!==2)throw Error('Browser SDK export boundary changed');
 return source.replace(fee,'').replace(schnorr,"export { SchnorrInitializerlessAccountContract, SchnorrInitializerlessAccountContractArtifact,\n  getSchnorrInitializerlessAccountContractAddress } from '@aztec-labs/accounts/schnorr';");
}
export function browserSchnorrEntry(source){
 const before="export * from './private_immutable/index.js';\nexport * from './initializerless/index.js';\n";
 if(source!==before)throw Error('Native Schnorr export boundary changed');
 return "export * from './initializerless/index.js';\n";
}
