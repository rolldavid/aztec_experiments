// Public-only V6 Rolling decoding. No wallet, private account or personalized RPC.
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {decodeFromAbi, decodeFunctionSignature, EventSelector} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {computeLogTag} from '@aztec-labs/stdlib/hash';
import {DomainSeparator, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH} from '@aztec-labs/constants';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {TxHash, TxStatus, TxExecutionResult} from '@aztec-labs/stdlib/tx';
import {nameRegistration, NAME_DOMAIN} from './name-policy.mjs';
export const ROLLING_EVENTS = Object.freeze(['NameRegistered','MainPolicyPublished','SubboardCreated','SubboardRejected',
  'PostPublished','PostRemoved','PluginConfigured','PluginInvoked','PluginReplyPublished','LikeChanged']);
const verified = new WeakSet();
export const isRollingEvent = event => verified.has(event);
export const rollingError = () => Object.assign(Error('Rolling public history is invalid or unavailable.'), {code:'ROLLING_PUBLIC_INVALID'});
const check = value => {if (!value) throw rollingError();};
const hex = (value, bytes) => typeof value === 'string' && new RegExp(`^0x[0-9a-f]{${bytes*2}}$`).test(value);
const scalar = value => {check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)); const n=BigInt(value);check(n<Fr.MODULUS);return n;};
const nonzero = value => {check(scalar(value)>0n);};
const integer = (v,bits) => {const n=scalar(v);check(n<1n<<BigInt(bits));return n;};
const exact = (object,keys) => check(object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).sort().join()===keys.slice().sort().join());
const freeze = value => {if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const hash = async (fields,domain) => (await poseidon2HashWithSeparator(fields.map(BigInt),domain)).toBigInt().toString();
export function unpackRollingText(fields,length,maximum,required=true) {
  check(Array.isArray(fields) && fields.length<=32);const count=Number(integer(length,16));check(count<=maximum && count<=fields.length*31 && (!required||count>0));
  const bytes=new Uint8Array(fields.length*31);
  fields.forEach((field,i)=>{let n=scalar(field);check(n<1n<<248n);for(let j=30;j>=0;j--){bytes[i*31+j]=Number(n&255n);n>>=8n;}});
  check(bytes.slice(count).every(v=>v===0) && bytes.slice(0,count).every(v=>v!==0));
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.slice(0,count));
}
const shapes={NameRegistered:['schema','name_id','first_length','first','last_length','last'],MainPolicyPublished:['schema','version','digest','length','rules'],
 SubboardCreated:['schema','subboard_id','slug_length','slug','name_length','name','description_length','description','local_policy_version','rules_length','rules','rules_digest','main_policy_version','metadata_digest'],
 SubboardRejected:['schema','subboard_id','main_policy_version','local_policy_version','reason_length','reason','reason_digest'],
 PostPublished:['schema','id','record','timestamp','main_policy_version','local_policy_version','length','message'],
 PostRemoved:['schema','id','policy_version','penalized','reason_length','reason'],PluginConfigured:['schema','plugin_id','adapter','enabled'],
 PluginInvoked:['schema','plugin_id','post_id','request_id','target'],PluginReplyPublished:['schema','plugin_id','request_id','post_id','parent_id','target'],
 LikeChanged:['schema','post','tag','active','count']};
export function validateRollingScope(scope) {
  exact(scope,['chainId','rollupVersion','rollupAddress','boardAddress','classId']);
  check(integer(scope.chainId,64)>0n && integer(scope.rollupVersion,32)>0n && hex(scope.rollupAddress,20) && BigInt(scope.rollupAddress)>0n);
  for(const k of ['boardAddress','classId'])check(hex(scope[k],32)&&BigInt(scope[k])>0n&&BigInt(scope[k])<Fr.MODULUS);
  return freeze(Object.fromEntries(['chainId','rollupVersion','rollupAddress','boardAddress','classId'].map(k=>[k,scope[k]])));
}
// On reload the cache must revalidate every serialized event. This establishes
// schema/digest validity, NOT provenance: the cache still verifies chain anchors.
export async function validateRollingEvent(input,expectedScope) {
 try {
  exact(input,['schemaVersion','scope','type','position','payload']);check(input.schemaVersion===1&&ROLLING_EVENTS.includes(input.type));
  const scope=validateRollingScope(input.scope);check(JSON.stringify(scope)===JSON.stringify(validateRollingScope(expectedScope)));
  exact(input.position,['blockNumber','blockHash','txHash','txIndexWithinBlock','logIndexWithinTx']);
  const pos=input.position;check(integer(pos.blockNumber,53)>0n);integer(pos.txIndexWithinBlock,32);integer(pos.logIndexWithinTx,32);check(hex(pos.blockHash,32)&&hex(pos.txHash,32));
  const p=input.payload;exact(p,shapes[input.type]);check(p.schema==='1');
  const arr=(v,size)=>{check(Array.isArray(v)&&v.length===size);v.forEach(scalar);};
  const text=async (fields,length,size,required=true)=>{arr(fields,size);const value=unpackRollingText(fields,length,size*31,required);return {value,digest:await hash([length,...fields],0x52435431)};};
  if(input.type==='NameRegistered') {
   arr(p.first,2);arr(p.last,2);const first=unpackRollingText(p.first,p.first_length,32),last=unpackRollingText(p.last,p.last_length,32);
   const registration=nameRegistration(first,last);check(registration.name.first===first&&registration.name.last===last);
   check(p.name_id===await hash(registration.preimage,NAME_DOMAIN));nonzero(p.name_id);
  } else if(input.type==='MainPolicyPublished') {
   check(integer(p.version,32)>0n);check(p.digest===(await text(p.rules,p.length,32)).digest);
  } else if(input.type==='SubboardCreated') {
   arr(p.slug,2);const slug=unpackRollingText(p.slug,p.slug_length,40);check(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)&&slug.length>=3&&!slug.includes('--'));
   check(p.subboard_id===await hash([p.slug_length,...p.slug],0x52435331));nonzero(p.subboard_id);
   const name=await text(p.name,p.name_length,3),description=await text(p.description,p.description_length,16),rules=await text(p.rules,p.rules_length,32,false);
   check(p.rules_digest===rules.digest&&p.metadata_digest===await hash([p.subboard_id,name.digest,description.digest],0x52434d31));
   check(p.local_policy_version==='1'&&integer(p.main_policy_version,32)>0n);
  } else if(input.type==='SubboardRejected') {
   nonzero(p.subboard_id);check(p.local_policy_version==='1'&&integer(p.main_policy_version,32)>0n);check(p.reason_digest===(await text(p.reason,p.reason_length,7)).digest);
  } else if(input.type==='PostPublished') {
   nonzero(p.id);integer(p.timestamp,64);check(integer(p.main_policy_version,32)>0n);integer(p.local_policy_version,32);
   exact(p.record,['subboard','parent','root','kind','name_id','reference','content_digest']);const r=p.record;Object.values(r).forEach(scalar);
   check(['1','2','3','4'].includes(r.kind));nonzero(r.root);
   check((r.parent==='0')===(r.root===p.id));check((r.subboard==='0')===(p.local_policy_version==='0'));
   check(r.kind==='2'||r.kind==='3'?r.reference!=='0':r.reference==='0');
   if(r.kind==='4')check(r.name_id==='0'&&r.parent!=='0');
   check(r.content_digest===(await text(p.message,p.length,32,r.kind!=='3')).digest);
  } else if(input.type==='PostRemoved') {
   nonzero(p.id);integer(p.policy_version,64);check(typeof p.penalized==='boolean');await text(p.reason,p.reason_length,7);
  } else if(input.type==='PluginConfigured') {nonzero(p.plugin_id);nonzero(p.adapter);check(typeof p.enabled==='boolean');}
  else if(input.type==='LikeChanged') {nonzero(p.post);nonzero(p.tag);integer(p.count,64);check(typeof p.active==='boolean');}
  else {for(const k of Object.keys(p).filter(k=>k!=='schema'))nonzero(p[k]);}
  const result=freeze({...structuredClone(input),scope});verified.add(result);return result;
 } catch {throw rollingError();}
}
function flattenTypes(type) {
 if(type.kind==='field'||type.kind==='boolean'||type.kind==='integer')return [type];
 if(type.kind==='array'){check(Number.isInteger(type.length)&&type.length>0&&type.length<=32);return Array.from({length:type.length},()=>flattenTypes(type.type)).flat();}
 if(type.kind==='struct'){check(type.fields.length<=20);return type.fields.flatMap(f=>flattenTypes(f.type));}throw rollingError();
}
const normalize = value => typeof value==='bigint'?String(value):typeof value==='boolean'?value:Array.isArray(value)?value.map(normalize):value?.toField?String(value.toField().toBigInt()):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
export async function createRollingEventDecoder({artifact,scope}) {
 scope=validateRollingScope(scope);check(artifact.name==='RollingBoard'&&(await getContractClassFromArtifact(artifact)).id.toString()===scope.classId);
 const definitions=new Map();
 for(const type of ROLLING_EVENTS){const abis=artifact.outputs.structs.events.filter(e=>e.path===`RollingBoard::${type}`);check(abis.length===1);const abi=structuredClone(abis[0]);
  const selector=await EventSelector.fromSignature(decodeFunctionSignature(type,abi.fields));const tag=await computeLogTag(selector.toField(),DomainSeparator.EVENT_LOG_TAG);
  check(!definitions.has(tag.toString()));definitions.set(tag.toString(),{type,abi,types:flattenTypes(abi)});
 }
 async function decodeLog(log,position) {
  try {check(log.contractAddress.toString()===scope.boardAddress);const def=definitions.get(log.fields[0]?.toString());check(def&&log.fields.length===def.types.length+1);
   log.fields.slice(1).forEach((f,i)=>{check(f instanceof Fr);const t=def.types[i],v=f.toBigInt();if(t.kind==='boolean')check(v===0n||v===1n);if(t.kind==='integer')check(t.sign==='unsigned'&&v<1n<<BigInt(t.width));});
   return await validateRollingEvent({schemaVersion:1,scope,type:def.type,position,payload:normalize(decodeFromAbi(def.abi,log.getEmittedFieldsWithoutTag()))},scope);
  }catch{throw rollingError();}
 }
 // The caller retains range-level anchor rechecks/reorg handling. This verifies
 // one entire successful transaction against the actual SDK block/effect APIs.
 async function decodeTransaction(node,hashValue) {
  try {
   const deadline=Date.now()+20000;
   const read=async fn=>{const left=deadline-Date.now();check(left>0);let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(rollingError()),left);})]);}finally{clearTimeout(timer);}};
   const txHash=TxHash.fromString(hashValue),address=AztecAddress.fromBigIntUnsafe(BigInt(scope.boardAddress)),info=await read(()=>node.getNodeInfo()),instance=await read(()=>node.getContract(address));
   check(String(info.l1ChainId)===scope.chainId&&String(info.rollupVersion)===scope.rollupVersion&&info.l1ContractAddresses.rollupAddress.toString()===scope.rollupAddress);
   check(instance?.currentContractClassId.toString()===scope.classId&&instance?.originalContractClassId.toString()===scope.classId);
   const receipt=await read(()=>node.getTxReceipt(txHash));check([TxStatus.CHECKPOINTED,TxStatus.PROVEN,TxStatus.FINALIZED].includes(receipt.status)&&receipt.executionResult===TxExecutionResult.SUCCESS&&receipt.txHash.equals(txHash));
   const block=await read(()=>node.getBlock(receipt.blockNumber)),found=await read(()=>node.getTxEffect(txHash));check(block&&found&&Number(block.header.globalVariables.blockNumber)===Number(receipt.blockNumber)&&block.hash.equals(receipt.blockHash)&&found.l2BlockHash.equals(receipt.blockHash)&&Number(found.l2BlockNumber)===Number(receipt.blockNumber)&&found.data.txHash.equals(txHash));
   const matches=block.body.txEffects.map((effect,index)=>({effect,index})).filter(({effect})=>effect.txHash.equals(txHash));check(matches.length===1&&matches[0].effect.toBuffer().equals(found.data.toBuffer()));
   check(found.data.publicLogs.length<=4096&&found.data.publicLogs.reduce((sum,log)=>sum+log.sizeInFields(),0)<=FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);const events=[];
   for(const [index,log] of found.data.publicLogs.entries())if(log.contractAddress.toString()===scope.boardAddress){check(Date.now()<deadline);events.push(await decodeLog(log,{blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash.toString(),txHash:hashValue,txIndexWithinBlock:String(matches[0].index),logIndexWithinTx:String(index)}));}
   const final=await read(()=>node.getBlockData(receipt.blockNumber)),lastInstance=await read(()=>node.getContract(address));
   check(final?.blockHash.equals(receipt.blockHash)&&lastInstance?.currentContractClassId.toString()===scope.classId&&lastInstance?.originalContractClassId.toString()===scope.classId);
   for(const event of events)if(event.type==='PostPublished')check(event.payload.timestamp===String(block.header.globalVariables.timestamp));
   return events;
  }catch{throw rollingError();}
 }
 return Object.freeze({scope,decodeLog,decodeTransaction});
}
