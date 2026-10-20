// Labelled synthetic package files; no SDK/compiler/native execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertPortalL1Artifacts} from "file:///Users/zac/Documents/ChatGPT/Anonymous%20Message%20Board/rolling-controls/scripts/build-contracts.mjs";
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc3-portal-pins-'));
const name='@aztec-foundation/l1-artifacts',version='6.0.0-rc.6';
const directory=path.join(root,'billboard/portal');
const toolchain={aztec:'6.0.0-rc.3',aztecLockPackages:{[name]:version}};
let passed=0;
function write(file,value){const p=path.join(directory,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value));}
function fresh(){return {manifest:{dependencies:{[name]:version}},lock:{lockfileVersion:3,packages:{'':{dependencies:{[name]:version}},[`node_modules/${name}`]:{version,integrity:`sha512-${Buffer.alloc(64).toString('base64')}`}}},installed:{name,version}};}
function check(data,config=toolchain){write('package.json',data.manifest);write('package-lock.json',data.lock);write(`node_modules/${name}/package.json`,data.installed);return assertPortalL1Artifacts({root,toolchain:config});}
try {
 assert.deepEqual(check(fresh()),{name,version});passed++;
 for(const mutate of [d=>d.manifest.dependencies[name]='6.0.0-rc.3',d=>d.manifest.dependencies[name]='^6.0.0-rc.6',d=>d.lock.packages[''].dependencies[name]='6.0.0-rc.1',d=>d.lock.packages[`node_modules/${name}`].version='6.0.0-rc.1',d=>delete d.lock.packages[`node_modules/${name}`].integrity,d=>d.lock.packages[`node_modules/${name}`].link=true,d=>d.installed.name='@aztec-labs/aztec.js',d=>d.installed.version='6.0.0-rc.1']){const d=fresh();mutate(d);assert.throws(()=>check(d),/Portal L1/);passed++;}
 assert.throws(()=>check(fresh(),{aztec:'6.0.0-rc.3'}),/Missing exact/);passed++;
 const data=fresh();check(data);fs.rmSync(path.join(directory,`node_modules/${name}/package.json`));assert.throws(()=>assertPortalL1Artifacts({root,toolchain}),/ENOENT/);passed++;
 process.stdout.write(JSON.stringify({passed,failed:0,label:'synthetic package-file fixtures; no native or Solidity qualification'})+'\n');
} finally{fs.rmSync(root,{recursive:true,force:true});}
