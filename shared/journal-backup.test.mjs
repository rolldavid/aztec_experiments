// Development-only wallet/node doubles. Real Rolling application, processed ABI,
// encrypted descriptors, IndexedDB CAS adapter and backup/restore are composed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
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
function fixture(){
 const state={sends:0},node={},owner=new AztecAddress(new Fr(3n));
 const credentials={walletSecret:hex(8),walletSalt:'0'};
 const journal={assertCanStart:async()=>null,inspectOutcome:async()=>null,inspect:async()=>null};
 const wallet={aztecNode:node,pxe:{},getAccounts:async()=>[owner],getChainInfo:async()=>({chainId:31337,version:1}),
  sendTx:async()=>{state.sends++;throw Error('Unknown send outcome');}};
 const sdk={Fr,AztecAddress,encodeArguments,Contract:{at:()=>({methods:{register_name:(...args)=>({args})}})},
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

const PREFERENCES='ROLLING_PREFERENCES_V1';
const preferenceFrame=f=>[PREFERENCES,f.scope.chainId,f.scope.version,f.scope.rollup,f.scope.board,hex(10),f.scope.account,1];
async function preferenceRecord(f,source,{scopeText=JSON.stringify(preferenceFrame(f)),keyDomain=PREFERENCES,value={privateSentinel:'Private preference sentinel',revision:'1'}}={}){
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:source,scopeText,keyDomain});
 await slot.write(await slot.read(),value);
 return {slot,record:{key:slot.storageKey,encoded:await source.read(slot.storageKey)}};
}
test('real AEAD preferences export and fresh restore alongside L2 and workflow records, with only encrypted scope storage',async()=>{
 const f=fixture(),source=storage(),destination=storage();
 const intent=await f.app(source).prepare({type:'name',first:'River',last:'Stone'});
 const l2=await createEncryptedJournalSlot({...f.credentials,storage:source,keyDomain:'AZTEC_BB_L2_JOURNAL_KEY_V1',scopeText:l2JournalScopeText(f.scope)});
 await l2.write(await l2.read(),{status:'prepared',privateSentinel:'L2 sentinel'});
 const {slot}=await preferenceRecord(f,source);
 const records=await (await f.backup(source)).exportRecords();assert.equal(records.length,3);
 assert.deepEqual((await source.keys()).sort(),records.map(x=>x.key).sort());
 for(const key of await source.keys())assert.match(key,/^[0-9a-f]{64}$/);
 for(const secret of [PREFERENCES,f.scope.account,f.scope.board,f.scope.rollup,'Private preference sentinel','L2 sentinel',f.credentials.walletSecret])assert.ok(!JSON.stringify(records).includes(secret));
 await (await f.backup(destination)).restoreRecords(records);
 const restored=await createEncryptedJournalSlot({...f.credentials,storage:destination,keyDomain:PREFERENCES,scopeText:JSON.stringify(preferenceFrame(f))});
 assert.deepEqual((await restored.read()).value,(await slot.read()).value);
 assert.deepEqual(await f.app(destination).reconcile(intent.intentId),intent);
 assert.deepEqual(await (await f.backup(destination)).exportRecords(),records);assert.equal(f.state.sends,0);
});
test('authenticated preference descriptors reject wrong domain, noncanonical fields, addresses and schema before any restore write',async()=>{
 const f=fixture(),frame=preferenceFrame(f),field=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
 const cases=[{keyDomain:'UNKNOWN_PRIVATE_DOMAIN'}, {scopeText:JSON.stringify(['OTHER',...frame.slice(1)])},
  {scopeText:JSON.stringify(frame.slice(0,-1))},{scopeText:JSON.stringify([...frame,'extra'])},
  {scopeText:' '+JSON.stringify(frame)}, {scopeText:JSON.stringify(frame).replace('31337','3133\\u0037')}];
 for(const index of [1,2])for(const value of ['0','01','+1','1.0','1e1','-1',1,null,String(field),'9'.repeat(79)]){const bad=[...frame];bad[index]=value;cases.push({scopeText:JSON.stringify(bad)});}
 for(const index of [3,4,5,6])for(const value of [null,1,'0x1','0x'+'00'.repeat(index===3?20:32),'0x'+'AB'.repeat(index===3?20:32),'0x'+'11'.repeat(index===3?32:20),...(index===3?[]:[hex(field)])]){const bad=[...frame];bad[index]=value;cases.push({scopeText:JSON.stringify(bad)});}
 for(const value of [0,2,'1',null]){const bad=[...frame];bad[7]=value;cases.push({scopeText:JSON.stringify(bad)});}
 for(const options of cases){
  const source=storage(),destination=storage(),{record}=await preferenceRecord(f,source,options);
  await assert.rejects((await f.backup(source)).exportRecords(),{code:'BB_JOURNAL_INVALID'});
  await assert.rejects((await f.backup(destination)).restoreRecords([record]),{code:'BB_JOURNAL_INVALID'});
  assert.deepEqual(await destination.keys(),[]);
 }
});
test('preference recovery rejects ciphertext/descriptor tamper and cross-account storage-key transplant',async()=>{
 const f=fixture(),source=storage(),{record}=await preferenceRecord(f,source),frame=preferenceFrame(f);frame[6]=hex(44);
 const other=await preferenceRecord(f,storage(),{scopeText:JSON.stringify(frame)});
 const changed=structuredClone(record),envelope=JSON.parse(record.encoded);
 const flip=s=>(s[0]==='0'?'1':'0')+s.slice(1);
 envelope.data=flip(envelope.data);changed.encoded=JSON.stringify(envelope);
 const descriptor=JSON.parse(record.encoded);descriptor.recovery.data=flip(descriptor.recovery.data);
 for(const bad of [changed,{...record,encoded:JSON.stringify(descriptor)},{...record,key:other.record.key},{...record,encoded:other.record.encoded}]){
  const destination=storage();await assert.rejects((await f.backup(destination)).restoreRecords([bad]),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await destination.keys(),[]);
 }
 const foreign=await createJournalBackup({...f.credentials,walletSecret:hex(9),storage:source});assert.deepEqual(await foreign.exportRecords(),[]);
 const destination=storage(),foreignRestore=await createJournalBackup({...f.credentials,walletSecret:hex(9),storage:destination});
 await assert.rejects(foreignRestore.restoreRecords([record]),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await destination.keys(),[]);
});
test('preference restore preserves newer cache, rejects duplicate records and permits identical idempotent restore',async()=>{
 const f=fixture(),source=storage(),destination=storage(),{record}=await preferenceRecord(f,source),backup=await f.backup(destination);
 await assert.rejects(backup.restoreRecords([record,record]),{code:'BB_JOURNAL_INVALID'});assert.deepEqual(await destination.keys(),[]);
 await backup.restoreRecords([record]);await backup.restoreRecords([record]);
 const slot=await createEncryptedJournalSlot({...f.credentials,storage:destination,keyDomain:PREFERENCES,scopeText:JSON.stringify(preferenceFrame(f))});
 await slot.write(await slot.read(),{revision:'2'});const newer=await destination.read(record.key);
 await assert.rejects(backup.restoreRecords([record]),{code:'BB_JOURNAL_INVALID'});assert.equal(await destination.read(record.key),newer);
});
