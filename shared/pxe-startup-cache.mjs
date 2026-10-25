// Owned by one SDK realm. Construction metadata is never a node-wide cache.
const constructions=new WeakMap(),classes=new WeakMap();
const invalid=()=>Error('PXE startup provenance mismatch');
const BUILTIN_CLASS_PINS={
  "644ccbc1f171fc2f05af79d65f028816afcf8f4c09f036c7106893c59e71ca13": "dcdb621da0ee77521c128fc3b9a0c34321ecb21233e2d5fed44c44108631c411",
  "a3c8a5d28ac457a014d2a20aa69fc2d3155a4d2d18018b4e7b6ccbc6776d3b89": "53715ff0ed3161bbedeed160aac8b2aca2de497ada6359177388730a460527ea",
  "20549595986c0558f8f4340fd694fa20e0da858890f65ecd488de24bd9d7003c": "9f4dd115ba1fd644c9eaad3e461808cdb7547117a62bc3e2b000f76066c8e24b",
  "d803f97ba930c96a4501c311d822253840b288547fde7e06c915b7e99efbef4a": "dacdd4faa624e5d574ab24ffa5e26b7dc171408e70872d44017153da88b1d2d8",
  "351402c985df2638d988e88c416e125ef0caffe22b0e6a15825cedaf80202fac": "5581fc3ed9ea3cecd4728652945cc6c840efc6a6a90cc0a59f9932d53ddc1f7b",
  "1fd7c21d806bd026336862ce2eaa743bca5a946bb6726854d8029354f55a9c0d": "30b0be9464afca4588a487c6c27a7fd461508ef85de4cdc986b2cbea7f3a30e8"
};
const equal=(a,b)=>a.length===b.length&&(typeof a.equals==='function'?a.equals(b):a.every((value,i)=>value===b[i]));
export function forgetContractClass(artifact){classes.delete(artifact);}
export function nativeClassBytes(value){return new TextEncoder().encode(JSON.stringify({version:value.version,id:value.id.toString(),artifactHash:value.artifactHash.toString(),privateFunctionsRoot:value.privateFunctionsRoot.toString(),publicBytecodeCommitment:value.publicBytecodeCommitment.toString(),privateFunctions:value.privateFunctions.map(fn=>({selector:fn.selector.toString(),vkHash:fn.vkHash.toString()})),packedBytecode:Array.from(value.packedBytecode)}));}
export async function beginPXEConstruction(node){
 const info=await node.getNodeInfo(),handle=Object.freeze({});
 constructions.set(handle,{node,info});return handle;
}
export function readPXEConstruction(handle,node){
 const value=constructions.get(handle);if(!value||value.node!==node)throw invalid();return value.info;
}
export function endPXEConstruction(handle){constructions.delete(handle);}

async function digest(bytes){
 return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}
// Class records are small compared with artifacts. Detach native value objects
// so a caller cannot mutate a cached class through a returned Fr/selector/buffer.
function copy(value){
 if(value===null||typeof value!=='object')return value;
 if(ArrayBuffer.isView(value))return value.constructor.from(value);
 if(value instanceof ArrayBuffer)return value.slice(0);
 const result=Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));
 for(const key of Object.keys(value))result[key]=copy(value[key]);return result;
}
export async function retainedContractClass(artifact,bytes){
 const cached=classes.get(artifact);if(!cached||cached.digest!==await digest(bytes))return undefined;
 return copy(cached.value);
}
// Called only by the pinned native class factory or bundled protocol/standard
// providers. The full serialized artifact binds reuse, including utility code.
export async function rememberContractClass(artifact,bytes,value,serialize){
 const detached=copy(value),hash=await digest(bytes);
 if(!equal(serialize(artifact),bytes)){classes.delete(artifact);throw invalid();}
 classes.set(artifact,{digest:hash,value:detached});return value;
}
async function rememberBuiltinContract(value,serialize){
 const bytes=serialize(value.artifact),classBytes=nativeClassBytes(value.contractClass),detached=copy(value.contractClass);
 const [hash,classHash]=await Promise.all([digest(bytes),digest(classBytes)]);
 if(BUILTIN_CLASS_PINS[hash]!==classHash||!equal(serialize(value.artifact),bytes)||!equal(nativeClassBytes(value.contractClass),classBytes))throw invalid();
 classes.set(value.artifact,{digest:hash,value:detached});return value;
}
export function startupProtocolProvider(provider,serialize){
 return {async getProtocolContractArtifact(name){
  const value=await provider.getProtocolContractArtifact(name);
  await rememberBuiltinContract(value,serialize);return value;
 }};
}
export async function startupPreloadedContracts(pending,serialize){
 const settled=await Promise.allSettled(pending),failure=settled.find(value=>value.status==='rejected');if(failure)throw failure.reason;
 const contracts=settled.map(value=>value.value);
 const remembered=await Promise.allSettled(contracts.map(value=>rememberBuiltinContract(value,serialize)));
 const failed=remembered.find(value=>value.status==='rejected');if(failed)throw failed.reason;return contracts;
}
export async function sameRegisteredBytes(artifact,classData,storedArtifact,storedClass){
 if(!storedArtifact||!storedClass||artifact.length!==storedArtifact.length||classData.length!==storedClass.length)return false;
 const values=await Promise.all([digest(artifact),digest(storedArtifact),digest(classData),digest(storedClass)]);
 return values[0]===values[1]&&values[2]===values[3];
}
