import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {BROWSER_PLAN_MAX_STEPS,browserPlanDiagnostic,validateBrowserPlan} from './browser-validation.mjs';
import {STATIC_SOURCE_REQUIREMENTS} from './isolated-execution.mjs';
import {repositoryGit} from './thread-repositories.mjs';
const trustedCommand=(command,args,options)=>{if(command!=='git')throw Error('Unsupported repository command');return repositoryGit(args,options);};
const definition=(name,description,properties,required=Object.keys(properties))=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const string={type:'string'};
const pathKey=name=>name.normalize('NFC').toLowerCase();
function browserPlanSummary(plan){
 const count=Array.isArray(plan?.scenarios)?plan.scenarios.reduce((n,s)=>n+(Array.isArray(s?.steps)?s.steps.length:0),0):null;
 try{validateBrowserPlan(plan);}catch(error){const d=browserPlanDiagnostic(error.browserPlan);if(d)throw Error(d.message+' At '+d.path+'.'+(count===null?'':' Proposed total: '+count+' steps; limit: '+BROWSER_PLAN_MAX_STEPS+'.')+' File unchanged.');throw error;}
 const steps=count;
 return {steps,remainingSteps:BROWSER_PLAN_MAX_STEPS-steps,scenarios:plan.scenarios.map((s,index)=>({index,name:s.name,steps:s.steps.length}))};
}
function browserPlanText(text){
 let plan;try{plan=JSON.parse(text);}catch{throw Error('Use valid JSON in browser-tests.json.');}
 return browserPlanSummary(plan);
}
const scenarioSchema={type:'object',properties:{name:{type:'string'},path:{type:'string'},steps:{type:'array',minItems:1,maxItems:BROWSER_PLAN_MAX_STEPS,items:{type:'object'}}},required:['name','path','steps'],additionalProperties:false};


/** GitHub implementation of the agent tool API. Writes stay in a fresh branch.
 * API transport is supplied by the host; no token enters the working directory.
 */
export function githubToolbox({repository,api,allowWrites=false,draftPr=false,runCommand=trustedCommand,repositories}) {
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('Invalid repository');
  return {async open({postId,threadId,id}) {
    const workspace=repositories?await repositories.open({threadId,invocationId:id,repository}):null;
    const dir=workspace?null:await fs.mkdtemp(path.join(os.tmpdir(),'bok-')),work=workspace?.work??path.join(dir,'repository');
    let prUrl=null,checkout,files;
    // Plain replies and PR reads do not need a checkout. Retain a rejected
    // initialization promise too: one invocation never silently retries cloning.
    const ensureCheckout=()=>checkout??=(async()=>{
      if(workspace?.readRevision){
        await runCommand('git',['clone','--no-hardlinks','--no-checkout','--branch','accepted',workspace.repositoryPath,work],{maxBuffer:1024*1024});
        const baseSha=(await runCommand('git',['rev-parse','HEAD'],{cwd:work})).stdout.trim();
        if(baseSha!==workspace.readRevision)throw Error('Accepted repository revision changed');
        return {base:null,baseSha};
      }
      if(workspace?.connection){
        const source=await workspace.initialSource();await runCommand('git',['init',work]);
        for(const file of source){const target=await safe(file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.from(file.data,'base64'),{flag:'wx',mode:file.mode==='100755'?0o700:0o600});}
        await runCommand('git',['add','--all','--','.'],{cwd:work});await runCommand('git',['commit','--allow-empty','-m','Initialize operator-connected source'],{cwd:work});
        return {base:null,baseSha:(await runCommand('git',['rev-parse','HEAD'],{cwd:work})).stdout.trim()};
      }
      if(workspace?.startEmpty){
        await runCommand('git',['init',work]);await runCommand('git',['commit','--allow-empty','-m','Initialize isolated Bok thread'],{cwd:work});
        return {base:null,baseSha:(await runCommand('git',['rev-parse','HEAD'],{cwd:work})).stdout.trim()};
      }
      await runCommand('git',['clone','--depth','1','--filter=blob:none','--no-checkout','https://github.com/'+repository+'.git',work],{maxBuffer:1024*1024});
      const info=await api('GET','/repos/'+repository);
      const baseSha=(await runCommand('git',['rev-parse','HEAD'],{cwd:work})).stdout.trim();
      return {base:info.default_branch,baseSha};
    })();
    // Download only files the tools can read. Keep omitted files in the Git
    // index so publishing a small edit never treats large artifacts as deleted.
    const ensureFiles=()=>files??=(async()=>{
      const {baseSha}=await ensureCheckout();let commit,tree;
      if(workspace?.readRevision||workspace?.startEmpty||workspace?.connection){
        const listed=await runCommand('git',['ls-tree','-r','-l','-z',baseSha],{cwd:work,maxBuffer:4*1024*1024});
        commit={tree:{sha:baseSha}};tree={sha:baseSha,truncated:false,tree:listed.stdout.split('\0').filter(Boolean).map(row=>{
          const match=/^([0-7]+) (blob|commit) ([0-9a-f]{40}) +([0-9]+|-)\t(.+)$/s.exec(row);
          if(!match||match[2]!=='blob')throw Error('Unsupported repository entry');
          return {path:match[5],type:'blob',size:Number(match[4])};
        })};
      }else{
        commit=await api('GET',`/repos/${repository}/git/commits/${baseSha}`);
        tree=await api('GET',`/repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`);
      }
      if(tree.truncated!==false||tree.sha!==commit.tree.sha||!Array.isArray(tree.tree))throw Error('Incomplete repository tree');
      const oversized=new Set();
      for(const entry of tree.tree){
        if(typeof entry.path!=='string'||/[\0\r\n]/.test(entry.path)||entry.path.startsWith('/')||entry.path.split('/').some(p=>!p||p==='.'||p==='..'||pathKey(p)==='.git'))throw Error('Unsupported repository path');
        if(entry.type==='blob'){
          if(!Number.isSafeInteger(entry.size)||entry.size<0)throw Error('Invalid repository file size');
          if(entry.size>100000)oversized.add(entry.path);
        }
      }
      const patterns=['/*',...Array.from(oversized,p=>'!/'+p.replace(/[\\*?\[\] ]/g,'\\$&'))];
      await runCommand('git',['sparse-checkout','set','--no-cone','--no-sparse-index','--',...patterns],{cwd:work,maxBuffer:1024*1024});
      await runCommand('git',['checkout','--detach',baseSha],{cwd:work,maxBuffer:1024*1024});
      return new Set(Array.from(oversized,pathKey));
    })();
    const safe=async name=>{
      if(typeof name!=='string'||name.includes('\0')||name.split(/[\\/]/).some(p=>pathKey(p)==='.git'))throw Error('Invalid file path');
      if(workspace?.connection&&(!/^[A-Za-z0-9._/-]{1,240}$/.test(name)||name.split('/').some(p=>['.github','.aws','.ssh','.npmrc','node_modules','credentials','secrets'].includes(p.toLowerCase())||/^\.(?:env|yarnrc)(?:[.-]|$)/i.test(p))))throw Error('Connected source path rejected');
      const target=path.resolve(work,name);if(!target.startsWith(work+path.sep))throw Error('Path outside repository');
      // Reject symlinks at every existing path component, including parent dirs.
      let current=work;for(const part of path.relative(work,target).split(path.sep)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Object.assign(Error('Symlink access rejected'),{code:'BOK_UNSUPPORTED_PATH'});}catch(e){if(e.code!=='ENOENT')throw e;}}
      return target;
    };
    const definitions=[
      definition('list_files','List current workspace files, including uncommitted edits',{prefix:string}),
      definition('read_file','Read a UTF-8 repository file',{path:string}),
      definition('write_file','Write a UTF-8 file in the isolated checkout',{path:string,content:string}),
      definition('edit_browser_plan','Change only selected browser-tests.json scenarios. Indices refer to the current plan. Keep existing scenarios unless the requested change needs them changed. The complete resulting plan is checked before writing; returns the remaining step budget. Omitted or empty remove, replace and append arrays leave those operations unchanged. Provide at least one edit; for example, append alone can add scenarios. Use plain CSS selectors such as input[type=checkbox] or #clear-completed. JSON escaping is only transport syntax; do not double-escape the quotes delimiting CSS attribute values. Correct a failing selector without deleting the intended coverage.',{remove:{type:'array',maxItems:8,items:{type:'integer',minimum:0,maximum:7}},replace:{type:'array',maxItems:8,items:{type:'object',properties:{index:{type:'integer',minimum:0,maximum:7},scenario:scenarioSchema},required:['index','scenario'],additionalProperties:false}},append:{type:'array',maxItems:8,items:scenarioSchema}},[]),
      definition('edit_file','Replace one exact occurrence in an existing UTF-8 file. old_text must be nonempty and unique; use enough unchanged context. Prefer this for small changes instead of rewriting whole files.',{path:string,old_text:string,new_text:string}),
      definition('read_pr','Read a PR in this repository',{number:{type:'integer',minimum:1}}),
      definition('create_pr','Publish current edits as a new pull request; never merge',{title:string,body:string}),
    ];
    return {
      privateSource:!!workspace?.connection,
      sourceRevision:workspace&&!workspace.connection?workspace.readRevision:undefined,
      definitions:workspace?[...definitions.filter(x=>x.function.name!=='create_pr'&&(!workspace.connection||x.function.name!=='read_pr')),definition('check_workspace','Run isolated Node tests, static build and mandatory browser scenarios under the real hosting policy for current source; repair failures before finishing',{}),definition('finish_workspace','Use as the final tool call once the requested edits are complete. Run the same mandatory isolated checks and finish immediately if they pass. Failures return for repair; no extra completion message is needed.',{})]:definitions,
      summary:reason=>workspace?.connection?'Connected repository work did not publish a pull request.':(workspace?reason:reason+(prUrl?' PR: '+prUrl:' No PR was published.')).slice(0,900),
      async call(name,args){
        if((name==='check_workspace'||name==='finish_workspace')&&workspace){
          if(!args||Object.keys(args).length)throw Error('Workspace checks take no arguments');
          await ensureFiles();let result;try{result=await workspace.check();}catch(error){if(error.code!=='STATIC_FAILED'||!error.result)throw error;result=error.result;}
          return {passed:result.passed,revision:result.revision,sourceDigest:result.sourceDigest,phase:result.phase,log:result.log?.slice(-12000),logTruncated:(result.log?.length??0)>12000,...(Object.hasOwn(STATIC_SOURCE_REQUIREMENTS,result.requirement)?{requirement:{code:result.requirement,message:STATIC_SOURCE_REQUIREMENTS[result.requirement],...(result.requirement==='STATIC_BROWSER_TEST_INVALID'&&browserPlanDiagnostic(result.browserPlan)?{detail:browserPlanDiagnostic(result.browserPlan)}:{})}}:{})};
        }
        if(name==='list_files'){
          if(typeof args.prefix!=='string'||args.prefix.length>240||/[\0\r\n]/.test(args.prefix))throw Error('Invalid file prefix');
          const oversized=await ensureFiles();
          // Read the index plus untracked files, not HEAD. Ignored files can be
          // deliberate tool writes too; sparse omitted/deleted files are absent.
          const listed=await runCommand('git',['ls-files','--cached','--others','-z'],{cwd:work,maxBuffer:4*1024*1024});
          const current=[];
          for(const name of [...new Set(listed.stdout.split('\0').filter(Boolean))].sort()){
            if(!name.startsWith(args.prefix))continue;
            if(name.length>240||/[\0\r\n]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsupported repository path');
            if(oversized.has(pathKey(name)))continue;
            let file;try{file=await safe(name);}catch(error){if(error.code==='BOK_UNSUPPORTED_PATH')continue;throw error;}
            let stat;try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
            // Listing is discovery, not permission to follow a link or read an
            // omitted blob. Unsupported entries must not hide valid edits.
            if(!stat.isFile()||stat.size>100000)continue;
            current.push(name);if(current.length>500)break;
          }
          return {files:current.slice(0,500),truncated:current.length>500};
        }
        if(name==='read_file'){const oversized=await ensureFiles(),file=await safe(args.path);if(oversized.has(pathKey(path.relative(work,file)))||(await fs.stat(file)).size>100000)throw Error('File too large');const text=await fs.readFile(file,'utf8');let browserPlan;if(path.relative(work,file)==='browser-tests.json')try{browserPlan=browserPlanText(text);}catch{/* Invalid source remains readable for repair. */}return {text,...(browserPlan?{browserPlan}:{})};}
        if(name==='edit_browser_plan'){
          if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['append','remove','replace'].includes(k)))throw Error('Use only append, remove and replace arrays for browser scenario edits; unused arrays may be omitted.');
          for(const key of ['append','remove','replace'])if(Object.hasOwn(args,key)&&(!Array.isArray(args[key])||args[key].length>8))throw Error('Browser scenario '+key+' must be an array with at most 8 entries.');
          const edits={append:args.append??[],remove:args.remove??[],replace:args.replace??[]};
          if(!Object.values(edits).some(rows=>rows.length))throw Error('Provide at least one browser scenario edit in append, remove or replace.');
          await ensureFiles();const file=await safe('browser-tests.json');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>65536)throw Error('Browser plan exceeds 64 KiB');
          const plan=JSON.parse(await fs.readFile(file,'utf8'));browserPlanSummary(plan);const used=new Set();
          const index=n=>{if(!Number.isInteger(n)||n<0||n>=plan.scenarios.length||used.has(n))throw Error('Scenario index must exist and occur once');used.add(n);};
          for(const n of edits.remove)index(n);const replacements=new Map();
          for(const row of edits.replace){if(!row||Object.keys(row).sort().join()!=='index,scenario')throw Error('Invalid scenario replacement');index(row.index);replacements.set(row.index,row.scenario);}
          const removed=new Set(edits.remove),next={...plan,scenarios:plan.scenarios.flatMap((s,i)=>removed.has(i)?[]:[replacements.get(i)??s]).concat(edits.append)};
          const browserPlan=browserPlanSummary(next);await fs.writeFile(file,JSON.stringify(next,null,2)+'\n');if(workspace)await workspace.retain();return {edited:'browser-tests.json',browserPlan};
        }
        if(name==='write_file'){if(typeof args.content!=='string'||Buffer.byteLength(args.content)>100000)throw Error('File too large');const oversized=await ensureFiles(),file=await safe(args.path);if(oversized.has(pathKey(path.relative(work,file))))throw Error('File too large');const browserPlan=path.relative(work,file)==='browser-tests.json'?browserPlanText(args.content):undefined;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,args.content);if(workspace)await workspace.retain();return {written:args.path,...(browserPlan?{browserPlan}:{})};}
        if(name==='edit_file'){
          if(!args||Object.keys(args).sort().join()!=='new_text,old_text,path'||typeof args.old_text!=='string'||!args.old_text||typeof args.new_text!=='string'||
            !args.old_text.isWellFormed()||!args.new_text.isWellFormed()||Buffer.byteLength(args.old_text)>100000||Buffer.byteLength(args.new_text)>100000)throw Error('Invalid exact edit');
          const oversized=await ensureFiles(),file=await safe(args.path);
          if(oversized.has(pathKey(path.relative(work,file))))throw Error('File too large');
          const stat=await fs.stat(file);if(!stat.isFile()||stat.size>100000)throw Error('File too large');
          const bytes=await fs.readFile(file),text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),start=text.indexOf(args.old_text);
          if(start<0||text.indexOf(args.old_text,start+1)!==-1)throw Error('Exact edit must match once; read current file and include unique context');
          const next=text.slice(0,start)+args.new_text+text.slice(start+args.old_text.length);
          if(Buffer.byteLength(next)>100000)throw Error('File too large');
          // All matching and size checks precede the single mutation. The owned
          // session executes tools serially; retain the exact resulting revision.
          const browserPlan=path.relative(work,file)==='browser-tests.json'?browserPlanText(next):undefined;await fs.writeFile(file,next);if(workspace)await workspace.retain();return {edited:args.path,...(browserPlan?{browserPlan}:{})};
        }
        if(name==='read_pr'){
          if(workspace?.connection)throw Error('Connected repository PR reads are not exposed');
          if(!Number.isSafeInteger(args.number)||args.number<1)throw Error('Invalid PR');
          const [pr,changes]=await Promise.all([api('GET',`/repos/${repository}/pulls/${args.number}`),api('GET',`/repos/${repository}/pulls/${args.number}/files?per_page=100`)]);
          // GitHub embeds entire repository/user objects in a PR response. Returning
          // those exhausted the agent's tool-result budget before any files arrived.
          const files=[];let remaining=10000;
          for(const file of changes){
            const entry={filename:file.filename,status:file.status,additions:file.additions,deletions:file.deletions,
              patch:file.patch?.slice(0,1000),patchTruncated:(file.patch?.length??0)>1000};
            const size=JSON.stringify(entry).length;if(size>remaining)break;
            files.push(entry);remaining-=size;
          }
          const result={files,filesTruncated:files.length<changes.length||changes.length===100,
            pr:{number:pr.number,title:pr.title?.slice(0,200),url:pr.html_url,state:pr.state,draft:pr.draft,
              body:pr.body?.slice(0,2000),bodyTruncated:(pr.body?.length??0)>2000,
              base:pr.base?.ref,head:pr.head?.ref,headSha:pr.head?.sha}};
          // Budget serialized JSON, since escaping can expand strings substantially.
          while(JSON.stringify(result).length>15000){
            if(result.pr.body?.length){result.pr.body=result.pr.body.slice(0,Math.floor(result.pr.body.length/2));result.pr.bodyTruncated=true;}
            else if(result.files.length){result.files.pop();result.filesTruncated=true;}
            else throw Error('PR metadata exceeds the tool response limit');
          }
          return result;
        }
        if(name==='create_pr'){
          if(workspace)throw Error('Thread publication requires the scoped revision publisher');
          if(!allowWrites)throw Error('GitHub writes are disabled');
          if(prUrl)throw Error('One PR per invocation');
          if(typeof args.title!=='string'||args.title.length>200||typeof args.body!=='string'||args.body.length>20000)throw Error('Invalid PR text');
          const {base,baseSha}=await ensureCheckout();
          await ensureFiles();
          const status=await runCommand('git',['status','--porcelain=v1','-z','--untracked-files=all'],{cwd:work,maxBuffer:1024*1024});
          const entries=status.stdout.split('\0').filter(Boolean);if(entries.length>30)throw Error('Too many changed files');
          const tree=[];
          for(const entry of entries){const filename=entry.slice(3);if(filename.endsWith('/')||filename.startsWith('.github/'))throw Error('Workflow/directory changes not supported');const file=await safe(filename);const stat=await fs.stat(file);if(!stat.isFile()||stat.size>100000)throw Error('Unsupported file change');const blob=await api('POST',`/repos/${repository}/git/blobs`,{content:await fs.readFile(file,'utf8'),encoding:'utf-8'});tree.push({path:filename,mode:(stat.mode&0o111)?'100755':'100644',type:'blob',sha:blob.sha});}
          if(!tree.length)throw Error('No file changes');
          const baseCommit=await api('GET',`/repos/${repository}/git/commits/${baseSha}`);
          const built=await api('POST',`/repos/${repository}/git/trees`,{base_tree:baseCommit.tree.sha,tree});
          const commit=await api('POST',`/repos/${repository}/git/commits`,{message:args.title,tree:built.sha,parents:[baseSha]});
          const branch='bok/'+BigInt(postId).toString(16).padStart(64,'0');
          await api('POST',`/repos/${repository}/git/refs`,{ref:'refs/heads/'+branch,sha:commit.sha});
          const pr=await api('POST',`/repos/${repository}/pulls`,{title:args.title,body:args.body,head:branch,base,draft:draftPr});prUrl=pr.html_url;
          return {url:prUrl};
        }
        throw Error('Unknown tool');
      },
      ...(workspace?{accept:async()=>{if(!checkout)return null;await ensureFiles();return workspace.accept();}}:{}),
      close:()=>workspace?workspace.close():fs.rm(dir,{recursive:true,force:true}),
    };
  }};
}

export function githubApi({token,fetchImpl=fetch}) {
  return async(method,route,body)=>{
    if(!route.startsWith('/repos/'))throw Error('Unsupported GitHub route');
    const response=await fetchImpl('https://api.github.com'+route,{method,headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('GitHub request failed ('+response.status+')');
    return response.json();
  };
}
