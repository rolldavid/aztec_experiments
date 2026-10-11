// Labelled pure-fake orchestration tests. No node, HTTP service or genuine proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedQueryFixtureForTests} from './trusted-query-fixture.mjs';
const hash='0x'+'01'.repeat(32),rollup='0x'+'02'.repeat(20),board='0x'+'03'.repeat(32);
function fake({mismatchCode='BB_TRUSTED_NODE_IDENTITY',rpcError,serviceError,closeServiceError,closeRpcError,mode=false,anchor=1,jobs=0,afterError,changedSource=false}={}){
  const events=[],saved=[],configs=[],requests=[];let sources=0,healthyCount=0;
  const info={l1ChainId:31337,realProofs:mode,rollupVersion:1,l1ContractAddresses:{rollupAddress:rollup}};
  const block={blockHash:hash,header:{globalVariables:{blockNumber:anchor}}};
  const ctx={directory:'/tmp/fake-query-fixture',rollupAddress:rollup,instance:{address:board},
    node:{getNodeInfo:async()=>info,getChainTips:async()=>({checkpointed:{block:{number:anchor,hash}}}),getBlockData:async()=>block},mark:async()=>{}};
  const deps={sourceBinding:async()=>({revision:changedSource&&sources++?'b'.repeat(40):'a'.repeat(40),hashes:{}}),
    save:async(_,value)=>saved.push(structuredClone(value)),startNodeRpc:async node=>{assert.equal(node,ctx.node);events.push('start-rpc');if(rpcError)throw rpcError;return {url:'http://127.0.0.1:8888/',close:async()=>{events.push('close-rpc');if(closeRpcError)throw closeRpcError;}};},
    startService:async config=>{events.push('start-service');configs.push(config);if(serviceError)throw serviceError;return {url:'http://127.0.0.1:8889',stats:()=>({submitted:jobs,completed:0,failed:0,jobs,bytes:0,running:false}),close:async()=>{events.push('close-service');if(closeServiceError)throw closeServiceError;}};},
    health:async()=>({proofs:'disabled',query:{enabled:true,ready:true}}),
    createTrustedPrivateNode:async options=>{requests.push(structuredClone(options));if(options.proofsEnabled){if(mismatchCode==='SUCCESS')return {};throw Object.assign(Error('PRIVATE_SENTINEL'),{code:mismatchCode});}if(++healthyCount===2&&afterError)throw afterError;return {getNodeInfo:async()=>info,getBlockData:async n=>{assert.equal(n,anchor);return block;}};}};
  return {run:createTrustedQueryFixtureForTests(deps),ctx,events,saved,configs,requests};
}
test('pure fake: same actual node policy false passes before/after exact observed true mismatch',async()=>{
  const f=fake(),r=await f.run(f.ctx);assert(r.passed);assert.deepEqual(f.requests.map(v=>v.proofsEnabled),[false,true,false]);
  assert(f.requests.every(v=>v.url==='http://127.0.0.1:8889/v1/node'&&v.expectedNetworkScope.chainId==='31337'));
  assert.equal(f.configs[0].board,board);assert.equal(f.configs[0].proofs,'disabled');assert.equal(f.configs[0].queryNode.url,'http://127.0.0.1:8888/');
  assert.deepEqual(r.checks.mismatch,{passed:true,actualNodeProofs:false,expectedProofs:true,code:'BB_TRUSTED_NODE_IDENTITY'});
  assert.deepEqual(r.cleanup,{nodeRpcClosed:true,queryServiceClosed:true});assert.deepEqual(f.events,['start-rpc','start-service','close-service','close-rpc']);assert.deepEqual(f.saved.at(-1),r);assert(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
});
for(const code of ['BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_CONFIG','SUCCESS'])test('pure fake: '+code+' cannot pass observed proof-mode mismatch',async()=>{
  const f=fake({mismatchCode:code});await assert.rejects(f.run(f.ctx),error=>{assert.equal(error.trustedQueryObservation.passed,false);assert.equal(error.trustedQueryObservation.checks.mismatch,undefined);return true;});
  assert.deepEqual(f.events.slice(-2),['close-service','close-rpc']);assert(!JSON.stringify(f.saved).includes('PRIVATE_SENTINEL'));
});
test('pure fake: no proof policy mutation or fabricated genesis when preconditions fail',async()=>{
  for(const options of [{mode:true},{anchor:0}]){const f=fake(options);await assert.rejects(f.run(f.ctx));assert.deepEqual(f.events,[]);}
  const f=fake();delete f.ctx.instance;await assert.rejects(f.run(f.ctx));assert.deepEqual(f.events,[]);
});
test('pure fake: original service-start exception preserved and earlier RPC closed',async()=>{
  const error=Error('PRIVATE_START'),f=fake({serviceError:error});await assert.rejects(f.run(f.ctx),e=>e===error);assert.deepEqual(f.events,['start-rpc','start-service','close-rpc']);assert(error.trustedQueryObservation.cleanup.nodeRpcClosed);assert(!JSON.stringify(f.saved).includes(error.message));
});
test('pure fake: cleanup attempts both adapters and retains original failure with cleanup errors',async()=>{
  const one=Error('PRIVATE_CLOSE_SERVICE'),two=Error('PRIVATE_CLOSE_RPC'),f=fake({mismatchCode:'BB_TRUSTED_NODE_UNAVAILABLE',closeServiceError:one,closeRpcError:two});
  await assert.rejects(f.run(f.ctx),e=>e instanceof AggregateError&&e.errors.length===3&&e.errors[1]===one&&e.errors[2]===two&&e.trustedQueryObservation.passed===false);
  assert.deepEqual(f.events.slice(-2),['close-service','close-rpc']);assert(!JSON.stringify(f.saved).includes('PRIVATE_'));
});
test('pure fake: proof jobs, failed matching recovery or changed source prevent acceptance',async()=>{
  for(const options of [{jobs:1},{afterError:Error('PRIVATE_AFTER')},{changedSource:true}]){const f=fake(options);await assert.rejects(f.run(f.ctx));assert.equal(f.saved.at(-1).passed,false);assert.deepEqual(f.events.slice(-2),['close-service','close-rpc']);assert(!JSON.stringify(f.saved).includes('PRIVATE_'));}
});
test('pure fake: cleanup failure turns otherwise passing observation into failure',async()=>{
  const error=Error('PRIVATE_CLEANUP'),f=fake({closeServiceError:error});await assert.rejects(f.run(f.ctx),e=>e instanceof AggregateError&&e.errors[0]===error&&e.trustedQueryObservation.passed===false);assert.equal(f.saved.at(-1).stage,'cleanup');assert(f.saved.at(-1).cleanup.nodeRpcClosed);
});
