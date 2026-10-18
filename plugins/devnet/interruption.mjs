// Real escrow and queue, with an explicit interruption instead of paid inference.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {aztecBoardPort} from '../aztec.mjs';
import {aztecEscrowPort} from '../escrow.mjs';
import {startEscrowService} from '../escrow-service.mjs';
import {retryUntil} from '@aztec-labs/foundation/retry';
import {drainDevnetCheckpoints} from './network.mjs';

export async function startInterruptionService({fixture}) {
 const {net,wallet,operator,descriptor}=fixture;
 assert.equal(descriptor.scope.chainId,'31337');
 await wallet.createSchnorrInitializerlessAccount(operator.secret,operator.salt,operator.signingKey);
 const artifact=async p=>loadContractArtifact(JSON.parse(await fs.readFile(p,'utf8')));
 const boardArtifact=await artifact('apps/src/billboard/billboard_artifact.json'),adapterArtifact=await artifact('plugins/adapter_artifact.json');
 const board=await aztecBoardPort({node:net.node,wallet,scope:descriptor.scope,boardArtifact,adapterArtifact,operator:operator.address,finality:'checkpointed'});
 const escrow=await aztecEscrowPort({node:net.node,wallet,address:descriptor.scope.receiver,artifact:adapterArtifact,operator:operator.address,development:true});
 const options={descriptor,escrow,board,port:fixture.serviceConfig.port,pollMs:50};
 const interruption=Error('Simulated interruption after reservation');
 let failure,interrupted=false,started=0,service,closed=false;
 const close=async()=>{if(closed)return;closed=true;await service.close();};
 service=await startEscrowService({...options,onError:error=>{if(error===interruption)interrupted=true;else failure=error;},run:async post=>{
  started++;await escrow.reserve(post,await escrow.available(post));throw interruption;
 }});
 const until=check=>retryUntil(async()=>{if(failure)throw failure;return check();},'interruption observation',120,0.1);
 return {address:service.address,close,async restartAndExpire(post){
  await until(()=>interrupted);assert.equal(started,1);
  await close();const reserved=await escrow.invocation(post);assert.equal(reserved.state,2);assert.equal(reserved.reserved,1000000n);assert.equal(await escrow.available(post),0n);
  let observed=false,replayed=false;failure=null;closed=false;
  const observedEscrow={...escrow,invocation:async id=>{const result=await escrow.invocation(id);if(id===post)observed=true;return result;}};
  service=await startEscrowService({...options,escrow:observedEscrow,onError:error=>{failure=error;},run:async()=>{replayed=true;}});
  await until(()=>observed);await close();assert.equal(failure,null);assert.equal(replayed,false);assert.equal((await escrow.invocation(post)).reserved,reserved.reserved);
  await drainDevnetCheckpoints(net);
  // Expiry is the contract state being exercised. The SDK owns the local
  // timestamp transition and serialized block; no manual L1/consensus clock.
  await net.node.warpL2TimeAtLeastTo(reserved.deadline+1);
  await net.node.mineBlock();
  const block=await net.node.getBlock(await net.node.getBlockNumber());
  assert(Number(block.header.globalVariables.timestamp)>reserved.deadline);
  await drainDevnetCheckpoints(net);
  return {replayed:false,reservedMicroUSDC:String(reserved.reserved),providerCalls:0,simulatedInterruption:true};
 }};
}
