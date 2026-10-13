// Operator lifecycle, injected chain APIs; no provider or board implementation coupling.
import fs from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
export async function fileState(file) {
 const directory=dirname(file),created=await fs.mkdir(directory,{recursive:true,mode:0o700});
 // Also persist newly created directory entries, up to the first existing parent.
 const syncDirectories=[directory];
 if(created){let current=directory;const parent=dirname(created);while(current!==parent){current=dirname(current);syncDirectories.push(current);}}
 let value;try{value=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;value={operations:{}};}
 let uncertain=false;
 const persistenceError=()=>Object.assign(Error('State persistence uncertain; reopen and reconcile before writing'),{code:'STATE_PERSISTENCE_UNCERTAIN'});
 return {read:()=>value,async write(next){
  if(uncertain)throw persistenceError();
  const serialized=JSON.stringify(next,null,2)+'\n',tmp=file+'.'+randomBytes(6).toString('hex');
  let handle,renamed=false;
  try{
   handle=await fs.open(tmp,'wx',0o600);
   await handle.writeFile(serialized);await handle.sync();await handle.close();handle=null;
   await fs.rename(tmp,file);renamed=true;
   for(const directory of syncDirectories){
    const parent=await fs.open(directory,'r');try{await parent.sync();}finally{await parent.close();}
   }
   // Neither acknowledgement nor the in-memory snapshot advances before durability.
   value=next;
  }catch{
   uncertain=true;
   if(handle)try{await handle.close();}catch{}
   if(!renamed)try{await fs.unlink(tmp);}catch{}
   // Never expose raw filesystem diagnostics or overwrite an uncertain disk snapshot.
   throw persistenceError();
  }
 }};
}
/** Save before broadcast. A repeated command waits for the exact previous hash. */
export async function recordedTransaction({store,name,identity,prepare,broadcast,wait}) {
 let record=store.read().operations[name];
 if(record&&record.identity!==identity)throw Error('Saved transaction belongs to a different operation');
 if(!record){record={identity,...await prepare()};await store.write({...store.read(),operations:{...store.read().operations,[name]:record}});}
 await broadcast(record);
 const receipt=await wait(record);return {record,receipt};
}
export async function outboxArguments(node,txHash,{requireFinalized=true}={}){
 if(requireFinalized){
  const receipt=await node.getTxReceipt(txHash);
  if(receipt.executionResult==='reverted'||receipt.status==='dropped')throw Error('Portal source transaction failed');
  if(receipt.status!=='finalized'||receipt.executionResult!=='success')throw Error('Portal message awaits network finality; run this command again later');
 }
 const effect=await node.getTxEffect(txHash),messages=effect?.data.l2ToL1Msgs.filter(x=>!x.isZero());
 if(messages?.length!==1)throw Error('Expected one portal message');
 const witness=await node.getL2ToL1MembershipWitness(txHash,messages[0]);
 if(!witness)throw Error('Portal message awaits network settlement; run this command again later');
 return [BigInt(witness.epochNumber),BigInt(witness.numCheckpointsInEpoch),witness.leafIndex,witness.siblingPath.toBufferArray().map(b=>'0x'+Buffer.from(b).toString('hex'))];
}

// Explicit opt-in. Legacy callers above retain their existing transaction policy.
const rejected = () => Error('Rolling operator input rejected');
function dataRecord(value, keys) {
 if(!value || Object.getPrototypeOf(value)!==Object.prototype)throw rejected();
 const out={};
 for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!keys.includes(key)||!d||!Object.hasOwn(d,'value'))throw rejected();
  out[key]=d.value;
 }
 return out;
}
export function operatorApplicationProfile(value) {
 if(!value||typeof value!=='object')throw rejected();
 const d=Object.getOwnPropertyDescriptor(value,'applicationProfile');
 if(!d){if('applicationProfile'in value)throw rejected();return 'legacy';}
 if(!Object.hasOwn(d,'value')||!['legacy','rolling'].includes(d.value))throw rejected();
 return d.value;
}
export function rollingOperatorConfig(value) {
 const c=dataRecord(value,['applicationProfile','nodeUrl','ethereumUrl','chainId','rollupVersion','rollupAddress','boardAddress','operatorAddress','development','operatorFile','lifecycle']);
 if(c.applicationProfile!=='rolling'||typeof c.development!=='boolean')throw rejected();
 for(const key of ['chainId','rollupVersion'])if(typeof c[key]!=='string'||! /^[1-9][0-9]{0,19}$/.test(c[key])||BigInt(c[key])>=2n**64n)throw rejected();
 for(const [key,n] of [['rollupAddress',40],['boardAddress',64],['operatorAddress',64]])if(typeof c[key]!=='string'||!new RegExp('^0x[0-9a-f]{'+n+'}$').test(c[key])||BigInt(c[key])===0n)throw rejected();
 if(c.development?c.chainId!=='31337':c.chainId!=='11155111')throw rejected();
 for(const key of ['nodeUrl','ethereumUrl']){
  if(typeof c[key]!=='string'||c[key].length>2048)throw rejected();
  let url;try{url=new URL(c[key]);}catch{throw rejected();}
  if(url.username||url.password||url.search||url.hash||url.href!==c[key]||!(url.protocol==='https:'||(c.development&&url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname))))throw rejected();
  if(key==='nodeUrl'&&!c.development&&url.pathname!=='/v1/node')throw rejected();
 }
 if(c.operatorFile!==undefined&&(typeof c.operatorFile!=='string'||!c.operatorFile.startsWith('/')||c.operatorFile.length>4096))throw rejected();
 // The actor locator is private local input, never part of a deployment identity.
 if(c.lifecycle!==undefined)rollingLifecycleConfig(c);
 const {operatorFile,lifecycle,...publicConfig}=c;return Object.freeze(publicConfig);
}

/** SDK custom fetch, scoped to one configured endpoint. Never use a global injector.
 * Synthetic fetch/serializer injection is for controlled transport tests only. */
export function operatorNodeFetch({endpoint,key,serialize,fetchImpl=globalThis.fetch}) {
 if(typeof endpoint!=='string'||(key!==undefined&&(typeof key!=='string'||!/^[0-9a-f]{64}$/.test(key)))||typeof serialize!=='function')throw rejected();
 const url=new URL(endpoint);
 if(url.username||url.password||url.search||url.hash||url.href!==endpoint)throw rejected();
 return async(host,body,extraHeaders={})=>{
  let timer,reader;
  const controller=new AbortController();
  try{
   if(host!==endpoint||Object.getPrototypeOf(extraHeaders)!==Object.prototype||Reflect.ownKeys(extraHeaders).length)throw rejected();
   const encoded=serialize(body);if(typeof encoded!=='string'||Buffer.byteLength(encoded)>8*1024**2)throw rejected();
   timer=setTimeout(()=>controller.abort(),10000);
   const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',headers:{'content-type':'application/json',...(key?{'x-aztec-api-key':key}:{})},body:encoded,signal:controller.signal});
   if(response.status!==200||response.redirected)throw rejected();
   reader=response.body.getReader();const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32*1024**2)throw rejected();chunks.push(Buffer.from(value));}
   const decoded=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!Array.isArray(body)||!Array.isArray(decoded)||decoded.length!==body.length)throw rejected();
   for(let i=0;i<decoded.length;i++){const row=decoded[i];if(!row||typeof row!=='object'||Array.isArray(row)||row.id!==body[i].id||row.jsonrpc!=='2.0'||(Object.hasOwn(row,'result')===Object.hasOwn(row,'error')))throw rejected();}
   // Do not let arbitrary upstream error text become an SDK/CLI exception.
   for(const row of Array.isArray(decoded)?decoded:[decoded])if(row&&Object.hasOwn(row,'error'))row.error={code:-32000,message:'Operator RPC rejected'};
   return {response:decoded,headers:response.headers};
  }catch{throw Error('Operator RPC unavailable');}
  finally{clearTimeout(timer);controller.abort();try{await reader?.cancel();}catch{}}
 };
}

/** Durable intent before wallet/proof construction; durable signed bytes before
 * the sole send. Every retained record is read-only reconciliation, even dropped.
 * execute uses the normal SDK send pipeline through the supplied once callback. */
export async function onceAztecOperation({store,name,identity,journalIdentity=identity,scope='constructor-only',execute,reconcile}) {
 if(!['deploy-escrow','claim-fees','deploy-portal','bind','activate','register','relay-funding'].includes(name)||typeof identity!=='string'||typeof journalIdentity!=='string')throw rejected();
 const old=store.read().operations[name];
 if(old){
  if(old.schemaVersion!==1||old.policy!=='reconcile-only'||old.identity!==identity||(old.journalIdentity??old.identity)!==journalIdentity||!['preparing','submission-unknown'].includes(old.phase))throw Error('Saved operation scope mismatch');
  return reconcile(old);
 }
 const write=async record=>store.write({...store.read(),operations:{...store.read().operations,[name]:record}});
 let record={schemaVersion:1,policy:'reconcile-only',identity,...(journalIdentity!==identity?{journalIdentity}:{}),phase:'preparing'},sent=false;
 await write(record);
 try{
  await execute({
   bindDeployment:async deployment=>{if(sent||record.deployment)throw rejected();record={...record,deployment};await write(record);},
   submit:async({hash,raw},broadcast)=>{
    if(sent||typeof hash!=='string'||!/^0x[0-9a-f]{64}$/.test(hash)||typeof raw!=='string'||! /^(?:[0-9a-f]{2})+$/.test(raw)||raw.length>16*1024**2)throw rejected();
    sent=true;record={...record,phase:'submission-unknown',hash,raw};await write(record);
    return broadcast();
   },
  });
 }catch{
  // No new attempt, even when preparation or persistence failed before a hash.
  // The disk record remains authoritative; the writer may be poisoned.
  return {status:'unresolved',scope,canonical:false};
 }
 return reconcile(record);
}

/** Read-only reconciliation. SDK adapters provide exact typed reads; the closed
 * result never publishes raw receipt/errors or upgrades constructor to service readiness. */
export async function reconcileRollingOperation({record,development,expected,reads}) {
 const unknown=()=>({status:'unresolved',scope:'constructor-only',canonical:false,...(typeof record.hash==='string'?{transactionHash:record.hash}:{})});
 if(typeof record.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(record.hash))return unknown();
 try{
  if(record.phase!=='submission-unknown'||typeof record.raw!=='string'||! /^(?:[0-9a-f]{2})+$/.test(record.raw)||record.raw.length>16*1024**2||!await reads.signed(record.raw,record.hash))return unknown();
  const r=await reads.receipt(record.hash);
  if(String(r?.txHash)!==record.hash||!['checkpointed','proven','finalized'].includes(r.status)||(!development&&r.status!=='finalized')||!['success','reverted'].includes(r.executionResult)||!Number.isSafeInteger(r.blockNumber)||r.blockNumber<1||typeof r.blockHash!=='string'||!/^0x[0-9a-f]{64}$/.test(r.blockHash))return unknown();
  const anchor={number:r.blockNumber,hash:r.blockHash};
  const block=await reads.block(anchor.number),effect=await reads.effect(record.hash);
  if(String(block?.hash)!==anchor.hash||String(effect?.l2BlockHash)!==anchor.hash||effect?.l2BlockNumber!==anchor.number||String(effect?.data?.txHash)!==record.hash||effect.data.revertCode.isOK()!==(r.executionResult==='success'))return unknown();
  if(expected&&r.executionResult==='success'){
   if(JSON.stringify(record.deployment)!==JSON.stringify(expected))return unknown();
   const instance=await reads.instance(expected.address,anchor);
   for(const field of ['address','deployer','originalContractClassId','currentContractClassId','salt','initializationHash','immutablesHash'])if(String(instance?.[field])!==expected[field])return unknown();
   if(instance.version!==expected.version||await reads.address(instance)!==expected.address)return unknown();
   // Actual public immutable constructor values, including derived owner, at receipt anchor.
   for(const [field,value] of Object.entries(expected.storage))if(await reads.storage(expected.address,field,anchor)!==value)return unknown();
  }
  if(String((await reads.block(anchor.number))?.hash)!==anchor.hash)return unknown();
  return {status:r.executionResult==='success'?'succeeded':'failed',scope:'constructor-only',canonical:true,transactionHash:record.hash,blockNumber:anchor.number,blockHash:anchor.hash,...(expected&&r.executionResult==='success'?{escrow:expected.address,portalReady:false,registrationReady:false,hostedServiceReady:false}:{})};
 }catch{return unknown();}
}

export async function rollingPxeOptions(development,nativeOptions) {
 if(typeof development!=='boolean')throw rejected();
 return development?{proverEnabled:false}:{proverEnabled:true,proverOrOptions:await nativeOptions()};
}

export async function bindRollingJournal(store,identity,newSalt) {
 const value=store.read();
 if(!value||typeof value!=='object'||Array.isArray(value)||!value.operations||typeof value.operations!=='object'||Array.isArray(value.operations))throw Error('Journal scope mismatch');
 if(value.identity===undefined){
  if(Object.keys(value).some(k=>k!=='operations')||Object.keys(value.operations).length)throw Error('Historical journal requires reconciliation');
  await store.write({...value,identity,salt:newSalt()});return;
 }
 if(value.identity!==identity||Object.keys(value).some(k=>!['identity','salt','operations'].includes(k))||typeof value.salt!=='string')throw Error('Journal scope mismatch');
 for(const [name,record] of Object.entries(value.operations)){
  const constructor=['deploy-escrow','claim-fees'].includes(name);
  if(constructor?record?.journalIdentity!==undefined:record?.journalIdentity!==identity)throw Error('Historical journal requires reconciliation');
  if(!['deploy-escrow','claim-fees','deploy-portal','bind','activate','register'].includes(name)||!record||record.schemaVersion!==1||record.policy!=='reconcile-only'||(record.journalIdentity??record.identity)!==identity||!['preparing','submission-unknown'].includes(record.phase))throw Error('Historical journal requires reconciliation');
 }
}

// CLI input ordering: unsupported rolling commands/configurations fail before
// opening any actor file. Legacy file selection keeps its existing behavior.
export async function readOperatorActor({command,config,actorPath,read}) {
 if(operatorApplicationProfile(config)==='rolling'){
  rollingOperatorConfig(config);
  rollingOperatorCommandScope(command,config);
 }
 return read(actorPath||config.operatorFile);
}

// Only called after the pinned SDK schema has created its TxHash/BlockHash.
// The reconciliation boundary consumes detached primitives, never raw errors.
export function projectRollingReceipt(receipt) {
 return {txHash:receipt.txHash?.toString(),status:receipt.status,executionResult:receipt.executionResult,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash?.toString()};
}

/** Optional lifecycle settings are captured separately so constructor campaign
 * identity and already-retained constructor records do not change. */
export function rollingLifecycleConfig(value) {
 const descriptor=Object.getOwnPropertyDescriptor(value,'lifecycle');
 if(!descriptor||!Object.hasOwn(descriptor,'value'))throw rejected();
 const c=dataRecord(descriptor.value,['tokenAddress','pluginId']);
 if(typeof c.tokenAddress!=='string'||!/^0x[0-9a-f]{40}$/.test(c.tokenAddress)||BigInt(c.tokenAddress)===0n||typeof c.pluginId!=='string'||!/^0x[0-9a-f]{64}$/.test(c.pluginId)||BigInt(c.pluginId)===0n||BigInt(c.pluginId)>=0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n)throw rejected();
 return Object.freeze(c);
}
export function rollingOperatorCommandScope(command,config) {
 if(['fees','claim-fees','deploy-escrow'].includes(command))return 'constructor-only';
 if(!['deploy-portal','bind','activate','register','status'].includes(command))throw rejected();
 rollingLifecycleConfig(config);return 'portal-registration';
}
/** Compare every executable byte, allowing only compiler-declared immutable
 * words. Exact getter values at the same canonical block are checked by caller. */
export function verifyPluginPortalRuntime(actual,deployed) {
 if(typeof actual!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(actual)||typeof deployed?.object!=='string'||actual.length!==deployed.object.length)throw rejected();
 const template=Buffer.from(deployed.object.slice(2),'hex'),observed=Buffer.from(actual.slice(2),'hex'),seen=new Set();
 const groups=Object.values(deployed.immutableReferences??{});if(groups.length!==6)throw rejected();
 for(const refs of groups){if(!Array.isArray(refs)||!refs.length)throw rejected();let word;
  for(const r of refs){if(!Number.isSafeInteger(r.start)||r.start<0||r.length!==32||r.start+32>template.length)throw rejected();
   const current=observed.subarray(r.start,r.start+32).toString('hex');if(word!==undefined&&word!==current)throw rejected();word=current;
   for(let i=r.start;i<r.start+32;i++){if(seen.has(i)||template[i]!==0)throw rejected();seen.add(i);observed[i]=0;}
  }
 }
 if(!observed.equals(template))throw rejected();return true;
}
/** No send path: authenticate retained signed L1 bytes, receipt, original block
 * and required finality before checking the operation's exact on-chain effect. */
export async function reconcileRollingEthereum({record,development,reads,scope='portal-registration'}) {
 if(!['portal-registration','aggregate-funding'].includes(scope))throw rejected();
 const unknown=()=>({status:'unresolved',scope,canonical:false,...(typeof record?.hash==='string'?{transactionHash:record.hash}:{})});
 try{
  if(record?.phase!=='submission-unknown'||!/^0x[0-9a-f]{64}$/.test(record.hash)||typeof record.raw!=='string'||!/^(?:[0-9a-f]{2})+$/.test(record.raw)||!await reads.signed(record))return unknown();
  const receipt=await reads.receipt(record.hash);
  if(receipt?.hash!==record.hash||![0,1].includes(receipt.status)||!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<1||typeof receipt.blockHash!=='string'||!/^0x[0-9a-f]{64}$/.test(receipt.blockHash))return unknown();
  const anchor={number:receipt.blockNumber,hash:receipt.blockHash};
  if((await reads.block(anchor.number))?.hash!==anchor.hash)return unknown();
  const head=await reads.head(development?'latest':'finalized');if(!Number.isSafeInteger(head?.number)||head.number<anchor.number)return unknown();
  if(receipt.status===1&&!await reads.effect(record,anchor,receipt))return unknown();
  if((await reads.block(anchor.number))?.hash!==anchor.hash)return unknown();
  return {status:receipt.status===1?'succeeded':'failed',scope,canonical:true,transactionHash:record.hash,blockNumber:anchor.number,blockHash:anchor.hash};
 }catch{return unknown();}
}

/** Reuse ethers transport but refuse redirects and throttled retransmission
 * before FetchRequest can create another request (redirect loses its options). */
export function operatorEthereumRequest(FetchRequest,endpoint) {
 const request=new FetchRequest(endpoint),getUrl=request.getUrlFunc;
 request.timeout=10000;request.setThrottleParams({maxAttempts:1});request.retryFunc=()=>false;
 request.getUrlFunc=async(req,signal)=>{
  if(req.url!==endpoint)throw Error('Operator Ethereum RPC unavailable');
  const result=await getUrl(req,signal);
  if(result.statusCode!==200||result.body?.byteLength>2*1024**2)throw Error('Operator Ethereum RPC unavailable');
  return result;
 };
 return request;
}

export function matchRollingEthereumSigned({parse,record,chainId,to,data,from,nonce}) {
 try{
  if(typeof record?.raw!=='string'||!/^(?:[0-9a-f]{2})+$/.test(record.raw)||record.raw.length>16*1024**2||typeof record.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(record.hash)||typeof from!=='string'||!/^0x[0-9a-f]{40}$/.test(from)||!Number.isSafeInteger(nonce)||nonce<0)return false;
  const tx=parse('0x'+record.raw);
  return tx.hash===record.hash&&tx.chainId===BigInt(chainId)&&tx.value===0n&&tx.from?.toLowerCase()===from&&tx.nonce===nonce&&(tx.to?.toLowerCase()??null)===to&&tx.data.toLowerCase()===data;
 }catch{return false;}
}

export function requireRollingReadyEffect(effect,receipt,leaf) {
 if(String(effect?.data?.txHash)!==receipt.transactionHash||effect?.l2BlockNumber!==receipt.blockNumber||String(effect?.l2BlockHash)!==receipt.blockHash||effect?.data?.revertCode?.isOK()!==true)throw rejected();
 const messages=effect.data.l2ToL1Msgs.filter(x=>!x.isZero());
 if(messages.length!==1||!messages[0].equals(leaf))throw rejected();return true;
}
