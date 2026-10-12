// The caller owns the account lock, PXE lifetime and trusted-route guard.
// autoSync:false requires synchronization before every private application operation.
const methods=['readAccountStatus','readPreferenceHead','readProfile','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile','inspectRecovery','prepareReplacement','resumeSaved'];
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
export function createSynchronizedRollingApplication({application,synchronize,contextGuard}){
 if(typeof synchronize!=='function'||typeof contextGuard!=='function')throw Error('Rolling synchronization unavailable');
 const calls=methods.map(name=>{
  if(typeof application?.[name]!=='function')throw Error('Rolling application unavailable');
  const call=application[name].bind(application);
  return [name,async(...args)=>{
   const captured=name==='resumeSaved'?savedResumeArguments(args):args;
   await contextGuard();await synchronize();await contextGuard();return call(...captured);
  }];
 });
 return Object.freeze(Object.fromEntries(calls));
}
