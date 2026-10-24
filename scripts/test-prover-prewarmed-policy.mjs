import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const catalog=new URL('../prover/catalog.mjs',import.meta.url).href;
const worker=new URL('../prover/worker.mjs',import.meta.url).href;
function run(script){
 const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:10000,maxBuffer:65536});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);
}
const setup=`import {registerHooks} from 'node:module';import assert from 'node:assert/strict';
const raw=[{name:'RollingBoard',functions:[{name:'post',bytecode:Uint8Array.of(1),verificationKey:'AA==',abi:{tag:'board'}}]},{name:'PrivateBok',functions:[{name:'claim',bytecode:Uint8Array.of(2),verificationKey:'AA==',abi:{tag:'bok'}}]}];
globalThis.audit={loads:0,policies:0,raw,fail:false};
const stubs={
 '@aztec-foundation/bb.js':'export const CircuitKind={App:0,HidingKernel:1,Kernel:2};',
 'node:fs/promises':'export default {readFile:async()=>JSON.stringify({name:"Fixture",functions:[]})};',
 '@aztec-labs/noir-protocol-circuits-types/client/bundle':'export const ClientCircuitArtifacts={};export class BundleArtifactProvider{}',
 '@aztec-labs/protocol-contracts/providers/bundle':'export const ProtocolContractArtifact={};',
 '@aztec-labs/accounts/schnorr':'export const SchnorrInitializerlessAccountContractArtifact={name:"Account",functions:[]};',
 '@aztec-labs/standard-contracts':'const a={name:"Fixture",functions:[]};export const AuthRegistryArtifact=a,HandshakeRegistryArtifact=a,MultiCallEntrypointArtifact=a,PublicChecksArtifact=a;',
 '@aztec-labs/stdlib/abi':'export const loadContractArtifact=a=>a;',
 './rolling-artifacts.mjs':'export function loadRollingArtifacts(){audit.loads++;if(audit.fail)throw Error("provenance mismatch");return audit.raw;}',
 './application-policy.mjs':'export async function rollingSelectors(raw){audit.policies++;if(raw!==audit.raw)throw Error("different artifacts");return {sameArtifacts:raw};}',
 '../shared/remote-prover-wire.mjs':'export async function circuitId(bytes){return String(bytes[0]);}'
};
registerHooks({resolve(s,c,next){if(c.parentURL===${JSON.stringify(catalog)}&&Object.hasOwn(stubs,s))return {url:'fixture:/modules/'+encodeURIComponent(s),shortCircuit:true};return next(s,c);},load(url,c,next){if(url.startsWith('fixture:/modules/'))return {format:'module',source:stubs[decodeURIComponent(url.slice('fixture:/modules/'.length))],shortCircuit:true};return next(url,c);}});
const {loadCircuitCatalog,loadWorkerCatalog}=await import(${JSON.stringify(catalog)});
`;
test('worker catalogue authenticates artifacts once and derives selectors from those exact objects',()=>run(setup+`
const {catalog,selectors}=await loadWorkerCatalog({applicationProfile:'rolling'});
assert(catalog instanceof Map);assert.equal(catalog.size,2);assert.equal(selectors.sameArtifacts,raw);assert.equal(audit.loads,1);assert.equal(audit.policies,1);
assert.equal(catalog.get('1').abi.tag,'board');assert.equal(catalog.get('2').abi.tag,'bok');
`));
test('catalogue-only callers retain Map API and do not compute worker policy',()=>run(setup+`
assert(await loadCircuitCatalog({applicationProfile:'rolling'}) instanceof Map);assert.equal(audit.loads,1);assert.equal(audit.policies,0);
const legacy=await loadWorkerCatalog();assert(legacy.catalog instanceof Map);assert.equal(legacy.selectors,undefined);assert.equal(audit.loads,1);assert.equal(audit.policies,0);
`));
test('bad provenance or unknown profile cannot produce prepared worker policy',()=>run(setup+`
await assert.rejects(loadWorkerCatalog({applicationProfile:'unknown'}),/Invalid application/);assert.equal(audit.loads,0);
audit.fail=true;await assert.rejects(loadWorkerCatalog({applicationProfile:'rolling'}),/provenance mismatch/);assert.equal(audit.loads,1);assert.equal(audit.policies,0);
`));
for(const scenario of ['success','bad-policy','bad-job'])test(`actual worker orders policy before readiness and retains per-job binding: ${scenario}`,()=>run(`
import {registerHooks} from 'node:module';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';
const scenario=${JSON.stringify(scenario)},events=[],policy={private:new Set([1])};
globalThis.fixture={events,policy,scenario,job:{metadata:{mode:'disabled',circuits:['id'],counts:[],uncompressedBytes:1},payload:gzipSync(Buffer.of(1))}};
const stubs={
 'node:fs/promises':'export default {readFile:async file=>{fixture.events.push("read-job");return file;}};',
 '@aztec-foundation/noir-noirc_abi':'export const abiDecode=()=>({inputs:{exactJob:true}});',
 '@aztec-foundation/bb.js':'export const Barretenberg={destroySingleton:async()=>{}},AztecClientBackend=class{};',
 './worker-native-profile.mjs':'export const workerNativeProfile=()=>({}),initializeWorkerNative=async()=>{},assertWorkerNativeProfile=()=>({});',
 './catalog.mjs':'export async function loadWorkerCatalog(){fixture.events.push("policy");await Promise.resolve();if(fixture.scenario==="bad-policy")throw Error("bad policy");return {catalog:new Map([["id",{functionName:"RollingBoard:post"}]]),selectors:fixture.policy};}',
 './application-policy.mjs':'export function validateRollingJob(circuits,decoded,options){fixture.events.push("binding");if(options.selectors!==fixture.policy||decoded[0].exactJob!==true)throw Error("wrong prepared policy");if(fixture.scenario==="bad-job")throw Error("Wrong network");}',
 './plugin-policy.mjs':'export const pluginSelectors=()=>{throw Error("unexpected legacy policy");},validatePluginPayload=()=>{};',
 '../shared/remote-prover-wire.mjs':'export const decodeJob=()=>fixture.job;',
 '../shared/remote-witness-dictionary.mjs':'export const decodeWitnessDictionary=()=>[new Map()];',
 './native-witness-bytes.mjs':'export const nativeWitnessBytes=()=>[],assertNativeWitnessFormat=()=>{};'
};
registerHooks({resolve(s,c,next){if(c.parentURL===${JSON.stringify(worker)}&&Object.hasOwn(stubs,s))return {url:'fixture:/modules/'+encodeURIComponent(s),shortCircuit:true};return next(s,c);},load(url,c,next){if(url.startsWith('fixture:/modules/'))return {format:'module',source:stubs[decodeURIComponent(url.slice('fixture:/modules/'.length))],shortCircuit:true};return next(url,c);}});
const original=globalThis.process;let assign;const messages=[];
globalThis.process={argv:['node','worker','--standby'],env:{PROVER_PROOFS:'disabled',PROVER_APPLICATION_PROFILE:'rolling'},channel:{ref(){}},once(name,callback){assign=callback;},send(message,callback){messages.push(message);if(message.ready){events.push('ready');queueMicrotask(()=>assign({file:'/private-job'}));}callback?.();},disconnect(){}};
try{await import(${JSON.stringify(worker)});}finally{globalThis.process=original;}
assert.equal(events.filter(x=>x==='policy').length,1);
if(scenario==='bad-policy'){assert.deepEqual(events,['policy']);assert(messages.some(x=>x.errorStage==='catalog'));}
else {assert.deepEqual(events,['policy','ready','read-job','binding']);assert(messages.some(x=>scenario==='success'?x.mode==='disabled':x.errorStage==='board-binding'));}
`));
