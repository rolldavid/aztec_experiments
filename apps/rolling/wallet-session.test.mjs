// Negative custody boundaries: no SDK/network work may precede the account lock
// and the caller's current-account guard. These are synthetic unit checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRollingWalletSession} from './wallet-session.mjs';
function options(){
 const accesses=[];return {accesses,input:{sdk:new Proxy({},{get(_target,key){accesses.push(key);throw Error('Unexpected SDK access');}}),
  routing:{},ethers:{},config:{network:{chainId:31337,rollupVersion:1,rollupAddress:'0x'+'1'.repeat(40)}},
  boardArtifact:{},privateFeeArtifact:{},account:{address:'0x'+'2'.repeat(64),secretKey:'0x'+'3'.repeat(64),salt:'0'},
  trustedQuery:{url:'http://127.0.0.1:1',allowLocalDev:true},contextGuard:()=>{},locks:{request:async(_name,_options,fn)=>fn({})}}};
}
test('unsupported cross-tab custody fails before any SDK/network access',async()=>{
 const {input,accesses}=options();input.locks={};await assert.rejects(createRollingWalletSession(input),{code:'ROLLING_SESSION_CONFIG'});assert.deepEqual(accesses,[]);
});
test('another active tab rejects setup without reading or opening private stores',async()=>{
 const {input,accesses}=options();let requested;
 input.locks={request:async(name,config,fn)=>{requested={name,config};return fn(null);}};
 await assert.rejects(createRollingWalletSession(input),{code:'ROLLING_OTHER_TAB'});
 assert.deepEqual(requested,{name:'billboard-wallet:'+input.account.address,config:{ifAvailable:true}});assert.deepEqual(accesses,[]);
});
test('invalidated account rejects before trusted-node construction; lock callback settles',async()=>{
 const {input,accesses}=options(),original=Error('Account changed');let released=false;
 input.contextGuard=()=>{throw original;};input.locks={request:async(_name,_config,fn)=>{try{return await fn({});}finally{released=true;}}};
 await assert.rejects(createRollingWalletSession(input),error=>error===original);assert.equal(released,true);assert.deepEqual(accesses,[]);
});
test('query construction receives captured scope and preserves failure without fallback',async()=>{
 const {input}=options(),original=Error('Trusted service unavailable');let calls=0;
 input.sdk={createTrustedPrivateNode:async value=>{calls++;assert.deepEqual(value,{url:'http://127.0.0.1:1',allowLocalDev:true,
  expectedNetworkScope:{chainId:'31337',version:'1',rollup:'0x'+'1'.repeat(40)},proofsEnabled:true});throw original;}};
 await assert.rejects(createRollingWalletSession(input),error=>error===original);assert.equal(calls,1);
});

import fs from 'node:fs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BlockHash} from '@aztec-labs/stdlib/block';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {loadContractArtifact,decodeFromAbi,getFunctionReturnType,EventSelector,decodeFunctionSignature} from '@aztec-labs/stdlib/abi';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {nameRegistration,NAME_DOMAIN} from '../../shared/rolling/name-policy.mjs';
import {getContractClassFromArtifact,getContractInstanceFromInstantiationParams,computeContractAddressFromInstance} from '@aztec-labs/stdlib/contract';
import {sha256ToField} from '@aztec-labs/foundation/crypto/sha256';
import {derivePrivateFeeInstance,normalizePrivateFeeGasSettings} from '../../shared/private-fee-client.mjs';
import {expectedPortalRuntime,verifyPortalRuntime} from '../../shared/portal-runtime.mjs';
import {encodeConfigCommitment} from '../../shared/protocol-commitments.mjs';
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const feeArtifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../src/billboard/private_fee_artifact.json',import.meta.url))));
const metadata=JSON.parse(fs.readFileSync(new URL('../../shared/portal-runtime.json',import.meta.url)));
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),eth=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');

async function deploymentFixture(){
 const deployer=AztecAddress.fromBigIntUnsafe(3n),rollup=eth(11),portal=eth(22);
 const board=await getContractInstanceFromInstantiationParams(artifact,{salt:new Fr(7),deployer,constructorArtifact:'init',constructorArgs:[Array(32).fill(0n),0,31337,rollup,1,100,200,60,2,120,3]});
 const fee=await derivePrivateFeeInstance(feeArtifact),state={destroyed:0,guards:0,reads:[],ethReads:[],inspection:0,enabled:true};
 const config={network:{chainId:'31337',rollupVersion:'1',rollupAddress:rollup,nodeUrl:'http://127.0.0.1:1',ethRpcUrl:'http://127.0.0.1:2'},
  board:{contractAddress:String(board.address),portalAddress:portal},privateFee:{contractAddress:String(fee.address),gasSettings:{gasLimits:{daGas:'1000',l2Gas:'1000'},teardownGasLimits:{daGas:'1',l2Gas:'1'},maxFeesPerGas:{feePerDaGas:'1',feePerL2Gas:'1'},maxPriorityFeesPerGas:{feePerDaGas:'0',feePerL2Gas:'0'}}}};
 const economics={minDeposit:'100',maxDeposit:'200',baseCooldown:'60',kMultiplier:'2',censorWindow:'120',maxSaveUp:'3'};
 const configHash=sha256ToField(Buffer.from(encodeConfigCommitment({l1ChainId:'31337',rollupVersion:'1',rollupAddress:rollup,boardAddress:String(board.address)},economics)));
 const immutables={MIN_DEPOSIT:100n,MAX_DEPOSIT:200n,L2_CONTRACT:BigInt(String(board.address)),ROLLUP:11n,INBOX:33n,OUTBOX:44n,VERSION:1n,L1_CHAIN_ID:31337n,CONFIG_HASH:configHash.toBigInt()};
 const storage=new Map([[1n,22n],...[31337n,11n,1n,100n,200n,60n,2n,120n,3n,3n].map((value,i)=>[3n+BigInt(i),value])]);
 const node={getBlockData:async n=>({blockHash:Fr.fromString(hex(55)),header:{globalVariables:{blockNumber:10}}}),
  getContract:async(address,reference)=>{state.reads.push(['instance',reference]);return address.equals(board.address)?board:fee;},
  getPublicStorageAt:async(reference,address,slot)=>{state.reads.push(['storage',reference]);return new Fr(storage.get(slot.toBigInt()));},
  getL1ContractAddresses:async()=>({rollupAddress:rollup,inboxAddress:eth(33),outboxAddress:eth(44)})};
 const provider={getNetwork:async()=>({chainId:31337n}),getBlock:async n=>({number:20,hash:hex(66)}),getCode:async(address,n)=>{state.ethReads.push(n);return expectedPortalRuntime(metadata,immutables);},destroy:()=>{state.destroyed++;}};
 const ethers={JsonRpcProvider:class{constructor(){return provider;}},Contract:class{constructor(){return {...Object.fromEntries(Object.keys(immutables).map(name=>[name,async opts=>{state.ethReads.push(opts.blockTag);return immutables[name];}])),depositsEnabled:async opts=>{state.ethReads.push(opts.blockTag);return state.enabled;}};}}};
 const sdk={Fr,AztecAddress,getContractClassFromArtifact,computeContractAddressFromInstance,derivePrivateFeeInstance,normalizePrivateFeeGasSettings,sha256ToField,verifyPortalRuntime,portalRuntimeMetadata:metadata,
  isTrustedPrivateNode:n=>n===node,inspectTrustedNode:async(n,opts)=>{state.inspection++;assert.deepEqual(opts.expectedNetworkScope,{chainId:'31337',version:'1',rollup});assert.equal(opts.proofsEnabled,true);}};
 const options={sdk,node,ethers,config,boardArtifact:artifact,privateFeeArtifact:feeArtifact,contextGuard:async()=>{state.guards++;}};
 return {options,state,node,provider,board,fee,storage,immutables,configHash,economics};
}

import {deriveKeys,deriveMasterMessageSigningSecretKey as deriveSigningKey} from '@aztec-labs/stdlib/keys';
import {SchnorrInitializerlessAccountContract} from '@aztec-labs/accounts/schnorr';
import {computePartialAddress} from '@aztec-labs/stdlib/contract';
import {Tx} from '@aztec-labs/stdlib/tx';
import {encodeArguments} from '@aztec-labs/stdlib/abi';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserJournalStorage} from '../../shared/journal-indexeddb.mjs';
import {createL2Journal} from '../../shared/l2-journal.mjs';
const ownedIdString=value=>hex(value.toBigInt());
async function sessionFixture(){
 const f=await deploymentFixture(),state={active:false,events:[],stops:0,closes:0,syncs:0,sends:0,registrations:0};
 const registered=nameRegistration('River','Stone'),ownedId=await poseidon2HashWithSeparator(registered.preimage.map(n=>new Fr(n)),NAME_DOMAIN);
 const ownedAbi=artifact.functions.find(fn=>fn.name==='owned_name_records');assert(ownedAbi,'Normal profile artifact required');
 const packed=bytes=>[new Fr(bytes.slice(0,31).reduce((n,b)=>(n<<8n)|BigInt(b),0n)),new Fr(BigInt(bytes[31])<<240n)];
 const ownedRecords=decodeFromAbi(getFunctionReturnType(ownedAbi),[ownedId,Fr.ONE,new Fr(5),...packed(registered.arguments[0]),new Fr(5),...packed(registered.arguments[2]),...Array.from({length:56},()=>Fr.ZERO)]);
 const secret=new Fr(8n),salt=Fr.ZERO,accountContract=new SchnorrInitializerlessAccountContract(deriveSigningKey(secret));
 const keys=await deriveKeys(secret),accountArtifact=await accountContract.getContractArtifact();
 const accountInstance=await getContractInstanceFromInstantiationParams(accountArtifact,{salt,publicKeys:keys.publicKeys,constructorArgs:undefined,constructorArtifact:undefined,immutablesHash:await accountContract.getImmutablesHash()});
 const account={secretKey:String(secret),salt:String(salt),address:String(accountInstance.address)};
 const held=event=>{assert.equal(state.active,true,event);state.events.push(event);};
 const store={close:async()=>{held('store-close');state.closes++;if(state.failClose)throw Error('close failed');}};
 const pxe={registerAccount:async()=>{held('register-account');state.registrations++;},registerContractClass:async()=>{held('register-class');},registerContract:async()=>{held('register-contract');},
  sync:async()=>{held('sync');state.syncs++;if(state.waitSync)await state.waitSync;if(state.failSync)throw Error('sync failed');},
  getSyncedBlockHeader:async()=>{held('preference-header');return {globalVariables:{blockNumber:10},hash:async()=>BlockHash.fromString(hex(55))};},
  getPrivateEvents:async()=>{held('preference-events');if(state.waitEvents)await state.waitEvents;if(state.failEvents)throw Error('PRIVATE_SENTINEL');return [];},
  stop:async()=>{held('stop');state.stops++;if(state.waitStop)await state.waitStop;if(state.failStop)throw Error('stop failed');await store.close();}};
 const privateStore=createBrowserJournalStorage(new IDBFactory());
 const wallet={aztecNode:f.node,pxe,getAccounts:async()=>[accountInstance.address],getChainInfo:async()=>({chainId:31337,version:1}),sendTx:async()=>{held('send');state.sends++;throw Error('unknown send');}};
 const routing={createAztecWallet:(_sdk,p,n,raw)=>{held('create-wallet');assert.equal(p,pxe);assert.equal(n,f.node);assert.equal(raw,f.node);return wallet;},
  isPrivateWalletForNode:(w,n)=>!state.wrongWallet&&w===wallet&&n===f.node};
 const sdk={...f.options.sdk,poseidon2HashWithSeparator,EventSelector,decodeFunctionSignature,Fr,deriveKeys,deriveSigningKey,SchnorrInitializerlessAccountContract,getContractInstanceFromInstantiationParams,computePartialAddress,Tx,encodeArguments,
  createTrustedPrivateNode:async options=>{held('trusted-node');assert.equal(options.url,'http://127.0.0.1:3/v1/node');return f.node;},
  openPXEStore:async options=>{held('open-store');assert.equal(options.accountAddress,account.address);assert.equal(options.dataDirectory,'rolling-wallet-v1');return store;},
  createPXE:async(n,c,o)=>{held('create-pxe');assert.equal(n,f.node);assert.equal(o.store,store);assert.deepEqual(o.remoteProver,{url:'http://127.0.0.1:3',board:String(f.board.address)});if(state.failCreatePXE)throw Error('pxe failed');return pxe;},
  isPrivatePXEForNode:(p,n)=>!state.wrongPXE&&p===pxe&&n===f.node,
  createBrowserJournalStorage:()=>privateStore,createL2Journal,
  AccountManager:{create:async()=>{held('account-manager');return {address:accountInstance.address};}},
  ContractFunctionInteraction:class{async simulate(){held('signing-capsule');}},
  Contract:{at:()=>({methods:{preference_head:()=>({simulate:async()=>{held('preference-head');return {result:decodeFromAbi(getFunctionReturnType(artifact.functions.find(fn=>fn.name==='preference_head')),[Fr.ZERO,Fr.ONE,Fr.ZERO,Fr.ZERO])};}}),register_name:(...args)=>({args}),get_deposit_ids:()=>({simulate:async()=>({result:[9n,...Array(9).fill(0n)]})}),owned_name_records:()=>({simulate:async()=>({result:ownedRecords})})}})},
  preparePrivateFeePayment:async()=>({availableCredit:100n}),estimatePrivateFeeTransaction:async()=>({maximumFee:10n,payload:{},gasSettings:{}})};
 const locks={request:async(name,options,run)=>{assert.equal(name,'billboard-wallet:'+account.address);assert.deepEqual(options,{ifAvailable:true});
  if(state.active||state.otherTab)return run(null);state.active=true;state.events.push('lock');try{return await run({});}finally{state.active=false;state.events.push('unlock');}}};
 return {...f,state,ownedId,privateStore,pxe,store,wallet,input:{...f.options,sdk,routing,account,locks,trustedQuery:{url:'http://127.0.0.1:3/v1/node',allowLocalDev:true},remoteProver:{url:'http://127.0.0.1:3',board:String(f.board.address)},contextGuard:async()=>{held('guard');}}};
}
test('constructs verified deployment/account, registers with one trusted PXE, and guards every application operation',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);
 assert.equal(f.state.registrations,1);assert.equal(f.state.events.filter(x=>x==='register-contract').length,3);
 const names=await session.application.ownedIdentities();assert.deepEqual(names.identities,[ownedIdString(f.ownedId)]);assert.deepEqual(names.records,[{id:ownedIdString(f.ownedId),first:'River',last:'Stone'}]);
 assert.equal((await session.application.readAccountStatus()).status,'fee-ready');
 const intent=await session.application.prepare({type:'name',first:'River',last:'Stone'});assert.equal(intent.status,'prepared');
 assert.equal((await session.application.cancelPrepared(intent.intentId)).status,'cancelled');
 await session.close();await session.close();assert.equal(f.state.stops,1);assert.equal(f.state.closes,1);assert.equal(f.state.active,false);
 await assert.rejects(session.application.ownedIdentities(),{code:'ROLLING_CONTEXT_CHANGED'});
});
test('replacement session preserves actual encrypted Rolling intent and unknown fence without a second send',async()=>{
 const f=await sessionFixture(),first=await createRollingWalletSession(f.input),intent=await first.application.prepare({type:'name',first:'River',last:'Stone'});
 await assert.rejects(first.application.submitPrepared(intent.intentId),/unknown send/);await first.close();
 const second=await createRollingWalletSession(f.input);assert.equal((await second.application.reconcile(intent.intentId)).status,'unknown');
 await assert.rejects(second.application.submitPrepared(intent.intentId),{code:'ROLLING_RECOVERY_REQUIRED'});assert.equal(f.state.sends,1);await second.close();
});
test('setup failures clean private resources while still holding the cross-tab lock',async()=>{
 for(const mode of ['failCreatePXE','failSync','wrongPXE','wrongWallet']){
  const f=await sessionFixture();f.state[mode]=true;await assert.rejects(createRollingWalletSession(f.input));
  assert.equal(f.state.active,false);assert.equal(f.state.closes,1);assert.equal(f.state.stops,mode==='failCreatePXE'?0:1);
  assert.ok(f.state.events.indexOf('store-close')<f.state.events.lastIndexOf('unlock'));
  if(mode==='wrongPXE')assert.equal(f.state.registrations,0);
  if(mode==='wrongWallet')assert.ok(!f.state.events.includes('account-manager'));
 }
});
test('cleanup errors preserve original failure and close the store when PXE.stop fails',async()=>{
 const f=await sessionFixture();f.state.failSync=true;f.state.failStop=true;f.state.failClose=true;
 await assert.rejects(createRollingWalletSession(f.input),error=>error instanceof AggregateError&&error.errors[0].message==='sync failed'&&error.errors[1] instanceof AggregateError);
 assert.equal(f.state.stops,1);assert.equal(f.state.closes,1);assert.equal(f.state.active,false);
});
test('simultaneous close shares one cleanup; busy action prevents close or competing action',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);
 let release;f.state.waitSync=new Promise(resolve=>{release=resolve;});const action=session.application.ownedIdentities();await new Promise(r=>setTimeout(r,0));
 assert.equal(session.busy,true);await assert.rejects(session.close(),{code:'ROLLING_BUSY'});await assert.rejects(session.application.readAccountStatus(),{code:'ROLLING_BUSY'});
 release();await action;f.state.waitSync=null;
 let stop;f.state.waitStop=new Promise(resolve=>{stop=resolve;});const close1=session.close(),close2=session.close();assert.equal(close1,close2);stop();await Promise.all([close1,close2]);assert.equal(f.state.stops,1);
});
test('identity mutation inside asynchronous guard rejects before private setup or synchronization',async()=>{
 const f=await sessionFixture();f.input.contextGuard=async()=>{await Promise.resolve();f.input.account.salt='9';};
 await assert.rejects(createRollingWalletSession(f.input),{code:'ROLLING_CONTEXT_CHANGED'});assert.ok(!f.state.events.includes('trusted-node'));
 const g=await sessionFixture(),session=await createRollingWalletSession(g.input);const before=g.state.syncs;g.input.account.secretKey=hex(99);
 await assert.rejects(session.application.ownedIdentities(),{code:'ROLLING_CONTEXT_CHANGED'});assert.equal(g.state.syncs,before);await session.close();
});

test('altered private routing is rejected before per-operation PXE synchronization',async()=>{
 for(const mutate of [f=>{f.state.wrongPXE=true;},f=>{f.state.wrongWallet=true;},f=>{f.wallet.aztecNode={};}]){
  const f=await sessionFixture(),session=await createRollingWalletSession(f.input),before=f.state.syncs;mutate(f);
  await assert.rejects(session.application.ownedIdentities(),{code:'ROLLING_PRIVATE_ROUTE'});assert.equal(f.state.syncs,before);await session.close();
 }
});
test('failed close leaves session unusable, preserves error, and permits explicit cleanup retry',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);f.state.failStop=true;
 await assert.rejects(session.close(),/stop failed/);assert.equal(f.state.closes,1);assert.equal(session.busy,false);
 await assert.rejects(session.application.ownedIdentities(),{code:'ROLLING_CONTEXT_CHANGED'});
 f.state.failStop=false;await session.close();assert.equal(f.state.stops,2);
 const g=await sessionFixture(),other=await createRollingWalletSession(g.input);g.state.otherTab=true;
 await assert.rejects(other.close(),{code:'ROLLING_OTHER_TAB'});assert.equal(g.state.stops,0);
 g.state.otherTab=false;await other.close();assert.equal(g.state.stops,1);
});

test('account mutation during each awaited initialization step blocks the next private operation',async()=>{
 for(const stage of ['partial-address','class-registration','last-registration','account-manager','signing-key']){
  const f=await sessionFixture();let forbidden=0;
  const change=()=>{f.input.account.salt='9';};
  if(stage==='partial-address'){
   const original=f.input.sdk.computePartialAddress;f.input.sdk.computePartialAddress=async(...args)=>{const result=await original(...args);change();return result;};
   f.pxe.registerAccount=async()=>{forbidden++;};
  }
  if(stage==='class-registration'){
   const original=f.pxe.registerContractClass;f.pxe.registerContractClass=async(...args)=>{await original(...args);change();};
   f.pxe.registerContract=async()=>{forbidden++;};
  }
  if(stage==='last-registration'){
   const original=f.pxe.registerContract;let calls=0;f.pxe.registerContract=async(...args)=>{await original(...args);if(++calls===3)change();};
   f.pxe.sync=async()=>{forbidden++;};
  }
  if(stage==='account-manager'){
   const original=f.input.sdk.AccountManager.create;f.input.sdk.AccountManager.create=async(...args)=>{const result=await original(...args);change();return result;};
   f.input.sdk.SchnorrInitializerlessAccountContract=class extends SchnorrInitializerlessAccountContract{async getSigningPublicKey(){if(f.input.account.salt==='9')forbidden++;return super.getSigningPublicKey();}};
  }
  if(stage==='signing-key'){
   f.input.sdk.SchnorrInitializerlessAccountContract=class extends SchnorrInitializerlessAccountContract{async getSigningPublicKey(){const result=await super.getSigningPublicKey();if(f.state.events.includes('account-manager'))change();return result;}};
   f.input.sdk.ContractFunctionInteraction=class{async simulate(){forbidden++;}};
  }
  await assert.rejects(createRollingWalletSession(f.input),{code:'ROLLING_CONTEXT_CHANGED'},stage);
  assert.equal(forbidden,0,stage);assert.equal(f.state.stops,1,stage);assert.equal(f.state.closes,1,stage);
  assert.ok(f.state.events.indexOf('store-close')<f.state.events.lastIndexOf('unlock'),stage);
 }
});

test('account mutation while opening storage prevents PXE creation and closes only the acquired store',async()=>{
 const f=await sessionFixture(),original=f.input.sdk.openPXEStore;let creates=0;
 f.input.sdk.openPXEStore=async(...args)=>{const store=await original(...args);f.input.account.salt='9';return store;};
 f.input.sdk.createPXE=async()=>{creates++;throw Error('must not construct private PXE');};
 await assert.rejects(createRollingWalletSession(f.input),{code:'ROLLING_CONTEXT_CHANGED'});
 assert.equal(creates,0);assert.equal(f.state.stops,0);assert.equal(f.state.closes,1);
 assert.ok(f.state.events.indexOf('store-close')<f.state.events.lastIndexOf('unlock'));
});

// Real session/application/AEAD/ABI; PXE and node above are explicitly synthetic.
async function waitForPreferenceEvents(f){
 const deadline=Date.now()+2000;
 while(!f.state.events.includes('preference-events')){assert(Date.now()<deadline,'Preference event read did not start');await new Promise(r=>setTimeout(r,1));}
}
test('preferences initialize lazily and read under the one existing lock with one synchronization',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);
 assert(!f.state.events.includes('preference-events'));const syncs=f.state.syncs,start=f.state.events.length;
 const result=await session.application.readPreferences();assert.equal(result.status,'complete');assert.deepEqual(result.preferences.bookmarks,[]);
 assert.equal(f.state.syncs,syncs+1);const events=f.state.events.slice(start);
 assert.equal(events.filter(v=>v==='lock').length,1);assert.equal(events.filter(v=>v==='unlock').length,1);
 assert(events.includes('preference-head'));assert(events.includes('preference-events'));assert.equal(f.state.sends,0);await session.close();
});
test('preference cancellation retains account lock until unabortable SDK read settles',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);let release;
 f.state.waitEvents=new Promise(r=>{release=r;});const controller=new AbortController();
 const pending=session.application.readPreferences({signal:controller.signal}),observed=assert.rejects(pending,{code:'ROLLING_PREFERENCE_READER_UNAVAILABLE'});
 await waitForPreferenceEvents(f);controller.abort();
 assert(session.busy&&f.state.active);await assert.rejects(session.close(),{code:'ROLLING_BUSY'});
 await assert.rejects(session.application.readAccountStatus(),{code:'ROLLING_BUSY'});assert.equal(f.state.stops,0);
 release();await observed;assert.equal(session.busy,false);assert.equal(f.state.active,false);assert.equal(f.state.sends,0);await session.close();
});
test('different active tab rejects preference read before synchronization or event lookup',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);const syncs=f.state.syncs;
 f.state.otherTab=true;await assert.rejects(session.application.readPreferences(),{code:'ROLLING_OTHER_TAB'});
 assert.equal(f.state.syncs,syncs);assert(!f.state.events.includes('preference-events'));f.state.otherTab=false;await session.close();
});
test('account change during private preference event read prevents publication without a send',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input);let release;
 f.state.waitEvents=new Promise(r=>{release=r;});const pending=session.application.readPreferences(),observed=assert.rejects(pending,{code:'ROLLING_PREFERENCE_READER_UNAVAILABLE'});
 await waitForPreferenceEvents(f);f.input.account.secretKey=hex(99);release();await observed;
 assert.equal(f.state.sends,0);assert.equal(f.state.active,false);await session.close();
});
test('failed preference read preserves session and existing prepared financial intent',async()=>{
 const f=await sessionFixture(),session=await createRollingWalletSession(f.input),intent=await session.application.prepare({type:'name',first:'River',last:'Stone'});
 f.state.failEvents=true;await assert.rejects(session.application.readPreferences(),{code:'ROLLING_PREFERENCE_READER_UNAVAILABLE'});
 const restored=await session.application.readAccountStatus();assert.equal(restored.intent.intentId,intent.intentId);assert.equal(f.state.sends,0);
 f.state.failEvents=false;assert.equal((await session.application.readPreferences()).status,'complete');await session.close();
});
