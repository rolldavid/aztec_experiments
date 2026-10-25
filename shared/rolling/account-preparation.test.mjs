import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRollingAccount,consumeRollingAccountPreparation} from './account-preparation.mjs';
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function fixture(){
 const calls={derive:0,instance:0};class Fr{constructor(value){this.value=value;}static fromHexString(value){return new Fr(BigInt(value));}}
 const keys={publicKeys:{}},artifact={},instance={address:{toString:()=>hex(9)}};
 const sdk={Fr,deriveSigningKey:s=>s,deriveKeys:async()=>{calls.derive++;return keys;},SchnorrInitializerlessAccountContract:class{async getContractArtifact(){return artifact;}async getImmutablesHash(){return 0;}},async getContractInstanceFromInstantiationParams(a,opts){assert.equal(a,artifact);assert.equal(opts.publicKeys,keys.publicKeys);assert.equal(opts.salt.value,2n);calls.instance++;return instance;},computePartialAddress:async()=>({toString:()=>hex(10)})};
 return {sdk,calls,keys,artifact,instance,account:{secretKey:hex(1),salt:hex(2),address:hex(9)}};
}
test('same SDK/account handoff reuses original native inputs, opaque handle exposes no keys',async()=>{const f=fixture();const result=await prepareRollingAccount({...f.account,sdk:f.sdk});const p=consumeRollingAccountPreparation(result.preparation,f);assert.equal(p.keys,f.keys);assert.equal(p.artifact,f.artifact);assert.equal(p.instance,f.instance);assert.deepEqual(Object.keys(result.preparation),[]);assert.deepEqual(result.identity,{address:hex(9),partialAddress:hex(10)});assert.deepEqual(f.calls,{derive:1,instance:1});});
for(const changed of ['sdk','secretKey','salt','address'])test('reject different '+changed,async()=>{const f=fixture(),r=await prepareRollingAccount({...f.account,sdk:f.sdk});const options={sdk:f.sdk,account:{...f.account}};if(changed==='sdk')options.sdk={...f.sdk};else options.account[changed]=hex(3);assert.throws(()=>consumeRollingAccountPreparation(r.preparation,options),{code:'BB_ACCOUNT_RECORD_INVALID'});});
test('reject cloned or forged preparation',async()=>{const f=fixture(),r=await prepareRollingAccount({...f.account,sdk:f.sdk});for(const handle of [{},structuredClone(r.preparation),null])assert.throws(()=>consumeRollingAccountPreparation(handle,f),{code:'BB_ACCOUNT_RECORD_INVALID'});});
test('reject invalid scalar before native derivation',async()=>{for(const secretKey of [hex(0),'0x1',hex(21888242871839275222246405745257275088548364400416034343698204186575808495617n)]){const f=fixture();await assert.rejects(prepareRollingAccount({...f.account,secretKey,sdk:f.sdk}),{code:'BB_ACCOUNT_RECORD_INVALID'});assert.equal(f.calls.derive,0);}});
