import test from 'node:test';
import assert from 'node:assert/strict';
import {mentionsBok,createBokBalanceQuery} from './wallet-panel.mjs';
const deferred=()=>Promise.withResolvers();
test('Bok mention is a whole handle, case insensitive, and not an email or another handle',()=>{
 for(const text of ['@bok help','Hello @BOK!','(@bok)','help\n@bok'])assert.equal(mentionsBok(text),true,text);
 for(const text of ['bok','mail@bok','@boko','@bok_2','@@bok','é@bok','@boké',''])assert.equal(mentionsBok(text),false,text);
});
test('page and composer share one pending and completed account balance without synchronous reads',async()=>{
 const result=deferred();let reads=0;const identity={};
 const query=createBokBalanceQuery({identity:()=>identity,read:()=>{reads++;return result.promise;}});
 const page=query.load(),composer=query.load();assert.equal(page,composer);assert.equal(reads,0);assert.equal(query.snapshot().phase,'loading');
 await Promise.resolve();assert.equal(reads,1);result.resolve({available:true,availableCredit:'250000'});await page;
 assert.equal(query.snapshot().phase,'ready');assert.equal(query.snapshot().value.availableCredit,'250000');await query.load();assert.equal(reads,1);
});
test('account change discards private balance from the previous account',async()=>{
 let identity={};const first=deferred();let reads=0;const query=createBokBalanceQuery({identity:()=>identity,read:()=>++reads===1?first.promise:Promise.resolve({available:true,availableCredit:'7'})});
 const loading=query.load();await Promise.resolve();identity={};assert.equal(query.snapshot().phase,'idle');first.resolve({available:true,availableCredit:'1000000'});await loading;
 assert.equal(query.snapshot().value,null);await query.load();assert.equal(query.snapshot().value.availableCredit,'7');
});
test('invalidation discards in-flight completion; failed optional reads do not retry on renders',async()=>{
 const result=deferred(),identity={};let reads=0;const query=createBokBalanceQuery({identity:()=>identity,read:()=>{reads++;return result.promise;}});
 const loading=query.load();await Promise.resolve();query.invalidate();result.resolve({available:true,availableCredit:'4'});await loading;assert.equal(query.snapshot().phase,'idle');
 const failed=createBokBalanceQuery({identity:()=>identity,read:async()=>{reads++;throw Error('private detail');}});await failed.load();assert.deepEqual(failed.snapshot(),{phase:'error',value:null});await failed.load();assert.equal(reads,2);
});
test('missing, disabled and zero credit remain distinct; no zero substitutes for an error',async()=>{
 const identity={};for(const [result,phase] of [[{available:false},'unavailable'],[{available:true,availableCredit:'0'},'ready'],[null,'error'],[{available:true,availableCredit:'-1'},'error']]){
  const query=createBokBalanceQuery({identity:()=>identity,read:async()=>result});await query.load();assert.equal(query.snapshot().phase,phase);
 }
});

test('explicit refresh retains the last display value and shares one pending read',async()=>{
 const next=deferred(),identity={};let reads=0;
 const query=createBokBalanceQuery({identity:()=>identity,read:()=>++reads===1?{available:true,availableCredit:'3'}:next.promise});
 await query.load();const refreshing=query.load({refresh:true});
 assert.deepEqual(query.snapshot(),{phase:'loading',value:{available:true,availableCredit:'3'}});
 assert.equal(query.load({refresh:true}),refreshing);assert.equal(query.load(),refreshing);
 await Promise.resolve();assert.equal(reads,2);next.resolve({available:true,availableCredit:'7'});await refreshing;
 assert.equal(query.snapshot().value.availableCredit,'7');await query.load();assert.equal(reads,2);
});
