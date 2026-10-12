// Test-only browser bridge. The existing campaign owns chain/miner/prover and
// authenticates every transaction. Private phase files authorize no transaction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {startComposerL1Reader,startComposerPublicReader} from './rolling-composer-fixture.mjs';
import {writePreferenceKeyBackup} from './rolling-preference-browser-fixture.mjs';
import {validateRollingNotificationBrowserControl} from './rolling-notification-browser.mjs';

export function notificationBrowserBudget(deadlineAt,now=Date.now()){
 assert(Number.isSafeInteger(deadlineAt)&&Number.isSafeInteger(now));
 assert(deadlineAt-now>=180000,'Insufficient remaining notification browser and accounting budget');return 150000;
}
export async function readNotificationSubscriptionSignal(directory){
 let file;
 try{
  const dir=await fs.lstat(directory);assert(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===process.getuid()&&(dir.mode&0o777)===0o700&&await fs.realpath(directory)===directory);
  try{file=await fs.open(path.join(directory,'browser-subscription-confirmed.json'),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if(e.code==='ENOENT')return false;throw e;}
  const stat=await file.stat();assert(stat.isFile()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o600&&stat.size>0&&stat.size<=256);
  const bytes=Buffer.alloc(257),r=await file.read(bytes,0,bytes.length,0);assert.equal(r.bytesRead,stat.size);
  assert.deepEqual(JSON.parse(bytes.subarray(0,r.bytesRead)),{schemaVersion:1,phase:'subscription-confirmed'});return true;
 }finally{await file?.close();}
}
export async function runRollingNotificationFixture({ctx,actor,fees,endpoint,network,artifact,scope,deployment,expected,observation,persist,onSubscription,collectAfterBrowser}){
 const {loadRollingWalletAssets}=await import('../rolling-wallet-assets.mjs');
 const control=ctx.browserControl;assert.equal(control?.browserMode,'rolling-notifications');assert.equal(control.browserEngine,'chromium');
 notificationBrowserBudget(ctx.applicationDeadlineAt);
 Object.assign(observation,{passed:false,cleanup:{},scope:'Actual fee-only browser subscription, human reply, unread delivery, read marker and keys-only restoration'});
 let reader,l1,result,failure,handedOff=false,subscriptionObserved=false;
 try{
  const backupPath=path.join(ctx.directory,'notification-key-recovery.json');
  await writePreferenceKeyBackup({account:fees.authorAccount,password:control.backupPassword,file:backupPath});
  await actor.close();assert.throws(()=>actor.contextGuard());observation.nativeSubscriberClosed=true;observation.keysOnlyBackup=true;
  l1=await startComposerL1Reader({upstream:ctx.config.l1RpcUrls[0],origin:control.origin});
  const gas=fees.browserFixture.gas;
  const gasSettings=Object.fromEntries(['gasLimits','teardownGasLimits','maxFeesPerGas','maxPriorityFeesPerGas'].map(name=>[name,Object.fromEntries((name.endsWith('Gas')?['feePerDaGas','feePerL2Gas']:['daGas','l2Gas']).map(key=>[key,String(gas[name][key])]))]));
  const configuration={config:{network:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,ethRpcUrl:l1.url},board:{contractAddress:String(ctx.instance.address),portalAddress:String(ctx.ready.portalAddress).toLowerCase()},privateFee:{contractAddress:String(fees.browserFixture.instance.address),gasSettings}},trustedQuery:{url:endpoint+'/v1/node',allowLocalDev:true},remoteProver:{url:endpoint,board:String(ctx.instance.address),chainId:network.chainId,rollupVersion:network.version,proofsEnabled:true},proofsEnabled:true};
  const wallet=await loadRollingWalletAssets(configuration,scope);
  const started=await startComposerPublicReader({node:ctx.node,artifact,scope,deployment,cacheDirectory:path.join(ctx.directory,'notification-browser-public-index'),port:Number(new URL(control.origin).port),wallet});
  reader=started.reader;assert.equal(reader.url,control.origin);
  const readyDeadline=Math.min(Date.now()+10000,ctx.applicationDeadlineAt-180000);
  while(started.index.status().state!=='ready'){assert(Date.now()<readyDeadline);assert.notEqual(started.index.status().state,'unavailable');await sleep(25);}
  const handoff={browserMode:'rolling-notifications',browserEngine:'chromium',origin:control.origin,trustedOrigin:endpoint,ethereumOrigin:l1.url,backupPath,backupPassword:control.backupPassword,expected,timeoutMs:notificationBrowserBudget(ctx.applicationDeadlineAt)};
  await validateRollingNotificationBrowserControl(handoff,{directory:ctx.directory});
  await fs.writeFile(path.join(ctx.directory,'browser-ready.json'),JSON.stringify(handoff),{flag:'wx',mode:0o600});handedOff=true;ctx.mark('browser-ready');
  const deadline=Date.now()+handoff.timeoutMs+5000;
  for(;;){
   // Failure result takes precedence over a phase signal. No second call/retry
   // to the parent's one-use authenticated reply operation is possible.
   try{result=JSON.parse(await fs.readFile(path.join(ctx.directory,'browser-result.json'),'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}
   assert(Date.now()<deadline);
   if(!subscriptionObserved&&await readNotificationSubscriptionSignal(ctx.directory)){
    subscriptionObserved=true;
    const reply=await onSubscription();
    assert.deepEqual(Object.keys(reply).sort(),['replyBlock','replyId','replyText','rootId','schemaVersion']);assert.equal(reply.rootId,expected.rootId);
    await fs.writeFile(path.join(ctx.directory,'parent-reply-ready.json'),JSON.stringify(reply),{flag:'wx',mode:0o600});
   }
   await sleep(100);
  }
  observation.browser=result;assert.equal(result.passed,true);assert(subscriptionObserved);
 }catch(error){failure=error;}
 finally{
  const errors=[];
  // Collect canonical outcomes/charges even when a later UI assertion failed.
  // This callback is read-only and cannot replay either browser transaction.
  if(handedOff)try{await collectAfterBrowser(result,l1.stats(),async()=>{const response=await fetch(reader.url+'/api/feed?limit=100',{signal:AbortSignal.timeout(3000)});assert(response.ok);return response.json();});}catch(error){errors.push(error);}
  for(const [name,resource]of [['reader',reader],['l1',l1]])if(resource)try{await resource.close();observation.cleanup[name]=true;}catch(error){observation.cleanup[name]=false;errors.push(error);}
  observation.passed=!failure&&errors.length===0;await persist();
  if(result)await fs.writeFile(path.join(ctx.directory,'composer-observed.json'),JSON.stringify({schemaVersion:1,observed:true}),{flag:'wx',mode:0o600});
  if(failure||errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Notification browser campaign failed');
 }
}
