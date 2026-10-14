// Test-only wallet UI actions. The caller owns the context and its lifecycle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT} from './toolchain.mjs';
import {Interface,parseEther,formatUnits,Wallet,AbiCoder,keccak256,encodeBytes32String,verifyTypedData,TypedDataEncoder} from 'ethers';
import {aggregateFundingAbi,collateralConsentTypes,usdcAuthorizationTypes} from '../shared/rolling/aggregate-funding.mjs';
import {verifyEthereumIntentReceipt} from '../shared/ethereum-journal.mjs';
import {validateAggregateFundingIntent} from '../shared/rolling/aggregate-recovery.mjs';
export function assertMetaMaskTransaction({stage,request,account,chainId,tokenAddress,feePortalAddress,privateFeeAddress,boardPortalAddress,fundingAmount,collateralAmount,expectedChainId=31337n}){
 assert(Array.isArray(request)&&request.length===1);const tx=request[0];
 assert([31337n,11155111n].includes(BigInt(expectedChainId)),'Only disposable devnet or Sepolia testnet');
 assert.equal(BigInt(chainId),BigInt(expectedChainId));assert(tx.chainId===undefined||BigInt(tx.chainId)===BigInt(expectedChainId));
 assert.equal(tx.from?.toLowerCase(),account.toLowerCase());
 const methods={'fee-approval':'approve','fee-deposit':'depositToAztecPublic',deposit:'deposit',refund:'withdraw'};
 assert(Object.hasOwn(methods,stage));
 const iface=new Interface(['function approve(address,uint256)','function depositToAztecPublic(bytes32,uint256,bytes32)','function deposit(bytes32) payable','function withdraw(uint256,uint256,uint256,bytes32[])']);
 const parsed=iface.parseTransaction({data:tx.data});assert.equal(parsed?.name,methods[stage]);
 assert.equal(iface.encodeFunctionData(parsed.fragment,parsed.args).toLowerCase(),tx.data.toLowerCase());
 const target=stage==='fee-approval'?tokenAddress:stage==='fee-deposit'?feePortalAddress:boardPortalAddress;
 assert.equal(tx.to?.toLowerCase(),target.toLowerCase());
 assert.equal(BigInt(tx.value??0),stage==='deposit'?parseEther(collateralAmount):0n);
 if(stage==='fee-approval'||stage==='fee-deposit'){
  assert.equal(parsed.args[0].toLowerCase(),(stage==='fee-approval'?feePortalAddress:privateFeeAddress).toLowerCase());
  assert.equal(parsed.args[1],parseEther(fundingAmount));
  if(stage==='fee-deposit')assert.notEqual(BigInt(parsed.args[2]),0n);
 }
}
export const metamaskArchive='.build/metamask-13.49.0/metamask-chrome-13.49.0.zip';
export function unpackMetaMask(directory){
 const archive=path.join(ROOT,metamaskArchive);
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'7ba00bfe4fe8b0ffb27be1e8fc06506248f1b888cb4f2e5e5e8b1c37f461f262');
 const extension=path.join(directory,'extension');execFileSync('/usr/bin/unzip',['-q',archive,'-d',extension]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version,'13.49.0.0');return extension;
}
export async function onboardMetaMask(context,mnemonic,password,extensionId,mark,beforeAcceptTerms=async()=>{}){
 for(const page of context.pages())if(page.url().startsWith('chrome-extension://'+extensionId+'/'))await page.close();
 const onboarding=await context.newPage();onboarding.setDefaultTimeout(10000);
 await onboarding.goto('chrome-extension://'+extensionId+'/home.html');
 await beforeAcceptTerms(onboarding);
 mark('wallet-import-method');await onboarding.getByTestId('onboarding-import-wallet').click();
 await onboarding.getByRole('button',{name:'Import using Secret Recovery Phrase',exact:true}).click();
 mark('wallet-import');const words=mnemonic.split(' '),first=onboarding.getByTestId('srp-input-import__srp-note');
 await first.fill(words[0]);await first.press('Space');
 for(let i=1;i<words.length;i++){const input=onboarding.getByTestId('import-srp__srp-word-'+i);await input.fill(words[i]);if(i<words.length-1)await input.press('Space');}
 await onboarding.getByTestId('import-srp-confirm').click();
 mark('wallet-password');await onboarding.getByTestId('create-password-new-input').fill(password);await onboarding.getByTestId('create-password-confirm-input').fill(password);await onboarding.getByTestId('create-password-terms').click();await onboarding.getByTestId('create-password-submit').click();
 mark('wallet-passkey');await onboarding.getByTestId('passkey-maybe-later-button').click();
 mark('wallet-privacy');const analytics=onboarding.getByTestId('metametrics-checkbox');await analytics.waitFor();assert.equal(await analytics.getAttribute('data-checked'),'true');await analytics.click();assert.equal(await analytics.getAttribute('data-checked'),'false');assert.equal(await onboarding.getByTestId('metametrics-data-collection-checkbox').getAttribute('data-checked'),'false');await onboarding.getByTestId('metametrics-i-agree').click();
 mark('wallet-completion');
 // MetaMask opens its own wallet page at completion; reuse that surface rather
 // than loading another copy of the extension UI alongside onboarding.
 await onboarding.getByTestId('onboarding-complete-done').click();
 const deadline=Date.now()+10000;let walletPage;
 while(Date.now()<deadline&&!walletPage) {
  for(const page of context.pages()) {
   if(page!==onboarding&&page.url().startsWith('chrome-extension://'+extensionId+'/home.html')&&await page.getByTestId('account-menu-icon').isVisible()){walletPage=page;break;}
  }
  if(!walletPage)await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(walletPage,'MetaMask did not expose its completed wallet page');
 walletPage.setDefaultTimeout(10000);
 for(const page of context.pages())if(page!==walletPage&&page.url().startsWith('chrome-extension://'+extensionId+'/'))await page.close();
 assert.equal(context.pages().filter(page=>page.url().startsWith('chrome-extension://'+extensionId+'/')).length,1);return walletPage;
}

export async function discoverTestMetaMask(page){
 await page.waitForFunction(()=>window.BillboardWalletProviders?.list().some(wallet=>wallet.name==='MetaMask'));
 await page.evaluate(()=>{globalThis.__testMetaMask=window.BillboardWalletProviders.list().find(wallet=>wallet.name==='MetaMask').provider;});
}

export async function addMetaMaskNetwork({page,walletPage,extensionId,rpcUrl,mark}){
 await page.evaluate(()=>{let changed;globalThis.__localNetworkReady=new Promise((resolve,reject)=>{changed=chain=>chain==='0x7a69'?resolve():reject(Error('Unexpected setup chain'));globalThis.__testMetaMask.on('chainChanged',changed);}).finally(()=>globalThis.__testMetaMask.removeListener('chainChanged',changed));});
 mark('add-network');await Promise.all([
  page.evaluate(()=>globalThis.__localNetworkReady),
  page.evaluate(rpcUrl=>globalThis.__testMetaMask.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'Disposable board test',rpcUrls:[rpcUrl],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}}]}),rpcUrl).then(async()=>{assert.equal(await page.evaluate(()=>globalThis.__testMetaMask.request({method:'eth_chainId'})),'0x7a69');}),
  (async()=>{if(!walletPage.url().startsWith('chrome-extension://'+extensionId+'/sidepanel.html'))await walletPage.goto('chrome-extension://'+extensionId+'/sidepanel.html');mark('network-confirmation-page');await walletPage.getByTestId('parent-selector-confirmation-page').waitFor();mark('network-name');await walletPage.getByText('Disposable board test',{exact:true}).first().waitFor();mark('network-approve');await walletPage.getByTestId('confirm-footer-button').click();})(),
 ]);
}

// Observe the real provider request unchanged. Only the explicit test hook can
// approve it; unexpected or overlapping transactions stop the test.
export async function observeMetaMaskTransactions(page){
 await page.evaluate(()=>{
  const original=globalThis.__testMetaMask.request.bind(globalThis.__testMetaMask);
  globalThis.__walletTestPending=null;globalThis.__walletTestFailure=null;globalThis.__walletTestSubmitted=[];
  globalThis.__testMetaMask.request=async request=>{
   if(request.method!=='eth_sendTransaction')return original(request);
   if(globalThis.__walletTestPending)throw Error('Overlapping wallet transaction');
   globalThis.__walletTestPending=structuredClone(request.params);
   try{const hash=await original(request);globalThis.__walletTestSubmitted.push({hash,request:structuredClone(request.params[0])});return hash;}catch(error){
    const nested=error?.data?.originalError??error;const message=String(nested?.message??'');
    globalThis.__walletTestFailure={code:Number.isSafeInteger(nested?.code)?nested.code:null,nonceTooLow:/nonce too low/i.test(message),replacement:/replacement.*underpriced/i.test(message),insufficientFunds:/insufficient funds/i.test(message),transport:/fetch|network|connection/i.test(message)};throw error;
   }finally{globalThis.__walletTestPending=null;}
  };
 });
}

export function guardBrowserRequest(route,{origin,extensionWallet,onBlocked}){
 const request=route.request(),worker=request.serviceWorker(),frame=worker?null:request.frame(),url=new URL(request.url());
 if(extensionWallet&&(worker?worker.url().startsWith('chrome-extension:'):frame.url().startsWith('chrome-extension:')))return route.continue();
 if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){
  const owner=extensionWallet&&frame?.page().url().startsWith('chrome-extension:')?'extension':'application';
  onBlocked({owner,hostname:url.hostname,resource:request.resourceType(),navigation:request.isNavigationRequest()});
  return route.abort();
 }
 return route.continue();
}

// Actual extension send admission. The caller retains the independently reviewed
// original application intent in RAM; this check never manufactures a wallet reply.
// A USDC user signs only: its payment belongs to the configured relay, not this EOA.
export function assertMetaMaskAggregatePayment({asset,request,account,chainId,intent,maximumGasWei}){
 assert.equal(asset,'ETH','USDC funding must not request a user transaction');
 assert.equal(BigInt(chainId),31337n,'This payment check is local development only');
 assert.equal(intent.expected.kind,'aggregate-funding');
 const plan=validateAggregateFundingIntent(intent);
 assert.equal(intent.chainId,'31337');assert.equal(intent.from,account.toLowerCase());
 assert(Array.isArray(request)&&request.length===1);const tx=request[0];
 assert.equal(tx.from?.toLowerCase(),intent.from);assert.equal(tx.to?.toLowerCase(),intent.to);
 assert.equal(BigInt(tx.chainId),31337n);assert.equal(tx.data?.toLowerCase(),intent.data);
 assert.equal(BigInt(tx.value??'0x0'),BigInt(intent.value));
 assert.equal(BigInt(tx.nonce),BigInt(intent.nonce));
 const gas=BigInt(tx.gas),price=BigInt(tx.maxFeePerGas??tx.gasPrice);
 assert(gas>0n&&price>0n&&BigInt(maximumGasWei)>0n&&gas*price<=BigInt(maximumGasWei));
 if(tx.maxPriorityFeePerGas!==undefined)assert(BigInt(tx.maxPriorityFeePerGas)<=price);
 assert(tx.gasPrice===undefined||tx.maxFeePerGas===undefined,'Ambiguous fee fields');
 assert(tx.authorizationList===undefined&&tx.blobs===undefined&&tx.blobVersionedHashes===undefined,'Unexpected transaction extension');
 return {planHash:intent.expected.planHash,collateral:String(plan.collateral),feeAmount:String(plan.fee.amount),bokAmount:String(plan.bok.amount)};
}


const aggregateInterface=new Interface(aggregateFundingAbi);
const exactKeys=(value,keys)=>assert.deepEqual(Object.keys(value??{}).sort(),keys.slice().sort());
const positive=value=>assert(typeof value==='string'&&/^[1-9][0-9]{0,76}$/.test(value));
const localOrigin=value=>{const u=new URL(value);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert(u.port&&u.origin===value);return value;};
export function validateMetaMaskAggregateControl(value,asset){
 exactKeys(value,['schemaVersion','asset','origin','ethereumUrl','walletConfig','mnemonic','password','recoveryDirectory','allocation','runtimeSha256']);
 assert.match(value.runtimeSha256,/^[a-f0-9]{64}$/);
 assert.equal(value.schemaVersion,1);assert.equal(value.asset,asset);assert(['ETH','USDC'].includes(asset));
 localOrigin(value.origin);localOrigin(value.ethereumUrl);
 assert.equal(value.walletConfig.proofsEnabled,false);assert.equal(value.walletConfig.config.network.chainId,'31337');
 assert.equal(new URL(value.walletConfig.config.network.ethRpcUrl).origin,value.ethereumUrl);
 const scope=value.walletConfig.config.aggregateFunding;assert(scope&&scope.chainId==='31337');
 for(const key of ['router','collateralPortal','feePortal','bokPortal','weth','swapRouter','feeToken','bokToken','quoter'])assert.match(scope[key],/^0x[0-9a-f]{40}$/);
 for(const key of ['routerCodeHash','quoterCodeHash'])assert.match(scope[key],/^0x[0-9a-f]{64}$/);
 assert.equal(scope.collateralPortal,value.walletConfig.config.board.portalAddress);
 if(asset==='USDC'){assert.match(scope.usdcRelayAddress,/^0x[0-9a-f]{40}$/);assert.deepEqual(scope.usdcDomain,{name:'Local USD Coin',version:'2'});for(const k of ['usdcCodeHash','usdcImplementationCodeHash'])assert.match(scope[k],/^0x[0-9a-f]{64}$/);assert.match(scope.usdcImplementation,/^0x[0-9a-f]{40}$/);}
 assert.equal(typeof value.password,'string');assert(value.password.length>=16&&value.password.length<=128);
 assert.equal(typeof value.mnemonic,'string');assert.equal(value.mnemonic.split(' ').length,12);Wallet.fromPhrase(value.mnemonic);
 assert(path.isAbsolute(value.recoveryDirectory));
 exactKeys(value.allocation,['collateralWei','feeAmount','bokAmount','gasBudgetWei','maximumPaymentWei','maximumUsdc','slippageBps']);
 for(const key of ['collateralWei','feeAmount','bokAmount','gasBudgetWei','maximumPaymentWei','maximumUsdc'])positive(value.allocation[key]);
 assert(Number.isSafeInteger(value.allocation.slippageBps)&&value.allocation.slippageBps>=0&&value.allocation.slippageBps<=500);
 return structuredClone(value);
}
export function readMetaMaskAggregateControl(filename,asset,{readinessOnly=false,continueUnfunded=false,paidRecovery=false}={}){
 assert([readinessOnly,continueUnfunded,paidRecovery].filter(Boolean).length<=1);const retained=readinessOnly||continueUnfunded||paidRecovery;
 assert(path.isAbsolute(filename??''),'Required private launch control is absent');
 const stat=fs.lstatSync(filename);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o600&&stat.size<=65536);
 const c=validateMetaMaskAggregateControl(JSON.parse(fs.readFileSync(filename,'utf8')),asset),dir=fs.lstatSync(c.recoveryDirectory);
 assert(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===process.getuid()&&(dir.mode&0o777)===0o700);
 assert.equal(fs.realpathSync(c.recoveryDirectory),c.recoveryDirectory);
 for(const name of ['profile','extension']){const location=path.join(c.recoveryDirectory,name);if(retained){const entry=fs.lstatSync(location);assert(entry.isDirectory()&&!entry.isSymbolicLink()&&entry.uid===process.getuid());}else assert(!fs.existsSync(location),'Use a new disposable profile; never replay an existing funding run');}
 if(retained){const backup=fs.lstatSync(path.join(c.recoveryDirectory,'initial-recovery.json'));assert(backup.isFile()&&!backup.isSymbolicLink()&&backup.uid===process.getuid()&&(backup.mode&0o777)===0o600);}
 if(continueUnfunded)assert(!fs.existsSync(path.join(c.recoveryDirectory,'prepared-recovery.json')),'Prepared funding must use journal recovery, never this continuation');
 if(paidRecovery){const backup=fs.lstatSync(path.join(c.recoveryDirectory,'prepared-recovery.json'));assert(backup.isFile()&&!backup.isSymbolicLink()&&backup.uid===process.getuid()&&(backup.mode&0o777)===0o600);}
 return c;
}
export function assertMetaMaskAggregateTypedData({data,account,scope,allocation,index,asset,consentNonce,nowSeconds}){
 assert(data&&typeof data==='object');const {EIP712Domain,...types}=data.types??{};
 const domain={...data.domain,chainId:BigInt(data.domain?.chainId).toString()},message=data.message;
 assert.equal(domain.chainId,'31337');assert(message&&typeof message==='object');
 if(index===0){
  assert.equal(data.primaryType,'DepositFor');assert.deepEqual(types,collateralConsentTypes);
  assert.deepEqual(domain,{name:'RollingCollateral',version:'1',chainId:'31337',verifyingContract:scope.collateralPortal});
  exactKeys(message,['beneficiary','executor','amount','secretHash','nonce','deadline']);
  assert.equal(message.beneficiary.toLowerCase(),account);assert.equal(message.executor.toLowerCase(),scope.router);
  assert.equal(BigInt(message.amount),BigInt(allocation.collateralWei));assert.equal(BigInt(message.nonce),BigInt(consentNonce));
  assert.match(message.secretHash,/^0x[0-9a-f]{64}$/);assert(BigInt(message.secretHash)>0n);
  assert(BigInt(message.deadline)>BigInt(nowSeconds)&&BigInt(message.deadline)<=BigInt(nowSeconds+120));
 }else{
  assert.equal(asset,'USDC');assert.equal(index,1);assert.equal(data.primaryType,'ReceiveWithAuthorization');assert.deepEqual(types,usdcAuthorizationTypes);
  assert.deepEqual(domain,{name:scope.usdcDomain.name,version:scope.usdcDomain.version,chainId:'31337',verifyingContract:scope.bokToken});
  exactKeys(message,['from','to','value','validAfter','validBefore','nonce']);
  assert.equal(message.from.toLowerCase(),account);assert.equal(message.to.toLowerCase(),scope.router);
  assert(BigInt(message.value)>0n&&BigInt(message.value)<=BigInt(allocation.maximumUsdc));
  assert(BigInt(message.validAfter)<BigInt(nowSeconds)&&BigInt(message.validBefore)>BigInt(nowSeconds)&&BigInt(message.validBefore)<=BigInt(nowSeconds+120));
  assert.match(message.nonce,/^0x[0-9a-f]{64}$/);
 }
 if(EIP712Domain!==undefined)assert.deepEqual(EIP712Domain,TypedDataEncoder.getPayload(domain,types,message).types.EIP712Domain);
 return {domain,types,value:structuredClone(message)};
}

// Bounded driver of the actual served application. Resources belong to the
// existing caller. Only public effects enter the report; signatures stay in RAM.
export async function driveMetaMaskAggregateFunding({context,page,walletPage,control,provider,mark,report,continueUnfunded=false}){
 const c=control,scope=c.walletConfig.config.aggregateFunding,a=c.allocation,account=Wallet.fromPhrase(c.mnemonic).address.toLowerCase();
 const portal=new Interface(['function depositNonces(address) view returns(uint256)']);
 const consentNonce=portal.decodeFunctionResult('depositNonces',await provider.call({to:scope.collateralPortal,data:portal.encodeFunctionData('depositNonces',[account])}))[0];
 assert.equal((await provider.getNetwork()).chainId,31337n);
 const initialBalance=await provider.getBalance(account);if(c.asset==='USDC')assert.equal(initialBalance,0n);else assert(initialBalance>=BigInt(a.maximumPaymentWei)+BigInt(a.gasBudgetWei));
 if(c.asset==='USDC'){const token=new Interface(['function balanceOf(address) view returns(uint256)']);const balance=token.decodeFunctionResult('balanceOf',await provider.call({to:scope.bokToken,data:token.encodeFunctionData('balanceOf',[account])}))[0];assert(balance>=BigInt(a.maximumUsdc));}
 const initialNonce=await provider.getTransactionCount(account,'pending');assert.equal(initialNonce,0,'Fresh disposable user only');
 let intent=null,hash=null,relayPosts=0,userSends=0,confirmedSignatures=0;const signatures=[],typed=[],pending=[],errors=[];
 const remember=error=>{errors.push(error);};
 const inspectData=(data,from)=>{
  const method=c.asset==='ETH'?'fund':'fundUsdc',parsed=aggregateInterface.parseTransaction({data});assert.equal(parsed.name,method);
  const plan=parsed.args[0],planHash=keccak256(AbiCoder.defaultAbiCoder().encode([aggregateInterface.getFunction(method).inputs[0]],[plan]));
  const expected={kind:c.asset==='ETH'?'aggregate-funding':'aggregate-usdc-funding',routerCodeHash:scope.routerCodeHash,collateralPortal:scope.collateralPortal,feePortal:scope.feePortal,bokPortal:scope.bokPortal,privateFpc:scope.privateFpc,planHash};
  const value=c.asset==='ETH'?String(plan.collateral+plan.fee.maxEth+plan.bok.maxEth):'0';
  const record={from,to:scope.router,chainId:'31337',nonce:initialNonce,data:data.toLowerCase(),value,expected};validateAggregateFundingIntent(record);
  assert.equal(plan.beneficiary.toLowerCase(),account);assert.equal(String(c.asset==='ETH'?plan.collateral:plan.collateral.amount),a.collateralWei);
  assert.equal(String(plan.fee.amount),a.feeAmount);assert.equal(String(c.asset==='ETH'?plan.bok.amount:plan.bokAmount),a.bokAmount);
  assert.equal(plan.fee.poolFee,3000n);assert.equal(c.asset==='ETH'?plan.bok.poolFee:plan.collateral.poolFee,3000n);
  assert.equal(String(plan.nonce),String(consentNonce));assert.equal(String(plan.deadline),String(typed[0]?.value.deadline));assert.equal(plan.collateralSecretHash,typed[0]?.value.secretHash);
  assert.equal(parsed.args[1],signatures[0]);
  if(c.asset==='ETH')assert(BigInt(value)<=BigInt(a.maximumPaymentWei));
  else{
   assert.equal(plan.relayer.toLowerCase(),scope.usdcRelayAddress);assert.equal(parsed.args[2],signatures[1]);
   const nonce=keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address','bytes32'],[encodeBytes32String('ROLLING_USDC_FUNDING_V1'),31337,scope.router,planHash]));
   assert.equal(nonce,typed[1]?.value.nonce);assert.equal(BigInt(typed[1].value.value),plan.collateral.maxUsdc+plan.fee.maxUsdc+plan.bokAmount+plan.relayFeeUsdc);
   assert.equal(BigInt(typed[1].value.validAfter),plan.validAfter);assert.equal(BigInt(typed[1].value.validBefore),plan.deadline);
  }
  return record;
 };
 await page.exposeFunction('__aggregateWalletBefore',async request=>{
  try{
   if(request.method==='eth_signTypedData_v4'){
    assert.equal(request.params[0].toLowerCase(),account);assert.equal(typed.length,signatures.length);
    const data=JSON.parse(request.params[1]);typed.push(assertMetaMaskAggregateTypedData({data,account,scope,allocation:a,index:typed.length,asset:c.asset,consentNonce,nowSeconds:Math.floor(Date.now()/1000)}));pending.push('signature');return;
   }
   if(request.method==='eth_sendTransaction'){
    assert.equal(c.asset,'ETH');assert.equal(userSends,0);assert.equal(signatures.length,1);
    const tx=request.params[0];intent=inspectData(tx.data,account);
    assertMetaMaskAggregatePayment({asset:c.asset,request:request.params,account,chainId:'31337',intent,maximumGasWei:a.gasBudgetWei});userSends++;pending.push('payment');return;
   }
   if(request.method==='wallet_requestPermissions'){assert.deepEqual(request.params,[{eth_accounts:{}}]);return;}
   if(request.method==='wallet_switchEthereumChain'){assert.deepEqual(request.params,[{chainId:'0x7a69'}]);return;}
   assert(['eth_chainId','eth_accounts','eth_requestAccounts','eth_blockNumber','eth_getBalance','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_getCode'].includes(request.method),'Unexpected wallet method');
  }catch(error){remember(error);throw Error('Aggregate wallet request rejected');}
 });
 await page.exposeFunction('__aggregateWalletAfter',({method,result})=>{
  try{if(method==='eth_signTypedData_v4'){const t=typed[signatures.length];assert.equal(verifyTypedData(t.domain,t.types,t.value,result).toLowerCase(),account);signatures.push(result);}else if(method==='eth_sendTransaction'){assert.match(result,/^0x[0-9a-f]{64}$/);hash=result;}}catch(error){remember(error);throw Error('Aggregate wallet result rejected');}
 });
 await page.evaluate(()=>{
  const original=__testMetaMask.request.bind(__testMetaMask);
  __testMetaMask.request=async request=>{await __aggregateWalletBefore(structuredClone(request));const result=await original(request);await __aggregateWalletAfter({method:request.method,result});return result;};
 });
 const routeTasks=new Set();
 const relayRoute=async route=>{
  const task=(async()=>{try{
   const req=route.request();if(req.method()!=='POST')return await route.continue();
   assert.equal(c.asset,'USDC');assert.equal(relayPosts,0);assert.equal(signatures.length,2);const body=JSON.parse(req.postData());exactKeys(body,['data']);
   intent=inspectData(body.data,scope.usdcRelayAddress);relayPosts++;await route.continue();
  }catch(error){remember(error);await route.abort();}})();routeTasks.add(task);try{await task;}finally{routeTasks.delete(task);}
 };
 await page.route(c.origin+'/api/funding/usdc',relayRoute);
 try{
  mark('aggregate-private-account');
  if(continueUnfunded){
   assert.equal(consentNonce,0n,'Previously signed funding must be reconciled');
   await inspectMetaMaskAggregateReadiness({page,control:c,mark});
   // Inspect the real encrypted journal export inside the page; only booleans
   // leave it. No backup custody or private account identity is reported.
   const empty=await page.evaluate(async password=>{const envelope=await window.BillboardAccount.exportRecovery(password),payload=await window.BillboardWalletBackup.decrypt(envelope,password);return Array.isArray(payload.journals)&&payload.journals.length===0&&Array.isArray(payload.claims)&&payload.claims.length===0;},c.password);
   assertMetaMaskUnfundedContinuation({ethereumNonce:initialNonce,consentNonce,emptyRecovery:empty});report.retainedUnfundedContinuation=true;
  }else{
   await page.getByRole('button',{name:'Your account',exact:true}).click();const initialDialog=page.getByRole('dialog');
   if(await initialDialog.getByRole('button',{name:'Unlock',exact:true}).isVisible())await initialDialog.getByRole('button',{name:'Unlock',exact:true}).click();await initialDialog.getByLabel('Recovery password',{exact:true}).fill(c.password);
   const [initial]=await Promise.all([page.waitForEvent('download'),initialDialog.getByRole('button',{name:'Create account and download recovery',exact:true}).click()]);
   await saveEncryptedDownload(initial,path.join(c.recoveryDirectory,'initial-recovery.json'));
  }
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Recover funding',exact:true}).click();
  mark('aggregate-connect-wallet');await dialog.getByRole('button',{name:'Connect MetaMask',exact:true}).click();
  await walletPage.getByTestId('confirm-btn').click();
  await dialog.getByText('Funding wallet connected. No payment has been sent.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>walletState.ethAccount)).toLowerCase(),account);
  if(c.asset==='USDC')await dialog.getByLabel('Pay with',{exact:true}).selectOption('USDC');
  for(const [label,value]of [['Posting deposit (ETH)',formatUnits(a.collateralWei,18)],['Network fee credit (fee tokens)',formatUnits(a.feeAmount,18)],['Bok credit (USDC)',formatUnits(a.bokAmount,6)],['Slippage limit (%)',String(a.slippageBps/100)]])await dialog.getByLabel(label,{exact:true}).fill(value);
  if(c.asset==='ETH')await dialog.getByLabel('Maximum Ethereum gas cost (ETH)',{exact:true}).fill(formatUnits(a.gasBudgetWei,18));
  mark('aggregate-review');await dialog.getByRole('button',{name:'Get fresh quote',exact:true}).click();await dialog.getByRole('button',{name:'Confirm funding and private claim',exact:true}).waitFor();
  // Custody written by prepare must be exported before any signature/payment.
  await dialog.getByText('Backup and account security',{exact:true}).click();await dialog.getByLabel('New recovery password',{exact:true}).fill(c.password);
  const [prepared]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download encrypted recovery',exact:true}).click()]);await saveEncryptedDownload(prepared,path.join(c.recoveryDirectory,'prepared-recovery.json'));
  assert.equal(userSends,0);assert.equal(relayPosts,0);assert.equal(signatures.length,0);
  mark('aggregate-confirm');await dialog.getByRole('button',{name:'Confirm funding and private claim',exact:true}).click();
  const expires=Date.now()+60000;
  while(Date.now()<expires){
   if(errors.length)throw errors[0];
   if(pending.length){const next=pending.shift();await walletPage.getByTestId('confirm-footer-button').click();if(next==='signature')confirmedSignatures++;}
   if(c.asset==='USDC'&&intent&&!hash){const response=await fetch(c.origin+'/api/funding/usdc/status?planHash='+intent.expected.planHash,{redirect:'error',signal:AbortSignal.timeout(3000)});assert(response.ok);const status=await response.json();assert.equal(status.planHash,intent.expected.planHash);if(status.transactionHash){assert.match(status.transactionHash,/^0x[0-9a-f]{64}$/);hash=status.transactionHash;}}
   if(hash){
    const tx=await provider.getTransaction(hash),receipt=await provider.getTransactionReceipt(hash);
    if(tx&&receipt){if(c.asset==='USDC')intent={...intent,nonce:tx.nonce};const verified=await verifyEthereumIntentReceipt(provider,intent,hash);assert.equal(verified.outcome,'success');
     assert.equal(signatures.length,c.asset==='ETH'?1:2);assert.equal(confirmedSignatures,signatures.length);assert.equal(userSends,c.asset==='ETH'?1:0);assert.equal(relayPosts,c.asset==='ETH'?0:1);
     if(c.asset==='USDC')assert.equal(await provider.getBalance(account),0n);
     report.aggregate={asset:c.asset,transactionHash:hash,planHash:intent.expected.planHash,userSends,relayPosts,signatures:signatures.length,canonicalEffectsVerified:true,collateral:verified.event.collateral.amount,privateFee:verified.event.privateFee.amount,bok:verified.event.bok.amount,privateClaimQualified:false,postQualified:false};return ()=>{assert.equal(errors.length,0);assert.equal(userSends,c.asset==='ETH'?1:0);assert.equal(relayPosts,c.asset==='ETH'?0:1);assert.equal(signatures.length,c.asset==='ETH'?1:2);};
    }
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Aggregate payment observation deadline');
 }finally{await Promise.allSettled([...routeTasks]);report.aggregateAttempts={userSends,relayPosts,signatures:signatures.length,paymentHashObserved:hash!==null};}
 // The route remains installed until the caller closes the context, so a late
 // duplicate payment cannot escape admission during teardown.
}
async function saveEncryptedDownload(download,destination){
 assert.equal(download.suggestedFilename(),'rolling-chat-encrypted-recovery.json');assert(!fs.existsSync(destination));await download.saveAs(destination);fs.chmodSync(destination,0o600);
 const value=JSON.parse(fs.readFileSync(destination,'utf8'));assert.equal(value.kind,'aztec-billboard-encrypted-wallet');assert.equal(value.schemaVersion,1);assert.equal(value.kdf,'PBKDF2-SHA256');assert.equal(value.iterations,600000);assert.match(value.ciphertext,/^[0-9a-f]+$/);
}


// Count the real configured private RPC endpoint, including root-path services.
// This observes attempts only; no transaction body is returned or retained.
export function countMetaMaskAggregateNodeSubmissions({url,method,body},trustedQueryUrl){
 const expected=new URL(trustedQueryUrl),actual=new URL(url);
 if(method!=='POST'||actual.origin!==expected.origin||actual.pathname!==expected.pathname)return 0;
 assert.equal(actual.search,expected.search);assert.equal(actual.hash,'');
 assert(typeof body==='string'&&Buffer.byteLength(body)<=8*1024*1024);
 const parsed=JSON.parse(body),batch=Array.isArray(parsed)?parsed:[parsed];assert(batch.length>0&&batch.length<=100);
 let count=0;for(const item of batch){assert(item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.method==='string');if(item.method==='aztec_sendTx')count++;}return count;
}

// A retained disposable profile may diagnose initialization without admitting any payment.
export async function inspectMetaMaskAggregateReadiness({page,control,mark}){
 mark('aggregate-retained-readiness');await page.getByRole('button',{name:'Your account',exact:true}).click();const dialog=page.getByRole('dialog');
 const unlock=dialog.getByRole('button',{name:'Unlock',exact:true}),password=dialog.getByLabel('Recovery password',{exact:true});
 // The panel loads lazily. Wait for either supported state; an immediate
 // visibility snapshot can otherwise skip Unlock before it exists. The paid
 // recovery caller may already have loaded the runtime and recovery inputs.
 await unlock.or(password).first().waitFor();
 if(await unlock.isVisible())await unlock.click();
 await password.fill(control.password);
 await dialog.getByLabel('Recovery file',{exact:true}).setInputFiles(path.join(control.recoveryDirectory,'initial-recovery.json'));
 await dialog.getByRole('button',{name:'Import recovery',exact:true}).click();
 await dialog.getByRole('button',{name:'Recover funding',exact:true}).waitFor();
}
export function assertMetaMaskReadinessRequest({url,method,body},ethereumUrl){
 const actual=new URL(url),ethereum=new URL(ethereumUrl);
 if(method!=='POST')return;
 assert(!actual.pathname.startsWith('/api/funding/')&&!actual.pathname.endsWith('/v1/jobs'),'Readiness cannot fund or prove');
 if(actual.origin===ethereum.origin&&actual.pathname===ethereum.pathname){
  const value=JSON.parse(body),batch=Array.isArray(value)?value:[value];assert(batch.length>0&&batch.length<=100);
  for(const item of batch)assert(['eth_chainId','eth_blockNumber','eth_getBalance','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_getCode','eth_getLogs','eth_getStorageAt'].includes(item?.method));
 }
}

// Only the pinned extension's own startup cache iframe may fetch its exact
// warning document and its static assets. Application frames and real warning
// navigation do not match. No other origin, version, or query is admitted.
export function isMetaMaskStartupFrameRequest({method,url,parentUrl,extensionOrigin,frameSource,sandbox}){
 try{
  const expected='https://metamask.github.io/phishing-warning/v5.1.0/';
  const target=new URL(url);
  return method==='GET'&&target.href.startsWith(expected)&&!target.search&&!target.hash&&!target.username&&!target.password&&/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin)&&new URL(parentUrl).protocol==='chrome-extension:'&&('chrome-extension://'+new URL(parentUrl).host)===extensionOrigin&&frameSource===expected+'#extensionStartup'&&sandbox==='allow-scripts allow-same-origin';
 }catch{return false;}
}

export function assertMetaMaskUnfundedContinuation({ethereumNonce,consentNonce,emptyRecovery}){
 assert.equal(ethereumNonce,0,'An existing Ethereum transaction requires journal recovery');
 assert.equal(consentNonce,0n,'An existing consent requires journal recovery');
 assert.equal(emptyRecovery,true,'Retained intent requires original journal recovery');
}

// Existing paid identities use only the application's saved-payment recovery.
// No quote, consent signature, relay submission or Ethereum send is permitted.
export function installMetaMaskPaidRecoveryGuard(){
 const original=__testMetaMask.request.bind(__testMetaMask);
 __testMetaMask.request=async request=>{
  const method=request?.method;
  const permission=request?.params;
  const accountSelection=method==='wallet_requestPermissions'&&Array.isArray(permission)&&permission.length===1&&
   permission[0]!==null&&typeof permission[0]==='object'&&!Array.isArray(permission[0])&&Object.keys(permission[0]).length===1&&
   Object.hasOwn(permission[0],'eth_accounts')&&permission[0].eth_accounts!==null&&typeof permission[0].eth_accounts==='object'&&
   !Array.isArray(permission[0].eth_accounts)&&Object.keys(permission[0].eth_accounts).length===0;
  if(!['eth_accounts','eth_requestAccounts','eth_chainId'].includes(method)&&!accountSelection){
   await window.__paidRecoveryDenied(typeof method==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(method)?method:'unknown');
   throw Error('Paid recovery forbids another wallet operation');
  }
  return original(request);
 };
}

export async function confirmMetaMaskRecoveryAccountSelection(walletPage){
 const confirm=walletPage.getByTestId('confirm-btn');
 await confirm.waitFor();
 assert.equal((await confirm.innerText()).trim(),'Connect');
 await confirm.click();
}

export async function driveMetaMaskPaidRecovery({page,walletPage,control:c,provider,transactionHash,mark,report}){
 assert.match(transactionHash,/^0x[0-9a-f]{64}$/);
 const scope=c.walletConfig.config.aggregateFunding,a=c.allocation,account=Wallet.fromPhrase(c.mnemonic).address.toLowerCase();
 const tx=await provider.getTransaction(transactionHash);assert(tx);assert.equal(tx.to.toLowerCase(),scope.router);
 assert.equal(tx.from.toLowerCase(),c.asset==='ETH'?account:scope.usdcRelayAddress);
 const method=c.asset==='ETH'?'fund':'fundUsdc',parsed=aggregateInterface.parseTransaction({data:tx.data});assert.equal(parsed.name,method);
 const plan=parsed.args[0],planHash=keccak256(AbiCoder.defaultAbiCoder().encode([aggregateInterface.getFunction(method).inputs[0]],[plan]));
 assert.equal(plan.beneficiary.toLowerCase(),account);assert.equal(String(c.asset==='ETH'?plan.collateral:plan.collateral.amount),a.collateralWei);assert.equal(String(plan.fee.amount),a.feeAmount);assert.equal(String(c.asset==='ETH'?plan.bok.amount:plan.bokAmount),a.bokAmount);
 const expected={kind:c.asset==='ETH'?'aggregate-funding':'aggregate-usdc-funding',routerCodeHash:scope.routerCodeHash,collateralPortal:scope.collateralPortal,feePortal:scope.feePortal,bokPortal:scope.bokPortal,privateFpc:scope.privateFpc,planHash};
 const intent={from:tx.from.toLowerCase(),to:scope.router,chainId:'31337',nonce:tx.nonce,data:tx.data.toLowerCase(),value:String(tx.value),expected};validateAggregateFundingIntent(intent);
 const effect=await verifyEthereumIntentReceipt(provider,intent,transactionHash);assert.equal(effect.outcome,'success');
 const nonce=await provider.getTransactionCount(account,'pending');assert.equal(nonce,c.asset==='ETH'?1:0);
 const attempts={forbiddenWalletCalls:0,deniedMethods:[]};report.paidRecoveryAttempts=attempts;
 await page.exposeFunction('__paidRecoveryDenied',method=>{attempts.forbiddenWalletCalls++;if(attempts.deniedMethods.length<16)attempts.deniedMethods.push(typeof method==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(method)?method:'unknown');});
 await page.evaluate(installMetaMaskPaidRecoveryGuard);
 await inspectMetaMaskAggregateReadiness({page,control:c,mark});
 const binding={network:c.walletConfig.config.network,board:c.walletConfig.config.board,router:scope.router,intent,transactionHash};
 assert.equal((await page.evaluate(inspectMetaMaskPaidBinding,binding)).paymentMatches,true,'Retained payment differs from the canonical payment');
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Recover funding',exact:true}).click();
 mark('aggregate-paid-recovery-connect');await dialog.getByRole('button',{name:'Connect MetaMask',exact:true}).click();
 await confirmMetaMaskRecoveryAccountSelection(walletPage);
 await dialog.getByText('Funding wallet connected. No payment has been sent.',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>walletState.ethAccount)).toLowerCase(),account);
 mark('aggregate-paid-private-claim');await dialog.getByRole('button',{name:'Resume saved funding',exact:true}).click();
 // Recovery has the original explicit claim authorization. If it instead needs
 // another review, fail visibly; never infer approval from a missing receipt.
 await dialog.getByText('Funding and the private claim are confirmed. Your posting deposit, network fees and Bok credit are ready.',{exact:true}).waitFor({timeout:80000});
 await dialog.getByText('Private Bok balance: '+formatUnits(a.bokAmount,6).replace(/\.0$/,'')+' USDC-backed credits.',{exact:true}).waitFor();
 const claimed=await page.evaluate(inspectMetaMaskPaidBinding,binding);assert.equal(claimed.paymentMatches,true);assert.equal(claimed.claimMatches,true);assert.equal(claimed.claimConfirmed,true);
 assert.equal(attempts.forbiddenWalletCalls,0);assert.equal(await provider.getTransactionCount(account,'pending'),nonce);
 report.paidRecovery={asset:c.asset,transactionHash,planHash,claimTransactionHash:claimed.claimTxHash,originalCanonicalEffectsVerified:true,readyFromConfirmedPrivateClaim:true,userSends:0,relayPosts:0,signatures:0,postQualified:false};
 return ()=>assert.equal(attempts.forbiddenWalletCalls,0,'A late wallet operation was attempted');
}

// Executed inside the real wallet page. Only booleans and the public claim hash
// leave it; private keys, decrypted custody and user grouping remain in-page.
export async function inspectMetaMaskPaidBinding({network:n,board,router,intent,transactionHash}){
 const sdk=window.__aztec,wallet=window.walletState.aztec,owner=wallet.address.toString(),storage=sdk.createBrowserJournalStorage();
 const open=async(scopeText,keyDomain)=>(await(await sdk.createEncryptedJournalSlot({storage,walletSecret:wallet.secretKey,walletSalt:wallet.salt,scopeText,keyDomain})).read()).value;
 const funding=await open(JSON.stringify(['ROLLING_AGGREGATE_FUNDING_V1',n.chainId,n.rollupVersion,n.rollupAddress,board.contractAddress,router,owner,1]),'ROLLING_AGGREGATE_FUNDING_V1');
 const saved=funding?.intent??funding?.relay?.request;
 const paymentMatches=!!saved&&['from','to','chainId','data','value'].every(k=>saved[k]===intent[k])&&(saved.nonce===undefined||saved.nonce===intent.nonce)&&Object.keys(intent.expected).every(k=>saved.expected?.[k]===intent.expected[k])&&(funding.relay?.transactionHash===undefined||funding.relay.transactionHash===transactionHash);
 const scope=JSON.stringify(['AZTEC_BB_L2_JOURNAL_V1',owner,n.chainId,n.rollupAddress,n.rollupVersion,board.contractAddress,board.portalAddress]);
 const claim=await open(JSON.stringify(['ROLLING_WORKFLOW_V1',scope]),'ROLLING_WORKFLOW_V1');
 const claimMatches=paymentMatches&&!!funding?.claim&&claim?.id===funding.claim.intentId&&claim?.action?.type==='claim-deposit'&&['receipt','feeReceipt','bokReceipt'].every(k=>claim.action[k]?.txHash===transactionHash);
 const claimConfirmed=claimMatches&&claim.status==='confirmed'&&/^0x[0-9a-f]{64}$/.test(claim.txHash);
 return {paymentMatches,claimMatches,claimConfirmed,claimTxHash:claimConfirmed?claim.txHash:null};
}


// The pinned warning iframe registers its own cache worker. Its read-only static
// fetches are separate from both the application and MetaMask background worker.
export function isMetaMaskStartupWorkerRequest({method,url,workerUrl,startupFrameObserved}){
 try{
  const base='https://metamask.github.io/phishing-warning/v5.1.0/',target=new URL(url);
  if(!startupFrameObserved||method!=='GET'||workerUrl!==base+'service-worker.js'||target.origin!=='https://metamask.github.io'||target.hash||target.username||target.password)return false;
  const file=target.pathname.slice('/phishing-warning/v5.1.0/'.length);
  if(target.pathname!=='/phishing-warning/v5.1.0/'+file||!['workbox-e6d70522.js','bundle.js','design-tokens.css','index.css','index.html','lockdown-install.js','lockdown-more.js','lockdown-run.js','metamask-fox.svg','warning-icon.svg'].includes(file))return false;
  return !target.search||/^\?__WB_REVISION__=[0-9a-f]{32}$/.test(target.search);
 }catch{return false;}
}
