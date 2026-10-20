// Development evidence adapter; uses the repository's existing owned-tree supervisor.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {OwnedBuildTree} from '../../../scripts/owned-test-process-tree.mjs';
const [label,...args]=process.argv.slice(2);if(!/^[a-z0-9-]+$/.test(label)||!args.length)throw Error('Expected fresh evidence label and Node arguments');
const directory=path.dirname(fileURLToPath(import.meta.url)),log=path.join(directory,label+'.log'),record=path.join(directory,label+'.json');
const fd=fs.openSync(log,'wx'),output=fs.openSync(record,'wx');
const env=Object.fromEntries(['PATH','HOME','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_BACKEND='js';
const started=performance.now(),r={command:[process.execPath,...args],cwd:process.cwd(),sourceRevision:null,deadlineMs:540000,rssLimitKiB:4194304,passed:false,peakTreeRSSKiB:0,samples:0,cleanupComplete:false};
const child=spawn(process.execPath,args,{cwd:process.cwd(),env,detached:true,stdio:['ignore',fd,fd]}),tree=new OwnedBuildTree(child.pid);
let done=false,code=null,signal=null,samplingFailure=false;const end=new Promise(resolve=>{child.once('error',()=>{done=true;samplingFailure=true;resolve();});child.once('close',(c,s)=>{done=true;code=c;signal=s;resolve();});});
try{
 while(!done){const {rssKiB}=await tree.sample();r.samples++;r.peakTreeRSSKiB=Math.max(r.peakTreeRSSKiB,rssKiB);if(rssKiB>=r.rssLimitKiB||performance.now()-started>=r.deadlineMs){r.limitFailure=rssKiB>=r.rssLimitKiB?'memory':'deadline';tree.signalRemembered('SIGKILL');break;}await Promise.race([end,new Promise(resolve=>setTimeout(resolve,500))]);}
 await end;
}catch{samplingFailure=true;tree.signalRemembered('SIGKILL');await end;}
finally{
 try{await tree.cleanup();r.cleanupComplete=true;}catch{r.cleanupComplete=false;}
 r.elapsedMs=Math.round(performance.now()-started);r.exitCode=code;r.signal=signal;r.samplingFailure=samplingFailure;r.passed=code===0&&!signal&&!samplingFailure&&!r.limitFailure&&r.cleanupComplete&&r.elapsedMs<r.deadlineMs;
 fs.closeSync(fd);r.logSha256=createHash('sha256').update(fs.readFileSync(log)).digest('hex');fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');fs.closeSync(output);console.log(JSON.stringify(r));process.exitCode=r.passed?0:1;
}
