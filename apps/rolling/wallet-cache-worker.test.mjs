import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
const source=await readFile(new URL('./wallet-cache-worker.mjs',import.meta.url),'utf8');
function fixture({body='public sdk',quota=false,holdPut,saved=new Map()}={}){
 const handlers={},lifetimes=[];let requests=0;
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,value)=>{if(holdPut)await holdPut;if(quota)throw Error('Quota');saved.set(key,value);},keys:async()=>[...saved.keys()].map(url=>({url})),delete:async({url})=>saved.delete(url)};
 vm.runInNewContext(source,{self:{location:{origin:'https://board.test'},addEventListener:(name,handler)=>handlers[name]=handler},URL,Headers,Response,Uint8Array,performance,crypto:webcrypto,caches:{open:async()=>cache},fetch:async request=>{requests++;const r=new Response(body);Object.defineProperty(r,'url',{value:request.url});return r;}});
 return {message:event=>handlers.message(event),saved,settle:()=>Promise.allSettled(lifetimes),get requests(){return requests;},request(path,options={}){let result;handlers.fetch({request:new Request('https://board.test'+path,options),respondWith:p=>result=p,waitUntil:p=>lifetimes.push(p)});return result;}};
}
const hash=value=>createHash('sha256').update(value).digest('hex');
test('verified SDK persists, concurrent requests join, changed hash replaces old bytes',async()=>{
 const f=fixture(),path='/wallet/aztec_bundle.js?sha256='+hash('public sdk');
 const [a,b]=await Promise.all([f.request(path),f.request(path)]);assert.equal(await a.text(),'public sdk');assert.equal(await b.text(),'public sdk');
 await f.request(path);assert.equal(f.requests,1);
 f.saved.set('https://board.test/wallet/aztec_bundle.js?sha256='+'0'.repeat(64),new Response('old'));
 await f.settle();f.saved.delete('https://board.test'+path);await f.request(path);await f.settle();assert.equal(f.saved.size,1);
});
test('private, unpinned, range and authorization requests are not intercepted',()=>{
 const f=fixture(),suffix='?sha256='+hash('public sdk');
 for(const path of ['/wallet/runtime.json','/wallet/runtime.mjs','/v1/node','/wallet/unknown.js'])assert.equal(f.request(path+suffix),undefined);
 assert.equal(f.request('/wallet/aztec_bundle.js'),undefined);
 for(const headers of [{range:'bytes=0-9'},{authorization:'test'}])assert.equal(f.request('/wallet/aztec_bundle.js'+suffix,{headers}),undefined);
 assert.equal(f.requests,0);
});
test('wrong digests and oversized public files are never stored',async()=>{
 const f=fixture();assert.equal((await f.request('/wallet/aztec_bundle.js?sha256='+'0'.repeat(64))).type,'error');assert.equal(f.saved.size,0);
 const body='x'.repeat(65537),large=fixture({body});assert.equal((await large.request('/crs/crs-manifest.json?sha256='+hash(body))).type,'error');assert.equal(large.saved.size,0);
});
test('storage quota errors still return verified bytes without refetching',async()=>{
 const f=fixture({quota:true}),r=await f.request('/wallet/aztec_bundle.js?sha256='+hash('public sdk'));assert.equal(await r.text(),'public sdk');assert.equal(f.requests,1);
});

test('verified bytes return before cache writes and concurrent callers still share the download',async()=>{
 let release;const holdPut=new Promise(resolve=>{release=resolve;});const f=fixture({holdPut}),path='/wallet/aztec_bundle.js?sha256='+hash('public sdk');
 const first=await f.request(path);assert.equal(await first.text(),'public sdk');assert.match(first.headers.get('server-timing'),/^rolling-asset-miss;/);assert.equal(f.saved.size,0);
 const second=await f.request(path);assert.equal(await second.text(),'public sdk');assert.equal(f.requests,1);release();await f.settle();
 const cached=await f.request(path);assert.match(cached.headers.get('server-timing'),/^rolling-asset-hit;/);assert.equal(f.requests,1);
});

for(const name of ['acvm_js_bg.wasm','noirc_abi_wasm_bg.wasm'])test('verified '+name+' persists across worker lifetimes without another download',async()=>{
 const body=new Uint8Array([0,97,115,109,1,0,0,0]),path='/wallet/'+name+'?sha256='+hash(body),first=fixture({body});
 const response=await first.request(path);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),body);await first.settle();assert.equal(first.requests,1);
 const next=fixture({body:'must not fetch',saved:first.saved}),cached=await next.request(path);
 assert.deepEqual(new Uint8Array(await cached.arrayBuffer()),body);assert.equal(next.requests,0);assert.match(cached.headers.get('server-timing'),/^rolling-asset-hit;/);
 assert.equal((await next.request('/wallet/'+name+'?sha256='+'0'.repeat(64))).type,'error');await next.settle();assert.equal(next.saved.size,1);
});
test('only exact content-addressed native WASM paths are cached',async()=>{
 const f=fixture(),suffix='?sha256='+hash('public sdk');
 for(const path of ['/wallet/unknown.wasm','/wallet/sqlite3.wasm','/crs/acvm_js_bg.wasm'])assert.equal(f.request(path+suffix),undefined);
 assert.equal(f.request('/wallet/acvm_js_bg.wasm'),undefined);assert.equal(f.request('/wallet/acvm_js_bg.wasm'+suffix+'&extra=1'),undefined);
 const body=new Uint8Array(2*1024*1024+1),large=fixture({body});assert.equal((await large.request('/wallet/noirc_abi_wasm_bg.wasm?sha256='+hash(body))).type,'error');await large.settle();assert.equal(large.saved.size,0);
});

for(const name of ['ContractClassRegistry','ContractInstanceRegistry','FeeJuice','MultiCallEntrypoint','AuthRegistry','HandshakeRegistry'])test('verified native '+name+' survives application releases without refetch',async()=>{
 const body='{"native":"'+name+'"}',path='/wallet/native-contract-'+name+'.json?sha256='+hash(body),first=fixture({body});
 assert.equal(await(await first.request(path)).text(),body);await first.settle();
 const next=fixture({body:'changed',saved:first.saved});assert.equal(await(await next.request(path)).text(),body);assert.equal(next.requests,0);
 assert.equal((await next.request(path.replace(hash(body),'0'.repeat(64)))).type,'error');await next.settle();assert.equal(next.saved.size,1);
});
test('native contract cache allows only six bounded pinned JSON paths',async()=>{
 const f=fixture(),suffix='?sha256='+hash('public sdk');
 for(const name of ['Unknown','SchnorrAccount','HandshakeRegistry.json/extra'])assert.equal(f.request('/wallet/native-contract-'+name+'.json'+suffix),undefined);
 assert.equal(f.request('/wallet/native-contract-FeeJuice.json'),undefined);
 const body=new Uint8Array(8*1024*1024+1),large=fixture({body});assert.equal((await large.request('/wallet/native-contract-FeeJuice.json?sha256='+hash(body))).type,'error');await large.settle();assert.equal(large.saved.size,0);
});

test('published registration descriptor uses the existing bounded verified public cache',async()=>{
 const body='{"schemaVersion":1}',url='/wallet/deployment-registration.json?sha256='+hash(body),first=fixture({body});
 assert.equal(await(await first.request(url)).text(),body);await first.settle();
 const next=fixture({body:'changed',saved:first.saved});assert.equal(await(await next.request(url)).text(),body);assert.equal(next.requests,0);
 const oversized='x'.repeat(65537),large=fixture({body:oversized});assert.equal((await large.request('/wallet/deployment-registration.json?sha256='+hash(oversized))).type,'error');await large.settle();assert.equal(large.saved.size,0);
});

test('cache capability reply is exact and owns only its one transferred port',()=>{
 const f=fixture(),sent=[];let closed=0;const port={postMessage:value=>sent.push(value),close:()=>closed++};
 f.message({data:'rolling-native-artifacts-v1',ports:[port]});assert.deepEqual(sent,['rolling-native-artifacts-v1']);assert.equal(closed,1);
 for(const event of [{data:'unknown',ports:[port]},{data:'rolling-native-artifacts-v1',ports:[]},{data:'rolling-native-artifacts-v1',ports:[port,port]}])f.message(event);
 assert.equal(sent.length,1);assert.equal(closed,1);
});
