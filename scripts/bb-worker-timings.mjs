import {createHash} from 'node:crypto';
import {installWorkerTimings} from '../shared/bb-worker-timings.mjs';
export const BB_WORKER_TIMING_PINS=Object.freeze({
 'node_modules/@aztec-foundation/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_main/factory/browser/main.worker.js':'9a8c686a0fea41cb6e8bf0cb87b8f408719f97ea4686179641ebb20bd3b8774b',
});
export function instrumentBrowserWorker(source,path){
 if(!Object.hasOwn(BB_WORKER_TIMING_PINS,path)||createHash('sha256').update(source).digest('hex')!==BB_WORKER_TIMING_PINS[path])throw Error('Browser worker timing source mismatch');
 const before='expose(new BarretenbergWasmMain());';
 if(source.split(before).length!==2)throw Error('Browser worker timing boundary mismatch');
 return source.replace(before,`expose((${installWorkerTimings.toString()})(new BarretenbergWasmMain()));`);
}
