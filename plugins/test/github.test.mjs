import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {githubToolbox} from '../github-tools.mjs';
import {createAgent} from '../agent.mjs';
const checkoutApi=async(_method,route)=>{
 if(route.includes('/git/commits/'))return {tree:{sha:'base-tree'}};
 if(route.endsWith('/git/trees/base-tree?recursive=1'))return {sha:'base-tree',truncated:false,tree:[]};
 return {default_branch:'main'};
};

test('plain replies need no repository checkout or API request',async()=>{
 let clones=0;
 const toolbox=githubToolbox({repository:'owner/project',api:async()=>assert.fail('No repository API needed'),runCommand:async()=>{clones++;throw Error('Clone unavailable');}});
 const agent=createAgent({toolbox,instructions:'Help',model:{complete:async()=>({message:{role:'assistant',content:'V6 testnet plugin works.'}})}});
 assert.deepEqual(await agent.run({postId:'0x1',text:'Reply without tools'}),{replyText:'V6 testnet plugin works.'});
 assert.equal(clones,0);
});

test('filesystem tools share one checkout and a failed clone is never retried',async()=>{
 for(const fail of [false,true]){
  let work,clones=0;
  const toolbox=githubToolbox({repository:'owner/project',api:checkoutApi,runCommand:async(_,args)=>{
   if(args[0]==='clone'){clones++;work=args.at(-1);await fs.mkdir(work);if(fail)throw Error('Clone unavailable');await fs.writeFile(path.join(work,'file.txt'),'content');return {stdout:''};}
   if(args[0]==='rev-parse')return {stdout:'sha\n'};
   if(args[0]==='sparse-checkout'||args[0]==='checkout')return {stdout:''};
   throw Error('Unexpected command');
  }});
  const session=await toolbox.open({postId:'0x1'});
  try{
   assert.equal(clones,0);
   for(let i=0;i<2;i++){
    if(fail)await assert.rejects(session.call('read_file',{path:'file.txt'}),/Clone unavailable/);
    else assert.deepEqual(await session.call('read_file',{path:'file.txt'}),{text:'content'});
   }
   assert.equal(clones,1);
  }finally{await session.close();}
  await assert.rejects(fs.stat(path.dirname(work)),{code:'ENOENT'});
 }
});

test('exact edits preserve all other bytes and reject ambiguous, stale or oversized edits before mutation',async()=>{
 let work;const initial='\ufeffFirst café\r\nrepeat repeat\r\nunique 🌍\r\n';
 const session=await githubToolbox({repository:'owner/project',api:checkoutApi,runCommand:async(_,args)=>{
  if(args[0]==='clone'){work=args.at(-1);await fs.mkdir(work);await fs.writeFile(path.join(work,'file.txt'),initial);return {stdout:''};}
  if(args[0]==='rev-parse')return {stdout:'sha\n'};
  if(['sparse-checkout','checkout'].includes(args[0]))return {stdout:''};throw Error('Unexpected command');
 }}).open({postId:'0x1'});
 try{
  assert(session.definitions.some(d=>d.function.name==='edit_file'));
  for(const edit of [{old_text:'repeat',new_text:'once'},{old_text:'absent',new_text:'x'},{old_text:'',new_text:'x'},{old_text:'First',new_text:'x'.repeat(100000)},{old_text:'First',new_text:'\ud800'},{old_text:'First',new_text:'x',extra:true}]){
   await assert.rejects(session.call('edit_file',{path:'file.txt',edits:[edit]}));assert.equal(await fs.readFile(path.join(work,'file.txt'),'utf8'),initial);
  }
  for(const [edits,reason]of [
   [[{old_text:'First',new_text:'Changed'},{old_text:'missing',new_text:'x'}],/Edit 1 old_text/],
   [[{old_text:'First',new_text:'Changed'},{old_text:'Changed',new_text:'Again'}],/Edit 1 old_text/],
   [[{old_text:'First café',new_text:'x'},{old_text:'café',new_text:'y'}],/overlap/],
   [[{old_text:'First',new_text:'x'},{old_text:'First',new_text:'y'}],/overlap/],
   [[],/1 to 32/],
   [Array(33).fill({old_text:'First',new_text:'x'}),/1 to 32/],
  ]){await assert.rejects(session.call('edit_file',{path:'file.txt',edits}),reason);assert.equal(await fs.readFile(path.join(work,'file.txt'),'utf8'),initial);}
  await assert.rejects(session.call('edit_file',{path:'file.txt',old_text:'First',new_text:'x'}),/Use path and an edits array/);
  await assert.rejects(session.call('edit_file',{path:'missing.txt',edits:[{old_text:'x',new_text:'y'}]}),{code:'ENOENT'});
  assert.deepEqual(await session.call('edit_file',{path:'file.txt',edits:[{old_text:'unique 🌍',new_text:'updated 日本語'}]}),{edited:'file.txt'});
  assert.equal(await fs.readFile(path.join(work,'file.txt'),'utf8'),initial.replace('unique 🌍','updated 日本語'));
  await session.call('edit_file',{path:'file.txt',edits:[{old_text:'repeat repeat\r\n',new_text:''}]});assert(!(await session.call('read_file',{path:'file.txt'})).text.includes('repeat'));
  await fs.chmod(path.join(work,'file.txt'),0o755);
  const original=(await session.call('read_file',{path:'file.txt'})).text;
  const result=await session.call('edit_file',{path:'file.txt',edits:[{old_text:'updated 日本語',new_text:'First café'},{old_text:'First',new_text:'last'},{old_text:' café',new_text:' unchanged'}]});
  assert.deepEqual(result,{edited:'file.txt'});
  assert.equal((await session.call('read_file',{path:'file.txt'})).text,original.replace('First café','last unchanged').replace('updated 日本語','First café'));
  assert.equal((await fs.stat(path.join(work,'file.txt'))).mode&0o777,0o755);
  assert.deepEqual(await fs.readdir(work),['file.txt'],'no temporary edits are retained');

 }finally{await session.close();}
});

for(const postId of ['0x123','291','1291'])test('PR publication preserves commit, files and complete invocation identity: '+postId,async()=>{
 let work;const calls=[];
 const runCommand=async(command,args)=>{
  assert.equal(command,'git');
  if(args[0]==='clone'){work=args.at(-1);await fs.mkdir(work);await fs.writeFile(path.join(work,'script.sh'),'old');await fs.chmod(path.join(work,'script.sh'),0o755);return {stdout:''};}
  if(args[0]==='rev-parse')return {stdout:'checkout-sha\n'};
  if(args[0]==='sparse-checkout'||args[0]==='checkout')return {stdout:''};
  if(args[0]==='status')return {stdout:' M script.sh\0?? new.txt\0'};
  throw Error('Unexpected command');
 };
 const api=async(method,route,body)=>{
  calls.push({method,route,body});
  if(route==='/repos/owner/project')return {default_branch:'main'};
  if(route.endsWith('/git/commits/checkout-sha'))return {tree:{sha:'base-tree'}};
  if(route.endsWith('/git/trees/base-tree?recursive=1'))return {sha:'base-tree',truncated:false,tree:[]};
  if(route.endsWith('/pulls'))return {html_url:'https://github.com/owner/project/pull/1'};
  return {sha:'created-sha'};
 };
 const session=await githubToolbox({repository:'owner/project',api,runCommand,allowWrites:true,draftPr:true}).open({postId});
 try{
  await session.call('write_file',{path:'script.sh',content:'new'});
  await session.call('write_file',{path:'new.txt',content:'new file'});
  await assert.rejects(session.call('write_file',{path:'../escape',content:'x'}),/outside/);
  const result=await session.call('create_pr',{title:'Change',body:'Test'});assert(result.url.endsWith('/1'));
  const tree=calls.find(x=>x.route.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree,'base-tree');assert.equal(tree.tree[0].mode,'100755');
  assert.deepEqual(calls.find(x=>x.route.endsWith('/git/commits')).body.parents,['checkout-sha']);
  assert.equal(calls.find(x=>x.route.endsWith('/pulls')).body.base,'main');
  assert.equal(calls.find(x=>x.route.endsWith('/pulls')).body.draft,true);
  const expected='bok/'+(postId==='1291'?'50b':'123').padStart(64,'0');
  assert.equal(calls.find(x=>x.route.endsWith('/git/refs')).body.ref,'refs/heads/'+expected);
  assert.equal(calls.find(x=>x.route.endsWith('/pulls')).body.head,expected);
  await assert.rejects(session.call('create_pr',{title:'Again',body:''}),/One PR/);
 }finally{await session.close();}
 await assert.rejects(fs.stat(work),{code:'ENOENT'});
});

for(const invalid of [{sha:'base-tree',truncated:true,tree:[]},{sha:'other-tree',truncated:false,tree:[]}])test('incomplete or substituted tree cannot materialize files or silently retry',async()=>{
 let calls=0;
 const session=await githubToolbox({repository:'owner/project',api:async(method,route)=>{
  if(route.includes('?recursive=1')){calls++;return invalid;}return checkoutApi(method,route);
 },runCommand:async(_,args)=>{
  if(args[0]==='clone'){await fs.mkdir(args.at(-1));return {stdout:''};}
  if(args[0]==='rev-parse')return {stdout:'sha\n'};
  assert.fail('No materialization for invalid metadata');
 }}).open({postId:'0x1'});
 try{for(let i=0;i<2;i++)await assert.rejects(session.call('read_file',{path:'file.txt'}),/Incomplete repository tree/);assert.equal(calls,1);}
 finally{await session.close();}
});

test('failed checkout initialization is cleaned by the session owner',async()=>{
 let work;
 const toolbox=githubToolbox({repository:'owner/project',api:async()=>{throw Error('unavailable');},runCommand:async(_,args)=>{work=args.at(-1);await fs.mkdir(work);}});
 const session=await toolbox.open({postId:'0x1'});
 try{await assert.rejects(session.call('read_file',{path:'file.txt'}),/unavailable/);}finally{await session.close();}
 await assert.rejects(fs.stat(work),{code:'ENOENT'});
});

test('PR reads retain changed files inside the agent budget despite large GitHub metadata',async()=>{
 let clones=0;
 const api=async(method,route)=>{
  if(route.endsWith('/files?per_page=100'))return Array.from({length:5},()=>({filename:'docs/bok-live-smoke.md',status:'added',additions:9,deletions:0,patch:'x'.repeat(20000)}));
  if(route.endsWith('/pulls/1'))return {number:1,title:'Test',body:'\0'.repeat(20000),html_url:'https://github.com/owner/project/pull/1',head:{ref:'bok/test',sha:'head',repo:{metadata:'x'.repeat(100000)}},base:{ref:'master'}};
  return {default_branch:'master'};
 };
 const session=await githubToolbox({repository:'owner/project',api,runCommand:async(_,args)=>{
  if(args[0]==='clone'){clones++;throw Error('Read PR must not clone');}
  return {stdout:'sha\n'};
 }}).open({postId:'0x1'});
 try{
  const result=await session.call('read_pr',{number:1});
  assert.equal(result.files[0].filename,'docs/bok-live-smoke.md');assert.equal(result.files[0].patchTruncated,true);
  assert.equal(result.pr.bodyTruncated,true);assert.equal(result.pr.headSha,'head');
  assert(JSON.stringify(result).length<16000);assert.equal(result.filesTruncated,false);
  assert.equal(clones,0);
 }finally{await session.close();}
});

// Controlled toolbox/model doubles exercise the application reply boundary; no provider calls.
for (const published of [false,true]) test('app workspace step-limit summary keeps publication outcome '+published,async()=>{
 let closed=0;
 const base=githubToolbox({repository:'owner/project',api:async()=>assert.fail('No GitHub operation'),runCommand:async()=>assert.fail('No checkout needed'),repositories:{open:async()=>({work:'/unused-controlled-work',startEmpty:true,close:async()=>{closed++;}})}});
 const toolbox={open:async args=>{const session=await base.open(args);return {...session,accept:async()=>published?{repositoryId:'a'.repeat(64),acceptedRevision:'b'.repeat(40),publication:{latestUrl:'https://artifacts.example/t/one/',latestSourceUrl:'https://artifacts.example/t/one/source.json'}}:null};}};
 const agent=createAgent({toolbox,instructions:'Build an app',maxCalls:1,model:{complete:async()=>({message:{role:'assistant',content:null,tool_calls:[{id:'controlled',type:'function',function:{name:'unknown_controlled_tool',arguments:'{}'}}]}})}});
 const result=await agent.run({id:'controlled',postId:'0x1',text:'Create a counter'});
 assert.equal(result.replyText,published?'Application published.\nApp: https://artifacts.example/t/one/\nSource: https://artifacts.example/t/one/source.json':'Execution step limit reached.');
 assert.equal(closed,1);
});

const authoringPlan={version:1,scenarios:[{name:'startup',path:'index.html',steps:[{action:'reload'},{action:'expectVisible',selector:'body'}]}]};
async function browserAuthoringSession(){
 let work;const session=await githubToolbox({repository:'owner/project',api:checkoutApi,runCommand:async(_,args)=>{
  if(args[0]==='clone'){work=args.at(-1);await fs.mkdir(work);await fs.writeFile(path.join(work,'browser-tests.json'),JSON.stringify(authoringPlan,null,2)+'\n');return {stdout:''};}
  if(args[0]==='rev-parse')return {stdout:'sha\n'};
  if(['sparse-checkout','checkout'].includes(args[0]))return {stdout:''};throw Error('Unexpected command');
 }}).open({postId:'0x1'});
 return session;
}
test('browser plan authoring exposes typed steps and preserves exact source separately from parsed plan',async()=>{
 const s=await browserAuthoringSession();try{
  const read=await s.call('read_file',{path:'browser-tests.json'});
  assert.equal(read.text,JSON.stringify(authoringPlan,null,2)+'\n');assert.deepEqual(read.parsedBrowserPlan,authoringPlan);
  const schema=s.definitions.find(t=>t.function.name==='edit_browser_plan').function.parameters.properties.append.items.properties.steps.items;
  assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['action']);assert.equal(schema.properties.action.enum.length,10);
  assert.equal(schema.properties.selector.anyOf.length,3);assert.equal(schema.properties.checked.type,'boolean');assert.equal(schema.properties.count.maximum,512);assert.match(schema.description,/reload: no other fields/);
 }finally{await s.close();}
});
test('structured selectors compile literals once; raw CSS and untouched scenarios remain exact',async()=>{
 const s=await browserAuthoringSession();try{
  const literal='quote" backslash\\ café 🌍\n\r\f\t\x7f';
  const raw='input[data-name="a\\"b"]';
  const scenario={name:'literal selectors',path:'index.html',steps:[{action:'check',selector:{base:'input',attributes:{type:'checkbox','data-token':literal}},checked:true},{action:'expectCount',selector:{css:raw},count:1},{action:'expectVisible',selector:raw}]};
  const original=structuredClone(scenario);await s.call('edit_browser_plan',{append:[scenario]});assert.deepEqual(scenario,original,'caller arguments unchanged');
  const r=await s.call('read_file',{path:'browser-tests.json'});assert.deepEqual(r.parsedBrowserPlan,JSON.parse(r.text));assert.deepEqual(r.parsedBrowserPlan.scenarios[0],authoringPlan.scenarios[0]);
  assert.equal(r.parsedBrowserPlan.scenarios[1].steps[0].selector,'input[type="checkbox"][data-token="quote\\" backslash\\\\ café 🌍\\a \\d \\c \\9 \\7f "]');
  assert.equal(r.parsedBrowserPlan.scenarios[1].steps[1].selector,raw);assert.equal(r.parsedBrowserPlan.scenarios[1].steps[2].selector,raw);
 }finally{await s.close();}
});
for(const selector of [{base:'input',attributes:{}},{base:'input',attributes:{'a]': 'x'}},{base:'input,button',attributes:{type:'checkbox'}},{base:'input',attributes:{type:true}},{base:'input',attributes:{type:'\0'}},{base:'input',attributes:{type:'\ud800'}},{base:'input',attributes:{type:'x'},css:'button'},{base:'input',attributes:Object.fromEntries(Array.from({length:9},(_,i)=>['a'+i,'v']))},{css:'body',extra:true},{base:'input',attributes:{name:'x'.repeat(300)}}])test('invalid structured selector cannot mutate browser plan '+JSON.stringify(selector),async()=>{
 const s=await browserAuthoringSession();try{
  const before=(await s.call('read_file',{path:'browser-tests.json'})).text;
  await assert.rejects(s.call('edit_browser_plan',{append:[{name:'bad',path:'index.html',steps:[{action:'expectVisible',selector}]}]}),/File unchanged/);
  assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,before);
 }finally{await s.close();}
});
test('typed authoring retains exact action-specific validation before writing',async()=>{
 const s=await browserAuthoringSession();try{
  const before=(await s.call('read_file',{path:'browser-tests.json'})).text;
  for(const step of [{action:'check',selector:{base:'input',attributes:{type:'checkbox'}}},{action:'reload',selector:{css:'body'}},{action:'expectVisible',selector:{css:'body'},checked:true}]){
   await assert.rejects(s.call('edit_browser_plan',{append:[{name:'bad fields',path:'index.html',steps:[step,{action:'expectVisible',selector:'body'}]}]}),/File unchanged/);
   assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,before);
  }
 }finally{await s.close();}
});
test('actual browser structured selectors match literal quotes backslashes controls and Unicode without weakening coverage',{skip:process.env.BOK_BROWSER_TESTS!=='1',timeout:40000},async()=>{
 const {chromium}=await import('playwright');const {browserInput,browserReceipt,exerciseBrowser,validateBrowserPlan}=await import('../browser-validation.mjs');
 const s=await browserAuthoringSession();try{
  const literal='quote" backslash\\ café 🌍\n\r\f\t\x7f',raw='input[data-name="a\\"b"]';
  await s.call('edit_browser_plan',{replace:[{index:0,scenario:{name:'literal selectors',path:'index.html',steps:[
   {action:'check',selector:{base:'input',attributes:{type:'checkbox','data-token':literal}},checked:true},
   {action:'expectChecked',selector:{base:'input',attributes:{'data-token':literal}},checked:true},
   {action:'check',selector:{css:raw},checked:true},{action:'expectChecked',selector:raw,checked:true},
   {action:'reload'},{action:'expectCount',selector:{base:'input',attributes:{'data-token':literal}},count:1},
  ]}}]});
  const plan=validateBrowserPlan(JSON.parse((await s.call('read_file',{path:'browser-tests.json'})).text));
  const html='<!doctype html><meta charset="utf-8"><p>Fixture</p><input id="first" type="checkbox"><input id="second" type="checkbox"><script>first.dataset.token='+JSON.stringify(literal)+';second.dataset.name='+JSON.stringify('a"b')+';</script>';
  const input={artifacts:[{path:'index.html',data:Buffer.from(html).toString('base64')}],plan,origin:'https://artifacts.example',boardOrigin:'https://board.example',deadline:Date.now()+30000};
  const result=await exerciseBrowser(browserInput(input),chromium);assert.equal(browserReceipt(result,input).passed,true);
  const incomplete=structuredClone(input);incomplete.deadline=Date.now()+30000;incomplete.plan.scenarios[0].steps.splice(2,2);
  await assert.rejects(exerciseBrowser(browserInput(incomplete),chromium),/visible controls/);
 }finally{await s.close();}
});

test('raw browser file rejects object selectors unchanged while edit_browser_plan compiles the same authoring input',async()=>{
 const s=await browserAuthoringSession();try{
  const before=(await s.call('read_file',{path:'browser-tests.json'})).text;
  assert.match(s.definitions.find(t=>t.function.name==='write_file').function.description,/every selector must be a CSS string, never an object/);
  const scenario={name:'new scenario',path:'index.html',steps:[{action:'expectVisible',selector:{css:'#PRIVATE_SENTINEL'}}]};
  await assert.rejects(s.call('write_file',{path:'browser-tests.json',content:JSON.stringify({version:1,scenarios:[...authoringPlan.scenarios,scenario]})}),error=>{
   assert.match(error.message,/CSS selector string/);assert.match(error.message,/only in edit_browser_plan arguments/);assert.match(error.message,/scenarios\[1\]\.steps\[0\]\.selector/);assert.match(error.message,/File unchanged/);assert(!error.message.includes('PRIVATE_SENTINEL'));return true;
  });
  assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,before);
  await s.call('edit_browser_plan',{append:[scenario]});
  const result=await s.call('read_file',{path:'browser-tests.json'});assert.equal(result.parsedBrowserPlan.scenarios[1].steps[0].selector,'#PRIVATE_SENTINEL');
  await s.call('write_file',{path:'browser-tests.json',content:result.text});assert.equal((await s.call('read_file',{path:'browser-tests.json'})).text,result.text);
 }finally{await s.close();}
});

test('failed workspace check gives model bounded execution location without widening result authority',async()=>{
 const failure={scenarioIndex:2,stepIndex:4,viewportWidth:390,action:'expectVisible',category:'timeout'};
 const tool=githubToolbox({repository:'owner/project',api:()=>assert.fail('No API'),runCommand:async(_cmd,args)=>({stdout:args[0]==='rev-parse'?'a'.repeat(40):''}),repositories:{open:async()=>({work:'/unused-work',startEmpty:true,check:async()=>{throw Object.assign(Error('Private failure'),{code:'STATIC_FAILED',result:{passed:false,phase:'browser',browserFailure:{...failure,selector:'PRIVATE_SELECTOR'},log:'existing private log'}});},close:async()=>{}})}});
 const s=await tool.open({id:'a',threadId:'b',postId:'c'});
 try{const result=await s.call('finish_workspace',{});assert.equal(result.passed,false);assert.deepEqual(result.browserFailure,failure);assert.equal(result.phase,'browser');assert(!JSON.stringify(result.browserFailure).includes('PRIVATE_SELECTOR'));}finally{await s.close();}
});
