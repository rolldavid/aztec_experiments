// Exact witness transport. Deduplication is confined to one request; nothing is
// retained across accounts or proofs. The native prover still consumes the same
// field values at the same witness indices.
export const MAX_DICTIONARY_BYTES=64*1024*1024;
export const MAX_WITNESS_ENTRIES=500000;
export const MAX_TOTAL_WITNESS_ENTRIES=1500000;
const field=/^(?:0x)?[0-9a-f]{64}$/;
const invalid=()=>{throw Error('Invalid witness dictionary');};
const bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_TOTAL_WITNESS_ENTRIES;

export function encodeWitnessDictionary(witnesses){
 if(!Array.isArray(witnesses)||witnesses.length<1||witnesses.length>32)invalid();
 const counts=witnesses.map(w=>{if(!(w instanceof Map)||w.size>MAX_WITNESS_ENTRIES)invalid();return w.size;});
 const total=counts.reduce((a,b)=>a+b,0);if(!bounded(total))invalid();
 const dictionary=new Map(),aliases=new Map(),fields=[],records=new Uint8Array(total*10);let at=0;
 const put=n=>{while(n>=128){records[at++]=(n%128)|128;n=Math.floor(n/128);}records[at++]=n;};
 for(const [step,witness] of witnesses.entries()){
  let entries=witness,previous=-1;
  for(const index of witness.keys()){if(!Number.isInteger(index)||index<0||index>0xffffffff)invalid();if(index<=previous){entries=[...witness].sort((a,b)=>a[0]-b[0]);break;}previous=index;}
  previous=0;let first=true,entryCount=0;
  for(const [index,value] of entries){
   if(!Number.isInteger(index)||index<0||index>0xffffffff||(!first&&index<=previous)||typeof value!=='string')invalid();
   let id=aliases.get(value);
   if(id===undefined){
    const hex=value.startsWith('0x')?value.slice(2):value;id=dictionary.get(hex);
    if(id===undefined){if(!field.test(value))invalid();id=fields.length;dictionary.set(hex,id);fields.push(hex);}
    aliases.set(value,id);
   }
   put(index-previous);put(id);previous=index;first=false;entryCount++;
   if(entryCount>counts[step])invalid();
  }
  if(entryCount!==counts[step])invalid();
 }
 const size=4+fields.length*32+at;if(size>MAX_DICTIONARY_BYTES)invalid();
 const bytes=new Uint8Array(size);new DataView(bytes.buffer).setUint32(0,fields.length);
 for(let i=0;i<fields.length;i++)for(let j=0;j<32;j++){const a=fields[i].charCodeAt(j*2),b=fields[i].charCodeAt(j*2+1);bytes[4+i*32+j]=((a<=57?a-48:a-87)<<4)|(b<=57?b-48:b-87);}
 bytes.set(records.subarray(0,at),4+fields.length*32);
 return {bytes,counts};
}

export function decodeWitnessDictionary(bytes,counts){
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>MAX_DICTIONARY_BYTES||!Array.isArray(counts)||counts.length<1||counts.length>32||counts.some(n=>!Number.isInteger(n)||n<0||n>MAX_WITNESS_ENTRIES))invalid();
 const total=counts.reduce((a,b)=>a+b,0);if(!bounded(total))invalid();
 const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
 if(size>total||4+size*32>bytes.length)invalid();
 const fields=Array(size);for(let i=0;i<size;i++){
  let hex='';for(let j=0;j<32;j++)hex+=bytes[4+i*32+j].toString(16).padStart(2,'0');fields[i]=hex;
 }
 let at=4+size*32;
 const get=()=>{
  let n=0,multiplier=1;
  for(let i=0;i<5;i++){
   if(at>=bytes.length)invalid();const b=bytes[at++];n+=(b&127)*multiplier;
   if(n>0xffffffff)invalid();
   if(b<128){if(i>0&&b===0)invalid();return n;}multiplier*=128;
  }invalid();
 };
 const witnesses=counts.map(count=>{
  const witness=new Map();let previous=0;
  for(let i=0;i<count;i++){
   const delta=get(),id=get(),index=previous+delta;
   if(index>0xffffffff||(i>0&&delta===0)||id>=fields.length)invalid();
   witness.set(index,fields[id]);previous=index;
  }return witness;
 });
 if(at!==bytes.length)invalid();return witnesses;
}

export async function gzipWitnessDictionary(bytes){
 return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
