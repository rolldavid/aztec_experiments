// TEST ONLY. Serialized fetch-request observations, not a universal network tap.
// Install before client factories capture fetch. Parent owns installation/restore,
// actual listener ingress reconciliation, frozen transport inventory and lifecycle.
import {createHmac, randomBytes, createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Tx,TxEffect} from '@aztec-labs/stdlib/tx';
import {classifyT03PublicFootprint,T03_PUBLIC_ROLES} from '../t03-public-footprint.mjs';
import {createSafeJsonRpcClient} from '@aztec-labs/foundation/json-rpc/client';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';
import {AztecNodeApiSchema} from '@aztec-labs/stdlib/interfaces/client';

export const WIRE_LABELS=Object.freeze(['trusted-query','trusted-proof','trusted-upstream','ordinary-node','public-reader','public-l1']);
export const WIRE_PHASES=Object.freeze(['setup','a-name-1','a-name-2','b-name-1','b-name-2','a-named-post','a-anonymous-post','b-named-post','b-anonymous-post','a-like-first','a-like-repeat','a-like-second','b-like-first','a-unlike','b-unlike','recovery-a','recovery-b','profile-a','profile-b','public-read','outage','personalized-denial','cleanup']);
const nodeMethods=new Set(Object.keys(AztecNodeApiSchema).map(m=>'node_'+m));
// Pinned clients use node or aztec namespaces; no arbitrary method strings.
for(const m of Object.keys(AztecNodeApiSchema))nodeMethods.add('aztec_'+m);
// Three Anvil methods are the existing C01 parent miner's fixed control RPCs.
const l1Methods=new Set(['anvil_getAutomine','evm_setAutomine','evm_mine','eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_call','eth_simulateV1','eth_estimateGas','eth_gasPrice','eth_blobBaseFee','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','eth_sendTransaction','eth_sendRawTransaction','eth_accounts','eth_requestAccounts']);
// Installed viem actions/public/{getChainId,getBlockNumber,getGasPrice,
// estimateMaxPriorityFeePerGas,getBlobBaseFee} and actions/wallet/{getAddresses,requestAddresses}
// send these methods without params. Missing params is not generally an array.
// Fixed method labels extracted from installed viem public actions; never retain
// arbitrary unknown method text. This is diagnostic vocabulary, not acceptance.
const diagnosticMethods=new Set(['eth_blobBaseFee', 'eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_createAccessList', 'eth_estimateGas', 'eth_feeHistory', 'eth_gasPrice', 'eth_getBalance', 'eth_getBlockByHash', 'eth_getBlockByNumber', 'eth_getBlockTransactionCountByHash', 'eth_getBlockTransactionCountByNumber', 'eth_getCode', 'eth_getFilterChanges', 'eth_getFilterLogs', 'eth_getLogs', 'eth_getProof', 'eth_getStorageAt', 'eth_getTransactionByBlockHashAndIndex', 'eth_getTransactionByBlockNumberAndIndex', 'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_maxPriorityFeePerGas', 'eth_newBlockFilter', 'eth_newFilter', 'eth_newPendingTransactionFilter', 'eth_simulateV1', 'eth_uninstallFilter']);
// Exact method literals from installed viem public/wallet actions; metadata only.
const captureClientMethods=new Set(["eth_accounts", "eth_blobBaseFee", "eth_blockNumber", "eth_call", "eth_chainId", "eth_createAccessList", "eth_estimateGas", "eth_feeHistory", "eth_gasPrice", "eth_getBalance", "eth_getBlockByHash", "eth_getBlockByNumber", "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber", "eth_getCode", "eth_getFilterChanges", "eth_getFilterLogs", "eth_getLogs", "eth_getProof", "eth_getStorageAt", "eth_getTransactionByBlockHashAndIndex", "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByHash", "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas", "eth_newBlockFilter", "eth_newFilter", "eth_newPendingTransactionFilter", "eth_requestAccounts", "eth_sendRawTransaction", "eth_sendRawTransactionSync", "eth_signTransaction", "eth_signTypedData_v4", "eth_simulateV1", "eth_uninstallFilter", "personal_sign", "wallet_addEthereumChain", "wallet_getCallsStatus", "wallet_getCapabilities", "wallet_getPermissions", "wallet_requestPermissions", "wallet_sendCalls", "wallet_sendTransaction", "wallet_showCallsStatus", "wallet_switchEthereumChain", "wallet_watchAsset"]);
const omittedL1Params=new Set(['eth_chainId','eth_blockNumber','eth_gasPrice','eth_blobBaseFee','eth_maxPriorityFeePerGas','eth_accounts','eth_requestAccounts']);
const txMethods=new Set(['node_sendTx','aztec_sendTx','node_simulatePublicCalls','aztec_simulatePublicCalls','node_isValidTx','aztec_isValidTx']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const base64=v=>typeof v==='string'&&v.length>0&&v.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(v)&&Buffer.from(v,'base64').toString('base64')===v;
const hexBytes=v=>typeof v==='string'&&/^0x(?:[a-fA-F0-9]{2})*$/.test(v);
const readerParams={status:[],feed:['limit','cursor'],home:['limit','cursor'],board:['id','limit','cursor'],directory:['query','limit','cursor'],thread:['root','limit','cursor'],profile:['nameId','limit','cursor'],post:['id']};
const configError=()=>Error('Invalid wire observer configuration');
const actor=phase=>phase.startsWith('a-')||phase.endsWith('-a')?'a':phase.startsWith('b-')||phase.endsWith('-b')?'b':null;
const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(d&&!Object.hasOwn(d,'value'))throw Error();return d?.value;};
const field=s=>typeof s==='string'&&(/^(?:0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(s))?BigInt(s).toString():null;
const bucket=n=>n===0?'empty':n<=4096?'1-4096':n<=65536?'4097-65536':n<=1048576?'65537-1048576':'over-1048576';

export function createRollingWireTrace({roles,limits={}}={}){
 if(!roles||Object.keys(roles).sort().join(',')!=='a,b')throw configError();
 const known={};for(const role of ['a','b']){const value=own(roles,role);if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value)||BigInt(value)===0n)throw configError();known[role]=field(value);}
 if(known.a===known.b)throw configError();
 const bounds={maxRequests:[10000,50000],maxBodyBytes:[8*1024*1024,8*1024*1024],maxNodes:[32768,131072],maxDepth:[32,64],maxRelations:[20000,100000]};
 if(Object.keys(limits).some(k=>!Object.hasOwn(bounds,k)))throw configError();
 const cap={};for(const [key,[fallback,max]]of Object.entries(bounds)){const value=own(limits,key)??fallback;if(!Number.isSafeInteger(value)||value<1||value>max)throw configError();cap[key]=value;}
 const salt=randomBytes(32),endpoints=new Map(),relations=new Map(),rows=new Map();let phase='setup';
 const counts={requests:0,completed:0,pending:0,unknown:0,unsupported:0,truncated:0,observerErrors:0,opaqueTransactions:0};
 const unknownReasons={'endpoint':0,'reader-parameter':0,'invalid-envelope':0,'unsupported-method':0,'params-shape':0},unknownMethods={};
 function unknown(reason,method){counts.unknown++;unknownReasons[reason]++;if(reason==='unsupported-method'){const key=diagnosticMethods.has(method)?method:'unrecognized';unknownMethods[key]=(unknownMethods[key]??0)+1;return key;}}
 const repeated={withinPhase:0,sameActorAcrossPhases:0,acrossActors:0,acrossEndpoints:0};
 function registerEndpoint(label,url){
  if(!WIRE_LABELS.includes(label)||endpoints.has(label)||typeof url!=='string')throw configError();
  let u;try{u=new URL(url);}catch{throw configError();}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw configError();
  // Query/proof share a service origin; all other observer legs must be distinct.
  for(const [other,origin]of endpoints)if(origin===u.origin&&![label,other].every(x=>['trusted-query','trusted-proof'].includes(x)))throw configError();
  endpoints.set(label,u.origin);
 }
 function endpoint(u,method){
  if(u.username||u.password||u.hash)return null;
  for(const [label,origin]of endpoints){if(origin!==u.origin)continue;
   if(label==='trusted-query'&&!u.search&&((u.pathname==='/v1/node'&&method==='POST')||(u.pathname==='/healthz'&&method==='GET')))return label;
   if(label==='trusted-proof'&&!u.search&&((u.pathname==='/v1/jobs'&&method==='POST')||(/^\/v1\/jobs\/[a-f0-9]{64}$/.test(u.pathname)&&method==='GET')))return label;
   if(['trusted-upstream','ordinary-node','public-l1'].includes(label)&&u.pathname==='/'&&!u.search&&method==='POST')return label;
   if(label==='public-reader'&&method==='GET'&&Object.hasOwn(readerParams,u.pathname.slice(5))&&u.pathname.startsWith('/api/'))return label;
  }return null;
 }
 function token(value,label,at,found){
  const n=field(value);if(n!==null){for(const role of ['a','b'])if(n===known[role])found.add(role);if(n==='0')return;}
  else if(typeof value!=='string'||value.length===0)return;
  // Numeric normalization compares decimal/hex whole fields; text equality is
  // opaque. Repetition is not interpreted as ownership or cryptographic linkage.
  const digest=createHmac('sha256',salt).update(n===null?'text:':'field:').update(n??value).digest('hex');
  const old=relations.get(digest),key=label+':'+at;
  if(old){if(old.has(key))repeated.withinPhase++;else{
   if([...old].some(v=>v.split(':')[0]!==label))repeated.acrossEndpoints++;
   const who=actor(at);if(who&&[...old].some(v=>actor(v.split(':')[1])===who))repeated.sameActorAcrossPhases++;
   if(who&&[...old].some(v=>actor(v.split(':')[1])&&actor(v.split(':')[1])!==who))repeated.acrossActors++;
   old.add(key);
  }}else if(relations.size<cap.maxRelations)relations.set(digest,new Set([key]));else counts.truncated++;
 }
 function classify(args,at){
  const input=args[0],init=args[1];let text;
  if(typeof input==='string')text=input;
  else if(input instanceof URL&&Object.getPrototypeOf(input)===URL.prototype)text=Object.getOwnPropertyDescriptor(URL.prototype,'href').get.call(input);
  else{counts.unsupported++;return {label:'unknown',methods:['unsupported'],roles:[],size:'empty'};}
  if(text.length>8192){counts.truncated++;return {label:'unknown',methods:['unsupported'],roles:[],size:'empty'};}
  if(init!==undefined&&(init===null||typeof init!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(init))))throw Error();
  const method=init?own(init,'method')??'GET':'GET',body=init?own(init,'body'):undefined;
  const u=new URL(text),label=endpoint(u,method),found=new Set();
  const record={label:label??'unknown',methods:[],roles:[],size:'empty'};
  if(!label){unknown('endpoint');record.methods=['unknown'];return record;}
  let nodes=0,limited=false;
  function walk(v,depth=0){if(++nodes>cap.maxNodes||depth>cap.maxDepth){limited=true;return;}
   if(typeof v==='string'){if(v.length>4096){counts.unsupported++;return;}token(v,label,at,found);return;}
   if(typeof v==='number'){if(Number.isSafeInteger(v)&&v>=0)token(String(v),label,at,found);else counts.unsupported++;return;}
   if(v&&typeof v==='object')for(const [key,value]of Object.entries(v)){if(limited)break;if(!Array.isArray(v))walk(key,depth+1);walk(value,depth+1);}
  }
  // Observe only explicit, bounded fetch headers. Browser-added cookies and
  // transport-added fields remain the parent's receiver-reconciliation boundary.
  const headers=init?own(init,'headers'):undefined;let headerBytes=0,headerCount=0;
  const header=(key,value)=>{
   if(++headerCount>64||typeof key!=='string'||typeof value!=='string')throw Error();
   if(key.length>256||value.length>4096){counts.truncated++;return;}
   headerBytes+=Buffer.byteLength(key)+Buffer.byteLength(value);if(headerBytes>16384){counts.truncated++;return;}
   walk(key);walk(value);
   const k=key.toLowerCase();
   if(!(k==='accept'&&value==='application/json')&&!(k==='content-type'&&['application/json','application/octet-stream'].includes(value)))counts.unsupported++;
  };
  if(headers!==undefined){
   if(headers instanceof Headers&&Object.getPrototypeOf(headers)===Headers.prototype){for(const [key,value]of Headers.prototype.entries.call(headers))header(key,value);}
   else if(Array.isArray(headers)){if(headers.length>64)throw Error();for(let i=0;i<headers.length;i++){const pair=own(headers,String(i));if(!Array.isArray(pair)||pair.length!==2)throw Error();header(own(pair,'0'),own(pair,'1'));}}
   else if(headers&&typeof headers==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(headers))){const keys=Object.keys(headers);if(keys.length>64)throw Error();for(const key of keys)header(key,own(headers,key));}
   else counts.unsupported++;
  }
  if(init&&own(init,'referrer')!==undefined)counts.unsupported++;
  if(label==='public-reader'){
   if(body!==undefined&&body!==null){counts.unsupported++;return record;}
   if(Buffer.byteLength(u.search)>4096){counts.truncated++;return record;}
   const route=u.pathname.slice(5),seen=new Set();for(const [key,value]of u.searchParams){if(!readerParams[route].includes(key)||seen.has(key)){unknown('reader-parameter');continue;}seen.add(key);walk(value);}
   record.methods=['reader_'+route];record.size=bucket(Buffer.byteLength(u.search));
  }else if(method==='GET'){
   if(body!==undefined&&body!==null)counts.unsupported++;
   record.methods=[label==='trusted-query'?'health':'proof_poll'];
  }else if(label==='trusted-proof'){
   record.methods=['proof_submit'];
   if(!(body instanceof Uint8Array)){counts.unsupported++;return record;}
   record.size=bucket(body.byteLength);
   if(body.byteLength>cap.maxBodyBytes){counts.truncated++;return record;}
   if(body.byteLength<4)throw Error();
   const length=new DataView(body.buffer,body.byteOffset,body.byteLength).getUint32(0);
   if(length>32768||length+4>body.byteLength)throw Error();
   const meta=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(body.subarray(4,4+length)));
   if(!meta||Object.keys(meta).sort().join(',')!=='board,chainId,circuits,counts,mode,payloadBytes,rollupVersion,uncompressedBytes,version'||typeof meta.board!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(meta.board)||!['real','disabled'].includes(meta.mode)||[meta.chainId,meta.rollupVersion].some(v=>typeof v!=='string'||!/^[0-9]{1,20}$/.test(v)))throw Error();
   if(meta.version!==2||!Array.isArray(meta.circuits)||meta.circuits.length<1||meta.circuits.length>32||meta.circuits.some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))||!Array.isArray(meta.counts)||meta.counts.length!==meta.circuits.length||meta.counts.some(v=>!Number.isSafeInteger(v)||v<0||v>500000)||meta.counts.reduce((a,b)=>a+b,0)>1500000||!Number.isInteger(meta.uncompressedBytes)||meta.uncompressedBytes<4||meta.uncompressedBytes>64*1024*1024||!Number.isInteger(meta.payloadBytes)||meta.payloadBytes<1||meta.payloadBytes+4+length!==body.byteLength)throw Error();
   token(meta.board,label,at,found);record.proofMode=meta.mode;
   record.witnessCount=meta.counts.length; // Never traverse/decompress witnesses.
  }else{
   if(typeof body!=='string'){counts.unsupported++;return record;}
   if(body.length>cap.maxBodyBytes){counts.truncated++;return record;}
   const bytes=Buffer.byteLength(body);record.size=bucket(bytes);if(bytes>cap.maxBodyBytes){counts.truncated++;return record;}
   const parsed=JSON.parse(body),batch=Array.isArray(parsed)?parsed:[parsed];
   if(batch.length<1||batch.length>32){counts.truncated++;return record;}
   for(const rpc of batch){
    if(!object(rpc)||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'||Object.keys(rpc).some(k=>!['jsonrpc','id','method','params'].includes(k))){unknown('invalid-envelope');continue;}
    if(!(label==='public-l1'?l1Methods:nodeMethods).has(rpc.method)){record.methods.push('unsupported:'+unknown('unsupported-method',rpc.method));continue;}
    record.methods.push(rpc.method);walk(rpc.id);
    const absent=!Object.hasOwn(rpc,'params');
    if(absent&&label==='public-l1'&&omittedL1Params.has(rpc.method))continue;
    if(!Array.isArray(rpc.params)){unknown('params-shape');walk(rpc.params);continue;}
    const params=rpc.params;
    if(label==='public-l1'&&omittedL1Params.has(rpc.method)&&params.length!==0)counts.unsupported++;
    if(txMethods.has(rpc.method)){
     // Installed stdlib Tx serializes only data (kernel inputs) and chonkProof
     // as base64 buffers. Neither is decoded here. Tx hash, public calldata,
     // class logs, every additional key/value and simulation options still walk.
     counts.opaqueTransactions++;
     const tx=params[0];
     if(!object(tx)||!Object.hasOwn(tx,'data')||!Object.hasOwn(tx,'chonkProof')){counts.unsupported++;walk(tx);}
     else for(const [key,value]of Object.entries(tx)){
      walk(key);
      if(key==='data'||key==='chonkProof'){if(!base64(value)){counts.unsupported++;walk(value);}}
      else walk(value);
     }
     for(const value of params.slice(1))walk(value);
    }else if(label==='public-l1'&&['eth_estimateGas','eth_sendTransaction'].includes(rpc.method)){
     // viem's transaction formatter sends calldata in params[0].data only.
     // The pinned sequencer also estimates blob transactions. Only exact EIP-4844
     // blobs (131072 bytes each) at this path are opaque; other fields still walk.
     // This observer accepts at most six blobs; the overall request byte cap applies.
     // The rest of the transaction, block and state overrides are observable.
     const tx=params[0];
     if(rpc.method==='eth_sendTransaction')counts.opaqueTransactions++;
     if(!object(tx)){counts.unsupported++;walk(tx);}
     else for(const [key,value]of Object.entries(tx)){
      walk(key);
      if(key==='data'){
       if(rpc.method==='eth_estimateGas')counts.opaqueTransactions++;
       if(!hexBytes(value)){counts.unsupported++;walk(value);}
      }else if(key==='blobs'&&rpc.method==='eth_estimateGas'){
       // Count this transaction once even when it also carries calldata.
       if(!Object.hasOwn(tx,'data'))counts.opaqueTransactions++;
       if(!Array.isArray(value)||value.length<1||value.length>6){counts.unsupported++;walk(value);}
       else for(const blob of value)if(typeof blob!=='string'||blob.length!==262146||!hexBytes(blob)){counts.unsupported++;walk(blob);}
      }else walk(value);
     }
     for(const value of params.slice(1))walk(value);
    }else if(label==='public-l1'&&rpc.method==='eth_sendRawTransaction'){
     counts.opaqueTransactions++;
     if(!hexBytes(params[0])||params[0]==='0x'){counts.unsupported++;walk(params[0]);}
     for(const value of params.slice(1))walk(value);
    }else walk(params);
   }
  }
  if(limited)counts.truncated++;
  record.roles=[...found].sort();return record;
 }
 function wrapFetch(original){
  if(typeof original!=='function')throw configError();
  return function(...args){
   const at=phase;counts.requests++;let record;
   if(counts.requests>cap.maxRequests)counts.truncated++;
   else try{record=classify(args,at);}catch{counts.observerErrors++;}
   counts.pending++;let done=false;
   const complete=(outcome,response)=>{if(done)return;done=true;counts.pending--;counts.completed++;
    try{if(record){let status=null;try{const n=Object.getOwnPropertyDescriptor(Response.prototype,'status').get.call(response);if(Number.isInteger(n)&&n>=100&&n<=599)status=n;}catch{}
     const row={...record,phase:at,outcome,status};const key=JSON.stringify(row);const old=rows.get(key);if(old)old.count++;else rows.set(key,{...row,count:1});
    }}catch{counts.observerErrors++;}
   };
   let result;try{result=Reflect.apply(original,this,args);}catch(error){complete('rejected');throw error;}
   try{
    if(result instanceof Promise)Promise.prototype.then.call(result,value=>complete('resolved',value),()=>complete('rejected'));
    else{counts.unsupported++;complete('non-promise');}
   }catch{counts.observerErrors++;} // Never replace the original result if attachment fails; pending stays unknown.
   return result;
  };
 }
 return Object.freeze({wrapFetch,registerEndpoint,setPhase(value){if(!WIRE_PHASES.includes(value))throw configError();phase=value;},snapshot(){
  return {schemaVersion:1,privacyAcceptance:'not-evaluated',scope:'Explicit serialized fetch request components only; runtime-added headers, response bodies, native/undici transports and other processes excluded',
   ...counts,unknownReasons:{...unknownReasons},unknownMethods:{...unknownMethods},requestCoverageComplete:counts.requests>0&&counts.pending===0&&['unknown','unsupported','truncated','observerErrors','opaqueTransactions'].every(k=>counts[k]===0),
   externalAcceptanceRequired:['frozen-source-transport-inventory','actual-ingress-positive-controls','decoded-public-effects','deployed-trust-topology'],
   relationships:{...repeated,meaning:'Whole scalar equality aggregates only; constants/content may repeat. No ownership or anonymity inference.'},
   rows:[...rows.values()].map(row=>({...row,methods:[...row.methods],roles:[...row.roles]}))};
 }});
}


// The browser's EXISTING route hook calls this only for its configured query/L1
// endpoints. No fetch wrapper, retry, proving transport or wallet/control input.
export function createRollingPublicTxCapture({queryUrl,l1Url}) {
 const endpoints=new Map([[new URL(queryUrl).href,'query'],[new URL(l1Url).href,'l1']]);
 assert.equal(endpoints.size,2);
 for(const value of endpoints.keys()){const u=new URL(value);assert(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash);}
 const methods={},completionStatuses={},transactions=new Map();let requests=0,completed=0,failed=0,errors=0,truncated=0,unrecognized=0,storedBytes=0;
 const known=new Set([...nodeMethods,...l1Methods,...diagnosticMethods,...captureClientMethods]);
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 return Object.freeze({
  async observe({url,method,body}) {
   const endpoint=endpoints.get(url);if(!endpoint||method!=='POST')return;
   if(++requests>30000){truncated++;return;}
   try {
    if(typeof body!=='string'||Buffer.byteLength(body)>8*1024*1024){truncated++;return;}
    const parsed=JSON.parse(body),batch=Array.isArray(parsed)?parsed:[parsed];
    if(batch.length<1||batch.length>32){truncated++;return;}
    for(const rpc of batch){
     if(!object(rpc)||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'||Object.keys(rpc).some(k=>!['jsonrpc','id','method','params'].includes(k))){errors++;continue;}
     const name=known.has(rpc.method)?rpc.method:'unrecognized';
     methods[endpoint+':'+name]=(methods[endpoint+':'+name]??0)+1;
     if(name==='unrecognized')unrecognized++;
     if(endpoint!=='query'||!txMethods.has(rpc.method))continue;
     const raw=rpc.params?.[0];
     if(!object(raw)||Object.keys(raw).some(k=>!['txHash','data','chonkProof','contractClassLogFields','publicFunctionCalldata'].includes(k))){errors++;continue;}
     const decoded=await Tx.schema.parseAsync(raw),tx=decoded.withoutProof(),hash=tx.getTxHash().toString(),bytes=tx.toBuffer();
     let entry=transactions.get(hash);
     if(!entry){
      if(transactions.size>=64||storedBytes+bytes.length>32*1024*1024){truncated++;continue;}
      storedBytes+=bytes.length;entry={tx,bytes,methods:{},proofs:new Map(),canonical:null};transactions.set(hash,entry);
     }else if(!entry.bytes.equals(bytes)){errors++;continue;}
     entry.methods[rpc.method]=(entry.methods[rpc.method]??0)+1;
     const proof=decoded.chonkProof.toBuffer(),key=digest(proof);
     if(entry.proofs.has(key))entry.proofs.get(key).count++;
     else if(entry.proofs.size<4)entry.proofs.set(key,{sha256:key,bytes:proof.length,count:1});else truncated++;
    }
   } catch { errors++; } // Never retain exception text or original request data.
  },
  complete(status){
   completed++;if(!Number.isInteger(status)||status<200||status>=300)failed++;
   const key=Number.isInteger(status)&&status>=100&&status<=599?String(status):'transport-failure';
   completionStatuses[key]=(completionStatuses[key]??0)+1;
  },
  qualify(hash,{receipt,effect,block,roles}) {
   const entry=transactions.get(hash);assert(entry,'Canonical transaction was not captured');
   assert((entry.methods.node_sendTx??0)+(entry.methods.aztec_sendTx??0)>0,'No captured submission');
   assert.equal(receipt.txHash.toString(),hash);assert(['checkpointed','proven','finalized'].includes(receipt.status)&&receipt.executionResult==='success');
   assert(Number.isSafeInteger(receipt.blockNumber)&&receipt.blockNumber>0);
   const blockHash=receipt.blockHash?.toString();assert.match(blockHash??'',/^0x[0-9a-f]{64}$/);
   assert.equal(block?.blockHash?.toString(),blockHash);assert.equal(block.header.getBlockNumber(),receipt.blockNumber);
   assert(effect?.data instanceof TxEffect);assert.equal(effect.data.txHash.toString(),hash);
   assert.equal(effect.l2BlockHash?.toString(),blockHash);assert.equal(effect.l2BlockNumber,receipt.blockNumber);
   const bytes=effect.data.toBuffer();assert(bytes.length<=8*1024*1024);
   const previous=entry.canonical?Buffer.byteLength(entry.canonical.effectBase64,'base64'):0;
   assert(storedBytes-previous+bytes.length<=32*1024*1024);storedBytes=storedBytes-previous+bytes.length;
   const footprint=roles?.author&&roles?.sharedPayer?classifyT03PublicFootprint({tx:entry.tx,effect:effect.data,roles}):null;
   entry.canonical={blockNumber:receipt.blockNumber,blockHash,status:receipt.status,effectBase64:bytes.toString('base64'),effectSha256:digest(bytes),footprint,
    missingRoles:T03_PUBLIC_ROLES.filter(role=>roles?.[role]==null)};
  },
  snapshot(){return {schemaVersion:1,scope:'Application browser route requests at configured query/L1 endpoints only; extension/serviceworker, remote receiver and other processes excluded',
   requests,completed,pending:requests-completed,failed,errors,truncated,unrecognized,methods:{...methods},completionStatuses:{...completionStatuses},privacyAcceptance:'not-evaluated',
   transactions:[...transactions].map(([hash,e])=>({hash,methods:{...e.methods},proofStrippedTxBase64:e.bytes.toString('base64'),proofStrippedTxSha256:digest(e.bytes),proofs:[...e.proofs.values()].map(p=>({...p})),canonical:e.canonical?structuredClone(e.canonical):null})),
   limits:'Only pinned method names retained; unknown names redacted and counted. Public kernel outputs and encrypted effect logs remain public data, not witnesses or plaintext notes. Equality checks do not establish unlinkability.'};},
 });
}
export function validateRollingPublicRoles(value){
 assert(object(value)&&Object.keys(value).length<=T03_PUBLIC_ROLES.length);
 for(const [role,address]of Object.entries(value))assert(T03_PUBLIC_ROLES.includes(role)&&typeof address==='string'&&/^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(address)&&BigInt(address)>0n);
 return {...value};
}

// Same no-retry, bounded-body SDK transport as the public reader. The caller's
// existing deadline owns the whole run; this read never starts after it expires.
export function createRollingCaptureNode({url,remaining,fetchImpl=fetch}){
 const discard=()=>{},silent={isLevelEnabled:()=>false,debug:discard,info:discard,warn:discard,error:discard,trace:discard,verbose:discard,fatal:discard};
 return createSafeJsonRpcClient(url,AztecNodeApiSchema,{namespaceMethods:'aztec',maxBatchSize:3,log:silent,fetch:async(host,body)=>{
  try{
   const timeout=Math.min(5000,remaining());assert(Number.isSafeInteger(timeout)&&timeout>0);
   const response=await fetchImpl(host,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(timeout)});
   assert(response.ok&&response.body);let size=0;const chunks=[];
   for await(const chunk of response.body){size+=chunk.length;assert(size<=8*1024*1024);chunks.push(chunk);}
   return {response:JSON.parse(Buffer.concat(chunks).toString('utf8')),headers:response.headers};
  }catch{throw Error('Public capture read unavailable');}
 }});
}
