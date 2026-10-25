// Run with node --experimental-vm-modules scripts/test-rolling-worker-close.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const original=await fs.readFile(root+'/apps/rolling/wallet-worker-entry.mjs','utf8');
const protocolSource=await fs.readFile(root+'/apps/rolling/wallet-worker-protocol.mjs','utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
async function scenario({legacy=false,fail=false,lateIdentity=false,identityGuard=true}={}){
 const warm=deferred(),native=deferred(),entered=deferred(),identity=deferred();const sent=[],events=[];let handler;
 const address='0x'+'1'.padStart(64,'0'),raw={secretKey:address,salt:address,address};
 const context=vm.createContext({console,performance,structuredClone,AbortController,URL,Promise,
 __aztec:{Fr:class {static fromHexString(){return {};}},SchnorrInitializerlessAccountContract:class {getContractArtifact(){return {};}getImmutablesHash(){return {}; }},deriveSigningKey:()=>({}),deriveKeys:async()=>({publicKeys:{}}),getContractInstanceFromInstantiationParams:async()=>({address:{toString:()=>address}}),computePartialAddress:async()=>({toString:()=>address}),normalizePrivateFeeGasSettings:()=>({gasSettings:{getFeeLimit:()=>({toBigInt:()=>1n})}}),ordinaryPostFeeLimit:()=>1n},ethers:{},BillboardPrivateFeeRouting:{},makeClaimSecretStore:()=>({}),
 postMessage:value=>sent.push(value),addEventListener:(name,fn)=>{assert.equal(name,'message');handler=fn;}});
 const stubs={
 './wallet-session.mjs':{createRollingWalletSession:async()=>{events.push('native-start');entered.resolve();await native.promise;return {busy:false,close:async()=>events.push('native-close')};},createRollingRefundSession:()=>{throw Error('unexpected refund');}},
 '../../shared/rolling/deployment.mjs':{createRollingDeploymentPreparation:()=>{},prepareRollingDeployment:()=>{}},
 '../../shared/rolling/funding-session.mjs':{createRollingFundingSession:async()=>({close:()=>events.push('funding-close')}),verifyRollingAggregateScope:()=>{}},
 };
 let source=original;
 const admission='const captured=structuredClone(raw);const derived=await deriveAccount(captured);await guard();';
 if(lateIdentity){
  source=source.replace(admission+"\n if(closing)throw workerFailure('ROLLING_CONTEXT_CHANGED');",admission).replace(admission+"if(closing)throw workerFailure('ROLLING_CONTEXT_CHANGED');",admission);
  if(identityGuard)source=source.replace(admission,admission+"if(closing)throw workerFailure('ROLLING_CONTEXT_CHANGED');");
 }
 if(legacy){const fixed='await Promise.allSettled([warming,opening].filter(Boolean));await Promise.allSettled([creating].filter(Boolean));';assert(source.includes(fixed));source=source.replace(fixed,'await Promise.allSettled([warming,opening,creating].filter(Boolean));');}
 // Configure only prerequisites; openAccount, startSession, invoke, close and
 // the real message handler remain byte-for-byte production code.
 source+='\nexport function prime(state,wait,identity,identityWait,late){settings={config:{aggregateFunding:{},privateFee:{gasSettings:{}},network:{ethRpcUrl:"https://unused.invalid"}},proofsEnabled:true};cryptoReady=late?identityWait:Promise.resolve();proverReady=Promise.resolve();warming=wait.then(()=>{publicState=state;return state;});derivedIdentity=late?undefined:{secretKey:identity.secretKey,salt:identity.salt,result:{address:identity.address,partialAddress:identity.address}};} export function hasOpening(){return !!opening;}';
 const entry=new vm.SourceTextModule(source,{context,identifier:'actual-worker-entry'});
 await entry.link(async specifier=>{
  if(specifier==='./wallet-worker-protocol.mjs')return new vm.SourceTextModule(protocolSource,{context});
  const exports=stubs[specifier];assert(exports,specifier);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});
 });await entry.evaluate();
 const state={node:{},deploymentPreparation:{},boardArtifact:{},privateFeeArtifact:{},fundingProvider:{destroy:()=>events.push('provider-destroy')},scopePreparation:{result:Promise.resolve(()=>{})}};
 entry.namespace.prime(state,warm.promise,raw,identity.promise,lateIdentity);
 const send=(id,method,args=[])=>handler({data:{type:'call',id,method,args}});
 send(1,'openAccount',[raw]);await tick();assert.equal(entry.namespace.hasOpening(),!lateIdentity);
 send(2,'close');await tick();assert(!sent.some(x=>x.type==='result'&&x.id===2));
 send(3,'ensureSession');await tick();assert.equal(sent.find(x=>x.type==='result'&&x.id===3)?.error?.code,'ROLLING_CONTEXT_CHANGED');
 if(lateIdentity){
  identity.resolve();await tick();await tick();
  if(identityGuard){
   assert.equal(entry.namespace.hasOpening(),false);
   assert.equal(sent.find(x=>x.type==='result'&&x.id===1)?.error?.code,'ROLLING_CONTEXT_CHANGED');
   warm.resolve();await tick();await tick();
   assert.equal(sent.find(x=>x.type==='result'&&x.id===2)?.value,true);
   assert.deepEqual(events,['provider-destroy']);return 'held identity rejects opening after close admission';
  }
  assert.equal(entry.namespace.hasOpening(),true);
  // It assigned opening AFTER close captured its drain set.
 }
 warm.resolve();await entered.promise;await tick();
 const premature=sent.some(x=>x.type==='result'&&x.id===2);
 if(legacy||lateIdentity){assert(premature);native.resolve();await tick();return lateIdentity?'held identity race reproduced':'legacy race reproduced';}
 assert.equal(premature,false);assert.deepEqual(events,['native-start']);
 if(fail)native.reject(Error('fixture native init failure'));else native.resolve();
 await tick();await tick();const done=sent.find(x=>x.type==='result'&&x.id===2);assert.equal(done?.value,true);assert.equal(done?.error,undefined);
 assert.deepEqual(events,fail?['native-start','funding-close','provider-destroy']:['native-start','native-close','funding-close','provider-destroy']);
 return fail?'failed native initialization drained':'successful native initialization closed in order';
}
for(const options of [{legacy:true},{},{fail:true},{lateIdentity:true,identityGuard:false},{lateIdentity:true}])console.log('PASS '+await scenario(options));
