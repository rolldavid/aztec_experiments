import http from 'node:http';
import {normalizeHomeSubboards} from '../shared/rolling/public-projection.mjs';
import {pathToFileURL} from 'node:url';
const routes={status:[],home:['limit','cursor'],feed:['limit','cursor'],board:['id','limit','cursor'],directory:['query','limit','cursor'],thread:['root','limit','cursor'],profile:['nameId','limit','cursor'],post:['id']};
const field=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(v);
const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'};
/** Same-origin composition: API owns /api and /api/*; lead owns an exact static
 * asset allowlist through staticHandler(req,res). No CORS, RPC proxy, wallet or
 * operator routes. sync is one serial loop; close waits for its bounded read.
 * GET /api/{status,home,feed,board,directory,thread,profile,post}; no request bodies or extras.
 */
export async function startRollingPublicServer({index,host='127.0.0.1',port=0,staticHandler,pollMs=1000}){
  if(host!=='127.0.0.1'||!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(pollMs)||pollMs<100||pollMs>30000){
    const error=Error('Invalid public server configuration');
    try{await index.close?.();}catch(cleanup){throw new AggregateError([error,cleanup],'Public reader configuration and cleanup failed');}throw error;
  }
  let closed=false,timer,active,closing;const requests=new Set();
  const loop=()=>{active=(async()=>{try{await index.sync();}catch{/* status remains unavailable; no raw upstream error logging */}
    finally{if(!closed)timer=setTimeout(loop,pollMs);}})();};
  const handle=async(req,res)=>{
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
      if(params.cursor!==undefined&&(params.cursor.length>(view==='board'?200:120)||!/^[-0-9a-f:]+$/.test(params.cursor)))return reply(400,{schemaVersion:1,error:'invalid-request'});
      if(params.query!==undefined&&(params.query.length>120||params.query.includes('\0')))return reply(400,{schemaVersion:1,error:'invalid-request'});
      const idKey={board:'id',thread:'root',profile:'nameId',post:'id'}[view];if(idKey&&!field(params[idKey]))return reply(400,{schemaVersion:1,error:'invalid-request'});
      if(view==='status')return reply(200,index.status());
      // Join the current canonical read only; never start a request-owned sync.
      await active;
      if(index.status().state!=='ready')return reply(503,{schemaVersion:1,error:'not-ready'});
      try{return reply(200,index.query(view,params));}
      catch(error){const stale=error?.code==='ROLLING_PUBLIC_CURSOR_STALE',missing=error?.code==='ROLLING_PUBLIC_NOT_FOUND';return reply(stale?409:missing?404:400,{schemaVersion:1,error:stale?'cursor-stale':missing?'not-found':'invalid-request'});}
    }catch(error){
      // Sanitized HTTP does not erase the original pending operation's failure.
      try{if(!res.destroyed)reply(503,{schemaVersion:1,error:'unavailable'});}catch(cleanup){throw new AggregateError([error,cleanup],'Public request and response failed');}throw error;
    }
  };
  const server=http.createServer((req,res)=>{
    if(closed){res.writeHead(503,headers);res.end('{"schemaVersion":1,"error":"unavailable"}');return;}
    // Arm ownership before invoking application/static callbacks. Socket close
    // is not handler completion; disconnected requests remain owned until done.
    const operation=Promise.resolve().then(()=>handle(req,res));requests.add(operation);
    operation.then(()=>requests.delete(operation),()=>requests.delete(operation));
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=32;
  const close=()=>closing??=(async()=>{
    closed=true;clearTimeout(timer);const failures=[],pending=Promise.allSettled([...requests]);
    // Stop admission first; existing handlers may still be joining active sync.
    const listener=server.listening?new Promise(resolve=>server.close(error=>{if(error)failures.push(error);resolve();})):Promise.resolve();
    try{await active;}catch(error){failures.push(error);}
    await listener;
    for(const result of await pending)if(result.status==='rejected')failures.push(result.reason);
    try{await index.close?.();}catch(error){failures.push(error);}
    if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Public reader cleanup failed');
  })();
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
  catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Public reader startup and cleanup failed');}throw error;}
  loop();return {url:`http://${host}:${server.address().port}`,close};
}

// This facade owns exactly one persistent index/store. Internal schema3/control
// diagnostics are never cache authority; HTTP retains its schema1 envelope.
export function ownRollingPersistentPublicIndex(persistent,storage){
  let closing=null,closed=false;const pending=new Set();
  const available=()=>{if(closed)throw Object.assign(Error('Public reader is closed'),{code:'ROLLING_PUBLIC_UNAVAILABLE'});};
  const mappedStatus=()=>{const value=persistent.status();
    const checkpoint=value.checkpoint===null?null:{...value.checkpoint,number:Number(value.checkpoint.number)};
    if(checkpoint&&!Number.isSafeInteger(checkpoint.number))throw Error('Invalid public checkpoint');
    return {...value,schemaVersion:1,checkpoint};
  };
  const close=()=>closing??=(async()=>{closed=true;const results=await Promise.allSettled([...pending]);
    const failures=results.filter(row=>row.status==='rejected').map(row=>row.reason);
    try{storage.close();}catch(error){failures.push(error);}
    if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Public index cleanup failed');
  })();
  return Object.freeze({storageKind:'sqlite-v3',scope:persistent.scope,status(){available();return mappedStatus();},
    sync(){available();const operation=(async()=>{await persistent.sync();return mappedStatus();})();pending.add(operation);
      operation.then(()=>pending.delete(operation),()=>pending.delete(operation));return operation;},
    query(view,params){available();return persistent.query(view,params);},
    scanPosts(options){available();return persistent.scanPosts(options);},
    cacheStatus(){available();const control=storage.inspect().control;
      return control===null?{trusted:false,control:null}:{trusted:false,control:{generation:control.generation,revision:control.revision,
        segmentCount:control.segmentCount,eventCount:control.scalars.eventCount,checkpoint:structuredClone(control.checkpoint),cursor:structuredClone(control.cursor)}};
    },close});
}

/** Public operator configuration shared by the API-only CLI and same-origin
 * renderer. No listener or polling starts here. The six required keys and optional
 * homeSubboards (at most 256 unique nonzero decimal field IDs)
 * retain the bounded public RPC and storage setup; no private SDK is exposed.
 */
export async function createRollingPublicIndexFromConfig(config){
    const keys=['nodeUrl','artifactPath','scope','deployment','cacheDirectory','port'];
    if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).filter(key=>key!=='homeSubboards').sort().join()!==keys.sort().join()||
      !Number.isInteger(config.port)||config.port<0||config.port>65535)throw Error('Invalid public index configuration');
    let homeSubboards;try{homeSubboards=normalizeHomeSubboards(config.homeSubboards);}catch{throw Error('Invalid public index configuration');}
    const url=new URL(config.nodeUrl);if(url.username||url.password||url.hash||url.search||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Invalid public index configuration');
    const captured={scope:structuredClone(config.scope),deployment:structuredClone(config.deployment),cacheDirectory:config.cacheDirectory,port:config.port,
      artifactPath:config.artifactPath instanceof URL?new URL(config.artifactPath.href):config.artifactPath};
    const [{readFile},{createRollingPersistentPublicIndex},{createRollingPublicSqliteStore},{loadContractArtifact},{createAztecNodeClient},{jsonStringify}]=await Promise.all([
      import('node:fs/promises'),import('../shared/rolling/public-index.mjs'),import('../shared/rolling/public-sqlite.mjs'),import('@aztec-labs/stdlib/abi'),
      import('../shared/aztec-node-client.mjs'),import('@aztec-labs/foundation/json-rpc')]);
    const node=createAztecNodeClient(url.href,{maxBatchSize:1,fetch:async(host,body)=>{
      const response=await fetch(host,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error();let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>33554432)throw Error();chunks.push(chunk);}
      return {response:JSON.parse(Buffer.concat(chunks).toString('utf8')),headers:response.headers};
    }});
    const artifact=loadContractArtifact(JSON.parse(await readFile(captured.artifactPath,'utf8')));
    const storage=createRollingPublicSqliteStore(captured.cacheDirectory,{scope:captured.scope});
    try{
      const persistent=await createRollingPersistentPublicIndex({node,artifact,scope:captured.scope,deployment:captured.deployment,homeSubboards,storage});
      return {index:ownRollingPersistentPublicIndex(persistent,storage),port:captured.port};
    }catch(error){try{storage.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Public index construction and cleanup failed');}throw error;}

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
