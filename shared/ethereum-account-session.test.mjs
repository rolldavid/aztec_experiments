import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import * as ethers from 'ethers';

const source=await fs.readFile(new URL('./ethereum-account-session.js',import.meta.url),'utf8');
const FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const scope={origin:'https://rolling.example',chainId:'11155111'};
const signer=new ethers.Wallet('0x'+'12'.repeat(32));
const metadata={ethereumAddress:signer.address.toLowerCase(),providerId:'io.metamask'};
const wallet={address:'0x'+'01'.repeat(32),secretKey:'0x'+'02'.repeat(32),salt:'0x'+123n.toString(16).padStart(64,'0')};
function fixture(indexedDB=new IDBFactory()){
 const context=vm.createContext({TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,crypto:webcrypto,indexedDB});
 vm.runInContext(source,context,{filename:'ethereum-account-session.js'});
 return {api:context.BillboardEthereumSession,indexedDB};
}
async function raw(indexedDB,operation){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rolling-ethereum-account-session',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('sessions','readwrite');let result;
  const request=operation(tx.objectStore('sessions'));request.onsuccess=()=>{result=request.result;};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
const key=scope=>JSON.stringify(['ROLLING_ETHEREUM_SESSION_V1',scope.origin,scope.chainId]);
const plain=value=>JSON.parse(JSON.stringify(value));

test('signature request clearly identifies origin/account/chain and remains stable without nonce or time',()=>{
 const {api}=fixture(),input={...scope,address:signer.address};
 const message=api.createMessage(input);
 assert.equal(message,api.createMessage({...input,address:signer.address.toLowerCase()}));
 assert.match(message,/Create or open your private Rolling Chat account/);
 assert.match(message,/Only sign this request on https:\/\/rolling.example\./);
 assert.match(message,/This signature is your account key; do not share it\./);
 assert(message.includes(metadata.ethereumAddress)&&message.includes(scope.chainId));
 assert.doesNotMatch(message,/nonce|timestamp|issued at|expiration|board|sign.in with ethereum/i);
 assert.throws(()=>api.createMessage({...input,origin:'https://rolling.example/path'}));
});

test('EOA signature derives deterministic separate nonzero field values across canonical signature encodings',async()=>{
 const {api}=fixture(),message=api.createMessage({...scope,address:signer.address});
 const signature=await signer.signMessage(message),parsed=ethers.Signature.from(signature);
 const first=await api.derive({ethers,signature,message,address:signer.address});
 const compact=await api.derive({ethers,signature:parsed.compactSerialized,message,address:signer.address});
 const parity=await api.derive({ethers,signature:signature.slice(0,-2)+(parsed.yParity?'01':'00'),message,address:signer.address});
 const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
 const high=ethers.concat([parsed.r,ethers.toBeHex(order-BigInt(parsed.s),32),parsed.v===27?'0x1c':'0x1b']);
 const canonical=await api.derive({ethers,signature:high,message,address:signer.address});
 assert.deepEqual(plain(first),plain(compact));assert.deepEqual(plain(first),plain(parity));assert.deepEqual(plain(first),plain(canonical));
 assert.match(first.secretKey,/^0x[0-9a-f]{64}$/);
 assert.match(first.salt,/^0x[0-9a-f]{64}$/);
 for(const value of [first.secretKey,first.salt])assert(BigInt(value)>0n&&BigInt(value)<FIELD);
 assert.notEqual(BigInt(first.secretKey),BigInt(first.salt));
});

test('derivation rejects wrong signer/message and binds origin plus chain',async()=>{
 const {api}=fixture(),message=api.createMessage({...scope,address:signer.address}),signature=await signer.signMessage(message);
 const input={ethers,signature,message,address:signer.address};
 const original=await api.derive(input);
 await assert.rejects(api.derive({...input,address:new ethers.Wallet('0x'+'13'.repeat(32)).address}),{code:'BB_ETHEREUM_SESSION_SIGNATURE'});
 await assert.rejects(api.derive({...input,message:message+' changed'}),{code:'BB_ETHEREUM_SESSION_SIGNATURE'});
 await assert.rejects(api.derive({...input,signature:'0x1234'}),{code:'BB_ETHEREUM_SESSION_SIGNATURE'});
 for(const changed of [{...scope,origin:'https://other.example'},{...scope,chainId:'1'}]){
  const next=api.createMessage({...changed,address:signer.address});
  const result=await api.derive({...input,message:next,signature:await signer.signMessage(next)});
  assert.notEqual(original.secretKey,result.secretKey);assert.notEqual(original.salt,result.salt);
 }
});

test('remembered account uses cloned nonextractable AES key and authenticated ciphertext, reloads in a new instance',async()=>{
 const {api,indexedDB}=fixture();assert.equal(await api.load(scope),null);
 await api.save(scope,wallet,metadata);
 const record=await raw(indexedDB,store=>store.get(key(scope)));
 assert.deepEqual(Object.keys(record).sort(),['ciphertext','iv','key','metadata','scope','version']);
 assert.equal(record.key.extractable,false);assert.equal(record.key.algorithm.name,'AES-GCM');assert.equal(record.key.algorithm.length,256);
 await assert.rejects(webcrypto.subtle.exportKey('raw',record.key));
 assert(!JSON.stringify(record).includes(wallet.secretKey));assert(!JSON.stringify(record).includes(wallet.address));
 const reopened=api.create({indexedDB,crypto:webcrypto});
 assert.deepEqual(plain(await reopened.load(scope)),{wallet,metadata});
 assert.equal(await reopened.load({...scope,chainId:'1'}),null);
});

for(const field of ['ciphertext','metadata','scope','version','key'])test('remembered account rejects changed '+field,async()=>{
 const {api,indexedDB}=fixture();await api.save(scope,wallet,metadata);
 const record=await raw(indexedDB,store=>store.get(key(scope)));
 if(field==='ciphertext')new Uint8Array(record.ciphertext)[0]^=1;
 if(field==='metadata')record.metadata.providerId='io.other';
 if(field==='scope')record.scope=key({...scope,chainId:'1'});
 if(field==='version')record.version=2;
 if(field==='key')record.key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 await raw(indexedDB,store=>store.put(record,key(scope)));
 await assert.rejects(api.load(scope),{code:'BB_ETHEREUM_SESSION_INVALID'});
});

test('scope copying cannot decrypt another origin and chain session',async()=>{
 const {api,indexedDB}=fixture();await api.save(scope,wallet,metadata);
 const record=await raw(indexedDB,store=>store.get(key(scope))),other={...scope,origin:'https://other.example'};
 record.scope=key(other);await raw(indexedDB,store=>store.put(record,key(other)));
 await assert.rejects(api.load(other),{code:'BB_ETHEREUM_SESSION_INVALID'});
 assert.deepEqual(plain(await api.load(scope)),{wallet,metadata});
});

test('clear follows queued save, removes only selected scope, and invalid replacements preserve current session',async()=>{
 const {api}=fixture(),other={...scope,chainId:'1'};
 const saved=api.save(scope,wallet,metadata),cleared=api.clear(scope);await Promise.all([saved,cleared]);
 assert.equal(await api.load(scope),null);
 await api.save(scope,wallet,metadata);await api.save(other,wallet,metadata);
 assert.throws(()=>api.save(scope,{...wallet,secretKey:'0x'+'00'.repeat(32)},metadata),{code:'BB_ETHEREUM_SESSION_INVALID'});
 assert.deepEqual(plain(await api.load(scope)),{wallet,metadata});
 await api.clear(scope);assert.equal(await api.load(scope),null);assert.deepEqual(plain(await api.load(other)),{wallet,metadata});
});

test('fresh signatures and module instances recover the identical account after remembered storage is cleared',async()=>{
 const first=fixture(),firstSigner=new ethers.Wallet('0x'+'12'.repeat(32));
 const firstMessage=first.api.createMessage({...scope,address:firstSigner.address});
 const firstSignature=await firstSigner.signMessage(firstMessage);
 const initial=await first.api.derive({ethers,signature:firstSignature,message:firstMessage,address:firstSigner.address});
 await first.api.save(scope,{address:wallet.address,...initial},metadata);
 await first.api.clear(scope);assert.equal(await first.api.load(scope),null);
 const second=fixture(first.indexedDB),secondSigner=new ethers.Wallet('0x'+'12'.repeat(32));
 const secondMessage=second.api.createMessage({...scope,address:secondSigner.address});
 const secondSignature=await secondSigner.signMessage(secondMessage);
 const restored=await second.api.derive({ethers,signature:secondSignature,message:secondMessage,address:secondSigner.address});
 assert.equal(secondMessage,firstMessage);assert.equal(secondSignature,firstSignature);
 assert.deepEqual(plain(restored),plain(initial));
 assert.match(restored.salt,/^0x[0-9a-f]{64}$/);
 assert.equal(await second.api.load(scope),null);
});

test('remembered wallet requires canonical full-field hex salt',()=>{
 const {api}=fixture();
 for(const salt of ['123','0x7b','0x'+'ff'.repeat(32)])assert.throws(()=>api.save(scope,{...wallet,salt},metadata),{code:'BB_ETHEREUM_SESSION_INVALID'});
});
