// Development fixtures using the installed SDK and real processed Rolling ABI.
// No local HTTP service, chain transaction or privacy acceptance is performed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {loadContractArtifact, EventSelector, decodeFunctionSignature} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {computeLogTag} from '@aztec-labs/stdlib/hash';
import {PublicLog} from '@aztec-labs/stdlib/logs';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {TxHash,TxStatus,TxExecutionResult} from '@aztec-labs/stdlib/tx';
import {DomainSeparator} from '@aztec-labs/constants';
import {createRollingEventDecoder,validateRollingEvent,unpackRollingText} from './public-events.mjs';
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const classId=(await getContractClassFromArtifact(artifact)).id.toString();
const board=AztecAddress.fromBigIntUnsafe(42n),scope={chainId:'31337',rollupVersion:'1',rollupAddress:'0x'+'11'.repeat(20),boardAddress:board.toString(),classId};
const decoder=await createRollingEventDecoder({artifact,scope});
const hash='0x'+'22'.repeat(32),txHash=TxHash.fromString('0x'+'13'.repeat(32));
const position={blockNumber:'1',blockHash:hash,txHash:txHash.toString(),txIndexWithinBlock:'0',logIndexWithinTx:'0'};
const fields=[new Fr(65n<<240n),...Array(31).fill(Fr.ZERO)];
const digest=await poseidon2HashWithSeparator([1n,...fields],0x52435431);
const abi=artifact.outputs.structs.events.find(e=>e.path==='RollingBoard::MainPolicyPublished');
const tag=await computeLogTag((await EventSelector.fromSignature(decodeFunctionSignature('MainPolicyPublished',abi.fields))).toField(),DomainSeparator.EVENT_LOG_TAG);
const log=()=>new PublicLog(board,[tag,new Fr(1n),new Fr(1n),digest,new Fr(1n),...fields]);
function nodeFixture(){const blockHash={equals:v=>v.toString()===hash,toString:()=>hash};const effect={txHash,publicLogs:[log()],toBuffer:()=>Buffer.from('controlled fixture effect')};const receipt={txHash,status:TxStatus.CHECKPOINTED,executionResult:TxExecutionResult.SUCCESS,blockNumber:1,blockHash};
 const instance={currentContractClassId:{toString:()=>classId},originalContractClassId:{toString:()=>classId}};
 return {getNodeInfo:async()=>({l1ChainId:31337,rollupVersion:1,l1ContractAddresses:{rollupAddress:{toString:()=>scope.rollupAddress}}}),getContract:async()=>instance,
 getTxReceipt:async()=>receipt,getTxEffect:async()=>({data:effect,l2BlockNumber:1,l2BlockHash:blockHash}),
 getBlock:async()=>({hash:blockHash,body:{txEffects:[effect]},header:{globalVariables:{timestamp:1n,blockNumber:1}}}),getBlockData:async()=>({blockHash})};}
test('labelled fixture: real SDK ABI policy decode and canonical transaction adapter',async()=>{
 const decoded=await decoder.decodeLog(log(),position);assert.equal(decoded.payload.digest,digest.toBigInt().toString());
 const result=await decoder.decodeTransaction(nodeFixture(),txHash.toString());assert.deepEqual(result,[decoded]);
});
for(const [label,mutate] of [['emitter',l=>{l.contractAddress=AztecAddress.fromBigIntUnsafe(43n);}],['tag',l=>{l.fields[0]=Fr.ZERO;}],['digest',l=>{l.fields[3]=Fr.ZERO;}],['length',l=>{l.fields[4]=new Fr(993n);}],['extra field',l=>l.fields.push(Fr.ZERO)],['integer width',l=>{l.fields[2]=new Fr(1n<<32n);}]] )
 test(`labelled fixture: ${label} rejected`,async()=>{const l=log();mutate(l);await assert.rejects(()=>decoder.decodeLog(l,position));});
test('canonical position and schema extra fields rejected',async()=>{await assert.rejects(()=>decoder.decodeLog(log(),{...position,txIndexWithinBlock:'-1'}));const event=await decoder.decodeLog(log(),position);await assert.rejects(()=>validateRollingEvent({...event,payload:{...event.payload,owner:'secret'}},scope));});
for(const [label,mutate] of [['network',n=>{n.getNodeInfo=async()=>({l1ChainId:1});}],['class',n=>{n.getContract=async()=>null;}],['receipt',n=>{n.getTxReceipt=async()=>({status:TxStatus.PENDING});}],['effect',n=>{n.getTxEffect=async()=>null;}],['reorg',n=>{n.getBlockData=async()=>({blockHash:{equals:()=>false}});}]] )
 test(`labelled fixture: canonical ${label} mismatch rejected`,async()=>{const n=nodeFixture();mutate(n);await assert.rejects(()=>decoder.decodeTransaction(n,txHash.toString()));});
test('strict UTF8, padding, NUL and 31-byte word limits',()=>{
 assert.equal(unpackRollingText(['0'], '0',31,false),'');
 for(const [words,len] of [[['1'],'0'],[[(1n<<248n).toString()],'1'],[['0'],'1'],[[(0xc080n<<232n).toString()],'2']])assert.throws(()=>unpackRollingText(words,len,31));
});

test('labelled fixture: noncanonical ABI boolean is rejected before SDK truthiness decoding',async()=>{
 const abi=artifact.outputs.structs.events.find(e=>e.path==='RollingBoard::PluginConfigured');
 const tag=await computeLogTag((await EventSelector.fromSignature(decodeFunctionSignature('PluginConfigured',abi.fields))).toField(),DomainSeparator.EVENT_LOG_TAG);
 const forged=new PublicLog(board,[tag,new Fr(1n),new Fr(7n),new Fr(9n),new Fr(2n)]);
 await assert.rejects(()=>decoder.decodeLog(forged,position));
});
test('labelled fixture: final class change and different in-block effect cannot pass canonical binding',async()=>{
 const n=nodeFixture(),original=n.getContract;let calls=0;
 n.getContract=async()=>++calls===1?original():null;
 await assert.rejects(()=>decoder.decodeTransaction(n,txHash.toString()));
 const other=nodeFixture(),getBlock=other.getBlock;
 other.getBlock=async()=>{const block=await getBlock();block.body.txEffects=[{txHash,toBuffer:()=>Buffer.from('different effect')}];return block;};
 await assert.rejects(()=>decoder.decodeTransaction(other,txHash.toString()));
});
test('labelled fixture: reordered authenticated log bytes cannot match retained block effect',async()=>{
 const n=nodeFixture(),getBlock=n.getBlock,getEffect=n.getTxEffect;
 const first=log(),second=log();second.fields[2]=new Fr(2n);
 const serialize=logs=>Buffer.concat(logs.map(item=>item.toBuffer()));
 const returned=await getEffect();returned.data={...returned.data,publicLogs:[first,second],toBuffer:()=>serialize([first,second])};
 n.getTxEffect=async()=>returned;
 n.getBlock=async()=>{const block=await getBlock();block.body.txEffects=[{...returned.data,publicLogs:[second,first],toBuffer:()=>serialize([second,first])}];return block;};
 await assert.rejects(()=>decoder.decodeTransaction(n,txHash.toString()));
});
test('installed NodeBlockProvider requires explicit transactions and decoder requests them',async()=>{
 const {NodeBlockProvider}=await import(new URL('./modules/node_block_provider.js',import.meta.resolve('@aztec-labs/aztec-node')));
 const n=nodeFixture(),response=await n.getBlock();
 const full={...response,hash:async()=>response.hash,archive:{},number:1,checkpointNumber:1,indexWithinCheckpoint:0};
 full.header={...full.header,getBlockNumber:()=>1};
 const provider=new NodeBlockProvider({}, {getBlock:async()=>full,getBlockData:async()=>({header:full.header,blockHash:response.hash,archive:{},checkpointNumber:1,indexWithinCheckpoint:0})});
 const metadata=await provider.getBlock(1);assert.equal(metadata.body,undefined);
 assert.equal((await provider.getBlock(1,{includeTransactions:true})).body.txEffects.length,1);
 let requested;
 n.getBlock=(number,options)=>{requested=options;return provider.getBlock(number,options);};
 const events=await decoder.decodeTransaction(n,txHash.toString());assert.equal(events.length,1);assert.deepEqual(requested,{includeTransactions:true});
});

// Requires the normally processed profile candidate artifact, never a synthetic
// appended ABI. The payload is a labelled fixture, not a mined profile event.
async function profileLog(type,{nameId=7n,version=1n,bytes=Buffer.from([0xff,0]),clear=false}={}){
 const definition=artifact.outputs.structs.events.find(e=>e.path===`RollingBoard::${type}`);assert(definition,'Build the profile contract normally before running SDK event tests');
 const selector=await EventSelector.fromSignature(decodeFunctionSignature(type,definition.fields));
 const tag=await computeLogTag(selector.toField(),DomainSeparator.EVENT_LOG_TAG),isAvatar=type==='AvatarPublished';
 const content=clear?Buffer.alloc(0):isAvatar?bytes:Buffer.from('Bio'),storage=Buffer.alloc((isAvatar?265:32)*31);content.copy(storage);
 const words=Array.from({length:isAvatar?265:32},(_,i)=>new Fr(BigInt('0x'+storage.subarray(i*31,(i+1)*31).toString('hex'))));
 const length=BigInt(content.length),width=clear?0n:100n;
 const metadata=isAvatar?[1n,nameId,version,width,width,length]:[1n,nameId,version,length];
 const digest=await poseidon2HashWithSeparator([...metadata,...words],isAvatar?0x52434131:0x52434231);
 return new PublicLog(board,[tag,...metadata.map(v=>new Fr(v)),digest,...words,Fr.ONE]);
}
test('labelled actual profile ABI decodes binary avatar and bio logs with a nonzero trailer',async()=>{
 for(const type of ['BioPublished','AvatarPublished'])for(const clear of [false,true]){
  const l=await profileLog(type,{clear}),e=await decoder.decodeLog(l,position);assert.equal(e.type,type);assert.equal(e.payload.trailer,'1');assert.equal(e.payload.version,'1');
  assert.equal(e.payload.length,clear?'0':type==='BioPublished'?'3':'2');
  const n=nodeFixture(),effect=(await n.getTxEffect()).data,block=await n.getBlock();effect.publicLogs=[l];
  n.getTxEffect=async()=>({data:effect,l2BlockNumber:1,l2BlockHash:block.hash});
  n.getBlock=async()=>({...block,body:{txEffects:[effect]}});
  assert.deepEqual(await decoder.decodeTransaction(n,txHash.toString()),[e]);
 }
});
test('actual avatar ABI remains bounded at265 fields and preserves8192 binary bytes',async()=>{
 const bytes=Buffer.alloc(8192,255);bytes[8191]=0;const e=await decoder.decodeLog(await profileLog('AvatarPublished',{bytes}),position);
 assert.equal(e.payload.data.length,265);assert.equal(e.payload.length,'8192');
 for(const [label,mutate] of [
  ['wrong emitter',l=>{l.contractAddress=AztecAddress.fromBigIntUnsafe(43n);}],
  ['trailer',l=>{l.fields[l.fields.length-1]=Fr.ZERO;}],
  ['oversize',l=>{l.fields[6]=new Fr(8193n);}],
  ['digest',l=>{l.fields[7]=Fr.ZERO;}],
  ['word overflow',l=>{l.fields[8]=new Fr(1n<<248n);}],
  ['padding',l=>{l.fields[l.fields.length-2]=Fr.ONE;}],
 ]){const l=await profileLog('AvatarPublished',{bytes});mutate(l);await assert.rejects(()=>decoder.decodeLog(l,position),label);}
});
test('265-field exception cannot broaden text arrays or another event ABI',async()=>{
 for(const [eventName,fieldName,length] of [['MainPolicyPublished','rules',265],['BioPublished','content',265],['AvatarPublished','data',266]]){
  const changed=structuredClone(artifact),definition=changed.outputs.structs.events.find(e=>e.path===`RollingBoard::${eventName}`);
  definition.fields.find(f=>f.name===fieldName).type.length=length;
  await assert.rejects(()=>createRollingEventDecoder({artifact:changed,scope}));
 }
 assert.throws(()=>unpackRollingText(Array(265).fill('0'),'0',8192,false));
});

test('labelled actual AvatarRemoved ABI authenticates exact avatar version/digest and canonical reason',async()=>{
 const image=await decoder.decodeLog(await profileLog('AvatarPublished'),position),definition=artifact.outputs.structs.events.find(e=>e.path==='RollingBoard::AvatarRemoved');assert(definition);
 const selector=await EventSelector.fromSignature(decodeFunctionSignature('AvatarRemoved',definition.fields)),tag=await computeLogTag(selector.toField(),DomainSeparator.EVENT_LOG_TAG);
 const bytes=Buffer.alloc(7*31);bytes.write('Unsafe');const reason=Array.from({length:7},(_,i)=>new Fr(BigInt('0x'+bytes.subarray(i*31,(i+1)*31).toString('hex'))));
 const reasonDigest=await poseidon2HashWithSeparator([6n,...reason],0x52435431);
 const make=()=>new PublicLog(board,[tag,Fr.ONE,new Fr(7n),Fr.ONE,new Fr(BigInt(image.payload.digest)),Fr.ONE,reasonDigest,new Fr(6n),...reason]);
 const event=await decoder.decodeLog(make(),position);assert.equal(event.type,'AvatarRemoved');assert.equal(event.payload.avatar_digest,image.payload.digest);assert.equal(event.payload.main_policy_version,'1');
 for(const mutate of [l=>{l.contractAddress=AztecAddress.fromBigIntUnsafe(43n);},l=>{l.fields[3]=Fr.ZERO;},l=>{l.fields[6]=Fr.ZERO;},l=>{l.fields[7]=Fr.ZERO;},l=>{l.fields[l.fields.length-1]=Fr.ONE;}]){const bad=make();mutate(bad);await assert.rejects(()=>decoder.decodeLog(bad,position));}
});
