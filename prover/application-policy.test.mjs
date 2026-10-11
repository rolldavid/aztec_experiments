// Policy unit tests only: fabricated decoded fields are not valid proofs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bindRollingCircuit, validateRollingPayload} from './application-policy.mjs';
import {ARTIFACTS, COMMON_INPUTS, loadRollingArtifacts, sha} from './rolling-artifacts.mjs';
import {pluginSelectors} from './plugin-policy.mjs';
import {FunctionSelector, loadContractArtifact} from '@aztec-labs/stdlib/abi';

const metadata = {board: '1', chainId: '31337', rollupVersion: '1'};
const selectors = {RollingBoard: {private: new Set([11n]), public: new Set([12n])},
  PrivateBok: {private: new Set([21n]), public: new Set([22n])},
  fee: {fee: new Set([31n]), feeClaim: 32n, paddingHash: 99n}};
const options = {metadata, privateBokAddress: '2', privateFeeAddress: '3', selectors};
const context = (address='2', sender='4') => ({tx_context: {chain_id:'31337',version:'1'},call_context:{contract_address:{inner:address},msg_sender:{inner:sender}}});
const call = (target, id, isPublic=false) => ({target_address:{inner:String(target)},function_selector:{inner:String(id)},args_hash:'0',is_public:isPublic,hide_msg_sender:false,is_static:false});
const payload = () => ({inputs:context('4'),app_payload:{function_calls:[call(1,11),call(2,21),call(3,31)]}});

test('rolling mixed payload permits only its exact board/Bok/private fee calls', () => {
  assert.deepEqual(validateRollingPayload(payload(), options), {applications:2,fees:1});
  const publicOnly = payload(); publicOnly.app_payload.function_calls=[call(2,22,true),call(3,31)];
  assert.deepEqual(validateRollingPayload(publicOnly, options), {applications:1,fees:1});
  for (const extra of [call(77,11),call(1,999),call(2,999),call(2,21,true),call(2,22,false),{...call(2,22,true),hide_msg_sender:true},{...call(2,22,true),is_static:true}]) {
    const input=payload();input.app_payload.function_calls.push(extra);
    assert.throws(()=>validateRollingPayload(input, options), /Unapproved|Invalid/);
  }
});
test('all padding and fee/network conditions fail closed', () => {
  const input=payload(), padding={...call(0,0,true),args_hash:'99'};
  input.app_payload.function_calls.push(padding);validateRollingPayload(input,options);
  padding.args_hash='0';assert.throws(()=>validateRollingPayload(input,options),/Unapproved/);
  for(const modify of [p=>p.app_payload.function_calls.pop(),p=>p.inputs.tx_context.chain_id='1',p=>p.inputs.tx_context.version='2']) {
    const p=payload();modify(p);assert.throws(()=>validateRollingPayload(p,options),/Private fee|network/);
  }
  const feeOnly=payload();feeOnly.app_payload.function_calls=[call(3,31)];
  assert.throws(()=>validateRollingPayload(feeOnly,options),/operation required/);
  assert.deepEqual(validateRollingPayload(feeOnly,{...options,allowFeeClaim:true}),{applications:0,fees:1});
});
test('every private application circuit is address/network/function bound, including continuations', () => {
  for(const [fn,address] of [['RollingBoard:post','1'],['RollingBoard:set_like','1'],['PrivateBok:claim','2'],['PrivateFPC:pay_fee','3']]) {
    bindRollingCircuit(fn,{inputs:context(address)},options);
    assert.throws(()=>bindRollingCircuit(fn,{inputs:context('99')},options),/contract/);
    const input={inputs:context(address)};input.inputs.tx_context.version='2';assert.throws(()=>bindRollingCircuit(fn,input,options),/network/);
  }
  bindRollingCircuit('PrivateBok:subtract_more',{inputs:context('2','2')},options);
  assert.throws(()=>bindRollingCircuit('PrivateBok:subtract_more',{inputs:context('2','4')},options),/self-called/);
  for(const fn of ['PrivateBok:_open_escrow','RollingBoard:update_portal','PrivateFPC:mint'])assert.throws(()=>bindRollingCircuit(fn,{inputs:context(fn.startsWith('Rolling')?'1':fn.startsWith('PrivateFPC')?'3':'2')},options),/Unapproved/);
  for(const fn of ['Billboard:post','PluginAdapter:claim','MultiCallEntrypoint:entrypoint'])assert.throws(()=>bindRollingCircuit(fn,undefined,options),/Foreign/);
  bindRollingCircuit('PrivateKernelInitArtifact',undefined,options);
});

test('fragmented private fee balance permits only bound self-recursion, never a direct payload call', async () => {
  const fn='PrivateFPC:recurse_subtract_balance_internal';
  bindRollingCircuit(fn,{inputs:context('3','3')},options);
  assert.throws(()=>bindRollingCircuit(fn,{inputs:context('99','3')},options),/contract/);
  assert.throws(()=>bindRollingCircuit(fn,{inputs:context('3','4')},options),/self-called/);
  for(const field of ['chain_id','version']) {
    const input={inputs:context('3','3')};input.inputs.tx_context[field]='999';
    assert.throws(()=>bindRollingCircuit(fn,input,options),/network/);
  }
  assert.throws(()=>bindRollingCircuit(fn,{inputs:context('3','3')},{...options,privateFeeAddress:undefined}),/contract/);
  const raw=JSON.parse(fs.readFileSync(new URL('../apps/src/billboard/private_fee_artifact.json',import.meta.url)));
  const artifact=loadContractArtifact(raw), continuation=artifact.functions.find(f=>f.name==='recurse_subtract_balance_internal');
  assert(continuation?.verificationKey,'Installed normal fee continuation must have a VK');
  const selector=BigInt((await FunctionSelector.fromNameAndParameters(continuation)).toString());
  const fee=await pluginSelectors();assert(!fee.fee.has(selector));
  const actualOptions={...options,selectors:{...selectors,fee}}, input=payload();
  input.app_payload.function_calls[2].function_selector.inner=String([...fee.fee][0]);
  validateRollingPayload(input,actualOptions);
  for(const isPublic of [false,true]) {
    const direct=structuredClone(input);direct.app_payload.function_calls.push(call(3,selector,isPublic));
    assert.throws(()=>validateRollingPayload(direct,actualOptions),/Unapproved/);
  }
});

function artifactFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rolling-artifact-policy-'));
  const write=(relative,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),bytes);};
  const inputs=Object.fromEntries(COMMON_INPUTS.map(relative=>{write(relative,'fixture');return [relative,sha('fixture')];}));
  const artifacts=Object.entries(ARTIFACTS).map(([name,relative])=>{
    const source=name==='RollingBoard'?'billboard/rolling_contract/src/main.nr':'experiments/private-bok/escrow/src/main.nr';
    write(source,'fixture');inputs[source]=sha('fixture');
    const raw={name,transpiled:true,functions:[{name:'claim',custom_attributes:['abi_private'],verification_key:'AA==',bytecode:'AA==',abi:{}}],file_map:{1:{path:source,source:'fixture'}}};
    const bytes=JSON.stringify(raw);write(relative,bytes);return {name,path:relative,sha256:sha(bytes)};
  });
  const manifest={schemaVersion:1,status:'ready',artifacts,inputs};
  const save=()=>write('prover/rolling-artifacts.json',JSON.stringify(manifest));save();
  return {root,write,manifest,save,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('artifact provenance rejects missing, stale, raw and symlinked release inputs', () => {
  // Deliberately synthetic bytes exercise release checks, never proving APIs.
  const f=artifactFixture();try{
    assert.equal(loadRollingArtifacts(f.root).length,2);
    f.manifest.status='pending';f.save();assert.throws(()=>loadRollingArtifacts(f.root),/pending/);f.manifest.status='ready';f.save();
    const source='billboard/rolling_contract/src/main.nr';f.write(source,'new source');f.manifest.inputs[source]=sha('new source');f.save();
    assert.throws(()=>loadRollingArtifacts(f.root),/local source mismatch/);f.write(source,'fixture');f.manifest.inputs[source]=sha('fixture');f.save();
    f.write('toolchain.json','changed');assert.throws(()=>loadRollingArtifacts(f.root),/provenance/);f.write('toolchain.json','fixture');
    const target=f.manifest.artifacts[0], original=fs.readFileSync(path.join(f.root,target.path));
    f.write(target.path,'changed');assert.throws(()=>loadRollingArtifacts(f.root),/digest/);
    const raw=JSON.parse(original);delete raw.functions[0].verification_key;const bytes=JSON.stringify(raw);f.write(target.path,bytes);target.sha256=sha(bytes);f.save();
    assert.throws(()=>loadRollingArtifacts(f.root),/private VKs/);
    f.write(target.path,original);target.sha256=sha(original);f.save();
    fs.unlinkSync(path.join(f.root,target.path));assert.throws(()=>loadRollingArtifacts(f.root),/ENOENT/);f.write(target.path,original);
    fs.unlinkSync(path.join(f.root,'toolchain.json'));fs.symlinkSync('package-lock.json',path.join(f.root,'toolchain.json'));
    assert.throws(()=>loadRollingArtifacts(f.root),/symlink/);
  }finally{f.close();}
});
