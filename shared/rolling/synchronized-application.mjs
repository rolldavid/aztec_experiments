// The caller owns the account lock, PXE lifetime and trusted-route guard.
// autoSync:false synchronizes once per account flow, and again after chain state changes.
const methods=['readWithdrawalReadiness','readBokAccounting','readBalances','readWithdrawal','readModeratorStatus','readBokStatus','prepareBokPost','prepareBokRelease','readAccountStatus','readPreferenceHead','readProfile','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile','inspectRecovery','prepareReplacement','prepareInterrupted','resumeSaved'];
// This financial confirmation must bind the caller's selection before the
// synchronization await, not retain a mutable object until the raw app runs.
function savedResumeArguments(args){
 try{
  const [id,input]=args,descriptor=input&&Object.getOwnPropertyDescriptor(input,'expectedTxHash');
  if(args.length!==2||typeof id!=='string'||!input||Object.getPrototypeOf(input)!==Object.prototype||
    Reflect.ownKeys(input).length!==1||!descriptor||!Object.hasOwn(descriptor,'value')||
    typeof descriptor.value!=='string'||!/^0x[0-9a-f]{64}$/.test(descriptor.value))throw 0;
  return [id,{expectedTxHash:descriptor.value}];
 }catch{throw Object.assign(Error('Invalid Rolling action'),{code:'ROLLING_INVALID_ACTION'});}
}
function bokReleaseArguments(args){
 try{
  const [id,input]=args,d=input&&Object.getOwnPropertyDescriptor(input,'type');
  if(args.length!==2||typeof id!=='string'||!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==1||
    !d||!Object.hasOwn(d,'value')||!['cancel-bok-request','expire-bok-request'].includes(d.value))throw 0;
  return [id,{type:d.value}];
 }catch{throw Object.assign(Error('Invalid Rolling action'),{code:'ROLLING_INVALID_ACTION'});}
}
function balanceArguments(args){
 try{
  if(args.length===0)return [{cursor:0}];
  const [input]=args,d=input&&Object.getOwnPropertyDescriptor(input,'cursor');
  if(args.length!==1||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==1||!d||!Object.hasOwn(d,'value')||!(d.value===0||typeof d.value==='string'))throw 0;
  return [{cursor:d.value}];
 }catch{throw Object.assign(Error('Invalid Rolling balance cursor'),{code:'ROLLING_BALANCE_CURSOR_INVALID'});}
}
export function createSynchronizedRollingApplication({application,synchronize,contextGuard,operationScope=()=>null,prepareContext}){
 if(typeof synchronize!=='function'||typeof contextGuard!=='function'||prepareContext!==undefined&&typeof prepareContext!=='function')throw Error('Rolling synchronization unavailable');
 const calls=methods.map(name=>{
  if(typeof application?.[name]!=='function')throw Error('Rolling application unavailable');
  const call=application[name].bind(application);
  return [name,async(...args)=>{
   const captured=name==='resumeSaved'?savedResumeArguments(args):name==='prepareBokRelease'?bokReleaseArguments(args):['readBalances','readBokAccounting'].includes(name)?balanceArguments(args):args;
   await contextGuard();
   const scope=operationScope();
   // Moderator identity is public storage; it needs no private-state sync.
   if(name!=='readModeratorStatus'&&(!scope||!scope.synchronized)){
    // The native sync and public readiness reads are independent. Neither
    // failure may release the account lease while its sibling is still running.
    const ordinaryPost=Boolean(scope)&&name==='prepare'&&captured[1]?.immediate===true&&['post','reply','quote','repost'].includes(captured[0]?.type);
    const ordinaryPolicy=ordinaryPost&&(captured[0].subboard===undefined||/^(0|0x0{64})$/.test(captured[0].subboard));
    const reads=[()=>synchronize({ordinaryPolicy,ordinaryPost})];if(scope&&prepareContext)reads.push(()=>prepareContext({predecessor:name==='prepare',
      ...(name==='prepare'&&Array.isArray(scope.preparationReads)&&captured[1]?.immediate===true&&['post','reply','quote','repost'].includes(captured[0]?.type)?{ordinaryPayment:true}:{})}));
    const results=await Promise.allSettled(reads.map(read=>Promise.resolve().then(read)));
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    if(scope&&operationScope()!==scope)throw Object.assign(Error('Rolling operation changed'),{code:'ROLLING_CONTEXT_CHANGED'});
    if(scope)scope.synchronized=true;
   }
   await contextGuard();const result=await call(...captured);
   if(scope&&['submitPrepared','resumeSaved'].includes(name)&&['confirmed','authorized','reverted','bok-post-reverted','bok-release-reverted'].includes(result?.status))scope.synchronized=false;
   return result;
  }];
 });
 return Object.freeze(Object.fromEntries(calls));
}
