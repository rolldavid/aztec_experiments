// Thin composition of the existing quote, custody and Ethereum journal APIs.
// Only the owning private session calls this capability, under its account lock.
const fail=code=>Object.assign(Error('Funding is unavailable. Preserve saved recovery records.'),{code:'ROLLING_FUNDING_'+code});
const check=(value,code='INVALID')=>{if(!value)throw fail(code);};
const clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const AGGREGATE_SCOPE_KEYS=Object.freeze(['chainId','router','routerCodeHash','collateralPortal','feePortal','bokPortal','weth','swapRouter','feeToken','bokToken','privateFpc','quoter','quoterCodeHash']);
export const AGGREGATE_USDC_SCOPE_KEYS=Object.freeze([...AGGREGATE_SCOPE_KEYS,'usdcCodeHash','usdcImplementation','usdcImplementationCodeHash','usdcDomain','usdcRelayAddress']);
export function aggregateWalletScope(scope,network,board,owner){
 return JSON.stringify(['ROLLING_AGGREGATE_FUNDING_V1',network.chainId,network.version,network.rollup,board,scope.router,owner,1]);
}
export async function createAggregateWallet({sdk,ethers,scope,network,board,bok,owner,walletSecret,walletSalt,storage,provider,captureWallet,contextGuard,verifyScope,reconcileClaim,claimStore,relay,nowSeconds}){
 const captured=freeze(clone(scope)),n=freeze(clone(network));
 const usdc=captured?.usdcRelayAddress!==undefined;
 check(captured&&Object.keys(captured).sort().join()===Array.from(usdc?AGGREGATE_USDC_SCOPE_KEYS:AGGREGATE_SCOPE_KEYS).sort().join());
 const s=freeze(Object.fromEntries(AGGREGATE_SCOPE_KEYS.map(key=>[key,captured[key]])));
 const usdcScope=usdc?freeze(Object.fromEntries(Object.entries(captured).filter(([key])=>key!=='usdcRelayAddress'))):null;
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
 async function reconcile(txHash,allowReverted=false){
  const saved=await stored();if(saved.value?.kind==='usdc')return reconcileUsdc(saved,txHash,undefined,allowReverted);check(saved.value?.intent,'RECOVERY_REQUIRED');
  const result=await read(async()=> (await journal(saved.value.depositor)).recover({retry:false}));
  original(saved,result.request);if(txHash!==undefined)check(result.txHash===txHash,'MISMATCH');
  check(result.outcome==='success'||allowReverted&&result.outcome==='reverted',result.outcome==='reverted'?'REVERTED':'PENDING');return {saved,result};
 }
 async function terminalPayment(result){
  check(result&&['success','reverted'].includes(result.outcome),'RECOVERY_REQUIRED');
  if(result.outcome==='reverted'){
   const network=await read(()=>provider.getNetwork());check(String(network.chainId)===n.chainId,'MISMATCH');
   if(n.chainId!=='31337'){
    const finalized=await read(()=>provider.getBlock('finalized'));
    check(Number.isSafeInteger(finalized?.number)&&finalized.number>=result.receipt.blockNumber,'PENDING');
   }
  }
  const current=await read(()=>provider.getBlock(result.receipt.blockNumber));
  check(current?.hash?.toLowerCase()===result.receipt.blockHash.toLowerCase(),'MISMATCH');
  return result;
 }
 async function predecessor(value){
  if(!value?.previousTxHash)return null;
  const saved=await read(async()=>(await archiveSlot(value.previousTxHash)).read()),old=saved.value;
  check(old?.txHash===value.previousTxHash&&old.confirmedRequest,'MISMATCH');original(saved,old.confirmedRequest);
  const result=await read(()=>sdk.verifyEthereumIntentReceipt(provider,old.confirmedRequest,old.txHash));
  check(result?.outcome===(old.paymentOutcome??'success'),'RECOVERY_REQUIRED');
  return terminalPayment({...result,request:old.confirmedRequest});
 }
 async function archivePrevious(previous){
  if(!previous.value?.intent&&!previous.value?.relay?.submitted)return predecessor(previous.value);
  const {result}=await reconcile(undefined,true);await terminalPayment(result);
  if(result.outcome==='success'){
   check(previous.value.claim?.attempted&&typeof reconcileClaim==='function','RECOVERY_REQUIRED');
   const claim=await read(()=>reconcileClaim(previous.value.claim.intentId));check(claim.status==='confirmed','RECOVERY_REQUIRED');
  }
  const archive=await archiveSlot(result.txHash),old=await read(()=>archive.read());
  const retained={...previous.value,intent:clone(result.request),confirmedRequest:clone(result.request),txHash:result.txHash,paymentOutcome:result.outcome};
  if(old.value===null)await read(()=>archive.write(old,retained));
  else check(JSON.stringify(old.value.intent)===JSON.stringify(retained.intent),'MISMATCH');
  return result;
 }
 async function prepareUsdc(values){
  check(usdc&&relay&&claimStore&&typeof claimStore.save==='function','UNAVAILABLE');
  check(Object.keys(values).sort().join()==='asset,bokAmount,collateralPoolFee,collateralWei,feeAmount,feePoolFee,privateFeeCap,slippageBps');
  const previous=await stored(),priorPayment=await archivePrevious(previous);
  check(typeof values.privateFeeCap==='string'&&/^[1-9][0-9]{0,76}$/.test(values.privateFeeCap));
  const wallet=await read(captureWallet);await read(wallet.guard);
  const terms=await read(()=>relay.terms());
  check(terms&&Object.keys(terms).sort().join()==='feeUsdc,gasBudgetWei,relayer'&&terms.relayer===captured.usdcRelayAddress,'RELAY_SCOPE');
  for(const key of ['feeUsdc','gasBudgetWei'])check(typeof terms[key]==='string'&&/^[1-9][0-9]{0,77}$/.test(terms[key]),'RELAY_SCOPE');
  const collateralSecret=sdk.Fr.random(),privateFeeSalt=sdk.Fr.random(),recipientSalt=sdk.Fr.random().toString(),bridgeSecret=sdk.Fr.random().toString();
  const collateralSecretHash=(await read(()=>sdk.computeSecretHash(collateralSecret))).toString();
  const feeSecret=await read(()=>sdk.derivePrivateFeeBridgeSecret({salt:privateFeeSalt,owner}));
  const feeSecretHash=(await read(()=>sdk.computeSecretHash(feeSecret))).toString();
  const bokSecretHash=(await read(()=>sdk.computeSecretHash(sdk.Fr.fromString(bridgeSecret)))).toString();
  const bokCommitment=(await read(()=>sdk.poseidon2HashWithSeparator([new sdk.Fr(BigInt(n.chainId)),new sdk.Fr(BigInt(s.bokPortal)),sdk.Fr.fromString(bok),new sdk.Fr(BigInt(n.version)),sdk.Fr.fromString(owner),sdk.Fr.fromString(recipientSalt)],0x424b4301))).toString();
  const {privateFeeCap,...amounts}=values;
  const quote=await read(()=>sdk.prepareAggregateUsdcFunding({scope:usdcScope,allocation:{...amounts,collateralSecretHash,feeSecretHash,bokCommitment,bokSecretHash,authorizationSalt:sdk.Fr.random().toString()},wallet:{address:wallet.address,chainId:n.chainId,canSignTypedData:true},relay:{address:terms.relayer,feeUsdc:terms.feeUsdc,gasBudgetWei:terms.gasBudgetWei}},
   {provider:{request:({method,params})=>read(()=>provider.send(method,params))},...(nowSeconds?{nowSeconds}:{})}));
  await read(wallet.guard);
  // Random collateral custody is persisted using the original beneficiary
  // scope. No relayer or collateral-consent nonce derives any user secret.
  await read(()=>claimStore.save({l1ChainId:n.chainId,rollupVersion:n.version,rollupAddress:n.rollup,boardAddress:board,portalAddress:s.collateralPortal,depositor:wallet.address},{schemaVersion:1,secret:collateralSecret.toString(),secretHash:collateralSecretHash}));
  const saved=await read(()=>slot.write(previous,{schemaVersion:1,kind:'usdc',depositor:wallet.address,recipientSalt,bridgeSecret,bokScope:{...n,portal:s.bokPortal,recipient:bok,token:s.bokToken},privateFeeCap,claim:null,intent:null,previousTxHash:priorPayment?.txHash??null,
   aggregateCustody:{kind:'aggregate-usdc-custody-v1',planHash:quote.planHash,beneficiary:wallet.address,privateFeeSalt:privateFeeSalt.toString()},relay:{planHash:quote.planHash,submitted:false,request:null}}));
  prepared={kind:'usdc',wallet,quote,saved};
  return freeze({kind:quote.kind,breakdown:clone(quote.breakdown),deadline:quote.plan.deadline,beneficiary:wallet.address,router:s.router,walletName:wallet.name,privateFeeCap,slippageBps:values.slippageBps,relayer:terms.relayer,relayGasBudgetWei:terms.gasBudgetWei});
 }
 async function confirmUsdc({wallet,quote,saved}){
  await read(verifyScope);await read(wallet.guard);await predecessor(saved.value);
  const sign=async typed=>{const signature=await read(()=>wallet.signer.signTypedData(typed.domain,typed.types,typed.value));check(ethers.verifyTypedData(typed.domain,typed.types,typed.value,signature).toLowerCase()===wallet.address,'CONSENT');await read(wallet.guard);return signature;};
  const consent=await sign(quote.consent),authorization=await sign(quote.authorization);
  const tx=sdk.aggregateUsdcFundingTransaction(quote,consent,authorization,nowSeconds?{nowSeconds:nowSeconds()}:undefined);
  const request={from:tx.from,to:tx.to,chainId:tx.chainId,data:tx.data.toLowerCase(),value:tx.value,expected:{kind:'aggregate-usdc-funding',routerCodeHash:s.routerCodeHash,collateralPortal:s.collateralPortal,feePortal:s.feePortal,bokPortal:s.bokPortal,privateFpc:s.privateFpc,planHash:tx.planHash}};
  sdk.validateAggregateFundingIntent(request);await read(wallet.guard);await predecessor(saved.value);
  // This checkpoint is deliberately before the sole POST. Even a crash before
  // the request reaches the relay is status-only recovery, never an auto-retry.
  await read(()=>slot.write(saved,{...saved.value,relay:{planHash:tx.planHash,submitted:true,request}}));
  await read(wallet.guard);await read(()=>relay.submit(request.data));
  return {pending:true};
 }
 async function reconcileUsdc(saved,requiredHash,lookupHash,allowReverted=false){
  const value=saved.value;check(value.relay?.submitted&&value.relay.request,'RECOVERY_REQUIRED');
  const request=value.relay.request;sdk.validateAggregateFundingIntent(request);
  let hash=lookupHash??value.relay.transactionHash;
  if(hash===undefined){
   const state=await read(()=>relay.status(value.relay.planHash));
   check(state&&state.scope==='aggregate-funding'&&state.planHash===value.relay.planHash&&['absent','unresolved','succeeded','failed'].includes(state.status)&&typeof state.canonical==='boolean','RELAY_SCOPE');
   hash=state.transactionHash;
  }
  check(typeof hash==='string'&&/^0x[0-9a-f]{64}$/.test(hash),'PENDING');
  if(requiredHash!==undefined)check(requiredHash===hash,'MISMATCH');
  const network=await read(()=>provider.getNetwork());check(String(network.chainId)===n.chainId,'MISMATCH');
  const tx=await read(()=>provider.getTransaction(hash));
  if(lookupHash!==undefined&&(!tx||tx.hash?.toLowerCase()!==hash||tx.from?.toLowerCase()!==request.from||tx.to?.toLowerCase()!==request.to||tx.data?.toLowerCase()!==request.data||String(tx.chainId)!==request.chainId||String(tx.value)!==request.value))return null;
  check(tx&&tx.hash?.toLowerCase()===hash&&Number.isSafeInteger(tx.nonce)&&tx.nonce>=0,'PENDING');
  const intent={...request,nonce:tx.nonce};
  const verified=await read(()=>sdk.verifyEthereumIntentReceipt(provider,intent,hash));
  if(verified&&verified.outcome!=='success'&&!(allowReverted&&verified.outcome==='reverted'))throw fail(verified.outcome==='reverted'?'REVERTED':'MISMATCH');
  check(verified,'PENDING');
  if(value.intent)original(saved,intent);
  if(verified.outcome==='success'&&!allowReverted&&(!value.intent||value.relay.transactionHash!==hash))await read(()=>slot.write(saved,{...value,intent,relay:{...value.relay,transactionHash:hash}}));
  return {saved,result:{...verified,request:intent}};
 }
 return Object.freeze({
  async prepare(allocation){
   const values=clone(allocation);prepared=null;await read(verifyScope);
   if(values.asset==='USDC')return prepareUsdc(values);
   const previous=await stored(),priorPayment=await archivePrevious(previous);
   const wallet=await read(captureWallet);await read(wallet.guard);
   const depositor=wallet.address;
   const existing=await read(async()=> (await journal(depositor)).inspectSummary());check(existing===null||priorPayment&&existing.txHash===priorPayment.txHash&&existing.outcome===priorPayment.outcome,'RECOVERY_REQUIRED');
   let nonce=await read(()=>provider.getTransactionCount(depositor,'pending'));if(priorPayment?.request.from===depositor)nonce=Math.max(nonce,priorPayment.request.nonce+1);check(Number.isSafeInteger(nonce)&&nonce>=0);
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
   const saved=await read(()=>slot.write(previous,{schemaVersion:1,depositor,nonce,recipientSalt,bridgeSecret,bokScope,intent:null,privateFeeCap,claim:null,previousTxHash:existing?.txHash??null}));
   prepared={wallet,quote,saved,nonce};
   // Never return the original secrets or calldata to the renderer.
   return freeze({kind:quote.kind,breakdown:clone(quote.breakdown),deadline:quote.plan.deadline,beneficiary:depositor,router:s.router,
    walletName:wallet.name,privateFeeCap,slippageBps:values.slippageBps,consentNonce:quote.plan.nonce,ethereumNonce:nonce});
  },
  async confirm(){
   const current=prepared;prepared=null;check(current,'QUOTE_REQUIRED');
   if(current.kind==='usdc')return confirmUsdc(current);
   const {wallet,quote,nonce}=current;await read(verifyScope);await read(wallet.guard);await predecessor(current.saved.value);
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
    await wallet.guard();check(ethereumNonce===nonce,'NONCE_CHANGED');await predecessor(current.saved.value);
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
  async inspect(){const saved=await stored();return saved.value?freeze({paymentSaved:!!(saved.value.intent||saved.value.relay?.submitted),privateFeeCap:saved.value.privateFeeCap,claim:clone(saved.value.claim),explicitClaimReview:saved.value.explicitClaimReview===true}):null;},
  async reviewRevertedClaim(){
   const saved=await stored();check(saved.value?.intent&&saved.value.claim&&typeof reconcileClaim==='function','RECOVERY_REQUIRED');
   const previous=await read(()=>reconcileClaim(saved.value.claim.intentId));check(previous.status==='reverted'&&saved.value.claim.attempted||previous.status==='cancelled','RECOVERY_REQUIRED');
   await read(()=>slot.write(saved,{...saved.value,claim:null,explicitClaimReview:true}));
  },
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
   if(value?.kind==='usdc'&&value.relay?.submitted){
    const request=value.relay.request;sdk.validateAggregateFundingIntent(request);
    const tx=await read(()=>provider.getTransaction(txHash));
    const matches=value.relay.transactionHash===txHash||tx?.hash?.toLowerCase()===txHash&&tx.from?.toLowerCase()===request.from&&tx.to?.toLowerCase()===request.to&&tx.data?.toLowerCase()===request.data&&String(tx.chainId)===request.chainId&&String(tx.value)===request.value;
    if(matches){const outcome=await reconcileUsdc(saved,undefined,txHash);if(outcome)result=outcome.result;}
   }else if(value?.intent){
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
   return freeze({intent:clone(result.request),recipientSalt:value.recipientSalt,bridgeSecret:value.bridgeSecret,bokScope:clone(value.bokScope),...(value.aggregateCustody?{aggregateCustody:clone(value.aggregateCustody)}:{})});
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
  let receipts;try{receipts=await read(()=>funding.recover());}catch(error){const d=error==null?null:Object.getOwnPropertyDescriptor(error,'code');if(d&&'value' in d&&d.value==='ROLLING_FUNDING_PENDING')return {state:'waiting'};throw error;}
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
  if(next.status!=='prepared'){
   await read(()=>funding.checkpointClaim({intentId:next.intentId,attempted:true}));
   return {state:next.status==='confirmed'?'complete':next.status==='reverted'?'reverted':next.status==='cancelled'?'cancelled':'pending',intent:next};
  }
  if(saved.explicitClaimReview||typeof next.maximumFee!=='string'||BigInt(next.maximumFee)>BigInt(saved.privateFeeCap))return {state:'review',intent:next};
  await read(()=>funding.checkpointClaim({intentId:next.intentId,attempted:true}));
  next=await read(()=>application.submitPrepared(next.intentId));
 }
 return {state:next.status==='confirmed'?'complete':next.status==='reverted'?'reverted':next.status==='cancelled'?'cancelled':'pending',intent:next};
}
