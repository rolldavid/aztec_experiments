// Labelled projection fixtures; no chain, proof or HTTP runtime acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRollingProjection} from '../../shared/rolling/public-projection.mjs';
import {assertCanonicalSocialViews,assertSocialHTTPView} from './rolling-public-acceptance.mjs';
function fixture(){
 const event={type:'PostPublished',payload:{schema:'1',id:'4',record:{name_id:'0',subboard:'0',parent:'0',root:'4',kind:'1',reference:'0',content_digest:'1'},main_policy_version:'1',local_policy_version:'0',message:['0x'+Buffer.from('A').toString('hex').padEnd(62,'0'),...Array(31).fill('0')],length:'1',timestamp:'1'},position:{blockNumber:'1',blockHash:'mock-block',txHash:'mock-tx',txIndexWithinBlock:'0',logIndexWithinTx:'0'}};
 const policy={type:'MainPolicyPublished',payload:{version:'1',rules:Array(32).fill('0'),length:'0'},position:{...event.position,blockNumber:'0'}};
 const projection=createRollingProjection({isValidatedEvent:e=>e===event||e===policy});projection.stage([policy,event]).apply();
 const expected={posts:[projection.post('4')],nextCursor:null,names:{},boards:{}};
 return {projection,rows:[{route:'feed',parameters:{limit:100},expected:structuredClone(expected)},{route:'thread',parameters:{root:'4',limit:100},expected:structuredClone(expected)},{route:'post',parameters:{id:'4'},expected:{post:projection.post('4'),names:{},boards:{}}}]};
}
test('real projection feed/thread shape is distinct from enriched HTTP shape',()=>{
 const {projection,rows}=fixture();assert.equal(projection.feed({limit:100}).names,undefined);
 assertCanonicalSocialViews(projection,rows);
});
test('canonical reconstruction rejects altered post or continuation cursor',()=>{
 for(const change of [rows=>rows[0].expected.posts[0].text='changed',rows=>rows[1].expected.nextCursor='unexpected',rows=>rows[2].expected.post.record.reference='9']){
  const {projection,rows}=fixture();change(rows);assert.throws(()=>assertCanonicalSocialViews(projection,rows));
 }
});
test('full HTTP acceptance still requires every name and board enrichment field',()=>{
 const {rows}=fixture();for(const {expected}of rows){
  assertSocialHTTPView({...structuredClone(expected),checkpoint:{number:1}},expected);
  for(const key of ['names','boards']){
   const missing=structuredClone(expected);delete missing[key];assert.throws(()=>assertSocialHTTPView(missing,expected));
   const altered=structuredClone(expected);altered[key]={unexpected:{id:'9'}};assert.throws(()=>assertSocialHTTPView(altered,expected));
  }
 }
});
