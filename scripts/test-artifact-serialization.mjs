import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {loadContractArtifact,contractArtifactToBuffer} from '@aztec-labs/stdlib/abi';
import {createStartupArtifactSerializer} from '../shared/pxe-startup-cache.mjs';
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
 const fast=createStartupArtifactSerializer(native,BrowserBuffer,Fr),start=performance.now(),expected=native(artifact),nativeMs=performance.now()-start;
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
