import {createSafeJsonRpcClient} from '@aztec-labs/foundation/json-rpc/client';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';
import {AztecNodeApiSchema} from '@aztec-labs/stdlib/interfaces/client';
import {getVersioningResponseHandler} from '@aztec-labs/stdlib/versioning';

// Configuration names an explicitly trusted prover boundary. Neither this brand nor
// matching chain metadata proves who operates its fullnode/archiver/log providers.
const trusted = new WeakSet();
const failures = new WeakSet();
const messages = Object.freeze({
  CONFIG:'Trusted private node configuration is invalid.',
  IDENTITY:'Trusted private node network or proof policy does not match.',
  UNAVAILABLE:'Trusted private node is unavailable or returned invalid data.',
  UNSYNCED:'Trusted private node state is incomplete or inconsistent.',
  STALE:'Trusted private node synchronization is stale.'
});
function fail(kind) {
  const error = Object.assign(new Error(messages[kind]), {code:'BB_TRUSTED_NODE_'+kind});
  failures.add(error); return error;
}
const natural = value => Number.isSafeInteger(value) && value >= 0;
function decimal(value, bits) {
  if(typeof value === 'number') { if(!natural(value))throw fail('CONFIG'); value=String(value); }
  if(typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value)>=(1n<<BigInt(bits)))throw fail('CONFIG');
  if(BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))throw fail('CONFIG');
  return value;
}
function hex(value, bytes) {
  const text = typeof value === 'string' ? value : value?.toString();
  if(typeof text !== 'string' || !new RegExp('^0x[0-9a-fA-F]{'+bytes*2+'}$').test(text))throw fail('UNAVAILABLE');
  return text.toLowerCase();
}
function policy(options) {
  try {
    const {expectedNetworkScope:s,proofsEnabled,maxLagSeconds=120}=options;
    const chainId=decimal(s.chainId,64), version=decimal(s.version,32),rollup=hex(s.rollup,20);
    if(BigInt(rollup)===0n || typeof proofsEnabled!=='boolean' || (!proofsEnabled && chainId!=='31337') || !Number.isSafeInteger(maxLagSeconds) || maxLagSeconds<1 || maxLagSeconds>600)throw fail('CONFIG');
    return {chainId,version,rollup,proofsEnabled,maxLagSeconds};
  } catch { throw fail('CONFIG'); }
}
function block(value) {
  const number=value?.number, hash=value?.hash;
  if(!natural(number))throw fail('UNAVAILABLE');
  return {number,hash:hex(hash,32)};
}
// Fixed public read groups only. Drain every started call (including a sync
// throw or falsy rejection) before releasing the caller's operation ownership.
async function readTogether(reads) {
  const results=await Promise.allSettled(reads.map(read=>Promise.resolve().then(read)));
  const rejected=results.find(result=>result.status==='rejected');
  if(rejected)throw rejected.reason;
  return results.map(result=>result.value);
}
async function canonical(node, expected) {
  const data=await node.getBlockData(expected.number);
  if(!data || data.header?.globalVariables?.blockNumber!==expected.number || hex(data.blockHash,32)!==expected.hash)throw fail('UNSYNCED');
}

/** Public readiness queries only; no account, tag, nullifier or transaction inputs.
 * This is a snapshot, not a lease. The server must gate ongoing requests too.
 * 120 seconds is a reversible engineering default; 1..600 bounds configuration.
 */
export async function inspectTrustedNode(node, options) {
  const p=policy(options);
  try {
    for(let snapshot=0;snapshot<2;snapshot++){
    const info=await node.getNodeInfo();
    const chainId=info?.l1ChainId,version=info?.rollupVersion,realProofs=info?.realProofs,rollup=info?.l1ContractAddresses?.rollupAddress;
    if(!natural(chainId) || !natural(version) || typeof realProofs!=='boolean')throw fail('UNAVAILABLE');
    if(String(chainId)!==p.chainId || String(version)!==p.version || hex(rollup,20)!==p.rollup || realProofs!==p.proofsEnabled)throw fail('IDENTITY');
    // Identity stays first. Snapshot each result on fulfillment, before waiting
    // for its peer; a batch is not an atomic chain snapshot or a readiness lease.
    const [tips,state,stamp]=await readTogether([
      async()=>{const value=await node.getChainTips();return {
        proposed:block(value?.proposed),checkpointed:block(value?.checkpointed?.block),
        proven:block(value?.proven?.block),finalized:block(value?.finalized?.block)};},
      async()=>{const value=await node.getWorldStateSyncStatus();return {
        latest:value?.latestBlockNumber,latestHash:hex(value?.latestBlockHash,32),
        final:value?.finalizedBlockNumber,oldest:value?.oldestHistoricBlockNumber,synced:value?.treesAreSynched};},
      // Timestamp is independent public metadata. Snapshot it with the tips,
      // then retain both canonical checks after this entire group settles.
      async()=>{const value=await node.getSyncedL1Timestamp();
        if(typeof value!=='bigint' || value<0n || value>BigInt(Number.MAX_SAFE_INTEGER))throw fail('UNAVAILABLE');return value;},
    ]);
    const {proposed,checkpointed,proven,finalized}=tips;
    const ordered=[finalized,proven,checkpointed,proposed];
    for(let i=1;i<ordered.length;i++)if(ordered[i-1].number>ordered[i].number || (ordered[i-1].number===ordered[i].number && ordered[i-1].hash!==ordered[i].hash))throw fail('UNSYNCED');
    const {latest,latestHash,final,oldest,synced}=state;
    if(!natural(latest) || !natural(final) || !natural(oldest) || typeof synced!=='boolean')throw fail('UNAVAILABLE');
    if(!synced || oldest>checkpointed.number || final>latest || (latest===proposed.number && latestHash!==proposed.hash))throw fail('UNSYNCED');
    if(latest!==proposed.number || final!==finalized.number){
      // These independently returned public metadata records can straddle a
      // natural head/finality transition. Discard the whole snapshot and read
      // it once more, starting with identity. Neither an inconsistent snapshot
      // nor any transport, canonical, freshness or same-height fork failure is
      // permission to proceed. All already-started reads have been drained.
      if(snapshot===0)continue;
      throw fail('UNSYNCED');
    }
    if(checkpointed.number!==proposed.number)await readTogether([()=>canonical(node,checkpointed),()=>canonical(node,proposed)]);
    else await canonical(node,proposed);
    const suppliedNow=options.nowSeconds,now=suppliedNow===undefined ? Math.floor(Date.now()/1000) : suppliedNow;
    if(!natural(now))throw fail('CONFIG');
    const lag=now-Number(stamp);
    if(lag<0 || lag>p.maxLagSeconds)throw fail('STALE');
    // Recheck the selected canonical anchor after synchronization reads. A reorg
    // invalidates this readiness snapshot; never manufacture missing state.
    await canonical(node,proposed);
    return Object.freeze({ready:true,chainId:p.chainId,rollupVersion:p.version,rollupAddress:p.rollup,proofsEnabled:p.proofsEnabled,
      latestBlockNumber:proposed.number,latestBlockHash:proposed.hash,checkpointedBlockNumber:checkpointed.number,
      finalizedBlockNumber:finalized.number,oldestHistoricBlockNumber:oldest,
      syncedL1Timestamp:String(stamp),checkedAtSeconds:now,lagSeconds:lag});
    }
  } catch(error) { throw failures.has(error) ? error : fail('UNAVAILABLE'); }
}

const discard=()=>{};
const silent=Object.freeze({debug:discard,info:discard,warn:discard,error:discard,trace:discard,verbose:discard,fatal:discard});
// Bounded engineering default aligned with prover/private-query.mjs (32 MiB).
const MAX_RESPONSE_BYTES=32*1024*1024;
function endpoint(value, allowLocalDev) {
  try {
    if(typeof value!=='string' || value.length>2048 || /[\s\\]/.test(value))throw fail('CONFIG');
    const url=new URL(value);
    if(url.username || url.password || url.search || url.hash || value.includes('?') || value.includes('#'))throw fail('CONFIG');
    const local=['127.0.0.1','[::1]','localhost'].includes(url.hostname);
    if(url.protocol!=='https:' && !(allowLocalDev===true && local && url.protocol==='http:'))throw fail('CONFIG');
    return url.href;
  } catch { throw fail('CONFIG'); }
}
// Official SDK JSON-RPC transport shape. Deliberately not defaultFetch: that
// helper logs bodies, follows redirects, and its caller normally adds retries.
async function privateFetch(host, body, extraHeaders={}) {
  try {
    const response=await fetch(host,{method:'POST',body:jsonStringify(body),headers:{...extraHeaders,'content-type':'application/json'},
      redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok || response.redirected || !response.body)throw fail('UNAVAILABLE');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw fail('UNAVAILABLE');chunks.push(value);}
    } finally { await reader.cancel().catch(discard);reader.releaseLock(); }
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    return {response:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),headers:response.headers};
  } catch { throw fail('UNAVAILABLE'); }
}

/** Uses installed SDK schemas/serialization/version checks, with silent logging.
 * No transport retries, redirects, alternate endpoint or ordinary-node fallback.
 */
export async function createTrustedPrivateNode({url,expectedNetworkScope,proofsEnabled=true,allowLocalDev=false,maxLagSeconds=120}) {
  const p=policy({expectedNetworkScope,proofsEnabled,maxLagSeconds}),host=endpoint(url,allowLocalDev);
  const rpc=createSafeJsonRpcClient(host,AztecNodeApiSchema,{namespaceMethods:'aztec',maxBatchSize:3,fetch:privateFetch,log:silent,
    onResponse:getVersioningResponseHandler({l1ChainId:Number(p.chainId),rollupVersion:Number(p.version),l1RollupAddress:p.rollup})});
  // The installed PXE wraps this facade with recording and caching Proxies.
  // A frozen data property forbids their get traps from returning a bound or
  // cached function. Getter-only properties preserve immutable routing while
  // allowing those unmodified SDK wrappers to return their own functions.
  const node=Object.freeze(Object.defineProperties({},Object.fromEntries(Object.keys(AztecNodeApiSchema).map(name=>{
   const method=async(...args)=>{
    try{return await rpc[name](...args);}catch{throw fail('UNAVAILABLE');}
   };
   return [name,{enumerable:true,get:()=>method}];
  }))));
  await inspectTrustedNode(node,{expectedNetworkScope,proofsEnabled,maxLagSeconds});
  trusted.add(node);return node;
}
export function isTrustedPrivateNode(node) { return trusted.has(node); }
