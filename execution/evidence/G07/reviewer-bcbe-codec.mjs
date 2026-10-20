import fs from 'node:fs';
import crypto from 'node:crypto';
import {Tx,TxEffect} from '@aztec-labs/stdlib/tx';
const dir='execution/evidence/G06/application-port-b1b77775-d6b7-4fda-b620-d8334c478a24';
const rows=[];
for(const name of ['preference-root-effect.bin','reorg-retained-bookmark-effect.bin','reorg-original-effect.bin','reorg-replacement-effect.bin']){
 const bytes=fs.readFileSync(`${dir}/${name}`),effect=TxEffect.fromBuffer(bytes);
 if(!bytes.equals(effect.toBuffer()))throw Error('roundtrip');
 rows.push({name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),txHash:String(effect.txHash),fee:String(effect.transactionFee),revertCode:String(effect.revertCode),publicLogs:effect.publicLogs.length,notes:effect.noteHashes.length,nullifiers:effect.nullifiers.length});
}
const bytes=fs.readFileSync(`${dir}/reorg-original-tx.bin`);
rows.push({name:'reorg-original-tx.bin',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),decoded:false,reason:'Compressed proof decoding requires BB singleton; not initialized in this pure codec review'});
fs.writeFileSync('execution/evidence/G07/reorg-bcbe-independent-codec.json',JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows));
