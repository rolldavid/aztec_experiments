import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('shared/rolling/application.mjs','utf8');
const start=source.indexOf('    async readAccountStatus(){'),end=source.indexOf('    async readProfile(',start);
const method=source.slice(start,end).trim().replace(/,$/,'');
const invoke=new Function('session','exclusive','guard','slot','payment','contract','utility','check',`return ({${method}}).readAccountStatus()`);
const rows=[];
for(const mode of ['unclaimed-fee-deposit','claimed-no-collateral','claimed-with-collateral']){
 let depositReads=0;
 const result=await invoke({owner:'synthetic-owner'},fn=>fn(),async()=>{},async()=>({read:async()=>({value:null})}),async()=>{if(mode==='unclaimed-fee-deposit')throw Object.assign(Error('labelled balance failure'),{code:'PRIVATE_FEE_BALANCE_INSUFFICIENT'});return {availableCredit:100n};},async()=>({}),async()=>{depositReads++;return mode==='claimed-with-collateral'?[1n,...Array(9).fill(0n)]:Array(10).fill(0n);},assert);
 assert.equal(result.status,{'unclaimed-fee-deposit':'fee-needed','claimed-no-collateral':'collateral-pending','claimed-with-collateral':'fee-ready'}[mode]);
 assert.equal(depositReads,mode==='unclaimed-fee-deposit'?0:1);rows.push({mode,status:result.status,depositReads});
}
fs.writeFileSync('execution/evidence/G07/notification-5925-readiness-probe.json',JSON.stringify({label:'Exact production method extracted unchanged; labelled payment/utility callbacks, no chain or balance acceptance',rows},null,2)+'\n');
console.log('Three exact production-method readiness branch checks passed; no native modules/services.');
