import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
export function checkRollingWorkerEvaluation(root){
root=path.resolve(root);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.build/rolling-wallet/manifest.json'),'utf8'));
const scripts=[['ethers.js','node_modules/ethers/dist/ethers.umd.min.js'],['aztec_bundle.js','.build/sdk/aztec_browser.js'],['crs-client.js','shared/crs-client.js'],['claim-secret-store.js','shared/claim-secret-store.js'],['engine.js','apps/src/billboard/user/engine.js'],['native-worker.js','.build/rolling-wallet/native-worker.js']];
const parts=scripts.map(([name,file])=>{
 const record=manifest.files['/wallet/'+name];if(record?.file!==file)throw Error('Worker script inventory mismatch: '+name);
 const bytes=fs.readFileSync(path.join(root,file));if(bytes.length!==record.bytes||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Worker script digest mismatch: '+name);return bytes;
});
const handlers=[],blocked=[];
const refuse=name=>(...args)=>{blocked.push(name);throw Error('Worker evaluation attempted '+name);};
const context=vm.createContext({console,performance,crypto:webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,AbortSignal,DOMException,Event,EventTarget,Blob,WebAssembly,
 atob,btoa,structuredClone,setTimeout:refuse('timer'),clearTimeout(){},setInterval:refuse('interval'),clearInterval(){},queueMicrotask:refuse('microtask'),MessageChannel:class{constructor(){refuse('message channel')();}},
 navigator:{userAgent:'Rolling worker evaluation smoke',hardwareConcurrency:2},location:new URL('https://rolling.chat/wallet/native-worker.js'),
 fetch:refuse('network fetch'),Worker:class{constructor(){refuse('nested worker')();}},WebSocket:class{constructor(){refuse('WebSocket')();}},
 postMessage:refuse('unsolicited message'),addEventListener:(name,handler)=>{handlers.push([name,handler]);},removeEventListener(){},WorkerGlobalScope:class WorkerGlobalScope{},
},{microtaskMode:'afterEvaluate'});
vm.runInContext('Object.setPrototypeOf(globalThis,WorkerGlobalScope.prototype);globalThis.self=globalThis;globalThis.__rollingWalletAssetBase="https://rolling.chat/wallet/";',context);
const source=parts.map(bytes=>bytes.toString('utf8')).join('\n;\n');
new vm.Script(source,{filename:'verified-rolling-worker.js'}).runInContext(context,{timeout:30000});
if(typeof context.__aztec?.createPXE!=='function'||typeof context.ethers?.Interface!=='function'||typeof context.makeClaimSecretStore!=='function'||!context.BillboardCRS||!context.BillboardPrivateFeeRouting||handlers.filter(([name])=>name==='message').length!==1||blocked.length)throw Error('Worker evaluation did not reach native message handler');
return {scripts:scripts.length,bytes:parts.reduce((sum,b)=>sum+b.length,0),workerMessageHandlers:1,networkOrPrivateWork:0,status:'passed'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkRollingWorkerEvaluation(process.argv[2]??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))));
