import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRollingPublicIndexFromConfig} from '../../../scripts/rolling-public-server.mjs';
import {createAztecNodeClient} from '../../../shared/aztec-node-client.mjs';
const output=path.resolve('.build/reviewer-evidence/avatar-current');
const config=JSON.parse(await readFile('../rolling-lead-bok/.build/rolling-devnet-cce1b42c-0818-453c-852f-4f6274419bff/rolling-public.json','utf8'));
config.cacheDirectory=await mkdtemp(path.join(output,'public-index-'));config.port=0;
const node=createAztecNodeClient(config.nodeUrl),info=await node.getNodeInfo();assert.equal(info.realProofs,false);assert.equal(info.l1ChainId,31337);
const {index}=await createRollingPublicIndexFromConfig(config);
let passes=0;const started=performance.now();
try{
 while(index.status().state!=='ready') {assert(++passes<=500);const result=await index.sync();assert.notEqual(result.state,'unavailable');}
 const nameId='17609350297896024326985307958138098077604039720416030719890036518340345359947';
 const profile=index.query('profile',{nameId,limit:100}),avatar=profile.identity.profile.avatar;
 const expected=Buffer.from(avatar.data,'base64');assert.equal(expected.length,1895);assert.equal(expected.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(expected.readUInt32BE(16),100);assert.equal(expected.readUInt32BE(20),100);const live=await (await fetch('http://127.0.0.1:4317/api/profile?nameId='+nameId)).json();assert.deepEqual(live.identity.profile.avatar,avatar);await writeFile(path.join(output,'published-avatar.png'),expected);assert.equal(avatar.length,'1895');assert.equal(avatar.width,'100');assert.equal(avatar.height,'100');assert.equal(avatar.version,'1');assert.equal(avatar.removal,null);
 const post=index.query('post',{id:'9008266914914523338611243683523197246666355866198777485404400346165069884831'});
 assert.deepEqual(post.names[nameId].profile.avatar,avatar);
 const block=await node.getBlock(67,{includeTransactions:true});assert(block);assert.equal(String((await node.getBlock(67)).hash),String(block.hash));
 const status=index.status();assert(status.checkpoint.number>=67);
 const observation={source:'d8513dae8389f38769fddc4a052e62b34440d265',node:'http://127.0.0.1:8080',nativeProofs:false,status:'passed',indexStatus:status,passes,durationMs:performance.now()-started,nameId,avatar:{version:avatar.version,length:avatar.length,width:avatar.width,height:avatar.height,digest:avatar.digest,sha256:createHash('sha256').update(expected).digest('hex'),removal:avatar.removal},namedPostUsesCurrentAvatar:true,canonicalBlock67:{number:block.number,hash:String(block.hash),transactions:block.body.txEffects.map(e=>String(e.txHash))},cacheDirectory:config.cacheDirectory};
 await writeFile(path.join(output,'observations.json'),JSON.stringify(observation,null,2)+'\n');console.log(JSON.stringify({status:'passed',passes,durationMs:observation.durationMs,avatar:observation.avatar,checkpoint:status.checkpoint}));
}finally{await index.close();}
