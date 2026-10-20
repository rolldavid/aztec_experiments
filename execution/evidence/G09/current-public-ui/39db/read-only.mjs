// Actual public UI observation; uses the same Playwright/Chrome interface as reader.browser.test.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/package.json');
const {chromium}=require('playwright');
const directory=path.dirname(fileURLToPath(import.meta.url)),origin='http://127.0.0.1:8181';
const post='12149458384919124989847482452722011620626189287225894869695977437752594159673';
const record=JSON.parse(await fs.readFile(path.join(directory,'../post.json'),'utf8')),name=record.post.record.name_id;
const chrome='/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-design/.build/cft-155.0.8059.79-mac-arm64/unpacked/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const result={passed:false,sourceRevision:'39dbff586a5092349c32d93b721d5417733e3532',scope:'Actual public UI only; fresh disposable browser context, no wallet initialization/import/unlock',startedAt:new Date().toISOString(),checks:{},observations:{},traffic:{requests:[],denied:0,routeErrors:0},pageErrors:[],cleanup:{contextClosed:false,browserClosed:false}};
let browser,context,page,stage='setup';const pending=new Set();
const timeout=setTimeout(()=>{void browser?.close();},60000);
const check=(key,value)=>{assert(value,key);result.checks[key]=true;};
const screenshot=async name=>{await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});};
const redacted=async()=>{const card=page.locator('#post-'+post);await card.waitFor();check('noRemovedText',!(await page.locator('body').innerText()).includes('I will find you and hurt you.'));check('noBody',await card.locator(':scope > .post-body').count()===0);check('reason',await card.getByText('Removal reason: '+record.post.removal.reason,{exact:true}).isVisible());check('publicationPolicy',await card.getByText('Published under policy: parent v1 · local v0',{exact:true}).isVisible());check('removalPolicy',await card.getByText('Removal policy: parent v1 · local v0',{exact:true}).isVisible());return card;};
try{
 browser=await chromium.launch({headless:true,executablePath:chrome});context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',e=>result.pageErrors.push({name:e.name}));
 await context.route('**/*',route=>{const task=(async()=>{const r=route.request(),u=new URL(r.url());result.traffic.requests.push({method:r.method(),path:u.pathname});if(r.method()!=='GET'||u.origin!==origin||u.pathname.startsWith('/wallet')){result.traffic.denied++;return route.abort();}await route.continue();})();pending.add(task);void task.catch(()=>{result.traffic.routeErrors++;}).finally(()=>pending.delete(task));return task;});
 stage='affected-tombstone';await page.goto(origin+'/#/post/'+post);let card=await redacted();
 check('privateControlsVisible',JSON.stringify(await card.getByRole('button').allTextContents())===JSON.stringify(['Unlike','Bookmark','Subscribe to thread','Mark thread read']));
 for(const name of ['Reply','Like','Quote','Repost'])check('no-'+name,await card.getByRole('button',{name,exact:true}).count()===0);
 await card.getByRole('link',{name:'View thread',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Conversation',level:1}).waitFor();await redacted();check('threadRoot',new URL(page.url()).hash==='#/thread/'+post);
 await page.goBack();await page.getByRole('heading',{name:'Post',level:1}).waitFor();card=await redacted();check('backLinkFocus',await card.getByRole('link',{name:'View thread',exact:true}).evaluate(n=>n===document.activeElement));
 await screenshot('post-desktop');await page.setViewportSize({width:390,height:844});check('mobileNoOverflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('post-mobile');
 result.observations.new39dbControlsIntegrated=true;result.observations.controlsOnly='Visible public entry points; never activated. Private prepare semantics remain separately fixture-qualified.';
 result.passed=true;
}catch(e){result.failure={stage,name:e.name,message:String(e.message).slice(0,800)};if(page&&!page.isClosed())await screenshot('failure').catch(()=>{});}
finally{clearTimeout(timeout);await context?.close().then(()=>result.cleanup.contextClosed=true).catch(()=>{});await browser?.close().then(()=>result.cleanup.browserClosed=true).catch(()=>{});await Promise.allSettled([...pending]);result.finishedAt=new Date().toISOString();if(result.traffic.denied||result.traffic.routeErrors||result.pageErrors.length||!result.cleanup.contextClosed||!result.cleanup.browserClosed)result.passed=false;await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,checks:result.checks,failure:result.failure,cleanup:result.cleanup,denied:result.traffic.denied}));}
