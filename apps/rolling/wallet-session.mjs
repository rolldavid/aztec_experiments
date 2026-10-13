// Load after explicit unlock. All SDK and custody dependencies are supplied by
// the authenticated application bundle; no fixture or ordinary-node fallback.
import {createAggregateWallet} from '../../shared/rolling/aggregate-wallet.mjs';
import {createRollingColdPreferenceReader} from '../../shared/rolling/cold-preference-reader.mjs';
import {createRollingCompactClient} from '../../shared/rolling/compact-client.mjs';
import {createRollingPreferenceReader} from '../../shared/rolling/preference-reader.mjs';
import {createSynchronizedRollingApplication} from '../../shared/rolling/synchronized-application.mjs';
import {createRollingApplication} from '../../shared/rolling/application.mjs';
import {verifyRollingDeployment,observeRollingSetup,rollingSetupErrorCode} from '../../shared/rolling/deployment.mjs';
const fail=code=>Object.assign(Error('The private account is unavailable. Preserve recovery records.'),{code});
export const ROLLING_SESSION_STAGES=Object.freeze(['account-lock','trusted-node','deployment','account-derive','store-open','pxe-create','account-register','contracts-register','initial-sync','journal-open','wallet-bind','account-manager','application-bind']);
const silent=()=>{};
const logger=Object.freeze({trace:silent,debug:silent,verbose:silent,info:silent,warn:silent,error:silent,fatal:silent,
 level:'silent',module:'rolling-wallet',isLevelEnabled:()=>false,createChild:()=>logger,getBindings:()=>({})});
// Optional Bok capability is authenticated from the pinned local artifact and
// canonical public storage before registration or any personalized operation.
export async function verifyRollingBokCapability({sdk,node,config,artifact,deployment,contextGuard}){
 if(config===undefined){if(artifact!==undefined)throw fail('ROLLING_SESSION_CONFIG');return undefined;}
 const selected=structuredClone(config),canonical=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value)&&BigInt(value)>0n;
 if(!selected||Object.keys(selected).sort().join()!=='contractAddress,operatorAddress,pluginId'||
  !canonical(selected.contractAddress)||!canonical(selected.operatorAddress)||!canonical(selected.pluginId)||artifact?.name!=='PrivateBok')throw fail('ROLLING_SESSION_CONFIG');
 const check=ok=>{if(!ok)throw fail('ROLLING_DEPLOYMENT_INVALID');};
 await contextGuard();const head=await node.getBlockData('checkpointed');await contextGuard();
 const number=Number(head?.header?.globalVariables?.blockNumber),hash=head?.blockHash?.toString();check(Number.isSafeInteger(number)&&number>0&&canonical(hash));
 const reference={hash},address=new sdk.AztecAddress(new sdk.Fr(BigInt(selected.contractAddress))),expected=(await sdk.getContractClassFromArtifact(artifact)).id;
 await contextGuard();const instance=await node.getContract(address,reference);await contextGuard();
 const same=(a,b)=>BigInt(a.toString())===BigInt(b.toString());
 check(instance&&same(instance.address,address)&&same(instance.currentContractClassId,expected)&&same(instance.originalContractClassId,expected)&&same(await sdk.computeContractAddressFromInstance(instance),address));
 const expectedValues={board:deployment.board.address,operator:selected.operatorAddress,l1_chain:deployment.network.chainId,version:deployment.network.version};
 for(const [name,value]of Object.entries(expectedValues)){
  const slot=artifact.storageLayout?.[name]?.slot;check(slot!==undefined);
  await contextGuard();const actual=await node.getPublicStorageAt(reference,address,new sdk.Fr(BigInt(slot)));check(same(actual,value));
 }
 await contextGuard();const again=await node.getBlockData(number);check(again?.blockHash?.toString()===hash&&Number(again?.header?.globalVariables?.blockNumber)===number);
 await sdk.inspectTrustedNode(node,{expectedNetworkScope:deployment.network,proofsEnabled:deployment.proofsEnabled});await contextGuard();
 return Object.freeze({address,artifact,instance,operator:new sdk.AztecAddress(new sdk.Fr(BigInt(selected.operatorAddress))),pluginId:selected.pluginId});
}
export async function createRollingWalletSession({sdk,routing,ethers,config,boardArtifact,privateFeeArtifact,bokArtifact,account,
 trustedQuery,remoteProver,contextGuard,claimStore,captureFundingWallet,onProgress=()=>{},locks=globalThis.navigator?.locks,proofsEnabled=true}){
 if(typeof proofsEnabled!=='boolean'||(!proofsEnabled&&String(config?.network?.chainId)!=='31337')||typeof contextGuard!=='function'||typeof locks?.request!=='function'||!account||!trustedQuery||!routing)throw fail('ROLLING_SESSION_CONFIG');
 const captured={secretKey:account.secretKey,salt:String(account.salt),address:String(account.address)};
 const selected=structuredClone(config),query=structuredClone(trustedQuery),remote=remoteProver?structuredClone(remoteProver):undefined;
 const lockName='billboard-wallet:'+captured.address;
 let pxe,store,fundingProvider,closed=false,busy=false,app,closing,privateNode,privateWallet,readPreferences,readColdPreferences,initializeAccount,aggregate;
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
  try{if(pxe){try{await pxe.stop();pxe=undefined;store=undefined;}
   catch(error){try{if(store){await store.close();store=undefined;}}catch(cleanupError){throw new AggregateError([error,cleanupError],'Private session cleanup failed');}throw error;}}
  else if(store){await store.close();store=undefined;}}finally{fundingProvider?.destroy();fundingProvider=undefined;}
 }
 let initializationStep='account-lock',nestedFailure=null,failedObservation=false;
 const emit=(state,error)=>observeRollingSetup(onProgress,{stage:'session-initialization',step:initializationStep,deploymentStep:null,state,code:state==='failed'?rollingSetupErrorCode(error):null});
 const begin=step=>{emit('complete');initializationStep=step;emit('started');};
 const failed=error=>{if(failedObservation)return;failedObservation=true;if(!nestedFailure)emit('failed',error);};
 emit('started');
 try{await locked(async()=>{
  try{
   begin('trusted-node');
   const network={chainId:String(selected.network.chainId),version:String(selected.network.rollupVersion),rollup:selected.network.rollupAddress};
   const node=await sdk.createTrustedPrivateNode({...query,expectedNetworkScope:network,proofsEnabled});await guard();
   begin('deployment');
   const verifiedDeployment=await verifyRollingDeployment({sdk,node,ethers,config:selected,boardArtifact,privateFeeArtifact,contextGuard:guard,proofsEnabled,onProgress:record=>{
    const value={stage:'session-initialization',step:'deployment',deploymentStep:record.step,state:record.state,code:record.code};
    if(record.state==='failed')nestedFailure=Object.freeze(value);observeRollingSetup(onProgress,value);
   }});
   const bok=await verifyRollingBokCapability({sdk,node,config:selected.bok,artifact:bokArtifact,deployment:verifiedDeployment,contextGuard:guard});
   const deployment={...verifiedDeployment,...(bok?{bok}:{})};
   begin('account-derive');
   const secret=sdk.Fr.fromHexString(captured.secretKey),salt=new sdk.Fr(BigInt(captured.salt));
   const accountContract=new sdk.SchnorrInitializerlessAccountContract(sdk.deriveSigningKey(secret));
   const keys=await sdk.deriveKeys(secret),artifact=await accountContract.getContractArtifact();
   const instance=await sdk.getContractInstanceFromInstantiationParams(artifact,{salt,publicKeys:keys.publicKeys,
    constructorArtifact:undefined,constructorArgs:undefined,immutablesHash:await accountContract.getImmutablesHash()});
   if(instance.address.toString()!==captured.address)throw fail('ROLLING_ACCOUNT_MISMATCH');
   begin('store-open');
   await guard();store=await sdk.openPXEStore({l1ChainId:Number(network.chainId),rollupAddress:network.rollup,
    accountAddress:captured.address,dataDirectory:'rolling-wallet-v1'},undefined,logger);
   begin('pxe-create');
   await guard();pxe=await sdk.createPXE(node,{proverEnabled:proofsEnabled,autoSync:false,syncChainTip:'checkpointed'},{store,remoteProver:remote});await guard();
   if(!sdk.isPrivatePXEForNode(pxe,node))throw fail('ROLLING_PRIVATE_ROUTE');
   begin('account-register');
   const partialAddress=await sdk.computePartialAddress(instance);await guard();
   await pxe.registerAccount(keys,partialAddress);
   begin('contracts-register');
   for(const [contractArtifact,contractInstance]of [[artifact,instance],[boardArtifact,deployment.board.instance],[privateFeeArtifact,deployment.privateFee.instance],...(bok?[[bokArtifact,bok.instance]]:[])]){
    await guard();await pxe.registerContractClass(contractArtifact);
    await guard();await pxe.registerContract(contractInstance);
   }
   begin('initial-sync');
   await guard();await pxe.sync();await guard();
   begin('journal-open');
   const privateStore=sdk.createBrowserJournalStorage();
   await guard();const journal=await sdk.createL2Journal({storage:privateStore,walletSecret:captured.secretKey,walletSalt:captured.salt,
    scope:{account:captured.address,...network,board:deployment.board.address.toString(),portal:deployment.portal},Tx:sdk.Tx,node,contextGuard:guard});
   begin('wallet-bind');
   await guard();const wallet=routing.createAztecWallet(sdk,pxe,node,node,silent,secret,{contextGuard:guard,transactionJournal:journal});
   if(wallet.aztecNode!==node||wallet.pxe!==pxe||!routing.isPrivateWalletForNode(wallet,node))throw fail('ROLLING_PRIVATE_ROUTE');
   begin('account-manager');
   await guard();wallet._accountManager=await sdk.AccountManager.create(wallet,secret,accountContract,{salt});
   if(wallet._accountManager.address.toString()!==captured.address)throw fail('ROLLING_ACCOUNT_MISMATCH');
   // Cold preference recovery needs only registered keys and the scoped PXE
   // cursor. The signing capsule can trigger ordinary note discovery, so create
   // it lazily under the same account lease before an ordinary operation.
   let initialized=false;
   initializeAccount=async()=>{
    await guardRoute();if(initialized)return;
    const signingPublicKey=await accountContract.getSigningPublicKey();await guardRoute();
    const constructor=artifact.functions.find(fn=>fn.name==='constructor');
    if(constructor){await new sdk.ContractFunctionInteraction(wallet,instance.address,constructor,[signingPublicKey.x,signingPublicKey.y]).simulate({from:instance.address});await guardRoute();}
    initialized=true;
   };
   begin('application-bind');
   privateNode=node;privateWallet=wallet;
   // Read-only Ethereum access is lazy and scoped to this private session.
   // No signer is supplied: importing a recovery receipt cannot pay again.
   const funding={claimStore,provider:Object.fromEntries(['getNetwork','getTransactionReceipt','getTransaction','getBlock','getCode','call'].map(name=>[name,async(...args)=>{
    await guardRoute();fundingProvider??=new ethers.JsonRpcProvider(selected.network.ethRpcUrl);
    const result=await fundingProvider[name](...args);await guardRoute();return result;
   }]))};
   if(selected.aggregateFunding!==undefined){
    const scope=selected.aggregateFunding;
    if(!bok||scope.chainId!==network.chainId||scope.collateralPortal!==deployment.portal||scope.privateFpc!==deployment.privateFee.address.toString()||typeof captureFundingWallet!=='function')throw fail('ROLLING_SESSION_CONFIG');
    const provider=Object.fromEntries(['getNetwork','getTransactionReceipt','getTransaction','getBlock','getCode','call','send','getTransactionCount','getBlockNumber','estimateGas','getFeeData','waitForTransaction'].map(name=>[name,async(...args)=>{
     await guardRoute();fundingProvider??=new ethers.JsonRpcProvider(selected.network.ethRpcUrl);
     const result=await fundingProvider[name](...args);await guardRoute();return result;
    }]));
    const verifyScope=async()=>{
     await guardRoute();const contracts=await node.getL1ContractAddresses();await guardRoute();
     if(contracts.feeJuicePortalAddress?.toString().toLowerCase()!==scope.feePortal)throw fail('ROLLING_SESSION_CONFIG');
     const head=await node.getBlockData('checkpointed');await guardRoute();
     const number=Number(head?.header?.globalVariables?.blockNumber),hash=head?.blockHash?.toString(),slot=bokArtifact.storageLayout?.portal?.slot;
     if(!Number.isSafeInteger(number)||number<1||!/^0x[0-9a-f]{64}$/.test(hash)||slot===undefined)throw fail('ROLLING_SESSION_CONFIG');
     const portal=await node.getPublicStorageAt({hash},bok.address,new sdk.Fr(BigInt(slot)));await guardRoute();
     if(BigInt(portal.toString())!==BigInt(scope.bokPortal))throw fail('ROLLING_SESSION_CONFIG');
     const again=await node.getBlockData(number);await guardRoute();if(again?.blockHash?.toString()!==hash)throw fail('ROLLING_CONTEXT_CHANGED');
     await sdk.inspectTrustedNode(node,{expectedNetworkScope:network,proofsEnabled});await guardRoute();
    };
    aggregate=await createAggregateWallet({sdk,ethers,scope,network,board:deployment.board.address.toString(),bok:bok.address.toString(),owner:captured.address,
     walletSecret:captured.secretKey,walletSalt:captured.salt,storage:privateStore,provider,captureWallet:captureFundingWallet,contextGuard:guardRoute,verifyScope});
    funding.loadAggregate=txHash=>aggregate.loadAggregate(txHash);
   }
   await guard();app=createRollingApplication({sdk:{...sdk,isPrivateWalletForNode:routing.isPrivateWalletForNode},deployment,contextGuard:guard,privateStore,funding,onProgress,
    accountSession:{owner:instance.address,wallet,node,journal,walletSecret:captured.secretKey,walletSalt:captured.salt}});
   // The reader owns synchronization, but the session owns this same account
   // lock and PXE lifetime. Its head capability is the raw guarded application
   // method, never the lock-taking public facade (which would nest the lock).
   let preferenceReader;
   readPreferences=async options=>{
    await initializeAccount();
    preferenceReader??=createRollingPreferenceReader({sdk,pxe,node,owner:instance.address,deployment,
      readHead:app.readPreferenceHead.bind(app),contextGuard:guardRoute,privateStore,
      walletSecret:captured.secretKey,walletSalt:captured.salt});
    return preferenceReader.read(options);
   };
   // This is a separate bounded capability, never a fallback to the ordinary
   // event reader. Hash the verified local artifact, not remote configuration.
   let coldReader;
   readColdPreferences=async options=>{
    await guardRoute();
    if(!coldReader){
     const expectedArtifactHash=(await sdk.computeArtifactHash(deployment.board.artifact)).toString();await guardRoute();
     const compact=createRollingCompactClient({url:new URL(query.url).origin,tier:'checkpointed',contextGuard:guardRoute,...(query.allowLocalDev===true?{allowLocalDev:true}:{})});
     coldReader=createRollingColdPreferenceReader({sdk,pxe,node,owner:instance.address,deployment,expectedArtifactHash,tier:'checkpointed',compact,
      contextGuard:guardRoute,privateStore,walletSecret:captured.secretKey,walletSalt:captured.salt});
    }
    return coldReader.read(options);
   };
   emit('complete');
  }catch(error){failed(error);closed=true;try{await dispose();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Private session initialization and cleanup failed');}throw error;}
 });}catch(error){failed(error);throw error;}
 async function guardRoute(){
  await guard();
  if(!sdk.isTrustedPrivateNode(privateNode)||!sdk.isPrivatePXEForNode(pxe,privateNode)||privateWallet.aztecNode!==privateNode||privateWallet.pxe!==pxe||!routing.isPrivateWalletForNode(privateWallet,privateNode))throw fail('ROLLING_PRIVATE_ROUTE');
 }
 const synchronized=createSynchronizedRollingApplication({application:app,synchronize:async()=>{await pxe.sync();await initializeAccount();},contextGuard:guardRoute});
 const application=Object.freeze({...Object.fromEntries(Object.entries(synchronized).map(([name,call])=>[name,(...args)=>locked(()=>call(...args))])),
  readPreferences:options=>locked(()=>readPreferences(options)),
  readColdPreferences:options=>locked(()=>readColdPreferences(options))});
 return Object.freeze({application,funding:aggregate?Object.freeze({defaultPrivateFeeCap:((BigInt(selected.privateFee.gasSettings.gasLimits.daGas)+BigInt(selected.privateFee.gasSettings.teardownGasLimits.daGas))*BigInt(selected.privateFee.gasSettings.maxFeesPerGas.feePerDaGas)+(BigInt(selected.privateFee.gasSettings.gasLimits.l2Gas)+BigInt(selected.privateFee.gasSettings.teardownGasLimits.l2Gas))*BigInt(selected.privateFee.gasSettings.maxFeesPerGas.feePerL2Gas)).toString(),...Object.fromEntries(['prepare','confirm','recover','inspect','checkpointClaim'].map(name=>[name,(...args)=>locked(()=>aggregate[name](...args))]))}):null,get busy(){return busy;},close(){
  if(closing)return closing;
  if(busy)return Promise.reject(fail('ROLLING_BUSY'));
  if(closed&&!pxe&&!store)return Promise.resolve();
  closed=true;busy=true;
  closing=Promise.resolve().then(()=>locks.request(lockName,{ifAvailable:true},async lock=>{
   if(!lock)throw fail('ROLLING_OTHER_TAB');await dispose();
  })).finally(()=>{busy=false;closing=undefined;});return closing;
 }});
}
