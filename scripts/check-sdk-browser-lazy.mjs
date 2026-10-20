// Local build verification only; no browser, network, wallet or proof execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkSdk} from './check-sdk.mjs';
import {ROOT} from './toolchain.mjs';
const manifest=checkSdk(),directory=path.join(ROOT,'.build/sdk');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cli=fs.readFileSync(path.join(directory,'aztec_bundle.js'));
const browser=fs.readFileSync(path.join(directory,'aztec_browser.js'));
const code=browser.toString('utf8');
const names=Object.keys(manifest.outputs).filter(name=>/^sdk-lazy-[a-f0-9]{64}\.mjs$/.test(name));
assert(names.length>2,'Expected kernel and WASM lazy modules');
for(const name of names){
 const bytes=fs.readFileSync(path.join(directory,name)),digest=sha(bytes);
 assert.equal(name,'sdk-lazy-'+digest+'.mjs');
 assert.equal(manifest.outputs[name],digest);
 assert(code.includes('./'+name+'?sha256='+digest),'Unreferenced lazy module: '+name);
}
const expected=[];
for(const name of Object.keys(manifest.inputs)){
 const circuit=/^node_modules\/@aztec-labs\/noir-protocol-circuits-types\/artifacts\/[a-z0-9_]+\.json$/.test(name);
 const wasm=/^node_modules\/@aztec-foundation\/bb\.js\/dest\/browser\/barretenberg_wasm\/fetch_code\/browser\/barretenberg(?:-threads)?\.js$/.test(name);
 if(!circuit&&!wasm)continue;
 const original=fs.readFileSync(path.join(ROOT,name),'utf8');
 const contents=circuit?'export default '+original+';\n':original;
 const output='sdk-lazy-'+sha(contents)+'.mjs';
 assert(names.includes(output),'Missing native lazy input: '+name);expected.push(output);
}
assert.deepEqual([...new Set(expected)].sort(),names.sort());
assert(browser.length<cli.length/2,'Browser entry still eagerly embeds the large SDK payloads');
console.log(JSON.stringify({cliBytes:cli.length,browserBytes:browser.length,lazyModules:names.length,initialBytesRemoved:cli.length-browser.length}));
