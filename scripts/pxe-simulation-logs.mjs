import {createHash} from 'node:crypto';

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
