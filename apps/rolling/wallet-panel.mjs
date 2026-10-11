// Presentation only. No SDK import or account access before explicit Unlock.
import {allowance} from './model.mjs';
import {prepareAvatarUpload} from './avatar-upload.mjs';
const TYPES={bio:'Edit bio',avatar:'Edit avatar',post:'Write a post',reply:'Reply',quote:'Quote a post',repost:'Repost',like:'Like a post',unlike:'Remove a like',name:'Register a name',subboard:'Create a subboard'};
const IDS=['subboard','parent','root','reference','post'];
const field=value=>typeof value==='string'&&/^(?:0x[0-9a-f]{64}|0|[1-9][0-9]{0,76})$/.test(value);
const el=(tag,attrs={},...children)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);for(const child of children.flat())if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;};
const button=(label,handler,primary=false)=>{const node=el('button',{type:'button',class:`button${primary?' primary':''}`},label);node.addEventListener('click',handler);return node;};
const paragraph=text=>el('p',{},text);
const label=(text,control)=>el('label',{class:'form-field'},text,control);
const message='This operation could not be completed. Recovery records were preserved. Check the existing transaction before preparing another.';

/** loadRuntime returns the trusted account facade/getAccount/createSession binding.
 * getAccount values are used only as an unlocked boolean, never rendered or logged.
 * close hides the dialog; Lock ends custody explicitly. No transaction auto-retry.
 * Workflow restoration is the production application's encrypted journal, not DOM
 * state or localStorage. A replaced page discovers it through readAccountStatus.
 * Profile edits capture readProfile versions only on explicit selection/check.
 * Uploaded bytes come from immutable previewBlob; recovery validates the saved
 * raster but displays its ORIGINAL Blob, never the validator's re-encoded bytes.
 */
export function mountRollingWalletPanel({loadRuntime,onPublicEffect=()=>{}}){
 if(typeof loadRuntime!=='function'||typeof onPublicEffect!=='function')throw Error('Wallet panel configuration unavailable.');
 const connectionFailure=Object.freeze({}),avatarFailure=Object.freeze({});
 let runtime,session,busy=false,blocked=false,invalidated=false,reloadRequired=false,returnFocus;
 let status=null,intent=null,identities=[],identityRecords=[],cursor=0,error='',notice='',draft={type:'post',subboard:'0',content:''};
 let profileSnapshot=null,avatarDraft=null,renderEpoch=0;const previewURLs=new Set();
 const dialog=el('dialog',{'aria-labelledby':'rolling-wallet-title','aria-describedby':'rolling-wallet-description'});
 const title=el('h2',{id:'rolling-wallet-title'},'Your private account');
 const closeButton=button('Close account panel',()=>close());
 const content=el('div'),live=el('p',{role:'status','aria-live':'polite',class:'quiet'});
 dialog.append(el('div',{class:'dialog-top'},title,closeButton),el('p',{id:'rolling-wallet-description',class:'quiet'},'Your balances and list of owned names stay in this panel. Published names, posts and actions are public.'),live,content);
 document.body.append(dialog);
 function releasePreviews(){renderEpoch++;for(const url of previewURLs)URL.revokeObjectURL(url);previewURLs.clear();}
 function clearProfileDraft(){profileSnapshot=null;avatarDraft=null;}
 function ownedLabel(id){const record=identityRecords.find(r=>r.id===id);return record?`${record.first} ${record.last}`:'Selected owned name';}
 function acceptNames(page,append=false){
  if(!Array.isArray(page.identities)||!Array.isArray(page.records)||page.identities.length!==page.records.length)throw Error('Private name records unavailable');
  const records=page.records.map((r,i)=>{if(r.id!==page.identities[i]||!field(r.id)||typeof r.first!=='string'||typeof r.last!=='string'||r.first.length>32||r.last.length>32)throw Error('Invalid private name record');return {id:r.id,first:r.first,last:r.last};});
  identityRecords=append?[...new Map([...identityRecords,...records].map(r=>[r.id,r])).values()]:records;identities=identityRecords.map(r=>r.id);cursor=page.nextCursor;
 }
 async function checkProfile(name){
  profileSnapshot=null;let snapshot;try{snapshot=await session.application.readProfile({name});}catch{throw connectionFailure;}
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
 function controlsBusy(value){dialog.setAttribute('aria-busy',String(value));for(const node of dialog.querySelectorAll('button,input,select,textarea'))node.disabled=value||node.dataset.unavailable==='true';}
 function note(text){live.textContent=text;}
 async function work(fn){
  if(busy)return;busy=true;error='';controlsBusy(true);
  try{await fn();}catch(failure){note('');error=failure===connectionFailure?'The private connection is unavailable. Your encrypted recovery is preserved. Reconnect when the service returns.':failure===avatarFailure?'This image could not be prepared. Choose a still PNG, JPEG or WebP under 8 MiB. It must fit 8192 encoded bytes after cropping and compression. No transaction was prepared.':message;}finally{busy=false;render();}
 }
 function unlocked(){return runtime&&!invalidated&&!reloadRequired&&!!runtime.getAccount();}
 async function refresh(){
  blocked=true;
  const next=await session.application.readAccountStatus();
  status=next;intent=next.intent??null;
  if(next.status==='recovering'){
   if(!intent?.intentId)throw Error('Missing recovery intent');
  }else{
   const page=await session.application.ownedIdentities({cursor:0});acceptNames(page);
  }
  blocked=false;
 }
 async function connect(){
  try{
  if(!session)session=await runtime.createSession({onProgress:progress=>{
   const stages={estimating:'Checking the action and its maximum fee…',submitting:'Proving and submitting. Keep this page open; do not send again.'};
   note(stages[progress?.stage]??'Checking the private account…');
  }});
  await refresh();
  }catch{throw connectionFailure;}
 }
 async function unlock(){await work(async()=>{
  note('Loading private account tools…');
  if(!runtime){
   const loaded=await loadRuntime();
   if(!loaded?.account||typeof loaded.getAccount!=='function'||typeof loaded.createSession!=='function')throw Error('Invalid runtime');
   runtime=loaded;
   runtime.account.configure({requireEth:false,autoPasskey:false,canEndSession:()=>!session?.busy,
    onMessage:()=>{},onSetupError:()=>{error=message;},onChange:value=>{
     if(value?.invalidated===true){invalidated=true;releasePreviews();clearProfileDraft();note('The account changed. Preserve recovery and reload before continuing.');if(!busy)render();}
    }});
  }
  if(unlocked())await connect();else note('Create an account or import your encrypted recovery file.');
 });}
 function download(envelope){
  // Only the existing custody module's ciphertext envelope may leave the panel.
  const keys=['schemaVersion','kind','kdf','iterations','salt','iv','ciphertext'];
  if(!envelope||Object.keys(envelope).sort().join()!==keys.sort().join()||envelope.schemaVersion!==1||envelope.kind!=='aztec-billboard-encrypted-wallet'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000||!/^([0-9a-f]{2}){16}$/.test(envelope.salt)||!/^([0-9a-f]{2}){12}$/.test(envelope.iv)||typeof envelope.ciphertext!=='string'||!/^([0-9a-f]{2}){16,}$/.test(envelope.ciphertext)||envelope.ciphertext.length>32*1024*1024+32)throw Error('Invalid encrypted export');
  const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:'application/json'}));
  const link=el('a',{href:url,download:'rolling-chat-encrypted-recovery.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function passwordField(text){const input=el('input',{type:'password',autocomplete:'new-password',minlength:'12',required:'', 'aria-label':text});return input;}
 function custody(){
  const password=passwordField('Recovery password'),file=el('input',{type:'file',accept:'.json,application/json','aria-label':'Recovery file'});
  const create=button('Create account and download recovery',()=>{
   if(!password.reportValidity())return;const value=password.value;password.value='';
   void work(async()=>{download(await runtime.account.create(value));notice='Encrypted recovery downloaded. Keep it and your password safe.';await connect();});
  },true);
  const restore=button('Import recovery',()=>{
   if(!file.files?.[0]){error='Choose your recovery file.';render();return;}
   const selected=file.files[0],value=password.value;password.value='';file.value='';
   void work(async()=>{await runtime.account.importRecovery(selected,value);notice='Recovery imported. Checking retained transactions…';await connect();});
  });
  content.append(paragraph('Create a private account or restore an existing one. Creating an account does not fund it.'),label('Recovery password (at least 12 characters for a new backup)',password),create,label('Encrypted recovery file',file),restore);
 }
 function recovery(){
  const section=el('details',{},el('summary',{},'Backup and account security'));
  const password=passwordField('New recovery password');
  section.append(paragraph('The encrypted download includes your private account and retained transaction recovery records. It never downloads a plaintext signing key.'),label('New recovery password',password),button('Download encrypted recovery',()=>{
   if(!password.reportValidity())return;const value=password.value;password.value='';
   void work(async()=>{download(await runtime.account.exportRecovery(value));notice='Encrypted recovery downloaded.';});
  }),button('Lock account',()=>void work(async()=>{
   blocked=true;
   if(session){await session.close();session=null;}
   await runtime.account.endSession();reloadRequired=true;status=null;identities=[];identityRecords=[];releasePreviews();clearProfileDraft();note('Account locked. Reload before unlocking again.');
  })));
  content.append(section);
 }
 function showIntent(){
  const prepared=intent.status==='prepared';
  content.append(el('h3',{},prepared?'Review before sending':'Transaction recovery'));
  content.append(paragraph(TYPES[intent.action?.type]??'Existing transaction'));
  // Explicit fields only, and text nodes throughout. No nonce, account or raw error.
  for(const key of ['first','last','slug','name','description','rules','content','subboard','parent','root','reference','post']){
   const value=intent.action?.[key];if(typeof value==='string'&&value)content.append(el('p',{class:'post-body'},`${key}: ${key==='name'&&intent.action.type!=='subboard'?ownedLabel(value):value}`));
  }
  if(typeof intent.maximumFee==='string'&&/^[0-9]+$/.test(intent.maximumFee))content.append(paragraph(`Maximum network fee: ${intent.maximumFee} fee-juice units. This is a maximum, not a guaranteed final charge.`));
  if(intent.action?.type==='bio'&&intent.action.content==='')content.append(paragraph('Clear the current profile bio. Historical versions remain public.'));
  let avatarReady=intent.action?.type!=='avatar'||intent.action.data==='';
  const avatarArea=el('div',{'aria-label':'Saved avatar preview'});
  if(intent.action?.type==='avatar'){
   content.append(avatarArea);
   if(intent.action.data==='')avatarArea.append(paragraph('Clear avatar. No image bytes will be published.'));
  }
  let confirm;
  if(prepared){
   confirm=button('Confirm and send',()=>void work(async()=>{
    if(!avatarReady)throw Error('Avatar preview not verified');
    const id=intent.intentId;intent={...intent,status:'unknown'};blocked=true;
    try{await receive(await session.application.submitPrepared(id));}catch{note('Submission outcome is unknown. Check this transaction; do not submit again.');throw Error('Unknown outcome');}
   }),true);confirm.dataset.unavailable=String(!avatarReady);
   content.append(paragraph('Your exact action is saved. Sending publishes it onchain and cannot be undone.'),confirm,button('Cancel prepared action',()=>void work(async()=>{await session.application.cancelPrepared(intent.intentId);intent=null;await refresh();notice='Prepared action cancelled. No new transaction was sent.';})));
  }else{
   content.append(paragraph('No automatic resend is allowed. A missing receipt does not mean the transaction failed.'),button('Check existing transaction',()=>void work(async()=>{await receive(await session.application.reconcile(intent.intentId));})));
  }
  if(intent.action?.type==='avatar'&&intent.action.data!==''){
   const epoch=renderEpoch,action=intent.action;avatarArea.append(paragraph('Checking the exact saved avatar preview…'));
   void (async()=>{try{const blob=savedAvatarBlob(action),checked=await prepareAvatarUpload(blob);
    if(checked.source.width!==100||checked.source.height!==100)throw Error('Invalid saved dimensions');
    if(epoch!==renderEpoch||!unlocked())return;avatarArea.replaceChildren();showAvatar(blob,avatarArea,{ready:()=>{if(epoch!==renderEpoch||!unlocked())return;avatarReady=true;if(confirm){confirm.dataset.unavailable='false';confirm.disabled=busy;}},failed:()=>{avatarReady=false;if(confirm){confirm.dataset.unavailable='true';confirm.disabled=true;}}});avatarArea.append(paragraph(`${blob.size}/8192 encoded bytes. These are the exact saved publication bytes.`));
   }catch{if(epoch===renderEpoch)avatarArea.replaceChildren(paragraph('The saved avatar cannot be previewed safely. Cancel this prepared action or retain its recovery record; it will not be sent.'));}})();
  }
 }
 async function receive(result){
  intent=result;blocked=false;
  if(['confirmed','reverted'].includes(result.status)&&['bio','avatar'].includes(result.action?.type))profileSnapshot=null;
  if(result.status==='confirmed'){
   notice='Transaction confirmed on the verified chain.';
   try{await onPublicEffect();}catch{notice+=' Public feed refresh is unavailable; the transaction remains confirmed.';}
   await refresh();
  }else if(result.status==='reverted'){
   notice='Transaction reverted. A network fee may have been charged. Recovery checks must complete before a new action.';await refresh();
  }else note(result.status==='prepared'?'The saved action has not been sent. Review before confirming.':'The transaction is still unconfirmed or unknown. Check later; do not resend.');
 }
 function form(){
  const type=el('select',{'aria-label':'Action'});for(const [value,text]of Object.entries(TYPES)){const option=el('option',{value},text);option.selected=draft.type===value;type.append(option);}
  type.addEventListener('change',()=>{clearProfileDraft();draft={type:type.value,subboard:'0',content:''};render();});content.append(label('Action',type));
  const fields=new Map();
  function input(name,text,{area=false,initial='',required=true}={}){
   const node=el(area?'textarea':'input',area?{rows:'5'}:{type:'text'});node.value=draft[name]??initial;if(required)node.required=true;
   node.addEventListener('input',()=>{draft[name]=node.value;validate();});fields.set(name,node);content.append(label(text,node));return node;
  }
  const kind=draft.type;
  if(kind==='bio'||kind==='avatar'){
   const names=el('select',{'aria-label':'Profile name'},el('option',{value:''},'Choose an owned name'));
   for(const record of identityRecords)names.append(el('option',{value:record.id},`${record.first} ${record.last}`));
   names.value=identities.includes(draft.name)?draft.name:'';draft.name=names.value;
   names.addEventListener('change',()=>{draft.name=names.value;clearProfileDraft();if(draft.name)void work(()=>checkProfile(draft.name));else render();});
   content.append(label('Profile name',names),paragraph('Edits publish publicly for this name. A captured version prevents overwriting a newer edit.'));
   const checkVersion=button('Check current profile version',()=>{if(draft.name)void work(()=>checkProfile(draft.name));});checkVersion.dataset.unavailable=String(!draft.name);content.append(checkVersion);if(profileSnapshot)content.append(paragraph('Current profile version checked. A newer edit will require a fresh check.'));
   if(cursor!==null)content.append(button('Load more owned names',()=>void work(async()=>acceptNames(await session.application.ownedIdentities({cursor}),true))));
   if(kind==='bio')input('content','Bio (empty to clear)',{area:true,required:false});
   else{
    const file=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Avatar image'});
    file.addEventListener('change',()=>{const selected=file.files?.[0];if(!selected)return;avatarDraft=null;
     void work(async()=>{let prepared;try{prepared=await prepareAvatarUpload(selected);}catch{throw avatarFailure;}if(!unlocked())throw Error('Account changed');avatarDraft={blob:prepared.previewBlob,notice:prepared.notice};});});
    content.append(label('Avatar image',file),paragraph('PNG, JPEG or WebP. Centre-square crop to 100×100 pixels, compressed to at most 8192 bytes. Transparency is preserved.'));
    if(avatarDraft?.blob){showAvatar(avatarDraft.blob,content);content.append(paragraph(avatarDraft.notice),paragraph(`${avatarDraft.blob.size}/8192 encoded bytes`));}
    if(avatarDraft?.clear)content.append(paragraph('The avatar will be cleared.'));
    content.append(button('Clear avatar',()=>{avatarDraft={clear:true};render();}));
   }
  }else if(kind==='name'){
   content.append(paragraph('Names are globally unique and permanent. Use 1–32 ASCII letters, spaces, apostrophes or hyphens in each part; start and end with a letter. Bok is reserved.'));
   const first=input('first','First name'),last=input('last','Last name');
   // Reversible proposal vocabulary: eight valid values per part, uniformly picked
   // from local cryptographic random bits. Availability is never inferred locally.
   const firstNames=['River','Ellis','Mira','Rowan','Sage','Robin','Avery','Quinn'],lastNames=['Lane','Moss','Reed','Vale','Stone','Brook','Finch','Wren'];
   content.append(button('Suggest a random name',()=>{const bytes=crypto.getRandomValues(new Uint8Array(2));first.value=firstNames[bytes[0]&7];last.value=lastNames[bytes[1]&7];draft.first=first.value;draft.last=last.value;validate();}),paragraph('A random suggestion is not a reservation. Check action verifies current availability; another registration may still win before your transaction.'));

  }else if(kind==='subboard'){
   content.append(paragraph('Creation needs network fees, not posting collateral. The subboard is usable immediately; it does not automatically appear on Home. Its slug cannot be renamed or transferred. Parent rules also apply.'));
   input('slug','Permanent slug (3–40 lowercase letters, digits or single hyphens)');input('name','Subboard name');input('description','Description',{area:true});input('rules','Additional rules',{area:true,required:false});
  }else if(kind==='like'||kind==='unlike')input('post','Post ID');
  else{
   const names=el('select',{'aria-label':'Posting identity'},el('option',{value:'0'},'Anonymous'));
   for(const record of identityRecords)names.append(el('option',{value:record.id},`${record.first} ${record.last}`));
   names.value=identities.includes(draft.name)?draft.name:'0';draft.name=names.value;
   names.addEventListener('change',()=>{draft.name=names.value;});content.append(label('Posting identity',names));
   if(cursor!==null)content.append(button('Load more owned names',()=>void work(async()=>{const page=await session.application.ownedIdentities({cursor});acceptNames(page,true);})));
   const deposits=el('select',{'aria-label':'Posting collateral'});
   for(const id of status?.depositIds??[])deposits.append(el('option',{value:id},`Deposit ${id}`));
   if(!deposits.options.length)deposits.append(el('option',{value:''},'No verified collateral found'));
   deposits.value=(status?.depositIds??[]).includes(draft.deposit)?draft.deposit:deposits.options[0].value;draft.deposit=deposits.value;
   deposits.addEventListener('change',()=>{draft.deposit=deposits.value;validate();});content.append(label('Posting collateral',deposits),paragraph('A deposit alone does not establish eligibility. The action check verifies live policy and collateral conditions.'));
   input('subboard','Subboard ID (0 for main board)',{initial:'0'});
   if(kind==='reply'){input('parent','Reply to post ID');input('root','Root thread ID');}
   if(kind==='quote'||kind==='repost')input('reference','Referenced post ID');
   input('content',kind==='repost'?'Optional repost comment':'Message',{area:true,required:kind!=='repost'});
  }
  const counter=el('p',{class:'counter','aria-live':'polite'}),preview=el('div',{class:'preview-body','aria-label':'Message preview'});
  if(fields.has('content'))content.append(counter,el('details',{},el('summary',{},'Preview message'),preview));
  const review=button('Check action and review fee',()=>{
   if(!validate())return;
   const action={type:kind};for(const [key,node]of fields)action[key]=node.value;
   if(kind==='bio'||kind==='avatar'){action.name=draft.name;action.expectedVersion=profileSnapshot[kind==='bio'?'bioVersion':'avatarVersion'];}
   else if(fields.has('content'))Object.assign(action,{name:draft.name,deposit:draft.deposit});
   const selectedAvatar=avatarDraft;
   void work(async()=>{if(kind==='avatar')Object.assign(action,selectedAvatar?.clear?{width:0,height:0,data:''}:{width:100,height:100,data:await blobData(selectedAvatar.blob)});
    blocked=true;try{intent=await session.application.prepare(action);}catch(failure){if(kind==='bio'||kind==='avatar')profileSnapshot=null;throw failure;}blocked=false;note('Review the saved action and maximum fee before sending.');});
  },true);
  content.append(review);
  function validate(){
   let valid=[...fields.values()].every(node=>!node.required||node.value.length>0);
   for(const id of IDS)if(fields.has(id))valid=valid&&field(fields.get(id).value);
   if(fields.has('content')){
    const text=fields.get('content').value,a=allowance(text);preview.textContent=text;
    counter.textContent=`${a.characters} characters · ${a.bytes}/992 UTF-8 bytes · ${Math.max(0,a.remaining)} bytes remaining${a.remaining<0?` · ${-a.remaining} bytes over the limit`:''}`;
    counter.className=`counter${a.remaining<0?' invalid':''}`;
    valid=valid&&a.remaining>=0&&text.isWellFormed()&&!text.includes('\0')&&(kind==='bio'||!!draft.deposit);
   }
   if(kind==='bio'||kind==='avatar')valid=valid&&!!profileSnapshot&&identities.includes(draft.name)&&BigInt(profileSnapshot.name)===BigInt(draft.name)&&(kind!=='avatar'||!!avatarDraft);
   if(kind==='subboard')valid=valid&&/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/.test(fields.get('slug').value);
   review.dataset.unavailable=String(!valid);review.disabled=busy||!valid;return valid;
  }
  validate();
 }
 function render(){
  const hadFocus=dialog.contains(document.activeElement);
  releasePreviews();content.replaceChildren();
  if(error)content.append(el('p',{role:'alert',class:'notice error'},error));
  if(notice)content.append(el('p',{class:'notice'},notice));
  if(invalidated||reloadRequired){content.append(paragraph('This account session has ended. Existing recovery records remain encrypted on this device.'),button('Reload to unlock',()=>location.reload()));}
  else if(!runtime)content.append(paragraph('Browsing needs no wallet. Unlock only when you want to manage your account or publish.'),button('Unlock',()=>void unlock(),true));
  else if(!unlocked())custody();
  else{
   if(!session)content.append(paragraph('Your account is unlocked. The verified private connection is not ready.'),button('Connect private account',()=>void work(connect),true));
   else if(intent)showIntent();
   else if(blocked)content.append(paragraph('Check retained recovery before preparing any new action.'),button('Check account recovery',()=>void work(refresh)));
   else{
    const messages={'fee-needed':'Private network fee credit is needed.','collateral-pending':'No posting collateral is available.','fee-ready':'Private fee credit and deposit IDs were found; posting eligibility still requires the action check.'};
    content.append(paragraph(messages[status?.status]??'The private account has not been verified.'));
    if(status?.privateFeeCredit&&/^[0-9]+$/.test(status.privateFeeCredit))content.append(paragraph(`Private fee credit: ${status.privateFeeCredit} fee-juice units.`));
    content.append(paragraph('Funding is not connected in this panel yet. No funds are requested here.'));
    if(status?.status!=='locked')form();
    content.append(button('Refresh private account',()=>void work(refresh)));
   }
   recovery();
  }
  controlsBusy(busy);
  if(dialog.open&&!busy&&(hadFocus||document.activeElement===document.body))closeButton.focus();
 }
 function close(){if(busy||session?.busy){note('An account operation is in progress. Wait before closing.');return false;}releasePreviews();if(dialog.open)dialog.close();return true;}
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
  if(!intent){clearProfileDraft();const next={type:Object.hasOwn(TYPES,defaults.type)?defaults.type:'post',subboard:'0',content:''};
   for(const key of IDS)if(field(defaults[key]))next[key]=defaults[key];
   if(typeof defaults.content==='string'&&defaults.content.length<=10000)next.content=defaults.content;draft=next;}
  if(!dialog.open){returnFocus=document.activeElement;render();dialog.showModal();closeButton.focus();}
  if(session&&unlocked())void work(refresh);
 },close});
}
