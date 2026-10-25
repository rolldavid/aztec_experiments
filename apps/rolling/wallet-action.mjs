import {measureRollingStage} from './performance.mjs';
// Called inside ONE session lock/snapshot. The saved intent remains visible if
// sending fails; consumers cannot accidentally resubmit an ambiguous action.
export async function executeRollingAction(application,action,{onPrepared=()=>{},postingRules,submit=id=>application.submitPrepared(id)}={}){
 const prepareOptions={immediate:true,...(postingRules===undefined?{}:{postingRules:structuredClone(postingRules)})};
 let intent=await measureRollingStage('action.prepare',()=>application.prepare(action,prepareOptions));
 const send=async()=>{await onPrepared({...intent,status:'unknown'});return measureRollingStage('action.submit',()=>submit(intent.intentId));};
 let result=await send();
 // A previously authorized request may still use the older two-step contract.
 if(action.type==='bok'&&result.status==='authorized'){
  intent=await application.prepareBokPost(result.intentId,{immediate:true});result=await send();
 }
 return result;
}
