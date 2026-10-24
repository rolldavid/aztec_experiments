import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test('native proof result and witness graph are collectible before the held receipt completes',async()=>{
 const result=await promisify(execFile)(process.execPath,['--expose-gc','--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import vm from 'node:vm';
  import {readFile} from 'node:fs/promises';
  import {TxProvingResult,TxHash} from '@aztec-labs/stdlib/tx';
  import {Gas,GasFees,GasSettings} from '@aztec-labs/stdlib/gas';
  import {Fr} from '@aztec-labs/foundation/curves/bn254';
  const source=await readFile('apps/src/billboard/user/engine.js','utf8');
  const context=vm.createContext({URL,performance,Buffer,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const owner={toString:()=> 'owner'},settings=new GasSettings(new Gas(100,200),new Gas(1,2),new GasFees(3n,4n),GasFees.empty());
  class BaseWallet{
   constructor(pxe){this.pxe=pxe;}
   async completeFeeOptions(options){return {gasSettings:options.gasSettings};}
   async simulateViaEntrypoint(){return {publicInputs:{forPublic:{}},publicOutput:{txEffect:{revertCode:{isOK:()=>true}}},gasUsed:{totalGas:new Gas(1,1),teardownGas:Gas.empty()}};}
   async createTxExecutionRequestFromPayloadAndFee(){return {};}
   scopesFrom(){return [];}senderForTagsFrom(){return owner;}
  }
  for(const atomicSimulation of [false,true]){
   const entered=Promise.withResolvers(),release=Promise.withResolvers(),hash=TxHash.fromBigInt(10n),tx={getTxHash:()=>hash};
   let proofRef,witnessRef,extracted=0,submitted=0,finished=false;
   const prove=async()=>{
    const result=new TxProvingResult({witness:new Uint8Array(1024*1024)},null,null,{timings:{total:1}});
    result.toTx=async()=>tx;proofRef=new WeakRef(result);witnessRef=new WeakRef(result.privateExecutionResult);return result;
   };
   const pxe={proveTx:prove,proveTxWithPublicValidation:prove};
   const sdk={BaseWallet,GasSettings,
    extractApplicationNullifier:async(result)=>{assert.equal(result.privateExecutionResult.witness.byteLength,1024*1024);extracted++;return Fr.ONE;},
    submitOnceWithReconciliation:async()=>{submitted++;},
    waitForSuccessfulReceipt:async()=>{entered.resolve();await release.promise;return {blockNumber:1,status:'checkpointed',transactionFee:0n};},
   };
   const wallet=context.BillboardPrivateFeeRouting.createAztecWallet(sdk,pxe,{}, {},()=>{},Fr.ONE);
   wallet._applicationNullifierBoard='board';
   const sending=wallet.sendTx({}, {from:owner,fee:{gasSettings:settings},atomicSimulation}).finally(()=>{finished=true;});
   await entered.promise;assert.equal(extracted,1);assert.equal(submitted,1);assert.equal(finished,false);
   let collected=false;
   for(let attempt=0;attempt<20;attempt++){
    await new Promise(setImmediate);global.gc();
    if(proofRef.deref()===undefined&&witnessRef.deref()===undefined){collected=true;break;}
   }
   assert.equal(collected,true,'native result/witness must not be owned by confirmation wait');
   assert.equal(finished,false);release.resolve();await sending;assert.equal(finished,true);
  }
 `],{cwd:fileURLToPath(new URL('..',import.meta.url)),timeout:15000,maxBuffer:1024*1024});
 assert.equal(result.stderr,'');
});
