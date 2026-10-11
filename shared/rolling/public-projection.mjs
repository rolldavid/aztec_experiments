// Deliberately dependency-free: the wallet SDK must not enter public reading.
const rollingError=()=>Object.assign(Error('Rolling public history is invalid or unavailable.'),{code:'ROLLING_PUBLIC_INVALID'});
const check=v=>{if(!v)throw rollingError();};
const copy=v=>structuredClone(v);
const pos=e=>[e.position.blockNumber,e.position.txIndexWithinBlock,e.position.logIndexWithinTx].map(BigInt);
const compare=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;return 0;};
const text=(p,field,length)=>{const bytes=new Uint8Array(p[field].length*31);p[field].forEach((word,i)=>{let n=BigInt(word);for(let j=30;j>=0;j--){bytes[i*31+j]=Number(n&255n);n>>=8n;}});return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.slice(0,Number(p[length])));};
// stage changes nothing; apply and reverse-order undo are single-use and reject
// stale candidates. Private ownership and like-tag membership are never returned.
export function createRollingProjection({isValidatedEvent,maxEvents=50000}={}) {
 check(typeof isValidatedEvent==='function'&&Number.isSafeInteger(maxEvents)&&maxEvents>0&&maxEvents<=1000000);
 let state={posts:new Map(),names:new Map(),boards:new Map(),policies:new Map(),plugins:new Map(),requests:new Map(),likes:new Map(),order:[],version:'0',last:null,scope:null,eventCount:0},revision=0,tip=Symbol('initial');
 function stage(events){
  check(Array.isArray(events)&&events.length<=10000&&state.eventCount+events.length<=maxEvents);
  const expectedRevision=revision,baseTip=tip,ownTip=Symbol('range'),oldLength=state.order.length,appended=[];
  // Retain only touched values. Never retain a cloned Map or full order array
  // per checkpoint: the cache keeps these undo closures for its whole suffix.
  const scalarKeys=['version','last','scope','eventCount'];
  const beforeScalars=Object.fromEntries(scalarKeys.map(key=>[key,state[key]]));
  const deltas=[];
  function overlay(map){
   const before=new Map(),after=new Map();
   const get=key=>after.has(key)?after.get(key):map.get(key);
   const draft={get,has:key=>after.has(key)||map.has(key),set(key,value){if(!before.has(key))before.set(key,{exists:map.has(key),value:map.get(key)});after.set(key,value);}};
   deltas.push({apply(){for(const [key,value] of after)map.set(key,value);},undo(){for(const [key,prior] of before)if(prior.exists)map.set(key,prior.value);else map.delete(key);}});
   return draft;
  }
  const next={...beforeScalars,eventCount:state.eventCount+events.length,
   order:{get length(){return oldLength+appended.length;},push(id){appended.push(id);}}};
  for(const key of ['posts','names','boards','policies','plugins','requests','likes'])next[key]=overlay(state[key]);
  const awaiting=new Set();
  const sameTx=(a,b)=>a.position.txHash===b.position.txHash&&a.position.blockHash===b.position.blockHash;
  const putPost=(id,patch)=>{check(next.posts.has(id));next.posts.set(id,{...next.posts.get(id),...patch});};
  for(const e of events){
   check(isValidatedEvent(e));const p=e.payload,coordinate=pos(e),scope=JSON.stringify(e.scope);
   check(!next.scope||next.scope===scope);next.scope=scope;
   check(!next.last||compare(pos(next.last),coordinate)<0);if(next.last?.position.blockNumber===e.position.blockNumber){check(next.last.position.blockHash===e.position.blockHash);if(next.last.position.txIndexWithinBlock===e.position.txIndexWithinBlock)check(next.last.position.txHash===e.position.txHash);}
   next.last=e;
   if(e.type==='MainPolicyPublished'){check(BigInt(p.version)===BigInt(next.version)+1n);next.policies.set(p.version,{...p,text:text(p,'rules','length')});next.version=p.version;}
   else if(e.type==='NameRegistered'){check(!next.names.has(p.name_id));next.names.set(p.name_id,{id:p.name_id,first:text(p,'first','first_length'),last:text(p,'last','last_length')});}
   else if(e.type==='SubboardCreated'){check(!next.boards.has(p.subboard_id)&&p.main_policy_version===next.version);next.boards.set(p.subboard_id,{id:p.subboard_id,slug:text(p,'slug','slug_length'),name:text(p,'name','name_length'),description:text(p,'description','description_length'),rules:text(p,'rules','rules_length'),creationVersion:p.main_policy_version,rejected:false,rejection:null});}
   else if(e.type==='SubboardRejected'){const board=next.boards.get(p.subboard_id);check(board&&!board.rejected&&p.main_policy_version===next.version);next.boards.set(p.subboard_id,{...board,rejected:true,rejection:{reason:text(p,'reason','reason_length'),mainVersion:p.main_policy_version,position:e.position}});}
   else if(e.type==='PluginConfigured'){const old=next.plugins.get(p.plugin_id);check(!old||old.adapter===p.adapter);next.plugins.set(p.plugin_id,{...p});}
   else if(e.type==='PostPublished'){
    const r=p.record,parent=next.posts.get(r.parent),reference=next.posts.get(r.reference),board=next.boards.get(r.subboard);
    check(!next.posts.has(p.id)&&p.main_policy_version===next.version&&next.policies.has(next.version));
    check(r.subboard==='0'||board&&!board.rejected);check(p.local_policy_version===(r.subboard==='0'?'0':'1'));
    check(r.name_id==='0'||next.names.has(r.name_id));
    if(r.parent!=='0')check(parent&&!parent.removal&&parent.record.root===r.root&&parent.record.subboard===r.subboard);
    if(r.reference!=='0')check(reference&&!reference.removal);
    next.posts.set(p.id,{id:p.id,record:copy(r),text:text(p,'message','length'),timestamp:p.timestamp,mainVersion:p.main_policy_version,localVersion:p.local_policy_version,position:e.position,order:String(next.order.length),likes:'0',removal:null,invocation:null,bot:null});next.order.push(p.id);
    if(r.kind==='4')awaiting.add(p.id);
   } else if(e.type==='PostRemoved'){
    const post=next.posts.get(p.id);check(post&&!post.removal);const local=post.record.subboard==='0'?0n:1n;
    check(BigInt(p.policy_version)===BigInt(next.version)+(local<<32n));
    putPost(p.id,{removal:{reason:text(p,'reason','reason_length'),policy:p.policy_version,penalized:p.penalized,position:e.position}});
   } else if(e.type==='PluginInvoked'){
    const post=next.posts.get(p.post_id),plugin=next.plugins.get(p.plugin_id);check(post&&post.record.kind!=='4'&&!post.invocation&&plugin?.enabled&&sameTx(post,e));
    const key=plugin.adapter+':'+p.request_id;check(!next.requests.has(key));
    const invocation={pluginId:p.plugin_id,adapter:plugin.adapter,requestId:p.request_id,target:p.target,parent:p.post_id,reply:null};
    next.requests.set(key,invocation);putPost(p.post_id,{invocation});
   } else if(e.type==='PluginReplyPublished'){
    const plugin=next.plugins.get(p.plugin_id),post=next.posts.get(p.post_id);check(plugin?.enabled&&post&&awaiting.has(p.post_id)&&sameTx(post,e));
    const key=plugin.adapter+':'+p.request_id,request=next.requests.get(key),parent=next.posts.get(p.parent_id);
    check(request&&request.pluginId===p.plugin_id&&request.parent===p.parent_id&&request.target===p.target&&!request.reply&&parent&&!parent.removal&&post.record.parent===p.parent_id&&post.record.root===parent.record.root&&post.record.subboard===parent.record.subboard);
    const updated={...request,reply:p.post_id};next.requests.set(key,updated);putPost(p.parent_id,{invocation:updated});putPost(p.post_id,{bot:{pluginId:p.plugin_id,requestId:p.request_id,target:p.target,parent:p.parent_id}});awaiting.delete(p.post_id);
   } else if(e.type==='LikeChanged'){
    const post=next.posts.get(p.post);check(post);const key=p.post+':'+p.tag,was=next.likes.get(key)??false;check(was!==p.active&&(!p.active||!post.removal));
    check(BigInt(p.count)===BigInt(post.likes)+(p.active?1n:-1n));next.likes.set(key,p.active);putPost(p.post,{likes:p.count});
   } else throw rollingError();
  }
  // Cache ranges must include whole transactions; never display an unauthenticated
  // kind-4 post while waiting for a later fragment with its linkage event.
  check(awaiting.size===0);let applied=false,undone=false;
  const afterScalars=Object.fromEntries(scalarKeys.map(key=>[key,next[key]]));
  return {apply(){
    check(!applied&&!undone&&revision===expectedRevision&&tip===baseTip);
    for(const delta of deltas)delta.apply();state.order.push(...appended);Object.assign(state,afterScalars);
    tip=ownTip;revision++;applied=true;
   },undo(){
    check(applied&&!undone&&tip===ownTip);
    for(const delta of deltas)delta.undo();state.order.length=oldLength;Object.assign(state,beforeScalars);
    tip=baseTip;revision++;undone=true;
   }};
 }
 const visible=post=>{const p=copy(post),board=state.boards.get(p.record.subboard);if(p.removal||board?.rejected)p.text=null;return p;};
 function select(ids,{limit=50,cursor=null}={}){
  check(Number.isSafeInteger(limit)&&limit>=1&&limit<=100);let offset=0;
  if(cursor!==null){check(typeof cursor==='string'&&/^[0-9]+:[0-9]+$/.test(cursor));const [r,n]=cursor.split(':').map(Number);check(r===revision&&Number.isSafeInteger(n)&&n<=ids.length);offset=n;}
  const selected=ids.slice(offset,offset+limit),next=offset+selected.length;
  return {posts:selected.map(id=>visible(state.posts.get(id))),nextCursor:next<ids.length?`${revision}:${next}`:null,revision};
 }
 return {stage,get postCount(){return state.order.length;},
  page(limit=50,upper=null,before=null){check(Number.isSafeInteger(limit)&&limit>=1&&limit<=100);const bound=v=>{check(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v));return BigInt(v);};
   let ids=[...state.order].reverse().filter(id=>(upper===null||BigInt(state.posts.get(id).order)<=bound(upper))&&(before===null||BigInt(state.posts.get(id).order)<bound(before)));
   const posts=ids.slice(0,limit).map(id=>visible(state.posts.get(id))),needed=new Set([state.version,...posts.map(p=>p.mainVersion),...posts.filter(p=>p.removal).map(p=>String(BigInt(p.removal.policy)&0xffffffffn))]);return {posts,policies:[...needed].filter(v=>state.policies.has(v)).map(v=>copy(state.policies.get(v))),hasMore:ids.length>limit};},
  feed:options=>select([...state.order].reverse(),options),
  thread(root,options){check(state.posts.get(root)?.record.root===root);return select(state.order.filter(id=>state.posts.get(id).record.root===root),options);},
  profile(nameId,options){check(state.names.has(nameId));return {...select([...state.order].reverse().filter(id=>state.posts.get(id).record.name_id===nameId),options),identity:copy(state.names.get(nameId))};},
  directory({query='',limit=50,cursor=null}={}){check(typeof query==='string'&&query.length<=120&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100);const q=query.trim().toLowerCase(),boards=[...state.boards.values()].filter(b=>[b.slug,b.name,b.description].some(v=>v.toLowerCase().includes(q))).sort((a,b)=>a.slug<b.slug?-1:a.slug>b.slug?1:0);
   let start=0;if(cursor!==null){check(typeof cursor==='string'&&/^[0-9]+:[0-9]+$/.test(cursor));const [r,n]=cursor.split(':').map(Number);check(r===revision&&Number.isSafeInteger(n)&&n<=boards.length);start=n;}
   return {boards:boards.slice(start,start+limit).map(b=>({...copy(b),mainVersion:state.version,mainRules:state.policies.get(state.version)?.text})),nextCursor:start+limit<boards.length?`${revision}:${start+limit}`:null,revision};},
  post(id){const p=state.posts.get(id);return p?visible(p):null;},
 };
}
