import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {reusePrivateLogEffects} from './pxe-log-projection.mjs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BlockHash} from '@aztec-labs/stdlib/block';
import {randomLogResult,LogCursor,queryAllPrivateLogsByTags} from '@aztec-labs/stdlib/logs';
const installed=await fs.realpath(new URL('../node_modules/@aztec-labs/pxe/dest/node/',import.meta.url));
const native=await fs.readFile(path.join(installed,'caching_aztec_node.js'),'utf8');
const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'owner-log-projection-')));
await fs.writeFile(path.join(dir,'package.json'),'{"type":"module"}');
await fs.symlink(await fs.realpath(new URL('../node_modules',import.meta.url)),path.join(dir,'node_modules'));
await fs.copyFile(path.join(installed,'benchmarked_node.js'),path.join(dir,'benchmarked_node.js'));
await fs.writeFile(path.join(dir,'caching_aztec_node.js'),reusePrivateLogEffects(native));
const {withCache}=await import(pathToFileURL(path.join(dir,'caching_aztec_node.js')));
after(()=>fs.rm(dir,{recursive:true,force:true}));
const hash=n=>BlockHash.fromString('0x'+n.toString(16).padStart(64,'0'));
function fixture(){
 const calls=[],pages=new Map([[Fr.ONE.toString(),[randomLogResult(true)]],[new Fr(2).toString(),[]]]);
 let fail=false,release,hold=false;
 const node=withCache({getPrivateLogsByTags:async q=>{calls.push(q);if(hold)await new Promise(resolve=>release=resolve);if(fail)throw Error('node unavailable');return q.tags.map(t=>pages.get((t.tag??t).toString())??[]);}});
 const query={referenceBlock:{number:7,hash:hash(7)},toBlock:8,tags:[Fr.ONE,new Fr(2)],includeEffects:true};
 return {node,query,calls,pages,hold:()=>hold=true,release:()=>{hold=false;release();},fail:()=>fail=true,recover:()=>fail=false};
}
test('only exact pinned native source is transformed',()=>{assert.throws(()=>reusePrivateLogEffects(native+' '),/SOURCE/);assert.throws(()=>reusePrivateLogEffects(reusePrivateLogEffects(native)),/SOURCE/);});
test('richer page satisfies later effects-free page without mutation or extra RPC',async()=>{
 const f=fixture(),rich=await f.node.getPrivateLogsByTags(f.query);
 const poor=await f.node.getPrivateLogsByTags({...f.query,includeEffects:false});
 assert.equal(f.calls.length,1);assert.deepEqual(poor[1],[]);
 assert(!Object.hasOwn(poor[0][0],'noteHashes'));assert(!Object.hasOwn(poor[0][0],'nullifiers'));
 assert.deepEqual(poor[0][0].logData,rich[0][0].logData);assert.notEqual(poor[0][0].logData,rich[0][0].logData);
 poor[0][0].logData.pop();assert.equal(rich[0][0].logData.length,3);assert.equal(rich[0][0].noteHashes.length,3);
 await f.node.getPrivateLogsByTags({...f.query,includeEffects:undefined});assert.equal(f.calls.length,1);
});
test('poor cached result cannot stand in for richer effects',async()=>{
 const f=fixture();await f.node.getPrivateLogsByTags({...f.query,includeEffects:false});await f.node.getPrivateLogsByTags(f.query);assert.equal(f.calls.length,2);
});
test('overlapping tags fetch only the exact uncached pages',async()=>{
 const f=fixture();await f.node.getPrivateLogsByTags(f.query);
 await f.node.getPrivateLogsByTags({...f.query,includeEffects:false,tags:[new Fr(2),new Fr(3),Fr.ONE,new Fr(3)]});
 assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].tags.map(String),[new Fr(3).toString()]);
});
for(const [name,change]of Object.entries({hash:q=>({...q,referenceBlock:{number:7,hash:hash(8)}}),height:q=>({...q,referenceBlock:{number:8,hash:hash(7)}}),from:q=>({...q,fromBlock:1}),to:q=>({...q,toBlock:7}),tx:q=>({...q,txHash:'other'}),limit:q=>({...q,limitPerTag:1}),cursor:q=>({...q,tags:[{tag:Fr.ONE,afterLog:LogCursor.fromLog(randomLogResult())}]})})){
 test(`projection does not cross ${name} identity`,async()=>{const f=fixture();await f.node.getPrivateLogsByTags(f.query);await f.node.getPrivateLogsByTags(change({...f.query,includeEffects:false}));assert.equal(f.calls.length,2);});
}
for(const [name,referenceBlock,toBlock]of [['height',7,8],['tip','latest',8],['unbounded',{number:7,hash:hash(7)},undefined]]){
 test(`mutable ${name} queries bypass projection`,async()=>{const f=fixture(),q={...f.query,referenceBlock,toBlock};await f.node.getPrivateLogsByTags(q);await f.node.getPrivateLogsByTags({...q,includeEffects:false});assert.equal(f.calls.length,2);});
}
test('in-flight richer response is shared and rejection evicts both projections',async()=>{
 const f=fixture();f.hold();f.fail();const rich=f.node.getPrivateLogsByTags(f.query),poor=f.node.getPrivateLogsByTags({...f.query,includeEffects:false});
 const checks=Promise.all([assert.rejects(rich,/unavailable/),assert.rejects(poor,/unavailable/)]);assert.equal(f.calls.length,1);f.release();await checks;
 f.recover();await f.node.getPrivateLogsByTags({...f.query,includeEffects:false});assert.equal(f.calls.length,2);
});
test('wipe while response is in flight cannot repopulate either entry',async()=>{
 const f=fixture();f.hold();const rich=f.node.getPrivateLogsByTags(f.query),poor=f.node.getPrivateLogsByTags({...f.query,includeEffects:false});
 f.node.wipeCache();f.release();await Promise.all([rich,poor]);await f.node.getPrivateLogsByTags({...f.query,includeEffects:false});assert.equal(f.calls.length,2);
});
test('short richer batch is rejected, never cached as missing logs',async()=>{
 const calls=[];let short=true;const node=withCache({getPrivateLogsByTags:async q=>{calls.push(q);return short?[[]]:q.tags.map(()=>[]);}}),q=fixture().query;
 await assert.rejects(node.getPrivateLogsByTags(q),/returned 1 results for 2/);
 short=false;await node.getPrivateLogsByTags({...q,includeEffects:false});assert.equal(calls.length,2);
});
test('native full-page pagination reuses exact richer cursor pages',async()=>{
 const calls=[],logs=[randomLogResult(true),randomLogResult(true)];
 logs.forEach((log,i)=>{log.blockNumber=7;log.txIndexWithinBlock=0;log.logIndexWithinTx=i;});
 const node=withCache({getPrivateLogsByTags:async q=>{calls.push(q);return q.tags.map(tag=>tag.afterLog?[]:logs);}}),q={...fixture().query,tags:[Fr.ONE],limitPerTag:2};
 const rich=await queryAllPrivateLogsByTags(node,q),poor=await queryAllPrivateLogsByTags(node,{...q,includeEffects:false});
 assert.equal(calls.length,2);assert.equal(rich[0].length,2);assert.equal(poor[0].length,2);assert(!Object.hasOwn(poor[0][1],'nullifiers'));
});
