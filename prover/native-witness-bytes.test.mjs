import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import {serializeWitness,deserializeWitness} from '@aztec-foundation/noir-noirc_abi';
import {nativeWitnessBytes,assertNativeWitnessFormat} from './native-witness-bytes.mjs';
const hex=value=>BigInt(value).toString(16).padStart(64,'0');
const modulus=BigInt('0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001');
for(const count of [0,1,15,16,255,256,65535,65536])test('native uncompressed stack equals SDK at map-width boundary '+count,()=>{
 const map=new Map(Array.from({length:count},(_,i)=>[i,hex(BigInt(i)%3n===0n?modulus-1n:BigInt(i))]));
 const raw=nativeWitnessBytes([map])[0];assert.deepEqual(raw,gunzipSync(serializeWitness(map)));
 assert.deepEqual([...deserializeWitness(gzipSync(raw))].map(([key,value])=>[key,value.slice(2)]),[...map]);
});
test('all unsigned index widths, field boundaries and repeated fields across witnesses equal native bytes',()=>{
 const a=new Map([0,1,127,128,255,256,65535,65536,0xffffffff].map((key,i)=>[key,hex(i%2?modulus-1n:BigInt(i))]));
 const b=new Map([[0,hex(0)],[9,hex(modulus-1n)]]),before=[...a];
 for(const [i,raw] of nativeWitnessBytes([a,b]).entries())assert.deepEqual(raw,gunzipSync(serializeWitness([a,b][i])));
 assert.deepEqual([...a],before);assertNativeWitnessFormat();
});
test('format guard fails closed on changed format, indices or field bytes',()=>{
 for(const offset of [0,4,8,20])assert.throws(()=>assertNativeWitnessFormat(map=>{const raw=gunzipSync(serializeWitness(map));raw[offset]^=1;return gzipSync(raw);}));
});
test('native encoder rejects noncanonical fields and invalid maps before the proof backend',()=>{
 for(const map of [new Map([[0,hex(modulus)]]),new Map([[0,'f'.repeat(64)]]),new Map([[0,'01']]),new Map([[-1,hex(0)]]),new Map([[2**32,hex(0)]]),new Map([[2,hex(0)],[1,hex(0)]])])assert.throws(()=>nativeWitnessBytes([map]));
 for(const input of [[],Array(33).fill(new Map()),[{}]])assert.throws(()=>nativeWitnessBytes(input));
 const wrong=new Map([[0,hex(0)]]);Object.defineProperty(wrong,'size',{value:0});assert.throws(()=>nativeWitnessBytes([wrong]));
});
test('raw per-witness and total limits remain 16MiB and64MiB',()=>{
 const large=new Map(Array.from({length:450000},(_,i)=>[i,hex(0)]));assert.throws(()=>nativeWitnessBytes([large]));
 const bounded=new Map(Array.from({length:350000},(_,i)=>[i,hex(0)]));assert.throws(()=>nativeWitnessBytes(Array(5).fill(bounded)));
});
