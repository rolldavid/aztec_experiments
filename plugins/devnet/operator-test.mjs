// Explicit real-contract operations scenario. No inference/provider billing is claimed.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {Barretenberg,BarretenbergSync} from '@aztec-foundation/bb.js';
import {generateSchnorrAccounts} from '@aztec-labs/accounts/testing';
import {L1FeeJuicePortalManager} from '@aztec-labs/aztec.js/ethereum';
import {createLogger} from '@aztec-labs/foundation/log';
import {Fr} from '@aztec-labs/foundation/curves/bn254';import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {Contract as L2Contract} from '@aztec-labs/aztec.js/contracts';import {NO_FROM} from '@aztec-labs/aztec.js/account';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';import {TxHash,TxStatus} from '@aztec-labs/stdlib/tx';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';import {Contract} from 'ethers';
import {bootstrapPluginDevnet,settleRollingDevelopmentMessage} from './bootstrap.mjs';import {ensureDevelopmentMessageReady} from './network.mjs';
import {operatorCommand} from '../operator.mjs';import {packText,handleField} from '../protocol.mjs';
const focused=process.argv.includes('--focused')||process.env.NODE_TEST_CONTEXT!==undefined;
if(!focused){
if(process.env.PLUGIN_PROOFS!==undefined&&process.env.PLUGIN_PROOFS!=='false')throw Error('Development requires proofs disabled');
const directory=await fs.mkdtemp(path.resolve('.build/plugin-operations-'));
console.log('BROWSER_DIRECTORY',directory);console.log('RESULT_PATH',path.join(directory,'operations-result.json'));
const report={passed:false,scenario:'operator-contract-lifecycle',applicationProofs:false};
let fixture;
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const mark=stage=>{report.stage=stage;console.log('STEP',stage);};
try{
 fixture=await bootstrapPluginDevnet({directory,proofs:report.applicationProofs,onProgress:mark});
 const info=await fixture.net.node.getNodeInfo(),statePath=path.join(directory,'operations.json');
 const actor=a=>({address:String(a.address),secret:String(a.secret),salt:String(a.salt),signingKey:String(a.signingKey)});
 const config={nodeUrl:fixture.net.nodeUrl,ethereumUrl:fixture.net.rpcUrl,chainId:'31337',rollupVersion:String(info.rollupVersion),rollupAddress:String(info.l1ContractAddresses.rollupAddress).toLowerCase(),boardAddress:String(fixture.board.address),operatorAddress:String(fixture.operator.address),operatorFile:path.join(directory,'operator.json'),tokenAddress:(await fixture.token.getAddress()).toLowerCase(),descriptorUrl:'http://127.0.0.1:8792/v1/descriptor',handle:'ops',development:true};
 await fs.writeFile(config.operatorFile,JSON.stringify(actor(fixture.operator)),{mode:0o600});
 const run=(command,extra={})=>operatorCommand({command,config,statePath,actor:actor(fixture.author),ethereumKey:fixture.signer.privateKey,...extra});
 mark('fund-new-operator-fees');
 const [fresh]=await generateSchnorrAccounts(1,'schnorr_initializerless');
 assert.equal((await run('fees',{actor:actor(fresh)})).publicFeeJuice,'0');
 const feePortal=await L1FeeJuicePortalManager.new(fixture.net.node,fixture.net.deployment.l1Client,createLogger('plugin:test:fees'));
 const credit=await feePortal.bridgeTokensPublic(fresh.address,undefined,true);
 const claimPath=path.join(directory,'fee-claim.json');await fs.writeFile(claimPath,JSON.stringify({claimAmount:String(credit.claimAmount),claimSecret:String(credit.claimSecret),messageLeafIndex:String(credit.messageLeafIndex)}),{mode:0o600});
 await ensureDevelopmentMessageReady(fixture.net.node,Fr.fromString(credit.messageHash));
 await fixture.wallet.pxe.sync();
 const claimed=await run('claim-fees',{actor:actor(fresh),claim:claimPath});assert(BigInt(claimed.publicFeeJuice)>0n);report.zeroBalanceFeeOnboarding=true;
 for(const command of ['deploy-escrow','deploy-portal','bind']){
  mark(command);await run(command);const before=JSON.stringify(await read(statePath));
  await run(command);assert.equal(JSON.stringify(await read(statePath)),before,'Repeated command must reuse its transaction');
  if(command==='deploy-escrow'){
   await assert.rejects(run(command,{actor:actor(fixture.operator)}),/another actor/);
   assert.equal(JSON.stringify(await read(statePath)),before,'Wrong-actor replay must preserve deployment state');
  }
 }
 const settle=async hash=>{const txHash=TxHash.fromString(hash),effect=await fixture.net.node.getTxEffect(txHash);return settleRollingDevelopmentMessage({net:fixture.net,txHash,expectedLeaf:effect.data.l2ToL1Msgs.find(x=>!x.isZero())});};
 await settle((await read(statePath)).operations.bind.hash);
 for(const command of ['activate','config','register']){mark(command);await run(command);}
 const state=await read(statePath),portalArtifact=await read('billboard/portal/out/PluginPortal.sol/PluginPortal.json');
 const portal=new Contract(state.portal,portalArtifact.abi,fixture.signer);
 await (await fixture.token.approve(state.portal,1000000n)).wait();
 const receipt=await(await portal.deposit(String(fixture.author.address),1000000n,String(await computeSecretHash(Fr.ONE)))).wait();
 const event=receipt.logs.map(x=>{try{return portal.interface.parseLog(x);}catch{return null;}}).find(x=>x?.name==='Deposited');
 await ensureDevelopmentMessageReady(fixture.net.node,Fr.fromString(event.args.key));
 await fixture.wallet.pxe.sync();
 const artifact=loadContractArtifact(await read('plugins/adapter_artifact.json')),instance=await fixture.net.node.getContract((await import('@aztec-labs/stdlib/aztec-address')).AztecAddress.fromStringUnsafe(state.escrow),'latest');
 await fixture.wallet.registerContract(instance,artifact);const escrow=await L2Contract.at(instance.address,artifact,fixture.wallet);
 await fixture.wallet.createSchnorrInitializerlessAccount(fixture.operator.secret,fixture.operator.salt,fixture.operator.signingKey,'operator');
 const opts={from:fixture.author.address,wait:{timeout:120,waitForStatus:TxStatus.CHECKPOINTED}},opOpts={...opts,from:fixture.operator.address};
 mark('claim-and-authorize');await escrow.methods.claim(1000000n,Fr.ONE,new Fr(event.args.index)).send(opts);
 const message=packText('@ops Operator earnings contract integration');await fixture.board.methods.post_with_plugin(fixture.chain,Fr.random(),message.fields.map(x=>Fr.fromString(x)),message.length,null,null,Fr.fromString(handleField('ops'))).send(opts);
 const post=new Fr(BigInt((await escrow.methods.request_at(0).simulate({from:NO_FROM})).result));
 await escrow.methods.start(post).send(opOpts);await escrow.methods.reserve(post,0,10000n).send(opOpts);await escrow.methods.settle(post,0,123n,Fr.ONE).send(opOpts);await escrow.methods.close(post).send(opOpts);
 mark('operator-earnings');const operatorArgs={actor:actor(fixture.operator)};
 assert.equal((await run('earnings',operatorArgs)).availableUSDC,'0.000123');
 await run('withdraw-earnings',{...operatorArgs,amount:'0.000123',recipient:fixture.signer.address});
 const withdrawal=(await read(statePath)).withdrawal;await settle((await read(statePath)).operations['withdraw-'+withdrawal.nonce].hash);
 const before=await fixture.token.balanceOf(fixture.signer.address);await run('redeem-earnings',operatorArgs);assert.equal(await fixture.token.balanceOf(fixture.signer.address),before+123n);
 assert.equal((await run('earnings',operatorArgs)).availableUSDC,'0.0');
 await assert.rejects(run('redeem-earnings',operatorArgs),/No earnings withdrawal/);
 assert.equal(BigInt((await escrow.methods.balance(fixture.author.address).simulate({from:NO_FROM})).result),999877n);
 report.earnings={withdrawnMicroUSDC:'123',userBalanceMicroUSDC:'999877',distinctOperator:true};report.passed=true;mark('passed');
}catch(error){report.failure={name:error.name,message:error.message};throw error;}
finally{try{await fixture?.close();await Barretenberg.destroySingleton();BarretenbergSync.destroySingleton();report.cleanupSucceeded=true;}finally{await fs.writeFile(path.join(directory,'operations-result.json'),JSON.stringify(report,null,2));}}

}

if(focused){
 const {test}=await import('node:test');const os=await import('node:os');const {createServer}=await import('node:net');
 const {developmentOptions}=await import('./start.mjs');const {devnetPorts,readDevnetRecord,writeDevnetRecord,assertDevnetPortsFree}=await import('./network.mjs');
 // Controlled inventory loader; actual reader asset handler and reload lifecycle.
 const {createDevelopmentWalletAssets}=await import('./start.mjs');
 const {EventEmitter}=await import('node:events');
 async function walletAssetResponse(owner){
  const res=new EventEmitter();res.destroyed=false;res.setHeader=()=>{};
  res.writeHead=status=>{res.status=status;};res.end=body=>{res.body=body?.toString();res.emit('finish');};
  await owner.staticHandler({method:'GET',url:'/wallet/runtime.json',headers:{}},res);return res;
 }
 const walletInventory=body=>({connectOrigins:[],read:async()=>({body:Buffer.from(body),type:'application/json'})});
 test('development wallet reload atomically swaps verified inventories and shares an in-flight reload',async()=>{
  let version='old',loads=0,leases=0,release,entered;
  const started=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  const owner=createDevelopmentWalletAssets({assertHeld:async()=>{leases++;},load:async()=>{loads++;const wallet=walletInventory(version);if(loads===2){entered();await held;}return wallet;}});
  try{await owner.reload();assert.equal((await walletAssetResponse(owner)).body,'old');version='new';
   const first=owner.reload(),second=owner.reload();assert.equal(first,second);await started;
   assert.equal((await walletAssetResponse(owner)).body,'old');release();await first;
   assert.equal((await walletAssetResponse(owner)).body,'new');assert.equal(loads,2);assert.equal(leases,4);
  }finally{release();await owner.close();}
 });
 test('development wallet reload failure retains the handler without bypassing its asset-read validation',async()=>{
  const failure=Error('Controlled invalid inventory'),changed=Error('Controlled asset digest mismatch');let invalid=false,changedBytes=false;
  const owner=createDevelopmentWalletAssets({assertHeld:async()=>{},load:async()=>{if(invalid)throw failure;return {connectOrigins:[],read:async()=>{if(changedBytes)throw changed;return {body:Buffer.from('verified'),type:'application/json'};}};}});
  try{await owner.reload();invalid=true;await assert.rejects(owner.reload(),e=>e===failure);
   assert.equal((await walletAssetResponse(owner)).body,'verified');changedBytes=true;
   await assert.rejects(walletAssetResponse(owner),e=>e===changed);
   changedBytes=false;invalid=false;await owner.reload();assert.equal((await walletAssetResponse(owner)).body,'verified');
  }finally{await owner.close();}
 });
 test('development wallet shutdown drains verification and prevents late admission or another reload',async()=>{
  let release,entered,loads=0;const started=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  const owner=createDevelopmentWalletAssets({assertHeld:async()=>{},load:async()=>{loads++;entered();await held;return walletInventory('late');}});
  const loading=owner.reload();await started;const rejected=assert.rejects(loading,/cancelled by shutdown/);
  let stopped=false;const closing=owner.close().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
  await assert.rejects(owner.reload(),/closing/);release();await rejected;await closing;await owner.close();
  assert.equal(loads,1);await assert.rejects(walletAssetResponse(owner),/unavailable/);
 });
 test('development wallet reload rechecks lease ownership before admitting a new inventory',async()=>{
  let lost=false,version='old',replaceOwner=false;const failure=Error('Controlled owner changed');
  const owner=createDevelopmentWalletAssets({assertHeld:async()=>{if(lost)throw failure;},load:async()=>{if(replaceOwner)lost=true;return walletInventory(version);}});
  try{await owner.reload();version='new';replaceOwner=true;await assert.rejects(owner.reload(),e=>e===failure);assert.equal((await walletAssetResponse(owner)).body,'old');}
  finally{await owner.close();}
 });

 test('current development defaults are Rolling, loopback ports and no provider prerequisite',()=>{const p=developmentOptions([],{VENICE_WALLET_PRIVATE_KEY:undefined});assert.equal(p.profile,'rolling');assert.deepEqual(p.ports,{ethereumPort:18545,nodePort:18080,appPort:8080});assert.equal(p.hostedConfig,undefined);});
 test('development flags reject real proofs, duplicate ports and unknown arguments before startup',()=>{assert.throws(()=>developmentOptions([],{PLUGIN_PROOFS:'true'}));assert.throws(()=>developmentOptions(['--app-port','18080']));assert.throws(()=>developmentOptions(['--app-port','8080','--app-port','8081']));assert.throws(()=>developmentOptions(['--network','testnet']));assert.throws(()=>developmentOptions(['--app-port','0']));});
 test('selected state and separate loopback ports are explicit',()=>{const p=developmentOptions(['--directory','/tmp/owned-local-devnet','--app-port','18081','--node-port','18082','--ethereum-port','18546']);assert.equal(p.directory,'/tmp/owned-local-devnet');assert.equal(p.ports.appPort,18081);});
 test('occupied development port fails before changing an existing listener',async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await assert.rejects(assertDevnetPortsFree({ethereumPort:server.address().port,nodePort:18083,appPort:18084}),/already owned/);assert(server.listening);}finally{await new Promise(r=>server.close(r));}});
 test('private state uses exclusive creation, closed reads and atomic replacement',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-dev-state-'));await fs.chmod(dir,0o700);const file=path.join(dir,'state.json');try{assert.equal(await readDevnetRecord(file),null);await writeDevnetRecord(file,{phase:'starting'},{exclusive:true});assert.equal((await fs.stat(file)).mode&0o777,0o600);await assert.rejects(writeDevnetRecord(file,{phase:'replacement'},{exclusive:true}));assert.deepEqual(await readDevnetRecord(file),{phase:'starting'});await writeDevnetRecord(file,{phase:'stopped'});assert.deepEqual(await readDevnetRecord(file),{phase:'stopped'});await fs.chmod(file,0o644);await assert.rejects(readDevnetRecord(file));await fs.unlink(file);await fs.symlink('target.json',file);await assert.rejects(readDevnetRecord(file));}finally{await fs.rm(dir,{recursive:true,force:true});}});

 test('development lease rejects symlinked parent and preserves a replaced owner inode',async()=>{
  const {acquireDevelopmentLease}=await import('./start.mjs');const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rolling-owner-'))),root=path.join(parent,'state'),link=path.join(parent,'link');
  try{await fs.mkdir(root,{mode:0o700});await fs.symlink(parent,link);await assert.rejects(acquireDevelopmentLease(path.join(link,'state')),/canonical/);
   const lease=await acquireDevelopmentLease(root);await lease.assertHeld();await assert.rejects(acquireDevelopmentLease(root),{code:'HOSTED_LEASE_BUSY'});
   const lock=path.join(root,'hosted.lock');await fs.rename(lock,lock+'.original');await fs.writeFile(lock,'replacement',{mode:0o600,flag:'wx'});
   await assert.rejects(lease.assertHeld(),/changed/);await assert.rejects(lease.close(),/changed/);assert.equal(await fs.readFile(lock,'utf8'),'replacement');
   await fs.unlink(lock);const second=await acquireDevelopmentLease(root);await second.close();assert.equal(await fs.readFile(lock,'utf8'),'');
   await fs.chmod(root,0o755);await assert.rejects(acquireDevelopmentLease(root),/private/);
  }finally{await fs.rm(parent,{recursive:true,force:true});}
 });

 test('missing network metadata cannot reset retained chain snapshots, node data or deployment journals',async()=>{
  const {assertFreshDevnetDirectory}=await import('./network.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-incomplete-'));
  try{await assertFreshDevnetDirectory(dir);await fs.writeFile(path.join(dir,'operator.json'),'{}',{mode:0o600});await fs.writeFile(path.join(dir,'hosted.lock'),'1',{mode:0o600});await assertFreshDevnetDirectory(dir);
   for(const name of ['ethereum-state.json','node','deployment.json','bok-operations.json']){const p=path.join(dir,name);if(name==='node')await fs.mkdir(p);else await fs.writeFile(p,'retained',{mode:0o600});await assert.rejects(assertFreshDevnetDirectory(dir),/fresh directory/);assert(await fs.lstat(p));await fs.rm(p,{recursive:true});}
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });

 const {activateDevelopmentBok}=await import('./bootstrap.mjs');
 const bokExpected={escrow:'0x'+'4'.repeat(64),operatorAddress:'0x'+'5'.repeat(64),pluginId:'0x'+'1'.repeat(64)};
 const bokStatus={status:'succeeded',canonical:true,scope:'portal-registration',escrow:bokExpected.escrow,pluginId:bokExpected.pluginId,portal:'0x'+'6'.repeat(40),portalReady:true,registrationReady:true,hostedServiceReady:false};
 test('actual lifecycle composition exposes wallet Bok only after ordered canonical status (controlled operator)',async()=>{
  const calls=[];let binds=0;const value=await activateDevelopmentBok({expected:bokExpected,pollMs:0,run:async command=>{calls.push(command);if(command==='bind'&&binds++===0)return {status:'unresolved'};return command==='status'?bokStatus:{status:'succeeded',canonical:true};},settle:async()=>calls.push('settle')});
  assert.deepEqual(calls,['deploy-portal','bind','bind','settle','activate','register','status']);
  assert.deepEqual(value.walletBok,{contractAddress:bokExpected.escrow,operatorAddress:bokExpected.operatorAddress,pluginId:bokExpected.pluginId});
  assert.equal(value.status.hostedServiceReady,false);
 });
 test('lifecycle refuses failed, noncanonical or unresolved retained operation without later activation',async()=>{
  for(const result of [{status:'failed',canonical:true},{status:'succeeded',canonical:false},{status:'unresolved'}]){const calls=[];await assert.rejects(activateDevelopmentBok({expected:bokExpected,waitMs:1,pollMs:1,run:async command=>{calls.push(command);return result;},settle:async()=>calls.push('settle')}),/reconciliation/);assert(calls.every(x=>x==='deploy-portal'));}
 });
 test('settlement failure and canonical status drift cannot publish wallet Bok configuration',async()=>{
  const calls=[];await assert.rejects(activateDevelopmentBok({expected:bokExpected,run:async c=>{calls.push(c);return bokStatus;},settle:async()=>{throw Error('controlled missing Ready');}}),/missing Ready/);assert.deepEqual(calls,['deploy-portal','bind']);
  for(const change of [{escrow:'0x'+'7'.repeat(64)},{pluginId:'0x'+'2'.repeat(64)},{portal:'0x'+'0'.repeat(40)},{portalReady:false},{registrationReady:false},{hostedServiceReady:true},{scope:'constructor-only'}])await assert.rejects(activateDevelopmentBok({expected:bokExpected,run:async c=>c==='status'?{...bokStatus,...change}:bokStatus,settle:async()=>{}}),/status differs/);
 });
 const {waitDevelopmentFinality,failRollingBootstrap}=await import('./bootstrap.mjs');

 test('bootstrap failure retains exact original private cause and cleanup failure behind generic message',async()=>{
  const original=Error('synthetic-private-diagnostic'),cleanup=Error('controlled cleanup');let closes=0;
  await assert.rejects(failRollingBootstrap(original,async()=>{closes++;}),e=>e.cause===original&&!e.message.includes(original.message));assert.equal(closes,1);
  await assert.rejects(failRollingBootstrap(original,async()=>{throw cleanup;}),e=>e instanceof AggregateError&&e.cause===original&&e.errors[0]===original&&e.errors[1]===cleanup&&!e.message.includes(original.message));
 });

 test('constructor waits for same recorded operation without preparing or sending again',async()=>{
  const {completeDevelopmentOperation}=await import('./bootstrap.mjs'),{onceAztecOperation}=await import('../operations.mjs');let state={operations:{}},prepares=0,sends=0,reads=0;const store={read:()=>state,write:async s=>{state=s;}};
  const result=await completeDevelopmentOperation({command:'deploy-escrow',timeoutMs:100,pollMs:0,run:command=>onceAztecOperation({store,name:command,identity:'retained-constructor',reconcile:async()=>++reads<3?{status:'unresolved',canonical:false}:{status:'succeeded',canonical:true,escrow:bokExpected.escrow},execute:async({submit})=>{prepares++;await submit({hash:'0x'+'7'.repeat(64),raw:'ab'},async()=>{sends++;});}})});
  assert.equal(result.escrow,bokExpected.escrow);assert.equal(reads,3);assert.equal(prepares,1);assert.equal(sends,1);assert.equal(state.operations['deploy-escrow'].phase,'submission-unknown');
 });
 test('constructor deadline retains unknown or hashless intent and refuses a second execution',async()=>{
  const {completeDevelopmentOperation}=await import('./bootstrap.mjs'),{onceAztecOperation}=await import('../operations.mjs');
  for(const phase of ['preparing','submission-unknown']){const original={schemaVersion:1,policy:'reconcile-only',phase,identity:'saved',...(phase==='submission-unknown'?{hash:'0x'+'8'.repeat(64),raw:'ab'}:{})},state={operations:{'deploy-escrow':original}};let executes=0,writes=0;
   await assert.rejects(completeDevelopmentOperation({command:'deploy-escrow',timeoutMs:3,pollMs:1,run:command=>onceAztecOperation({store:{read:()=>state,write:async()=>{writes++;}},name:command,identity:'saved',reconcile:async()=>({status:'unresolved',canonical:false}),execute:async()=>{executes++;}})}),/reconciliation/);
   assert.equal(executes,0);assert.equal(writes,0);assert.equal(state.operations['deploy-escrow'],original);
  }
 });

 const {linkLiquidityBytecode,localPoolPrice,liquidityStage,liquidityPins}=await import('./liquidity.mjs');
 test('genuine dependency pins bind Circle source/compiler and matching official V3 artifact family',()=>{
  assert.equal(liquidityPins.circleCommit,'fc85788bc7c23cefe3df1a757133048bfddadeaa');assert.equal(Object.keys(liquidityPins.circleSources).length,31);assert.equal(liquidityPins.packages.find(p=>p.package==='@uniswap/swap-router-contracts').version,'1.3.1');assert.match(liquidityPins.compilerSha256,/^[a-f0-9]{64}$/);
 });
 test('actual bytecode linker accepts only exact non-overlapping declared library offsets',()=>{
  const a={bytecode:'0x60'+'_'.repeat(40)+'00',linkReferences:{file:{Library:[{start:1,length:20}]}}},addr='0x'+'1'.repeat(40);
  assert.equal(linkLiquidityBytecode(a,{Library:addr}),'0x60'+addr.slice(2)+'00');assert.throws(()=>linkLiquidityBytecode(a,{}));assert.throws(()=>linkLiquidityBytecode({...a,linkReferences:{file:{Library:[{start:1,length:20},{start:1,length:20}]}}},{Library:addr}));assert.throws(()=>linkLiquidityBytecode({...a,linkReferences:{}},{}));
 });
 test('pool initialization uses integer decimal-aware sorted real inventory, not invented quotes',()=>{
  const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),p=localPoolPrice(a,b,1000000000000000000n,1000000000n),q=localPoolPrice(b,a,1000000000n,1000000000000000000n);assert.deepEqual(p,q);assert.equal(p.amount0,1000000000000000000n);assert(p.sqrtPriceX96>0n);assert.throws(()=>localPoolPrice(a,a,1n,1n));assert.throws(()=>localPoolPrice(a,b,0n,1n));
 });
 test('actual local liquidity journal sends signed intent once and refuses unknown/reorg recovery (controlled chain)',async()=>{
  const {Wallet,Transaction}=await import('ethers');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-liquidity-stage-')),wallet=Wallet.createRandom(),hash='0x'+'8'.repeat(64);let sent=0,prepared=0,receipt,reorg=false,missing=false,receiptReads=0,moved=false;
  const provider={getNetwork:async()=>({chainId:31337n}),getTransactionReceipt:async()=>{receiptReads++;if(receiptReads===2)moved=true;return missing?null:moved?{...receipt,blockNumber:99}:receipt;},getBlock:async()=>({number:4,hash:reorg?'0x'+'9'.repeat(64):hash}),broadcastTransaction:async raw=>{sent++;receipt={hash:Transaction.from(raw).hash,status:1,blockNumber:4,blockHash:hash};return {hash:receipt.hash};}};
  const signer={address:wallet.address,populateTransaction:async t=>{prepared++;return {...t,nonce:0,chainId:31337n,type:2,gasLimit:100000n,maxFeePerGas:2n,maxPriorityFeePerGas:1n};},signTransaction:t=>wallet.signTransaction(t)},args={directory:dir,name:'controlled-call',identity:'controlled',provider,signer,transaction:{to:'0x'+'1'.repeat(40),data:'0x1234',value:0n},effect:async()=>true,timeoutMs:1};
  try{assert.equal((await liquidityStage(args)).status,1);assert.equal(receiptReads,1,'return the canonical captured receipt without another lookup');await assert.rejects(liquidityStage(args),/reconciliation/);moved=false;await liquidityStage(args);assert.equal(sent,1);assert.equal(prepared,1);for(const mode of ['reorg','missing']){reorg=mode==='reorg';missing=mode==='missing';await assert.rejects(liquidityStage(args),/reconciliation/);}assert.equal(sent,1);assert.equal(prepared,1);await assert.rejects(liquidityStage({...args,identity:'changed'}),/scope mismatch/);const saved=await readDevnetRecord(path.join(dir,'controlled-call.json'));assert.equal(saved.operations['relay-funding'].phase,'submission-unknown');reorg=false;missing=false;const stageFile=path.join(dir,'controlled-call.json');await fs.unlink(stageFile);await assert.rejects(liquidityStage(args),/entered liquidity stage missing/);assert.equal(sent,1);await fs.writeFile(stageFile,JSON.stringify(saved),{mode:0o600});await fs.unlink(path.join(dir,'progress.json'));await assert.rejects(liquidityStage(args),/progress missing/);assert.equal(sent,1);assert.equal(prepared,1);}finally{await fs.rm(dir,{recursive:true,force:true});}
 });

 test('prepared official artifact loader accepts exact measured output and rejects changed ABI bytecode links or symlinks',async()=>{
  const {readLiquidityArtifacts}=await import('./liquidity.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-liquidity-artifact-'));
  const original=await fs.readFile(path.resolve('.build/local-liquidity/artifacts.json'));
  try{
   await fs.writeFile(path.join(dir,'artifacts.json'),original);assert.equal(Object.keys(await readLiquidityArtifacts(dir)).length,11);
   for(const change of [r=>r.artifacts.FiatTokenV2_2.abi=[],r=>r.artifacts.FiatTokenV2_2.bytecode='0x00',r=>r.artifacts.FiatTokenV2_2.linkReferences={},r=>r.pinsSha256='0'.repeat(64)]){const r=JSON.parse(original);change(r);await fs.writeFile(path.join(dir,'artifacts.json'),JSON.stringify(r)+'\n');await assert.rejects(readLiquidityArtifacts(dir),/pin differs/);}
   await fs.unlink(path.join(dir,'artifacts.json'));await fs.symlink(path.resolve('.build/local-liquidity/artifacts.json'),path.join(dir,'artifacts.json'));await assert.rejects(readLiquidityArtifacts(dir),/type/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });
 test('advanced Bok lifecycle cannot reconstruct missing original Circle/config scope',async()=>{
  const {requireDevelopmentCircleScope}=await import('./bootstrap.mjs');
  requireDevelopmentCircleScope({operations:{'deploy-escrow':{phase:'submission-unknown'}}});
  for(const name of ['deploy-portal','bind','activate','register'])assert.throws(()=>requireDevelopmentCircleScope({operations:{[name]:{}},circleScope:{}}),/records missing/);
  assert.throws(()=>requireDevelopmentCircleScope({lifecycle:{},operations:{}}),/records missing/);
  requireDevelopmentCircleScope({lifecycle:{},operations:{register:{}},circleScope:{}});
  assert.throws(()=>requireDevelopmentCircleScope({legacyToken:{operations:{'deploy-portal':{}}}}),/records missing/);
 });

 test('dedicated local relay retains private signer and measured reimbursement policy across reopen (controlled chain)',async()=>{
  const {prepareDevelopmentRelay}=await import('./liquidity.mjs'),dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rolling-relay-record-'))),address=n=>'0x'+n.toString(16).padStart(40,'0'),hash='0x'+'a'.repeat(64);
  const scope={router:address(1),routerCodeHash:hash,collateralPortal:address(2),feePortal:address(3),bokPortal:address(4),privateFpc:'0x'+'1'.repeat(64),bokToken:address(5),weth:address(6),quoter:address(7),quoterCodeHash:hash},circle={codeHash:hash,implementation:address(8),implementationCodeHash:hash};let quotes=0,fundCalls=0;
  const provider={_getConnection:()=>({url:'http://127.0.0.1:18545/'}),getBlock:async()=>({hash})},quoter={quoteExactOutputSingle:{staticCall:async args=>{quotes++;assert.deepEqual(args,[scope.bokToken,scope.weth,10000000000000000n,3000,0]);return [101n];}}};
  const stage=async(name,tx)=>{fundCalls++;assert.equal(name,'relay-fund');assert.equal(tx.value,100000000000000000n);assert.equal(tx.data,'0x');await fs.writeFile(path.join(dir,'progress.json'),JSON.stringify({entered:['relay-fund']}));};
  const args={directory:dir,provider,stage,scope,circle,quoter,anchor:{number:3,hash},fundingSender:address(99)};
  try{
   await fs.writeFile(path.join(dir,'progress.json'),JSON.stringify({entered:[]}));const first=await prepareDevelopmentRelay(args),key=await fs.readFile(first.signerFile);
   assert.equal(first.policy.feeUsdc,'107');assert.equal((await fs.stat(first.signerFile)).mode&0o777,0o600);assert.equal((await fs.stat(first.stateDirectory)).mode&0o777,0o700);
   assert.deepEqual(await prepareDevelopmentRelay(args),first);assert.deepEqual(await fs.readFile(first.signerFile),key);assert.equal(quotes,1);assert.equal(fundCalls,2,'existing signed-once stage is revisited for reconciliation');
   await fs.unlink(first.signerFile);await assert.rejects(prepareDevelopmentRelay(args),/Original relay signer missing/);assert.equal(fundCalls,2);
   await fs.writeFile(first.signerFile,key,{mode:0o600});await fs.unlink(path.join(dir,'relay-policy.json'));await assert.rejects(prepareDevelopmentRelay(args),/Original relay policy missing/);assert.equal(fundCalls,2);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });

 test('initialized relay directory or budget loss refuses before funding or replacement (actual filesystem)',async()=>{
  const {prepareDevelopmentRelay}=await import('./liquidity.mjs'),dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'relay-loss-'))),state=path.join(dir,'relay-state');let stages=0;
  const args={directory:dir,stage:async()=>stages++};
  try{
   await fs.writeFile(path.join(dir,'progress.json'),JSON.stringify({entered:['relay-fund']}));
   await fs.writeFile(state+'.initialized.json',JSON.stringify({schemaVersion:1,identity:'0x'+'a'.repeat(64)}),{mode:0o600});
   await assert.rejects(prepareDevelopmentRelay(args),/initialized relay state missing/);await assert.rejects(fs.stat(state),{code:'ENOENT'});
   await fs.mkdir(state,{mode:0o700});await assert.rejects(prepareDevelopmentRelay(args),/initialized relay budget missing/);
   assert.equal(stages,0);assert.deepEqual(await fs.readdir(state),[]);
   await fs.writeFile(state+'.initialized.json','null',{mode:0o600});await assert.rejects(prepareDevelopmentRelay(args),/Invalid original relay initialization/);assert.equal(stages,0);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });

 test('actual pinned SwapRouter02 and Quoter ABI dependency readback uses inherited factory getter',async()=>{
  const {Contract,Interface}=await import('ethers');const {readLiquidityArtifacts,verifyDevelopmentV3}=await import('./liquidity.mjs');
  const artifacts=await readLiquidityArtifacts(),address=n=>'0x'+n.toString(16).padStart(40,'0'),factory=address(1),weth=address(2),calls=[];let wrong=false;
  function contract(artifact,at){const abi=new Interface(artifact.abi);return new Contract(at,abi,{call:async tx=>{const fn=abi.parseTransaction({data:tx.data});calls.push(fn.name);assert.equal(fn.args.length,0);assert(['factory','WETH9'].includes(fn.name));return abi.encodeFunctionResult(fn.name,[fn.name==='factory'?(wrong?address(9):factory):weth]);}});}
  const swap=contract(artifacts.SwapRouter02,address(3)),quoter=contract(artifacts.QuoterV2,address(4));
  assert.equal(swap.factoryV3,undefined,'factoryV3 is only a constructor input, not a callable method');
  await verifyDevelopmentV3({swap,quoter,factory,weth});assert.deepEqual(calls,['factory','WETH9','factory','WETH9']);
  wrong=true;await assert.rejects(verifyDevelopmentV3({swap,quoter,factory,weth}),/identity differs/);
 });

 const {developmentAccountingReaderConfig}=await import('./bootstrap.mjs');
 let accountingFixturePromise;
 const accountingFixture=()=>accountingFixturePromise??=(async()=>{
  const {getContractInstanceFromInstantiationParams,getContractClassFromArtifact}=await import('@aztec-labs/stdlib/contract');
  const {AztecAddress}=await import('@aztec-labs/stdlib/aztec-address');
  const {sha256,toUtf8Bytes}=await import('ethers');const {rollingOperatorConfig}=await import('../operations.mjs');
  const boardRaw=JSON.parse(await fs.readFile(new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url),'utf8'));
  const bokRaw=JSON.parse(await fs.readFile(new URL('../../experiments/private-bok/target/private_bok-PrivateBok.json',import.meta.url),'utf8'));
  const board=AztecAddress.fromBigIntUnsafe(42n),operator=AztecAddress.fromBigIntUnsafe(43n),salt=new Fr(45n).toString();
  const operatorConfig={applicationProfile:'rolling',nodeUrl:'http://127.0.0.1:18080/',ethereumUrl:'http://127.0.0.1:18545/',chainId:'31337',rollupVersion:'1',rollupAddress:'0x'+'11'.repeat(20),boardAddress:String(board),operatorAddress:String(operator),development:true,operatorFile:'/private/synthetic-actor-sentinel.json'};
  const args=[board,operator,31337n,1n],artifact=loadContractArtifact(bokRaw),boardClass=(await getContractClassFromArtifact(loadContractArtifact(boardRaw))).id.toString(),classId=(await getContractClassFromArtifact(artifact)).id.toString();
  const instance=await getContractInstanceFromInstantiationParams(artifact,{constructorArtifact:'init',constructorArgs:args,deployer:operator,salt:Fr.fromString(salt)});
  const deployment={version:instance.version,...Object.fromEntries(['address','deployer','originalContractClassId','currentContractClassId','salt','initializationHash','immutablesHash'].map(k=>[k,String(instance[k])])),storage:{board:String(board),operator:String(operator),owner:String(operator),l1_chain:new Fr(31337n).toString(),version:Fr.ONE.toString()}};
  const identity=JSON.stringify({profile:'rolling-private-bok-constructor/v1',config:rollingOperatorConfig(operatorConfig),actor:String(operator),artifactSha256:sha256(toUtf8Bytes(JSON.stringify(bokRaw))),classId,boardClass,constructor:args.map(String)});
  const hash='0x'+'13'.repeat(32),blockHash='0x'+'14'.repeat(32),directory='/private/synthetic-campaign';
  const journal={identity,salt,operations:{'deploy-escrow':{schemaVersion:1,policy:'reconcile-only',phase:'submission-unknown',identity,hash,raw:'private-signed-record-sentinel',deployment},bind:{hash:'0x'+'15'.repeat(32)},register:{hash:'0x'+'16'.repeat(32)}}};
  const readerConfig={nodeUrl:operatorConfig.nodeUrl,artifactPath:'/public/RollingBoard.json',scope:{chainId:'31337',rollupVersion:'1',rollupAddress:operatorConfig.rollupAddress,boardAddress:String(board),classId:boardClass},deployment:{blockNumber:3,blockHash:'0x'+'12'.repeat(32),txHash:'0x'+'11'.repeat(32)},cacheDirectory:directory+'/public-index',port:8080};
  return {directory,readerConfig,operatorConfig,journal,boardRaw,bokRaw,bokArtifactPath:'/public/PrivateBok.json',constructorResult:{status:'succeeded',canonical:true,scope:'constructor-only',profile:'rolling-private-bok-constructor/v1',transactionHash:hash,blockNumber:7,blockHash,escrow:deployment.address}};
 })();
 test('accounting startup derives exact public scope from original real ABI constructor and preserves old cache',async()=>{
  const input=structuredClone(await accountingFixture()),before=structuredClone(input),out=await developmentAccountingReaderConfig(input);
  assert.deepEqual(input,before);assert.equal(out.cacheDirectory,input.directory+'/public-index-bok');assert.equal(input.readerConfig.cacheDirectory,input.directory+'/public-index');
  assert.deepEqual(out.scope.bok,{address:input.constructorResult.escrow,classId:input.journal.operations['deploy-escrow'].deployment.originalContractClassId,operatorAddress:input.operatorConfig.operatorAddress,deployer:input.operatorConfig.operatorAddress,salt:input.journal.salt,deployment:{blockNumber:7,blockHash:input.constructorResult.blockHash,txHash:input.constructorResult.transactionHash}});
  assert.equal(out.bokArtifactPath,input.bokArtifactPath);assert.deepEqual(out.deployment,input.readerConfig.deployment);assert(!JSON.stringify(out).includes('sentinel'));
 });
 test('accounting startup refuses missing changed or noncanonical original constructor without latest fallback',async()=>{
  const mutations=[x=>{delete x.journal.operations['deploy-escrow'];},x=>{x.journal.operations['deploy-escrow'].phase='preparing';},x=>{x.constructorResult.transactionHash=x.journal.operations.register.hash;},x=>{x.constructorResult.canonical=false;},x=>{x.constructorResult.blockNumber=2;},x=>{x.journal.salt=Fr.ONE.toString();},x=>{x.journal.operations['deploy-escrow'].deployment.currentContractClassId=Fr.ONE.toString();},x=>{x.operatorConfig.operatorAddress=Fr.ONE.toString();},x=>{x.readerConfig.scope.classId=Fr.ONE.toString();},x=>{x.journal.identity+='changed';},x=>{x.constructorResult.escrow=Fr.ONE.toString();}];
  for(const mutate of mutations){const input=structuredClone(await accountingFixture());mutate(input);await assert.rejects(developmentAccountingReaderConfig(input),e=>e.message==='Original Bok accounting deployment identity unavailable'&&!String(e.stack).includes('sentinel'));}
 });
 test('accounting startup extended reader scope leaves strict public wallet validation unchanged',async()=>{
  const input=await accountingFixture(),out=await developmentAccountingReaderConfig(input),{validateRollingWalletConfig}=await import('../../scripts/rolling-wallet-assets.mjs');
  const gasSettings={gasLimits:{daGas:'1',l2Gas:'1'},teardownGasLimits:{daGas:'1',l2Gas:'1'},maxFeesPerGas:{feePerDaGas:'1',feePerL2Gas:'1'},maxPriorityFeesPerGas:{feePerDaGas:'0',feePerL2Gas:'0'}};
  const wallet={config:{network:{chainId:'31337',rollupVersion:'1',rollupAddress:input.operatorConfig.rollupAddress,ethRpcUrl:input.operatorConfig.ethereumUrl},board:{contractAddress:input.operatorConfig.boardAddress,portalAddress:'0x'+'17'.repeat(20)},privateFee:{contractAddress:Fr.ONE.toString(),gasSettings}},trustedQuery:{url:input.operatorConfig.nodeUrl,allowLocalDev:true},remoteProver:null,proofsEnabled:false};
  assert.deepEqual(validateRollingWalletConfig(wallet,out.scope),validateRollingWalletConfig(wallet,input.readerConfig.scope));
  assert.throws(()=>validateRollingWalletConfig(wallet,{...out.scope,boardAddress:Fr.ONE.toString()}));
 });

 test('development deployer awaits fresh PXE sync before initializerless constructor simulation',async()=>{
  const {initializeDevelopmentDeployer}=await import('./bootstrap.mjs');const calls=[];let release;
  const gate=new Promise(resolve=>{release=resolve;}),secret={},salt={},signingKey={},account={};
  const wallet={setMinFeePadding(value){assert.equal(value,30);},pxe:{async sync(){calls.push('sync-start');await gate;calls.push('sync-complete');}},async createSchnorrInitializerlessAccount(...args){assert.deepEqual(args,[secret,salt,signingKey,'local public deployer']);calls.push('constructor');return account;}};
  const pending=initializeDevelopmentDeployer(wallet,secret,salt,signingKey);await Promise.resolve();assert.deepEqual(calls,['sync-start']);
  release();assert.equal(await pending,account);assert.deepEqual(calls,['sync-start','sync-complete','constructor']);
 });
 test('development deployer failed synchronization cannot create account or swallow cleanup-owned error',async()=>{
  const {initializeDevelopmentDeployer}=await import('./bootstrap.mjs');const failure=Error('controlled sync failure');let constructors=0;
  await assert.rejects(initializeDevelopmentDeployer({setMinFeePadding(){},pxe:{async sync(){throw failure;}},async createSchnorrInitializerlessAccount(){constructors++;}}),e=>e===failure);assert.equal(constructors,0);
  const constructorFailure=Error('controlled constructor failure');let syncs=0;
  await assert.rejects(initializeDevelopmentDeployer({setMinFeePadding(){},pxe:{async sync(){syncs++;}},async createSchnorrInitializerlessAccount(){throw constructorFailure;}}),e=>e===constructorFailure);assert.equal(syncs,1);
 });

 test('default development directories are fresh while explicit directories remain exact',()=>{
  const a=developmentOptions(),b=developmentOptions();assert.notEqual(a.directory,b.directory);assert.match(a.directory,/rolling-devnet-[0-9a-f-]{36}$/);
 });
 test('native network adapter delegates coherent setup and owns shutdown exactly once',async()=>{
  const {startDevnet}=await import('./network.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-devnet-'));
  const {getNetworkTxGasLimits}=await import('@aztec-labs/stdlib/gas');
  const {EmptyL1RollupConstants}=await import('@aztec-labs/stdlib/epoch-helpers');
  const {MAX_TX_DA_GAS}=await import('@aztec-labs/constants');
  const {default:defaults}=await import('@aztec-foundation/l1-artifacts/network-defaults.json',{with:{type:'json'}});
  const l1Constants={...EmptyL1RollupConstants,slotDuration:defaults.AZTEC_SLOT_DURATION,ethereumSlotDuration:defaults.ETHEREUM_SLOT_DURATION};
  // Reproduce the admission failure without deploying a chain or estimating the class again.
  const publicationDA=92049;assert.equal(getNetworkTxGasLimits({},l1Constants).daGas,55836);
  const calls=[],node={getNodeInfo:async()=>({realProofs:false,l1ChainId:31337,rollupVersion:7,l1ContractAddresses:{rollupAddress:'0x'+'1'.repeat(40)}}),prove:async()=>{calls.push('prove');return 4;}};
  try{
   const runtime=await startDevnet({directory:dir,fundingAddresses:[Fr.ONE]}, {
    startEthereum:async config=>{assert.deepEqual(config,{port:0});calls.push('ethereum');return {rpcUrl:'http://127.0.0.1:18545',stop:async()=>calls.push('stop-ethereum')};},
    createNetwork:async config=>{assert.equal(config.realProofs,false);assert.equal(config.automineEnableProveEpoch,true);assert.equal(config.testAccounts,false);assert.deepEqual(config.prefundAddresses,[String(Fr.ONE)]);assert.equal(config.useAutomineSequencer,undefined,'SDK coherent default owns sequencer');assert.equal(config.ethereumSlotDuration,undefined);assert.equal(config.dateProvider,undefined);
     const limits=getNetworkTxGasLimits(config,l1Constants);
     assert(limits.daGas>=publicationDA,'normal padded class publication must fit the native network admission limit');
     assert(limits.daGas<=MAX_TX_DA_GAS,'native protocol maximum stays enforced');
     calls.push('network');return{node,stop:async()=>calls.push('stop-network')};},
    startRpc:async({node:actual,config})=>{assert.equal(actual,node);assert.equal(config.realProofs,false);calls.push('rpc');return{url:'http://127.0.0.1:18080',close:async()=>calls.push('stop-rpc')};},
   });
   assert.equal(await runtime.settleCheckpoints(),4);await Promise.all([runtime.close(),runtime.close()]);
   assert.deepEqual(calls,['ethereum','network','rpc','prove','stop-rpc','stop-network','stop-ethereum']);
   assert.equal((await readDevnetRecord(path.join(dir,'network.json'))).phase,'stopped');
   await assert.rejects(startDevnet({directory:dir}),/fresh directory/);assert.equal(calls.length,7);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });
 test('native reorg mode disables only automatic settlement and rejects nonboolean settings before startup',async()=>{
  const {startDevnet}=await import('./network.mjs'),{bootstrapRollingDevnet}=await import('./bootstrap.mjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-reorg-'));let creates=0,settlements=0;
  try{
   for(const value of [null,0,1,'false',{}]){
    await assert.rejects(startDevnet({directory:dir,automineEnableProveEpoch:value}),/automatic settlement/);
    await assert.rejects(bootstrapRollingDevnet({directory:dir,automineEnableProveEpoch:value}),/automatic settlement/);
   }
   assert.deepEqual(await fs.readdir(dir),[]);
   const runtime=await startDevnet({directory:dir,automineEnableProveEpoch:false},{
    startEthereum:async()=>({rpcUrl:'http://127.0.0.1:18545',stop:async()=>{}}),
    createNetwork:async config=>{creates++;assert.equal(config.automineEnableProveEpoch,false);assert.equal(config.realProofs,false);
     return {node:{getNodeInfo:async()=>({realProofs:false,l1ChainId:31337,rollupVersion:7,l1ContractAddresses:{rollupAddress:'0x'+'1'.repeat(40)}}),prove:async()=>++settlements},stop:async()=>{}};},
    startRpc:async()=>({url:'http://127.0.0.1:18080',close:async()=>{}}),
   });
   try{assert.equal(creates,1);assert.equal(settlements,0);assert.equal(await runtime.settleCheckpoints(),1);}finally{await runtime.close();}
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });
 test('native setup failure stops its owned Ethereum and preserves the exact original cause',async()=>{
  const {startDevnet}=await import('./network.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-failed-'));const failure=Error('controlled native setup'),calls=[];
  try{await assert.rejects(startDevnet({directory:dir},{startEthereum:async()=>({rpcUrl:'http://127.0.0.1:18545',stop:async()=>calls.push('stop')}),createNetwork:async()=>{throw failure;}}),e=>e===failure);assert.deepEqual(calls,['stop']);}
  finally{await fs.rm(dir,{recursive:true,force:true});}
 });
 test('shutdown during SDK startup adopts and stops the late network without starting RPC',async()=>{
  const {startDevnet}=await import('./network.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-cancel-'));
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),calls=[];let owner;
  const starting=startDevnet({directory:dir,onOwned:value=>owner=value},{
   startEthereum:async()=>({rpcUrl:'http://127.0.0.1:18545',stop:async()=>calls.push('ethereum')}),
   createNetwork:async()=>{entered.resolve();await release.promise;return {node:{},stop:async()=>calls.push('network')};},
   startRpc:async()=>{assert.fail('RPC must not start after shutdown');},
  });
  try{await entered.promise;const stopping=owner.close();assert.deepEqual(calls,[]);release.resolve();await stopping;await assert.rejects(starting,/cancelled/);assert.deepEqual(calls,['network','ethereum']);}
  finally{await fs.rm(dir,{recursive:true,force:true});}
 });
 test('message availability uses actual SDK tree membership and mines only missing state',async()=>{
  const {ensureDevelopmentMessageReady}=await import('./network.mjs');let blocks=0,reads=0;
  const node={getL1ToL2MessageIndex:async()=>blocks?2n:undefined,getBlockData:async tip=>{assert.equal(tip,'checkpointed');reads++;return{header:{state:{l1ToL2MessageTree:{nextAvailableLeafIndex:blocks+1}}}};},mineBlock:async()=>{blocks++;}};
  await ensureDevelopmentMessageReady(node,Fr.ONE);assert.equal(blocks,2);assert.equal(reads,2);
  await ensureDevelopmentMessageReady(node,Fr.ONE);assert.equal(blocks,2,'Already consumable state causes no block');
  const failure=Error('controlled native build');node.getL1ToL2MessageIndex=async()=>undefined;node.mineBlock=async()=>{throw failure;};await assert.rejects(ensureDevelopmentMessageReady(node,Fr.ONE),e=>e===failure);
 });
 test('finality advances native state only for successful original receipts',async()=>{
  const {MinedTxReceipt,DroppedTxReceipt,PendingTxReceipt}=await import('@aztec-labs/stdlib/tx');const {BlockHash}=await import('@aztec-labs/stdlib/block');
  const hash=TxHash.fromString('0x'+'1'.repeat(64)),blockHash=BlockHash.fromString('0x'+'2'.repeat(64));
  const receipt=(status='finalized',result='success')=>new MinedTxReceipt(hash,status,result,1n,blockHash,3,1,0,0,undefined);
  let proven=false,blocks=0;const calls=[];
  const node={getTxReceipt:async()=>receipt(!proven?'checkpointed':blocks<2?'proven':'finalized'),getBlock:async()=>({hash:blockHash}),
   prove:async()=>{calls.push('prove');proven=true;},mineBlock:async()=>{calls.push('mine');blocks++;}};
  assert.deepEqual(await waitDevelopmentFinality({node,txHash:hash,timeoutMs:100}),{number:3,hash:String(blockHash)});
  assert.deepEqual(calls,['prove','mine','mine']);calls.length=0;
  await waitDevelopmentFinality({node,txHash:hash});assert.deepEqual(calls,[],'Already finalized result needs no native progress');
  for(const bad of [new DroppedTxReceipt(hash),new PendingTxReceipt(hash),receipt('proposed'),receipt('checkpointed','reverted'),receipt('proven','reverted'),receipt('finalized','reverted')]){
   node.getTxReceipt=async()=>bad;await assert.rejects(waitDevelopmentFinality({node,txHash:hash,timeoutMs:100}));assert.deepEqual(calls,[],'Failed or unconfirmed transaction must not drive blocks');
  }
  node.getTxReceipt=async()=>receipt('proven');node.getBlock=async()=>({hash:BlockHash.ZERO});await assert.rejects(waitDevelopmentFinality({node,txHash:hash}),/anchor changed/);assert.deepEqual(calls,[]);
  let changed=false;node.getTxReceipt=async()=>changed?new MinedTxReceipt(hash,'proven','success',1n,BlockHash.ZERO,4,1,0,0,undefined):receipt('proven');
  node.getBlock=async()=>({hash:changed?BlockHash.ZERO:blockHash});node.mineBlock=async()=>{calls.push('mine');changed=true;};
  await assert.rejects(waitDevelopmentFinality({node,txHash:hash}),/anchor changed/);assert.deepEqual(calls,['mine'],'Re-inclusion cannot replace the original anchor');
  node.getTxReceipt=async()=>receipt('proven');node.getBlock=async()=>({hash:blockHash});const failure=Error('controlled native mining failure');node.mineBlock=async()=>{throw failure;};
  await assert.rejects(waitDevelopmentFinality({node,txHash:hash}),e=>e===failure);
 });

 // Controlled SDK event delivery; real Inbox ABI decoding and native SDK
 // message readiness checks. No deployment, live service or payment is created.
 async function bridgeProgressFixture(){
  const {startDevelopmentBridgeProgress}=await import('./network.mjs');
  const {InboxAbi}=await import('@aztec-foundation/l1-artifacts/InboxAbi');
  const {Interface}=await import('ethers');const {decodeEventLog}=await import('viem');
  const address='0x'+'1'.repeat(40),state={blocks:0,unsubscribes:0,failures:[],options:null,queries:[],logs:[]};
  const node={getNodeInfo:async()=>({l1ChainId:31337,realProofs:false,l1ContractAddresses:{inboxAddress:address}}),
   getL1ToL2MessageIndex:async()=>2n,getBlockData:async tip=>{assert.equal(tip,'checkpointed');return {header:{state:{l1ToL2MessageTree:{nextAvailableLeafIndex:state.blocks?3:0}}}};},
   mineBlock:async()=>{state.blocks++;}};
  const client={getBlockNumber:async options=>{assert.deepEqual(options,{cacheTime:0});return 12n;},watchBlockNumber:options=>{state.options=options;return ()=>{state.unsubscribes++;};},getContractEvents:async options=>{state.queries.push(options);return state.logs;}};
  const start=()=>startDevelopmentBridgeProgress({node,client,inboxAddress:address,onFailure:error=>state.failures.push(error)});
  const abi=new Interface(InboxAbi),encoded=abi.encodeEventLog(abi.getEvent('MessageSent'),[Fr.ONE.toString(),Fr.ONE.toString(),0n,[[address,31337n],[Fr.ONE.toString(),1n],Fr.ONE.toString(),Fr.ONE.toString(),2n]]);
  const log={...decodeEventLog({abi:InboxAbi,...encoded,strict:true}),address,removed:false};
  state.logs=[log];return {node,client,state,start,log,encoded,address,InboxAbi};
 }
 test('development Inbox subscription drives browser funding only when its message needs a native block',async()=>{
  const f=await bridgeProgressFixture(),progress=await f.start();let resolved,reads=0;const ready=new Promise(resolve=>resolved=resolve),original=f.node.getBlockData;
  f.node.getBlockData=async tip=>{const value=await original(tip);if(++reads===3)resolved();return value;};
  assert.equal(f.state.options.poll,true);assert.equal(f.state.options.emitOnBegin,true);
  assert.equal(f.state.blocks,0);f.state.logs=[f.log,f.log];f.state.options.onBlockNumber(14n);await ready;
  assert.equal(f.state.queries[0].eventName,'MessageSent');assert.equal(f.state.queries[0].strict,true);assert.equal(f.state.queries[0].fromBlock,12n);assert.equal(f.state.queries[0].toBlock,14n);
  let queried;const nextRead=new Promise(resolve=>queried=resolve);f.client.getContractEvents=async options=>{f.state.queries.push(options);queried();return [];};
  f.state.options.onBlockNumber(14n);f.state.options.onBlockNumber(16n);await nextRead;
  await progress.close();assert.equal(f.state.queries.length,2);assert.equal(f.state.queries[1].fromBlock,15n);assert.equal(f.state.queries[1].toBlock,16n);
  assert.equal(f.state.blocks,1);assert.equal(f.state.unsubscribes,1);assert.deepEqual(f.state.failures,[]);
 });
 test('development bridge owner drains active mining and stops queued or late events before node shutdown',async()=>{
  const f=await bridgeProgressFixture();let entered,release;const active=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  f.node.mineBlock=async()=>{entered();await held;f.state.blocks++;};const progress=await f.start();
  f.state.options.onBlockNumber(12n);await active;f.state.options.onBlockNumber(12n);
  let closed=false;const closing=progress.close().then(()=>closed=true);assert.equal(f.state.unsubscribes,1);assert.equal(closed,false);
  f.state.options.onBlockNumber(12n);release();await closing;await progress.close();assert.equal(f.state.blocks,1);assert.equal(f.state.unsubscribes,1);
 });
 test('development bridge reports original mining/subscription failures and never retries a failed event',async()=>{
  for(const kind of ['mining','events','subscription']){
   const f=await bridgeProgressFixture(),failure=Error('controlled '+kind);let reported;const observed=new Promise(resolve=>reported=resolve);
   f.state.failures.push=error=>{assert.equal(error,failure);reported();};f.node.mineBlock=async()=>{f.state.blocks++;throw failure;};
   if(kind==='events')f.client.getContractEvents=async()=>{throw failure;};
   const progress=await f.start();if(kind==='subscription')f.state.options.onError(failure);else f.state.options.onBlockNumber(12n);
   await observed;f.state.options.onBlockNumber(12n);await assert.rejects(progress.close(),error=>error===failure);
   assert.equal(f.state.blocks,kind==='mining'?1:0);assert.equal(f.state.unsubscribes,1);
  }
 });
 test('development bridge rejects wrong native scope before subscribing and ignores removed Inbox logs',async()=>{
  const f=await bridgeProgressFixture(),original=f.node.getNodeInfo;
  for(const bad of [{l1ChainId:1},{realProofs:true},{l1ContractAddresses:{inboxAddress:'0x'+'2'.repeat(40)}}]){
   f.node.getNodeInfo=async()=>({...await original(),...bad});await assert.rejects(f.start(),/native development Inbox/);assert.equal(f.state.options,null);
  }
  f.node.getNodeInfo=original;f.state.blocks=1;let checked;const ready=new Promise(resolve=>checked=resolve),read=f.node.getBlockData;
  f.node.getBlockData=async tip=>{const value=await read(tip);checked();return value;};
  const progress=await f.start();f.state.logs=[{...f.log,args:{hash:'removed log is never decoded'},removed:true},f.log];f.state.options.onBlockNumber(12n);await ready;
  await progress.close();assert.equal(f.state.blocks,1);assert.deepEqual(f.state.failures,[]);
 });

 test('development bridge actual viem observer stops locally and drains event reads without server filter cleanup',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {createPublicClient,custom}=await import('viem'),{startDevelopmentBridgeProgress}=await import('./network.mjs');
  const f=await bridgeProgressFixture(),calls=[];let entered,release;
  const reading=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  const client=createPublicClient({pollingInterval:1,transport:custom({request:async({method,params})=>{
   calls.push(method);
   if(method==='eth_blockNumber')return '0xc';
   if(method==='eth_getLogs'){
    assert.equal(params[0].fromBlock,'0xc');assert.equal(params[0].toBlock,'0xc');entered();await held;
    return [{...f.encoded,address:f.address,blockHash:'0x'+'2'.repeat(64),blockNumber:'0xc',transactionHash:'0x'+'3'.repeat(64),transactionIndex:'0x0',logIndex:'0x0',removed:false}];
   }
   throw Error('Unexpected filter RPC '+method);
  }},{retryCount:0})});
  const progress=await startDevelopmentBridgeProgress({node:f.node,client,inboxAddress:f.address});await reading;
  let closed=false;const closing=progress.close().then(()=>closed=true);assert.equal(closed,false,'Owned event read must drain before network shutdown');
  release();await closing;assert.equal(f.state.blocks,0,'Closing prevents an outstanding event read from starting mining');
  const atClose=[...calls];t.mock.timers.tick(10000);await Promise.resolve();await Promise.resolve();
  assert.deepEqual(calls,atClose);assert.deepEqual(calls,['eth_blockNumber','eth_blockNumber','eth_getLogs']);await progress.close();
 });

 test('development query gateway pins existing disabled service and canonical compact tier',async()=>{
  const {developmentQueryServiceConfig}=await import('./bootstrap.mjs');
  const config=developmentQueryServiceConfig({directory:'/private/tmp/development',appPort:8081,nodeUrl:'http://127.0.0.1:18081',rollupAddress:'0x'+'1'.repeat(40),rollupVersion:1,board:'0x'+'2'.repeat(64),privateFeeAddress:'0x'+'3'.repeat(64),privateBokAddress:'0x'+'4'.repeat(64)});
  assert.equal(config.host,'127.0.0.1');assert.equal(config.port,0);assert.equal(config.chainId,31337);assert.equal(config.proofs,'disabled');assert.equal(config.applicationProfile,'rolling');assert.equal(config.bokEnabled,true);
  assert.deepEqual(config.compactBlocks,{tier:'checkpointed'});assert.equal(config.compactRequestsPerMinute,1800);assert.deepEqual(config.origins,['http://127.0.0.1:8081','http://localhost:8081']);assert.equal(config.queryNode.url,'http://127.0.0.1:18081');assert.equal(config.queryNode.maxLagSeconds,120);
  const source=await fs.readFile(new URL('./bootstrap.mjs',import.meta.url),'utf8');assert(source.includes("queryService.address.port+'/v1/node'"));assert(source.includes('trustedQuery:{url:queryUrl,allowLocalDev:true}'));
  assert(source.includes("{onQueryFailure:(code,diagnostic)=>onProgress(JSON.stringify({event:'development-query-unavailable',code,at:Date.now(),...(diagnostic?{diagnostic}:{})}))}"));
  assert.equal(Object.hasOwn(config,'onQueryFailure'),false);
  assert(source.indexOf('await queryService?.close()')<source.indexOf('await net.close()',source.indexOf('await queryService?.close()')));
 });
 test('development native RPC retains ordinary and compact APIs and delegates standard SDK operator controls',async()=>{
  const {startDevelopmentNodeRpc}=await import('./network.mjs');
  const {createAztecNodeDebugClient}=await import('@aztec-labs/stdlib/interfaces/client');
  const events=[],nativeCalls=[];const unused=async()=>{throw Error('Unexpected native read');};
  const node={getNodeInfo:unused,getChainTips:unused,getWorldStateSyncStatus:unused,getSyncedL1Timestamp:unused,getBlockData:unused,getBlock:unused,getBlockNumber:async()=>7,
   // Labelled native delegate: verifies SDK transport, not chain execution.
   mineBlock:async()=>{nativeCalls.push(['mineBlock']);},prove:async checkpoint=>{nativeCalls.push(['prove',checkpoint]);return checkpoint??4;}};
  const service=await startDevelopmentNodeRpc({node,config:{l1ChainId:31337,rollupVersion:1,rollupAddress:'0x'+'1'.repeat(40),realProofs:false},onProgress:value=>{events.push(JSON.parse(value));return new Promise(()=>{});}});
  try{
   assert.equal(new URL(service.url).hostname,'127.0.0.1');
   const debug=createAztecNodeDebugClient(service.url);
   await debug.mineBlock();assert.equal(await debug.prove(),4);assert.equal(await debug.prove(3),3);
   assert.deepEqual(nativeCalls,[['mineBlock'],['prove',undefined],['prove',3]]);
   const wrongMethod=await fetch(service.url+'/rolling/compact-block-v1');assert.equal(wrongMethod.status,405);await wrongMethod.body.cancel();
   const origin=await fetch(service.url+'/rolling/compact-block-v1',{method:'POST',headers:{origin:'http://127.0.0.1:8081','content-type':'application/json'},body:'{}'});assert.equal(origin.status,415);await origin.body.cancel();
   const malformed=await fetch(service.url+'/rolling/compact-block-v1',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(malformed.status,400);await malformed.body.cancel();assert.deepEqual({...events[0],at:0},{event:'development-compact-unavailable',at:0,stage:'request',status:400,diagnostic:null});
   const ordinary=await fetch(service.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'aztec_getBlockNumber',params:[]})});assert.equal(ordinary.status,200);assert.equal((await ordinary.json()).result,7);
  }finally{await service.close();}
  await assert.rejects(fetch(service.url,{signal:AbortSignal.timeout(1000)}));
 });
 test('development operator RPC rejects public chains and enabled or unspecified proofs before native access',async()=>{
  const {startDevelopmentNodeRpc}=await import('./network.mjs');
  const node=new Proxy({},{get(){assert.fail('Rejected configuration must not access native node');}});
  for(const config of [{l1ChainId:1,realProofs:false},{l1ChainId:11155111,realProofs:false},{l1ChainId:31337,realProofs:true},{l1ChainId:31337},{}]){
   await assert.rejects(startDevelopmentNodeRpc({node,config}),/proof-disabled development chain/);
  }
 });
 test('development compact shutdown waits for its original pending native request',async()=>{
  const {startDevelopmentNodeRpc}=await import('./network.mjs');let release,started;
  const entered=new Promise(resolve=>{started=resolve;}),held=new Promise(resolve=>{release=resolve;});const unused=async()=>{throw Error('Unexpected native read');};
  const node={getNodeInfo:async()=>{started();await held;throw Error('Controlled native failure');},getChainTips:unused,getWorldStateSyncStatus:unused,getSyncedL1Timestamp:unused,getBlockData:unused,getBlock:unused};
  const service=await startDevelopmentNodeRpc({node,config:{l1ChainId:31337,rollupVersion:1,rollupAddress:'0x'+'1'.repeat(40),realProofs:false}});
  let closing;const response=fetch(service.url+'/rolling/compact-block-v1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,number:1,hash:'0x'+'1'.padStart(64,'0'),tier:'checkpointed'})}).then(r=>r.body.cancel(),()=>{});
  try{await entered;let complete=false;closing=service.close().then(()=>{complete=true;});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(complete,false);release();await closing;await response;assert.equal(complete,true);}
  finally{release();await service.close();await response;}
 });

}
