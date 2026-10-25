import test from 'node:test';
import assert from 'node:assert/strict';
import {browserPlanDiagnostic,validateBrowserPlan,exerciseBrowser,browserInput,browserReceipt,validateBrowserReceipt} from '../browser-validation.mjs';
const plan=steps=>({version:1,scenarios:[{name:'use app',path:'index.html',steps:[...steps,{action:'reload'},{action:'expectVisible',selector:'body'}]}]});
for(const [name,value] of [
 ['missing scenarios',{version:1,scenarios:[]}],
 ['arbitrary JS',plan([{action:'evaluate',code:'process.env'}])],
 ['permission grant',plan([{action:'click',selector:'button',permissions:['geolocation']}])],
 ['traversal',{version:1,scenarios:[{name:'x',path:'../index.html',steps:[{action:'reload'},{action:'expectVisible',selector:'body'}]}]}],
 ['no reload',{version:1,scenarios:[{name:'x',path:'index.html',steps:[{action:'expectVisible',selector:'body'}]}]}],
 ['no assertion',{version:1,scenarios:[{name:'x',path:'index.html',steps:[{action:'reload'}]}]}],
])test('browser plan rejects '+name,()=>assert.throws(()=>validateBrowserPlan(value)));
test('browser plan accepts bounded declarative interactions',()=>assert(validateBrowserPlan(plan([{action:'click',selector:'button'}]))));
test('browser plan reports the exact excess step across scenarios without relaxing the limit',()=>{
 const atLimit=plan(Array.from({length:254},()=>({action:'click',selector:'button'})));assert.equal(validateBrowserPlan(atLimit),atLimit);
 const over=structuredClone(atLimit);over.scenarios.push({name:'another',path:'index.html',steps:[{action:'expectVisible',selector:'body'}]});
 assert.throws(()=>validateBrowserPlan(over),error=>{
  assert.deepEqual(error.browserPlan,{code:'BROWSER_STEP_LIMIT',path:'scenarios[1].steps[0]',message:'Use at most 256 steps across all scenarios.'});return true;
 });
});
test('browser plan permits adding feature coverage beyond the old 64-step ceiling',()=>{
 const expanded=plan(Array.from({length:80},()=>({action:'expectVisible',selector:'body'})));assert.equal(validateBrowserPlan(expanded),expanded);
 const over=plan(Array.from({length:255},()=>({action:'expectVisible',selector:'body'})));assert.throws(()=>validateBrowserPlan(over),error=>error.browserPlan.path==='scenarios[0].steps[256]');
});
test('browser plan diagnoses field and action without echoing untrusted values',()=>{
 for(const [step,code,field] of [[{action:'PRIVATE_SOURCE_SENTINEL'},'BROWSER_ACTION','action'],[{action:'check',selector:'#PRIVATE_SOURCE_SENTINEL',checked:'PRIVATE_SOURCE_SENTINEL'},'BROWSER_CHECKED','checked'],[{action:'expectCount',selector:'body',count:-1},'BROWSER_COUNT','count'],[{action:'reload',index:0},'BROWSER_INDEX_ACTION','index']]){
  assert.throws(()=>validateBrowserPlan(plan([step])),error=>{assert.equal(error.browserPlan.code,code);assert.equal(error.browserPlan.path,'scenarios[0].steps[0].'+field);assert(!JSON.stringify(error.browserPlan).includes('PRIVATE_SOURCE_SENTINEL'));return true;});
 }
 for(const value of [{code:'PRIVATE_SOURCE_SENTINEL',path:'$'},{code:'BROWSER_JSON',path:'PRIVATE_SOURCE_SENTINEL'}])assert.equal(browserPlanDiagnostic(value),undefined);
 assert.deepEqual(browserPlanDiagnostic({code:'BROWSER_JSON',path:'$',message:'PRIVATE_SOURCE_SENTINEL',source:'PRIVATE_SOURCE_SENTINEL'}),{code:'BROWSER_JSON',path:'$',message:'Use valid JSON in browser-tests.json.'});
});
const actual=process.env.BOK_BROWSER_TESTS==='1';
const run=async(html,steps=[],more=[])=>{
 const {chromium}=await import('playwright');
 const input={artifacts:[{path:'index.html',data:Buffer.from('<!doctype html><meta charset="utf-8"><title>Fixture</title><p>Fixture</p>'+html).toString('base64')},...more],plan:validateBrowserPlan(plan(steps)),origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000};
 return browserReceipt(await exerciseBrowser(browserInput(input),chromium),input);
};
test('actual browser supports fragment state, interactions and reload under production policy',{skip:!actual,timeout:40000},async()=>{
 const receipt=await run('<button id="add">Add</button><output id="value"></output><script>const render=()=>value.textContent=String(Number(location.hash.slice(1))||0);render();add.onclick=()=>{location.replace("#"+(Number(location.hash.slice(1))+1));render();};</script>',[
  {action:'click',selector:'#add'},{action:'expectText',selector:'#value',text:'1'},{action:'reload'},{action:'expectText',selector:'#value',text:'1'},
 ]);
 assert.equal(receipt.passed,true);assert(receipt.checks>4);assert(validateBrowserReceipt(receipt,{artifactSha256:receipt.artifactSha256,policyHash:receipt.policyHash}));
 assert.throws(()=>validateBrowserReceipt(receipt,{policyHash:'0'.repeat(64)}));
});
// Each change replaces the input immediately, then hashchange replaces it again.
// Anonymous siblings must retain distinct identities without detached nth-of-type(0).
const recreatedCheckboxes=count=>`<div id="list"></div><output id="value"></output><script>
const count=${count};
function render(){
 const state=Array.from({length:count},(_,i)=>location.hash.slice(1)[i]==='1');
 document.querySelector('#list').replaceChildren();
 state.forEach((checked,i)=>{
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.checked=checked;
  input.onchange=()=>{state[i]=input.checked;location.replace('#'+state.map(v=>v?'1':'0').join(''));render();};
  label.append(input,document.createTextNode('Habit '+i));document.querySelector('#list').append(label);
 });
 document.querySelector('#value').textContent=state.filter(Boolean).length+' done';
}
addEventListener('hashchange',render);render();</script>`;
test('actual browser covers recreated anonymous controls across synchronous and hashchange renders',{skip:!actual,timeout:40000},async()=>{
 const receipt=await run(recreatedCheckboxes(3),[
  {action:'check',selector:'#list input',index:0,checked:true},
  {action:'expectChecked',selector:'#list input',index:0,checked:true},
  {action:'click',selector:'#list label',index:1},
  {action:'expectChecked',selector:'#list input',index:1,checked:true},
  {action:'check',selector:'#list input',index:2,checked:true},
  {action:'expectText',selector:'#value',text:'3 done'},
  {action:'reload'},{action:'expectText',selector:'#value',text:'3 done'},
 ]);
 assert.equal(receipt.passed,true);
});
test('actual browser still rejects a real unexercised recreated sibling',{skip:!actual,timeout:40000},async()=>{
 await assert.rejects(run(recreatedCheckboxes(2),[
  {action:'check',selector:'#list input',index:0,checked:true},
  {action:'expectText',selector:'#value',text:'1 done'},
 ]),error=>/visible controls/.test(error.message)&&error.message.includes('label:nth-of-type(2)>input:nth-of-type(1)')&&!error.message.includes('nth-of-type(0)'));
});
test('actual browser discovery excludes hidden and disabled controls',{skip:!actual,timeout:40000},async()=>{
 assert((await run('<button style="display:none">Hidden</button><button style="visibility:hidden">Invisible</button><fieldset disabled><input></fieldset><div aria-disabled="true"><button>Disabled</button></div><details><summary>Closed</summary><button>Inside closed details</button></details>')).passed);
});
for(const [name,html,steps,pattern] of [
 ['startup storage','<script>localStorage.getItem("x")</script>',[],/localStorage|SecurityError/],
 ['interaction storage','<button id="go">Go</button><script>go.onclick=()=>localStorage.setItem("x","1")</script>',[{action:'click',selector:'#go'}],/localStorage|SecurityError/],
 ['native dialog','<button id="go">Go</button><script>go.onclick=()=>alert("x")</script>',[{action:'click',selector:'#go'}],/sandbox|dialog|allow-modals/i],
 ['worker','<script>new Worker("worker.js")</script>',[],/worker|policy/i],
 ['missing control coverage','<button>First</button><button>Second</button>',[{action:'click',selector:'button',index:0}],/visible controls/],
 ['anonymous duplicate checkbox coverage','<input type="checkbox"><input type="checkbox">',[{action:'check',selector:'input',index:0,checked:true}],/visible controls/],
 ['re-enabled descendant coverage','<div aria-disabled="true"><button aria-disabled="false">Enabled</button></div>',[],/visible controls/],
 ['absolute internal link coverage','<a href="https://artifacts.example/t/'+ '1'.repeat(64) +'/latest/index.html">Internal</a>',[],/visible controls/],
 ['popup declaration','<a href="https://example.com" target="_blank">External</a>',[],/popup targets/],
 ['query resource mismatch','<script src="app.js?v=1"></script>',[],/rejected|400/i],
 ['unhandled offline API','<script>fetch("https://api.example/value")</script>',[],/fetch|Failed/i],
])test('actual browser rejects '+name,{skip:!actual,timeout:40000},async()=>assert.rejects(run(html,steps),pattern));
test('actual browser permits handled unavailable API with visible outcome',{skip:!actual,timeout:40000},async()=>{
 const receipt=await run('<output id="status">Loading</output><script>fetch("https://api.example/value").then(()=>status.textContent="Online").catch(()=>document.querySelector("#status").textContent="Unavailable");</script>',[{action:'expectText',selector:'#status',text:'Unavailable'}]);assert(receipt.passed);
});

test('actual browser shares a scenario startup check with its exact HTML smoke path',{skip:!actual,timeout:40000},async()=>{
 const {chromium}=await import('playwright'),contexts=[];
 const observed={launch:async options=>{const browser=await chromium.launch(options);return {
  newContext:async options=>{contexts.push(options.viewport.width);return browser.newContext(options);},version:()=>browser.version(),close:()=>browser.close(),
 };}};
 const input={artifacts:[{path:'index.html',data:Buffer.from('<!doctype html><p>Ready</p>').toString('base64')}],plan:validateBrowserPlan(plan([])),origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000};
 const result=await exerciseBrowser(browserInput(input),observed);assert.deepEqual(contexts,[1280,390]);assert.equal(result.checks,6,'one startup plus both scenario steps per viewport');
});
test('actual browser still smoke-checks uncovered HTML and keeps each scenario context fresh',{skip:!actual,timeout:40000},async()=>{
 const {chromium}=await import('playwright'),contexts=[];
 const observed={launch:async options=>{const browser=await chromium.launch(options);return {
  newContext:async options=>{contexts.push(options.viewport.width);return browser.newContext(options);},version:()=>browser.version(),close:()=>browser.close(),
 };}};
 const input={artifacts:[{path:'index.html',data:Buffer.from('<!doctype html><p>Ready</p>').toString('base64')},{path:'help.html',data:Buffer.from('<!doctype html><p>Help</p>').toString('base64')}],plan:validateBrowserPlan({version:1,scenarios:[...plan([]).scenarios,{...plan([]).scenarios[0],name:'second clean visit'}]}),origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000};
 const result=await exerciseBrowser(browserInput(input),observed);assert.deepEqual(contexts.sort((a,b)=>a-b),[390,390,390,1280,1280,1280]);assert.equal(result.checks,14);
 input.artifacts[1].data=Buffer.from('<!doctype html><p>Help</p><script>localStorage.getItem("forbidden")</script>').toString('base64');
 await assert.rejects(exerciseBrowser(browserInput(input),observed),error=>/load help.html/.test(error.message)&&/localStorage|SecurityError/.test(error.message));
});


test('actual browser identifies extra quote escaping without silently repairing the selector',{skip:!actual,timeout:40000},async()=>{
 const selector=JSON.parse(JSON.stringify({selector:String.raw`input[type=\"checkbox\"]`})).selector;
 assert(selector.includes(String.fromCharCode(92,34)),'fixture retains literal backslash and quote after JSON decoding');
 await assert.rejects(run('<input type="checkbox">',[
  {action:'check',selector,checked:true},{action:'expectChecked',selector,checked:true},
 ]),error=>error.message.includes('literal backslash before a quote')&&error.message.includes('input[type=checkbox]')&&error.message.includes('keep the intended coverage'));
});
for(const [name,selector]of [['quoted attribute','input[type="checkbox"]'],['intentional CSS quote escape',String.raw`input[data-name="a\"b"]`]])test('actual browser preserves matching '+name,{skip:!actual,timeout:40000},async()=>{
 const result=await run('<input type="checkbox" data-name="a&quot;b">',[
  {action:'check',selector,checked:true},{action:'expectChecked',selector,checked:true},
 ]);assert.equal(result.passed,true);
});

test('parallel viewport failures drain both fresh contexts before browser closes',async()=>{
 const events=[];let release,started;const secondStarted=new Promise(resolve=>{started=resolve;}),secondPending=new Promise(resolve=>{release=resolve;});
 const chromium={launch:async()=>({newContext:async({viewport})=>{
  const width=viewport.width;events.push('create:'+width);
  return {setDefaultTimeout(){},setDefaultNavigationTimeout(){},route:async()=>{},exposeBinding:async()=>{},addInitScript:async()=>{},
   newPage:async()=>{if(width===390){started();await secondPending;}throw Error('failed:'+width);},close:async()=>{events.push('close:'+width);}};
 },close:async()=>{events.push('browser-close');}})};
 const input=browserInput({artifacts:[{path:'index.html',data:Buffer.from('<p>Ready</p>').toString('base64')}],plan:plan([]),origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000});
 let completed=false;const running=exerciseBrowser(input,chromium).finally(()=>{completed=true;});
 await secondStarted;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events.slice(0,2),['create:1280','create:390']);assert(events.includes('close:1280'));assert.equal(completed,false);assert(!events.includes('browser-close'));
 release();await assert.rejects(running,/1280px.*failed:1280/);
 assert.deepEqual(events.slice(-2),['close:390','browser-close']);
});

test('reactive replacement retries identity capture without repeating the action',async()=>{
 const contexts=[];
 const chromium={launch:async()=>({newContext:async()=>{
  const state={captures:0,clicks:0,closed:false};contexts.push(state);
  const control={nth(){return this;},waitFor:async()=>{},evaluateAll:async()=>++state.captures===1?[]:['id:button'],click:async()=>{state.clicks++;}};
  const page={on(){},setDefaultTimeout(){},goto:async()=>{},reload:async()=>{},locator:selector=>selector==='#button'?control:selector==='body'?{innerText:async()=>'Ready',nth(){return this;},waitFor:async()=>{}}:{evaluateAll:async()=>['id:button']}};
  return {setDefaultTimeout(){},setDefaultNavigationTimeout(){},route:async()=>{},exposeBinding:async()=>{},addInitScript:async()=>{},newPage:async()=>page,close:async()=>{state.closed=true;}};
 },version:()=> '153.0.8010.12',close:async()=>{}})};
 const input=browserInput({artifacts:[{path:'index.html',data:Buffer.from('<button id="button">Ready</button>').toString('base64')}],plan:plan([{action:'click',selector:'#button'}]),origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000});
 assert.equal((await exerciseBrowser(input,chromium)).checks,8);
 assert.deepEqual(contexts,[{captures:2,clicks:1,closed:true},{captures:2,clicks:1,closed:true}]);
});

for(const [name,html]of [['button','<button id="target">Clear completed</button>'],['text input','<input id="target" type="text">']])test('actual browser rejects expectChecked on a '+name+' with a specific type error',{skip:!actual,timeout:40000},async()=>{
 await assert.rejects(run(html,[{action:'expectChecked',selector:'#target',checked:false}]),error=>
  error.message.includes('expectChecked requires an input[type=checkbox] or input[type=radio]')&&error.message.includes(':enabled or :disabled')&&!error.message.includes('Timeout'));
});
test('actual browser expectChecked re-queries a replaced checkbox and supports radio state',{skip:!actual,timeout:40000},async()=>{
 const result=await run(`<input id="target" type="checkbox"><input id="radio" type="radio"><script>
 const target=document.querySelector('#target');
 Object.defineProperty(target,'checked',{get(){
  const replacement=document.createElement('input');replacement.type='checkbox';replacement.id='target';replacement.checked=true;target.replaceWith(replacement);return false;
 }});
 </script>`,[
  {action:'expectChecked',selector:'#target',checked:true},
  {action:'check',selector:'#target',checked:false},
  {action:'expectChecked',selector:'#target',checked:false},
  {action:'check',selector:'#radio',checked:true},
  {action:'expectChecked',selector:'#radio',checked:true},
 ]);assert.equal(result.passed,true);
});

test('raw browser selector objects receive a precise schema repair without exposing selector values',()=>{
 for(const selector of [{css:'#PRIVATE_SENTINEL'},{base:'input',attributes:{type:'PRIVATE_SENTINEL'}},'', 'x'.repeat(301)]){
  assert.throws(()=>validateBrowserPlan(plan([{action:'click',selector}])),error=>{
   assert.equal(error.browserPlan.code,'BROWSER_SELECTOR');assert.equal(error.browserPlan.path,'scenarios[0].steps[0].selector');
   assert.match(error.message,/CSS selector string/);assert.match(error.message,/only in edit_browser_plan arguments/);assert(!error.message.includes('PRIVATE_SENTINEL'));return true;
  });
 }
});

test('browser execution diagnostic rejects hostile labels and strips private values',async()=>{
 const {browserFailureDiagnostic}=await import('../browser-validation.mjs');
 const expected={scenarioIndex:1,stepIndex:2,viewportWidth:1280,action:'expectText',category:'timeout'};
 assert.deepEqual(browserFailureDiagnostic({...expected,selector:'PRIVATE_SOURCE',text:'PRIVATE_VALUE',message:'PRIVATE_ERROR'}),expected);
 for(const patch of [{scenarioIndex:-1},{scenarioIndex:8},{stepIndex:256},{viewportWidth:999},{action:'PRIVATE_SOURCE'},{category:'PRIVATE_ERROR'}])assert.equal(browserFailureDiagnostic({...expected,...patch}),undefined);
});
for(const timedOut of [false,true])test('serialized browser driver reports exact failing step and drains contexts '+timedOut,async()=>{
 const {browserDriverSource}=await import('../browser-validation.mjs'),{runInNewContext}=await import('node:vm');
 let closed=0,browserClosed=0,assertions=0;
 const chromium={launch:async()=>({newContext:async()=>{
  const page={on(){},setDefaultTimeout(){},goto:async()=>{},reload:async()=>{},locator:selector=>selector==='body'?{innerText:async()=>'Ready',nth(){return this;}}:{evaluateAll:async()=>[],nth(){return this;}},waitForFunction:async()=>{assertions++;throw Object.assign(Error('PRIVATE_SELECTOR PRIVATE_EXPECTED'),{name:timedOut?'TimeoutError':'Error'});}};
  return {setDefaultTimeout(){},setDefaultNavigationTimeout(){},route:async()=>{},exposeBinding:async()=>{},addInitScript:async()=>{},newPage:async()=>page,close:async()=>{closed++;}};
 },close:async()=>{browserClosed++;}})};
 const input=browserInput({artifacts:[{path:'index.html',data:Buffer.from('<p>Ready</p>').toString('base64')}],plan:{version:1,scenarios:[{name:'PRIVATE_NAME',path:'index.html',steps:[{action:'reload'},{action:'expectText',selector:'PRIVATE_SELECTOR',text:'PRIVATE_EXPECTED'}]}]},origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000});
 let output='';const process={stdin:{async *[Symbol.asyncIterator](){yield JSON.stringify(input);}},stdout:{write:v=>{output+=v;}},exitCode:0};
 await runInNewContext(browserDriverSource(),{require:()=>({chromium}),process,Buffer,URL});
 const result=JSON.parse(output);assert.equal(result.passed,false);assert.equal(process.exitCode,1);
 assert.deepEqual(result.failure,{scenarioIndex:0,stepIndex:1,viewportWidth:1280,action:'expectText',category:timedOut?'timeout':'step-failed'});
 assert.equal(closed,2);assert.equal(browserClosed,1);assert.equal(assertions,2);assert(!JSON.stringify(result.failure).includes('PRIVATE_'));
});
