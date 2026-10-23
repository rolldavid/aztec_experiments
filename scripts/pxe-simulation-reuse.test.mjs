import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {reusePxeSimulation} from './pxe-simulation-reuse.mjs';
const source=await fs.readFile(new URL('../node_modules/@aztec-labs/pxe/dest/pxe.js',import.meta.url),'utf8');
const transformed=reusePxeSimulation(source);
function harness(){
 const start=transformed.indexOf('simulateAndProveTx(simulationTxRequest,'),end=transformed.indexOf('\n    }',start)+6;
 const calls=[],execution={witness:'private'},ctx={anchor:'fixed',changeSetId:'one'};
 const Class=vm.runInNewContext(`(class {
  operationQueue={runSynced:fn=>fn(ctx)};node={startRecording:()=>({stop(){}})};
  #simulateTx=async(context,request,options)=>{calls.push('simulate');return {privateExecutionResult:execution,gasUsed:1};};
  #getSimulatorForTx=()=>({});
  #executePrivate=async()=>{calls.push('execute');return {witness:'new'};};
  #proveTx=async(context,request,result)=>{calls.push('prove');return result;};
  #simulateTxErrorContext=()=>[];
  ${transformed.slice(start,end)}
 })`,{calls,execution,ctx,Timer:class{ms(){return 0;}},inspect:()=>''});
 const request={value:'original',toBuffer(){return Buffer.from(this.value);}},scope={toString:()=> 'owner'};
 return {pxe:new Class(),request,calls,execution,scope};
}
test('same atomic request executes private program once and still proves',async()=>{
 const h=harness();const result=await h.pxe.simulateAndProveTx(h.request,{scopes:[h.scope],prepareProve:async()=>({proveTxRequest:h.request,proveOpts:{scopes:[h.scope]}})});
 assert.equal(result,h.execution);assert.deepEqual(h.calls,['simulate','prove']);
});
for(const change of ['request','scope','sender','override'])test('changed '+change+' keeps independent private execution',async()=>{
 const h=harness();await h.pxe.simulateAndProveTx(h.request,{scopes:[h.scope],...(change==='override'?{overrides:{}}:{}),prepareProve:async()=>{
  if(change==='request')h.request.value='changed';
  return {proveTxRequest:h.request,proveOpts:{scopes:change==='scope'?[]:[h.scope],...(change==='sender'?{senderForTags:h.scope}:{})}};
 }});assert.deepEqual(h.calls,['simulate','execute','prove']);
});
test('failed simulation acceptance cannot execute or prove',async()=>{
 const h=harness();await assert.rejects(h.pxe.simulateAndProveTx(h.request,{scopes:[h.scope],prepareProve:async()=>{throw Error('reverted');}}),/reverted/);
 assert.deepEqual(h.calls,['simulate']);
});
test('transform rejects a different SDK source',()=>assert.throws(()=>reusePxeSimulation(source+'\n'),/source mismatch/));
