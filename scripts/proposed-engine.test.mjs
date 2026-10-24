import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {TxHash,MinedTxReceipt} from '@aztec-labs/stdlib/tx';
import {Gas,GasFees,GasSettings} from '@aztec-labs/stdlib/gas';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {waitForSuccessfulReceipt,submitOnceWithReconciliation} from '../shared/transaction-outcomes.mjs';
// Actual wallet engine and native receipt waiter; proof body is a labelled double.
for(const minimum of ['proposed','checkpointed'])test('wallet sender returns only selected explicit '+minimum+' tier with one proof/send',async()=>{
 const context=vm.createContext({URL,performance,Buffer,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout});
 vm.runInContext(await readFile(new URL('../apps/src/billboard/user/engine.js',import.meta.url),'utf8'),context);
 const owner={toString:()=> 'owner'},settings=new GasSettings(new Gas(100,200),new Gas(1,2),new GasFees(3n,4n),GasFees.empty()),hash=TxHash.fromBigInt(10n),blockHash='0x'+'a'.repeat(64),tx={getTxHash:()=>hash};
 let proofs=0,sends=0,reads=0,included=0,confirmed=0,signed=0,policy;
 const checkpoint=Promise.withResolvers(),firstRead=Promise.withResolvers();
 class BaseWallet{constructor(pxe){this.pxe=pxe;}async completeFeeOptions(options){return {gasSettings:options.gasSettings};}async createTxExecutionRequestFromPayloadAndFee(){return {};}scopesFrom(){return [];}senderForTagsFrom(){return owner;}}
 const node={sendTx:async()=>{sends++;},getTxReceipt:async()=>{reads++;firstRead.resolve();if(reads>1)await checkpoint.promise;return new MinedTxReceipt(hash,reads===1?'proposed':'checkpointed','success',0n,blockHash,11,1,0,1);},getBlock:async()=>({hash:blockHash})};
 const journal={setOperation:(_id,opts)=>{policy=opts.confirmationTier;},assertCanStart:async()=>null,prepare:async()=>signed++,included:async r=>{assert.equal(r.status,'proposed');included++;},confirmed:r=>{assert.equal(r.status,'checkpointed');confirmed++;}};
 const sdk={BaseWallet,GasSettings,waitForSuccessfulReceipt,submitOnceWithReconciliation};
 const pxe={proveTxWithPublicValidation:async()=>{proofs++;return {toTx:async()=>tx};}};
 const wallet=context.BillboardPrivateFeeRouting.createAztecWallet(sdk,pxe,node,node,()=>{},Fr.ONE);
 let done=false;const sending=wallet.sendTx({}, {from:owner,fee:{gasSettings:settings},atomicSimulation:true,transactionJournal:journal,journalOperation:'ROLLING_WORKFLOW_V1:fixture',confirmationTier:minimum,wait:{interval:.001}}).then(v=>{done=true;return v;});
 await firstRead.promise;
 if(minimum==='checkpointed'){await new Promise(setImmediate);assert.equal(done,false);assert.equal(confirmed,0);checkpoint.resolve();}
 const result=await sending;assert.equal(result.receipt.status,minimum);assert.equal(policy,minimum);assert.equal(proofs,1);assert.equal(sends,1);assert.equal(signed,1);assert.equal(included,minimum==='proposed'?1:0);assert.equal(confirmed,minimum==='checkpointed'?1:0);
});
