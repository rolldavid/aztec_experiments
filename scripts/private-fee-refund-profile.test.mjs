// Actual pinned AVM and world-state fixture. No chain transaction or proof is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PublicProcessorTestEnv} from '@aztec-labs/simulator/public/fixtures';
import {loadContractArtifact,getAllFunctionAbis,FunctionSelector} from '@aztec-labs/stdlib/abi';
import {Gas,GasFees} from '@aztec-labs/stdlib/gas';
import {GlobalVariables} from '@aztec-labs/stdlib/tx';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {DomainSeparator} from '@aztec-labs/constants';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {PRIVATE_FEE_REFUND_PROFILE,derivePrivateFeeInstance} from '../shared/private-fee-client.mjs';

test('pinned native FPC refund profile covers zero, positive and maximum field/u128 arguments',async()=>{
 const raw=JSON.parse(await fs.readFile(new URL('../apps/src/billboard/private_fee_artifact.json',import.meta.url),'utf8')),artifact=loadContractArtifact(raw),profile=PRIVATE_FEE_REFUND_PROFILE;
 assert.equal((await derivePrivateFeeInstance(raw)).currentContractClassId.toString(),profile.classId);
 const dispatch=artifact.functions.find(f=>f.name==='public_dispatch');
 assert.deepEqual(dispatch.errorTypes[profile.reservationError],{error_kind:'string',string:'Fee exceeds reservation'});
 const env=await PublicProcessorTestEnv.create({globals:GlobalVariables.empty(),config:{skipFeeEnforcement:true}});
 try{
  const instance=await env.tester.registerAndDeployContract([],AztecAddress.ZERO,artifact);
  for(const commitment of [Fr.ZERO,Fr.ONE,new Fr(Fr.MODULUS-1n)])await env.tester.insertNullifier(instance.address,await poseidon2HashWithSeparator([commitment,instance.address.toField()],DomainSeparator.PARTIAL_NOTE_VALIDITY_COMMITMENT));
  for(const [commitment,amount]of [[Fr.ONE,0n],[Fr.ZERO,1n],[Fr.ONE,1n],[new Fr(Fr.MODULUS-1n),(1n<<128n)-1n]]){
   const tx=await env.tester.createTx(instance.address,[],[],{address:instance.address,fnName:'_complete_refund',args:[{commitment},amount]},instance.address);
   tx.data.constants.txContext.gasSettings.teardownGasLimits=new Gas(profile.daGas,profile.l2Gas);
   tx.data.gasUsed=new Gas(96+profile.daGas,540000+profile.l2Gas);
   await env.tester.setFeePayerBalance(instance.address);
   const [processed,failed]=await env.processor.process([tx]);
   assert.deepEqual(failed,[]);assert.equal(processed.length,1);assert.equal(processed[0].revertReason,undefined);
   const gas=processed[0].gasUsed.teardownGas;
   assert.equal(gas.daGas,amount===0n?0:profile.daGas);assert.equal(gas.l2Gas,amount===0n?2067:profile.l2Gas);
   // Native accounting charges the allocated teardown, not its measured usage.
   assert(processed[0].gasUsed.billedGas.l2Gas>=processed[0].gasUsed.totalGas.l2Gas);
  }
  env.globals.gasFees=new GasFees(0n,1n);
  const denied=await env.tester.createTx(instance.address,[],[],{address:instance.address,fnName:'_complete_refund',args:[{commitment:Fr.ONE},0n]},instance.address);
  const [results,failures]=await env.processor.process([denied]);assert.deepEqual(failures,[]);
  const error=results[0].revertReason;assert(error);assert.equal(error.revertData.length,1);assert.equal(error.revertData[0].toBigInt().toString(),profile.reservationError);
  assert.equal(error.getCallStack().length,1);assert.equal(error.getCallStack()[0].contractAddress.toString(),instance.address.toString());
  const refund=getAllFunctionAbis(artifact).find(f=>f.name==='_complete_refund');
  assert.equal(error.getCallStack()[0].functionSelector.toString(),(await FunctionSelector.fromNameAndParameters(refund.name,refund.parameters)).toString());
 }finally{await env[Symbol.asyncDispose]();BarretenbergSync.destroySingleton();}
});
