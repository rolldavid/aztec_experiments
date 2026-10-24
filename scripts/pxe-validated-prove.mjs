import {beginProofSpan} from '../shared/proof-timings.mjs';
import {createHash} from 'node:crypto';
import {ORDINARY_POST_GAS_PROFILE} from '../shared/ordinary-post-fees.mjs';
import {PREFERENCE_PAGE_PINS} from './patch-pxe-preference-page.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function replace(source,before,after){if(source.split(before).length!==2)throw Error('PXE validated proof boundary mismatch');return source.replace(before,after);}

// Build-time transforms for the pinned native SDK. The native queue still owns
// sync, anchor, staged writes, failure discard and final tagging persistence.
export function validatedPxeProve(source){
 if(sha(source)!==PREFERENCE_PAGE_PINS.find(pin=>pin.path==='dest/pxe.js').after)throw Error('PXE validated proof source mismatch');
 source="import {DefaultAccountEntrypoint as SyncAccountEntrypoint} from '@aztec-labs/entrypoints/account';\nimport {EncodedAppEntrypointCalls as SyncEncodedCalls} from '@aztec-labs/entrypoints/encoding';\nimport {FunctionCall as SyncFunctionCall,FunctionSelector as SyncSelector,encodeArguments as syncEncodeArguments,decodeEachFromAbi as syncDecodeArguments} from '@aztec-labs/stdlib/abi';\nimport {HashedValues as SyncHashedValues} from '@aztec-labs/stdlib/tx';\nimport {AztecAddress as SyncAddress} from '@aztec-labs/stdlib/aztec-address';\nimport {Fr as SyncFr} from '@aztec-labs/foundation/curves/bn254';\nimport {CircuitKind} from '@aztec-foundation/bb.js';\n"+source;
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
            privateWitness: executionSteps.filter(step => step.kind === CircuitKind.App).reduce((total, step) => total + step.timings.witgen, 0),
            kernelWitness: executionSteps.filter(step => step.kind === CircuitKind.Kernel || step.kind === CircuitKind.HidingKernel).reduce((total, step) => total + step.timings.witgen, 0),
            perFunction,
            unaccounted: totalTime - ((syncTime ?? 0) + (proving ?? 0) + (validationTime ?? 0) + perFunction.reduce((acc, { time })=>acc + time, 0))`);
 source=replace(source,'    // Public API\n',`    // Validate actual kernel output before expensive proof generation. No
    // synthetic kernel implementation or second private execution is involved.
    async #validateKernelPublicInputs(txRequest, privateExecutionResult, publicInputs) {
        const simulatedTx = await new PrivateSimulationResult(privateExecutionResult, publicInputs).toSimulatedTx();
        // Both checks consume the same detached transaction and are read-only.
        // Drain both before failing; native proof generation still starts only
        // after public execution, gas and admission have all succeeded.
        const results = await Promise.allSettled([
            () => publicInputs.forPublic ? this.#simulatePublicCalls(simulatedTx, false) : undefined,
            () => this.node.isValidTx(simulatedTx, {isSimulation: true, skipFeeEnforcement: false}),
        ].map(read => Promise.resolve().then(read)));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        const output = results[0].value;
        if (publicInputs.forPublic && (!output?.txEffect?.revertCode?.isOK() || output.revertReason)) {
            throw Object.assign(new Error('Transaction public validation failed'), {code:'BB_SIMULATION_FAILED'});
        }
        const gas = output?.gasUsed;
        const limits = txRequest.txContext.gasSettings;
        if (['daGas', 'l2Gas'].some(key => (gas?.totalGas ?? publicInputs.gasUsed)[key] > limits.gasLimits[key] || (gas?.teardownGas[key] ?? 0) > limits.teardownGasLimits[key])) {
            throw Object.assign(new Error('Transaction exceeds its fixed gas limits'), {code:'BB_GAS_LIMIT_EXCEEDED'});
        }
        const validation = results[1].value;
        if (validation.result !== 'valid') throw Object.assign(new Error('Transaction preflight validation failed'), {code:'BB_SIMULATION_FAILED'});
    }
    // Public API
`);
 source=replace(source,'    // Public API\n',`    // Explicit capability: old SDKs must not silently ignore validation.\n    proveTxWithPublicValidation(txRequest, options) {\n        return this.proveTx(txRequest, {...options, validatePublic: true});\n    }\n    // Public API\n`);
 source=replace(source,'*/ proveTx(txRequest, { scopes, senderForTags }) {',`*/ proveTx(txRequest, { scopes, senderForTags, validatePublic = false, preSyncCalls }) {
        if (typeof validatePublic !== 'boolean') throw new Error('Invalid public validation option');
        if (preSyncCalls !== undefined) {
            if (!validatePublic || !Array.isArray(preSyncCalls) || preSyncCalls.length !== 2) throw new Error('Invalid ordinary sync payload');
            // Detach the exact calls before the native operation queue can yield.
            preSyncCalls = preSyncCalls.map(call => SyncFunctionCall.from({name:call.name,
                to:SyncAddress.fromStringUnsafe(call.to.toString()),selector:SyncSelector.fromString(call.selector.toString()),
                type:call.type,hideMsgSender:call.hideMsgSender,isStatic:call.isStatic,
                args:call.args.map(value=>SyncFr.fromString(value.toString()))}));
        }`);
 source=replace(source,`            privateExecutionResult = await this.#executePrivate({
                contractFunctionSimulator,
                txRequest,
                anchorBlockHeader: ctx.anchorBlockHeader,`, `            if (preSyncCalls) await this.#syncOrdinaryPostCalls(txRequest, preSyncCalls, contractFunctionSimulator, ctx, scopes);
            privateExecutionResult = await this.#executePrivate({
                contractFunctionSimulator,
                txRequest,
                anchorBlockHeader: ctx.anchorBlockHeader,`);
 source=replace(source,'    // Public API\n',`    // Known ordinary calls enter the SAME native staged operation. They are
    // bound to the actual account request before any contract state is touched.
    // Native private execution and its normal sync checks still run once after.
    async #syncOrdinaryPostCalls(txRequest, calls, simulator, ctx, scopes) {
        const check=value=>{if(!value)throw new Error('Invalid ordinary sync payload');};
        const profile=${JSON.stringify(ORDINARY_POST_GAS_PROFILE)};
        check(calls[0].name==='pay_fee' && calls[1].name==='post' &&
            calls[0].selector.toString()==='0xc8772dde' && calls[1].selector.toString()===profile.postSelector &&
            calls.every(call=>call.type==='private' && call.hideMsgSender===false && call.isStatic===false));
        const abi=new SyncAccountEntrypoint(txRequest.origin, undefined).getEntrypointAbi();
        check(txRequest.functionSelector.equals(await SyncSelector.fromNameAndParameters(abi.name,abi.parameters)));
        const entries=txRequest.argsOfCalls.filter(args=>args.hash.equals(txRequest.firstCallArgsHash));
        check(entries.length===1);
        const entry=entries[0],decoded=syncDecodeArguments(abi.parameters.map(parameter=>parameter.type),entry.values);
        const encoded=await SyncEncodedCalls.create(calls,new SyncFr(decoded[0].tx_nonce));
        const fields=syncEncodeArguments(abi,[encoded,decoded[1],decoded[2]]);
        check(fields.length===entry.values.length && fields.every((value,index)=>value.equals(entry.values[index])) &&
            (await SyncHashedValues.fromArgs(fields)).hash.equals(txRequest.firstCallArgsHash));
        const targets=[{address:txRequest.origin,selector:txRequest.functionSelector,classId:profile.accountClassId},
            {address:calls[0].to,selector:calls[0].selector,classId:profile.privateFeeClassId},
            {address:calls[1].to,selector:calls[1].selector,classId:profile.boardClassId}];
        check(new Set(targets.map(target=>target.address.toString())).size===3);
        // Resolve current classes through the same native anchor-pinned cache
        // used by syncScope. Unknown or upgraded contracts never get prefetched.
        await allToCompletion(targets.map(async target=>check((await this.contractClassService.getCurrentClassId(target.address,ctx.anchorBlockHeader))?.toString()===target.classId)));
        await allToCompletion(targets.map(target=>this.contractSyncService.ensureContractSynced({
            contract:target.address,functionToInvokeAfterSync:target.selector,
            utilityExecutor:(call,execScopes)=>this.#executeUtility(simulator,call,[],execScopes,ctx.anchorBlockHeader,ctx.changeSetId),
            anchorBlockHeader:ctx.anchorBlockHeader,changeSetId:ctx.changeSetId,scopes,triggeredBy:undefined,
        })));
    }
    // Public API\n`);
 source=replace(source,'return this.#proveTx(ctx, txRequest, privateExecutionResult);','return this.#proveTx(ctx, txRequest, privateExecutionResult, validatePublic);');
 source=instrumentPxePhases(source);
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
 source=instrumentKernelPhases(source);
 return source;
}

function timingHelpers(){return `const beginRollingProofSpan=${beginProofSpan.toString()};
async function measureRollingProofPhase(stage,operation){const finish=beginRollingProofSpan('native.phase.'+stage);try{return await operation();}finally{finish();}}
`;}
function instrumentPxePhases(source){
 source=timingHelpers()+source;
 const proveStart=source.indexOf('*/ proveTx(txRequest, { scopes'),proveEnd=source.indexOf('\n    /**',proveStart);
 if(proveStart<0||proveEnd<0)throw Error('Missing native proof phase boundary');
 let prove=source.slice(proveStart,proveEnd);
 prove=replace(prove,'        let privateExecutionResult;',"        let privateExecutionResult;\n        const finishQueue=beginRollingProofSpan('native.phase.queue-and-anchor');");
 prove=replace(prove,'            const contractFunctionSimulator = this.#getSimulatorForTx();','            finishQueue();\n            const contractFunctionSimulator = this.#getSimulatorForTx();');
 source=source.slice(0,proveStart)+prove+source.slice(proveEnd);
 source=replace(source,'if (preSyncCalls) await this.#syncOrdinaryPostCalls(txRequest, preSyncCalls, contractFunctionSimulator, ctx, scopes);',
  "if (preSyncCalls) await measureRollingProofPhase('contract-sync',()=>this.#syncOrdinaryPostCalls(txRequest, preSyncCalls, contractFunctionSimulator, ctx, scopes));");
 source=replace(source,`            privateExecutionResult = await this.#executePrivate({
                contractFunctionSimulator,
                txRequest,
                anchorBlockHeader: ctx.anchorBlockHeader,
                scopes,
                changeSetId: ctx.changeSetId,
                senderForTags
            });`, `            privateExecutionResult = await measureRollingProofPhase('private-execution',()=>this.#executePrivate({
                contractFunctionSimulator,
                txRequest,
                anchorBlockHeader: ctx.anchorBlockHeader,
                scopes,
                changeSetId: ctx.changeSetId,
                senderForTags
            }));`);
 source=replace(source,'        const txProvingResult = new TxProvingResult(',"        const finishResult=beginRollingProofSpan('native.phase.result-and-tag-persistence');\n        const txProvingResult = new TxProvingResult(");
 source=replace(source,'        return txProvingResult;','        finishResult();\n        return txProvingResult;');
 source=replace(source,'        const simulatedTx = await new PrivateSimulationResult(privateExecutionResult, publicInputs).toSimulatedTx();\n        // Both checks',"        const simulatedTx = await measureRollingProofPhase('validation-transaction',()=>new PrivateSimulationResult(privateExecutionResult, publicInputs).toSimulatedTx());\n        // Both checks");
 source=replace(source,'() => publicInputs.forPublic ? this.#simulatePublicCalls(simulatedTx, false) : undefined,',"() => publicInputs.forPublic ? measureRollingProofPhase('public-execution',()=>this.#simulatePublicCalls(simulatedTx, false)) : undefined,");
 source=replace(source,'() => this.node.isValidTx(simulatedTx, {isSimulation: true, skipFeeEnforcement: false}),',"() => measureRollingProofPhase('admission-check',()=>this.node.isValidTx(simulatedTx, {isSimulation: true, skipFeeEnforcement: false})),");
 source=replace(source,"        const abi=new SyncAccountEntrypoint","        const finishBinding=beginRollingProofSpan('native.phase.sync-binding');\n        const abi=new SyncAccountEntrypoint");
 // Binding is small; class resolution and discovery are independently awaited groups.
 source=replace(source,'        await allToCompletion(targets.map(async target=>check((await this.contractClassService.getCurrentClassId(target.address,ctx.anchorBlockHeader))?.toString()===target.classId)));',"        finishBinding();\n        await measureRollingProofPhase('sync-classes',()=>allToCompletion(targets.map(async target=>check((await this.contractClassService.getCurrentClassId(target.address,ctx.anchorBlockHeader))?.toString()===target.classId))));");
 source=replace(source,'        await allToCompletion(targets.map(target=>this.contractSyncService.ensureContractSynced({',"        await measureRollingProofPhase('sync-records',()=>allToCompletion(targets.map(target=>this.contractSyncService.ensureContractSynced({");
 source=replace(source,'        })));\n    }\n    // Public API','        }))));\n    }\n    // Public API');
 return source;
}
function instrumentKernelPhases(source){
 source=timingHelpers()+source;
 source=replace(source,'        const updatedClassIdHintsMap = await this.prefetchUpdatedClassIdHints(executionResult);',"        const updatedClassIdHintsMap = await measureRollingProofPhase('kernel-class-hints',()=>this.prefetchUpdatedClassIdHints(executionResult));\n        const finishKernelBody=beginRollingProofSpan('native.phase.kernel-body');");
 source=replace(source,'        // Validation receives a detached SDK value.',"        finishKernelBody();\n        // Validation receives a detached SDK value.");
 source=replace(source,'if (beforeProof) await beforeProof(PrivateKernelTailCircuitPublicInputs.fromBuffer(tailOutput.publicInputs.toBuffer()));',"if (beforeProof) await measureRollingProofPhase('validation',()=>beforeProof(PrivateKernelTailCircuitPublicInputs.fromBuffer(tailOutput.publicInputs.toBuffer())));");
 source=replace(source,'const proofWithPublicInputs = await this.proofCreator.createChonkProof(executionSteps);',"const proofWithPublicInputs = await measureRollingProofPhase('remote-proof',()=>this.proofCreator.createChonkProof(executionSteps));");
 source=replace(source,'            this.ensurePublicInputsMatch(proofWithPublicInputs, tailOutput.publicInputs);',"            const finishPublicInputs=beginRollingProofSpan('native.phase.proof-public-inputs');\n            this.ensurePublicInputsMatch(proofWithPublicInputs, tailOutput.publicInputs);");
 source=replace(source,'            chonkProof = proofWithPublicInputs.removePublicInputs();','            chonkProof = proofWithPublicInputs.removePublicInputs();\n            finishPublicInputs();');
 return source;
}
