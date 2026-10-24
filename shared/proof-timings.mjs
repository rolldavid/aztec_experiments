// Numeric diagnostics only. The opt-in Rolling performance panel consumes these
// fixed labels; no execution objects, function names or RPC arguments are emitted.
const stages=new Set(['transport.serialize','transport.circuit-ids','transport.dictionary','transport.compress','transport.submit','transport.wait','local.decompress','local.verify']);
function emit(stage,duration,timing=globalThis.performance,end){
 try{
  if(!Number.isFinite(duration)||duration<0)return;
  end??=timing.now();if(!Number.isFinite(end)||duration>end)return;
  const name='rolling.proof.'+stage;
  timing.clearMeasures(name);timing.measure(name,{start:end-duration,end});
 }catch{/* Diagnostics cannot change transaction execution. */}
}
export async function measureProofStage(stage,operation){
 let timing,start;try{if(stages.has(stage)){timing=globalThis.performance;start=timing.now();}}catch{}
 try{return await operation();}finally{try{if(Number.isFinite(start)){const end=timing.now();emit(stage,end-start,timing,end);}}catch{}}
}
export function recordProofTimings(stats){
 try{
  const timings=stats?.timings;
  // These are nested native measurements, not additional disjoint stages:
  // proof-transport includes local verification; native.total includes all of
  // them. Witness totals retain the SDK's own timing semantics. Never subtract
  // these new aggregates from the SDK's existing unaccounted calculation.
  for(const [field,label] of [['total','native.total'],['sync','native.sync'],['privateWitness','native.private-witness'],['kernelWitness','native.kernel-witness'],['validation','native.public-validation'],['proving','native.proof-transport'],['unaccounted','native.unaccounted']]){
   recordProofAggregate(label,timings?.[field]);
  }
 }catch{/* Older SDKs may not provide these optional measurements. */}
}

// Real start/end boundaries. This self-contained helper is also embedded in the
// pinned native transforms so every runtime uses the same numeric-only observer.
export function beginProofSpan(stage, timing){
 let start;try{timing??=globalThis.performance;start=timing?.now?.();}catch{}let finished=false;
 return ()=>{if(finished||!Number.isFinite(start))return;finished=true;try{
  if(!/^(?:native|wallet|receipt)\.phase\.[a-z-]+$/.test(stage))return;
  const end=timing.now();if(!Number.isFinite(end)||end<start)return;
  const name='rolling.proof.'+stage;timing.clearMeasures(name);timing.measure(name,{start,end});
 }catch{/* Diagnostics never change execution or disclose transaction data. */}};
}
export async function measureProofPhase(stage,operation){
 const finish=beginProofSpan(stage);try{return await operation();}finally{finish();}
}

// Observe the actual oracle callbacks without reading their inputs or outputs.
// Circuit and nested oracle spans overlap deliberately: they form a call tree,
// not durations to add together. Fixed categories contain no contract identity.
export function timedCircuitCallbacks(callback){
 const known=new Set(["aztec_misc_assertCompatibleOracleVersion","aztec_misc_getRandomField","aztec_misc_log","aztec_utl_getUtilityContext","aztec_utl_getKeyValidationRequest","aztec_utl_getContractInstance","aztec_utl_getNoteHashMembershipWitness","aztec_utl_getBlockHashMembershipWitness","aztec_utl_areBlockHashesInArchive","aztec_utl_getNullifierMembershipWitness","aztec_utl_getLowNullifierMembershipWitness","aztec_utl_getPublicDataWitness","aztec_utl_getBlockHeader","aztec_utl_getAuthWitness","aztec_utl_getPublicKeysAndPartialAddress","aztec_utl_getNullifierStatuses","aztec_utl_getL1ToL2MembershipWitnessV2","aztec_utl_tryGetL1ToL2MembershipWitness","aztec_utl_getFromPublicStorage","aztec_utl_getNotes","aztec_utl_getSettledNoteOrigin","aztec_utl_getPendingTaggedLogsV2","aztec_utl_validateAndStoreEnqueuedNotesAndEvents","aztec_utl_getLogsByTagV2","aztec_utl_getResolvedTxs","aztec_utl_getTxEffect","aztec_utl_getTxEffects","aztec_utl_setCapsule","aztec_utl_getCapsule","aztec_utl_deleteCapsule","aztec_utl_copyCapsule","aztec_utl_decryptAes128","aztec_utl_getSharedSecrets","aztec_utl_setContractSyncCacheInvalid","aztec_utl_emitOffchainEffect","aztec_utl_recordFact","aztec_utl_deleteFactCollection","aztec_utl_getFactCollection","aztec_utl_getFactCollectionsByType","aztec_utl_callUtilityFunction","aztec_utl_pushEphemeral","aztec_utl_popEphemeral","aztec_utl_getEphemeral","aztec_utl_setEphemeral","aztec_utl_getEphemeralLen","aztec_utl_removeEphemeral","aztec_utl_clearEphemeral","aztec_utl_pushTransient","aztec_utl_popTransient","aztec_utl_getTransient","aztec_utl_setTransient","aztec_utl_getTransientLen","aztec_utl_removeTransient","aztec_utl_clearTransient","aztec_prv_setHashPreimage","aztec_prv_getHashPreimage","aztec_prv_notifyCreatedNote","aztec_prv_notifyNullifiedNote","aztec_prv_notifyCreatedNullifier","aztec_prv_isNullifierPending","aztec_prv_notifyCreatedContractClassLog","aztec_prv_callPrivateFunction","aztec_prv_assertValidPublicCalldata","aztec_prv_notifyRevertiblePhaseStart","aztec_prv_isExecutionInRevertiblePhase","aztec_prv_getAppTaggingSecret","aztec_prv_getNextTaggingIndex","aztec_prv_getSenderForTags","aztec_prv_resolveTaggingStrategy","aztec_prv_resolveCustomRequest","aztec_utl_getPendingOwnerTaggedLogsV1","rolling_owner_seal_v1","rolling_owner_open_v1","rolling_owner_locator_v1"]);
 const functions=new Map();
 return new Proxy(callback,{get(target,name){
  const value=Reflect.get(target,name,target);if(typeof value!=='function')return value;
  if(!functions.has(name))functions.set(name,(...args)=>measureProofPhase('native.phase.oracle-'+(known.has(name)?name.replace(/^(?:aztec_(?:prv|utl)_|rolling_owner_)/,'').replace(/[A-Z]/g,c=>'-'+c.toLowerCase()).replace(/[_0-9]/g,''):'other'),()=>Reflect.apply(value,target,args)));
  return functions.get(name);
 }});
}

export function recordProofAggregate(stage,duration){
 try{
  if(!/^(?:native|server)\.[a-z.-]+$/.test(stage)||!Number.isFinite(duration)||duration<0)return;
  const timing=globalThis.performance,now=timing.now(),name='rolling.proof.aggregate.'+stage;
  timing.clearMeasures(name);timing.measure(name,{start:now,end:now,detail:{kind:'aggregate',durationMs:duration}});
 }catch{/* Server/native duration has no invented position on the browser clock. */}
}
