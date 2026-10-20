import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {veniceClient} from '../../../rolling-lead-bok/plugins/venice.mjs';
import {veniceMeteredProvider} from '../../../rolling-lead-bok/plugins/venice-metered.mjs';
import {quoteCall,ceilDiv} from '../../../rolling-lead-bok/plugins/metering.mjs';
import {getVeniceDiagnostic} from '../../../rolling-lead-bok/plugins/venice-diagnostics.mjs';

const file=name=>new URL(name,import.meta.url);
const fixture=JSON.parse(await fs.readFile(file('summary-fixture.json')));
const intentFile=file('summary-measurement-intent.json');
try{await fs.lstat(intentFile);throw Error('Existing intent: reconcile; never repeat this call');}catch(e){if(e.code!=='ENOENT')throw e;}
process.loadEnvFile('/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/plugin.env');
const client=veniceClient({privateKey:process.env.VENICE_WALLET_PRIVATE_KEY});
const provider=veniceMeteredProvider({client,autoTopUp:false});
const balance=await client.balance(),available=BigInt(Math.floor(balance.balanceUsd*1e6));
assert(balance.canConsume&&available>=25000n);
const input=fixture.providerInput;
assert.equal(input.maxTokens,1200);
assert(!JSON.stringify(input).includes(fixture.excludedLatest.text));
// The quote receives the real existing credit balance. The separate operation
// ceiling is enforced on its returned maximum before any model request.
const quote=await provider.quote(input,available);
assert(quote.maximum>0n&&quote.maximum<=25000n);
const catalog=await client.json('/api/v1/models');
const main=quoteCall(catalog.data.find(x=>x.id===input.cheaperThan).model_spec,available,input.maxTokens);
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const intent={measurementId:fixture.measurementId,at:new Date().toISOString(),sourceRevision:fixture.sourceRevision,
  phase:'possibly-sent',input,qualityCriteria:fixture.qualityCriteria,quote,mainPricing:main,
  inputSha256:createHash('sha256').update(JSON.stringify(input)).digest('hex'),hardMaximumMicroUsdc:'25000',
  balanceBeforeUsd:balance.balanceUsd,autoTopup:false,maximumProviderCalls:1,distinctFromRequest:'0x216084c2931fe7fe592a24075f7983eda3fb19232200c64319b1f2041757291c'};
await fs.writeFile(intentFile,json(intent),{flag:'wx',mode:0o600});
const started=performance.now();
try{
  const result=await provider.execute(input,quote),durationMs=performance.now()-started;
  // Preserve received output/billing before quality interpretation or any later read.
  await fs.writeFile(file('summary-measurement-received.json'),json({measurementId:fixture.measurementId,receivedAt:new Date().toISOString(),durationMs,result}),{flag:'wx',mode:0o600});
  const b=result.billing;
  const sameTokensMainCost=ceilDiv(BigInt(b.promptTokens-b.cachedTokens)*main.inputPrice+BigInt(b.cachedTokens)*(main.cachePrice??main.inputPrice)+BigInt(b.completionTokens)*main.outputPrice,1000000000n);
  assert(result.charge<=quote.maximum&&result.charge<=25000n);
  const report={measurementId:fixture.measurementId,sourceRevision:fixture.sourceRevision,modelCalls:1,topups:0,
    mainModelCalls:0,chainTransactions:0,inputSha256:intent.inputSha256,latestExcluded:true,durationMs,
    finishReason:result.finishReason,message:result.message,billing:b,quoteMaximumMicroUsdc:String(quote.maximum),
    identicalTokenComparison:{mainModel:input.cheaperThan,promptTokens:b.promptTokens,completionTokens:b.completionTokens,cachedTokens:b.cachedTokens,summaryMicroUsdc:b.charge,mainHypotheticalMicroUsdc:String(sameTokensMainCost)},
    qualityCriteria:fixture.qualityCriteria,limitations:['Single public fixture; no claim of broad model quality or full main-model journey.','Main comparison is arithmetic using current published rates, not a second paid call.']};
  await fs.writeFile(file('summary-measurement-public.json'),json(report),{flag:'wx',mode:0o600});
  console.log(json(report));
}catch(e){
  await fs.writeFile(file('summary-measurement-failure.json'),json({measurementId:fixture.measurementId,phase:'outcome-needs-reconciliation',diagnostic:getVeniceDiagnostic(e),durationMs:performance.now()-started,noReplay:true}),{flag:'wx',mode:0o600});
  throw Error('Measurement needs reconciliation; do not execute this intent again');
}
