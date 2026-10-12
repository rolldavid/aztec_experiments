// Small actual LMDB query fixtures plus labelled report/cleanup fault injection.
// These tests do not run the retained-size campaign, Chromium, or cold PXE sync.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {QUERY_CAPACITY_TARGETS,parseCapacityArguments,prepareCapacityStores,runLmdbCapacity,measureStorePair,assessCapacity,ownedProcessMemory} from './measure-private-event-query.mjs';
const directory=await realpath(await mkdtemp(join(tmpdir(),'rolling-capacity-unit-')));
after(()=>rm(directory,{recursive:true,force:true}));
const roots=(await prepareCapacityStores(directory)).roots;
let actual;
test('tiny real pinned upstream versus patched LMDB stores: full result equality, serial range reads and numeric-only report',async()=>{
 actual=await runLmdbCapacity({retained:16,directory,roots});
 const report=assessCapacity(actual,{nodePeakRssBytes:process.resourceUsage().maxRSS*1024,browserProcessPeakRssBytes:[]});
 assert.equal(report.correctnessPassed,true);
 assert.equal(actual.variants[0].queries.every(q=>q.reads===16&&q.historicalRows===16),true);
 assert.equal(actual.variants[1].queries.every(q=>q.reads===8&&q.historicalRows===0&&q.peak===1&&q.pending===0),true);
 assert(!JSON.stringify(actual).includes('0x'));assert(!JSON.stringify(actual).includes('fields'));assert.equal(actual.variants[0].queries.length,5);
});
test('thresholds predate campaign and CLI requires explicit one platform/one approved retained size',()=>{
 assert.deepEqual(QUERY_CAPACITY_TARGETS,{retained:[1000,10000,50000],selected:8,warmQueries:5,warmP95Ms:250,perProcessRssBytes:1073741824});
 const args=parseCapacityArguments(['--platform','chromium','--events','50000','--output',join(directory,'report.json')]);assert.equal(args.retained,50000);assert.equal(args.platform,'chromium');
 for(const bad of [[],['--platform','fake-indexeddb','--events','1000','--output','x'],['--platform','lmdb','--events','1001','--output','x'],['--platform','lmdb','--platform','lmdb','--output','x'],['--platform','lmdb','--events','1e3','--output','x']])assert.throws(()=>parseCapacityArguments(bad),/PRIVATE_EVENT_CAPACITY_FAILED/);
});
for(const [label,mutate]of [
 ['extra historical scan',r=>{r.variants[1].queries[0].historicalRows=1;}],
 ['parallel primary reads',r=>{r.variants[1].queries[0].peak=2;}],
 ['omitted primary read',r=>{r.variants[1].queries[0].reads=7;}],
 ['wrong block index visits',r=>{r.variants[1].queries[0].blockRows=9;}],
])test(`labelled report mutation fails correctness: ${label}`,()=>{
 const value=structuredClone(actual);mutate(value);assert.equal(assessCapacity(value,{nodePeakRssBytes:1,browserProcessPeakRssBytes:[]}).correctnessPassed,false);
});
for(const [label,mutate]of [
 ['partial result',r=>{r.variants[1].queries[0].resultCount=7;}],
 ['pending read',r=>{r.variants[1].queries[0].pending=1;}],
 ['missing warm sample',r=>{r.variants[1].queries.pop();}],
 ['forged equality',r=>{r.variants[1].equal=false;}],
 ['forged p95',r=>{r.variants[1].p95Ms=0;}],
 ['nonfinite timing',r=>{r.variants[1].queries[0].durationMs=NaN;}],
])test(`labelled invalid measurement rejected: ${label}`,()=>{
 const value=structuredClone(actual);mutate(value);assert.throws(()=>assessCapacity(value,{nodePeakRssBytes:1,browserProcessPeakRssBytes:[]}),/PRIVATE_EVENT_CAPACITY_FAILED/);
});
test('performance and memory target failures are reported honestly, never waived by equality',()=>{
 const value=structuredClone(actual);value.variants[1].queries[0].durationMs=251;value.variants[1].p95Ms=Math.max(...value.variants[1].queries.map(x=>x.durationMs));
 const report=assessCapacity(value,{nodePeakRssBytes:1,browserProcessPeakRssBytes:[QUERY_CAPACITY_TARGETS.perProcessRssBytes+1]});
 assert.equal(report.correctnessPassed,true);assert.equal(report.patchedWarmP95Passed,false);assert.equal(report.perProcessRssPassed,false);assert.equal(report.passed,false);
});
test('owned process RSS sampling excludes unrelated processes, includes descendants and retains peaks without publishing PIDs',()=>{
 const peaks=new Map();ownedProcessMemory(' 10 1 100\n11 10 200\n12 11 300\n99 1 99999\n',10,peaks);
 assert.deepEqual([...peaks.values()],[102400,204800,307200]);ownedProcessMemory('10 1 90\n11 10 250\n',10,peaks);assert.equal(peaks.get(10),102400);assert.equal(peaks.get(11),256000);
 assert.throws(()=>ownedProcessMemory('PRIVATE_SENTINEL',10,peaks),/PRIVATE_EVENT_CAPACITY_FAILED/);
});
test('labelled SDK failure is fixed and cleanup awaited; no partial measurement returned',async()=>{
 let closed=0,open=0;
 // Constructor fails before any query: this only qualifies experiment cleanup.
 const sdk={Fr:class{},AztecAddress:class{},BlockHash:class{},TxHash:{fromBigInt(){return{toString(){return'';}};}},EventSelector:class{toString(){return'';}}};
 sdk.Fr.prototype.toString=()=>'';sdk.BlockHash.prototype.toString=()=>'';
 class Broken{constructor(){throw Error('PRIVATE_SENTINEL');}}
 const browserSerialized=new Function('return ('+measureStorePair.toString()+')')();
 await assert.rejects(browserSerialized({Original:Broken,Patched:Broken,sdk,retained:8,openStore:async()=>{open++;return{delete:async()=>{await Promise.resolve();closed++;}};}}),{message:'PRIVATE_EVENT_CAPACITY_FAILED'});
 assert.equal(open,1);assert.equal(closed,1);
});
test('expired experiment never opens a database',async()=>{
 let calls=0;const sdk={Fr:class{toString(){return'';}},AztecAddress:class{},BlockHash:class{toString(){return'';}},TxHash:{fromBigInt(){return{toString(){return'';}};}},EventSelector:class{toString(){return'';}}};
 await assert.rejects(measureStorePair({sdk,retained:8,deadlineAt:0,openStore:async()=>{calls++;}}),/PRIVATE_EVENT_CAPACITY_FAILED/);assert.equal(calls,0);
});
test('browser source uses actual IndexedDB and blocks external network; no fake-indexeddb benchmark path',async()=>{
 const source=await readFile(new URL('./measure-private-event-query.mjs',import.meta.url),'utf8');
 assert(source.includes("import {AztecIndexedDBStore} from '@aztec-labs/kv-store/deprecated/indexeddb'"));
 assert(!source.includes("from 'fake-indexeddb"));assert(source.includes("url.origin===origin?route.continue():route.abort()"));
});
