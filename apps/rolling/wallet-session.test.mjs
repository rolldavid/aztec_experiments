// Negative custody boundaries: no SDK/network work may precede the account lock
// and the caller's current-account guard. These are synthetic unit checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRollingWalletSession} from './wallet-session.mjs';
function options(){
 const accesses=[];return {accesses,input:{sdk:new Proxy({},{get(_target,key){accesses.push(key);throw Error('Unexpected SDK access');}}),
  routing:{},ethers:{},config:{network:{chainId:31337,rollupVersion:1,rollupAddress:'0x'+'1'.repeat(40)}},
  boardArtifact:{},privateFeeArtifact:{},account:{address:'0x'+'2'.repeat(64),secretKey:'0x'+'3'.repeat(64),salt:'0'},
  trustedQuery:{url:'http://127.0.0.1:1',allowLocalDev:true},contextGuard:()=>{},locks:{request:async(_name,_options,fn)=>fn({})}}};
}
test('unsupported cross-tab custody fails before any SDK/network access',async()=>{
 const {input,accesses}=options();input.locks={};await assert.rejects(createRollingWalletSession(input),{code:'ROLLING_SESSION_CONFIG'});assert.deepEqual(accesses,[]);
});
test('another active tab rejects setup without reading or opening private stores',async()=>{
 const {input,accesses}=options();let requested;
 input.locks={request:async(name,config,fn)=>{requested={name,config};return fn(null);}};
 await assert.rejects(createRollingWalletSession(input),{code:'ROLLING_OTHER_TAB'});
 assert.deepEqual(requested,{name:'billboard-wallet:'+input.account.address,config:{ifAvailable:true}});assert.deepEqual(accesses,[]);
});
test('invalidated account rejects before trusted-node construction; lock callback settles',async()=>{
 const {input,accesses}=options(),original=Error('Account changed');let released=false;
 input.contextGuard=()=>{throw original;};input.locks={request:async(_name,_config,fn)=>{try{return await fn({});}finally{released=true;}}};
 await assert.rejects(createRollingWalletSession(input),error=>error===original);assert.equal(released,true);assert.deepEqual(accesses,[]);
});
test('query construction receives captured scope and preserves failure without fallback',async()=>{
 const {input}=options(),original=Error('Trusted service unavailable');let calls=0;
 input.sdk={createTrustedPrivateNode:async value=>{calls++;assert.deepEqual(value,{url:'http://127.0.0.1:1',allowLocalDev:true,
  expectedNetworkScope:{chainId:'31337',version:'1',rollup:'0x'+'1'.repeat(40)},proofsEnabled:true});throw original;}};
 await assert.rejects(createRollingWalletSession(input),error=>error===original);assert.equal(calls,1);
});
