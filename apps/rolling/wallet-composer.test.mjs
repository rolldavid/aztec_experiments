// Labelled DOM and session doubles. No browser, crypto, RPC or real account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRollingWalletPanel} from './wallet-panel.mjs';
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
 const old={document:globalThis.document,Node:globalThis.Node,fetch:globalThis.fetch};Object.assign(globalThis,{document,Node:Element,fetch:async()=>new Response(JSON.stringify({schemaVersion:1,complete:true,scope:{chainId:'31337',rollupVersion:'1',boardAddress:'0x'+'1'.repeat(64)},boardId:'0',board:null,mainPolicy:{version:'1',text:''}}),{headers:{'content-type':'application/json'}})});
 t.after(()=>Object.assign(globalThis,old));return document;
}
async function fixture(t,{fee='fee-ready',defaults={type:'post'}}={}){
 const document=dom(t),balance=Promise.withResolvers(),started=Promise.withResolvers(),account={};let reads=0,prepared=null;
 const session={bokConfigured:true,busy:false,topup:{bok:{}},application:{
  readAccountStatus:async()=>({status:fee,depositIds:['9']}),ownedIdentities:async()=>({identities:[],records:[],nextCursor:null}),readModeratorStatus:async()=>({authorized:false}),
  readBokStatus(){reads++;started.resolve();return balance.promise;},async prepare(action){prepared=action;throw Error('stop at authoritative preparation boundary');}
 }};
 const runtime={getAccount:()=>account,account:{configure(){}},createSession:async()=>session};
 const panel=mountRollingWalletPanel({loadRuntime:async()=>runtime});const host=document.createElement('section');document.body.append(host);panel.attachBokControls(host);panel.open(defaults);
 await document.until(()=>document.querySelector('textarea')&&document.querySelector('dialog').getAttribute('aria-busy')==='false');
 return {document,panel,host,balance,started,reads:()=>reads,prepared:()=>prepared};
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
