import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeModerationHealth,moderationFailure} from './health.mjs';
const status={checkpoint:{number:3,hash:'private-marker'},lastSuccessfulIngestAt:1000000,health:{retryableErrors:0,unresolvedSigning:0,manualSigningFences:0,awaitingFinality:0,expiredObligations:0,manualAttention:0,unsignedPending:0,earliestUnsignedDeadline:null}};
test('health output allowlists counts and omits all extra fields',()=>{const r=summarizeModerationHealth({status:{...status,secret:'SECRET',health:{...status.health,token:'SECRET'}},now:1000000});assert.equal(r.severity,'ok');assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('private-marker'));});
test('ingestion age is measured and missing or future state fails closed',()=>{assert.equal(summarizeModerationHealth({status,now:1100000}).alerts[0].code,'INGESTION_STALE');assert.equal(summarizeModerationHealth({status:{...status,lastSuccessfulIngestAt:null},now:1000000}).alerts[0].code,'INGESTION_UNKNOWN');assert.deepEqual(summarizeModerationHealth({status,now:1}),moderationFailure());});
test('deadline boundary and included-awaiting-finality distinguish warning from failure',()=>{const s={...status,health:{...status.health,unsignedPending:1,earliestUnsignedDeadline:'1300'}};assert.equal(summarizeModerationHealth({status:s,now:1000000}).alerts[0].code,'DEADLINE_APPROACHING');s.health.earliestUnsignedDeadline='1301';assert.equal(summarizeModerationHealth({status:s,now:1000000}).severity,'ok');s.health.awaitingFinality=1;assert.equal(summarizeModerationHealth({status:s,now:1000000}).alerts[0].code,'AWAITING_FINALITY');});
test('known diagnostics are fixed classifications; arbitrary message/code never escape',async()=>{
 const {safeModerationDiagnostic}=await import('./health.mjs');
 assert.equal(safeModerationDiagnostic({code:'INVALID_VERDICT',message:'SECRET'}),'INVALID_VERDICT');
 assert.equal(safeModerationDiagnostic({code:'SECRET',message:'SECRET'}),'MODERATION_FAILED');
 assert.equal(safeModerationDiagnostic({message:'Historical policy unavailable'}),'POLICY_UNAVAILABLE');
 assert.equal(safeModerationDiagnostic({message:'Invalid historical policy SECRET'}),'MODERATION_FAILED');
 assert.ok(!JSON.stringify(moderationFailure({code:'SECRET',message:'SECRET'})).includes('SECRET'));
});

import {safeModerationErrorLocation} from './health.mjs';
test('cycle diagnostics retain fixed code and source locations without messages, function names or absolute paths',()=>{
 const error=Object.assign(Error('SECRET signed request'),{code:'ROLLING_PUBLIC_CACHE_MISMATCH'});
 error.stack='Error: SECRET\n    at secretFunction (file:///private/SECRET/shared/rolling/public-index.mjs:448:13)\n    at secretOther (/private/SECRET/censor-daemon/rolling-adapter.mjs:48:4)\n    at ignored (/private/SECRET/other.mjs:1:2)';
 const value=safeModerationErrorLocation(error);assert.deepEqual(value,{name:'Error',code:'ROLLING_PUBLIC_CACHE_MISMATCH',frames:[{source:'shared/rolling/public-index.mjs',line:448,column:13},{source:'censor-daemon/rolling-adapter.mjs',line:48,column:4}]});assert(!JSON.stringify(value).includes('SECRET'));assert(!JSON.stringify(value).includes('secretFunction'));
});
test('cycle diagnostics ignore custom accessors, arbitrary classifications and nonnative errors',()=>{
 let reads=0;const error=Error('SECRET');Object.defineProperty(error,'stack',{get(){reads++;throw Error('SECRET');}});Object.defineProperty(error,'code',{get(){reads++;throw Error('SECRET');}});
 assert.deepEqual(safeModerationErrorLocation(error),{name:'Error',code:'unknown',frames:[]});assert.equal(reads,0);
 assert.deepEqual(safeModerationErrorLocation({get stack(){throw Error('SECRET');}}),{name:'unknown',code:'unknown',frames:[]});
 const unknown=Object.assign(Error('SECRET'),{code:'SECRET',name:'SECRET'});unknown.stack='Error: SECRET';assert.deepEqual(safeModerationErrorLocation(unknown),{name:'unknown',code:'unknown',frames:[]});
});
test('cycle diagnostics handle the native V8 stack getter and bound repeated allowed frames',()=>{
 const error=Error('SECRET');assert.equal(safeModerationErrorLocation(error).name,'Error');
 error.stack='Error: SECRET\n'+Array(20).fill(' at fn (/private/censor-daemon/daemon.mjs:123:4)').join('\n');assert.equal(safeModerationErrorLocation(error).frames.length,4);
});
