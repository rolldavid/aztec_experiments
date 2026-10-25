// Follows and bookmarks are encrypted account data, never Aztec transactions.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX_ITEMS=200,MAX_BLOB=256*1024,MAX_LOCAL=768*1024;
const keys=Object.freeze({1:'bookmarks',2:'followedBoards',3:'followedNames'});
const failure=()=>Object.assign(Error('Saved items could not sync. Your local changes remain available; try syncing again.'),{code:'ROLLING_SAVED_ITEMS_UNAVAILABLE'});
const check=value=>{if(!value)throw failure();};
const empty=()=>({bookmarks:[],followedBoards:[],followedNames:[],labels:{boards:{},names:{}}});
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode(text,max){check(typeof text==='string'&&text.length<=Math.ceil(max*4/3)&&/^[A-Za-z0-9_-]+$/.test(text)&&text.length%4!==1);const bytes=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));check(bytes.length<=max&&encode(bytes)===text);return bytes;}
function exact(value,names){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join()===names.toSorted().join());return value;}
function target(value,kind){check(typeof value==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(value)&&BigInt(value)<FIELD&&(kind===2||value!=='0'));return value;}
function document(value){exact(value,[...Object.values(keys),'labels']);exact(value.labels,['boards','names']);let count=0;for(const [kind,key]of Object.entries(keys)){const list=value[key];check(Array.isArray(list));let last=-1n;for(const item of list){target(item,Number(kind));check(BigInt(item)>last);last=BigInt(item);}count+=list.length;}check(count<=MAX_ITEMS&&value.bookmarks.length<=100&&value.followedBoards.length+value.followedNames.length<=100);for(const [name,kind]of [['boards',2],['names',3]]){check(value.labels[name]&&Object.getPrototypeOf(value.labels[name])===Object.prototype);for(const [id,label]of Object.entries(value.labels[name])){target(id,kind);check(value[keys[kind]].includes(id)&&typeof label==='string'&&label.length<=128);}}return structuredClone(value);}
function change(value){exact(value,Object.hasOwn(value,'label')?['kind','target','enabled','label']:['kind','target','enabled']);check(value.label===undefined||typeof value.label==='string'&&value.label.length<=128);check(Object.hasOwn(keys,value.kind)&&Number.isInteger(value.kind)&&typeof value.enabled==='boolean');target(value.target,value.kind);return {...value};}
function apply(base,pending){const out=document(base);for(const item of pending){const values=new Set(out[keys[item.kind]]);item.enabled?values.add(item.target):values.delete(item.target);out[keys[item.kind]]=[...values].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);const labels=item.kind===2?out.labels.boards:item.kind===3?out.labels.names:null;if(labels){if(!item.enabled)delete labels[item.target];else if(item.label!==undefined)labels[item.target]=item.label;}}return document(out);}
function effective(base,pending){return pending.filter(item=>base[keys[item.kind]].includes(item.target)!==item.enabled||item.enabled&&item.label!==undefined&&base.labels[item.kind===2?'boards':'names']?.[item.target]!==item.label);}
function record(value){exact(value,['schemaVersion','revision','base','pending']);check(value.schemaVersion===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&Array.isArray(value.pending)&&value.pending.length<=MAX_ITEMS);const pending=value.pending.map(change);check(new Set(pending.map(p=>p.kind+':'+p.target)).size===pending.length);return {schemaVersion:1,revision:value.revision,base:document(value.base),pending};}
export async function createSavedItems({walletSecret,walletSalt,scopeText,storage,fetch=globalThis.fetch,crypto=globalThis.crypto,contextGuard=()=>{}}){
 check(typeof walletSecret==='string'&&/^0x[0-9a-f]{64}$/.test(walletSecret)&&BigInt(walletSecret)>0n&&BigInt(walletSecret)<FIELD);
 check(['string','bigint','number'].includes(typeof walletSalt)&&!(typeof walletSalt==='number'&&!Number.isSafeInteger(walletSalt)));const salt=BigInt(walletSalt);check(salt>=0n&&salt<FIELD&&typeof scopeText==='string'&&scopeText.length>0&&scopeText.length<=2048);
 let closed=false,state={schemaVersion:1,revision:0,base:empty(),pending:[]},encoded=null,loaded=false,syncing=null,queue=Promise.resolve(),syncError=false,localError=false;
 const listeners=new Set(),abort=new AbortController();
 // Custody identity checks are synchronous, matching the runtime account guard.
 const guard=()=>{check(!closed);const result=contextGuard();if(result!==undefined){if(result&&typeof result.then==='function')void Promise.resolve(result).catch(()=>{});throw failure();}};guard();
 async function derive(domain){const material=encoder.encode(domain+'\0'+scopeText+'\0'+walletSecret+':'+salt.toString(16).padStart(64,'0'));try{return new Uint8Array(await crypto.subtle.digest('SHA-256',material));}finally{material.fill(0);}}
 const capBytes=await derive('rolling.saved-items.write.v1'),capability=hex(capBytes);
 const prefix=encoder.encode('rolling.saved-items.id.v1\0'),idMaterial=new Uint8Array(prefix.length+32);idMaterial.set(prefix);idMaterial.set(capBytes,prefix.length);capBytes.fill(0);
 const id=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',idMaterial)));idMaterial.fill(0);
 const keyBytes=await derive('rolling.saved-items.encryption.v1');let key;try{key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt','decrypt']);}finally{keyBytes.fill(0);}
 const aad=encoder.encode('rolling.saved-items.document.v1\0'+scopeText),localAAD=encoder.encode('rolling.saved-items.local.v1\0'+scopeText);
 async function seal(value,local=false){const plain=encoder.encode(JSON.stringify(value)),iv=crypto.getRandomValues(new Uint8Array(12));try{check(plain.length+28<=(local?MAX_LOCAL:MAX_BLOB));const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:local?localAAD:aad},key,plain)),all=new Uint8Array(12+ciphertext.length);all.set(iv);all.set(ciphertext,12);return encode(all);}finally{plain.fill(0);}}
 async function open(blob,local=false){const bytes=decode(blob,local?MAX_LOCAL:MAX_BLOB);check(bytes.length>=28);let plain;try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:local?localAAD:aad},key,bytes.subarray(12)));return JSON.parse(decoder.decode(plain));}finally{plain?.fill(0);}}
 const snapshot=()=>loaded&&!closed?apply(state.base,state.pending):null;
 const status=()=>closed?'closed':localError?'unsaved':!loaded?(syncError?'unavailable':'loading'):syncError?'unsynced':syncing||state.pending.length?'syncing':'ready';
 function emit(){if(closed)return;for(const listener of listeners)try{listener();}catch{}}
 async function persist(){
  for(let attempt=0;attempt<3;attempt++){
   guard();const next=await seal(state,true);guard();
   try{await storage.compareAndSwap(id,encoded,next);guard();encoded=next;localError=false;return;}catch(error){
    guard();const current=await storage.read(id);guard();if(current===encoded)throw error;
    check(current!==null);const other=record(await open(current,true));guard();
    const ours=new Map(state.pending.map(item=>[item.kind+':'+item.target,item]));
    const pending=[...other.pending.filter(item=>!ours.has(item.kind+':'+item.target)),...ours.values()];
    const latest=other.revision>state.revision?other:state;apply(latest.base,pending);
    state={schemaVersion:1,revision:latest.revision,base:latest.base,pending:effective(latest.base,pending)};encoded=current;
   }
  }
  throw failure();
 }
 function mutate(fn){const work=queue.then(async()=>{guard();await fn();guard();try{await persist();}catch{localError=true;emit();throw failure();}emit();});queue=work.catch(()=>{});return work;}
 async function request(method,body){guard();const response=await fetch('/api/saved-items/'+id,{method,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:abort.signal,headers:method==='PUT'?{'content-type':'application/json',authorization:'Bearer '+capability}:{},...(body?{body:JSON.stringify(body)}:{})});guard();if(response.status===409&&method==='PUT'){await response.body?.cancel();return null;}check(response.ok&&response.body);const reader=response.body.getReader();let size=0,parts=[];try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;check(size<=MAX_BLOB*2);parts.push(next.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}guard();const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}const value=JSON.parse(decoder.decode(bytes));exact(value,['schemaVersion','revision','blob']);check(value.schemaVersion===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&(value.revision===0?value.blob===null:typeof value.blob==='string'));return value;}
 async function sync(){
  if(localError)await mutate(()=>{});
  // A conflict means another browser saved first. Replay only this browser's
  // explicit target changes onto its authenticated document; never replace it
  // with an old whole-document snapshot. Bound contention, then expose retry.
  for(let attempt=0;attempt<3;attempt++){
   const remote=await request('GET'),base=remote.blob===null?empty():document(await open(remote.blob));guard();
   let stale=false;await mutate(()=>{if(remote.revision<state.revision){stale=true;return;}state={...state,revision:remote.revision,base};loaded=true;});if(stale)continue;
   let sent,doc,revision;await queue;guard();sent=state.pending.slice();if(!sent.length){syncError=false;return;}doc=apply(state.base,sent);revision=state.revision;
   const blob=await seal(doc),result=await request('PUT',{expectedRevision:revision,blob});if(result===null)continue;
   check(result.revision===revision+1&&result.blob===blob);
   await mutate(()=>{state={...state,...(result.revision>=state.revision?{revision:result.revision,base:doc}:{}),pending:state.pending.filter(item=>!sent.includes(item))};});
   syncError=false;if(!state.pending.length)return;
  }
  throw failure();
 }
 function refresh(){if(syncing)return syncing;guard();syncing=sync().catch(()=>{syncError=true;throw failure();}).finally(()=>{syncing=null;emit();if(!closed&&!syncError&&state.pending.length)void refresh().catch(()=>{});});emit();return syncing;}
 try{encoded=await storage.read(id);guard();if(encoded!==null){check(typeof encoded==='string');state=record(await open(encoded,true));loaded=true;}}catch{throw failure();}
 const ready=loaded?Promise.resolve():refresh();ready.catch(()=>{});if(loaded)void refresh().catch(()=>{});
 return Object.freeze({snapshot,status,ready,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},refresh,flush:refresh,
  async set(input){const kind=input?.kind,value=target(input?.target,kind);check(Number.isInteger(kind)&&Object.hasOwn(keys,kind)&&(input.enabled===undefined||typeof input.enabled==='boolean'));const enabled=input.enabled,label=input.label;check(label===undefined||typeof label==='string'&&label.length<=128);if(!loaded)await ready;
   await mutate(()=>{const current=apply(state.base,state.pending),selected=enabled??!current[keys[kind]].includes(value);if(selected&&!current[keys[kind]].includes(value)&&(kind===1?current.bookmarks.length:current.followedBoards.length+current.followedNames.length)>=100)throw Object.assign(Error('Saved-item limit reached.'),{code:'ROLLING_SAVED_ITEMS_LIMIT',kind});const item=change({kind,target:value,enabled:selected,...(label===undefined?{}:{label})});const pending=[...state.pending.filter(p=>p.kind!==kind||p.target!==value),item];apply(state.base,pending);state.pending=pending;});
   void refresh().catch(()=>{});return snapshot();
  },close(){closed=true;abort.abort();listeners.clear();state={schemaVersion:1,revision:0,base:empty(),pending:[]};}
 });
}
