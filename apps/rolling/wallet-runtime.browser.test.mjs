// Actual SDK, custody, encrypted export and asset composition in Chromium.
// Public index data and the unavailable private endpoint are explicit doubles;
// this does not qualify funding, chain actions or a production deployment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {loadRollingWalletAssets} from '../../scripts/rolling-wallet-assets.mjs';
import {startRollingReader} from './start.mjs';
const field=n=>'0x'+n.toString(16).padStart(64,'0'),eth=n=>'0x'+n.toString(16).padStart(40,'0');
test('real browser SDK unlock and encrypted recovery survive unavailable private deployment without submission',{timeout:60000},async t=>{
 const scope={chainId:'31337',rollupVersion:'1',rollupAddress:eth(1),boardAddress:field(2)};
 const config={network:{chainId:'31337',rollupVersion:'1',rollupAddress:eth(1),ethRpcUrl:'http://127.0.0.1:1'},board:{contractAddress:field(2),portalAddress:eth(3)},
  privateFee:{contractAddress:field(4),gasSettings:{gasLimits:{daGas:'1',l2Gas:'1'},teardownGasLimits:{daGas:'1',l2Gas:'1'},maxFeesPerGas:{feePerDaGas:'1',feePerL2Gas:'1'},maxPriorityFeesPerGas:{feePerDaGas:'0',feePerL2Gas:'0'}}}};
 const wallet=await loadRollingWalletAssets({config,trustedQuery:{url:'http://127.0.0.1:1/v1/node',allowLocalDev:true},remoteProver:null,proofsEnabled:true},scope);
 const index={sync:async()=>{},status:()=>({schemaVersion:1,state:'ready'}),query:()=>({schemaVersion:1,scope,complete:true,checkpoint:{number:1,hash:'public'},revision:'1',posts:[],names:{},boards:{},nextCursor:null})};
 const server=await startRollingReader({index,wallet});t.after(()=>server.close());
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),requests=[],errors=[];
 page.on('request',request=>requests.push({url:request.url(),method:request.method()}));page.on('pageerror',()=>errors.push('pageerror'));
 await page.goto(server.url);await page.getByRole('heading',{name:'A little quiet here'}).waitFor();
 assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 assert.equal(requests.some(r=>/\/wallet\//.test(r.url)),false);
 await page.getByRole('button',{name:'Your account',exact:true}).click();await page.getByRole('button',{name:'Unlock',exact:true}).waitFor();
 assert.equal(requests.some(r=>/\/wallet\//.test(r.url)),false);
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByRole('button',{name:'Create account and download recovery',exact:true}).waitFor({timeout:30000});
 assert.equal(requests.filter(r=>r.url.endsWith('/wallet/aztec_bundle.js')).length,1);
 assert.equal(requests.some(r=>r.method==='POST'),false);
 await page.getByRole('textbox',{name:'Recovery password',exact:true}).fill('disposable recovery test password');
 const downloadPromise=page.waitForEvent('download',{timeout:5000});
 await page.getByRole('button',{name:'Create account and download recovery',exact:true}).click();
 let download;
 try{download=await downloadPromise;}catch(error){
  t.diagnostic(JSON.stringify(await page.evaluate(()=>({hasAccount:Boolean(window.walletState.aztec),busy:window.BillboardAccount.snapshot().busy}))));
  throw error;
 }
 const encrypted=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(encrypted.kind,'aztec-billboard-encrypted-wallet');assert.equal(Object.hasOwn(encrypted,'secretKey'),false);
 assert.ok(encrypted.ciphertext.length>32);
 await page.getByRole('button',{name:'Connect private account',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>Boolean(window.walletState.aztec)&&!window.walletState.invalidated),true);
 assert.equal(await page.locator('input[type=password]').evaluateAll(nodes=>nodes.every(node=>node.value==='')),true);
 assert.equal(requests.some(r=>r.url.includes('sendTx')||r.url.includes('/v1/jobs')),false);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'execution/evidence/G05/wallet-unavailable-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Close account panel',exact:true}).click();
 await page.getByRole('button',{name:'Your account',exact:true}).click();
 assert.equal(requests.filter(r=>r.url.endsWith('/wallet/aztec_bundle.js')).length,1);
 assert.equal(await page.locator('dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
});
