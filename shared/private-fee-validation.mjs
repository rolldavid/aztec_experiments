import {Gas,GasSettings} from '@aztec-labs/stdlib/gas';

// A strict simulation can be handed directly to this wallet's next send. This
// is an opaque, single-use result, never a reusable quote or persisted cache.
const validations=new WeakMap();
const fail=()=>Object.assign(new Error('Transaction validation no longer matches this send.'),{code:'BB_SIMULATION_CHANGED'});
const encode=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
export const snapshotPrivateFeeSimulationInput=(payload,from,gasSettings)=>encode([payload,from.toString(),GasSettings.from(gasSettings).toBuffer().toString('hex')]);
const fingerprint=snapshotPrivateFeeSimulationInput;
const hash=async header=>{if(typeof header?.hash!=='function')throw fail();return (await header.hash()).toString();};

export async function createPrivateFeeSimulationValidation({wallet,simulationPXE,payload,from,gasSettings,result,inputSnapshot}){
 if(wallet.pxe!==simulationPXE||inputSnapshot!==fingerprint(payload,from,gasSettings))throw fail();
 const anchor=await hash(result.publicInputs?.constants?.anchorBlockHeader);
 if(wallet.pxe!==simulationPXE||inputSnapshot!==fingerprint(payload,from,gasSettings))throw fail();
 const token=Object.freeze({});
 validations.set(token,{wallet,pxe:simulationPXE,payload,fingerprint:inputSnapshot,anchor,
  gasUsed:{totalGas:new Gas(result.gasUsed.totalGas.daGas,result.gasUsed.totalGas.l2Gas),
   teardownGas:new Gas(result.gasUsed.teardownGas.daGas,result.gasUsed.teardownGas.l2Gas)}});
 return token;
}

export async function consumePrivateFeeSimulationValidation(token,{wallet,payload,from,gasSettings,additionalScopes,sendMessagesAs}){
 const value=validations.get(token);validations.delete(token);
 if(!value||value.wallet!==wallet||value.pxe!==wallet.pxe||value.payload!==payload||additionalScopes?.length||sendMessagesAs!==undefined||
  value.fingerprint!==fingerprint(payload,from,gasSettings))throw fail();
 if(value.anchor!==await hash(await wallet.pxe.getSyncedBlockHeader()))throw fail();
 if(value.pxe!==wallet.pxe||value.fingerprint!==fingerprint(payload,from,gasSettings))throw fail();
 return value.gasUsed;
}
