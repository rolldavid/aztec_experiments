import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HOSTING_TYPES,hostingHeaders,hostingPolicyHash} from './hosting-policy.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const actions={fill:['selector','value'],click:['selector'],check:['selector','checked'],select:['selector','value'],press:['selector','key'],reload:[],expectText:['selector','text'],expectCount:['selector','count'],expectChecked:['selector','checked'],expectVisible:['selector']};
export function validateBrowserPlan(plan){
 const exact=(value,keys)=>assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.sort().join(','),'Unexpected browser test fields');
 const text=(value,max)=>assert(typeof value==='string'&&value.length>0&&value.length<=max,'Invalid browser test text');
 assert(Buffer.byteLength(JSON.stringify(plan))<=65536,'Browser tests exceed 64KiB');
 exact(plan,['version','scenarios']);assert.equal(plan.version,1);assert(Array.isArray(plan.scenarios)&&plan.scenarios.length>0&&plan.scenarios.length<=8,'Provide 1–8 browser scenarios');
 let steps=0,reloads=0;
 for(const scenario of plan.scenarios){
  exact(scenario,['name','path','steps']);text(scenario.name,120);text(scenario.path,240);
  assert(/^[A-Za-z0-9_.\/-]+\.html$/i.test(scenario.path)&&scenario.path.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Browser path must be a relative HTML file');
  assert(Array.isArray(scenario.steps)&&scenario.steps.length>0,'Browser scenario needs steps');let assertions=0;
  for(const step of scenario.steps){
   assert(step&&Object.hasOwn(actions,step.action),'Unknown browser test action');const keys=['action',...actions[step.action]];
   if(Object.hasOwn(step,'index')){assert(actions[step.action].includes('selector'));assert(Number.isInteger(step.index)&&step.index>=0&&step.index<100);keys.push('index');}
   exact(step,keys);if(step.selector!==undefined)text(step.selector,300);
   for(const key of ['value','text'])if(Object.hasOwn(step,key))assert(typeof step[key]==='string'&&step[key].length<=2000);
   if(Object.hasOwn(step,'key')){text(step.key,40);assert(/^[A-Za-z0-9+]+$/.test(step.key));}
   if(Object.hasOwn(step,'checked'))assert.equal(typeof step.checked,'boolean');
   if(Object.hasOwn(step,'count'))assert(Number.isInteger(step.count)&&step.count>=0&&step.count<=512);
   if(step.action.startsWith('expect'))assertions++;if(step.action==='reload')reloads++;assert(++steps<=64,'Browser tests exceed 64 steps');
  }
  assert(assertions>0,'Each browser scenario needs a visible-state assertion');
 }
 assert(reloads>0,'Browser tests must exercise reload');return plan;
}
export function artifactIdentity(artifacts){return sha(JSON.stringify(artifacts.map(f=>{const b=Buffer.from(f.data,'base64');return {path:f.path,bytes:b.length,sha256:sha(b)};})));}
export function validateBrowserReceipt(value,{artifactSha256,policyHash}={}){
 assert(value&&Object.keys(value).sort().join(',')==='artifactSha256,browserVersion,checks,passed,planSha256,policyHash');
 assert.equal(value.passed,true);for(const key of ['artifactSha256','planSha256','policyHash'])assert(typeof value[key]==='string'&&/^[0-9a-f]{64}$/.test(value[key]));
 assert(typeof value.browserVersion==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(value.browserVersion));assert(Number.isInteger(value.checks)&&value.checks>0&&value.checks<=4096);
 if(artifactSha256)assert.equal(value.artifactSha256,artifactSha256);if(policyHash)assert.equal(value.policyHash,policyHash);return value;
}

// Self-contained trusted function: serialized into the credential-free executor.
// Only declarative data reaches the browser; no model-supplied test code runs in Node.
export async function exerciseBrowser({artifacts,plan,origin,headers,types,deadline},chromium){
 const errors=[],encountered=new Set(),exercised=new Set();let checks=0;
 const fail=text=>{if(errors.length<16)errors.push(String(text).slice(0,800));};
 const remaining=()=>Math.max(1,Math.min(5000,deadline-Date.now()));
 const id='1'.repeat(64),revision='2'.repeat(40),prefix='/t/'+id+'/',base=origin+prefix+'latest/';
 const files=new Map(artifacts.map(f=>[f.path,Buffer.from(f.data,'base64')]));
 const html=artifacts.filter(f=>f.path.toLowerCase().endsWith('.html'));if(!files.has('index.html')||html.length>16)throw Error('Provide index.html and at most 16 HTML pages');
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,timeout:remaining()});
 // Host-owned control identity, shared by discovery and action accounting.
 const identify=element=>{
  if(element.tagName==='LABEL')element=element.control??element;
  for(const attribute of ['id','data-testid','aria-label','name']){
   const value=element.getAttribute(attribute);
   if(value&&document.querySelectorAll('['+attribute+'="'+CSS.escape(value)+'"]').length===1)return attribute+':'+value;
  }
  const parts=[];for(let current=element;current&&current!==document.body;current=current.parentElement){
   const siblings=[...current.parentElement?.children??[]].filter(e=>e.tagName===current.tagName);
   parts.push(current.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(current)+1)+')');
  }
  return parts.reverse().join('>');
 };
 const discover=async(page,scope)=>{
  if(await page.evaluate(()=>globalThis.origin)!=='null')throw Error('Hosting sandbox did not create an opaque origin');
  if(await page.locator('a[download],a[target]:not([target=""]):not([target="_self"]),form[target]:not([target=""]):not([target="_self"])').count())throw Error('Hosting does not support downloads or popup targets; use in-page controls');
  const controls=page.locator('button,input:not([type=hidden]),select,textarea,[role=button],[contenteditable=true],a[href],[role=link]');
  const count=await controls.count();if(count>256)throw Error('Too many interactive controls for browser validation');
  for(let i=0;i<count;i++){
   const item=controls.nth(i);if(!await item.isVisible()||!await item.isEnabled())continue;
   const external=await item.evaluate(e=>e.tagName==='A'&&new URL(e.getAttribute('href'),location.href).origin!==location.origin);
   if(!external)encountered.add(scope+await item.evaluate(identify));
  }
 };
 try{
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   // Smoke every HTML entry, then run each scenario with a clean context.
   const runs=[...html.map(f=>({name:'load '+f.path,path:f.path,steps:[]})),...plan.scenarios];
   for(const scenario of runs){
    if(Date.now()>=deadline)throw Error('Browser validation exceeded work budget');
    const context=await browser.newContext({viewport,permissions:[],acceptDownloads:false});
    context.setDefaultTimeout(remaining());context.setDefaultNavigationTimeout(remaining());
    try{
     await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),requestHeaders=request.headers();
      if(url.origin!==origin){await route.abort('internetdisconnected');return;}
      let status=404,body='',type='text/plain';const raw=url.pathname+url.search;
      if(!['GET','HEAD'].includes(request.method()))status=405;
      else if(/[?%\\]/.test(raw)||requestHeaders.authorization||requestHeaders.cookie)status=400;
      else if(url.pathname===prefix+'api'){status=200;body='{"aliases":[]}';type='application/json';}
      else{
       const path=url.pathname.startsWith(prefix+'latest/')?url.pathname.slice((prefix+'latest/').length)||'index.html':url.pathname.startsWith(prefix+'r/'+revision+'/files/')?url.pathname.slice((prefix+'r/'+revision+'/files/').length):null;
       if(path&&files.has(path)){body=files.get(path);type=types['.'+path.split('.').at(-1).toLowerCase()];if(type)status=200;}
      }
      if(status!==200)fail('Hosting rejected '+request.method()+' '+raw+' ('+status+')');
      await route.fulfill({status,headers:{...headers,'Content-Type':type},body:request.method()==='HEAD'?'':body});
     });
     await context.exposeBinding('__bokPolicyViolation',(_source,directive)=>fail('Hosting policy blocked '+String(directive)));
     await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>globalThis.__bokPolicyViolation(event.violatedDirective)));
     const page=await context.newPage();
     page.on('pageerror',error=>fail(error.message));
     page.on('console',message=>{
      const text=message.text();
      // Offline resources are intentional. An unhandled rejection still fails;
      // scenarios must assert the app's useful offline state.
      if(message.type()==='error'&&!/^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/.test(text))fail(text);
      else if(/sandboxed.*(?:allow-|permission)|Blocked.*(?:sandbox|permission)|Permissions policy violation/i.test(text))fail(text);
     });
     page.on('dialog',dialog=>{fail('Native '+dialog.type()+' dialog is unavailable');void dialog.dismiss();});
     page.on('popup',popup=>{fail('Popup is unavailable');void popup.close();});
     page.on('download',()=>fail('Download is unavailable'));
     const scope=viewport.width+':'+scenario.path+':';
     await page.goto(base+scenario.path,{waitUntil:'load',timeout:remaining()});
     if(!(await page.locator('body').innerText()).trim()&&!(await page.locator('canvas,svg,img').count()))throw Error('Published page is empty: '+scenario.path);
     checks++;await discover(page,scope);
     for(const step of scenario.steps){
      page.setDefaultTimeout(remaining());const locator=step.selector===undefined?null:page.locator(step.selector).nth(step.index??0);
      if(['fill','click','check','select','press'].includes(step.action)){
       await locator.waitFor({state:'visible',timeout:remaining()});exercised.add(scope+await locator.evaluate(identify));
      }
      switch(step.action){
       case 'fill':await locator.fill(step.value);break;
       case 'click':await locator.click();break;
       case 'check':await locator.setChecked(step.checked);break;
       case 'select':await locator.selectOption(step.value);break;
       case 'press':await locator.press(step.key);break;
       case 'reload':await page.reload({waitUntil:'load',timeout:remaining()});break;
       case 'expectVisible':await locator.waitFor({state:'visible',timeout:remaining()});break;
       default:await page.waitForFunction(({selector,index,action,text,count,checked})=>{
        const all=document.querySelectorAll(selector),e=all[index??0];
        if(action==='expectCount')return all.length===count;
        if(!e)return false;
        if(action==='expectText')return (e.textContent??'').includes(text);
        if(action==='expectChecked')return e.checked===checked;
        return false;
       },step,{timeout:remaining()});
      }
      checks++;await discover(page,scope);
      if(errors.length)throw Error(errors.join('\n'));
     }
     if(errors.length)throw Error(errors.join('\n'));
    }catch(error){throw Error(viewport.width+'px / '+scenario.name+': '+error.message);}
    finally{await context.close();}
   }
  }
  const missing=[...encountered].filter(key=>!exercised.has(key));
  if(missing.length)throw Error('Add browser tests that operate these visible controls: '+missing.slice(0,20).join(', '));
  return {browserVersion:browser.version(),checks};
 }finally{await browser.close();}
}

export function browserDriverSource(){
 return `const {chromium}=require('/opt/bok-browser/node_modules/playwright-core');\nconst exerciseBrowser=${exerciseBrowser.toString()};\n(async()=>{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>3*1024*1024)throw Error('browser input bound');}try{const value=await exerciseBrowser(JSON.parse(input),chromium);process.stdout.write(JSON.stringify({passed:true,...value}));}catch(error){process.stdout.write(JSON.stringify({passed:false,error:String(error.message).slice(0,12000)}));process.exitCode=1;}})().catch(()=>process.exitCode=1);`;
}
export function browserInput({artifacts,plan,origin,boardOrigin,deadline}){return {artifacts,plan,origin,headers:hostingHeaders(origin,boardOrigin),types:HOSTING_TYPES,deadline};}
export function browserReceipt(result,{artifacts,plan,origin,boardOrigin}){
 return validateBrowserReceipt({passed:true,...result,artifactSha256:artifactIdentity(artifacts),planSha256:sha(JSON.stringify(plan)),policyHash:hostingPolicyHash(origin,boardOrigin)});
}
