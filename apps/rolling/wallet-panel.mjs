// Presentation only. No SDK import or account access before explicit Unlock.
import {allowance,createMessageContent} from './model.mjs';
import {createPublicReader} from './reader-client.mjs';
import {prepareAvatarUpload} from './avatar-upload.mjs';
// Presentation-only diagnostic projection. Keep this vocabulary closed even if
// a runtime or DOM value is malformed; never render or report exception text.
const initializationSteps=new Set(['account-lock','trusted-node','deployment','account-derive','store-open','pxe-create','account-register','contracts-register','initial-sync','journal-open','wallet-bind','account-manager','application-bind']);
const deploymentSteps=new Set(['config','node-readiness','artifact-layout','board-class','checkpoint','board-instance','public-config','config-commitment','fee-instance','l1-context','portal-code-and-immutables','canonical-recheck','final-readiness-and-context']);
const initializationCodes=new Set(['unknown','BB_TRUSTED_NODE_CONFIG','BB_TRUSTED_NODE_IDENTITY','BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_UNSYNCED','BB_TRUSTED_NODE_STALE','BB_BROWSER_PROVER_CONFIGURATION','ROLLING_SESSION_CONFIG','ROLLING_OTHER_TAB','ROLLING_CONTEXT_CHANGED','ROLLING_ACCOUNT_MISMATCH','ROLLING_PRIVATE_ROUTE','ROLLING_DEPLOYMENT_INVALID']);
const refreshSteps=new Set(['account-status','owned-names','moderator-status','bok-status'].flatMap(method=>['lock','context','pxe-sync','account-initialize','method'].map(phase=>method+'/'+phase)));
const refreshCodes=new Set(['ROLLING_BUSY','ROLLING_LOCKED','ROLLING_INVALID_RESPONSE','ROLLING_ABI_MISMATCH','ROLLING_RECOVERY_REQUIRED','PRIVATE_FEE_PREPARATION_FAILED','PRIVATE_FEE_PROVIDER_REQUIRED','PRIVATE_FEE_CONFIGURATION_REQUIRED','PRIVATE_FEE_OWNER_IS_PAYER','PRIVATE_FEE_CHAIN_MISMATCH','PRIVATE_FEE_CAP_TOO_LOW','PRIVATE_FEE_NONCANONICAL_ADDRESS','PRIVATE_FEE_NOT_PUBLISHED','PRIVATE_FEE_CLASS_MISMATCH','PRIVATE_FEE_ARTIFACT_INVALID','PRIVATE_FEE_INVALID_VALUE','PRIVATE_FEE_INVALID_ADDRESS','PRIVATE_FEE_INVALID_GAS','PRIVATE_FEE_BALANCE_INSUFFICIENT']);
const fundingSteps=new Set(['inspect','recover','account-status','prepare','checkpoint','submit','reconcile']);
const fundingProgressMessages={inspect:'Setting up your posting balance…',recover:'Waiting for your payment to confirm…','account-status':'Checking your posting balance…',prepare:'Adding your funds to your private account…',checkpoint:'Finishing account setup…',submit:'Setting up posting. Keep this page open…',reconcile:'Waiting for account setup to confirm…'};
const fundingCodes=new Set(['ROLLING_FUNDING_INVALID','ROLLING_FUNDING_PENDING','ROLLING_FUNDING_NOT_READY','ROLLING_FUNDING_RECOVERY_REQUIRED','ROLLING_FUNDING_MISMATCH','ROLLING_FUNDING_UNKNOWN','ROLLING_FUNDING_REORG','ROLLING_BUSY','ROLLING_LOCKED','ROLLING_INVALID_ACTION','ROLLING_INVALID_RESPONSE','ROLLING_ABI_MISMATCH','ROLLING_RECOVERY_REQUIRED','ROLLING_FEE_CHANGED','PRIVATE_FEE_PREPARATION_FAILED','PRIVATE_FEE_PROVIDER_REQUIRED','PRIVATE_FEE_CONFIGURATION_REQUIRED','PRIVATE_FEE_OWNER_IS_PAYER','PRIVATE_FEE_CHAIN_MISMATCH','PRIVATE_FEE_CAP_TOO_LOW','PRIVATE_FEE_NONCANONICAL_ADDRESS','PRIVATE_FEE_NOT_PUBLISHED','PRIVATE_FEE_CLASS_MISMATCH','PRIVATE_FEE_ARTIFACT_INVALID','PRIVATE_FEE_INVALID_VALUE','PRIVATE_FEE_INVALID_ADDRESS','PRIVATE_FEE_INVALID_GAS','PRIVATE_FEE_BALANCE_INSUFFICIENT']);
export function projectRollingInitialization(value){
 try{
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==5)return null;
  const out={};for(const key of ['stage','step','deploymentStep','state','code']){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return null;out[key]=d.value;}
  const refresh=out.stage==='private-refresh',funding=out.stage==='funding-claim';
  if(!(funding?fundingSteps.has(out.step):refresh?refreshSteps.has(out.step):out.stage==='session-initialization'&&initializationSteps.has(out.step))||!['started','complete','failed'].includes(out.state))return null;
  if(out.deploymentStep!==null&&(refresh||funding||out.step!=='deployment'||!deploymentSteps.has(out.deploymentStep)))return null;
  if(out.state==='failed'?!(initializationCodes.has(out.code)||refresh&&refreshCodes.has(out.code)||funding&&fundingCodes.has(out.code)):out.code!==null)return null;
  return Object.freeze(out);
 }catch{return null;}
}
// A mention is a local composition choice. Reading credit never belongs to the
// input event; the account-scoped query below is shared by the page and composer.
export const mentionsBok=text=>typeof text==='string'&&/(^|[^\p{L}\p{N}_@])@bok(?![\p{L}\p{N}_])/iu.test(text);
export function createBokBalanceQuery({identity,read,onChange=()=>{}}){
 let generation=0,key=null,pending=null,state={phase:'idle',value:null};
 function current(){const next=identity();if(next!==key){generation++;key=next;state={phase:'idle',value:null};}return next;}
 function snapshot(){current();return state;}
 function invalidate(){generation++;key=identity();state={phase:'idle',value:null};onChange();}
 function load(){
  const owner=current();if(!owner)return Promise.resolve(null);
  if(pending)return pending;
  if(state.phase!=='idle')return Promise.resolve(state.value);
  const epoch=generation;state={phase:'loading',value:null};
  pending=Promise.resolve().then(()=>{if(current()!==owner||epoch!==generation)return null;return read();}).then(value=>{
   if(current()!==owner||epoch!==generation)return null;
   if(value?.available===true&&typeof value.availableCredit==='string'&&/^(0|[1-9][0-9]*)$/.test(value.availableCredit)&&BigInt(value.availableCredit)<1n<<128n)state={phase:'ready',value};
   else if(value?.available===false)state={phase:'unavailable',value};
   else throw Error('Invalid Bok balance');
   return state.value;
  }).catch(()=>{if(current()===owner&&epoch===generation)state={phase:'error',value:null};return null;}).finally(()=>{pending=null;onChange();});
  onChange();return pending;
 }
 return {snapshot,load,invalidate,settled:()=>pending??Promise.resolve(),get pending(){return pending!==null;}};
}
const MODERATOR_TYPES=new Set(['moderate-post','moderate-avatar','reject-subboard','set-main-policy','transfer-moderator']);
const TYPES={'transfer-moderator':'Transfer moderator authority','withdraw-bok':'Withdraw Bok credit','cancel-bok-request':'Release an unused Bok request','expire-bok-request':'Expire a Bok request',withdraw:'Withdraw posting collateral',screen:'Screen posting history','moderate-post':'Remove a post','moderate-avatar':'Remove an avatar','reject-subboard':'Reject a subboard','set-main-policy':'Update parent rules',bok:'Ask Bok',preference:'Save your choice','read-marker':'Mark thread read',bio:'Edit bio',avatar:'Edit avatar',post:'Write a post',reply:'Reply',quote:'Quote a post',repost:'Repost',like:'Like a post',unlike:'Remove a like',name:'Register a name',subboard:'Create a subboard'};
const COMPOSER_TYPES=new Set(['post','reply','quote','repost','bok']);
// Editing uses the unlocked session and its last account snapshot. Private
// publishing checks still run when preparing the action, not on navigation.
export function rollingViewReady({view,type,identityAttached=false,namesLoaded=false,cursor=0,moderatorStatus=null,actionsLoaded=false}){
 if(view==='action'&&COMPOSER_TYPES.has(type))return true;
 if(identityAttached&&(!namesLoaded||cursor!==null))return false;
 return view==='overview'?moderatorStatus!==null:view==='names'?namesLoaded:view==='action'?(['like','unlike','preference','read-marker'].includes(type)||actionsLoaded):true;
}
const IDS=['subboard','parent','root','reference','post'];
const field=value=>typeof value==='string'&&/^(?:0x[0-9a-f]{64}|0|[1-9][0-9]{0,76})$/.test(value);
const el=(tag,attrs={},...children)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);for(const child of children.flat())if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;};
const button=(label,handler,primary=false)=>{const node=el('button',{type:'button',class:`button${primary?' primary':''}`},label);node.addEventListener('click',handler);return node;};
const paragraph=text=>el('p',{},text);
const label=(text,control)=>el('label',{class:'form-field'},text,control);
function nameFailure(failure){
 try{const code=Object.getOwnPropertyDescriptor(failure,'code');if(!code||!Object.hasOwn(code,'value'))return null;
  return code.value==='ROLLING_NAME_INVALID'?'Enter a valid first and last name. Use 1–32 ASCII letters, spaces, apostrophes or hyphens in each part; start and end with a letter. Bok is reserved.':code.value==='ROLLING_NAME_TAKEN'?'This name is already registered. Choose another first and last name.':code.value==='ROLLING_NAME_AVAILABILITY_UNAVAILABLE'?'Name availability could not be checked. Your draft is preserved; try again when the private connection is available.':null;
 }catch{return null;}
}
function decimal(value,decimals){const text=BigInt(value).toString().padStart(decimals+1,'0'),fraction=text.slice(-decimals).replace(/0+$/,'');return text.slice(0,-decimals)+(fraction?'.'+fraction:'');}
function aggregateFundingFailure(failure){
 try{const code=Object.getOwnPropertyDescriptor(failure,'code');if(code&&Object.hasOwn(code,'value')){
  if(code.value==='ROLLING_FUNDING_FEE_CREDIT_INSUFFICIENT'){
   const minimum=Object.getOwnPropertyDescriptor(failure,'minimumFeeCredit');
   if(minimum&&Object.hasOwn(minimum,'value')&&typeof minimum.value==='string'&&/^[1-9][0-9]{0,38}$/.test(minimum.value)&&BigInt(minimum.value)<1n<<128n)
    return 'Posting costs have changed. Review the cost again to get an updated price. No payment was sent.';
  }
  const messages={
   ROLLING_FUNDING_SIGNATURE_CANCELLED:'Signature cancelled. No funding payment was sent. Your account remains unlocked; get a fresh quote when you are ready.',
   ROLLING_FUNDING_GAS_CHANGED:'Ethereum gas costs exceed your approved maximum. Get a fresh price and review it before paying. Your recovery records are preserved.',
   AGGREGATE_STALE_QUOTE:'This quote has expired on Ethereum. Get a fresh quote and review the amounts before confirming again.',
   AGGREGATE_QUOTE_REORG:'Ethereum changed the block used for this quote. Get a fresh quote before confirming again.',
   AGGREGATE_PUBLIC_READ_FAILED:'The funding quote could not be verified against current Ethereum state. Check your Ethereum connection, then get a fresh quote. Your recovery records are preserved.',
   AGGREGATE_INSUFFICIENT_USER_FUNDS:'Your Ethereum wallet does not have enough funds for these allocations and the approved costs. Add funds to your wallet or choose another payment currency, then review the cost again.',
   AGGREGATE_PORTAL_NOT_READY:'The funding bridge is not accepting deposits. Try again when the service is available.',
   AGGREGATE_RELAY_GAS_REQUIRED:'The USDC funding relay currently lacks Ethereum gas. Try again when the relay is funded.',
   AGGREGATE_COLLATERAL_BOUNDS:'The required deposit has changed. Reopen your account and review the cost again.'
  };
  if(Object.hasOwn(messages,code.value))return messages[code.value];
 }}catch{}
 return nameFailure(failure);
}

const message='This action could not be completed. Your draft is saved. If you already sent it, check its status before trying again.';
const plaintextRecoveryWarning='This imported file contains an unencrypted key. Create an encrypted recovery file and protect the original.';
const recoveryLimits='Keep your backup and password safe. You need both to restore your account; we cannot reset your password.';
const backupFreshness='Download an updated backup after adding or withdrawing funds. Earlier backups may not include those payments.';

/** loadRuntime returns the trusted account facade/getAccount/createSession binding.
 * getAccount values are used only as an unlocked boolean, never rendered or logged.
 * close hides the dialog; Lock ends custody explicitly. No transaction auto-retry.
 * Workflow restoration is the production application's encrypted journal, not DOM
 * state or localStorage. A replaced page discovers it through readAccountStatus.
 * Profile edits capture readProfile versions only on explicit selection/check.
 * Complete authenticated preferences live only in this closure. Page filtering
 * checks the current account on every call; no preference arrays are exported.
 * One explicit recovery continues bounded reads until complete. Abort never releases the busy/SDK
 * account lock before the original operation settles.
 * Uploaded bytes come from immutable previewBlob; recovery validates the saved
 * raster but displays its ORIGINAL Blob, never the validator's re-encoded bytes.
 */
export function mountRollingWalletPanel({loadRuntime,onPublicEffect=()=>{},onPrivateChange=()=>{}}){
 if(typeof loadRuntime!=='function'||typeof onPublicEffect!=='function'||typeof onPrivateChange!=='function')throw Error('Wallet panel configuration unavailable.');
 const runtimeFailure=Object.freeze({}),connectionFailure=Object.freeze({}),avatarFailure=Object.freeze({}),rulesFailure=Object.freeze({});
 const readPublic=createPublicReader(),rulesInFlight=new Map();
 let postingRules=null,rulesScope=null,updateRules=()=>{};
 let initializationAttempt=0,plaintextRecovery=false,accountMode='create',setupMode=null;
 let autoReviewRequested=false,operationSettled=Promise.resolve();
 let bokHost=null,updateBokForm=()=>{};
 let identityHost=null,inlineCreation=false,selectedName='0',selectedLabel='Anonymous';
 const identityControls=el('div',{class:'posting-name-controls'}),inlineName=el('section',{class:'inline-name',hidden:''});
 let runtime,session,busy=false,blocked=false,invalidated=false,reloadRequired=false,returnFocus;
 let depositRefundPage=null;
 let balances=null,bokAccounting=null,accountingCheck=null,bokExitAmount='',refundQuote=null;
 let topupKind='private-fee',topupQuote=null,topupInputs={amount:''};
 let moderatorStatus=null,bokStatus=null,status=null,intent=null,identities=[],identityRecords=[],cursor=0,error='',notice='',draft={type:'post',subboard:'0',content:''};
 let preferences=null,preferenceProgress=null,accountIdentity=null,recoveryAbort=null,recoveryInspection=null;
 let fundingQuote=null,fundingQuoteRequested=false,fundingAutomatic=false,fundingActiveCapability=null,fundingInputs={asset:'ETH'};
 let profileSnapshot=null,avatarDraft=null,renderEpoch=0,accountEpoch=0,view='overview',namesLoaded=false,actionsLoaded=false,refundRequested=false;const previewURLs=new Set();
 const dialog=el('dialog',{class:'account-dialog','aria-labelledby':'rolling-wallet-title','aria-describedby':'rolling-wallet-description'});
 const title=el('h2',{id:'rolling-wallet-title'},'Join Rolling Chat');
 const closeButton=button('Close account panel',()=>close());closeButton.setAttribute('aria-label','Close account panel');
 const content=el('div'),live=el('p',{role:'status','aria-live':'polite',class:'quiet'});
 const description=el('p',{id:'rolling-wallet-description',class:'quiet'});
 dialog.append(el('div',{class:'dialog-top'},title,closeButton),description,live,content);
 document.body.append(dialog);
 const bokBalance=createBokBalanceQuery({identity:()=>unlocked()?session:null,read:()=>session.application.readBokStatus(),onChange:()=>{
  bokStatus=bokBalance.snapshot().value;renderBokControls();updateBokForm();
 }});
 function invalidateBokBalance(){bokStatus=null;bokBalance.invalidate();}
 function bokBalanceText(){const {phase,value}=bokBalance.snapshot();return phase==='ready'?`${decimal(value.availableCredit,6)} USDC available`:phase==='loading'?'Checking balance…':phase==='error'?'Balance unavailable':phase==='unavailable'?'Bok is unavailable':'Balance not loaded';}
 function requestBokBalance(){if(!busy&&!blocked&&!setupMode&&!intent&&session?.bokConfigured===true&&unlocked()&&(status?.status==='fee-ready'||status?.status==='fee-needed'&&status.depositIds?.length))void bokBalance.load();}
 function addBokCredit(){
  if(busy||!session||!unlocked())return;
  topupKind='bok';topupInputs={amount:''};topupQuote=null;view='topup';clearOperationFeedback();
  if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}render();
 }
 function renderBokControls(){
  if(!bokHost)return;bokHost.replaceChildren();
  if(!session||!unlocked()||session.bokConfigured!==true){bokHost.hidden=true;return;}
  bokHost.hidden=false;
  const balance=el('span',{'data-bok-balance':'','aria-live':'polite'},bokBalanceText());
  bokHost.append(el('strong',{},'Bok balance'),balance);
  if(session.topup?.bok){const add=button('Add credit',addBokCredit);add.disabled=busy;bokHost.append(add);}
  const phase=bokBalance.snapshot().phase;
  if(phase!=='loading'){const reload=button(phase==='idle'?'Show balance':'Refresh balance',()=>{if(busy)return;bokBalance.invalidate();requestBokBalance();});reload.disabled=busy;bokHost.append(reload);}
 }
 function attachBokControls(host){if(!(host instanceof Node))throw Error('Bok balance host unavailable');bokHost=host;renderBokControls();requestBokBalance();}

 function releasePreviews(){updateBokForm=()=>{};renderEpoch++;updateRules=()=>{};for(const url of previewURLs)URL.revokeObjectURL(url);previewURLs.clear();}
 function clearProfileDraft(){profileSnapshot=null;avatarDraft=null;}
 function clearPreferences(){preferences=null;preferenceProgress=null;onPrivateChange();}
 function clearPrivateView(){selectedName='0';selectedLabel='Anonymous';stopFunding();depositRefundPage=null;balances=null;bokAccounting=null;bokExitAmount='';refundQuote=null;topupQuote=null;topupInputs={amount:''};fundingQuote=null;fundingQuoteRequested=false;fundingInputs={asset:'ETH'};initializationAttempt++;dialog.removeAttribute('data-rolling-initialization');recoveryInspection=null;accountEpoch++;accountIdentity=null;bokBalance.invalidate();content.replaceChildren();moderatorStatus=null;clearPreferences();status=null;bokStatus=null;intent=null;identities=[];identityRecords=[];cursor=0;namesLoaded=false;actionsLoaded=false;view='overview';draft={type:'post',subboard:'0',content:''};releasePreviews();clearProfileDraft();}
 function checkAccount(epoch){if(epoch!==accountEpoch||!unlocked())throw connectionFailure;}
 function privateStatus(){if(!unlocked()||!session)return 'locked';return preferences?'complete':'recovering';}
 function preferenceEnabled(kind,target){if(privateStatus()!=='complete')return null;const key={1:'bookmarks',2:'followedBoards',3:'followedNames',4:'subscriptions'}[kind];return kind===5?preferences.replyNotifications:key?preferences[key].includes(BigInt(target).toString()):null;}
 async function recoverPreferences(){
  const epoch=accountEpoch;checkAccount(epoch);preferences=null;preferenceProgress=null;
  const abort=recoveryAbort=new AbortController();controlsBusy(true);
  try{for(;;){
   const result=await session.application.readColdPreferences({signal:abort.signal});
   checkAccount(epoch);if(abort.signal.aborted)throw connectionFailure;
   if(result?.status==='complete'&&result.complete===true&&typeof runtime.selectPrivateViews==='function'){
    preferences=result.preferences;preferenceProgress=null;notice='Your saved items are ready.';note('');onPrivateChange();return;
   }
   if(result?.status!=='recovering'||result.complete!==false)throw connectionFailure;
   // The reader retains its validated cursor, including log positions that are
   // not in the display summary. Equal displayed progress still needs the next read.
   preferenceProgress=result.progress;notice='';note('Loading your follows, bookmarks and notifications…');render();
  }}finally{recoveryAbort=null;}
 }
 function preferencesView(){
  content.append(paragraph('Your follows, bookmarks and notification settings are saved with your account. Load them to pick up where you left off.'));
  if(preferences){content.append(paragraph('Your saved choices are ready.'),button(preferences.replyNotifications?'Disable reply notifications':'Enable reply notifications',()=>choosePreference({type:'preference',kind:5,target:'0',enabled:!preferences.replyNotifications})));}
  else if(preferenceProgress){const details=el('details',{},el('summary',{},'Loading details'));content.append(details);const p=preferenceProgress,labels={nextBlock:'Next history block to check',scannedThrough:'History checked through block',anchorBlock:'History available through block',processedRevision:'Saved changes recovered',targetRevision:'Saved changes to recover',markersChecked:'Read positions checked',markersTotal:'Read positions to check'};for(const [key,label]of Object.entries(labels))if(/^[0-9]+$/.test(String(p?.[key]??'')))details.append(paragraph(label+': '+p[key]));}
  const stop=button('Stop loading',()=>{recoveryAbort?.abort();clearPreferences();note('Recovery stop requested. Waiting for the private operation to settle.');});stop.dataset.recoveryStop='true';content.append(stop);
  content.append(button(preferences?'Refresh saved items':recoveryAbort?'Loading saved items':'Load saved items',()=>void work(recoverPreferences,()=>'Your saved items could not load. Check your connection and try again.'),true));
 }
 function choosePreference(value){if(busy||intent)return;autoReviewRequested=false;clearOperationFeedback();view='action';draft={...value};if(blocked||viewReady())render();else void work(loadView);}
 function ownedLabel(id){if(field(id)&&BigInt(id)===0n)return 'Anonymous';const record=identityRecords.find(r=>r.id===id);return record?`${record.first} ${record.last}`:'Selected owned name';}
 function acceptNames(page,append=false){
  if(!Array.isArray(page.identities)||!Array.isArray(page.records)||page.identities.length!==page.records.length)throw Error('Private name records unavailable');
  const records=page.records.map((r,i)=>{if(r.id!==page.identities[i]||!field(r.id)||typeof r.first!=='string'||typeof r.last!=='string'||r.first.length>32||r.last.length>32)throw Error('Invalid private name record');return {id:r.id,first:r.first,last:r.last};});
  if(page.nextCursor!==null&&(!Number.isInteger(page.nextCursor)||page.nextCursor<0||page.nextCursor>0xffffffff-8||append&&page.nextCursor<=cursor))throw Error('Invalid private names cursor');
  const ids=new Set(append?identities:[]);for(const record of records){if(ids.has(record.id))throw Error('Duplicate private name');ids.add(record.id);}
  identityRecords=append?[...identityRecords,...records]:records;identities=identityRecords.map(r=>r.id);cursor=page.nextCursor;
 }
 async function loadNames(append=false){
  const epoch=accountEpoch;checkAccount(epoch);
  const page=await session.application.ownedIdentities({cursor:append?cursor:0});
  checkAccount(epoch);acceptNames(page,append);namesLoaded=true;
 }
 async function checkProfile(name){
  const epoch=accountEpoch;checkAccount(epoch);profileSnapshot=null;let snapshot;try{snapshot=await session.application.readProfile({name});}catch{throw connectionFailure;}
  checkAccount(epoch);
  const version=v=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,9})$/.test(v)&&BigInt(v)<=0xffffffffn;
  if(!snapshot||!field(snapshot.name)||BigInt(snapshot.name)!==BigInt(name)||!version(snapshot.bioVersion)||!version(snapshot.avatarVersion)||!unlocked())throw Error('Profile version unavailable');
  profileSnapshot={name:snapshot.name,bioVersion:snapshot.bioVersion,avatarVersion:snapshot.avatarVersion};
 }
 function showAvatar(blob,parent,{ready=()=>{},failed=()=>{}}={}){
  const url=URL.createObjectURL(blob);previewURLs.add(url);const image=el('img',{width:'100',height:'100',alt:'Exact avatar bytes to publish'});
  const failure=()=>{URL.revokeObjectURL(url);previewURLs.delete(url);image.replaceWith(paragraph('Avatar preview unavailable.'));failed();};
  image.addEventListener('error',failure,{once:true});image.addEventListener('load',()=>{if(image.naturalWidth===100&&image.naturalHeight===100)ready();else failure();},{once:true});image.src=url;parent.append(image);
 }
 async function blobData(blob){const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length>8192)throw Error('Avatar too large');return btoa(String.fromCharCode(...bytes));}
 function savedAvatarBlob(action){
  const data=action.data;if(typeof data!=='string'||data.length>10924||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw Error('Invalid avatar');
  const raw=atob(data);if(btoa(raw)!==data||raw.length>8192||!raw.length||action.width!==100||action.height!==100)throw Error('Invalid avatar');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const type=bytes[0]===137?'image/png':bytes[0]===255?'image/jpeg':bytes[0]===82?'image/webp':null;if(!type)throw Error('Invalid avatar');return new Blob([bytes],{type});
 }
 function controlsBusy(value){
  dialog.setAttribute('aria-busy',String(value));
  for(const node of identityControls.querySelectorAll('select,button'))node.disabled=value||!!intent||node.dataset.unavailable==='true';
  for(const host of [dialog,inlineName])for(const node of host.querySelectorAll('button,input,select,textarea'))node.disabled=node.dataset.recoveryStop==='true'?!recoveryAbort:node.dataset.accountingStop==='true'?!accountingCheck:node.dataset.fundingStop==='true'?!fundingAutomatic:value||node.dataset.unavailable==='true';
 }
 function note(text){
  live.className=setupMode?'account-setup-progress':'quiet';
  if(setupMode&&text)live.replaceChildren(el('span',{class:'account-setup-spinner','aria-hidden':'true'}),el('strong',{},text),el('span',{class:'account-setup-help'},'This can take a little while. Keep this page open.'));
  else live.textContent=text;
 }
 function startSetup(mode){setupMode=mode;note(mode==='create'?'Encrypting your account backup…':'Opening your account backup…');render();}
 function clearOperationFeedback(){error='';notice='';note('');for(const node of content.querySelectorAll('[data-operation-feedback]'))node.remove();}
 async function loadBok(){const epoch=accountEpoch;checkAccount(epoch);await bokBalance.load();checkAccount(epoch);bokStatus=bokBalance.snapshot().value;}
 // View reads stay serialized; refresh and account changes invalidate these private results.
 async function loadView({loadIdentity=false}={}){
  const epoch=accountEpoch;checkAccount(epoch);
  if(view==='action'&&COMPOSER_TYPES.has(draft.type)&&!loadIdentity)return;
  if(identityHost){if(!namesLoaded)await loadNames();while(cursor!==null)await loadNames(true);}
  if(view==='action'&&COMPOSER_TYPES.has(draft.type)){note('');return;}
  if((view==='names'||view==='action'&&!['like','unlike','preference','read-marker'].includes(draft.type))&&!namesLoaded){note('Loading your registered names…');await loadNames();}
  if(view==='action'&&!['like','unlike','preference','read-marker'].includes(draft.type)&&!actionsLoaded){
   note('Checking publishing options…');
   if(moderatorStatus===null)moderatorStatus=typeof session.application.readModeratorStatus==='function'?await session.application.readModeratorStatus():{authorized:false};checkAccount(epoch);
   actionsLoaded=true;onPrivateChange();
  }
  if(view==='overview'&&moderatorStatus===null){moderatorStatus=typeof session.application.readModeratorStatus==='function'?await session.application.readModeratorStatus():{authorized:false};checkAccount(epoch);onPrivateChange();}
  note('');
 }
 function viewReady(){return rollingViewReady({view,type:draft.type,identityAttached:!!identityHost,namesLoaded,cursor,moderatorStatus,actionsLoaded});}
 function selectView(next){if(busy)return;clearOperationFeedback();view=next;if(next==='balances'&&!balances){void work(async()=>{const epoch=accountEpoch;balances=await session.application.readBalances({cursor:0});checkAccount(epoch);});return;}if(next==='preferences'&&!preferences)void work(recoverPreferences);else if(viewReady())render();else void work(loadView);}
 async function work(fn,failureMessage=nameFailure){
  if(busy)return;let finishOperation;operationSettled=new Promise(resolve=>{finishOperation=resolve;});const operationFocus=document.activeElement;busy=true;clearOperationFeedback();controlsBusy(true);
  try{await bokBalance.settled();await fn();}catch(failure){notice='';stopFunding();recoveryInspection=null;clearPreferences();note('');error=failure===runtimeFailure?'Account tools could not load. Reload the page to try again.':failure===rulesFailure?'Current board rules are unavailable, changed, or reject new posts. Review the rules below before continuing. Nothing was sent.':failure===connectionFailure?'Your account could not connect. Check your connection and try again. Your backup is unchanged.':failure===avatarFailure?'This image could not be prepared. Choose a smaller still PNG, JPEG or WebP image.':failureMessage(failure)??message;}finally{
   try{if(setupMode){setupMode=null;note('');}if(invalidated||reloadRequired)clearPrivateView();busy=false;render(document.activeElement===document.body?operationFocus:document.activeElement);
   // Failed actions must expose their feedback even when the form was scrolled.
   if(error&&dialog.open){const alert=content.querySelector('[role=alert]');alert.focus({preventScroll:true});alert.scrollIntoView({block:'nearest'});}}finally{finishOperation();}
  }
 }
 function unlocked(){if(invalidated||reloadRequired)return false;const current=runtime?runtime.getAccount():null;if(accountIdentity&&current!==accountIdentity){invalidated=true;clearPrivateView();note('The account changed. Reload before continuing.');return false;}return !!current;}
 async function refresh(){
  const epoch=accountEpoch;checkAccount(epoch);balances=null;bokAccounting=null;recoveryInspection=null;moderatorStatus=null;invalidateBokBalance();namesLoaded=false;actionsLoaded=false;identities=[];identityRecords=[];cursor=0;clearPreferences();blocked=true;
  const next=await session.application.readAccountStatus();
  checkAccount(epoch);status=next;intent=next.intent??null;
  if(session.mode==='refund-only'){blocked=false;note('');return;}
  if(next.status==='recovering'){
   if(!intent?.intentId)throw Error('Missing recovery intent');
  }
  blocked=false;if(!setupMode)note('');onPrivateChange();
  if(!intent)await loadView();
 }
 async function connect(){
  const epoch=accountEpoch,attempt=++initializationAttempt;
  dialog.removeAttribute('data-rolling-initialization');
  if(setupMode)note('Connecting to the network…');
  try{
  if(!accountIdentity)accountIdentity=runtime.getAccount();
  if(!session){blocked=true;session=await runtime.createSession({onProgress:progress=>{
   const diagnostic=projectRollingInitialization(progress);
   if(epoch!==accountEpoch||invalidated||reloadRequired||!unlocked()||(['private-refresh','funding-claim'].includes(diagnostic?.stage)?!session:attempt!==initializationAttempt))return;
   if(diagnostic)dialog.setAttribute('data-rolling-initialization',JSON.stringify(diagnostic));
   if(!busy&&bokBalance.pending&&diagnostic?.stage==='private-refresh')return;
   const stages={estimating:'Checking the cost…',submitting:'Sending your action. Keep this page open…'};
   let stage;try{const own=Object.getOwnPropertyDescriptor(progress??{},'stage');if(own&&Object.hasOwn(own,'value')&&typeof own.value==='string')stage=own.value;}catch{}
   const setupMessages={'account-lock':'Opening your account…','trusted-node':'Connecting to the network…',deployment:'Checking the network…','account-derive':'Preparing your private account…','store-open':'Saving your account on this device…','pxe-create':'Preparing your private account…','account-register':'Preparing your private account…','contracts-register':'Preparing your private account…','initial-sync':'Syncing your account with the network…','journal-open':'Finishing account setup…','wallet-bind':'Finishing account setup…','account-manager':'Finishing account setup…','application-bind':'Finishing account setup…'};
   note(setupMode&&diagnostic?.stage==='session-initialization'?(setupMessages[diagnostic.step]??'Finishing account setup…'):setupMode&&diagnostic?.stage==='private-refresh'?'Checking your account balance…':diagnostic?.stage==='funding-claim'?(diagnostic.state==='failed'?'This funding step could not be completed. Your recovery records are preserved.':fundingProgressMessages[diagnostic.step]):Object.hasOwn(stages,stage)?stages[stage]:'Loading your account…');
  }});}
  if(view!=='preferences')await refresh();else await recoverPreferences();checkAccount(epoch);note('');
  }catch{if(attempt===initializationAttempt)initializationAttempt++;throw connectionFailure;}
 }
 async function connectRefund(){
  if(typeof runtime.createRefundSession!=='function')throw Error('Refund-only recovery is not configured');
  const epoch=accountEpoch;if(!accountIdentity)accountIdentity=runtime.getAccount();session=await runtime.createRefundSession();checkAccount(epoch);await refresh();
 }
 async function unlock({refundOnly=false}={}){refundRequested=refundOnly;await work(async()=>{
  note('Loading account tools…');
  if(!runtime){
   let loaded;try{loaded=await loadRuntime();}catch{throw runtimeFailure;}
   if(!loaded?.account||typeof loaded.getAccount!=='function'||typeof loaded.createSession!=='function')throw Error('Invalid runtime');
   runtime=loaded;refundRequested=refundRequested||runtime.refundOnly===true;
   runtime.account.configure({requireEth:false,autoPasskey:false,canEndSession:()=>!session?.busy,
    // Custody's fixed import warning is safe product copy. Never forward
    // arbitrary account, SDK or exception messages into the private panel.
    onMessage:(value,type)=>{if(type==='warn'&&value===plaintextRecoveryWarning)plaintextRecovery=true;},onSetupError:()=>{error=message;},onChange:value=>{
     if(value?.invalidated===true||accountIdentity&&runtime.getAccount()!==accountIdentity){invalidated=true;recoveryAbort?.abort();clearPrivateView();note('The account changed. Preserve recovery and reload before continuing.');render();}
    }});
  }
  if(unlocked())await (refundRequested?connectRefund():connect());else note(refundRequested?'Import your existing encrypted recovery file to recover the original refund.':'');
 });}
 function download(envelope){
  // Only the existing custody module's ciphertext envelope may leave the panel.
  const keys=['schemaVersion','kind','kdf','iterations','salt','iv','ciphertext'];
  if(!envelope||Object.keys(envelope).sort().join()!==keys.sort().join()||envelope.schemaVersion!==1||envelope.kind!=='aztec-billboard-encrypted-wallet'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000||!/^([0-9a-f]{2}){16}$/.test(envelope.salt)||!/^([0-9a-f]{2}){12}$/.test(envelope.iv)||typeof envelope.ciphertext!=='string'||!/^([0-9a-f]{2}){16,}$/.test(envelope.ciphertext)||envelope.ciphertext.length>32*1024*1024+32)throw Error('Invalid encrypted export');
  const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:'application/json'}));
  const link=el('a',{href:url,download:'rolling-chat-encrypted-recovery.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function passwordField(text){const input=el('input',{type:'password',autocomplete:'new-password',minlength:'12',required:'', 'aria-label':text});return input;}
 function privacyDetails(){return el('details',{class:'account-details'},el('summary',{},'How privacy works'),paragraph('Posts are public. Other readers cannot see which posts belong to the same anonymous account. This version uses a trusted proving service that can see the private data it processes.'));}
 function custody(){
  const restoring=accountMode==='signin'||refundRequested;
  const password=passwordField(restoring?'Backup password':'Password');
  if(restoring){
   password.autocomplete='current-password';password.removeAttribute('minlength');
   const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'Account backup'});
   content.append(paragraph('Choose the account backup you saved when you joined, then enter its password.'),label('Account backup',file),label('Backup password',password),button('Sign in',()=>{
    if(!file.files?.[0]){error='Choose your account backup.';render();return;}
    const selected=file.files[0],value=password.value;password.value='';file.value='';
    void work(async()=>{startSetup('signin');await runtime.account.importRecovery(selected,value);notice='Signed in.';await (refundRequested?connectRefund():connect());});
   },true),button('Create a new account',()=>{accountMode='create';refundRequested=false;render();}));
   const help=el('details',{class:'account-details'},el('summary',{},'Trouble accessing an old account?'),paragraph('To collect a withdrawal you already started, restore your backup here and connect the wallet that originally paid.'));
   help.append(button('Restore a pending withdrawal',()=>{refundRequested=true;render();}));content.append(help);
  }else{
   content.append(paragraph('Choose a password to protect your account backup. No email or real name needed.'),label('Password · at least 12 characters',password),button('Create account',()=>{
    if(!password.reportValidity())return;const value=password.value;password.value='';
    void work(async()=>{startSetup('create');download(await runtime.account.create(value));view='funding';await connect();notice='Account created. Keep the downloaded backup and your password — you need both to sign in on another device.';});
   },true),paragraph('An account backup will download. Keep it somewhere safe; we cannot reset your password.'),button('Already have an account? Sign in',()=>{accountMode='signin';render();}));
  }
  content.append(privacyDetails());
 }
 function recovery(){
  const section=el('details',{},el('summary',{},'Backup and account security'));
  const password=passwordField('Backup password');
  section.append(paragraph('Download a password-protected copy of your account to sign in on another device.'),paragraph(recoveryLimits),paragraph(backupFreshness),label('Backup password',password),button('Download account backup',()=>{
   if(!password.reportValidity())return;const value=password.value;password.value='';
   void work(async()=>{download(await runtime.account.exportRecovery(value));notice='Account backup downloaded.';});
  }),button('Sign out',()=>void work(async()=>{
   blocked=true;clearPrivateView();render();
   if(session){await session.close();session=null;}
   await runtime.account.endSession();reloadRequired=true;clearPrivateView();note('Account locked. Reload before unlocking again.');
  })));
  content.append(section);
 }
 function savedResumeReview(snapshot){
  const saved=snapshot.exactResume,record=snapshot.intent,hash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value);
  if(saved?.status!=='resumable'||snapshot.status!=='unknown'||!hash(saved.txHash)||saved.txHash!==snapshot.currentTxHash||
   !record.action?.type||['prepared','cancelled','replacement-prepared'].includes(record.status))return null;
  if(typeof saved.maximumFee!=='string'||!/^(0|[1-9][0-9]{0,76})$/.test(saved.maximumFee))return null;
  const review=record.replacementReview;
  if(saved.feeSource==='original'){if(review||saved.maximumFee!==record.maximumFee)return null;}
  else if(saved.feeSource==='replacement'){if(!review||!hash(review.sourceTxHash)||saved.txHash===review.sourceTxHash||saved.maximumFee!==review.maximumFee)return null;}
  else return null;
  const expectedMarker=review?review.marker:snapshot.originalMarker;
  if(record.action.type==='read-marker'){
   if(!saved.marker||!hash(saved.marker.blockHash)||saved.marker.throughBlock!==record.action.throughBlock||
    saved.marker.blockHash!==expectedMarker?.blockHash||saved.marker.throughBlock!==expectedMarker?.throughBlock||
    saved.marker.blockHash!==snapshot.marker?.blockHash||saved.marker.throughBlock!==snapshot.marker?.throughBlock)return null;
  }else if(saved.marker!==null||expectedMarker!=null)return null;
  return {txHash:saved.txHash,maximumFee:saved.maximumFee,feeSource:saved.feeSource,marker:saved.marker?{...saved.marker}:null};
 }
 function showSavedResume(snapshot,review,ready){
  content.append(el('h3',{},'Review the saved transaction'),paragraph('This sends the exact transaction already saved on this device. It does not create a new transaction or request a new fee quote.'),
   el('p',{class:'recovery-values'},'Saved transaction: '+review.txHash),
   el('p',{class:'recovery-values'},`${review.feeSource==='replacement'?'Previously reviewed replacement':'Previously approved'} maximum fee: ${review.maximumFee} fee-juice units. This is the saved ceiling, not an additional fee or a record of a charge.`));
  if(review.marker)content.append(el('p',{class:'recovery-values'},`Saved read position: block ${review.marker.throughBlock}; block fingerprint ${review.marker.blockHash}.`));
  const confirm=button('Confirm saved transaction and send',()=>void work(async()=>{
   if(!ready())throw connectionFailure;
   await checkPostingRules(intent.action,{confirm:true});
   const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);
   if(recoveryInspection!==snapshot||snapshot.intent.intentId!==id)throw connectionFailure;
   const expectedTxHash=review.txHash;recoveryInspection=null;notice='';intent={...intent,status:'unknown'};blocked=true;
   note('Sending the saved transaction. Keep this page open; do not send again.');
   try{const result=await session.application.resumeSaved(id,{expectedTxHash});checkAccount(epoch);await receive(result);}
   catch{throw Error('Saved transaction outcome unknown');}
  }),true);confirm.dataset.actionConfirm='';confirm.dataset.unavailable=String(!ready());confirm.disabled=busy||!ready();content.append(confirm);return confirm;
 }
 function showRecoveryOptions(ready=()=>true){
  content.append(button('Check recovery options',()=>void work(async()=>{
   const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);recoveryInspection=null;clearPreferences();
   const result=await session.application.inspectRecovery(id);checkAccount(epoch);
   if(result?.intent?.intentId!==id||!Array.isArray(result.attempts))throw connectionFailure;
   recoveryInspection=result;notice='Recovery options checked. No transaction was sent.';
  })));
  const snapshot=recoveryInspection;if(!snapshot||snapshot.intent.intentId!==intent.intentId)return;
  const statuses={'aggregate-claim-review':'The original funding payment can be reviewed for a renewed private claim. No new Ethereum payment is needed.','pre-proof-review':'The interrupted preparation can be reviewed on this device.',pending:'This update is still pending. Keep your recovery file and check again.',unknown:'This update is still unresolved. Keep your recovery file and check again. Do not send another copy.',canonical:'An attempt is included in the verified chain. Check the existing transaction to reconcile it; do not send a replacement.',empty:'No signed transaction was found. Keep the saved action and recovery file; a replacement is not available.',
   'context-changed':'The saved action no longer matches its required context. It cannot be repeated safely.', 'history-unavailable':'Earlier transaction details are unavailable. Keep your recovery file; a replacement cannot be reviewed safely.', 'limit-reached':'This update has reached its replacement limit. Keep your recovery file; no further replacement can be sent.',
   'replacement-available':'The earlier attempts can no longer be included. Review this saved update and a new maximum fee before sending a replacement.'};
  const savedReview=savedResumeReview(snapshot);
  const displayStatus=snapshot.status==='unknown'&&['pending','canonical','empty'].includes(snapshot.exactResume?.status)?snapshot.exactResume.status:snapshot.status;
  content.append(paragraph(savedReview?'The saved transaction can be sent without preparing another. Review its saved fee ceiling before confirming.':snapshot.exactResume?.status==='context-changed'?'The saved transaction no longer matches its required context. Keep your recovery file; it cannot be sent safely.':statuses[displayStatus]??statuses.unknown));
  const details=el('details',{class:'recovery-values'},el('summary',{},'Original action and transaction history'));
  if(snapshot.originalPreferenceHead){const head=snapshot.originalPreferenceHead;details.append(paragraph('Original saved-settings revision: '+head.revision),paragraph('Original saved-settings fingerprint: '+head.digest));}
  for(const attempt of snapshot.inclusionHistory??[]){
   details.append(paragraph('Earlier transaction: '+attempt.txHash));
   for(const fact of attempt.inclusions??[])details.append(paragraph(`Previously included at block ${fact.blockNumber}: ${fact.transactionFee} fee-juice units; result ${fact.executionResult}. Historical record only; this does not show a current charge.`));
  }
  if(!(snapshot.inclusionHistory??[]).length)details.append(paragraph('No earlier inclusion or fee record is available.'));
  content.append(details);
  if(savedReview)return showSavedResume(snapshot,savedReview,ready);
  if(['pre-proof-review','aggregate-claim-review'].includes(snapshot.status)){
   content.append(paragraph(snapshot.status==='aggregate-claim-review'
    ?'Recovery will recheck the original payment and its one-time fee claim. An already consumed claim cannot be charged again. Review the saved action and renewed maximum fee before confirming.'
    :'This device retained an interrupted attempt before any signed transaction was saved. Review the saved action and a renewed maximum fee before confirming.'));
   const review=button('Review interrupted action',()=>void work(async()=>{
    const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);if(recoveryInspection!==snapshot)throw connectionFailure;
    recoveryInspection=null;const result=await session.application.prepareInterrupted(id);checkAccount(epoch);
    intent=result;blocked=false;notice='Interrupted action prepared for review. Nothing has been sent. Check the renewed maximum fee before confirming.';
   }),true);review.dataset.unavailable=String(!ready());review.disabled=busy||!ready();content.append(review);return review;
  }
  if(snapshot.status!=='replacement-available')return;
  const marker=intent.action.type==='read-marker',changed=marker&&snapshot.originalMarker?.blockHash!==snapshot.marker?.blockHash;
  let consent;
  if(marker){
   if(!snapshot.marker||snapshot.marker.throughBlock!==intent.action.throughBlock)return;
   content.append(paragraph(`The read position stays at block ${snapshot.marker.throughBlock} of this thread.`));
   if(changed){consent=el('input',{type:'checkbox'});content.append(label('I understand that the same read position now refers to a different block.',consent));}
  }
  const review=button('Review replacement',()=>void work(async()=>{
   if(changed&&!consent?.checked)throw connectionFailure;
   const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);
   const input={expectedTxHash:snapshot.currentTxHash,...(['preference','read-marker'].includes(intent.action.type)?{expectedHead:{...snapshot.head}}:{}),...(marker?{expectedMarkerHash:snapshot.marker.blockHash}:{})};
   recoveryInspection=null;const result=await session.application.prepareReplacement(id,input);checkAccount(epoch);
   recoveryInspection=null;intent=result;blocked=false;notice='Replacement prepared for review. Nothing has been sent. Check the new maximum fee before confirming.';
  }),true);
  review.dataset.unavailable=String(changed);if(consent)consent.addEventListener('change',()=>{review.dataset.unavailable=String(!consent.checked);review.disabled=busy||!consent.checked;});content.append(review);
 }
 async function checkBokAccounting(){
  const epoch=accountEpoch;checkAccount(epoch);bokAccounting=null;
  // The application's bounded accounting API has no abort argument. Stop fences
  // its result and the next read; the current call must settle before releasing busy.
  const scan=accountingCheck={stopped:false};let cursor=0;
  note('Checking all owned Bok requests. No partial total is presented.');render();
  try{for(;;){
   const value=await session.application.readBokAccounting({cursor});checkAccount(epoch);
   if(scan.stopped){note('Request accounting stopped. No partial totals were used.');return;}
   if(value?.complete===true){bokAccounting=value;balances={...balances,bok:{...balances.bok,available:value.available}};note('All owned Bok requests have been checked.');return;}
   if(value?.complete!==false||!['owned-requests','public-accounting'].includes(value.phase)||typeof value.nextCursor!=='string'||!value.nextCursor.length||value.nextCursor===cursor)throw connectionFailure;
   bokAccounting=value;cursor=value.nextCursor;render();
  }}catch(failure){bokAccounting=null;throw failure;}finally{accountingCheck=null;}
 }
 function unfinishedDepositsView() {
  if (!session.depositRefunds) return;
  const section = el('section',{class:'account-details'},el('h3',{},'Unfinished signup'));
  section.append(paragraph('Return a deposit from a signup you did not finish. You can keep using your current account.'));
  const load = async offset => {
   const epoch = accountEpoch;
   const page = await session.depositRefunds.list({offset});
   checkAccount(epoch);
   depositRefundPage = page;
  };
  const connected = fundingWalletView(section,'Connect the wallet that paid the deposit.');
  if (connected) section.append(button('Find refundable deposits',()=>void work(()=>load(0))));
  if (depositRefundPage) {
   const refundable = depositRefundPage.deposits.filter(d=>['available','requested'].includes(d.status));
   if (!refundable.length) section.append(paragraph('No unfinished deposits on this page.'));
   for (const deposit of refundable) {
    section.append(button('Refund '+decimal(deposit.amount,18)+' ETH',()=>void work(async()=>{
     const epoch = accountEpoch;
     note('Confirm the refund request in your Ethereum wallet.');
     const receipt = await session.depositRefunds.request(deposit.depositId);
     checkAccount(epoch);
     note('Waiting for Aztec to receive your refund request…');
     intent = await session.depositRefunds.prepare(receipt);
     checkAccount(epoch);
     refundQuote = null;
     note('');
    })));
   }
   if (depositRefundPage.nextOffset !== null) section.append(button('More deposits',()=>void work(()=>load(depositRefundPage.nextOffset))));
  }
  content.append(section);
 }
 function balancesView(){
  content.append(el('h3',{},'Balances and withdrawals'),paragraph('Your deposit is refundable. Your posting balance pays network fees and cannot be withdrawn. Unused Bok credit can be withdrawn separately.'));
  unfinishedDepositsView();
  if(!balances){content.append(button('Check private balances',()=>void work(async()=>{const epoch=accountEpoch;const value=await session.application.readBalances({cursor:0});checkAccount(epoch);balances=value;}),true));return;}
  content.append(paragraph('Posting balance: '+decimal(balances.fee.available,18)+' credits (FEE).'));
  if(balances.fee.pendingReservation)content.append(paragraph('A saved transaction has an unresolved fee reservation, up to '+decimal(balances.fee.pendingReservation.maximumFee,18)+' FEE. It is not subtracted again from the balance above.'));
  if(!balances.bok&&session.bokConfigured===true)content.append(button('Show Bok balance',()=>void work(async()=>{const epoch=accountEpoch;const value=await session.application.readBalances({cursor:0,includeBok:true});checkAccount(epoch);balances=value;})));
  if(balances.bok){content.append(paragraph('Available Bok credit: '+decimal(balances.bok.available,6)+' USDC.'));
   if(bokAccounting?.complete){
    content.append(paragraph('Complete owned-request accounting at block '+bokAccounting.anchor.blockNumber+'. Allocated '+decimal(bokAccounting.totals.available,6)+', reserved '+decimal(bokAccounting.totals.reserved,6)+', charged '+decimal(bokAccounting.totals.charged,6)+', returned '+decimal(bokAccounting.totals.refunded,6)+' USDC. Returned credit is already part of your unallocated balance; it is not added again.'));
    for(const r of bokAccounting.requests){const area=el('section',{'aria-label':'Owned Bok request'});area.append(paragraph('Request '+r.requestId.slice(0,10)+'… — allocated '+decimal(r.available,6)+', reserved '+decimal(r.reserved,6)+', charged '+decimal(r.charged,6)+', returned '+decimal(r.refunded,6)+' USDC.'));
     if(['1','2'].includes(r.state)){
      if(r.reserved==='0')area.append(button('Review release of unused credit',()=>void work(async()=>{intent=await session.application.prepare({type:'cancel-bok-request',requestId:r.requestId});})));
      area.append(paragraph('Expiry is checked by the contract. After its deadline, only unreserved credit returns; any unresolved reservation stays fenced.'),button('Review request expiry',()=>void work(async()=>{intent=await session.application.prepare({type:'expire-bok-request',requestId:r.requestId});})));
     }else area.append(paragraph(r.state==='4'?'This request is closed. Returned credit is already included in your unallocated balance.':'This request is fenced. Unreserved credit has returned; the reserved amount remains locked until the operator reconciles its actual charge.'));content.append(area);
    }
   }else content.append(paragraph('Complete request accounting is not yet available; unlisted reservations are not zero.'));
   if(typeof session.application.readBokAccounting==='function'){
    content.append(button(accountingCheck?'Checking all Bok requests':'Check all Bok requests',()=>void work(checkBokAccounting)));
    if(bokAccounting&&!bokAccounting.complete)content.append(paragraph('Checking '+(bokAccounting.phase==='owned-requests'?'private ownership pages':'uniform public accounting pages')+'. No partial total is presented.'));
    if(accountingCheck){const stop=button('Stop checking requests',()=>{accountingCheck.stopped=true;bokAccounting=null;note('Accounting stop requested. Waiting for the current private operation to settle.');});stop.dataset.accountingStop='true';content.append(stop);}
   }
   fundingWalletView();const amount=el('input',{type:'text',inputmode:'decimal','aria-label':'Bok credit to withdraw in USDC',value:bokExitAmount});amount.addEventListener('input',()=>bokExitAmount=amount.value);
   content.append(label('Bok credit to withdraw (USDC)',amount),paragraph('Only unallocated private credit can exit. First confirm the private transaction fee; after settlement, separately review Ethereum gas. The receiving wallet must pay that gas.'),button('Withdraw Bok credit',()=>void work(async()=>{const selected=runtime.fundingWalletStatus?.();if(!selected?.connected||typeof selected.address!=='string')throw connectionFailure;intent=await session.application.prepare({type:'withdraw-bok',amount:units(bokExitAmount,6),recipient:selected.address.toLowerCase()});refundQuote=null;}),true));
  }
  for(const d of balances.collateral.deposits){
   const area=el('section',{'aria-label':'Posting collateral'});area.append(paragraph(decimal(d.amount,18)+' ETH refundable to the original depositing wallet.'),paragraph(d.reason==='screening-required'?'Your posts need to be checked before you can withdraw.':d.reason==='time-locked'?'Available to withdraw after '+new Date(Number(d.nextAllowedTime)*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})+'.':'This deposit is ready to withdraw.'));
   if(d.reason==='screening-required')area.append(button('Check posts for withdrawal',()=>void work(async()=>{intent=await session.application.prepare({type:'screen',deposit:d.id});})));
   const review=button('Withdraw deposit',()=>void work(async()=>{intent=await session.application.prepare({type:'withdraw',deposit:d.id});refundQuote=null;}),true);review.dataset.unavailable=String(!d.eligible);area.append(review);content.append(area);
  }
  if(!balances.collateral.deposits.length)content.append(paragraph('No refundable deposits on this page.'));
  if(balances.collateral.nextCursor!==null)content.append(button('More deposits',()=>void work(async()=>{const epoch=accountEpoch;const page=await session.application.readBalances({cursor:balances.collateral.nextCursor,includeBok:!!balances.bok});checkAccount(epoch);balances=page;})));
  content.append(button('Refresh balances',()=>void work(async()=>{balances=null;bokAccounting=null;const epoch=accountEpoch;const page=await session.application.readBalances({cursor:0});checkAccount(epoch);balances=page;})));
 }
 function refundView(){
  const bok=intent.withdrawal.kind==='bok',amountText=decimal(intent.withdrawal.amount,bok?6:18)+(bok?' USDC':' ETH');
  fundingWalletView();
  if(intent.actualNetworkFee!==null&&intent.actualNetworkFee!==undefined)content.append(paragraph('Actual private exit fee: '+decimal(intent.actualNetworkFee,18)+' FEE.'));
  content.append(paragraph('The private '+(bok?'Bok credit':'collateral')+' exit is confirmed. The refund remains saved until Ethereum verifies payment to the saved recipient. Ethereum settlement and confirmation must complete before the refund can be marked finished.'),paragraph('Refund: '+amountText+'. Connect '+(bok?'the saved receiving':'the original depositing')+' wallet; another recipient cannot be substituted.'));
  if(refundQuote){if(refundQuote.savedRequest)content.append(paragraph('This saved refund may still be pending. Confirmation asks your wallet to send the exact original request with the same nonce '+refundQuote.nonce+'. Only one request with that nonce can execute.'));content.append(paragraph('Wallet: '+refundQuote.walletName),paragraph('Maximum Ethereum gas cost: '+decimal(refundQuote.maximumGasWei,18)+' ETH. The refund amount is separate.'),button(refundQuote.savedRequest?'Confirm saved Ethereum refund':'Confirm Ethereum refund',()=>void work(async()=>{const epoch=accountEpoch;refundQuote=null;note('Confirm the refund in your Ethereum wallet, then wait for network confirmation. Do not send again.');const result=await session.withdrawal.confirm();note('');checkAccount(epoch);notice='Ethereum refund confirmed: '+decimal(result.amount,bok?6:18)+(bok?' USDC. ':' ETH. ')+(result.gasCostWei===null||result.gasCostWei===undefined?'Gas was paid separately; its exact cost is unavailable here.':'Actual Ethereum gas cost: '+decimal(result.gasCostWei,18)+' ETH.');intent=null;balances=null;await refresh();}),true),button('Cancel refund review',()=>void work(async()=>{await session.withdrawal.cancel();refundQuote=null;})));return;}
  content.append(button('Review Ethereum refund',()=>void work(async()=>{const epoch=accountEpoch;const value=await session.withdrawal.prepare({});checkAccount(epoch);refundQuote=value;}),true),button('Review saved Ethereum refund',()=>void work(async()=>{const epoch=accountEpoch;note('Checking the saved Ethereum refund; waiting for network confirmation.');const value=await session.withdrawal.prepareSaved({});note('');checkAccount(epoch);if(value.status==='refunded'){notice='The saved Ethereum refund is confirmed.';intent=null;balances=null;await refresh();}else refundQuote=value;}),true),button('Check existing refund',()=>void work(async()=>{const epoch=accountEpoch;note('Checking existing Ethereum refund; waiting for network confirmation.');const result=await session.withdrawal.recover();note('');checkAccount(epoch);if(result.status==='refunded'){notice='The saved Ethereum refund is confirmed.';intent=null;balances=null;await refresh();}else notice='Refund '+result.status+'. A new refund is never sent automatically.';})));
 }
 const postingTypes=new Set(['post','reply','quote','repost','bok']);
 const rulesId=action=>postingTypes.has(action?.type)&&field(action.subboard)?BigInt(action.subboard).toString():null;
 function rulesReady(action){return !postingTypes.has(action?.type)||postingRules?.id===rulesId(action)&&postingRules.status==='ready'&&!postingRules.value.rejected;}
 function validateRules(data,id){
  const version=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,9})$/.test(v)&&BigInt(v)<=0xffffffffn;
  const safeText=v=>typeof v==='string'&&v.isWellFormed()&&!v.includes('\0')&&new TextEncoder().encode(v).length<=992;
  const scope=data.scope;
  if(!scope||!field(scope.chainId)||!field(scope.rollupVersion)||!/^0x[0-9a-f]{64}$/.test(scope.boardAddress)||data.boardId!==id||!version(data.mainPolicy?.version)||!safeText(data.mainPolicy.text))throw rulesFailure;
  const scopeKey=JSON.stringify([scope.chainId,scope.rollupVersion,scope.boardAddress]);
  if(rulesScope!==null&&rulesScope!==scopeKey)throw rulesFailure;
  const board=data.board;
  if(id==='0'?board!==null:!board||board.id!==id||board.mainVersion!==data.mainPolicy.version||board.mainRules!==data.mainPolicy.text||!safeText(board.rules)||typeof board.rejected!=='boolean'||board.rejected&&!safeText(board.rejection?.reason))throw rulesFailure;
  rulesScope=scopeKey;
  // Local rules are immutable: the contract's SubboardCreated version is always 1.
  return {parentVersion:data.mainPolicy.version,parent:data.mainPolicy.text,localVersion:id==='0'?'0':'1',local:board?.rules??'',rejected:board?.rejected===true,reason:board?.rejection?.reason??''};
 }
 function loadRules(id,fresh=false){
  if(id===null){postingRules=null;updateRules();return Promise.resolve();}
  if(!fresh&&postingRules?.id===id&&postingRules.status!=='loading')return Promise.resolve(postingRules.value);
  let request=rulesInFlight.get(id);
  if(!request){request=readPublic('board',{id,limit:1}).then(data=>validateRules(data,id));rulesInFlight.set(id,request);void request.finally(()=>{if(rulesInFlight.get(id)===request)rulesInFlight.delete(id);}).catch(()=>{});}
  const state=postingRules?.id===id&&postingRules.status==='loading'?postingRules:{id,status:'loading'};postingRules=state;updateRules();
  return request.then(value=>{if(postingRules===state){state.status='ready';state.value=value;updateRules();}return value;},()=>{if(postingRules===state){state.status='unavailable';delete state.value;updateRules();}throw rulesFailure;});
 }
 function rulesView(action,changed=()=>{}){
  if(!postingTypes.has(action?.type))return;
  const epoch=renderEpoch,section=el('section',{'aria-label':'Current effective rules'});
  // Read the rules before reaching review, publication or saved-send controls.
  content.insertBefore(section,content.querySelector(':scope > button.primary'));
  updateRules=()=>{
   if(epoch!==renderEpoch)return;
   const id=rulesId(action),state=postingRules?.id===id?postingRules:null;
   section.replaceChildren();
   if(id===null)section.append(paragraph('Enter a valid destination board to see its rules.'));
   else if(!state||state.status==='loading')section.append(el('p',{role:'status'},'Loading current board rules…'));
   else if(state.status==='unavailable')section.append(el('p',{role:'status'},'Current board rules are unavailable. Posting is disabled.'));
   else{
    const rules=state.value,details=el('details',{class:'composer-rules'},el('summary',{},'Board rules'));section.append(details);details.append(el('p',{class:'post-body'},rules.parent||'No site-wide rules.'));
    if(id!=='0')details.append(el('h4',{},'Additional board rules'),el('p',{class:'post-body'},rules.local||'No additional board rules.'));
    if(rules.rejected)section.append(el('p',{role:'status'},'This subboard is rejected. New posts are disabled. '+rules.reason));
   }
   const retry=button('Refresh board rules',()=>{void loadRules(rulesId(action),true).catch(()=>{});});retry.disabled=busy||state?.status==='loading';if(state?.status==='unavailable')section.append(retry);changed();
  };
  updateRules();void loadRules(rulesId(action)).catch(()=>{});
 }
 async function checkPostingRules(action,{confirm=false}={}){
  if(!postingTypes.has(action?.type))return;
  const epoch=accountEpoch,id=rulesId(action),previous=postingRules?.id===id?postingRules.value:null;
  if(id===null)throw rulesFailure;
  const current=await loadRules(id,true);checkAccount(epoch);
  if(postingRules?.id!==id||!rulesReady(action)||confirm&&JSON.stringify(previous)!==JSON.stringify(current))throw rulesFailure;
 }
 function replyContext(action){return field(action?.parent)&&field(action?.root)&&field(action?.subboard)&&BigInt(action.parent)>0n&&BigInt(action.root)>0n;}
 function conversationContext(action){
  const reply=replyContext(action),link=el('a',{href:reply?'#/thread/'+action.root+'/'+action.parent:'#/board/'+action.subboard},reply?'View conversation':BigInt(action.subboard)===0n?'Main board':'View board');
  link.addEventListener('click',event=>{if(!close())event.preventDefault();});
  content.append(paragraph(reply?'Replying in this conversation':'New conversation'),link);
 }
 function actionLabel(action){
  if(action?.type==='preference')return ({1:action.enabled?'Save bookmark':'Remove bookmark',2:action.enabled?'Follow board':'Unfollow board',3:action.enabled?'Follow person':'Unfollow person',4:action.enabled?'Follow conversation':'Unfollow conversation',5:action.enabled?'Turn on reply notifications':'Turn off reply notifications'})[action.kind]??'Save setting';
  return ({post:'Post',reply:'Reply',quote:'Post quote',repost:'Repost',like:'Like post',unlike:'Remove like',name:'Register name',subboard:'Create board',bio:'Save bio',avatar:'Save avatar','read-marker':'Mark as read','cancel-deposit':'Continue refund',bok:'Ask Bok'})[action?.type]??TYPES[action?.type]??'Confirm';
 }
 function feeLabel(value){const amount=BigInt(value);return amount>0n&&amount<100000000000000n?'less than 0.0001':'up to '+decimal((amount+99999999999999n)/100000000000000n,4);}
 function reviewLabel(action){return ['post','reply','quote','repost','bok'].includes(action?.type)?'Review '+(action.type==='reply'?'reply':'post'):'Review cost';}
 function showIntent(){
  if(['withdraw','withdraw-bok','cancel-deposit'].includes(intent.action?.type)&&intent.status==='confirmed'&&session.withdrawal){refundView();return;}
  const replacement=intent.status==='replacement-prepared',prepared=intent.status==='prepared'||replacement;
  if(!prepared)content.append(el('h3',{},'Check your action'));
  if(replacement)content.append(paragraph('Review the replacement cost before confirming.'));
  // The saved action owns this context, including after authorization or recovery.
  const conversational=postingTypes.has(intent.action?.type);
  if(conversational&&field(intent.action.subboard)){conversationContext(intent.action);content.append(paragraph('Post as '+ownedLabel(intent.action.name??'0')));}
  // Explicit fields only, and text nodes throughout. No nonce, account or raw error.
  if(intent.action?.content)content.append(el('div',{class:'preview-body'},createMessageContent(intent.action.content)));
  if(intent.action?.type==='name')content.append(el('h3',{},intent.action.first+' '+intent.action.last));
  const actionDetails=el('details',{class:'account-details'},el('summary',{},'Action details'));
  for(const key of ['slug','name','description','rules','subboard','parent','root','reference','post','target','thread','reason']){
   const value=intent.action?.[key];if(typeof value==='string'&&value)actionDetails.append(el('p',{class:'post-body'},`${key}: ${key==='name'&&!['subboard','moderate-avatar'].includes(intent.action.type)?ownedLabel(value):value}`));
  }
  if(actionDetails.childElementCount>1)content.append(actionDetails);
  const reviewedFee=replacement?intent.replacementReview?.maximumFee:intent.maximumFee,feeReady=typeof reviewedFee==='string'&&/^(0|[1-9][0-9]*)$/.test(reviewedFee);
  if(replacement){
   if(feeReady)content.append(paragraph(`Replacement cost: up to ${decimal(reviewedFee,18)} FEE from your posting balance.`));
   if(typeof intent.maximumFee==='string')content.append(paragraph(`Previous cost limit: ${decimal(intent.maximumFee,18)} FEE. This was a limit, not a charge.`));
   if(intent.replacementReview?.marker)content.append(el('p',{class:'recovery-values'},`Reviewed read position: block ${intent.replacementReview.marker.throughBlock}; block fingerprint ${intent.replacementReview.marker.blockHash}.`));
  }else if(feeReady)content.append(paragraph(intent.replacementReview?`Previous cost limit: ${decimal(intent.maximumFee,18)} FEE. This was a limit, not a charge.`:`Posting cost: ${feeLabel(reviewedFee)} credits from your posting balance.`));
  if(feeReady){actionDetails.append(paragraph('Exact maximum network fee: '+decimal(reviewedFee,18)+' FEE. FEE tokens are your posting credits.'));if(!actionDetails.isConnected)content.append(actionDetails);}
  if(intent.action?.type==='expire-bok-request')content.append(paragraph('Ask the contract to expire this exact saved request. Its deadline is checked again before sending. Only unreserved credit can return; an unresolved reservation remains fenced for the actual charge. Confirmation does not mean the whole budget was refunded. Refresh private balances and complete request accounting afterward.'));
  if(intent.withdrawal)content.append(paragraph(intent.withdrawal.kind==='cancelled-collateral'?'Cancel this unfinished deposit so it can be returned to your Ethereum wallet.':intent.withdrawal.kind==='bok'?'Exit '+decimal(intent.withdrawal.amount,6)+' USDC of unallocated Bok credit to '+intent.withdrawal.depositor+'. Reserved request credit is not spent. A separate Ethereum claim follows after settlement and needs its own gas review.':'Exit '+decimal(intent.withdrawal.amount,18)+' ETH of posting collateral. This first transaction consumes your private deposit. A separate Ethereum refund to the original depositor follows after settlement and needs its own gas review. Moderation does not remove withdrawal rights.'));
  if(intent.action?.type==='name')content.append(el('p',{class:'name-preview'},intent.action.first+' '+intent.action.last));
  if(intent.action?.type==='name'&&prepared&&intent.nameAvailability)content.append(paragraph('This name was available when checked. This is not a reservation; another registration may still win before your transaction.'));
  if(intent.action?.type==='bio'&&intent.action.content==='')content.append(paragraph('Clear the current profile bio. Historical versions remain public.'));
  let avatarReady=intent.action?.type!=='avatar'||intent.action.data==='';
  const avatarArea=el('div',{'aria-label':'Saved avatar preview'});
  if(intent.action?.type==='avatar'){
   content.append(avatarArea);
   if(intent.action.data==='')avatarArea.append(paragraph('Clear avatar. No image bytes will be published.'));
  }
  if(intent.action?.type==='transfer-moderator')content.append(paragraph(`Transfer moderator authority to ${intent.action.successor}. Your current key loses authority immediately. Only the successor can transfer it back.`));
  if(intent.moderation){content.append(paragraph('Moderator action: your authority and the exact target will be checked again before sending. This does not edit the original post or reveal its private owner.'),paragraph(`Reviewed parent rules version: ${intent.moderation.mainVersion}.`));if(intent.moderation.avatarVersion!==undefined)content.append(paragraph(`Reviewed avatar version: ${intent.moderation.avatarVersion}.`));}
  if(intent.bok){
   content.append(paragraph(`Maximum Bok request cost: ${decimal(intent.bok.budget,6)} USDC. This ceiling is separate from network fees; the actual charge may be lower.`),paragraph(`Private Bok balance checked for this authorization: ${decimal(intent.bok.availableCredit,6)} USDC.`));
   if(intent.bok.phase==='authorize')content.append(paragraph('First authorize this exact request privately. Publishing the saved post requires a separate review and network fee.'));
   else {content.append(paragraph('The request is already authorized. This publishes its exact saved post; the Bok budget is not authorized again.'));if(Number.isSafeInteger(intent.bok.mainPolicyVersion)&&Number.isSafeInteger(intent.bok.localPolicyVersion))content.append(paragraph(`Reviewed policy versions: parent ${intent.bok.mainPolicyVersion}, local ${intent.bok.localPolicyVersion}.`));}
  }
  if(fundingCapability()&&['claim-deposit','claim-private-fee','claim-bok'].includes(intent?.action?.type)&&['reverted','cancelled'].includes(intent.status))content.append(button('Review private claim again',()=>void work(async()=>{
   const epoch=accountEpoch;checkAccount(epoch);await fundingCapability().reviewRevertedClaim();checkAccount(epoch);await advanceFunding();
  })));
  if(['authorized','bok-post-reverted','bok-release-reverted'].includes(intent.status)){
   if(intent.status==='bok-post-reverted')content.append(paragraph('The post reverted. Its paid network fee is not refunded.'));
   content.append(paragraph('Your funded request and original draft remain saved. Continuing the post, releasing unused credit, or requesting expiry each needs a separate fee review. Expiry requires the contract deadline; unresolved reservations remain fenced.'));
   if(intent.status!=='bok-release-reverted')content.append(button('Review saved Bok post',()=>void work(async()=>{
    const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);await checkPostingRules(intent.action);blocked=true;
    const result=await session.application.prepareBokPost(id);checkAccount(epoch);intent=result;blocked=false;note('');notice='Review the saved post and its separate network fee before sending.';
   }),true));
   for(const [type,label]of [['cancel-bok-request','Review release of this saved request'],['expire-bok-request','Review expiry of this saved request']])content.append(button(label,()=>void work(async()=>{
    const epoch=accountEpoch,id=intent.intentId;checkAccount(epoch);const result=await session.application.prepareBokRelease(id,{type});checkAccount(epoch);intent=result;blocked=false;note('');notice='Review the private transaction fee. No release or expiry has been sent.';
   })));
   rulesView(intent.action);
   return;
  }
  let confirm;
  const privateAction=['preference','read-marker'].includes(intent.action?.type),expiryAction=intent.action?.type==='expire-bok-request',fundingAction=['claim-deposit','claim-private-fee','claim-bok'].includes(intent.action?.type);
  if(fundingAction){content.append(paragraph(intent.action.type==='claim-deposit'?'Claim the previously paid posting collateral privately. No second Ethereum payment will be requested.':'Claim the previously paid '+(intent.action.type==='claim-bok'?'Bok credit':'network fee credit')+' privately. Posting collateral is unchanged. No second Ethereum payment will be requested.'),paragraph((intent.action.type==='claim-deposit'?'Collateral: ':intent.action.type==='claim-bok'?'Bok credit: ':'Network fees: ')+intent.action.receipt.amount+(intent.action.type==='claim-deposit'?' wei.':' base units.')));if(intent.action.feeReceipt)content.append(paragraph('Previously bridged transaction fees: '+intent.action.feeReceipt.amount+' fee-juice units. The fee claim and collateral claim share one transaction.'));}
  if(privateAction){const route=intent.action.type==='read-marker'?'thread':({1:'post',2:'board',3:'profile',4:'thread'})[intent.action.kind],target=intent.action.thread??intent.action.target;if(route&&field(target)){const context=el('a',{href:'#/'+route+'/'+target},'View '+({post:'post',board:'board',profile:'profile',thread:'conversation'})[route]);context.addEventListener('click',event=>{if(!close())event.preventDefault();});content.append(context);}content.append(paragraph(intent.action.type==='read-marker'?'Mark this thread read through block '+intent.action.throughBlock:preferenceDescription(intent.action)));}
  if(prepared){
   confirm=button(replacement?'Confirm replacement':intent.bok?.phase==='authorize'?'Approve Bok budget':actionLabel(intent.action),()=>void work(async()=>{
    if(!avatarReady||!feeReady||!rulesReady(intent.action))throw Error('Review unavailable');
    await checkPostingRules(intent.action,{confirm:true});
    const epoch=accountEpoch;checkAccount(epoch);recoveryInspection=null;
    const id=intent.intentId;intent={...intent,status:'unknown'};blocked=true;
    try{const result=await session.application.submitPrepared(id);checkAccount(epoch);await receive(result);}catch{note('Submission outcome is unknown. Check this transaction; do not submit again.');throw Error('Unknown outcome');}
   }),true);confirm.dataset.actionConfirm='';confirm.dataset.unavailable=String(!avatarReady||!feeReady);
   content.append(paragraph(['withdraw','withdraw-bok','cancel-deposit'].includes(intent.action?.type)?'This private exit starts withdrawal. It does not send the Ethereum refund or publish a post.':expiryAction?'This private expiry attempt charges a network fee. It never releases an unresolved reserved charge.':fundingAction?'Your saved funding receipt will be checked again before sending this private claim.':intent.bok?.phase==='authorize'?'This step authorizes the saved Bok budget privately and charges a network fee. Your post is not published yet; publication needs separate confirmation.':privateAction?'Saving this private setting uses your posting balance.':'This will be public. Published content cannot be erased from the network.'),confirm);
   if(!replacement&&intent.bok?.phase!=='post'){
    const editable=['post','reply','quote','repost','bok','name','subboard','bio','avatar','like','unlike','preference','read-marker',...MODERATOR_TYPES].includes(intent.action?.type);
    content.append(button(editable?'Back to editing':'Cancel review',()=>void work(async()=>{
     const saved=intent.action;await session.application.cancelPrepared(intent.intentId);intent=null;
     if(editable){draft={...saved};if(saved.type==='bok')draft.budget=decimal(saved.budget,6);if(saved.type==='avatar')avatarDraft=saved.data===''?{clear:true}:{blob:savedAvatarBlob(saved)};view='action';}else view='overview';
     await refresh();if(['bio','avatar'].includes(saved.type))await checkProfile(saved.name);notice='';
    })));
   }
  }else{
   content.append(paragraph('No automatic resend is allowed. A missing receipt does not mean the transaction failed.'),button('Check existing transaction',()=>void work(async()=>{await receive(await session.application.reconcile(intent.intentId));})));
  }
  if(intent.status!=='prepared')confirm=showRecoveryOptions(()=>avatarReady&&feeReady&&rulesReady(intent.action))??confirm;
  rulesView(intent.action,()=>{if(confirm){confirm.dataset.unavailable=String(!avatarReady||!feeReady||!rulesReady(intent.action));confirm.disabled=busy||confirm.dataset.unavailable==='true';}});
  if(intent.action?.type==='avatar'&&intent.action.data!==''){
   const epoch=renderEpoch,action=intent.action;avatarArea.append(paragraph('Checking the exact saved avatar preview…'));
   void (async()=>{try{const blob=savedAvatarBlob(action),checked=await prepareAvatarUpload(blob);
    if(checked.source.width!==100||checked.source.height!==100)throw Error('Invalid saved dimensions');
    if(epoch!==renderEpoch||!unlocked())return;avatarArea.replaceChildren();showAvatar(blob,avatarArea,{ready:()=>{if(epoch!==renderEpoch||!unlocked())return;avatarReady=true;if(confirm){confirm.dataset.unavailable='false';confirm.disabled=busy;}},failed:()=>{avatarReady=false;if(confirm){confirm.dataset.unavailable='true';confirm.disabled=true;}}});avatarArea.append(paragraph(`${blob.size}/8192 encoded bytes. These are the exact saved publication bytes.`));
   }catch{if(epoch===renderEpoch)avatarArea.replaceChildren(paragraph('The saved avatar cannot be previewed safely. Cancel this prepared action or retain its recovery record; it will not be sent.'));}})();
  }
 }
 async function receive(result){
  if(result.bok||['claim-bok','withdraw-bok','cancel-bok-request','expire-bok-request'].includes(result.action?.type))invalidateBokBalance();
  recoveryInspection=null;intent=result;blocked=false;
  if(['confirmed','reverted'].includes(result.status)&&['preference','read-marker'].includes(result.action?.type))clearPreferences();
  if(['confirmed','reverted'].includes(result.status)&&['bio','avatar'].includes(result.action?.type))profileSnapshot=null;
  if(result.status==='authorized'){note('');notice='Bok request authorized. Review the saved post when ready; it has not been published.';return;}
  if(['bok-post-reverted','bok-release-reverted'].includes(result.status)){note('');notice=(result.status==='bok-post-reverted'?'The Bok post reverted.':'The Bok release or expiry reverted.')+' A network fee may have been charged. The funded request remains saved; no action is retried automatically.';return;}
  if(result.status==='confirmed'){
   notice=result.action?.type==='expire-bok-request'?'Expiry transaction confirmed. Only unreserved credit can return; refresh private balances and complete request accounting to see refunded and still-reserved amounts.':actionLabel(result.action)+': done.';
   try{await onPublicEffect();}catch{notice+=' Public feed refresh is unavailable; the transaction remains confirmed.';}
   await refresh();
   if(result.action?.type==='name'&&identityHost){
    const registered=result.nameAvailability?.id;
    const owned=field(registered)?identityRecords.find(record=>BigInt(record.id)===BigInt(registered)):null;
    if(owned){selectedName=owned.id;selectedLabel=ownedLabel(owned.id);if(inlineCreation){inlineCreation=false;restoreDialogContent();view='overview';notice='Name created. You’re posting as '+ownedLabel(selectedName)+'.';}}
   }
  }else if(result.status==='reverted'){
   notice='Transaction reverted. A network fee may have been charged. Recovery checks must complete before a new action.';await refresh();
  }else note(result.status==='prepared'?'The saved action has not been sent. Review before confirming.':'The transaction is still unconfirmed or unknown. Check later; do not resend.');
 }
 function chooseAction(type,name){
  if(busy||!unlocked()||intent||blocked)return;
  clearOperationFeedback();view='action';clearProfileDraft();draft={type,subboard:'0',content:'',name:name??selectedName};
  if(viewReady()&&!name)render();else void work(async()=>{await loadView();if(name)await checkProfile(name);});
 }
 function namesView(){
  content.append(paragraph('A name lets people recognise your posts and follow you. It does not need to be your real name. You can still choose Anonymous when posting.'),button('Register a name',()=>chooseAction('name'),true));
  const list=el('ul',{'aria-label':'Your registered names'});
  for(const record of identityRecords){
   const readable=`${record.first} ${record.last}`;
   const profile=el('a',{href:'#/profile/'+BigInt(record.id).toString(),'aria-label':'View public profile for '+readable},'View public profile');
   profile.addEventListener('click',event=>{if(busy||!unlocked()||!close())event.preventDefault();});
   list.append(el('li',{},el('p',{},readable),button('Edit bio for '+readable,()=>chooseAction('bio',record.id)),button('Edit avatar for '+readable,()=>chooseAction('avatar',record.id)),profile));
  }
  if(identityRecords.length)content.append(list);else content.append(paragraph('No registered names were found. You can still post as Anonymous when your account is funded.'));
  if(cursor!==null)content.append(button('Load more owned names',()=>void work(()=>loadNames(true))));
 }
 function preferenceDescription(action){return actionLabel(action)+'. Only you can see your saved choices.';}
 function form(){
  if(MODERATOR_TYPES.has(draft.type)&&moderatorStatus?.authorized!==true)draft={type:'post',subboard:'0',content:''};
  const fields=new Map();let updateInvitation=()=>{};
  function input(name,text,{area=false,initial='',required=true}={}){
   const node=el(area?'textarea':'input',area?{rows:'5'}:{type:'text'});node.value=draft[name]??initial;if(required)node.required=true;
   node.addEventListener('input',()=>{draft[name]=node.value;if(name==='content')updateInvitation();if(name==='subboard')updateRules();validate();});fields.set(name,node);content.append(label(text,node));return node;
  }
  const canInvite=['post','reply','bok'].includes(draft.type);
  if(canInvite)draft.type=mentionsBok(draft.content)?'bok':replyContext(draft)?'reply':'post';
  let kind=draft.type;
  function target(name){const node=el('input',{type:'hidden'});node.value=draft[name]??'';node.required=true;fields.set(name,node);return node;}
  if(MODERATOR_TYPES.has(kind)){
   content.append(paragraph('Moderator controls. Removal keeps the stable link and a visible reason. It cannot edit or delete the underlying chain history.'));
   if(kind==='transfer-moderator'){input('successor','Successor Aztec address');content.append(el('p',{class:'quiet'},'The successor takes control immediately. Only the successor can transfer authority back. Policy and account funds stay unchanged.'));}
   else if(kind==='set-main-policy')input('rules','New parent rules',{area:true});
   else{input(kind==='moderate-post'?'post':kind==='moderate-avatar'?'name':'subboard',kind==='moderate-post'?'Post ID':kind==='moderate-avatar'?'Profile name ID':'Subboard ID');input('reason','Public moderation reason',{area:true});}
  }else if(kind==='preference'||kind==='read-marker'){
   if(kind==='preference'){
    if(draft.kind===5)draft.target='0';else target('target');
    draft.enabled=draft.enabled!==false;content.append(paragraph(preferenceDescription(draft)));
   }else{target('thread');target('throughBlock');content.append(paragraph('Mark the replies currently in this conversation as read.'));}
  }else if(kind==='bio'||kind==='avatar'){
   const names=el('select',{'aria-label':'Profile name'},el('option',{value:''},'Choose an owned name'));
   for(const record of identityRecords)names.append(el('option',{value:record.id},`${record.first} ${record.last}`));
   names.value=identities.includes(draft.name)?draft.name:'';draft.name=names.value;
   names.addEventListener('change',()=>{draft.name=names.value;clearProfileDraft();if(draft.name)void work(()=>checkProfile(draft.name));else render();});
   content.append(label('Profile name',names),paragraph('Your profile is public. Save to publish your changes.'));
   const checkVersion=button('Load profile',()=>{if(draft.name)void work(()=>checkProfile(draft.name));});checkVersion.dataset.unavailable=String(!draft.name);if(!profileSnapshot&&draft.name)content.append(checkVersion);
   if(cursor!==null)content.append(button('Load more owned names',()=>void work(()=>loadNames(true))));
   if(kind==='bio')input('content','Bio (empty to clear)',{area:true,required:false});
   else{
    const file=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Avatar image'});
    file.addEventListener('change',()=>{const selected=file.files?.[0];if(!selected)return;avatarDraft=null;
     void work(async()=>{let prepared;try{prepared=await prepareAvatarUpload(selected);}catch{throw avatarFailure;}if(!unlocked())throw Error('Account changed');avatarDraft={blob:prepared.previewBlob,notice:prepared.notice};});});
    content.append(label('Avatar image',file),paragraph('Choose a PNG, JPEG or WebP. We’ll crop it to a square and show you a preview.'));
    if(avatarDraft?.blob){showAvatar(avatarDraft.blob,content);content.append(paragraph(avatarDraft.notice),paragraph(`${avatarDraft.blob.size}/8192 encoded bytes`));}
    if(avatarDraft?.clear)content.append(paragraph('The avatar will be cleared.'));
    content.append(button('Clear avatar',()=>{avatarDraft={clear:true};render();}));
   }
  }else if(kind==='name'){
   content.append(paragraph('Choose a public name, not necessarily your real one. Names are unique and cannot be changed. Use letters, spaces, apostrophes or hyphens.'));
   const first=input('first','First name'),last=input('last','Last name');
   // Reversible proposal vocabulary: eight valid values per part, uniformly picked
   // from local cryptographic random bits. Availability is never inferred locally.
   const firstNames=['River','Ellis','Mira','Rowan','Sage','Robin','Avery','Quinn'],lastNames=['Lane','Moss','Reed','Vale','Stone','Brook','Finch','Wren'];
   content.append(button('Suggest a random name',()=>{const bytes=crypto.getRandomValues(new Uint8Array(2));first.value=firstNames[bytes[0]&7];last.value=lastNames[bytes[1]&7];draft.first=first.value;draft.last=last.value;validate();}),paragraph('We’ll check whether your chosen name is available before you confirm.'));

  }else if(kind==='subboard'){
   content.append(paragraph('Create a space for a topic or community. Its web address is permanent. The site’s rules apply alongside your board’s rules.'));
   input('slug','Board address (e.g. book-club)');input('name','Board name');input('description','Description',{area:true});input('rules','Additional rules',{area:true,required:false});
  }else if(kind==='like'||kind==='unlike'){target('post');content.append(paragraph(kind==='like'?'Like this post. Your account stays anonymous.':'Remove your like from this post.'));}
  else{
   const names=el('select',{'aria-label':'Posting identity'},el('option',{value:'0'},'Anonymous'));
   for(const record of identityRecords)names.append(el('option',{value:record.id},`${record.first} ${record.last}`));
   names.value=identities.includes(draft.name)?draft.name:'0';draft.name=names.value;
   names.addEventListener('change',()=>{draft.name=names.value;selectedName=names.value;selectedLabel=ownedLabel(selectedName);renderIdentityControls();});if(identityRecords.length)content.append(label('Post as',names));else content.append(paragraph('Posting as Anonymous'));
   if(cursor!==null)content.append(button('Load more owned names',()=>void work(()=>loadNames(true))));
   const deposits=el('select',{'aria-label':'Posting collateral'});
   for(const id of status?.depositIds??[])deposits.append(el('option',{value:id},`Deposit ${id}`));
   if(!deposits.options.length)deposits.append(el('option',{value:''},'No verified collateral found'));
   deposits.value=(status?.depositIds??[]).includes(draft.deposit)?draft.deposit:deposits.options[0].value;draft.deposit=deposits.value;
   deposits.addEventListener('change',()=>{draft.deposit=deposits.value;validate();});if(deposits.options.length>1)content.append(el('details',{class:'account-details'},el('summary',{},'Choose a posting deposit'),label('Posting deposit',deposits)));else if(!draft.deposit)content.append(paragraph('Set up your posting balance before publishing.'));
   if(kind==='reply'||kind==='bok'){
    if(kind==='bok'&&draft.parent===undefined&&draft.root===undefined)Object.assign(draft,{parent:'0',root:'0'});
    if(replyContext(draft)||kind==='bok'&&field(draft.subboard)&&draft.parent==='0'&&draft.root==='0')conversationContext(draft);
    else content.append(paragraph('Choose a post in the reader and select Reply to join its conversation.'),button('Choose a post',()=>close()));
    if(replyContext(draft)||kind==='reply')content.append(button('Start new conversation',()=>{draft={...draft,type:kind==='reply'?'post':'bok',parent:'0',root:'0'};render();}));
   }else{target('subboard');conversationContext(draft);}
   if(kind==='quote'||kind==='repost'){target('reference');const original=el('a',{href:'#/post/'+draft.reference},'View original post');original.addEventListener('click',event=>{if(!close())event.preventDefault();});content.append(original);}
   input('content',kind==='repost'?'Optional repost comment':'Message',{area:true,required:kind!=='repost'});
   if(canInvite){
    const invitation=el('div',{class:'bok-invitation'}),balance=el('p',{'data-composer-bok-balance':'','aria-live':'polite'});
    const budget=input('budget','Maximum Bok cost (USDC)',{initial:'0.25'});budget.inputMode='decimal';const budgetLabel=budget.parentElement;
    const add=button('Add Bok credit',addBokCredit);
    invitation.append(paragraph('Bok will reply to this message. You only pay for the work it does, up to your limit.'),balance,budgetLabel,add);content.append(invitation);
    const paint=()=>{const state=bokBalance.snapshot();balance.textContent=state.phase==='ready'?`Bok balance: ${decimal(state.value.availableCredit,6)} USDC`:bokBalanceText();};
    updateInvitation=()=>{
     kind=draft.type=mentionsBok(draft.content)?'bok':replyContext(draft)?'reply':'post';if(kind==='bok'&&draft.parent===undefined)Object.assign(draft,{parent:'0',root:'0'});invitation.hidden=kind!=='bok';
     if(kind==='bok')fields.set('budget',budget);else fields.delete('budget');
     title.textContent=replyContext(draft)?'Reply':'Write a post';paint();
    };
    updateBokForm=()=>{paint();validate();};updateInvitation();
   }
  }
  const counter=el('p',{class:'counter','aria-live':'polite'}),preview=el('div',{class:'preview-body','aria-label':'Message preview'});
  if(fields.has('content'))content.append(counter,el('details',{},el('summary',{},'Preview message'),preview));
  const prepareReview=()=>{
   if(!validate())return;
   const action={type:kind};for(const [key,node]of fields)action[key]=node.value;
   if(kind==='bio'||kind==='avatar'){action.name=draft.name;action.expectedVersion=profileSnapshot[kind==='bio'?'bioVersion':'avatarVersion'];}
   else if(fields.has('content'))Object.assign(action,{name:draft.name,deposit:draft.deposit});
   if(kind==='preference')Object.assign(action,{kind:draft.kind,target:draft.kind===5?'0':action.target,enabled:draft.enabled});
   if(kind==='reply'||kind==='bok')Object.assign(action,{subboard:draft.subboard,parent:draft.parent,root:draft.root});
   if(kind==='bok')action.budget=units(action.budget,6);
   const selectedAvatar=avatarDraft;
   void work(async()=>{await checkPostingRules(action);if(kind==='avatar')Object.assign(action,selectedAvatar?.clear?{width:0,height:0,data:''}:{width:100,height:100,data:await blobData(selectedAvatar.blob)});
    blocked=true;try{if(kind==='preference'||kind==='read-marker'){const epoch=accountEpoch;checkAccount(epoch);const head=await session.application.readPreferenceHead();checkAccount(epoch);if(typeof head?.revision!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(head.revision))throw connectionFailure;action.expectedRevision=head.revision;}intent=await session.application.prepare(action);}catch(failure){if(kind==='bio'||kind==='avatar')profileSnapshot=null;if(kind==='name'&&nameFailure(failure))blocked=false;throw failure;}blocked=false;note('');});
  };
  const review=button(reviewLabel(draft),prepareReview,true);
  review.dataset.actionReview='';content.append(review);
  function validate(){
   let valid=rulesReady(draft)&&[...fields.values()].every(node=>!node.required||node.value.length>0);
   for(const id of IDS)if(fields.has(id))valid=valid&&field(fields.get(id).value);
   if(fields.has('content')){
    const text=fields.get('content').value,a=allowance(text);preview.replaceChildren(createMessageContent(text));
    counter.textContent=a.remaining<0?'Your message is too long. Shorten it before continuing.':a.remaining<160?`${a.remaining} bytes left. Emoji and some letters use more than one byte.`:`${a.characters} characters`;
    counter.className=`counter${a.remaining<0?' invalid':''}`;
    valid=valid&&a.remaining>=0&&text.isWellFormed()&&!text.includes('\0')&&(kind==='bio'||!!draft.deposit);
   }
   if(kind==='transfer-moderator'){const successor=fields.get('successor').value;valid=valid&&moderatorStatus?.authorized===true&&field(successor)&&BigInt(successor)>0n;}
   else if(MODERATOR_TYPES.has(kind)){valid=valid&&moderatorStatus?.authorized===true;const key=kind==='set-main-policy'?'rules':'reason',value=fields.get(key).value;valid=valid&&value.isWellFormed()&&!value.includes('\0')&&new TextEncoder().encode(value).length<=(key==='rules'?992:217);if(kind!=='set-main-policy'){const id=fields.get(kind==='moderate-post'?'post':kind==='moderate-avatar'?'name':'subboard').value;valid=valid&&field(id)&&BigInt(id)>0n;}}
   if(kind==='reply')valid=valid&&replyContext(draft);
   if(kind==='bok'){const {parent,root,subboard}=draft;valid=valid&&field(subboard)&&field(parent)&&field(root)&&((BigInt(parent)===0n)===(BigInt(root)===0n));try{const v=BigInt(units(fields.get('budget').value,6));valid=valid&&v<(1n<<128n)&&v<=BigInt(bokStatus?.availableCredit??'0');}catch{valid=false;}}
   if(kind==='bio'||kind==='avatar')valid=valid&&!!profileSnapshot&&identities.includes(draft.name)&&BigInt(profileSnapshot.name)===BigInt(draft.name)&&(kind!=='avatar'||!!avatarDraft);
   if(kind==='preference')valid=valid&&field(draft.kind===5?'0':fields.get('target').value)&&(draft.kind===2||draft.kind===5||BigInt(fields.get('target').value||'0')!==0n);
   if(kind==='read-marker')valid=valid&&field(fields.get('thread').value)&&BigInt(fields.get('thread').value||'0')!==0n&&/^(0|[1-9][0-9]{0,9})$/.test(fields.get('throughBlock').value)&&BigInt(fields.get('throughBlock').value)<=0xffffffffn;
   if(kind==='subboard')valid=valid&&/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/.test(fields.get('slug').value);
   review.textContent=reviewLabel(draft);review.dataset.unavailable=String(!valid);review.disabled=busy||!valid;return valid;
  }
  rulesView(draft,validate);
  fields.get('subboard')?.addEventListener('change',()=>{void loadRules(rulesId(draft),true).catch(()=>{});});
  validate();
  if(['like','unlike','preference','read-marker'].includes(kind)&&!autoReviewRequested&&!busy&&!error&&!blocked&&validate())queueMicrotask(()=>{if(dialog.open&&!busy&&!intent&&!autoReviewRequested&&view==='action'){autoReviewRequested=true;prepareReview();}});
 }
 function fundingWalletView(target=content, explanation='Choose the wallet you want to pay with.'){
  if(typeof runtime.fundingWallets!=='function'||typeof runtime.connectFundingWallet!=='function'||typeof runtime.fundingWalletStatus!=='function')return true;
  const snapshot=runtime.fundingWalletStatus();
  if(snapshot.connected){
   if(typeof snapshot.name!=='string'||typeof snapshot.address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(snapshot.address))throw connectionFailure;
   target.append(el('p',{class:'connected-wallet'},el('span',{'aria-hidden':'true'},'✓'),snapshot.name+' '+snapshot.address.slice(0,6)+'…'+snapshot.address.slice(-4)));return true;
  }
  target.append(el('h3',{},'Connect your wallet'),paragraph(explanation));
  const choices=runtime.fundingWallets();
  if(!Array.isArray(choices)||choices.length>32)throw connectionFailure;
  if(!choices.length)target.append(paragraph('No wallet extension found. Open this page in a browser with MetaMask, Phantom or another Ethereum wallet installed.'));
  const list=el('div',{class:'wallet-choices'});
  for(const choice of choices){
   if(typeof choice.id!=='string'||typeof choice.name!=='string'||choice.name.length>128)throw connectionFailure;
   const connectButton=button('Connect '+choice.name,()=>void work(async()=>{
    const epoch=accountEpoch;checkAccount(epoch);note('Open '+choice.name+' to connect.');await runtime.connectFundingWallet(choice.id);checkAccount(epoch);note('');
   }));
   connectButton.classList.add('wallet-choice');
   const icon=el('span',{class:'wallet-icon','aria-hidden':'true'});
   // Provider icons are image data only; never inject wallet-supplied SVG markup.
   if(typeof choice.icon==='string'&&/^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i.test(choice.icon)&&choice.icon.length<131072)icon.append(el('img',{src:choice.icon,alt:'',width:'32',height:'32'}));
   else icon.textContent=/metamask/i.test(choice.name)?'🦊':/phantom/i.test(choice.name)?'👻':/coinbase/i.test(choice.name)?'🔵':'◈';
   connectButton.prepend(icon);list.append(connectButton);
  }
  target.append(list,button('Refresh wallet list',()=>render()));return false;
 }
 function stopFunding(){fundingAutomatic=false;fundingActiveCapability?.pauseClaim();}
 function fundingControl(label,handler){const control=button(label,handler);if(fundingAutomatic)control.dataset.fundingStop='true';return control;}
 function units(value,decimals){
  if(typeof value!=='string'||!new RegExp('^(0|[1-9][0-9]{0,30})(?:\\.[0-9]{1,'+decimals+'})?$').test(value))throw connectionFailure;
  const [whole,fraction='']=value.split('.');const result=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));if(result<=0n)throw connectionFailure;return result.toString();
 }
 async function advanceFunding(){
  const epoch=accountEpoch;checkAccount(epoch);
  const capability=fundingActiveCapability=fundingCapability();render();
  let result;try{result=await capability.advanceClaim();}finally{if(fundingActiveCapability===capability)fundingActiveCapability=null;}checkAccount(epoch);
  if(result.state==='complete'){
   const bokTopup=view==='topup'&&topupKind==='bok';stopFunding();await refresh();checkAccount(epoch);if(bokTopup){await loadBok();checkAccount(epoch);}
   if(view==='topup')notice='Top-up and private claim confirmed. Your posting collateral is unchanged.';
   else{
    const account=status?.status==='fee-ready'?'Posting collateral and network fee credit were found.':status?.status==='fee-needed'?'Network fee credit is still needed.':status?.status==='collateral-pending'?'Network fee credit was found; posting collateral is not yet available.':'The account still needs a recovery check.';
    notice=status?.status==='fee-ready'?'Payment confirmed. Your posting balance is set up.':'Payment confirmed. Your posting balance is still being checked. Refresh your account before posting.';view=inlineCreation?'action':'overview';if(inlineCreation)await loadView();
   }
  }
  else if(result.state==='review-payment'){stopFunding();topupQuote=null;notice='Token approval confirmed. Review the separate top-up payment; no deposit is sent automatically.';}
  else if(['review','review-saved','reverted','cancelled'].includes(result.state)){
   stopFunding();intent=result.intent;
   notice=result.state==='review-saved'?'This saved claim has not been submitted. Review it explicitly before sending; the Ethereum payment will not repeat.':result.state==='reverted'?'The private claim reverted. Review recovery; do not repeat the Ethereum payment.':'The private claim needs a new review. No additional Ethereum payment will be sent.';
  }else{
   stopFunding();
   notice=result.state==='paused'?'Funding checks paused. Your saved payment and claim records are preserved.':result.state==='waiting'?(result.phase==='payment'?'The saved payment is not yet confirmed. Resume recovery to check its original transaction; no payment will be repeated.':'The bridge is not yet ready. Resume saved funding to check delivery; no payment will be repeated.'):'The saved private claim remains unresolved. Resume to check its original transaction; it will not be submitted again.';
  }
 }
 function fundingCapability(){
  const type=intent?.action?.type;if(type==='claim-private-fee')return session?.topup?.['private-fee'];if(type==='claim-bok')return session?.topup?.bok;
  return view==='topup'?session?.topup?.[topupKind]:session?.funding;
 }
 function topupView(){
  if(!fundingWalletView())return;content.append(el('h3',{},'Add credit'),paragraph('Posting balance pays for posts and account updates. Bok credit pays for requests to the AI assistant.'));
  const choices=Object.keys(session.topup??{});if(!choices.length){content.append(paragraph('Direct top-ups are unavailable for this deployment.'));return;}
  if(!choices.includes(topupKind))topupKind=choices[0];const cap=session.topup[topupKind];if(!topupInputs.amount)topupInputs.amount=topupKind==='bok'?'1':decimal(BigInt(cap.defaultPrivateFeeCap)*2n,18);
  if(topupQuote){const q=topupQuote;content.append(paragraph(q.phase==='approval'?'Approve only the displayed token amount for the verified bridge. This does not deposit or claim the top-up.':'Deposit the reviewed tokens to the verified bridge. Then claim the credit privately; no posting deposit is changed.'),paragraph('Amount: '+decimal(q.amount,topupKind==='bok'?6:18)+(topupKind==='bok'?' USDC for Bok.':' fee tokens.')),paragraph('Ethereum gas maximum for this step: '+decimal(q.gasBudgetWei,18)+' ETH.'),paragraph('Private claim fee maximum: '+decimal(q.privateFeeCap,18)+' fee tokens ('+q.privateFeeCap+' base units).'),paragraph('Wallet: '+q.walletName+'.'));
   content.append(button(q.phase==='approval'?'Confirm token approval':'Confirm top-up and private claim',()=>void work(async()=>{const epoch=accountEpoch;checkAccount(epoch);topupQuote=null;const result=await cap.confirm();checkAccount(epoch);if(result.approved){stopFunding();notice='Token approval confirmed. Review the separate top-up payment; no deposit is sent automatically.';}else{fundingAutomatic=true;await advanceFunding();}}),true),button('Change top-up review',()=>{topupQuote=null;render();}));
  }else if(!fundingAutomatic){
   const select=el('select',{'aria-label':'Top-up credit'});for(const kind of choices)select.append(el('option',{value:kind},kind==='bok'?'Bok assistant (USDC)':'Posting balance (fee tokens)'));select.value=topupKind;select.addEventListener('change',()=>{clearOperationFeedback();topupKind=select.value;topupInputs.amount='';render();});content.append(label('Top-up credit',select));
   for(const [key,name]of [['amount',topupKind==='bok'?'USDC top-up amount':'Fee token top-up amount']]){const input=el('input',{type:'text',inputmode:'decimal','aria-label':name});input.value=topupInputs[key];input.addEventListener('input',()=>topupInputs[key]=input.value);content.append(label(name,input));}
   content.append(button('Review top-up',()=>void work(async()=>{const epoch=accountEpoch;checkAccount(epoch);topupQuote=await cap.prepare({amount:units(topupInputs.amount,topupKind==='bok'?6:18),privateFeeCap:cap.defaultPrivateFeeCap});checkAccount(epoch);}),true));
  }
  content.append(fundingControl(fundingAutomatic?'Pause top-up checks':'Resume saved top-up',()=>{if(fundingAutomatic){stopFunding();notice=busy?'Pause requested. Waiting for the current funding operation to settle.':'Top-up checks paused. Saved payment and custody are preserved.';render();}else void work(async()=>{fundingAutomatic=true;try{await advanceFunding();}catch(error){stopFunding();throw error;}});}));
 }
 async function prepareFundingQuote(){
  fundingQuoteRequested=true;const epoch=accountEpoch;checkAccount(epoch);note('Getting the current price…');
  fundingQuote=await session.funding.prepareStarter({asset:fundingInputs.asset});checkAccount(epoch);note('');
 }
 function fundingSummary(labelText,amount,explanation){return el('div',{class:'funding-line'},el('div',{},el('strong',{},labelText),el('p',{class:'quiet'},explanation)),el('strong',{},amount));}
 function aggregateFundingView(){
  if(!session.funding){content.append(paragraph('Account funding is currently unavailable. Try again later.'));return;}
  if(!fundingAutomatic&&session.funding.usdcAvailable){const asset=el('select',{'aria-label':'Pay with'});for(const [value,text]of [['ETH','ETH'],['USDC','USDC — no ETH needed']])asset.append(el('option',{value},text));asset.value=fundingInputs.asset;asset.addEventListener('change',()=>{clearOperationFeedback();fundingInputs.asset=asset.value;fundingQuote=null;fundingQuoteRequested=false;render();});content.append(label('Pay with',asset));}
  if(fundingQuote){
   const q=fundingQuote,b=q.breakdown,isUsdc=q.kind==='rolling-aggregate-usdc-v1',currency=isUsdc?' USDC':' ETH';
   const deposit=isUsdc?decimal(b.collateral.maxUsdc,6):decimal(b.collateralWei,18);
   const posting=isUsdc?decimal(b.fee.maxUsdc,6):decimal(b.fee.maxEth,18);
   const assistant=isUsdc?decimal(b.bokAmount,6):decimal(b.bok.maxEth,18);
   content.append(el('h3',{},'Set up posting'),
    fundingSummary('Refundable deposit',deposit+currency,'Discourages spam. Withdraw after your posts have been checked and the wait between posts has ended. Rule-breaking posts extend the wait.'),
    fundingSummary('Posting balance',posting+currency,'Pays the network each time you post or update your account.'),
    ...(BigInt(isUsdc?b.bokAmount:b.bok.amount)>0n?[fundingSummary('Bok assistant',assistant+currency,decimal(isUsdc?b.bokAmount:b.bok.amount,6)+' USDC of credit for requests to Bok.')]:[]),
    fundingSummary(isUsdc?'Payment fee':'Ethereum fee limit',decimal(isUsdc?b.relayFeeUsdc:b.gasBudgetWei,isUsdc?6:18)+currency,isUsdc?'Included in your USDC payment.':'You pay the actual network fee, up to this limit.'),
    el('div',{class:'funding-total'},el('span',{},'Maximum total'),el('strong',{},decimal(isUsdc?b.maximumUsdc:b.maximumTotalWei,isUsdc?6:18)+currency)),
    paragraph(isUsdc?'≈ $'+Number(decimal(b.maximumUsdc,6)).toFixed(2)+' USD':q.usdEstimate?'≈ $'+q.usdEstimate+' USD':'USD estimate unavailable'),
    paragraph('Sepolia testnet · test funds only.'),
    paragraph(isUsdc?'Your wallet will ask for two signatures to approve this payment.':'Approve the payment in your wallet.'));
   const details=el('details',{class:'account-details'},el('summary',{},'Payment details'),paragraph('Deposit held: '+decimal(isUsdc?b.collateral.amount:b.collateralWei,18)+' ETH.'),paragraph('Posting balance: '+decimal(b.fee.amount,18)+' fee tokens. Account setup can use up to '+decimal(q.privateFeeCap,18)+' of these tokens.'),paragraph('Exchange price tolerance: '+(q.slippageBps/100)+'%. Unused exchange funds are returned to the paying wallet.'));content.append(details);
   content.append(button('Confirm payment',()=>void work(async()=>{
    const epoch=accountEpoch;checkAccount(epoch);fundingQuote=null;fundingAutomatic=true;notice='Approve the payment in your wallet…';render();const payment=await session.funding.confirm();note('');checkAccount(epoch);
    fundingAutomatic=true;notice=payment?.pending?'Payment submitted. Waiting for confirmation…':'Payment confirmed. Setting up posting…';await advanceFunding();
   },aggregateFundingFailure),true));
  }else if(!fundingAutomatic){
   content.append(el('h3',{},'Set up posting'),paragraph('A refundable deposit discourages spam. Your posting balance pays for posts and account updates.'));
   if(fundingQuoteRequested&&!busy)content.append(button('Refresh price',()=>void work(prepareFundingQuote,aggregateFundingFailure),true));
  }
  if(fundingAutomatic)content.append(paragraph('Keep this page open while your payment confirms and your posting balance is added.'));
 }
 function fundingView(){
  const connected=fundingWalletView();if(connected)aggregateFundingView();

 }
 function restoreDialogContent(){inlineName.hidden=true;dialog.append(description,live,content);}
 function renderIdentityControls(){
  if(!identityHost)return;
  const signedIn=unlocked();
  if(signedIn&&namesLoaded&&cursor===null&&selectedName!=='0'&&!identities.includes(selectedName)){selectedName='0';selectedLabel='Anonymous';notice='Your previous posting name is no longer available. Posting as Anonymous.';}
  const select=el('select',{'aria-label':'Post as'},el('option',{value:'0'},'Anonymous'));
  if(signedIn)for(const record of identityRecords)select.append(el('option',{value:record.id},`${record.first} ${record.last}`));
  if(signedIn&&selectedName!=='0'&&!identities.includes(selectedName))select.append(el('option',{value:selectedName},selectedLabel));
  select.append(el('option',{value:'create'},'Create a name…'));
  select.value=inlineCreation?'create':signedIn?selectedName:'0';
  const incomplete=!!session&&signedIn&&(!namesLoaded||cursor!==null);select.dataset.unavailable=String(incomplete);select.disabled=busy||!!intent||incomplete;
  select.addEventListener('change',()=>{
   if(busy||intent)return;
   if(select.value==='create'){
    inlineCreation=true;clearOperationFeedback();view='action';draft={type:'name',first:'',last:''};
    if(dialog.open)dialog.close();inlineName.hidden=false;inlineName.append(description,live,content);render();
    if(!runtime)void unlock();else if(session&&unlocked())void work(loadView);
   }else{selectedName=select.value;selectedLabel=ownedLabel(selectedName);if(['post','reply','quote','repost','bok'].includes(draft.type))draft.name=selectedName;}
  });
  identityControls.replaceChildren(label('Post as',select));
  if(incomplete&&!busy){const retry=button('Load names',()=>void work(()=>loadView({loadIdentity:true})));retry.disabled=!!intent;identityControls.append(retry);}
  if(inlineCreation){
   const cancel=button('Cancel',()=>{if(busy||intent)return;inlineCreation=false;restoreDialogContent();clearOperationFeedback();renderIdentityControls();});cancel.disabled=busy||!!intent;identityControls.append(cancel);
  }else if(notice.startsWith('Name created.')||notice.startsWith('Your previous posting name'))identityControls.append(el('span',{class:'quiet',role:'status'},notice));
 }
 function attachIdentityControls(host){
  identityHost=host;host.append(identityControls,inlineName);renderIdentityControls();
  if(session&&unlocked()&&!namesLoaded&&!busy)void work(loadView);
 }
 function render(previousFocus=document.activeElement){
  renderIdentityControls();
  if(!['funding','topup'].includes(view)||invalidated||reloadRequired)stopFunding();
  const hadFocus=dialog.contains(previousFocus);
  // Use labels, never private values, to retain the same control after a form
  // change. Recreated controls have different DOM identities.
  const focusKey=node=>node.tagName+':'+(node.getAttribute('aria-label')??(node.labels?.[0]?[...node.labels[0].childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(''):['BUTTON','SUMMARY'].includes(node.tagName)?node.textContent:node.getAttribute('href')??''));
  const controls=()=>[...content.querySelectorAll('button,input,select,textarea,summary,a[href]')];
  const key=hadFocus?focusKey(previousFocus):null,index=key?controls().filter(n=>focusKey(n)===key).indexOf(previousFocus):-1;
  releasePreviews();content.replaceChildren();
  if(inlineCreation)content.append(el('h3',{},view==='funding'?'Set up your account':intent?'Review your name':'Create a name'));
  const signedIn=!!runtime&&unlocked();
  title.textContent=!signedIn?(accountMode==='signin'||refundRequested?'Sign in':'Join Rolling Chat'):view==='funding'?'Set up posting':view==='topup'?'Add credit':view==='preferences'?'Follows and bookmarks':view==='names'?'Your names':view==='balances'?'Balance and withdrawals':view==='action'?(TYPES[draft.type]??'Your account'):'Your account';
  if(signedIn&&intent&&['prepared','replacement-prepared'].includes(intent.status))title.textContent=intent.status==='replacement-prepared'?'Review replacement':reviewLabel(intent.action);
  description.textContent=!signedIn?'Join the conversation without sharing your identity.':'';
  description.hidden=!!setupMode||!description.textContent;
  content.hidden=!!setupMode;
  if(setupMode)title.textContent=setupMode==='create'?'Creating your account':'Signing you in';
  if(error)content.append(el('p',{role:'alert',tabindex:'-1',class:'notice error','data-operation-feedback':''},error));
  if(notice)content.append(el('p',{class:'notice','data-operation-feedback':''},notice));
  if(plaintextRecovery)content.append(el('p',{role:'status',class:'notice'},plaintextRecoveryWarning));
  if(invalidated||reloadRequired){content.append(paragraph('This account session has ended. Existing recovery records remain encrypted on this device.'),button('Reload to unlock',()=>location.reload()));}
  else if(!runtime)content.append(error?button('Reload page',()=>location.reload()):paragraph('Loading account setup…'));
  else if(!unlocked())custody();
  else{
   if(!session){content.append(paragraph(runtime.refundOnly?'Restore your pending withdrawal from your backup.':'Your account could not connect. Try again to continue.'),...(runtime.refundOnly?[]:[button('Reconnect',()=>void work(connect),true)]));
    if(typeof runtime.createRefundSession==='function')content.append(el('details',{class:'account-details'},el('summary',{},'Pending withdrawal'),paragraph('Use the wallet that originally paid to collect a withdrawal you already started.'),button('Restore pending withdrawal',()=>void work(connectRefund))));
   }
   else if(session.mode==='refund-only'){content.append(paragraph('Refund-only recovery. Only public exit data is read from the configured public node. Private account actions are unavailable in this mode.'));if(intent)refundView();else content.append(paragraph('The original Ethereum refund is confirmed. Your recovery records are retained.'));}
   else if(intent)showIntent();
   else if(blocked&&view==='preferences'){
    content.append(paragraph('Recover saved choices without checking funds or preparing a transaction.'));preferencesView();
    content.append(button('Check account recovery',()=>void work(async()=>{view='overview';await refresh();})));
   }
   else if(blocked)content.append(paragraph('Check retained recovery before preparing any new action.'),button('Check account recovery',()=>void work(refresh)));
   else{
    if(view==='funding'){fundingView();content.append(button('Back to account',()=>selectView('overview')));}
    else if(view==='topup'){topupView();if(draft.content)content.append(button('Back to your post',()=>selectView('action')));content.append(button('Back to account',()=>selectView('overview')));}
    else{
     if(view==='overview'){
      const needsFunding=status?.status==='fee-needed'||status?.status==='collateral-pending',needsTopup=status?.status==='fee-needed'&&status?.depositIds?.length>0;
      content.append(el('h3',{},needsTopup?'Add to your posting balance':needsFunding?'One more step before your first post':'Ready for a conversation?'),paragraph(needsTopup?'Your deposit is already in place. Add posting credit to keep going.':needsFunding?'Set up your posting balance to join in.':'Post anonymously, or choose a name when you write.'),button(needsTopup?'Add posting credit':needsFunding?'Set up posting':'Write a post',()=>{if(needsTopup){topupKind='private-fee';topupInputs.amount='';topupQuote=null;}if(needsFunding)selectView(needsTopup?'topup':'funding');else chooseAction('post');},true));
      const settings=el('details',{class:'account-links'},el('summary',{},'Account settings'));
      settings.append(button('Refresh account',()=>void work(refresh)),button('Your names',()=>selectView('names')),button('Follows and bookmarks',()=>selectView('preferences')));
      if(typeof session.application.readBalances==='function')settings.append(button('Balance and withdrawals',()=>{balances=null;bokAccounting=null;selectView('balances');}));
      settings.append(button('Create a board',()=>chooseAction('subboard')));if(moderatorStatus?.authorized)settings.append(button('Update site rules',()=>chooseAction('set-main-policy')),button('Transfer moderator authority',()=>chooseAction('transfer-moderator')));
      if(session.topup)settings.append(button('Add credit',()=>selectView('topup')));
      content.append(settings);
     }else{
      if(!viewReady())content.append(button(view==='names'?'Load your names':'Load publishing options',()=>void work(loadView),true));
      else if(view==='balances')balancesView();else if(view==='names')namesView();else if(view==='preferences')preferencesView();else{if(status?.status==='fee-needed'||status?.status==='collateral-pending')content.append(paragraph('Add a posting balance before publishing.'),button(status?.depositIds?.length?'Add posting credit':'Set up posting',()=>{topupKind='private-fee';topupInputs.amount='';topupQuote=null;selectView(status?.depositIds?.length?'topup':'funding');},true));form();}
      if(!inlineCreation)content.append(button('Back to account',()=>selectView('overview')));
     }
    }
   }
   if(!inlineCreation&&!['funding','topup'].includes(view))recovery();
  }
  controlsBusy(busy);renderBokControls();requestBokBalance();
  if(view==='funding'&&session?.funding&&!busy&&!blocked&&!intent&&!fundingQuote&&!fundingQuoteRequested&&!fundingAutomatic&&(!runtime.fundingWalletStatus||runtime.fundingWalletStatus().connected)){
   queueMicrotask(()=>{if((dialog.open||inlineCreation)&&view==='funding'&&!busy&&!fundingQuoteRequested)void work(prepareFundingQuote,aggregateFundingFailure);});
  }
  if(dialog.open&&(!busy||previousFocus?.dataset.recoveryStop==='true'||previousFocus?.dataset.accountingStop==='true'||previousFocus?.dataset.fundingStop==='true')&&(hadFocus||document.activeElement===document.body)){
   if(previousFocus.isConnected&&dialog.contains(previousFocus))previousFocus.focus({preventScroll:true});
   else{
    const same=index>=0?controls().filter(n=>focusKey(n)===key)[index]:null;
    const target=same&&!same.disabled?same:content.querySelector('h3')??closeButton;
    if(target.tagName==='H3')target.tabIndex=-1;
    target.focus({preventScroll:true});
   }
  }
 }
 function close(){if(busy||session?.busy&&!bokBalance.pending){note('An account operation is in progress. Wait before closing.');return false;}stopFunding();recoveryInspection=null;releasePreviews();if(dialog.open)dialog.close();return true;}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{for(const input of dialog.querySelectorAll('input[type=password]'))input.value='';if(returnFocus?.isConnected)returnFocus.focus();});
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(node=>!node.disabled&&node.getClientRects().length);
  if(!focusable.length){event.preventDefault();dialog.focus();return;}
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 render();
 return Object.freeze({open(defaults={}){
  if(busy)return;
  if(inlineCreation){inlineCreation=false;restoreDialogContent();}
  if(session)unlocked(); // Detect replaced custody before rendering cached account data.
  if(defaults.accountMode==='signin')accountMode='signin';
  if(!intent){autoReviewRequested=false;clearOperationFeedback();view=defaults.view==='preferences'?'preferences':Object.hasOwn(TYPES,defaults.type)?'action':'overview';clearProfileDraft();const next={type:Object.hasOwn(TYPES,defaults.type)?defaults.type:'post',subboard:'0',content:'',name:selectedName};
   for(const key of IDS)if(field(defaults[key]))next[key]=defaults[key];
   if(next.type==='moderate-avatar'&&field(defaults.name))next.name=defaults.name;
   if(next.type==='preference'&&Number.isInteger(defaults.kind)&&defaults.kind>=1&&defaults.kind<=5&&field(defaults.target)&&typeof defaults.enabled==='boolean')Object.assign(next,{kind:defaults.kind,target:defaults.target,enabled:defaults.enabled});
   if(next.type==='read-marker'&&field(defaults.thread)&&typeof defaults.throughBlock==='string')Object.assign(next,{thread:defaults.thread,throughBlock:defaults.throughBlock});
   if(typeof defaults.content==='string'&&defaults.content.length<=10000)next.content=defaults.content;draft=next;}
  if(!dialog.open){returnFocus=document.activeElement;render();dialog.showModal();closeButton.focus();}
  if(!runtime)void unlock();
  if(session&&unlocked()&&view==='preferences'&&!preferences)void work(recoverPreferences);
  if(session&&unlocked()&&view!=='preferences'){
   // Reopening a draft does not change the account. Preserve the last completed
   // observation; preparation/submission still authenticate current state.
   if(blocked||status===null)void work(refresh);
   else if(!intent&&!viewReady())void work(loadView);
  }
 },close,attachIdentityControls,attachBokControls,async loadSavedItems(){while(busy)await operationSettled;if(!session||!unlocked())return false;if(preferences)return true;await work(recoverPreferences);return !!preferences;},moderatorAuthorized(){return unlocked()&&!!session&&moderatorStatus?.authorized===true;},privateStatus,preferenceEnabled,filterPrivatePage(view,page){if(privateStatus()!=='complete'||!['following','bookmarks','notifications'].includes(view))throw connectionFailure;return runtime.selectPrivateViews({preferences,page})[view];}});
}
