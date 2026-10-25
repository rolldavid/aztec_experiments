import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Explicit dependency bootstrap only; builds verify without mutation. Retain
// native queue commit guards and indexed note lookup, retire preference APIs.
const sha=value=>createHash('sha256').update(value).digest('hex');
export const INSTALLED_PINS = Object.freeze([
  Object.freeze({path:'src/pxe.ts', before:'2fef28f00ab3bc21ebb7626257ecd605acba5ab5e86fa195dbadd5af5b4850d9', after:'54e2824fcb1f15c2b249b0d39fec65776912d18c8b7855eb4c9e4af2e2156095'}),
  Object.freeze({path:'dest/pxe.js', before:'02dbb8da2a09982cf678a014e8438f5b17f2310af5691b94743a4dfa38cd9375', after:'9a999fce9d016ef4846e9c897cba20b7e9716fe5582f241e1dc9f28f67f0881f'}),
  // rc3 adds queue-pressure timing and warnings; the transform preserves them.
  Object.freeze({path:'src/operation_queue.ts', before:'a78c45878393d8713fdce1de1cda326ec3af6772b092215c8096044d3ab61246', after:'d46768a384214ea5786a60e83b3c417fd788547904cf65f1a0c756616b91d5db'}),
  Object.freeze({path:'dest/operation_queue.js', before:'f8856a4145c38e831d077bc33c5e67f778ea1ad367b3ff93c486175d4c9019b6', after:'a2373a39553acc1ffc6f4cf9be0cc6eb07cefdb033881492601dd92abd15e360'}),
  Object.freeze({path:'src/operation_lifecycle.ts', before:'c25936606b1076606e06f9d50e611112806aa5ecddc07ab583c39bb0b858ab3d', after:'52211b30b977c07b7ed4ea8fe074aa8a35c879ea195a29182e9746305f98eb99'}),
  Object.freeze({path:'dest/operation_lifecycle.js', before:'80386b7b1ead5fefe23bec2197728d28a22a1c12eca5fda0fa06adb80b119114', after:'68e5faed050ede1602d2bed598f77c795cf75de37c4e7edfef420678d835c0e7'}),
  Object.freeze({path:'src/storage/note_store/note_store.ts', before:'35faa7333be56582580115602ef63fee798f80d18f65637b9fbf5a5d39a089ea', after:'1840f842b22b3adff161bc402a2b4bdf32d0d02fde93495d3d1a976e71ec74af'}),
  Object.freeze({path:'dest/storage/note_store/note_store.js', before:'fe8539daa47f61b4768c4820224f6f9eea9bd672936674e55bddac12f2d8f1e6', after:'e04546ab30a8db718e095abad464821b6e719eee08ecde138558146d6e3cc478'}),
]);


export const PXE_OPERATION_PINS=Object.freeze(INSTALLED_PINS.slice(2));
export const PXE_SOURCE_PINS=Object.freeze(INSTALLED_PINS.slice(0,2).map(pin=>Object.freeze({path:pin.path,sha256:pin.before})));
const retiredHelpers=[
 {path:'rolling-preference-compact.mjs',sha256:'c31fdd48947b636c048a07aba2f4b10a12bda6124b53540ee9e0826234ea26af'},
 {path:'rolling-preference-recovery.mjs',sha256:'c2c46e0a1153ebd74466eb981f4eeb011d9875a4b348fd38467bb5586b51cc36'},
];
function retiredImports() { return `
// @ts-ignore Exact reviewed JavaScript module is copied by the pinned installer.
import { authenticateCompactBlock as rollingPageCompact } from '../rolling-preference-compact.mjs';
// @ts-ignore Exact isolated generated helper; no public manual store authority.
import { RollingPreferenceRecoveryStore, bindRollingPreferenceRecovery, runRollingPreferenceRecovery, rollingPreferenceReadBatch, createRollingPreferenceArchive } from '../rolling-preference-recovery.mjs';
import { SiblingPath as RollingPageSiblingPath } from '@aztec-labs/foundation/trees';
import { Fr as RollingPageFr } from '@aztec-labs/foundation/curves/bn254';
import { AztecAddress as RollingPageAddress } from '@aztec-labs/stdlib/aztec-address';
import { BlockHash as RollingPageBlockHash } from '@aztec-labs/stdlib/block';
import { BlockHeader as RollingPageHeader, TxHash as RollingPageTxHash, TxEffect as RollingPageEffect, MinedTxReceipt as RollingPageReceipt, verifyTxEffectMembershipWitness as rollingPageVerifyWitness } from '@aztec-labs/stdlib/tx';
import { SerializableContractInstance as RollingPageInstance, getContractClassFromArtifact as rollingPageClass, computeArtifactHash as rollingPageArtifactHash } from '@aztec-labs/stdlib/contract';
import { MAX_NOTE_HASHES_PER_TX as RP_NOTES, MAX_NULLIFIERS_PER_TX as RP_NULLIFIERS, MAX_L2_TO_L1_MSGS_PER_TX as RP_MESSAGES, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX as RP_WRITES, MAX_PRIVATE_LOGS_PER_TX as RP_LOGS, PRIVATE_LOG_SIZE_IN_FIELDS as RP_LOG_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH as RP_PUBLIC_FIELDS, PUBLIC_LOG_HEADER_LENGTH as RP_PUBLIC_HEADER, MAX_CONTRACT_CLASS_LOGS_PER_TX as RP_CLASS_LOGS, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS as RP_CLASS_FIELDS } from '@aztec-labs/constants';
`; }

function replaceOnce(source, from, to) {
  if(source.indexOf(from)<0 || source.indexOf(from)!==source.lastIndexOf(from))throw Error('PXE_OPERATION_PATCH_LAYOUT');
  return source.replace(from,to);
}
function transformQueue(source, ts) {
  if(ts) {
    source=replaceOnce(source,
      '    { errorContext, forceSync = false }: { errorContext?: () => string[]; forceSync?: boolean } = {},',
      '    options: { errorContext?: () => string[]; forceSync?: boolean; beforeCommit?: () => Promise<void> } = {},');
    source=replaceOnce(source,'    return this.run(async () => {',`    const { errorContext, forceSync = false } = options;
    const descriptor = Object.getOwnPropertyDescriptor(options, 'beforeCommit');
    if (descriptor && (!('value' in descriptor) || typeof descriptor.value !== 'function')) throw new Error('PXE_OPERATION_COMMIT_GUARD');
    const beforeCommit = descriptor?.value as (() => Promise<void>) | undefined;
    return this.run(async () => {`);
    return replaceOnce(source,'          contributors: this.contributors,','          contributors: this.contributors,\n          beforeCommit,');
  }
  source=replaceOnce(source,'runSynced(fn, { errorContext, forceSync = false } = {}) {',`runSynced(fn, options = {}) {
        const { errorContext, forceSync = false } = options;
        const descriptor = Object.getOwnPropertyDescriptor(options, 'beforeCommit');
        if (descriptor && (!('value' in descriptor) || typeof descriptor.value !== 'function')) throw new Error('PXE_OPERATION_COMMIT_GUARD');
        const beforeCommit = descriptor?.value;`);
  return replaceOnce(source,'                    contributors: this.contributors,','                    contributors: this.contributors,\n                    beforeCommit,');
}
function transformLifecycle(source, ts) {
  source=replaceOnce(source,'const { stagedWriteCoordinator, contributors, changeSetId, log } = args;',
    'const { stagedWriteCoordinator, contributors, changeSetId, log, beforeCommit } = args;');
  const settle=ts?'    await allToCompletion(contributors.map(contributor => contributor.settle?.(changeSetId)));':'        await allToCompletion(contributors.map((contributor)=>contributor.settle?.(changeSetId)));';
  source=replaceOnce(source,settle,settle+'\n'+(ts?'    ':'        ')+`// Read-only validation AFTER all contributors; never inside the KV transaction.
${ts?'    ':'        '}if (beforeCommit !== undefined) await beforeCommit();`);
  if(ts)source=replaceOnce(source,'  log: Logger;','  log: Logger;\n  beforeCommit?: () => Promise<void>;');
  return source;
}
// Existing narrow siloedNullifier filter gains an indexed path; no new raw API.
// Nonexistent direct keys are normal absence. Missing indexed rows remain corrupt.
function transformNoteStore(source, ts) {
  const start=source.indexOf('// Committed notes indexed by contract address');
  const end=source.indexOf('// Await all DB reads together before the await-free tail.',start);
  if(start<0||end<0)throw Error('PXE_OPERATION_PATCH_LAYOUT');
  const indent=ts?'      ':'            ';
  const original=source.slice(start,end);
  source=source.slice(0,start)+`if (filter.siloedNullifier) {
${indent}  const nullifier = filter.siloedNullifier.toString();
${indent}  candidates.set(nullifier, {
${indent}    notePromise: this.#readNote(changeSet, db, nullifier),
${indent}    nullificationPromise: this.#readNullifierEmission(changeSet, db, nullifier),
${indent}  });
${indent}} else {
${indent}${original}
${indent}}
${indent}`+source.slice(end);
  source=replaceOnce(source,"throw new Error('PXE note database is corrupted.');",
    "if (filter.siloedNullifier) continue;\n"+indent+"    throw new Error('PXE note database is corrupted.');");
  const tail='// A note is nullified once its nullifier emission has been recorded (committed or currently staged).';
  source=replaceOnce(source,tail,
    'if (!note.noteDao.contractAddress.equals(filter.contractAddress)) continue;\n'+indent+'  '+tail);
  return source;
}

export function transformOperationGuards(source,path){
 const pin=PXE_OPERATION_PINS.find(pin=>pin.path===path);
 if(!pin||sha(source)!==pin.before)throw Error('PXE_OPERATION_PATCH_SOURCE');
 const ts=path.endsWith('.ts');
 const output=path.includes('/note_store/')?transformNoteStore(source,ts):path.includes('operation_queue.')?transformQueue(source,ts):transformLifecycle(source,ts);
 if(sha(output)!==pin.after)throw Error('PXE_OPERATION_PATCH_OUTPUT');
 return output;
}
export function restoreNativePxe(source,path){
 const pin=INSTALLED_PINS.slice(0,2).find(pin=>pin.path===path);
 if(!pin)throw Error('PXE_OPERATION_PATCH_SOURCE');
 if(sha(source)===pin.before)return source;
 if(sha(source)!==pin.after)throw Error('PXE_OPERATION_PATCH_SOURCE');
 const ts=path.endsWith('.ts'),indent=ts?'    ':'        ';
 source=replaceOnce(source,retiredImports(),'');
 const start=source.indexOf('\n  /** Experimental page ingestion.');
 const at=source.indexOf(ts?'  public executeUtility(':'executeUtility(call, {');
 const end=source.lastIndexOf('/**',at);
 if(start<0||end<=start)throw Error('PXE_OPERATION_PATCH_LAYOUT');
 source=source.slice(0,start)+source.slice(end);
 source=replaceOnce(source,`const rollingRecoveryStore = new RollingPreferenceRecoveryStore(store);
${indent}const stagedStores = [
${indent}    rollingRecoveryStore,`,'const stagedStores = [');
 source=replaceOnce(source,`bindRollingPreferenceRecovery(pxe,rollingRecoveryStore,config.syncChainTip,
${indent}  (page${ts?': unknown':''},guard${ts?': () => Promise<void>':''},frame${ts?': any':''})=>pxe.#rollingPreferencePage(page,{contextGuard:guard},frame),pxe.#rollingPreferenceHead.bind(pxe));
${indent}debugUtils.setPXEHelpers(`,'debugUtils.setPXEHelpers(');
 if(sha(source)!==pin.before)throw Error('PXE_OPERATION_RESTORE_OUTPUT');
 return source;
}
async function readRegular(root,relative,optional=false){
 const path=join(root,relative);
 try {
  const stat=await lstat(path);
  if(!stat.isFile()||await realpath(path)!==path)throw Error('PXE_OPERATION_PATCH_SYMLINK');
  return {path,source:await readFile(path,'utf8'),stat};
 }catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
async function snapshot(root){
 root=resolve(root);
 if(await realpath(root)!==root)throw Error('PXE_OPERATION_PATCH_SYMLINK');
 const files=await Promise.all(INSTALLED_PINS.map(async pin=>({pin,...await readRegular(root,pin.path)})));
 const helpers=await Promise.all(retiredHelpers.map(async pin=>({pin,file:await readRegular(root,pin.path,true)})));
 for(const {pin,source} of files)if(![pin.before,pin.after].includes(sha(source)))throw Error('PXE_OPERATION_PATCH_STATE');
 for(const {pin,file} of helpers)if(file&&sha(file.source)!==pin.sha256)throw Error('PXE_OPERATION_PATCH_STATE');
 return {files,helpers};
}
export async function inspectOperationGuards(root){
 const {files,helpers}=await snapshot(root);
 const ready=files.every(({pin,source},i)=>sha(source)===(i<2?pin.before:pin.after))&&helpers.every(({file})=>file===null);
 return {state:ready?'patched':'bootstrap-required',files:files.map(({pin,source})=>({path:pin.path,sha256:sha(source)}))};
}
export async function patchInstalledOperationGuards(root){
 const repository=resolve(fileURLToPath(new URL('../',import.meta.url))),expected=join(repository,'node_modules/@aztec-labs/pxe');
 if(typeof root!=='string'||resolve(root)!==expected)throw Error('PXE_OPERATION_PATCH_OWNING_TREE');
 for(const directory of [repository,join(repository,'node_modules'),join(repository,'node_modules/@aztec-labs'),expected])if(!(await lstat(directory)).isDirectory()||await realpath(directory)!==directory)throw Error('PXE_OPERATION_PATCH_OWNING_TREE');
 const toolchain=JSON.parse(await readFile(join(repository,'toolchain.json'),'utf8')),metadata=JSON.parse(await readFile(join(expected,'package.json'),'utf8'));
 if(toolchain.node!==process.versions.node||toolchain.aztec!=='6.0.0'||metadata.name!=='@aztec-labs/pxe'||metadata.version!==toolchain.aztec)throw Error('PXE_OPERATION_PATCH_VERSION');
 const {files,helpers}=await snapshot(expected);
 for(const file of [...files,...helpers.map(x=>x.file).filter(Boolean)])if(file.stat.nlink!==1)throw Error('PXE_OPERATION_PATCH_OWNING_TREE');
 // All input and output hashes are qualified before the first mutation. No
 // consumers may be running during explicit dependency bootstrap.
 const outputs=files.map(({pin,source},i)=>i<2?restoreNativePxe(source,pin.path):sha(source)===pin.after?source:transformOperationGuards(source,pin.path));
 for(let i=0;i<files.length;i++)if(outputs[i]!==files[i].source)await writeFile(files[i].path,outputs[i]);
 for(const {file} of helpers)if(file)await unlink(file.path);
 return inspectOperationGuards(expected);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,root,...rest]=process.argv.slice(2);
 if(!root||rest.length||!['--verify','--apply-installed'].includes(mode))throw Error('PXE_OPERATION_PATCH_USAGE');
 console.log(JSON.stringify(await(mode==='--verify'?inspectOperationGuards(root):patchInstalledOperationGuards(root))));
}
