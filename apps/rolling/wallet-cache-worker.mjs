// Persist only content-addressed public account tools across visits.
const cacheName='rolling-public-assets-v1',pending=new Map(),MiB=1024*1024;
const limits=new Map([
 ...['ethers.js','crs-client.js','wallet-providers.js','ethereum-account-session.js','claim-secret-store.js','account.js','engine.js'].map(name=>['/wallet/'+name,MiB]),
 ['/wallet/aztec_bundle.js',128*MiB],...['board.json','private-fee.json','bok.json'].map(name=>['/wallet/'+name,32*MiB]),['/crs/crs-manifest.json',65536]
]);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),hash=/^\?sha256=([a-f0-9]{64})$/.exec(url.search)?.[1],limit=limits.get(url.pathname);
 if(request.method!=='GET'||request.headers.has('range')||request.headers.has('authorization')||url.origin!==self.location.origin||!hash||!limit)return;
 const key=url.href;
 if(!pending.has(key)){
  const operation=(async()=>{
   let cache;
   try{cache=await caches.open(cacheName);const saved=await cache.match(key);if(saved)return saved;}catch{/* Browser storage is optional. */}
   const response=await fetch(request);
   if(response.status!==200||response.redirected||response.url!==key)return Response.error();
   const reader=response.body.getReader(),chunks=[];let length=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();return Response.error();}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(actual!==hash)return Response.error();
   const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
   const verified=new Response(bytes,{status:200,headers});
   if(cache)try{
    await cache.put(key,verified.clone());
    // Retain one version per allowed asset, keeping the persistent cache bounded.
    for(const old of await cache.keys())if(old.url!==key&&new URL(old.url).pathname===url.pathname)await cache.delete(old);
   }catch{/* Quota failures do not discard the verified network response. */}
   return verified;
  })();
  pending.set(key,operation);void operation.finally(()=>pending.delete(key)).catch(()=>{});
 }
 event.respondWith(pending.get(key).then(response=>response.clone()));
});
