// One current wire format: JSON metadata and a gzipped cross-witness dictionary.
import {encodeWitnessDictionary,gzipWitnessDictionary,MAX_DICTIONARY_BYTES,MAX_WITNESS_ENTRIES,MAX_TOTAL_WITNESS_ENTRIES} from './remote-witness-dictionary.mjs';
export const PROVER_API_VERSION=2;
export const MAX_REQUEST_BYTES=8*1024*1024;
export const MAX_STEPS=32;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export async function encodeJob(metadata,witnesses,measure=(_stage,operation)=>operation()){
  const dictionary=await measure('transport.dictionary',()=>encodeWitnessDictionary(witnesses));
  const payload=await measure('transport.compress',()=>gzipWitnessDictionary(dictionary.bytes));
  const header=encoder.encode(JSON.stringify({...metadata,version:PROVER_API_VERSION,counts:dictionary.counts,uncompressedBytes:dictionary.bytes.length,payloadBytes:payload.byteLength}));
  if(header.length>32768)throw Error('Prover metadata too large');
  const size=4+header.length+payload.byteLength;
  if(size>MAX_REQUEST_BYTES)throw Error('Prover request too large');
  const out=new Uint8Array(size);new DataView(out.buffer).setUint32(0,header.length);out.set(header,4);
  out.set(payload,4+header.length);return out;
}
export function decodeJob(bytes){
  if(bytes.length<4||bytes.length>MAX_REQUEST_BYTES)throw Error('Invalid job size');
  const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(n>32768||n+4>bytes.length)throw Error('Invalid metadata size');
  const metadata=JSON.parse(decoder.decode(bytes.subarray(4,4+n)));
  if(metadata.version!==PROVER_API_VERSION||!Array.isArray(metadata.circuits)||metadata.circuits.length<1||metadata.circuits.length>MAX_STEPS||!Array.isArray(metadata.counts)||metadata.counts.length!==metadata.circuits.length)throw Error('Invalid job');
  if(metadata.counts.some(count=>!Number.isInteger(count)||count<0||count>MAX_WITNESS_ENTRIES)||metadata.counts.reduce((a,b)=>a+b,0)>MAX_TOTAL_WITNESS_ENTRIES||!Number.isInteger(metadata.uncompressedBytes)||metadata.uncompressedBytes<4||metadata.uncompressedBytes>MAX_DICTIONARY_BYTES||!Number.isInteger(metadata.payloadBytes)||metadata.payloadBytes<1||metadata.payloadBytes!==bytes.length-4-n)throw Error('Invalid witness bounds');
  if(metadata.circuits.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)))throw Error('Invalid circuits');
  return {metadata,payload:bytes.subarray(4+n)};
}
export async function circuitId(bytecode,vk,cryptoApi=globalThis.crypto){
  const data=new Uint8Array(4+bytecode.length+vk.length);new DataView(data.buffer).setUint32(0,bytecode.length);data.set(bytecode,4);data.set(vk,4+bytecode.length);
  return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
}
