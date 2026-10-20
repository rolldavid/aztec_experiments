import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createAztecNodeClient} from '../../../shared/aztec-node-client.mjs';
import {createRollingEventDecoder} from '../../../shared/rolling/public-events.mjs';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {TxHash} from '@aztec-labs/stdlib/tx';
const read=p=>readFile(p,'utf8').then(JSON.parse),base='.build/g09-social-notification-completion',out='.build/reviewer-evidence/current-notification-completion';
const worker=await read(base+'/continuation-1/result.json'),board=await read(base+'/attempt-1/follow-board-receipt.json'),reconcile=await read(base+'/reconcile-1/result.json');assert.equal(worker.source,'0fd3683e3f036748e9f5b618a097c50f3c5443bc');
const config=await read('../rolling-lead-bok/.build/rolling-devnet-cce1b42c-0818-453c-852f-4f6274419bff/rolling-public.json');
const node=createAztecNodeClient(config.nodeUrl),info=await node.getNodeInfo();assert.equal(info.realProofs,false);assert.equal(info.l1ChainId,31337);
const scope={...config.scope};delete scope.bok;const decoder=await createRollingEventDecoder({artifact:loadContractArtifact(await read(config.artifactPath)),scope});
const rows=[board,{label:'follow-name',...reconcile.observed,events:[]},...worker.transactions],observations=[];
for(const row of rows){
 const txHash=TxHash.fromString(row.txHash),receipt=await node.getTxReceipt(txHash),block=await node.getBlock(row.blockNumber,{includeTransactions:true});assert(receipt.isMined()&&receipt.hasExecutionSucceeded());assert.equal(receipt.blockNumber,row.blockNumber);assert.equal(String(receipt.blockHash),row.blockHash);assert.equal(String(block.hash),row.blockHash);
 const effect=await node.getTxEffect(txHash),body=block.body.txEffects.find(e=>String(e.txHash)===row.txHash);assert(body);assert.equal(String(effect.l2BlockHash),row.blockHash);assert(body.toBuffer().equals(effect.data.toBuffer()));
 const events=await decoder.decodeTransaction(node,row.txHash,{block});assert.deepEqual(events,[]);assert.equal(String((await node.getBlock(row.blockNumber)).hash),row.blockHash);
 observations.push({label:row.label,txHash:row.txHash,blockNumber:row.blockNumber,blockHash:row.blockHash,observedStatus:receipt.status,canonicalEffectVerified:true,decodedRollingPublicEvents:0,publicLogs:body.publicLogs.length,privateLogs:body.privateLogs.length,noteHashes:body.noteHashes.length,nullifiers:body.nullifiers.length});
}
const checkpoint=await node.getBlock('checkpointed');assert(checkpoint.number>=93);
await writeFile(path.join(out,'observations.json'),JSON.stringify({source:worker.source,status:'passed',nativeProofs:false,observations,checkpoint:{number:checkpoint.number,hash:String(checkpoint.hash)},privacyScope:'No decoded Rolling public preference events. Private log/note/nullifier footprints remain publicly observable; no traffic-analysis or unlinkability claim.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',canonicalTransactions:observations.length,checkpoint:checkpoint.number}));
