import {selectPrivateViews} from '../../shared/rolling/private-views.mjs';
// This module is imported only after an explicit Unlock action. Public reading
// never imports the SDK, opens private storage or makes personalized node calls.
import {createRollingWalletSession} from './wallet-session.mjs';
const failed=()=>Object.assign(Error('Private account setup is unavailable. Reload before trying again.'),{code:'ROLLING_RUNTIME_UNAVAILABLE'});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function boundedJSON(url,limit,expected){
 const response=await fetch(url,{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
 if(!response.ok||!response.body)throw failed();
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw failed();chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(expected&&(size!==expected.bytes||await digest(bytes)!==expected.sha256))throw failed();
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function descriptor(value){
 if(!value||Object.keys(value).sort().join()!=='bytes,sha256,url'||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>128*1024*1024||
  !/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.url!=='string'||!/^\/(?:wallet|crs)\/[a-zA-Z0-9_.-]+$/.test(value.url))throw failed();
 return value;
}
function script(asset){
 descriptor(asset);
 return new Promise((resolve,reject)=>{
  const element=document.createElement('script');element.src=asset.url;
  element.integrity='sha256-'+btoa(String.fromCharCode(...asset.sha256.match(/../g).map(x=>parseInt(x,16))));
  element.crossOrigin='anonymous';element.referrerPolicy='no-referrer';
  const timer=setTimeout(()=>{element.remove();reject(failed());},30000);
  element.onload=()=>{clearTimeout(timer);resolve();};element.onerror=()=>{clearTimeout(timer);element.remove();reject(failed());};document.head.append(element);
 });
}
let loading;
/** A failed load remains failed for this page: no automatic script replay or
 * account reinitialization after a partially executed custody bundle. */
export function loadRollingWalletRuntime(){
 return loading??=load().catch(()=>{throw failed();});
}
async function load(){
 if(!isSecureContext||!navigator.locks?.request||!crossOriginIsolated)throw failed();
 const metadata=await boundedJSON('/wallet/runtime.json',65536);
 if(metadata?.schemaVersion!==1||!Array.isArray(metadata.scripts)||metadata.scripts.length!==9||
  Object.keys(metadata).sort().join()!=='artifacts,config,crs,proofsEnabled,remoteProver,schemaVersion,scripts,trustedQuery')throw failed();
 const config=structuredClone(metadata.config),query=structuredClone(metadata.trustedQuery),remote=metadata.remoteProver?structuredClone(metadata.remoteProver):undefined;
 if(typeof metadata.proofsEnabled!=='boolean'||(!metadata.proofsEnabled&&config.network?.chainId!=='31337'))throw failed();
 // Host pins exact script ordering and hashes. Reject repeated or unexpected
 // script names before any code executes, including the account singleton.
 const names=['ethers.js','aztec_bundle.js','crs-client.js','wallet-providers.js','passkey-wallet.js','wallet-backup.js','claim-secret-store.js','account.js','engine.js'];
 if(metadata.scripts.some((a,i)=>descriptor(a).url!=='/wallet/'+names[i]))throw failed();
 if(Object.keys(metadata.artifacts??{}).sort().join()!==(config.bok?'board,bok,privateFee':'board,privateFee'))throw failed();
 const crs=await boundedJSON(descriptor(metadata.crs).url,65536,metadata.crs);
 const boardRaw=await boundedJSON(descriptor(metadata.artifacts?.board).url,32*1024*1024,metadata.artifacts.board);
 const feeRaw=await boundedJSON(descriptor(metadata.artifacts?.privateFee).url,32*1024*1024,metadata.artifacts.privateFee);
 const bokRaw=config.bok?await boundedJSON(descriptor(metadata.artifacts?.bok).url,32*1024*1024,metadata.artifacts.bok):undefined;
 if(!config.bok&&metadata.artifacts?.bok!==undefined)throw failed();
 globalThis.BILLBOARD_CRS_MANIFEST=crs;
 // Custody's optional Ethereum connection reads only a detached public scope.
 globalThis._getPublicConfig=()=>structuredClone(config);
 for(const asset of metadata.scripts)await script(asset);
 const sdk=globalThis.__aztec,account=globalThis.BillboardAccount,routing=globalThis.BillboardPrivateFeeRouting;
 if(!sdk?.createTrustedPrivateNode||!account?.configure||!routing?.isPrivateWalletForNode||!globalThis.ethers)throw failed();
 globalThis.BillboardCRS.validateManifest(crs);
 const boardArtifact=sdk.loadContractArtifact(boardRaw),privateFeeArtifact=sdk.loadContractArtifact(feeRaw),bokArtifact=bokRaw?sdk.loadContractArtifact(bokRaw):undefined;
 let session,creating;
 return Object.freeze({account,selectPrivateViews,getAccount:()=>globalThis.walletState.aztec,createSession({onProgress}={}){
  if(session)return Promise.resolve(session);if(creating)return creating;
  const selected=globalThis.walletState.aztec;
  if(!selected||globalThis.walletState.invalidated)return Promise.reject(failed());
  const guard=()=>{if(globalThis.walletState.invalidated||globalThis.walletState.aztec!==selected)throw failed();};
  creating=createRollingWalletSession({sdk,routing,ethers:globalThis.ethers,config,boardArtifact,privateFeeArtifact,bokArtifact,account:selected,
   trustedQuery:query,remoteProver:remote,contextGuard:guard,onProgress,
   claimStore:globalThis.makeClaimSecretStore(selected.secretKey,selected.salt),proofsEnabled:metadata.proofsEnabled}).then(value=>(session=value)).finally(()=>{creating=undefined;});
  return creating;
 }});
}
