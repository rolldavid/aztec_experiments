import test from 'node:test';import assert from 'node:assert/strict';
import {veniceMeteredProvider} from '../venice-metered.mjs';
const spec={availableContextTokens:256000,maxCompletionTokens:100,capabilities:{supportsFunctionCalling:true},pricing:{input:{usd:.56},output:{usd:3.5}}};
const input={messages:[{role:'user',content:'Hi'}],tools:[],maxTokens:20};
test('operator preflight failure prevents quoting an executable paid request',async()=>{
 let inference=0;const client={json:async path=>{if(path==='/api/v1/models')return {data:[{id:'kimi-k2-5',model_spec:spec}]};inference++;},balance:async()=>({canConsume:false})};
 await assert.rejects(veniceMeteredProvider({client}).quote(input,1000000n),/funding/);assert.equal(inference,0);
});
test('reasoning cap, disabled billable extras and measured usage are preserved',async()=>{
 let body;const client={balance:async()=>({canConsume:true,balanceUsd:10}),json:async(path,options)=>{
  if(path==='/api/v1/models')return {data:[{id:'kimi-k2-5',model_spec:spec}]};body=options.body;return {id:'r',choices:[{message:{role:'assistant',content:'Hello'}}],usage:{prompt_tokens:20,completion_tokens:10}};
 }};const provider=veniceMeteredProvider({client}),q=await provider.quote(input,1000000n),result=await provider.execute(input,q);
 assert.deepEqual(body,{model:'kimi-k2-5',messages:input.messages,max_completion_tokens:20,n:1,stream:false,venice_parameters:{include_venice_system_prompt:false,enable_web_search:'off',enable_web_scraping:false,enable_x_search:false}});assert.equal(body.max_completion_tokens,20);assert.equal(body.venice_parameters.enable_web_search,'off');assert.equal(body.venice_parameters.include_venice_system_prompt,false);assert.equal(result.charge,47n);
});
test('concurrent low-credit quotes share one replenishment and recheck credits',async()=>{
 let credits=0,topUps=0,release;const entered=new Promise(r=>release=r);
 const client={json:async()=>({data:[{id:'kimi-k2-5',model_spec:spec}]}),balance:async()=>({canConsume:credits>0,balanceUsd:credits}),topUp:async()=>{topUps++;await entered;credits=5;}};
 const provider=veniceMeteredProvider({client,autoTopUp:true});
 const quotes=[provider.quote(input,1000000n),provider.quote(input,1000000n)];
 await new Promise(r=>setImmediate(r));assert.equal(topUps,1);release();
 await Promise.all(quotes);assert.equal(topUps,1);
});

import {getVeniceDiagnostic} from '../venice-diagnostics.mjs';
function malformed(result){let calls=0;const client={balance:async()=>({canConsume:true,balanceUsd:10}),json:async path=>{if(path.endsWith('/models'))return {data:[{id:'kimi-k2-5',model_spec:spec}]};calls++;return result;}};return {provider:veniceMeteredProvider({client}),calls:()=>calls};}
const valid=()=>({id:'fixture-response',choices:[{message:{role:'assistant',content:'PRIVATE_SENTINEL'}}],usage:{prompt_tokens:20,completion_tokens:10}});
for(const [name,change,stage] of [
 ['missing result',()=>null,'missing-result/usage'],['missing usage',r=>({...r,usage:undefined}),'missing-result/usage'],['malformed token usage',r=>({...r,usage:{prompt_tokens:'PRIVATE_SENTINEL',completion_tokens:1}}),'missing-result/usage'],
 ['cap',r=>({...r,usage:{prompt_tokens:20,completion_tokens:21}}),'cap'],['cached billing',r=>({...r,usage:{...r.usage,prompt_tokens_details:{cached_tokens:1}}}),'cached-billing'],['receipt validation',r=>({...r,id:'PRIVATE_SENTINEL!'}),'final-receipt-validation'],
 ['throwing result getter',r=>Object.defineProperty(r,'usage',{get(){throw Error('PRIVATE_SENTINEL');}}),'missing-result/usage']
])test('mock billing: '+name+' yields fixed stage and no second call',async()=>{
 const h=malformed(change(valid())),q=await h.provider.quote(input,1000000n);
 await assert.rejects(h.provider.execute(input,q),error=>{assert.deepEqual(getVeniceDiagnostic(error),{category:'billing-validation',httpStatus:null,code:null,param:null,billingStage:stage});assert(!error.stack.includes('PRIVATE_SENTINEL'));return true;});assert.equal(h.calls(),1);
});
test('changing usage getter cannot alter validated billing facts on a second read',async()=>{
 const result=valid();let reads=0;Object.defineProperty(result.usage,'prompt_tokens',{get(){return ++reads===1?20:'PRIVATE_SENTINEL';}});
 const h=malformed(result),q=await h.provider.quote(input,1000000n),r=await h.provider.execute(input,q);
 assert.equal(reads,1);assert.equal(r.billing.promptTokens,20);assert.equal(r.charge,47n);assert.equal(h.calls(),1);
});

import {veniceClient} from '../venice.mjs';
test('mock HTTP200 malformed billing preserves actual HTTP status and stops after one completion',async()=>{
 let completions=0;const client=veniceClient({signer:{address:'fixture',signIn:async()=> 'fixture'},fetchImpl:async url=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'kimi-k2-5',model_spec:spec}]});
  if(url.includes('/balance/'))return Response.json({data:{balanceUsd:10,canConsume:true}});
  completions++;return Response.json({...valid(),usage:{prompt_tokens:20,completion_tokens:21}});
 }});
 const provider=veniceMeteredProvider({client}),q=await provider.quote(input,1000000n);
 await assert.rejects(provider.execute(input,q),error=>{assert.deepEqual(getVeniceDiagnostic(error),{category:'billing-validation',httpStatus:200,code:null,param:null,billingStage:'cap'});return true;});assert.equal(completions,1);
});

// Real operator-only HTTP400 diagnosis confirmed that an empty tools array is
// rejected; do not change the model, output cap or billing flags to address it.
for(const tools of [undefined,[],[{type:'function',function:{name:'lookup',description:'Read a public record',parameters:{type:'object',properties:{}}}}]])
 test('outgoing model request omits empty tools and preserves real tools: '+(tools?.length??0)+(tools===undefined?' absent':''),async()=>{
  let attempts=0;let body;
  const client={balance:async()=>({canConsume:true,balanceUsd:10}),json:async(path,options)=>{
   if(path.endsWith('/models'))return {data:[{id:'kimi-k2-5',model_spec:spec}]};
   attempts++;body=JSON.parse(JSON.stringify(options.body));
   assert(!(Object.hasOwn(body,'tools')&&Array.isArray(body.tools)&&body.tools.length===0),'Provider rejects empty tools');
   return valid();
  }};
  const request={...input,...(tools===undefined?{}:{tools})};if(tools===undefined)delete request.tools;
  const p=veniceMeteredProvider({client}),q=await p.quote(request,1000000n);await p.execute(request,q);
  assert.equal(attempts,1);assert.equal(body.max_completion_tokens,20);
  if(tools?.length)assert.deepEqual(body.tools,tools);else assert.equal(Object.hasOwn(body,'tools'),false);
 });
