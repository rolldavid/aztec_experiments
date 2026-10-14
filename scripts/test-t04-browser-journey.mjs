import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {validateJourneySignal,writeJourneySignal,waitJourneyRelease,transactionHashes} from './t04-browser-journey.mjs';
const hash='0x'+'ab'.repeat(32),signal={stage:'exit',transactionHashes:[hash]};
test('rendezvous accepts only fixed stages and bounded unique public transaction identifiers',()=>{
 assert.deepEqual(validateJourneySignal(signal),signal);
 for(const value of [{...signal,stage:'../../outside'},{...signal,secret:'SECRET'},{...signal,transactionHashes:[]},{...signal,transactionHashes:[hash,hash]},{...signal,transactionHashes:['SECRET']}])assert.throws(()=>validateJourneySignal(value));
 assert.deepEqual(transactionHashes(`Transaction hash: ${hash}\nTransaction hash: ${hash}`),[hash]);
});
test('atomic rendezvous cannot overwrite a prior stage or accept an unverified release',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'t04-signal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await writeJourneySignal(dir,signal);await assert.rejects(writeJourneySignal(dir,signal),{code:'EEXIST'});
 await fs.writeFile(path.join(dir,'browser-journey-exit-verified.json'),JSON.stringify({stage:'exit',verified:false}));
 await assert.rejects(waitJourneyRelease(dir,'exit',()=>100));
 await fs.writeFile(path.join(dir,'browser-journey-exit-verified.json'),JSON.stringify({stage:'exit',verified:true}));
 await waitJourneyRelease(dir,'exit',()=>100);
});
test('missing release respects remaining parent budget',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'t04-signal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await assert.rejects(waitJourneyRelease(dir,'exit',()=>0),/T04_RENDEZVOUS_DEADLINE/);
});
test('canonical exit rejects wrong leaf, duplicate leaf, wrong nullifier and ineligible anchor',async()=>{
 const {assertJourneyExit}=await import('./t04-browser-journey-verify.mjs');
 const value=n=>({equals(other){return other.id===n;},id:n}),leaf=value(1),nullifier=value(2);
 const good={effect:{l2ToL1Msgs:[leaf],nullifiers:[nullifier]},leaf,consumedNullifier:nullifier,anchorTimestamp:10n,nextAllowedTime:10n};
 assertJourneyExit(good);
 for(const mutation of [{anchorTimestamp:9n},{effect:{l2ToL1Msgs:[value(3)],nullifiers:[nullifier]}},{effect:{l2ToL1Msgs:[leaf,leaf],nullifiers:[nullifier]}},{effect:{l2ToL1Msgs:[leaf],nullifiers:[value(3)]}}])assert.throws(()=>assertJourneyExit({...good,...mutation}));
});
test('aborted lifecycle terminates a rendezvous even with a clamped legacy time callback',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'t04-signal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const abort=new AbortController(),waiting=waitJourneyRelease(dir,'exit',()=>1,abort.signal);abort.abort();await assert.rejects(waiting,/T04_RENDEZVOUS_ABORTED/);
});
test('browser modes roundtrip strictly across the real handoff boundary',async()=>{
 const {createBrowserHandoff,validateBrowserHandoff,validateBrowserControl,validateBrowserWorkerControl}=await import('./t04-browser-journey.mjs');
 const directory='/private/tmp/t04-fixture',address='0x'+'12'.repeat(20),board='0x'+'01'.repeat(32);
 const publicConfig={schemaVersion:1,network:{nodeUrl:'https://127.0.0.1:1234/rpc/aztec',ethRpcUrl:'https://127.0.0.1:1234/rpc/ethereum',chainId:'31337',rollupVersion:'1',rollupAddress:address},board:{portalAddress:address,contractAddress:board}};
 const base={nodeUrl:'http://127.0.0.1:1235',ethereumUrl:'http://127.0.0.1:1236',publicConfig,backupPath:directory+'/browser-wallet.encrypted.json',ethereumAccount:address,message:'Fixture GUI message'};
 for(const browserEngine of ['chromium','chrome','firefox','webkit'])for(const browserMode of ['post','lifecycle','recovery','withdraw-recovery','funding','performance']){
  const control={ethereumWallet:'disposable',browserEngine,browserMode,origin:'https://127.0.0.1:1234',rpcToken:'a'.repeat(32),backupPassword:'b'.repeat(32)};
  if(['recovery','withdraw-recovery'].includes(browserMode)&&browserEngine!=='chromium'){assert.throws(()=>validateBrowserControl(control));continue;}
  const actual=createBrowserHandoff(base,{directory,browserMode,depositAmount:'0.001',fundingAmount:'1.0'});
  assert.deepEqual(validateBrowserHandoff(JSON.parse(JSON.stringify(actual)),{directory,browserMode}),actual);
  const merged={...actual,...control,timeoutMs:480000};
  assert.deepEqual(validateBrowserWorkerControl(JSON.parse(JSON.stringify(merged)),{directory}),merged);
  for(const mutation of [{...merged,browserMode:'unknown'},{...merged,browserMode:undefined},{...merged,browserJourney:true},{...merged,browserRecovery:false},{...merged,extra:'SECRET'},{...merged,timeoutMs:480001}])assert.throws(()=>validateBrowserWorkerControl(mutation,{directory}));
  for(const mutation of [{...actual,secret:'SECRET'},{...actual,backupPath:'/private/tmp/elsewhere/browser-wallet.encrypted.json'},{...actual,backupPath:directory+'/../escape'},{...actual,nodeUrl:'https://outside.example'}])assert.throws(()=>validateBrowserHandoff(mutation,{directory,browserMode}));
  if(browserMode==='funding'){const missing={...actual};delete missing.fundingAmount;assert.throws(()=>validateBrowserHandoff(missing,{directory,browserMode}));}
 }
 for(const depositAmount of ['0.0','-1.0','1e-3','1.0000000000000000001'])assert.throws(()=>createBrowserHandoff(base,{directory,browserMode:'lifecycle',depositAmount}));
 for(const fundingAmount of ['0.0','-1.0','1e-3'])assert.throws(()=>createBrowserHandoff(base,{directory,browserMode:'funding',depositAmount:'0.001',fundingAmount}));
 const control={ethereumWallet:'disposable',browserEngine:'chromium',browserMode:'lifecycle',origin:'https://127.0.0.1:1234',rpcToken:'a'.repeat(32),backupPassword:'b'.repeat(32)};
 for(const browserEngine of [undefined,'unknown'])assert.throws(()=>validateBrowserControl({...control,browserEngine}));
 assert.throws(()=>validateBrowserControl({...control,arbitrary:'SECRET'}));
});
test('journey diagnostic outputs fixed milestones and allowlisted exception only',async()=>{
 const {readJourneyUiDiagnostic,safeJourneyDriverFailure}=await import('./t04-browser-journey.mjs');
 const previous=globalThis.document;
 try{globalThis.document={getElementById:id=>({textContent:id==='depositStatus'?'Making new L1 deposit Claim secret saved locally SECRET_PRIVATE_KEY':id==='withdrawStatus'?'SECRET_WITNESS':'ETH claimed successfully! SECRET_RPC_URL'}),querySelector:selector=>selector==='#depositStatus .error'?{}:null};
  const result=readJourneyUiDiagnostic();assert.equal(result.depositHasError,true);assert.equal(result.milestones.claimSecretSaved,true);assert.equal(result.milestones.depositConfirmed,false);assert.equal(result.milestones.refundComplete,true);assert.ok(!JSON.stringify(result).includes('SECRET'));
 }finally{globalThis.document=previous;}
 assert.deepEqual(safeJourneyDriverFailure({name:'AssertionError',message:'SECRET',code:'SECRET'},'await-deposit-claim'),{exceptionClass:'AssertionError',substage:'await-deposit-claim'});
 assert.deepEqual(safeJourneyDriverFailure({name:'SECRET'},'SECRET'),{exceptionClass:'OtherError',substage:'other'});
});

test('actual browser journey stops after one deposit action when claim reports an error',async()=>{
 const {driveT04BrowserJourney}=await import('./t04-browser-journey.mjs');
 let clicks=0;
 const page={
  waitForFunction:async()=>{},
  locator:selector=>({waitFor:async()=>{},press:async()=>{},textContent:async()=>selector==='#depositLimits'?'Minimum 0.001 ETH · Maximum 0.01 ETH':selector==='#depositSelection'?'0.001 ETH':'ERROR: claim failed',click:async()=>{assert.equal(selector,'#navNext');clicks++;},count:async()=>clicks?1:0}),
 };
 await assert.rejects(driveT04BrowserJourney({page,directory:'/unused',message:'message',depositAmount:'0.001',remaining:()=>1000,mark(){}}));
 assert.equal(clicks,1);
});

// Persist only bounded public canonical progress, never captured proof/note data.
test('partial canonical progress is ordered, bounded, public-only and copied',async()=>{
 const {validateVerifiedBrowserStages}=await import('./t04-browser-journey.mjs');
 const one={stage:'claim',txHash:hash,blockHash:'0x'+'cd'.repeat(32),blockNumber:'2',canonicalReceipt:true,normalNodeVerification:true};
 const input={schemaVersion:1,stages:[one]},copy=validateVerifiedBrowserStages(input);copy.stages[0].blockNumber='3';assert.equal(input.stages[0].blockNumber,'2');
 for(const value of [{...input,secret:'secret'},{schemaVersion:1,stages:[]},{schemaVersion:1,stages:[{...one,stage:'exit'}]},{schemaVersion:1,stages:[{...one,proof:'secret'}]},{schemaVersion:1,stages:[{...one,canonicalReceipt:false}]},{schemaVersion:1,stages:[{...one,blockNumber:'0'}]},{schemaVersion:1,stages:[one,{...one,stage:'post'}]}])assert.throws(()=>validateVerifiedBrowserStages(value));
});

test('non-Chromium lifecycle scenarios retain one explicit engine and existing bounds',async()=>{
 const {getScenario}=await import('./testing/scenarios.mjs');
 for(const browserEngine of ['firefox','webkit']){
  const scenario=getScenario('browser-'+browserEngine+'-journey');
  assert.equal(scenario.browserEngine,browserEngine);assert.equal(scenario.browser,'lifecycle');
  assert.equal(scenario.deadlineMs,540000);assert.equal(scenario.applicationThreads,1);
 }
});

test('cold funding driver never claims or deposits again after a failed deposit',async()=>{
 const {driveT04BrowserFunding}=await import('./t04-browser-funding.mjs');
 const clicks=[],confirmations=[];
 const page={waitForFunction:async()=>{},
  locator:selector=>({waitFor:async()=>{},press:async()=>{},textContent:async()=>selector==='#depositLimits'?'Minimum 0.001 ETH · Maximum 0.01 ETH':selector==='#depositSelection'?'0.001 ETH':'ERROR: fee failed',click:async()=>clicks.push(selector),count:async()=>clicks.length?1:0})};
 await assert.rejects(driveT04BrowserFunding({page,directory:'/unused',message:'message',depositAmount:'0.001',remaining:()=>1000,mark(){},onSubstage(){},confirmEthereum:async stage=>{confirmations.push(stage);if(stage==='fee-deposit')throw Error('payment failed');}}));
 assert.deepEqual(clicks,['#navNext']);assert.deepEqual(confirmations,['fee-approval','fee-deposit']);
});

test('handoff accepts actual SDK whole-token formatting and rejects invalid amounts',async()=>{
 const {formatEther}=await import('viem');
 const {createBrowserHandoff}=await import('./t04-browser-journey.mjs');
 const directory='/private/tmp/t04-fixture',address='0x'+'12'.repeat(20),board='0x'+'01'.repeat(32);
 const publicConfig={schemaVersion:1,network:{nodeUrl:'https://127.0.0.1:1234/rpc/aztec',ethRpcUrl:'https://127.0.0.1:1234/rpc/ethereum',chainId:'31337',rollupVersion:'1',rollupAddress:address},board:{portalAddress:address,contractAddress:board}};
 const base={nodeUrl:'http://127.0.0.1:1235',ethereumUrl:'http://127.0.0.1:1236',publicConfig,backupPath:directory+'/browser-wallet.encrypted.json',ethereumAccount:address,message:'message'};
 const options={directory,browserMode:'funding',depositAmount:formatEther(10n**15n),fundingAmount:formatEther(10n**18n)};
 assert.equal(createBrowserHandoff(base,options).fundingAmount,'1');
 for(const fundingAmount of ['0','00','01','1.','+1','1e3','1.0000000000000000001'])assert.throws(()=>createBrowserHandoff(base,{...options,fundingAmount}));
});

test('MetaMask is accepted only for explicit Chromium lifecycle and funding',async()=>{
 const {validateBrowserControl}=await import('./t04-browser-journey.mjs');
 const control={ethereumWallet:'metamask',browserEngine:'chromium',browserMode:'lifecycle',origin:'https://127.0.0.1:1234',rpcToken:'a'.repeat(32),backupPassword:'b'.repeat(32)};
 assert.equal(validateBrowserControl(control),control);assert.equal(validateBrowserControl({...control,browserMode:'funding'}).browserMode,'funding');
 for(const mutation of [{ethereumWallet:undefined},{ethereumWallet:'unknown'},{browserEngine:'firefox'},{browserMode:'post'}])assert.throws(()=>validateBrowserControl({...control,...mutation}));
});

test('MetaMask request observation preserves provider result and refuses overlapping transactions',async()=>{
 const {observeMetaMaskTransactions}=await import('./t04-metamask.mjs');
 const prior=globalThis.__testMetaMask;let release,calls=0;
 const tx={method:'eth_sendTransaction',params:[{to:'fixture'}]},provider={request:async request=>{calls++;assert.equal(request,tx);return new Promise(resolve=>{release=resolve;});}};
 try{
  globalThis.__testMetaMask=provider;await observeMetaMaskTransactions({evaluate:fn=>fn()});
  const sending=provider.request(tx);assert.deepEqual(globalThis.__walletTestPending,tx.params);
  await assert.rejects(provider.request(tx),/Overlapping/);assert.equal(calls,1);
  release('canonical-hash');assert.equal(await sending,'canonical-hash');assert.equal(globalThis.__walletTestPending,null);
 }finally{globalThis.__testMetaMask=prior;delete globalThis.__walletTestPending;}
});

test('request guard attributes blank extension iframes without exempting application requests',async()=>{
 const {guardBrowserRequest}=await import('./t04-metamask.mjs');
 for(const [pageUrl,workerUrl,expected] of [['chrome-extension://wallet/home.html',null,'extension'],['https://127.0.0.1:1234/user.html',null,'application'],[null,'https://127.0.0.1:1234/worker.js','application']]){
  let aborted=0,record;
  const request={url:()=> 'https://metamask.github.io/docs',serviceWorker:()=>workerUrl?{url:()=>workerUrl}:null,frame:()=>({url:()=> 'about:blank',page:()=>({url:()=>pageUrl})}),resourceType:()=> 'document',isNavigationRequest:()=>true};
  await guardBrowserRequest({request:()=>request,abort:()=>aborted++,continue:()=>{throw Error('External request must remain blocked');}},{origin:'https://127.0.0.1:1234',extensionWallet:true,onBlocked:r=>{record=r;}});
  assert.equal(aborted,1);assert.equal(record.owner,expected);assert.equal(record.hostname,'metamask.github.io');
 }
});

test('MetaMask confirmation guard binds exact account, chain, target, amount and calldata',async()=>{
 const {assertMetaMaskTransaction}=await import('./t04-metamask.mjs'),{Interface}=await import('ethers');
 const address=n=>'0x'+n.repeat(40),field=n=>'0x'+n.repeat(64);
 const options={account:address('1'),chainId:'0x7a69',tokenAddress:address('2'),feePortalAddress:address('3'),boardPortalAddress:address('4'),privateFeeAddress:field('5'),fundingAmount:'1',collateralAmount:'0.001'};
 const abi=new Interface(['function approve(address,uint256)','function depositToAztecPublic(bytes32,uint256,bytes32)','function deposit(bytes32) payable','function withdraw(uint256,uint256,uint256,bytes32[])']);
 const cases=[['fee-approval',options.tokenAddress,'approve',[options.feePortalAddress,10n**18n],0n],['fee-deposit',options.feePortalAddress,'depositToAztecPublic',[options.privateFeeAddress,10n**18n,field('6')],0n],['deposit',options.boardPortalAddress,'deposit',[field('6')],10n**15n],['refund',options.boardPortalAddress,'withdraw',[1n,1n,0n,[field('6')]],0n]];
 for(const [stage,to,method,args,value] of cases){
  const request=[{from:options.account,to,data:abi.encodeFunctionData(method,args),value:'0x'+value.toString(16)}],input={...options,stage,request};assertMetaMaskTransaction(input);
  assertMetaMaskTransaction({...input,chainId:'0xaa36a7',expectedChainId:11155111n});
  assert.throws(()=>assertMetaMaskTransaction({...input,expectedChainId:11155111n}));
  assert.throws(()=>assertMetaMaskTransaction({...input,chainId:'0x1',expectedChainId:1n}));
  for(const mutation of [{from:address('9')},{to:address('9')},{chainId:'0x1'},{value:'0x'+(value+1n).toString(16)},{data:request[0].data+'00'},{data:'0x00000000'}])assert.throws(()=>assertMetaMaskTransaction({...input,request:[{...request[0],...mutation}]}));
  assert.throws(()=>assertMetaMaskTransaction({...input,chainId:'0x1'}));assert.throws(()=>assertMetaMaskTransaction({...input,stage:'unknown'}));assert.throws(()=>assertMetaMaskTransaction({...input,request:[...request,...request]}));
  if(stage.startsWith('fee-')){
   for(const changed of [[stage==='fee-approval'?address('9'):field('9'),...args.slice(1)],[args[0],1n,...args.slice(2)]])assert.throws(()=>assertMetaMaskTransaction({...input,request:[{...request[0],data:abi.encodeFunctionData(method,changed)}]}));
   if(stage==='fee-deposit')assert.throws(()=>assertMetaMaskTransaction({...input,request:[{...request[0],data:abi.encodeFunctionData(method,[args[0],args[1],field('0')])}]}));
  }
 }
});

test('Phantom mode is explicit signature-only and leaves the original MetaMask mode unchanged',async()=>{
 const {walletExtensionMode}=await import('./t04-phantom.mjs');
 assert.equal(walletExtensionMode([]),'metamask');assert.equal(walletExtensionMode(['--wallet=phantom','--onboarding-only']),'phantom-onboarding');assert.equal(walletExtensionMode(['--wallet=phantom','--signatures-only']),'phantom');
 for(const args of [['--wallet=phantom'],['--wallet=metamask'],['--wallet=phantom','--signatures-only','--send'],['--wallet=phantom','--chain=31337']])assert.throws(()=>walletExtensionMode(args));
});
test('Phantom package pin rejects a modified official package before extracting any files',async()=>{
 const {phantomZip,phantomPackage}=await import('./t04-phantom.mjs');
 const bytes=await fs.readFile(new URL('../'+phantomPackage.archive,import.meta.url));
 assert.equal(phantomZip(bytes).subarray(0,2).toString(),'PK');bytes[bytes.length-1]^=1;assert.throws(()=>phantomZip(bytes));
 assert.throws(()=>phantomZip(Buffer.alloc(12)));
});
test('Phantom exact G04 typed payloads verify distinct domains and reject mutation or a different signer',async()=>{
 const {Wallet}=await import('ethers');
 const {phantomTypedData,assertPhantomSignature}=await import('./t04-phantom.mjs');
 const {collateralConsentTypes,usdcAuthorizationTypes}=await import('../shared/rolling/aggregate-funding.mjs');
 const wallet=Wallet.createRandom(),other=Wallet.createRandom(),inputs={account:wallet.address,portal:Wallet.createRandom().address,router:Wallet.createRandom().address,token:Wallet.createRandom().address,nonce:'0x'+'19'.repeat(32),now:1800000000};
 const data=phantomTypedData(inputs);assert.deepEqual(data.map(x=>x.types),[collateralConsentTypes,usdcAuthorizationTypes]);
 const digests=[];
 for(const item of data){
  assert.equal(item.domain.chainId,11155111);const signature=await wallet.signTypedData(item.domain,item.types,item.value);
  digests.push(assertPhantomSignature(item,signature,wallet.address));
  assert.throws(()=>assertPhantomSignature(item,signature,other.address));
  assert.throws(()=>assertPhantomSignature({...item,domain:{...item.domain,chainId:31337}},signature,wallet.address));
  assert.throws(()=>assertPhantomSignature({...item,value:{...item.value,...(item.value.amount?{amount:'2'}:{value:'2'})}},signature,wallet.address));
 }
 assert.notEqual(digests[0],digests[1]);
 assert.throws(()=>phantomTypedData({...inputs,nonce:'private'}));assert.throws(()=>phantomTypedData({...inputs,now:NaN}));
});
test('Phantom signature-only request admission denies financial sends and arbitrary signing',async()=>{
 const {phantomMethods,assertPhantomMethod}=await import('./t04-phantom.mjs');
 for(const method of phantomMethods)assertPhantomMethod(method);
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','wallet_sendCalls','personal_sign','eth_sign','wallet_addEthereumChain',null])assert.throws(()=>assertPhantomMethod(method));
 assert(Object.isFrozen(phantomMethods));
});
test('Phantom onboarding acknowledges discovered accounts before the password form',async()=>{
 const {onboardPhantom}=await import('./t04-phantom.mjs');
 const calls=[],marks=[];let phase='start',checked=false,termsClicked=false;
 const control=name=>({locator(){return control(name+'-container');},async isChecked(){return checked;},async click(){calls.push(name);if(name==='onboarding-form-terms-of-service-checkbox-container')termsClicked=true;if(name==='onboarding-form-submit-button'){if(phase==='start')phase='accounts';else if(phase==='password'){assert.equal(checked,true);phase='done';}}if(name==='Continue'&&phase==='accounts')phase='password';},async fill(){if(name==='onboarding-form-password-input')assert.equal(phase,'password');},async check(){},async waitFor(){if(name==='Import Accounts')assert.equal(phase,'accounts');}});
 const page={setDefaultTimeout(){},async goto(){},async waitForFunction(){assert.equal(termsClicked,true);checked=true;},getByTestId:control,getByText:control,getByRole(_role,{name}){return control(name);}};
 await onboardPhantom({pages:()=>[],newPage:async()=>page},Array(12).fill('test').join(' '),'disposable-password',value=>marks.push(value),{passwordOnly:true});
 assert(calls.indexOf('Continue')>calls.indexOf('onboarding-form-submit-button'));assert.equal(phase,'done');
 assert.deepEqual(marks,['phantom-import-choice','phantom-import-phrase','phantom-import-accounts','phantom-password','phantom-terms','phantom-password-submit']);
});
for(const defer of [true,false])test('Phantom completion '+(defer?'prefers the offered defer control':'uses only a disposable username and records remote retention'),async()=>{
 const {completePhantomOnboarding}=await import('./t04-phantom.mjs');let phase='username',closed=false,blurred=false;const profiles=[],names=[];
 const control=name=>({async isEnabled(){return blurred;},async press(key){assert.equal(name,'username');assert.equal(key,'Tab');assert.equal(names.length,1);blurred=true;},async isVisible(){return name==='onboarding-create-username-continue'?phase==='username':name==='onboarding-create-username-complete-later'?defer&&phase==='username':name==='username'?phase==='username':name==='onboarding-claiming-username-get-started'?phase==='claimed':name==='Get Started'?phase==='done':false;},async fill(value){names.push(value);},async click(){if(name==='onboarding-create-username-complete-later')phase='done';if(name==='onboarding-create-username-continue')phase='claimed';},async waitFor(){}});
 const page={getByTestId:control,getByPlaceholder:control,getByRole(_,{name}){return control(name);},isClosed:()=>closed,async close(){closed=true;}};
 const wallet={setDefaultTimeout(){},async goto(){},getByTestId:control};
 assert.equal(await completePhantomOnboarding({pages:()=>[],newPage:async()=>wallet},page,()=>{},value=>profiles.push(value)),wallet);
 assert.equal(closed,true);
 if(defer){assert.deepEqual(names,[]);assert.deepEqual(profiles,[]);}else{assert.equal(blurred,true);assert.match(names[0],/^test[0-9a-f]{12}$/);assert.deepEqual(profiles,[{attempted:true,created:false,externalDeletionVerified:false},{attempted:true,created:true,externalDeletionVerified:false}]);}
});


test('MetaMask aggregate admission binds one exact local ETH payment and its gas ceiling',async()=>{
 const {Interface,AbiCoder,keccak256}=await import('ethers');
 const {aggregateFundingAbi}=await import('../shared/rolling/aggregate-funding.mjs');
 const {assertMetaMaskAggregatePayment}=await import('./t04-metamask.mjs');
 const address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),field=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
 const abi=new Interface(aggregateFundingAbi),plan={beneficiary:address(1),collateral:'100',collateralSecretHash:field(8),fee:{amount:'200',maxEth:'20',poolFee:3000},feeSecretHash:field(9),bok:{amount:'300',maxEth:'30',poolFee:3000},bokCommitment:field(10),bokSecretHash:field(11),nonce:'7',deadline:'2000000000'};
 const expected={kind:'aggregate-funding',routerCodeHash:keccak256('0x6001'),collateralPortal:address(3),feePortal:address(4),bokPortal:address(5),privateFpc:field(6),planHash:keccak256(AbiCoder.defaultAbiCoder().encode([abi.getFunction('fund').inputs[0]],[plan]))};
 const intent={from:address(1),to:address(2),chainId:'31337',nonce:2,data:abi.encodeFunctionData('fund',[plan,'0x'+'ab'.repeat(65)]),value:'150',expected};
 const tx={from:intent.from,to:intent.to,chainId:'0x7a69',nonce:'0x2',data:intent.data,value:'0x96',gas:'0x64',maxFeePerGas:'0xa',maxPriorityFeePerGas:'0x1'};
 const input={asset:'ETH',request:[tx],account:intent.from,chainId:'31337',intent,maximumGasWei:'1000'};
 assert.deepEqual(assertMetaMaskAggregatePayment(input),{planHash:expected.planHash,collateral:'100',feeAmount:'200',bokAmount:'300'});
 for(const mutation of [{from:address(9)},{to:address(9)},{chainId:'0x1'},{nonce:'0x7'},{data:tx.data+'00'},{value:'0x97'},{gas:'0x65'},{gas:undefined},{maxPriorityFeePerGas:'0xb'},{gasPrice:'0xa'},{authorizationList:[]}])assert.throws(()=>assertMetaMaskAggregatePayment({...input,request:[{...tx,...mutation}]}));
 for(const mutation of [{asset:'USDC'},{chainId:'1'},{request:[tx,tx]},{maximumGasWei:'999'},{intent:{...intent,expected:{...expected,kind:'aggregate-usdc-funding'}}}])assert.throws(()=>assertMetaMaskAggregatePayment({...input,...mutation}));
});


test('MetaMask aggregate modes require an explicit asset and do not change legacy or Phantom modes',async()=>{
 const {walletExtensionMode}=await import('./t04-phantom.mjs');
 for(const asset of ['ETH','USDC'])assert.equal(walletExtensionMode(['--wallet=metamask','--aggregate-devnet='+asset]),'metamask-aggregate-'+asset);
 for(const args of [['--wallet=metamask'],['--wallet=metamask','--aggregate-devnet=DAI'],['--wallet=metamask','--aggregate-devnet=ETH','--retry'],['--aggregate-devnet=ETH','--wallet=metamask']])assert.throws(()=>walletExtensionMode(args));
 assert.equal(walletExtensionMode([]),'metamask');assert.equal(walletExtensionMode(['--wallet=phantom','--signatures-only']),'phantom');
});

test('MetaMask aggregate launch rejects absent, nonlocal or unpinned deployment and preserves private control ownership',async t=>{
 const {Wallet}=await import('ethers');const {validateMetaMaskAggregateControl,readMetaMaskAggregateControl}=await import('./t04-metamask.mjs');
 const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'t04-aggregate-'));await fs.chmod(directory,0o700);t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const scope={chainId:'31337',router:a(1),routerCodeHash:h(1),collateralPortal:a(2),feePortal:a(3),bokPortal:a(4),weth:a(5),swapRouter:a(6),feeToken:a(7),bokToken:a(8),privateFpc:h(9),quoter:a(10),quoterCodeHash:h(2),usdcRelayAddress:a(11),usdcCodeHash:h(3),usdcImplementation:a(12),usdcImplementationCodeHash:h(4),usdcDomain:{name:'Local USD Coin',version:'2'}};
 const c={schemaVersion:1,asset:'USDC',origin:'http://127.0.0.1:8080',ethereumUrl:'http://127.0.0.1:8545',walletConfig:{proofsEnabled:false,config:{network:{chainId:'31337',ethRpcUrl:'http://127.0.0.1:8545'},board:{portalAddress:a(2)},aggregateFunding:scope}},mnemonic:Wallet.createRandom().mnemonic.phrase,password:'disposable-test-password',recoveryDirectory:directory,runtimeSha256:'a'.repeat(64),allocation:{collateralWei:'1',feeAmount:'2',bokAmount:'3',gasBudgetWei:'4',maximumPaymentWei:'5',maximumUsdc:'6',slippageBps:100}};
 assert.deepEqual(validateMetaMaskAggregateControl(c,'USDC'),c);
 for(const change of [x=>delete x.walletConfig.config.aggregateFunding,x=>x.walletConfig.proofsEnabled=true,x=>x.origin='https://public.example',x=>x.walletConfig.config.network.chainId='1',x=>x.walletConfig.config.aggregateFunding.usdcRelayAddress=undefined,x=>x.walletConfig.config.aggregateFunding.usdcDomain.version='1',x=>x.runtimeSha256='unknown',x=>x.allocation.slippageBps=501,x=>x.allocation.maximumUsdc='0',x=>x.password='short',x=>x.extra=true]){const bad=structuredClone(c);change(bad);assert.throws(()=>validateMetaMaskAggregateControl(bad,'USDC'));}
 assert.throws(()=>readMetaMaskAggregateControl(undefined,'USDC'));
 const file=path.join(directory,'control.json');await fs.writeFile(file,JSON.stringify(c),{mode:0o600});assert.deepEqual(readMetaMaskAggregateControl(file,'USDC'),c);
 await fs.chmod(file,0o644);assert.throws(()=>readMetaMaskAggregateControl(file,'USDC'));await fs.chmod(file,0o600);
 await fs.mkdir(path.join(directory,'extension'));assert.throws(()=>readMetaMaskAggregateControl(file,'USDC'),/new disposable profile/);await fs.rmdir(path.join(directory,'extension'));
 await fs.mkdir(path.join(directory,'profile'));assert.throws(()=>readMetaMaskAggregateControl(file,'USDC'),/new disposable profile/);
 assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{readinessOnly:true}));await fs.mkdir(path.join(directory,'extension'));
 assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{readinessOnly:true}));await fs.writeFile(path.join(directory,'initial-recovery.json'),'{}',{mode:0o600});
 assert.deepEqual(readMetaMaskAggregateControl(file,'USDC',{readinessOnly:true}),c);assert.deepEqual(readMetaMaskAggregateControl(file,'USDC',{continueUnfunded:true}),c);
 assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{readinessOnly:true,continueUnfunded:true}));
 assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{paidRecovery:true}));await fs.writeFile(path.join(directory,'prepared-recovery.json'),'{}',{mode:0o600});assert.deepEqual(readMetaMaskAggregateControl(file,'USDC',{paidRecovery:true}),c);assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{paidRecovery:true,continueUnfunded:true}));assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{paidRecovery:true,readinessOnly:true}));assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{continueUnfunded:true}));await fs.unlink(path.join(directory,'prepared-recovery.json'));assert.throws(()=>readMetaMaskAggregateControl(file,'USDC'));
 await fs.chmod(path.join(directory,'initial-recovery.json'),0o644);assert.throws(()=>readMetaMaskAggregateControl(file,'USDC',{readinessOnly:true}));
});

test('MetaMask aggregate typed consent binds exact local scope, allocation, nonce, expiry and two-signature USDC ordering',async()=>{
 const {assertMetaMaskAggregateTypedData}=await import('./t04-metamask.mjs');const {collateralConsentTypes,usdcAuthorizationTypes}=await import('../shared/rolling/aggregate-funding.mjs');
 const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h='0x'+'01'.repeat(32),account=a(1),scope={router:a(2),collateralPortal:a(3),bokToken:a(4),usdcDomain:{name:'Local USD Coin',version:'2'}},allocation={collateralWei:'100',maximumUsdc:'200'};
 const consent={domain:{name:'RollingCollateral',version:'1',chainId:'31337',verifyingContract:a(3)},types:collateralConsentTypes,primaryType:'DepositFor',message:{beneficiary:account,executor:a(2),amount:'100',secretHash:h,nonce:'7',deadline:'1100'}};
 const input={data:consent,account,scope,allocation,index:0,asset:'ETH',consentNonce:7n,nowSeconds:1000};assert.equal(assertMetaMaskAggregateTypedData(input).value.nonce,'7');
 const {TypedDataEncoder}=await import('ethers');const wire=TypedDataEncoder.getPayload(consent.domain,consent.types,consent.message);assert.equal(assertMetaMaskAggregateTypedData({...input,data:wire}).value.nonce,'7');
 const invalidDomain=structuredClone(wire);invalidDomain.types.EIP712Domain=[];assert.throws(()=>assertMetaMaskAggregateTypedData({...input,data:invalidDomain}));
 for(const change of [d=>d.domain.chainId='1',d=>d.domain.verifyingContract=a(9),d=>d.message.beneficiary=a(9),d=>d.message.executor=a(9),d=>d.message.amount='101',d=>d.message.nonce='0',d=>d.message.deadline='999',d=>d.message.deadline='1121',d=>d.message.extra='secret',d=>d.primaryType='Permit']){const data=structuredClone(consent);change(data);assert.throws(()=>assertMetaMaskAggregateTypedData({...input,data}));}
 const authorization={domain:{name:'Local USD Coin',version:'2',chainId:'31337',verifyingContract:a(4)},types:usdcAuthorizationTypes,primaryType:'ReceiveWithAuthorization',message:{from:account,to:a(2),value:'200',validAfter:'999',validBefore:'1100',nonce:h}};
 assert.equal(assertMetaMaskAggregateTypedData({...input,data:authorization,index:1,asset:'USDC'}).value.value,'200');
 for(const change of [x=>x.asset='ETH',x=>x.index=2,x=>x.data.message.value='201',x=>x.data.message.to=a(9),x=>x.data.domain.name='Other Coin',x=>x.data.message.validAfter='1000']){const bad=structuredClone({...input,data:authorization,index:1,asset:'USDC'});change(bad);assert.throws(()=>assertMetaMaskAggregateTypedData(bad));}
});


test('MetaMask aggregate observer counts every actual configured root RPC send and rejects malformed batches',async()=>{
 const {countMetaMaskAggregateNodeSubmissions:count}=await import('./t04-metamask.mjs');
 const endpoint='http://127.0.0.1:19080/',body=JSON.stringify([{method:'aztec_getBlock'},{method:'aztec_sendTx',params:[{}]},{method:'aztec_sendTx',params:[{}]}]);
 assert.equal(count({url:endpoint,method:'POST',body},endpoint),2);
 assert.equal(count({url:endpoint+'v1/node',method:'POST',body},endpoint),0);
 assert.equal(count({url:endpoint+'v1/node',method:'POST',body},endpoint+'v1/node'),2);
 assert.equal(count({url:'http://127.0.0.1:8545/',method:'POST',body},endpoint),0);
 assert.equal(count({url:endpoint,method:'GET',body:null},endpoint),0);
 for(const malformed of ['{','[]','null','[null]','[{}]',JSON.stringify(Array(101).fill({method:'aztec_getBlock'}))])assert.throws(()=>count({url:endpoint,method:'POST',body:malformed},endpoint));
 assert.throws(()=>count({url:endpoint+'?elsewhere=true',method:'POST',body},endpoint));
});

test('MetaMask retained readiness denies all payment/proof requests without substituting reads',async()=>{
 const {assertMetaMaskReadinessRequest:check}=await import('./t04-metamask.mjs');const endpoint='http://127.0.0.1:18545';
 for(const method of ['eth_chainId','eth_call','eth_getCode','eth_getTransactionReceipt'])check({url:endpoint,method:'POST',body:JSON.stringify({method})},endpoint);
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_signTypedData_v4','anvil_setBalance','personal_sign'])assert.throws(()=>check({url:endpoint,method:'POST',body:JSON.stringify([{method:'eth_chainId'},{method}])},endpoint));
 for(const suffix of ['/api/funding/usdc','/v1/jobs'])assert.throws(()=>check({url:'http://127.0.0.1:8080'+suffix,method:'POST',body:'{}'},endpoint));
 for(const body of ['[]','null','{}','[null]','not json'])assert.throws(()=>check({url:endpoint,method:'POST',body},endpoint));
});

test('MetaMask retained readiness imports the existing encrypted recovery through actual accessible input names only',async()=>{
 const {inspectMetaMaskAggregateReadiness}=await import('./t04-metamask.mjs');const events=[];
 const dialog={getByRole(role,{name}){assert.equal(role,'button');assert(['Unlock','Import recovery','Recover funding'].includes(name));return{isVisible:async()=>true,click:async()=>events.push(name),waitFor:async()=>events.push(name)};},getByLabel(name){assert(['Recovery password','Recovery file'].includes(name));return{fill:async()=>events.push(name),setInputFiles:async p=>{assert.equal(p,'/private/recovery/initial-recovery.json');events.push(name);}};}};
 const page={getByRole(role,options){if(role==='dialog')return dialog;assert.equal(options.name,'Your account');return{click:async()=>events.push('open')};}};
 await inspectMetaMaskAggregateReadiness({page,control:{password:'not-retained-in-report',recoveryDirectory:'/private/recovery'},mark:x=>events.push(x)});
 assert.deepEqual(events,['aggregate-retained-readiness','open','Unlock','Recovery password','Recovery file','Import recovery','Recover funding']);
});

test('MetaMask startup exception requires the pinned extension parent and exact sandboxed cache iframe',async()=>{
 const {isMetaMaskStartupFrameRequest:check}=await import('./t04-metamask.mjs');
 const extensionOrigin='chrome-extension://'+'a'.repeat(32),url='https://metamask.github.io/phishing-warning/v5.1.0/';
 const input={method:'GET',url,parentUrl:extensionOrigin+'/home.html',extensionOrigin,frameSource:url+'#extensionStartup',sandbox:'allow-scripts allow-same-origin'};assert.equal(check(input),true);
 for(const name of ['lockdown-install.js','lockdown-run.js','lockdown-more.js','bundle.js','design-tokens.css','index.css','warning-icon.svg'])assert.equal(check({...input,url:url+name}),true);
 for(const change of [{method:'POST'},{url:url+'?account=x'},{url:url+'../v5.2.0/script.js'},{url:'https://example.com/script.js'},{url:url+'script.js?account=x'},{parentUrl:'http://127.0.0.1:8080/'},{parentUrl:'chrome-extension://'+'b'.repeat(32)+'/home.html'},{frameSource:url+'#hostname=127.0.0.1'},{frameSource:url},{sandbox:'allow-scripts allow-same-origin allow-top-navigation'},{extensionOrigin:'chrome-extension://invalid'},{parentUrl:null}])assert.equal(check({...input,...change}),false);
});

test('MetaMask unfunded continuation rejects any saved journal or prior Ethereum/consent nonce',async()=>{
 const {assertMetaMaskUnfundedContinuation:check}=await import('./t04-metamask.mjs');const input={ethereumNonce:0,consentNonce:0n,emptyRecovery:true};check(input);
 for(const change of [{ethereumNonce:1},{ethereumNonce:'0'},{consentNonce:1n},{consentNonce:0},{emptyRecovery:false},{emptyRecovery:null},{emptyRecovery:undefined}])assert.throws(()=>check({...input,...change}));
});
