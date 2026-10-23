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
