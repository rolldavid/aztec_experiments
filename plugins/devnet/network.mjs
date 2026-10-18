// Disposable application development using the installed SDK's native local network.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {Wallet} from 'ethers';
import {foundry} from 'viem/chains';
import {createLocalNetwork} from '@aztec-labs/aztec';
import {startAnvil} from '@aztec-labs/ethereum/test';
import {createExtendedL1Client} from '@aztec-labs/ethereum/client';
import {isL1ToL2MessageReady} from '@aztec-labs/aztec.js/messaging';
import {createNamespacedSafeJsonRpcServer} from '@aztec-labs/foundation/json-rpc/server';
import {AztecNodeApiSchema,AztecNodeDebugApiSchema} from '@aztec-labs/stdlib/interfaces/client';
import {createCompactBlockNativeAdapter,COMPACT_BLOCK_NATIVE_ROUTE} from '../../prover/compact-block-native.mjs';
import {bbBinary} from '../../scripts/toolchain.mjs';

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
export async function assertDevnetPortsFree(ports) {
  const listeners=[];try{for(const port of Object.values(devnetPorts(ports))){const server=net.createServer();listeners.push(server);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}}
  catch{throw Error('A selected development port is already owned');}finally{await Promise.all(listeners.filter(s=>s.listening).map(s=>new Promise(r=>s.close(r))));}
}
export async function assertFreshDevnetDirectory(directory) {
  const allowed=new Set(['operator.json','hosted.lock']);
  if((await fs.readdir(directory)).some(name=>!allowed.has(name)))throw Error('Development requires a fresh directory; existing state is preserved');
}
const cleanupStages=new Set(['node-rpc','node-stop','anvil-stop','service','server','relay','fixture','barretenberg','barretenberg-sync','lease']);
export function developmentCleanupFailure(stage,cause) {
 if(!cleanupStages.has(stage))throw Error('Invalid development cleanup stage');
 return Object.assign(Error('Development cleanup failed at '+stage,{cause}),{developmentStage:stage});
}
// Fixed public projection only; raw provider errors remain exclusively in memory.
export function developmentShutdownSummary(error) {
 const failures=[],seen=new Set();
 function visit(e,depth=0){if(!e||typeof e!=='object'||seen.has(e)||depth>12||failures.length>=24)return;seen.add(e);
  if(cleanupStages.has(e.developmentStage))failures.push({stage:e.developmentStage});
  if(e instanceof AggregateError)for(const child of e.errors.slice(0,24))visit(child,depth+1);visit(e.cause,depth+1);
 }visit(error);return {schemaVersion:1,status:'recovery-required',failures};
}
// Reuse the native compact encoder beside the existing development RPC. The
// owner drains pending native requests before the SDK stops the node.
export async function startDevelopmentNodeRpc({node,config,port=0,origins=[],onProgress=()=>{}}) {
 if(String(config?.l1ChainId)!=='31337'||config?.realProofs!==false)throw Error('Native operator RPC requires the proof-disabled development chain');
 const compact=createCompactBlockNativeAdapter({node,expectedNetworkScope:{chainId:config.l1ChainId,version:config.rollupVersion,rollup:String(config.rollupAddress)},proofsEnabled:config.realProofs,tier:'checkpointed',onFailure:observation=>onProgress(JSON.stringify({event:'development-compact-unavailable',at:Date.now(),...observation}))});
 const rpc=createNamespacedSafeJsonRpcServer({node:[node,AztecNodeApiSchema],aztec:[node,AztecNodeApiSchema],aztecDebug:[node,AztecNodeDebugApiSchema]},{maxBatchSize:100,maxBodySizeBytes:10*1024*1024,corsAllowedOrigins:origins});
 const callback=rpc.getApp().callback(),pending=new Set(),failures=[];let closing,closed=false;
 const server=http.createServer((req,res)=>{
  if(closed){res.writeHead(503);res.end();return;}
  if(req.url!==COMPACT_BLOCK_NATIVE_ROUTE){callback(req,res);return;}
  const operation=compact.handle(req,res);pending.add(operation);
  operation.then(()=>pending.delete(operation),error=>{pending.delete(operation);failures.push(error);res.destroy();});
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 const close=()=>closing??=(async()=>{closed=true;
  try{await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}catch(error){failures.push(error);}
  await Promise.allSettled([...pending]);if(failures.length)throw new AggregateError(failures,'Development compact requests failed during shutdown');
 })();
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
 catch(error){server.closeAllConnections();if(server.listening)await close();throw error;}
 return {url:'http://127.0.0.1:'+server.address().port,close};
}
// The same public development mnemonic used by the SDK local-network factory
// and Anvil. It never grants access to a user wallet or a public network.
const localMnemonic='test test test test test test test test test test test junk';

export async function startDevnet({directory,fundingAddresses=[],proofs=false,ports:requestedPorts,onProgress=()=>{},onOwned=()=>{}},
 {startEthereum=startAnvil,createNetwork=createLocalNetwork,startRpc=startDevelopmentNodeRpc}={}) {
 if(proofs!==false)throw Error('Local development requires native proofs disabled');
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 await assertFreshDevnetDirectory(directory);
 const ports=devnetPorts(requestedPorts);
 if(requestedPorts)await assertDevnetPortsFree(ports);
 const statePath=path.join(directory,'network.json');
 await writeDevnetRecord(statePath,{schemaVersion:2,mode:'native-disposable',phase:'starting'},{exclusive:true});
 let ethereum,network,rpc,closing,pending,stopping=false;
 const close=()=>closing??=(async()=>{
  stopping=true;
  // Finish adopting the one SDK operation already in flight before teardown.
  // No next startup stage may run once shutdown has begun.
  try{await pending;}catch{}
  const errors=[];
  for(const [stage,stop] of [['node-rpc',()=>rpc?.close()],['node-stop',()=>network?.stop()],['anvil-stop',()=>ethereum?.stop()]]){
   try{await stop();}catch(error){errors.push(developmentCleanupFailure(stage,error));}
  }
  if(errors.length)throw new AggregateError(errors,'Native development cleanup failed');
  await writeDevnetRecord(statePath,{schemaVersion:2,mode:'native-disposable',phase:'stopped'});
 })();
 onOwned({close});
 try{
  if(stopping)throw Error('Native development startup cancelled');
  onProgress('Starting native disposable Ethereum');
  pending=startEthereum({port:requestedPorts?ports.ethereumPort:0}).then(value=>ethereum=value);await pending;
  if(stopping)throw Error('Native development startup cancelled');
  const identity=Wallet.fromPhrase(localMnemonic);
  onProgress('Starting native Aztec local network with proofs disabled');
  pending=createNetwork({l1RpcUrls:[ethereum.rpcUrl],l1Mnemonic:localMnemonic,testAccounts:false,
   prefundAddresses:fundingAddresses.map(String),realProofs:false,p2pEnabled:false,
   // SDK stdlib/gas/tx_gas_limits documents 72s slots / 6s blocks for class
   // publication capacity. Native automine still owns all on-demand progress.
   blockDurationMs:6000,
   bbBinaryPath:bbBinary(),bbWorkingDirectory:path.join(directory,'bb-work'),
   bbIVCConcurrency:1,bbChonkVerifyConcurrency:1,numConcurrentIVCVerifiers:1},onProgress).then(value=>network=value);await pending;
  if(stopping)throw Error('Native development startup cancelled');
  const node=network.node,info=await node.getNodeInfo();
  if(info.realProofs!==false||info.l1ChainId!==31337)throw Error('Native development network scope differs');
  const config={...info.l1ContractAddresses,l1RpcUrls:[ethereum.rpcUrl],l1ChainId:info.l1ChainId,
   rollupVersion:info.rollupVersion,realProofs:false,useAutomineSequencer:true};
  const deployment={l1Client:createExtendedL1Client([ethereum.rpcUrl],identity.privateKey,foundry),
   l1ContractAddresses:info.l1ContractAddresses,rollupVersion:info.rollupVersion};
  if(stopping)throw Error('Native development startup cancelled');
  pending=startRpc({node,config,port:requestedPorts?ports.nodePort:0,
   origins:[`http://localhost:${ports.appPort}`,`http://127.0.0.1:${ports.appPort}`],onProgress}).then(value=>rpc=value);await pending;
  if(stopping)throw Error('Native development startup cancelled');
  pending=writeDevnetRecord(statePath,{schemaVersion:2,mode:'native-disposable',phase:'running',
   rpcUrl:ethereum.rpcUrl,nodeUrl:rpc.url,rollupAddress:String(info.l1ContractAddresses.rollupAddress),rollupVersion:info.rollupVersion});await pending;
  if(stopping)throw Error('Native development startup cancelled');
  return {node,config,rpcUrl:ethereum.rpcUrl,nodeUrl:rpc.url,identity,deployment,close,
   settleCheckpoints:()=>node.prove()};
 }catch(error){
  try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Native development startup and cleanup failed',{cause:error});}
  throw error;
 }
}

// Native automine owns the build/settlement queue. Only missing message state
// causes another block; a deadline reports failure and never establishes readiness.
export async function ensureDevelopmentMessageReady(node,messageHash,{timeoutMs=120000}={}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('Invalid development message deadline');
 const deadline=Date.now()+timeoutMs;
 while(!await isL1ToL2MessageReady(node,messageHash,'checkpointed')){
  if(Date.now()>=deadline)throw Error('Local message did not become consumable');
  await node.mineBlock();
 }
}

export async function drainDevnetCheckpoints(network){await network.node.prove();}
