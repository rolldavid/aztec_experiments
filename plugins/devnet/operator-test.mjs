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
import {bootstrapPluginDevnet} from './bootstrap.mjs';import {drainDevnetCheckpoints} from './network.mjs';
import {operatorCommand} from '../operator.mjs';import {packText,handleField} from '../protocol.mjs';
import {settleC01ApplicationMessage} from '../../scripts/c01-settle-application-message.mjs';
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
 fixture.net.node.getSequencer().updateConfig({minTxsPerBlock:0,buildCheckpointIfEmpty:true});
 let feeWitness;const feeDeadline=Date.now()+90000;
 while(Date.now()<feeDeadline){await fixture.wallet.pxe.sync();const header=await fixture.wallet.pxe.getSyncedBlockHeader();feeWitness=await fixture.net.node.getL1ToL2MessageMembershipWitness(header.getBlockNumber(),Fr.fromString(credit.messageHash));if(feeWitness)break;await new Promise(r=>setTimeout(r,1000));}
 assert(feeWitness);fixture.net.node.getSequencer().updateConfig({minTxsPerBlock:1,buildCheckpointIfEmpty:false});await drainDevnetCheckpoints(fixture.net);
 const claimed=await run('claim-fees',{actor:actor(fresh),claim:claimPath});assert(BigInt(claimed.publicFeeJuice)>0n);report.zeroBalanceFeeOnboarding=true;
 for(const command of ['deploy-escrow','deploy-portal','bind']){
  mark(command);await run(command);const before=JSON.stringify(await read(statePath));
  await run(command);assert.equal(JSON.stringify(await read(statePath)),before,'Repeated command must reuse its transaction');
  if(command==='deploy-escrow'){
   await assert.rejects(run(command,{actor:actor(fixture.operator)}),/another actor/);
   assert.equal(JSON.stringify(await read(statePath)),before,'Wrong-actor replay must preserve deployment state');
  }
 }
 const settle=async hash=>{const txHash=TxHash.fromString(hash),effect=await fixture.net.node.getTxEffect(txHash);return settleC01ApplicationMessage({node:fixture.net.node,config:fixture.net.config,dateProvider:fixture.net.dateProvider,l1Client:fixture.net.deployment.l1Client,directory,rollupAddress:info.l1ContractAddresses.rollupAddress,txHash,expectedLeaf:effect.data.l2ToL1Msgs.find(x=>!x.isZero()),kind:'exit',applicationProofs:report.applicationProofs});};
 await settle((await read(statePath)).operations.bind.hash);
 for(const command of ['activate','config','register']){mark(command);await run(command);}
 const state=await read(statePath),portalArtifact=await read('billboard/portal/out/PluginPortal.sol/PluginPortal.json');
 const portal=new Contract(state.portal,portalArtifact.abi,fixture.signer);
 await (await fixture.token.approve(state.portal,1000000n)).wait();
 const receipt=await(await portal.deposit(String(fixture.author.address),1000000n,String(await computeSecretHash(Fr.ONE)))).wait();
 const event=receipt.logs.map(x=>{try{return portal.interface.parseLog(x);}catch{return null;}}).find(x=>x?.name==='Deposited');
 fixture.net.node.getSequencer().updateConfig({minTxsPerBlock:0,buildCheckpointIfEmpty:true});
 const deadline=Date.now()+90000;let witness;
 while(Date.now()<deadline){await fixture.wallet.pxe.sync();const header=await fixture.wallet.pxe.getSyncedBlockHeader();witness=await fixture.net.node.getL1ToL2MessageMembershipWitness(header.getBlockNumber(),Fr.fromString(event.args.key));if(witness)break;await new Promise(r=>setTimeout(r,1000));}
 assert(witness);fixture.net.node.getSequencer().updateConfig({minTxsPerBlock:1,buildCheckpointIfEmpty:false});await drainDevnetCheckpoints(fixture.net);
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
 const {developmentOptions}=await import('./start.mjs');const {devnetPorts,readDevnetRecord,writeDevnetRecord,validateDevnetResume,assertDevnetPortsFree}=await import('./network.mjs');
 test('current development defaults are Rolling, loopback ports and no provider prerequisite',()=>{const p=developmentOptions([],{VENICE_WALLET_PRIVATE_KEY:undefined});assert.equal(p.profile,'rolling');assert.deepEqual(p.ports,{ethereumPort:18545,nodePort:18080,appPort:8080});assert.equal(p.hostedConfig,undefined);});
 test('development flags reject real proofs, duplicate ports and unknown arguments before startup',()=>{assert.throws(()=>developmentOptions([],{PLUGIN_PROOFS:'true'}));assert.throws(()=>developmentOptions(['--app-port','18080']));assert.throws(()=>developmentOptions(['--app-port','8080','--app-port','8081']));assert.throws(()=>developmentOptions(['--network','testnet']));assert.throws(()=>developmentOptions(['--app-port','0']));});
 test('selected state and separate loopback ports are explicit',()=>{const p=developmentOptions(['--directory','/tmp/owned-local-devnet','--app-port','18081','--node-port','18082','--ethereum-port','18546']);assert.equal(p.directory,'/tmp/owned-local-devnet');assert.equal(p.ports.appPort,18081);});
 test('occupied development port fails before changing an existing listener',async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await assert.rejects(assertDevnetPortsFree({ethereumPort:server.address().port,nodePort:18083,appPort:18084}),/already owned/);assert(server.listening);}finally{await new Promise(r=>server.close(r));}});
 test('private state uses exclusive creation, closed reads and atomic replacement',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-dev-state-'));await fs.chmod(dir,0o700);const file=path.join(dir,'state.json');try{assert.equal(await readDevnetRecord(file),null);await writeDevnetRecord(file,{phase:'starting'},{exclusive:true});assert.equal((await fs.stat(file)).mode&0o777,0o600);await assert.rejects(writeDevnetRecord(file,{phase:'replacement'},{exclusive:true}));assert.deepEqual(await readDevnetRecord(file),{phase:'starting'});await writeDevnetRecord(file,{phase:'stopped'});assert.deepEqual(await readDevnetRecord(file),{phase:'stopped'});await fs.chmod(file,0o644);await assert.rejects(readDevnetRecord(file));await fs.unlink(file);await fs.symlink('target.json',file);await assert.rejects(readDevnetRecord(file));}finally{await fs.rm(dir,{recursive:true,force:true});}});
 const ports=devnetPorts(),fundingAddresses=['0x'+'1'.repeat(64)],toolchainHash='2'.repeat(64);
 const stopped={schemaVersion:1,phase:'stopped',toolchainHash,ports,fundingAddresses,privateKey:'0x'+'3'.repeat(64),validatorSecret:'0x'+'4'.repeat(64),snapshotHash:'5'.repeat(64),mnemonic:Array(12).fill('synthetic').join(' '),addresses:{rollupAddress:'0x'+'6'.repeat(40)},rollupVersion:7};
 test('clean restart preserves exact original identity scope',()=>assert.equal(validateDevnetResume(stopped,{fundingAddresses,ports,toolchainHash}),stopped));
 for(const [name,change] of [['unclean',{phase:'running'}],['starting',{phase:'starting'}],['other genesis',{fundingAddresses:['0x'+'9'.repeat(64)]}],['other ports',{ports:{...ports,nodePort:18085}}],['other binary scope',{toolchainHash:'9'.repeat(64)}],['missing snapshot',{snapshotHash:null}]])test('restart refuses '+name+' without reset',()=>assert.throws(()=>validateDevnetResume({...stopped,...change},{fundingAddresses,ports,toolchainHash}),/recovery required/));
 test('development lease rejects symlinked parent and preserves a replaced owner inode',async()=>{
  const {acquireDevelopmentLease}=await import('./start.mjs');const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rolling-owner-'))),root=path.join(parent,'state'),link=path.join(parent,'link');
  try{await fs.mkdir(root,{mode:0o700});await fs.symlink(parent,link);await assert.rejects(acquireDevelopmentLease(path.join(link,'state')),/canonical/);
   const lease=await acquireDevelopmentLease(root);await lease.assertHeld();await assert.rejects(acquireDevelopmentLease(root),{code:'EEXIST'});
   const lock=path.join(root,'hosted.lock');await fs.rename(lock,lock+'.original');await fs.writeFile(lock,'replacement',{mode:0o600,flag:'wx'});
   await assert.rejects(lease.assertHeld(),/changed/);await assert.rejects(lease.close(),/changed/);assert.equal(await fs.readFile(lock,'utf8'),'replacement');
   await fs.unlink(lock);const second=await acquireDevelopmentLease(root);await second.close();await assert.rejects(fs.stat(lock),{code:'ENOENT'});
   await fs.chmod(root,0o755);await assert.rejects(acquireDevelopmentLease(root),/private/);
  }finally{await fs.rm(parent,{recursive:true,force:true});}
 });
 test('actual checkpoint boundary surfaces miner failure and incomplete shutdown without saving',async()=>{
  const {persistDevnetCheckpoint}=await import('./network.mjs');let saves=0;const save=async()=>{saves++;};
  for(const change of [{miningError:Error('controlled miner failure')},{bootComplete:false},{priorFailure:true}])await assert.rejects(persistDevnetCheckpoint({persistent:true,bootComplete:true,miningError:null,priorFailure:false,save,...change}),/recovery required/);
  assert.equal(saves,0);await persistDevnetCheckpoint({persistent:true,bootComplete:true,miningError:null,priorFailure:false,save});assert.equal(saves,1);
  await assert.rejects(persistDevnetCheckpoint({persistent:true,bootComplete:true,priorFailure:false,save:async()=>{throw Error('controlled disk failure');}}),/disk failure/);
 });

 test('missing network metadata cannot reset retained chain snapshots, node data or deployment journals',async()=>{
  const {assertFreshDevnetDirectory}=await import('./network.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rolling-incomplete-'));
  try{await assertFreshDevnetDirectory(dir);await fs.writeFile(path.join(dir,'operator.json'),'{}',{mode:0o600});await fs.writeFile(path.join(dir,'hosted.lock'),'1',{mode:0o600});await assertFreshDevnetDirectory(dir);
   for(const name of ['ethereum-state.json','node','deployment.json','bok-operations.json']){const p=path.join(dir,name);if(name==='node')await fs.mkdir(p);else await fs.writeFile(p,'retained',{mode:0o600});await assert.rejects(assertFreshDevnetDirectory(dir),/metadata missing/);assert(await fs.lstat(p));await fs.rm(p,{recursive:true});}
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });

 const {deployDevelopmentToken,activateDevelopmentBok,requireDevelopmentBokRecords}=await import('./bootstrap.mjs');
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
 async function tokenFixture(){
  const {Wallet,Interface,Transaction,getCreateAddress}=await import('ethers');const wallet=Wallet.createRandom(),iface=new Interface(['constructor(address recipient)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)']);
  const artifact={abi:JSON.parse(iface.formatJson()),bytecode:{object:'0x60006000'},deployedBytecode:{object:'0x6000'}},address=getCreateAddress({from:wallet.address,nonce:4}).toLowerCase(),blockHash='0x'+'8'.repeat(64);
  let record={operations:{}},receipt,mutate={},sends=0,prepares=0;
  const store={read:()=>record,write:async next=>{record=structuredClone(next);}};
  const provider={getNetwork:async()=>({chainId:31337n}),getTransactionReceipt:async()=>mutate.missing?null:receipt,getBlock:async()=>({number:7,hash:mutate.reorg?'0x'+'9'.repeat(64):blockHash}),getCode:async()=>mutate.code??artifact.deployedBytecode.object,
   call:async tx=>{const parsed=iface.parseTransaction(tx);return iface.encodeFunctionResult(parsed.name,[parsed.name==='decimals'?6:mutate.inventory??1000000000n]);},
   broadcastTransaction:async raw=>{sends++;const tx=Transaction.from(raw);receipt={hash:tx.hash,status:1,blockNumber:7,blockHash,contractAddress:address};return {hash:tx.hash};}};
  const signer={address:wallet.address,populateTransaction:async tx=>{prepares++;return {...tx,nonce:4,chainId:31337n,type:2,gasLimit:1000000n,maxFeePerGas:2n,maxPriorityFeePerGas:1n};},signTransaction:tx=>wallet.signTransaction(tx)};
  return {args:{provider,signer,artifact,store,rollupAddress:'0x'+'1'.repeat(40)},mutate,counts:()=>({sends,prepares}),address};
 }
 test('actual development token journal signs once and reconciles exact creation/runtime/inventory (controlled chain)',async()=>{
  const f=await tokenFixture();const first=await deployDevelopmentToken(f.args);assert.equal(first.status,'succeeded');assert.equal(first.tokenAddress,f.address);assert.equal(first.kind,'local-development-issuance');assert.equal(first.inventory,'1000000000');
  const before=JSON.stringify(f.args.store.read());assert.equal((await deployDevelopmentToken(f.args)).status,'succeeded');assert.equal(JSON.stringify(f.args.store.read()),before);assert.deepEqual(f.counts(),{sends:1,prepares:1});
  for(const mutation of [{missing:true},{reorg:true},{code:'0x6001'},{inventory:999n}]){Object.assign(f.mutate,mutation);assert.equal((await deployDevelopmentToken(f.args)).status,'unresolved');for(const key of Object.keys(mutation))delete f.mutate[key];assert.deepEqual(f.counts(),{sends:1,prepares:1});}
 });
 test('development token unknown/preparing state is retained and never resubmitted',async()=>{
  const f=await tokenFixture();f.args.provider.broadcastTransaction=async()=>{throw Error('controlled lost acknowledgement');};assert.equal((await deployDevelopmentToken(f.args)).status,'unresolved');const before=JSON.stringify(f.args.store.read());await deployDevelopmentToken(f.args);assert.equal(JSON.stringify(f.args.store.read()),before);assert.equal(f.counts().prepares,1);
  const g=await tokenFixture();g.args.signer.signTransaction=async()=>{throw Error('controlled preparation stop');};assert.equal((await deployDevelopmentToken(g.args)).status,'unresolved');await deployDevelopmentToken(g.args);assert.equal(g.counts().prepares,1);assert.equal(g.args.store.read().operations['deploy-portal'].phase,'preparing');
 });
 test('development inventory refuses another chain or changed creation scope before any send',async()=>{
  const f=await tokenFixture();f.args.provider.getNetwork=async()=>({chainId:11155111n});await assert.rejects(deployDevelopmentToken(f.args),/prerequisite/);assert.deepEqual(f.counts(),{sends:0,prepares:0});
  const g=await tokenFixture();await deployDevelopmentToken(g.args);await assert.rejects(deployDevelopmentToken({...g.args,rollupAddress:'0x'+'2'.repeat(40)}),/scope mismatch/);assert.deepEqual(g.counts(),{sends:1,prepares:1});
 });

 test('missing token or lifecycle records cannot reset an advanced retained Bok campaign',()=>{
  const tokenState={operations:{'deploy-portal':{phase:'submission-unknown'}}},lifecycleConfig={lifecycle:{tokenAddress:'controlled'}},operatorState={operations:{'deploy-escrow':{}}};
  requireDevelopmentBokRecords({operatorState});requireDevelopmentBokRecords({operatorState,tokenState});requireDevelopmentBokRecords({operatorState,tokenState,lifecycleConfig});
  for(const name of ['deploy-portal','bind','activate','register']){const advanced={operations:{[name]:{}}};assert.throws(()=>requireDevelopmentBokRecords({operatorState:advanced}),/records missing/);assert.throws(()=>requireDevelopmentBokRecords({operatorState:advanced,tokenState}),/records missing/);requireDevelopmentBokRecords({operatorState:advanced,tokenState,lifecycleConfig});}
  assert.throws(()=>requireDevelopmentBokRecords({operatorState,lifecycleConfig}),/records missing/);
 });

}
