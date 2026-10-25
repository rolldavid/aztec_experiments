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
import {SerializableContractInstance,SerializableContractInstancePreimage,computeContractAddressFromInstance,getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
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
const start=source.indexOf('    syncForAccountStatus(board, privateFee) {'),end=source.indexOf('    prepareBoardActionState(',start);
const Native=vm.runInNewContext('(class {'+source.slice(start,end)+'})',{SyncAddress:AztecAddress,SyncBlockHash:BlockHash,SyncTreeId:MerkleTreeId,syncInitializationNullifier:computeSiloedPrivateInitializationNullifier,computeContractAddressFromInstance,allToCompletion});
const raw=JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))),artifact=loadContractArtifact(raw),fn=artifact.functions.find(f=>f.name==='get_deposit_ids');
const queues=[];after(async()=>{for(const q of queues)await q.stop();await BarretenbergSync.destroySingleton();});
async function fixture({exists=true,ordinary=false}={}){
 const instance=new SerializableContractInstance({version:2,salt:Fr.ONE,deployer:AztecAddress.ZERO,currentContractClassId:Fr.fromString(profile.boardClassId),originalContractClassId:Fr.fromString(profile.boardClassId),initializationHash:new Fr(77),immutablesHash:Fr.ZERO,publicKeys:PublicKeys.default()});
 const board=await computeContractAddressFromInstance(instance),registered=new Map([[board.toString(),instance]]);let owner=AztecAddress.fromFieldUnsafe(new Fr(99)),privateFee;
 if(ordinary){for(const [role,id]of [['owner',profile.accountClassId],['fee',profile.privateFeeClassId]]){const value=new SerializableContractInstance({...instance,currentContractClassId:Fr.fromString(id),originalContractClassId:Fr.fromString(id)}),address=await computeContractAddressFromInstance(value);registered.set(address.toString(),value);if(role==='owner')owner=address;else privateFee=address;}}
 let header=BlockHeader.empty();header.globalVariables.blockNumber=3;
 const calls=[],gate={},hooks={};let notes=0;
 const node=withCache({getContract:async(address,anchor)=>{calls.push(address.equals(board)?'class':address.equals(owner)?'account-class':'fee-class');assert(registered.has(address.toString()));assert(anchor.hash instanceof BlockHash);const label=privateFee!==undefined&&address.equals(privateFee)?'fee':'class';await gate[label]?.promise;if(hooks[label])throw Error(label+' failed');return registered.get(address.toString());},findLeavesIndexes:async(anchor,tree,values)=>{calls.push('nullifier');assert.equal(tree,MerkleTreeId.NULLIFIER_TREE);assert(anchor.hash instanceof BlockHash);assert(values[0].equals(await computeSiloedPrivateInitializationNullifier(board,instance.initializationHash)));await gate.nullifier?.promise;if(hooks.nullifier)throw Error('nullifier failed');return [exists?{data:1n,l2BlockNumber:3,l2BlockHash:anchor.hash}:undefined];}});
 const store={getContractInstance:async address=>{const value=registered.get(address.toString());return value&&new SerializableContractInstancePreimage(value).withAddress(address);}};
 const sync={async syncWithAnchorRead(read,options){assert.equal(options.warmNodeCache,true);node.wipeCache();const anchor={number:header.getBlockNumber(),hash:(await header.hash()).toString()},value=await read(anchor);await gate.sync?.promise;calls.push('sync-finished');return {anchor,value};}};
 const queue=new OperationQueue({autoSync:false,node:{startRecording:()=>({stop(){}})},synchronizer:{},anchorBlockStore:{},contributors:[],stagedWriteCoordinator:{begin:()=>assert.fail('No private changeset during public sync')},log:{debug(){},verbose(){},warn(){},error(){}}});queue.start();queues.push(queue);
 const pxe=new Native();Object.assign(pxe,{node,contractStore:store,operationQueue:queue,blockStateSynchronizer:sync});
 const utility=async(name='get_deposit_ids')=>{
  const fn=artifact.functions.find(f=>f.name===name);
  const context=CallContext.empty();context.contractAddress=board;context.functionSelector=await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters);
  const oracle=new UtilityExecutionOracle({callContext:context,anchorBlockHeader:header,anchoredContractData:{getContractInstance:async()=>instance},aztecNode:node,noteStore:{getNotes:async()=>{notes++;return [];}},scopes:[owner],changeSetId:1});
  await new WASMSimulator({module:'account-status-init-parity'}).executeUserCircuit(toACVMWitness(0,[owner.toField(),Fr.ZERO]),{...fn,contractName:artifact.name},buildACIRCallback(oracle,{contractAddress:board}));
 };
 return {pxe,board,owner,privateFee,registered,instance,node,store,calls,gate,hooks,utility,get notes(){return notes;},classRead:()=>new ContractClassService(node,store).getCurrentClassId(board,header),feeClassRead:()=>new ContractClassService(node,store).getCurrentClassId(privateFee,header),advance:()=>{header=BlockHeader.fromBuffer(header.toBuffer());header.globalVariables.blockNumber++;}};
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

test('ordinary sync warms exact native account/FPC/Board classes and compiled screening initialization',async()=>{
 const f=await fixture({ordinary:true});let policies=0;
 const result=await f.pxe.syncForOrdinaryPost({owner:f.owner,board:f.board,privateFee:f.privateFee},async anchor=>{policies++;assert.equal(anchor.number,3);return 7;});
 assert.equal(result.value,7);assert.equal(policies,1);
 assert.deepEqual(f.calls,['account-class','fee-class','class','nullifier','sync-finished']);
 const classes=new ContractClassService(f.node,f.store);
 for(const [address,id]of [[f.owner,profile.accountClassId],[f.privateFee,profile.privateFeeClassId]])assert.equal((await classes.getCurrentClassId(address,{toBlockParameter:async()=>({number:result.anchor.number,hash:BlockHash.fromString(result.anchor.hash)})})).toString(),id);
 await assert.rejects(f.utility('get_screen_hints'),/BB_HISTORY_DEPOSIT_MISSING|Assertion failed/);
 assert.equal(f.notes,1,'compiled initialization passed before actual empty note lookup');assert.equal(f.calls.length,5,'class/init consumers reuse exact native typed keys');
 f.advance();await f.classRead();await assert.rejects(f.utility('get_screen_hints'));assert.equal(f.calls.filter(x=>x==='class').length,2);assert.equal(f.calls.filter(x=>x==='nullifier').length,2,'new anchor cannot reuse old initialization');
});
for(const field of ['originalContractClassId','salt'])test('ordinary sync rejects altered local '+field+' before public reads',async()=>{
 const f=await fixture({ordinary:true});f.registered.get(f.privateFee.toString())[field]=new Fr(999);
 await assert.rejects(f.pxe.syncForOrdinaryPost({owner:f.owner,board:f.board,privateFee:f.privateFee},()=>0),/Invalid ordinary sync preimage/);assert.equal(f.calls.length,0);
});
test('ordinary public reads drain failed policy and preserve the actual native queue',async()=>{
 const f=await fixture({ordinary:true});f.gate.nullifier=Promise.withResolvers();let ended=false,following=false;
 const work=f.pxe.syncForOrdinaryPost({owner:f.owner,board:f.board,privateFee:f.privateFee},()=>{throw Error('policy failed');});
 const failed=assert.rejects(work,/policy failed/).finally(()=>ended=true);await new Promise(r=>setTimeout(r,10));const next=f.pxe.operationQueue.run(()=>{following=true;});
 await new Promise(r=>setTimeout(r,10));assert.equal(ended,false);assert.equal(following,false);f.gate.nullifier.resolve();await failed;await next;assert.equal(following,true);assert.equal(f.notes,0);
});

for(const exists of [true,false])test('native compiled owned-name records reuse public warmup without replacing ownership discovery, initialized='+exists,async()=>{
 const f=await fixture({exists});await f.pxe.syncForAccountStatus(f.board);
 assert.equal((await f.classRead()).toString(),profile.boardClassId);
 if(exists){
  await f.utility('owned_name_records');assert.equal(f.notes,1,'native owned-name note discovery still executes');
  assert.equal(f.calls.filter(x=>x==='class').length,1);assert.equal(f.calls.filter(x=>x==='nullifier').length,1);
  f.advance();await f.classRead();await f.utility('owned_name_records');
  assert.equal(f.notes,2);assert.equal(f.calls.filter(x=>x==='class').length,2);assert.equal(f.calls.filter(x=>x==='nullifier').length,2,'changed anchor cannot inherit initialized status');
 }else{await assert.rejects(f.utility('owned_name_records'),/Assertion failed/);assert.equal(f.notes,0,'absent initialization cannot reach private ownership');}
});

test('opening public FPC class uses exact native anchor cache without private discovery',async()=>{
 const f=await fixture({ordinary:true});await f.pxe.syncForAccountStatus(f.board,f.privateFee);
 assert.deepEqual(f.calls,['class','fee-class','nullifier','sync-finished']);assert.equal(f.notes,0);
 assert.equal((await f.feeClassRead()).toString(),profile.privateFeeClassId);assert.equal((await f.classRead()).toString(),profile.boardClassId);
 await f.utility();assert.equal(f.notes,1,'only the later compiled Board utility reads private notes');
 assert.equal(f.calls.length,4,'both native class consumers and initialization use captured typed anchor');
 f.advance();await f.feeClassRead();assert.equal(f.calls.filter(x=>x==='fee-class').length,2,'another anchor gets fresh FPC class');
});
for(const field of ['originalContractClassId','salt'])test('opening public FPC rejects altered local '+field+' before node reads',async()=>{
 const f=await fixture({ordinary:true});f.registered.get(f.privateFee.toString())[field]=new Fr(999);
 await assert.rejects(f.pxe.syncForAccountStatus(f.board,f.privateFee),/Invalid account status FPC/);assert.equal(f.calls.length,0);
});
for(const failure of ['fee','nullifier'])test('opening public FPC wave drains '+failure+' failure before releasing native queue',async()=>{
 const f=await fixture({ordinary:true}),other=failure==='fee'?'nullifier':'fee';f.hooks[failure]=true;f.gate[other]=Promise.withResolvers();let settled=false,following=false;
 const work=f.pxe.syncForAccountStatus(f.board,f.privateFee),rejected=assert.rejects(work,new RegExp(failure+' failed')).finally(()=>settled=true);
 await new Promise(setImmediate);const next=f.pxe.operationQueue.run(()=>{following=true;});await new Promise(setImmediate);
 assert.equal(settled,false);assert.equal(following,false);assert.equal(f.notes,0);
 f.gate[other].resolve();await rejected;await next;assert.equal(following,true);
});
test('opening public FPC prefetch preserves upgraded current class for native authorization',async()=>{
 const f=await fixture({ordinary:true});f.registered.get(f.privateFee.toString()).currentContractClassId=new Fr(999);
 await f.pxe.syncForAccountStatus(f.board,f.privateFee);
 assert.equal((await f.feeClassRead()).toString(),new Fr(999).toString());assert.notEqual((await f.feeClassRead()).toString(),profile.privateFeeClassId);
 assert.equal(f.calls.filter(x=>x==='fee-class').length,1);assert.equal(f.notes,0);
});
