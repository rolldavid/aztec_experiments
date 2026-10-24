import {transactionError} from './transaction-outcomes.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const hexDigits=new TextEncoder().encode('0123456789abcdef');
const hexValues=new Uint8Array(128).fill(255);
for(let i=0;i<16;i++)hexValues[hexDigits[i]]=i;
// Fixed buffers avoid one allocated string/array entry for every ciphertext byte.
const hex=data=>{
  const encoded=new Uint8Array(data.length*2);
  for(let i=0;i<data.length;i++){encoded[i*2]=hexDigits[data[i]>>>4];encoded[i*2+1]=hexDigits[data[i]&15];}
  return decoder.decode(encoded);
};
const bytes=value=>{
  if(value.length===0||value.length%2!==0)throw invalid();
  const decoded=new Uint8Array(value.length/2);
  for(let i=0;i<decoded.length;i++){
    const high=hexValues[value.charCodeAt(i*2)],low=hexValues[value.charCodeAt(i*2+1)];
    if(!(high<=15&&low<=15))throw invalid();
    decoded[i]=(high<<4)|low;
  }
  return decoded;
};
const invalid=()=>transactionError('BB_JOURNAL_INVALID','Transaction recovery storage could not be authenticated or saved.');
const MAX_BYTES=16*1024*1024;
// A wallet-owned encrypted descriptor makes records portable without putting
// board/account associations into the storage index. It is committed in the same
// atomic write as the transaction bytes, so no separate catalog can lag behind.
export async function journalRecoveryIdentity({walletSecret,walletSalt,crypto=globalThis.crypto}) {
  const field=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if(typeof walletSecret!=='string'||!/^0x[0-9a-f]{64}$/.test(walletSecret)||BigInt(walletSecret)<=0n||BigInt(walletSecret)>=field)throw invalid();
  let salt;try{if(!['string','number','bigint'].includes(typeof walletSalt)||(typeof walletSalt==='number'&&!Number.isSafeInteger(walletSalt)))throw invalid();salt=BigInt(walletSalt);}catch{throw invalid();}
  if(salt<0n||salt>=field)throw invalid();
  const material=encoder.encode('AZTEC_BB_JOURNAL_RECOVERY_KEY_V1\0'+walletSecret+':'+BigInt(walletSalt).toString(16).padStart(64,'0'));
  const digest=await crypto.subtle.digest('SHA-256',material);material.fill(0);
  const owner=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',digest)));
  const key=await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);
  return {key,owner};
}
export async function decryptJournalDescriptor(recovery,identity,crypto=globalThis.crypto) {
  let plain;
  try {
    if(!recovery||recovery.owner!==identity.owner||typeof recovery.iv!=='string'||!/^[0-9a-f]{24}$/.test(recovery.iv)||typeof recovery.data!=='string'||recovery.data.length>8192)throw invalid();
    plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(recovery.iv),additionalData:encoder.encode(identity.owner)},identity.key,bytes(recovery.data)));
    return JSON.parse(decoder.decode(plain));
  }catch{throw invalid();}finally{plain?.fill(0);}
}
export async function createEncryptedJournalSlot({storage,walletSecret,walletSalt,scopeText,keyDomain,crypto=globalThis.crypto}) {
  const field=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if(typeof walletSecret!=='string'||!/^0x[0-9a-f]{64}$/.test(walletSecret)||BigInt(walletSecret)<=0n||BigInt(walletSecret)>=field)throw invalid();
  if(!['string','number','bigint'].includes(typeof walletSalt)||(typeof walletSalt==='number'&&!Number.isSafeInteger(walletSalt)))throw invalid();
  let salt;try{salt=BigInt(walletSalt);}catch{throw invalid();}if(salt<0n||salt>=field)throw invalid();
  const aad=encoder.encode(scopeText),material=encoder.encode(keyDomain+'\0'+walletSecret+':'+salt.toString(16).padStart(64,'0'));
  const digest=await crypto.subtle.digest('SHA-256',material);material.fill(0);
  const key=await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);
  const storageKey=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',aad)));
  const identity=await journalRecoveryIdentity({walletSecret,walletSalt,crypto});
  async function read() {
    let encoded,plain;
    try {
      encoded=await storage.read(storageKey);if(encoded===null)return {encoded:null,value:null};
      if(typeof encoded!=='string'||encoded.length>MAX_BYTES*2+16384)throw invalid();
      const e=JSON.parse(encoded);
      if(e.version!==1||typeof e.iv!=='string'||!/^[0-9a-f]{24}$/.test(e.iv)||typeof e.data!=='string'||e.data.length>MAX_BYTES*2)throw invalid();
      if(e.recovery) {const descriptor=await decryptJournalDescriptor(e.recovery,identity,crypto);if(descriptor.scopeText!==scopeText||descriptor.keyDomain!==keyDomain)throw invalid();}
      plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:aad},key,bytes(e.data)));
      return {encoded,value:JSON.parse(decoder.decode(plain))};
    }catch{throw invalid();}finally{plain?.fill(0);}
  }
  // This is only a freshness comparison against bytes already authenticated by
  // read(). It returns no plaintext or authority and retains no decoded record.
  // Callers must still validate their original record and operation ownership.
  async function isCurrent(encoded) {
    if(encoded!==null&&typeof encoded!=='string')throw invalid();
    try{return await storage.read(storageKey)===encoded;}catch{throw invalid();}
  }
  async function write(previous,value) {
    const plain=encoder.encode(JSON.stringify(value));if(plain.length>MAX_BYTES-16)throw invalid();
    const iv=crypto.getRandomValues(new Uint8Array(12));let encoded;
    const descriptor=encoder.encode(JSON.stringify({scopeText,keyDomain})),descriptorIv=crypto.getRandomValues(new Uint8Array(12));
    try {
      const recovery={owner:identity.owner,iv:hex(descriptorIv),data:hex(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:descriptorIv,additionalData:encoder.encode(identity.owner)},identity.key,descriptor)))};
      encoded=JSON.stringify({version:1,iv:hex(iv),data:hex(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain))),recovery});
    }finally{plain.fill(0);descriptor.fill(0);}
    try{await storage.compareAndSwap(storageKey,previous.encoded,encoded);}catch{throw invalid();}
    const saved=await read();if(saved.encoded!==encoded)throw invalid();return saved;
  }
  return {read,write,isCurrent,storageKey};
}
