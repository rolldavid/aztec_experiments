// TEST ONLY. Parent owns C01/node/L1 and the 540s/4GiB supervisor. This consumer
// owns sequential setup/application scopes of the existing miner (never overlapping),
// two HTTP adapters and its private wallet state.
// No fake node, proof, freshness, receipt, event or production factory is injected.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createConnection} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const discard=()=>{};
const silent=Object.assign(discard,Object.fromEntries(['trace','debug','verbose','info','warn','error','fatal'].map(k=>[k,discard])),
  {level:'silent',isLevelEnabled:()=>false,getBindings:()=>({}),createChild:()=>silent});
const PERSONAL=['feePayer','publicCallSenders','publicCallTargets','publicCallCalldata','publicWriteSlots','publicWriteValues','publicLogContracts','publicLogFields'];
const SOURCES=['scripts/testing/rolling-application-fixture.mjs','scripts/testing/scenarios.mjs','scripts/testing/scenario-flows.mjs',
  'scripts/c01-real-node.mjs','scripts/c01-board-flow.mjs','scripts/c01-deposit-flow.mjs','scripts/c01-client-mining.mjs',
  'scripts/w01-private-fee-flow.mjs','scripts/w01-unfunded-wallet.mjs','scripts/w01-private-funding.mjs',
  'shared/sdk-entry.mjs','shared/private-pxe.mjs','shared/trusted-private-node.mjs','shared/routed-kernel-prover.mjs','shared/remote-prover-client.mjs',
  'shared/rolling/application.mjs','shared/rolling/public-events.mjs','shared/rolling/public-projection.mjs',
  'shared/private-fee-client.mjs','shared/private-fee-estimation.mjs','shared/private-fee-simulation.mjs','shared/l2-journal.mjs','shared/journal-record.mjs',
  'shared/sdk-store.mjs','shared/transaction-outcomes.mjs','apps/src/billboard/user/engine.js','apps/src/billboard/user/transaction-journal-store.mjs',
  'prover/service.mjs','prover/server.mjs','prover/private-query.mjs','prover/catalog.mjs','prover/rolling-artifacts.mjs','prover/rolling-artifacts.json',
  'apps/src/billboard/private_fee_artifact.json',
  'scripts/testing/rolling-public-acceptance.mjs','shared/rolling/public-index.mjs','shared/public-feed-file-storage.mjs','shared/public-feed-storage.mjs',
  'scripts/rolling-public-server.mjs','apps/rolling/start.mjs','apps/rolling/reader-client.mjs',
  'toolchain.json','package-lock.json'];

// Small pure acceptance seams; unit fixtures are explicitly development-only.
export function assertRollingApplicationViews(projection,{nameId,subboardId,rootId,replyId}) {
  const root=projection.post(rootId),reply=projection.post(replyId);
  assert.equal(projection.postCount,2);
  assert(root&&reply);assert.equal(root.text,'A real application root');assert.equal(reply.text,'A real application reply');
  assert.equal(root.record.name_id,nameId);assert.equal(reply.record.name_id,nameId);
  assert.equal(root.record.subboard,subboardId);assert.equal(reply.record.subboard,subboardId);
  assert.equal(root.record.kind,'1');assert.equal(reply.record.kind,'1');
  assert.equal(root.record.parent,'0');assert.equal(root.record.root,rootId);
  assert.equal(reply.record.parent,rootId);assert.equal(reply.record.root,rootId);
  assert.equal(root.bot,null);assert.equal(reply.bot,null);assert.equal(reply.likes,'1');
  const thread=projection.thread(rootId,{limit:100}),profile=projection.profile(nameId,{limit:100}),directory=projection.directory({limit:100});
  assert.deepEqual(thread.posts.map(p=>p.id),[rootId,replyId]);assert.equal(thread.nextCursor,null);
  assert.deepEqual(profile.posts.map(p=>p.id),[replyId,rootId]);assert.deepEqual(profile.identity,{id:nameId,first:'River',last:'Stone'});
  assert.equal(directory.boards.length,1);assert.equal(directory.boards[0].id,subboardId);
  assert.equal(directory.boards[0].slug,'application-test');assert.equal(directory.boards[0].rejected,false);
  assert.equal(directory.boards[0].mainRules,'No threats.');assert.equal(directory.boards[0].rules,'Be helpful.');
  return {feed:projection.feed({limit:100}),thread,profile,directory};
}
export function assertRollingPublicFootprint(row) {
  assert.equal(row.sharedFeePayer,true);
  for(const category of PERSONAL)assert.equal(row.rolePresence[category].author,false,category);
  assert(row.counts.publicDataWrites<=63);
}
export async function closeRollingResources(steps,observation) {
  const errors=[];
  for(const [name,close] of steps)try{await close();observation[name]=true;}catch(error){observation[name]=false;errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Rolling fixture cleanup failed');
}
// Public, bounded diagnostic only. It never supplies a clock override, accepts a
// failed readiness gate, or serializes an SDK error/response into evidence.
export async function observeRollingReadiness({node,network,proofsEnabled,endpoint},inspect) {
  const row={wallSeconds:Math.floor(Date.now()/1000),timestampAvailable:false,inspectorCode:'UNOBSERVED'};
  try{
    const stamp=await node.getSyncedL1Timestamp();
    if(typeof stamp==='bigint'&&stamp>=0n&&stamp<=BigInt(Number.MAX_SAFE_INTEGER)){
      row.syncedL1Timestamp=String(stamp);row.wallSeconds=Math.floor(Date.now()/1000);
      row.lagSeconds=row.wallSeconds-Number(stamp);row.timestampAvailable=true;
    }
  }catch{}
  try{await inspect(node,{expectedNetworkScope:network,proofsEnabled});row.inspectorCode='READY';}
  catch(error){const code=error?.code;row.inspectorCode=['BB_TRUSTED_NODE_CONFIG','BB_TRUSTED_NODE_IDENTITY','BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_UNSYNCED','BB_TRUSTED_NODE_STALE'].includes(code)?code:'UNCLASSIFIED';}
  if(endpoint)try{
    const url=new URL(endpoint);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert(!url.username&&!url.password);
    const response=await fetch(new URL('/healthz',url),{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(3000)});
    row.health={status:response.status};
    const reader=response.body.getReader();let length=0;const chunks=[];
    try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>16384)throw Error('Bounded health');chunks.push(value);}}
    finally{await reader.cancel();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(typeof value.ready==='boolean')row.health.ready=value.ready;
    if(['real','disabled'].includes(value.proofs))row.health.proofs=value.proofs;
    if(typeof value.query?.enabled==='boolean')row.health.queryEnabled=value.query.enabled;
    if(typeof value.query?.ready==='boolean')row.health.queryReady=value.query.ready;
    if(['busy','unavailable'].includes(value.query?.reason))row.health.queryReason=value.query.reason;
  }catch{row.healthUnavailable=true;}
  return row;
}
async function closedPort(port) {
  await new Promise((resolve,reject)=>{
    const socket=createConnection({host:'127.0.0.1',port});
    socket.setTimeout(2000,()=>{socket.destroy();reject(Error('Listener cleanup unknown'));});
    socket.once('connect',()=>{socket.destroy();reject(Error('Listener still open'));});
    socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(Error('Listener cleanup unknown')));
  });
}
async function startNodeRpc(node) {
  const {createNamespacedSafeJsonRpcServer}=await import('@aztec-labs/foundation/json-rpc/server');
  const {AztecNodeApiSchema}=await import('@aztec-labs/stdlib/interfaces/client');
  const rpc=createNamespacedSafeJsonRpcServer({aztec:[node,AztecNodeApiSchema]},
    {maxBatchSize:8,maxBodySizeBytes:8*1024*1024,corsAllowedOrigins:[],log:silent});
  const callback=rpc.getApp().callback();
  const server=http.createServer((req,res)=>{
    if(req.method!=='POST'||req.url!=='/'||req.headers.origin!==undefined||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){res.writeHead(403);res.end();return;}
    callback(req,res);
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(error){server.close();server.closeAllConnections();throw error;}
  const port=server.address().port;
  return {url:`http://127.0.0.1:${port}/`,close:async()=>{
    await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});await closedPort(port);
  }};
}

// Native ESM cannot import the browser aggregate's initSync WASM re-exports.
// Compose only real pinned exports; all provenance is still owned by the actual
// production factories, not by this fixture facade.
export async function loadRollingFixtureSDK() {
  const modules=await Promise.all([
    import('@aztec-labs/aztec.js/contracts'),import('@aztec-labs/aztec.js/fields'),
    import('@aztec-labs/aztec.js/addresses'),import('@aztec-labs/aztec.js/abi'),
    import('@aztec-labs/aztec.js/wallet'),import('@aztec-labs/wallet-sdk/base-wallet'),
    import('@aztec-labs/accounts/schnorr'),import('@aztec-labs/stdlib/keys'),
    import('@aztec-labs/stdlib/contract'),import('@aztec-labs/stdlib/tx'),import('@aztec-labs/stdlib/gas'),
    import('../../shared/private-pxe.mjs'),import('../../shared/trusted-private-node.mjs'),
    import('../../shared/sdk-store.mjs'),import('../../shared/private-fee-client.mjs'),
    import('../../shared/private-fee-estimation.mjs'),import('../../shared/l2-journal.mjs'),
    import('../../shared/transaction-outcomes.mjs'),
  ]);
  return Object.assign({},...modules);
}

export async function runRollingApplicationFixture(ctx) {
  const {ROOT,assertNodeVersion,assertAztecPackages}=await import('../toolchain.mjs');
  const directory=path.join(ROOT,'execution/evidence/G06','application-port-'+randomUUID());
  await fs.mkdir(directory,{mode:0o700});
  const report={schemaVersion:1,passed:false,stage:'preflight',transactions:[],cleanup:{},
    scope:'Actual funded application port and authenticated public projection; human threaded reply, no composite Bok action',
    networkProofs:false,controlledPortalSettlement:true,privacyAcceptance:'Public-field equality checks only; independent privacy qualification remains',
    storage:{pxe:'Actual SDK store with CLI in-memory IndexedDB adaptation; no browser persistence claim',journal:'Real authenticated encrypted file journals; reopen measured'},
    sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
  const save=()=>fs.writeFile(path.join(directory,'observation.json'),json(report),{mode:0o600});
  const mark=async stage=>{if(ctx.applicationDeadlineAt!==undefined)assert(Date.now()<ctx.applicationDeadlineAt,'Parent campaign budget exhausted');report.stage=stage;ctx.mark?.('rolling-application:'+stage);await save();};
  const sourceBinding=async()=>Object.fromEntries(await Promise.all(SOURCES.map(async name=>[name,sha(await fs.readFile(path.join(ROOT,name)))])));
  let fees,pxe,store,rpc,service,failure,restoreIndexedDB,owner,appWallet,journal,locked=false;
  let feeTotal=0n;const accounted=new Set();
  const accountFee=(hash,fee)=>{if(!accounted.has(hash)){assert(BigInt(fee)>0n);feeTotal+=BigInt(fee);accounted.add(hash);}report.actualHumanFees=String(feeTotal);};
  try {
    assertNodeVersion();assertAztecPackages();assert.equal(ctx.preparation.boardProfile,'rolling');
    assert(ctx.settlement.passed&&ctx.settlement.activation.depositsEnabled);
    assert(path.isAbsolute(ctx.directory));
    assert(Number.isSafeInteger(ctx.applicationDeadlineAt)&&ctx.applicationDeadlineAt>Date.now(),'Explicit remaining parent campaign deadline required');
    const {applicationProofsEnabled}=await import('./proof-policy.mjs');
    const real=applicationProofsEnabled();report.applicationProofs=real;report.proofMode=real?'real':'proofs-disabled';
    const info=await ctx.node.getNodeInfo();assert.equal(info.l1ChainId,31337);assert.equal(info.realProofs,real);
    const network={chainId:'31337',version:String(info.rollupVersion),rollup:String(ctx.rollupAddress).toLowerCase()};
    assert.equal(String(info.l1ContractAddresses.rollupAddress).toLowerCase(),network.rollup);report.network=network;
    report.sourceHashes=await sourceBinding();
    const {checkedC01BoardArtifact}=await import('../c01-board-flow.mjs');
    const checked=await checkedC01BoardArtifact('rolling');report.artifactHashes=checked.artifactHashes;
    const {ARTIFACT,MANIFEST,buildInputs}=await import('../../experiments/private-bok/build.mjs');
    const bokBytes=await fs.readFile(ARTIFACT),manifest=JSON.parse(await fs.readFile(MANIFEST));
    assert.deepEqual(manifest.inputs,buildInputs());assert.equal(sha(bokBytes),manifest.artifactSha256);
    report.bokArtifactSha256=manifest.artifactSha256;report.bokBuildInputs=manifest.inputs;
    const sdkModule=await loadRollingFixtureSDK();
    await import('../../apps/src/billboard/user/engine.js');
    const routing=globalThis.BillboardPrivateFeeRouting;
    const sdk={...sdkModule,isPrivateWalletForNode:routing.isPrivateWalletForNode};
    const {Fr,Contract,TxHash,loadContractArtifact}=sdk;
    const {TxStatus}=await import('@aztec-labs/stdlib/tx');
    const bokRaw=JSON.parse(bokBytes);assert.equal(bokRaw.name,'PrivateBok');assert.equal(bokRaw.transpiled,true);
    assert(bokRaw.functions.filter(fn=>fn.custom_attributes?.includes('abi_private')).every(fn=>fn.verification_key));
    const {prepareW01PrivateFees}=await import('../w01-private-fee-flow.mjs');
    const {depositAndClaimC01}=await import('../c01-deposit-flow.mjs');
    const {withC01ClientMining}=await import('../c01-client-mining.mjs');
    const {drainT04Checkpoints,createT04CheckpointScope}=await import('../u01-browser-flow.mjs');
    const {proveApplicationAction}=await import('../prove-application-action.mjs');
    const {startProverService}=await import('../../prover/service.mjs');
    const {createFileJournalStorage}=await import('../../apps/src/billboard/user/transaction-journal-store.mjs');
    const {createRollingApplication}=await import('../../shared/rolling/application.mjs');
    const {createRollingEventDecoder,isRollingEvent}=await import('../../shared/rolling/public-events.mjs');
    const {createRollingProjection}=await import('../../shared/rolling/public-projection.mjs');
    const {classifyT03PublicFootprint}=await import('../t03-public-footprint.mjs');
    let claim,bokInstance;report.setupMining={};
    await withC01ClientMining({rpcUrl:ctx.config.l1RpcUrls[0],dateProvider:ctx.dateProvider,observation:report.setupMining},async mineL1=>{
      await mark('private-fee-funding');
      fees=await prepareW01PrivateFees({...ctx,rpcUrl:ctx.config.l1RpcUrls[0],mineL1,standalone:true,
        fundingDirectory:path.join(ctx.directory,'rolling-app-funding'),reportStage:ctx.mark});
      report.privateFees=fees;owner=fees.authorAccount.address;
      const setupWallet=fees.browserFixture.wallet;
      await mark('collateral-claim');
      claim=await depositAndClaimC01({...ctx,node:setupWallet.aztecNode,rpcUrl:ctx.config.l1RpcUrls[0],mineL1,reportStage:ctx.mark,
        authorAccount:fees.authorAccount,claimWallet:setupWallet,payerMode:'private',privateFeeAction:fees.privateFeeAction});
      report.collateral=claim;accountFee(claim.claimTxHash,claim.fee);await save();assert(claim.passed);
      await mark('deploy-unused-bok-scope');
      const operator=ctx.preparation.account.address;
      const deployment=Contract.deploy(setupWallet,loadContractArtifact(bokRaw),[ctx.instance.address,operator,new Fr(31337n),new Fr(BigInt(info.rollupVersion))],
        'init',{salt:Fr.random(),deployer:operator});
      bokInstance=await deployment.getInstance();
      const {tx:bokTx}=await proveApplicationAction({wallet:setupWallet,owner:operator,interaction:deployment,payerMode:'genesis'});
      const bokHash=bokTx.getTxHash();
      const intent=await fs.open(path.join(directory,'bok-deployment-intent.json'),'wx',0o600);
      try{await intent.writeFile(json({txHash:String(bokHash),purpose:'Actual constructor-only prover allowlist scope; unused by five actions'}));await intent.sync();}finally{await intent.close();}
      await ctx.node.sendTx(bokTx);
      let receipt;const includeDeadline=Math.min(Date.now()+60000,ctx.applicationDeadlineAt);
      do{receipt=await ctx.node.getTxReceipt(bokHash);assert.notEqual(receipt.status,TxStatus.DROPPED);
        if(['checkpointed','proven','finalized'].includes(receipt.status))break;await mineL1();}while(Date.now()<includeDeadline);
      assert(['checkpointed','proven','finalized'].includes(receipt.status));assert.equal(receipt.executionResult,'success');
      assert.equal(String((await ctx.node.getBlockData(receipt.blockNumber)).blockHash),String(receipt.blockHash));
      const actualBok=await ctx.node.getContract(bokInstance.address);assert(actualBok);
      assert.equal(String(actualBok.currentContractClassId),String(bokInstance.currentContractClassId));
      report.bok={address:String(bokInstance.address),txHash:String(bokHash),used:false};await save();
      await mark('collateral-eligibility');
      const checkpoints=createT04CheckpointScope(ctx.node.getSequencer()),eligibilityDeadline=Math.min(Date.now()+90000,ctx.applicationDeadlineAt);
      try{checkpoints.enable();
        while((await setupWallet.pxe.getSyncedBlockHeader()).globalVariables.timestamp<claim.claim.nextAllowedTime){
          assert(Date.now()<eligibilityDeadline);await mineL1();await setupWallet.pxe.sync();
        }
        report.eligibility=await drainT04Checkpoints({node:ctx.node,l1Client:ctx.l1Client,rollupAddress:network.rollup,checkpoints,deadline:eligibilityDeadline});
      }finally{checkpoints.restore();}
    });
    assert.equal(report.setupMining.clientMining.stopped,true);assert.equal(report.setupMining.clientMining.passed,true);
    // Catch up AFTER controlled READY and funding setup; the setup miner has stopped. There is no mining loop
    // during this wait and no change to production clocks or maxLagSeconds.
    await mark('real-wall-clock-readiness');
    const clockStart=Date.now(),clockDeadline=Math.min(clockStart+110000,ctx.applicationDeadlineAt);
    report.clock={initialWallSeconds:Math.floor(clockStart/1000),deadlineAt:clockDeadline};
    await ctx.node.getSequencer().pause();
    try {
      report.clock.initialSyncedL1Timestamp=String(await ctx.node.getSyncedL1Timestamp());await save();
      while(BigInt(Math.floor(Date.now()/1000))<await ctx.node.getSyncedL1Timestamp()) {
        assert(Date.now()<clockDeadline,'Fixture clock catchup exceeded remaining bounded budget');await sleep(250);
      }
      report.clock.ready=await sdk.inspectTrustedNode(ctx.node,{expectedNetworkScope:network,proofsEnabled:real});
      report.clock.elapsedMs=Date.now()-clockStart;await save();
    }finally{await ctx.node.getSequencer().start();}
    report.applicationMining={};
    await withC01ClientMining({rpcUrl:ctx.config.l1RpcUrls[0],dateProvider:ctx.dateProvider,observation:report.applicationMining,mode:'real-wall',deadlineAt:ctx.applicationDeadlineAt},async mineL1=>{
      report.readiness=[];
      let endpoint;
      const observe=async phase=>{report.readiness.push({phase,...await observeRollingReadiness({node:ctx.node,network,proofsEnabled:real,endpoint},sdk.inspectTrustedNode)});await save();};
      try{
      await observe('after-first-wall-mine');
      await mark('node-rpc-startup');
      rpc=await startNodeRpc(ctx.node);
      await mark('trusted-service-startup');
      service=await startProverService({host:'127.0.0.1',port:0,board:String(ctx.instance.address),chainId:31337,rollupVersion:info.rollupVersion,
        applicationProfile:'rolling',privateBokAddress:String(bokInstance.address),privateFeeAddress:String(fees.browserFixture.instance.address),
        proofs:real?'real':'disabled',origins:[],threads:1,queueDirectory:ctx.directory,crsPath:process.env.CRS_PATH,
        queryNode:{url:rpc.url,rollupAddress:network.rollup,maxLagSeconds:120}});
      endpoint=`http://127.0.0.1:${service.address.port}`;
      await observe('adapters-started');
      await mark('trusted-client-construction');
      // HTTP is authorized only for this asserted chain31337 loopback fixture;
      // transport permission is independent of the actual real-proof policy.
      const node=await sdk.createTrustedPrivateNode({url:endpoint+'/v1/node',expectedNetworkScope:network,proofsEnabled:real,allowLocalDev:true});
      await observe('trusted-client-created');
      await mark('application-pxe');
      // Existing CLI storage adaptation: account keys remain in memory. This is
      // not a browser persistence/recovery qualification or a fake chain adapter.
      const idb=await import('fake-indexeddb');
      const keys=Object.keys(idb).filter(k=>k.startsWith('IDB')||k==='indexedDB');
      const previous=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
      restoreIndexedDB=()=>{for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];};
      for(const k of keys)Object.defineProperty(globalThis,k,{value:k==='indexedDB'?new idb.IDBFactory():idb[k],writable:true,configurable:true});
      store=await sdk.openPXEStore({l1ChainId:31337,rollupAddress:network.rollup,accountAddress:String(owner),dataDirectory:'rolling-application-test'},undefined,silent);
      pxe=await sdk.createPXE(node,{proverEnabled:true,autoSync:false,syncChainTip:'checkpointed'},
        {store,remoteProver:{url:endpoint,board:String(ctx.instance.address),timeoutMs:120000,pollMs:100}});
      const account=fees.authorAccount,accountContract=new sdk.SchnorrInitializerlessAccountContract(account.signingKey);
      const derived=await sdk.deriveKeys(account.secret),accountArtifact=await accountContract.getContractArtifact();
      const accountInstance=await sdk.getContractInstanceFromInstantiationParams(accountArtifact,{salt:account.salt,publicKeys:derived.publicKeys,
        constructorArtifact:undefined,constructorArgs:undefined,immutablesHash:await accountContract.getImmutablesHash()});
      assert(accountInstance.address.equals(owner));
      await pxe.registerAccount(derived,await sdk.computePartialAddress(accountInstance));
      await pxe.registerContractClass(accountArtifact);await pxe.registerContract(accountInstance);
      await pxe.registerContractClass(checked.artifact);await pxe.registerContract(ctx.instance);
      await pxe.registerContractClass(fees.browserFixture.artifact);await pxe.registerContract(fees.browserFixture.instance);
      await pxe.sync();
      const contextGuard=()=>{assert(!locked,'Fixture session locked');assert.equal(String(owner),String(accountInstance.address));};
      const storageDirectory=path.join(ctx.directory,'rolling-application-journals');
      let privateStore=createFileJournalStorage(storageDirectory);
      const scope={account:String(owner),...network,board:String(ctx.instance.address),portal:ctx.ready.portalAddress.toLowerCase()};
      const journalOptions={walletSecret:account.secret.toString(),walletSalt:account.salt.toString(),scope,Tx:sdk.Tx,node,contextGuard};
      journal=await sdk.createL2Journal({...journalOptions,storage:privateStore});
      appWallet=routing.createAztecWallet(sdk,pxe,node,node,discard,account.secret,{contextGuard,transactionJournal:journal});
      appWallet._accountManager=await sdk.AccountManager.create(appWallet,account.secret,accountContract,{salt:account.salt});
      assert(appWallet._accountManager.address.equals(owner));
      const signingPublicKey=await accountContract.getSigningPublicKey(),constructor=accountArtifact.functions.find(fn=>fn.name==='constructor');
      if(constructor)await new sdk.ContractFunctionInteraction(appWallet,owner,constructor,[signingPublicKey.x,signingPublicKey.y]).simulate({from:owner});
      const portOptions={sdk,deployment:{board:{address:ctx.instance.address,artifact:checked.artifact},network,portal:scope.portal,proofsEnabled:real,
        privateFee:{address:fees.browserFixture.instance.address,artifact:fees.browserFixture.artifact,gasSettings:fees.browserFixture.gas}},
        contextGuard,privateStore,accountSession:{owner,wallet:appWallet,node,journal,walletSecret:journalOptions.walletSecret,walletSalt:journalOptions.walletSalt}};
      let app=createRollingApplication(portOptions);
      assert.equal((await app.readAccountStatus()).status,'fee-ready');
      const decoder=await createRollingEventDecoder({artifact:checked.artifact,scope:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,
        boardAddress:String(ctx.instance.address),classId:String((await sdk.getContractClassFromArtifact(checked.artifact)).id)}});
      const projection=createRollingProjection({isValidatedEvent:isRollingEvent});
      const hashes=[ctx.inclusion.txHash];
      const initialEvents=await decoder.decodeTransaction(ctx.node,hashes[0]);
      assert.equal(initialEvents.length,1);assert.equal(initialEvents[0].type,'MainPolicyPublished');
      report.initialPublicAnchor=initialEvents[0].position;projection.stage(initialEvents).apply();
      const ids={};let lastIntent;
      async function action(input,type) {
        await mark(type);await pxe.sync();
        const row={action:type,startedAt:Date.now(),submission:'not attempted'};report.transactions.push(row);await save();
        const prepared=await app.prepare(input);lastIntent=prepared.intentId;row.maximumFee=prepared.maximumFee;
        row.submission='outcome unknown';await save();
        const result=await app.submitPrepared(prepared.intentId);
        const outcome=await journal.inspectOutcome();assert(outcome?.receipt);
        const receipt=outcome.receipt,effect=await ctx.node.getTxEffect(TxHash.fromString(outcome.txHash));
        Object.assign(row,{txHash:outcome.txHash,status:receipt.status,executionResult:receipt.executionResult,blockNumber:Number(receipt.blockNumber),
          blockHash:String(receipt.blockHash),transactionFee:String(receipt.transactionFee),elapsedMs:Date.now()-row.startedAt});
        accountFee(outcome.txHash,receipt.transactionFee);
        if(effect?.data){row.effectSha256=sha(effect.data.toBuffer());await fs.writeFile(path.join(directory,type+'-effect.bin'),effect.data.toBuffer(),{flag:'wx',mode:0o600});}
        await save(); // Keep actual included fees/effects before semantic acceptance.
        assert.equal(result.status,'confirmed');assert.equal(receipt.executionResult,'success');assert(BigInt(receipt.transactionFee)>0n);
        assert(effect?.data);assert.equal(String(effect.l2BlockHash),String(receipt.blockHash));assert.equal(Number(effect.l2BlockNumber),Number(receipt.blockNumber));
        const saved=await journal.assertCanStart();assert.equal(String(saved.tx.getTxHash()),outcome.txHash);
        row.publicFootprint=classifyT03PublicFootprint({tx:saved.tx,effect:effect.data,roles:{author:owner,sharedPayer:fees.browserFixture.instance.address,board:ctx.instance.address}});
        await save();assertRollingPublicFootprint(row.publicFootprint);
        const events=await decoder.decodeTransaction(ctx.node,outcome.txHash);projection.stage(events).apply();hashes.push(outcome.txHash);
        row.events=events.map(e=>e.type);row.submission='included';await save();return events;
      }
      const registered=await action({type:'name',first:'River',last:'Stone'},'name');
      assert.equal(registered.length,1);assert.equal(registered[0].type,'NameRegistered');ids.nameId=registered[0].payload.name_id;
      const identities=await app.ownedIdentities();assert.deepEqual(identities.identities.map(v=>String(BigInt(v))),[ids.nameId]);assert.equal(identities.nextCursor,null);
      const created=await action({type:'subboard',slug:'application-test',name:'Application test',description:'Real application acceptance',rules:'Be helpful.'},'subboard');
      assert.equal(created.length,1);assert.equal(created[0].type,'SubboardCreated');ids.subboardId=created[0].payload.subboard_id;
      const deposit=String(claim.claim.depositChainId);
      const rootEvents=await action({type:'post',deposit,content:'A real application root',name:ids.nameId,subboard:ids.subboardId},'post');
      assert.equal(rootEvents.length,1);assert.equal(rootEvents[0].type,'PostPublished');ids.rootId=rootEvents[0].payload.id;
      // Wait using real checkpoint production, never mutate the deposit's time.
      const nextTime=(await Contract.at(ctx.instance.address,checked.artifact,appWallet).methods.get_deposit_info(owner,new Fr(BigInt(deposit))).simulate({from:owner})).result;
      assert.equal(nextTime.length,10);
      const replyCheckpoints=createT04CheckpointScope(ctx.node.getSequencer()),replyDeadline=Math.min(Date.now()+90000,ctx.applicationDeadlineAt);
      try{replyCheckpoints.enable();await pxe.sync();while((await pxe.getSyncedBlockHeader()).globalVariables.timestamp<BigInt(nextTime[9])){
        assert(Date.now()<replyDeadline);await mineL1();await pxe.sync();}
        await drainT04Checkpoints({node:ctx.node,l1Client:ctx.l1Client,rollupAddress:network.rollup,checkpoints:replyCheckpoints,deadline:replyDeadline});
      }finally{replyCheckpoints.restore();}
      const replyEvents=await action({type:'reply',deposit,content:'A real application reply',name:ids.nameId,subboard:ids.subboardId,parent:ids.rootId,root:ids.rootId},'reply');
      assert.equal(replyEvents.length,1);assert.equal(replyEvents[0].type,'PostPublished');ids.replyId=replyEvents[0].payload.id;
      const liked=await action({type:'like',post:ids.replyId},'like');assert.equal(liked.length,1);assert.equal(liked[0].type,'LikeChanged');
      report.publicViews=assertRollingApplicationViews(projection,ids);await save();
      await mark('encrypted-journal-reopen');
      const jobsBefore=service.stats().submitted,feeBefore=appWallet._actualFees;
      privateStore=createFileJournalStorage(storageDirectory);journal=await sdk.createL2Journal({...journalOptions,storage:privateStore});
      app=createRollingApplication({...portOptions,privateStore,accountSession:{...portOptions.accountSession,journal}});
      const reconciled=await app.reconcile(lastIntent);assert.equal(reconciled.status,'confirmed');assert.equal(reconciled.txHash,hashes.at(-1));
      assert.equal(service.stats().submitted,jobsBefore);assert.equal(appWallet._actualFees,feeBefore);report.journalReopen={sameHash:true,newProofJobs:0,transactionBytesRetained:true};
      await mark('canonical-projection-rebuild');
      const rebuilt=createRollingProjection({isValidatedEvent:isRollingEvent});
      for(const hash of hashes)rebuilt.stage(await decoder.decodeTransaction(ctx.node,hash)).apply();
      assert.deepEqual(assertRollingApplicationViews(rebuilt,ids),report.publicViews);
      for(const row of report.transactions)assert.equal(String((await ctx.node.getBlockData(row.blockNumber)).blockHash),row.blockHash);
      assert.equal(String((await ctx.node.getBlockData(Number(report.initialPublicAnchor.blockNumber))).blockHash),report.initialPublicAnchor.blockHash);
      report.rebuild={passed:true,canonicalTransactionsRefetched:hashes.length,normalizedCacheTreatedAsAuthority:false};
      await mark('canonical-public-http-reopen');report.publicReader={};await save();
      const {verifyRollingPublicReader}=await import('./rolling-public-acceptance.mjs');
      await verifyRollingPublicReader({node:ctx.node,artifact:checked.artifact,
        scope:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,boardAddress:String(ctx.instance.address),classId:String((await sdk.getContractClassFromArtifact(checked.artifact)).id)},
        deployment:{blockNumber:Number(report.initialPublicAnchor.blockNumber),blockHash:report.initialPublicAnchor.blockHash,txHash:report.initialPublicAnchor.txHash},
        cacheDirectory:path.join(ctx.directory,'rolling-public-index'),ids,deadlineAt:ctx.applicationDeadlineAt,observation:report.publicReader});await save();
      await fees.verify(feeTotal);report.actualHumanFees=String(feeTotal);report.proverJobs=service.stats();
      assert.equal(report.proverJobs.failed,0);assert.equal(report.proverJobs.completed,5);assert.equal(report.proverJobs.submitted,5);
      assert.equal(report.proverJobs.running,false);
      assert.deepEqual(await sourceBinding(),report.sourceHashes);assert.deepEqual(buildInputs(),manifest.inputs);
      report.passed=true;await mark('complete');
      }catch(error){
        // Keep the exact failure; diagnostic failures must not replace it.
        try{await observe('application-failed');}catch{report.readinessIncomplete=true;}
        throw error;
      }
    });
    assert.equal(report.applicationMining.clientMining.stopped,true);assert.equal(report.applicationMining.clientMining.passed,true);
  }catch(error){
    failure=error;report.passed=false;
    // Keep only fixed/public observation schemas. Never raw SDK error/cause/stack.
    report.failure={stage:report.stage,code:['BB_TRUSTED_NODE_CONFIG','BB_TRUSTED_NODE_UNAVAILABLE','BB_TRUSTED_NODE_STALE','BB_TRUSTED_NODE_UNSYNCED','BB_TRUSTED_NODE_IDENTITY','BB_REMOTE_PROVER_TIMEOUT','BB_REMOTE_PROVER_FAILED','ROLLING_FEE_CHANGED'].includes(error?.code)?error.code:'UNCLASSIFIED'};
    if(error.depositObservation)report.collateral=error.depositObservation;
    if(error.privateFeeObservation)report.privateFees=error.privateFeeObservation;
    // Failed submit can still have consumed a fee. Read-only canonical observation,
    // no replacement, reproof or resend. Never treat this as application success.
    if(journal)try{
      const outcome=await journal.inspectOutcome();
      if(outcome?.receipt){
        const receipt=outcome.receipt;
        report.lastJournalOutcome={txHash:outcome.txHash,outcome:outcome.outcome,transactionFee:String(receipt.transactionFee),
          blockNumber:Number(receipt.blockNumber),blockHash:String(receipt.blockHash)};
        accountFee(outcome.txHash,receipt.transactionFee);await save();
        const {TxHash}=await import('@aztec-labs/stdlib/tx');
        const effect=await ctx.node.getTxEffect(TxHash.fromString(outcome.txHash));
        if(effect?.data&&String(effect.l2BlockHash)===String(receipt.blockHash)&&Number(effect.l2BlockNumber)===Number(receipt.blockNumber)){
          report.lastJournalOutcome.effectSha256=sha(effect.data.toBuffer());
          await fs.writeFile(path.join(directory,'last-journal-effect.bin'),effect.data.toBuffer(),{flag:'wx',mode:0o600});
        }
      }
    }catch{report.failureEvidenceAvailability='incomplete';}
  }finally{
    locked=true;
    try{await closeRollingResources([
      ...(pxe?[['applicationPXE',()=>pxe.stop()]]:store?[['applicationStore',()=>store.close()]]:[]),
      ...(fees?[['fundingWallet',()=>fees.close()]]:[]),
      ...(service?[['proverAndQuery',async()=>{const port=service.address.port;await service.close();await closedPort(port);}]]:[]),
      ...(rpc?[['nodeRPC',()=>rpc.close()]]:[]),
      ...(restoreIndexedDB?[['indexedDBGlobals',restoreIndexedDB]]:[]),
    ],report.cleanup);}catch(error){report.passed=false;failure=failure?new AggregateError([failure,error],'Rolling fixture and cleanup failed'):error;}
    try{await save();}catch(error){report.passed=false;failure=failure?new AggregateError([failure,error],'Rolling evidence failed'):error;}
  }
  if(failure){failure.rollingApplicationObservation=report;throw failure;}
  return report;
}
