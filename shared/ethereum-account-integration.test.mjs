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
function fixture({indexedDB=new IDBFactory(),cancel=false,code='0x',duringSignature}={}){
 const calls=[],listeners=new Map();let current=signer.address,chain='0xaa36a7';
 const provider={async request({method,params}){
  calls.push(method);
  if(method==='eth_chainId')return chain;
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [current];
  if(method==='eth_getCode')return code;
  if(method==='personal_sign'){if(cancel)throw Object.assign(Error('Rejected'),{code:4001});const signature=await signer.signMessage(ethers.getBytes(params[0]));duringSignature?.({setAccount(value){current=value;listeners.get('accountsChanged')?.([value]);}});return signature;}
  throw Error('Unexpected extension method '+method);
 },on:(name,fn)=>listeners.set(name,fn),removeListener:(name)=>listeners.delete(name)};
 const context=vm.createContext({TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,crypto:webcrypto,indexedDB,ethers,__aztec:sdk,location:{origin:'https://rolling.example'},navigator:{locks:{request:async(_key,options,fn)=>(fn??options)({})}},_getPublicConfig:()=>({network:{chainId:'11155111'}})});
 context.window=context;for(const source of scripts)vm.runInContext(source,context);
 context.BillboardAccount.configure({requireEth:false});
 return {context,listeners,account:context.BillboardAccount,provider,calls,indexedDB,signIn:()=>context.BillboardAccount.connect(provider,'Test Ethereum wallet',{deriveAccount:true,providerId:'io.test'})};
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
