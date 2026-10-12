// Trusted development diagnostic, not a node, wallet, or startup qualification.
// Fixed public network scope matches operator06. No configurable upstream, write
// RPC, datastore, proof, or SDK override. Use the CLI for the external 60s bound.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const FILE=fileURLToPath(import.meta.url),ROOT=path.resolve(path.dirname(FILE),'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export const SCOPE=Object.freeze({chainId:11155111,version:2914217885,rollup:'0x8c2fb2a68a3d362ab1de99e06f83f8903160bbd9'});
const RPC='https://ethereum-sepolia-rpc.publicnode.com';
const BEACON='https://ethereum-sepolia-beacon-api.publicnode.com';
const BLOBS='https://aztec-labs-snapshots.com/testnet/blobs';
const silent=Object.freeze(Object.fromEntries(['trace','debug','verbose','info','warn','error','fatal'].map(k=>[k,()=>{}])));
export const PHASES=Object.freeze(['source','chain','finalized-anchor','rollup-identity','rollup-constants','deploy-block','historical-logs','latest-clock','trace','blob-sources','anchor-continuity']);
// Exact installed v6 compiled source. Image equivalence is a separate evidence
// gate; this tool never equates Mac success with historical AWS behavior.
export const SOURCE_HASHES=Object.freeze({
  "node_modules/@aztec-labs/archiver/dest/factory.js": "62396b38f5d6e66cad045fd2e058cfa8c77c60db14c377fc35a0c1796f6752c0",
  "node_modules/@aztec-labs/archiver/dest/archiver.js": "1a3bd29d0d314de82b7ce1e8072f173f5a1a363eb312e9f6c7570bc4f7a95e18",
  "node_modules/@aztec-labs/archiver/dest/l1/validate_trace.js": "6fca83f140c3da28950121661081f29360e690b26c18d53e3f63577fc84b0584",
  "node_modules/@aztec-labs/archiver/dest/l1/validate_historical_logs.js": "8125975052ab85070a193eecce0b72290b50a0aec8ae676624da585a7c825727",
  "node_modules/@aztec-labs/ethereum/dest/contracts/rollup.js": "52f1abedbd8220a87eddea5b65e6cefcebcce129409f09294714972df5ac91a2",
  "node_modules/@aztec-labs/ethereum/dest/client.js": "40cc39d606d3bf3ed3464470533810b195b2dd89549d84190b3ab10c04be019a",
  "node_modules/@aztec-labs/blob-client/dest/client/factory.js": "3ecb8952034a058ef69b35191933ca18c9dc351818997566b0ba8dfb60ed01c3",
  "node_modules/@aztec-labs/blob-client/dest/client/http.js": "311a662c12aa687d513dda693286fa95b0680d586afdbab32028e9fe164d2d6f"
});
const failures=new WeakMap();
const requireThat=(v,category='CHECK_FAILED')=>{if(!v){const error=new Error('PREREQUISITE_CHECK_FAILED');failures.set(error,category);throw error;}};
const hex=(v,bytes)=>typeof v==='string'&&new RegExp(`^0x[0-9a-fA-F]{${bytes*2}}$`).test(v);
const integer=v=>typeof v==='bigint'&&v>=0n&&v<(1n<<256n);
export function initialReport(){return {schemaVersion:1,scope:'public-read-only-archiver-prerequisites',network:{...SCOPE},nodeStartupQualified:false,imageExecution:false,imageModuleBinding:'separate-evidence-required',sdkReadRetries:'installed SDK defaults; no operator retry',passed:false,stages:[],cleanup:null};}
function record(fd,r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');requireThat(b.length<=16384);fs.writeSync(fd,b,0,b.length,0);fs.ftruncateSync(fd,b.length);fs.fsyncSync(fd);}
function projectBlock(b){const number=b.number,timestamp=b.timestamp,blockHash=b.hash;requireThat(integer(number)&&integer(timestamp)&&hex(blockHash,32));return {number:number.toString(),timestamp:timestamp.toString(),hash:blockHash.toLowerCase()};}
/** Labelled pure-fake tests exercise sequencing, rejection and sanitization. The
 * CLI always constructs actual installed SDK operations below. */
export async function runChecks(ops,persist=()=>{}){
 const r=initialReport();let anchor,constants,deploy;const stage=async(name,fn)=>{const row={name,status:'running'};r.stages.push(row);persist(r);try{row.observation=await fn();row.status='passed';persist(r);}catch(error){row.status='failed';row.category=failures.get(error)??'UNAVAILABLE';persist(r);throw new Error('PREREQUISITE_CHECK_FAILED');}};
 try{
  await stage('source',async()=>{const {node,aztec,sourceSha256,sourceFiles}=await ops.source();requireThat(node==='24.21.0'&&aztec==='6.0.0-rc.1'&&typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(sourceSha256));requireThat(sourceFiles&&Object.keys(sourceFiles).length===Object.keys(SOURCE_HASHES).length);const files={};for(const [key,digest]of Object.entries(SOURCE_HASHES)){const value=sourceFiles[key];requireThat(value===digest);files[key]=value;}return {node,aztec,sourceSha256,sourceFiles:files};});
  await stage('chain',async()=>{requireThat(await ops.chain()===SCOPE.chainId,'CHAIN_MISMATCH');return {matched:true};});
  await stage('finalized-anchor',async()=>{anchor=projectBlock(await ops.finalized());return anchor;});
  await stage('rollup-identity',async()=>{const id=await ops.identity();requireThat(id.version===BigInt(SCOPE.version)&&hex(id.codeSha256,32)&&id.hasCode===true);return {matched:true,codeSha256:id.codeSha256.toLowerCase()};});
  await stage('rollup-constants',async()=>{const c=await ops.constants();const values=[c.startBlock,c.genesisTime,c.proofSubmissionEpochs,c.genesisArchiveRoot,c.committeeSize,c.manaLimit];requireThat(values.every(integer)&&c.startBlock<=BigInt(anchor.number)&&hex(c.slashingProposer,20));constants={startBlock:c.startBlock.toString(),genesisTime:c.genesisTime.toString(),proofSubmissionEpochs:c.proofSubmissionEpochs.toString(),genesisArchiveRoot:'0x'+c.genesisArchiveRoot.toString(16).padStart(64,'0'),slashingProposer:c.slashingProposer.toLowerCase(),committeeSize:c.committeeSize.toString(),manaLimit:c.manaLimit.toString()};return constants;});
  await stage('deploy-block',async()=>{deploy=projectBlock(await ops.block(BigInt(constants.startBlock)));requireThat(deploy.number===constants.startBlock);return deploy;});
  await stage('historical-logs',async()=>{const logs=await ops.historicalLogs();requireThat(Array.isArray(logs)&&logs.length<=128,'MALFORMED_LOGS');requireThat(logs.length>0,'HISTORICAL_LOGS_EMPTY');for(const log of logs){requireThat(log.blockNumber===BigInt(deploy.number)&&log.blockHash?.toLowerCase()===deploy.hash&&log.address?.toLowerCase()===SCOPE.rollup&&log.removed===false,'HISTORICAL_LOG_BINDING');}return {ownershipTransferredEvents:logs.length,deployBlockMatched:true};});
  await stage('latest-clock',async()=>{const b=projectBlock(await ops.latest()),now=ops.nowSeconds();requireThat(Number.isSafeInteger(now)&&now>=0);const drift=BigInt(now)-BigInt(b.timestamp);requireThat(drift<=300n,'L1_STALE');return {...b,observedWallSeconds:now,lagSeconds:drift.toString(),maxAllowedDriftSeconds:300};});
  await stage('trace',async()=>{const raw=await ops.trace(),out={};for(const k of ['debugTraceRecent','traceTransactionRecent','debugTraceOld','traceTransactionOld']){const v=raw[k];requireThat(typeof v==='boolean');out[k]=v;}requireThat(Object.values(out).some(Boolean),'TRACE_UNAVAILABLE');return out;});
  await stage('blob-sources',async()=>{requireThat(await ops.blobSources()===true);return {strictSdkTestSourcesPassed:true,uploadConfigured:false};});
  await stage('anchor-continuity',async()=>{const a=projectBlock(await ops.block(BigInt(anchor.number)));requireThat(a.hash===anchor.hash,'ANCHOR_CHANGED');return {finalizedAnchorUnchanged:true};});
  r.passed=true;
 }catch{/* Deliberately never inspect/serialize exception, cause or provider text. */}
 finally{try{await ops.close();r.cleanup=true;}catch{r.cleanup=false;r.passed=false;}persist(r);}
 return r;
}
async function actualOperations(){
 let client,rollup,blob,validateTraceAvailability;
 return {
  async source(){
   const {assertAztecPackages,assertNodeVersion}=await import('../../scripts/toolchain.mjs');assertNodeVersion();assertAztecPackages();
   for(const [rel,digest]of Object.entries(SOURCE_HASHES))requireThat(hash(fs.readFileSync(path.join(ROOT,rel)))===digest);
   const {getPublicClient}=await import('@aztec-labs/ethereum/client');const {RollupContract}=await import('@aztec-labs/ethereum/contracts');
   client=getPublicClient({l1RpcUrls:[RPC],l1ChainId:SCOPE.chainId,l1HttpTimeoutMS:10000,viemPollingIntervalMS:1000});rollup=new RollupContract(client,SCOPE.rollup);
   ({validateTraceAvailability}=await import(pathToFileURL(path.join(ROOT,'node_modules/@aztec-labs/archiver/dest/l1/validate_trace.js')).href));
   return {node:process.versions.node,aztec:'6.0.0-rc.1',sourceSha256:hash(fs.readFileSync(FILE)),sourceFiles:{...SOURCE_HASHES}};
  },
  chain:()=>client.getChainId(),finalized:()=>client.getBlock({blockTag:'finalized',includeTransactions:false}),latest:()=>client.getBlock({blockTag:'latest',includeTransactions:false}),block:n=>client.getBlock({blockNumber:n,includeTransactions:false}),nowSeconds:()=>Math.floor(Date.now()/1000),
  async identity(){const code=await client.getBytecode({address:SCOPE.rollup});return {version:BigInt(await rollup.getVersion()),hasCode:typeof code==='string'&&code.length>2,codeSha256:'0x'+hash(Buffer.from((code??'0x').slice(2),'hex'))};},
  async constants(){const [startBlock,genesisTime,proofSubmissionEpochs,root,proposer,committeeSize,manaLimit]=await Promise.all([rollup.getL1StartBlock(),rollup.getL1GenesisTime(),rollup.getProofSubmissionEpochs(),rollup.getGenesisArchiveTreeRoot(),rollup.getSlashingProposerAddress(),rollup.getTargetCommitteeSize(),rollup.getManaLimit()]);return {startBlock,genesisTime,proofSubmissionEpochs:BigInt(proofSubmissionEpochs),genesisArchiveRoot:BigInt(root.toString()),slashingProposer:proposer.toString(),committeeSize:BigInt(committeeSize),manaLimit:BigInt(manaLimit)};},
  historicalLogs:()=>rollup.getOwnershipTransferredEventsAtDeploy(),trace:()=>validateTraceAvailability(client),
  async blobSources(){const {createBlobClientWithFileStores}=await import('@aztec-labs/blob-client/client');const {EthAddress}=await import('@aztec-labs/foundation/eth-address');blob=await createBlobClientWithFileStores({l1ChainId:SCOPE.chainId,rollupVersion:SCOPE.version,rollupAddress:EthAddress.fromString(SCOPE.rollup),l1RpcUrls:[RPC],l1ConsensusHostUrls:[BEACON],blobFileStoreUrls:[BLOBS],blobAllowEmptySources:false,blobFileStoreTimeoutMs:10000,l1HttpTimeoutMS:10000},silent);await blob.testSources();return true;},
  async close(){await blob?.stop?.();}
 };
}
// Parent owns the external deadline and protected receipt descriptor. Worker
// stderr/stdout are discarded, so library diagnostics cannot leak raw URLs.
export async function supervise(output,{deadlineMs=59000,spawnWorker}={}){
 requireThat(Number.isInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=59000&&path.isAbsolute(output));
 const fd=fs.openSync(output,fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);record(fd,initialReport());
 let child,timer,killer,timedOut=false,exitCode=null;
 try{
  child=spawnWorker?spawnWorker(fd):spawn(process.execPath,[FILE,'--worker'],{cwd:ROOT,stdio:['ignore','ignore','ignore',fd],env:{PATH:process.env.PATH??'/usr/bin:/bin',LOG_LEVEL:'silent',NO_COLOR:'1'}});
  timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');killer=setTimeout(()=>child.kill('SIGKILL'),500);},deadlineMs);
  exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(null));child.once('close',code=>resolve(code));});
  const size=fs.fstatSync(fd).size;requireThat(size<=16384);const b=Buffer.alloc(size);fs.readSync(fd,b,0,size,0);const r=JSON.parse(b.toString());
  if(timedOut||exitCode!==0){r.passed=false;r.processCategory=timedOut?'DEADLINE':'WORKER_FAILED';}
  r.process={exitCode,signal:child.signalCode===null?null:['SIGTERM','SIGKILL'].includes(child.signalCode)?child.signalCode:'OTHER_SIGNAL',timedOut,deadlineMs};record(fd,r);return r;
 }finally{clearTimeout(timer);clearTimeout(killer);if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.closeSync(fd);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===FILE){
 if(process.argv[2]==='--worker'){
  // Only inherited descriptor3, never a caller-selected file or environment.
  try{const ops=await actualOperations();const result=await runChecks(ops,r=>record(3,r));process.exit(result.passed?0:1);}catch{process.exit(1);}
 }else if(process.argv.length===4&&process.argv[2]==='--output'){
  try{const r=await supervise(process.argv[3]);process.stdout.write(JSON.stringify({passed:r.passed,nodeStartupQualified:false})+'\n');process.exitCode=r.passed?0:1;}catch{process.stderr.write('Archiver prerequisite diagnostic failed.\n');process.exitCode=1;}
 }else{process.stderr.write('Usage: node archiver-prerequisites.mjs --output ABSOLUTE_NEW_RECEIPT\n');process.exitCode=1;}
}
