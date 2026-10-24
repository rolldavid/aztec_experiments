import {createHash} from 'node:crypto';
import {beginProofSpan} from '../shared/proof-timings.mjs';
export const KERNEL_WORK_PINS=Object.freeze({
 'node_modules/@aztec-labs/bb-prover/dest/prover/client/bb_private_kernel_prover.js':'81319f91bbcfdb86b0045f52675d89e8ba0a0069244446022643271aeaee4296',
 'node_modules/@aztec-labs/noir-protocol-circuits-types/dest/execution/client.js':'ac317957962fc6ca302320d01c7299826a705066fbc394784ffa23ea4c9ea402',
});
// Build-only: the pinned native ABI converters and ACVM still produce every
// witness. Only disabled diagnostics lose their eagerly computed arguments.
export function efficientKernelWitnessWork(source,path){
 if(!Object.hasOwn(KERNEL_WORK_PINS,path)||createHash('sha256').update(source).digest('hex')!==KERNEL_WORK_PINS[path])throw Error('Kernel witness work source mismatch');
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Kernel witness work boundary mismatch');source=source.replace(before,after);};
 if(path.endsWith('/execution/client.js')){
  replace("import { pushTestData } from '@aztec-labs/foundation/testing';","import { pushTestData, isGenerateTestDataEnabled } from '@aztec-labs/foundation/testing';");
  for(const name of ['private-kernel-reset-tail','private-kernel-reset-tail-to-public']){
   replace(`    pushTestData('${name}', {`,`    if (isGenerateTestDataEnabled()) pushTestData('${name}', {`);
  }
  return source;
 }
 const start=source.indexOf('    async generateCircuitOutput('),end=source.indexOf('    async makeEmptyKernelSimulateOutput(',start);
 if(start<0||end<0)throw Error('Kernel witness generation boundary mismatch');
 const original=source.slice(start,end);
 let output=original;
 const change=(before,after)=>{if(output.split(before).length!==2)throw Error('Kernel witness stage boundary mismatch');output=output.replace(before,after);};
 change('await this.artifactProvider.getClientCircuitArtifactByName(circuitType)',"await rollingKernelAsync('artifact',()=>this.artifactProvider.getClientCircuitArtifactByName(circuitType))");
 change('convertInputs(inputs, compiledCircuit.abi)',"rollingKernelSync('input-abi',()=>convertInputs(inputs, compiledCircuit.abi))");
 change('await this.simulator.executeProtocolCircuitToWitness(witnessMap, compiledCircuit, foreignCallHandler)',"await rollingKernelAsync('acvm',()=>this.simulator.executeProtocolCircuitToWitness(witnessMap, compiledCircuit, foreignCallHandler))");
 change('convertOutputs(outputWitness.witness, compiledCircuit.abi)',"rollingKernelSync('output-abi',()=>convertOutputs(outputWitness.witness, compiledCircuit.abi))");
 const debug=output.slice(output.indexOf('        this.log.debug(`Generated witness'),output.indexOf('        const verificationKey'));
 if(!debug.includes('inputSize: inputs.toBuffer().length')||!debug.includes('outputSize: output.toBuffer().length'))throw Error('Kernel debug boundary mismatch');
 // Preserve custom loggers that do not expose level inspection. The native
 // logger and the application's silent logger both implement this method.
 output=output.replace(debug,`        if (this.log.isLevelEnabled?.('debug') !== false) rollingKernelSync('debug-serialization',()=>{\n${debug}        });\n`);
 change('await this.artifactProvider.getCircuitVkByName(circuitType)',"await rollingKernelAsync('verification-key',()=>this.artifactProvider.getCircuitVkByName(circuitType))");
 change("Buffer.from(compiledCircuit.bytecode, 'base64')","rollingKernelSync('bytecode',()=>Buffer.from(compiledCircuit.bytecode, 'base64'))");
 source=source.slice(0,start)+output+source.slice(end);
 // The outer native kernel-body span remains authoritative. These disjoint
 // children explain it; no circuit names, fields or witness values are emitted.
 return `const rollingKernelSpan=${beginProofSpan.toString()};
function rollingKernelStart(stage){try{if(globalThis[Symbol.for('rolling.proof.profile')]===true)return rollingKernelSpan('native.phase.kernel-'+stage);}catch{}return ()=>{};}
function rollingKernelSync(stage,work){const finish=rollingKernelStart(stage);try{return work();}finally{finish();}}
async function rollingKernelAsync(stage,work){const finish=rollingKernelStart(stage);try{return await work();}finally{finish();}}
`+source;
}
