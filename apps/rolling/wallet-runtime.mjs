import {projectIncludedPreference} from '../../shared/rolling/preferences.mjs';
import {selectPrivateViews} from '../../shared/rolling/private-views.mjs';
// Public code and contract data may load in the background. Account creation,
// wallet permissions and private sessions remain explicit user actions.
import {createRollingWalletSession,createRollingRefundSession} from './wallet-session.mjs';
// Fresh metadata/API requests retain a transport failure bound. Immutable asset
// delivery ends on native completion/error or page cancellation, never elapsed time.
const METADATA_LOAD_MS=30000;
const assetURL=asset=>asset.url+'?sha256='+asset.sha256;
const failed=()=>Object.assign(Error('Private account setup is unavailable. Reload before trying again.'),{code:'ROLLING_RUNTIME_UNAVAILABLE'});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function boundedJSON(url,limit,expected,request={}){
 const signal=expected?request.signal:request.signal?AbortSignal.any([request.signal,AbortSignal.timeout(METADATA_LOAD_MS)]):AbortSignal.timeout(METADATA_LOAD_MS);
 const response=await fetch(expected?assetURL(expected):url,{...request,credentials:'omit',redirect:'error',cache:expected?'default':'no-store',referrerPolicy:'no-referrer',signal});
 if(!response.ok||!response.body){await response.body?.cancel().catch(()=>{});throw failed();}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw failed();chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(expected&&(size!==expected.bytes||await digest(bytes)!==expected.sha256))throw failed();
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function descriptor(value){
 if(!value||Object.keys(value).sort().join()!=='bytes,sha256,url'||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>128*1024*1024||
  !/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.url!=='string'||!/^\/(?:wallet|crs)\/[a-zA-Z0-9_.-]+$/.test(value.url))throw failed();
 return value;
}
function script(asset,signal){
 descriptor(asset);
 return new Promise((resolve,reject)=>{
  const element=document.createElement('script');element.src=assetURL(asset);
  element.integrity='sha256-'+btoa(String.fromCharCode(...asset.sha256.match(/../g).map(x=>parseInt(x,16))));
  element.crossOrigin='anonymous';element.referrerPolicy='no-referrer';
  const cleanup=()=>{element.onload=null;element.onerror=null;signal.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();element.remove();reject(failed());};
  element.onload=()=>{cleanup();resolve();};element.onerror=cancel;
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return;}
  document.head.append(element);
 });
}
let loading;
/** A failed load remains failed for this page: no automatic script replay or
 * account reinitialization after a partially executed custody bundle. */
export function loadRollingWalletRuntime(){
 if(!loading){
  const controller=new AbortController(),cancel=()=>controller.abort();
  globalThis.addEventListener('pagehide',cancel,{once:true});
  loading=load(controller.signal).catch(()=>{throw failed();}).finally(()=>globalThis.removeEventListener('pagehide',cancel));
 }
 return loading;
}
async function load(signal){
 if(!isSecureContext||!navigator.locks?.request||!crossOriginIsolated)throw failed();
 const metadata=await boundedJSON('/wallet/runtime.json',65536,undefined,{signal});
 if(metadata?.schemaVersion!==1||!Array.isArray(metadata.scripts)||metadata.scripts.length!==8||
  Object.keys(metadata).sort().join()!=='artifacts,config,crs,proofsEnabled,remoteProver,schemaVersion,scripts,trustedQuery')throw failed();
 const config=structuredClone(metadata.config),query=structuredClone(metadata.trustedQuery),remote=metadata.remoteProver?structuredClone(metadata.remoteProver):undefined;
 if(typeof metadata.proofsEnabled!=='boolean'||(!metadata.proofsEnabled&&config.network?.chainId!=='31337'))throw failed();
 // Host pins exact script ordering and hashes. Reject repeated or unexpected
 // script names before any code executes, including the account singleton.
 const names=['ethers.js','aztec_bundle.js','crs-client.js','wallet-providers.js','claim-secret-store.js','ethereum-account-session.js','account.js','engine.js'];
 if(metadata.scripts.some((a,i)=>descriptor(a).url!=='/wallet/'+names[i]))throw failed();
 if(Object.keys(metadata.artifacts??{}).sort().join()!==(config.bok?'board,bok,privateFee':'board,privateFee'))throw failed();
 // Start script downloads alongside the independent contract data. Matching
 // integrity/CORS attributes let the ordered script elements reuse these requests.
 const preloads=metadata.scripts.map(asset=>{
  const link=document.createElement('link');link.rel='preload';link.as='script';link.href=assetURL(asset);
  link.integrity='sha256-'+btoa(String.fromCharCode(...asset.sha256.match(/../g).map(x=>parseInt(x,16))));link.crossOrigin='anonymous';link.referrerPolicy='no-referrer';document.head.append(link);return link;
 });
 const bokAsset=config.bok?structuredClone(descriptor(metadata.artifacts.bok)):undefined;
 let boardRaw,feeRaw;
 try{
  const values=await Promise.all([
   boundedJSON(descriptor(metadata.crs).url,65536,metadata.crs,{signal}),
   boundedJSON(descriptor(metadata.artifacts.board).url,32*1024*1024,metadata.artifacts.board,{signal}),
   boundedJSON(descriptor(metadata.artifacts.privateFee).url,32*1024*1024,metadata.artifacts.privateFee,{signal})
  ]);
  [globalThis.BILLBOARD_CRS_MANIFEST,boardRaw,feeRaw]=values;
  globalThis._getPublicConfig=()=>structuredClone(config);
  // Evaluate in dependency order; downloads are already running through preload.
  for(const asset of metadata.scripts)await script(asset,signal);
 }finally{for(const link of preloads)link.remove();}
 const sdk=globalThis.__aztec,account=globalThis.BillboardAccount,routing=globalThis.BillboardPrivateFeeRouting;
 if(!sdk?.createTrustedPrivateNode||!account?.configure||!routing?.isPrivateWalletForNode||!globalThis.ethers)throw failed();
 globalThis.BillboardCRS.validateManifest(globalThis.BILLBOARD_CRS_MANIFEST);
 const boardArtifact=sdk.loadContractArtifact(boardRaw),privateFeeArtifact=sdk.loadContractArtifact(feeRaw);
 let bokLoading;
 const getBokArtifact=()=>{
  if(!bokAsset)return Promise.resolve(undefined);
  if(!bokLoading){
   const controller=new AbortController(),cancel=()=>controller.abort();
   globalThis.addEventListener('pagehide',cancel,{once:true});
   bokLoading=boundedJSON(bokAsset.url,32*1024*1024,bokAsset,{signal:controller.signal})
    .then(raw=>sdk.loadContractArtifact(raw)).finally(()=>globalThis.removeEventListener('pagehide',cancel));
  }
  return bokLoading;
 };
 let session,creating;
 // Only metadata leaves provider discovery. The selected transport stays inside
 // existing custody, which verifies the configured chain and invalidates changes.
 const fundingWallets=()=>{
  if(globalThis.walletState.invalidated)throw failed();
  globalThis.BillboardWalletProviders.refresh();
  return globalThis.BillboardWalletProviders.list().map(({id,name,icon})=>Object.freeze({id,name,...(icon?{icon}:{})}));
 };
 const fundingWalletStatus=()=>{
  const value=account.snapshot();
  return Object.freeze({connected:value.ethereumConnected===true&&!value.invalidated,
   name:value.ethereumConnected?value.ethereumWalletName:null,address:value.ethereumConnected?value.ethereumAddress:null});
 };
 const connectFundingWallet=async id=>{
  const current=globalThis.walletState.aztec;
  if(!current||globalThis.walletState.invalidated||typeof id!=='string')throw failed();
  const selected=globalThis.BillboardWalletProviders.list().find(entry=>entry.id===id);
  if(!selected)throw failed();
  await account.connect(selected.provider,selected.name,{selectAccount:selected.rdns==='io.metamask'});
  if(globalThis.walletState.aztec!==current||globalThis.walletState.invalidated)throw failed();
  return fundingWalletStatus();
 };
 const canStartTestAccount=['11155111','31337'].includes(String(config.network.chainId));
 const startingTestAccount=()=>canStartTestAccount&&globalThis.location.hash==='#/new-account';
 const signInWallet=async (id,{freshAccount=startingTestAccount()}={})=>{
  if(globalThis.walletState.aztec||globalThis.walletState.invalidated)throw failed();
  const selected=globalThis.BillboardWalletProviders.list().find(entry=>entry.id===id);
  if(!selected)throw failed();
  await account.connect(selected.provider,selected.name,{deriveAccount:true,providerId:selected.rdns??selected.id,freshAccount});
  if(startingTestAccount()){const url=new URL(globalThis.location.href);url.hash='/home';globalThis.history.replaceState(null,'',url);}
  return true;
 };
 const restoreAccount=()=>startingTestAccount()?Promise.resolve(false):account.restoreRemembered();
 return Object.freeze({signInWallet,restoreAccount,canStartTestAccount,startingTestAccount,account,selectPrivateViews,projectIncludedPreference,refundOnly:config.refundOnly===true,...(config.publicRefundRpcUrl?{createRefundSession(){
  if(session)return Promise.resolve(session);if(creating)return creating;
  const selected=globalThis.walletState.aztec;if(!selected||globalThis.walletState.invalidated)return Promise.reject(failed());
  const guard=()=>{if(globalThis.walletState.invalidated||globalThis.walletState.aztec!==selected)throw failed();};
  creating=createRollingRefundSession({sdk,ethers:globalThis.ethers,config,boardArtifact,getBokArtifact,account:selected,contextGuard:guard,
   captureFundingWallet:()=>captureRollingFundingWallet({getState:()=>globalThis.walletState,contextGuard:guard,chainId:config.network.chainId})}).then(value=>(session=value)).finally(()=>{creating=undefined;});
  return creating;
 }}:{}),fundingWallets,fundingWalletStatus,connectFundingWallet,getAccount:()=>globalThis.walletState.aztec,createSession({onProgress}={}){
  if(config.refundOnly===true)return Promise.reject(failed());
  if(session)return Promise.resolve(session);if(creating)return creating;
  const selected=globalThis.walletState.aztec;
  if(!selected||globalThis.walletState.invalidated)return Promise.reject(failed());
  const guard=()=>{if(globalThis.walletState.invalidated||globalThis.walletState.aztec!==selected)throw failed();};
  // Public immutable circuit assets load alongside account initialization.
  // This never blocks sign-in or starts a private execution/proof.
  try{void Promise.resolve(sdk.preloadPostingKernels()).catch(()=>{});}catch{}
  creating=createRollingWalletSession({sdk,routing,ethers:globalThis.ethers,config,boardArtifact,privateFeeArtifact,getBokArtifact,account:selected,
   trustedQuery:query,remoteProver:remote,contextGuard:guard,onProgress,
   fundingRelay:createRollingFundingRelay({contextGuard:guard}),
   captureFundingWallet:()=>captureRollingFundingWallet({getState:()=>globalThis.walletState,contextGuard:guard,chainId:config.network.chainId}),
   claimStore:globalThis.makeClaimSecretStore(selected.secretKey,selected.salt),proofsEnabled:metadata.proofsEnabled}).then(value=>(session=value)).finally(()=>{creating=undefined;});
  return creating;
 }});
}

/** Captures the chosen custody transport only when a user requests a quote.
 * This capability never escapes the private session or reconnects implicitly. */
export async function captureRollingFundingWallet({getState,contextGuard,chainId}){
 await contextGuard();const state=getState(),signer=state.ethSigner,provider=state.ethProvider,transport=state.ethTransport;
 const address=state.ethAccount?.toLowerCase(),name=state.ethWalletName;
 if(!signer||!provider||!transport||typeof name!=='string'||!/^0x[0-9a-f]{40}$/.test(address))throw failed();
 const check=()=>{if(state!==getState()||state.invalidated||state.ethSigner!==signer||state.ethProvider!==provider||state.ethTransport!==transport||state.ethAccount?.toLowerCase()!==address)throw failed();};
 const guard=async()=>{
  await contextGuard();check();const chain=await transport.request({method:'eth_chainId',params:[]});check();await contextGuard();check();
  if(typeof chain!=='string'||!/^0x[0-9a-fA-F]+$/.test(chain)||BigInt(chain)!==BigInt(chainId))throw failed();
  const current=await signer.getAddress();check();await contextGuard();check();if(typeof current!=='string'||current.toLowerCase()!==address)throw failed();
 };
 await guard();return Object.freeze({address,name,chainId:String(BigInt(chainId)),signer,guard});
}

/** Fixed same-origin public funding routes. Neither endpoint nor generic RPC
 * parameters are supplied by wallet state, terms or recovery records. */
export function createRollingFundingRelay({contextGuard}){
 const read=async(path,request)=>{await contextGuard();const value=await boundedJSON(path,16384,undefined,request);await contextGuard();return value;};
 return Object.freeze({terms:()=>read('/api/funding/usdc/terms'),submit:data=>{
  if(typeof data!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(data)||data.length>16384)throw failed();
  return read('/api/funding/usdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
 },status:planHash=>{
  if(typeof planHash!=='string'||!/^0x[0-9a-f]{64}$/.test(planHash))throw failed();
  return read('/api/funding/usdc/status?planHash='+planHash);
 }});
}
