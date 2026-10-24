import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,hkdfSync,createHmac,createDecipheriv} from 'node:crypto';
import {createOwnerEnvelopeOracles,OWNER_ENVELOPE_ORACLES as N,wrapOwnerEnvelopeCallbacks,withOwnerEnvelopeOracles} from '../shared/owner-envelope.mjs';
const F=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),z=h(0),secret=[h(42)],domain=[h(31337),h(679261766),h(3),h(4)],seq=[h(99)],role=[h(1)];
const args=()=>[secret.slice(),domain.slice(),seq.slice(),role.slice()];
const oracle=createOwnerEnvelopeOracles({crypto:webcrypto});
const plain=Array.from({length:12},(_,i)=>h(i===11?F-1n:BigInt(i)));
function unpack(cipher){const size=Number(BigInt(cipher[0]));return Buffer.concat(cipher.slice(1,1+Math.ceil(size/31)).map(v=>Buffer.from(v.slice(4),'hex'))).subarray(0,size);}
function aad(a){const b=(value,n)=>Buffer.from(BigInt(value).toString(16).padStart(n*2,'0'),'hex');return Buffer.concat([Buffer.from('ROLLING_OWNER_ENVELOPE_V1'),...a[1].map(v=>b(v,32)),b(a[2][0],8),b(a[3][0],4)]);}
test('actual WebCrypto seals every supported field length and preserves inputs',async()=>{
 for(let n=0;n<=12;n++){
  const a=args(),before=structuredClone([...a,plain]);const [cipher,count]=await oracle[N.seal](...a,plain,[h(n)]);
  assert.equal(cipher.length,15);assert.equal(Number(BigInt(count)),15);assert.equal(BigInt(cipher[0]),414n);
  const [ok,opened,length]=await oracle[N.open](...a,cipher,[count]);assert.equal(ok,h(1));assert.equal(length,h(n));assert.deepEqual(opened,[...plain.slice(0,n),...Array(12-n).fill(z)]);assert.deepEqual([...a,plain],before);
 }
});
test('independent native OpenSSL implementation authenticates AES256-GCM and locator domains',async()=>{
 const a=args(),context=aad(a),version=Buffer.from('ROLLING_OWNER_ENVELOPE_V1'),key=Buffer.from(secret[0].slice(2),'hex');
 const encryption=Buffer.from(hkdfSync('sha256',key,version,Buffer.concat([Buffer.from('encryption'),context]),32));
 const [cipher]=await oracle[N.seal](...a,plain,[h(12)]),wire=unpack(cipher),decipher=createDecipheriv('aes-256-gcm',encryption,wire.subarray(0,12));decipher.setAAD(context);decipher.setAuthTag(wire.subarray(-16));
 const decrypted=Buffer.concat([decipher.update(wire.subarray(12,-16)),decipher.final()]);assert.equal(decrypted.readUInt16BE(),12);assert.equal(decrypted.length,386);assert.deepEqual(decrypted.subarray(2),Buffer.concat(plain.map(v=>Buffer.from(v.slice(2),'hex'))));
 const locatorKey=Buffer.from(hkdfSync('sha256',key,version,Buffer.concat([Buffer.from('locator'),context]),32));assert.deepEqual(await oracle[N.locator](...a),['0x00'+createHmac('sha256',locatorKey).update(context).digest().subarray(0,31).toString('hex')]);
});
test('every seal attempt uses a fresh nonce even for identical sequence and plaintext',async()=>{
 const results=await Promise.all(Array.from({length:24},()=>oracle[N.seal](...args(),plain,[h(12)])));
 assert.equal(new Set(results.map(([v])=>unpack(v).subarray(0,12).toString('hex'))).size,24);
 const locators=await Promise.all(Array.from({length:3},()=>oracle[N.locator](...args())));assert.deepEqual(locators[0],locators[1]);assert.deepEqual(locators[1],locators[2]);
});
for(const changed of ['secret','chain','version','contract','owner','sequence','role'])test(`ciphertext and locator bind ${changed}`,async()=>{
 const a=args(),[cipher,count]=await oracle[N.seal](...a,plain,[h(12)]),original=await oracle[N.locator](...a);
 if(changed==='secret')a[0][0]=h(43);else if(changed==='sequence')a[2][0]=h(100);else if(changed==='role')a[3][0]=h(2);else a[1][['chain','version','contract','owner'].indexOf(changed)]=h(999);
 assert.notDeepEqual(await oracle[N.locator](...a),original);assert.deepEqual(await oracle[N.open](...a,cipher,[count]),[z,Array(12).fill(z),z]);
});
test('cipher corruption, noncanonical padding, lengths and field encodings yield no plaintext',async()=>{
 const [cipher,count]=await oracle[N.seal](...args(),plain,[h(1)]);
 const cases=[];for(const i of [0,1,2]){const v=cipher.slice();v[i]=h(BigInt(v[i])+1n);cases.push([v,[count]]);}
 const trailing=cipher.slice();trailing[14]=h(1);cases.push([trailing,[count]]);
 const padding=cipher.slice();padding[Number(BigInt(count))-1]=h(BigInt(padding[Number(BigInt(count))-1])+1n);cases.push([padding,[count]]);
 const tooWide=cipher.slice();tooWide[1]=h(1n<<248n);cases.push([tooWide,[count]]);
 cases.push([cipher,[h(14)]],[cipher.slice(1),[count]],[cipher,['garbage']]);
 for(const [v,n] of cases)assert.deepEqual(await oracle[N.open](...args(),v,n),[z,Array(12).fill(z),z]);
});
test('invalid scalar/context bounds reject without exposing input material',async()=>{
 const cases=[()=>[[],domain,seq,role],()=>[[h(F)],domain,seq,role],()=>[secret,[...domain,h(5)],seq,role],()=>[secret,domain,[h(1n<<64n)],role],()=>[secret,domain,seq,[h(1n<<32n)]]];
 for(const make of cases)await assert.rejects(oracle[N.locator](...make()),error=>error.code==='BB_OWNER_ENVELOPE_INVALID'&&!error.message.includes(secret[0]));
 await assert.rejects(oracle[N.seal](...args(),plain,[h(13)]),{code:'BB_OWNER_ENVELOPE_INVALID'});
});
test('native callback proxy delegates standard oracles and original errors unchanged',async()=>{
 const failure=Error('native unavailable'),seen=[];const native=new Proxy({aztec_utl_native:async(...input)=>{seen.push(input);return [h(7)];}},{get(target,name){if(name in target)return target[name];throw failure;}});
 const callbacks=wrapOwnerEnvelopeCallbacks(native,oracle);assert.deepEqual(await callbacks.aztec_utl_native([h(5)]),[h(7)]);assert.deepEqual(seen,[[[h(5)]]]);assert.throws(()=>callbacks.unknown,error=>error===failure);assert.deepEqual(await callbacks[N.locator](...args()),await oracle[N.locator](...args()));
});
test('CircuitSimulator wrapper changes only user foreign calls and binds native method receiver',async()=>{
 const calls=[],native={marker:true,executeProtocolCircuit(...args){assert.equal(this,native);calls.push(args);return 'native protocol';},async executeUserCircuit(input,artifact,callback){assert.equal(this,native);calls.push([input,artifact]);return callback[N.locator](...args());}};
 const simulator=withOwnerEnvelopeOracles(native,{crypto:webcrypto}),input=new Map(),artifact={};assert.equal(simulator.executeProtocolCircuit(1,2,3),'native protocol');assert.deepEqual(await simulator.executeUserCircuit(input,artifact,{}),await oracle[N.locator](...args()));assert.equal(calls[1][0],input);assert.equal(calls[1][1],artifact);assert.equal(native.executeUserCircuit.name,'executeUserCircuit');
});
