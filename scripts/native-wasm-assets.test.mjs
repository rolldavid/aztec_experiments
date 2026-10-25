import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareNativeWasmAssets,relocateNativeWasm,verifyNativeWasmCopy} from './native-wasm-assets.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),records=await prepareNativeWasmAssets(root),nativeFetch=globalThis.fetch;
for(const [loader,record]of records)test('actual native '+record.output+' default uses a hash-bound Request and Fetch integrity',async()=>{
 const original=await readFile(path.join(root,loader),'utf8'),bytes=await readFile(path.join(root,record.input));
 const transformed=assertTransformBindings(original,relocateNativeWasm(original,record),loader);
 verifyNativeWasmCopy(bytes,record);assert.throws(()=>verifyNativeWasmCopy(Buffer.concat([bytes,Buffer.from([0])]),record),/bytes changed/);
 assert.throws(()=>relocateNativeWasm(original+'\n',record),/loader changed/);
 const code=transformed.replaceAll('import.meta.url',JSON.stringify('https://board.test/wallet/aztec_bundle.js'));
 const integrity='sha256-'+Buffer.from(record.sha256,'hex').toString('base64');let requests=0,tamper=false;
 globalThis.fetch=async request=>{
  assert(request instanceof Request);assert.equal(request.url,'https://board.test/wallet/'+record.output+'?sha256='+record.sha256);
  assert.equal(request.integrity,integrity);assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');requests++;
  const delivered=Buffer.from(bytes);if(tamper)delivered[delivered.length-1]^=1;
  // Exercise the platform's real integrity implementation with local bytes;
  // there is no server, network call, simulator substitute or proving work.
  return nativeFetch(new Request('data:application/wasm;base64,'+delivered.toString('base64'),{integrity:request.integrity}));
 };
 try{
  const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  assert(Object.keys(await native.default()).length>0);assert.equal(requests,1);
  await native.default();assert.equal(requests,1,'native singleton still owns initialization');
  tamper=true;const fresh=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// fresh realm module').toString('base64'));
  await assert.rejects(fresh.default(),error=>/integrity/i.test(String(error.cause??error)));assert.equal(requests,2);
 }finally{globalThis.fetch=nativeFetch;}
});
