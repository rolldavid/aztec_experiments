import {createHash} from 'node:crypto';
import {validatedPxeProve} from './pxe-validated-prove.mjs';
import {beginProofSpan} from '../shared/proof-timings.mjs';
export const PXE_STARTUP_PINS={
  "node_modules/@aztec-labs/pxe/dest/entrypoints/client/lazy/utils.js": "de2efadead22a3c7110375cfcafe39530cd40b6784625fa02cd97f54260216de",
  "node_modules/@aztec-labs/pxe/dest/pxe.js": "02dbb8da2a09982cf678a014e8438f5b17f2310af5691b94743a4dfa38cd9375",
  "node_modules/@aztec-labs/pxe/dest/storage/contract_store/contract_store.js": "576e84a81a19536b803d9a7af45ebd81191fb1017fc4ed54155ad1fd4341b75c",
  "node_modules/@aztec-labs/stdlib/dest/contract/contract_class.js": "bf70ecdc38227e239c645e7d6ddb9b4eb8682ff1a84f680fa1c6c4cc90228eab"
};
const sha=value=>createHash('sha256').update(value).digest('hex');
function replace(source,before,after){if(source.split(before).length!==2)throw Error('PXE startup boundary mismatch');return source.replace(before,after);}
export function efficientPxeStartup(original,name){
 if(sha(original)!==PXE_STARTUP_PINS[name])throw Error('PXE startup source mismatch');
 let source=original;
 if(name.endsWith('/entrypoints/client/lazy/utils.js')){
  source="import {readPXEConstruction as rollingCreationInfo,readPXEStartup as rollingCreationStartup,startupProtocolProvider as rollingProtocolProvider,startupPreloadedContracts as rollingPreloadedContracts} from 'rolling:pxe-startup';\nimport {contractArtifactToBuffer as rollingArtifactBytes} from '@aztec-labs/stdlib/abi';\n"+source;
  source=replace(source,'const { l1ChainId, l1ContractAddresses, rollupVersion } = await aztecNode.getNodeInfo();','const { l1ChainId, l1ContractAddresses, rollupVersion } = options.rollingConstruction ? rollingCreationInfo(options.rollingConstruction, aztecNode) : await aztecNode.getNodeInfo();');
  source=replace(source,'const protocolContractsProvider = new LazyProtocolContractsProvider();',`const rollingStartup=options.rollingConstruction?rollingCreationStartup(options.rollingConstruction,aztecNode):undefined;
    const protocolContractsProvider = rollingStartup?.protocolContractsProvider ?? rollingProtocolProvider(new LazyProtocolContractsProvider(), rollingArtifactBytes);`);
  source=replace(source,'options.preloadedContractsProvider ?? {','options.preloadedContractsProvider ?? rollingStartup?.preloadedContractsProvider ?? {');
  source=replace(source,`getPreloadedContracts: async ()=>[
                await getStandardMultiCallEntrypoint(),
                await getStandardAuthRegistry(),
                await getStandardHandshakeRegistry()
            ]`, `getPreloadedContracts: async ()=>rollingPreloadedContracts([
                getStandardMultiCallEntrypoint(), getStandardAuthRegistry(), getStandardHandshakeRegistry()
            ], rollingArtifactBytes)`);
  source=replace(source,'node: aztecNode,\n        nodeDebug:','node: aztecNode,\n        rollingConstruction: options.rollingConstruction,\n        nodeDebug:');
 }else if(name.endsWith('/dest/pxe.js')){
  // Compose after the existing pinned transform, preserving every proof/sync
  // guard and any reviewed account initialization extension it installs.
  source=validatedPxeProve(original);
  source="import {readPXEConstruction as rollingCreationInfo,readPXEStartup as rollingCreationStartup} from 'rolling:pxe-startup';\n"+source;
  source=replace(source,'static async create({ node, nodeDebug,','static async create({ node, rollingConstruction, nodeDebug,');
  source=replace(source,'const info = await node.getNodeInfo();','const info = rollingConstruction ? rollingCreationInfo(rollingConstruction, node) : await node.getNodeInfo();');
  source=replace(source,'const initialBlockHash = (await node.getBlock(BlockNumber.ZERO))?.hash ?? GENESIS_BLOCK_HEADER_HASH;',`const rollingStartup=rollingConstruction?rollingCreationStartup(rollingConstruction,node):undefined;
        const initialBlockHash = rollingStartup ? rollingStartup.initialBlockHash : (await node.getBlock(BlockNumber.ZERO))?.hash ?? GENESIS_BLOCK_HEADER_HASH;`);
 }else if(name.endsWith('/storage/contract_store/contract_store.js')){
  source="import {retainedContractClass as rollingRetainedClass,sameRegisteredBytes as rollingRegisteredBytes} from 'rolling:pxe-startup';\n"+source;
  source+=`\nconst rollingRegistrationSpan=${beginProofSpan.toString()};
function rollingRegistrationBytes(artifact){const finish=rollingRegistrationSpan('native.phase.registration-serialize');try{return contractArtifactToBuffer(artifact);}finally{finish();}}
async function rollingRegistrationRead(stage,operation){const finish=rollingRegistrationSpan(stage);try{return await operation();}finally{finish();}}\n`;
  source=replace(source,'const contractClass = contractClassWithIdAndPreimage ?? await getContractClassFromArtifact(contract);',`const artifactBytes = rollingRegistrationBytes(contract);
        const rollingCachedClass = contractClassWithIdAndPreimage ? undefined : await rollingRegistrationRead('native.phase.registration-class-cache',()=>rollingRetainedClass(contract,artifactBytes));
        const contractClass = contractClassWithIdAndPreimage ?? rollingCachedClass ?? await rollingRegistrationRead('native.phase.registration-class-derive',()=>getContractClassFromArtifact(contract));
        // A memo hit authenticates the original snapshot, including utility code.
        // Store that same snapshot/class; the final fence still rejects mutation.
        if(!rollingCachedClass && !rollingRegistrationBytes(contract).equals(artifactBytes))throw Error('PXE artifact changed during registration');`);
  source=replace(source,`if (this.#contractArtifactCache.has(key)) {
            return contractClass.id;
        }`,`if (this.#contractArtifactCache.has(key)) {
            if(rollingCachedClass && !rollingRegistrationBytes(contract).equals(artifactBytes))throw Error('PXE artifact changed during registration');
            return contractClass.id;
        }`);
  // Native-derived or byte-authenticated class records already contain every
  // private selector. Preserve the original artifact validation for caller-
  // supplied classes, whose provenance this method deliberately does not check.
  source=replace(source,'const privateSelectors = await allToCompletion(privateFunctions.map(async (fn)=>(await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)).toString()));',`const privateSelectors = contractClassWithIdAndPreimage
            ? await allToCompletion(privateFunctions.map(async (fn)=>(await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)).toString()))
            : contractClass.privateFunctions.map(fn=>fn.selector.toString());`);
  source=replace(source,`this.#contractArtifactCache.set(key, contract);
        await this.#store.transactionAsync(async ()=>{
            await this.#contractArtifacts.set(key, contractArtifactToBuffer(contract));
            await this.#contractClassData.set(key, new SerializableContractClassData(contractClass).toBuffer());
        });`, `const classBytes = new SerializableContractClassData(contractClass).toBuffer();
        const [storedArtifact,storedClass] = await rollingRegistrationRead('native.phase.registration-stored-read',()=>this.#store.transactionAsync(async ()=>[
            await this.#contractArtifacts.getAsync(key),await this.#contractClassData.getAsync(key)
        ]));
        if (!rollingRegisteredBytes(artifactBytes,classBytes,storedArtifact,storedClass)) {
            await rollingRegistrationRead('native.phase.registration-stored-write',()=>this.#store.transactionAsync(async ()=>{
                await this.#contractArtifacts.set(key,artifactBytes);
                await this.#contractClassData.set(key,classBytes);
            }));
        }
        if(!rollingRegistrationBytes(contract).equals(artifactBytes))throw Error('PXE artifact changed during registration');
        this.#contractArtifactCache.set(key, contract);`);
  source=replace(source,`await this.#contractInstances.set(contract.address.toString(), new SerializableContractInstancePreimage(contract).toBuffer());`, `const key=contract.address.toString(),bytes=new SerializableContractInstancePreimage(contract).toBuffer();
            const stored=await this.#contractInstances.getAsync(key);
            if (!stored || !bytes.equals(stored)) await this.#contractInstances.set(key,bytes);`);
 }else if(name.endsWith('/contract/contract_class.js')){
  source="import {retainedContractClass as rollingRetainedClass,rememberContractClass as rollingRememberClass,forgetContractClass as rollingForgetClass} from 'rolling:pxe-startup';\n"+source;
  source=replace(source,"import { FunctionSelector, FunctionType } from '../abi/index.js';","import { FunctionSelector, FunctionType, contractArtifactToBuffer } from '../abi/index.js';");
  source=replace(source,'export async function getContractClassFromArtifact(artifact) {',`export async function getContractClassFromArtifact(artifact) {
    const rollingBytes=contractArtifactToBuffer(artifact),rollingCached=await rollingRetainedClass(artifact,rollingBytes);
    if(rollingCached){if(!contractArtifactToBuffer(artifact).equals(rollingBytes)){rollingForgetClass(artifact);throw Error('PXE artifact changed during class reuse');}return rollingCached;}`);
  source=replace(source,`return {
        ...contractClass,
        ...await computeContractClassIdWithPreimage(contractClass)
    };`, `const rollingDerived={
        ...contractClass,
        ...await computeContractClassIdWithPreimage(contractClass)
    };
    if(!contractArtifactToBuffer(artifact).equals(rollingBytes))throw Error('PXE artifact changed during class derivation');
    await rollingRememberClass(artifact,rollingBytes,rollingDerived,contractArtifactToBuffer);
    if(!contractArtifactToBuffer(artifact).equals(rollingBytes)){rollingForgetClass(artifact);throw Error('PXE artifact changed during class derivation');}
    return rollingDerived;`);
 }else throw Error('PXE startup input not supported');
 return source;
}
