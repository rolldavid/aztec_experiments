// Actual Ethereum signatures, WebCrypto, IndexedDB and pinned Aztec address derivation.
// Only extension transport is injected; no user wallet, chain write or browser launch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import * as ethers from 'ethers';
import {Fr} from '@aztec-labs/aztec.js/fields';
import {SchnorrInitializerlessAccountContract} from '@aztec-labs/accounts/schnorr';
import {deriveKeys,deriveMasterMessageSigningSecretKey as deriveSigningKey} from '@aztec-labs/stdlib/keys';
import {getContractInstanceFromInstantiationParams} from '@aztec-labs/aztec.js/contracts';
import {computePartialAddress} from '@aztec-labs/stdlib/contract';
const scripts=await Promise.all(['ethereum-account-session.js','account.js','claim-secret-store.js'].map(n=>fs.readFile(new URL(n,import.meta.url),'utf8')));
const sdk={Fr,SchnorrInitializerlessAccountContract,deriveKeys,deriveSigningKey,getContractInstanceFromInstantiationParams,computePartialAddress};
const signer=new ethers.Wallet('0x'+'12'.repeat(32));
function fixture({indexedDB=new IDBFactory(),cancel=false,code='0x',duringSignature,depositNonce=0n,chainId='11155111'}={}){
 const calls=[],listeners=new Map();let current=signer.address,chain='0x'+BigInt(chainId).toString(16);
 const provider={async request({method,params}){
  calls.push(method);
  if(method==='eth_chainId')return chain;
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [current];
  if(method==='eth_getCode')return code;
  if(method==='eth_call'){assert.equal(params[0].to,'0x'+'34'.repeat(20));assert.equal(params[0].data,new ethers.Interface(['function depositNonces(address) view returns (uint256)']).encodeFunctionData('depositNonces',[signer.address]));return ethers.AbiCoder.defaultAbiCoder().encode(['uint256'],[depositNonce]);}
  if(method==='personal_sign'){if(cancel)throw Object.assign(Error('Rejected'),{code:4001});const signature=await signer.signMessage(ethers.getBytes(params[0]));duringSignature?.({setAccount(value){current=value;listeners.get('accountsChanged')?.([value]);}});return signature;}
  throw Error('Unexpected extension method '+method);
 },on:(name,fn)=>listeners.set(name,fn),removeListener:(name)=>listeners.delete(name)};
 const context=vm.createContext({TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,crypto:webcrypto,indexedDB,ethers,__aztec:sdk,location:{origin:'https://rolling.example'},navigator:{locks:{request:async(_key,options,fn)=>(fn??options)({})}},_getPublicConfig:()=>({network:{chainId},board:{portalAddress:'0x'+'34'.repeat(20)}})});
 context.window=context;for(const source of scripts)vm.runInContext(source,context);
 context.BillboardAccount.configure({requireEth:false});
 return {context,listeners,account:context.BillboardAccount,provider,calls,indexedDB,signIn:(options={})=>context.BillboardAccount.connect(provider,'Test Ethereum wallet',{deriveAccount:true,providerId:'io.test',...options})};
}
test('real signature creates deterministic Aztec account; reload restores without extension calls; signout then new signature recreates same keys/address',async()=>{
 const first=fixture();await first.signIn();const wallet=first.context.walletState.aztec;
 assert(wallet?.address);assert.equal(first.calls.filter(x=>x==='personal_sign').length,1);
 const expected={secretKey:wallet.secretKey,salt:wallet.salt,address:wallet.address.toString()};
 const again=fixture({indexedDB:first.indexedDB});assert.equal(await again.account.restoreRemembered(),true);
 assert.deepEqual(again.calls,[]);for(const key of ['secretKey','salt'])assert.equal(again.context.walletState.aztec[key],expected[key]);assert.equal(again.context.walletState.aztec.address.toString(),expected.address);
 const store=again.context.makeClaimSecretStore(expected.secretKey,expected.salt);assert.equal(typeof store.save,'function');assert.equal(typeof store.load,'function');
 await again.account.endSession();const signedOut=fixture({indexedDB:first.indexedDB});assert.equal(await signedOut.account.restoreRemembered(),false);
 await signedOut.signIn();for(const key of ['secretKey','salt'])assert.equal(signedOut.context.walletState.aztec[key],expected[key]);assert.equal(signedOut.context.walletState.aztec.address.toString(),expected.address);
 assert(!('create' in first.account));assert(!('importRecovery' in first.account));assert(!('exportRecovery' in first.account));assert(!('createPasskey' in first.account));
});
test('signature cancellation leaves no account and a retry can complete',async()=>{
 const f=fixture({cancel:true});await assert.rejects(f.signIn());assert.equal(f.context.walletState.aztec,null);
 const next=fixture({indexedDB:f.indexedDB});assert.equal(await next.account.restoreRemembered(),false);await next.signIn();assert(next.context.walletState.aztec);
});
test('account changes during signature cannot activate or remember the wrong identity',async()=>{
 const f=fixture({duringSignature:({setAccount})=>setAccount(new ethers.Wallet('0x'+'13'.repeat(32)).address)});
 await assert.rejects(f.signIn());assert.equal(f.context.walletState.aztec,null);
 const next=fixture({indexedDB:f.indexedDB});assert.equal(await next.account.restoreRemembered(),false);
});
test('delegated Ethereum EOA still derives its account from its own signature',async()=>{const f=fixture({code:'0xef0100'+'11'.repeat(20)});await f.signIn();assert(f.context.walletState.aztec);assert(!f.calls.includes('eth_getCode'));});
test('remembered account refuses a different Ethereum payer',async()=>{
 const first=fixture();await first.signIn();const next=fixture({indexedDB:first.indexedDB});await next.account.restoreRemembered();
 const other=new ethers.Wallet('0x'+'13'.repeat(32)).address;
 const provider={request:async({method})=>method==='eth_chainId'?'0xaa36a7':method==='eth_accounts'||method==='eth_requestAccounts'?[other]:Promise.reject(Error(method))};
 await assert.rejects(next.account.connect(provider,'Other wallet'),{code:'BB_ACCOUNT_OWNER_MISMATCH'});
 assert.equal(next.context.walletState.ethSigner,null);
});

test('changing the connected wallet removes remembered login before the next page restore',async()=>{
 const first=fixture();await first.signIn();first.listeners.get('accountsChanged')([new ethers.Wallet('0x'+'13'.repeat(32)).address]);
 assert.equal(first.context.walletState.invalidated,true);
 await first.context._forgetRememberedAccount();
 const next=fixture({indexedDB:first.indexedDB});assert.equal(await next.account.restoreRemembered(),false);
});

const scope={origin:'https://rolling.example',chainId:'11155111'};
test('same Ethereum wallet starts a distinct test account, restores automatically and retains selection after signout',async()=>{
 const original=fixture();await original.signIn();const old=original.context.walletState.aztec.address.toString();
 const fresh=fixture({indexedDB:original.indexedDB,depositNonce:4n});await fresh.signIn({freshAccount:true});
 const next=fresh.context.walletState.aztec.address.toString();assert.notEqual(next,old);
 assert.equal(fresh.account.snapshot().ethereumAddress,original.account.snapshot().ethereumAddress);
 assert.equal(await fresh.context.BillboardEthereumSession.selectedTestAccount(scope,signer.address),'5');
 assert.equal(fresh.calls.filter(x=>x==='personal_sign').length,1);assert.equal(fresh.calls.filter(x=>x==='eth_call').length,1);
 const reload=fixture({indexedDB:fresh.indexedDB});assert.equal(await reload.account.restoreRemembered(),true);assert.equal(reload.context.walletState.aztec.address.toString(),next);assert.deepEqual(reload.calls,[]);
 await reload.account.endSession();const signedOut=fixture({indexedDB:fresh.indexedDB});await signedOut.signIn();assert.equal(signedOut.context.walletState.aztec.address.toString(),next);assert(!signedOut.calls.includes('eth_call'));
});
test('after successful signup advances portal nonce, fresh setup with cleared browser storage derives another account',async()=>{
 const first=fixture({depositNonce:4n});await first.signIn({freshAccount:true});
 const cleared=fixture({depositNonce:5n});await cleared.signIn({freshAccount:true});
 assert.notEqual(cleared.context.walletState.aztec.address.toString(),first.context.walletState.aztec.address.toString());
 const repeat=fixture({depositNonce:5n});await repeat.signIn({freshAccount:true});assert.equal(repeat.context.walletState.aztec.address.toString(),cleared.context.walletState.aztec.address.toString());
});
test('cancelled fresh signature retains the original account and selected generation',async()=>{
 const first=fixture({depositNonce:2n});await first.signIn({freshAccount:true});
 const cancelled=fixture({indexedDB:first.indexedDB,depositNonce:3n,cancel:true});await assert.rejects(cancelled.signIn({freshAccount:true}));
 assert.equal(await cancelled.context.BillboardEthereumSession.selectedTestAccount(scope,signer.address),'3');
 const reload=fixture({indexedDB:first.indexedDB});assert.equal(await reload.account.restoreRemembered(),true);assert.equal(reload.context.walletState.aztec.address.toString(),first.context.walletState.aztec.address.toString());
});
test('test account creation is rejected on mainnet before signing or reading the portal',async()=>{
 const f=fixture({chainId:'1'});await assert.rejects(f.signIn({freshAccount:true}),{code:'BB_TEST_ACCOUNT_NETWORK'});assert(!f.calls.includes('personal_sign'));assert(!f.calls.includes('eth_call'));assert.equal(f.context.walletState.aztec,null);
});
