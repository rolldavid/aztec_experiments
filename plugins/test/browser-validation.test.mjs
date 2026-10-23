import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrowserPlan,exerciseBrowser,browserInput,browserReceipt,validateBrowserReceipt} from '../browser-validation.mjs';
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
for(const [name,html,steps,pattern] of [
 ['startup storage','<script>localStorage.getItem("x")</script>',[],/localStorage|SecurityError/],
 ['interaction storage','<button id="go">Go</button><script>go.onclick=()=>localStorage.setItem("x","1")</script>',[{action:'click',selector:'#go'}],/localStorage|SecurityError/],
 ['native dialog','<button id="go">Go</button><script>go.onclick=()=>alert("x")</script>',[{action:'click',selector:'#go'}],/sandbox|dialog|allow-modals/i],
 ['worker','<script>new Worker("worker.js")</script>',[],/worker|policy/i],
 ['missing control coverage','<button>First</button><button>Second</button>',[{action:'click',selector:'button',index:0}],/visible controls/],
 ['anonymous duplicate checkbox coverage','<input type="checkbox"><input type="checkbox">',[{action:'check',selector:'input',index:0,checked:true}],/visible controls/],
 ['absolute internal link coverage','<a href="https://artifacts.example/t/'+ '1'.repeat(64) +'/latest/index.html">Internal</a>',[],/visible controls/],
 ['popup declaration','<a href="https://example.com" target="_blank">External</a>',[],/popup targets/],
 ['query resource mismatch','<script src="app.js?v=1"></script>',[],/rejected|400/i],
 ['unhandled offline API','<script>fetch("https://api.example/value")</script>',[],/fetch|Failed/i],
])test('actual browser rejects '+name,{skip:!actual,timeout:40000},async()=>assert.rejects(run(html,steps),pattern));
test('actual browser permits handled unavailable API with visible outcome',{skip:!actual,timeout:40000},async()=>{
 const receipt=await run('<output id="status">Loading</output><script>fetch("https://api.example/value").then(()=>status.textContent="Online").catch(()=>document.querySelector("#status").textContent="Unavailable");</script>',[{action:'expectText',selector:'#status',text:'Unavailable'}]);assert(receipt.passed);
});
