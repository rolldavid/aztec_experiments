import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingViewReady} from './wallet-panel.mjs';

test('writing is available with a fresh account before names, moderator or Bok reads',()=>{
 for(const type of ['post','reply','quote','repost','bok']){
  assert.equal(rollingViewReady({view:'action',type,identityAttached:true}),true,type);
  assert.equal(rollingViewReady({view:'action',type,identityAttached:true,namesLoaded:true,cursor:8}),true,type+' while names have another page');
 }
});
test('private settings still require their account-scoped view reads',()=>{
 assert.equal(rollingViewReady({view:'overview'}),false);
 assert.equal(rollingViewReady({view:'overview',moderatorStatus:{authorized:false}}),true);
 assert.equal(rollingViewReady({view:'names'}),false);
 assert.equal(rollingViewReady({view:'names',namesLoaded:true}),true);
 for(const type of ['name','bio','avatar','set-main-policy','withdraw']){
  assert.equal(rollingViewReady({view:'action',type}),false,type);
  assert.equal(rollingViewReady({view:'action',type,actionsLoaded:true}),true,type);
 }
});
test('incomplete name ownership still blocks name-dependent settings',()=>{
 const state={view:'action',type:'bio',identityAttached:true,actionsLoaded:true,namesLoaded:true};
 assert.equal(rollingViewReady({...state,cursor:8}),false);
 assert.equal(rollingViewReady({...state,cursor:null}),true);
 assert.equal(rollingViewReady({...state,cursor:null,namesLoaded:false}),false);
});
