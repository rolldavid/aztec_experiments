// Actual disposable pinned Anvil only: no Aztec node, wallets, proofs or paid actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPublicClient,http} from 'viem';
import {foundry} from 'viem/chains';
import {withC01ClientMining,synchronizeC01MinedClock} from './c01-client-mining.mjs';
import {ROOT,pins} from './toolchain.mjs';
import path from 'node:path';
const binary=process.env.C01_TEST_ANVIL??path.join(ROOT,'.build/anvil-'+pins.anvil.release,'anvil');
const dateProvider=()=>({time:Date.now(),nowInSeconds(){return Math.floor(this.time/1000);},setTime(value){this.time=value;}});
async function fixture(work){
  const version=execFileSync(binary,['--version'],{encoding:'utf8'});assert(version.includes(pins.anvil.version));assert(version.includes(pins.anvil.commit));
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const child=spawn(binary,['--host','127.0.0.1','--port',String(port),'--silent'],{stdio:'ignore'});const closed=once(child,'close');
  const rpcUrl=`http://127.0.0.1:${port}`,client=createPublicClient({chain:foundry,transport:http(rpcUrl,{retryCount:0,timeout:1000})});
  try{
    let ready=false;for(let i=0;i<80;i++){try{ready=await client.getChainId()===31337;if(ready)break;}catch{}await sleep(25);}assert(ready);
    return await work({client,rpcUrl});
  }finally{child.kill('SIGKILL');await closed;assert(child.signalCode==='SIGKILL'||child.exitCode!==null);}
}
test('test clock synchronization preserves exact mined timestamp',()=>{
  const clock=dateProvider();clock.time=9000;assert.equal(synchronizeC01MinedClock(clock,4),5);assert.equal(clock.time,4000);
  assert.throws(()=>synchronizeC01MinedClock(clock,NaN));
});
test('actual Anvil interval and warp: real-wall mode includes queued automatic transactions without future timestamps',{timeout:20000},async()=>fixture(async({client,rpcUrl})=>{
  const request=(method,params=[])=>client.request({method,params});
  const [from,to]=await request('eth_accounts');
  await request('anvil_setBlockTimestampInterval',[1]);
  const wall=Math.floor(Date.now()/1000);await request('evm_setNextBlockTimestamp',[wall+2]);await request('evm_mine');
  await request('eth_sendTransaction',[{from,to,value:'0x1'}]);
  assert(Number((await client.getBlock()).timestamp)>Math.floor(Date.now()/1000),'Reproduce real interval/warp future clock');
  const observation={};
  await withC01ClientMining({rpcUrl,dateProvider:dateProvider(),observation,mode:'real-wall',deadlineAt:Date.now()+12000},async tick=>{
    assert.equal(await request('anvil_getAutomine'),false);
    const before=await client.getBlock();
    const tx=await request('eth_sendTransaction',[{from,to,value:'0x1'}]);
    // Regardless of whether the one loop mined between these reads, inclusion
    // must have a real-wall timestamp. There is no automatic mining owner.
    await tick();const receipt=await client.getTransactionReceipt({hash:tx});
    const included=await client.getBlock({blockNumber:receipt.blockNumber});assert(included.timestamp>before.timestamp);
    assert(included.timestamp<=BigInt(Math.floor(Date.now()/1000)));assert.equal(receipt.status,'success');
    await tick();assert((await client.getBlock()).timestamp<=BigInt(Math.floor(Date.now()/1000)));
  });
  assert.equal(observation.clientMining.mode,'real-wall');assert(observation.clientMining.ordinaryBlocksMined>=3);
  assert.equal(observation.clientMining.passed,true);assert.equal(observation.clientMining.stopped,true);
  assert.equal(observation.clientMining.autominingRestored,true);assert.equal(await request('anvil_getAutomine'),true);
  // Mode restoration does not clear the original standing interval.
  const tip=await client.getBlock(),pending=await client.getBlock({blockTag:'pending'});assert.equal(pending.timestamp-tip.timestamp,1n);
}));
test('actual Anvil: work failure identity survives cleanup and prior disabled automining is restored',{timeout:10000},async()=>fixture(async({client,rpcUrl})=>{
  await client.request({method:'evm_setAutomine',params:[false]});const observation={},failure=Error('UNIT_FAILURE');
  await assert.rejects(withC01ClientMining({rpcUrl,dateProvider:dateProvider(),observation,mode:'real-wall',deadlineAt:Date.now()+5000},async()=>{throw failure;}),error=>error===failure);
  assert.equal(await client.request({method:'anvil_getAutomine',params:[]}),false);
  assert.equal(observation.clientMining.passed,false);assert.equal(observation.clientMining.stopped,true);assert.equal(observation.clientMining.autominingRestored,true);
}));
test('actual Anvil: future chain fails at parent deadline without mining backwards or entering work',{timeout:10000},async()=>fixture(async({client,rpcUrl})=>{
  await client.request({method:'evm_setNextBlockTimestamp',params:[Math.floor(Date.now()/1000)+20]});await client.request({method:'evm_mine',params:[]});
  const before=await client.getBlock();const observation={};let called=false;
  await assert.rejects(withC01ClientMining({rpcUrl,dateProvider:dateProvider(),observation,mode:'real-wall',deadlineAt:Date.now()+250},async()=>{called=true;}),{message:'C01_REAL_WALL_DEADLINE'});
  assert.equal(called,false);assert.equal((await client.getBlock()).number,before.number);
  assert.equal(observation.clientMining.ordinaryBlocksMined,0);assert.equal(observation.clientMining.stopped,true);
  assert.equal(observation.clientMining.autominingRestored,true);
}));
test('actual Anvil: default setup mode retains interval-driven future mining',{timeout:10000},async()=>fixture(async({client,rpcUrl})=>{
  const now=Math.floor(Date.now()/1000);await client.request({method:'anvil_setBlockTimestampInterval',params:[1]});
  await client.request({method:'evm_setNextBlockTimestamp',params:[now+30]});const observation={};
  await withC01ClientMining({rpcUrl,dateProvider:dateProvider(),observation},async()=>{assert(Number((await client.getBlock()).timestamp)>Math.floor(Date.now()/1000));});
  assert.equal(observation.clientMining.mode,'warped');assert.equal(observation.clientMining.passed,true);
  assert.equal(observation.clientMining.autominingDisabled,undefined);
}));
