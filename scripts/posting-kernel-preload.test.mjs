import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostingKernelPreload,POSTING_KERNEL_ARTIFACTS} from '../shared/posting-kernel-preload.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('three native assets load concurrently, once, without retaining result payloads',async()=>{
 const calls=[],pending=[deferred(),deferred(),deferred()];
 const preload=createPostingKernelPreload({getClientCircuitArtifactByName(name){calls.push(name);return pending[calls.length-1].promise;}});
 const first=preload();assert.equal(preload(),first);let settled=false;first.then(()=>settled=true);
 await Promise.resolve();assert.deepEqual(calls,POSTING_KERNEL_ARTIFACTS);assert.equal(settled,false);
 pending[0].resolve({bytecode:'not retained'});await Promise.resolve();assert.equal(settled,false);
 pending[1].resolve({bytecode:'not retained'});await Promise.resolve();assert.equal(settled,false);
 pending[2].resolve({bytecode:'not retained'});assert.equal(await first,undefined);assert.equal(preload(),first);assert.equal(calls.length,3);
});
test('failed optional preload drains siblings, reports failure, and never retries automatically',async()=>{
 const pending=deferred();let calls=0;const preload=createPostingKernelPreload({getClientCircuitArtifactByName(){if(++calls===1)throw Error('asset unavailable');return pending.promise;}});
 const operation=preload();let settled=false;operation.then(()=>settled=true,()=>settled=true);await Promise.resolve();await Promise.resolve();assert.equal(calls,3);assert.equal(settled,false);
 pending.reject(Error('other asset unavailable'));await assert.rejects(operation,/asset unavailable/);assert.equal(preload(),operation);assert.equal(calls,3);
});
test('preload uses real artifacts only, never simulations or an unrestricted variant sweep',()=>{
 assert.deepEqual(POSTING_KERNEL_ARTIFACTS,['PrivateKernelInit3Artifact','PrivateKernelResetTailToPublicArtifact_4_4_4_4_4_4_4_4_4','PrivateKernelResetTailToPublicArtifact_0_8_0_8_4_0_4_16_8']);assert(Object.isFrozen(POSTING_KERNEL_ARTIFACTS));
});
