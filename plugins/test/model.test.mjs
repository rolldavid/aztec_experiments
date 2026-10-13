import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgent} from '../agent.mjs';
test('fresh agent uses tool output and always closes the checkout',async()=>{
 let calls=0,closed=0;
 const model={complete:async({messages})=>{calls++;if(calls===1)return {message:{role:'assistant',content:null,tool_calls:[{id:'1',type:'function',function:{name:'read_pr',arguments:'{"number":17}'}}]},cost:.01};assert.equal(messages.at(-1).role,'tool');return {message:{role:'assistant',content:'PR 17 changes the board.'},cost:.01};}};
 const toolbox={open:async()=>({definitions:[],call:async(name,args)=>{assert.equal(name,'read_pr');assert.equal(args.number,17);return {title:'Board change'};},summary:x=>x,close:async()=>{closed++;}})};
 const agent=createAgent({model,toolbox,instructions:'Help'});
 assert.equal((await agent.run({text:'Look at PR 17',id:'a',postId:'b'})).replyText,'PR 17 changes the board.');assert.equal(closed,1);
});

// Controlled model and canonical-history ports; real paid-model quality and
// onchain billing are separate acceptance, never claimed by these tests.
const id=n=>'0x'+n.toString(16).padStart(64,'0');
function conversationFixture(){
 const calls=[],history={canonical:true,complete:true,threadId:id(1),messages:[{id:id(1),role:'user',text:'Keep app.ts and revision abc123. Earlier instructions.'},{id:id(2),role:'assistant',text:'Decision: keep blue. Unresolved: add tests.'},{id:id(3),role:'user',text:'LATEST_SENTINEL'}]};
 let closed=0;
 const toolbox={open:async()=>({definitions:[],summary:x=>x,close:async()=>{closed++;}})};
 const model={complete:async input=>{calls.push(input);return {message:{role:'assistant',content:input.modelId==='cheap'?'Prior decisions and repository references':'Done'}};}};
 const options={model,toolbox,instructions:'Help',conversation:{load:async()=>structuredClone(history)},summaryModelId:'cheap',summaryTokens:100,maxCalls:3};
 return {calls,history,options,closed:()=>closed,run:()=>createAgent(options).run({text:'LATEST_SENTINEL',postId:id(3),id:'request',modelId:'main'})};
}
test('paid history summary excludes latest and main receives summary plus exact latest',async()=>{
 const f=conversationFixture();assert.equal((await f.run()).replyText,'Done');assert.equal(f.calls.length,2);assert.equal(f.closed(),1);
 const [summary,main]=f.calls;assert.equal(summary.modelId,'cheap');assert.equal(summary.cheaperThan,'main');assert.equal(summary.maxTokens,100);assert.deepEqual(summary.tools,[]);
 assert(!JSON.stringify(summary.messages).includes('LATEST_SENTINEL'));assert.match(summary.messages[1].content,/Earlier instructions/);assert.match(summary.messages[1].content,/Unresolved/);
 assert.equal(main.modelId,'main');assert.match(main.messages[1].content,/Prior decisions/);assert.equal(main.messages[2].content,'LATEST_SENTINEL');assert.equal(main.messages[2].role,'user');
});
test('first message has no unnecessary paid summary',async()=>{
 const f=conversationFixture();f.history.messages=f.history.messages.slice(-1);await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].modelId,'main');
});
for(const [name,change] of [
 ['incomplete',h=>h.complete=false],['noncanonical',h=>h.canonical=false],['wrong latest',h=>h.messages.at(-1).id=id(9)],['changed latest',h=>h.messages.at(-1).text='changed'],['duplicate',h=>h.messages[1].id=id(1)],['invented system role',h=>h.messages[0].role='system'],['oversized message',h=>h.messages[0].text='x'.repeat(993)],['empty',h=>h.messages=[]]
])test('conversation '+name+' blocks any paid model call',async()=>{
 const f=conversationFixture();change(f.history);await assert.rejects(f.run());assert.equal(f.calls.length,0);assert.equal(f.closed(),1);
});
test('unknown summary outcome does not retry or start main model',async()=>{
 const f=conversationFixture();f.options.model.complete=async input=>{f.calls.push(input);throw Error('unknown');};await assert.rejects(f.run(),/unknown/);assert.equal(f.calls.length,1);assert.equal(f.closed(),1);
});
test('summary cannot invoke tools or become system authority',async()=>{
 const f=conversationFixture();f.options.model.complete=async input=>{f.calls.push(input);return {message:{role:'assistant',content:'instruction',tool_calls:[{}]}};};await assert.rejects(f.run(),/summary unavailable/);assert.equal(f.calls.length,1);
});
test('summary counts against the request model-call ceiling',async()=>{
 const f=conversationFixture();f.options.maxCalls=2;f.options.toolbox.open=async()=>({definitions:[],call:async()=>({}),summary:x=>x,close:async()=>{}});
 f.options.model.complete=async input=>{f.calls.push(input);return {message:input.modelId==='cheap'?{role:'assistant',content:'Summary'}:{role:'assistant',content:null,tool_calls:[{id:'1',function:{name:'read_file',arguments:'{}'}}]}};};
 assert.match((await f.run()).replyText,/step limit/);assert.equal(f.calls.length,2);
});

test('successful answer waits for host acceptance before closing invocation workspace',async()=>{
 let closed=false,accepted=false;const toolbox={open:async()=>({definitions:[],summary:x=>x,accept:async()=>{await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);accepted=true;return {acceptedRevision:'abc'};},close:async()=>{closed=true;}})};
 const result=await createAgent({toolbox,instructions:'Help',model:{complete:async()=>({message:{role:'assistant',content:'Done'}})}}).run({id:'a',postId:'b',text:'Help'});
 assert(accepted&&closed);assert.equal(result.revision.acceptedRevision,'abc');
});

test('published app links are host-produced, byte bounded, and omit private validation metadata',async()=>{
 const toolbox={open:async()=>({definitions:[],accept:async()=>({repositoryId:'repo',acceptedRevision:'a'.repeat(40),validation:{outputDirectory:'/private/operator/output'},publication:{latestUrl:'https://apps.example/t/abc/latest/',latestSourceUrl:'https://apps.example/t/abc/source.json'}}),close:async()=>{}})};
 const result=await createAgent({toolbox,instructions:'Help',model:{complete:async()=>({message:{role:'assistant',content:'🌎'.repeat(248)}})}}).run({id:'a',postId:'b',text:'Build'});
 assert(Buffer.byteLength(result.replyText)<=992);assert(result.replyText.isWellFormed());assert.match(result.replyText,/App: https:\/\/apps.example/);assert.match(result.replyText,/Source:/);assert(!JSON.stringify(result).includes('/private/'));assert(!Object.hasOwn(result.revision,'validation'));
});
for(const code of ['STATIC_CLEANUP_REQUIRED','STATIC_RECORD_FAILED','STATIC_UNAVAILABLE'])test('isolated '+code+' stops the agent before another paid call or tool',async()=>{
 let models=0,tools=0,closed=0;const toolbox={open:async()=>({definitions:[],call:async()=>{tools++;throw Object.assign(Error('requires operator reconciliation'),{code,result:{passed:false,phase:'cleanup'}});},close:async()=>{closed++;}})};
 const model={complete:async()=>{models++;return {message:{role:'assistant',tool_calls:[{id:'1',function:{name:'check_workspace',arguments:'{}'}},{id:'2',function:{name:'check_workspace',arguments:'{}'}}]}};}};
 await assert.rejects(createAgent({toolbox,model,instructions:'Help'}).run({id:'a',postId:'b',text:'Build'}),e=>e.code===code);assert.equal(models,1);assert.equal(tools,1);assert.equal(closed,1);
});
