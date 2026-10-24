// Native AVM state transitions: stale browser accounting cannot release credit twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PublicProcessorTestEnv} from '@aztec-labs/simulator/public/fixtures';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {GlobalVariables} from '@aztec-labs/stdlib/tx';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {DomainSeparator} from '@aztec-labs/constants';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {BarretenbergSync} from '@aztec-foundation/bb.js';

test('native Bok finalization, cancellation and expiry retain one terminal state under competing inclusion',async()=>{
 const raw=JSON.parse(await fs.readFile(new URL('../../experiments/private-bok/target/private_bok-PrivateBok.json',import.meta.url)));
 const artifact=loadContractArtifact(raw),globals=GlobalVariables.empty();globals.timestamp=1000n;
 const env=await PublicProcessorTestEnv.create({globals,config:{skipFeeEnforcement:true}});
 try{
  const operator=new AztecAddress(new Fr(91));
  const instance=await env.tester.registerAndDeployContract([],operator,artifact);
  // Seed native deployed/public-immutable initialization, as in the existing
  // Board AVM fixture. This tests transitions, not contract deployment.
  await env.tester.insertNullifier(instance.address,await poseidon2HashWithSeparator([instance.address.toField()],DomainSeparator.PUBLIC_INITIALIZATION_NULLIFIER));
  await env.tester.insertNullifier(instance.address,await poseidon2HashWithSeparator([artifact.storageLayout.operator.slot],1653084894));
  await env.tester.setPublicStorage(instance.address,artifact.storageLayout.operator.slot,operator.toField());
  const reasonOf=result=>artifact.functions.find(fn=>fn.name==='public_dispatch').errorTypes[result.revertReason.revertData[0].toBigInt().toString()]?.string;
  let requestId=1n;
  const seed=async(reserved=0n)=>{
   const id=requestId++,slot=await deriveStorageSlotInMap(artifact.storageLayout.requests.slot,new Fr(id));
   // ACTIVE accounting with60 refundable units, and the native validity
   // nullifier created by its private partial-refund preparation.
   const refundCommitment=new Fr(10000n+id);
   await env.tester.insertNullifier(instance.address,await poseidon2HashWithSeparator([refundCommitment,instance.address.toField()],DomainSeparator.PARTIAL_NOTE_VALIDITY_COMMITMENT));
   const fields=[2n,9n,1n,999n,90n+reserved,60n,reserved,30n,0n,refundCommitment.toBigInt(),0n,0n,0n,7n];
   for(const [i,value]of fields.entries())await env.tester.setPublicStorage(instance.address,new Fr(slot.toBigInt()+BigInt(i)),new Fr(value));
   return id;
  };
  const run=async(id,fn)=>{
   const tx=await env.tester.createTx(fn.startsWith('_')?instance.address:operator,[],[{address:instance.address,fnName:fn,args:[id]}],undefined,instance.address);
   await env.tester.setFeePayerBalance(instance.address);
   const [processed,failed]=await env.processor.process([tx]);assert.deepEqual(failed,[]);assert.equal(processed.length,1);return processed[0];
  };
  for(const [first,second,reason]of [
   ['finish','_cancel','Request not cancellable'],['finish','_expire','Request not expirable'],
   ['_cancel','finish','Request not active'],['_expire','finish','Request not active'],
   ['_cancel','_cancel','Request not cancellable'],['_expire','_expire','Request not expirable'],
  ]){
   const id=await seed(),accepted=await run(id,first);assert.equal(accepted.revertReason,undefined,first);assert.equal(accepted.txEffect.noteHashes.length,1,'one native completed refund');assert.equal(accepted.txEffect.privateLogs.length,0);assert.equal(accepted.txEffect.publicLogs.length,2,'native partial completion plus accounting');
   const rejected=await run(id,second);assert(rejected.revertReason,second);assert.equal(reasonOf(rejected),reason);
   assert.equal(rejected.txEffect.noteHashes.length,0);assert.equal(rejected.txEffect.privateLogs.length,0);assert.equal(rejected.txEffect.publicLogs.length,0);
  }
  const reserved=await seed(10n),cancel=await run(reserved,'_cancel');assert.equal(reasonOf(cancel),'Reservation unresolved');
  const expiry=await run(reserved,'_expire');assert.equal(expiry.revertReason,undefined,'expiry fences unsettled reservation');assert.equal(expiry.txEffect.noteHashes.length,1,'only unreserved credit refunded');
  const finish=await run(reserved,'finish');assert.equal(reasonOf(finish),'Request not active');
 }finally{await env[Symbol.asyncDispose]();BarretenbergSync.destroySingleton();}
});
