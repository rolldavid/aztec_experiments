import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Only these two native wasm-bindgen defaults are relocated. Existing SDK
// manifests authenticate their loader sources and copied WASM output bytes.
export const NATIVE_WASM_FILES=[
 ['node_modules/@aztec-foundation/noir-acvm_js/web/acvm_js.js','node_modules/@aztec-foundation/noir-acvm_js/web/acvm_js_bg.wasm','acvm_js_bg.wasm'],
 ['node_modules/@aztec-foundation/noir-noirc_abi/web/noirc_abi_wasm.js','node_modules/@aztec-foundation/noir-noirc_abi/web/noirc_abi_wasm_bg.wasm','noirc_abi_wasm_bg.wasm'],
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareNativeWasmAssets(root){
 return new Map(await Promise.all(NATIVE_WASM_FILES.map(async([loader,input,output])=>{
  const [source,bytes]=await Promise.all([readFile(path.join(root,loader)),readFile(path.join(root,input))]);
  return [loader,Object.freeze({input,output,sourceSha:sha(source),sha256:sha(bytes)})];
 })));
}
export function relocateNativeWasm(source,record){
 if(sha(source)!==record.sourceSha)throw Error('Native WASM loader changed during build');
 const before=`new URL('${record.output}', import.meta.url)`;
 if(source.split(before).length!==2)throw Error('Native WASM URL boundary changed');
 const url=record.output+'?sha256='+record.sha256,integrity='sha256-'+Buffer.from(record.sha256,'hex').toString('base64');
 // Native wasm-bindgen accepts Request. Fetch integrity protects first loads
 // and cache hits even when the optional service worker is unavailable.
 return source.replace(before,`new Request(new URL(${JSON.stringify(url)}, import.meta.url), {integrity:${JSON.stringify(integrity)},credentials:'omit',redirect:'error'})`);
}
export function verifyNativeWasmCopy(bytes,record){
 if(sha(bytes)!==record.sha256)throw Error('Native WASM bytes changed during build');
}
