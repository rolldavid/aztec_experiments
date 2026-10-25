import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRollingFundingOpening} from './funding-session.mjs';
const tick=()=>new Promise(setImmediate),defer=()=>Promise.withResolvers();
const empty={status:'fee-needed',depositIds:[]};
function fixture(status=empty){const seen=[],native=defer(),allocation=defer(),rate=defer();let valid=true;
 const options={asset:'ETH',guard:async()=>{assert(valid,'owner changed');},readStatus:async()=>{seen.push('status');return native.promise;},readAllocation:async()=>{seen.push('allocation');return allocation.promise;},readRate:async()=>{seen.push('rate');return rate.promise;},prepareQuote:async input=>{seen.push('quote');assert.deepEqual(input,{amount:'200'});return {breakdown:{maximumTotalWei:'1000000000000000000'}};}};
 return {options,seen,native,allocation,rate,invalidate:()=>valid=false,finish(){native.resolve(status);allocation.resolve({amount:'200'});rate.resolve({price:2000n,decimals:0});}};
}
test('normal opening starts all three reads, waits for real native account, then prepares once',async()=>{
 const f=fixture(),pending=prepareRollingFundingOpening(f.options);await tick();assert.deepEqual(f.seen,['status','allocation','rate']);f.allocation.resolve({amount:'200'});f.rate.resolve({price:2000n,decimals:0});await tick();assert(!f.seen.includes('quote'));f.native.resolve(empty);const result=await pending;assert.equal(result.status,empty);assert.equal(result.quote.usdEstimate,'2000.00');assert.equal(f.seen.filter(x=>x==='quote').length,1);
});
for(const status of [{status:'fee-ready',depositIds:['1']},{status:'fee-needed',depositIds:['1']},{status:'recovering',intent:{intentId:'saved'}}, {status:'locked'}])test('normal opening never creates signup custody for '+status.status+JSON.stringify(status.depositIds),async()=>{const f=fixture(status),p=prepareRollingFundingOpening(f.options);f.finish();assert.deepEqual(await p,{status});assert(!f.seen.includes('quote'));});
for(const failed of ['native','allocation'])test('opening '+failed+' failure drains independent siblings',async()=>{
 const f=fixture(),original=Error(failed);let done=false;const p=prepareRollingFundingOpening(f.options).then(v=>(done=true,v),e=>{done=true;throw e;});p.catch(()=>{});await tick();f[failed].reject(original);await tick();assert.equal(done,false);assert(!f.seen.includes('quote'));f.finish();if(failed==='native')await assert.rejects(p,e=>e===original);else assert.equal((await p).quoteError,original);
});
test('funded account survives irrelevant public quote failure without creating custody',async()=>{const f=fixture({status:'fee-ready',depositIds:['1']}),p=prepareRollingFundingOpening(f.options);f.allocation.reject(Error('gas'));f.finish();assert.equal((await p).status.status,'fee-ready');assert(!f.seen.includes('quote'));});
test('account replacement after public reads prevents quote preparation',async()=>{const f=fixture(),p=prepareRollingFundingOpening(f.options);await tick();f.invalidate();f.finish();await assert.rejects(p,/owner changed/);assert(!f.seen.includes('quote'));});
test('quote failure keeps actual connected status and preserves the original error',async()=>{const f=fixture(),error=Object.assign(Error('private'),{code:'AGGREGATE_LIQUIDITY_UNAVAILABLE'});f.options.prepareQuote=async()=>{throw error;};const p=prepareRollingFundingOpening(f.options);f.finish();assert.deepEqual(await p,{status:empty,quoteError:error});});

function overlapFixture(status=empty){
 const f=fixture(status),construction=defer(),token=Object.freeze({});
 f.options.constructQuote=async allocation=>{f.seen.push('construct');assert.deepEqual(allocation,{amount:'200'});return construction.promise;};
 f.options.installQuote=async actual=>{f.seen.push('install');assert.equal(actual,token);return {breakdown:{maximumTotalWei:'1000000000000000000'}};};
 return {...f,construction,token};
}
test('opening overlaps readonly construction with held native status and installs only after both',async()=>{
 const f=overlapFixture(),pending=prepareRollingFundingOpening(f.options);await tick();f.allocation.resolve({amount:'200'});f.rate.resolve({price:2000n,decimals:0});await tick();
 assert(f.seen.includes('construct'));assert(!f.seen.includes('install'));f.construction.resolve(f.token);await tick();assert(!f.seen.includes('install'));
 f.native.resolve(empty);assert.equal((await pending).quote.usdEstimate,'2000.00');assert.equal(f.seen.filter(x=>x==='install').length,1);assert(!f.seen.includes('quote'));
});
for(const status of [{status:'fee-ready',depositIds:['1']},{status:'recovering',intent:{intentId:'saved'}}])test('opening discards readonly construction for native '+status.status,async()=>{
 const f=overlapFixture(status),pending=prepareRollingFundingOpening(f.options);f.finish();f.construction.resolve(f.token);
 assert.deepEqual(await pending,{status});assert(f.seen.includes('construct'));assert(!f.seen.includes('install'));assert(!f.seen.includes('quote'));
});
for(const failed of ['native','construction'])test('opening '+failed+' failure drains the held other branch and never installs',async()=>{
 const f=overlapFixture(),error=Error(failed);let settled=false;const pending=prepareRollingFundingOpening(f.options).finally(()=>{settled=true;});pending.catch(()=>{});
 f.allocation.resolve({amount:'200'});f.rate.resolve(null);await tick();f[failed].reject(error);await tick();assert.equal(settled,false);assert(!f.seen.includes('install'));
 if(failed==='native'){f.construction.resolve(f.token);await assert.rejects(pending,e=>e===error);}else{f.native.resolve(empty);assert.equal((await pending).quoteError,error);}
 assert(!f.seen.includes('install'));
});
test('opening owner replacement after construction prevents install',async()=>{
 const f=overlapFixture(),pending=prepareRollingFundingOpening(f.options);f.allocation.resolve({amount:'200'});f.rate.resolve(null);f.construction.resolve(f.token);await tick();f.invalidate();f.native.resolve(empty);
 await assert.rejects(pending,/owner changed/);assert(!f.seen.includes('install'));
});
test('opening saved-custody fallback performs original preparation only after native eligibility',async()=>{
 const f=overlapFixture(),pending=prepareRollingFundingOpening(f.options);f.allocation.resolve({amount:'200'});f.rate.resolve(null);f.construction.resolve(null);await tick();assert(!f.seen.includes('quote'));
 f.native.resolve(empty);assert((await pending).quote);assert.equal(f.seen.filter(x=>x==='quote').length,1);assert(!f.seen.includes('install'));
});

// Actual context and worker modules, with labelled native/session/provider gates.
// No browser/native startup is claimed by this transport/lifecycle fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
if(typeof vm.SourceTextModule!=='function'){
 test('actual worker and context opening boundaries use the VM module fixture',()=>{
  const child=spawnSync(process.execPath,[...process.execArgv,'--experimental-vm-modules','--test','--test-name-pattern=early opening context|actual worker overlaps',import.meta.filename],{encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,child.stdout+child.stderr);
 });
}else{
const repository=path.resolve(import.meta.dirname,'../..');
const sourceFile=relative=>fs.readFile(path.join(repository,relative),'utf8');
async function openingContextFixture(){
 const quote=defer(),rate=defer(),events=[];let valid=true,installed=0;
 const owner='0x'+'1'.repeat(64),node={},sdk={isTrustedPrivateNode:x=>x===node,normalizePrivateFeeGasSettings:()=>({gasSettings:{getFeeLimit:()=>({toBigInt:()=>100n})}}),createBrowserJournalStorage:()=>({})};
 const config={network:{chainId:'11155111',rollupVersion:'1',rollupAddress:'rollup'},board:{contractAddress:'board'},privateFee:{gasSettings:{}},aggregateFunding:{chainId:'11155111',collateralPortal:'portal',privateFpc:'fpc'}};
 const deployment={portal:'portal',board:{address:{toString:()=> 'board'}},privateFee:{address:{toString:()=> 'fpc'}},proofsEnabled:true,network:{chainId:'11155111',version:'1',rollup:'rollup'},economics:{minDeposit:'1'}};
 const quoteToken={},provider={async getBlock(){events.push('rate');await rate.promise;throw Error('No display rate');}};
 const locks={async request(name,options,work){events.push('lease-enter');try{return await work({name});}finally{events.push('lease-exit');}}};
 const context=vm.createContext({console,structuredClone,Promise,performance});
 const module=new vm.SourceTextModule(await sourceFile('shared/rolling/funding-session.mjs'),{context});
 await module.link(async name=>{
  const exports=name==='./deployment.mjs'?{assertRollingDeploymentPreparation(){},prepareRollingDeployment:async()=>({deployment}),readRollingDeploymentRegistration:async()=>({deployment})}:{
   createAggregateWallet:async()=>({async prepareReadOnly(){events.push('quote-start');await quote.promise;events.push('quote-end');return quoteToken;},async installPreparedQuote(token){assert.equal(token,quoteToken);events.push('install');installed++;return {breakdown:{maximumTotalWei:'1'}};},async prepare(){throw Error('Unexpected custody preparation');}}),
   starterFundingAllocation:async()=>({asset:'ETH',feeAmount:'200'}),timeFundingPreparation:(_observer,_step,read)=>read(),
  };
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});
 });await module.evaluate();
 const funding=await module.namespace.createRollingFundingSession({sdk,ethers:{Interface:class{}},config,account:{secretKey:'secret',salt:'salt',address:owner},node,deploymentPreparation:{},boardArtifact:{},privateFeeArtifact:{},contextGuard:async()=>{if(!valid)throw Object.assign(Error('Changed owner'),{code:'ROLLING_CONTEXT_CHANGED'});},captureWallet:async()=>{},provider,locks});
 return {funding,quote,rate,events,owner,installed:()=>installed,invalidate:()=>{valid=false;},finish(){quote.resolve();rate.resolve();}};
}
test('early opening context binds the token to its issuing context and asset and consumes it once',async()=>{
 const f=await openingContextFixture(),other=await openingContextFixture(),token=f.funding.beginOpening({asset:'ETH'});await tick();assert(f.events.includes('quote-start'));assert.equal(f.installed(),0);
 await assert.rejects(other.funding.prepareOpening(async()=>empty,{asset:'ETH'},token),e=>e.code==='ROLLING_CONTEXT_CHANGED');
 await assert.rejects(f.funding.prepareOpening(async()=>empty,{asset:'USDC'},token),e=>e.code==='ROLLING_CONTEXT_CHANGED');
 await assert.rejects(f.funding.prepareOpening(async()=>empty,{asset:'ETH'},structuredClone(token)),e=>e.code==='ROLLING_CONTEXT_CHANGED');
 f.finish();const result=await f.funding.prepareOpening(async()=>empty,{asset:'ETH'},token);assert(result.quote);assert.equal(f.installed(),1);
 await assert.rejects(f.funding.prepareOpening(async()=>empty,{asset:'ETH'},token),e=>e.code==='ROLLING_CONTEXT_CHANGED');
});
for(const mode of ['discard','status','owner','funded'])test('early opening context drains '+mode+' without installing custody',async()=>{
 const f=await openingContextFixture(),token=f.funding.beginOpening({asset:'ETH'}),error=Error('Native failed');await tick();let finished=false;
 if(mode==='owner')f.invalidate();
 const pending=(mode==='discard'?f.funding.discardOpening(token,error):f.funding.prepareOpening(async()=>{if(mode==='status')throw error;return mode==='funded'?{status:'fee-ready',depositIds:['1']}:empty;},{asset:'ETH'},token)).finally(()=>{finished=true;});pending.catch(()=>{});
 await tick();assert.equal(finished,false);f.quote.resolve();await tick();assert.equal(finished,false);f.rate.resolve();
 if(mode==='status')await assert.rejects(pending,e=>e===error);else if(mode==='owner')await assert.rejects(pending,e=>e.code==='ROLLING_CONTEXT_CHANGED');else await pending;
 assert.equal(f.installed(),0);
});
async function workerOpeningFixture({nativeFailure=false}={}){
 const f=await openingContextFixture(),native=defer(),status=defer(),sent=[];let handler,statusCalls=0;
 const context=vm.createContext({console,performance,structuredClone,AbortController,URL,Promise,__aztec:{},ethers:{},BillboardPrivateFeeRouting:{},postMessage:value=>sent.push(value),addEventListener:(_name,fn)=>{handler=fn;}});
 const source=await sourceFile('apps/rolling/wallet-worker-entry.mjs');
 const module=new vm.SourceTextModule(source+'\nexport function prime(f,ready){account={};funding=f;opening=Promise.resolve();settings={config:{}};creating=ready.then(value=>(session=value));creating.catch(()=>{});}',{context});
 const stubs={'../../shared/rolling/account-preparation.mjs':{prepareRollingAccount(){}},'./performance.mjs':{beginRollingMeasure:()=>()=>{},observeRollingWorkerPerformance:()=>()=>{}},'./wallet-session.mjs':{createRollingWalletSession(){throw Error('Already constructing');},createRollingRefundSession(){}},'../../shared/rolling/deployment.mjs':{createRollingDeploymentPreparation(){},prepareRollingDeployment(){}},'../../shared/rolling/funding-session.mjs':{createRollingFundingSession(){},verifyRollingAggregateScope(){}}};
 await module.link(async name=>{if(name==='./wallet-worker-protocol.mjs')return new vm.SourceTextModule(await sourceFile('apps/rolling/wallet-worker-protocol.mjs'),{context});const exports=stubs[name];assert(exports,name);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});});await module.evaluate();
 let busy=false;
 // Extract the actual session's forwarding property; locked holds the account
 // operation until real context status+installation completes.
 const sessionSource=await sourceFile('apps/rolling/wallet-session.mjs');
 const property=sessionSource.slice(sessionSource.indexOf('prepareOpening:fundingContext?'),sessionSource.indexOf(',preparePostingState,observeIncluded:'));
 const sessionModule=new vm.SourceTextModule('export function make(fundingContext,locked,synchronized){return {'+property+'};}',{context});await sessionModule.link(()=>{throw Error('No imports');});await sessionModule.evaluate();
 const active=sessionModule.namespace.make(f.funding,async work=>{assert(!busy);busy=true;try{return await work();}finally{busy=false;}},{async readAccountStatus(){statusCalls++;return status.promise;}});
 Object.defineProperty(active,'busy',{get:()=>busy});active.close=async()=>f.events.push('native-close');
 module.namespace.prime(f.funding,native.promise);
 const send=(id,method,args=[])=>handler({data:{type:'call',id,method,args}}),result=id=>sent.find(x=>x.type==='result'&&x.id===id);
 send(1,'prepareOpening',[{asset:'ETH'}]);await tick();assert(f.events.includes('quote-start'));assert.equal(statusCalls,0);assert.equal(f.installed(),0);
 send(2,'prepareOpening',[{asset:'ETH'}]);send(3,'close');send(4,'funding.prepareStarter',[{asset:'ETH'}]);await tick();
 for(const id of [2,3,4])assert.equal(result(id)?.error?.code,'ROLLING_BUSY');assert.equal(f.events.filter(x=>x==='quote-start').length,1);
 if(nativeFailure)native.reject(Error('Native failed'));else native.resolve(active);
 await tick();assert.equal(result(1),undefined);if(!nativeFailure){assert.equal(statusCalls,1);assert.equal(busy,true);status.resolve(empty);}
 f.quote.resolve();await tick();assert.equal(result(1),undefined);f.rate.resolve();await tick();await tick();
 assert(result(1));if(nativeFailure){assert(result(1).error);assert.equal(f.installed(),0);}else{assert(result(1).value.quote);assert.equal(f.installed(),1);assert.equal(busy,false);}
 send(5,'close');await tick();await tick();assert.equal(result(5)?.value,true);
}
for(const nativeFailure of [false,true])test('actual worker overlaps opening reads, blocks duplicates and drains '+(nativeFailure?'failed':'successful')+' native startup',()=>workerOpeningFixture({nativeFailure}));

}
