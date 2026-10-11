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
   res.end(JSON.stringify(kind==='directory'?{...base,boards:[{id:'20',slug:'workshop',name:'Workshop',description:'Build together',mainRules:'Respect people',rules:'Show your work',rejected:false}]}:kind==='profile'?{...base,identity,posts:[post]}:kind==='post'?{...base,post:url.searchParams.get('id')==='20'?later:post}:kind==='feed'?{...base,posts:[url.searchParams.has('cursor')?later:post],nextCursor:url.searchParams.has('cursor')?null:'2:1'}:{...base,posts:[post]}));return;
  }
  const name=url.pathname==='/'?'live.html':url.pathname.slice(1);if(!files.has(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(await fs.readFile(path.join(root,name)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
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
 assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith(`http://127.0.0.1:${server.address().port}/`)));assert(requests.every(url=>!url.includes('aztec_bundle')&&!url.includes('/wallet')));
});
