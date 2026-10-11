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
