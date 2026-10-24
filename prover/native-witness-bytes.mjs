import {gunzipSync} from 'node:zlib';
import {serializeWitness} from '@aztec-foundation/noir-noirc_abi';

// Pinned Noir 5a7ee9bf (Aztec 6.0.0): noirc_abi_wasm::serialize_witness
// wraps WitnessMap in WitnessStack::from, then serialization::MsgpackCompact.
// https://github.com/noir-lang/noir/blob/5a7ee9bf5ed8973076df7bb0d2b723024db09ae7/tooling/noirc_abi_wasm/src/lib.rs
// https://github.com/noir-lang/noir/blob/5a7ee9bf5ed8973076df7bb0d2b723024db09ae7/acvm-repo/acir/src/serialization.rs
// The native backend takes the uncompressed bytes. Its public JS serializer
// exposes gzip only, so using it here would immediately undo a gzip-best pass.
const modulus='30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001';
const field=/^[0-9a-f]{64}$/;
const invalid=()=>{throw Error('Invalid native witness');};
const keyBytes=index=>index<128?1:index<=255?2:index<=65535?3:5;
const mapBytes=count=>count<16?1:count<=65535?3:5;

export function nativeWitnessBytes(witnesses){
 if(!Array.isArray(witnesses)||witnesses.length<1||witnesses.length>32)invalid();
 const fields=new Map();let total=0;
 return witnesses.map(witness=>{
  if(!(witness instanceof Map)||!Number.isSafeInteger(witness.size)||witness.size<0||witness.size>500000)invalid();
  let size=5+mapBytes(witness.size),previous=-1,count=0;
  for(const index of witness.keys()){
   if(!Number.isInteger(index)||index<0||index>0xffffffff||index<=previous)invalid();
   previous=index;size+=keyBytes(index)+34;count++;
  }
  if(count!==witness.size||size>16*1024*1024||(total+=size)>64*1024*1024)invalid();
  const output=Buffer.allocUnsafe(size);let at=0;
  // Format 3, WitnessStack tuple, single stack item tuple, function index 0.
  output.set([3,0x91,0x91,0x92,0],at);at+=5;
  if(count<16)output[at++]=0x80|count;
  else if(count<=65535){output[at++]=0xde;output.writeUInt16BE(count,at);at+=2;}
  else{output[at++]=0xdf;output.writeUInt32BE(count,at);at+=4;}
  for(const [index,value] of witness){
   if(index<128)output[at++]=index;
   else if(index<=255){output[at++]=0xcc;output[at++]=index;}
   else if(index<=65535){output[at++]=0xcd;output.writeUInt16BE(index,at);at+=2;}
   else{output[at++]=0xce;output.writeUInt32BE(index,at);at+=4;}
   let bytes=fields.get(value);
   if(bytes===undefined){
    if(typeof value!=='string'||!field.test(value)||value>=modulus)invalid();
    bytes=Buffer.from(value,'hex');fields.set(value,bytes);
   }
   output[at++]=0xc4;output[at++]=32;bytes.copy(output,at);at+=32;
  }
  if(at!==size)invalid();return output;
 });
}

// Fail closed if an SDK upgrade changes the native format. Only fixed synthetic
// values are used; this does not compress any real witness or retain its data.
export function assertNativeWitnessFormat(nativeSerialize=serializeWitness){
 const keys=[0,1,127,128,255,256,65535,65536,0xffffffff];
 const sample=new Map(keys.map((key,i)=>[key,i===8?modulus.slice(0,-1)+'0':BigInt(i).toString(16).padStart(64,'0')]));
 const expected=nativeWitnessBytes([sample])[0];
 const actual=gunzipSync(nativeSerialize(sample),{maxOutputLength:expected.length});
 if(!actual.equals(expected))throw Error('Native witness serialization format changed');
}
