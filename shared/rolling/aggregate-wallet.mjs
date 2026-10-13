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
export async function createAggregateWallet({sdk,ethers,scope,network,board,bok,owner,walletSecret,walletSalt,storage,provider,captureWallet,contextGuard,verifyScope,nowSeconds}){
 const s=freeze(clone(scope)),n=freeze(clone(network));
 check(s&&Object.keys(s).sort().join()===Array.from(AGGREGATE_SCOPE_KEYS).sort().join());
 check(s.chainId===n.chainId&&typeof captureWallet==='function'&&typeof verifyScope==='function');
 const slot=await sdk.createEncryptedJournalSlot({storage,walletSecret,walletSalt,scopeText:aggregateWalletScope(s,n,board,owner),keyDomain:'ROLLING_AGGREGATE_FUNDING_V1'});
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
   prepared=null;await read(verifyScope);
   const previous=await stored();check(!previous.value?.intent,'RECOVERY_REQUIRED');
   const wallet=await read(captureWallet);await read(wallet.guard);
   const depositor=wallet.address;
   const existing=await read(async()=> (await journal(depositor)).inspectSummary());check(existing===null,'RECOVERY_REQUIRED');
   const nonce=await read(()=>provider.getTransactionCount(depositor,'pending'));check(Number.isSafeInteger(nonce)&&nonce>=0);
   const collateral=await read(()=>sdk.deriveBoardDepositSecret({walletSecret,walletSalt,owner,
    scope:{l1ChainId:n.chainId,rollupVersion:n.version,rollupAddress:n.rollup,boardAddress:board,portalAddress:s.collateralPortal,depositor},nonce}));
   const fee=await read(()=>sdk.claimSecrets({walletSecret,owner,record:{chainId:n.chainId,version:n.version,privateFeeAddress:s.privateFpc,sender:depositor,nonce}}));
   const recipientSalt=sdk.Fr.random().toString(),bridgeSecret=sdk.Fr.random().toString();
   const bokSecretHash=(await read(()=>sdk.computeSecretHash(sdk.Fr.fromString(bridgeSecret)))).toString();
   const bokCommitment=(await read(()=>sdk.poseidon2HashWithSeparator([new sdk.Fr(BigInt(n.chainId)),new sdk.Fr(BigInt(s.bokPortal)),sdk.Fr.fromString(bok),new sdk.Fr(BigInt(n.version)),sdk.Fr.fromString(owner),sdk.Fr.fromString(recipientSalt)],0x424b4301))).toString();
   const values=clone(allocation);check(Object.keys(values).sort().join()==='asset,bokAmount,bokPoolFee,collateralWei,feeAmount,feePoolFee,gasBudgetWei,privateFeeCap,slippageBps');
   const {gasBudgetWei,privateFeeCap,...amounts}=values;check(typeof privateFeeCap==='string'&&/^[1-9][0-9]{0,76}$/.test(privateFeeCap));
   const quote=await read(()=>sdk.prepareAggregateFunding({scope:s,allocation:{...amounts,collateralSecretHash:collateral.secretHash,feeSecretHash:fee.secretHash.toString(),bokCommitment,bokSecretHash},
    wallet:{address:depositor,chainId:n.chainId,canSendTransaction:true,canSignTypedData:true,gasBudgetWei}},
    {provider:{request:({method,params})=>read(()=>provider.send(method,params))},...(nowSeconds?{nowSeconds}:{})}));
   await read(wallet.guard);
   const bokScope={...n,portal:s.bokPortal,recipient:bok,token:s.bokToken};
   const saved=await read(()=>slot.write(previous,{schemaVersion:1,depositor,nonce,recipientSalt,bridgeSecret,bokScope,intent:null,privateFeeCap,claim:null}));
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
   const j=await sdk.createEthereumJournal({storage,walletSecret,walletSalt,scope:{account:owner,...n,board,portal:s.router,depositor:wallet.address},provider,
    signer:{getAddress:()=>wallet.signer.getAddress(),sendTransaction:async request=>{
     await wallet.guard();const fees=await read(()=>provider.getFeeData());await wallet.guard();
     const price=fees.maxFeePerGas??fees.gasPrice;check(typeof price==='bigint'&&price>0n&&typeof request.gasLimit==='bigint'&&request.gasLimit*price<=BigInt(quote.breakdown.gasBudgetWei),'GAS_CHANGED');
     const bounded=fees.maxFeePerGas!==null&&fees.maxFeePerGas!==undefined?{...request,maxFeePerGas:price,maxPriorityFeePerGas:fees.maxPriorityFeePerGas??0n}:{...request,gasPrice:price};
     return wallet.signer.sendTransaction(bounded);
    }},contextGuard:async()=>{await contextGuard();await wallet.guard();}});
   const result=await read(()=>j.send(async ethereumNonce=>{
    await wallet.guard();check(ethereumNonce===nonce,'NONCE_CHANGED');
    // Validate deadline again after any wallet consent interaction, before both
    // encrypted intent writes and the journal's one broadcast.
    sdk.aggregateFundingTransaction(quote,consent,nowSeconds?{nowSeconds:nowSeconds()}:undefined);
    const intent={from:tx.from,to:tx.to,chainId:tx.chainId,nonce:ethereumNonce,data:tx.data.toLowerCase(),value:tx.value,expected};
    sdk.validateAggregateFundingIntent(intent);
    await slot.write(current.saved,{...current.saved.value,intent});await contextGuard();await wallet.guard();
    return {data:intent.data,value:intent.value,expected};
   }));
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
  async loadAggregate(txHash){const {saved,result}=await reconcile(txHash);return freeze({intent:clone(result.request),recipientSalt:saved.value.recipientSalt,bridgeSecret:saved.value.bridgeSecret,bokScope:clone(saved.value.bokScope)});},
 });
}
