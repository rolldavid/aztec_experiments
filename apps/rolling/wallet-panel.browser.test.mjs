// LABELLED UI DOUBLES: this suite tests presentation and no-replay controls only.
// RPC, custody, proofs and encrypted persistence are qualified separately. The
// sessionStorage recovery double below is NOT a production persistence mechanism.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const fixture=`import {mountRollingWalletPanel} from '/wallet-panel.mjs';
const state={loads:0,sessions:0,prepares:0,sends:0,reconciles:0,cancels:0,closes:0,creates:0,imports:0,exports:0,effects:0,ended:0,owned:0,unlocked:true,options:null,failure:null,hold:null,release:null,fee:'fee-ready',profileCalls:0,bioVersion:'3',avatarVersion:'4'};
window.test=state;
state.previewBlobs=new Map();state.revoked=[];const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);state.previewBlobs.set(url,blob);return url;};URL.revokeObjectURL=url=>{state.revoked.push(url);state.previewBlobs.delete(url);revokeURL(url);};
const envelope={schemaVersion:1,kind:'aztec-billboard-encrypted-wallet',kdf:'PBKDF2-SHA256',iterations:600000,salt:'aa'.repeat(16),iv:'bb'.repeat(12),ciphertext:'cc'.repeat(16)};
const read=()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')||'null');
const write=value=>sessionStorage.setItem('labelled-ui-intent',JSON.stringify(value));
const error=()=>{throw Object.defineProperty(Error('PRIVATE_SENTINEL'), 'code',{get(){throw Error('GETTER_SENTINEL');}});};
async function boundary(name){if(state.hold===name)await new Promise(resolve=>state.release=resolve);if(state.failure===name)error();}
const application={
 async readAccountStatus(){await boundary('status');const intent=read();return intent&&!['confirmed','reverted','cancelled'].includes(intent.status)?{status:'recovering',intent}:{status:state.fee,privateFeeCredit:'1000',depositIds:state.fee==='fee-ready'?['9']:[]};},
 async ownedIdentities({cursor}){state.owned++;return cursor===0?{identities:['7'],records:[{id:'7',first:'River',last:'Lane'}],nextCursor:8}:{identities:['8'],records:[{id:'8',first:'Ellis',last:'Moss'}],nextCursor:null};},
 async readProfile({name}){state.profileCalls++;await boundary('profile');return {name:'0x'+BigInt(name).toString(16).padStart(64,'0'),bioVersion:state.bioVersion,avatarVersion:state.avatarVersion};},
 async prepare(action){state.prepares++;if(['bio','avatar'].includes(action.type)&&action.expectedVersion!==state[action.type+'Version'])error();write({intentId:'42',action,maximumFee:'123',status:'prepared'});await boundary('prepare');return read();},
 async submitPrepared(id){state.sends++;write({...read(),status:'submitting'});await boundary('submit');const intent={...read(),status:state.submitOutcome??'confirmed'};write(intent);return intent;},
 async cancelPrepared(){state.cancels++;write({...read(),status:'cancelled'});return read();},
 async reconcile(){state.reconciles++;await boundary('reconcile');const intent=read();if(state.resolveOutcome){intent.status=state.resolveOutcome;write(intent);}return intent;}
};
const runtime={getAccount:()=>state.unlocked?{secretKey:'PRIVATE_SENTINEL',address:'HUMAN_IDENTITY_SENTINEL'}:null,
 account:{configure:options=>{state.options=options;},async create(){state.creates++;await boundary('create');state.unlocked=true;return envelope;},async importRecovery(){state.imports++;await boundary('import');state.unlocked=true;},async exportRecovery(){state.exports++;await boundary('export');return envelope;},async endSession(){state.ended++;state.unlocked=false;return {reload:true};}},
 async createSession(){state.sessions++;await boundary('session');return {application,busy:false,async close(){state.closes++;await boundary('close');}};}
};
window.panel=mountRollingWalletPanel({loadRuntime:async()=>{state.loads++;await boundary('load');return runtime;},onPublicEffect:()=>{state.effects++;}});
document.getElementById('open').onclick=()=>window.panel.open(window.defaults);
window.ready=true;`;
async function browserFixture(t){
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src blob:; base-uri 'none'; form-action 'none'"});res.end('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><button id="open">Open account</button><div id="reader">Public reader</div><script type="module" src="/fixture.mjs"></script>');return;}
  if(req.url==='/fixture.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(fixture);return;}
  if(!['/wallet-panel.mjs','/avatar-upload.mjs','/model.mjs','/style.css'].includes(req.url)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':req.url.endsWith('.css')?'text/css':'text/javascript'});res.end(await fs.readFile(new URL('.'+req.url,import.meta.url)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
 const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 t.after(()=>assert.deepEqual(errors,[]));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
 return {page,requests};
}
async function open(page,defaults){if(defaults)await page.evaluate(value=>window.defaults=value,defaults);await page.getByRole('button',{name:'Open account',exact:true}).click();}
async function unlock(page){await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Check action and review fee',exact:true}).waitFor();}
async function prepare(page){await page.getByLabel('Message',{exact:true}).fill('Hello from the labelled UI double.');await page.getByRole('button',{name:'Check action and review fee',exact:true}).click();await page.getByRole('button',{name:'Confirm and send',exact:true}).waitFor();}
const counts=page=>page.evaluate(()=>({loads:test.loads,sessions:test.sessions,prepares:test.prepares,sends:test.sends,reconciles:test.reconciles,effects:test.effects}));

test('public opening is SDK-free; dialog survives reader changes, traps focus and restores it',async t=>{
 const {page,requests}=await browserFixture(t);await open(page);assert.equal((await counts(page)).loads,0);
 await page.evaluate(()=>document.getElementById('reader').replaceChildren(document.createTextNode('Rerendered')));assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Close account panel'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Unlock');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Close account panel');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'open');
 await open(page);assert.equal(await page.getByRole('dialog').count(),1);assert.equal((await counts(page)).loads,0);
 assert(requests.every(url=>!url.includes('aztec')&&!url.includes('/api/')));
});

test('private choices, multibyte limit, literal preview and explicit maximum-fee confirmation',async t=>{
 const {page}=await browserFixture(t);await open(page,{type:'reply',parent:'10',root:'1',subboard:'3'});await unlock(page);
 assert.equal(await page.evaluate(()=>test.options.requireEth),false);assert.equal(await page.evaluate(()=>test.options.autoPasskey),false);
 assert.equal(await page.getByLabel('Reply to post ID').inputValue(),'10');assert.equal(await page.getByLabel('Root thread ID').inputValue(),'1');
 assert.equal(await page.getByLabel('Posting identity').inputValue(),'0');await page.getByRole('button',{name:'Load more owned names'}).click();await page.getByLabel('Posting identity').selectOption('8');
 await page.getByLabel('Message',{exact:true}).fill('😀'.repeat(249));assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());
 assert.equal(await page.getByLabel('Message',{exact:true}).inputValue(),'😀'.repeat(249));assert(await page.getByText(/249 characters · 996\/992/).isVisible());
 await page.getByLabel('Message',{exact:true}).fill('<img src=x onerror=alert(1)>');await page.getByText('Preview message',{exact:true}).click();assert.equal(await page.locator('.preview-body img').count(),0);
 await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();
 assert(await page.getByText(/Maximum network fee: 123 fee-juice units/).isVisible());assert.equal((await counts(page)).sends,0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action),{type:'reply',subboard:'3',parent:'10',root:'1',content:'<img src=x onerror=alert(1)>',name:'8',deposit:'9'});
 await page.getByRole('button',{name:'Confirm and send'}).click();await page.getByText('Transaction confirmed on the verified chain.',{exact:true}).waitFor();assert.equal((await counts(page)).sends,1);assert.equal((await counts(page)).effects,1);
 assert.equal(await page.locator('body').innerText().then(text=>text.includes('PRIVATE_SENTINEL')||text.includes('HUMAN_IDENTITY_SENTINEL')),false);
});

test('uncertain submission cannot resend; reopening and replacement reconcile the retained intent',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await prepare(page);
 await page.evaluate(()=>{test.failure='submit';test.hold='submit';});await page.getByRole('button',{name:'Confirm and send'}).click();await page.waitForFunction(()=>test.sends===1);
 await page.keyboard.press('Escape');assert(await page.getByRole('dialog').isVisible());assert(await page.getByRole('button',{name:'Confirm and send'}).isDisabled());
 await page.evaluate(()=>test.release());await page.getByRole('button',{name:'Check existing transaction'}).waitFor();assert.equal(await page.getByRole('button',{name:'Confirm and send'}).count(),0);
 assert(!(await page.locator('body').innerText()).includes('PRIVATE_SENTINEL'));
 await page.getByRole('button',{name:'Close account panel'}).click();await open(page,{type:'like',post:'66'});await page.getByRole('button',{name:'Check existing transaction'}).waitFor();assert.equal((await counts(page)).sends,1);
 await page.reload();await page.waitForFunction(()=>window.ready);await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Check existing transaction'}).waitFor();
 assert.equal((await counts(page)).sends,0);assert.equal((await counts(page)).prepares,0);
 await page.evaluate(()=>test.resolveOutcome='confirmed');await page.getByRole('button',{name:'Check existing transaction'}).click();await page.getByText('Transaction confirmed on the verified chain.',{exact:true}).waitFor();assert.equal((await counts(page)).sends,0);assert.equal((await counts(page)).reconciles,1);
});

test('lost prepare acknowledgement blocks new work until recovery; prepared cancellation never sends',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await page.getByLabel('Action').selectOption('name');await page.getByLabel('First name',{exact:true}).fill('River');await page.getByLabel('Last name',{exact:true}).fill('Lane');
 await page.evaluate(()=>test.failure='prepare');await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Check account recovery'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Check action and review fee'}).count(),0);
 await page.evaluate(()=>test.failure=null);await page.getByRole('button',{name:'Check account recovery'}).click();await page.getByRole('button',{name:'Cancel prepared action'}).click();await page.getByText('Prepared action cancelled. No new transaction was sent.').waitFor();
 assert.equal((await counts(page)).sends,0);assert.equal(await page.evaluate(()=>test.cancels),1);
});

test('explicit create, encrypted backup download, no automatic account creation and failed cleanup preserves account',async t=>{
 const {page}=await browserFixture(t);await page.evaluate(()=>test.unlocked=false);await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Create account and download recovery'}).waitFor();
 assert.equal(await page.evaluate(()=>test.creates),0);assert.equal(await page.evaluate(()=>test.imports),0);
 await page.getByLabel('Recovery password',{exact:true}).fill('a strong test-only password');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Create account and download recovery'}).click();
 const download=await downloading;assert.equal(download.suggestedFilename(),'rolling-chat-encrypted-recovery.json');const downloaded=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(downloaded.kind,'aztec-billboard-encrypted-wallet');assert.equal(Object.hasOwn(downloaded,'secretKey'),false);
 await page.getByRole('button',{name:'Check action and review fee'}).waitFor();await page.getByText('Backup and account security',{exact:true}).click();await page.evaluate(()=>test.failure='close');await page.getByRole('button',{name:'Lock account',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>test.ended),0);
 await page.getByText('Backup and account security',{exact:true}).click();await page.getByLabel('New recovery password',{exact:true}).fill('a new test-only password');const exporting=page.waitForEvent('download');await page.getByRole('button',{name:'Download encrypted recovery'}).click();await exporting;assert.equal(await page.evaluate(()=>test.exports),1);
});

test('funding remains honest and unavailable connection has no action buttons or automatic retry',async t=>{
 const {page}=await browserFixture(t);await page.evaluate(()=>test.failure='session');await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Connect private account'}).waitFor();
 assert.equal((await counts(page)).sessions,1);assert.equal(await page.getByRole('button',{name:'Confirm and send'}).count(),0);assert.equal(await page.getByRole('button',{name:'Check action and review fee'}).count(),0);
 await page.evaluate(()=>{test.failure=null;test.fee='collateral-pending';});await page.getByRole('button',{name:'Connect private account'}).click();await page.getByText('No posting collateral is available.',{exact:true}).waitFor();
 assert(await page.getByText('Funding is not connected in this panel yet. No funds are requested here.',{exact:true}).isVisible());await page.getByLabel('Message',{exact:true}).fill('No collateral');assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());
 await page.getByLabel('Action').selectOption('subboard');await page.getByLabel('Permanent slug (3–40 lowercase letters, digits or single hyphens)').fill('small-tools');await page.getByLabel('Subboard name').fill('Small tools');await page.getByLabel('Description',{exact:true}).fill('Make useful things');
 await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.equal((await counts(page)).sends,0);
});

test('recovery import is explicit; quote, repost, like and unlike retain exact selected targets',async t=>{
 const {page}=await browserFixture(t);await page.evaluate(()=>test.unlocked=false);await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Import recovery',exact:true}).waitFor();
 await page.getByLabel('Recovery file',{exact:true}).setInputFiles({name:'labelled-encrypted-double.json',mimeType:'application/json',buffer:Buffer.from('{}')});assert.equal(await page.evaluate(()=>test.imports),0);
 await page.getByLabel('Recovery password',{exact:true}).fill('test-only password');await page.getByRole('button',{name:'Import recovery',exact:true}).click();await page.getByRole('button',{name:'Check action and review fee'}).waitFor();assert.equal(await page.evaluate(()=>test.imports),1);
 for(const type of ['quote','repost','like','unlike']){
  await page.getByRole('button',{name:'Close account panel'}).click();await open(page,{type,reference:'22',post:'22'});await page.getByRole('button',{name:'Check action and review fee'}).waitFor();
  if(type==='quote')await page.getByLabel('Message',{exact:true}).fill('A quote');
  await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Cancel prepared action'}).waitFor();
  const action=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action);assert.equal(action.type,type);assert.equal(action[type==='quote'||type==='repost'?'reference':'post'],'22');
  await page.getByRole('button',{name:'Cancel prepared action'}).click();await page.getByRole('button',{name:'Check action and review fee'}).waitFor();
 }
 assert.equal((await counts(page)).sends,0);
});


test('failed export without a private connection is not misreported as a connection failure',async t=>{
 const {page}=await browserFixture(t);await page.evaluate(()=>test.failure='session');await open(page);
 await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('button',{name:'Connect private account'}).waitFor();
 assert.match(await page.getByRole('alert').innerText(),/private connection is unavailable/);
 await page.getByText('Backup and account security',{exact:true}).click();
 await page.getByLabel('New recovery password',{exact:true}).fill('a new test-only password');
 await page.evaluate(()=>test.failure='export');await page.getByRole('button',{name:'Download encrypted recovery'}).click();
 await page.waitForFunction(()=>test.exports===1);
 assert.match(await page.getByRole('alert').innerText(),/This operation could not be completed/);
 assert.doesNotMatch(await page.getByRole('alert').innerText(),/private connection|PRIVATE_SENTINEL|GETTER_SENTINEL/);
 assert.equal((await counts(page)).sessions,1);assert.equal((await counts(page)).sends,0);
});

async function selectProfile(page,type){await page.getByLabel('Action',{exact:true}).selectOption(type);await page.getByLabel('Profile name',{exact:true}).selectOption('7');await page.waitForFunction(()=>!document.querySelector('dialog').matches('[aria-busy="true"]'));}
async function imageFile(page){const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=180;c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='#43775c';ctx.fillRect(0,0,180,120);const blob=await new Promise(r=>c.toBlob(r,'image/png'));c.width=c.height=0;return [...new Uint8Array(await blob.arrayBuffer())];});return {name:'generated-pattern.png',mimeType:'image/png',buffer:Buffer.from(bytes)};}
async function previewData(page){return page.locator('img[alt="Exact avatar bytes to publish"]').evaluate(async img=>{const blob=test.previewBlobs.get(img.src);return {data:btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))),size:blob.size,width:img.naturalWidth,height:img.naturalHeight};});}

test('owned names are readable and profile version is fetched only by explicit selection/check',async t=>{
 const {page,requests}=await browserFixture(t);await open(page);await unlock(page);assert.equal(await page.getByLabel('Posting identity').locator('option').allTextContents().then(x=>x.join('|')),'Anonymous|River Lane');
 assert.equal(await page.evaluate(()=>test.profileCalls),0);await page.getByLabel('Action').selectOption('bio');assert.equal(await page.evaluate(()=>test.profileCalls),0);assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());
 await page.getByLabel('Profile name').selectOption('7');await page.waitForFunction(()=>test.profileCalls===1&&!document.querySelector('dialog').matches('[aria-busy="true"]'));
 await page.getByLabel('Bio (empty to clear)',{exact:true}).fill('😀'.repeat(249));assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal(await page.getByLabel('Bio (empty to clear)').inputValue(),'😀'.repeat(249));
 await page.getByLabel('Bio (empty to clear)').fill('<script>literal()</script>');await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action),{type:'bio',content:'<script>literal()</script>',name:'7',expectedVersion:'3'});assert.equal(await page.locator('dialog script').count(),0);assert.equal(await page.evaluate(()=>test.profileCalls),1);assert.equal((await counts(page)).sends,0);
 assert(requests.every(url=>!url.includes('/api/')&&!url.includes('owned_')));
});
test('stale bio version fails without rereading or overwriting; empty bio clear requires explicit review',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await selectProfile(page,'bio');await page.evaluate(()=>test.bioVersion='5');
 await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Check account recovery'}).waitFor();assert.equal(await page.evaluate(()=>test.profileCalls),1);assert.equal((await counts(page)).sends,0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('labelled-ui-intent')),null);
 await page.getByRole('button',{name:'Check account recovery'}).click();await page.getByRole('button',{name:'Check current profile version'}).waitFor();assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal(await page.evaluate(()=>test.profileCalls),1);await page.getByRole('button',{name:'Check current profile version'}).click();await page.waitForFunction(()=>test.profileCalls===2&&!document.querySelector('dialog').matches('[aria-busy="true"]'));
 await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action),{type:'bio',name:'7',expectedVersion:'5',content:''});assert.equal((await counts(page)).sends,0);
});
test('avatar exact immutable preview bytes survive confirmation and recovered prepared intent',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await selectProfile(page,'avatar');await page.getByLabel('Avatar image',{exact:true}).setInputFiles(await imageFile(page));
 await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth===100&&!document.querySelector('dialog').matches('[aria-busy="true"]'));const first=await previewData(page);assert.equal(first.width,100);assert.equal(first.height,100);assert(first.size<=8192);
 assert(await page.getByText(/Centre-square crop, resized to 100/).isVisible());await page.getByRole('button',{name:'Check action and review fee'}).click();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm and send');return b&&!b.disabled;});
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action);assert.deepEqual(saved,{type:'avatar',name:'7',expectedVersion:'4',width:100,height:100,data:first.data});assert.equal((await previewData(page)).data,first.data);assert.equal((await counts(page)).sends,0);
 await page.getByRole('button',{name:'Close account panel'}).click();assert.equal(await page.evaluate(()=>test.previewBlobs.size),0);
 await page.reload();await page.waitForFunction(()=>window.ready);await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm and send');return b&&!b.disabled;});
 assert.equal((await previewData(page)).data,first.data);assert.equal((await counts(page)).prepares,0);assert.equal((await counts(page)).sends,0);assert.equal(await page.evaluate(()=>test.profileCalls),0);
 await page.getByRole('button',{name:'Confirm and send'}).click();await page.getByText('Transaction confirmed on the verified chain.',{exact:true}).waitFor();assert.equal((await counts(page)).sends,1);
});
test('avatar clear, rejected uploads and failed profile connection never auto-send',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await page.evaluate(()=>test.failure='profile');await selectProfile(page,'avatar');await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal(await page.evaluate(()=>test.profileCalls),1);
 await page.evaluate(()=>test.failure=null);await page.getByRole('button',{name:'Check current profile version'}).click();await page.waitForFunction(()=>test.profileCalls===2&&!document.querySelector('dialog').matches('[aria-busy="true"]'));
 for(const file of [{name:'active.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg onload="PRIVATE_SENTINEL"/>')},{name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(8*1024*1024+1)}]){
  await page.getByLabel('Avatar image').setInputFiles(file);await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal((await counts(page)).prepares,0);
 }
 await page.getByRole('button',{name:'Clear avatar',exact:true}).click();await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action),{type:'avatar',name:'7',expectedVersion:'4',width:0,height:0,data:''});assert.equal((await counts(page)).sends,0);assert(!(await page.locator('body').innerText()).includes('PRIVATE_SENTINEL'));
});
test('invalid recovered avatar disables send and lock invalidates/revokes existing previews',async t=>{
 const {page}=await browserFixture(t);await page.evaluate(()=>sessionStorage.setItem('labelled-ui-intent',JSON.stringify({intentId:'42',status:'prepared',maximumFee:'123',action:{type:'avatar',name:'7',expectedVersion:'4',width:100,height:100,data:btoa('<svg onload="bad()"/>')}})));
 await open(page);await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByText(/saved avatar cannot be previewed safely/).waitFor();assert(await page.getByRole('button',{name:'Confirm and send'}).isDisabled());assert.equal((await counts(page)).sends,0);
 await page.getByRole('button',{name:'Cancel prepared action'}).click();await selectProfile(page,'avatar');await page.getByLabel('Avatar image').setInputFiles(await imageFile(page));await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth===100&&!document.querySelector('dialog').matches('[aria-busy="true"]'));
 assert.equal(await page.evaluate(()=>test.previewBlobs.size),1);await page.evaluate(()=>test.options.onChange({invalidated:true}));assert.equal(await page.evaluate(()=>test.previewBlobs.size),0);assert.equal(await page.locator('dialog img').count(),0);assert.equal(await page.getByRole('button',{name:'Confirm and send'}).count(),0);
});
test('random names remain editable local proposals until an explicit action check',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await page.getByLabel('Action').selectOption('name');const before=await counts(page),owned=await page.evaluate(()=>test.owned);
 await page.getByRole('button',{name:'Suggest a random name'}).click();assert.match(await page.getByLabel('First name',{exact:true}).inputValue(),/^(River|Ellis|Mira|Rowan|Sage|Robin|Avery|Quinn)$/);assert.match(await page.getByLabel('Last name',{exact:true}).inputValue(),/^(Lane|Moss|Reed|Vale|Stone|Brook|Finch|Wren)$/);
 assert.deepEqual(await counts(page),before);assert.equal(await page.evaluate(()=>test.owned),owned);assert.equal(await page.evaluate(()=>test.profileCalls),0);assert(await page.getByText(/random suggestion is not a reservation/).isVisible());
 await page.getByLabel('First name',{exact:true}).fill('Edited');await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')).action.first),'Edited');assert.equal((await counts(page)).sends,0);
});

for(const outcome of ['confirmed','reverted'])test(`profile ${outcome} clears only captured version and requires an explicit new check`,async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await selectProfile(page,'bio');
 await page.getByLabel('Bio (empty to clear)').fill('Preserve this draft after outcome');await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Confirm and send'}).waitFor();
 await page.evaluate(value=>test.submitOutcome=value,outcome);await page.getByRole('button',{name:'Confirm and send'}).click();await page.getByRole('button',{name:'Check current profile version'}).waitFor();
 assert.equal(await page.getByLabel('Bio (empty to clear)').inputValue(),'Preserve this draft after outcome');assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal(await page.evaluate(()=>test.profileCalls),1);assert.equal((await counts(page)).sends,1);
 await page.getByRole('button',{name:'Check current profile version'}).click();await page.waitForFunction(()=>test.profileCalls===2&&!document.querySelector('dialog').matches('[aria-busy="true"]'));assert(await page.getByRole('button',{name:'Check action and review fee'}).isEnabled());assert.equal((await counts(page)).sends,1);
});
test('lost profile preparation acknowledgement retains saved intent and exact avatar while invalidating draft version',async t=>{
 const {page}=await browserFixture(t);await open(page);await unlock(page);await selectProfile(page,'avatar');await page.getByLabel('Avatar image').setInputFiles(await imageFile(page));await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth===100&&!document.querySelector('dialog').matches('[aria-busy="true"]'));const preview=await previewData(page);
 await page.evaluate(()=>test.failure='prepare');await page.getByRole('button',{name:'Check action and review fee'}).click();await page.getByRole('button',{name:'Check account recovery'}).waitFor();assert.equal((await counts(page)).sends,0);
 await page.evaluate(()=>test.failure=null);await page.getByRole('button',{name:'Check account recovery'}).click();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm and send');return b&&!b.disabled;});assert.equal((await previewData(page)).data,preview.data);assert.equal(await page.evaluate(()=>test.profileCalls),1);
 await page.getByRole('button',{name:'Cancel prepared action'}).click();await page.getByRole('button',{name:'Check current profile version'}).waitFor();assert(await page.getByRole('button',{name:'Check action and review fee'}).isDisabled());assert.equal((await previewData(page)).data,preview.data);assert.equal((await counts(page)).sends,0);
});
