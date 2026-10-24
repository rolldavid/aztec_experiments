import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {createEncryptedJournalSlot,journalRecoveryIdentity,decryptJournalDescriptor} from '../shared/journal-record.mjs';
const secret='0x'+1n.toString(16).padStart(64,'0');
async function fixture(){
 let raw=null;const plainBuffers=[];
 const crypto={getRandomValues:a=>webcrypto.getRandomValues(a),subtle:{
  digest:(...a)=>webcrypto.subtle.digest(...a),importKey:(...a)=>webcrypto.subtle.importKey(...a),
  encrypt:async(...a)=>{plainBuffers.push(a[2]);return webcrypto.subtle.encrypt(...a);},
  decrypt:async(...a)=>{const result=await webcrypto.subtle.decrypt(...a);plainBuffers.push(new Uint8Array(result));return result;},
 }};
 const options={walletSecret:secret,walletSalt:0,scopeText:'fixed test account scope',keyDomain:'TEST_JOURNAL',crypto};
 const storage={read:async()=>raw,compareAndSwap:async(_key,old,next)=>{assert.equal(raw,old);raw=next;}};
 return {slot:await createEncryptedJournalSlot({...options,storage}),options,storage,plainBuffers,get:()=>raw,set:value=>raw=value};
}
test('64KiB journal uses canonical lowercase wire bytes with real AES round trip and zeroization',async()=>{
 const f=await fixture(),value={body:'ab\u00a3\ud83d\ude42'.repeat(8192)};
 const saved=await f.slot.write(await f.slot.read(),value);assert.deepEqual(saved.value,value);
 const wire=JSON.parse(saved.encoded);assert.equal(wire.data.length%2,0);assert.match(wire.data,/^[0-9a-f]+$/);
 const material=new TextEncoder().encode('TEST_JOURNAL\0'+secret+':'+'0'.repeat(64));
 const key=await webcrypto.subtle.importKey('raw',createHash('sha256').update(material).digest(),'AES-GCM',false,['decrypt']);
 const raw=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(wire.iv,'hex'),additionalData:new TextEncoder().encode(f.options.scopeText)},key,Buffer.from(wire.data,'hex'));
 assert.deepEqual(JSON.parse(new TextDecoder().decode(raw)),value);new Uint8Array(raw).fill(0);
 const reopened=await createEncryptedJournalSlot({...f.options,storage:f.storage});assert.deepEqual((await reopened.read()).value,value);
 assert(f.plainBuffers.every(bytes=>bytes.every(b=>b===0)));
 const identity=await journalRecoveryIdentity(f.options);assert.deepEqual(await decryptJournalDescriptor(wire.recovery,identity,f.options.crypto),{scopeText:f.options.scopeText,keyDomain:f.options.keyDomain});
 assert(f.plainBuffers.every(bytes=>bytes.every(b=>b===0)));
});
for(const invalid of ['', '0', 'AA', '0g', '0 ', '0\n','\u00e90','\uff100'])test('strict journal data rejects '+JSON.stringify(invalid),async()=>{
 const f=await fixture(),saved=await f.slot.write(await f.slot.read(),{message:'unchanged'}),base=JSON.parse(saved.encoded);
 for(const descriptor of [false,true]){const wire=structuredClone(base);(descriptor?wire.recovery:wire).data=invalid;f.set(JSON.stringify(wire));await assert.rejects(f.slot.read(),{code:'BB_JOURNAL_INVALID'});}
 assert(f.plainBuffers.every(bytes=>bytes.every(b=>b===0)));
});
test('canonical ciphertext tamper and wrong account scope remain rejected',async()=>{
 const f=await fixture(),saved=await f.slot.write(await f.slot.read(),{message:'private'}),wire=JSON.parse(saved.encoded);
 wire.data=(wire.data[0]==='0'?'1':'0')+wire.data.slice(1);f.set(JSON.stringify(wire));await assert.rejects(f.slot.read(),{code:'BB_JOURNAL_INVALID'});
 f.set(saved.encoded);const other=await createEncryptedJournalSlot({...f.options,scopeText:'different scope',storage:f.storage});await assert.rejects(other.read(),{code:'BB_JOURNAL_INVALID'});
});
