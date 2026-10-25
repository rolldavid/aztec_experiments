// Persist only content-addressed public account tools across visits.
const cacheName='rolling-public-assets-v1',pending=new Map(),MiB=1024*1024;
const limits=new Map([
 ...['ethers.js','crs-client.js','wallet-providers.js','ethereum-account-session.js','claim-secret-store.js','account.js','engine.js'].map(name=>['/wallet/'+name,MiB]),
 ['/wallet/aztec_bundle.js',128*MiB],...['board.json','private-fee.json','bok.json'].map(name=>['/wallet/'+name,32*MiB]),['/crs/crs-manifest.json',65536],
 ['/wallet/native-worker.js',8*MiB],
 ['/wallet/acvm_js_bg.wasm',8*MiB],['/wallet/noirc_abi_wasm_bg.wasm',2*MiB]
]);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),hash=/^\?sha256=([a-f0-9]{64})$/.exec(url.search)?.[1],limit=limits.get(url.pathname);
 if(request.method!=='GET'||request.headers.has('range')||request.headers.has('authorization')||url.origin!==self.location.origin||!hash||!limit)return;
 const key=url.href;
 const observed=(response,kind,start)=>{const headers=new Headers(response.headers);headers.set('Server-Timing','rolling-asset-'+kind+';dur='+(performance.now()-start).toFixed(3));return new Response(response.body,{status:response.status,headers});};
 if(!pending.has(key)){
  let persistence=Promise.resolve();
  const operation=(async()=>{
   const start=performance.now();let cache;
   try{cache=await caches.open(cacheName);const saved=await cache.match(key);if(saved)return observed(saved,'hit',start);}catch{/* Browser storage is optional. */}
   const response=await fetch(request);
   if(response.status!==200||response.redirected||response.url!==key)return Response.error();
   const reader=response.body.getReader(),chunks=[];let length=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();return Response.error();}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(actual!==hash)return Response.error();
   const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
   const verified=new Response(bytes,{status:200,headers});
   if(cache)persistence=(async()=>{try{
    await cache.put(key,verified.clone());
    // Retain one version per allowed asset, keeping the persistent cache bounded.
    for(const old of await cache.keys())if(old.url!==key&&new URL(old.url).pathname===url.pathname)await cache.delete(old);
   }catch{/* Quota failures do not discard the verified network response. */}})();
   return observed(verified,'miss',start);
  })();
  // Persist after delivering verified bytes. Keep single-flight ownership until
  // storage completes, so another consumer never starts a duplicate download.
  const lifetime=operation.then(()=>persistence).finally(()=>pending.delete(key));
  pending.set(key,{response:operation,lifetime});void lifetime.catch(()=>{});
 }
 const entry=pending.get(key);event.waitUntil(entry.lifetime);
 event.respondWith(entry.response.then(response=>response.clone()));
});
