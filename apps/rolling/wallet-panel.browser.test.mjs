// LABELLED UI DOUBLES: this suite tests presentation and no-replay controls only.
// RPC, custody, proofs and encrypted persistence are qualified separately. The
// sessionStorage recovery double below is NOT a production persistence mechanism.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const fixture=`import {mountRollingWalletPanel} from '/wallet-panel.mjs';
const state={loads:0,sessions:0,prepares:0,sends:0,reconciles:0,cancels:0,closes:0,creates:0,imports:0,exports:0,effects:0,ended:0,owned:0,unlocked:true,options:null,failure:null,hold:null,release:null,fee:'fee-ready'};
window.test=state;
const envelope={schemaVersion:1,kind:'aztec-billboard-encrypted-wallet',kdf:'PBKDF2-SHA256',iterations:600000,salt:'aa'.repeat(16),iv:'bb'.repeat(12),ciphertext:'cc'.repeat(16)};
const read=()=>JSON.parse(sessionStorage.getItem('labelled-ui-intent')||'null');
const write=value=>sessionStorage.setItem('labelled-ui-intent',JSON.stringify(value));
const error=()=>{throw Object.defineProperty(Error('PRIVATE_SENTINEL'), 'code',{get(){throw Error('GETTER_SENTINEL');}});};
async function boundary(name){if(state.hold===name)await new Promise(resolve=>state.release=resolve);if(state.failure===name)error();}
const application={
 async readAccountStatus(){await boundary('status');const intent=read();return intent&&!['confirmed','reverted','cancelled'].includes(intent.status)?{status:'recovering',intent}:{status:state.fee,privateFeeCredit:'1000',depositIds:state.fee==='fee-ready'?['9']:[]};},
 async ownedIdentities({cursor}){state.owned++;return cursor===0?{identities:['7'],nextCursor:8}:{identities:['8'],nextCursor:null};},
 async prepare(action){state.prepares++;write({intentId:'42',action,maximumFee:'123',status:'prepared'});await boundary('prepare');return read();},
 async submitPrepared(id){state.sends++;write({...read(),status:'submitting'});await boundary('submit');const intent={...read(),status:'confirmed'};write(intent);return intent;},
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
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"});res.end('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><button id="open">Open account</button><div id="reader">Public reader</div><script type="module" src="/fixture.mjs"></script>');return;}
  if(req.url==='/fixture.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(fixture);return;}
  if(!['/wallet-panel.mjs','/model.mjs','/style.css'].includes(req.url)){res.writeHead(404);res.end();return;}
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
