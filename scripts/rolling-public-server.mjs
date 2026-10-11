import http from 'node:http';
import {pathToFileURL} from 'node:url';
const routes={status:[],feed:['limit','cursor'],directory:['query','limit','cursor'],thread:['root','limit','cursor'],profile:['nameId','limit','cursor'],post:['id']};
const field=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(v);
const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'};
/** Same-origin composition: API owns /api and /api/*; lead owns an exact static
 * asset allowlist through staticHandler(req,res). No CORS, RPC proxy, wallet or
 * operator routes. sync is one serial loop; close waits for its bounded read.
 * GET /api/{status,feed,directory,thread,profile,post}; no request bodies or extras.
 */
export async function startRollingPublicServer({index,host='127.0.0.1',port=0,staticHandler,pollMs=1000}){
  if(host!=='127.0.0.1'||!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(pollMs)||pollMs<100||pollMs>30000)throw Error('Invalid public server configuration');
  let closed=false,timer,active;
  const loop=()=>{active=(async()=>{try{await index.sync();}catch{/* status remains unavailable; no raw upstream error logging */}
    finally{if(!closed)timer=setTimeout(loop,pollMs);}})();};
  const server=http.createServer(async(req,res)=>{
    const reply=(status,body)=>{let text=JSON.stringify(body);if(Buffer.byteLength(text)>1048576){status=503;text='{"schemaVersion":1,"error":"unavailable"}';}
      res.writeHead(status,headers);res.end(text);};
    try{
      if(typeof req.url!=='string'||req.url.length>2048)return reply(400,{schemaVersion:1,error:'invalid-request'});
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname!=='/api'&&!url.pathname.startsWith('/api/')){
        if(staticHandler){await staticHandler(req,res);return;}return reply(404,{schemaVersion:1,error:'not-found'});
      }
      if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(405,{schemaVersion:1,error:'method-not-allowed'});}
      if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')return reply(400,{schemaVersion:1,error:'invalid-request'});
      const view=url.pathname.slice(5),allowed=Object.hasOwn(routes,view)?routes[view]:null;
      if(!allowed)return reply(404,{schemaVersion:1,error:'not-found'});
      const params={};for(const [key,value] of url.searchParams){if(!allowed.includes(key)||Object.hasOwn(params,key))return reply(400,{schemaVersion:1,error:'invalid-request'});params[key]=value;}
      if(params.limit!==undefined){if(!/^[1-9][0-9]{0,2}$/.test(params.limit)||Number(params.limit)>100)return reply(400,{schemaVersion:1,error:'invalid-request'});params.limit=Number(params.limit);}
      if(params.cursor!==undefined&&(params.cursor.length>120||!/^[-0-9a-f:]+$/.test(params.cursor)))return reply(400,{schemaVersion:1,error:'invalid-request'});
      if(params.query!==undefined&&(params.query.length>120||params.query.includes('\0')))return reply(400,{schemaVersion:1,error:'invalid-request'});
      const idKey={thread:'root',profile:'nameId',post:'id'}[view];if(idKey&&!field(params[idKey]))return reply(400,{schemaVersion:1,error:'invalid-request'});
      if(view==='status')return reply(200,index.status());
      // Join the current canonical read only; never start a request-owned sync.
      await active;
      if(index.status().state!=='ready')return reply(503,{schemaVersion:1,error:'not-ready'});
      try{return reply(200,index.query(view,params));}
      catch(error){return reply(error?.code==='ROLLING_PUBLIC_CURSOR_STALE'?409:400,{schemaVersion:1,error:error?.code==='ROLLING_PUBLIC_CURSOR_STALE'?'cursor-stale':'invalid-request'});}
    }catch{return reply(503,{schemaVersion:1,error:'unavailable'});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});loop();
  return {url:`http://${host}:${server.address().port}`,async close(){closed=true;clearTimeout(timer);await active;
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}

/** Public operator configuration shared by the API-only CLI and same-origin
 * renderer. No listener or polling starts here. The exact six-key configuration
 * retains the bounded public RPC and storage setup; no private SDK is exposed.
 */
export async function createRollingPublicIndexFromConfig(config){
    const keys=['nodeUrl','artifactPath','scope','deployment','cacheDirectory','port'];
    if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).sort().join()!==keys.sort().join()||
      !Number.isInteger(config.port)||config.port<0||config.port>65535)throw Error('Invalid public index configuration');
    const url=new URL(config.nodeUrl);if(url.username||url.password||url.hash||url.search||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Invalid public index configuration');
    const [{readFile},{createRollingPublicIndex},{publicFeedFileStorage},{loadContractArtifact},{createAztecNodeClient},{jsonStringify}]=await Promise.all([
      import('node:fs/promises'),import('../shared/rolling/public-index.mjs'),import('../shared/public-feed-file-storage.mjs'),import('@aztec-labs/stdlib/abi'),
      import('../shared/aztec-node-client.mjs'),import('@aztec-labs/foundation/json-rpc')]);
    const node=createAztecNodeClient(url.href,{maxBatchSize:1,fetch:async(host,body)=>{
      const response=await fetch(host,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error();let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>33554432)throw Error();chunks.push(chunk);}
      return {response:JSON.parse(Buffer.concat(chunks).toString('utf8')),headers:response.headers};
    }});
    const artifact=loadContractArtifact(JSON.parse(await readFile(config.artifactPath,'utf8')));
    const index=await createRollingPublicIndex({node,artifact,scope:config.scope,deployment:config.deployment,
      storage:publicFeedFileStorage(config.cacheDirectory,{maxRecordBytes:1048576,maxSnapshotBytes:67108864})});
    return {index,port:config.port};
}

// API-only CLI. Operator paths never come from HTTP. The renderer composes its
// exact asset allowlist with the same exported factory and server functions.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const {readFile}=await import('node:fs/promises');
    const config=JSON.parse(await readFile(process.argv[2],'utf8'));
    const {index,port}=await createRollingPublicIndexFromConfig(config);
    const server=await startRollingPublicServer({index,port});process.stdout.write(JSON.stringify({publicFeedUrl:server.url})+'\n');
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().then(()=>process.exit(0),()=>process.exit(1));});
  }catch{process.stderr.write('Rolling public server could not start.\n');process.exitCode=1;}
}
