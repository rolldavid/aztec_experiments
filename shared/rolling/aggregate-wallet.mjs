// Thin composition of the existing quote, custody and Ethereum journal APIs.
// Only the owning private session calls this capability, under its account lock.
const fail=code=>Object.assign(Error('Funding is unavailable. Preserve saved recovery records.'),{code:'ROLLING_FUNDING_'+code});
const check=(value,code='INVALID')=>{if(!value)throw fail(code);};
const clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const AGGREGATE_SCOPE_KEYS=Object.freeze(['chainId','router','routerCodeHash','collateralPortal','feePortal','bokPortal','weth','swapRouter','feeToken','bokToken','privateFpc','quoter','quoterCodeHash']);
export function aggregateWalletScope(scope,network,board,owner){
 return JSON.stringify(['ROLLING_AGGREGATE_FUNDING_V1',network.chainId,network.version,network.rollup,board,scope.router,owner,1]);
}
export async function createAggregateWallet({sdk,ethers,scope,network,board,bok,owner,walletSecret,walletSalt,storage,provider,captureWallet,contextGuard,verifyScope,reconcileClaim,nowSeconds}){
 const s=freeze(clone(scope)),n=freeze(clone(network));
 check(s&&Object.keys(s).sort().join()===Array.from(AGGREGATE_SCOPE_KEYS).sort().join());
 check(s.chainId===n.chainId&&typeof captureWallet==='function'&&typeof verifyScope==='function');
 const scopeText=aggregateWalletScope(s,n,board,owner);
 const openSlot=text=>sdk.createEncryptedJournalSlot({storage,walletSecret,walletSalt,scopeText:text,keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});
 const slot=await openSlot(scopeText);
 const archiveSlot=txHash=>{check(typeof txHash==='string'&&/^0x[0-9a-f]{64}$/.test(txHash));const frame=JSON.parse(scopeText);frame.splice(-1,0,txHash);return openSlot(JSON.stringify(frame));};
 let prepared=null;
 const read=async fn=>{await contextGuard();const result=await fn();await contextGuard();return result;};
 const journal=depositor=>sdk.createEthereumJournal({storage,walletSecret,walletSalt,
  scope:{account:owner,...n,board,portal:s.router,depositor},provider,contextGuard});
 async function stored(){const saved=await read(()=>slot.read());if(saved.value){check(saved.value.schemaVersion===1&&typeof saved.value.depositor==='string');check(saved.value.bokScope.recipient===bok&&saved.value.bokScope.portal===s.bokPortal);}return saved;}
 function original(saved,request){
  const value=saved.value;check(value?.intent,'RECOVERY_REQUIRED');
  for(const key of ['from','to','chainId','nonce','data','value'])check(value.intent[key]===request[key],'MISMATCH');
  check(JSON.stringify(value.intent.expected)===JSON.stringify(request.expected),'MISMATCH');
  sdk.validateAggregateFundingIntent(request);return value;
 }
 function receipts(result){
  check(result.outcome==='success'&&result.event,'PENDING');
  const base={txHash:result.txHash,blockHash:result.receipt.blockHash.toLowerCase(),blockNumber:result.receipt.blockNumber,
   sender:result.request.from,nonce:String(result.request.nonce)};
  const leg=name=>{const {amount,secretHash,messageKey,leafIndex}=result.event[name];return {...base,amount:String(amount),secretHash,messageKey,leafIndex:String(leafIndex)};};
  return freeze({receipt:leg('collateral'),feeReceipt:leg('privateFee'),bokReceipt:leg('bok')});
 }
 async function reconcile(txHash){
  const saved=await stored();check(saved.value?.intent,'RECOVERY_REQUIRED');
  const result=await read(async()=> (await journal(saved.value.depositor)).recover({retry:false}));
  original(saved,result.request);if(txHash!==undefined)check(result.txHash===txHash,'MISMATCH');
  check(result.outcome==='success','PENDING');return {saved,result};
 }
 return Object.freeze({
  async prepare(allocation){
   const values=clone(allocation);prepared=null;await read(verifyScope);
   const previous=await stored();
   if(previous.value?.intent){
    check(previous.value.claim?.attempted&&typeof reconcileClaim==='function','RECOVERY_REQUIRED');
    const claim=await read(()=>reconcileClaim(previous.value.claim.intentId));check(claim.status==='confirmed','RECOVERY_REQUIRED');
    const {result}=await reconcile();const archive=await archiveSlot(result.txHash),old=await read(()=>archive.read());
    if(old.value===null)await read(()=>archive.write(old,{...previous.value,confirmedRequest:clone(result.request),txHash:result.txHash}));
    else check(JSON.stringify(old.value.intent)===JSON.stringify(previous.value.intent),'MISMATCH');
   }
   const wallet=await read(captureWallet);await read(wallet.guard);
   const depositor=wallet.address;
   const existing=await read(async()=> (await journal(depositor)).inspectSummary());check(existing===null||previous.value?.intent&&existing.outcome==='success','RECOVERY_REQUIRED');
   let nonce=await read(()=>provider.getTransactionCount(depositor,'pending'));if(previous.value?.intent&&previous.value.depositor===depositor)nonce=Math.max(nonce,previous.value.intent.nonce+1);check(Number.isSafeInteger(nonce)&&nonce>=0);
   const collateral=await read(()=>sdk.deriveBoardDepositSecret({walletSecret,walletSalt,owner,
    scope:{l1ChainId:n.chainId,rollupVersion:n.version,rollupAddress:n.rollup,boardAddress:board,portalAddress:s.collateralPortal,depositor},nonce}));
   const fee=await read(()=>sdk.claimSecrets({walletSecret,owner,record:{chainId:n.chainId,version:n.version,privateFeeAddress:s.privateFpc,sender:depositor,nonce}}));
   const recipientSalt=sdk.Fr.random().toString(),bridgeSecret=sdk.Fr.random().toString();
   const bokSecretHash=(await read(()=>sdk.computeSecretHash(sdk.Fr.fromString(bridgeSecret)))).toString();
   const bokCommitment=(await read(()=>sdk.poseidon2HashWithSeparator([new sdk.Fr(BigInt(n.chainId)),new sdk.Fr(BigInt(s.bokPortal)),sdk.Fr.fromString(bok),new sdk.Fr(BigInt(n.version)),sdk.Fr.fromString(owner),sdk.Fr.fromString(recipientSalt)],0x424b4301))).toString();
   check(Object.keys(values).sort().join()==='asset,bokAmount,bokPoolFee,collateralWei,feeAmount,feePoolFee,gasBudgetWei,privateFeeCap,slippageBps');
   const {gasBudgetWei,privateFeeCap,...amounts}=values;check(typeof privateFeeCap==='string'&&/^[1-9][0-9]{0,76}$/.test(privateFeeCap));
   const quote=await read(()=>sdk.prepareAggregateFunding({scope:s,allocation:{...amounts,collateralSecretHash:collateral.secretHash,feeSecretHash:fee.secretHash.toString(),bokCommitment,bokSecretHash},
    wallet:{address:depositor,chainId:n.chainId,canSendTransaction:true,canSignTypedData:true,gasBudgetWei}},
    {provider:{request:({method,params})=>read(()=>provider.send(method,params))},...(nowSeconds?{nowSeconds}:{})}));
   await read(wallet.guard);
   const bokScope={...n,portal:s.bokPortal,recipient:bok,token:s.bokToken};
   const saved=await read(()=>slot.write(previous,{schemaVersion:1,depositor,nonce,recipientSalt,bridgeSecret,bokScope,intent:null,privateFeeCap,claim:null,previousTxHash:existing?.outcome==='success'?existing.txHash:null}));
   prepared={wallet,quote,saved,nonce};
   // Never return the original secrets or calldata to the renderer.
   return freeze({kind:quote.kind,breakdown:clone(quote.breakdown),deadline:quote.plan.deadline,beneficiary:depositor,router:s.router,
    walletName:wallet.name,privateFeeCap,slippageBps:values.slippageBps,consentNonce:quote.plan.nonce,ethereumNonce:nonce});
  },
  async confirm(){
   const current=prepared;prepared=null;check(current,'QUOTE_REQUIRED');
   const {wallet,quote,nonce}=current;await read(verifyScope);await read(wallet.guard);
   // Signature is requested only after explicit review. It is narrowly bound to
   // the captured portal consent nonce, which is NOT the derivation nonce.
   const consent=await read(()=>wallet.signer.signTypedData(quote.consent.domain,quote.consent.types,quote.consent.value));
   check(ethers.verifyTypedData(quote.consent.domain,quote.consent.types,quote.consent.value,consent).toLowerCase()===wallet.address,'CONSENT');
   await read(wallet.guard);
   const tx=sdk.aggregateFundingTransaction(quote,consent,nowSeconds?{nowSeconds:nowSeconds()}:undefined);
   const expected={kind:'aggregate-funding',routerCodeHash:s.routerCodeHash,collateralPortal:s.collateralPortal,feePortal:s.feePortal,bokPortal:s.bokPortal,privateFpc:s.privateFpc,planHash:tx.planHash};
   const gasRequest={from:tx.from,to:tx.to,data:tx.data,value:BigInt(tx.value),nonce,chainId:BigInt(tx.chainId)};
   const gas=await read(()=>provider.estimateGas(gasRequest)),fees=await read(()=>provider.getFeeData()),price=fees.maxFeePerGas??fees.gasPrice;
   check(typeof gas==='bigint'&&gas>0n&&typeof price==='bigint'&&price>0n&&gas*2n*price<=BigInt(quote.breakdown.gasBudgetWei),'GAS_CHANGED');await read(wallet.guard);
   const j=await sdk.createEthereumJournal({storage,walletSecret,walletSalt,scope:{account:owner,...n,board,portal:s.router,depositor:wallet.address},provider,
    acknowledgeTx:current.saved.value.previousTxHash,signer:{getAddress:()=>wallet.signer.getAddress(),sendTransaction:async request=>{
     await wallet.guard();const fees=await read(()=>provider.getFeeData());await wallet.guard();
     const price=fees.maxFeePerGas??fees.gasPrice;check(typeof price==='bigint'&&price>0n&&typeof request.gasLimit==='bigint'&&request.gasLimit*price<=BigInt(quote.breakdown.gasBudgetWei),'GAS_CHANGED');
     const bounded=fees.maxFeePerGas!==null&&fees.maxFeePerGas!==undefined?{...request,maxFeePerGas:price,maxPriorityFeePerGas:fees.maxPriorityFeePerGas??0n}:{...request,gasPrice:price};
     return wallet.signer.sendTransaction(bounded);
    }},contextGuard:async()=>{await contextGuard();await wallet.guard();}});
   let result;try{result=await read(()=>j.send(async ethereumNonce=>{
    await wallet.guard();check(ethereumNonce===nonce,'NONCE_CHANGED');
    // Validate deadline again after any wallet consent interaction, before both
    // encrypted intent writes and the journal's one broadcast.
    sdk.aggregateFundingTransaction(quote,consent,nowSeconds?{nowSeconds:nowSeconds()}:undefined);
    const intent={from:tx.from,to:tx.to,chainId:tx.chainId,nonce:ethereumNonce,data:tx.data.toLowerCase(),value:tx.value,expected};
    sdk.validateAggregateFundingIntent(intent);
    await slot.write(current.saved,{...current.saved.value,intent});await contextGuard();await wallet.guard();
    return {data:intent.data,value:intent.value,expected};
   }));}catch(error){
    // Only the original journal's explicit first-attempt rollback proves a
    // cancelled/unfunded request was not broadcast. Unknown outcomes retain
    // every byte of the original recovery context.
    const descriptor=error==null?null:Object.getOwnPropertyDescriptor(error,'code');
    if(descriptor&&'value' in descriptor&&['BB_ETH_REQUEST_CANCELLED','BB_ETH_INSUFFICIENT_FUNDS'].includes(descriptor.value)){
     try{const saved=await stored();check(saved.value?.intent?.nonce===nonce,'MISMATCH');await read(()=>slot.write(saved,current.saved.value));}
     catch(cleanup){throw new AggregateError([error,cleanup],'Funding cancellation recovery could not be saved.');}
    }
    throw error;
   }
   original(await stored(),result.request);return receipts(result);
  },
  async inspect(){const saved=await stored();return saved.value?freeze({paymentSaved:!!saved.value.intent,privateFeeCap:saved.value.privateFeeCap,claim:clone(saved.value.claim)}):null;},
  async checkpointClaim(value){
   check(value&&Object.keys(value).sort().join()==='attempted,intentId'&&typeof value.intentId==='string'&&/^0x[0-9a-f]{64}$/.test(value.intentId)&&typeof value.attempted==='boolean');
   const saved=await stored();check(saved.value?.intent,'RECOVERY_REQUIRED');
   if(saved.value.claim)check(saved.value.claim.intentId===value.intentId&&(!saved.value.claim.attempted||value.attempted),'RECOVERY_REQUIRED');
   await read(()=>slot.write(saved,{...saved.value,claim:clone(value)}));
  },
  async recover(){const {result}=await reconcile();return receipts(result);},
  async loadAggregate(txHash){
   check(typeof txHash==='string'&&/^0x[0-9a-f]{64}$/.test(txHash));
   const saved=await stored();let value=saved.value,result;
   if(value?.intent){
    sdk.validateAggregateFundingIntent(value.intent);
    const summary=await read(async()=> (await journal(value.depositor)).inspectSummary());
    let matches=summary?.txHash===txHash;
    if(summary?.txHash===null){
     const tx=await read(()=>provider.getTransaction(txHash));
     matches=!!tx&&tx.hash?.toLowerCase()===txHash&&tx.from?.toLowerCase()===value.intent.from&&Number(tx.nonce)===value.intent.nonce;
    }
    if(matches)result=(await reconcile(txHash)).result;
   }
   if(!result){
    const archive=await archiveSlot(txHash);value=(await read(()=>archive.read())).value;
    if(value===null)return null;
    check(value.txHash===txHash&&value.confirmedRequest,'MISMATCH');original({value},value.confirmedRequest);
    result=await read(()=>sdk.verifyEthereumIntentReceipt(provider,value.confirmedRequest,txHash));check(result?.outcome==='success','PENDING');
    result={...result,request:value.confirmedRequest};
   }
   return freeze({intent:clone(result.request),recipientSalt:value.recipientSalt,bridgeSecret:value.bridgeSecret,bokScope:clone(value.bokScope)});
  },
 });
}

/** One owned bridge/claim step. Existing application and journals remain the
 * authority. Callers schedule only read/reconcile progress after this settles. */
export async function advanceAggregateClaim({application,funding,contextGuard=async()=>{}}){
 const read=async fn=>{await contextGuard();const value=await fn();await contextGuard();return value;};
 const saved=await read(()=>funding.inspect());check(saved?.paymentSaved,'RECOVERY_REQUIRED');
 let next;
 if(saved.claim?.attempted){
  next=await read(()=>application.reconcile(saved.claim.intentId));
  if(next.status==='prepared')return {state:'review-saved',intent:next};
 }else{
  const receipts=await read(()=>funding.recover());
  if(saved.claim)next=await read(()=>application.reconcile(saved.claim.intentId));
  else{
   try{
    const current=await read(()=>application.readAccountStatus());
    if(current.status==='recovering'){
     const action=current.intent?.action;
     const same=(a,b)=>a&&b&&Object.keys(a).sort().join()===Object.keys(b).sort().join()&&Object.keys(b).every(key=>a[key]===b[key]);
     check(action?.type==='claim-deposit'&&['receipt','feeReceipt','bokReceipt'].every(key=>same(action[key],receipts[key])),'RECOVERY_REQUIRED');
     next=current.intent;
    }else next=await read(()=>application.prepare({type:'claim-deposit',...receipts}));
   }catch(error){const d=error==null?null:Object.getOwnPropertyDescriptor(error,'code');if(d&&'value' in d&&d.value==='ROLLING_FUNDING_NOT_READY')return {state:'waiting'};throw error;}
   await read(()=>funding.checkpointClaim({intentId:next.intentId,attempted:next.status!=='prepared'}));
  }
  if(next.status!=='prepared'||typeof next.maximumFee!=='string'||BigInt(next.maximumFee)>BigInt(saved.privateFeeCap))return {state:'review',intent:next};
  await read(()=>funding.checkpointClaim({intentId:next.intentId,attempted:true}));
  next=await read(()=>application.submitPrepared(next.intentId));
 }
 return {state:next.status==='confirmed'?'complete':next.status==='reverted'?'reverted':'pending',intent:next};
}
