import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../apps/rolling/wallet-worker-entry.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function preparePublic(){'),end=source.indexOf('\nfunction metadata(){',start);
assert(start>=0&&end>start);
// Execute the exact production public-preparation function with held native
// class/deployment capabilities. No account, PXE store, signer or network.
const run=Function('sdk','settings','cryptoReady','jsonAsset','localGuard','createRollingDeploymentPreparation','prepareRollingDeployment','background','pxeArtifactsReady',
 'let publicState; const ethers={},progress=()=>{};return ('+source.slice(start,end)+')();');
const tick=()=>new Promise(setImmediate);
function fixture({refundOnly=false}={}){
 const board={},fee={},deployment=Promise.withResolvers(),boardClass=Promise.withResolvers(),feeClass=Promise.withResolvers(),events=[];
 const node={},snapshot={},native={};let guardError,preparation,factoryError;let assetReads=0;const assets=Promise.withResolvers();let holdAssets=false;
 const input={sdk:{loadContractArtifact:value=>value,getContractClassFromArtifact:artifact=>{events.push(artifact===board?'board-class':'fee-class');return (artifact===board?boardClass:feeClass).promise;},preparePrivatePXE:(actual,options)=>{assert.equal(actual,node);assert.equal(options.nodeSnapshot,snapshot);events.push('native-preparation');return native;}},
 settings:{config:{refundOnly},trustedQuery:{},proofsEnabled:true,artifacts:{board,privateFee:fee},deploymentRegistration:{}},cryptoReady:Promise.resolve(),jsonAsset:async value=>{assetReads++;if(holdAssets)await assets.promise;return value;},localGuard:()=>{if(guardError)throw guardError;},
 createRollingDeploymentPreparation:options=>{if(factoryError)throw factoryError;assert.equal(options.boardArtifact,undefined);assert.equal(options.privateFeeArtifact,undefined);assert.equal(typeof options.loadRegistrationArtifacts,'function');preparation=options;return {};},
 prepareRollingDeployment:async()=>{events.push('deployment');const loaded=await preparation.loadRegistrationArtifacts();assert.equal(loaded.boardArtifact,board);assert.equal(loaded.privateFeeArtifact,fee);return deployment.promise;},background:(_name,promise)=>promise,pxeArtifactsReady:Promise.resolve()};
 return {board,fee,events,deployment,boardClass,feeClass,get assetReads(){return assetReads;},rejectFactory:()=>{factoryError=Error('factory failed');},holdAssets:()=>{holdAssets=true;},releaseAssets:()=>assets.resolve(),finish:()=>deployment.resolve({node,nodeSnapshot:snapshot}),invalidate:()=>guardError=Error('owner changed'),run:()=>run(...Object.values(input))};
}
for(const failure of ['none','board','fee','deployment','both'])test('public class warmup shares exact artifacts and drains independent work: '+failure,async()=>{
 const f=fixture();let settled=false;const work=f.run();work.then(()=>settled=true,()=>settled=true);
 const checked=failure==='none'?work:assert.rejects(work,failure==='deployment'||failure==='both'?/deployment failed/:new RegExp(failure+' failed'));
 await tick();assert.deepEqual(f.events,['deployment','board-class','fee-class']);
 if(failure==='deployment'||failure==='both')f.deployment.reject(Error('deployment failed'));else f.finish();
 if(failure==='board'||failure==='both')f.boardClass.reject(Error('board failed'));else f.boardClass.resolve({});
 await tick();assert.equal(settled,false);assert.equal(f.events.includes('native-preparation'),!['deployment','both'].includes(failure),'independent native public preparation is not delayed by class work');
 if(failure==='fee')f.feeClass.reject(Error('fee failed'));else f.feeClass.resolve({});
 const state=await checked;
 if(failure==='none'){assert.equal(state.boardArtifact,f.board);assert.equal(state.privateFeeArtifact,f.fee);assert(f.events.includes('native-preparation'));}
 else if(['deployment','both'].includes(failure))assert(!f.events.includes('native-preparation'));
});
test('late context invalidation cannot publish prewarmed public state',async()=>{
 const f=fixture(),work=f.run(),checked=assert.rejects(work,/owner changed/);await tick();f.invalidate();f.finish();f.boardClass.resolve({});f.feeClass.resolve({});await checked;assert(!f.events.includes('native-preparation'));
});
test('refund-only opening does not derive unused application classes',async()=>{
 const f=fixture({refundOnly:true}),state=await f.run();assert.equal(state.boardArtifact,f.board);assert.deepEqual(f.events,[]);
});

test('public node preparation starts before held artifact loads and class derivation',async()=>{
 const f=fixture();f.holdAssets();let settled=false;const work=f.run();work.then(()=>settled=true,()=>settled=true);
 await tick();assert.deepEqual(f.events,['deployment']);f.finish();await tick();assert.equal(settled,false);
 f.releaseAssets();await tick();assert(f.events.includes('board-class'));assert(f.events.includes('fee-class'));assert.equal(settled,false);
 f.boardClass.resolve({});f.feeClass.resolve({});const result=await work;assert.equal(result.boardArtifact,f.board);assert.equal(result.privateFeeArtifact,f.fee);
});

test('synchronous preparation factory failure starts no orphaned asset work',async()=>{
 const f=fixture();f.holdAssets();f.rejectFactory();await assert.rejects(f.run(),/factory failed/);assert.equal(f.assetReads,0);assert.deepEqual(f.events,[]);
});
