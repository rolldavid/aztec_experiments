// Single disposable worker: never log witnesses or SDK exceptions.
import {loadRollingArtifacts} from './rolling-artifacts.mjs';
import {rollingSelectors,validateRollingJob} from './application-policy.mjs';
import {pluginSelectors,validatePluginPayload} from './plugin-policy.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {abiDecode} from '@aztec-foundation/noir-noirc_abi';
import {Barretenberg,AztecClientBackend} from '@aztec-foundation/bb.js';
import {workerNativeProfile,initializeWorkerNative,assertWorkerNativeProfile} from './worker-native-profile.mjs';
import {loadCircuitCatalog} from './catalog.mjs';
import {decodeJob} from '../shared/remote-prover-wire.mjs';
import {decodeWitnessDictionary} from '../shared/remote-witness-dictionary.mjs';
import {nativeWitnessBytes,assertNativeWitnessFormat} from './native-witness-bytes.mjs';
// Native BB unrefs its process/socket between requests. Keep the job owner
// alive until its result has been sent and the backend has been destroyed.
process.channel?.ref();
const send=value=>new Promise((resolve,reject)=>process.send(value,error=>error?reject(error):resolve()));
let stage="read",stageStarted=performance.now(),jobStarted,recording=false;
const timings={};
const finishStage=()=>{if(recording){const now=performance.now();timings[stage]=(timings[stage]??0)+now-stageStarted;stageStarted=now;}};
const setStage=value=>{finishStage();stage=value;stageStarted=performance.now();process.send?.({progress:stage});};
const beginJob=()=>{recording=true;jobStarted=stageStarted=performance.now();stage='read';};
const resultTimings=()=>{finishStage();return {...timings,totalMs:performance.now()-jobStarted};};
try{
 const standby=process.argv[2]==='--standby';
 if(!standby)beginJob();
 let job=standby?undefined:decodeJob(await fs.readFile(process.argv[2]));
 if(job&&job.metadata.mode!==process.env.PROVER_PROOFS)throw Error('Mode mismatch');
 setStage('native-init');
 const nativeProfile=workerNativeProfile();
 await initializeWorkerNative(nativeProfile);
 setStage("catalog");
 const applicationProfile=process.env.PROVER_APPLICATION_PROFILE??'legacy';
 const catalog=await loadCircuitCatalog({applicationProfile});
 if(standby){
  // Only invariant public artifacts/native runtime are initialized while idle.
  // The parent assigns exactly one queue-owned file after this readiness event.
  const assigned=new Promise((resolve,reject)=>process.once('message',value=>{
   if(!value||Object.keys(value).join()!=='file'||typeof value.file!=='string'||value.file.length>4096||!path.isAbsolute(value.file))reject(Error('Invalid job assignment'));
   else resolve(value.file);
  }));
  await send({ready:true});
  const file=await assigned;beginJob();job=decodeJob(await fs.readFile(file));
 }
 const {metadata,payload}=job;
 if(metadata.mode!==process.env.PROVER_PROOFS)throw Error('Mode mismatch');
 const circuits=metadata.circuits.map(id=>{const c=catalog.get(id);if(!c)throw Error('Unknown circuit');return c;});
 setStage("decompress");
 const unpacked=gunzipSync(payload,{maxOutputLength:metadata.uncompressedBytes});
 if(unpacked.length!==metadata.uncompressedBytes)throw Error('Witness limit');
 const witnesses=decodeWitnessDictionary(unpacked,metadata.counts);
 assertNativeWitnessFormat();
 const raw=nativeWitnessBytes(witnesses);
 setStage("board-binding");
 if(applicationProfile==='rolling'){
  const options={metadata,privateBokAddress:process.env.PROVER_PRIVATE_BOK,privateFeeAddress:process.env.PROVER_PRIVATE_FEE};
  const decoded=circuits.map((c,i)=>/^(RollingBoard|PrivateBok|PrivateFPC|SchnorrInitializerlessAccount):/.test(c.functionName)?abiDecode(c.abi,witnesses[i]).inputs:undefined);
  const selectors=await rollingSelectors(loadRollingArtifacts());
  validateRollingJob(circuits,decoded,{...options,selectors});
 }else{
 let boardCalls=0,feeClaims=0;
 for(let i=0;i<circuits.length;i++)if(circuits[i].functionName.startsWith('Billboard:')){
  const inputs=abiDecode(circuits[i].abi,witnesses[i]).inputs;
  if(BigInt(inputs.inputs.call_context.contract_address.inner)!==BigInt(metadata.board))throw Error('Wrong board');
  if(BigInt(inputs.inputs.tx_context.chain_id)!==BigInt(metadata.chainId)||BigInt(inputs.inputs.tx_context.version)!==BigInt(metadata.rollupVersion))throw Error('Wrong network');boardCalls++;
 }
 if(process.env.PROVER_PRIVATE_FEE)for(let i=0;i<circuits.length;i++)if(circuits[i].functionName.startsWith('PrivateFPC:')){
  const inputs=abiDecode(circuits[i].abi,witnesses[i]).inputs;
  if(BigInt(inputs.inputs.call_context.contract_address.inner)!==BigInt(process.env.PROVER_PRIVATE_FEE))throw Error('Wrong fee contract');
  if(BigInt(inputs.inputs.tx_context.chain_id)!==BigInt(metadata.chainId)||BigInt(inputs.inputs.tx_context.version)!==BigInt(metadata.rollupVersion))throw Error('Wrong fee network');
  if(circuits[i].functionName==='PrivateFPC:mint_and_pay_fee')feeClaims++;
 }
 const pluginAddresses=JSON.parse(process.env.PROVER_PLUGINS||'[]');
 for(let i=0;i<circuits.length;i++)if(circuits[i].functionName.startsWith('PluginAdapter:')){
  const input=abiDecode(circuits[i].abi,witnesses[i]).inputs.inputs;
  if(circuits[i].functionName!=='PluginAdapter:claim'||!pluginAddresses.some(address=>BigInt(address)===BigInt(input.call_context.contract_address.inner))||BigInt(input.tx_context.chain_id)!==BigInt(metadata.chainId)||BigInt(input.tx_context.version)!==BigInt(metadata.rollupVersion))throw Error('Unapproved plugin circuit');
 }
 if(!boardCalls){
  const selectors=await pluginSelectors();let authorized=0;
  for(let i=0;i<circuits.length;i++)if(circuits[i].functionName==='SchnorrInitializerlessAccount:entrypoint')authorized+=validatePluginPayload(abiDecode(circuits[i].abi,witnesses[i]).inputs,{metadata,pluginAddresses,privateFeeAddress:process.env.PROVER_PRIVATE_FEE,selectors,allowFeeOnly:feeClaims>0});
  if(!authorized&&!feeClaims)throw Error('Board operation or authorized plugin/fee claim required');
 }
 }
 setStage('prove');
 if(metadata.mode==='disabled'){
  if(process.env.PROVER_PROOFS!=='disabled')throw Error('Mode mismatch');
  await send({mode:'disabled',timings:resultTimings()});
 }else{
  if(process.env.PROVER_PROOFS!=='real')throw Error('Mode mismatch');
  const api=assertWorkerNativeProfile(nativeProfile);
  // The SDK pipelines these calls without awaiting their promises. Observe
  // rejected calls so one invalid job cannot crash before the final error handler.
  let firstFailure;
  for(const name of ['chonkStart','chonkLoad','chonkAccumulate']){const call=api[name].bind(api);api[name]=(...args)=>{const result=call(...args);result.catch(error=>{firstFailure??=error;});return result;};}
  const backend=new AztecClientBackend(circuits.map(c=>gunzipSync(c.bytecode)),api,circuits.map(c=>c.functionName),circuits.map(c=>c.kind));
  setStage("native-prove");
  let result;try{result=await backend.prove(raw,circuits.map(c=>c.vk),{compress:true});}catch(error){throw firstFailure??error;}
  setStage('result-encode');
  const compressedProof=Buffer.from(result.compressedProof).toString('base64');
  await send({mode:'real',compressedProof,timings:resultTimings()});
  await Barretenberg.destroySingleton();
 }
}catch(error){
 finishStage();
 const message=String(error?.message??'');
 if(stage==='native-prove'){if(/srs|crs|grumpkin g1/i.test(message))stage='native-srs';else if(/assertion|constraint/i.test(message))stage='native-constraint';else if(/verification|verify/i.test(message))stage='native-verification';else if(/socket|process exited|signal/i.test(message))stage='native-process';}
 await send({errorStage:stage,...(recording?{timings:resultTimings()}:{})});process.exitCode=1;}finally{await Barretenberg.destroySingleton();process.disconnect?.();}
