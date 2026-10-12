// TEST ONLY. Parent owns C01/node/L1 and the 540s/4GiB supervisor. This consumer
// owns sequential setup/application scopes of the existing miner (never overlapping),
// two HTTP adapters and its private wallet state.
// No fake node, proof, freshness, receipt, event or production factory is injected.
import assert from 'node:assert/strict';
import {classifyT03PublicFootprint} from '../t03-public-footprint.mjs';
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
const SOURCES=['scripts/testing/rolling-wire-campaign.mjs','scripts/testing/rolling-wire-trace.mjs','scripts/testing/rolling-owned-names.mjs','scripts/t03-public-footprint.mjs','scripts/testing/rolling-removed-like.mjs','scripts/testing/rolling-application-actor.mjs','scripts/testing/rolling-account-reactions.mjs','scripts/testing/rolling-social-acceptance.mjs','scripts/testing/rolling-profile-acceptance.mjs','experiments/avatar/raster-fixture.mjs','scripts/prove-application-action.mjs','scripts/testing/rolling-native-artifacts.mjs','scripts/testing/rolling-application-fixture.mjs','scripts/testing/scenarios.mjs','scripts/testing/scenario-flows.mjs',
  'scripts/c01-real-node.mjs','scripts/c01-board-flow.mjs','scripts/c01-deposit-flow.mjs','scripts/c01-client-mining.mjs',
  'scripts/w01-private-fee-flow.mjs','scripts/w01-unfunded-wallet.mjs','scripts/w01-private-funding.mjs',
  'shared/sdk-entry.mjs','shared/private-pxe.mjs','shared/trusted-private-node.mjs','shared/routed-kernel-prover.mjs','shared/remote-prover-client.mjs',
  'shared/rolling/application.mjs','shared/rolling/synchronized-application.mjs','shared/rolling/public-events.mjs','shared/rolling/public-projection.mjs',
  'shared/private-fee-client.mjs','shared/private-fee-estimation.mjs','shared/private-fee-simulation.mjs','shared/l2-journal.mjs','shared/journal-record.mjs',
  'shared/sdk-store.mjs','shared/transaction-outcomes.mjs','apps/src/billboard/user/engine.js','apps/src/billboard/user/transaction-journal-store.mjs',
  'prover/service.mjs','prover/server.mjs','prover/private-query.mjs','prover/catalog.mjs','prover/rolling-artifacts.mjs','prover/rolling-artifacts.json',
  'apps/src/billboard/private_fee_artifact.json',
  'scripts/testing/rolling-public-acceptance.mjs','shared/rolling/public-index.mjs','shared/public-feed-file-storage.mjs','shared/public-feed-storage.mjs',
  'scripts/rolling-public-server.mjs','apps/rolling/start.mjs','apps/rolling/reader-client.mjs',
  'toolchain.json','package-lock.json'];

// Small pure acceptance seams; unit fixtures are explicitly development-only.
export function classifyRollingApplicationFootprint({tx,effect,owner,otherOwner,payer,board}){
  return classifyT03PublicFootprint({tx,effect,roles:{author:owner,...(otherOwner?{otherAuthor:otherOwner}:{}),sharedPayer:payer,board}});
}
export function recordRollingFundingFailure(report,role,observation){
  assert(role===undefined||role==='a'||role==='b');
  assert(observation&&typeof observation==='object');
  const key=role==='a'?'privateFees':role==='b'?'secondPrivateFees':null;
  if(key&&!Object.hasOwn(report,key))report[key]=observation;
  // Never replace completed public funding history when a later role fails.
  report.fundingFailure={role:role??'unattributed',observation};
}
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
  assert.deepEqual(profile.posts.map(p=>p.id),[replyId,rootId]);assert.deepEqual(profile.identity,{id:nameId,first:'River',last:'Stone',profile:{bio:{version:'0',digest:'0',length:'0',text:''},avatar:{version:'0',digest:'0',width:'0',height:'0',length:'0',encoding:'base64',data:'',removal:null}}});
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
export function rollingClockDeadline({now,chainSeconds,campaignDeadlineAt}) {
  assert(Number.isSafeInteger(now)&&Number.isSafeInteger(campaignDeadlineAt)&&campaignDeadlineAt>now);
  assert(typeof chainSeconds==='bigint'&&chainSeconds>=0n&&chainSeconds<=BigInt(Math.floor(Number.MAX_SAFE_INTEGER/1000)));
  // Controlled settlement can lead wall time by more than a fixed 110 seconds.
  // Wait for the measured prerequisite, keeping the absolute campaign limit and
  // 180 seconds of application headroom. Never alter node clocks or freshness.
  const deadline=Math.max(now,Number(chainSeconds)*1000)+2000;
  assert(deadline<=campaignDeadlineAt-180000,'Insufficient campaign budget for natural clock catchup and application');
  return deadline;
}
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
async function startNodeRpc(node,onSend=()=>{}) {
  const {createNamespacedSafeJsonRpcServer}=await import('@aztec-labs/foundation/json-rpc/server');
  const {AztecNodeApiSchema}=await import('@aztec-labs/stdlib/interfaces/client');
  const api=Object.fromEntries(Object.keys(AztecNodeApiSchema).map(name=>[name,(...args)=>{if(name==='sendTx')onSend();return node[name](...args);} ]));
  const rpc=createNamespacedSafeJsonRpcServer({aztec:[api,AztecNodeApiSchema]},
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
    import('@aztec-labs/foundation/crypto/poseidon'),
    import('@aztec-labs/stdlib/contract'),import('@aztec-labs/stdlib/tx'),import('@aztec-labs/stdlib/gas'),
    import('../../shared/private-pxe.mjs'),import('../../shared/trusted-private-node.mjs'),
    import('../../shared/sdk-store.mjs'),import('../../shared/private-fee-client.mjs'),
    import('../../shared/private-fee-estimation.mjs'),import('../../shared/l2-journal.mjs'),
    import('../../shared/transaction-outcomes.mjs'),
  ]);
  return Object.assign({},...modules);
}

export async function runRollingApplicationFixture(ctx,scenario='conversation') {
  assert(['conversation','profiles','anonymous-thread','repost-reactions','account-reactions','owned-names','owned-names-wire','composer'].includes(scenario));
  const composer=scenario==='composer',captureWire=scenario==='owned-names-wire',names=scenario==='owned-names'||captureWire||composer,multi=scenario==='account-reactions'||names,social=['anonymous-thread','repost-reactions','account-reactions'].includes(scenario);
  const {ROOT,assertNodeVersion,assertAztecPackages}=await import('../toolchain.mjs');
  const directory=path.join(ROOT,'execution/evidence/G06','application-port-'+randomUUID());
  await fs.mkdir(directory,{mode:0o700});
  const report={schemaVersion:1,scenario,passed:false,stage:'preflight',transactions:[],cleanup:{},
    scope:names?'Actual separate private accounts registering and recovering readable owned names without publishing owner groups':social?'Actual anonymous social transactions and canonical removal/repost/reaction reconstruction':scenario==='profiles'?'Actual private profile updates and public moderator removal; fixed test moderation decision, no image-model acceptance':'Actual funded application port and authenticated public projection; human threaded reply, no composite Bok action',
    networkProofs:false,controlledPortalSettlement:true,privacyAcceptance:'Public-field equality checks only; independent privacy qualification remains',
    storage:{pxe:'Actual SDK store with CLI in-memory IndexedDB adaptation; no browser persistence claim',journal:'Real authenticated encrypted file journals; reopen measured'},
    sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
  const save=()=>fs.writeFile(path.join(directory,'observation.json'),json(report),{mode:0o600});
  const mark=async stage=>{if(ctx.applicationDeadlineAt!==undefined)assert(Date.now()<ctx.applicationDeadlineAt,'Parent campaign budget exhausted');report.stage=stage;ctx.mark?.('rolling-application:'+stage);await save();};
  const sourceBinding=async()=>Object.fromEntries(await Promise.all(SOURCES.map(async name=>[name,sha(await fs.readFile(path.join(ROOT,name)))])));
  let fees,feesB,actorA,actorB,activeActor,pxe,rpc,service,failure,restoreIndexedDB,nativeArtifacts,owner,appWallet,journal;
  let wire,ordinaryRpc;
  let transportSends=0,feeTotalB=0n,fundingRole;
  let feeTotal=0n;const accounted=new Set();
  const accountFee=(hash,fee,other=false)=>{if(!accounted.has(hash)){assert(BigInt(fee)>0n);if(other)feeTotalB+=BigInt(fee);else feeTotal+=BigInt(fee);accounted.add(hash);}report.actualHumanFees=String(feeTotal+feeTotalB);};
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
    const {installRollingNativeArtifacts}=await import('./rolling-native-artifacts.mjs');
    nativeArtifacts=installRollingNativeArtifacts();report.nativeArtifacts=nativeArtifacts.observation();await save();
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
    const {createRollingEventDecoder,isRollingEvent}=await import('../../shared/rolling/public-events.mjs');
    const {createRollingProjection}=await import('../../shared/rolling/public-projection.mjs');
    let claim,bokInstance;report.setupMining={};
    await withC01ClientMining({rpcUrl:ctx.config.l1RpcUrls[0],dateProvider:ctx.dateProvider,observation:report.setupMining},async mineL1=>{
      await mark('private-fee-funding');
      fundingRole='a';fees=await prepareW01PrivateFees({...ctx,rpcUrl:ctx.config.l1RpcUrls[0],mineL1,standalone:!multi,
        fundingDirectory:path.join(ctx.directory,'rolling-app-funding'),reportStage:ctx.mark});
      report.privateFees=fees;owner=fees.authorAccount.address;
      if(multi){fundingRole='b';feesB=await prepareW01PrivateFees({...ctx,rpcUrl:ctx.config.l1RpcUrls[0],mineL1,standalone:true,fundingDirectory:path.join(ctx.directory,'rolling-app-funding-b'),reportStage:ctx.mark});report.secondPrivateFees=feesB;assert(!feesB.authorAccount.address.equals(owner));assert(feesB.browserFixture.instance.address.equals(fees.browserFixture.instance.address));}
      fundingRole=undefined;const setupWallet=fees.browserFixture.wallet;
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
    const clockStart=Date.now();let clockDeadline;
    report.clock={initialWallSeconds:Math.floor(clockStart/1000)};
    await ctx.node.getSequencer().pause();
    try {
      report.clock.initialSyncedL1Timestamp=String(await ctx.node.getSyncedL1Timestamp());
      clockDeadline=rollingClockDeadline({now:Date.now(),chainSeconds:BigInt(report.clock.initialSyncedL1Timestamp),campaignDeadlineAt:ctx.applicationDeadlineAt});
      report.clock.deadlineAt=clockDeadline;report.clock.applicationReserveMs=180000;await save();
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
      rpc=await startNodeRpc(ctx.node,()=>{assert(transportSends<Number.MAX_SAFE_INTEGER);transportSends++;});
      await mark('trusted-service-startup');
      service=await startProverService({host:'127.0.0.1',port:0,board:String(ctx.instance.address),chainId:31337,rollupVersion:info.rollupVersion,
        applicationProfile:'rolling',privateBokAddress:String(bokInstance.address),privateFeeAddress:String(fees.browserFixture.instance.address),
        proofs:real?'real':'disabled',origins:composer?[ctx.browserControl.origin]:[],threads:1,queueDirectory:ctx.directory,crsPath:process.env.CRS_PATH,
        queryNode:{url:rpc.url,rollupAddress:network.rollup,maxLagSeconds:120}});
      endpoint=`http://127.0.0.1:${service.address.port}`;
      if(captureWire){
        ordinaryRpc=await startNodeRpc(ctx.node);
        const {installRollingWireCampaign}=await import('./rolling-wire-campaign.mjs');
        wire=installRollingWireCampaign({roles:{a:String(owner),b:String(feesB.authorAccount.address)}});
        for(const [label,url]of [['trusted-query',endpoint],['trusted-proof',endpoint],['trusted-upstream',rpc.url],['ordinary-node',ordinaryRpc.url],['public-l1',ctx.config.l1RpcUrls[0]]])wire.registerEndpoint(label,url);
      }
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
      const {createRollingApplicationActor}=await import('./rolling-application-actor.mjs');
      const makeActor=(funding,role,dataDirectory='rolling-application-test-'+role)=>createRollingApplicationActor({sdk,routing,node,endpoint,network,proofsEnabled:real,
        board:{instance:ctx.instance,artifact:checked.artifact},fees:funding,portal:ctx.ready.portalAddress,
        storageDirectory:path.join(ctx.directory,'rolling-application-journals-'+role),dataDirectory,
        log:discard,externalActivity:()=>({proofJobs:service.stats().submitted,transportSends})});
      actorA=await makeActor(fees,'a');activeActor=actorA;
      pxe=actorA.pxe;appWallet=actorA.wallet;journal=actorA.journal;let app=actorA.application;
      assert.equal((await app.readAccountStatus()).status,'fee-ready');
      if(multi){actorB=await makeActor(feesB,'b');const state=await actorB.application.readAccountStatus();assert.equal(state.status,'collateral-pending');assert(BigInt(state.privateFeeCredit)>0n);}
      const decoder=await createRollingEventDecoder({artifact:checked.artifact,scope:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,
        boardAddress:String(ctx.instance.address),classId:String((await sdk.getContractClassFromArtifact(checked.artifact)).id)}});
      const projection=createRollingProjection({isValidatedEvent:isRollingEvent});
      const hashes=[ctx.inclusion.txHash];
      const initialEvents=await decoder.decodeTransaction(ctx.node,hashes[0]);
      assert.equal(initialEvents.length,1);assert.equal(initialEvents[0].type,'MainPolicyPublished');
      report.initialPublicAnchor=initialEvents[0].position;projection.stage(initialEvents).apply();
      const ids={},publicNameIds=[];const actorIntents=new Map();
      async function action(input,type,selected=actorA) {
        activeActor=selected;const app=selected.application,journal=selected.journal;
        await mark(type);
        const row={action:type,startedAt:Date.now(),submission:'not attempted'};report.transactions.push(row);await save();
        const prepared=await app.prepare(input);actorIntents.set(selected,prepared.intentId);row.maximumFee=prepared.maximumFee;
        row.submission='outcome unknown';await save();
        const result=await app.submitPrepared(prepared.intentId);
        const outcome=await journal.inspectOutcome();assert(outcome?.receipt);
        const receipt=outcome.receipt,effect=await ctx.node.getTxEffect(TxHash.fromString(outcome.txHash));
        Object.assign(row,{txHash:outcome.txHash,status:receipt.status,executionResult:receipt.executionResult,blockNumber:Number(receipt.blockNumber),
          blockHash:String(receipt.blockHash),transactionFee:String(receipt.transactionFee),elapsedMs:Date.now()-row.startedAt});
        accountFee(outcome.txHash,receipt.transactionFee,activeActor===actorB);
        if(effect?.data){row.effectSha256=sha(effect.data.toBuffer());await fs.writeFile(path.join(directory,type+'-effect.bin'),effect.data.toBuffer(),{flag:'wx',mode:0o600});}
        await save(); // Keep actual included fees/effects before semantic acceptance.
        assert.equal(result.status,'confirmed');assert.equal(receipt.executionResult,'success');assert(BigInt(receipt.transactionFee)>0n);
        assert(effect?.data);assert.equal(String(effect.l2BlockHash),String(receipt.blockHash));assert.equal(Number(effect.l2BlockNumber),Number(receipt.blockNumber));
        const saved=await journal.assertCanStart();assert.equal(String(saved.tx.getTxHash()),outcome.txHash);
        row.publicFootprint=classifyRollingApplicationFootprint({tx:saved.tx,effect:effect.data,owner,otherOwner:actorB?.owner,payer:fees.browserFixture.instance.address,board:ctx.instance.address});
        await save();assertRollingPublicFootprint(row.publicFootprint);if(actorB)for(const category of PERSONAL)assert.equal(row.publicFootprint.rolePresence[category].otherAuthor,false);
        const events=await decoder.decodeTransaction(ctx.node,outcome.txHash);projection.stage(events).apply();hashes.push(outcome.txHash);
        for(const event of events)if(event.type==='NameRegistered')publicNameIds.push(event.payload.name_id);
        row.events=events.map(e=>e.type);row.submission='included';await save();return events;
      }
      if(!social&&!names){
      const registered=await action({type:'name',first:'River',last:'Stone'},'name');
      assert.equal(registered.length,1);assert.equal(registered[0].type,'NameRegistered');ids.nameId=registered[0].payload.name_id;
      await mark('owned-name-recovery');
      report.ownedNameRecovery={beforeBlock:Number((await pxe.getSyncedBlockHeader()).globalVariables.blockNumber),requiredBlock:report.transactions.at(-1).blockNumber};
      const identities=await app.ownedIdentities();
      Object.assign(report.ownedNameRecovery,{afterBlock:Number((await pxe.getSyncedBlockHeader()).globalVariables.blockNumber),count:identities.identities.length,
        registeredNamePresent:identities.identities.some(v=>String(BigInt(v))===ids.nameId),nextCursor:identities.nextCursor});await save();
      assert(report.ownedNameRecovery.afterBlock>=report.ownedNameRecovery.requiredBlock);
      assert.deepEqual(identities.identities.map(v=>String(BigInt(v))),[ids.nameId]);assert.equal(identities.nextCursor,null);
      assert.deepEqual(identities.records.map(record=>({...record,id:String(BigInt(record.id))})),[{id:ids.nameId,first:'River',last:'Stone'}]);
      report.ownedNameRecovery.readableMetadataRecovered=true;await save();
      }
        async function moderate({kind,id,expectedVersion,mainVersion,localVersion=0,reason}){
          assert(['avatar','post'].includes(kind));await mark(kind+'-moderation');const wallet=fees.browserFixture.wallet,operator=ctx.preparation.account.address;
          assert(!operator.equals(owner));await wallet.pxe.sync();
          const {getFeeJuiceBalance}=await import('@aztec-labs/aztec.js/utils');
          const before=await getFeeJuiceBalance(operator,ctx.node),bytes=Buffer.from(reason),packed=Array(7).fill(0n);
          assert(bytes.length>0&&bytes.length<=217);
          for(let i=0;i<bytes.length;i++)packed[Math.floor(i/31)]|=BigInt(bytes[i])<<BigInt(8*(30-i%31));
          const row={submission:'not attempted',operatorIdentityPublic:true};report[kind+'Moderation']=row;await save();
          const methods=Contract.at(ctx.instance.address,checked.artifact,wallet).methods,reasonFields=packed.map(n=>new Fr(n));
          const interaction=kind==='avatar'?methods.remove_avatar(new Fr(BigInt(id)),expectedVersion,mainVersion,reasonFields,bytes.length):methods.remove_post(new Fr(BigInt(id)),mainVersion,localVersion,reasonFields,bytes.length);
          const {tx}=await proveApplicationAction({wallet,owner:operator,interaction,payerMode:'genesis'}),hash=tx.getTxHash();
          row.txHash=String(hash);row.submission='outcome unknown';
          const intent=await fs.open(path.join(directory,kind+'-moderation-intent.json'),'wx',0o600);
          try{await intent.writeFile(json({txHash:row.txHash,purpose:'Disposable public moderator removal; exactly one send'}));await intent.sync();}finally{await intent.close();}
          await save();await ctx.node.sendTx(tx);
          let receipt;const deadline=Math.min(Date.now()+60000,ctx.applicationDeadlineAt);
          do{receipt=await ctx.node.getTxReceipt(hash);assert.notEqual(receipt.status,TxStatus.DROPPED);
            if(['checkpointed','proven','finalized'].includes(receipt.status))break;await mineL1();}while(Date.now()<deadline);
          Object.assign(row,{status:receipt.status,executionResult:receipt.executionResult,blockNumber:receipt.blockNumber,blockHash:String(receipt.blockHash),transactionFee:String(receipt.transactionFee)});await save();
          assert(['checkpointed','proven','finalized'].includes(receipt.status));
          const effect=await ctx.node.getTxEffect(hash);assert(effect?.data);assert.equal(String(effect.l2BlockHash),String(receipt.blockHash));
          assert.equal(String((await ctx.node.getBlockData(receipt.blockNumber)).blockHash),String(receipt.blockHash));
          await fs.writeFile(path.join(directory,kind+'-moderation-effect.bin'),effect.data.toBuffer(),{flag:'wx',mode:0o600});row.effectSha256=sha(effect.data.toBuffer());
          Object.assign(row,{before:String(before),submission:'included'});await save();
          const after=await getFeeJuiceBalance(operator,ctx.node);
          row.after=String(after);await save();
          // Preserve actual inclusion and paid effects even when execution reverted.
          assert.equal(receipt.executionResult,'success');
          assert.equal(before-after,BigInt(receipt.transactionFee));assert(BigInt(receipt.transactionFee)>0n);
          row.publicFootprint=classifyRollingApplicationFootprint({tx,effect:effect.data,owner,otherOwner:actorB?.owner,payer:fees.browserFixture.instance.address,board:ctx.instance.address});
          for(const category of PERSONAL){assert.equal(row.publicFootprint.rolePresence[category].author,false);if(actorB)assert.equal(row.publicFootprint.rolePresence[category].otherAuthor,false);}
          const events=await decoder.decodeTransaction(ctx.node,String(hash));projection.stage(events).apply();hashes.push(String(hash));row.events=events.map(e=>e.type);await save();return events;
        }
      if(names){
        const {exerciseRollingOwnedNames}=await import('./rolling-owned-names.mjs');
        report.names=await exerciseRollingOwnedNames({actorA,actorB,actionA:(input,label)=>action(input,label,actorA),actionB:(input,label)=>action(input,label,actorB),onPhase:phase=>wire?.setPhase(phase)});
        if(wire){
          await mark('fresh-pxe-owned-name-recovery');
          const started=Date.now(),expected=[await actorA.application.ownedIdentities(),await actorB.application.ownedIdentities()];
          const cipher=async role=>{
            const directory=path.join(ctx.directory,'rolling-application-journals-'+role),files=(await fs.readdir(directory)).sort();
            assert(files.length>0&&files.every(name=>/^[0-9a-f]{64}\.json$/.test(name)));
            return Promise.all(files.map(async name=>[name,sha(await fs.readFile(path.join(directory,name)))]));
          };
          report.coldPXE={passed:false,actors:[],scope:'Fresh IndexedDB PXE namespaces with retained disposable secrets and unchanged encrypted journals; no seed/device/process-cold claim'};
          for(const role of ['a','b']){
            wire.setPhase('recovery-'+role);
            const old=role==='a'?actorA:actorB,other=role==='a'?actorB:actorA,funding=role==='a'?fees:feesB;
            const before=old.activity(),otherBefore=other.activity(),oldPXE=old.pxe,oldJournal=old.journal,oldIntent=actorIntents.get(old),beforeCipher=await cipher(role);
            const dataDirectory='rolling-application-cold-'+role+'-'+randomUUID();
            const identity=sdk.getPXEStoreIdentity({l1ChainId:Number(network.chainId),rollupAddress:network.rollup,accountAddress:String(old.owner),dataDirectory});
            assert(!(await indexedDB.databases()).some(db=>db.name===identity.name));
            await old.close();assert.throws(()=>old.contextGuard());
            const replacement=await makeActor(funding,role,dataDirectory);
            if(role==='a')actorA=replacement;else actorB=replacement;
            activeActor=replacement;actorIntents.delete(old);actorIntents.set(replacement,oldIntent);
            assert(replacement.pxe!==oldPXE&&replacement.journal!==oldJournal);assert.equal(String(replacement.owner),String(old.owner));
            assert((await indexedDB.databases()).some(db=>db.name===identity.name));
            for(const [i,current]of [actorA,actorB].entries()){
              assert.deepEqual(await current.application.ownedIdentities(),expected[i]);
              assert.deepEqual(await current.application.ownedIdentities({cursor:8}),{identities:[],records:[],nextCursor:null});
            }
            const after=replacement.activity();assert.equal(after.walletSubmissions,0);assert.equal(after.proofJobs,before.proofJobs);assert.equal(after.transportSends,before.transportSends);
            assert.deepEqual(other.activity(),otherBefore);assert.deepEqual(await cipher(role),beforeCipher);
            report.coldPXE.actors.push({freshStoreVerified:true,oldActorClosed:true,sameOwner:true,exactNamesRecovered:true,journalCiphertextUnchanged:true,newProofJobs:0,newWalletSubmissions:0,newTransportSends:0,constructorAuthWitnesses:after.authWitnesses});await save();
          }
          pxe=actorA.pxe;appWallet=actorA.wallet;journal=actorA.journal;app=actorA.application;
          report.coldPXE.passed=true;report.coldPXE.elapsedMs=Date.now()-started;await save();
        }
        assert.equal(publicNameIds.length,4);assert.equal(new Set(publicNameIds).size,4);
        report.publicViews=publicNameIds.slice().sort().map(id=>projection.profile(id,{limit:100}));
        const {assertCanonicalOwnedNameProfiles}=await import('./rolling-public-acceptance.mjs');assertCanonicalOwnedNameProfiles(projection,report.publicViews);await save();
      }else if(scenario==='profiles'){
        const {exerciseRollingProfileActions}=await import('./rolling-profile-acceptance.mjs');
        report.profiles=await exerciseRollingProfileActions({nameId:ids.nameId,application:app,action,moderate:args=>moderate({kind:'avatar',id:args.nameId,expectedVersion:args.avatarVersion,...args}),projection});
        report.publicViews=projection.profile(ids.nameId,{limit:100});assert.equal(report.publicViews.posts.length,0);await save();
      }else if(social){
        const {exerciseRollingAnonymousThread,exerciseRollingRepostReactions,captureRollingAnonymousHTTPViews}=await import('./rolling-social-acceptance.mjs');
        const deposit=String(claim.claim.depositChainId);
        async function waitPostAdmission(){
          await pxe.sync();
          const state=(await Contract.at(ctx.instance.address,checked.artifact,appWallet).methods.get_deposit_info(owner,new Fr(BigInt(deposit))).simulate({from:owner})).result;
          assert.equal(state.length,10);
          const checkpoints=createT04CheckpointScope(ctx.node.getSequencer()),deadline=Math.min(Date.now()+90000,ctx.applicationDeadlineAt);
          try{checkpoints.enable();while((await pxe.getSyncedBlockHeader()).globalVariables.timestamp<BigInt(state[9])){
            assert(Date.now()<deadline);await mineL1();await pxe.sync();}
            await drainT04Checkpoints({node:ctx.node,l1Client:ctx.l1Client,rollupAddress:network.rollup,checkpoints,deadline});
          }finally{checkpoints.restore();}
        }
        const options={deposit,action,projection,waitPostAdmission,moderatePost:args=>moderate({kind:'post',id:args.postId,...args})};
        if(multi){
          await waitPostAdmission();const root=await action({type:'post',deposit,name:'0',subboard:'0',content:'One public post, two private accounts.'},'account-reactions-root');
          assert.equal(root.length,1);assert.equal(root[0].type,'PostPublished');const postId=root[0].payload.id;
          const {createRemovedLikeClassifier}=await import('./rolling-removed-like.mjs');
          const isRemovedPostRejection=await createRemovedLikeClassifier({artifact:checked.artifact,boardAddress:ctx.instance.address});
          const actorOptions=actor=>({action:(input,label)=>action(input,label,actor),prepare:async input=>{activeActor=actor;await mark('removed-like-rejection');return actor.application.prepare(input);},activity:actor.activity,isRemovedPostRejection});
          const {exerciseRollingAccountReactions}=await import('./rolling-account-reactions.mjs');
          const result=await exerciseRollingAccountReactions({postId,actorA:actorOptions(actorA),actorB:actorOptions(actorB),moderatePost:options.moderatePost,projection});
          report.social={...result,privateTransactions:6,expectedHTTP:captureRollingAnonymousHTTPViews(projection,[postId],[[postId,[postId]]])};
        }else report.social=await (scenario==='anonymous-thread'?exerciseRollingAnonymousThread:exerciseRollingRepostReactions)(options);
        report.publicViews=report.social.expectedHTTP;await save();
      }else{
      const created=await action({type:'subboard',slug:'application-test',name:'Application test',description:'Real application acceptance',rules:'Be helpful.'},'subboard');
      assert.equal(created.length,1);assert.equal(created[0].type,'SubboardCreated');ids.subboardId=created[0].payload.subboard_id;
      const deposit=String(claim.claim.depositChainId);
      const rootEvents=await action({type:'post',deposit,content:'A real application root',name:ids.nameId,subboard:ids.subboardId},'post');
      assert.equal(rootEvents.length,1);assert.equal(rootEvents[0].type,'PostPublished');ids.rootId=rootEvents[0].payload.id;
      // Wait using real checkpoint production, never mutate the deposit's time.
      await pxe.sync(); // Direct utility below also requires the newly included post anchor.
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
      }
      await mark('encrypted-journal-reopen');
      const jobsBefore=service.stats().submitted;
      report.journalReopen={sameHash:true,newProofJobs:0,transactionBytesRetained:true,actors:[]};
      for(const actor of [actorA,...(actorB?[actorB]:[])]){
        wire?.setPhase(actor===actorA?'recovery-a':'recovery-b');const before=await actor.journal.inspectOutcome(),activity=actor.activity();
        await actor.reopenJournal();const reconciled=await actor.application.reconcile(actorIntents.get(actor));
        assert.equal(reconciled.status,'confirmed');assert.equal(reconciled.txHash,before.txHash);
        assert.deepEqual(actor.activity(),activity);assert((await actor.journal.assertCanStart()).tx);
        report.journalReopen.actors.push({sameHash:true,newProofJobs:0,transactionBytesRetained:true});
      }
      journal=actorA.journal;assert.equal(service.stats().submitted,jobsBefore);
      await mark('canonical-projection-rebuild');
      const rebuilt=createRollingProjection({isValidatedEvent:isRollingEvent});
      for(const hash of hashes)rebuilt.stage(await decoder.decodeTransaction(ctx.node,hash)).apply();
      if(names){const {assertCanonicalOwnedNameProfiles}=await import('./rolling-public-acceptance.mjs');assertCanonicalOwnedNameProfiles(rebuilt,report.publicViews);}
      else if(social){const {assertCanonicalSocialViews}=await import('./rolling-public-acceptance.mjs');assertCanonicalSocialViews(rebuilt,report.social.expectedHTTP);}
      else assert.deepEqual(scenario==='profiles'?rebuilt.profile(ids.nameId,{limit:100}):assertRollingApplicationViews(rebuilt,ids),report.publicViews);
      for(const row of [...report.transactions,...(report.avatarModeration?[report.avatarModeration]:[]),...(report.postModeration?[report.postModeration]:[])])assert.equal(String((await ctx.node.getBlockData(row.blockNumber)).blockHash),row.blockHash);
      assert.equal(String((await ctx.node.getBlockData(Number(report.initialPublicAnchor.blockNumber))).blockHash),report.initialPublicAnchor.blockHash);
      report.rebuild={passed:true,canonicalTransactionsRefetched:hashes.length,normalizedCacheTreatedAsAuthority:false};
      wire?.setPhase('public-read');await mark('canonical-public-http-reopen');report.publicReader={};await save();
      const {verifyRollingPublicReader}=await import('./rolling-public-acceptance.mjs');
      await verifyRollingPublicReader({node:ctx.node,artifact:checked.artifact,
        scope:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,boardAddress:String(ctx.instance.address),classId:String((await sdk.getContractClassFromArtifact(checked.artifact)).id)},
        deployment:{blockNumber:Number(report.initialPublicAnchor.blockNumber),blockHash:report.initialPublicAnchor.blockHash,txHash:report.initialPublicAnchor.txHash},
        cacheDirectory:path.join(ctx.directory,'rolling-public-index'),ids,scenario:names?'owned-names':scenario,wire:wire?{nodeUrl:ordinaryRpc.url,artifactPath:path.join(ROOT,'billboard/target/rolling_contract-RollingBoard.json'),onReader:url=>wire.registerEndpoint('public-reader',url)}:undefined,expectedProfiles:names?report.publicViews:undefined,expectedProfile:report.profiles?.expectedIdentity,expectedHTTP:report.social?.expectedHTTP,deadlineAt:ctx.applicationDeadlineAt,observation:report.publicReader});await save();
      if(composer){
        assert(real,'Genuine browser acceptance requires real proof setup');await mark('production-browser-composer');report.composer={};
        const {runRollingComposerFixture}=await import('./rolling-composer-fixture.mjs');
        try{await runRollingComposerFixture({ctx,actors:[actorA,actorB],fees:[fees,feesB],claim:claim.claim,endpoint,network,artifact:checked.artifact,
          scope:{chainId:network.chainId,rollupVersion:network.version,rollupAddress:network.rollup,boardAddress:String(ctx.instance.address),classId:String((await sdk.getContractClassFromArtifact(checked.artifact)).id)},
          deployment:{blockNumber:Number(report.initialPublicAnchor.blockNumber),blockHash:report.initialPublicAnchor.blockHash,txHash:report.initialPublicAnchor.txHash},service,sendCount:()=>transportSends,observation:report.composer,persist:save,verifyFees:async()=>{
            const bStandalone=BigInt(feesB.standalone.transactionFee);await fees.verify(feeTotal,feesB.browserFixture.fundedAmount-bStandalone-feeTotalB);await feesB.verify(feeTotalB,fees.browserFixture.fundedAmount-feeTotal);
          }});}
        finally{await save();}
      }
      if(multi){const bStandalone=BigInt(feesB.standalone.transactionFee);await fees.verify(feeTotal,feesB.browserFixture.fundedAmount-bStandalone-feeTotalB);await feesB.verify(feeTotalB,fees.browserFixture.fundedAmount-feeTotal);assert.equal(fees.poolBefore,feesB.poolBefore);report.accountFees={a:String(feeTotal),b:String(feeTotalB)};}else await fees.verify(feeTotal);report.actualHumanFees=String(feeTotal+feeTotalB);report.proverJobs=service.stats();
      assert.equal(report.proverJobs.failed,0);if(names){assert.equal(report.proverJobs.completed,4);assert.equal(report.proverJobs.submitted,4);}
      else if(social){const expectedJobs=scenario==='anonymous-thread'?3:multi?6:4;assert.equal(report.proverJobs.completed,expectedJobs);assert.equal(report.proverJobs.submitted,expectedJobs);}
      else{assert.equal(report.proverJobs.completed,5);assert.equal(report.proverJobs.submitted,5);}
      assert.equal(report.proverJobs.running,false);
      nativeArtifacts.verify();report.nativeArtifacts=nativeArtifacts.observation();
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
    if(error.privateFeeObservation)recordRollingFundingFailure(report,fundingRole,error.privateFeeObservation);
    // Failed submit can still have consumed a fee. Read-only canonical observation,
    // no replacement, reproof or resend. Never treat this as application success.
    if(activeActor)try{
      const outcome=await activeActor.journal.inspectOutcome();
      if(outcome?.receipt){
        const receipt=outcome.receipt;
        report.lastJournalOutcome={txHash:outcome.txHash,outcome:outcome.outcome,transactionFee:String(receipt.transactionFee),
          blockNumber:Number(receipt.blockNumber),blockHash:String(receipt.blockHash)};
        accountFee(outcome.txHash,receipt.transactionFee,activeActor===actorB);await save();
        const {TxHash}=await import('@aztec-labs/stdlib/tx');
        const effect=await ctx.node.getTxEffect(TxHash.fromString(outcome.txHash));
        if(effect?.data&&String(effect.l2BlockHash)===String(receipt.blockHash)&&Number(effect.l2BlockNumber)===Number(receipt.blockNumber)){
          report.lastJournalOutcome.effectSha256=sha(effect.data.toBuffer());
          await fs.writeFile(path.join(directory,'last-journal-effect.bin'),effect.data.toBuffer(),{flag:'wx',mode:0o600});
        }
      }
    }catch{report.failureEvidenceAvailability='incomplete';}
  }finally{
    wire?.setPhase('cleanup');
    try{await closeRollingResources([
      ...(actorA?[['applicationActorA',()=>actorA.close()]]:[]),
      ...(actorB?[['applicationActorB',()=>actorB.close()]]:[]),
      ...(fees?[['fundingWallet',()=>fees.close()]]:[]),
      ...(feesB?[['fundingWalletB',()=>feesB.close()]]:[]),
      ...(service?[['proverAndQuery',async()=>{const port=service.address.port;await service.close();await closedPort(port);}]]:[]),
      ...(rpc?[['nodeRPC',()=>rpc.close()]]:[]),
      ...(ordinaryRpc?[['ordinaryRPC',()=>ordinaryRpc.close()]]:[]),
      ...(wire?[['wireCapture',()=>wire.close()]]:[]),
      ...(restoreIndexedDB?[['indexedDBGlobals',restoreIndexedDB]]:[]),
      ...(nativeArtifacts?[['nativeArtifactLoader',()=>{try{nativeArtifacts.close();}finally{report.nativeArtifacts=nativeArtifacts.observation();}}]]:[]),
    ],report.cleanup);}catch(error){report.passed=false;failure=failure?new AggregateError([failure,error],'Rolling fixture and cleanup failed'):error;}
    if(wire){report.wire=wire.snapshot();try{if(!failure){const {assertRollingWireCampaign}=await import('./rolling-wire-campaign.mjs');report.wireAcceptance=assertRollingWireCampaign(report.wire);}}catch(error){report.passed=false;failure=error;}}
    try{await save();}catch(error){report.passed=false;failure=failure?new AggregateError([failure,error],'Rolling evidence failed'):error;}
  }
  if(failure){failure.rollingApplicationObservation=report;throw failure;}
  return report;
}
