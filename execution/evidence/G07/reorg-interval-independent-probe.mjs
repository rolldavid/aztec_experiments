import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {anvilBinary} from '../../../scripts/toolchain.mjs';
import {EthCheatCodes} from '@aztec-labs/ethereum/test';
import {replaceRollingL1Suffix} from '../../../scripts/testing/rolling-preference-reorg.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const child=spawn(anvilBinary(),['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--accounts','0','--silent'],{stdio:'ignore'});let closed=false;const exited=new Promise(r=>{child.once('close',()=>{closed=true;r()});child.once('error',()=>{closed=true;r()});});let result={cases:[]};
try{
 const url=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<30;i++){try{const x=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(500)});ready=(await x.json()).result==='0x7a69';}catch{}if(ready)break;await delay(50);}assert(ready);
 const eth=new EthCheatCodes([url],{nowInSeconds:()=>Math.floor(Date.now()/1000),setTime(){}});
 const state=async()=>({automine:await eth.isAutoMining(),interval:await eth.getIntervalMining()});
 await eth.setAutomine(true,{silent:true});await eth.setIntervalMining(0,{silent:true});assert.deepEqual(await state(),{automine:false,interval:null});result.oldSetupReproduced=true;
 for(const expected of [{automine:true,interval:null},{automine:false,interval:null},{automine:false,interval:60}]){
  await eth.setIntervalMining(expected.interval??0,{silent:true});if(expected.automine)await eth.setAutomine(true,{silent:true});else await eth.setAutomine(false,{silent:true});
  assert.deepEqual(await state(),expected);let reached=0,persists=0;const sentinel=Error('intentional read-only boundary stop');const observation={};
  await assert.rejects(replaceRollingL1Suffix({eth,retained:{},readBoundary:async()=>{reached++;assert.deepEqual(await state(),{automine:false,interval:null});throw sentinel;},quiescence:{autominingRestored:true,minerPassed:true,minerStopped:true,sequencerPaused:true},deadlineAt:Date.now()+120000,observation,persist:async()=>persists++}),x=>x===sentinel);
  assert.equal(reached,1);assert.equal(persists,1);assert(!Object.hasOwn(observation,'intent'));assert.equal(observation.miningControlsRestored,true);assert.deepEqual(await state(),expected);result.cases.push({...expected,paused:true,restored:true,intentAbsent:true});
 }
}finally{if(!closed){child.kill('SIGTERM');await Promise.race([exited,delay(2000)]);}if(!closed){child.kill('SIGKILL');await Promise.race([exited,delay(2000)]);}assert(closed);const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(port,'127.0.0.1',r)});await new Promise(r=>s.close(r));result.cleanup=true;}
console.log(JSON.stringify(result));
