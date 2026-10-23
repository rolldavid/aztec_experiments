import {createHash} from 'node:crypto';
import {PREFERENCE_PAGE_PINS} from './patch-pxe-preference-page.mjs';

// The pinned SDK executes the private program twice even when prepareProve
// returns the identical request. Reuse only inside its original atomic queue
// operation, for identical request bytes, scopes and sender, without overrides.
// Changed requests retain the upstream execution path. Real proving is unchanged.
export function reusePxeSimulation(source){
 const expected=PREFERENCE_PAGE_PINS.find(pin=>pin.path==='dest/pxe.js').after;
 if(createHash('sha256').update(source).digest('hex')!==expected)throw Error('PXE simulation reuse source mismatch');
 const start=source.indexOf('   */ simulateAndProveTx(simulationTxRequest,');
 const end=source.indexOf('\n    }',start)+6;
 if(start<0||end<=start)throw Error('PXE simulation reuse boundary mismatch');
 let method=source.slice(start,end);
 const snapshot='            const simulationResult = await this.#simulateTx(ctx, simulationTxRequest, simulateOpts);';
 const execute='                privateExecutionResult = await this.#executePrivate({';
 if(method.split(snapshot).length!==2||method.split(execute).length!==2)throw Error('PXE simulation reuse execution mismatch');
 method=method.replace(snapshot,`            const requestBytes = simulationTxRequest.toBuffer();
            const scopeKey = options => JSON.stringify([options.scopes.map(scope => scope.toString()), options.senderForTags?.toString() ?? null]);
            const simulationScope = scopeKey(simulateOpts);
${snapshot}`);
 method=method.replace(execute,`                const sameExecution = !simulateOpts.overrides && requestBytes.equals(proveTxRequest.toBuffer()) && simulationScope === scopeKey(proveOpts);
                privateExecutionResult = sameExecution ? simulationResult.privateExecutionResult : await this.#executePrivate({`);
 return source.slice(0,start)+method+source.slice(end);
}

// Simulation produces siloed public logs. Keep the private execution's unsiloed
// public inputs intact: real kernels must match its original partial witness.
export function preservePxeSimulationLogs(source){
 const expected='f1a9aa049431f5946b6c1a208ce0d7e62bc090f734a9adfe2f47f9c9330ef2b3';
 if(createHash('sha256').update(source).digest('hex')!==expected)throw Error('PXE simulation log source mismatch');
 const before=`            metadata.log.fields[0] = await computeSiloedPrivateLogFirstField(contractAddress, metadata.log.fields[0]);
            return new OrderedSideEffect(metadata, metadata.counter);`;
 if(source.split(before).length!==2)throw Error('PXE simulation log mutation boundary mismatch');
 return "import {PrivateLogData} from '@aztec-labs/stdlib/kernel';\n"+source.replace(before,`            const log = new PrivateLog([...metadata.log.fields], metadata.log.emittedLength);
            log.fields[0] = await computeSiloedPrivateLogFirstField(contractAddress, log.fields[0]);
            return new OrderedSideEffect(new PrivateLogData(log, metadata.noteHashCounter, metadata.counter), metadata.counter);`);
}
