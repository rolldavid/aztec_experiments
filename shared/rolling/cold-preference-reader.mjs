// Opt-in component only; no existing wallet/reader wiring. The installed pinned
// PXE extension, original encrypted-message validators and atomic cursor are
// mandatory. Transport data is never a private-event or completion authority.
import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {createPreferenceFold,resumePreferenceFold,PREFERENCE_DOMAIN} from './preferences.mjs';
import {createPreferenceEventDecoder} from './preference-events.mjs';
import {FIELD_MODULUS} from './invocation.mjs';
const DOMAIN='ROLLING_COLD_PREFERENCES_V1';
export const COLD_PREFERENCE_LIMITS=Object.freeze({physicalLogs:8,transactionEvents:64,markerBlocks:32,markers:512});
const failure=code=>Object.assign(Error('Saved choices could not be recovered. Keep your recovery data and try again after checking the connection.'),{code});
const check=x=>{if(!x)throw failure('ROLLING_COLD_PREFERENCES_INVALID');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function exact(value,keys){check(value&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));const ds=Object.getOwnPropertyDescriptors(value);check(Reflect.ownKeys(ds).length===keys.length);const out={};for(const k of keys){check(ds[k]&&'value'in ds[k]);out[k]=ds[k].value;}return out;}
function hex(x,width=64){check(typeof x==='string'&&new RegExp('^0x[0-9a-f]{'+width+'}$').test(x)&&BigInt(x)>0n);if(width===64)check(BigInt(x)<FIELD_MODULUS);return x;}
function number(x,max=0xffffffff,min=0){check(Number.isSafeInteger(x)&&x>=min&&x<=max);return x;}
function list(input,max){check(Array.isArray(input));const n=Object.getOwnPropertyDescriptor(input,'length')?.value;number(n,max);const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));check(d&&'value'in d);out.push(d.value);}check(Reflect.ownKeys(input).length===n+1);return out;}
const emptyHead=Object.freeze({initialized:false,schema:1,revision:'0',digest:'0'});
function delivery(input){
 const r=exact(input,['schemaVersion','database','epoch','sequence','anchor','nextBlock','nextLog','records','head','complete']);
 check(r.schemaVersion===1);for(const k of ['database','epoch'])check(typeof r[k]==='string'&&/^[0-9a-f]{64}$/.test(r[k]));
 number(r.sequence,Number.MAX_SAFE_INTEGER);r.anchor=exact(r.anchor,['blockNumber','blockHash']);number(r.anchor.blockNumber);hex(r.anchor.blockHash);
 number(r.nextBlock,0x100000000,1);number(r.nextLog,24575);check(r.nextBlock<=r.anchor.blockNumber+1);
 r.records=list(r.records,64).map(row=>{const e=exact(row,['packedEvent','eventSelector','l2BlockNumber','l2BlockHash','txHash']);e.packedEvent=list(e.packedEvent,8);check(e.packedEvent.length===8);for(const f of e.packedEvent)check(typeof f==='string'&&/^0x[0-9a-f]{64}$/.test(f)&&BigInt(f)<FIELD_MODULUS);check(typeof e.eventSelector==='string'&&/^0x[0-9a-f]{8}$/.test(e.eventSelector));number(e.l2BlockNumber,0xffffffff,1);hex(e.l2BlockHash);hex(e.txHash);return e;});
 check(typeof r.complete==='boolean'&&r.complete===(r.head!==null));
 if(r.head!==null)r.head=exact(r.head,['initialized','schema','revision','digest']);
 if(r.complete)check(r.nextBlock===r.anchor.blockNumber+1&&r.nextLog===0&&r.records.length===0);
 if(r.sequence===0)check(r.records.length===0&&r.nextBlock===1&&r.nextLog===0&&!r.complete);
 return r;
}
/**
 * Caller holds the existing exclusive account lease for the whole read() await.
 * sdk/pxe/node and deployment are trusted factory/build capabilities. compact is
 * the fixed-origin transport; its response is authenticated INSIDE the patched
 * PXE before the original utility can write. expectedArtifactHash is the locally
 * reviewed manifest's actual artifact hash, not remote/UI configuration.
 *
 * The SDK persists cursor+last delivery atomically with original notes/events.
 * This reader authenticates an encrypted fold cache bound to that database,
 * scope, epoch and canonical anchor. Loss of the reply replays its mailbox, not
 * the utility. Loss of the cache or a new database/anchor restarts enumeration.
 * Snapshot/CAS memory is O(current choices); no total preference cap is invented.
 * One step processes <=8 physical logs (or one empty block) / <=64 emitted rows.
 * Whole-block root authentication has protocol-bounded but unqualified worst-
 * case CPU. Deep reorg rollback and original SDK initial sync remain separately
 * measured concerns. No generic contract sync or global complete flag is used.
 *
 * Supported tipsOnly sync runs initially and on a NEW explicit read after a
 * completed scan. A scan retains one canonical selected-tier anchor. A newer
 * anchor currently requires a full restart: not history-independent refresh.
 * No result is published until physical completion, key-gated head equality,
 * full digest replay and canonical-marker checks all pass. Aborts suppress
 * publication after pending SDK work settles; they never release a busy lease.
 * New cache domain/backup/session integration requires a separate review.
 */
export function createRollingColdPreferenceReader(input){
 try{
  const {sdk,pxe,node,owner,deployment,expectedArtifactHash,tier,compact,contextGuard,privateStore,walletSecret,walletSalt}=input;
  check(typeof contextGuard==='function'&&['proposed','checkpointed','proven','finalized'].includes(tier));
  const trusted=sdk.isTrustedPrivateNode.bind(sdk),routed=sdk.isPrivatePXEForNode.bind(sdk),inspect=sdk.inspectTrustedNode.bind(sdk);
  const sync=pxe.sync.bind(pxe),process=pxe.processRollingPreferenceRecovery.bind(pxe),getBlock=node.getBlockData.bind(node),fetchBlock=compact.read.bind(compact);
  const poseidon=sdk.poseidon2HashWithSeparator.bind(sdk),Fr=sdk.Fr;
  const account=hex(owner.toString()),board=hex(deployment.board.address.toString()),classId=hex(deployment.board.instance.currentContractClassId.toString());
  check(deployment.board.instance.originalContractClassId.toString()===classId);hex(expectedArtifactHash);
  const network=Object.freeze({...exact(deployment.network,['chainId','version','rollup'])});
  for(const k of ['chainId','version'])check(typeof network[k]==='string'&&/^[1-9][0-9]*$/.test(network[k])&&network[k].length<17);hex(network.rollup,40);
  const chainId=number(Number(network.chainId),Number.MAX_SAFE_INTEGER,1),version=number(Number(network.version),0xffffffff,1),proofsEnabled=deployment.proofsEnabled!==false;
  const artifact=structuredClone(deployment.board.artifact),decoderSdk={EventSelector:sdk.EventSelector,decodeFunctionSignature:sdk.decodeFunctionSignature};
  const scope=Object.freeze({chainId:network.chainId,version:network.version,board:String(BigInt(board))});
  const fullScope=Object.freeze([chainId,version,network.rollup,board,classId,expectedArtifactHash,account,proofsEnabled,tier,1]);
  const config=Object.freeze({contractAddress:board,scope:account,expectedClassId:classId,expectedArtifactHash,network:{chainId,version,rollup:network.rollup},proofsEnabled,tier});
  const readStore=privateStore.read.bind(privateStore),casStore=privateStore.compareAndSwap.bind(privateStore);
  let active=null,slot=null,decoder=null,started=false,lastComplete=false;
  function current(){check(trusted(node)&&routed(pxe,node)&&owner.toString()===account&&deployment.board.address.toString()===board&&deployment.board.instance.currentContractClassId.toString()===classId&&deployment.board.instance.originalContractClassId.toString()===classId&&same(deployment.network,network)&&(deployment.proofsEnabled!==false)===proofsEnabled);if(active?.signal?.aborted||Date.now()>=active?.deadlineAt)throw failure('ROLLING_COLD_PREFERENCES_STOPPED');}
  async function guard(){current();await contextGuard();current();}
  async function checked(fn){await guard();const value=await fn();await guard();return value;}
  const hash=async(fields,domain)=>(await checked(()=>poseidon(fields,domain))).toBigInt();
  async function canonical(height){number(height);const data=await checked(()=>getBlock(height));check(data&&Number(data.header?.globalVariables?.blockNumber)===height);const observed=hex(data.blockHash.toString());check((await checked(()=>data.header.hash())).toString()===observed);return observed;}
  async function recheck(anchor){await checked(()=>inspect(node,{expectedNetworkScope:network,proofsEnabled}));check(await canonical(anchor.blockNumber)===anchor.blockHash);await guard();}
  const request=async(expected,block=null,restart=false)=>delivery(await checked(()=>process({...config,expected,block,restart},{contextGuard:guard})));
  function cacheRecord(value){const c=exact(value,['schemaVersion','scope','delivery','prefix','markers']);check(c.schemaVersion===1&&same(c.scope,fullScope));c.delivery=delivery(c.delivery);if(c.markers!==null){c.markers=exact(c.markers,['next','canonical']);number(c.markers.next,Number.MAX_SAFE_INTEGER);c.markers.canonical=list(c.markers.canonical,c.markers.next);check(c.markers.canonical.length===c.markers.next&&c.markers.canonical.every(x=>typeof x==='boolean'));}return c;}
  async function foldBatch(prefix,records,anchor){
   const decoded=records.map(row=>decoder.decode({...row,packedEvent:row.packedEvent.map(x=>Fr.fromString(x)),eventSelector:{toString:()=>row.eventSelector},l2BlockHash:{toString:()=>row.l2BlockHash},txHash:{toString:()=>row.txHash}},{fromBlock:1,toBlock:anchor.blockNumber+1}));
   const blocks=new Map();for(const row of decoded){if(!blocks.has(row.blockNumber))blocks.set(row.blockNumber,await canonical(row.blockNumber));check(blocks.get(row.blockNumber)===row.blockHash);}
   let target=prefix?.head??emptyHead;
   if(decoded.length){const e=decoded.at(-1).event;const digest=await hash([BigInt(scope.chainId),BigInt(scope.version),BigInt(scope.board),1n,BigInt(e.revision),BigInt(e.kind),BigInt(e.target),e.value?1n:0n,BigInt(e.read_block),BigInt(e.read_hash),BigInt(e.previous_digest)],PREFERENCE_DOMAIN);target={initialized:true,schema:1,revision:e.revision,digest:String(digest)};}
   const fold=prefix?await checked(()=>resumePreferenceFold({scope,head:target,hash,prefix,verifyAuthenticatedPrefix:async candidate=>same(candidate,prefix)})):createPreferenceFold({scope,head:target,hash});
   await checked(()=>fold.append(decoded.map(x=>x.event)));return fold.checkpoint();
  }
  return Object.freeze({async read(options={}){
   if(active)throw failure('ROLLING_COLD_PREFERENCES_BUSY');
   const keys=Reflect.ownKeys(options);check(keys.every(k=>k==='signal'||k==='deadlineAt'));const settings=exact(options,keys);
   const signal=settings.signal,deadlineAt=settings.deadlineAt??Date.now()+10000;check(signal===undefined||signal instanceof AbortSignal);check(Number.isSafeInteger(deadlineAt));active={signal,deadlineAt};
   try{
    await guard();await checked(()=>inspect(node,{expectedNetworkScope:network,proofsEnabled}));
    if(!slot)slot=await checked(()=>createEncryptedJournalSlot({storage:{read:key=>checked(()=>readStore(key)),compareAndSwap:(...args)=>checked(()=>casStore(...args))},walletSecret,walletSalt,scopeText:JSON.stringify([DOMAIN,...fullScope]),keyDomain:DOMAIN}));
    if(!decoder)decoder=await checked(()=>createPreferenceEventDecoder({sdk:decoderSdk,artifact}));
    const saved=await checked(()=>slot.read()),cache=saved.value===null?null:cacheRecord(saved.value);
    if(!started||lastComplete){await checked(sync);started=true;lastComplete=false;}
    let observed=await request(null,null,cache===null),prefix=cache?.prefix??null,markers=cache?.markers??null;
    await recheck(observed.anchor);
    if(!cache||cache.delivery.database!==observed.database||cache.delivery.epoch!==observed.epoch||!same(cache.delivery.anchor,observed.anchor)){
     // An existing cursor ahead of a missing/foreign prefix cannot authenticate
     // derived choices. Explicitly restart only this scoped cursor; no wallet or
     // note/event erasure, no financial action, and no fabricated empty result.
     if(observed.sequence!==0)observed=await request(null,null,true);
     prefix=null;markers=null;
    }else{
     const old=cache.delivery;
     check(observed.sequence===old.sequence||observed.sequence===old.sequence+1);
     if(observed.sequence===old.sequence)check(same(observed,old));
    }
    const isNew=!cache||cache.delivery.epoch!==observed.epoch||cache.delivery.database!==observed.database||observed.sequence!==cache.delivery.sequence;
    if(!isNew&&!observed.complete){
     let block=null;
     if(observed.nextBlock<=observed.anchor.blockNumber){const blockHash=await canonical(observed.nextBlock),wire=await checked(()=>fetchBlock({number:observed.nextBlock,hash:blockHash},{signal}));check(wire.number===observed.nextBlock&&wire.hash===blockHash);block={blockNumber:wire.number,blockHash:wire.hash,fields:wire.fields,headerFields:wire.headerFields};}
     observed=await request({epoch:observed.epoch,sequence:observed.sequence},block);
     check(observed.database===cache.delivery.database&&observed.epoch===cache.delivery.epoch&&observed.sequence===cache.delivery.sequence+1);markers=null;
    }
    // Records are consumed exactly once relative to the encrypted CAS sequence.
    if(!cache||observed.epoch!==cache.delivery.epoch||observed.database!==cache.delivery.database||observed.sequence!==cache.delivery.sequence)prefix=await foldBatch(prefix,observed.records,observed.anchor);
    check(prefix);let completed=null;
    if(observed.complete){
     const terminal=await checked(()=>resumePreferenceFold({scope,head:observed.head,hash,prefix,verifyAuthenticatedPrefix:async candidate=>same(candidate,prefix)}));completed=terminal.finish();
     if(!markers)markers={next:0,canonical:[]};check(markers.next<=completed.readMarkers.length);const blocks=new Map();let count=0;
     while(markers.next<completed.readMarkers.length&&count<COLD_PREFERENCE_LIMITS.markers){const marker=completed.readMarkers[markers.next];check(marker.throughBlock<=observed.anchor.blockNumber);if(!blocks.has(marker.throughBlock)){if(blocks.size===COLD_PREFERENCE_LIMITS.markerBlocks)break;blocks.set(marker.throughBlock,await canonical(marker.throughBlock));}markers.canonical.push(BigInt(blocks.get(marker.throughBlock))===BigInt(marker.blockHash));markers.next++;count++;}
    }
    await recheck(observed.anchor);
    await checked(()=>slot.write(saved,{schemaVersion:1,scope:fullScope,delivery:observed,prefix,markers}));
    await recheck(observed.anchor);
    // Recheck the authoritative SDK mailbox after encryption/CAS; an intervening
    // scoped restart, rollback or anchor change cannot publish a stale result.
    check(same(await request(null),observed));await recheck(observed.anchor);
    const progress=Object.freeze({nextBlock:observed.nextBlock,anchorBlock:observed.anchor.blockNumber,processedRevision:prefix.head.revision,markersChecked:markers?.next??0,markersTotal:completed?.readMarkers.length??null});
    if(!completed||markers.next<completed.readMarkers.length)return Object.freeze({status:'recovering',complete:false,progress});
    lastComplete=true;
    return Object.freeze({status:'complete',complete:true,anchor:Object.freeze({...observed.anchor}),preferences:Object.freeze({...completed,readMarkers:Object.freeze(completed.readMarkers.filter((_,i)=>markers.canonical[i]))}),orphanedReadMarkers:Object.freeze(completed.readMarkers.filter((_,i)=>!markers.canonical[i])),progress});
   }catch{throw failure('ROLLING_COLD_PREFERENCES_UNAVAILABLE');}finally{active=null;}
  }});
 }catch{throw failure('ROLLING_COLD_PREFERENCES_INVALID');}
}
