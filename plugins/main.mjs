import {prepareNativeRuntime} from '../prover/runtime.mjs';
import {BackendType,Barretenberg,BarretenbergSync} from '@aztec-foundation/bb.js';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getFeeJuiceBalance} from '@aztec-labs/aztec.js/utils';
import {createAztecNodeClient} from '../shared/aztec-node-client.mjs';
import {EmbeddedWallet} from '@aztec-labs/wallets/embedded';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {GrumpkinScalar} from '@aztec-labs/foundation/curves/grumpkin';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {validateDescriptor} from './protocol.mjs';
import {aztecBoardPort,rollingBoardPort} from './aztec.mjs';
import {aztecEscrowPort} from './escrow.mjs';
import {startEscrowService,runPrivateBokRequest} from './escrow-service.mjs';
import {meteredModel} from './metering.mjs';
import {veniceMeteredProvider} from './venice-metered.mjs';
import {createAgent} from './agent.mjs';
import {rollingConversation} from './conversation.mjs';
import {bokRunner} from './bok.mjs';
import {veniceClient} from './venice.mjs';
import {githubApi,githubToolbox} from './github-tools.mjs';
import {threadRepositories} from './thread-repositories.mjs';
import {createIsolatedExecution} from './isolated-execution.mjs';
import {createStaticPublication} from './static-publication.mjs';
import {provingEnabledForNode} from '../shared/proving-policy.mjs';

/** Composition root: only this module knows which implementations are selected. */
export async function runHostedService({config,env=process.env,onError=error=>console.error('Plugin action failed:',error.message)}) {
  assert(config.applicationProfile===undefined||config.applicationProfile==='rolling','Unsupported hosted application profile');
  if(config.applicationProfile==='rolling')return runRollingHostedService({config,env,onError});
  if(!env.VENICE_WALLET_PRIVATE_KEY)throw Error('Configure VENICE_WALLET_PRIVATE_KEY locally before starting the service');
  const repository=env.PLUGIN_REPOSITORY||config.repository,api=githubApi({token:env.GITHUB_TOKEN}),allowWrites=env.PLUGIN_GITHUB_WRITES==='true';
  if(allowWrites&&!env.GITHUB_TOKEN)throw Error('Configure GITHUB_TOKEN before enabling repository writes');
  const toolbox=githubToolbox({repository,api,allowWrites,draftPr:env.PLUGIN_GITHUB_DRAFT!=='false'});
  await api('GET','/repos/'+repository);
  if(config.operatorFile)config={...config,operator:JSON.parse(await fs.readFile(config.operatorFile,'utf8'))};
  const descriptor=validateDescriptor(config.descriptor,config.descriptor.scope);
  const node=createAztecNodeClient(config.nodeUrl),info=await node.getNodeInfo();
  if(config.development&&String(info.l1ChainId)!=='31337')throw Error('Development mode requires a disposable local chain');
  if(String(info.l1ChainId)!==descriptor.scope.chainId||String(info.rollupVersion)!==descriptor.scope.rollupVersion||String(info.l1ContractAddresses.rollupAddress).toLowerCase()!==descriptor.scope.rollupAddress)throw Error('Service network identity mismatch');
  const proverEnabled=provingEnabledForNode(info);
  const wallet=await EmbeddedWallet.create(node,{ephemeral:true,pxe:{proverEnabled,...(proverEnabled?{proverOrOptions:{backend:BackendType.NativeUnixSocket,...await prepareNativeRuntime({}),threads:1}}:{})}});
  let server,closed=false;
  async function close(){if(closed)return;closed=true;const failures=[];for(const cleanup of [()=>server?.close(),()=>wallet.stop()]){try{await cleanup();}catch(error){failures.push(error);}}if(failures.length)throw new AggregateError(failures,'Service cleanup failed');}
  try{
    const account=await wallet.createSchnorrInitializerlessAccount(Fr.fromString(config.operator.secret),Fr.fromString(config.operator.salt),GrumpkinScalar.fromString(config.operator.signingKey),'bok');
    if(await getFeeJuiceBalance(account.address,node)===0n)throw Error('Fund the operator public Fee Juice account before starting the service');
    const boardArtifact=loadContractArtifact(JSON.parse(await fs.readFile(new URL('../apps/src/billboard/billboard_artifact.json',import.meta.url),'utf8')));
    const adapterArtifact=loadContractArtifact(JSON.parse(await fs.readFile(new URL('./adapter_artifact.json',import.meta.url),'utf8')));
    const board=await aztecBoardPort({node,wallet,scope:descriptor.scope,boardArtifact,adapterArtifact,operator:account.address,finality:config.development?'checkpointed':'finalized'});
    const escrow=await aztecEscrowPort({node,wallet,address:descriptor.scope.receiver,artifact:adapterArtifact,operator:account.address,development:config.development});
    const providerAdapter=veniceMeteredProvider({client:veniceClient({privateKey:env.VENICE_WALLET_PRIVATE_KEY}),model:env.VENICE_MODEL||undefined,autoTopUp:env.VENICE_AUTO_TOP_UP==='true',maxTopUpUsd:Number(env.VENICE_MAX_TOP_UP_USD||5)});
    server=await startEscrowService({descriptor,escrow,board,host:config.host??'127.0.0.1',port:config.port??8787,onError,run:async(postId,text)=>{
      const model=meteredModel({provider:providerAdapter,escrow,postId});
      const agent=bokRunner({runner:createAgent({model,toolbox,instructions:'You are bok, the development assistant for this board. Work on the configured repository and answer the explicit request.'})});
      try {
      const result=await agent.run({id:postId,postId,text});
      const current=await board.readRequest(postId);
      if(!current||current.flagged||!current.enabled)await model.closeWithoutReply();else await model.finish(result.replyText);
      } catch(error) {
        try { await model.closeWithoutReply(); } catch(cleanup) { throw new AggregateError([error,cleanup],'Invocation failed; chain status needs attention'); }
        throw error;
      }
    }});
    return {address:server.address,close};
  }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Service startup and cleanup failed');}throw error;}
}

/** A crash leaves the existing lock for explicit reconciliation. No stale-lock
 * takeover; cleanup removes only the inode this process exclusively created. */
export async function acquireHostedLease(directory){
 const lockPath=path.join(directory,'hosted.lock'),lock=await fs.open(lockPath,'wx',0o600);
 let identity,closed=false;
 const same=stat=>stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===identity.dev&&stat.ino===identity.ino;
 async function close(){
  if(closed)return;closed=true;
  try{if(identity){const current=await fs.lstat(lockPath);assert(same(current),'Hosted lease path changed');await fs.unlink(lockPath);}}
  finally{await lock.close();}
 }
 try{identity=await lock.stat();await lock.writeFile(String(process.pid));await lock.sync();}
 catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Hosted lease acquisition failed');}throw error;}
 return {async assertHeld(){assert(!closed,'Hosted lease closed');assert(same(await fs.lstat(lockPath)),'Hosted lease path changed');},close};
}

/** Decode private actor material in memory; neither parser text nor raw SDK
 * diagnostics may escape this boundary into CLI errors or service logs. */
export async function readHostedActor(config){
 try{
  const actor=config.operatorFile?JSON.parse(await fs.readFile(config.operatorFile,'utf8')):config.operator;
  assert(actor&&Object.getPrototypeOf(actor)===Object.prototype);
  const fields=Object.getOwnPropertyDescriptors(actor);assert(Reflect.ownKeys(fields).every(k=>['address','secret','salt','signingKey'].includes(k)));
  for(const key of ['secret','salt','signingKey'])assert(fields[key]&&Object.hasOwn(fields[key],'value')&&typeof fields[key].value==='string'&&/^0x[0-9a-f]{64}$/.test(fields[key].value));
  return {secret:Fr.fromString(fields.secret.value),salt:Fr.fromString(fields.salt.value),signingKey:GrumpkinScalar.fromString(fields.signingKey.value)};
 }catch{throw Error('Invalid private operator configuration');}
}

/** Keep the existing authenticated index/decoder, selecting the production
 * finalized tip at its existing checkpointed-tip read boundary. */
export function hostedIndexNode(node,development){
 assert.equal(typeof development,'boolean');
 return new Proxy(node,{get(target,key){
  if(key==='getBlockData')return (number,...args)=>target.getBlockData(!development&&number==='checkpointed'?'finalized':number,...args);
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
}

/** Explicit Rolling composition; the legacy account escrow is never selected. */
export async function runRollingHostedService({config,env=process.env,onError=()=>{}}){
 const [{rollingOperatorConfig,rollingPxeOptions,operatorNodeFetch,fileState},{loadRollingArtifacts},{jsonStringify},
  {getContractClassFromArtifact},{createPrivateBokEscrow},{createRollingPersistentPublicIndex},{createRollingPublicSqliteStore},{ownRollingPersistentPublicIndex}]=await Promise.all([
  import('./operations.mjs'),import('../prover/rolling-artifacts.mjs'),import('@aztec-labs/foundation/json-rpc'),
  import('@aztec-labs/stdlib/contract'),import('./private-bok-escrow.mjs'),import('../shared/rolling/public-index.mjs'),
  import('../shared/rolling/public-sqlite.mjs'),import('../scripts/rolling-public-server.mjs')]);
 const descriptor=validateDescriptor(config.descriptor,config.descriptor.scope);assert.equal(descriptor.applicationProfile,'rolling');
 assert.equal(config.applicationProfile,'rolling');assert.equal(typeof config.development,'boolean');
 const scope=descriptor.scope;
 // Validate public network/endpoint data before reading actor keys or provider setup.
 rollingOperatorConfig({applicationProfile:'rolling',development:config.development,nodeUrl:config.nodeUrl,ethereumUrl:config.ethereumUrl,
  chainId:scope.chainId,rollupVersion:scope.rollupVersion,rollupAddress:scope.rollupAddress,boardAddress:scope.boardAddress,operatorAddress:config.operatorAddress});
 assert(typeof config.pluginId==='string'&&/^0x[0-9a-f]{64}$/.test(config.pluginId)&&BigInt(config.pluginId)>0n);
 assert(typeof config.stateDirectory==='string'&&path.isAbsolute(config.stateDirectory));
 await fs.mkdir(config.stateDirectory,{recursive:true,mode:0o700});
 assert.equal(await fs.realpath(config.stateDirectory),config.stateDirectory);const directory=await fs.lstat(config.stateDirectory);
 assert(directory.isDirectory()&&!directory.isSymbolicLink()&&(directory.mode&0o777)===0o700);
 const lease=await acquireHostedLease(config.stateDirectory);let wallet,index,server,artifactsServer,closing;
 function close(){return closing??=(async()=>{const errors=[];for(const fn of [()=>server?.close(),()=>artifactsServer?new Promise(resolve=>{artifactsServer.close(resolve);artifactsServer.closeAllConnections();}):undefined,()=>wallet?.stop(),()=>index?.close(),()=>lease.close()])try{await fn();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Rolling hosted cleanup failed');})();}

 try{
  const key=env.PLUGIN_QUERY_API_KEY;if(!config.development)assert(typeof key==='string','Operator query capability required');
  const node=createAztecNodeClient(config.nodeUrl,{fetch:operatorNodeFetch({endpoint:config.nodeUrl,key,serialize:jsonStringify})});
  const info=await node.getNodeInfo();assert.equal(info.realProofs,!config.development);assert.equal(String(info.l1ChainId),scope.chainId);assert.equal(String(info.rollupVersion),scope.rollupVersion);assert.equal(String(info.l1ContractAddresses.rollupAddress).toLowerCase(),scope.rollupAddress);
  const actor=await readHostedActor(config);
  const pxe=await rollingPxeOptions(config.development,async()=>({backend:BackendType.NativeUnixSocket,...await prepareNativeRuntime({}),threads:1}));
  wallet=await EmbeddedWallet.create(node,{ephemeral:true,pxe});
  const account=await wallet.createSchnorrInitializerlessAccount(actor.secret,actor.salt,actor.signingKey,'public Bok operator');
  assert.equal(String(account.address),config.operatorAddress);assert(await getFeeJuiceBalance(account.address,node)>0n);
  const [boardRaw,bokRaw]=loadRollingArtifacts(),boardArtifact=loadContractArtifact(boardRaw),artifact=loadContractArtifact(bokRaw);
  const indexScope={chainId:scope.chainId,rollupVersion:scope.rollupVersion,rollupAddress:scope.rollupAddress,boardAddress:scope.boardAddress,classId:String((await getContractClassFromArtifact(boardArtifact)).id)};
  const storage=createRollingPublicSqliteStore(path.join(config.stateDirectory,'public-index'),{scope:indexScope});
  try{index=ownRollingPersistentPublicIndex(await createRollingPersistentPublicIndex({node:hostedIndexNode(node,config.development),artifact:boardArtifact,scope:indexScope,deployment:config.deployment,storage}),storage);}catch(error){storage.close();throw error;}
  // A request owns its own billing journal. Only shared wallet operations and
  // canonical index snapshots serialize; unrelated model calls may overlap.
  const lane=()=>{let tail=Promise.resolve();return fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};};
  const indexed=lane(),walletOperation=lane(),generatedExecution=lane(),publicationOperation=lane();
  const rawBoard=await rollingBoardPort({node,index,scope,boardArtifact,pluginId:config.pluginId,development:config.development});
  const board={pending:(...args)=>indexed(()=>rawBoard.pending(...args)),readRequest:(...args)=>indexed(()=>rawBoard.readRequest(...args))};
  const rawConversation=rollingConversation({index,node,scope:indexScope,development:config.development});
  const conversation={load:input=>indexed(async()=>{const history=await rawConversation.load(input);return {...history,assertCurrent:()=>indexed(()=>history.assertCurrent())};})};
  const summaryModelId=env.VENICE_SUMMARY_MODEL||config.summaryModelId;
  assert(typeof summaryModelId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(summaryModelId),'Cheaper summary model required');
  assert(env.VENICE_WALLET_PRIVATE_KEY,'Provider key required');
  assert(env.VENICE_AUTO_TOP_UP!=='true','Fund provider credits separately before hosted request execution');
  const repository=env.PLUGIN_REPOSITORY||config.repository,api=githubApi({token:env.GITHUB_TOKEN}),allowWrites=env.PLUGIN_GITHUB_WRITES==='true';
  assert(!allowWrites||env.GITHUB_TOKEN);
  const workspaceRoot=path.join(config.stateDirectory,'thread-repositories'),outputRoot=path.join(config.stateDirectory,'static-artifacts');
  for(const directory of [workspaceRoot,outputRoot])await fs.mkdir(directory,{recursive:true,mode:0o700});
  const execution=createIsolatedExecution({...config.staticExecution,workspaceRoot,outputRoot});
  await execution.assertAvailable();
  const publicationRoot=path.join(config.stateDirectory,'static-publication');await fs.mkdir(publicationRoot,{recursive:true,mode:0o700});
  assert(config.staticPublication&&typeof config.staticPublication.origin==='string'&&typeof config.staticPublication.boardOrigin==='string','Separate artifact origin required');
  const publication=await createStaticPublication({directory:publicationRoot,artifactRoot:outputRoot,origin:config.staticPublication.origin,boardOrigin:config.staticPublication.boardOrigin,development:config.development});
  artifactsServer=http.createServer((req,res)=>{void publication.handle(req,res);});
  await new Promise((resolve,reject)=>{artifactsServer.once('error',reject);artifactsServer.listen(config.staticPublication.port??8788,config.staticPublication.host??'127.0.0.1',resolve);});
  const repositories=threadRepositories({directory:workspaceRoot,namespace:JSON.stringify({scope,pluginId:config.pluginId}),lease,startEmpty:true,
   validateRevision:input=>generatedExecution(()=>execution.execute(input)),onAccepted:receipt=>publicationOperation(()=>publication.publish(receipt))});
  const toolbox=githubToolbox({repository,api,repositories});await api('GET','/repos/'+repository);
  const provider=veniceMeteredProvider({client:veniceClient({privateKey:env.VENICE_WALLET_PRIVATE_KEY}),model:env.VENICE_MODEL||undefined,autoTopUp:false});
  server=await startEscrowService({descriptor,profile:'rolling',concurrency:2,board,host:config.host??'127.0.0.1',port:config.port??8787,
   onError:()=>onError(Error('Rolling hosted request requires reconciliation')),run:async request=>{
    await lease.assertHeld();const id=createHash('sha256').update(JSON.stringify({scope,requestId:request.requestId,target:request.target})).digest('hex');
    const store=await fileState(path.join(config.stateDirectory,id+'.json'));
    const rawEscrow=await walletOperation(()=>createPrivateBokEscrow({node,wallet,artifact,address:scope.receiver,operator:account.address.toString(),board:scope.boardAddress,network:scope,
     requestId:request.requestId,target:request.target,store,lease,development:config.development,proofMode:config.development?'disabled':'real'}));
    const escrow=new Proxy(rawEscrow,{get(target,key){const value=Reflect.get(target,key);return typeof value==='function'?(...args)=>walletOperation(()=>value(...args)):value;}});
    return runPrivateBokRequest({request,board,escrow,store,provider,conversation,limits:config.limits,runAgent:async({model,conversation,...input})=>
     bokRunner({runner:createAgent({model,toolbox,conversation,summaryModelId,maxCalls:config.limits?.maxCalls??8,instructions:'You are bok, the board development assistant. Answer the explicit request. Each thread has its own persistent source repository. For static applications, provide package.json with a build script, explicit Node tests, and dist output. Use check_workspace to run isolated tests and builds and repair failures before answering. The runtime has Node and no network or dependency installation. Host validation saves accepted revisions; tools cannot alter permissions or deploy.'})}).run(input)});
   }});
  return {address:server.address,artifactAddress:artifactsServer.address(),close,
   setPublicationDisabled:input=>publicationOperation(async()=>{await lease.assertHeld();return publication.setDisabled(input);})};
 }catch{let cleanupFailed=false;try{await close();}catch{cleanupFailed=true;}throw Error(cleanupFailed?'Rolling hosted startup failed; owned cleanup requires attention':'Rolling hosted startup failed');}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let config;try{config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));}catch{throw Error('Invalid service configuration');}
  const service=await runHostedService({config});console.log('Plugin service listening on',service.address);
  let closing=false;async function close(){if(closing)return;closing=true;try{await service.close();}finally{await Barretenberg.destroySingleton();BarretenbergSync.destroySingleton();}}
  const shutdown=()=>close().then(()=>process.exit(0),()=>process.exit(1));
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
