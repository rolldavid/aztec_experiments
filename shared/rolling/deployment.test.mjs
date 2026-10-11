// Labelled RPC doubles: real processed artifacts/class/instance hashes, SDK
// commitment hash and complete compiler portal runtime. No chain or wallet call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact,getContractInstanceFromInstantiationParams,computeContractAddressFromInstance} from '@aztec-labs/stdlib/contract';
import {sha256ToField} from '@aztec-labs/foundation/crypto/sha256';
import {derivePrivateFeeInstance,normalizePrivateFeeGasSettings} from '../private-fee-client.mjs';
import {expectedPortalRuntime,verifyPortalRuntime} from '../portal-runtime.mjs';
import {encodeConfigCommitment} from '../protocol-commitments.mjs';
import {verifyRollingDeployment} from './deployment.mjs';
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const feeArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../../apps/src/billboard/private_fee_artifact.json',import.meta.url))));
const metadata=JSON.parse(fs.readFileSync(new URL('../portal-runtime.json',import.meta.url)));
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),eth=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
async function fixture(){
 const deployer=AztecAddress.fromBigIntUnsafe(3n),rollup=eth(11),portal=eth(22);
 const board=await getContractInstanceFromInstantiationParams(artifact,{salt:new Fr(7),deployer,constructorArtifact:'init',constructorArgs:[Array(32).fill(0n),0,31337,rollup,1,100,200,60,2,120,3]});
 const fee=await derivePrivateFeeInstance(feeArtifact),state={destroyed:0,guards:0,reads:[],ethReads:[],inspection:0};
 const config={network:{chainId:'31337',rollupVersion:'1',rollupAddress:rollup,nodeUrl:'http://127.0.0.1:1',ethRpcUrl:'http://127.0.0.1:2'},
  board:{contractAddress:String(board.address),portalAddress:portal},privateFee:{contractAddress:String(fee.address),gasSettings:{gasLimits:{daGas:'1000',l2Gas:'1000'},teardownGasLimits:{daGas:'1',l2Gas:'1'},maxFeesPerGas:{feePerDaGas:'1',feePerL2Gas:'1'},maxPriorityFeesPerGas:{feePerDaGas:'0',feePerL2Gas:'0'}}}};
 const economics={minDeposit:'100',maxDeposit:'200',baseCooldown:'60',kMultiplier:'2',censorWindow:'120',maxSaveUp:'3'};
 const configHash=sha256ToField(Buffer.from(encodeConfigCommitment({l1ChainId:'31337',rollupVersion:'1',rollupAddress:rollup,boardAddress:String(board.address)},economics)));
 const immutables={MIN_DEPOSIT:100n,MAX_DEPOSIT:200n,L2_CONTRACT:BigInt(String(board.address)),ROLLUP:11n,INBOX:33n,OUTBOX:44n,VERSION:1n,L1_CHAIN_ID:31337n,CONFIG_HASH:configHash.toBigInt()};
 const storage=new Map([[1n,22n],...[31337n,11n,1n,100n,200n,60n,2n,120n,3n,3n].map((value,i)=>[3n+BigInt(i),value])]);
 const node={getBlockData:async n=>({blockHash:Fr.fromString(hex(55)),header:{globalVariables:{blockNumber:10}}}),
  getContract:async(address,reference)=>{state.reads.push(['instance',reference]);return address.equals(board.address)?board:fee;},
  getPublicStorageAt:async(reference,address,slot)=>{state.reads.push(['storage',reference]);return new Fr(storage.get(slot.toBigInt()));},
  getL1ContractAddresses:async()=>({rollupAddress:rollup,inboxAddress:eth(33),outboxAddress:eth(44)})};
 const provider={getNetwork:async()=>({chainId:31337n}),getBlock:async n=>({number:20,hash:hex(66)}),getCode:async(address,n)=>{state.ethReads.push(n);return expectedPortalRuntime(metadata,immutables);},destroy:()=>{state.destroyed++;}};
 const ethers={JsonRpcProvider:class{constructor(){return provider;}},Contract:class{constructor(){return Object.fromEntries(Object.keys(immutables).map(name=>[name,async opts=>{state.ethReads.push(opts.blockTag);return immutables[name];}]));}}};
 const sdk={Fr,AztecAddress,getContractClassFromArtifact,computeContractAddressFromInstance,derivePrivateFeeInstance,normalizePrivateFeeGasSettings,sha256ToField,verifyPortalRuntime,portalRuntimeMetadata:metadata,
  isTrustedPrivateNode:n=>n===node,inspectTrustedNode:async(n,opts)=>{state.inspection++;assert.deepEqual(opts.expectedNetworkScope,{chainId:'31337',version:'1',rollup});assert.equal(opts.proofsEnabled,true);}};
 const options={sdk,node,ethers,config,boardArtifact:artifact,privateFeeArtifact:feeArtifact,contextGuard:async()=>{state.guards++;}};
 return {options,state,node,provider,board,fee,storage,immutables,configHash,economics};
}
test('actual artifact layout/hash/runtime yields detached application deployment and canonical instances',async()=>{
 const f=await fixture(),out=await verifyRollingDeployment(f.options);
 assert.deepEqual(out.economics,f.economics);assert.equal(out.configHash,String(f.configHash));assert.equal(String(out.board.instance.address),String(f.board.address));
 assert.equal(String(await computeContractAddressFromInstance(out.board.instance)),String(f.board.address));
 assert.equal(String(await computeContractAddressFromInstance(out.privateFee.instance)),String(f.fee.address));
 assert.ok(Object.isFrozen(out)&&Object.isFrozen(out.privateFee.gasSettings));assert.notEqual(out.board.artifact,artifact);
 const original=artifact.functions[0].bytecode[0];out.board.artifact.functions[0].bytecode[0]^=255;assert.equal(artifact.functions[0].bytecode[0],original);
 assert.equal(f.state.destroyed,1);assert.equal(f.state.guards,2);assert.equal(f.state.inspection,2);
 assert.ok(f.state.reads.every(([,ref])=>ref.hash===hex(55)));assert.ok(f.state.ethReads.every(number=>number===20));
});
test('changed board class/address/storage/portal/config hash and FPC publication fail closed',async()=>{
 const mutations=[f=>{f.board.currentContractClassId=new Fr(99);},f=>{f.board.originalContractClassId=new Fr(99);},f=>{f.board.salt=new Fr(99);},
  f=>f.storage.set(1n,23n),f=>f.storage.set(3n,1n),f=>f.storage.set(4n,12n),f=>f.storage.set(5n,2n),f=>f.storage.set(12n,4n),
  f=>{f.immutables.CONFIG_HASH++;},f=>{f.immutables.MIN_DEPOSIT++;},f=>{f.fee.currentContractClassId=new Fr(99);},f=>{f.fee.salt=new Fr(99);},
  f=>{f.node.getContract=async(address)=>address.equals(f.board.address)?f.board:undefined;}];
 for(const mutate of mutations){const f=await fixture();mutate(f);await assert.rejects(verifyRollingDeployment(f.options),{code:'ROLLING_DEPLOYMENT_INVALID'});assert.ok(f.state.destroyed<=1);}
});
test('wrong runtime, Ethereum identity and reorg anchors are rejected with provider disposed',async()=>{
 for(const mutate of [f=>{f.provider.getCode=async()=>expectedPortalRuntime(metadata,f.immutables)+'00';},
  f=>{f.provider.getNetwork=async()=>({chainId:1n});},f=>{f.provider.getBlock=async n=>({number:20,hash:n==='latest'?hex(66):hex(67)});},
  f=>{f.node.getBlockData=async n=>({blockHash:Fr.fromString(n==='checkpointed'?hex(55):hex(56)),header:{globalVariables:{blockNumber:10}}});}]){
  const f=await fixture();mutate(f);await assert.rejects(verifyRollingDeployment(f.options),{code:'ROLLING_DEPLOYMENT_INVALID'});assert.equal(f.state.destroyed,1);
 }
});
test('untrusted/stale node, missing guard and secret-bearing URL fail without funding or ordinary node fallback',async()=>{
 for(const mutate of [f=>{f.options.sdk.isTrustedPrivateNode=()=>false;},f=>{f.options.sdk.inspectTrustedNode=async()=>{throw Error('PRIVATE_SENTINEL');};},
  f=>{f.options.contextGuard=undefined;},f=>{f.options.config.network.ethRpcUrl='https://secret@example.com';},f=>{f.options.boardArtifact={...artifact,storageLayout:{...artifact.storageLayout,config:{slot:new Fr(4)}}};}]){
  const f=await fixture();mutate(f);await assert.rejects(verifyRollingDeployment(f.options),error=>error.code==='ROLLING_DEPLOYMENT_INVALID'&&!error.message.includes('PRIVATE_SENTINEL'));assert.equal(f.state.destroyed,0);
 }
});
test('context changed after canonical reads rejects; whole operation has a fixed20s deadline',async t=>{
 const f=await fixture();f.options.contextGuard=async()=>{if(++f.state.guards===2)throw Error('account replaced');};
 await assert.rejects(verifyRollingDeployment(f.options),{code:'ROLLING_DEPLOYMENT_INVALID'});assert.equal(f.state.destroyed,1);
 const stalled=await fixture();stalled.options.contextGuard=()=>new Promise(()=>{});
 t.mock.timers.enable({apis:['Date','setTimeout']});const pending=verifyRollingDeployment(stalled.options);
 const rejected=assert.rejects(pending,{code:'ROLLING_DEPLOYMENT_INVALID'});t.mock.timers.tick(20000);await rejected;
});
