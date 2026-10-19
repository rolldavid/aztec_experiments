import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareNativeRuntime,prepareInProcessNativeRuntime} from '../prover/runtime.mjs';
test('native runtime reuses verified read-only CRS and rejects corrupted installed data',async()=>{
 const crsPath=await fs.mkdtemp(path.join(os.tmpdir(),'prover-crs-test-'));
 const originalCrs=process.env.CRS_PATH;
 try{
  await prepareNativeRuntime({crsPath});const names=await fs.readdir(crsPath);
  for(const name of names)await fs.chmod(path.join(crsPath,name),0o400);
  const before=await Promise.all(names.map(name=>fs.stat(path.join(crsPath,name))));
  await prepareNativeRuntime({crsPath});
  const after=await Promise.all(names.map(name=>fs.stat(path.join(crsPath,name))));assert.deepEqual(after.map(s=>s.mtimeMs),before.map(s=>s.mtimeMs));
  process.env.CRS_PATH=crsPath;
  const runtime=await prepareInProcessNativeRuntime();assert.equal(runtime.crsPath,crsPath);
  // The pinned native backend inherits process.env when spawning bb. Check
  // that exact boundary without proving or invoking a remote service.
  assert.equal(execFileSync(process.execPath,['-e','process.stdout.write(process.env.CRS_PATH)'],{encoding:'utf8'}),crsPath);
  const bad=path.join(crsPath,names[0]);await fs.chmod(bad,0o600);await fs.writeFile(bad,'invalid');await assert.rejects(prepareNativeRuntime({crsPath}),/Invalid installed proving data/);
  process.env.CRS_PATH='/unchanged-after-invalid-data';
  await assert.rejects(prepareInProcessNativeRuntime({crsPath}),/Invalid installed proving data/);
  assert.equal(process.env.CRS_PATH,'/unchanged-after-invalid-data');
 }finally{if(originalCrs===undefined)delete process.env.CRS_PATH;else process.env.CRS_PATH=originalCrs;await fs.rm(crsPath,{recursive:true,force:true});}
});
test('a nightly label alone cannot bypass the pinned native binary check',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prover-version-test-')),bbPath=path.join(directory,'bb');
 try{await fs.writeFile(bbPath,"#!/bin/sh\nprintf '%s\\n' '5.2.0-nightly.20260807'\n",{mode:0o700});await assert.rejects(prepareNativeRuntime({bbPath,crsPath:directory}),/checksum mismatch/);}
 finally{await fs.rm(directory,{recursive:true,force:true});}
});
