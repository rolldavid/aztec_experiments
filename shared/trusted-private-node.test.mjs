import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTrustedNode,createTrustedPrivateNode,isTrustedPrivateNode} from './trusted-private-node.mjs';
import {BlockHeader} from '@aztec-labs/stdlib/tx';
import {AppendOnlyTreeSnapshot} from '@aztec-labs/stdlib/trees';
import {L1ContractsNames} from '@aztec-labs/ethereum/l1-contract-addresses';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';

// Development fakes only. These do not qualify a real trusted fullnode or traces.
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const rollup='0x'+'12'.repeat(20), scope={chainId:'31337',version:'1',rollup};
const options={expectedNetworkScope:scope,proofsEnabled:true,nowSeconds:1000};
function fixture() {
  const calls=[],id=n=>({number:n,hash:h(n)}),tip=n=>({block:id(n),checkpoint:{number:n,hash:h(n)}});
  const info={nodeVersion:'6.0.0-rc.1',l1ChainId:31337,rollupVersion:1,realProofs:true,
    l1ContractAddresses:Object.fromEntries(L1ContractsNames.map(name=>[name,rollup])),
    protocolContractAddresses:Object.fromEntries(['classRegistry','feeJuice','instanceRegistry','multiCallEntrypoint'].map(name=>[name,h(1)])),txsLimits:{gas:{daGas:100,l2Gas:100}}};
  const state={latestBlockNumber:8,latestBlockHash:h(8),finalizedBlockNumber:3,oldestHistoricBlockNumber:0,treesAreSynched:true};
  const tips={proposed:id(8),checkpointed:tip(7),proven:tip(4),finalized:tip(3)};
  const node={getNodeInfo:async()=>info,getWorldStateSyncStatus:async()=>state,getChainTips:async()=>tips,getSyncedL1Timestamp:async()=>990n,
    getBlockData:async n=>({header:{globalVariables:{blockNumber:n}},blockHash:h(n)})};
  for(const [method,run] of Object.entries(node))node[method]=async(...args)=>{calls.push([method,...args]);return run(...args);};
  return {node,info,state,tips,calls};
}
const rejects=(run,code)=>assert.rejects(run,error=>error.code==='BB_TRUSTED_NODE_'+code&&!String(error.stack).includes('PRIVATE_SENTINEL')&&!Object.hasOwn(error,'cause'));

test('development fake: bounded public readiness, only public methods and canonical recheck',async()=>{
  const f=fixture(),r=await inspectTrustedNode(f.node,options);
  assert.deepEqual(r,{ready:true,chainId:'31337',rollupVersion:'1',rollupAddress:rollup,proofsEnabled:true,latestBlockNumber:8,latestBlockHash:h(8),checkpointedBlockNumber:7,finalizedBlockNumber:3,oldestHistoricBlockNumber:0,syncedL1Timestamp:'990',checkedAtSeconds:1000,lagSeconds:10});
  assert.ok(Object.isFrozen(r));assert.deepEqual(f.calls.filter(x=>x[0]==='getBlockData'),[['getBlockData',7],['getBlockData',8],['getBlockData',8]]);
  assert.equal(isTrustedPrivateNode(f.node),false);
});
for(const [name,mutate] of [
  ['chain',f=>f.info.l1ChainId++],['version',f=>f.info.rollupVersion++],['rollup',f=>f.info.l1ContractAddresses.rollupAddress='0x'+'34'.repeat(20)],['proof policy',f=>f.info.realProofs=false]
])test('development fake: rejects wrong '+name+' before sync/private calls',async()=>{const f=fixture();mutate(f);await rejects(()=>inspectTrustedNode(f.node,options),'IDENTITY');assert.deepEqual(f.calls,[['getNodeInfo']]);});
for(const [name,mutate] of [
  ['unsynced trees',f=>f.state.treesAreSynched=false],['world lag',f=>f.state.latestBlockNumber--],['forked world',f=>f.state.latestBlockHash=h(77)],
  ['finality mismatch',f=>f.state.finalizedBlockNumber=2],['pruned checkpoint',f=>f.state.oldestHistoricBlockNumber=8],['tip order',f=>f.tips.proven.block.number=9],
  ['same-height fork',f=>f.tips.checkpointed.block={number:8,hash:h(99)}],['missing anchor',f=>f.node.getBlockData=async()=>undefined],
  ['incorrect header coordinate',f=>f.node.getBlockData=async n=>({blockHash:h(n),header:{globalVariables:{blockNumber:n+1}}})],
  ['reorg during inspection',f=>{let seen=0;f.node.getBlockData=async n=>({blockHash:h(n===8&&++seen>1?99:n),header:{globalVariables:{blockNumber:n}}});}]
])test('development fake: rejects '+name,async()=>{const f=fixture();mutate(f);await rejects(()=>inspectTrustedNode(f.node,options),'UNSYNCED');});
test('development fake: exact lag boundary, stale and future clocks',async()=>{
  for(const [stamp,passes] of [[880n,true],[879n,false],[1001n,false]]){const f=fixture();f.node.getSyncedL1Timestamp=async()=>stamp;if(passes)assert.equal((await inspectTrustedNode(f.node,options)).lagSeconds,120);else await rejects(()=>inspectTrustedNode(f.node,options),'STALE');}
});
for(const value of [undefined,990,'990',-1n])test('development fake: rejects missing/malformed timestamp '+String(value),async()=>{const f=fixture();f.node.getSyncedL1Timestamp=async()=>value;await rejects(()=>inspectTrustedNode(f.node,options),'UNAVAILABLE');});
test('development fake: bounded configuration and explicit disabled-proof chain',async()=>{
  for(const change of [{maxLagSeconds:0},{maxLagSeconds:601},{maxLagSeconds:1.5},{proofsEnabled:undefined},{expectedNetworkScope:{...scope,rollup:'PRIVATE_SENTINEL'}},{expectedNetworkScope:{...scope,chainId:'1'},proofsEnabled:false}])await rejects(()=>inspectTrustedNode(fixture().node,{...options,...change}),'CONFIG');
  const f=fixture();f.info.realProofs=false;assert.equal((await inspectTrustedNode(f.node,{...options,proofsEnabled:false})).proofsEnabled,false);
});
test('development fake: thrown errors/getters cannot leak into evidence',async()=>{
  const f=fixture();f.node.getNodeInfo=async()=>{throw Error('PRIVATE_SENTINEL');};await rejects(()=>inspectTrustedNode(f.node,options),'UNAVAILABLE');
  const g=fixture();Object.defineProperty(g.state,'treesAreSynched',{get(){throw Error('PRIVATE_SENTINEL');}});await rejects(()=>inspectTrustedNode(g.node,options),'UNAVAILABLE');
});

test('development fake: mutable getter projection retains only the validated read',async()=>{
  const f=fixture();let reads=0;
  Object.defineProperty(f.state,'oldestHistoricBlockNumber',{get(){return ++reads===1?0:'PRIVATE_SENTINEL';}});
  const result=await inspectTrustedNode(f.node,options);assert.equal(reads,1);assert.equal(result.oldestHistoricBlockNumber,0);assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('development fake: missing node method is fixed unavailable, never an alternate lookup',async()=>{
  const f=fixture();delete f.node.getWorldStateSyncStatus;await rejects(()=>inspectTrustedNode(f.node,options),'UNAVAILABLE');assert.deepEqual(f.calls,[['getNodeInfo'],['getChainTips']]);
});

async function withFetch(run) {const original=globalThis.fetch;try{return await run(value=>{globalThis.fetch=value;});}finally{globalThis.fetch=original;}}
function responseFor(f,body) {
  return Promise.all(body.map(async request=>{
    const name=request.method.replace(/^aztec_/,''),result=await f.node[name](...request.params);
    if(name==='getBlockData') {
      const header=BlockHeader.empty();header.globalVariables.blockNumber=request.params[0];
      return {id:request.id,jsonrpc:'2.0',result:{...result,header,archive:AppendOnlyTreeSnapshot.empty(),checkpointNumber:1,indexWithinCheckpoint:0}};
    }
    return {id:request.id,jsonrpc:'2.0',result};
  }));
}
const create=extra=>createTrustedPrivateNode({url:'https://trusted.example/prover/v1/node',expectedNetworkScope:scope,...extra});
test('mock transport: rejects unapproved URL before any request',async()=>withFetch(async set=>{
  let calls=0;set(async()=>{calls++;throw Error('unexpected');});
  for(const url of ['http://trusted.example/','http://127.0.0.1/','https://u:p@trusted.example/','https://trusted.example/?key=PRIVATE_SENTINEL','https://trusted.example/#x','file:///tmp/x'])await rejects(()=>create({url}),'CONFIG');
  assert.equal(calls,0);
}));
test('mock transport: one request on failure; no retry or secret cause, strict redirect policy',async()=>withFetch(async set=>{
  let calls=0;set(async(url,init)=>{calls++;assert.equal(url,'https://trusted.example/prover/v1/node');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');throw Error('PRIVATE_SENTINEL');});
  await rejects(()=>create(),'UNAVAILABLE');assert.equal(calls,1);
}));
for(const [label,response] of [['redirect',()=>new Response('',{status:302,headers:{location:'https://ordinary.example'}})],['invalid JSON',()=>new Response('PRIVATE_SENTINEL')],['HTTP failure',()=>new Response('PRIVATE_SENTINEL',{status:503})]])test('mock transport: '+label+' fails without retry',async()=>withFetch(async set=>{let calls=0;set(async()=>{calls++;return response();});await rejects(()=>create(),'UNAVAILABLE');assert.equal(calls,1);}));
test('mock transport with real SDK schema: brand, public inspection, no submission retries',async()=>withFetch(async set=>{
  const f=fixture();f.node.getSyncedL1Timestamp=async()=>BigInt(Math.floor(Date.now()/1000));let sends=0;
  set(async(url,init)=>{
    const body=JSON.parse(init.body);
    if(body.some(r=>r.method==='aztec_sendTx')){sends++;throw Error('PRIVATE_SENTINEL');}
    return new Response(jsonStringify(await responseFor(f,body)),{headers:{'content-type':'application/json'}});
  });
  const node=await create();assert.equal(isTrustedPrivateNode(node),true);assert.equal(isTrustedPrivateNode({...node}),false);
  assert.equal(isTrustedPrivateNode(null),false);assert.ok(Object.isFrozen(node));
  await rejects(()=>node.sendTx({fixture:'PRIVATE_SENTINEL'}),'UNAVAILABLE');assert.equal(sends,1);
}));
test('mock transport: explicit loopback development allowed, version header mismatch rejected',async()=>withFetch(async set=>{
  const f=fixture();set(async(url,init)=>new Response(jsonStringify(await responseFor(f,JSON.parse(init.body))),{headers:{'x-aztec-l1ChainId':'1'}}));
  await rejects(()=>create({url:'http://127.0.0.1:1234',allowLocalDev:true}),'UNAVAILABLE');
}));


test('mock transport: 32 MiB client cap cancels bounded stream before reading remaining chunks, once',async()=>withFetch(async set=>{
  let requests=0,pulls=0,cancels=0;
  // One reusable 16 MiB chunk. The fourth/fifth chunks must never be requested;
  // this distinguishes the byte guard from eventual JSON/schema rejection.
  const chunk=new Uint8Array(16*1024*1024);
  set(async()=>{
    requests++;
    return new Response(new ReadableStream({
      pull(controller){pulls++;if(pulls<=5)controller.enqueue(chunk);else controller.close();},
      cancel(){cancels++;}
    },{highWaterMark:0}));
  });
  await rejects(()=>create(),'UNAVAILABLE');
  assert.equal(requests,1);assert.equal(pulls,3);assert.equal(cancels,1);
}));
