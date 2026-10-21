import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {acquireHostedLease} from '../hosted-lease.mjs';

async function fixture(t) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hosted-flock-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 return {directory,file:path.join(directory,'hosted.lock')};
}

test('kernel lease excludes contenders and preserves the inode across normal restart',async t=>{
 const {directory,file}=await fixture(t),first=await acquireHostedLease(directory);
 try {
  const identity=await fs.stat(file),owner=await fs.readFile(file,'utf8');
  assert.equal(owner,String(process.pid));assert.equal(identity.mode&0o777,0o600);
  await assert.rejects(acquireHostedLease(directory),{code:'HOSTED_LEASE_BUSY'});
  assert.equal(await fs.readFile(file,'utf8'),owner);await first.assertHeld();
  await first.close();await first.close();await assert.rejects(first.assertHeld(),/closed/);
  assert.equal(await fs.readFile(file,'utf8'),'');
  const second=await acquireHostedLease(directory);
  try {await second.assertHeld();assert.equal((await fs.stat(file)).ino,identity.ino);}
  finally {await second.close();}
 } finally {await first.close();}
});

test('actual process death releases kernel ownership without changing an uncertain journal',async t=>{
 const {directory,file}=await fixture(t),journal=path.join(directory,'funding-budget.json');
 const bytes=Buffer.from('{"identity":"retained","activePlan":"uncertain","reservedGasWei":"1000"}');
 await fs.writeFile(journal,bytes,{mode:0o600});
 const program=`import {acquireHostedLease} from ${JSON.stringify(new URL('../hosted-lease.mjs',import.meta.url).href)};
 const lease=await acquireHostedLease(process.argv[1]);await lease.assertHeld();process.send({ready:true});setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','--eval',program,directory],{stdio:['ignore','ignore','ignore','ipc']});
 const exited=once(child,'exit');
 try {
  await new Promise((resolve,reject)=>{
   child.once('message',message=>message?.ready===true?resolve():reject(Error('Unexpected lease handshake')));
   child.once('error',reject);child.once('exit',()=>reject(Error('Owner exited before acquisition')));
  });
  const identity=await fs.stat(file);assert.equal(await fs.readFile(file,'utf8'),String(child.pid));
  await assert.rejects(acquireHostedLease(directory),{code:'HOSTED_LEASE_BUSY'});
  child.kill('SIGKILL');const [,signal]=await exited;assert.equal(signal,'SIGKILL');
  // The stale PID is evidence only. Kernel acquisition decides ownership.
  assert.equal(await fs.readFile(file,'utf8'),String(child.pid));
  const restarted=await acquireHostedLease(directory);
  try {await restarted.assertHeld();assert.equal((await fs.stat(file)).ino,identity.ino);assert.deepEqual(await fs.readFile(journal),bytes);}
  finally {await restarted.close();}
 } finally {
  if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}
 }
});

test('a path replacement is rejected and never removed by the old owner',async t=>{
 const {directory,file}=await fixture(t),lease=await acquireHostedLease(directory);
 await fs.rename(file,file+'.original');await fs.writeFile(file,'replacement',{flag:'wx',mode:0o600});
 await assert.rejects(lease.assertHeld(),/changed/);await assert.rejects(lease.close(),/changed/);
 assert.equal(await fs.readFile(file,'utf8'),'replacement');
});

test('symlinks, hardlinks and public lock files fail without modifying their targets',async t=>{
 const {directory,file}=await fixture(t),target=path.join(directory,'target');
 await fs.writeFile(target,'retained',{mode:0o600});
 await fs.symlink(target,file);await assert.rejects(acquireHostedLease(directory));assert.equal(await fs.readFile(target,'utf8'),'retained');await fs.unlink(file);
 await fs.link(target,file);await assert.rejects(acquireHostedLease(directory),/private regular/);assert.equal(await fs.readFile(target,'utf8'),'retained');await fs.unlink(file);
 await fs.writeFile(file,'retained',{mode:0o600});await fs.chmod(file,0o644);
 await assert.rejects(acquireHostedLease(directory),/private regular/);assert.equal(await fs.readFile(file,'utf8'),'retained');
});
