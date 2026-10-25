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
