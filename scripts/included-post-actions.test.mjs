// Actual pinned public AVM validates current targets; no live network/proof/send.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PublicProcessorTestEnv} from '@aztec-labs/simulator/public/fixtures';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {Gas} from '@aztec-labs/stdlib/gas';
import {GlobalVariables} from '@aztec-labs/stdlib/tx';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {ORDINARY_POST_GAS_PROFILE} from '../shared/ordinary-post-fees.mjs';
test('native current-state target validation allows included targets and rejects missing or removed targets',async t=>{
 const raw=JSON.parse(await fs.readFile(process.env.ROLLING_TEST_ARTIFACT??new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))),artifact=loadContractArtifact(raw);
 assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),ORDINARY_POST_GAS_PROFILE.boardClassId);
 const slots=Object.fromEntries(raw.outputs.globals.storage.find(x=>x.name==='STORAGE_LAYOUT_RollingBoard').value.fields.find(x=>x.name==='fields').value.fields.map(x=>[x.name,BigInt('0x'+x.value.fields.find(x=>x.name==='slot').value.value)]));
 const globals=GlobalVariables.empty();globals.chainId=Fr.ONE;globals.version=Fr.ONE;
 const env=await PublicProcessorTestEnv.create({globals,config:{skipFeeEnforcement:true}});
 try{
  const instance=await env.tester.registerAndDeployContract([],AztecAddress.ZERO,artifact);
  const put=async(slot,values)=>{for(let i=0;i<values.length;i++)await env.tester.setPublicStorage(instance.address,new Fr(BigInt(slot)+BigInt(i)),new Fr(values[i]));};
  const map=async(name,key,values)=>put((await deriveStorageSlotInMap(new Fr(slots[name]),new Fr(key))).toBigInt(),values);
  await put(slots.config,[1n,1n,1n,1n,100n,1n,1n,1n,1n,1n,1n]);await env.tester.insertNullifier(instance.address,await poseidon2HashWithSeparator([new Fr(slots.config)],1653084894));await put(slots.main_version,[1n]);
  let id=1000n,cases=0;
  for(const operation of ['reply','quote','repost','like','unlike'])for(const state of ['present','missing','removed']){
   const target=id++,post=id++;await map('post_exists',target,[state==='missing'?0n:1n]);await map('post_flagged',target,[state==='removed'?1n:0n]);await map('post_records',target,[0n,0n,target,1n,0n,0n,0n]);
   let fnName,args;
   if(operation==='like'||operation==='unlike'){
    const tag=id++,previous=operation==='unlike';
    const actor=await poseidon2HashWithSeparator([new Fr(2),new Fr(target),new Fr(tag)],0x52434c53),count=await poseidon2HashWithSeparator([Fr.ONE,new Fr(target),Fr.ZERO],0x52434c53);
    await map('like_state',actor.toBigInt(),[previous?1n:0n]);await map('like_state',count.toBigInt(),[previous?1n:0n]);fnName='_set_like';args=[target,tag,!previous];
   }else{
    const message=Array.from({length:32},()=>Fr.ZERO);const empty=operation==='repost';if(!empty)message[0]=new Fr(120n<<240n);
    const draft={subboard:0n,parent:operation==='reply'?target:0n,root_reference:operation==='reply'?target:0n,kind:operation==='repost'?3:operation==='quote'?2:1,name_id:0n,reference:operation==='reply'?0n:target,message,length:empty?0:1,expected_main_policy_version:1,expected_local_policy_version:0};fnName='_publish';args=[post,draft,0n,0n];
   }
   const tx=await env.tester.createTx(instance.address,[],[{address:instance.address,fnName,args}]);tx.data.constants.txContext.chainId=Fr.ONE;tx.data.constants.txContext.version=Fr.ONE;tx.data.constants.txContext.gasSettings.gasLimits=new Gas(100000,12000000);await env.tester.setFeePayerBalance(instance.address);
   const [processed,failed]=await env.processor.process([tx]);assert.deepEqual(failed,[]);assert.equal(processed.length,1);
   const permitted=state==='present'||operation==='unlike'&&state==='removed';
   if(permitted){assert.equal(processed[0].revertReason,undefined,operation+'/'+state);assert.equal(processed[0].txEffect.publicLogs.length,1);}
   else {assert(processed[0].revertReason,operation+'/'+state);assert.equal(processed[0].txEffect.publicLogs.length,0,'rejected target cannot publish a successful effect');}
   cases++;
  }
  t.diagnostic(JSON.stringify({nativeCases:cases,checkpointGate:false}));
 }finally{await env[Symbol.asyncDispose]();BarretenbergSync.destroySingleton();}
});
