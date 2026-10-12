// Synthetic public API responses exercise the real browser renderer. This is
// presentation/accessibility evidence, never chain or wallet acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('.',import.meta.url));
test('public reader: navigation, unsafe content, failure recovery and narrow keyboard menu',async t=>{
 const files=new Set(['live.html','reader.mjs','reader-client.mjs','profile-view.mjs','model.mjs','navigation.mjs','style.css']);let unavailable=false;
 const scope={boardAddress:'0x'+'1'.repeat(64)},identity={id:'7',first:'River',last:'Lane'};
 const post={id:'10',record:{root:'10',parent:'0',reference:'0',kind:'1',subboard:'0',name_id:'7'},text:'A real interface, tested with synthetic public data. [Unsafe](javascript:alert(1)) <script>private()</script>',timestamp:'1791734400',likes:'2',bot:null};
 const later={...post,id:'20',record:{...post.record,parent:'10'},text:'The linked reply is outside the first page.'};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   res.writeHead(unavailable?503:200,{'content-type':'application/json'});
   const kind=url.pathname.slice(5),base={schemaVersion:1,scope,complete:true,checkpoint:{number:3,hash:'public'},revision:'1',names:{'7':identity},boards:{},nextCursor:null};
   res.end(JSON.stringify(kind==='directory'?{...base,boards:[{id:'20',slug:'workshop',name:'Workshop',description:'Build together',mainRules:'Respect people',rules:'Show your work',rejected:false}]}:kind==='profile'?{...base,identity,posts:[post]}:kind==='post'?{...base,post:url.searchParams.get('id')==='20'?later:post}:kind==='home'?{...base,posts:[url.searchParams.has('cursor')?later:post],nextCursor:url.searchParams.has('cursor')?null:'2:1'}:{...base,posts:[post]}));return;
  }
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.addInitScript(()=>{window.IntersectionObserver=undefined;}); // Exercise the accessible manual fallback.
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('article').waitFor();
 assert.equal(await page.locator('article script').count(),0);assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
 await page.setViewportSize({width:1440,height:500});await page.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('#post-20').waitFor();
 await page.locator('#post-20').scrollIntoViewIfNeeded();const savedY=await page.evaluate(()=>scrollY);
 await page.locator('#post-20').getByRole('link',{name:'River Lane',exact:true}).click();await page.getByRole('heading',{name:'River Lane',exact:true}).waitFor();
 await page.goBack();await page.locator('#post-20').waitFor();assert.equal(await page.getByRole('article').count(),2);assert(Math.abs(await page.evaluate(()=>scrollY)-savedY)<3);
 await page.evaluate(()=>location.hash='/thread/10/20');await page.getByRole('heading',{name:'Linked post',exact:true}).waitFor();await page.locator('#post-20').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'post-20');assert.equal(await page.getByRole('article').count(),1);
 await page.getByRole('link',{name:'Read the conversation from the beginning',exact:true}).click();await page.getByRole('heading',{name:'Conversation',exact:true}).waitFor();
 await page.getByRole('link',{name:'View conversation',exact:true}).click();await page.getByRole('heading',{name:'Conversation',exact:true}).waitFor();
 await page.getByRole('link',{name:'Explore subboards',exact:true}).first().click();await page.getByRole('heading',{name:'Workshop',exact:true}).waitFor();
 await page.getByText('Effective rules',{exact:true}).click();assert(await page.getByText('Respect people',{exact:true}).isVisible());
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 assert.equal(await page.locator('.workspace').evaluate(node=>node.inert),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.workspace').evaluate(node=>node.inert),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 unavailable=true;await page.evaluate(()=>location.hash='/home');await page.getByRole('heading',{name:'Conversations are being checked'}).waitFor();
 unavailable=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('#post-20').waitFor();assert.equal(await page.getByRole('article').count(),2);
 await page.keyboard.press('Tab');await page.locator('.skip').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'content');
 if(process.env.ROLLING_READER_SCREENSHOT){await page.screenshot({path:process.env.ROLLING_READER_SCREENSHOT,fullPage:true});}
 assert(requests.some(url=>new URL(url).pathname==='/api/home'));assert(!requests.some(url=>new URL(url).pathname==='/api/feed'));assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith(`http://127.0.0.1:${server.address().port}/`)));assert(requests.every(url=>!url.includes('aztec_bundle')&&!url.includes('/wallet')));
});

// These public records and the action-recorder module are labelled doubles.
// The renderer is real; this checks routing/presentation, never a transaction.
async function socialFixture(t,{wallet='recorder'}={}){
 const files=new Set(['live.html','reader.mjs','reader-client.mjs','profile-view.mjs','model.mjs','navigation.mjs','style.css','avatar-upload.mjs']);
 if(wallet==='real')files.add('wallet-panel.mjs');
 const reason='<img src=x onerror=alert(1)> [unsafe](javascript:alert(1))';
 const record={root:'10',parent:'0',reference:'0',kind:'1',subboard:'0',name_id:'0'};
 const live={id:'10',record,text:'Visible public post',timestamp:'1',likes:'1',mainVersion:'2',localVersion:'0'};
 const removed={...live,id:'11',record:{...record,parent:'10',reference:'9',kind:'2',subboard:'20'},text:'REMOVED_TEXT_SENTINEL',localVersion:'1',removal:{reason,policy:'4294967301'},message:'REMOVED_TEXT_SENTINEL'};
 const rejected={...live,id:'12',record:{...record,subboard:'20'},text:'REJECTED_BOARD_TEXT_SENTINEL',localVersion:'1'};
 const malformed={...live,id:'13',mainVersion:'<script>VERSION_SENTINEL</script>',localVersion:'4294967296',text:null,removal:{reason:'No valid version provided',policy:'18446744073709551616'}};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   res.writeHead(200,{'content-type':'application/json'});
   const board={id:'20',name:'Workshop',slug:'workshop',description:'A public board',mainVersion:'8',mainRules:'Current rules',rules:'Local rules',rejected:true,rejection:{reason,mainVersion:'6'}};
   const data={schemaVersion:1,scope:{boardAddress:'0x'+'1'.repeat(64)},complete:true,checkpoint:{number:3,hash:'public'},revision:'1',names:{},boards:{'20':board},nextCursor:null};
   res.end(JSON.stringify(url.pathname==='/api/directory'?{...data,boards:[board]}:{...data,posts:[live,removed,rejected,malformed]}));return;
  }
  if(url.pathname==='/wallet-panel.mjs'&&wallet==='recorder'){
   res.writeHead(200,{'content-type':'text/javascript'});res.end("export function mountRollingWalletPanel(){return {open(value){(window.recordedActions??=[]).push(value);},close(){}}}");return;
  }
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);
  if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src blob:; base-uri 'none'; form-action 'none'"});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage(),requests=[],errors=[];
 page.on('request',request=>requests.push(new URL(request.url()).pathname));page.on('pageerror',error=>errors.push(error.message));
 t.after(()=>assert.deepEqual(errors,[]));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#post-13').waitFor();return {page,requests,reason};
}

test('labelled social records: removed navigation, literal reasons and distinct authored/removal/current policy provenance',async t=>{
 const {page,requests,reason}=await socialFixture(t);
 const card=page.locator('#post-11');
 assert.equal(await card.getByRole('link',{name:'an earlier post',exact:true}).getAttribute('href'),'#/thread/10/10');
 assert.equal(await card.getByRole('link',{name:'the original post',exact:true}).getAttribute('href'),'#/post/9');
 assert.equal(await card.getByRole('link',{name:'View thread',exact:true}).getAttribute('href'),'#/thread/10');
 assert(await card.getByText('Removal reason: '+reason,{exact:true}).isVisible());
 assert(await card.getByText('Published under policy: parent v2 · local v1',{exact:true}).isVisible());
 assert(await card.getByText('Removal policy: parent v5 · local v1',{exact:true}).isVisible());
 assert(await card.getByText('Subboard rejected under parent policy v6',{exact:true}).isVisible());
 assert(await page.locator('#post-12').getByText('Subboard rejection reason: '+reason,{exact:true}).isVisible());
 assert.equal(await page.locator('#post-13').getByText(/Published under policy|Removal policy/).count(),0);
 assert.equal(await page.locator('article img, article script, article a[href^="javascript:"]').count(),0);
 assert(!(await page.locator('body').innerText()).includes('REMOVED_TEXT_SENTINEL'));assert(!(await page.locator('body').innerText()).includes('REJECTED_BOARD_TEXT_SENTINEL'));assert(!(await page.locator('body').innerText()).includes('VERSION_SENTINEL'));
 for(const id of ['11','12','13']){
  const post=page.locator('#post-'+id);assert.deepEqual(await post.getByRole('button').allTextContents(),['Unlike','Bookmark']);assert.equal(await post.locator('.post-body').count(),0);
 }
 assert.deepEqual(await page.locator('#post-10').getByRole('button').allTextContents(),['Reply','Like','Unlike','Quote','Repost','Bookmark','Subscribe to thread']);
 assert(!requests.some(value=>value.includes('wallet')||value.includes('aztec')));
 await page.locator('#post-10').getByRole('button',{name:'Unlike',exact:true}).click();
 await card.getByRole('button',{name:'Unlike',exact:true}).click();
 await page.waitForFunction(()=>window.recordedActions?.length===2);
 assert.deepEqual(await page.evaluate(()=>window.recordedActions),[{type:'unlike',post:'10'},{type:'unlike',post:'11'}]);
 assert(requests.every(value=>!value.includes('/wallet/')&&!value.includes('owned')&&!value.includes('liked')));
 await page.getByRole('link',{name:'Explore subboards',exact:true}).first().click();await page.getByText('Effective rules',{exact:true}).click();
 assert(await page.getByText('Current parent policy v8',{exact:true}).isVisible());assert(await page.getByText('Subboard rejected under parent policy v6',{exact:true}).isVisible());
});

test('labelled social renderer: unavailable account module announces failure without exposing or sending data',async t=>{
 const {page,requests}=await socialFixture(t,{wallet:'missing'});
 await page.locator('#post-11').getByRole('button',{name:'Unlike',exact:true}).click();
 await page.getByText('Account tools could not load. Reload the page before trying again.',{exact:true}).waitFor();
 assert.equal(await page.locator('#post-11 .post-body').count(),0);
 assert(!requests.some(value=>value.startsWith('/wallet/')));
});

test('real panel opening from removed Unlike stays lazy and sanitizes an unavailable runtime',async t=>{
 const {page,requests}=await socialFixture(t,{wallet:'real'});
 await page.locator('#post-11').getByRole('button',{name:'Unlike',exact:true}).click();
 await page.getByRole('button',{name:'Unlock',exact:true}).waitFor();
 assert(!requests.some(value=>value.startsWith('/wallet/')));
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').innerText(),/could not|failed|unavailable/i);
 assert.equal(requests.filter(value=>value==='/wallet/runtime.mjs').length,1);
 assert(!requests.some(value=>value.includes('sendTx')||value.includes('owned')||value.includes('liked')));
 assert.equal(await page.locator('#post-11 .post-body').count(),0);
});

// Controlled intersection callbacks and synthetic public pages; fetch and DOM
// are real. No wallet, proof or chain acceptance is inferred from these checks.
async function pagingFixture(t,{observer='controlled'}={}){
 const state={calls:[],pending:[],hold:false,mode:'normal',active:0,peak:0};
 const files=new Set(['live.html','reader.mjs','reader-client.mjs','profile-view.mjs','model.mjs','navigation.mjs','style.css']);
 const post=id=>({id:String(id),record:{root:String(id),parent:'0',reference:'0',kind:'1',subboard:'0',name_id:'0'},text:'Public item '+id+'\n'+('Visible public text.\n'.repeat(20)),timestamp:'1',likes:'0'});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   const cursor=url.searchParams.get('cursor');state.calls.push({path:url.pathname,cursor});state.active++;state.peak=Math.max(state.peak,state.active);
   let finished=false;const finish=()=>{if(!finished){finished=true;state.active--;}};res.once('close',finish);
   const respond=()=>{
    const kind=url.pathname.slice(5),base={schemaVersion:1,scope:{boardAddress:'public'},complete:true,checkpoint:{number:3,hash:'public'},revision:'epoch:1',names:{},boards:{},nextCursor:null};
    let body=kind==='directory'?{...base,boards:[]}:{...base,posts:[post(cursor==='next-3'?3:cursor?2:1)],nextCursor:cursor==='next-3'?null:cursor?'next-3':'next-2'};
    if(cursor&&state.mode==='revision')body.revision='epoch:2';
    if(cursor&&state.mode==='duplicate')body.posts=[post(1)];
    if(cursor&&state.mode==='cursor-loop')body.nextCursor=cursor;
    if(cursor&&state.mode==='empty-loop')body.posts=[];
    res.writeHead(cursor&&state.mode==='reorg'?409:200,{'content-type':'application/json'});res.end(JSON.stringify(body));finish();
   };
   if(cursor&&state.hold)state.pending.push(respond);else respond();return;
  }
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{for(const release of state.pending.splice(0))release();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1000,height:500}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 if(observer==='none')await page.addInitScript(()=>{window.IntersectionObserver=undefined;});
 if(observer==='controlled')await page.addInitScript(()=>{
  window.pagingObservers=[];
  window.IntersectionObserver=class{
   constructor(callback,options){this.callback=callback;this.options=options;this.targets=[];this.disconnects=0;window.pagingObservers.push(this);}
   observe(target){this.targets=[target];this.lastTarget=target;}
   unobserve(){this.targets=[];}
   disconnect(){this.disconnects++;this.targets=[];}
   fire(){this.callback([{target:this.lastTarget,isIntersecting:true}]);}
  };
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#post-1').waitFor();
 return {page,state,async fire(times=1){await page.evaluate(n=>{for(let i=0;i<n;i++)window.pagingObservers.at(-1).fire();},times);},async release(){for(const fn of state.pending.splice(0))fn();}};
}
async function until(predicate){const end=Date.now()+2000;while(!predicate()){assert(Date.now()<end,'fixture request did not arrive');await new Promise(resolve=>setTimeout(resolve,5));}}

test('continuous paging serializes repeated intersection and keyboard requests, then retains back position/pages',async t=>{
 const {page,state,fire,release}=await pagingFixture(t);state.hold=true;
 await fire(10);await until(()=>state.pending.length===1);
 assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).isDisabled(),true);
 await fire(10);assert.equal(state.calls.length,2);
 await release();await page.locator('#post-2').waitFor();assert.equal(state.peak,1);
 state.hold=false;const more=page.getByRole('button',{name:'Load more',exact:true});await more.focus();await page.keyboard.press('Enter');await page.locator('#post-3').waitFor();
 assert.equal(await more.count(),0);assert.equal(await page.getByRole('article').count(),3);assert.equal(state.peak,1);
 await page.locator('#post-2').scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);
 await page.locator('#post-2').getByRole('link',{name:'View conversation',exact:true}).click();await page.getByRole('heading',{name:'Conversation',exact:true}).waitFor();
 await page.goBack();await page.locator('#post-3').waitFor();assert.equal(await page.getByRole('article').count(),3);assert(Math.abs(await page.evaluate(()=>scrollY)-y)<3);
 assert.deepEqual(state.calls.filter(c=>c.path==='/api/home').map(c=>c.cursor),[null,'next-2','next-3',null,'next-2','next-3']);
});

for(const mode of ['reorg','revision','duplicate','cursor-loop','empty-loop'])test('continuous paging fails closed on '+mode+' without automatic cursor retry',async t=>{
 const {page,state,fire}=await pagingFixture(t);state.mode=mode;await fire();await page.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('article').count(),1);assert.equal(await page.locator('#post-2').count(),0);assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0);
 await fire(5);assert.equal(state.calls.length,2);assert.equal(await page.evaluate(()=>pagingObservers[0].disconnects),1);
 state.mode='normal';await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Load more',exact:true}).waitFor();
 assert.equal(state.calls.at(-1).cursor,null);await fire();await page.locator('#post-2').waitFor();assert.equal(await page.getByRole('article').count(),2);
});

test('route change and pagehide discard delayed pages and disconnect their observer',async t=>{
 const {page,state,fire,release}=await pagingFixture(t);state.hold=true;await fire();await until(()=>state.pending.length===1);
 await page.getByRole('link',{name:'Explore subboards',exact:true}).first().click();await page.getByRole('heading',{name:'Explore subboards',exact:true}).waitFor();
 await release();await page.evaluate(()=>pagingObservers[0].fire());assert.equal(await page.locator('#post-2').count(),0);assert.equal(await page.evaluate(()=>pagingObservers[0].disconnects),1);
 assert.equal(state.calls.filter(c=>c.cursor).length,1);
 await page.evaluate(()=>location.hash='/home');await page.locator('#post-1').waitFor();await fire();await until(()=>state.pending.length===1);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));await release();await fire(3);
 assert.equal(await page.locator('#post-2').count(),0);assert.equal(await page.evaluate(()=>pagingObservers.at(-1).disconnects),1);
});

test('no IntersectionObserver retains keyboard-only Load more fallback',async t=>{
 const {page,state}=await pagingFixture(t,{observer:'none'});const more=page.getByRole('button',{name:'Load more',exact:true});
 assert.equal(state.calls.length,1);await more.focus();await page.keyboard.press('Enter');await page.locator('#post-2').waitFor();assert.equal(state.calls.length,2);
});

test('native browser intersection loads a page near the end without a button click',async t=>{
 const {page,state}=await pagingFixture(t,{observer:'native'});
 await page.getByRole('button',{name:'Load more',exact:true}).scrollIntoViewIfNeeded();await page.locator('#post-2').waitFor();
 assert.equal(state.peak,1);assert.equal(await page.locator('#post-1').count(),1);assert.equal(await page.locator('#post-2').count(),1);
});

// Labelled board API fixtures exercise the production reader, not chain history.
async function boardFixture(t,{rejected=false}={}){
 const state={calls:[],mode:'normal'},files=new Set(['live.html','reader.mjs','reader-client.mjs','profile-view.mjs','model.mjs','navigation.mjs','style.css']);
 const hostile='<img src=x onerror=alert(1)> Local rules are data';
 const board={id:'20',name:'Workshop',slug:'workshop',description:'Build useful things.',creationVersion:'1',mainVersion:'2',mainRules:'Current parent rules',rules:hostile,rejected,rejection:rejected?{reason:'<script>rejected()</script>',mainVersion:'2'}:null};
 const post=(id,boardId)=>({id,record:{root:id,parent:'0',reference:'0',kind:'1',subboard:boardId,name_id:'0'},text:rejected&&boardId==='20'?null:'Board post '+id,timestamp:'1',likes:'0',mainVersion:'1',localVersion:boardId==='0'?'0':'1'});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   state.calls.push(url.pathname+url.search);const id=url.searchParams.get('id'),cursor=url.searchParams.get('cursor');
   if(url.pathname==='/api/board'&&(id==='999'||state.mode==='unavailable')){res.writeHead(id==='999'?404:503,{'content-type':'application/json'});res.end('{}');return;}
   const base={schemaVersion:1,scope:{boardAddress:'public'},complete:true,checkpoint:{number:3,hash:'public'},revision:'epoch:1',names:{},boards:{'20':{id:'20',name:'Workshop',slug:'workshop'}},nextCursor:null};
   let body=url.pathname==='/api/directory'?{...base,boards:[board]}:{...base,posts:[post('10','0'),post('11','20')]};
   if(url.pathname==='/api/board')body={...base,boardId:id,board:id==='0'?null:board,mainPolicy:{version:'2',digest:'2',text:'Current parent rules'},policies:[{version:'1',digest:'1',text:'Historical parent rules'},{version:'2',digest:'2',text:'Current parent rules'}],posts:[post(cursor?'22':id==='0'?'10':'21',id)],nextCursor:id==='20'&&!cursor?'20:1:1':null};
   if(url.pathname==='/api/board'&&state.mode==='wrong-board')body.boardId='99';
   if(url.pathname==='/api/board'&&state.mode==='foreign-post')body.posts[0].record.subboard='99';
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));return;
  }
  if(url.pathname==='/wallet-panel.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end('export function mountRollingWalletPanel(){return {open(value){(window.boardActions??=[]).push(value);},close(){}}}');return;}
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.addInitScript(()=>{window.IntersectionObserver=undefined;});await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#post-10').waitFor();return {page,state,requests,hostile};
}

test('main and subboard routes use exact board API, contextual composer, directory/post links and canonical paging',async t=>{
 const {page,state,requests,hostile}=await boardFixture(t);
 await page.getByRole('navigation',{name:'Community'}).getByRole('link',{name:'Main board',exact:true}).click();await page.getByRole('heading',{name:'Main board',level:1}).waitFor();await page.locator('[data-board-compose]:not([disabled])').waitFor();
 assert.equal(state.calls.at(-1),'/api/board?id=0&limit=30');await page.getByRole('button',{name:'Write a post',exact:true}).click();await page.waitForFunction(()=>window.boardActions?.length===1);assert.deepEqual(await page.evaluate(()=>boardActions[0]),{type:'post',subboard:'0'});
 await page.getByText('Effective board rules',{exact:true}).click();assert(await page.getByRole('heading',{name:'Current parent rules · v2'}).isVisible());
 await page.getByRole('link',{name:'Explore subboards',exact:true}).first().click();await page.getByRole('link',{name:'Workshop',exact:true}).click();await page.getByRole('heading',{name:'Workshop',level:1}).waitFor();await page.locator('#post-21').waitFor();
 assert.equal(state.calls.at(-1),'/api/board?id=20&limit=30');assert(await page.getByText('Build useful things.',{exact:true}).isVisible());assert(await page.getByText('Created under parent policy v1',{exact:true}).isVisible());
 await page.getByText('Effective board rules',{exact:true}).click();assert(await page.getByText(hostile,{exact:true}).isVisible());assert.equal(await page.locator('main img, main script').count(),0);
 await page.locator('#post-21').getByText('Parent rules at publication · v1',{exact:true}).click();assert(await page.locator('#post-21').getByText('Historical parent rules',{exact:true}).isVisible());
 assert.equal(await page.locator('#post-21').getByRole('link',{name:'Workshop',exact:true}).getAttribute('href'),'#/board/20');
 await page.getByRole('button',{name:'Write a post',exact:true}).click();await page.waitForFunction(()=>window.boardActions?.length===2);assert.deepEqual(await page.evaluate(()=>boardActions[1]),{type:'post',subboard:'20'});
 await page.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('#post-22').waitFor();assert.equal(state.calls.at(-1),'/api/board?id=20&limit=30&cursor=20%3A1%3A1');assert.equal(await page.locator('.feed article').count(),2);assert.equal(await page.locator('#post-10').count(),0);
 assert(!state.calls.some(c=>c.startsWith('/api/feed')));assert(!requests.some(p=>p.startsWith('/wallet/')||p.includes('owned')));
});

test('rejected board remains discoverable and navigable without new posting controls',async t=>{
 const {page}=await boardFixture(t,{rejected:true});await page.evaluate(()=>location.hash='/board/20');await page.getByRole('heading',{name:'Workshop',level:1}).waitFor();
 assert(await page.getByText('Rejection reason: <script>rejected()</script>',{exact:true}).isVisible());assert.equal(await page.locator('main script').count(),0);assert(await page.getByRole('button',{name:'Write a post',exact:true}).isDisabled());
 const card=page.locator('#post-21');assert.deepEqual(await card.getByRole('button').allTextContents(),['Unlike','Bookmark']);assert.equal(await card.locator(':scope > .post-body').count(),0);assert(!(await card.innerText()).includes('Board post 21'));assert.equal(await card.getByRole('link',{name:'View thread',exact:true}).getAttribute('href'),'#/thread/21');
 await page.getByText('Parent rules at rejection · v2',{exact:true}).click();assert(await page.getByText('Current parent rules',{exact:true}).last().isVisible());
 await card.getByRole('button',{name:'Unlike',exact:true}).click();await page.waitForFunction(()=>window.boardActions?.length===1);assert.deepEqual(await page.evaluate(()=>boardActions[0]),{type:'unlike',post:'21'});
});

for(const mode of ['wrong-board','foreign-post','unavailable'])test('board route fails closed for '+mode+' before exposing contextual posting',async t=>{
 const {page,state}=await boardFixture(t);state.mode=mode;await page.evaluate(()=>location.hash='/board/20');await page.getByRole('alert').waitFor();
 assert.equal(await page.locator('.feed article').count(),0);assert(await page.getByRole('button',{name:'Write a post',exact:true}).isDisabled());assert.equal(await page.locator('#post-21').count(),0);
});

test('unknown or malformed board route has no generic-feed fallback',async t=>{
 const {page,state}=await boardFixture(t);await page.evaluate(()=>location.hash='/board/999');await page.getByRole('heading',{name:'Board not found',exact:true}).waitFor();const count=state.calls.length;
 await page.evaluate(()=>location.hash='/board/20/extra');await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();assert.equal(state.calls.length,count);assert(await page.getByRole('button',{name:'Write a post',exact:true}).isDisabled());
});

// Labelled private-session/public-HTTP doubles, real panel/reader/pure filter.
// No proof, paid action or encrypted-chain recovery is represented by this fixture.
async function privateViewFixture(t,{mutation=null}={}){
 const files=new Set(['live.html','reader.mjs','reader-client.mjs','profile-view.mjs','model.mjs','navigation.mjs','style.css','avatar-upload.mjs','wallet-panel.mjs']);
 const scope={chainId:'31337',rollupVersion:'1',boardAddress:'0x'+'1'.padStart(64,'0')},hash='0x'+'a'.repeat(64);
 const make=(id,block)=>({id,record:{root:'10',parent:id==='10'?'0':'10',reference:'0',kind:'1',subboard:'0',name_id:'0'},text:'Public content '+id,timestamp:'1',likes:'0',position:{blockNumber:String(block),txIndexWithinBlock:'0',logIndexWithinTx:'0',blockHash:hash}});
 const requests=[],feed=[],state={hold:false,pending:[]};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
  if(url.pathname.startsWith('/api/')){
   const next=url.searchParams.has('cursor');if(url.pathname==='/api/feed')feed.push(url.pathname+url.search);
   const posts=next?[make(mutation==='duplicate'?'10':'11',mutation==='order'?4:2)]:[make('10',3)];
   const data={schemaVersion:1,scope,complete:true,checkpoint:{number:4,hash},revision:mutation==='snapshot'&&next?'changed':'one',names:{},boards:{},posts,nextCursor:next?null:'page2'};
   if(state.hold&&url.pathname==='/api/feed')await new Promise(resolve=>state.pending.push(resolve));
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
  }
  if(url.pathname==='/wallet/runtime.mjs'){
   res.writeHead(200,{'content-type':'text/javascript'});res.end(`import {selectPrivateViews} from '/private-views.mjs';
const raw={},prefs={scope:{chainId:'31337',version:'1',board:'1'},head:{schema:1,initialized:true,revision:'2',digest:'42'},bookmarks:['11'],followedBoards:[],followedNames:[],subscriptions:['10'],replyNotifications:true,readMarkers:[]};
window.privateTest={reads:0,partial:false,options:null,prepare:[],head:0};
export async function loadRollingWalletRuntime(){return {selectPrivateViews,getAccount:()=>raw,account:{configure:o=>privateTest.options=o},createSession:async()=>({busy:false,close:async()=>{},application:{readAccountStatus:async()=>({status:'collateral-pending',privateFeeCredit:'2',depositIds:[]}),ownedIdentities:async()=>({identities:[],records:[],nextCursor:null}),readPreferences:async()=>{privateTest.reads++;return privateTest.partial?{status:'recovering',complete:false,progress:{scannedThrough:32,anchorBlock:100}}:{status:'complete',complete:true,preferences:prefs};},readPreferenceHead:async()=>{privateTest.head++;return prefs.head;},prepare:async action=>{privateTest.prepare.push(action);return {intentId:'one',status:'prepared',action,maximumFee:'3'};}}})};}`);return;
  }
  if(url.pathname==='/invocation.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await fs.readFile(new URL('../../shared/rolling/invocation.mjs',import.meta.url)));return;}
  if(url.pathname==='/private-views.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await fs.readFile(new URL('../../shared/rolling/private-views.mjs',import.meta.url)));return;}
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));await page.addInitScript(()=>window.IntersectionObserver=undefined);
 await page.goto(`http://127.0.0.1:${server.address().port}/#/bookmarks`);await page.getByRole('heading',{name:'Unlock and recover your private views'}).waitFor();return {page,requests,feed,state};
}
async function recoverPrivateView(page){await page.getByRole('button',{name:'Open private recovery'}).click();await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Recover private views',exact:true}).click();await page.getByText('Complete authenticated preferences are ready.').waitFor();await page.getByRole('button',{name:'Close account panel'}).click();}
test('private routes stay SDK-free when locked; filter whole ordinary pages and continue an empty filtered cursor',async t=>{
 const {page,requests,feed}=await privateViewFixture(t);assert.equal(feed.length,0);assert(!requests.some(p=>p.includes('wallet')));
 if(process.env.ROLLING_PREFERENCES_LOCKED_SCREENSHOT)await page.screenshot({path:process.env.ROLLING_PREFERENCES_LOCKED_SCREENSHOT,fullPage:true});
 await recoverPrivateView(page);await page.getByRole('button',{name:'Load more',exact:true}).waitFor();assert.equal(await page.getByRole('article').count(),0);
 await page.getByRole('button',{name:'Load more',exact:true}).focus();await page.keyboard.press('Enter');await page.locator('#post-11').waitFor();assert.equal(await page.getByRole('article').count(),1);assert.equal(await page.getByRole('heading',{name:'A little quiet here'}).count(),0);
 assert.deepEqual(feed,['/api/feed?limit=30','/api/feed?limit=30&cursor=page2']);assert(!requests.some(p=>/bookmarks=|nameId=|owner=|subscriptions=/.test(p)));
 await page.locator('#post-11').getByRole('button',{name:'Unbookmark',exact:true}).click();await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.deepEqual(await page.evaluate(()=>privateTest.prepare),[{type:'preference',kind:1,target:'11',enabled:false,expectedRevision:'2'}]);
});
for(const mutation of ['duplicate','order','snapshot'])test('private page validation rejects '+mutation+' even across locally filtered rows',async t=>{
 const {page}=await privateViewFixture(t,{mutation});await recoverPrivateView(page);await page.getByRole('button',{name:'Load more',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('article').count(),0);assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0);
});
test('account invalidation synchronously removes private DOM and partial recovery never requests public pages',async t=>{
 const {page,feed}=await privateViewFixture(t);await page.getByRole('button',{name:'Open private recovery'}).click();await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Recover private views',exact:true}).waitFor();await page.evaluate(()=>privateTest.partial=true);await page.getByRole('button',{name:'Recover private views'}).click();await page.getByRole('button',{name:'Continue private recovery'}).waitFor();assert.equal(feed.length,0);
 await page.evaluate(()=>privateTest.partial=false);await page.getByRole('button',{name:'Continue private recovery'}).click();await page.getByRole('button',{name:'Close account panel'}).click();await page.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('#post-11').waitFor();
 assert.equal(await page.evaluate(()=>{privateTest.options.onChange({invalidated:true});return document.querySelectorAll('article').length;}),0);await page.getByRole('heading',{name:'Unlock and recover your private views'}).waitFor();
});

test('a delayed ordinary page cannot restore private content after account invalidation',async t=>{
 const {page,state}=await privateViewFixture(t);await recoverPrivateView(page);state.hold=true;await page.getByRole('button',{name:'Load more',exact:true}).click();
 const until=Date.now()+2000;while(!state.pending.length&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(state.pending.length,1);
 await page.evaluate(()=>privateTest.options.onChange({invalidated:true}));state.hold=false;for(const resolve of state.pending)resolve();await page.getByRole('heading',{name:'Unlock and recover your private views'}).waitFor();
 assert.equal(await page.getByRole('article').count(),0);
});
test('Following and Notifications use only ordinary feed parameters and explicit subscription filtering',async t=>{
 const {page,feed}=await privateViewFixture(t);await recoverPrivateView(page);await page.getByRole('link',{name:'Following',exact:true}).click();await page.getByRole('button',{name:'Load more',exact:true}).click();await page.getByText('Checked against chain block 4',{exact:true}).waitFor();assert.equal(await page.getByRole('article').count(),0);
 await page.getByRole('link',{name:'Notifications',exact:true}).click();await page.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('#post-11').waitFor();assert.equal(await page.locator('#post-10').count(),0);assert(feed.every(url=>/^\/api\/feed\?limit=30(?:&cursor=page2)?$/.test(url)));
 await page.locator('#post-11').getByRole('button',{name:'Mark thread read',exact:true}).click();await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.deepEqual(await page.evaluate(()=>privateTest.prepare),[{type:'read-marker',thread:'10',throughBlock:'2',expectedRevision:'2'}]);
});
