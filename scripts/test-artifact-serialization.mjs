import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {loadContractArtifact,contractArtifactToBuffer} from '@aztec-labs/stdlib/abi';
import {createStartupArtifactSerializer} from '../shared/pxe-startup-cache.mjs';
import {efficientPxeStartup} from './pxe-startup.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
const serialize=createStartupArtifactSerializer(contractArtifactToBuffer,Buffer,Fr);
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const [name,path] of [['Board','../billboard/target/rolling_contract-RollingBoard.json'],['FPC','../apps/src/billboard/private_fee_artifact.json']])test('actual native '+name+' serialized bytes remain exact, with bytecode and metadata mutation detection',async()=>{
 const artifact=loadContractArtifact(JSON.parse(await readFile(new URL(path,import.meta.url),'utf8')));
 const start=performance.now(),native=contractArtifactToBuffer(artifact),nativeMs=performance.now()-start;
 const next=performance.now(),fast=serialize(artifact),fastMs=performance.now()-next;
 assert.deepEqual(fast,native);
 console.log(JSON.stringify({artifact:name,bytes:native.length,sha256:hash(native),nativeMs,fastMs}));
 const fn=artifact.functions.find(value=>value.bytecode.length),before=fn.bytecode[0];fn.bytecode[0]^=1;
 assert.notDeepEqual(serialize(artifact),native);assert.deepEqual(serialize(artifact),contractArtifactToBuffer(artifact));fn.bytecode[0]=before;
 artifact.functions[0].debugSymbols+='mutation';assert.notDeepEqual(serialize(artifact),native);assert.deepEqual(serialize(artifact),contractArtifactToBuffer(artifact));
});
test('native Fr mutation, nested buffers, missing values and shared references retain exact bytes',()=>{
 const field=new Fr(1),bytes=Buffer.from([0,1,255]),value={field,bytes,list:[bytes,undefined,null,1n],nested:{a:bytes}};
 assert.deepEqual(serialize(value),contractArtifactToBuffer(value));const before=serialize(value);field.asBigInt=2n;
 assert.notDeepEqual(serialize(value),before);assert.deepEqual(serialize(value),contractArtifactToBuffer(value));
});
test('custom serialization and accessors retain unmodified native execution semantics',()=>{
 for(const setup of [
  ()=>{let hits=0;return {value:{bytes:Buffer.from('a'),get x(){return ++hits;}},count:()=>hits};},
  ()=>{const value={custom:{toJSON(){value.later='changed';return 'custom';}},later:'before',bytes:Buffer.from('a')};return {value};},
  ()=>{const bytes=Buffer.from('a');bytes.toJSON=()=>({special:true});return {value:{bytes}};},
  ()=>({value:{type:'Buffer',data:[Buffer.from('1')]}}),
  ()=>({value:{custom:new Map([['bytes',Buffer.from('a')]])}}),
 ]){
  const first=setup(),second=setup();assert.deepEqual(serialize(first.value),contractArtifactToBuffer(second.value));if(first.count)assert.equal(first.count(),1);
 }
});
test('unknown object/prototype and cycles do not become an accepted immutable shortcut',()=>{
 const custom=Object.create({toJSON(){return {bytes:Buffer.from('a')};}});assert.deepEqual(serialize({custom}),contractArtifactToBuffer({custom}));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>serialize(cyclic),TypeError);
 const fake=Object.create(Fr.prototype);Object.defineProperty(fake,'asBigInt',{get(){return 4n;}});assert.deepEqual(serialize({fake}),contractArtifactToBuffer({fake}));
});
test('actual browser Buffer and native serializer source preserve Board bytes without numeric-array expansion',async()=>{
 const {Buffer:BrowserBuffer}=await import('buffer/index.js');
 const convert=await readFile(new URL('../node_modules/@aztec-labs/foundation/dest/json-rpc/convert.js',import.meta.url),'utf8');
 const contract=await readFile(new URL('../node_modules/@aztec-labs/stdlib/dest/abi/contract_artifact.js',import.meta.url),'utf8');
 const extract=(text,name)=>{const from=text.indexOf('export function '+name+'('),end=text.indexOf('\n}',from);assert(from>=0&&end>from);return text.slice(from+7,end+2);};
 const jsonStringify=Function('Buffer','return ('+extract(convert,'jsonStringify')+');')(BrowserBuffer);
 const native=Function('Buffer','jsonStringify','return ('+extract(contract,'contractArtifactToBuffer')+');')(BrowserBuffer,jsonStringify);
 const project=value=>Buffer.isBuffer(value)?BrowserBuffer.from(value):Array.isArray(value)?value.map(project):value&&Object.getPrototypeOf(value)===Object.prototype?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,project(v)])):value;
 const nativeArtifact=loadContractArtifact(JSON.parse(await readFile(new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url),'utf8')));
 const artifact=project(nativeArtifact);
 const transformed=efficientPxeStartup(contract,'node_modules/@aztec-labs/stdlib/dest/abi/contract_artifact.js');
 assertTransformBindings(contract,transformed,'contract_artifact.js');
 const encoded=Function('Buffer','jsonStringify','return ('+extract(transformed,'contractArtifactToBuffer')+');')(BrowserBuffer,jsonStringify);
 const fast=createStartupArtifactSerializer(encoded,BrowserBuffer,Fr),start=performance.now(),expected=native(artifact),nativeMs=performance.now()-start;
 const next=performance.now(),actual=fast(artifact),fastMs=performance.now()-next;
 assert.deepEqual(actual,expected);assert.equal(hash(actual),hash(contractArtifactToBuffer(nativeArtifact)));
 console.log(JSON.stringify({artifact:'Board-browser-Buffer',bytes:expected.length,sha256:hash(expected),nativeMs,fastMs}));
});

test('non-enumerable array indices, holes and accessors retain native array semantics',()=>{
 const value=[Buffer.from('x'),,undefined];Object.defineProperty(value,'0',{enumerable:false});
 assert.deepEqual(serialize({value}),contractArtifactToBuffer({value}));
 let reads=0;const accessor=new Array(1);Object.defineProperty(accessor,'0',{get(){reads++;return Buffer.from('x');},enumerable:false});
 const actual=serialize(accessor);assert.equal(reads,1);assert.deepEqual(actual,contractArtifactToBuffer(accessor));
 const prototype=Object.create(Array.prototype);prototype[0]=Buffer.from('x');const inherited=new Array(1);Object.setPrototypeOf(inherited,prototype);
 assert.deepEqual(serialize(inherited),contractArtifactToBuffer(inherited));
});

test('Buffer subclass and custom prototype serialization use the unchanged native path',()=>{
 class SpecializedBuffer extends Buffer {};
 const bytes=Buffer.from('x');Object.setPrototypeOf(bytes,SpecializedBuffer.prototype);
 assert.deepEqual(serialize({bytes}),contractArtifactToBuffer({bytes}));
 Object.defineProperty(SpecializedBuffer.prototype,'toJSON',{value(){return {special:'value'};}});
 assert.deepEqual(serialize({bytes}),contractArtifactToBuffer({bytes}));
});

async function browserUtf8Fixture(){
 const {Buffer:BrowserBuffer}=await import('buffer/index.js');
 const convert=await readFile(new URL('../node_modules/@aztec-labs/foundation/dest/json-rpc/convert.js',import.meta.url),'utf8');
 const source=await readFile(new URL('../node_modules/@aztec-labs/stdlib/dest/abi/contract_artifact.js',import.meta.url),'utf8');
 const transformed=efficientPxeStartup(source,'node_modules/@aztec-labs/stdlib/dest/abi/contract_artifact.js');
 assertTransformBindings(source,transformed,'contract_artifact.js');
 assert.throws(()=>efficientPxeStartup(source+'\n','node_modules/@aztec-labs/stdlib/dest/abi/contract_artifact.js'),/source mismatch/);
 const extract=(text,name)=>{const from=text.indexOf('export function '+name+'('),end=text.indexOf('\n}',from);assert(from>=0&&end>from);return text.slice(from+7,end+2);};
 const jsonStringify=Function('Buffer','return ('+extract(convert,'jsonStringify')+');')(BrowserBuffer);
 const make=(text,json=jsonStringify)=>Function('Buffer','jsonStringify','return ('+extract(text,'contractArtifactToBuffer')+');')(BrowserBuffer,json);
 return {BrowserBuffer,native:make(source),encoded:make(transformed),raw:json=>[make(source,()=>json),make(transformed,()=>json)]};
}
test('native UTF-8 boundary preserves browser bytes for Unicode, lone surrogates and native JSON values',async()=>{
 const {BrowserBuffer,native,encoded,raw}=await browserUtf8Fixture();
 const text=['ASCII','हिन्दी','中文','é','e\u0301','\u0000','\u07ff','\u0800','\uffff','😀','\ud800','\udfff','\ud800\ud800','\udc00\ud800','x\ud800y','\ud800\udc00','\u2028\u2029'];
 for(const value of text){
  assert.deepEqual(encoded({[value]:value,buffer:BrowserBuffer.from([0,255]),field:new Fr(7),list:[undefined,1n]}),native({[value]:value,buffer:BrowserBuffer.from([0,255]),field:new Fr(7),list:[undefined,1n]}));
  // Direct final-string parity also covers unpaired surrogates that native JSON
  // normally escapes before this boundary; these retain the native fallback.
  const [before,after]=raw(value);assert.deepEqual(after(null),before(null));
 }
 const first=encoded({value:'independent'}),second=encoded({value:'independent'});first[0]=0;assert.notEqual(first[0],second[0]);assert(BrowserBuffer.isBuffer(second));
});
test('native UTF-8 boundary retains one JSON evaluation and existing rejection semantics',async()=>{
 const {native,encoded}=await browserUtf8Fixture();
 for(const serialize of [native,encoded]){
  let calls=0;assert.equal(serialize({toJSON(){calls++;return 'value';}}).toString(),'"value"');assert.equal(calls,1);
  for(const value of [undefined,()=>{},Symbol('unsupported'),{toJSON(){return undefined;}}])assert.throws(()=>serialize(value),TypeError);
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>serialize(cyclic),TypeError);
  const failure=Error('custom JSON failure');assert.throws(()=>serialize({toJSON(){throw failure;}}),error=>error===failure);
 }
});
test('native UTF-8 bounded browser conversion microbench keeps exact bytes',async()=>{
 const {native,encoded}=await browserUtf8Fixture();
 const value={metadata:'Aztec-é-😀-\ud800-'.repeat(4096)},rounds=8;
 const expected=native(value);assert.deepEqual(encoded(value),expected);
 const before=performance.now();for(let i=0;i<rounds;i++)native(value);const nativeMs=performance.now()-before;
 const start=performance.now();for(let i=0;i<rounds;i++)encoded(value);const encodedMs=performance.now()-start;
 console.log(JSON.stringify({case:'UTF-8-only-browser-Buffer',bytes:expected.length,rounds,nativeMs,encodedMs}));
});
