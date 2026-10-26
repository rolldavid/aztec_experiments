import {createHash} from 'node:crypto';
export const OWNER_FACT_WRITE_PATH='node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js';
const inputHash='04b8d0b24c6f20027db3212df8898e09ff744e6e72ebf24d98016f0aa2d59868';
const outputHash='d1ffae3b6897d06c23ceee573a39cd4a179c872f8b398399a19525065c4e967c';
const sha=value=>createHash('sha256').update(value).digest('hex');
// Browser-build projection only; installed native dependencies and bootstrap
// pins remain unchanged. Exact staged fact equality removes redundant writes.
export function skipUnchangedOwnerFacts(source){
 if(sha(source)!==inputHash)throw Error('OWNER_FACT_WRITE_SOURCE');
 const marker='            await this.factService.deleteFactCollection(progress.key, this.changeSetId);';
 if(source.split(marker).length!==2)throw Error('OWNER_FACT_WRITE_LAYOUT');
 const result=source.replace(marker,`            // Compare the complete current staged collection, after native note
            // validation. Matching payloads alone cannot preserve a changed origin.
            const collection = await this.factService.getFactCollection(progress.key,
                { provenBlockNumber: 0, finalizedBlockNumber: 0 }, this.changeSetId);
            const remaining = new Map(progress.records);
            const facts = collection?.facts ?? [];
            const unchanged = facts.length === remaining.size && facts.every(fact => {
                if (!fact.factTypeId.equals(progress.type) || fact.payload.length !== 1 || !fact.originBlock) return false;
                const id = fact.payload[0].toString(), record = remaining.get(id);
                if (!record || fact.originBlock.blockNumber !== record.origin.blockNumber ||
                    !fact.originBlock.blockHash.equals(record.origin.blockHash)) return false;
                remaining.delete(id);return true;
            }) && remaining.size === 0;
            if (unchanged) { this.ownerDiscoveryProgress.delete(id);continue; }
`+marker);
 if(sha(result)!==outputHash)throw Error('OWNER_FACT_WRITE_OUTPUT');
 return result;
}
