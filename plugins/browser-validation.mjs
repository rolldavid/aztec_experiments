import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HOSTING_TYPES,hostingHeaders,hostingPolicyHash} from './hosting-policy.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
export const BROWSER_PLAN_MAX_STEPS=256;
const actions={fill:['selector','value'],click:['selector'],check:['selector','checked'],select:['selector','value'],press:['selector','key'],reload:[],expectText:['selector','text'],expectCount:['selector','count'],expectChecked:['selector','checked'],expectVisible:['selector']};
const browserPlanMessages=Object.freeze({
 BROWSER_JSON:'Use valid JSON in browser-tests.json.',
 BROWSER_SIZE:'Keep browser-tests.json within 64 KiB.',
 BROWSER_FIELDS:'Use exactly the documented fields for this object or action.',
 BROWSER_VERSION:'Set version to the number 1.',
 BROWSER_SCENARIOS:'Provide between 1 and 8 scenarios.',
 BROWSER_TEXT:'Use nonempty text within the documented length limit for this field.',
 BROWSER_SELECTOR:'Use a nonempty CSS selector string of at most 300 characters in browser-tests.json. Selector objects are supported only in edit_browser_plan arguments.',
 BROWSER_PATH:'Use a relative HTML file path without empty, dot or parent segments.',
 BROWSER_STEPS:'Provide at least one step in this scenario.',
 BROWSER_ACTION:'Use a documented action: fill, click, check, select, press, reload, expectText, expectCount, expectChecked or expectVisible.',
 BROWSER_INDEX_ACTION:'Use index only with actions that take a selector.',
 BROWSER_INDEX:'Use an integer index between 0 and 99.',
 BROWSER_VALUE:'Use a string of at most 2000 characters.',
 BROWSER_KEY:'Use a key name of at most 40 letters, digits or plus signs.',
 BROWSER_CHECKED:'Use a boolean checked value (true or false).',
 BROWSER_COUNT:'Use an integer count between 0 and 512.',
 BROWSER_STEP_LIMIT:`Use at most ${BROWSER_PLAN_MAX_STEPS} steps across all scenarios.`,
 BROWSER_ASSERTION:'Add a visible-state assertion to this scenario.',
 BROWSER_RELOAD:'Include at least one reload action across the scenarios.',
});
// Only fixed reasons and schema/index paths reach the model, never source values,
// selectors, unknown field names or the JSON parser's source-bearing exception.
export function browserPlanDiagnostic(value){
 if(!value||!Object.hasOwn(browserPlanMessages,value.code)||typeof value.path!=='string'||value.path.length>120||
  !/^(?:\$|version|scenarios(?:\[[0-9]{1,2}\])?(?:\.steps(?:\[[0-9]{1,3}\])?)?(?:\.(?:name|path|action|index|selector|value|text|key|checked|count))?)$/.test(value.path))return undefined;
 return {code:value.code,path:value.path,message:browserPlanMessages[value.code]};
}
export function validateBrowserPlan(plan){
 const require=(condition,code,path)=>{if(!condition){const diagnostic=browserPlanDiagnostic({code,path});throw Object.assign(Error(diagnostic.message),{browserPlan:diagnostic});}};
 const exact=(value,keys,path)=>require(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.sort().join(','),'BROWSER_FIELDS',path);
 const text=(value,max,path)=>require(typeof value==='string'&&value.length>0&&value.length<=max,'BROWSER_TEXT',path);
 require(Buffer.byteLength(JSON.stringify(plan))<=65536,'BROWSER_SIZE','$');
 exact(plan,['version','scenarios'],'$');require(plan.version===1,'BROWSER_VERSION','version');require(Array.isArray(plan.scenarios)&&plan.scenarios.length>0&&plan.scenarios.length<=8,'BROWSER_SCENARIOS','scenarios');
 let steps=0,reloads=0;
 for(const [i,scenario] of plan.scenarios.entries()){
  const where='scenarios['+i+']';
  exact(scenario,['name','path','steps'],where);text(scenario.name,120,where+'.name');text(scenario.path,240,where+'.path');
  require(/^[A-Za-z0-9_.\/-]+\.html$/i.test(scenario.path)&&scenario.path.split('/').every(x=>x&&x!=='.'&&x!=='..'),'BROWSER_PATH',where+'.path');
  require(Array.isArray(scenario.steps)&&scenario.steps.length>0,'BROWSER_STEPS',where+'.steps');let assertions=0;
  for(const [j,step] of scenario.steps.entries()){
   const at=where+'.steps['+j+']';
   require(step&&Object.hasOwn(actions,step.action),'BROWSER_ACTION',at+'.action');const keys=['action',...actions[step.action]];
   if(Object.hasOwn(step,'index')){require(actions[step.action].includes('selector'),'BROWSER_INDEX_ACTION',at+'.index');require(Number.isInteger(step.index)&&step.index>=0&&step.index<100,'BROWSER_INDEX',at+'.index');keys.push('index');}
   exact(step,keys,at);if(step.selector!==undefined)require(typeof step.selector==='string'&&step.selector.length>0&&step.selector.length<=300,'BROWSER_SELECTOR',at+'.selector');
   for(const key of ['value','text'])if(Object.hasOwn(step,key))require(typeof step[key]==='string'&&step[key].length<=2000,'BROWSER_VALUE',at+'.'+key);
   if(Object.hasOwn(step,'key')){text(step.key,40,at+'.key');require(/^[A-Za-z0-9+]+$/.test(step.key),'BROWSER_KEY',at+'.key');}
   if(Object.hasOwn(step,'checked'))require(typeof step.checked==='boolean','BROWSER_CHECKED',at+'.checked');
   if(Object.hasOwn(step,'count'))require(Number.isInteger(step.count)&&step.count>=0&&step.count<=512,'BROWSER_COUNT',at+'.count');
   if(step.action.startsWith('expect'))assertions++;if(step.action==='reload')reloads++;require(++steps<=BROWSER_PLAN_MAX_STEPS,'BROWSER_STEP_LIMIT',at);
  }
  require(assertions>0,'BROWSER_ASSERTION',where+'.steps');
 }
 require(reloads>0,'BROWSER_RELOAD','scenarios');return plan;
}
export function artifactIdentity(artifacts){return sha(JSON.stringify(artifacts.map(f=>{const b=Buffer.from(f.data,'base64');return {path:f.path,bytes:b.length,sha256:sha(b)};})));}
export function validateBrowserReceipt(value,{artifactSha256,policyHash}={}){
 assert(value&&Object.keys(value).sort().join(',')==='artifactSha256,browserVersion,checks,passed,planSha256,policyHash');
 assert.equal(value.passed,true);for(const key of ['artifactSha256','planSha256','policyHash'])assert(typeof value[key]==='string'&&/^[0-9a-f]{64}$/.test(value[key]));
 assert(typeof value.browserVersion==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(value.browserVersion));assert(Number.isInteger(value.checks)&&value.checks>0&&value.checks<=4096);
 if(artifactSha256)assert.equal(value.artifactSha256,artifactSha256);if(policyHash)assert.equal(value.policyHash,policyHash);return value;
}

// Self-contained trusted function: serialized into the credential-free executor.
// Fixed execution locations supplement the private failure log; never include
// scenario names, selectors, expected values, DOM text or raw error messages.
export function browserFailureDiagnostic(value){
 const actions=['fill','click','check','select','press','reload','expectText','expectCount','expectChecked','expectVisible'];
 if(!value||!Number.isInteger(value.scenarioIndex)||value.scenarioIndex<0||value.scenarioIndex>=8||
  !Number.isInteger(value.stepIndex)||value.stepIndex<0||value.stepIndex>=256||
  ![390,1280].includes(value.viewportWidth)||!actions.includes(value.action)||
  !['timeout','step-failed'].includes(value.category))return undefined;
 return {scenarioIndex:value.scenarioIndex,stepIndex:value.stepIndex,viewportWidth:value.viewportWidth,action:value.action,category:value.category};
}

// Only declarative data reaches the browser; no model-supplied test code runs in Node.
export async function exerciseBrowser({artifacts,plan,origin,headers,types,deadline},chromium){
 const errors=[],encountered=new Set(),exercised=new Set();let checks=0;
 const fail=text=>{if(errors.length<16)errors.push(String(text).slice(0,800));};
 const remaining=()=>Math.max(1,Math.min(5000,deadline-Date.now()));
 const id='1'.repeat(64),revision='2'.repeat(40),prefix='/t/'+id+'/',base=origin+prefix+'latest/';
 const files=new Map(artifacts.map(f=>[f.path,Buffer.from(f.data,'base64')]));
 const html=artifacts.filter(f=>f.path.toLowerCase().endsWith('.html'));if(!files.has('index.html')||html.length>16)throw Error('Provide index.html and at most 16 HTML pages');
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,timeout:remaining()});
 // Eligibility and identity must come from the same DOM task. Rerendering
 // between separate locator calls can otherwise identify a detached old node.
 const captureControls=(elements,{discovery=false}={})=>{
  const visible=element=>{
   const style=getComputedStyle(element);
   if(style.visibility!=='visible')return false;
   // Match controls with display:contents through their rendered descendants.
   if(style.display==='contents')return [...element.childNodes].some(child=>{
    if(child.nodeType===Node.ELEMENT_NODE)return visible(child);
    if(child.nodeType!==Node.TEXT_NODE)return false;
    const range=document.createRange();range.selectNode(child);const rect=range.getBoundingClientRect();
    return rect.width>0&&rect.height>0;
   });
   if(element.checkVisibility&&!element.checkVisibility())return false;
   const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0;
  };
  const identify=element=>{
   if(element.tagName==='LABEL')element=element.control??element;
   if(!element.isConnected)return null;
   for(const attribute of ['id','data-testid','aria-label','name']){
    const value=element.getAttribute(attribute);
    if(value&&document.querySelectorAll('['+attribute+'="'+CSS.escape(value)+'"]').length===1)return attribute+':'+value;
   }
   const parts=[];for(let current=element;current&&current!==document.body;current=current.parentElement){
    const siblings=[...current.parentElement?.children??[]].filter(e=>e.tagName===current.tagName);
    const index=siblings.indexOf(current);if(index<0)return null;
    parts.push(current.tagName.toLowerCase()+':nth-of-type('+(index+1)+')');
   }
   return parts.reverse().join('>');
  };
  if(discovery){
   if(globalThis.origin!=='null')throw Error('Hosting sandbox did not create an opaque origin');
   if(document.querySelector('a[download],a[target]:not([target=""]):not([target="_self"]),form[target]:not([target=""]):not([target="_self"])'))throw Error('Hosting does not support downloads or popup targets; use in-page controls');
   if(elements.length>256)throw Error('Too many interactive controls for browser validation');
  }
  return elements.filter(element=>element.isConnected&&(!discovery||(
   visible(element)&&!element.matches(':disabled')&&element.closest('[aria-disabled="true"],[aria-disabled="false"]')?.getAttribute('aria-disabled')!=='true'&&
   !(element.tagName==='A'&&new URL(element.getAttribute('href'),location.href).origin!==location.origin)
  ))).map(identify).filter(identity=>identity!==null);
 };
 const discover=async(page,scope)=>{
  const controls=page.locator('button,input:not([type=hidden]),select,textarea,[role=button],[contenteditable=true],a[href],[role=link]');
  const identities=await controls.evaluateAll(captureControls,{discovery:true});
  for(const identity of identities)encountered.add(scope+identity);
 };
 try{
  // Independent viewport suites overlap actionability waits. Each scenario
  // retains its own context; settle both suites before closing the browser.
  const outcomes=await Promise.allSettled([{width:1280,height:800},{width:390,height:844}].map(async viewport=>{
   // Every scenario already performs the complete startup checks in a clean
   // context. Smoke only HTML entries without an exact matching scenario path.
   const covered=new Set(plan.scenarios.map(scenario=>scenario.path));
   const runs=[...html.filter(f=>!covered.has(f.path)).map(f=>({name:'load '+f.path,path:f.path,steps:[]})),...plan.scenarios];
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
     for(const [stepIndex,step] of scenario.steps.entries()){
      try{
      page.setDefaultTimeout(remaining());const locator=step.selector===undefined?null:page.locator(step.selector).nth(step.index??0);
      if(['fill','click','check','select','press'].includes(step.action)){
       const identityDeadline=Date.now()+remaining();let identities=[];
       // A reactive render can replace the matched element after visibility
       // succeeds. Capture the replacement before acting instead of recording
       // an empty coverage result while Playwright acts on the replacement.
       while(!identities.length){
        const timeout=Math.min(remaining(),identityDeadline-Date.now());
        if(timeout<=0)throw Error('Visible control identity did not stabilize');
        await locator.waitFor({state:'visible',timeout});
        identities=await locator.evaluateAll(captureControls);
       }
       for(const identity of identities)exercised.add(scope+identity);
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
        if(action==='expectChecked'){
         if(!(e instanceof HTMLInputElement)||!['checkbox','radio'].includes(e.type))throw Error('expectChecked requires an input[type=checkbox] or input[type=radio]. For button state, use expectVisible with :enabled or :disabled.');
         return e.checked===checked;
        }
        return false;
       },step,{timeout:remaining()});
      }
      checks++;await discover(page,scope);
      if(errors.length)throw Error(errors.join('\n'));
      }catch(error){
       const browserFailure={scenarioIndex:plan.scenarios.indexOf(scenario),stepIndex,viewportWidth:viewport.width,action:step.action,category:error?.name==='TimeoutError'?'timeout':'step-failed'};
       const failed=message=>Object.assign(Error(message),{browserFailure});
       if(typeof step.selector==='string'&&/\\["']/.test(step.selector))throw failed('The parsed selector contains a literal backslash before a quote. If that quote delimits an attribute value, use plain CSS such as input[type=checkbox] or input[type="checkbox"], without a second layer of JSON escaping. Correct the selector and keep the intended coverage. '+error.message);
       throw Object.assign(error,{browserFailure});
      }
     }
     if(errors.length)throw Error(errors.join('\n'));
    }catch(error){throw Object.assign(Error(viewport.width+'px / '+scenario.name+': '+error.message),{browserFailure:error.browserFailure});}
    finally{await context.close();}
   }
  }));
  const failed=outcomes.find(outcome=>outcome.status==='rejected');if(failed)throw failed.reason;
  const missing=[...encountered].filter(key=>!exercised.has(key));
  if(missing.length)throw Error('Add browser tests that operate these visible controls: '+missing.slice(0,20).join(', '));
  return {browserVersion:browser.version(),checks};
 }finally{await browser.close();}
}

export function browserDriverSource(){
 return `const {chromium}=require('/opt/bok-browser/node_modules/playwright-core');\nconst exerciseBrowser=${exerciseBrowser.toString()};\nconst browserFailureDiagnostic=${browserFailureDiagnostic.toString()};\n(async()=>{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>3*1024*1024)throw Error('browser input bound');}try{const value=await exerciseBrowser(JSON.parse(input),chromium);process.stdout.write(JSON.stringify({passed:true,...value}));}catch(error){process.stdout.write(JSON.stringify({passed:false,error:String(error.message).slice(0,12000),failure:browserFailureDiagnostic(error.browserFailure)}));process.exitCode=1;}})().catch(()=>process.exitCode=1);`;
}
export function browserInput({artifacts,plan,origin,boardOrigin,deadline}){return {artifacts,plan,origin,headers:hostingHeaders(origin,boardOrigin),types:HOSTING_TYPES,deadline};}
export function browserReceipt(result,{artifacts,plan,origin,boardOrigin}){
 return validateBrowserReceipt({passed:true,...result,artifactSha256:artifactIdentity(artifacts),planSha256:sha(JSON.stringify(plan)),policyHash:hostingPolicyHash(origin,boardOrigin)});
}
