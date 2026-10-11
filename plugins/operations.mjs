// Operator lifecycle, injected chain APIs; no provider or board implementation coupling.
import fs from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
export async function fileState(file) {
 const directory=dirname(file),created=await fs.mkdir(directory,{recursive:true,mode:0o700});
 // Also persist newly created directory entries, up to the first existing parent.
 const syncDirectories=[directory];
 if(created){let current=directory;const parent=dirname(created);while(current!==parent){current=dirname(current);syncDirectories.push(current);}}
 let value;try{value=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;value={operations:{}};}
 let uncertain=false;
 const persistenceError=()=>Object.assign(Error('State persistence uncertain; reopen and reconcile before writing'),{code:'STATE_PERSISTENCE_UNCERTAIN'});
 return {read:()=>value,async write(next){
  if(uncertain)throw persistenceError();
  const serialized=JSON.stringify(next,null,2)+'\n',tmp=file+'.'+randomBytes(6).toString('hex');
  let handle,renamed=false;
  try{
   handle=await fs.open(tmp,'wx',0o600);
   await handle.writeFile(serialized);await handle.sync();await handle.close();handle=null;
   await fs.rename(tmp,file);renamed=true;
   for(const directory of syncDirectories){
    const parent=await fs.open(directory,'r');try{await parent.sync();}finally{await parent.close();}
   }
   // Neither acknowledgement nor the in-memory snapshot advances before durability.
   value=next;
  }catch{
   uncertain=true;
   if(handle)try{await handle.close();}catch{}
   if(!renamed)try{await fs.unlink(tmp);}catch{}
   // Never expose raw filesystem diagnostics or overwrite an uncertain disk snapshot.
   throw persistenceError();
  }
 }};
}
/** Save before broadcast. A repeated command waits for the exact previous hash. */
export async function recordedTransaction({store,name,identity,prepare,broadcast,wait}) {
 let record=store.read().operations[name];
 if(record&&record.identity!==identity)throw Error('Saved transaction belongs to a different operation');
 if(!record){record={identity,...await prepare()};await store.write({...store.read(),operations:{...store.read().operations,[name]:record}});}
 await broadcast(record);
 const receipt=await wait(record);return {record,receipt};
}
export async function outboxArguments(node,txHash,{requireFinalized=true}={}){
 if(requireFinalized){
  const receipt=await node.getTxReceipt(txHash);
  if(receipt.executionResult==='reverted'||receipt.status==='dropped')throw Error('Portal source transaction failed');
  if(receipt.status!=='finalized'||receipt.executionResult!=='success')throw Error('Portal message awaits network finality; run this command again later');
 }
 const effect=await node.getTxEffect(txHash),messages=effect?.data.l2ToL1Msgs.filter(x=>!x.isZero());
 if(messages?.length!==1)throw Error('Expected one portal message');
 const witness=await node.getL2ToL1MembershipWitness(txHash,messages[0]);
 if(!witness)throw Error('Portal message awaits network settlement; run this command again later');
 return [BigInt(witness.epochNumber),BigInt(witness.numCheckpointsInEpoch),witness.leafIndex,witness.siblingPath.toBufferArray().map(b=>'0x'+Buffer.from(b).toString('hex'))];
}
