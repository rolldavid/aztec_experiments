// Trusted test harness extraction of rolling-application-fixture's actual actor
// construction. Parent owns verified artifacts/deployment, global IndexedDB
// adaptation, funding, shared node/prover/miner, deadlines and evidence redaction.
// This private handle MUST NOT be serialized into campaign evidence.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createFileJournalStorage} from '../../apps/src/billboard/user/transaction-journal-store.mjs';
import {createRollingApplication} from '../../shared/rolling/application.mjs';
import {createSynchronizedRollingApplication} from '../../shared/rolling/synchronized-application.mjs';
const leases=new Set();
const fail=()=>Object.assign(Error('Rolling actor is unavailable.'),{code:'ROLLING_ACTOR_CONTEXT'});
const discard=()=>{};
const quiet=Object.freeze({trace:discard,debug:discard,verbose:discard,info:discard,warn:discard,error:discard,fatal:discard,
 level:'silent',module:'rolling-actor',isLevelEnabled:()=>false,createChild:()=>quiet,getBindings:()=>({})});

export async function createRollingApplicationActor({sdk,routing,node,endpoint,network,proofsEnabled,board,fees,portal,
 storageDirectory,dataDirectory,log=discard,externalActivity}){
 assert(sdk.isTrustedPrivateNode(node));assert.equal(typeof proofsEnabled,'boolean');
 assert.equal(typeof externalActivity,'function');assert.equal(typeof log,'function');
 assert(path.isAbsolute(storageDirectory));assert(typeof dataDirectory==='string'&&dataDirectory.length>0);
 const url=new URL(endpoint);assert(!url.username&&!url.password&&!url.search&&!url.hash);
 assert(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)&&String(network.chainId)==='31337'));
 const account=fees.authorAccount,owner=account.address,secret=account.secret,salt=account.salt,signingKey=account.signingKey;
 const ownerText=String(owner),capturedNetwork=structuredClone(network),fee=fees.browserFixture;
 const scope={account:ownerText,...capturedNetwork,board:String(board.instance.address),portal:portal.toLowerCase()};
 const leaseKeys=['journal:'+path.resolve(storageDirectory),'pxe:'+dataDirectory];
 assert(leaseKeys.every(key=>!leases.has(key)),'Actor storage is already in use');leaseKeys.forEach(key=>leases.add(key));
 let store,pxe,wallet,journal,app,closed=false,closing,busy;
 let authWitnesses=0,walletSubmissions=0,lastExternal={proofJobs:0,transportSends:0};
 const contextGuard=()=>{
  if(closed||account.secret!==secret||account.salt!==salt||account.signingKey!==signingKey||String(account.address)!==ownerText||!sdk.isTrustedPrivateNode(node))throw fail();
  if(pxe&&!sdk.isPrivatePXEForNode(pxe,node))throw fail();
  if(wallet&&(wallet.aztecNode!==node||wallet.pxe!==pxe||!routing.isPrivateWalletForNode(wallet,node)))throw fail();
 };
 function activity(){
  const value=externalActivity();assert.deepEqual(Object.keys(value).sort(),['proofJobs','transportSends']);
  const result={};for(const key of ['proofJobs','transportSends']){const n=value[key];assert(Number.isSafeInteger(n)&&n>=lastExternal[key]);result[key]=n;}
  lastExternal=result;return {authWitnesses,proofJobs:result.proofJobs,walletSubmissions,transportSends:result.transportSends};
 }
 async function exclusive(fn){contextGuard();if(busy)throw fail();const work=Promise.resolve().then(()=>{contextGuard();return fn();});busy=work;try{return await work;}finally{if(busy===work)busy=undefined;}}
 async function dispose(){
  if(pxe){try{await pxe.stop();pxe=undefined;store=undefined;}catch(error){try{if(store){await store.close();store=undefined;}}catch(cleanup){throw new AggregateError([error,cleanup],'Actor cleanup failed');}throw error;}}
  else if(store){await store.close();store=undefined;}
  leaseKeys.forEach(key=>leases.delete(key));
 }
 const journalOptions={walletSecret:String(secret),walletSalt:String(salt),scope,Tx:sdk.Tx,node,contextGuard};
 const deployment={board:{address:board.instance.address,artifact:board.artifact},network:capturedNetwork,portal:scope.portal,proofsEnabled,
  privateFee:{address:fee.instance.address,artifact:fee.artifact,gasSettings:fee.gas}};
 async function rebuild(existingJournal){
  contextGuard();const privateStore=createFileJournalStorage(storageDirectory);
  const nextJournal=existingJournal??await sdk.createL2Journal({...journalOptions,storage:privateStore});contextGuard();
  const next=createRollingApplication({sdk:{...sdk,isPrivateWalletForNode:routing.isPrivateWalletForNode},deployment,contextGuard,privateStore,
   accountSession:{owner,wallet,node,journal:nextJournal,walletSecret:journalOptions.walletSecret,walletSalt:journalOptions.walletSalt}});
  app=createSynchronizedRollingApplication({application:next,synchronize:pxe.sync.bind(pxe),contextGuard});
  journal=nextJournal;wallet._transactionJournal=journal;
 }
 try{
  activity();await sdk.inspectTrustedNode(node,{expectedNetworkScope:capturedNetwork,proofsEnabled});contextGuard();
  store=await sdk.openPXEStore({l1ChainId:Number(capturedNetwork.chainId),rollupAddress:capturedNetwork.rollup,accountAddress:ownerText,dataDirectory},undefined,quiet);contextGuard();
  pxe=await sdk.createPXE(node,{proverEnabled:true,autoSync:false,syncChainTip:'checkpointed'},
   {store,remoteProver:{url:endpoint,board:scope.board,timeoutMs:120000,pollMs:100}});contextGuard();
  const accountContract=new sdk.SchnorrInitializerlessAccountContract(signingKey),originalProvider=accountContract.getAuthWitnessProvider;
  assert.equal(typeof originalProvider,'function');const seen=new WeakSet();
  accountContract.getAuthWitnessProvider=function(...args){contextGuard();const provider=originalProvider.apply(this,args);
   if(!seen.has(provider)){const original=provider.createAuthWit;assert.equal(typeof original,'function');
    provider.createAuthWit=function(...values){contextGuard();assert(authWitnesses<Number.MAX_SAFE_INTEGER);authWitnesses++;return original.apply(this,values);};seen.add(provider);}
   return provider;};
  const derived=await sdk.deriveKeys(secret),artifact=await accountContract.getContractArtifact();contextGuard();
  const instance=await sdk.getContractInstanceFromInstantiationParams(artifact,{salt,publicKeys:derived.publicKeys,
   constructorArtifact:undefined,constructorArgs:undefined,immutablesHash:await accountContract.getImmutablesHash()});contextGuard();
  assert.equal(String(instance.address),ownerText);const partial=await sdk.computePartialAddress(instance);contextGuard();await pxe.registerAccount(derived,partial);
  for(const [a,i]of [[artifact,instance],[board.artifact,board.instance],[fee.artifact,fee.instance]]){contextGuard();await pxe.registerContractClass(a);contextGuard();await pxe.registerContract(i);}
  contextGuard();await pxe.sync();contextGuard();
  journal=await sdk.createL2Journal({...journalOptions,storage:createFileJournalStorage(storageDirectory)});contextGuard();
  wallet=routing.createAztecWallet(sdk,pxe,node,node,log,secret,{contextGuard,transactionJournal:journal});contextGuard();
  const send=wallet.sendTx;assert.equal(typeof send,'function');
  wallet.sendTx=function(...args){contextGuard();assert(walletSubmissions<Number.MAX_SAFE_INTEGER);walletSubmissions++;return send.apply(this,args);};
  wallet._accountManager=await sdk.AccountManager.create(wallet,secret,accountContract,{salt});contextGuard();assert.equal(String(wallet._accountManager.address),ownerText);
  const key=await accountContract.getSigningPublicKey();contextGuard();const constructor=artifact.functions.find(fn=>fn.name==='constructor');
  if(constructor)await new sdk.ContractFunctionInteraction(wallet,owner,constructor,[key.x,key.y]).simulate({from:owner});
  await rebuild(journal);
 }catch(error){closed=true;try{await dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Actor initialization and cleanup failed');}throw error;}
 const application=Object.freeze(Object.fromEntries(Object.keys(app).map(name=>[name,(...args)=>exclusive(()=>app[name](...args))])));
 function close(){if(closing)return closing;closed=true;const pending=busy;
  closing=(async()=>{if(pending)try{await pending;}catch{/* Caller retains the operation failure. */}await dispose();})();return closing;}
 const actor={};Object.defineProperties(actor,{application:{value:application},pxe:{get:()=>pxe},wallet:{value:wallet},journal:{get:()=>journal},owner:{value:owner},
  contextGuard:{value:contextGuard},activity:{value:activity},reopenJournal:{value:()=>exclusive(rebuild)},close:{value:close},
  toJSON:{value:()=>{throw Error('Private actor handles cannot be serialized');}}});return Object.freeze(actor);
}
