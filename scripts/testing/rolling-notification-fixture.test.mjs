// Filesystem/budget controls only. No proof, chain or browser acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {notificationBrowserBudget,readNotificationSubscriptionSignal} from './rolling-notification-fixture.mjs';
import {getScenario} from './scenarios.mjs';
test('browser campaign retains 540s/4GiB parent and reserves 30s beyond 150s browser',()=>{
 const s=getScenario('rolling-notification-browser');assert.equal(s.deadlineMs,540000);assert.equal(s.fixtureHeapMiB,768);assert.equal(s.browser,'rolling-notifications');assert.equal(s.browserEngine,'chromium');assert.equal(s.applicationThreads,1);assert.equal(s.evidenceTask,'G07');
 assert.equal(notificationBrowserBudget(180001,1),150000);assert.throws(()=>notificationBrowserBudget(180000,1));
 for(const x of [NaN,Infinity,'180001',180001.1])assert.throws(()=>notificationBrowserBudget(x,1));
});
async function fixture(t){const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'notification-phase-')));await fs.chmod(directory,0o700);t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,file:path.join(directory,'browser-subscription-confirmed.json')};}
test('only exact private subscription phase file is accepted; absent file waits',async t=>{
 const {directory,file}=await fixture(t);assert.equal(await readNotificationSubscriptionSignal(directory),false);
 await fs.writeFile(file,JSON.stringify({schemaVersion:1,phase:'subscription-confirmed'}),{mode:0o600});assert.equal(await readNotificationSubscriptionSignal(directory),true);
});
for(const [name,text]of [['command',JSON.stringify({schemaVersion:1,phase:'subscription-confirmed',command:'send'})],['wrong phase',JSON.stringify({schemaVersion:1,phase:'marker-confirmed'})],['large','x'.repeat(257)],['empty',''],['malformed','{']])test('rejects '+name+' signal',async t=>{
 const {directory,file}=await fixture(t);await fs.writeFile(file,text,{mode:0o600});await assert.rejects(readNotificationSubscriptionSignal(directory));
});
test('rejects symlink phase and nonprivate file/directory',async t=>{
 const {directory,file}=await fixture(t),other=path.join(directory,'other');await fs.writeFile(other,'{}',{mode:0o600});await fs.symlink(other,file);await assert.rejects(readNotificationSubscriptionSignal(directory));
 await fs.unlink(file);await fs.writeFile(file,JSON.stringify({schemaVersion:1,phase:'subscription-confirmed'}),{mode:0o644});await assert.rejects(readNotificationSubscriptionSignal(directory));
 await fs.chmod(file,0o600);await fs.chmod(directory,0o755);await assert.rejects(readNotificationSubscriptionSignal(directory));
});
