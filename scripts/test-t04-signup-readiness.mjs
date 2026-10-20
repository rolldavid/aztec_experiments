import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {waitForMetaMaskSignupConnection,walletChromiumLaunch} from './t04-metamask.mjs';

test('signup observes completion or declared failure without waiting for a missing button',async t=>{
 const browser=await chromium.launch({...walletChromiumLaunch(process.env,{aggregate:true}),headless:true});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 for(const mode of ['ready','diagnostic-failure','alert-failure','failure-with-button']){
  await t.test(mode,async()=>{
   await page.setContent('<dialog open><p>Creating your account…</p></dialog>');
   const result=waitForMetaMaskSignupConnection(page,()=>5000);
   const checked=mode==='ready'?result:assert.rejects(result,/Private account initialization failed/);
   await page.evaluate(mode=>{
    const dialog=document.querySelector('dialog');
    if(mode==='ready'||mode==='failure-with-button'){
     const button=document.createElement('button');button.textContent='Connect MetaMask';dialog.append(button);
    }
    if(mode==='diagnostic-failure'||mode==='failure-with-button')
     dialog.dataset.rollingInitialization=JSON.stringify({stage:'session-initialization',step:'deployment',deploymentStep:null,state:'failed',code:'BB_TRUSTED_NODE_UNAVAILABLE'});
    if(mode==='alert-failure'){
     const alert=document.createElement('p');alert.role='alert';alert.textContent='Account connection failed';dialog.append(alert);
    }
   },mode);
   await checked;
  });
 }
});
