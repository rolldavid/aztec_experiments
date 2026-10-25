import {encodeConfigCommitment} from '../protocol-commitments.mjs';

// Fixed diagnostic vocabulary only. Never inspect exception text or invoke a
// code getter. Observation is not readiness authority and owns no SDK work.
export const ROLLING_DEPLOYMENT_STAGES=Object.freeze(['config','node-readiness','artifact-layout','board-class','checkpoint','board-instance','public-config','config-commitment','fee-instance','l1-context','portal-code-and-immutables','canonical-recheck','final-readiness-and-context','prepared-refresh','prepared-registration']);
export const ROLLING_SETUP_ERROR_CODES=Object.freeze(['BB_TRUSTED_NODE_CONFIG','BB_TRUSTED_NODE_IDENTITY','BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_UNSYNCED','BB_TRUSTED_NODE_STALE','BB_BROWSER_PROVER_CONFIGURATION','ROLLING_SESSION_CONFIG','ROLLING_OTHER_TAB','ROLLING_CONTEXT_CHANGED','ROLLING_ACCOUNT_MISMATCH','ROLLING_PRIVATE_ROUTE','ROLLING_DEPLOYMENT_INVALID']);
export function rollingSetupErrorCode(error){
 try{const descriptor=error!=null?Object.getOwnPropertyDescriptor(error,'code'):null;return descriptor&&Object.hasOwn(descriptor,'value')&&ROLLING_SETUP_ERROR_CODES.includes(descriptor.value)?descriptor.value:'unknown';}catch{return 'unknown';}
}
export function observeRollingSetup(observer,record){
 try{if(typeof observer==='function')Promise.resolve(observer(Object.freeze(record))).catch(()=>{});}catch{/* Diagnostics never change operation or failure semantics. */}
}
const failure=()=>Object.assign(Error('Rolling deployment could not be verified.'),{code:'ROLLING_DEPLOYMENT_INVALID'});
const check=value=>{if(!value)throw failure();};
const number=value=>BigInt(value.toString());
const same=(a,b)=>number(a)===number(b);
const canonical=(value,length)=>typeof value==='string'&&new RegExp(`^0x[0-9a-f]{${length}}$`).test(value)&&BigInt(value)>0n;
const hash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value);
const immutableNames=['MIN_DEPOSIT','MAX_DEPOSIT','L2_CONTRACT','ROLLUP','INBOX','OUTBOX','VERSION','L1_CHAIN_ID','CONFIG_HASH'];
const abi=[...immutableNames.map(name=>`function ${name}() view returns (${['ROLLUP','INBOX','OUTBOX'].includes(name)?'address':name==='L2_CONTRACT'||name==='CONFIG_HASH'?'bytes32':'uint256'})`),'function depositsEnabled() view returns (bool)'];
// Detached SDK values retain their prototype methods. Freeze plain containers;
// typed byte arrays and SDK value objects are copied, not shared with inputs.
function detach(value){
 if(value===null||typeof value!=='object')return value;
 if(ArrayBuffer.isView(value))return value.constructor.from(value);
 if(value instanceof ArrayBuffer)return value.slice(0);
 const copy=Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));
 for(const key of Object.keys(value))copy[key]=detach(value[key]);
 return Array.isArray(copy)||Object.getPrototypeOf(copy)===Object.prototype?Object.freeze(copy):copy;
}
// Processed artifacts belong to the authenticated SDK worker. Keep those stable
// references; detach only the small mutable SDK values and deployment records.
function deploymentRecord({board,privateFee,...values}){
 const {artifact:boardArtifact,...boardValues}=board,{artifact:privateFeeArtifact,...feeValues}=privateFee;
 return Object.freeze({...detach(values),board:Object.freeze({...detach(boardValues),artifact:boardArtifact}),privateFee:Object.freeze({...detach(feeValues),artifact:privateFeeArtifact})});
}
/** Trusted-wallet preflight, not a public-reader connection. sdk and processed
 * artifacts are supplied by the authenticated application build, never config/RPC.
 * Requires sdk.computeContractAddressFromInstance (installed stdlib/contract).
 * The fixed layout is RollingBoard admission::Config, ten Packable scalar slots:
 * chain,rollup,version,min,max,base,k,window,saveup,deployer. Pinned v6 PublicImmutable
 * reserves one additional hash slot; artifact slot gaps are checked explicitly.
 * No wallet/account queries, funding, publication or fallback node are performed.
 * Canonical RPC consistency is checked; this does not establish operator identity.
 * Caller owns node/PXE lifecycle; this function owns and disposes its L1 provider.
 */
// Every independent wave drains before failure releases the account operation or
// destroys its provider. A rejected read never leaves a sibling using a closed
// provider, and there are no deadlines/retries or alternate routes here.
async function together(reads){
 const values=await Promise.allSettled(reads.map(read=>Promise.resolve().then(read)));
 const failed=values.find(value=>value.status==='rejected');if(failed)throw failed.reason;
 return values.map(value=>value.value);
}

const preparedDeployments=new WeakMap();

/** Page-scoped, account-independent preparation. The opaque handle owns one
 * successful full verification and its exact trusted client. It is not a lease
 * on readiness. Native registration may share its metadata; consumers seeking
 * current admission use consumeRollingDeploymentPreparation below.
 */
export function createRollingDeploymentPreparation({sdk,ethers,config,boardArtifact,privateFeeArtifact,trustedQuery,proofsEnabled=true,onProgress}){
 const fixed={sdk,ethers,config:detach(config),boardArtifact,privateFeeArtifact,proofsEnabled};
 const handle=Object.freeze({});
 preparedDeployments.set(handle,{fixed,boardArtifact,privateFeeArtifact,query:detach(trustedQuery),onProgress,pending:null,result:null});
 return handle;
}

export async function prepareRollingDeployment(preparation,{contextGuard,onProgress}={}){
 const state=preparedDeployments.get(preparation);check(state&&typeof contextGuard==='function');
 await contextGuard();
 if(!state.pending){
  const pending=verifyDeployment({...state.fixed,contextGuard,onProgress:onProgress??state.onProgress},state);
  state.pending=pending;pending.then(result=>{if(state.pending===pending)state.result=result;},()=>{});pending.catch(()=>{if(state.pending===pending)state.pending=null;});
 }
 const result=await state.pending;await contextGuard();
 return Object.freeze({node:result.node,deployment:result.deployment,preparation});
}

// Identity/provenance only. This synchronous assertion does not grant readiness.
export function assertRollingDeploymentPreparation(preparation,{sdk,ethers,config,boardArtifact,privateFeeArtifact,node,proofsEnabled=true}={}){
 const state=preparedDeployments.get(preparation);
 check(state&&state.result&&sdk===state.fixed.sdk&&ethers===state.fixed.ethers&&boardArtifact===state.boardArtifact&&privateFeeArtifact===state.privateFeeArtifact&&proofsEnabled===state.fixed.proofsEnabled&&JSON.stringify(config)===JSON.stringify(state.fixed.config)&&node===state.result.node&&sdk.isTrustedPrivateNode(node));
}

/** Same owned initialization snapshot for local PXE class/instance registration.
 * This result is metadata, not current readiness or permission to pay/prove/send.
 * Native actions retain fresh trusted-node/anchor/class checks; funding retains
 * its own current portal/runtime/admission and final canonical checks.
 */
export async function readRollingDeploymentRegistration(preparation,options={}){
 const {contextGuard,onProgress}=options;
 const emit=(state,error)=>observeRollingSetup(onProgress,{stage:'deployment-initialization',step:'prepared-registration',state,code:state==='failed'?rollingSetupErrorCode(error):null});
 try{
  check(typeof contextGuard==='function');
  assertRollingDeploymentPreparation(preparation,options);
  emit('started');await contextGuard();
  const result=preparedDeployments.get(preparation).result;
  // Recheck provenance after the await, before handing detached SDK values to
  // a second owner. No caller-supplied record or time-based validity is accepted.
  assertRollingDeploymentPreparation(preparation,options);
  const registration=Object.freeze({node:result.node,deployment:deploymentRecord(result.deployment)});
  emit('complete');return registration;
 }catch(error){emit('failed',error);throw error;}
}

/** Authenticate the same-page handoff, then refresh mutable authorities. Class
 * derivation, immutable storage and portal runtime verification are reusable only
 * while their original observations remain canonical. Current class identities,
 * portal admission and node readiness are freshly checked for each consumer.
 */
export async function consumeRollingDeploymentPreparation(preparation,{sdk,ethers,config,boardArtifact,privateFeeArtifact,node,proofsEnabled=true,contextGuard,onProgress}={}){
 let provider;
 try{
  const state=preparedDeployments.get(preparation);
  check(typeof contextGuard==='function');
  assertRollingDeploymentPreparation(preparation,{sdk,ethers,config,boardArtifact,privateFeeArtifact,node,proofsEnabled});
  await contextGuard();const cached=await state.pending;
  check(node===cached.node&&sdk.isTrustedPrivateNode(node));
  const deployment=cached.deployment,network=deployment.network;
  provider=new ethers.JsonRpcProvider(state.fixed.config.network.ethRpcUrl);
  const emit=state=>observeRollingSetup(onProgress,{stage:'deployment-initialization',step:'prepared-refresh',state,code:null});
  emit('started');
  const [head,l1Head]=await together([
   ()=>node.getBlockData('checkpointed'),()=>provider.getBlock('latest'),
   async()=>{const again=await provider.getBlock(deployment.ethereumCheckpoint.number);check(again?.hash===deployment.ethereumCheckpoint.hash);},
   async()=>{const again=await node.getBlockData(deployment.checkpoint.number);check(again?.blockHash?.toString()===deployment.checkpoint.hash&&Number(again?.header?.globalVariables?.blockNumber)===deployment.checkpoint.number);},
   async()=>check(same((await provider.getNetwork()).chainId,network.chainId)),
  ]);
  const blockNumber=Number(head?.header?.globalVariables?.blockNumber),blockHash=head?.blockHash?.toString();
  check(Number.isSafeInteger(blockNumber)&&blockNumber>=deployment.checkpoint.number&&hash(blockHash)&&Number.isSafeInteger(l1Head?.number)&&l1Head.number>=deployment.ethereumCheckpoint.number&&hash(l1Head.hash));
  const reference={hash:blockHash},portal=new ethers.Contract(deployment.portal,abi,provider);
  const checkInstance=async previous=>{
   const instance=await node.getContract(previous.address,reference);
   check(instance&&same(instance.address,previous.address)&&same(instance.currentContractClassId,previous.instance.currentContractClassId)&&same(instance.originalContractClassId,previous.instance.originalContractClassId)&&same(await sdk.computeContractAddressFromInstance(instance),previous.address)&&same(instance.deployer,previous.instance.deployer));return instance;
  };
  const [boardInstance,feeInstance]=await together([
   ()=>checkInstance(deployment.board),()=>checkInstance(deployment.privateFee),
   async()=>check(await portal.depositsEnabled({blockTag:l1Head.number})===true),
  ]);
  await together([
   ()=>sdk.inspectTrustedNode(node,{expectedNetworkScope:network,proofsEnabled}),
   async()=>check((await provider.getBlock(l1Head.number))?.hash===l1Head.hash),
   async()=>{const again=await node.getBlockData(blockNumber);check(again?.blockHash?.toString()===blockHash&&Number(again?.header?.globalVariables?.blockNumber)===blockNumber);},
  ]);
  await contextGuard();emit('complete');
  return Object.freeze({node,deployment:deploymentRecord({...deployment,board:{...deployment.board,instance:boardInstance},privateFee:{...deployment.privateFee,instance:feeInstance},checkpoint:{number:blockNumber,hash:blockHash},ethereumCheckpoint:{number:l1Head.number,hash:l1Head.hash}})});
 }catch(error){observeRollingSetup(onProgress,{stage:'deployment-initialization',step:'prepared-refresh',state:'failed',code:rollingSetupErrorCode(error)});throw failure();}
 finally{try{provider?.destroy();}catch{/* Read-only provider disposal grants no authority. */}}
}

// Existing callers keep the same result and must supply an already branded
// node. Without factory ownership, both readiness observations are retained.
export async function verifyRollingDeployment(options){return (await verifyDeployment(options)).deployment;}

async function verifyDeployment({sdk,node,ethers,config,boardArtifact,privateFeeArtifact,contextGuard,proofsEnabled=true,onProgress},preparation){
 let provider,firstFailure;
 const emit=(step,state,error)=>observeRollingSetup(onProgress,{stage:'deployment-initialization',step,state,code:state==='failed'?rollingSetupErrorCode(error):null});
 const stage=async(step,operation)=>{
  emit(step,'started');
  try{const value=await operation();emit(step,'complete');return value;}
  catch(error){firstFailure??={step,error};throw error;}
 };
 try{
  const {b,f,network,endpoint}=await stage('config',async()=>{
   check(typeof contextGuard==='function'&&typeof proofsEnabled==='boolean');await contextGuard();
   if(!preparation)check(sdk.isTrustedPrivateNode(node));
   const c=JSON.parse(JSON.stringify(config)),n=c.network,b=c.board,f=c.privateFee;
   check(n&&b&&f&&canonical(n.rollupAddress,40)&&canonical(b.portalAddress,40)&&canonical(b.contractAddress,64)&&canonical(f.contractAddress,64));
   check(typeof n.chainId==='string'&&typeof n.rollupVersion==='string'&&/^[1-9][0-9]{0,19}$/.test(n.chainId)&&/^[1-9][0-9]{0,9}$/.test(n.rollupVersion));
   const network={chainId:String(n.chainId),version:String(n.rollupVersion),rollup:n.rollupAddress};check(proofsEnabled||network.chainId==='31337');
   const endpoint=new URL(n.ethRpcUrl);
   check(!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash&&(endpoint.protocol==='https:'||network.chainId==='31337'&&endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)));
   sdk.normalizePrivateFeeGasSettings(f.gasSettings);return {b,f,network,endpoint};
  });
  const {base,portalSlot}=await stage('artifact-layout',async()=>{
   check(boardArtifact.name==='RollingBoard');const slot=name=>number(boardArtifact.storageLayout[name].slot);
   const base=slot('config'),portalSlot=slot('portal_address');check(portalSlot===1n&&base===portalSlot+2n&&slot('deposits')===base+11n);return {base,portalSlot};
  });
  const address=new sdk.AztecAddress(new sdk.Fr(BigInt(b.contractAddress)));
  // Public metadata and cryptographic artifact derivation are independent of
  // one another. The owned factory's successful inspection is the prerequisite
  // for using its exact returned client; the final fresh inspection remains.
  const ready=stage('node-readiness',async()=>{
   if(preparation){
    check(preparation.query&&typeof sdk.createTrustedPrivateNode==='function');
    node=await sdk.createTrustedPrivateNode({...preparation.query,expectedNetworkScope:network,proofsEnabled,readinessTier:'checkpointed'});
    check(sdk.isTrustedPrivateNode(node));
   }else await sdk.inspectTrustedNode(node,{expectedNetworkScope:network,proofsEnabled});
   return node;
  });
  const boardClass=stage('board-class',async()=>(await sdk.getContractClassFromArtifact(boardArtifact)).id);
  const checkpoint=stage('checkpoint',async()=>{
   const client=await ready,head=await client.getBlockData('checkpointed');
   const number=Number(head?.header?.globalVariables?.blockNumber),hashValue=head?.blockHash?.toString();
   check(Number.isSafeInteger(number)&&number>0&&hash(hashValue));return {number,hash:hashValue,reference:{hash:hashValue}};
  });
  const boardInstance=stage('board-instance',async()=>{
   const [classId,anchor,client]=await together([()=>boardClass,()=>checkpoint,()=>ready]);
   const published=await client.getContract(address,anchor.reference);
   check(published&&same(published.address,address)&&same(published.currentContractClassId,classId)&&same(published.originalContractClassId,classId)&&same(await sdk.computeContractAddressFromInstance(published),address));return published;
  });
  const publicConfig=stage('public-config',async()=>{
   const [anchor,client]=await together([()=>checkpoint,()=>ready]);
   const values=await together([portalSlot,...Array.from({length:10},(_,i)=>base+BigInt(i))].map(slot=>()=>client.getPublicStorageAt(anchor.reference,address,new sdk.Fr(slot))));
   const [portal,chain,rollup,version,min,max,baseCooldown,kMultiplier,censorWindow,maxSaveUp,deployer]=values.map(number);
   const published=await boardInstance;
   check(same(portal,b.portalAddress)&&same(chain,network.chainId)&&same(rollup,network.rollup)&&same(version,network.version)&&deployer>0n&&same(deployer,published.deployer));
   const economics=Object.fromEntries(Object.entries({minDeposit:min,maxDeposit:max,baseCooldown,kMultiplier,censorWindow,maxSaveUp}).map(([key,value])=>[key,String(value)]));
   return {chain,rollup,version,min,max,economics};
  });
  const commitment=stage('config-commitment',async()=>{
   const {economics}=await publicConfig;
   const encoded=encodeConfigCommitment({l1ChainId:network.chainId,rollupAddress:network.rollup,rollupVersion:network.version,boardAddress:b.contractAddress},economics);
   return sdk.sha256ToField({toBuffer:()=>encoded});
  });
  const fee=stage('fee-instance',async()=>{
   const [canonicalFee,anchor,client]=await together([
    ()=>sdk.derivePrivateFeeInstance(privateFeeArtifact),()=>checkpoint,()=>ready,
   ]);
   check(same(canonicalFee.address,f.contractAddress));
   const instance=await client.getContract(canonicalFee.address,anchor.reference);
   check(instance&&same(instance.address,canonicalFee.address)&&same(instance.currentContractClassId,canonicalFee.currentContractClassId)&&same(instance.originalContractClassId,canonicalFee.originalContractClassId)&&same(await sdk.computeContractAddressFromInstance(instance),canonicalFee.address));return {canonicalFee,instance};
  });
  const l1=stage('l1-context',async()=>{
   provider=new ethers.JsonRpcProvider(endpoint.href);
   const [l1Network,head]=await together([()=>provider.getNetwork(),()=>provider.getBlock('latest')]);
   check(same(l1Network.chainId,network.chainId)&&Number.isSafeInteger(head?.number)&&head.number>=0&&hash(head.hash));return head;
  });
  const portal=stage('portal-code-and-immutables',async()=>{
   const head=await l1,contract=new ethers.Contract(b.portalAddress,abi,provider);
   // Start the anchored L1 reads without waiting for L2 config/commitment work.
   const [code,immutableValues,depositsEnabled,values,configHash,contracts]=await together([
    ()=>provider.getCode(b.portalAddress,head.number),
    ()=>together(immutableNames.map(name=>()=>contract[name]({blockTag:head.number}))),
    ()=>contract.depositsEnabled({blockTag:head.number}),()=>publicConfig,()=>commitment,
    async()=>{const client=await ready;return client.getL1ContractAddresses();},
   ]);
   check(same(contracts.rollupAddress,network.rollup)&&depositsEnabled===true);
   const {min,max,rollup,version,chain}=values;
   const expected={MIN_DEPOSIT:min,MAX_DEPOSIT:max,L2_CONTRACT:BigInt(b.contractAddress),ROLLUP:rollup,INBOX:number(contracts.inboxAddress),OUTBOX:number(contracts.outboxAddress),VERSION:version,L1_CHAIN_ID:chain,CONFIG_HASH:number(configHash)};
   check(expected.INBOX>0n&&expected.OUTBOX>0n&&immutableValues.every((value,index)=>same(value,expected[immutableNames[index]])));
   check(sdk.verifyPortalRuntime(code,sdk.portalRuntimeMetadata,expected)===true);
  });
  const [,anchor,published,values,configHash,privateFee,l1Head]=await together([
   ()=>boardClass,()=>checkpoint,()=>boardInstance,()=>publicConfig,()=>commitment,()=>fee,()=>l1,()=>ready,()=>portal,
  ]);
  const canonicalRecheck=stage('canonical-recheck',async()=>{
   const [l1Again,l2Again]=await together([()=>provider.getBlock(l1Head.number),()=>node.getBlockData(anchor.number)]);
   check(l1Again?.hash===l1Head.hash&&l2Again?.blockHash?.toString()===anchor.hash&&Number(l2Again?.header?.globalVariables?.blockNumber)===anchor.number);
  });
  await stage('final-readiness-and-context',async()=>{
   await together([()=>canonicalRecheck,()=>sdk.inspectTrustedNode(node,{expectedNetworkScope:network,proofsEnabled})]);
   // Account/page context is checked after all in-flight verification has drained.
   await contextGuard();
  });
  const deployment=deploymentRecord({board:{address,artifact:boardArtifact,instance:published},network,portal:b.portalAddress,
   privateFee:{address:privateFee.canonicalFee.address,artifact:privateFeeArtifact,instance:privateFee.instance,gasSettings:f.gasSettings},proofsEnabled,economics:values.economics,
   checkpoint:{number:anchor.number,hash:anchor.hash},ethereumCheckpoint:{number:l1Head.number,hash:l1Head.hash},configHash:configHash.toString()});
  return Object.freeze({node,deployment});
 }catch(error){const reported=firstFailure??{step:'config',error};emit(reported.step,'failed',reported.error);throw failure();}
 finally{try{provider?.destroy();}catch{/* Disposing a read-only provider cannot authorize any action. */}}
}
