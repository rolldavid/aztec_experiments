import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {TxEffect} from '@aztec-labs/stdlib/tx';
const receipt=JSON.parse(fs.readFileSync(new URL('./application-c43a9133-8fe1-4c9c-b2bb-0fab4f2a2d11.json',import.meta.url)));
const dir=new URL('../G06/application-port-82436a0c-fc60-410d-85b6-b59b372e092a/',import.meta.url);
const effects=[];
for(const row of receipt.worker.node.bridge.transactions){
 const bytes=fs.readFileSync(new URL(row.action+'-effect.bin',dir));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.effectSha256);
 const effect=TxEffect.fromBuffer(bytes);assert.deepEqual(effect.toBuffer(),bytes);
 assert.equal(effect.txHash.toString(),row.txHash);assert.equal(effect.transactionFee.toBigInt(),BigInt(row.transactionFee));
 effects.push({action:row.action,bytes:bytes.length,exactRoundTrip:true,txHashMatches:true,feeMatches:true});
}
console.log(JSON.stringify({classification:'Actual installed SDK TxEffect codec; no hashing/proving/chain queries; persisted canonical effects only.',effects}));
