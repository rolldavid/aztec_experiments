// The caller owns the account lock, PXE lifetime and trusted-route guard.
// autoSync:false requires synchronization before every private application operation.
const methods=['readAccountStatus','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile'];
export function createSynchronizedRollingApplication({application,synchronize,contextGuard}){
 if(typeof synchronize!=='function'||typeof contextGuard!=='function')throw Error('Rolling synchronization unavailable');
 const calls=methods.map(name=>{
  if(typeof application?.[name]!=='function')throw Error('Rolling application unavailable');
  const call=application[name].bind(application);
  return [name,async(...args)=>{
   await contextGuard();await synchronize();await contextGuard();return call(...args);
  }];
 });
 return Object.freeze(Object.fromEntries(calls));
}
