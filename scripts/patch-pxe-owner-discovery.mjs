import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,writeFile,rename,chmod} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

// Explicit bootstrap for every PXE host. Only the new oracle opts out of native
// point-derived streams; tagging ranges, stores and native log processing remain.
export const OWNER_DISCOVERY_PINS=Object.freeze([
 Object.freeze({path:'dest/logs/log_service.js',before:'550699709c5616e58abc56886e9a99e428345aa0d76a56d1fbe6ea65be225aba',after:'87d55c2c112f34b0e7ee146525127faa806e3ce30834523693d694feeacb2d12'}),
 Object.freeze({path:'dest/contract_function_simulator/oracle/utility_execution_oracle.js',before:'c74cd5039138e457018b44f1ff5c76c099a2921455edd3a8078c383adbde930c',after:'04b8d0b24c6f20027db3212df8898e09ff744e6e72ebf24d98016f0aa2d59868'}),
 Object.freeze({path:'dest/contract_function_simulator/oracle/oracle_registry.js',before:'9f58bf12b859914a64d8f36830cdec037bba14a8d38ed8cfda5c2fe413e4e2a2',after:'8930e5f2503af3cd1a8a479eab53de4a1e21a4aeb69a415aa327cebbc7052a9b'}),
]);
const sha=data=>createHash('sha256').update(data).digest('hex');
const replace=(source,before,after)=>{if(source.split(before).length!==2)throw Error('OWNER_DISCOVERY_PATCH_LAYOUT');return source.replace(before,after);};
export function transformOwnerDiscovery(source,path){
 const pin=OWNER_DISCOVERY_PINS.find(pin=>pin.path===path);
 if(!pin||typeof source!=='string'||sha(source)!==pin.before)throw Error('OWNER_DISCOVERY_PATCH_SOURCE');
 let result=source;
 if(path.endsWith('/log_service.js')){
  result=replace(result,'async fetchTaggedLogs(contractAddress, recipient, providedSecrets) {','async fetchTaggedLogs(contractAddress, recipient, providedSecrets, providedOnly = false) {');
  result=replace(result,'...await this.#getPointDerivedSecrets(contractAddress, recipient),','...(providedOnly ? [] : await this.#getPointDerivedSecrets(contractAddress, recipient)),');
 }else if(path.endsWith('/utility_execution_oracle.js')){
  result=replace(result,'async getPendingTaggedLogsV2(scope, providedSecrets) {','async getPendingOwnerTaggedLogsV1(scope, providedSecrets) {\n        return this.getPendingTaggedLogsV2(scope, providedSecrets, true);\n    }\n    async getPendingTaggedLogsV2(scope, providedSecrets, providedOnly = false) {');
  result=replace(result,'fetchTaggedLogs(this.contractAddress, scope, secrets)','fetchTaggedLogs(this.contractAddress, scope, secrets, providedOnly)');
  result=withOwnerLogProgress(result);
 }else{
  result+='\n// Same native ABI and ephemeral return container; a distinct implementation opts into owner-only discovery.\nORACLE_REGISTRY.aztec_utl_getPendingOwnerTaggedLogsV1 = ORACLE_REGISTRY.aztec_utl_getPendingTaggedLogsV2;\n';
 }
 if(sha(result)!==pin.after)throw Error('OWNER_DISCOVERY_PATCH_OUTPUT');
 return result;
}
async function inspectFiles(packageRoot){
 const root=resolve(packageRoot),canonical=await realpath(root);
 if((await lstat(root)).isSymbolicLink()||root!==canonical)throw Error('OWNER_DISCOVERY_PATCH_PATH');
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(pkg.name!=='@aztec-labs/pxe'||pkg.version!=='6.0.0')throw Error('OWNER_DISCOVERY_PATCH_VERSION');
 const files=[];
 for(const pin of OWNER_DISCOVERY_PINS){
  const path=join(root,pin.path),actual=await realpath(path),stat=await lstat(path);
  if(!actual.startsWith(root+sep)||actual!==path||!stat.isFile())throw Error('OWNER_DISCOVERY_PATCH_PATH');
  const source=await readFile(path,'utf8'),hash=sha(source);
  if(hash!==pin.before&&hash!==pin.after)throw Error('OWNER_DISCOVERY_PATCH_SOURCE');
  files.push({pin,path,source,hash,mode:stat.mode&0o777});
 }
 return files;
}
export async function inspectOwnerDiscovery(root){
 const files=await inspectFiles(root),states=new Set(files.map(f=>f.hash===f.pin.after?'patched':'original'));
 return {state:states.size===1?[...states][0]:'mixed'};
}
export async function patchOwnerDiscovery(root){
 const files=await inspectFiles(root);
 // Qualify the complete transformation before changing any dependency file.
 const outputs=files.map(f=>({...f,output:f.hash===f.pin.after?f.source:transformOwnerDiscovery(f.source,f.pin.path)}));
 for(const f of outputs){
  if(f.hash===f.pin.after)continue;
  if(sha(await readFile(f.path))!==f.hash)throw Error('OWNER_DISCOVERY_PATCH_SOURCE');
  const temporary=f.path+'.owner-discovery-'+process.pid;
  await writeFile(temporary,f.output,{flag:'wx',mode:f.mode});await chmod(temporary,f.mode);await rename(temporary,f.path);
 }
 return inspectOwnerDiscovery(root);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,root]=process.argv.slice(2);if(!['--apply','--check'].includes(mode)||!root)throw Error('Usage: patch-pxe-owner-discovery.mjs --apply|--check <package>');
 console.log(JSON.stringify(await (mode==='--apply'?patchOwnerDiscovery(root):inspectOwnerDiscovery(root))));
}

// Completion metadata belongs in the native staged/retractable store, alongside
// the notes it describes. Keep only identities from the current native active
// window, never a height cursor: finality can expose previously unseen old logs.
function withOwnerLogProgress(source){
 source=replace(source,"import { Fr } from '@aztec-labs/foundation/curves/bn254';",`import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { sha256ToField } from '@aztec-labs/foundation/crypto/sha256';`);
 source=replace(source,'    offchainEffects = [];',`    offchainEffects = [];
    ownerDiscoveryProgress = new Map();`);
 source=replace(source,'        const retrievedLogs = await logService.fetchTaggedLogs(this.contractAddress, scope, secrets, providedOnly);',`        const fetchedLogs = await logService.fetchTaggedLogs(this.contractAddress, scope, secrets, providedOnly);
        const retrievedLogs = providedOnly ? await this.filterProcessedOwnerLogs(scope, secrets, fetchedLogs) : fetchedLogs;`);
 source=replace(source,'        this.#cacheValidationTxData(retrievedLogs);','        this.#cacheValidationTxData(fetchedLogs);');
 source=replace(source,'    #createLogService() {',`    async filterProcessedOwnerLogs(scope, secrets, logs) {
        const type = sha256ToField(Buffer.from('rolling.owner-discovery.processed.v1'));
        const secretSet = [...new Set(secrets.map(secret => secret.toString()))].sort();
        const key = new FactCollectionKey(this.contractAddress, { type: 'account', account: scope }, type,
            sha256ToField(Buffer.from(JSON.stringify(secretSet))));
        const anchor = this.anchorBlockHeader.getBlockNumber();
        const collection = await this.factService.getFactCollection(key,
            { provenBlockNumber: 0, finalizedBlockNumber: 0 }, this.changeSetId);
        const processed = new Set((collection?.facts ?? []).filter(fact => fact.factTypeId.equals(type) &&
            fact.originBlock && fact.originBlock.blockNumber <= anchor && fact.payload.length === 1)
            .map(fact => fact.payload[0].toString()));
        const records = new Map(), pending = [];
        for (const log of logs) {
            const digest = sha256ToField(Buffer.concat([log.txHash.toBuffer(), log.blockHash.toBuffer(),
                ...[new Fr(log.blockNumber), new Fr(log.txIndexInBlock), new Fr(log.logData.length), ...log.logData,
                    new Fr(log.noteHashes.length), ...log.noteHashes, new Fr(log.nullifiers.length), ...log.nullifiers]
                    .map(field => field.toBuffer())]));
            const id = digest.toString();
            if (!processed.has(id) && !records.has(id)) pending.push(log);
            records.set(id, { digest, origin: { blockNumber: log.blockNumber, blockHash: log.blockHash.toFr() } });
        }
        this.ownerDiscoveryProgress.set(key.toString(), { key, type, scope, records });
        return pending;
    }
    async commitProcessedOwnerLogs(scope) {
        for (const [id, progress] of this.ownerDiscoveryProgress) {
            if (!progress.scope.equals(scope)) continue;
            await this.factService.deleteFactCollection(progress.key, this.changeSetId);
            await allToCompletion([...progress.records.values()].map(({ digest, origin }) =>
                this.factService.recordFact(progress.key, progress.type, [digest], origin, this.changeSetId)));
            this.ownerDiscoveryProgress.delete(id);
        }
    }
    #createLogService() {`);
 source=replace(source,'        await this.#processValidationRequests(noteValidationRequests.readAll(this.ephemeralArrayService), eventValidationRequests.readAll(this.ephemeralArrayService), scope);',`        await this.#processValidationRequests(noteValidationRequests.readAll(this.ephemeralArrayService), eventValidationRequests.readAll(this.ephemeralArrayService), scope);
        // The owner hook runs the native partial-note FSM before this final
        // validation. Failure or later operation abort discards these facts too.
        await this.commitProcessedOwnerLogs(scope);`);
 return source;
}
