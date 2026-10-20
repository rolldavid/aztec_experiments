import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRollingPublicIndexFromConfig} from '../../../scripts/rolling-public-server.mjs';
import {createAztecNodeClient} from '../../../shared/aztec-node-client.mjs';
import {createRollingEventDecoder,isRollingEvent} from '../../../shared/rolling/public-events.mjs';
import {createRollingProjection} from '../../../shared/rolling/public-projection.mjs';
import {loadContractArtifact} from '@aztec-labs/stdlib/abi';
import {TxHash} from '@aztec-labs/stdlib/tx';
import {createExactLimitRaster,createRasterFixture,decodeFixturePng} from '../../../experiments/avatar/raster-fixture.mjs';
const out=path.resolve('.build/reviewer-evidence/current-profile-boundaries'),read=p=>readFile(p,'utf8').then(JSON.parse),sha=b=>createHash('sha256').update(b).digest('hex');
const worker=await read('.build/g09-current-profile-boundaries/attempt-2/result.json');assert.equal(worker.source,'0fd3683e3f036748e9f5b618a097c50f3c5443bc');
const config=await read('../rolling-lead-bok/.build/rolling-devnet-cce1b42c-0818-453c-852f-4f6274419bff/rolling-public.json');
config.cacheDirectory=await mkdtemp(path.join(out,'public-index-'));config.port=0;
const node=createAztecNodeClient(config.nodeUrl),info=await node.getNodeInfo();assert.equal(info.realProofs,false);assert.equal(info.l1ChainId,31337);
const artifact=loadContractArtifact(await read(config.artifactPath)),scope={...config.scope};delete scope.bok;
const decoder=await createRollingEventDecoder({artifact,scope}),projection=createRollingProjection({isValidatedEvent:isRollingEvent});
const nameId=worker.profile.expectedIdentity.id,observations=[];
for(const n of [2,13]){const block=await node.getBlock(n,{includeTransactions:true});for(const tx of block.body.txEffects){const events=await decoder.decodeTransaction(node,String(tx.txHash),{block});for(const event of events)if(event.type==='MainPolicyPublished'||event.type==='NameRegistered'&&event.payload.name_id===nameId)projection.stage([event]).apply();}}
assert(projection.identity(nameId));
const max=createExactLimitRaster(),replacement=createRasterFixture();assert.equal(max.png.length,8192);assert.deepEqual(decodeFixturePng(max.png),max.rgb);
for(const row of worker.transactions){
 const txHash=TxHash.fromString(row.txHash),receipt=await node.getTxReceipt(txHash),block=await node.getBlock(row.blockNumber,{includeTransactions:true});assert(receipt.isMined()&&receipt.hasExecutionSucceeded());assert.equal(receipt.blockNumber,row.blockNumber);assert.equal(String(receipt.blockHash),row.blockHash);assert.equal(String(block.hash),row.blockHash);
 const effect=await node.getTxEffect(txHash),body=block.body.txEffects.find(e=>String(e.txHash)===row.txHash);assert(body);assert.equal(String(effect.l2BlockHash),row.blockHash);assert(body.toBuffer().equals(effect.data.toBuffer()));
 const events=await decoder.decodeTransaction(node,row.txHash,{block});assert.deepEqual(events.map(e=>e.type),row.events);assert(events.every(e=>e.payload.name_id===nameId));projection.stage(events).apply();
 const p=projection.identity(nameId).profile;
 if(row.label==='bio'){assert.equal(Buffer.byteLength(p.bio.text),992);assert.equal(p.bio.version,'1');assert.equal(p.bio.text,worker.profile.expectedIdentity.profile.bio.text);}
 if(row.label==='avatar-maximum'){assert.equal(p.avatar.version,'1');assert.equal(p.avatar.length,'8192');assert.equal(p.avatar.width,'100');assert.equal(p.avatar.height,'100');assert.deepEqual(Buffer.from(p.avatar.data,'base64'),max.png);}
 if(row.label==='avatar-removal'){assert.equal(p.avatar.data,null);assert.equal(p.avatar.removal.avatarVersion,'1');assert.equal(p.avatar.removal.avatarDigest,worker.profile.maximum.digest);assert.equal(p.avatar.removal.reason,'Avatar violates the main board rules.');}
 if(row.label==='avatar-clear'){assert.equal(p.avatar.version,'2');assert.equal(p.avatar.data,'');assert.equal(p.avatar.length,'0');assert.equal(p.avatar.width,'0');assert.equal(p.avatar.height,'0');assert.equal(p.avatar.removal,null);}
 if(row.label==='avatar-replacement'){assert.equal(p.avatar.version,'3');assert.equal(p.avatar.removal,null);assert.deepEqual(Buffer.from(p.avatar.data,'base64'),replacement.png);}
 assert.equal(String((await node.getBlock(row.blockNumber)).hash),row.blockHash);observations.push({...row,observedStatus:receipt.status,canonicalEffectVerified:true,decodedEventDigestsVerified:true});
}
assert.deepEqual(projection.identity(nameId),worker.profile.expectedIdentity);
const result={source:worker.source,status:'canonical profile checks passed',nativeProofs:false,transactions:observations,maximum:{bytes:8192,sha256:sha(max.png)},replacement:{bytes:replacement.png.length,sha256:sha(replacement.png)},bioBytes:992,intermediateRedactionClearReplacement:true,projectionEqualsWorkerExpectedIdentity:true,freshSqliteIndex:'unavailable during initial authentication before control row creation; ROLLING_PUBLIC_UNAVAILABLE',workerFreshFileIndexEquality:'reported true; source procedure reviewed'};
await writeFile(path.join(out,'observations.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,transactions:observations.length}));
