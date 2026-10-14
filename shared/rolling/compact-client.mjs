// Transport only. A validated response is NOT an authenticated block: callers
// must run authenticateCompactBlock with independently canonical network/tier
// and account-context checks before using any ciphertext. No SDK import here.
export const COMPACT_GATEWAY_ROUTE='/v1/compact-block';
export const COMPACT_NATIVE_ROUTE='/rolling/compact-block-v1';
export const COMPACT_TRANSPORT_LIMITS=Object.freeze({requestBytes:1024,responseBytes:2*1024*1024,fields:24575,headerFields:23,timeoutMs:10000});
const modulus=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const fail=()=>Object.assign(Error('Compact block unavailable'),{code:'BB_COMPACT_BLOCK_UNAVAILABLE'});
const check=value=>{if(!value)throw fail();};
function exact(value,required,optional=[]){
 check(value&&Object.getPrototypeOf(value)===Object.prototype);
 const keys=Reflect.ownKeys(value);check(keys.length>=required.length&&keys.length<=required.length+optional.length&&keys.every(k=>required.includes(k)||optional.includes(k)));
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);check(d&&Object.hasOwn(d,'value'));out[key]=d.value;}
 check(required.every(k=>Object.hasOwn(out,k)));return out;
}
function field(value){check(typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value)&&BigInt(value)<modulus);return value;}
export function validateCompactTier(value){check(['proposed','checkpointed','proven','finalized'].includes(value));return value;}
export function validateCompactSelector(value,tier){
 const p=exact(value,['schemaVersion','number','hash','tier']);check(p.schemaVersion===1&&p.tier===validateCompactTier(tier));
 check(Number.isSafeInteger(p.number)&&p.number>=1&&p.number<=0xffffffff);field(p.hash);
 return Object.freeze(p);
}
function fields(value,max,min){
 check(Array.isArray(value));const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
 check(Number.isSafeInteger(length)&&length>=min&&length<=max);
 const result=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));check(d&&Object.hasOwn(d,'value'));result.push(field(d.value));}
 check(Reflect.ownKeys(value).length===length+1);return Object.freeze(result);
}
export function validateCompactResponse(value,selector){
 const p=exact(value,['schemaVersion','number','hash','headerFields','fields']);
 check(p.schemaVersion===1&&p.number===selector.number&&p.hash===selector.hash);
 return Object.freeze({schemaVersion:1,number:p.number,hash:p.hash,
  headerFields:fields(p.headerFields,23,23),fields:fields(p.fields,24575,7)});
}
// Fetch supplies decoded chunks, including when content-encoding was compressed.
// Stop before JSON.parse; never use response.json()/text() on an unbounded body.
export async function readCompactResponse(response,selector){
 let reader;
 try{
  check(response.status===200&&/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''));
  reader=response.body.getReader();const chunks=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;check(part.value instanceof Uint8Array);size+=part.value.byteLength;check(size<=COMPACT_TRANSPORT_LIMITS.responseBytes);chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return validateCompactResponse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),selector);
 }catch{if(reader){try{await reader.cancel();}catch{}}else{try{await response.body?.cancel();}catch{}}throw fail();}
 finally{reader?.releaseLock();}
}
/** Explicitly trusted gateway origin; endpoint configuration is not operator
 * identity. Caller holds its account lease until read settles, including abort.
 * contextGuard must reject a changed account generation before AND after awaits.
 * No new attempt/retry, financial operation, lifecycle, queue or global mutation.
 */
export function createRollingCompactClient(input){
 let endpoint,tier,guard,fetcher;
 try{
  const p=exact(input,['url','tier','contextGuard'],['allowLocalDev']);
  check(typeof p.url==='string'&&typeof p.contextGuard==='function'&&(p.allowLocalDev===undefined||typeof p.allowLocalDev==='boolean'));
  const url=new URL(p.url);check(!url.username&&!url.password&&!url.search&&!url.hash&&(url.pathname==='/'||url.pathname===''));
  check(url.protocol==='https:'||(p.allowLocalDev===true&&url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)));
  endpoint=new URL(COMPACT_GATEWAY_ROUTE,url).href;tier=validateCompactTier(p.tier);guard=p.contextGuard;fetcher=globalThis.fetch.bind(globalThis);
 }catch{throw fail();}
 let active=false;
 async function read(input,options={}){
  let selector,signal;
  try{const p=exact(input,['number','hash']);selector=validateCompactSelector({schemaVersion:1,...p,tier},tier);
   const o=exact(options,[],['signal']);signal=o.signal;check(signal===undefined||signal instanceof AbortSignal);
  }catch{throw fail();}
  // Timer signals cancellation, never races the underlying fetch/guard promise.
  const controller=new AbortController();const abort=()=>controller.abort();
  const timer=setTimeout(abort,COMPACT_TRANSPORT_LIMITS.timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const current=()=>check(!controller.signal.aborted);
  try{
   current();await guard();current();
   const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(selector),redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
   let value;try{value=await readCompactResponse(response,selector);}finally{current();}
   await guard();current();return value;
  }catch{throw fail();}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({async read(input,options={}){
  if(active)throw fail();active=true;try{return await read(input,options);}finally{active=false;}
 },async readMany(inputs,options={}){
  if(active)throw fail();let captured,settings,emptyPrefix;
  try{const o=exact(options,[],['signal','emptyPrefix']);check(o.emptyPrefix===undefined||typeof o.emptyPrefix==='boolean');emptyPrefix=o.emptyPrefix===true;settings={signal:o.signal};check(settings.signal===undefined||settings.signal instanceof AbortSignal);check(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=32);check(Reflect.ownKeys(inputs).length===inputs.length+1);captured=Array.from({length:inputs.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(inputs,String(i));check(d&&Object.hasOwn(d,'value'));const p=exact(d.value,['number','hash']);validateCompactSelector({schemaVersion:1,...p,tier},tier);return Object.freeze(p);});check(captured.every((p,i)=>i===0||p.number===captured[i-1].number+1));}catch{throw fail();}
  active=true;
  try{const values=[];for(const selector of captured){
   // Native and trusted compact endpoints admit one physical block at a time.
   // Keep that admission bound; the SDK still commits authenticated empty pages in batches.
   const value=await read(selector,settings);values.push(value);
   // Selection only: the SDK still authenticates every body it consumes.
   if(emptyPrefix&&value.fields.length!==7)break;
  }return Object.freeze(values);}finally{active=false;}
 }});
}
