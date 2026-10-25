import {executeRollingAction} from './wallet-action.mjs';

// The session owns one account lock throughout. Successful screening inclusion
// may advance private state after native sync. An included exit returns its
// pending Ethereum claim; an ambiguous send is never retried here.
export async function executeAutomaticWithdrawal({application,deposit,waitUntil,guard,onProgress=()=>{},onPrepared=()=>{}}){
 let previous=null;
 for(;;){
  await guard();
  const state=await application.readWithdrawalReadiness(deposit);
  await guard();
  if(previous!==null&&BigInt(state.screenedSequence)<=previous)
   throw Object.assign(Error('Withdrawal did not advance.'),{code:'ROLLING_WITHDRAWAL_NO_PROGRESS'});
  previous=null;
  if(BigInt(state.readyAt)>BigInt(state.anchor.timestamp)){
   onProgress({stage:'waiting',availableAt:state.readyAt});
   await waitUntil(state.readyAt);continue;
  }
  const type=state.needsScreening?'screen':'withdraw';
  onProgress({stage:type==='screen'?'preparing':'withdrawing'});
  const result=await executeRollingAction(application,{type,deposit},{onPrepared});
  await guard();
  if(!['included','confirmed'].includes(result.status))return result;
  if(type==='withdraw')return result;
  previous=BigInt(state.screenedSequence);
 }
}
