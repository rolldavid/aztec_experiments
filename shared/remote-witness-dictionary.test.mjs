import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import {serializeWitness,deserializeWitness} from '@aztec-foundation/noir-noirc_abi';
import {encodeWitnessDictionary,decodeWitnessDictionary,MAX_DICTIONARY_BYTES,MAX_TOTAL_WITNESS_ENTRIES,MAX_WITNESS_ENTRIES} from './remote-witness-dictionary.mjs';
import {encodeJob,decodeJob} from './remote-prover-wire.mjs';

const hex=n=>BigInt(n).toString(16).padStart(64,'0');
const metadata={board:'0x'+'1'.repeat(64),chainId:'31337',rollupVersion:'1',mode:'real',circuits:['a'.repeat(64),'b'.repeat(64)]};
const native=w=>gunzipSync(serializeWitness(w));
function frame(meta,payload){const head=Buffer.from(JSON.stringify(meta)),out=Buffer.alloc(4+head.length+payload.length);out.writeUInt32BE(head.length);head.copy(out,4);payload.copy(out,4+head.length);return out;}

test('dictionary round trip is byte-exact for native sparse, unsorted and repeated witnesses without mutating inputs',async()=>{
 const a=new Map([[0,hex(0)],[1,hex(1)],[127,hex(128)],[65536,hex(2n**253n)],[0xffffffff,hex(99)]]),b=new Map([[9,'0x'+hex(1)],[2,hex(0)],[128,'0x'+hex(2n**253n)]]),input=[a,b],before=input.map(w=>[...w]);
 const job=decodeJob(await encodeJob(metadata,input)),maps=decodeWitnessDictionary(gunzipSync(job.payload,{maxOutputLength:job.metadata.uncompressedBytes}),job.metadata.counts);
 for(let i=0;i<input.length;i++)assert.deepEqual(native(maps[i]),native(input[i]));
 assert.deepEqual(input.map(w=>[...w]),before);
 assert.deepEqual(maps.map(w=>[...w]),input.map(w=>[...deserializeWitness(serializeWitness(w))].map(([index,value])=>[index,value.slice(2)])));
 assert.equal(gunzipSync(job.payload).readUInt32BE(),5,'dictionary is shared across both witnesses');
});
test('empty map and cross-step zero/one values keep exact native map semantics',async()=>{
 const input=[new Map(),new Map([[0,hex(0)],[1,hex(1)]])],job=decodeJob(await encodeJob(metadata,input));
 const decoded=decodeWitnessDictionary(gunzipSync(job.payload),job.metadata.counts);
 assert.deepEqual(decoded,input);
});
test('many repeated fields use one dictionary and preserve every index',async()=>{
 const input=Array.from({length:6},(_,step)=>new Map(Array.from({length:12000},(_,i)=>[i*2,hex((i+step)%32)])));
 const meta={...metadata,circuits:Array(6).fill('a'.repeat(64))},job=decodeJob(await encodeJob(meta,input)),raw=gunzipSync(job.payload);
 assert.equal(raw.readUInt32BE(),32);assert.deepEqual(decodeWitnessDictionary(raw,job.metadata.counts),input);
 assert(job.payload.length<10000);
});
test('encoder enforces exact index, field and aggregate bounds',()=>{
 for(const witness of [new Map([[-1,hex(0)]]),new Map([[1.1,hex(0)]]),new Map([[2**32,hex(0)]]),new Map([[0,'private-invalid']]),new Map([[0,hex(1).toUpperCase().replace('1','A')]])])assert.throws(()=>encodeWitnessDictionary([witness]));
 assert.throws(()=>encodeWitnessDictionary([]));assert.throws(()=>encodeWitnessDictionary(Array(33).fill(new Map())));
 const wrongSize=new Map([[0,hex(0)]]);Object.defineProperty(wrongSize,'size',{value:0});assert.throws(()=>encodeWitnessDictionary([wrongSize]));
 const huge=new Map();Object.defineProperty(huge,'size',{value:MAX_WITNESS_ENTRIES+1});assert.throws(()=>encodeWitnessDictionary([huge]));
 const count=new Map();Object.defineProperty(count,'size',{value:MAX_WITNESS_ENTRIES});assert.throws(()=>encodeWitnessDictionary(Array(4).fill(count)));
});
test('decoder rejects truncated, trailing, overflow, duplicate and noncanonical records',()=>{
 const encoded=encodeWitnessDictionary([new Map([[0,hex(1)],[1,hex(2)]])]),bytes=encoded.bytes;
 assert.throws(()=>decodeWitnessDictionary(bytes.subarray(0,-1),[2]));
 assert.throws(()=>decodeWitnessDictionary(Uint8Array.from([...bytes,0]),[2]));
 for(const counts of [[-1],[1.1],[MAX_WITNESS_ENTRIES+1],Array(4).fill(MAX_WITNESS_ENTRIES)])assert.throws(()=>decodeWitnessDictionary(bytes,counts));
 const base=bytes.subarray(0,4+64);
 for(const records of [[0,0,0,1],[0,2,1,0],[128,0,0,1,1],[255,255,255,255,31,0,1,1],[0,0,128]])assert.throws(()=>decodeWitnessDictionary(Uint8Array.from([...base,...records]),[2]));
 const tooMany=bytes.slice();new DataView(tooMany.buffer).setUint32(0,3);assert.throws(()=>decodeWitnessDictionary(tooMany,[2]));
});
test('wire bounds reject malformed metadata before decompression and cap expanded bytes',async()=>{
 const job=decodeJob(await encodeJob(metadata,[new Map([[0,hex(1)]]),new Map()]));
 for(const patch of [{version:1},{counts:[1]},{counts:[MAX_WITNESS_ENTRIES+1,0]},{counts:Array(4).fill(MAX_TOTAL_WITNESS_ENTRIES)},{uncompressedBytes:MAX_DICTIONARY_BYTES+1},{uncompressedBytes:0},{payloadBytes:job.payload.length+1}])assert.throws(()=>decodeJob(frame({...job.metadata,...patch},Buffer.from(job.payload))));
 const compressed=gzipSync(Buffer.alloc(100000)),declared={...job.metadata,uncompressedBytes:4,payloadBytes:compressed.length};
 const bomb=decodeJob(frame(declared,compressed));assert.throws(()=>gunzipSync(bomb.payload,{maxOutputLength:bomb.metadata.uncompressedBytes}));
});
