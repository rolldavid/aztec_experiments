import {measureProofStage} from './proof-timings.mjs';

// Embedded only in the pinned browser worker entry. No buffers, commands inside
// bbapi, proof contents, or errors are inspected. Durations are elapsed, not CPU.
export function installWorkerTimings(wasm){
 const nativeCbind=wasm.cbindCall,nativeCall=wasm.call;
 let window=null,current=null,sequence=0;
 const now=()=>{try{return performance.now();}catch{return NaN;}};
 wasm.rollingOpenTiming=()=>{
  if(window)return 0;
  let origin;try{origin=performance.timeOrigin;}catch{}
  sequence=sequence===Number.MAX_SAFE_INTEGER?1:sequence+1;
  window={token:sequence,origin,calls:0,start:NaN,end:NaN,wasmCalls:0,wasmStart:NaN,wasmEnd:NaN};
  return sequence;
 };
 wasm.rollingCloseTiming=token=>{
  if(!window||token!==window.token)return null;
  const saved=window;window=null;
  const {origin,calls,start,end,wasmCalls,wasmStart,wasmEnd}=saved;
  if(![origin,calls,start,end,wasmCalls,wasmStart,wasmEnd].every(Number.isFinite))return null;
  return {origin,calls,start,end,wasmCalls,wasmStart,wasmEnd};
 };
 wasm.cbindCall=function(...args){
  if(!window||args[0]!=='bbapi')return Reflect.apply(nativeCbind,this,args);
  const saved=window; saved.calls=Math.min(2,saved.calls+1);
  const prior=current;current=saved;saved.start=now();
  try{return Reflect.apply(nativeCbind,this,args);}finally{saved.end=now();current=prior;}
 };
 wasm.call=function(...args){
  if(!current||args[0]!=='bbapi')return Reflect.apply(nativeCall,this,args);
  const saved=current;saved.wasmCalls=Math.min(2,saved.wasmCalls+1);saved.wasmStart=now();
  try{return Reflect.apply(nativeCall,this,args);}finally{saved.wasmEnd=now();}
 };
 return wasm;
}

function emitWorkerTiming(record,timing,start,end){
 try{
  // Any concurrent/extra native call makes attribution ambiguous: emit nothing.
  if(!record||record.calls!==1||record.wasmCalls!==1)return;
  const {origin}=record,pageOrigin=timing.timeOrigin;
  const points=[record.start,record.wasmStart,record.wasmEnd,record.end];
  if(![origin,pageOrigin,start,end,...points].every(Number.isFinite))return;
  const [entry,wasmStart,wasmEnd,exit]=points.map(value=>origin-pageOrigin+value);
  if(!(start<=entry&&entry<=wasmStart&&wasmStart<=wasmEnd&&wasmEnd<=exit&&exit<=end))return;
  // Before/after include encoding, transport and scheduling; never call these
  // pure queue time. The WASM span is nested in cbind, both inside local.verify.
  for(const [label,a,b]of [['before-entry',start,entry],['cbind',entry,exit],['wasm',wasmStart,wasmEnd],['after-exit',exit,end]]){
   const name='rolling.proof.native.phase.worker-verify-'+label;
   timing.clearMeasures(name);timing.measure(name,{start:a,end:b});
  }
 }catch{/* Optional numeric diagnostics cannot change proof execution. */}
}
export function measureWorkerVerification(bb,operation){
 return measureProofStage('local.verify',async()=>{
 let remote,opened,timing,start;
 try{
  if(globalThis[Symbol.for('rolling.proof.profile')]===true&&bb.backend?.worker){
   remote=bb.backend.wasm;timing=globalThis.performance;start=timing.now();
   // Same Comlink endpoint orders this ahead of cbind. Do not await it: that
   // would hide dispatch/queue delay outside the existing verification span.
   opened=Promise.resolve(remote.rollingOpenTiming()).catch(()=>0);
  }
 }catch{}
  try{return await operation();}finally{
   try{
    const end=timing?.now();
    // Readback is detached: a missing/slow diagnostic method never blocks proof
    // completion, changes its error, or adds another native verification call.
    if(opened)void opened.then(token=>token?remote.rollingCloseTiming(token):null)
      .then(record=>emitWorkerTiming(record,timing,start,end)).catch(()=>{});
   }catch{}
  }
 });
}
