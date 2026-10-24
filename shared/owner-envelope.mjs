// Owner-only delivery is unconstrained host work. Native note inclusion and
// nullification checks still authenticate the recovered state before spending.
const FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const HEX=/^0x[0-9a-fA-F]{64}$/;
const encoder=new TextEncoder(),VERSION=encoder.encode('ROLLING_OWNER_ENVELOPE_V1');
const ZERO='0x'+'0'.repeat(64),MAX_PLAIN=12,MAX_CIPHER=15;
export const OWNER_ENVELOPE_ORACLES=Object.freeze({locator:'rolling_owner_locator_v1',seal:'rolling_owner_seal_v1',open:'rolling_owner_open_v1'});
const invalid=()=>Object.assign(Error('Owner delivery data is invalid.'),{code:'BB_OWNER_ENVELOPE_INVALID'});
function check(value){if(!value)throw invalid();}
function field(value){check(typeof value==='string'&&HEX.test(value));const n=BigInt(value);check(n<FIELD);return n;}
function scalar(input,max=FIELD-1n){check(Array.isArray(input)&&input.length===1);const n=field(input[0]);check(n<=max);return n;}
function fields(input,length){check(Array.isArray(input)&&input.length===length);return input.map(field);}
const hex=n=>'0x'+n.toString(16).padStart(64,'0');
function bytes(n,length){const result=new Uint8Array(length);for(let i=length-1;i>=0;i--){result[i]=Number(n&255n);n>>=8n;}check(n===0n);return result;}
function integer(input){let n=0n;for(const b of input)n=(n<<8n)|BigInt(b);return n;}
function concat(...parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
function context(secret,domain,sequence,role){
 const key=scalar(secret),scope=fields(domain,4);check(key>0n&&scope.every(n=>n>0n));
 return {key:bytes(key,32),aad:concat(VERSION,...scope.map(n=>bytes(n,32)),bytes(scalar(sequence,(1n<<64n)-1n),8),bytes(scalar(role,(1n<<32n)-1n),4))};
}
async function derive(crypto,key,aad,purpose,algorithm,usages){
 const material=await crypto.subtle.importKey('raw',key,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:VERSION,info:concat(encoder.encode(purpose),aad)},material,algorithm,false,usages);
}
function pack(cipher){
 check(cipher.length===414);const result=Array(MAX_CIPHER).fill(ZERO);result[0]=hex(BigInt(cipher.length));
 for(let at=0,index=1;at<cipher.length;at+=31,index++){const chunk=new Uint8Array(31);chunk.set(cipher.subarray(at,at+31));result[index]=hex(integer(chunk));}
 return [result,hex(BigInt(MAX_CIPHER))];
}
function unpack(input,length){
 const values=fields(input,MAX_CIPHER),count=Number(scalar(length,BigInt(MAX_CIPHER)));
 const size=Number(values[0]);check(size===414&&count===MAX_CIPHER);
 const packed=concat(...values.slice(1).map(n=>bytes(n,31)));check(packed.subarray(size).every(n=>n===0));return packed.slice(0,size);
}
export function createOwnerEnvelopeOracles({crypto=globalThis.crypto}={}){
 check(crypto&&typeof crypto.getRandomValues==='function'&&crypto.subtle);
 return Object.freeze({
  async [OWNER_ENVELOPE_ORACLES.locator](...args){
   check(args.length===4);const {key,aad}=context(...args);
   try{const hmac=await derive(crypto,key,aad,'locator',{name:'HMAC',hash:'SHA-256',length:256},['sign']);return [hex(integer(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,aad)).subarray(0,31)))];}
   finally{key.fill(0);}
  },
  async [OWNER_ENVELOPE_ORACLES.seal](...args){
   check(args.length===6);const {key,aad}=context(...args.slice(0,4));
   try{
    const plain=fields(args[4],MAX_PLAIN),length=Number(scalar(args[5],BigInt(MAX_PLAIN)));
    const padded=plain.map((n,i)=>i<length?n:0n);
    const clear=concat(bytes(BigInt(length),2),...padded.map(n=>bytes(n,32)));
    try{const nonce=crypto.getRandomValues(new Uint8Array(12)),aes=await derive(crypto,key,aad,'encryption',{name:'AES-GCM',length:256},['encrypt']);
     const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad,tagLength:128},aes,clear));return pack(concat(nonce,encrypted));
    }finally{clear.fill(0);}
   }finally{key.fill(0);}
  },
  async [OWNER_ENVELOPE_ORACLES.open](...args){
   check(args.length===6);const {key,aad}=context(...args.slice(0,4));
   try{
    let clear;
    try{
     const cipher=unpack(args[4],args[5]),aes=await derive(crypto,key,aad,'encryption',{name:'AES-GCM',length:256},['decrypt']);
     clear=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:cipher.subarray(0,12),additionalData:aad,tagLength:128},aes,cipher.subarray(12)));
     const length=Number(integer(clear.subarray(0,2)));check(length<=MAX_PLAIN&&clear.length===2+32*MAX_PLAIN&&clear.subarray(2+32*length).every(n=>n===0));
     const values=Array(MAX_PLAIN).fill(ZERO);for(let i=0;i<length;i++){const n=integer(clear.subarray(2+32*i,34+32*i));check(n<FIELD);values[i]=hex(n);}
     return [hex(1n),values,hex(BigInt(length))];
    }catch{return [ZERO,Array(MAX_PLAIN).fill(ZERO),ZERO];}
    finally{clear?.fill(0);}
   }finally{key.fill(0);}
  },
 });
}
// Keep the SDK callback object as the authority for every native oracle. The
// three application names consume only explicit inputs, never a host key store.
export function wrapOwnerEnvelopeCallbacks(native,oracles=createOwnerEnvelopeOracles()){
 return new Proxy(native,{get(target,name){return Object.hasOwn(oracles,name)?oracles[name]:Reflect.get(target,name,target);}});
}
export function withOwnerEnvelopeOracles(simulator,options){
 const oracles=createOwnerEnvelopeOracles(options);
 return new Proxy(simulator,{get(target,name){
  if(name==='executeUserCircuit')return (input,artifact,callback)=>target.executeUserCircuit(input,artifact,wrapOwnerEnvelopeCallbacks(callback,oracles));
  const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;
 }});
}
