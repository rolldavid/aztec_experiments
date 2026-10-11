// DEVELOPMENT ONLY: controlled local HTTP upstream with synthetic public chain
// state and a disposable address. Exercises production composition and schemas;
// this is not a real full-node, proof, anonymity, or deployment acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPrivateQuery} from './private-query.mjs';
import {createProverServer} from './server.mjs';
import {createTrustedPrivateNode,isTrustedPrivateNode} from '../shared/trusted-private-node.mjs';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';
import {getSchemaParameters,parseWithOptionals} from '@aztec-labs/foundation/schemas';
import {AztecNodeApiSchema} from '@aztec-labs/stdlib/interfaces/client';
import {BlockHeader} from '@aztec-labs/stdlib/tx';
import {AppendOnlyTreeSnapshot} from '@aztec-labs/stdlib/trees';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {L1ContractsNames} from '@aztec-labs/ethereum/l1-contract-addresses';

const hex = n => '0x' + n.toString(16).padStart(64,'0');
const rollup = '0x' + '12'.repeat(20);
const scope = {chainId:'31337',version:'1',rollup};
const address = AztecAddress.fromStringUnsafe(hex(55)); // Synthetic test address only.
const listen = async server => {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return 'http://127.0.0.1:' + server.address().port;
};
const stop = server => {server.closeAllConnections();return new Promise(resolve=>server.close(resolve));};

async function composition(t) {
  const id = n => ({number:n,hash:hex(n)}), tip = n => ({block:id(n),checkpoint:{number:n,hash:hex(n)}});
  // Same schema-valid NodeInfo/BlockData shape as shared trusted-node unit tests,
  // transported through real HTTP and both real production adapters here.
  const info = {nodeVersion:'6.0.0-rc.1',l1ChainId:31337,rollupVersion:1,realProofs:true,
    l1ContractAddresses:Object.fromEntries(L1ContractsNames.map(name=>[name,rollup])),
    protocolContractAddresses:Object.fromEntries(['classRegistry','feeJuice','instanceRegistry','multiCallEntrypoint'].map(name=>[name,hex(1)])),
    txsLimits:{gas:{daGas:100,l2Gas:100}}};
  const state = {latestBlockNumber:8,latestBlockHash:hex(8),finalizedBlockNumber:3,oldestHistoricBlockNumber:0,treesAreSynched:true};
  const tips = {proposed:id(8),checkpointed:tip(7),proven:tip(4),finalized:tip(3)};
  let lagSeconds = 0, upstreamFailure = false, frontRequests = 0;
  const calls = [], errors = [];
  const handlers = {
    getNodeInfo:()=>info,
    getChainTips:()=>tips,
    getWorldStateSyncStatus:()=>state,
    getSyncedL1Timestamp:()=>BigInt(Math.floor(Date.now()/1000)-lagSeconds),
    getBlockData:n=>{
      const header=BlockHeader.empty();header.globalVariables.blockNumber=n;
      return {header,blockHash:hex(n),archive:AppendOnlyTreeSnapshot.empty(),checkpointNumber:1,indexWithinCheckpoint:0};
    },
    getContract:(received,anchor)=>{
      assert.equal(received.toString(),address.toString());assert.equal(anchor,8);
      return undefined; // Genuine fixture absence, not a readiness-failure substitute.
    },
  };
  const upstream = http.createServer(async(req,res)=>{
    try {
      assert.equal(req.method,'POST');assert.equal(req.url,'/');
      assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,undefined);
      let text='';for await(const chunk of req)text+=chunk;
      const batch=JSON.parse(text);assert(Array.isArray(batch));
      if(upstreamFailure){calls.push('HTTP-failure');res.writeHead(503);res.end('SYNTHETIC_PRIVATE_SENTINEL');return;}
      const results=[];
      for(const request of batch){
        assert(request.method.startsWith('aztec_'));
        const method=request.method.slice(6);assert(Object.hasOwn(handlers,method));
        const args=await parseWithOptionals(request.params,getSchemaParameters(AztecNodeApiSchema[method]));
        calls.push(method);results.push({jsonrpc:'2.0',id:request.id,result:handlers[method](...args)??null});
      }
      res.writeHead(200,{'content-type':'application/json'});res.end(jsonStringify(results));
    }catch(error){errors.push(error);res.writeHead(500);res.end('Fixture rejected request');}
  });
  const upstreamUrl=await listen(upstream);t.after(()=>stop(upstream));
  // No injected inspector: this dynamically imports the production shared gate.
  const privateQuery=await createPrivateQuery({queryNode:{url:upstreamUrl,rollupAddress:rollup,maxLagSeconds:120},
    chainId:scope.chainId,rollupVersion:scope.version,proofsEnabled:true});
  const server=createProverServer({privateQuery,queue:{stats:()=>({submitted:0})},proofsEnabled:true,origins:[]});
  server.prependListener('request',()=>{frontRequests++;});
  const url=await listen(server);t.after(()=>stop(server));
  const create = () => createTrustedPrivateNode({url:url+'/v1/node',expectedNetworkScope:scope,proofsEnabled:true,allowLocalDev:true,maxLagSeconds:120});
  const reset = () => {calls.length=0;frontRequests=0;};
  t.after(()=>assert.deepEqual(errors,[],'Controlled upstream must accept every forwarded SDK request'));
  return {info,state,tips,calls,create,reset,url,get frontRequests(){return frontRequests;},
    setLag:value=>{lagSeconds=value;},setFailure:value=>{upstreamFailure=value;}};
}

const unavailable = error => error.code==='BB_TRUSTED_NODE_UNAVAILABLE'
  && !Object.hasOwn(error,'cause') && !String(error.stack).includes('SYNTHETIC_PRIVATE_SENTINEL');
const publicGate = ['getNodeInfo','getChainTips','getWorldStateSyncStatus','getBlockData','getBlockData','getSyncedL1Timestamp','getBlockData'];

test('development HTTP composition: real inspector, official schemas and genuine optional absence',async t=>{
  const f=await composition(t),node=await f.create();assert.equal(isTrustedPrivateNode(node),true);
  assert(!f.calls.includes('getContract')); // Bootstrap readiness uses public calls only.
  assert.equal(f.frontRequests,7);assert.equal(f.calls.length,56); // Each bootstrap call has its own seven-read server gate.
  f.reset();assert.equal(await node.getContract(address,8),undefined);
  assert.deepEqual(f.calls,[...publicGate,'getContract']);assert.equal(f.frontRequests,1);
  const health=await(await fetch(f.url+'/healthz')).json();assert.equal(health.proofs,'real');assert.deepEqual(health.query,{enabled:true,ready:true});
});

for(const [label,mutate,expected] of [
  ['chain identity',f=>{f.info.l1ChainId=1;},['getNodeInfo']],
  ['rollup identity',f=>{f.info.l1ContractAddresses.rollupAddress='0x'+'34'.repeat(20);},['getNodeInfo']],
  ['rollup version',f=>{f.info.rollupVersion=2;},['getNodeInfo']],
  ['proof mode',f=>{f.info.realProofs=false;},['getNodeInfo']],
  ['world synchronization',f=>{f.state.treesAreSynched=false;},publicGate.slice(0,3)],
  ['world fork',f=>{f.state.latestBlockHash=hex(99);},publicGate.slice(0,3)],
  ['L1 lag',f=>{f.setLag(121);},publicGate.slice(0,6)],
  ['unavailable upstream',f=>{f.setFailure(true);},['HTTP-failure']],
])test('development HTTP composition: changed '+label+' blocks personalized forward without retry/fallback',async t=>{
  const f=await composition(t),node=await f.create();
  f.reset();mutate(f);await assert.rejects(node.getContract(address,8),unavailable);
  assert.equal(f.frontRequests,1);assert.deepEqual(f.calls,expected);assert(!f.calls.includes('getContract'));
});

test('development HTTP composition: unhealthy bootstrap refuses branded client before personalized query',async t=>{
  const f=await composition(t);f.setLag(121);f.reset();await assert.rejects(f.create(),unavailable);
  assert.equal(f.frontRequests,1);assert.deepEqual(f.calls,publicGate.slice(0,6));assert(!f.calls.includes('getContract'));
  const health=await(await fetch(f.url+'/healthz')).json();assert.equal(health.ready,true);assert.deepEqual(health.query,{enabled:true,ready:false,reason:'unavailable'});
});
