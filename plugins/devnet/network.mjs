import {RollupAbi} from '@aztec-foundation/l1-artifacts/RollupAbi';
import {localApplicationInboxProfile} from '../../scripts/c01-native-profile.mjs';
import {bbBinary} from '../../scripts/toolchain.mjs';
// Disposable local development network. No production defaults are modified.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createExtendedL1Client} from '@aztec-labs/ethereum/client';
import {foundry} from 'viem/chains';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {Wallet} from 'ethers';
import {getGenesisValues} from '@aztec-labs/world-state/testing';
import {getConfigEnvVars} from '@aztec-labs/aztec-node/config';
import {createAztecNodeService} from '@aztec-labs/aztec-node';
import {SecretValue} from '@aztec-labs/foundation/config';
import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {TestDateProvider} from '@aztec-labs/foundation/timer';
import {createBlobClient} from '@aztec-labs/blob-client/client';
import {initTelemetryClient} from '@aztec-labs/telemetry-client';
import {RollupContract} from '@aztec-labs/ethereum/contracts/rollup';
import {createNamespacedSafeJsonRpcServer} from '@aztec-labs/foundation/json-rpc/server';
import {AztecNodeApiSchema} from '@aztec-labs/stdlib/interfaces/client';
import {deployC01ApplicationProtocol} from '../../scripts/c01-application-deployment.mjs';
import {synchronizeC01MinedClock} from '../../scripts/c01-client-mining.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export function devnetPorts(value={}) {
  const result={ethereumPort:value.ethereumPort??18545,nodePort:value.nodePort??18080,appPort:value.appPort??8080};
  if(Object.values(result).some(p=>!Number.isSafeInteger(p)||p<1024||p>65535)||new Set(Object.values(result)).size!==3)throw Error('Invalid local devnet ports');
  return result;
}
export async function readDevnetRecord(filename) {
  let handle;try{handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);const st=await handle.stat();
    if(!st.isFile()||(st.mode&0o077)||st.size>1048576)throw Error('Invalid private devnet record');
    return JSON.parse(await handle.readFile('utf8'));
  }catch(error){if(error.code==='ENOENT')return null;throw Error('Invalid private devnet record');}finally{await handle?.close();}
}
export async function writeDevnetRecord(filename,value,{exclusive=false}={}) {
  if(exclusive){const fd=await fs.open(filename,'wx',0o600);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}return;}
  const tmp=filename+'.tmp';const fd=await fs.open(tmp,'wx',0o600);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}
  await fs.rename(tmp,filename);const parent=await fs.open(path.dirname(filename),'r');try{await parent.sync();}finally{await parent.close();}
}
export function validateDevnetResume(record,{fundingAddresses,ports,toolchainHash}) {
  if(record?.schemaVersion!==1||record.phase!=='stopped'||record.toolchainHash!==toolchainHash||
    JSON.stringify(record.ports)!==JSON.stringify(ports)||JSON.stringify(record.fundingAddresses)!==JSON.stringify(fundingAddresses.map(String))||
    !/^0x[0-9a-f]{64}$/.test(record.privateKey??'')||!/^0x[0-9a-f]{64}$/.test(record.validatorSecret??'')||
    !/^[0-9a-f]{64}$/.test(record.snapshotHash??'')||typeof record.mnemonic!=='string'||record.mnemonic.split(' ').length!==12||!record.addresses||!Number.isSafeInteger(record.rollupVersion))throw Error('Devnet recovery required; preserve the original state');
  return record;
}
export async function assertDevnetPortsFree(ports) {
  const listeners=[];try{for(const port of Object.values(devnetPorts(ports))){const server=net.createServer();listeners.push(server);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}}
  catch{throw Error('A selected development port is already owned');}finally{await Promise.all(listeners.filter(s=>s.listening).map(s=>new Promise(r=>s.close(r))));}
}
export async function assertFreshDevnetDirectory(directory) {
  const allowed=new Set(['operator.json','hosted.lock']);
  if((await fs.readdir(directory)).some(name=>!allowed.has(name)))throw Error('Original development network metadata missing; recovery required');
}
// Only a completely stopped, healthy network may mark its snapshot restartable.
export async function persistDevnetCheckpoint({persistent,bootComplete,miningError,priorFailure,save}) {
  if(miningError)throw Error('Development miner failed; recovery required');
  if(!persistent)return;
  if(!bootComplete||priorFailure)throw Error('Development checkpoint incomplete; recovery required');
  await save();
}
export function developmentAnvilArgs({persistent,port,mnemonic}) {
 // Match the installed official SDK's local finality depth. This changes only
 // disposable Anvil configuration, never application or testnet finality checks.
 return ['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--mnemonic',mnemonic,'--silent',...(persistent?['--no-request-size-limit','--slots-in-an-epoch','1']:[])];
}
export async function startDevnet({directory,fundingAddresses,proofs=false,persistent=false,ports:requestedPorts,onProgress=()=>{},onOwned=()=>{}}){
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const ports=devnetPorts(requestedPorts),statePath=path.join(directory,'network.json'),snapshotPath=path.join(directory,'ethereum-state.json');
  const toolchainHash=createHash('sha256').update(await fs.readFile(new URL('../../toolchain.json',import.meta.url))).digest('hex');
  let saved=persistent?await readDevnetRecord(statePath):null;
  if(persistent)await assertDevnetPortsFree(ports);
  if(persistent&&proofs!==false)throw Error('Persistent local development requires native proofs disabled');
  if(saved)validateDevnetResume(saved,{fundingAddresses,ports,toolchainHash});
  else if(persistent)await assertFreshDevnetDirectory(directory);
  const identity=saved?Wallet.fromPhrase(saved.mnemonic):Wallet.createRandom(),validatorSecret=saved?Fr.fromString(saved.validatorSecret):Fr.random();
  if(saved&&identity.privateKey!==saved.privateKey)throw Error('Original development signer differs');
  const port=persistent?ports.ethereumPort:await freePort(),rpcUrl='http://127.0.0.1:'+port;
  let state=saved??{schemaVersion:1,toolchainHash,ports,fundingAddresses:fundingAddresses.map(String),privateKey:identity.privateKey,mnemonic:identity.mnemonic.phrase,validatorSecret:String(validatorSecret)};
  if(persistent)await writeDevnetRecord(statePath,{...state,phase:'starting'},{exclusive:!saved});
  let deployment,bootComplete=false,wallMode=false;
  const terminateChild=()=>{if(anvil&&anvil.exitCode===null)anvil.kill('SIGTERM');};
  let node,nodeServer,anvil,mining,stopMining=false,miningError,spawnError,anvilClosed,closing;
  function close(){return closing??=(async()=>{
    stopMining=true;const failures=[];
    for(const cleanup of [()=>mining,()=>nodeServer&&new Promise(resolve=>{nodeServer.close(resolve);nodeServer.closeAllConnections();}),()=>node?.stop(),async()=>{
      await persistDevnetCheckpoint({persistent,bootComplete,miningError,priorFailure:failures.length>0,save:async()=>{
        const snapshot=await deployment.l1Client.request({method:'anvil_dumpState',params:[true]});
        if(typeof snapshot!=='string'||!/^0x[0-9a-f]+$/i.test(snapshot)||snapshot.length>134217728)throw Error('Invalid development snapshot');
        const bytes=JSON.stringify(snapshot);await writeDevnetRecord(snapshotPath,snapshot);
        await writeDevnetRecord(statePath,{...state,phase:'stopped',snapshotHash:createHash('sha256').update(bytes+'\n').digest('hex')});
      }});
    },async()=>{if(anvil&&anvil.exitCode===null&&!spawnError){anvil.kill('SIGTERM');await anvilClosed;}}]){
      try{await cleanup();}catch(error){failures.push(error);}
    }
    process.removeListener('exit',terminateChild);
    if(failures.length)throw new AggregateError(failures,'Devnet cleanup failed');
  })();}
  onOwned({close});
  try{
    onProgress('Starting disposable Ethereum');
    // Retained snapshots exceed Anvil's default 2MB RPC body limit. This
    // isolated loopback process loads only the private, hash-bound <=128MiB file.
    anvil=spawn(path.resolve('.build/anvil-1.7.0/anvil'),developmentAnvilArgs({persistent,port,mnemonic:identity.mnemonic.phrase}),{stdio:'ignore'});
    process.once('exit',terminateChild);
    anvilClosed=new Promise(resolve=>{anvil.once('error',error=>{spawnError=error;resolve();});anvil.once('close',resolve);});
    let ready=false;
    for(let i=0;i<60;i++){
      if(spawnError)throw spawnError;
      if(anvil.exitCode!==null)throw Error('Local Ethereum exited during startup');
      try{const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_accounts',params:[]}),signal:AbortSignal.timeout(500)});ready=(await response.json()).result?.[0]?.toLowerCase()===identity.address.toLowerCase();}catch{}
      if(ready)break;await pause(100);
    }
    if(!ready)throw Error('Local Ethereum failed to start');
    if(saved){
      const fd=await fs.open(snapshotPath,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const st=await fd.stat();if(!st.isFile()||(st.mode&0o077)||st.size>134217728)throw Error('Invalid development snapshot');bytes=await fd.readFile();}finally{await fd.close();}
      if(createHash('sha256').update(bytes).digest('hex')!==saved.snapshotHash)throw Error('Development snapshot differs');
      const c=createExtendedL1Client([rpcUrl],identity.privateKey,foundry);if(await c.request({method:'anvil_loadState',params:[JSON.parse(bytes)]})!==true)throw Error('Development snapshot did not load');
    }else{
      const c=createExtendedL1Client([rpcUrl],identity.privateKey,foundry);await c.request({method:'anvil_setBalance',params:[identity.address,'0x3635c9adc5dea00000']});
    }
    if(saved){const c=createExtendedL1Client([rpcUrl],identity.privateKey,foundry);await c.request({method:'evm_setAutomine',params:[true]});}
    const {genesisArchiveRoot,fundingNeeded,genesis}=await getGenesisValues(fundingAddresses);
    const validator=EthAddress.fromString(identity.address);
    const config={...getConfigEnvVars(),l1RpcUrls:[rpcUrl],l1ChainId:31337,realProofs:proofs,debugForceTxProofVerification:false,
      useAutomineSequencer:false,automineEnableProveEpoch:false,p2pEnabled:false,
      ethereumSlotDuration:1,aztecSlotDuration:5,blockDurationMs:1000,aztecEpochDuration:4,inboxLag:2,
      aztecProofSubmissionEpochs:64,aztecTargetCommitteeSize:1,slasherEnabled:false,
      initialValidators:[{attester:validator,withdrawer:validator,bn254SecretKey:new SecretValue(validatorSecret.toBigInt())}]};
    onProgress('Deploying local rollup');
    deployment=saved?{l1Client:createExtendedL1Client([rpcUrl],identity.privateKey,foundry),rollupVersion:saved.rollupVersion,
      l1ContractAddresses:Object.fromEntries(Object.entries(saved.addresses).map(([k,v])=>[k,EthAddress.fromString(v)]))}:
      (await deployC01ApplicationProtocol({rpcUrl,privateKey:identity.privateKey,config,genesisArchiveRoot,fundingNeeded})).deployment;
    if(persistent){state={...state,rollupVersion:deployment.rollupVersion,addresses:Object.fromEntries(Object.entries(deployment.l1ContractAddresses).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]))};await writeDevnetRecord(statePath,{...state,phase:'running'});}
    if(saved){const code=await deployment.l1Client.getBytecode({address:saved.addresses.rollupAddress});if(!code||code==='0x'||Number(await deployment.l1Client.getChainId())!==31337)throw Error('Restored rollup is unavailable');}
    const rollup=new RollupContract(deployment.l1Client,deployment.l1ContractAddresses.rollupAddress.toString());
    let active=!!saved;
    for(let i=0;i<8&&!active;i++){
      active=(await rollup.getCurrentEpochCommittee())?.some(a=>a.toString().toLowerCase()===identity.address.toLowerCase());if(active)break;
      const block=await deployment.l1Client.getBlock({blockTag:'latest'});
      await deployment.l1Client.request({method:'evm_setNextBlockTimestamp',params:[Number(block.timestamp)+20]});
      await deployment.l1Client.request({method:'evm_mine',params:[]});
    }
    if(!active)throw Error('Local validator activation failed');
    const dateProvider=new TestDateProvider({warn(){}});
    // A retained local chain may have been stopped for hours. Initialize the
    // same mined clock used below before the archiver checks Ethereum drift.
    synchronizeC01MinedClock(dateProvider,Number((await deployment.l1Client.getBlock({blockTag:'latest'})).timestamp));
    const nodeConfig={...config,...localApplicationInboxProfile(config),...deployment.l1ContractAddresses,rollupVersion:deployment.rollupVersion,
      dataDirectory:path.join(directory,'node'),bootstrapNodes:[],txPublicSetupAllowListExtend:[],
      sequencerPublisherPrivateKeys:[new SecretValue(identity.privateKey)],validatorPrivateKeys:new SecretValue([identity.privateKey]),coinbase:validator,
      allowEphemeralSigningProtection:true,enableProverNode:false,proverAgentCount:0,
      bbBinaryPath:bbBinary(),bbWorkingDirectory:path.join(directory,'bb-work'),bbIVCConcurrency:1,bbChonkVerifyConcurrency:1,numConcurrentIVCVerifiers:1};
    onProgress('Starting Aztec '+(proofs?'with proofs':'without proof generation'));
    node=await createAztecNodeService(nodeConfig,{telemetry:await initTelemetryClient({}),blobClient:createBlobClient(),dateProvider},{genesis,dontStartSequencer:true,dontStartProverNode:true});
    await node.validatorClient.registerHandlers();node.getSequencer().updateConfig({minTxsPerBlock:1,buildCheckpointIfEmpty:false});
    mining=(async()=>{while(!stopMining){try{if(wallMode){const latest=await deployment.l1Client.getBlock({blockTag:'latest'});const wall=Math.floor(Date.now()/1000);if(BigInt(wall)<=latest.timestamp){await pause(100);continue;}await deployment.l1Client.request({method:'evm_mine',params:[wall]});}else await deployment.l1Client.request({method:'evm_mine',params:[]});const b=await deployment.l1Client.getBlock({blockTag:'latest'});synchronizeC01MinedClock(dateProvider,Number(b.timestamp));await pause(1000);}catch(error){miningError=error;stopMining=true;}}})();
    await node.getSequencer().start();
    const rpc=createNamespacedSafeJsonRpcServer({node:[node,AztecNodeApiSchema],aztec:[node,AztecNodeApiSchema]},{maxBatchSize:100,maxBodySizeBytes:10*1024*1024,corsAllowedOrigins:[`http://localhost:${ports.appPort}`,`http://127.0.0.1:${ports.appPort}`]});
    nodeServer=http.createServer(rpc.getApp().callback());await new Promise((resolve,reject)=>{nodeServer.once('error',reject);nodeServer.listen(persistent?ports.nodePort:0,'127.0.0.1',resolve);});
    bootComplete=true;
    return {node,config:nodeConfig,rpcUrl,nodeUrl:'http://127.0.0.1:'+nodeServer.address().port,identity,deployment,dateProvider,close,async useWallClock(){await deployment.l1Client.request({method:'evm_setAutomine',params:[false]});wallMode=true;const deadline=Date.now()+120000;while(Date.now()<deadline){const b=await deployment.l1Client.getBlock({blockTag:'latest'});if(b.timestamp<=BigInt(Math.floor(Date.now()/1000))&&Math.floor(Date.now()/1000)-Number(b.timestamp)<5)return;await pause(200);}throw Error('Development clock did not reach wall time');},checkHealth(){if(miningError)throw miningError;}};
  }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Devnet startup and cleanup failed');}throw error;}
}

/** End temporary empty-block production before another wallet simulation. */
export async function drainDevnetCheckpoints(net){
 const sequencer=net.node.getSequencer();
 await sequencer.pause();
 try{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   net.checkHealth();const tips=await net.node.getChainTips();
   const pending=await net.deployment.l1Client.readContract({address:net.deployment.l1ContractAddresses.rollupAddress.toString(),abi:RollupAbi,functionName:'getPendingCheckpointNumber'});
   if(BigInt(tips.checkpointed.checkpoint.number)===pending&&tips.proposed.number===tips.checkpointed.block.number&&tips.proposed.hash===tips.checkpointed.block.hash)return;
   await pause(500);
  }
  throw Error('Local Inbox checkpoint production did not settle');
 }finally{await sequencer.start();}
}
