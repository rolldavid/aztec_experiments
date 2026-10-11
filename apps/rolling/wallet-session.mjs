// Load after explicit unlock. All SDK and custody dependencies are supplied by
// the authenticated application bundle; no fixture or ordinary-node fallback.
import {createRollingApplication} from '../../shared/rolling/application.mjs';
import {verifyRollingDeployment} from '../../shared/rolling/deployment.mjs';
const fail=code=>Object.assign(Error('The private account is unavailable. Preserve recovery records.'),{code});
const silent=()=>{};
const logger=Object.freeze({trace:silent,debug:silent,verbose:silent,info:silent,warn:silent,error:silent,fatal:silent,
 level:'silent',module:'rolling-wallet',isLevelEnabled:()=>false,createChild:()=>logger,getBindings:()=>({})});
export async function createRollingWalletSession({sdk,routing,ethers,config,boardArtifact,privateFeeArtifact,account,
 trustedQuery,remoteProver,contextGuard,onProgress=()=>{},locks=globalThis.navigator?.locks,proofsEnabled=true}){
 if(typeof contextGuard!=='function'||typeof locks?.request!=='function'||!account||!trustedQuery||!routing)throw fail('ROLLING_SESSION_CONFIG');
 const captured={secretKey:account.secretKey,salt:String(account.salt),address:String(account.address)};
 const selected=structuredClone(config),query=structuredClone(trustedQuery),remote=remoteProver?structuredClone(remoteProver):undefined;
 const lockName='billboard-wallet:'+captured.address;
 let pxe,store,closed=false,busy=false,app,closing,privateNode,privateWallet;
 const assertCaptured=()=>{
  if(closed||captured.secretKey!==account.secretKey||captured.salt!==String(account.salt)||captured.address!==String(account.address))throw fail('ROLLING_CONTEXT_CHANGED');
 };
 const guard=async()=>{assertCaptured();await contextGuard();assertCaptured();};
 const locked=async work=>{
  if(busy)throw fail('ROLLING_BUSY');busy=true;
  try{return await locks.request(lockName,{ifAvailable:true},async lock=>{if(!lock)throw fail('ROLLING_OTHER_TAB');await guard();return work();});}
  finally{busy=false;}
 };
 async function dispose(){
  if(pxe){try{await pxe.stop();pxe=undefined;store=undefined;}
   catch(error){try{if(store){await store.close();store=undefined;}}catch(cleanupError){throw new AggregateError([error,cleanupError],'Private session cleanup failed');}throw error;}}
  else if(store){await store.close();store=undefined;}
 }
 await locked(async()=>{
  try{
   const network={chainId:String(selected.network.chainId),version:String(selected.network.rollupVersion),rollup:selected.network.rollupAddress};
   const node=await sdk.createTrustedPrivateNode({...query,expectedNetworkScope:network,proofsEnabled});await guard();
   const deployment=await verifyRollingDeployment({sdk,node,ethers,config:selected,boardArtifact,privateFeeArtifact,contextGuard:guard,proofsEnabled});
   const secret=sdk.Fr.fromHexString(captured.secretKey),salt=new sdk.Fr(BigInt(captured.salt));
   const accountContract=new sdk.SchnorrInitializerlessAccountContract(sdk.deriveSigningKey(secret));
   const keys=await sdk.deriveKeys(secret),artifact=await accountContract.getContractArtifact();
   const instance=await sdk.getContractInstanceFromInstantiationParams(artifact,{salt,publicKeys:keys.publicKeys,
    constructorArtifact:undefined,constructorArgs:undefined,immutablesHash:await accountContract.getImmutablesHash()});
   if(instance.address.toString()!==captured.address)throw fail('ROLLING_ACCOUNT_MISMATCH');
   await guard();store=await sdk.openPXEStore({l1ChainId:Number(network.chainId),rollupAddress:network.rollup,
    accountAddress:captured.address,dataDirectory:'rolling-wallet-v1'},undefined,logger);
   await guard();pxe=await sdk.createPXE(node,{proverEnabled:true,autoSync:false,syncChainTip:'checkpointed'},{store,remoteProver:remote});await guard();
   if(!sdk.isPrivatePXEForNode(pxe,node))throw fail('ROLLING_PRIVATE_ROUTE');
   const partialAddress=await sdk.computePartialAddress(instance);await guard();
   await pxe.registerAccount(keys,partialAddress);
   for(const [contractArtifact,contractInstance]of [[artifact,instance],[boardArtifact,deployment.board.instance],[privateFeeArtifact,deployment.privateFee.instance]]){
    await guard();await pxe.registerContractClass(contractArtifact);
    await guard();await pxe.registerContract(contractInstance);
   }
   await guard();await pxe.sync();await guard();
   const privateStore=sdk.createBrowserJournalStorage();
   await guard();const journal=await sdk.createL2Journal({storage:privateStore,walletSecret:captured.secretKey,walletSalt:captured.salt,
    scope:{account:captured.address,...network,board:deployment.board.address.toString(),portal:deployment.portal},Tx:sdk.Tx,node,contextGuard:guard});
   await guard();const wallet=routing.createAztecWallet(sdk,pxe,node,node,silent,secret,{contextGuard:guard,transactionJournal:journal});
   if(wallet.aztecNode!==node||wallet.pxe!==pxe||!routing.isPrivateWalletForNode(wallet,node))throw fail('ROLLING_PRIVATE_ROUTE');
   await guard();wallet._accountManager=await sdk.AccountManager.create(wallet,secret,accountContract,{salt});
   if(wallet._accountManager.address.toString()!==captured.address)throw fail('ROLLING_ACCOUNT_MISMATCH');
   await guard();const signingPublicKey=await accountContract.getSigningPublicKey(),constructor=artifact.functions.find(fn=>fn.name==='constructor');
   if(constructor){await guard();await new sdk.ContractFunctionInteraction(wallet,instance.address,constructor,[signingPublicKey.x,signingPublicKey.y]).simulate({from:instance.address});}
   privateNode=node;privateWallet=wallet;
   await guard();app=createRollingApplication({sdk:{...sdk,isPrivateWalletForNode:routing.isPrivateWalletForNode},deployment,contextGuard:guard,privateStore,onProgress,
    accountSession:{owner:instance.address,wallet,node,journal,walletSecret:captured.secretKey,walletSalt:captured.salt}});
  }catch(error){closed=true;try{await dispose();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Private session initialization and cleanup failed');}throw error;}
 });
 const application=Object.freeze(Object.fromEntries(['readAccountStatus','ownedIdentities','prepare','submitPrepared','cancelPrepared','reconcile'].map(name=>[
  name,(...args)=>locked(async()=>{
   if(!sdk.isTrustedPrivateNode(privateNode)||!sdk.isPrivatePXEForNode(pxe,privateNode)||privateWallet.aztecNode!==privateNode||privateWallet.pxe!==pxe||!routing.isPrivateWalletForNode(privateWallet,privateNode))throw fail('ROLLING_PRIVATE_ROUTE');
   await pxe.sync();await guard();return app[name](...args);})])));
 return Object.freeze({application,get busy(){return busy;},close(){
  if(closing)return closing;
  if(busy)return Promise.reject(fail('ROLLING_BUSY'));
  if(closed&&!pxe&&!store)return Promise.resolve();
  closed=true;busy=true;
  closing=Promise.resolve().then(()=>locks.request(lockName,{ifAvailable:true},async lock=>{
   if(!lock)throw fail('ROLLING_OTHER_TAB');await dispose();
  })).finally(()=>{busy=false;closing=undefined;});return closing;
 }});
}
