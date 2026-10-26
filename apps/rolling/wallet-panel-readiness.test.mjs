import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingViewReady} from './wallet-panel.mjs';

test('writing is available with a fresh account before names, moderator or Bok reads',()=>{
 for(const type of ['post','reply','quote','repost','bok']){
  assert.equal(rollingViewReady({view:'action',type,identityAttached:true}),true,type);
  assert.equal(rollingViewReady({view:'action',type,identityAttached:true,namesLoaded:true,cursor:8}),true,type+' while names have another page');
 }
});
test('navigation waits only for the data required by its editor',()=>{
 for(const type of ['name','withdraw'])assert.equal(rollingViewReady({view:'action',type}),true,type);
 assert.equal(rollingViewReady({view:'overview'}),true);
 assert.equal(rollingViewReady({view:'names'}),false);
 assert.equal(rollingViewReady({view:'names',namesLoaded:true}),true);
 for(const type of ['bio','avatar']){
  assert.equal(rollingViewReady({view:'action',type}),false,type);
  assert.equal(rollingViewReady({view:'action',type,namesLoaded:true}),true,type);
 }
 for(const type of ['set-main-policy','moderate-post','moderate-avatar','reject-subboard','transfer-moderator']){
  assert.equal(rollingViewReady({view:'action',type}),false,type);
  assert.equal(rollingViewReady({view:'action',type,moderatorStatus:{authorized:false}}),true,type);
 }
});
test('loaded owned names permit editing while more names remain available',()=>{
 for(const type of ['bio','avatar']){
  const state={view:'action',type,namesLoaded:true};
  assert.equal(rollingViewReady({...state,cursor:8}),true);
  assert.equal(rollingViewReady({...state,cursor:null}),true);
  assert.equal(rollingViewReady({...state,cursor:null,namesLoaded:false}),false);
 }
});
