import { createLogger } from '@aztec-labs/foundation/log';
import { allToCompletion } from '@aztec-labs/foundation/promise';
import { AppTaggingSecret, AppTaggingSecretKind, SiloedTag, computeSharedTaggingSecret } from '@aztec-labs/stdlib/logs';
import { LogSource } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { assertAllowedScope } from '../storage/allowed_scopes.js';
import { getAllPrivateLogsByTags, getAllPublicLogsByTagsFromContract, syncTaggedPrivateLogs } from '../tagging/index.js';
const rangeKey = (fromBlock, toBlock)=>`${fromBlock ?? ''}-${toBlock ?? ''}`;
export class LogService {
    aztecNode;
    anchorBlockHeader;
    l2TipsStore;
    keyStore;
    recipientTaggingStore;
    taggingSecretSourcesStore;
    addressStore;
    scopes;
    changeSetId;
    log;
    constructor(aztecNode, anchorBlockHeader, l2TipsStore, keyStore, recipientTaggingStore, taggingSecretSourcesStore, addressStore, scopes, changeSetId, bindings){
        this.aztecNode = aztecNode;
        this.anchorBlockHeader = anchorBlockHeader;
        this.l2TipsStore = l2TipsStore;
        this.keyStore = keyStore;
        this.recipientTaggingStore = recipientTaggingStore;
        this.taggingSecretSourcesStore = taggingSecretSourcesStore;
        this.addressStore = addressStore;
        this.scopes = scopes;
        this.changeSetId = changeSetId;
        this.log = createLogger('pxe:log_service', bindings);
    }
    /** Fetches all logs matching each request's tag, returning an array of log arrays (one per request). */ async fetchLogsByTag(contractAddress, logRetrievalRequests) {
        for (const request of logRetrievalRequests){
            if (!contractAddress.equals(request.contractAddress)) {
                throw new Error(`Got a log retrieval request from ${request.contractAddress}, expected ${contractAddress}`);
            }
        }
        if (logRetrievalRequests.length === 0) {
            return [];
        }
        const anchor = await this.anchorBlockHeader.toBlockParameter();
        const [publicLogsPerRequest, privateLogsPerRequest] = await allToCompletion([
            this.#fetchPublicLogs(contractAddress, logRetrievalRequests, anchor),
            this.#fetchPrivateLogs(logRetrievalRequests, anchor)
        ]);
        return logRetrievalRequests.map((_request, i)=>[
                ...publicLogsPerRequest[i].map(LogService.#toRetrievedTaggedLog),
                ...privateLogsPerRequest[i].map(LogService.#toRetrievedTaggedLog)
            ]);
    }
    async #fetchPublicLogs(contractAddress, requests, anchor) {
        const indices = requests.flatMap((r, i)=>r.source !== LogSource.PRIVATE ? [
                i
            ] : []);
        if (indices.length === 0) {
            return requests.map(()=>[]);
        }
        const resultsPerRequest = requests.map(()=>[]);
        const groups = LogService.#groupByRange(indices.map((i)=>({
                index: i,
                request: requests[i]
            })));
        await allToCompletion(Array.from(groups.values()).map(async (group)=>{
            const tags = group.entries.map((e)=>e.request.tag);
            const results = await getAllPublicLogsByTagsFromContract(this.aztecNode, contractAddress, tags, anchor, {
                fromBlock: group.fromBlock,
                toBlock: group.toBlock,
                includeEffects: true
            });
            group.entries.forEach((entry, i)=>{
                resultsPerRequest[entry.index] = results[i];
            });
        }));
        return resultsPerRequest;
    }
    async #fetchPrivateLogs(requests, anchor) {
        const indices = requests.flatMap((r, i)=>r.source !== LogSource.PUBLIC ? [
                i
            ] : []);
        if (indices.length === 0) {
            return requests.map(()=>[]);
        }
        const resultsPerRequest = requests.map(()=>[]);
        const groups = LogService.#groupByRange(indices.map((i)=>({
                index: i,
                request: requests[i]
            })));
        await allToCompletion(Array.from(groups.values()).map(async (group)=>{
            const siloedTags = await allToCompletion(group.entries.map((e)=>SiloedTag.computeFromTagAndApp(e.request.tag, e.request.contractAddress)));
            const results = await getAllPrivateLogsByTags(this.aztecNode, siloedTags, anchor, {
                fromBlock: group.fromBlock,
                toBlock: group.toBlock,
                includeEffects: true
            });
            group.entries.forEach((entry, i)=>{
                resultsPerRequest[entry.index] = results[i];
            });
        }));
        return resultsPerRequest;
    }
    /**
   * Groups requests by their (fromBlock, toBlock) range so each distinct range becomes a single node call with
   * the range pushed down into the query (no in-memory filter).
   */ static #groupByRange(entries) {
        const groups = new Map();
        for (const entry of entries){
            const fromBlock = entry.request.fromBlock.value;
            const toBlock = entry.request.toBlock.value;
            const key = rangeKey(fromBlock, toBlock);
            const existing = groups.get(key);
            if (existing) {
                existing.entries.push(entry);
            } else {
                groups.set(key, {
                    fromBlock,
                    toBlock,
                    entries: [
                        entry
                    ]
                });
            }
        }
        return groups;
    }
    static #toRetrievedTaggedLog(log) {
        // includeEffects: true was used, so noteHashes and nullifiers are populated. Every tx has at least one nullifier
        // (the first nullifier derived from the tx hash); empty here would indicate a buggy node.
        const noteHashes = log.noteHashes;
        const nullifiers = log.nullifiers;
        if (nullifiers.length === 0) {
            throw new Error(`Log for tx ${log.txHash} returned no nullifiers from the node`);
        }
        return {
            logData: log.logData,
            txHash: log.txHash,
            noteHashes,
            nullifiers,
            blockNumber: log.blockNumber,
            blockTimestamp: log.blockTimestamp,
            blockHash: log.blockHash,
            // The log index and the tx receipt both count the tx's position in `block.body.txEffects`, so this is the same
            // index a receipt reports. Note ordering depends on the two staying in agreement.
            txIndexInBlock: log.txIndexWithinBlock
        };
    }
    /** Fetches the pending tagged logs for a recipient across all its tagging secrets for the contract. */ async fetchTaggedLogs(contractAddress, recipient, providedSecrets) {
        assertAllowedScope(recipient, this.scopes);
        this.log.verbose(`Fetching tagged logs for contract ${contractAddress.toString()} and recipient ${recipient.toString()}`);
        const l2Tips = await this.l2TipsStore.getL2Tips();
        // Secrets PXE can enumerate for this recipient (senders via ECDH + pre-shared store secrets), plus any the app
        // supplies explicitly for secrets PXE cannot enumerate itself (e.g. handshake-derived ones). The latter arrive
        // already computed and are searched even when the recipient's account is unknown locally, since they need no ECDH.
        const combinedSecrets = [
            ...await this.#getPointDerivedSecrets(contractAddress, recipient),
            ...providedSecrets
        ];
        // These sources can overlap (a sender that is also a PXE account, or a pre-shared secret that coincides with a
        // sender-derived one), so we deduplicate the combined set.
        const secrets = Array.from(new Map(combinedSecrets.map((secret)=>[
                secret.toString(),
                secret
            ])).values());
        const logs = await syncTaggedPrivateLogs(secrets, this.aztecNode, this.recipientTaggingStore, this.anchorBlockHeader, l2Tips.finalized.block.number, this.changeSetId);
        return logs.map((log)=>LogService.#toRetrievedTaggedLog(log));
    }
    /**
   * Computes the tagging secrets PXE can enumerate for a recipient: one per known sender (via ECDH) plus any
   * pre-shared secrets registered directly for the recipient. Each registered secret is scanned under the tag
   * streams its kind can back. Deriving the sender-based secrets requires the recipient's address preimage and keys,
   * so returns an empty array when those are unavailable. App-supplied secrets (e.g. derived from discovered
   * handshakes) are handled separately by the caller and do not go through here.
   */ async #getPointDerivedSecrets(contractAddress, recipient) {
        const recipientCompleteAddress = await this.addressStore.getCompleteAddress(recipient);
        if (!recipientCompleteAddress || !await this.keyStore.hasAccount(recipient)) {
            this.log.warn(`Skipping sender-derived tag retrieval for ${recipient.toString()} due to unknown address preimage`);
            return [];
        }
        const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);
        const [senderPoints, registeredSecrets] = await allToCompletion([
            this.#getSecretsForSenders(recipientCompleteAddress, recipientIvsk),
            this.taggingSecretSourcesStore.getSharedSecretsForRecipient(recipient)
        ]);
        return allToCompletion([
            ...senderPoints.map((secret)=>AppTaggingSecret.computeDirectional(secret, contractAddress, recipient)),
            ...registeredSecrets.flatMap(({ kind, secret })=>{
                switch(kind){
                    case 'arbitrary-secret':
                        return [
                            AppTaggingSecret.computeDirectional(secret, contractAddress, recipient)
                        ];
                    case 'handshake':
                        // A handshake-backed sender tags messages with the bare app-siloed secret, one tag domain per delivery
                        // mode.
                        return [
                            AppTaggingSecret.computeAppSiloed(secret, contractAddress, AppTaggingSecretKind.UNCONSTRAINED),
                            AppTaggingSecret.computeAppSiloed(secret, contractAddress, AppTaggingSecretKind.CONSTRAINED)
                        ];
                }
            })
        ]);
    }
    async #getSecretsForSenders(recipientCompleteAddress, recipientIvsk) {
        // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
        // (recipient = us, sender = us).
        const allSenders = [
            ...await this.taggingSecretSourcesStore.getSenders(),
            ...await this.keyStore.getAccounts()
        ];
        return allToCompletion(allSenders.map(async (sender)=>{
            const taggingSecretPoint = await computeSharedTaggingSecret(recipientCompleteAddress, recipientIvsk, sender);
            if (!taggingSecretPoint) {
                // Note that all senders originate from either the TaggingSecretSourcesStore or the KeyStore.
                throw new Error(`Failed to compute a tagging secret for sender ${sender} - this implies this is an invalid address, which should not happen as they have been previously registered in PXE.`);
            }
            return taggingSecretPoint;
        }));
    }
}
