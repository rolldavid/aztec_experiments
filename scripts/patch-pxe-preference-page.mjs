import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ISOLATED EXPERIMENT ONLY. No build/install hook. Normal sync is unchanged;
// this adds exactly one closed utility operation, never a generic skip-sync flag.
// Caller supplies manifest-approved pins and holds the account lease. Its guard
// runs again AFTER contributor settlement, before the original atomic commit.
// It does not freeze an external chain or revoke an already-started KV commit.
// Full enumeration, publication and cold recovery remain separate gates.
const sha = value => createHash('sha256').update(value).digest('hex');
export const PREFERENCE_PAGE_PINS = Object.freeze([
  Object.freeze({path:'src/pxe.ts', before:'514cf7905733732522db9f301437d9ec5a1fd3b4a5ee3939980f76ffb4396ebd', after:'abed0b82e32b3a59bac13a86068b6c175713dd71db4d4b70023cb217182425bf'}),
  Object.freeze({path:'dest/pxe.js', before:'94d98c0a13a0d6a2724ecf03f790461e13328b8aebac3d243f373e982d76a360', after:'1aaddc8886723dc42543baa3faffae6b8416ee9ee48aaa50fcc021ed2ea15bae'}),
  // rc3 adds queue-pressure timing and warnings; the transform preserves them.
  Object.freeze({path:'src/operation_queue.ts', before:'a78c45878393d8713fdce1de1cda326ec3af6772b092215c8096044d3ab61246', after:'d46768a384214ea5786a60e83b3c417fd788547904cf65f1a0c756616b91d5db'}),
  Object.freeze({path:'dest/operation_queue.js', before:'f8856a4145c38e831d077bc33c5e67f778ea1ad367b3ff93c486175d4c9019b6', after:'a2373a39553acc1ffc6f4cf9be0cc6eb07cefdb033881492601dd92abd15e360'}),
  Object.freeze({path:'src/operation_lifecycle.ts', before:'c25936606b1076606e06f9d50e611112806aa5ecddc07ab583c39bb0b858ab3d', after:'52211b30b977c07b7ed4ea8fe074aa8a35c879ea195a29182e9746305f98eb99'}),
  Object.freeze({path:'dest/operation_lifecycle.js', before:'80386b7b1ead5fefe23bec2197728d28a22a1c12eca5fda0fa06adb80b119114', after:'68e5faed050ede1602d2bed598f77c795cf75de37c4e7edfef420678d835c0e7'}),
]);

export const PREFERENCE_PAGE_COMPACT_PIN = Object.freeze({
  source:'shared/rolling/compact-block.mjs', generated:'rolling-preference-compact.mjs', sha256:'c31fdd48947b636c048a07aba2f4b10a12bda6124b53540ee9e0826234ea26af',
});
function imports() { return `
// @ts-ignore Exact reviewed JavaScript module is copied by the pinned installer.
import { authenticateCompactBlock as rollingPageCompact } from '../rolling-preference-compact.mjs';
import { SiblingPath as RollingPageSiblingPath } from '@aztec-labs/foundation/trees';
import { Fr as RollingPageFr } from '@aztec-labs/foundation/curves/bn254';
import { AztecAddress as RollingPageAddress } from '@aztec-labs/stdlib/aztec-address';
import { BlockHash as RollingPageBlockHash } from '@aztec-labs/stdlib/block';
import { BlockHeader as RollingPageHeader, TxHash as RollingPageTxHash, TxEffect as RollingPageEffect, MinedTxReceipt as RollingPageReceipt, verifyTxEffectMembershipWitness as rollingPageVerifyWitness } from '@aztec-labs/stdlib/tx';
import { SerializableContractInstance as RollingPageInstance, getContractClassFromArtifact as rollingPageClass, computeArtifactHash as rollingPageArtifactHash } from '@aztec-labs/stdlib/contract';
import { MAX_NOTE_HASHES_PER_TX as RP_NOTES, MAX_NULLIFIERS_PER_TX as RP_NULLIFIERS, MAX_L2_TO_L1_MSGS_PER_TX as RP_MESSAGES, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX as RP_WRITES, MAX_PRIVATE_LOGS_PER_TX as RP_LOGS, PRIVATE_LOG_SIZE_IN_FIELDS as RP_LOG_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH as RP_PUBLIC_FIELDS, PUBLIC_LOG_HEADER_LENGTH as RP_PUBLIC_HEADER, MAX_CONTRACT_CLASS_LOGS_PER_TX as RP_CLASS_LOGS, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS as RP_CLASS_FIELDS } from '@aztec-labs/constants';
`; }

function method(ts) {
  const t = value => ts ? value : '';
  return `
  /** Experimental page ingestion. The trusted caller holds an account lease and
   * supplies locally approved deployment pins, never HTTP-supplied authority.
   * Counts describe this page only; no cursor, preference state or completion.
   */
  ${t('public ')}async processRollingPreferencePage(input${t(': unknown')}, options${t(': unknown')}) {
    const fail = () => { throw new Error('PXE_PREFERENCE_PAGE_FAILED'); };
    const check = (ok${t(': unknown')}) => { if (!ok) fail(); };
    const own = (object${t(': any')}, key${t(': string')}) => {
      const d = object && Object.getOwnPropertyDescriptor(object, key);
      if (!d || !('value' in d)) return fail();
      return d.value;
    };
    const exact = (object${t(': any')}, keys${t(': string[]')}) => {
      check(object && Object.getPrototypeOf(object) === Object.prototype);
      check(Reflect.ownKeys(object).length === keys.length);
      return Object.fromEntries(keys.map(key => [key, own(object, key)]));
    };
    const field = (value${t(': any')}) => {
      check(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value));
      check(BigInt(value) > 0n && BigInt(value) < RollingPageFr.MODULUS);
      return value;
    };
    const natural = (value${t(': any')}, maximum${t(': number')}, minimum = 0) => {
      check(Number.isSafeInteger(value) && value >= minimum && value <= maximum); return value;
    };
    try {
      // Capture own primitives/capabilities before the first await, including all
      // nested network fields. No caller-owned SDK objects enter the queue.
      const p = exact(input, ['contractAddress','scope','expectedClassId','expectedArtifactHash',
        'network','proofsEnabled','blockNumber','blockHash','txHash','firstLog','logCount','compactFields','headerFields']);
      const snapshotFields = (value${t(': any')}, maximum${t(': number')}, minimum${t(': number')}) => {
        check(Array.isArray(value)); const length=natural(own(value,'length'),maximum,minimum);
        const copy${t(': string[]')}=[];
        for(let i=0;i<length;i++) {
          const item=own(value,String(i));
          check(typeof item==='string' && /^0x[0-9a-f]{64}$/.test(item) && BigInt(item)<RollingPageFr.MODULUS);
          copy.push(item);
        }
        return copy;
      };
      p.compactFields=snapshotFields(p.compactFields,24575,7);
      p.headerFields=snapshotFields(p.headerFields,23,23);
      // Exact canonical ASCII field representation has a bounded serialized size.
      // The future transport must separately stop streaming BEFORE JSON parsing.
      check((p.compactFields.length+p.headerFields.length)*69+2048<=2*1024*1024);
      const guard = exact(options, ['contextGuard']).contextGuard;
      check(typeof guard === 'function');
      for (const key of ['contractAddress','scope','expectedClassId','expectedArtifactHash','blockHash','txHash']) p[key] = field(p[key]);
      p.network = exact(p.network, ['chainId','version','rollup']);
      natural(p.network.chainId, Number.MAX_SAFE_INTEGER, 1); natural(p.network.version, 0xffffffff, 1);
      check(typeof p.network.rollup === 'string' && /^0x[0-9a-f]{40}$/.test(p.network.rollup));
      check(typeof p.proofsEnabled === 'boolean' && p.proofsEnabled === this.proverEnabled);
      natural(p.blockNumber, 0xffffffff, 1); natural(p.firstLog, RP_LOGS - 1);
      natural(p.logCount, 8, 1); check(p.firstLog + p.logCount <= RP_LOGS);
      const address = RollingPageAddress.fromFieldUnsafe(RollingPageFr.fromString(p.contractAddress)), scope = RollingPageAddress.fromFieldUnsafe(RollingPageFr.fromString(p.scope));
      const classId = RollingPageFr.fromString(p.expectedClassId), txHash = RollingPageTxHash.fromString(p.txHash);
      let validateCommit${t(': (() => Promise<void>) | undefined')};
      const beforeCommit = async () => {
        check(typeof validateCommit === 'function');
        await validateCommit${t('!')}();
      };
      await guard();
      return await this.operationQueue.runSynced(async ({changeSetId, anchorBlockHeader}) => {
        await guard();
        const anchor = RollingPageHeader.fromBuffer(RollingPageHeader.prototype.toBuffer.call(anchorBlockHeader));
        const anchorHash = (await anchor.hash()).toString();
        check(p.blockNumber <= anchor.getBlockNumber());
        const canonical = async () => {
          const info = await this.node.getNodeInfo();
          check(info.l1ChainId === p.network.chainId && info.rollupVersion === p.network.version &&
            info.l1ContractAddresses.rollupAddress.toString().toLowerCase() === p.network.rollup && info.realProofs === p.proofsEnabled);
          // NUMBER reads are deliberately uncached: hash-pinned history alone is
          // insufficient to establish that a previously observed fork is current.
          for (const [number, hash] of [[anchor.getBlockNumber(), anchorHash], [p.blockNumber, p.blockHash]]) {
            const data = await this.node.getBlockData(BlockNumber(number));
            check(data && data.blockHash.toString() === hash);
            const h = RollingPageHeader.fromBuffer(RollingPageHeader.prototype.toBuffer.call(data${t('!')}.header));
            check(h.getBlockNumber() === number && (await h.hash()).toString() === hash &&
              h.globalVariables.chainId.toBigInt() === BigInt(p.network.chainId) &&
              h.globalVariables.version.toBigInt() === BigInt(p.network.version));
          }
          const observed = await this.node.getContract(address, await anchor.toBlockParameter());
          check(observed);
          const instance = RollingPageInstance.fromBuffer(new RollingPageInstance(observed${t('!')}).toBuffer());
          check(instance.currentContractClassId.equals(classId) &&
            instance.originalContractClassId.equals(classId) &&
            (await computeContractAddressFromInstance(instance)).equals(address));
          await guard();
        };
        await canonical();
        const artifact = await this.contractStore.getContractArtifact(classId);
        check(artifact && artifact.name === 'RollingBoard');
        // Compute, do not trust a cached artifactHash property supplied by data.
        const artifactHash = await rollingPageArtifactHash(artifact${t('!')});
        check(artifactHash.toString() === p.expectedArtifactHash);
        const computedClass = await rollingPageClass({...artifact${t('!')}, artifactHash});
        check(computedClass.id.equals(classId));
        const call = await this.contractStore.getFunctionCall('recover_preference_page',
          [scope, txHash.hash, p.blockNumber, RollingPageFr.fromString(p.blockHash), p.firstLog, p.logCount], address, classId);
        check(call.type === FunctionType.UTILITY);
        const array = (value${t(': any')}, max${t(': number')}) => {
          check(Array.isArray(value) && value.length <= max); return value;
        };
        const effectBytes = (effect${t(': any')}) => {
          check(effect instanceof RollingPageEffect && effect.txHash.equals(txHash));
          array(effect.noteHashes, RP_NOTES); array(effect.nullifiers, RP_NULLIFIERS);
          array(effect.l2ToL1Msgs, RP_MESSAGES); array(effect.publicDataWrites, RP_WRITES);
          array(effect.privateLogs, RP_LOGS); array(effect.publicLogs, RP_PUBLIC_FIELDS / RP_PUBLIC_HEADER);
          array(effect.contractClassLogs, RP_CLASS_LOGS);
          for (const log of effect.privateLogs) {
            check(array(log.fields, RP_LOG_FIELDS).length === RP_LOG_FIELDS);
            natural(log.emittedLength, RP_LOG_FIELDS, 1); check(log.hasZeroPadding());
          }
          let publicFields = 0;
          for (const log of effect.publicLogs) {
            publicFields += array(log.fields, RP_PUBLIC_FIELDS).length + RP_PUBLIC_HEADER;
            check(publicFields <= RP_PUBLIC_FIELDS);
          }
          for (const log of effect.contractClassLogs) {
            check(array(log.fields.fields, RP_CLASS_FIELDS).length === RP_CLASS_FIELDS);
            natural(log.emittedLength, RP_CLASS_FIELDS, 1);
          }
          check(p.firstLog + p.logCount <= effect.privateLogs.length);
          // Counts are bounded before the first serialization/copy/hash.
          return RollingPageEffect.prototype.toBuffer.call(effect);
        };
        const receipt = await this.node.getTxReceipt(txHash, {includeTxEffect:true});
        check(receipt instanceof RollingPageReceipt && receipt.isMined() && receipt.txHash.equals(txHash) && receipt.blockNumber === p.blockNumber &&
          receipt.blockHash${t('!')}.toString() === p.blockHash && receipt.txEffect);
        const receiptFields = {status:own(receipt,'status'), executionResult:own(receipt,'executionResult'),
          transactionFee:own(receipt,'transactionFee'), blockNumber:p.blockNumber,
          slotNumber:own(receipt,'slotNumber'), txIndexInBlock:own(receipt,'txIndexInBlock'), epochNumber:own(receipt,'epochNumber')};
        check(['proposed','checkpointed','proven','finalized'].includes(receiptFields.status));
        check(['success','reverted'].includes(receiptFields.executionResult) && typeof receiptFields.transactionFee === 'bigint');
        natural(receiptFields.slotNumber,Number.MAX_SAFE_INTEGER); natural(receiptFields.epochNumber,Number.MAX_SAFE_INTEGER);
        natural(receiptFields.txIndexInBlock,6141);
        const bytes = effectBytes(receipt.txEffect);
        const effect = RollingPageEffect.fromBuffer(bytes);
        check(receiptFields.transactionFee === effect.transactionFee.toBigInt() &&
          receiptFields.executionResult === (effect.revertCode.isOK() ? 'success' : 'reverted'));
        const metadata = await this.node.getBlockData(BlockNumber(p.blockNumber));
        check(metadata && metadata.blockHash.toString() === p.blockHash);
        const header = RollingPageHeader.fromBuffer(RollingPageHeader.prototype.toBuffer.call(metadata${t('!')}.header));
        check((await header.hash()).toString() === p.blockHash && header.globalVariables.slotNumber === receiptFields.slotNumber);
        const witness = await this.node.getTxEffectMembershipWitness(txHash);
        check(witness && witness.blockNumber === p.blockNumber && witness.root.equals(header.txEffectsTreeRoot));
        const pathLength = witness${t('!')}.siblingPath.pathSize;
        natural(pathLength, 13);
        check(witness${t('!')}.siblingPath.toBufferArray().length === pathLength);
        const leafIndex=witness${t('!')}.leafIndex;
        check(typeof leafIndex==='bigint' && leafIndex>=0n && leafIndex<(1n<<BigInt(pathLength)));
        const pinnedWitness={leafIndex,siblingPath:new RollingPageSiblingPath(pathLength,witness${t('!')}.siblingPath.toBufferArray().map(value=>Buffer.from(value)))};
        check(await rollingPageVerifyWitness(await effect.computeTxEffectsTreeLeaf(), pinnedWitness, header.txEffectsTreeRoot));
        check(header.toFields().every((value,index)=>value.toString()===p.headerFields[index]));
        const verified = await rollingPageCompact({fields:p.compactFields,headerFields:p.headerFields,
          expectedBlockHash:p.blockHash,assertCanonical:async()=>{await canonical();return true;}});
        const selected=verified.ciphertexts.filter((log${t(': any')})=>log.txHash===p.txHash);
        check(selected.length===effect.privateLogs.length && selected.length>0);
        for(let i=0;i<selected.length;i++) {
          const emitted=effect.privateLogs[i].getEmittedFields();
          check(selected[i].txIndex===receiptFields.txIndexInBlock && selected[i].logIndex===i &&
            selected[i].fields.length===emitted.length && emitted.every((value,index)=>value.toString()===selected[i].fields[index]));
        }
        const detachedReceipt = () => RollingPageReceipt.from({...receiptFields, txHash:RollingPageTxHash.fromString(p.txHash), blockHash:RollingPageBlockHash.fromString(p.blockHash), txEffect:RollingPageEffect.fromBuffer(bytes),debugLogs:undefined});
        // Pin only the validated receipt inside this normal simulator instance.
        // All other methods retain the original node and receiver. No SDK/global
        // property is mutated and no arbitrary transaction is made available.
        const pinnedNode = new Proxy(this.node, {get(target, key) {
          if (key === 'getTxReceipt') return async (hash${t(': any')}, opts${t(': any')}) => {
            check(hash instanceof RollingPageTxHash && hash.equals(txHash) && exact(opts,['includeTxEffect']).includeTxEffect === true); return detachedReceipt();
          };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
        const simulator = new ContractFunctionSimulator({
          contractStore:this.contractStore, contractClassService:this.contractClassService,
          noteStore:this.noteStore, keyStore:this.keyStore, addressStore:this.addressStore,
          aztecNode:pinnedNode, l2TipsStore:this.l2TipsStore, senderTaggingStore:this.senderTaggingStore,
          recipientTaggingStore:this.recipientTaggingStore, taggingSecretSourcesStore:this.taggingSecretSourcesStore,
          capsuleStore:this.capsuleStore, factStore:this.factStore, privateEventStore:this.privateEventStore,
          simulator:this.simulator, contractSyncService:this.contractSyncService, txResolver:this.txResolver, hooks:this.hooks,
        });
        await guard();
        const result = await this.#executeUtility(simulator, call, [], [scope], anchor, changeSetId);
        check(result.offchainEffects.length === 0 && result.result.length === 1);
        const admitted = Number(result.result[0].toBigInt()); natural(admitted, p.logCount);
        validateCommit = async () => {
          await canonical();
          const after = await this.node.getTxReceipt(txHash, {includeTxEffect:true});
          check(after instanceof RollingPageReceipt && after.isMined() && after.txHash.equals(txHash) &&
            after.blockNumber === p.blockNumber && after.blockHash${t('!')}.toString() === p.blockHash &&
            after.txIndexInBlock === receiptFields.txIndexInBlock && after.slotNumber === receiptFields.slotNumber &&
            after.transactionFee === receiptFields.transactionFee && after.executionResult === receiptFields.executionResult && effectBytes(after.txEffect).equals(bytes));
          await guard();
        };
        await validateCommit();
        // The existing lifecycle repeats this closure AFTER all contributors
        // settle. No network await enters the KV transaction; a subsequent reorg
        // still requires canonical publication checks and normal orphan pruning.
        return Object.freeze({schemaVersion:1, processed:p.logCount, admitted});
      }, {beforeCommit});
    } catch { throw new Error('PXE_PREFERENCE_PAGE_FAILED'); }
  }
`;
}

function replaceOnce(source, from, to) {
  if(source.indexOf(from)<0 || source.indexOf(from)!==source.lastIndexOf(from))throw Error('PREFERENCE_PAGE_PATCH_LAYOUT');
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
export function transformPreferencePage(source, path) {
  const pin=PREFERENCE_PAGE_PINS.find(p=>p.path===path);
  if(!pin || typeof source!=='string' || sha(source)!==pin.before) throw Error('PREFERENCE_PAGE_PATCH_SOURCE');
  const ts=path.endsWith('.ts');let output;
  if(path.includes('operation_queue.'))output=transformQueue(source,ts);
  else if(path.includes('operation_lifecycle.'))output=transformLifecycle(source,ts);
  else {
    const needle=ts?'  public executeUtility(':'executeUtility(call, {';
    const at=source.indexOf(needle),offset=source.lastIndexOf('/**',at);
    if(offset<0)throw Error('PREFERENCE_PAGE_PATCH_LAYOUT');
    output=imports()+source.slice(0,offset)+method(ts)+source.slice(offset);
  }
  if(sha(output)!==pin.after)throw Error('PREFERENCE_PAGE_PATCH_OUTPUT');
  return output;
}

async function paths(root) {
  root=resolve(root);
  if(await realpath(root)!==root)throw Error('PREFERENCE_PAGE_PATCH_SYMLINK');
  return Promise.all(PREFERENCE_PAGE_PINS.map(async pin=>{
    const path=join(root,pin.path);
    if(!(await lstat(path)).isFile()||await realpath(path)!==path)throw Error('PREFERENCE_PAGE_PATCH_SYMLINK');
    return {pin,path,source:await readFile(path,'utf8')};
  }));
}
export async function inspectPreferencePage(root) {
  const files=await paths(root),states=files.map(({pin,source})=>sha(source)===pin.before?'original':sha(source)===pin.after?'patched':'unknown');
  if(states.includes('unknown')||states.some(s=>s!==states[0]))throw Error('PREFERENCE_PAGE_PATCH_STATE');
  const helper=join(resolve(root),PREFERENCE_PAGE_COMPACT_PIN.generated);
  let helperSource;
  try {if(!(await lstat(helper)).isFile()||await realpath(helper)!==helper)throw Error('PREFERENCE_PAGE_PATCH_SYMLINK');helperSource=await readFile(helper);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(states[0]==='patched' ? !helperSource||sha(helperSource)!==PREFERENCE_PAGE_COMPACT_PIN.sha256 : helperSource!==undefined)throw Error('PREFERENCE_PAGE_PATCH_STATE');
  return {state:states[0],files:files.map(({pin,source})=>({path:pin.path,sha256:sha(source)})),compact:helperSource?PREFERENCE_PAGE_COMPACT_PIN.sha256:null};
}
export async function patchPreferencePage(root) {
  // This prototype cannot install into a node_modules tree or the shared package
  // resolved from this workspace. Only explicit standalone copied packages.
  root=resolve(root);
  const installed=await realpath(fileURLToPath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url)));
  if(root===installed||root.startsWith(installed+sep)||root.split(sep).includes('node_modules'))throw Error('PREFERENCE_PAGE_PATCH_ISOLATED_ONLY');
  const files=await paths(root),state=await inspectPreferencePage(root);
  if(state.state==='patched')return state;
  const helper=await readFile(fileURLToPath(new URL('../'+PREFERENCE_PAGE_COMPACT_PIN.source,import.meta.url)));
  if(sha(helper)!==PREFERENCE_PAGE_COMPACT_PIN.sha256)throw Error('PREFERENCE_PAGE_COMPACT_SOURCE');
  const outputs=files.map(({pin,source})=>transformPreferencePage(source,pin.path));
  await writeFile(join(root,PREFERENCE_PAGE_COMPACT_PIN.generated),helper,{flag:'wx'});
  for(let i=0;i<files.length;i++)await writeFile(files[i].path,outputs[i]);
  return inspectPreferencePage(root);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,root,...rest]=process.argv.slice(2);
  if(!root||rest.length||!['--verify','--apply-isolated'].includes(mode))throw Error('PREFERENCE_PAGE_PATCH_USAGE');
  console.log(JSON.stringify(await (mode==='--verify'?inspectPreferencePage(root):patchPreferencePage(root))));
}
