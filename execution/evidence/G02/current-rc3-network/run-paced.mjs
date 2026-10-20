import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync}from'node:child_process';
import {Supervisor}from'../../../../scripts/testing/supervisor.mjs';
const W=process.cwd(),D=path.join(W,'execution/evidence/G02/current-rc3-network'),p=JSON.parse(fs.readFileSync(path.join(D,'paced-execution-preparation.json')));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function save(name,value){const fd=fs.openSync(path.join(D,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(D,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
if(execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==p.source||execFileSync('/usr/bin/git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Source changed');
for(const [f,h]of Object.entries(p.pins))if(sha(f)!==h)throw Error('Protected input changed');
if(fs.existsSync(p.argv.at(-1)))throw Error('Receipt already exists');
save('paced-execution-intent.json',{source:p.source,startedAt:new Date().toISOString(),pid:process.pid,command:p.argv,environment:p.environment,reviewSha256:p.review,grantSha256:p.grant,preparationSha256:sha(path.join(D,'paced-execution-preparation.json')),runnerSha256:sha(path.join(D,'run-paced.mjs')),retry:false});
const report={source:p.source,startedAt:new Date().toISOString(),command:p.argv,reviewSha256:p.review};const owner=new Supervisor({deadlineMs:65000,rssLimitKiB:1048576,report});
try{await owner.start('public-network-read',p.argv[0],p.argv.slice(1),{cwd:W,env:p.environment,onRecord:r=>report.publicSummary=r});}catch(e){owner.fail('supervisor-exception',e);}finally{
 await owner.close();report.finishedAt=new Date().toISOString();report.protectedUnchanged=Object.entries(p.pins).every(([f,h])=>fs.existsSync(f)&&sha(f)===h);
 const t=fs.lstatSync(p.temporaryDirectory);report.tempOwned=t.isDirectory()&&!t.isSymbolicLink()&&t.dev===p.temporaryIdentity.dev&&t.ino===p.temporaryIdentity.ino;
 if(report.ownedTreeAbsent&&report.tempOwned)fs.rmSync(p.temporaryDirectory,{recursive:true});report.tempRemoved=!fs.existsSync(p.temporaryDirectory);
 report.receiptPresent=fs.existsSync(p.argv.at(-1));report.receiptSha256=report.receiptPresent?sha(p.argv.at(-1)):null;report.completed=report.ownedTreeAbsent&&report.tempRemoved&&report.protectedUnchanged&&report.receiptPresent;
 save('paced-execution-result.json',report);console.log(JSON.stringify({completed:report.completed,summary:report.publicSummary,elapsedMs:report.elapsedMs,ownedTreeAbsent:report.ownedTreeAbsent,tempRemoved:report.tempRemoved}));process.exitCode=report.completed&&report.publicSummary?.passed?0:1;
}
