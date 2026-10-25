// Native compiled utility and native cache/queue; synthetic chain, no live calls.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {allToCompletion} from '@aztec-labs/foundation/promise';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {BlockHash} from '@aztec-labs/stdlib/block';
import {BlockHeader,CallContext} from '@aztec-labs/stdlib/tx';
import {MerkleTreeId} from '@aztec-labs/stdlib/trees';
import {PublicKeys} from '@aztec-labs/stdlib/keys';
import {SerializableContractInstance,computeContractAddressFromInstance,getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {computeSiloedPrivateInitializationNullifier} from '@aztec-labs/stdlib/hash';
import {loadContractArtifact,FunctionSelector} from '@aztec-labs/stdlib/abi';
import {WASMSimulator,toACVMWitness} from '@aztec-labs/simulator/client';
import {buildACIRCallback} from '@aztec-labs/pxe/simulator';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {withCache} from '../node_modules/@aztec-labs/pxe/dest/node/caching_aztec_node.js';
import {OperationQueue} from '../node_modules/@aztec-labs/pxe/dest/operation_queue.js';
import {UtilityExecutionOracle} from '../node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js';
import {ContractClassService} from '../node_modules/@aztec-labs/pxe/dest/contract/contract_class_service.js';
import {validatedPxeProve} from './pxe-validated-prove.mjs';
import {restoreNativePxe} from './patch-pxe-operation-guards.mjs';
import {ORDINARY_POST_GAS_PROFILE as profile} from '../shared/ordinary-post-fees.mjs';
const source=validatedPxeProve(restoreNativePxe(fs.readFileSync(new URL('../node_modules/@aztec-labs/pxe/dest/pxe.js',import.meta.url),'utf8'),'dest/pxe.js'));
const start=source.indexOf('    syncForAccountStatus(board) {'),end=source.indexOf('    prepareBoardActionState(',start);
const Native=vm.runInNewContext('(class {'+source.slice(start,end)+'})',{SyncAddress:AztecAddress,SyncBlockHash:BlockHash,SyncTreeId:MerkleTreeId,syncInitializationNullifier:computeSiloedPrivateInitializationNullifier,computeContractAddressFromInstance,allToCompletion});
const raw=JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))),artifact=loadContractArtifact(raw),fn=artifact.functions.find(f=>f.name==='get_deposit_ids');
const queues=[];after(async()=>{for(const q of queues)await q.stop();await BarretenbergSync.destroySingleton();});
async function fixture({exists=true}={}){
 const instance=new SerializableContractInstance({version:2,salt:Fr.ONE,deployer:AztecAddress.ZERO,currentContractClassId:Fr.fromString(profile.boardClassId),originalContractClassId:Fr.fromString(profile.boardClassId),initializationHash:new Fr(77),immutablesHash:Fr.ZERO,publicKeys:PublicKeys.default()});
 const board=await computeContractAddressFromInstance(instance),owner=AztecAddress.fromFieldUnsafe(new Fr(99));let header=BlockHeader.empty();header.globalVariables.blockNumber=3;
 const calls=[],gate={},hooks={};let notes=0;
 const node=withCache({getContract:async(address,anchor)=>{calls.push('class');assert(address.equals(board));assert(anchor.hash instanceof BlockHash);await gate.class?.promise;if(hooks.class)throw Error('class failed');return instance;},findLeavesIndexes:async(anchor,tree,values)=>{calls.push('nullifier');assert.equal(tree,MerkleTreeId.NULLIFIER_TREE);assert(anchor.hash instanceof BlockHash);assert(values[0].equals(await computeSiloedPrivateInitializationNullifier(board,instance.initializationHash)));await gate.nullifier?.promise;if(hooks.nullifier)throw Error('nullifier failed');return [exists?{data:1n,l2BlockNumber:3,l2BlockHash:anchor.hash}:undefined];}});
 const store={getContractInstance:async()=>instance};
 const sync={async syncWithAnchorRead(read,options){assert.equal(options.warmNodeCache,true);node.wipeCache();await read({number:header.getBlockNumber(),hash:(await header.hash()).toString()});await gate.sync?.promise;calls.push('sync-finished');}};
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop(){}})},synchronizer:{},anchorBlockStore:{},contributors:[],stagedWriteCoordinator:{begin:()=>assert.fail('No private changeset during public sync')},log:{debug(){},verbose(){},warn(){},error(){}}});queue.start();queues.push(queue);
 const pxe=new Native();Object.assign(pxe,{node,contractStore:store,operationQueue:queue,blockStateSynchronizer:sync});
 const utility=async()=>{
  const context=CallContext.empty();context.contractAddress=board;context.functionSelector=await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters);
  const oracle=new UtilityExecutionOracle({callContext:context,anchorBlockHeader:header,anchoredContractData:{getContractInstance:async()=>instance},aztecNode:node,noteStore:{getNotes:async()=>{notes++;return [];}},scopes:[owner],changeSetId:1});
  await new WASMSimulator({module:'account-status-init-parity'}).executeUserCircuit(toACVMWitness(0,[owner.toField(),Fr.ZERO]),{...fn,contractName:artifact.name},buildACIRCallback(oracle,{contractAddress:board}));
 };
 return {pxe,board,instance,node,store,calls,gate,hooks,utility,get notes(){return notes;},classRead:()=>new ContractClassService(node,store).getCurrentClassId(board,header),advance:()=>{header=BlockHeader.fromBuffer(header.toBuffer());header.globalVariables.blockNumber++;}};
}
test('native compiled deposit utility uses exact warmed initialization key and class anchor',async()=>{
 assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),profile.boardClassId);
 const f=await fixture();await f.pxe.syncForAccountStatus(f.board);assert.deepEqual(f.calls,['class','nullifier','sync-finished']);
 assert.equal((await f.classRead()).toString(),profile.boardClassId);await f.utility();assert.equal(f.notes,1);assert.equal(f.calls.length,3,'class and compiled utility use existing native cache without another RPC');
 f.advance();await f.classRead();await f.utility();assert.equal(f.calls.filter(x=>x==='class').length,2);assert.equal(f.calls.filter(x=>x==='nullifier').length,2,'changed anchor misses both immutable entries');
});
test('cached absence retains compiled Not initialized rejection before reading notes',async()=>{const f=await fixture({exists:false});await f.pxe.syncForAccountStatus(f.board);await assert.rejects(f.utility(),/Assertion failed/);assert.equal(f.notes,0);assert.equal(f.calls.filter(x=>x==='nullifier').length,1);});
for(const failure of ['class','nullifier'])test('account public sync drains '+failure+' failure under actual native operation queue',async()=>{
 const f=await fixture(),other=failure==='class'?'nullifier':'class';f.hooks[failure]=true;f.gate[other]=Promise.withResolvers();let settled=false,following=false;
 const pending=f.pxe.syncForAccountStatus(f.board);const rejected=assert.rejects(pending,new RegExp(failure+' failed')).finally(()=>settled=true);
 await new Promise(r=>setTimeout(r,10));const next=f.pxe.operationQueue.run(()=>{following=true;});await new Promise(r=>setTimeout(r,10));assert.equal(settled,false);assert.equal(following,false);assert.equal(f.notes,0);f.gate[other].resolve();await rejected;await next;assert.equal(following,true);
});
test('wrong original class or recomputed address rejects before sync or node reads',async()=>{for(const field of ['originalContractClassId','salt']){const f=await fixture();f.instance[field]=new Fr(999);await assert.rejects(f.pxe.syncForAccountStatus(f.board),/Invalid account status Board/);assert.equal(f.calls.length,0);}});
