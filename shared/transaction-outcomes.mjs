// Explicit submission/receipt outcomes. Diagnostic bodies never escape this boundary.
export const transactionError=(code,message)=>Object.assign(new Error(message),{code});
const accepted=new Set(['checkpointed','proven','finalized']);
const pending=new Set(['pending','proposed']);
const hash=value=>value?.toString?.();
export async function boundedTransactionRead(fn, timeoutMs=20000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000) throw transactionError('BB_SUBMISSION_UNKNOWN','Transaction read deadline expired.');
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(transactionError('BB_SUBMISSION_UNKNOWN','Transaction RPC timed out. Keep the saved request and reconcile before retrying.')),timeoutMs);
    })]);
  } finally {clearTimeout(timer);}
}
export function requireSuccessfulReceipt(receipt,txHash) {
  if(hash(receipt?.txHash)!==hash(txHash) || !accepted.has(receipt?.status) || receipt.executionResult!=='success' ||
    !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber<1 || !receipt.blockHash) {
    throw transactionError('BB_TRANSACTION_FAILED','Transaction does not have a successful confirmed receipt.');
  }
  return receipt;
}
// A bounded read-only check. Pending/dropped is not permission to replace or resend.
export async function readCanonicalReceipt(node,txHash,{readTimeoutMs=20000}={}) {
  const receipt=await boundedTransactionRead(()=>node.getTxReceipt(txHash),readTimeoutMs);
  if(hash(receipt?.txHash)!==hash(txHash))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt identity does not match.');
  if(pending.has(receipt.status)||receipt.status==='dropped')return null;
  if(!accepted.has(receipt.status)||!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<1||!receipt.blockHash||!['success','reverted'].includes(receipt.executionResult))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt is incomplete.');
  const block=await boundedTransactionRead(()=>node.getBlock(receipt.blockNumber),readTimeoutMs);
  if(!block||hash(block.hash)!==hash(receipt.blockHash))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt block is not canonical.');
  return receipt;
}
export async function submitOnceWithReconciliation(node,tx) {
  try {await boundedTransactionRead(()=>node.sendTx(tx));}
  catch {
    let receipt;try {receipt=await boundedTransactionRead(()=>node.getTxReceipt(tx.getTxHash()));}catch {}
    if(hash(receipt?.txHash)===hash(tx.getTxHash())) {
      if(pending.has(receipt?.status)||accepted.has(receipt?.status))return receipt;
      if(receipt?.status==='dropped')return classifyDroppedTransaction(node,tx,receipt);
    }
    throw transactionError('BB_SUBMISSION_UNKNOWN','Submission outcome is unknown. Reconcile this transaction before retrying.');
  }
}
export async function classifyDroppedTransaction(node,tx,receipt,{readTimeoutMs=20000}={}) {
  if(receipt?.status!=='dropped' || hash(receipt.txHash)!==hash(tx.getTxHash())) throw transactionError('BB_SUBMISSION_UNKNOWN','Transaction identity is unavailable.');
  let validation,refreshed;
  try {validation=await boundedTransactionRead(()=>node.isValidTx(tx),readTimeoutMs);refreshed=await boundedTransactionRead(()=>node.getTxReceipt(tx.getTxHash()),readTimeoutMs);}
  catch {throw transactionError('BB_SUBMISSION_UNKNOWN','Dropped transaction could not be reconciled.');}
  if(hash(refreshed?.txHash)!==hash(tx.getTxHash())) throw transactionError('BB_SUBMISSION_UNKNOWN','Transaction identity changed.');
  if(pending.has(refreshed.status)||accepted.has(refreshed.status)) return refreshed;
  const reasons=['Existing nullifier','Block header not found'];
  if(refreshed.status==='dropped' && validation?.result==='invalid' && Array.isArray(validation.reason) && validation.reason.length && validation.reason.every(reason=>reasons.includes(reason))) {
    throw Object.assign(transactionError('BB_STATE_CONFLICT','Transaction state changed. Refresh and create a new proof.'),{stateReasons:[...validation.reason]});
  }
  throw transactionError('BB_SUBMISSION_UNKNOWN','Drop reason is unconfirmed. Reconcile before retrying.');
}
export async function waitForCanonicalReceipt(node,tx,{timeoutMs=0,intervalMs,onPoll=()=>{},readTimeoutMs=20000}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<0||(intervalMs!==undefined&&(!Number.isFinite(intervalMs)||intervalMs<=0)))throw transactionError('BB_SUBMISSION_UNKNOWN','Transaction wait configuration is invalid.');
  const txHash=tx.getTxHash(),readLimit=timeoutMs===0?readTimeoutMs:Math.min(readTimeoutMs,timeoutMs);let stateConflict;
  try {
    // The SDK owns waiting. This boundary only validates each actual receipt and
    // reconciles drops; no elapsed time can authorize a replacement or resend.
    // Read-only clients use this module too; only private SDK consumers need the waiter.
    const {waitForTx}=await import('@aztec-labs/aztec.js/node');
    const receipt=await waitForTx({getTxReceipt:async()=>{
      let observed=await boundedTransactionRead(()=>node.getTxReceipt(txHash),readLimit);
      if(hash(observed?.txHash)!==hash(txHash))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt identity does not match.');
      if(observed.status==='dropped'){
        try{observed=await classifyDroppedTransaction(node,tx,observed,{readTimeoutMs:readLimit});}
        catch(error){if(error?.code==='BB_STATE_CONFLICT')stateConflict=error;throw error;}
      }
      if(!pending.has(observed.status)&&!accepted.has(observed.status))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt status is unrecognized.');
      if(pending.has(observed.status))onPoll();
      return observed;
    }},txHash,{timeout:timeoutMs/1000,...(intervalMs===undefined?{}:{interval:(timeoutMs===0?intervalMs:Math.min(intervalMs,timeoutMs))/1000}),ignoreDroppedReceiptsFor:0,dontThrowOnRevert:true});
    if(!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<1||!receipt.blockHash)throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt block identity is unavailable.');
    const block=await boundedTransactionRead(()=>node.getBlock(receipt.blockNumber),readLimit);
    if(!block||hash(block.hash)!==hash(receipt.blockHash))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt block is not confirmed canonical.');
    if(!['success','reverted'].includes(receipt.executionResult))throw transactionError('BB_SUBMISSION_UNKNOWN','Receipt execution result is unavailable.');
    return receipt;
  }catch(error){
    if(stateConflict&&error===stateConflict)throw error;
    throw transactionError('BB_SUBMISSION_UNKNOWN','Confirmation is unavailable. Keep the transaction identifier and reconcile before retrying.');
  }
}

export async function waitForSuccessfulReceipt(node,tx,options={}) {
  return requireSuccessfulReceipt(await waitForCanonicalReceipt(node,tx,options),tx.getTxHash());
}
