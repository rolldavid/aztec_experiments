import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

// flock belongs to the open file description shared by these inherited fds.
// The helper exits immediately; Node retains the lock through its FileHandle.
// Closing the handle or process death releases ownership in the kernel.
const acquireProgram=`import fcntl,sys
try:
    fcntl.flock(3,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(73)
`;

function lockDescriptor(fd) {
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/python3',['-I','-S','-c',acquireProgram],{
   stdio:['ignore','ignore','ignore',fd],
  });
  child.once('error',()=>reject(Error('Hosted lease helper unavailable')));
  child.once('exit',(code,signal)=>{
   if(code===0&&signal===null)return resolve();
   const error=Error(code===73?'Hosted lease already owned':'Hosted lease acquisition failed');
   if(code===73)error.code='HOSTED_LEASE_BUSY';
   reject(error);
  });
 });
}

/** The persistent inode is the lock, not its diagnostic PID. Never unlink or
 * replace it. Reopening a lease does not clear or replay any financial journal. */
export async function acquireHostedLease(directory) {
 assert(['linux','darwin'].includes(process.platform),'Hosted lease requires POSIX flock');
 const lockPath=path.join(directory,'hosted.lock');
 const lock=await fs.open(lockPath,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);
 let identity,closed=false,closing;
 const same=stat=>stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===process.getuid()&&
  (stat.mode&0o777)===0o600&&stat.dev===identity.dev&&stat.ino===identity.ino;
 async function pathUnchanged(){assert(same(await fs.lstat(lockPath)),'Hosted lease path changed');}
 try {
  identity=await lock.stat();
  assert(same(identity),'Hosted lease must be an owned private regular file');
  await lockDescriptor(lock.fd);
  await pathUnchanged();
  // Write diagnostics only after kernel ownership is established. A contender
  // must never truncate the current owner's file before attempting the lock.
  await lock.truncate(0);await lock.writeFile(String(process.pid));await lock.sync();
 } catch(error) {
  await lock.close();throw error;
 }
 function close() {
  return closing??=(async()=>{
   closed=true;
   try {await pathUnchanged();await lock.truncate(0);await lock.sync();}
   finally {await lock.close();}
  })();
 }
 return {
  async assertHeld(){assert(!closed,'Hosted lease closed');await pathUnchanged();},
  close,
 };
}
