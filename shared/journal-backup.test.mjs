// Development-only wallet/node doubles. Real Rolling application, processed ABI,
// encrypted descriptors, IndexedDB CAS adapter and backup/restore are composed.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {encodeArguments,loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {createRollingApplication} from './rolling/application.mjs';
import {createBrowserJournalStorage} from './journal-indexeddb.mjs';
import {createEncryptedJournalSlot} from './journal-record.mjs';
import {createJournalBackup} from './journal-backup.mjs';
import {l2JournalScopeText} from './l2-journal.mjs';
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const storage=()=>createBrowserJournalStorage(new IDBFactory());
after(async()=>{await BarretenbergSync.destroySingleton();});
function fixture(){
 const state={sends:0},node={
  getBlockData:async height=>({header:{globalVariables:{blockNumber:height==='checkpointed'?1:height}},blockHash:hex(42)}),
  getPublicStorageAt:async(reference,address,slot)=>{
   assert.deepEqual(reference,{hash:hex(42)});assert.equal(address.toString(),hex(1));assert(slot instanceof Fr);
   return Fr.ZERO;
  },
 },owner=new AztecAddress(new Fr(3n));
 const credentials={walletSecret:hex(8),walletSalt:'0'};
 const journal={assertCanStart:async()=>null,inspectOutcome:async()=>null,inspect:async()=>null};
 const wallet={aztecNode:node,pxe:{},getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),
  sendTx:async()=>{state.sends++;throw Error('Unknown send outcome');}};
 const sdk={Fr,AztecAddress,encodeArguments,poseidon2HashWithSeparator,deriveStorageSlotInMap,Contract:{at:()=>({methods:{register_name:(...args)=>({args})}})},
  isTrustedPrivateNode:n=>n===node,isPrivateWalletForNode:(w,n)=>w===wallet&&n===node,isPrivatePXEForNode:(p,n)=>p===wallet.pxe&&n===node,
  inspectTrustedNode:async()=>{},preparePrivateFeePayment:async()=>({availableCredit:100n}),
  estimatePrivateFeeTransaction:async()=>({maximumFee:10n,payload:{},gasSettings:{}})};
 const deployment={board:{address:hex(1),artifact},network:{chainId:'31337',version:'1',rollup:'0x'+'11'.repeat(20)},
  portal:'0x'+'22'.repeat(20),privateFee:{address:hex(2),artifact:{},gasSettings:{}}};
 const accountSession={owner,node,wallet,journal,...credentials};
 const app=privateStore=>createRollingApplication({sdk,deployment,accountSession,privateStore,contextGuard:async()=>{}});
 const backup=privateStore=>createJournalBackup({...credentials,storage:privateStore});
 const scope={account:String(owner),...deployment.network,board:deployment.board.address,portal:deployment.portal};
 return {state,credentials,app,backup,scope};
}
test('actual Rolling prepare exports authenticated ciphertext and restores same intent in a replacement application',async()=>{
 const f=fixture(),source=storage(),destination=storage(),app=f.app(source);
 const intent=await app.prepare({type:'name',first:'Private Sentinel',last:'Moss'});
 const records=await (await f.backup(source)).exportRecords();assert.equal(records.length,1);
 assert.ok(!JSON.stringify(records).includes('Private Sentinel'));assert.ok(!JSON.stringify(records).includes(f.credentials.walletSecret));
 const restored=await f.backup(destination);await restored.restoreRecords(records);await restored.restoreRecords(records);
 assert.deepEqual(await restored.exportRecords(),records);
 assert.deepEqual(await f.app(destination).reconcile(intent.intentId),intent);
 assert.equal((await f.app(destination).cancelPrepared(intent.intentId)).status,'cancelled');assert.equal(f.state.sends,0);
});
test('restored uncertain workflow retains its no-replay fence after actual application submit boundary',async()=>{
 const f=fixture(),source=storage(),destination=storage(),app=f.app(source);
 const intent=await app.prepare({type:'name',first:'River',last:'Stone'});
 await assert.rejects(app.submitPrepared(intent.intentId),/Unknown send outcome/);assert.equal(f.state.sends,1);
 await (await f.backup(destination)).restoreRecords(await (await f.backup(source)).exportRecords());
 const resumed=f.app(destination);assert.equal((await resumed.reconcile(intent.intentId)).status,'unknown');
 await assert.rejects(resumed.submitPrepared(intent.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});
 await assert.rejects(resumed.prepare({type:'name',first:'Other',last:'Name'}),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(f.state.sends,1);
});
test('older workflow cannot replace newer local state; foreign owner export omits and restore rejects',async()=>{
 const f=fixture(),source=storage(),destination=storage(),app=f.app(source);
 const intent=await app.prepare({type:'name',first:'River',last:'Stone'}),old=await (await f.backup(source)).exportRecords();
 await (await f.backup(destination)).restoreRecords(old);await f.app(destination).cancelPrepared(intent.intentId);
 const newer=await (await f.backup(destination)).exportRecords();
 await assert.rejects((await f.backup(destination)).restoreRecords(old),{code:'BB_JOURNAL_INVALID'});
 assert.deepEqual(await (await f.backup(destination)).exportRecords(),newer);
 const foreign=await createJournalBackup({...f.credentials,walletSecret:hex(9),storage:source});assert.deepEqual(await foreign.exportRecords(),[]);
 const empty=storage(),foreignEmpty=await createJournalBackup({...f.credentials,walletSecret:hex(9),storage:empty});
 await assert.rejects(foreignEmpty.restoreRecords(old),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await empty.keys(),[]);
});
test('authenticated but incorrectly framed Rolling descriptors are rejected before restore writes',async()=>{
 const f=fixture(),canonical=l2JournalScopeText(f.scope);
 const wrong=[['ROLLING_WORKFLOW_V1'],['ROLLING_WORKFLOW_V1',canonical,'extra'],['ROLLING_WORKFLOW_V1',JSON.parse(canonical)],
  ['ROLLING_WORKFLOW_V1',JSON.stringify(['AZTEC_BB_ETH_JOURNAL_V1',...JSON.parse(canonical).slice(1)])],
  ['ROLLING_WORKFLOW_V1',JSON.stringify(['AZTEC_BB_L2_JOURNAL_V1','invalid',...JSON.parse(canonical).slice(2)])]];
 wrong.push(['ROLLING_WORKFLOW_V1',JSON.stringify(['AZTEC_BB_L2_JOURNAL_V1',f.scope.account,31337,f.scope.rollup,f.scope.version,f.scope.board,f.scope.portal])]);
 const scopes=wrong.map(x=>JSON.stringify(x));scopes.push(' '+JSON.stringify(['ROLLING_WORKFLOW_V1',canonical]));
 for(const scopeText of scopes){
  const source=storage(),destination=storage(),slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText,keyDomain:'ROLLING_WORKFLOW_V1'});
  await slot.write(await slot.read(),{status:'prepared'});
  const records=[{key:slot.storageKey,encoded:await source.read(slot.storageKey)}];
  await assert.rejects((await f.backup(source)).exportRecords(),{code:'BB_JOURNAL_INVALID'});
  await assert.rejects((await f.backup(destination)).restoreRecords(records),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await destination.keys(),[]);
 }
});

test('aggregate funding ciphertext preserves original intent and Bok secrets through backup without plaintext export',async()=>{
 const f=fixture(),source=storage(),destination=storage(),scopeText=JSON.stringify(['ROLLING_AGGREGATE_FUNDING_V1','31337','1','0x'+'11'.repeat(20),hex(1),'0x'+'22'.repeat(20),hex(3),1]);
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText,keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});
 const saved={intent:{data:'original private funding sentinel'},recipientSalt:hex(4),bridgeSecret:hex(5)};await slot.write(await slot.read(),saved);
 const records=await (await f.backup(source)).exportRecords();assert(!JSON.stringify(records).includes('original private funding sentinel'));
 await (await f.backup(destination)).restoreRecords(records);
 const restored=await createEncryptedJournalSlot({...f.credentials,storage:destination,scopeText,keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});assert.deepEqual((await restored.read()).value,saved);
});
for(const defect of ['extra','number','zero','field','version','canonical'])test('aggregate recovery descriptor rejects '+defect,async()=>{
 const f=fixture(),source=storage(),frame=['ROLLING_AGGREGATE_FUNDING_V1','31337','1','0x'+'11'.repeat(20),hex(1),'0x'+'22'.repeat(20),hex(3),1];
 if(defect==='extra')frame.push(1);if(defect==='number')frame[1]=31337;if(defect==='zero')frame[5]='0x'+'00'.repeat(20);if(defect==='field')frame[6]='0x'+'ff'.repeat(32);if(defect==='version')frame[7]=2;
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText:(defect==='canonical'?' ':'')+JSON.stringify(frame),keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});
 await slot.write(await slot.read(),{});await assert.rejects((await f.backup(source)).exportRecords(),{code:'BB_JOURNAL_INVALID'});
});
test('archived aggregate txHash framing restores only within the original owner and exact scope',async()=>{
 const f=fixture(),source=storage(),destination=storage(),frame=['ROLLING_AGGREGATE_FUNDING_V1','31337','1','0x'+'11'.repeat(20),hex(1),'0x'+'22'.repeat(20),hex(3),hex(77),1];
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText:JSON.stringify(frame),keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});await slot.write(await slot.read(),{intent:'archive',bridgeSecret:hex(8)});
 const records=await (await f.backup(source)).exportRecords();await (await f.backup(destination)).restoreRecords(records);
 for(const [index,value]of [[1,'1'],[5,'0x'+'33'.repeat(20)],[6,hex(4)]]){
  const changed=[...frame];changed[index]=value;const other=await createEncryptedJournalSlot({...f.credentials,storage:destination,scopeText:JSON.stringify(changed),keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});assert.equal((await other.read()).value,null);
 }
});

for(const kind of ['private-fee','bok'])test('standalone '+kind+' top-up custody and archived requests round-trip through real AEAD backup',async()=>{
 const f=fixture(),source=storage(),destination=storage(),base=['ROLLING_TOPUP_FUNDING_V1','31337','1','0x'+'11'.repeat(20),hex(1),hex(2),kind,'0x'+'22'.repeat(20),'0x'+'33'.repeat(20),hex(3)];
 for(const suffix of [[1],[hex(77),1]]){const scopeText=JSON.stringify([...base,...suffix]),slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText,keyDomain:'ROLLING_TOPUP_FUNDING_V1'});await slot.write(await slot.read(),{intent:{data:'private-topup-sentinel'},bridgeSecret:hex(8)});}
 const records=await(await f.backup(source)).exportRecords();assert.equal(records.length,2);assert(!JSON.stringify(records).includes('private-topup-sentinel'));await(await f.backup(destination)).restoreRecords(records);
 for(const suffix of [[1],[hex(77),1]]){const slot=await createEncryptedJournalSlot({...f.credentials,storage:destination,scopeText:JSON.stringify([...base,...suffix]),keyDomain:'ROLLING_TOPUP_FUNDING_V1'});assert.equal((await slot.read()).value.bridgeSecret,hex(8));}
});
for(const defect of ['kind','number','zero','recipient','archive','extra','canonical'])test('standalone top-up backup rejects '+defect,async()=>{
 const f=fixture(),source=storage(),frame=['ROLLING_TOPUP_FUNDING_V1','31337','1','0x'+'11'.repeat(20),hex(1),hex(2),'bok','0x'+'22'.repeat(20),'0x'+'33'.repeat(20),hex(3),1];
 if(defect==='kind')frame[6]='collateral';if(defect==='number')frame[1]=31337;if(defect==='zero')frame[7]='0x'+'00'.repeat(20);if(defect==='recipient')frame[9]='0x'+'ff'.repeat(32);if(defect==='archive')frame.splice(-1,0,'wrong');if(defect==='extra')frame.push(1);
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText:(defect==='canonical'?' ':'')+JSON.stringify(frame),keyDomain:'ROLLING_TOPUP_FUNDING_V1'});await slot.write(await slot.read(),{});await assert.rejects((await f.backup(source)).exportRecords(),{code:'BB_JOURNAL_INVALID'});
});

// Fresh AEAD IVs do not change an authenticated financial intent.
// Different financial state remains a conflict.
test('authenticated identical financial payload with fresh ciphertext keeps local bytes',async()=>{
 const f=fixture(),source=storage(),destination=storage(),scopeText=l2JournalScopeText(f.scope),keyDomain='AZTEC_BB_L2_JOURNAL_KEY_V1';
 const a=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText,keyDomain}),b=await createEncryptedJournalSlot({...f.credentials,storage:destination,scopeText,keyDomain});
 const value={status:'unknown',hash:hex(55),intent:{nonce:3,data:'private sentinel'}};
 await a.write(await a.read(),value);await b.write(await b.read(),value);
 const records=await (await f.backup(source)).exportRecords(),local=await destination.read(b.storageKey);assert.notEqual(records[0].encoded,local);
 await (await f.backup(destination)).restoreRecords(records);assert.equal(await destination.read(b.storageKey),local);
 await b.write(await b.read(),{...value,status:'prepared'});const changed=await destination.read(b.storageKey);
 await assert.rejects((await f.backup(destination)).restoreRecords(records),{code:'BB_JOURNAL_INVALID'});assert.equal(await destination.read(b.storageKey),changed);
});
test('local pre-proof provenance is durable, non-exported, and never initialized by read',async()=>{
 const idb=new IDBFactory(),a=createBrowserJournalStorage(idb),b=createBrowserJournalStorage(idb);
 assert.equal(await a.readRecoveryEpoch(),null);
 const [first,second]=await Promise.all([a.ensureRecoveryEpoch(),b.ensureRecoveryEpoch()]);assert.match(first,/^[0-9a-f]{64}$/);assert.equal(second,first);
 assert.equal(await b.readRecoveryEpoch(),first);assert.deepEqual(await a.keys(),[]);
 const f=fixture();assert.deepEqual(await(await f.backup(a)).exportRecords(),[]);
 const changed=await b.rotateRecoveryEpoch();assert.notEqual(changed,first);assert.equal(await a.readRecoveryEpoch(),changed);
});
test('financial restore rotates local provenance before all writes, including idempotent and partial restore',async()=>{
 const f=fixture(),source=storage(),target=storage();await f.app(source).prepare({type:'name',first:'River',last:'Stone'});
 const records=await(await f.backup(source)).exportRecords(),original=await target.ensureRecoveryEpoch(),write=target.compareAndSwap;
 target.compareAndSwap=async(...args)=>{assert.notEqual(await target.readRecoveryEpoch(),original);throw Error('interrupted restore');};
 await assert.rejects((await f.backup(target)).restoreRecords(records),{code:'BB_JOURNAL_INVALID'});
 const partialEpoch=await target.readRecoveryEpoch();assert.notEqual(partialEpoch,original);assert.deepEqual(await target.keys(),[]);
 target.compareAndSwap=write;await(await f.backup(target)).restoreRecords(records);const restoredEpoch=await target.readRecoveryEpoch();assert.notEqual(restoredEpoch,partialEpoch);
 await(await f.backup(target)).restoreRecords(records);assert.notEqual(await target.readRecoveryEpoch(),restoredEpoch);
 const emptyEpoch=await target.readRecoveryEpoch();await(await f.backup(target)).restoreRecords([]);assert.equal(await target.readRecoveryEpoch(),emptyEpoch);
 assert.deepEqual(await(await f.backup(target)).exportRecords(),records);
});
test('failed provenance rotation prevents any restored financial write',async()=>{
 const f=fixture(),source=storage(),target=storage();await f.app(source).prepare({type:'name',first:'River',last:'Stone'});
 const records=await(await f.backup(source)).exportRecords();target.rotateRecoveryEpoch=async()=>{throw Error('metadata unavailable');};
 await assert.rejects((await f.backup(target)).restoreRecords(records),/metadata unavailable/);assert.deepEqual(await target.keys(),[]);
});

test('metadata upgrade preserves v1 records and blocked open closes its eventual connection',async()=>{
 const idb=new IDBFactory(),request=idb.open('aztec-billboard-transaction-journal-v1',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('records');
 const old=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const key='a'.repeat(64);await new Promise((resolve,reject)=>{const tx=old.transaction('records','readwrite');tx.objectStore('records').put('retained ciphertext',key);tx.oncomplete=resolve;tx.onerror=reject;});
 let upgrade;const adapter=createBrowserJournalStorage({open(...args){return upgrade=idb.open(...args);}});
 await assert.rejects(adapter.keys(),/upgrade blocked/);const opened=new Promise(resolve=>upgrade.addEventListener('success',resolve));old.close();await opened;
 try{assert.throws(()=>upgrade.result.transaction('records'),{name:'InvalidStateError'});}finally{upgrade.result.close();}
 assert.deepEqual(await adapter.keys(),[key]);assert.equal(await adapter.read(key),'retained ciphertext');assert.equal(await adapter.readRecoveryEpoch(),null);
});

test('malformed recovery metadata fails closed and cannot be initialized into a new authority',async()=>{
 const idb=new IDBFactory(),store=createBrowserJournalStorage(idb);await store.ensureRecoveryEpoch();
 const request=idb.open('aztec-billboard-transaction-journal-v1',2),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('recovery-metadata','readwrite');tx.objectStore('recovery-metadata').put('malformed','epoch');tx.oncomplete=resolve;tx.onerror=reject;});}finally{db.close();}
 await assert.rejects(store.readRecoveryEpoch(),/provenance update failed/);await assert.rejects(store.ensureRecoveryEpoch(),/provenance update failed/);assert.deepEqual(await store.keys(),[]);
});
test('portable pre-proof ciphertext cannot restore its local authority or bypass required rotation',async()=>{
 const f=fixture(),source=storage(),target=storage(),epoch=await source.ensureRecoveryEpoch();
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText:JSON.stringify(['ROLLING_WORKFLOW_V1',l2JournalScopeText(f.scope)]),keyDomain:'ROLLING_WORKFLOW_V1'});
 await slot.write(await slot.read(),{status:'pre-proof',preproof:{version:1,epoch,attempt:hex(77),predecessor:'b'.repeat(64)}});
 const records=await(await f.backup(source)).exportRecords();
 const unsupported={keys:target.keys,read:target.read,compareAndSwap:target.compareAndSwap};await assert.rejects((await f.backup(unsupported)).restoreRecords(records),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await target.keys(),[]);
 await(await f.backup(target)).restoreRecords(records);assert.notEqual(await target.readRecoveryEpoch(),epoch);assert.deepEqual(await(await f.backup(target)).exportRecords(),records);
});

for(const keyDomain of ['ROLLING_PREFERENCES_V1','ROLLING_COLD_PREFERENCES_V1'])test(`retired ${keyDomain} cannot export or restore authenticated ciphertext`,async()=>{
 const f=fixture(),source=storage(),destination=storage();
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,keyDomain,scopeText:JSON.stringify([keyDomain,'retired',1])});
 await slot.write(await slot.read(),{privateSentinel:'retired cache'});
 const records=[{key:slot.storageKey,encoded:await source.read(slot.storageKey)}];
 await assert.rejects((await f.backup(source)).exportRecords(),{code:'BB_JOURNAL_INVALID'});
 await assert.rejects((await f.backup(destination)).restoreRecords(records),{code:'BB_JOURNAL_INVALID'});
 assert.deepEqual(await destination.keys(),[]);assert.equal(await destination.readRecoveryEpoch(),null);
});

async function financialRecord(f,source,value={status:'unknown',hash:hex(55)}){
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,keyDomain:'AZTEC_BB_L2_JOURNAL_KEY_V1',scopeText:l2JournalScopeText(f.scope)});
 await slot.write(await slot.read(),value);return {slot,record:{key:slot.storageKey,encoded:await source.read(slot.storageKey)}};
}
test('financial export rejects changed ciphertext at its final snapshot fence',async()=>{
 const f=fixture(),source=storage(),{slot,record}=await financialRecord(f,source);
 await slot.write(await slot.read(),{status:'included',hash:hex(55)});const next=await source.read(record.key);let reads=0;
 const backup=await createJournalBackup({...f.credentials,storage:{keys:async()=>[record.key],read:async()=>++reads===1?record.encoded:next}});
 await assert.rejects(backup.exportRecords(),{code:'BB_JOURNAL_INVALID'});assert.equal(reads,2);
});
test('retained identical financial payload still rejects ciphertext replacement and authentication failure',async()=>{
 const f=fixture(),source=storage(),destination=storage(),{record}=await financialRecord(f,source),{record:local}=await financialRecord(f,destination);
 assert.notEqual(record.encoded,local.encoded);
 let reads=0;const racing=await createJournalBackup({...f.credentials,storage:{read:async()=>++reads===1?local.encoded:record.encoded}});
 await assert.rejects(racing.restoreRecords([record]),{code:'BB_JOURNAL_INVALID'});
 const corrupted=JSON.parse(local.encoded);corrupted.data=(corrupted.data[0]==='0'?'1':'0')+corrupted.data.slice(1);
 const invalid=await createJournalBackup({...f.credentials,storage:{read:async()=>JSON.stringify(corrupted)}});
 await assert.rejects(invalid.restoreRecords([record]),{code:'BB_JOURNAL_INVALID'});
});
test('Ethereum signed journal remains authenticated and portable without any preference backup domain',async()=>{
 const f=fixture(),source=storage(),destination=storage(),keyDomain='AZTEC_BB_ETH_JOURNAL_KEY_V1';
 const scopeText=JSON.stringify(['AZTEC_BB_ETH_JOURNAL_V1',f.scope.account,f.scope.chainId,f.scope.rollup,f.scope.version,f.scope.board,f.scope.portal,'0x'+'33'.repeat(20)]);
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,keyDomain,scopeText}),value={status:'unknown',signed:'private-signed-sentinel',hash:hex(66)};
 await slot.write(await slot.read(),value);const records=await (await f.backup(source)).exportRecords();
 assert(!JSON.stringify(records).includes(value.signed));await (await f.backup(destination)).restoreRecords(records);
 const restored=await createEncryptedJournalSlot({...f.credentials,storage:destination,keyDomain,scopeText});assert.deepEqual((await restored.read()).value,value);
});
