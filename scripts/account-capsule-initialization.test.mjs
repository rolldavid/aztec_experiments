import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {poseidon2Hash,poseidon2HashBytes} from '@aztec-labs/foundation/crypto/poseidon';
import {deriveKeys,deriveMasterMessageSigningSecretKey} from '@aztec-labs/stdlib/keys';
import {SchnorrInitializerlessAccountContract} from '@aztec-labs/accounts/schnorr';
import {getContractInstanceFromInstantiationParams,computeContractAddressFromInstance,getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {BlockHeader,CallContext} from '@aztec-labs/stdlib/tx';
import {FunctionSelector} from '@aztec-labs/stdlib/abi';
import {WASMSimulator,toACVMWitness} from '@aztec-labs/simulator/client';
import {buildACIRCallback} from '@aztec-labs/pxe/simulator';
import {openTmpStore} from '@aztec-labs/kv-store/lmdb-v2';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {ContractStore} from '../node_modules/@aztec-labs/pxe/dest/storage/contract_store/contract_store.js';
import {CapsuleStore} from '../node_modules/@aztec-labs/pxe/dest/storage/capsule_store/capsule_store.js';
import {CapsuleService} from '../node_modules/@aztec-labs/pxe/dest/storage/capsule_store/capsule_service.js';
import {StagedWriteCoordinator} from '../node_modules/@aztec-labs/pxe/dest/storage/staged_write_coordinator.js';
import {OperationQueue} from '../node_modules/@aztec-labs/pxe/dest/operation_queue.js';
import {UtilityExecutionOracle} from '../node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js';
import {validatedPxeProve} from './pxe-validated-prove.mjs';
import {ORDINARY_POST_GAS_PROFILE} from '../shared/ordinary-post-fees.mjs';
const native=fs.readFileSync(process.env.ROLLING_NATIVE_PXE_SOURCE??new URL('../node_modules/@aztec-labs/pxe/dest/pxe.js',import.meta.url),'utf8');
const source=validatedPxeProve(native),start=source.indexOf('    async initializeSchnorrAccount('),end=source.indexOf('    // Validate actual kernel output',start);
assert(start>=0&&end>start);
const Native=vm.runInNewContext('(class {'+source.slice(start,end)+'})',{SyncFr:Fr,SyncAddress:AztecAddress,syncAccountKeyHash:poseidon2Hash,syncAccountSlotHash:poseidon2HashBytes,computeContractAddressFromInstance,Buffer});
const resources=[];after(async()=>{for(const f of resources){await f.queue.stop();await f.db.close();}await BarretenbergSync.destroySingleton();});
async function fixture(){
 const contract=new SchnorrInitializerlessAccountContract(deriveMasterMessageSigningSecretKey(new Fr(17))),artifact=await contract.getContractArtifact(),key=await contract.getSigningPublicKey(),{publicKeys}=await deriveKeys(new Fr(17));
 assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),ORDINARY_POST_GAS_PROFILE.accountClassId);
 const instance=await getContractInstanceFromInstantiationParams(artifact,{salt:new Fr(19),publicKeys,immutablesHash:await contract.getImmutablesHash()}),owner=instance.address;
 const db=await openTmpStore('schnorr-capsule',true,8192),capsules=new CapsuleStore(db),coordinator=new StagedWriteCoordinator({kvStore:db,stagedStores:[capsules]});
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop(){}})},synchronizer:{sync:()=>assert.fail('No node sync')},anchorBlockStore:{getBlockHeader:async()=>BlockHeader.empty()},contributors:[],stagedWriteCoordinator:coordinator,log:{debug(){},verbose(){},warn(){},error(){}}});queue.start();resources.push({db,queue});
 const contracts=new ContractStore(db);await contracts.addContractInstance(instance);
 const stored=await contracts.getContractInstance(owner);assert.equal(stored.currentContractClassId,undefined,'native persisted preimages contain only the original class');
 let writes=0;const set=capsules.setCapsule.bind(capsules);capsules.setCapsule=(...args)=>{writes++;return set(...args);};
 const pxe=new Native();Object.assign(pxe,{operationQueue:queue,keyStore:{getAccounts:async()=>[owner]},contractStore:contracts,capsuleStore:capsules});
 const slot=await poseidon2HashBytes(Buffer.from('INITIALIZERLESS_ACCOUNT_PUB_KEY'));
 const read=()=>queue.runSynced(({changeSetId})=>capsules.getCapsule(owner,slot,changeSetId,owner));
 const constructor=async(publicKey=key)=>queue.runSynced(async({changeSetId})=>{
  const fn=artifact.functions.find(f=>f.name==='constructor'),context=CallContext.empty();context.contractAddress=owner;context.functionSelector=await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters);
  const oracle=new UtilityExecutionOracle({callContext:context,anchorBlockHeader:BlockHeader.empty(),anchoredContractData:{getContractInstance:async()=>instance},capsuleService:new CapsuleService(capsules,[owner]),scopes:[owner],changeSetId});
  await new WASMSimulator({module:'schnorr-capsule-parity'}).executeUserCircuit(toACVMWitness(0,[publicKey.x,publicKey.y]),{...fn,contractName:artifact.name},buildACIRCallback(oracle,{contractAddress:owner}));
 });
 return {pxe,owner,key,instance,read,constructor,capsules,contracts,queue,get writes(){return writes;}};
}
test('actual compiled native constructor and local API produce the exact same owner-scoped capsule',async()=>{
 const f=await fixture();await f.constructor();const native=await f.read();assert.equal(f.writes,1);
 await f.pxe.initializeSchnorrAccount(f.owner,f.key,{contextGuard:async()=>{}});assert.equal(f.writes,1,'matching durable capsule is not rewritten');assert.deepEqual((await f.read()).map(String),native.map(String));
 await f.capsules.rollbackToBlock(0);assert.deepEqual((await f.read()).map(String),native.map(String),'native capsules are not block-anchored');
});
test('cold local initialization persists real native capsule without ACVM or network',async()=>{
 const f=await fixture();await f.pxe.initializeSchnorrAccount(f.owner,f.key,{contextGuard:async()=>{}});assert.deepEqual((await f.read()).map(String),[f.key.x,f.key.y].map(String));assert.equal(f.writes,1);
});
test('native compiled constructor and API both reject wrong key',async()=>{
 const f=await fixture(),key={x:f.key.x.add(Fr.ONE),y:f.key.y};await assert.rejects(f.constructor(key));await assert.rejects(f.pxe.initializeSchnorrAccount(f.owner,key,{contextGuard:async()=>{}}));assert.equal(await f.read(),null);assert.equal(f.writes,0);
});
for(const defect of ['owner','class','address','commit-guard'])test('local initializer rejects '+defect+' without persistent write',async()=>{
 const f=await fixture();let calls=0;
 if(defect==='owner')f.pxe.keyStore.getAccounts=async()=>[];
 if(defect==='class')f.instance.originalContractClassId=Fr.ONE;
 if(defect==='address')f.instance.salt=f.instance.salt.add(Fr.ONE);
 if(defect==='class'||defect==='address')await f.contracts.addContractInstance(f.instance);
 await assert.rejects(f.pxe.initializeSchnorrAccount(f.owner,f.key,{contextGuard:async()=>{if(defect==='commit-guard'&&++calls===3)throw Error('changed owner');}}));assert.equal(await f.read(),null);
});
