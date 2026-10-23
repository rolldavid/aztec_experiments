import {createHash} from 'node:crypto';
import {PREFERENCE_PAGE_PINS} from './patch-pxe-preference-page.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function replace(source,before,after){if(source.split(before).length!==2)throw Error('PXE validated proof boundary mismatch');return source.replace(before,after);}

// Build-time transforms for the pinned native SDK. The native queue still owns
// sync, anchor, staged writes, failure discard and final tagging persistence.
export function validatedPxeProve(source){
 if(sha(source)!==PREFERENCE_PAGE_PINS.find(pin=>pin.path==='dest/pxe.js').after)throw Error('PXE validated proof source mismatch');
 source=replace(source,'}, txRequest, privateExecutionResult) {\n        const { publicInputs, chonkProof, executionSteps, timings: { proving } = {} } = await this.#prove',`}, txRequest, privateExecutionResult, validatePublic = false) {
        let validationTime;
        const beforeProof = validatePublic ? async publicInputs => {
            const timer = new Timer();
            await this.#validateKernelPublicInputs(txRequest, privateExecutionResult, publicInputs);
            validationTime = timer.ms();
        } : undefined;
        const { publicInputs, chonkProof, executionSteps, timings: { proving } = {} } = await this.#prove`);
 source=replace(source,`            simulate: false,
            skipFeeEnforcement: false,
            profileMode: 'none'
        });`, `            simulate: false,
            skipFeeEnforcement: false,
            profileMode: 'none',
            beforeProof
        });`);
 source=replace(source,`            proving,
            perFunction,
            unaccounted: totalTime - ((syncTime ?? 0) + (proving ?? 0) + perFunction.reduce((acc, { time })=>acc + time, 0))`, `            proving,
            validation: validationTime,
            perFunction,
            unaccounted: totalTime - ((syncTime ?? 0) + (proving ?? 0) + (validationTime ?? 0) + perFunction.reduce((acc, { time })=>acc + time, 0))`);
 source=replace(source,'    // Public API\n',`    // Validate actual kernel output before expensive proof generation. No
    // synthetic kernel implementation or second private execution is involved.
    async #validateKernelPublicInputs(txRequest, privateExecutionResult, publicInputs) {
        const simulatedTx = await new PrivateSimulationResult(privateExecutionResult, publicInputs).toSimulatedTx();
        const output = publicInputs.forPublic ? await this.#simulatePublicCalls(simulatedTx, false) : undefined;
        if (publicInputs.forPublic && (!output?.txEffect?.revertCode?.isOK() || output.revertReason)) {
            throw Object.assign(new Error('Transaction public validation failed'), {code:'BB_SIMULATION_FAILED'});
        }
        const gas = output?.gasUsed;
        const limits = txRequest.txContext.gasSettings;
        if (['daGas', 'l2Gas'].some(key => (gas?.totalGas ?? publicInputs.gasUsed)[key] > limits.gasLimits[key] || (gas?.teardownGas[key] ?? 0) > limits.teardownGasLimits[key])) {
            throw Object.assign(new Error('Transaction exceeds its fixed gas limits'), {code:'BB_GAS_LIMIT_EXCEEDED'});
        }
        const validation = await this.node.isValidTx(simulatedTx, {isSimulation: true, skipFeeEnforcement: false});
        if (validation.result !== 'valid') throw Object.assign(new Error('Transaction preflight validation failed'), {code:'BB_SIMULATION_FAILED'});
    }
    // Public API
`);
 source=replace(source,'    // Public API\n',`    // Explicit capability: old SDKs must not silently ignore validation.\n    proveTxWithPublicValidation(txRequest, options) {\n        return this.proveTx(txRequest, {...options, validatePublic: true});\n    }\n    // Public API\n`);
 source=replace(source,'*/ proveTx(txRequest, { scopes, senderForTags }) {',`*/ proveTx(txRequest, { scopes, senderForTags, validatePublic = false }) {
        if (typeof validatePublic !== 'boolean') throw new Error('Invalid public validation option');`);
 source=replace(source,'return this.#proveTx(ctx, txRequest, privateExecutionResult);','return this.#proveTx(ctx, txRequest, privateExecutionResult, validatePublic);');
 return source;
}
export function validatedKernelProve(source){
 if(sha(source)!=='97adb6e5c1b396b4edaa170ce9c2da6f9d5ff96c71c2014da70b8361da6cfad2')throw Error('Kernel validated proof source mismatch');
 source="import {PrivateKernelTailCircuitPublicInputs} from '@aztec-labs/stdlib/kernel';\n"+source;
 source=replace(source,'{ simulate, skipFeeEnforcement, profileMode } = {','{ simulate, skipFeeEnforcement, profileMode, beforeProof } = {');
 source=replace(source,'        const skipProofGeneration = this.fakeProofs || simulate;',`        if (beforeProof !== undefined && typeof beforeProof !== 'function') throw new Error('Invalid pre-proof validation hook');
        const skipProofGeneration = this.fakeProofs || simulate;`);
 source=replace(source,'        let chonkProof;',`        // Validation receives a detached SDK value. It cannot rewrite the
        // authoritative kernel output or witnesses subsequently proved.
        if (beforeProof) await beforeProof(PrivateKernelTailCircuitPublicInputs.fromBuffer(tailOutput.publicInputs.toBuffer()));
        let chonkProof;`);
 return source;
}
