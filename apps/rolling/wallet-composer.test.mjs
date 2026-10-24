import {executeRollingAction} from './wallet-action.mjs';
// Labelled DOM and session doubles. No browser, crypto, RPC or real account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRollingWalletPanel,runTopupPayment,compactAmount,fundingProgressMessage} from './wallet-panel.mjs';
function dom(t){
 let document;const observers=new Set(),changed=()=>{for(const fn of observers)fn();};
 class Element{
  static TEXT_NODE=3;
  constructor(tag,text=''){this.tagName=tag.toUpperCase();this.nodeType=tag==='#text'?3:1;this._text=text;this.childNodes=[];this.attributes=new Map();this.dataset={};this.events=new Map();this.disabled=false;this.hidden=false;this.value='';}
  get children(){return this.childNodes.filter(n=>n.nodeType===1);} get parentElement(){return this.parentNode;} get nextSibling(){const list=this.parentNode?.childNodes??[];return list[list.indexOf(this)+1]??null;}
  get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}get options(){return this.children.filter(n=>n.tagName==='OPTION');}get labels(){return this.parentNode?.tagName==='LABEL'?[this.parentNode]:[];}
  get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}set textContent(v){this.replaceChildren();this._text=String(v);changed();}
  setAttribute(k,v){this.attributes.set(k,String(v));if(k==='class')this.className=v;if(k==='hidden')this.hidden=true;if(k==='value')this.value=String(v);changed();}
  getAttribute(k){return this.attributes.get(k)??null;}removeAttribute(k){this.attributes.delete(k);if(k==='hidden')this.hidden=false;changed();}
  append(...items){for(let item of items){if(!(item instanceof Element))item=new Element('#text',String(item));item.remove();item.parentNode=this;this.childNodes.push(item);}changed();}
  replaceChildren(...items){for(const n of this.childNodes)n.parentNode=null;this.childNodes=[];this._text='';this.append(...items);}
  insertBefore(item,next){if(!next)return this.append(item);item.remove();item.parentNode=this;this.childNodes.splice(this.childNodes.indexOf(next),0,item);changed();}
  remove(){if(this.parentNode){const p=this.parentNode;p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentNode=null;changed();}}
  contains(n){return n===this||this.childNodes.some(child=>child.contains(n));}
  matches(selector){selector=selector.trim();if(selector.startsWith(':scope > '))selector=selector.slice(9);
   const attr=selector.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);if(attr){const val=attr[1].startsWith('data-')?this.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??this.getAttribute(attr[1]):this.getAttribute(attr[1]);if(val==null||attr[2]!==undefined&&val!==attr[2])return false;selector=selector.replace(attr[0],'');}
   const parts=selector.split('.');return (!parts[0]||this.tagName===parts[0].toUpperCase())&&parts.slice(1).every(c=>(this.className??'').split(' ').includes(c));
  }
  querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').some(s=>n.matches(s))?[n]:[]),...n.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  addEventListener(type,fn){const list=this.events.get(type)??[];list.push(fn);this.events.set(type,list);}fire(type){for(const fn of this.events.get(type)??[])fn({target:this,preventDefault(){}});}
  focus(){document.activeElement=this;}getClientRects(){return this.hidden?[]:[{}];}scrollIntoView(){}showModal(){this.open=true;}close(){this.open=false;this.fire('close');}reportValidity(){return true;}
 }
 document={createElement:t=>new Element(t),createTextNode:t=>new Element('#text',t),body:new Element('body')};document.activeElement=document.body;
 document.querySelector=s=>document.body.querySelector(s);document.querySelectorAll=s=>document.body.querySelectorAll(s);
 document.until=predicate=>new Promise(resolve=>{const observe=()=>{const value=predicate();if(value){observers.delete(observe);resolve(value);}};observers.add(observe);observe();});
 const old={document:globalThis.document,Node:globalThis.Node,fetch:globalThis.fetch};Object.assign(globalThis,{document,Node:Element,fetch:async()=>new Response(JSON.stringify({schemaVersion:1,complete:true,scope:{chainId:'31337',rollupVersion:'1',boardAddress:'0x'+'1'.repeat(64)},boardId:'0',board:null,mainPolicy:document.rules??{version:'1',text:''}}),{headers:{'content-type':'application/json'}})});
 t.after(()=>Object.assign(globalThis,old));return document;
}
async function fixture(t,{fee='fee-ready',defaults={type:'post'},posting=null,topup=null,profile=false,balanceRead=null}={}){
 const document=dom(t),balance=Promise.withResolvers(),started=Promise.withResolvers(),account={};let reads=0,prepared=null,onProgress;const submissions=[],prepareOptions=[];const core={sessions:0,status:0,names:0,moderator:0};
 const session={postingFeeLimit:'1000000000000000',bokConfigured:true,busy:false,topup:{bok:topup??{}},application:{
  readAccountStatus:async()=>{core.status++;if(core.status>1)await posting?.balanceRefresh?.();return {status:fee,privateFeeCredit:'1000000000000000000',depositIds:['9']};},ownedIdentities:async()=>{core.names++;return {identities:profile?['5']:[],records:profile?[{id:'5',first:'River',last:'Lane'}]:[],nextCursor:null};},readModeratorStatus:async()=>{core.moderator++;return {authorized:false};},
  readPreferenceHead:async()=>({revision:'7'}),readProfile:async({name})=>({name,bioVersion:'3',avatarVersion:'4'}),
  readBokStatus(){reads++;started.resolve();return balanceRead?balanceRead(reads):balance.promise;},async prepare(action,options){prepared=action;prepareOptions.push(options);if(!posting)throw Error('stop at authoritative preparation boundary');await posting.prepare?.();return {intentId:'post-1',action,status:'prepared',maximumFee:'100'};},
  async submitPrepared(id){submissions.push(id);await posting.submit?.(id);return {intentId:id,action:prepared,status:posting.status??'confirmed',...(posting.txHash?{txHash:posting.txHash}:{})};},
  async prepareBokPost(id,options){prepareOptions.push(options);return {intentId:'post-2',action:prepared,status:'prepared',maximumFee:'100'};}
 }};
 session.application.executeAction=(action,options)=>executeRollingAction(session.application,structuredClone(action),options);
 const runtime={getAccount:()=>account,account:{configure(){}},createSession:async options=>{onProgress=options.onProgress;core.sessions++;return session;}};
 const panel=mountRollingWalletPanel({loadRuntime:async()=>runtime,onPublicEffect:()=>posting?.effect?.()});const host=document.createElement('section');document.body.append(host);panel.attachBokControls(host);panel.open(defaults);
 await document.until(()=>(defaults.type?document.querySelector('[data-action-review]'):document.querySelectorAll('button').find(b=>b.textContent==='Write a post'))&&document.querySelector('dialog').getAttribute('aria-busy')==='false');
 return {document,panel,host,balance,started,progress:value=>onProgress(value),reads:()=>reads,prepared:()=>prepared,submissions,prepareOptions,core:()=>({...core})};
}
test('typing @bok and editing/removing it stays immediate while a shared balance read is pending',{timeout:3000},async t=>{
 const f=await fixture(t);await f.started.promise;const editor=f.document.querySelector('textarea'),dialog=f.document.querySelector('dialog');
 editor.value='Hello @bok, help with this';editor.fire('input');
 assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.disabled,false);assert.equal(dialog.getAttribute('aria-busy'),'false');
 assert.equal(f.document.querySelector('.bok-invitation').hidden,false);assert.equal(f.document.querySelector('[data-action-review]').disabled,true);assert.equal(f.reads(),1);
 editor.value='Hello @bok, keep my latest draft';editor.fire('input');assert.equal(editor.value,'Hello @bok, keep my latest draft');
 editor.value='A normal post';editor.fire('input');assert.equal(f.document.querySelector('.bok-invitation').hidden,true);assert.equal(editor.disabled,false);
 editor.value='@bok this draft is still editable';editor.fire('input');f.balance.resolve({available:true,availableCredit:'1000000'});
 await f.document.until(()=>f.host.textContent.includes('1 USDC available'));
 assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.value,'@bok this draft is still editable');assert.equal(f.reads(),1);
 assert.equal(f.document.querySelector('input[type=checkbox]'),null);assert(f.host.textContent.includes('Add credit'));
});
test('reopening a composer refreshes refunded Bok credit without replacing the draft or loading the account',{timeout:3000},async t=>{
 const refund=Promise.withResolvers();
 const f=await fixture(t,{balanceRead:count=>count===1?Promise.resolve({available:true,availableCredit:'326486'}):refund.promise});
 await f.document.until(()=>f.host.textContent.includes('0.326486 USDC available'));const before=f.core();
 assert.equal(f.panel.close(),true);f.panel.open({type:'reply',parent:'10',root:'1',subboard:'0'});
 const editor=f.document.querySelector('textarea');editor.value='@bok keep my edited reply';editor.fire('input');
 const budget=f.document.querySelector('.bok-invitation').querySelector('input');budget.value='0.5';budget.fire('input');
 assert.equal(editor.disabled,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');
 assert.equal(f.document.querySelector('[data-action-review]').disabled,true);assert(f.host.textContent.includes('0.326486 USDC available · updating'));
 await Promise.resolve();assert.equal(f.reads(),2);assert.deepEqual(f.core(),before);
 editor.value+=' while the balance updates';editor.fire('input');assert.equal(f.reads(),2);
 refund.resolve({available:true,availableCredit:'709008'});
 await f.document.until(()=>f.host.textContent.includes('0.709008 USDC available'));assert.equal(f.document.querySelector('[data-action-review]').disabled,false);
 assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.value,'@bok keep my edited reply while the balance updates');
 assert.equal(budget.value,'0.5');assert(f.host.textContent.includes('0.709008 USDC available'));assert.equal(f.reads(),2);assert.deepEqual(f.core(),before);
});
test('account-page Write a post also refreshes credit without reopening the account',{timeout:3000},async t=>{
 const refund=Promise.withResolvers();
 const f=await fixture(t,{defaults:{},balanceRead:count=>count===1?Promise.resolve({available:true,availableCredit:'3'}):refund.promise});
 await f.document.until(()=>f.host.textContent.includes('0.000003 USDC available'));const before=f.core();
 f.document.querySelectorAll('button').find(b=>b.textContent==='Write a post').fire('click');
 const editor=f.document.querySelector('textarea');assert(editor);assert.equal(editor.disabled,false);
 await Promise.resolve();assert.equal(f.reads(),2);assert.deepEqual(f.core(),before);
 refund.resolve({available:true,availableCredit:'7'});await f.document.until(()=>f.host.textContent.includes('0.000007 USDC available'));
 assert.equal(f.document.querySelector('textarea'),editor);assert.deepEqual(f.core(),before);
});
test('basic signup does not start optional Bok work',{timeout:3000},async t=>{
 const f=await fixture(t,{fee:'collateral-pending'});assert.equal(f.reads(),0);assert.equal(f.document.querySelector('textarea').disabled,false);
});
test('failed optional balance leaves ordinary posting editable and displays its own unavailable status',{timeout:3000},async t=>{
 const f=await fixture(t);await f.started.promise;const editor=f.document.querySelector('textarea');editor.value='A normal message';editor.fire('input');f.balance.reject(Error('private diagnostic'));
 await f.document.until(()=>f.host.textContent.includes('Balance unavailable'));
 assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.disabled,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');assert(!f.document.body.textContent.includes('private diagnostic'));
});

test('mention preparation retains reply ancestry and the exact edited budget; it never sends',{timeout:3000},async t=>{
 const f=await fixture(t,{defaults:{type:'reply',parent:'10',root:'1',subboard:'0'}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'1000000'});
 await f.document.until(()=>f.host.textContent.includes('1 USDC available'));
 const editor=f.document.querySelector('textarea');editor.value='@bok keep this reply';editor.fire('input');
 const budgetInput=f.document.querySelector('.bok-invitation').querySelector('input');budgetInput.value='0.10';budgetInput.fire('input');
 const review=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});review.fire('click');
 await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.prepared().type,'bok');assert.equal(f.prepared().content,'@bok keep this reply');assert.equal(f.prepared().budget,'100000');assert.equal(f.prepared().parent,'10');assert.equal(f.prepared().root,'1');assert.equal(f.prepared().subboard,'0');
});

test('main-page credit action is available without a balance dialog and preserves the compose draft',{timeout:3000},async t=>{
 const f=await fixture(t);await f.started.promise;const editor=f.document.querySelector('textarea');editor.value='@bok preserve this while I add credit';editor.fire('input');
 assert.equal(f.panel.close(),true);const add=f.host.querySelectorAll('button').find(b=>b.textContent==='Add credit');assert(add);add.fire('click');
 assert.equal(f.document.querySelector('dialog').open,true);const back=f.document.querySelectorAll('button').find(b=>b.textContent==='Back to your post');assert(back);back.fire('click');
 assert.equal(f.document.querySelector('textarea').value,'@bok preserve this while I add credit');assert.equal(f.reads(),1);f.balance.resolve({available:true,availableCredit:'0'});
});

test('existing deposited account can read Bok balance even when its posting credit is empty',{timeout:3000},async t=>{
 const f=await fixture(t,{fee:'fee-needed'});await f.started.promise;assert.equal(f.reads(),1);f.balance.resolve({available:true,availableCredit:'8'});
 await f.document.until(()=>f.host.textContent.includes('0.000008 USDC available'));
});

test('opening and reopening the social composer reuses the unlocked session while optional balance is pending',{timeout:3000},async t=>{
 const f=await fixture(t,{defaults:{}});await f.started.promise;const before=f.core();
 const write=f.document.querySelectorAll('button').find(b=>b.textContent==='Write a post');write.fire('click');
 const editor=f.document.querySelector('textarea');assert(editor);assert.equal(editor.disabled,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');assert.deepEqual(f.core(),before);
 assert.equal(f.panel.close(),true);f.panel.open({type:'reply',parent:'10',root:'1',subboard:'0'});
 assert(f.document.querySelector('textarea'));assert.equal(f.document.querySelector('textarea').disabled,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');assert.deepEqual(f.core(),before);assert.equal(f.reads(),1);
 f.balance.resolve({available:true,availableCredit:'0'});
});

function signInFixture(t,{restored=false,restoreGate=null,sessionGate=null,statusGate=null,signInGate=null,status='fee-ready',freshAccount=false}={}){
 const document=dom(t),statusStarted=Promise.withResolvers(),calls={load:0,restore:0,signIn:0,sessions:0,status:0,names:0,moderator:0,signOut:0};let account=null,configured;
 const identity=document.createElement('section');document.body.append(identity);
 const session={busy:false,application:{
  async readAccountStatus(){calls.status++;statusStarted.resolve();if(statusGate){session.busy=true;await statusGate.promise;session.busy=false;}return {status,depositIds:status==='fee-ready'?['9']:[]};},
  async ownedIdentities(){calls.names++;return {identities:[],records:[],nextCursor:null};},
  async readModeratorStatus(){calls.moderator++;return {authorized:false};}
 },async close(){}};
 const runtime={canStartTestAccount:true,startingTestAccount:()=>freshAccount,account:{configure(value){configured=value;},async endSession(){calls.signOut++;account=null;configured.onChange({});}},
  getAccount:()=>account,
  fundingWallets:()=>[{id:'metamask',name:'MetaMask',icon:'data:image/png;base64,AA=='}],
  fundingWalletStatus:()=>({connected:!!account,name:'MetaMask',address:'0x'+'1'.repeat(40)}),
  async restoreAccount(){calls.restore++;if(restoreGate)await restoreGate.promise;if(restored)account={};return restored;},
  async signInWallet(id){assert.equal(id,'metamask');calls.signIn++;if(signInGate)await signInGate.promise;account={};},
  async createSession(){calls.sessions++;if(sessionGate)await sessionGate.promise;return session;}
 };
 const panel=mountRollingWalletPanel({loadRuntime:async()=>{calls.load++;return runtime;}});panel.attachIdentityControls(identity);
 return {document,panel,calls,identity,statusStarted:statusStarted.promise};
}

test('wallet chooser has icons and no password, files, passkey or backup path; one click preserves a reply',{timeout:3000},async t=>{
 const signInGate=Promise.withResolvers(),f=signInFixture(t,{signInGate});
 f.panel.open({accountMode:'signin',type:'reply',parent:'10',root:'1',subboard:'0',content:'Keep my reply'});
 await f.panel.initialize();const chooser=f.document.querySelectorAll('button').find(b=>b.textContent.includes('Connect MetaMask'));
 assert(chooser);assert(chooser.querySelector('img'));assert.equal(f.calls.signIn,0);
 assert.equal(f.document.querySelector('input[type=password]'),null);assert.equal(f.document.querySelector('input[type=file]'),null);
 assert(!/backup|passkey|older account/i.test(f.document.body.textContent));
 chooser.fire('click');chooser.fire('click');
 await f.document.until(()=>f.document.body.textContent.includes('Opening your account…'));signInGate.resolve();
 await f.document.until(()=>f.document.querySelector('textarea')&&f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.calls.signIn,1);assert.equal(f.calls.sessions,1);assert.equal(f.calls.status,1);assert.equal(f.document.querySelector('textarea').value,'Keep my reply');
 assert.equal(f.document.querySelector('h2').textContent,'Reply');
 assert.equal(f.document.querySelector('input[type=password]'),null);assert(!/backup|passkey/i.test(f.document.body.textContent));
});

test('initialize silently restores once, shares one session, and updates main-page identity without opening a dialog',{timeout:3000},async t=>{
 const f=signInFixture(t,{restored:true}),first=f.panel.initialize();assert.equal(f.panel.initialize(),first);
 assert.equal(await first,true);assert.equal(await f.panel.initialize(),true);
 assert.equal(!!f.document.querySelector('dialog').open,false);
 assert.equal(f.calls.load,1);assert.equal(f.calls.restore,1);assert.equal(f.calls.signIn,0);assert.equal(f.calls.sessions,1);assert.equal(f.calls.status,1);
 assert.equal(f.identity.querySelector('select').disabled,false);
 f.panel.open({type:'post',content:'An already signed-in post'});assert.equal(f.document.querySelector('textarea').value,'An already signed-in post');assert.equal(f.calls.sessions,1);assert.equal(f.calls.status,1);
});

test('opening and closing during background restoration stays immediate and keeps the latest requested draft',{timeout:3000},async t=>{
 const restoreGate=Promise.withResolvers(),sessionGate=Promise.withResolvers(),f=signInFixture(t,{restored:true,restoreGate,sessionGate});
 const init=f.panel.initialize();f.panel.open({type:'post',content:'First draft'});
 const dialog=f.document.querySelector('dialog');assert.equal(dialog.open,true);assert.equal(dialog.getAttribute('aria-busy'),'false');assert.equal(f.panel.close(),true);
 f.panel.open({type:'reply',parent:'10',root:'1',subboard:'0',content:'Latest draft'});assert.equal(dialog.open,true);assert.equal(dialog.getAttribute('aria-busy'),'false');
 restoreGate.resolve();sessionGate.resolve();await init;
 assert.equal(f.document.querySelector('textarea').value,'Latest draft');assert.equal(f.document.querySelector('textarea').disabled,false);
 assert.equal(f.calls.signIn,0);assert.equal(f.calls.restore,1);assert.equal(f.calls.sessions,1);assert.equal(f.calls.status,1);
});

test('an unfunded wallet opens posting setup after sign-in without a password or automatic payment',{timeout:3000},async t=>{
 const f=signInFixture(t,{status:'collateral-pending'});f.panel.open({type:'post',content:'My first post'});await f.panel.initialize();
 f.document.querySelectorAll('button').find(b=>b.textContent.includes('Connect MetaMask')).fire('click');
 await f.document.until(()=>f.document.querySelector('h2').textContent==='Set up posting'&&f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.calls.signIn,1);assert.equal(f.calls.sessions,1);assert.equal(f.document.querySelector('input[type=password]'),null);
});


test('closing while background account status owns the SDK remains available',{timeout:3000},async t=>{
 const statusGate=Promise.withResolvers(),f=signInFixture(t,{restored:true,statusGate});
 const init=f.panel.initialize();f.panel.open({type:'post',content:'Preserved during account status'});
 // createSession progress is observed via the actual status method call, not a delay.
 await f.statusStarted;
 assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');assert.equal(f.panel.close(),true);
 statusGate.resolve();await init;assert.equal(!!f.document.querySelector('dialog').open,false);
 assert.equal(f.calls.sessions,1);assert.equal(f.calls.signIn,0);
});

for(const type of ['post','reply','quote','repost'])test(`one ${type} click submits the captured draft once and prevents double clicks`,{timeout:3000},async t=>{
 const hold=Promise.withResolvers(),entered=Promise.withResolvers();
 const defaults={type,subboard:'0',...(type==='reply'?{parent:'10',root:'1'}:{}),...(['quote','repost'].includes(type)?{reference:'12'}:{})};
 const f=await fixture(t,{defaults,posting:{prepare:()=>{entered.resolve();return hold.promise;}}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});
 const editor=f.document.querySelector('textarea');editor.value='My exact message';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});
 assert(!button.textContent.includes('Review'));button.fire('click');button.fire('click');
 assert.equal(button.textContent,'Posting…');assert(button.disabled);await entered.promise;assert.equal(f.submissions.length,0);
 hold.resolve();await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 await f.document.until(()=>f.core().status===2&&f.host.textContent.includes('0 USDC available'));assert.equal(f.reads(),1);
 assert.equal(f.document.querySelector('dialog').open,false);
 assert.deepEqual(f.submissions,['post-1']);assert.deepEqual(f.prepareOptions,[{immediate:true}]);assert.equal(f.prepared().content,'My exact message');assert.equal(f.prepared().type,type);
 if(type==='reply'){assert.equal(f.prepared().parent,'10');assert.equal(f.prepared().root,'1');}
 if(['quote','repost'].includes(type))assert.equal(f.prepared().reference,'12');
});
for(const status of ['authorized','unknown','reverted'])test(`one Bok post click continues only confirmed authorization: ${status}`,{timeout:3000},async t=>{
 let sends=0;const posting={status,submit:()=>{if(++sends===2)posting.status='confirmed';}};
 const f=await fixture(t,{posting});await f.started.promise;f.balance.resolve({available:true,availableCredit:'1000000'});
 await f.document.until(()=>f.host.textContent.includes('1 USDC available'));const editor=f.document.querySelector('textarea');editor.value='@bok please reply';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});assert.equal(button.textContent,'Post');button.fire('click');
 await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 if(status!=='unknown')await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('1 USDC available'));
 assert.equal(f.document.querySelector('dialog').open,status!=='authorized');
 assert.deepEqual(f.submissions,status==='authorized'?['post-1','post-2']:['post-1']);assert(f.prepareOptions.every(o=>o.immediate===true));
});

test('changed displayed rules stop one-click posting before preparation or sending',{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});
 const editor=f.document.querySelector('textarea');editor.value='Do not send under changed rules';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});
 f.document.rules={version:'2',text:'Changed rules'};
 button.fire('click');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.prepared(),null);assert.deepEqual(f.submissions,[]);assert(f.document.body.textContent.includes('Current board rules are unavailable, changed'));
});
test('submission rejection retains the exact draft and unresolved action without a second Post send',{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{submit:()=>{throw Error('ambiguous response');}}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});
 const editor=f.document.querySelector('textarea');editor.value='Keep this exact draft';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});button.fire('click');
 await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.deepEqual(f.submissions,['post-1']);assert.equal(f.document.querySelector('[data-action-review]'),null);assert.equal(f.document.querySelector('[data-action-confirm]'),null);assert(f.document.body.textContent.includes('Keep this exact draft'));
});

test('composer shows two compact fee numbers without extra account reads or review disclaimer',{timeout:3000},async t=>{
 const f=await fixture(t);const summary=f.document.querySelector('.composer-cost');assert(summary);assert.equal(summary.querySelectorAll('strong').length,2);assert(summary.textContent.includes('Balance 1'));assert(summary.textContent.includes('Max cost 0.001'));assert(!f.document.body.textContent.includes('Published content cannot be erased'));
 assert.deepEqual(f.core(),{sessions:1,status:1,names:0,moderator:0});f.balance.resolve({available:true,availableCredit:'0'});
});
test('main name dropdown loads names on request and leaves Create available without signup reads',{timeout:3000},async t=>{
 const f=await fixture(t,{defaults:{}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});const host=f.document.createElement('section');f.document.body.append(host);f.panel.attachIdentityControls(host);
 let select=host.querySelector('select');assert.equal(select.disabled,false);assert(select.options.some(o=>o.value==='create'));assert(select.options.some(o=>o.value==='load'));assert.equal(f.core().names,0);assert.equal(f.core().moderator,0);
 select.value='load';select.fire('change');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.equal(f.core().names,1);assert.equal(f.core().moderator,0);
});
test('moderator discovery runs only when account settings are opened',{timeout:3000},async t=>{
 const f=await fixture(t,{defaults:{}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});assert.equal(f.core().moderator,0);
 const settings=f.document.querySelector('.account-links');settings.open=true;settings.fire('toggle');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.equal(f.core().moderator,1);assert.equal(f.core().names,0);assert.equal(f.document.querySelector('.account-links').open,true);
});

test('confirmed post closes immediately while public feed refresh is still pending',{timeout:3000},async t=>{
 const refresh=Promise.withResolvers(),started=Promise.withResolvers();const f=await fixture(t,{posting:{effect:()=>{started.resolve();return refresh.promise;}}});
 await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});const editor=f.document.querySelector('textarea');editor.value='Confirmed before feed refresh';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});button.fire('click');await started.promise;
 assert.equal(f.document.querySelector('dialog').open,false);await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.deepEqual(f.submissions,['post-1']);
 await f.document.until(()=>f.core().status===2);assert.equal(f.reads(),1);refresh.resolve();
});

test('Bok credit automatically quotes and keeps amount editable, discarding an obsolete price',{timeout:3000},async t=>{
 const gate=Promise.withResolvers(),started=Promise.withResolvers(),quotes=[];let payments=0;
 const cap={ethAvailable:true,defaultPrivateFeeCap:'100',async prepare(input){quotes.push(input);if(quotes.length===1){started.resolve();await gate.promise;}return {...input,phase:'deposit',maximumSwapWei:'2000000000000000'};},async confirm(){payments++;return {};},async advanceClaim(){return {state:'complete'};},async inspect(){return null;}};
 const f=await fixture(t,{topup:cap});await f.started.promise;f.balance.resolve({available:true,availableCredit:'2000000'});await f.document.until(()=>f.host.textContent.includes('2 USDC available'));f.panel.close();f.host.querySelectorAll('button').find(b=>b.textContent==='Add credit').fire('click');await started.promise;
 const amount=f.document.querySelector('input[aria-label="Amount (USD)"]');assert(amount);assert.equal(amount.disabled,false);assert.equal(f.document.querySelector('select[aria-label="Top-up credit"]'),null);assert(!f.document.body.textContent.includes('Review cost'));assert(!f.document.querySelectorAll('button').some(b=>b.textContent==='Continue top-up'));
 amount.value='5';amount.fire('input');amount.fire('change');assert.equal(amount.disabled,false);assert.equal(f.document.querySelector('input[aria-label="Amount (USD)"]'),amount);gate.resolve();
 const pay=await f.document.until(()=>f.document.querySelectorAll('button').find(b=>b.textContent==='Pay'&&!b.disabled&&!b.hidden));assert.deepEqual(quotes.map(q=>q.amount),['1000000','5000000']);assert(f.document.querySelector('.credit-total').textContent.includes('2 USDC'));assert(f.document.querySelector('.credit-total').textContent.includes('0.002 ETH'));
 pay.fire('click');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.equal(payments,1);assert.equal(quotes.length,2);
});
for(const completed of [false,true])test(`failed automatic Bok quote offers price retry without unrelated payment continuation (${completed?'completed payment':'no payment'})`,{timeout:3000},async t=>{
 const cap={ethAvailable:true,defaultPrivateFeeCap:'100',async prepare(){throw Object.assign(Error('PRIVATE_SENTINEL'),{code:'BB_ETH_READ_FAILED'});},async inspect(){return completed?{paymentSaved:true,completed:true}:null;}};
 const f=await fixture(t,{topup:cap});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();f.host.querySelectorAll('button').find(b=>b.textContent==='Add credit').fire('click');
 await f.document.until(()=>f.document.querySelectorAll('button').find(b=>b.textContent==='Refresh price'&&!b.hidden));assert(!f.document.body.textContent.includes('PRIVATE_SENTINEL'));assert(f.document.querySelectorAll('button').find(b=>b.textContent==='Continue payment').hidden);assert(f.document.querySelectorAll('button').find(b=>b.textContent==='Pay').disabled);
});

test('cancelled Bok payment exposes a fresh price without enabling an unquoted resend',{timeout:3000},async t=>{
 const cap={ethAvailable:true,defaultPrivateFeeCap:'100',async prepare(input){return {...input,phase:'deposit',maximumSwapWei:'1000'};},async confirm(){throw Object.assign(Error('cancelled'),{code:'BB_ETH_REQUEST_CANCELLED'});},async inspect(){return null;}};
 const f=await fixture(t,{topup:cap});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();f.host.querySelectorAll('button').find(b=>b.textContent==='Add credit').fire('click');
 const pay=await f.document.until(()=>f.document.querySelectorAll('button').find(b=>b.textContent==='Pay'&&!b.disabled));pay.fire('click');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert(f.document.querySelectorAll('button').find(b=>b.textContent==='Pay').disabled);assert(!f.document.querySelectorAll('button').find(b=>b.textContent==='Refresh price').hidden);assert(f.document.querySelectorAll('button').find(b=>b.textContent==='Continue payment').hidden);
});

test('credit payment errors retain only approved Ethereum diagnostic fields',async()=>{
 for(const safe of [true,false]){const failure=Object.assign(Error('PRIVATE_SENTINEL'),{code:'BB_ETH_PREFLIGHT_FAILED',providerCode:safe?'CALL_EXCEPTION':'PRIVATE_SENTINEL',ethereumStage:safe?'preflight':'PRIVATE_SENTINEL'});
 await assert.rejects(runTopupPayment({confirm:async()=>{throw failure;}},{},{phase:'deposit'}),error=>{assert.equal(error.code,'BB_ETH_PREFLIGHT_FAILED');assert.equal(error.providerCode,safe?'CALL_EXCEPTION':undefined);assert.equal(error.ethereumStage,safe?'preflight':undefined);return true;});}
});

test('compact monetary displays round balances down and payment caps up',()=>{
 assert.equal(compactAmount('1234567890123456789',18,4),'1.2345');
 assert.equal(compactAmount('1234567890123456789',18,4,true),'1.2346');
 assert.equal(compactAmount('1',18,4,true),'0.0001');
 assert.equal(compactAmount('1234567890123456789',18,8,true),'1.2345679');
 assert.equal(compactAmount('1',18,8,true),'0.00000001');
 assert.equal(compactAmount('1000000000000000000',18,8,true),'1');
 for(const amount of ['0','1','9999999999','1234567890123456789','999999999999999999999999'])for(const places of [4,8]){
  const shown=compactAmount(amount,18,places,true),[whole,fraction='']=shown.split('.'),displayed=BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));assert(displayed>=BigInt(amount));
 }
});

for(const action of [{type:'like',post:'42'},{type:'unlike',post:'42'},{type:'preference',kind:1,target:'42',enabled:true},{type:'preference',kind:2,target:'0',enabled:false},{type:'read-marker',thread:'42',throughBlock:'19'}])test(`reader ${action.type} acts once without opening a modal (${action.kind??''})`,{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();
 const result=await f.panel.act(action);await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('0 USDC available'));assert.equal(result.status,'confirmed');assert.equal(f.document.querySelector('dialog').open,false);assert.equal(f.submissions.length,1);assert.deepEqual(f.prepareOptions,[{immediate:true}]);assert.deepEqual(f.prepared(),{...action,...(['preference','read-marker'].includes(action.type)?{expectedRevision:'7'}:{})});
 if(action.type==='preference')assert.equal(f.panel.preferenceEnabled(action.kind,action.target),action.enabled);
});
test('reader action captures target before waiting and blocks double clicks',{timeout:3000},async t=>{
 const gate=Promise.withResolvers(),started=Promise.withResolvers(),f=await fixture(t,{posting:{prepare:()=>{started.resolve();return gate.promise;}}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();
 const action={type:'like',post:'42'},first=f.panel.act(action);action.post='99';await started.promise;assert.deepEqual(await f.panel.act({type:'like',post:'42'}),{status:'blocked',reason:'busy'});assert.equal(f.document.querySelector('dialog').open,false);gate.resolve();assert.equal((await first).status,'confirmed');await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('0 USDC available'));assert.equal(f.prepared().post,'42');assert.equal(f.submissions.length,1);
});
for(const status of ['unknown','reverted'])test(`reader ${status} is not reported as successful or resent automatically`,{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{status}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();assert.equal((await f.panel.act({type:'like',post:'42'})).status,status);assert.equal(f.submissions.length,1);assert.equal(f.document.querySelector('dialog').open,false);
 if(status==='reverted')await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('0 USDC available'));if(status==='unknown'){assert.equal((await f.panel.act({type:'like',post:'42'})).reason,'existing-action');assert.equal(f.submissions.length,1);}
});
test('missing posting credit opens setup without sending the reader action',{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{},fee:'fee-needed'});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();assert.deepEqual(await f.panel.act({type:'like',post:'42'}),{status:'blocked',reason:'setup'});assert.equal(f.submissions.length,0);assert.equal(f.document.querySelector('dialog').open,true);
});
for(const type of ['name','bio','avatar'])test(`one ${type} save creates and submits exact edited action`,{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{},profile:true,defaults:{type,name:'5'}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));
 if(type==='name'){const inputs=f.document.querySelectorAll('input').filter(n=>n.getAttribute('type')==='text');inputs[0].value='River';inputs[0].fire('input');inputs[1].value='Moss';inputs[1].fire('input');}
 else if(type==='bio'){const input=f.document.querySelector('textarea');input.value='My exact bio';input.fire('input');}
 else f.document.querySelectorAll('button').find(b=>b.textContent==='Clear avatar').fire('click');
 const save=f.document.querySelector('[data-action-review]');assert(!save.textContent.includes('Review'));assert.equal(save.disabled,false);save.fire('click');await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.equal(f.submissions.length,1);assert.deepEqual(f.prepareOptions,[{immediate:true}]);assert.equal(f.document.querySelector('dialog').open,false);
 await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('0 USDC available'));if(type==='bio')assert.deepEqual(f.prepared(),{type,name:'5',expectedVersion:'3',content:'My exact bio'});if(type==='avatar')assert.deepEqual(f.prepared(),{type,name:'5',expectedVersion:'4',width:0,height:0,data:''});
});

test('a confirmed bookmark allows the next explicit inverse action without a modal',{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{}});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();
 assert.equal((await f.panel.act({type:'preference',kind:1,target:'42',enabled:true})).status,'confirmed');assert.equal(f.panel.preferenceEnabled(1,'42'),true);
 assert.equal((await f.panel.act({type:'preference',kind:1,target:'42',enabled:false})).status,'confirmed');assert.equal(f.panel.preferenceEnabled(1,'42'),false);assert.equal(f.submissions.length,2);assert.equal(f.document.querySelector('dialog').open,false);await f.document.until(()=>f.reads()>=3&&f.host.textContent.includes('0 USDC available'));
});

test('funding progress only reports confirmed payment after reaching the private-credit stages',()=>{
 assert.equal(fundingProgressMessage({step:'recover',state:'started'}),'Waiting for your payment to confirm…');
 assert(!fundingProgressMessage({step:'recover',state:'complete'}).includes('Payment confirmed'));
 assert.equal(fundingProgressMessage({step:'prepare',state:'started'}),'Payment confirmed. Adding your posting balance on Aztec…');
 assert.equal(fundingProgressMessage({step:'prepare',state:'started'},'bok'),'Payment confirmed. Adding your Bok credit on Aztec…');
 assert.equal(fundingProgressMessage({step:'reconcile',state:'started'},'bok'),'Waiting for your Bok credit to confirm…');
 assert(!fundingProgressMessage({step:'prepare',state:'failed'},'bok').includes('Payment confirmed'));
});
test('Bok continuation replaces stale Ethereum notice with the observed credit stage',{timeout:3000},async t=>{
 let f;const gate=Promise.withResolvers(),started=Promise.withResolvers();
 const cap={ethAvailable:true,defaultPrivateFeeCap:'100',async prepare(input){return {...input,phase:'deposit',maximumSwapWei:'1000'};},async confirm(){return {};},async inspect(){return null;},async advanceClaim(){started.resolve();await gate.promise;return {state:'complete'};}};
 f=await fixture(t,{topup:cap});await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));f.panel.close();f.host.querySelectorAll('button').find(b=>b.textContent==='Add credit').fire('click');
 const pay=await f.document.until(()=>f.document.querySelectorAll('button').find(b=>b.textContent==='Pay'&&!b.disabled));pay.fire('click');await started.promise;
 const stale=f.document.createElement('p');stale.setAttribute('data-operation-feedback','');stale.textContent='Payment submitted. Waiting for confirmation…';f.document.querySelector('dialog').append(stale);
 // Put the existing notice in the rendered content container, as fundingView does.
 f.document.querySelector('.credit-total').parentElement.append(stale);
 f.progress({stage:'funding-claim',step:'prepare',deploymentStep:null,state:'started',code:null});
 assert(!f.document.body.textContent.includes('Payment submitted. Waiting for confirmation'));assert(f.document.body.textContent.includes('Payment confirmed. Adding your Bok credit on Aztec…'));
 f.progress({stage:'submitting'});assert(f.document.body.textContent.includes('Adding your Bok credit…'));assert(!f.document.body.textContent.includes('Sending your action'));
 f.progress({stage:'proof-progress'});assert(f.document.body.textContent.includes('Adding your Bok credit…'));assert(!f.document.body.textContent.includes('Loading your account…'));
 f.progress({stage:'proving'});assert(f.document.body.textContent.includes('Preparing your Bok credit…'));
 gate.resolve();await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');await f.document.until(()=>f.reads()>=2&&f.host.textContent.includes('0 USDC available'));
});

test('explicit fresh account route opens wallet selection and continues into unfunded onboarding',async t=>{
 const f=signInFixture(t,{freshAccount:true,status:'collateral-pending'});await f.panel.initialize();
 assert.equal(f.document.querySelector('dialog').open,true);
 assert(f.document.body.textContent.includes('start a new test account with an empty posting balance'));
 const connect=f.document.querySelectorAll('button').find(b=>b.textContent.includes('Connect MetaMask'));assert(connect);connect.fire('click');
 await f.document.until(()=>f.calls.status===1&&f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.calls.signIn,1);assert.equal(f.calls.sessions,1);assert(!f.document.body.textContent.includes('Recover the existing deposit'));
});

test('fresh account action reloads the existing page with a client-side route',async t=>{
 const f=signInFixture(t);const old=globalThis.location,location={hash:'#/home',reloads:0,reload(){this.reloads++;}};globalThis.location=location;t.after(()=>{globalThis.location=old;});
 await f.panel.initialize();f.panel.open();const start=f.document.querySelectorAll('button').find(b=>b.textContent==='Start new test account');assert(start);start.fire('click');assert.equal(location.hash,'#/new-account');assert.equal(location.reloads,1);
});


test('confirmed post releases UI while balance refresh runs; typing survives its completion',{timeout:3000},async t=>{
 const pending=Promise.withResolvers(),started=Promise.withResolvers();const f=await fixture(t,{posting:{balanceRefresh:()=>{started.resolve();return pending.promise;}}});
 await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});await f.document.until(()=>f.host.textContent.includes('0 USDC available'));const editor=f.document.querySelector('textarea');editor.value='First post';editor.fire('input');f.document.querySelector('[data-action-review]').fire('click');
 await started.promise;await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');assert.equal(f.document.querySelector('dialog').open,false);
 f.panel.open({type:'post'});const next=f.document.querySelector('textarea');next.value='Next draft while balance updates';next.fire('input');assert(f.document.body.textContent.includes('Balance (updating)'));
 pending.resolve();await f.document.until(()=>!f.document.body.textContent.includes('Balance (updating)'));
 assert.equal(f.document.querySelector('textarea'),next);assert.equal(next.value,'Next draft while balance updates');assert.equal(f.submissions.length,1);
});

const ownBokHash='0x'+'a'.repeat(64);
const publicBokParent=(reply=null)=>({id:'20',position:{txHash:ownBokHash},invocation:{pluginId:'7',requestId:'91',reply}});
async function postedBokFixture(t,{balanceRead,posting={}}={}){
 const f=await fixture(t,{balanceRead:balanceRead??(()=>Promise.resolve({available:true,availableCredit:'582972'})),posting:{txHash:ownBokHash,...posting}});
 await f.document.until(()=>f.host.textContent.includes('0.582972 USDC available'));
 const editor=f.document.querySelector('textarea');editor.value='@bok make the change';editor.fire('input');
 const budget=f.document.querySelector('.bok-invitation').querySelector('input');budget.value='0.25';budget.fire('input');
 f.document.querySelector('[data-action-review]').fire('click');
 await f.document.until(()=>!f.document.querySelector('dialog').open&&f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 return f;
}
test('live own Bok reply refreshes refunded credit without private reads for unrelated posts or draft replacement',{timeout:3000},async t=>{
 const refund=Promise.withResolvers();
 const f=await postedBokFixture(t,{balanceRead:count=>count<=2?Promise.resolve({available:true,availableCredit:'582972'}):refund.promise});
 await f.document.until(()=>f.reads()===2&&f.host.textContent.includes('0.582972 USDC available')&&!f.host.textContent.includes('updating'));
 const before=f.core();f.panel.observePublicPosts([publicBokParent()]);
 f.panel.observePublicPosts([{id:'30',bot:{pluginId:'7',requestId:'999'},position:{txHash:'0x'+'b'.repeat(64)}}]);
 await Promise.resolve();assert.equal(f.reads(),2);
 f.panel.observePublicPosts([publicBokParent('21')]);
 await Promise.resolve();assert.equal(f.reads(),3);assert(f.host.textContent.includes('0.582972 USDC available · updating'));
 f.panel.open({type:'reply',parent:'20',root:'20'});const editor=f.document.querySelector('textarea');editor.value='Draft stays editable';editor.fire('input');
 f.panel.observePublicPosts([publicBokParent('21'),{id:'21',bot:{pluginId:'7',requestId:'91'}}]);
 refund.resolve({available:true,availableCredit:'790268'});
 await f.document.until(()=>f.host.textContent.includes('0.790268 USDC available'));
 assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.value,'Draft stays editable');assert.equal(editor.disabled,false);assert.deepEqual(f.core(),before);
});
test('own reply arriving during post balance refresh is queued once and consumed after existing work finishes',{timeout:3000},async t=>{
 const account=Promise.withResolvers(),refund=Promise.withResolvers(),reading=Promise.withResolvers();
 const f=await postedBokFixture(t,{posting:{balanceRefresh:()=>account.promise},balanceRead:count=>{if(count===1)return Promise.resolve({available:true,availableCredit:'582972'});reading.resolve();return refund.promise;}});
 f.panel.observePublicPosts([publicBokParent()]);
 f.panel.observePublicPosts([{id:'21',bot:{pluginId:'7',requestId:'91'}}]);
 f.panel.observePublicPosts([{id:'21',bot:{pluginId:'7',requestId:'91'}}]);
 await Promise.resolve();assert.equal(f.reads(),1);
 account.resolve();await reading.promise;assert.equal(f.reads(),2);
 refund.resolve({available:true,availableCredit:'790268'});
 await f.document.until(()=>f.host.textContent.includes('0.790268 USDC available'));await Promise.resolve();assert.equal(f.reads(),2);
});
test('own settlement during an older balance read gets one fresh read after it settles',{timeout:3000},async t=>{
 const old=Promise.withResolvers(),reading=Promise.withResolvers();
 const f=await postedBokFixture(t,{balanceRead:count=>{if(count===1)return Promise.resolve({available:true,availableCredit:'582972'});if(count===2){reading.resolve();return old.promise;}return Promise.resolve({available:true,availableCredit:'790268'});}});
 await reading.promise;f.panel.observePublicPosts([publicBokParent()]);f.panel.observePublicPosts([publicBokParent('21')]);f.panel.observePublicPosts([publicBokParent('21')]);
 assert.equal(f.reads(),2);old.resolve({available:true,availableCredit:'582972'});
 await f.document.until(()=>f.host.textContent.includes('0.790268 USDC available'));await Promise.resolve();assert.equal(f.reads(),3);
 f.panel.observePublicPosts([publicBokParent('21')]);await Promise.resolve();assert.equal(f.reads(),3);
});

for(const homeOnly of [false,true])test(`checkpointed own Bok refund refreshes once after ${homeOnly?'parent-only snapshot':'reply'} promotion`,{timeout:3000},async t=>{
 const f=await postedBokFixture(t,{balanceRead:count=>Promise.resolve({available:true,availableCredit:count<=2?'582972':'790268'})});
 await f.document.until(()=>f.reads()===2&&!f.host.textContent.includes('updating'));
 const before=f.core(),snapshot=number=>({checkpoint:{number:110},confirmationCheckpoint:{number}});
 const rows=confirmation=>[publicBokParent('21'),...(homeOnly?[]:[{id:'21',confirmation,position:{blockNumber:108},bot:{pluginId:'7',requestId:'91'}}])];
 f.panel.observePublicPosts(rows('pending'),snapshot(100));
 f.panel.observePublicPosts(rows('pending'),snapshot(105));
 await Promise.resolve();assert.equal(f.reads(),2);assert(f.host.textContent.includes('0.582972 USDC available'));
 f.panel.observePublicPosts(rows('confirmed'),snapshot(homeOnly?110:108));
 f.panel.observePublicPosts(rows('confirmed'),snapshot(110));
 await f.document.until(()=>f.host.textContent.includes('0.790268 USDC available'));
 assert.equal(f.reads(),3);assert.deepEqual(f.core(),before);
 f.panel.observePublicPosts(rows('confirmed'),snapshot(115));await Promise.resolve();assert.equal(f.reads(),3);
});

test('orphaned pending Bok reply cannot refresh refunded balance; replacement waits for its own confirmation',{timeout:3000},async t=>{
 const f=await postedBokFixture(t);
 await f.document.until(()=>f.reads()===2&&!f.host.textContent.includes('updating'));
 const snapshot=(number,confirmed)=>({checkpoint:{number},confirmationCheckpoint:{number:confirmed}});
 f.panel.observePublicPosts([publicBokParent('21')],snapshot(110,100));
 f.panel.observePublicPosts([publicBokParent()],snapshot(112,110));
 f.panel.observePublicPosts([publicBokParent('22')],snapshot(114,110));
 await Promise.resolve();assert.equal(f.reads(),2);
 f.panel.observePublicPosts([publicBokParent('22')],snapshot(115,112));await Promise.resolve();assert.equal(f.reads(),2);
 f.panel.observePublicPosts([publicBokParent('22')],snapshot(116,114));
 await f.document.until(()=>f.reads()===3&&!f.host.textContent.includes('updating'));
});

const includedPost=(intentId='post-1')=>({stage:'included',intentId,txHash:'0x'+'c'.repeat(64),blockNumber:108,blockHash:'0x'+'d'.repeat(64)});
for(const outcome of ['confirmed','unknown','reverted','error'])test(`regular post inclusion releases composer before ${outcome} while preserving account serialization`,{timeout:3000},async t=>{
 const canonical=Promise.withResolvers(),sending=Promise.withResolvers();let effects=0;
 const f=await fixture(t,{posting:{status:outcome,submit:()=>{sending.resolve();return canonical.promise;},effect:()=>effects++}});
 await f.started.promise;f.balance.resolve({available:true,availableCredit:'1000000'});
 await f.document.until(()=>f.host.textContent.includes('1 USDC available'));
 const editor=f.document.querySelector('textarea');editor.value='Regular post, no assistant';editor.fire('input');
 f.document.querySelector('[data-action-review]').fire('click');await sending.promise;
 const before=f.core();f.progress(includedPost('unrelated'));assert.equal(f.document.querySelector('dialog').open,true);assert.equal(effects,0);
 f.progress({...includedPost(),blockNumber:0});assert.equal(f.document.querySelector('dialog').open,true);
 f.progress(includedPost());await Promise.resolve();
 assert.equal(f.document.querySelector('dialog').open,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'true');
 assert.equal(effects,1);assert.equal(editor.value,'Regular post, no assistant');assert.deepEqual(f.core(),before);assert.equal(f.reads(),1);
 f.progress(includedPost());assert.equal(effects,1);
 assert.deepEqual(await f.panel.act({type:'like',post:'1'}),{status:'blocked',reason:'busy'});
 if(outcome==='confirmed'){
  f.panel.open({type:'post'});assert.equal(f.document.querySelector('dialog').open,true);assert.equal(f.panel.close(),true);f.panel.open({type:'post'});
 }
 if(outcome==='error')canonical.reject(Error('failed checkpoint'));else canonical.resolve();
 await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert.equal(f.document.querySelector('dialog').open,true,'reopened view or subsequent failure remains visible');
 if(outcome==='confirmed')assert.equal(effects,1);else assert(f.document.querySelector('[role=alert]')||f.document.body.textContent.includes('unconfirmed')||f.document.body.textContent.includes('reverted'));
 await new Promise(setImmediate);
});

test('nonposting inclusion never dismisses the account dialog or refreshes the public feed',{timeout:3000},async t=>{
 const canonical=Promise.withResolvers(),sending=Promise.withResolvers();let effects=0;
 const f=await fixture(t,{posting:{submit:()=>{sending.resolve();return canonical.promise;},effect:()=>effects++}});
 await f.started.promise;f.balance.resolve({available:true,availableCredit:'1000000'});
 await f.document.until(()=>f.host.textContent.includes('1 USDC available'));
 const action=f.panel.act({type:'like',post:'10'});await sending.promise;
 f.progress(includedPost());await Promise.resolve();
 assert.equal(f.document.querySelector('dialog').open,true);assert.equal(effects,0);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'true');
 canonical.resolve();await action;await new Promise(setImmediate);
});


const warmHead=(number,hash='1')=>({checkpoint:{number:number+3,hash:'0x'+'f'.repeat(64)},confirmationCheckpoint:{number,hash:'0x'+hash.repeat(64)}});
test('confirmed feed heads warm board and fee reads once while editing and coalesce newer heads',{timeout:3000},async t=>{
 const first=Promise.withResolvers(),second=Promise.withResolvers(),started=[Promise.withResolvers(),Promise.withResolvers()];let refreshes=0;
 const f=await fixture(t,{balanceRead:()=>Promise.resolve({available:true,availableCredit:'0'}),posting:{balanceRefresh:()=>{const index=refreshes++;started[index]?.resolve();return index===0?first.promise:second.promise;}}});
 await f.document.until(()=>f.host.textContent.includes('0 USDC available'));
 const editor=f.document.querySelector('textarea');editor.value='Keep typing';editor.fire('input');
 f.panel.observePublicPosts([],warmHead(10));await started[0].promise;
 assert.equal(editor.disabled,false);assert.equal(f.document.querySelector('dialog').getAttribute('aria-busy'),'false');
 f.panel.observePublicPosts([],warmHead(10));f.panel.observePublicPosts([],warmHead(11));f.panel.observePublicPosts([],warmHead(12));
 assert.equal(refreshes,1);editor.value+=' while syncing';editor.fire('input');
 first.resolve();await started[1].promise;assert.equal(refreshes,2);
 assert.equal(f.panel.close(),true);f.panel.observePublicPosts([],warmHead(13));second.resolve();
 await f.document.until(()=>f.document.querySelector('.composer-cost').textContent.includes('Balance 1'));
 await Promise.resolve();assert.equal(refreshes,2);assert.equal(f.document.querySelector('textarea'),editor);assert.equal(editor.value,'Keep typing while syncing');
 assert.equal(f.core().names,0);assert.equal(f.core().moderator,0);assert.deepEqual(f.submissions,[]);
});

test('prewarming ignores proposed-only progress and noncomposer views, then warms latest head on opening',{timeout:3000},async t=>{
 const entered=Promise.withResolvers(),f=await fixture(t,{defaults:{},balanceRead:()=>Promise.resolve({available:true,availableCredit:'0'}),posting:{balanceRefresh:()=>entered.resolve()}});
 await f.document.until(()=>f.host.textContent.includes('0 USDC available'));
 f.panel.observePublicPosts([],warmHead(20));f.panel.observePublicPosts([],{checkpoint:{number:30,hash:'0x'+'2'.repeat(64)}});
 await Promise.resolve();assert.equal(f.core().status,1);assert.equal(f.panel.close(),true);f.panel.open({type:'reply',parent:'10',root:'1',subboard:'0'});
 await entered.promise;assert.equal(f.core().status,2);
 await f.document.until(()=>f.document.querySelector('.composer-cost').textContent.includes('Balance 1'));
 f.panel.observePublicPosts([],warmHead(20));await Promise.resolve();assert.equal(f.core().status,2);
});

test('Post joins an active warm read without submitting early or refreshing the same head again',{timeout:3000},async t=>{
 const held=Promise.withResolvers(),started=Promise.withResolvers(),f=await fixture(t,{balanceRead:()=>Promise.resolve({available:true,availableCredit:'0'}),posting:{balanceRefresh:()=>{started.resolve();return held.promise;}}});
 await f.document.until(()=>f.host.textContent.includes('0 USDC available'));
 const editor=f.document.querySelector('textarea');editor.value='Post after sync';editor.fire('input');
 f.panel.observePublicPosts([],warmHead(30));await started.promise;
 f.document.querySelector('[data-action-review]').fire('click');await Promise.resolve();assert.equal(f.prepared(),null);assert.deepEqual(f.submissions,[]);
 held.resolve();await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false'&&!f.document.querySelector('dialog').open);
 assert.deepEqual(f.submissions,['post-1']);assert.equal(f.prepared().content,'Post after sync');
});

test('failed warming waits for another checkpoint instead of retrying or disabling the editor',{timeout:3000},async t=>{
 const failed=Promise.withResolvers(),next=Promise.withResolvers();let refreshes=0;
 const f=await fixture(t,{balanceRead:()=>Promise.resolve({available:true,availableCredit:'0'}),posting:{balanceRefresh:()=>{if(++refreshes===1)return failed.promise;next.resolve();}}});
 await f.document.until(()=>f.host.textContent.includes('0 USDC available'));
 f.panel.observePublicPosts([],warmHead(40));await Promise.resolve();failed.reject(Error('private detail'));
 await f.document.until(()=>f.document.querySelector('.composer-cost').textContent.includes('Balance (updating)'));
 for(let i=0;i<4;i++){f.panel.observePublicPosts([],warmHead(40));await Promise.resolve();}
 assert.equal(refreshes,1);assert.equal(f.document.querySelector('textarea').disabled,false);assert(!f.document.body.textContent.includes('private detail'));
 f.panel.observePublicPosts([],warmHead(40,'2'));await next.promise;assert.equal(refreshes,2);
});


test('initial account refresh already warms the observed checkpoint without a duplicate read',{timeout:3000},async t=>{
 const f=signInFixture(t,{restored:true});
 f.panel.observePublicPosts([],warmHead(50));f.panel.open({type:'post',content:'Keep initial draft'});
 await f.panel.initialize();assert.equal(f.calls.status,1);
 f.panel.observePublicPosts([],warmHead(50));await Promise.resolve();assert.equal(f.calls.status,1);
});

test('a bounded fee reservation failure explains the outcome without exposing private errors',{timeout:3000},async t=>{
 const f=await fixture(t,{posting:{prepare:()=>{throw Object.assign(Error('PRIVATE_BALANCE_SENTINEL'),{code:'BB_FEE_RESERVATION_UNAFFORDABLE'});}}});
 await f.started.promise;f.balance.resolve({available:true,availableCredit:'0'});
 const editor=f.document.querySelector('textarea');editor.value='Keep my post';editor.fire('input');
 const button=await f.document.until(()=>{const b=f.document.querySelector('[data-action-review]');return b&&!b.disabled&&b;});button.fire('click');
 await f.document.until(()=>f.document.querySelector('dialog').getAttribute('aria-busy')==='false');
 assert(f.document.body.textContent.includes('A fee estimate could not fit your posting credit. No transaction was sent.'));
 assert(!f.document.body.textContent.includes('PRIVATE_BALANCE_SENTINEL'));assert.deepEqual(f.submissions,[]);assert(f.document.body.textContent.includes('Keep my post'));
});
