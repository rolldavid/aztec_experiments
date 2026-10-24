import {measureRollingStage} from './performance.mjs';
// Called inside ONE session lock/snapshot. The saved intent remains visible if
// sending fails; consumers cannot accidentally resubmit an ambiguous action.
export async function executeRollingAction(application,action,{onPrepared=()=>{},postingRules,submit=id=>application.submitPrepared(id)}={}){
 if(action.type==='preference'||action.type==='read-marker'){
  const head=await application.readPreferenceHead();
  if(typeof head?.revision!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(head.revision))throw Object.assign(Error('Account state unavailable'),{code:'ROLLING_INVALID_RESPONSE'});
  action.expectedRevision=head.revision;
 }
 const prepareOptions={immediate:true,...(postingRules===undefined?{}:{postingRules:structuredClone(postingRules)})};
 let intent=await measureRollingStage('action.prepare',()=>application.prepare(action,prepareOptions));
 const send=async()=>{onPrepared({...intent,status:'unknown'});return measureRollingStage('action.submit',()=>submit(intent.intentId));};
 let result=await send();
 // A previously authorized request may still use the older two-step contract.
 if(action.type==='bok'&&result.status==='authorized'){
  intent=await application.prepareBokPost(result.intentId,{immediate:true});result=await send();
 }
 return result;
}
