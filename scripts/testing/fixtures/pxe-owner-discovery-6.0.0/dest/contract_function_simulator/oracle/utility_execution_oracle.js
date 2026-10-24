import { L1_TO_L2_MSG_TREE_HEIGHT, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec-labs/constants';
import { chunk, uniqueBy } from '@aztec-labs/foundation/collection';
import { Aes128 } from '@aztec-labs/foundation/crypto/aes128';
import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { Point } from '@aztec-labs/foundation/curves/grumpkin';
import { LogLevels, createLogger } from '@aztec-labs/foundation/log';
import { allToCompletion } from '@aztec-labs/foundation/promise';
import { MembershipWitness } from '@aztec-labs/foundation/trees';
import { ExecutionError, extractCallStack, resolveAssertionMessageFromError, toACVMWitness, witnessMapToFields } from '@aztec-labs/simulator/client';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec-labs/standard-contracts/handshake-registry/constants';
import { FunctionSelector } from '@aztec-labs/stdlib/abi';
import { siloNullifier } from '@aztec-labs/stdlib/hash';
import { MAX_RPC_LEN } from '@aztec-labs/stdlib/interfaces/client';
import { computeAddressSecret, hashPublicKey } from '@aztec-labs/stdlib/keys';
import { AppTaggingSecret, FlatPublicLogs, appSiloEcdhSharedSecret } from '@aztec-labs/stdlib/logs';
import { getL1ToL2MessageWitness, lookUpL1ToL2MessageWitness } from '@aztec-labs/stdlib/messaging';
import { NoteStatus } from '@aztec-labs/stdlib/note';
import { MerkleTreeId } from '@aztec-labs/stdlib/trees';
import { CallContext } from '@aztec-labs/stdlib/tx';
import { Buffer } from 'buffer';
import { createContractLogger, logContractMessage, stripAztecnrLogPrefix } from '../../contract_logging.js';
import { EventService } from '../../events/event_service.js';
import { LogService } from '../../logs/log_service.js';
import { NoteService } from '../../notes/note_service.js';
import { ORACLE_VERSION_MAJOR } from '../../oracle_version.js';
import { assertAllowedScope } from '../../storage/allowed_scopes.js';
import { FactCollectionKey, FactCollectionTypeKey, anchoredTipBlockNumbers } from '../../storage/fact_store/index.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import { toNoirFactCollection } from '../noir-structs/fact_collection.js';
import { toNullifierMembershipWitnessData } from '../noir-structs/nullifier_membership_witness_data.js';
import { Option } from '../noir-structs/option.js';
import { pickNotes } from '../pick_notes.js';
import { buildACIRCallback } from './acir_callback.js';
/**
 * The oracle for an execution of utility contract functions.
 */ export class UtilityExecutionOracle {
    isMisc = true;
    isUtility = true;
    contractLogger;
    aztecnrLogger;
    offchainEffects = [];
    ephemeralArrayService = new EphemeralArrayService();
    transientArrayService;
    /** Keyed by tx hash string. */ txReceiptsCache = new Map();
    /**
   * Information that can be used to validate the existence of a note or an event, keyed by tx hash string. It is
   * populated by the node queries that precede validation (tagged log retrieval, tx resolution), which already return
   * everything validation needs, so validating a note or event created in one of those txs costs no node roundtrip.
   * Notes and events reached through other paths (e.g. offchain inbox messages) still need a receipt.
   */ validationTxDataCache = new Map();
    // We store oracle version to be able to show a nice error message when an oracle handler is missing.
    contractOracleVersion;
    callContext;
    authWitnesses;
    capsules;
    anchorBlockHeader;
    anchoredContractData;
    noteStore;
    keyStore;
    addressStore;
    aztecNode;
    recipientTaggingStore;
    taggingSecretSourcesStore;
    capsuleService;
    factService;
    privateEventStore;
    txResolver;
    contractSyncService;
    l2TipsStore;
    changeSetId;
    logger;
    scopes;
    simulator;
    hooks;
    utilityExecutor;
    constructor(args){
        this.callContext = args.callContext;
        this.authWitnesses = args.authWitnesses;
        this.capsules = args.capsules;
        this.anchorBlockHeader = args.anchorBlockHeader;
        this.anchoredContractData = args.anchoredContractData;
        this.noteStore = args.noteStore;
        this.keyStore = args.keyStore;
        this.addressStore = args.addressStore;
        this.aztecNode = args.aztecNode;
        this.recipientTaggingStore = args.recipientTaggingStore;
        this.taggingSecretSourcesStore = args.taggingSecretSourcesStore;
        this.capsuleService = args.capsuleService;
        this.factService = args.factService;
        this.privateEventStore = args.privateEventStore;
        this.txResolver = args.txResolver;
        this.contractSyncService = args.contractSyncService;
        this.l2TipsStore = args.l2TipsStore;
        this.changeSetId = args.changeSetId;
        this.logger = args.log ?? createLogger('simulator:client_view_context');
        this.scopes = args.scopes;
        this.simulator = args.simulator;
        this.hooks = args.hooks;
        this.utilityExecutor = args.utilityExecutor;
        this.transientArrayService = args.transientArrayService;
    }
    assertCompatibleOracleVersion(major, minor) {
        if (major !== ORACLE_VERSION_MAJOR) {
            const hint = major > ORACLE_VERSION_MAJOR ? 'The contract was compiled with a newer version of Aztec.nr than your private environment supports. Upgrade your private environment to a compatible version.' : 'The contract was compiled with an older version of Aztec.nr than your private environment supports. Recompile the contract with a compatible version of Aztec.nr.';
            throw new Error(`Incompatible private environment version: ${hint} See https://docs.aztec.network/errors/8 (expected oracle major version ${ORACLE_VERSION_MAJOR}, got ${major})`);
        }
        this.contractOracleVersion = {
            major,
            minor
        };
    }
    // Prefixed with "nonOracleFunction" as it is not used as an oracle handler.
    nonOracleFunctionGetContractOracleVersion() {
        return this.contractOracleVersion;
    }
    getRandomField() {
        return Fr.random();
    }
    getUtilityContext() {
        return {
            blockHeader: this.anchorBlockHeader,
            contractAddress: this.callContext.contractAddress,
            msgSender: this.callContext.msgSender
        };
    }
    /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @param _keyIndex - Sent by the Noir oracle caller but unused here; kept to match the oracle signature.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   * @throws If scopes are defined and the account is not in the scopes.
   */ async getKeyValidationRequest(pkMHash, _keyIndex) {
        let hasAccess = false;
        for(let i = 0; i < this.scopes.length && !hasAccess; i++){
            if (await this.keyStore.accountHasKey(this.scopes[i], pkMHash)) {
                hasAccess = true;
            }
        }
        if (!hasAccess) {
            throw new Error(`Key validation request denied: no scoped account has a key with hash ${pkMHash.toString()}.`);
        }
        return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
    }
    /**
   * Fetches the index and sibling path of a leaf at a given block from the note hash tree.
   * @param blockHash - The hash of a block that contains the note hash tree root in which to find the
   * membership witness.
   * @param noteHash - The note hash to find in the note hash tree.
   * @returns The membership witness containing the leaf index and sibling path
   */ async getNoteHashMembershipWitness(blockHash, noteHash) {
        const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, (referenceBlock)=>this.aztecNode.getNoteHashMembershipWitness(referenceBlock, noteHash));
        if (!witness) {
            throw new Error(`Note hash ${noteHash} not found in the note hash tree at block ${blockHash.toString()}.`);
        }
        return witness;
    }
    /**
   * Fetches the index and sibling path of a block hash in the archive tree.
   *
   * Block hashes are the leaves of the archive tree. Each time a new block is added to the chain,
   * its block hash is appended as a new leaf to the archive tree.
   *
   * @param referenceBlockHash - The hash of a block that contains the archive tree root in which to find the membership
   * witness.
   * @param blockHash - The block hash to find in the archive tree.
   * @returns The membership witness containing the leaf index and sibling path
   */ async getBlockHashMembershipWitness(referenceBlockHash, blockHash) {
        // Note that we validate that the reference block hash is at or before the anchor block - we don't test the block
        // hash at all. If the block hash did not exist by the reference block hash, then the node will not return the
        // membership witness as there is none.
        const witness = await this.#queryWithBlockHashNotAfterAnchor(referenceBlockHash, (referenceBlock)=>this.aztecNode.getBlockHashMembershipWitness(referenceBlock, blockHash));
        return witness ? Option.some(witness) : Option.none();
    }
    /** Returns whether each block hash is present in the archive tree at the referenced block. */ async areBlockHashesInArchive(referenceBlockHash, blockHashes) {
        const hashes = blockHashes.readAll(this.ephemeralArrayService);
        const memberships = await this.#queryWithBlockHashNotAfterAnchor(referenceBlockHash, (referenceBlock)=>allToCompletion(hashes.map((blockHash)=>this.aztecNode.getBlockHashMembershipWitness(referenceBlock, blockHash).then(Boolean))));
        return EphemeralArray.fromValues(this.ephemeralArrayService, memberships);
    }
    /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */ async getNullifierMembershipWitness(blockHash, nullifier) {
        const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, (referenceBlock)=>this.aztecNode.getNullifierMembershipWitness(referenceBlock, nullifier));
        if (!witness) {
            throw new Error(`Nullifier membership witness not found at block ${blockHash.toString()}.`);
        }
        return toNullifierMembershipWitnessData(witness);
    }
    /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */ async getLowNullifierMembershipWitness(blockHash, nullifier) {
        const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, (referenceBlock)=>this.aztecNode.getLowNullifierMembershipWitness(referenceBlock, nullifier));
        if (!witness) {
            throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block hash ${blockHash.toString()}.`);
        }
        return toNullifierMembershipWitnessData(witness);
    }
    /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param leafSlot - The slot of the public data tree to get the witness for.
   * @returns - The witness
   */ async getPublicDataWitness(blockHash, leafSlot) {
        const witness = await this.#queryWithBlockHashNotAfterAnchor(blockHash, (referenceBlock)=>this.aztecNode.getPublicDataWitness(referenceBlock, leafSlot));
        if (!witness) {
            throw new Error(`Public data witness not found for slot ${leafSlot} at block hash ${blockHash.toString()}.`);
        }
        return {
            index: witness.index,
            leafPreimage: witness.leafPreimage,
            siblingPath: witness.siblingPath.toTuple()
        };
    }
    /**
   * Fetches a block header of a given block.
   * @param blockNumber - The number of a block of which to get the block header.
   * @returns Block extracted from a block with block number `blockNumber`.
   */ async getBlockHeader(blockNumber) {
        const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
        if (blockNumber > anchorBlockNumber) {
            throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
        }
        // Most contracts query state at the "current" block, which is the anchor. Skip the RPC when we can.
        if (blockNumber === anchorBlockNumber) {
            return this.anchorBlockHeader;
        }
        const block = await this.aztecNode.getBlock(blockNumber);
        if (!block?.header) {
            throw new Error(`Block header not found for block ${blockNumber}.`);
        }
        return block.header;
    }
    /**
   * Retrieve the public keys and partial address associated to a given address.
   * @param account - The account address.
   * @returns The public keys and partial address, or `undefined` if the account is not registered.
   */ async getPublicKeysAndPartialAddress(account) {
        const completeAddress = await this.addressStore.getCompleteAddress(account);
        if (!completeAddress) {
            return Option.none();
        }
        return Option.some({
            publicKeys: completeAddress.publicKeys,
            partialAddress: completeAddress.partialAddress
        });
    }
    async getCompleteAddressOrFail(account) {
        const completeAddress = await this.addressStore.getCompleteAddress(account);
        if (!completeAddress) {
            throw new Error(`No public key registered for address ${account}.
        Register it by calling wallet.registerSender(...).\nSee docs for context: https://docs.aztec.network/errors/14`);
        }
        return completeAddress;
    }
    /**
   * Returns a contract instance associated with an address or throws if not found.
   * @param address - Address.
   * @returns A contract instance.
   */ async getContractInstance(address) {
        const instance = await this.anchoredContractData.getContractInstance(address);
        if (!instance) {
            throw new Error(`No contract instance found for address ${address.toString()}`);
        }
        return instance;
    }
    /**
   * Returns an auth witness for the given message hash from the list of transient witnesses for this transaction.
   * @param messageHash - Hash of the message to authenticate.
   * @returns Authentication witness for the requested message hash, or undefined if not found.
   */ getAuthWitness(messageHash) {
        const witness = this.authWitnesses.find((w)=>w.requestHash.equals(messageHash))?.witness;
        if (!witness) {
            throw new Error(`Unknown auth witness for message hash ${messageHash}`);
        }
        return Promise.resolve(witness);
    }
    /**
   * Gets some notes for a contract address and storage slot.
   * Returns a flattened array containing filtered notes.
   *
   * @remarks
   * Check for pending notes with matching slot.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the note hash tree.
   *
   * @param owner - The owner of the notes. If undefined, returns notes for all owners.
   * @param storageSlot - The storage slot.
   * @param numSelects - The number of valid selects in selectBy and selectValues.
   * @param selectBy - An array of indices of the fields to selects.
   * @param selectValues - The values to match.
   * @param selectComparators - The comparators to use to match values.
   * @param sortBy - An array of indices of the fields to sort.
   * @param sortOrder - The order of the corresponding index in sortBy. (1: DESC, 2: ASC, 0: Do nothing)
   * @param limit - The number of notes to retrieve per query.
   * @param offset - The starting index for pagination.
   * @param status - The status of notes to fetch.
   * @returns Array of note data.
   */ async getNotes(owner, storageSlot, numSelects, selectByIndexes, selectByOffsets, selectByLengths, selectValues, selectComparators, sortByIndexes, sortByOffsets, sortByLengths, sortOrder, limit, offset, status, maxNotes, packedHintedNoteLength) {
        const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.changeSetId);
        const dbNotes = await noteService.getNotes(this.contractAddress, owner.value, storageSlot, status, this.scopes);
        const picked = pickNotes(dbNotes, {
            selects: selectByIndexes.slice(0, numSelects).map((index, i)=>({
                    selector: {
                        index,
                        offset: selectByOffsets[i],
                        length: selectByLengths[i]
                    },
                    value: selectValues[i],
                    comparator: selectComparators[i]
                })),
            sorts: sortByIndexes.map((index, i)=>({
                    selector: {
                        index,
                        offset: sortByOffsets[i],
                        length: sortByLengths[i]
                    },
                    order: sortOrder[i]
                })),
            limit,
            offset
        });
        return BoundedVec.from({
            data: picked,
            maxLength: maxNotes,
            elementSize: packedHintedNoteLength
        });
    }
    /**
   * Returns the tx and block in which a settled note of the executing contract was created, or `None` if no such note
   * is known. Nullified notes are also returned.
   */ async getSettledNoteOrigin(noteHash, contractAddress, noteNonce) {
        this.#assertOwnContract(contractAddress);
        // The store is only indexed by contract, so this scans all of the contract's notes. The query is rare enough and
        // stores are small enough that this is not a concern.
        const notes = await this.noteStore.getNotes({
            contractAddress,
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
            scopes: this.scopes
        }, this.changeSetId);
        const note = notes.find((note)=>note.noteHash.equals(noteHash) && note.noteNonce.equals(noteNonce));
        return note ? Option.some({
            txHash: note.txHash.hash,
            block: {
                blockNumber: note.l2BlockNumber,
                blockHash: Fr.fromHexString(note.l2BlockHash)
            }
        }) : Option.none();
    }
    /**
   * Returns the status of each inner nullifier: whether it exists in the nullifier tree at the anchor block and, if
   * so, the block it was inserted in. Results are aligned with the input.
   */ async getNullifierStatuses(innerNullifiers) {
        const siloedNullifiers = await allToCompletion(innerNullifiers.readAll(this.ephemeralArrayService).map((innerNullifier)=>siloNullifier(this.contractAddress, innerNullifier)));
        const statuses = await this.getSiloedNullifierStatuses(siloedNullifiers);
        return EphemeralArray.fromValues(this.ephemeralArrayService, statuses);
    }
    /** Looks up siloed nullifiers in the nullifier tree at the anchor block, returning one status per input. */ async getSiloedNullifierStatuses(siloedNullifiers) {
        const anchor = await this.anchorBlockHeader.toBlockParameter();
        const leaves = (await allToCompletion(chunk(siloedNullifiers, MAX_RPC_LEN).map((batch)=>this.aztecNode.findLeavesIndexes(anchor, MerkleTreeId.NULLIFIER_TREE, batch)))).flat();
        return leaves.map((leaf)=>leaf ? {
                exists: true,
                originBlock: Option.some({
                    blockNumber: leaf.l2BlockNumber,
                    blockHash: leaf.l2BlockHash.toFr()
                })
            } : {
                exists: false,
                originBlock: Option.none()
            });
    }
    /**
   * Returns the membership witness of an L1 to L2 message.
   * @param messageHash - Hash of the message.
   * @param nullifier - When present, the unsiloed nullifier of the message and the address to silo it with. The witness
   * is only returned if the siloed nullifier is absent from the nullifier tree, i.e. the message has not been consumed.
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */ async getL1ToL2MembershipWitnessV2(messageHash, nullifier) {
        const [messageIndex, siblingPath] = await getL1ToL2MessageWitness(this.aztecNode, messageHash, nullifier.value, await this.anchorBlockHeader.toBlockParameter());
        return new MembershipWitness(L1_TO_L2_MSG_TREE_HEIGHT, messageIndex, siblingPath.toTuple());
    }
    /**
   * Returns the membership witness of an L1 to L2 message, or none if there is no such message.
   * @param messageHash - Hash of the message.
   * @param nullifier - When present, the unsiloed nullifier of the message and the address to silo it with. The witness
   * is only returned if the siloed nullifier is absent from the nullifier tree, i.e. the message has not been consumed.
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path), or none.
   */ async tryGetL1ToL2MembershipWitness(messageHash, nullifier) {
        const anchor = await this.anchorBlockHeader.toBlockParameter();
        const lookup = await lookUpL1ToL2MessageWitness(this.aztecNode, messageHash, nullifier.value, anchor);
        if (lookup.type !== 'found') {
            return Option.none();
        }
        const [messageIndex, siblingPath] = lookup.witness;
        return Option.some(new MembershipWitness(L1_TO_L2_MSG_TREE_HEIGHT, messageIndex, siblingPath.toTuple()));
    }
    /**
   * Read the public storage data.
   * @param blockHash - The block hash to read storage at.
   * @param contractAddress - The address to read storage from.
   * @param startStorageSlot - The starting storage slot.
   * @param numberOfElements - Number of elements to read from the starting storage slot.
   */ getFromPublicStorage(blockHash, contractAddress, startStorageSlot, numberOfElements) {
        return this.#queryWithBlockHashNotAfterAnchor(blockHash, async (referenceBlock)=>{
            const slots = Array(numberOfElements).fill(0).map((_, i)=>new Fr(startStorageSlot.toBigInt() + BigInt(i)));
            const values = await allToCompletion(slots.map((storageSlot)=>this.aztecNode.getPublicStorageAt(referenceBlock, contractAddress, storageSlot)));
            this.logger.debug(`Oracle storage read: start=${startStorageSlot.toString()} count=${numberOfElements} ` + `address=${contractAddress.toString()} values=[${values.join(', ')}]`);
            return values;
        });
    }
    /**
   * Returns a per-contract logger whose output is prefixed with `contract:<name>(<addrAbbrev>)`.
   */ async #getContractLogger() {
        if (!this.contractLogger) {
            // Purpose of instanceId is to distinguish logs from different instances of the same component. It makes sense
            // to re-use changeSetId as instanceId here as executions of different PXE operations are isolated.
            this.contractLogger = await createContractLogger(this.contractAddress, (addr)=>this.anchoredContractData.getDebugContractName(addr), 'user', {
                instanceId: this.changeSetId
            });
        }
        return this.contractLogger;
    }
    /**
   * Returns a per-contract logger whose output is prefixed with `aztecnr:<name>(<addrAbbrev>)`.
   */ async #getAztecnrLogger() {
        if (!this.aztecnrLogger) {
            // Purpose of instanceId is to distinguish logs from different instances of the same component. It makes sense
            // to re-use changeSetId as instanceId here as executions of different PXE operations are isolated.
            this.aztecnrLogger = await createContractLogger(this.contractAddress, (addr)=>this.anchoredContractData.getDebugContractName(addr), 'aztecnr', {
                instanceId: this.changeSetId
            });
        }
        return this.aztecnrLogger;
    }
    async log(level, message, _fieldsSize, fields) {
        if (!LogLevels[level]) {
            throw new Error(`Invalid log level: ${level}`);
        }
        const { kind, message: strippedMessage } = stripAztecnrLogPrefix(message);
        const logger = kind == 'aztecnr' ? await this.#getAztecnrLogger() : await this.#getContractLogger();
        logContractMessage(logger, LogLevels[level], strippedMessage, fields);
    }
    /** Fetches pending tagged logs into a freshly allocated ephemeral array and returns it. */ async getPendingTaggedLogsV2(scope, providedSecrets) {
        const secrets = providedSecrets.readAll(this.ephemeralArrayService).map((ps)=>new AppTaggingSecret(ps.secret, this.contractAddress, ps.mode));
        const logService = this.#createLogService();
        const retrievedLogs = await logService.fetchTaggedLogs(this.contractAddress, scope, secrets);
        this.#cacheValidationTxData(retrievedLogs);
        return EphemeralArray.fromValues(this.ephemeralArrayService, retrievedLogs.map(toPendingTaggedLog));
    }
    #createLogService() {
        return new LogService(this.aztecNode, this.anchorBlockHeader, this.l2TipsStore, this.keyStore, this.recipientTaggingStore, this.taggingSecretSourcesStore, this.addressStore, this.scopes, this.changeSetId, this.logger.getBindings());
    }
    async validateAndStoreEnqueuedNotesAndEvents(noteValidationRequests, eventValidationRequests, scope) {
        await this.#processValidationRequests(noteValidationRequests.readAll(this.ephemeralArrayService), eventValidationRequests.readAll(this.ephemeralArrayService), scope);
    }
    async #processValidationRequests(noteValidationRequests, eventValidationRequests, scope) {
        const validationTxData = await this.#getValidationTxData([
            ...noteValidationRequests.map((r)=>r.txHash),
            ...eventValidationRequests.map((r)=>r.txHash)
        ]);
        const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.changeSetId);
        const eventService = new EventService(this.anchorBlockHeader, this.privateEventStore, this.changeSetId);
        await allToCompletion([
            noteService.validateAndStoreNotes(noteValidationRequests, scope, validationTxData),
            eventService.validateAndStoreEvents(eventValidationRequests, scope, validationTxData)
        ]);
    }
    async getLogsByTagV2(requests) {
        const logRetrievalRequests = requests.readAll(this.ephemeralArrayService);
        const logService = this.#createLogService();
        const retrievedLogsPerRequest = await logService.fetchLogsByTag(this.contractAddress, logRetrievalRequests);
        this.#cacheValidationTxData(retrievedLogsPerRequest.flat());
        // Create an inner ephemeral array for each request's matching logs, then wrap all slots in an outer array.
        const innerArrays = retrievedLogsPerRequest.map((retrievedLogs)=>EphemeralArray.fromValues(this.ephemeralArrayService, retrievedLogs.map(toLogRetrievalResponse)));
        return EphemeralArray.fromValues(this.ephemeralArrayService, innerArrays);
    }
    /** Given an array of tx hashes, returns an aligned array of tx info if the tx is available. */ async getResolvedTxs(requests) {
        const txHashes = requests.readAll(this.ephemeralArrayService);
        const resolved = await this.txResolver.resolveTxs(txHashes, this.anchorBlockHeader.getBlockNumber());
        this.#cacheValidationTxData(resolved.filter((tx)=>tx !== null));
        const options = resolved.map((tx)=>tx ? Option.some(toResolvedTx(tx)) : Option.none());
        return EphemeralArray.fromValues(this.ephemeralArrayService, options);
    }
    /**
   * Fetches the effects of a transaction by its hash. Returns null if the tx is not found or is beyond the anchor
   * block.
   */ async getTxEffect(txHash) {
        if (txHash.hash.isZero()) {
            throw new Error('Invalid tx hash passed into aztec_utl_getTxEffect oracle handler');
        }
        return await this.#getTxEffectOption(txHash);
    }
    /** Fetches transaction effects for all hashes, preserving request order. */ async getTxEffects(txHashes) {
        const hashes = txHashes.readAll(this.ephemeralArrayService);
        const invalidHash = hashes.find((txHash)=>txHash.hash.isZero());
        if (invalidHash) {
            throw new Error('Invalid tx hash passed into aztec_utl_getTxEffects oracle handler');
        }
        const uniqueTxHashes = uniqueBy(hashes, (h)=>h.toString());
        const options = await allToCompletion(uniqueTxHashes.map((txHash)=>this.#getTxEffectOption(txHash)));
        const optionsByHash = new Map(uniqueTxHashes.map((txHash, i)=>[
                txHash.toString(),
                options[i]
            ]));
        return EphemeralArray.fromValues(this.ephemeralArrayService, hashes.map((txHash)=>optionsByHash.get(txHash.toString())));
    }
    setCapsule(contractAddress, slot, capsule, scope) {
        this.#assertOwnContract(contractAddress);
        return this.capsuleService.setCapsule(contractAddress, slot, capsule, this.changeSetId, scope);
    }
    async getCapsule(contractAddress, slot, tSize, scope) {
        this.#assertOwnContract(contractAddress);
        const values = await this.capsuleService.getCapsule(contractAddress, slot, this.changeSetId, scope, this.capsules);
        return values ? Option.some(values) : Option.none({
            length: tSize
        });
    }
    deleteCapsule(contractAddress, slot, scope) {
        this.#assertOwnContract(contractAddress);
        return this.capsuleService.deleteCapsule(contractAddress, slot, this.changeSetId, scope);
    }
    copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, scope) {
        this.#assertOwnContract(contractAddress);
        return this.capsuleService.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, this.changeSetId, scope);
    }
    /**
   * Asserts the executing contract may only access its own slice of PXE DB.
   */ #assertOwnContract(contractAddress) {
        if (!contractAddress.equals(this.contractAddress)) {
            throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
        }
    }
    /**
   * Records a fact into a collection. A `Some` origin block makes the fact retractable (pruned on reorg of that
   * block), a `None` origin block makes it non-retractable, surviving reorgs.
   */ recordFact(contractAddress, scope, factCollectionTypeId, factCollectionId, factTypeId, payload, originBlock) {
        this.#assertOwnContract(contractAddress);
        return this.factService.recordFact(new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId), factTypeId, payload.readAll(this.ephemeralArrayService), originBlock.isSome() ? originBlock.value : undefined, this.changeSetId);
    }
    /**
   * Deletes a fact collection, removing all its facts. A no-op if no such collection exists.
   */ deleteFactCollection(contractAddress, scope, factCollectionTypeId, factCollectionId) {
        this.#assertOwnContract(contractAddress);
        return this.factService.deleteFactCollection(new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId), this.changeSetId);
    }
    /**
   * Returns a fact collection.
   */ async getFactCollection(contractAddress, scope, factCollectionTypeId, factCollectionId) {
        this.#assertOwnContract(contractAddress);
        const tips = anchoredTipBlockNumbers(await this.l2TipsStore.getL2Tips(), this.anchorBlockHeader.getBlockNumber());
        const collection = await this.factService.getFactCollection(new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId), tips, this.changeSetId);
        return collection ? Option.some(toNoirFactCollection(this.ephemeralArrayService, contractAddress, scope, factCollectionTypeId, factCollectionId, collection.facts)) : Option.none();
    }
    /** Returns every fact collection of `factCollectionTypeId`. */ async getFactCollectionsByType(contractAddress, scope, factCollectionTypeId) {
        this.#assertOwnContract(contractAddress);
        const tips = anchoredTipBlockNumbers(await this.l2TipsStore.getL2Tips(), this.anchorBlockHeader.getBlockNumber());
        const collections = await this.factService.getFactCollectionsByType(new FactCollectionTypeKey(contractAddress, scope, factCollectionTypeId), tips, this.changeSetId);
        return EphemeralArray.fromValues(this.ephemeralArrayService, collections.map((collection)=>toNoirFactCollection(this.ephemeralArrayService, collection.key.contractAddress, collection.key.scope, collection.key.factCollectionTypeId, collection.key.factCollectionId, collection.facts)));
    }
    /**
   * Clears cached sync state for a contract for a set of scopes, forcing re-sync on the next query so that newly
   * stored notes or events are discovered.
   */ setContractSyncCacheInvalid(contractAddress, scopes) {
        if (!contractAddress.equals(this.contractAddress)) {
            throw new Error(`Contract ${this.contractAddress} cannot invalidate sync cache of ${contractAddress}`);
        }
        this.contractSyncService.invalidateContractForScopes(contractAddress, scopes.data);
    }
    // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
    async decryptAes128(ciphertext, iv, symKey) {
        const capacity = ciphertext.maxLength;
        try {
            const aes128 = new Aes128();
            const plaintext = await aes128.decryptBufferCBC(Buffer.from(ciphertext.data), Buffer.from(iv), Buffer.from(symKey));
            return Option.some(BoundedVec.from({
                data: [
                    ...plaintext
                ],
                maxLength: capacity
            }));
        } catch  {
            return Option.none({
                maxLength: capacity
            });
        }
    }
    /**
   * Retrieves app-siloed shared secrets for multiple ephemeral public keys stored in an ephemeral array.
   * @param address - The recipient address.
   * @param ephPks - Ephemeral array containing the serialized Points.
   * @param contractAddress - The contract address for app-siloing (validated against execution context).
   * @returns A new ephemeral array containing the computed shared secrets, or an empty array when the PXE does not
   * hold the keys for `address`.
   * @throws If `address` is not in the execution's allowed scopes.
   */ async getSharedSecrets(address, ephPks, contractAddress) {
        if (!contractAddress.equals(this.contractAddress)) {
            throw new Error(`getSharedSecrets called with contract address ${contractAddress}, expected ${this.contractAddress}`);
        }
        assertAllowedScope(address, this.scopes);
        // An address can be in scope without the PXE holding its keys (e.g. syncing a registered but non-owned account),
        // in which case no secrets can be derived and we return an empty array rather than failing.
        const recipientCompleteAddress = await this.addressStore.getCompleteAddress(address);
        if (!recipientCompleteAddress) {
            this.logger.warn(`Computing shared secrets for address ${address} whose keys are not held - returning no secrets`, {
                address,
                contractAddress: this.contractAddress
            });
            return EphemeralArray.fromValues(this.ephemeralArrayService, []);
        }
        const ivpkMHash = await hashPublicKey(recipientCompleteAddress.publicKeys.ivpkM);
        const ivskM = await this.keyStore.getMasterSecretKey(ivpkMHash);
        const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
        const ephPkPoints = ephPks.readAll(this.ephemeralArrayService);
        const secrets = await allToCompletion(ephPkPoints.map(({ x, y })=>appSiloEcdhSharedSecret(addressSecret, new Point(x, y), this.contractAddress)));
        return EphemeralArray.fromValues(this.ephemeralArrayService, secrets);
    }
    pushEphemeral(slot, elements) {
        return this.ephemeralArrayService.push(slot, elements);
    }
    popEphemeral(slot) {
        return this.ephemeralArrayService.pop(slot);
    }
    getEphemeral(slot, index) {
        return this.ephemeralArrayService.get(slot, index);
    }
    setEphemeral(slot, index, elements) {
        this.ephemeralArrayService.set(slot, index, elements);
    }
    getEphemeralLen(slot) {
        return this.ephemeralArrayService.len(slot);
    }
    removeEphemeral(slot, index) {
        this.ephemeralArrayService.remove(slot, index);
    }
    clearEphemeral(slot) {
        this.ephemeralArrayService.clear(slot);
    }
    pushTransient(slot, elements) {
        return this.transientArrayService.push(this.contractAddress, slot, elements);
    }
    popTransient(slot) {
        return this.transientArrayService.pop(this.contractAddress, slot);
    }
    getTransient(slot, index) {
        return this.transientArrayService.get(this.contractAddress, slot, index);
    }
    setTransient(slot, index, elements) {
        this.transientArrayService.set(this.contractAddress, slot, index, elements);
    }
    getTransientLen(slot) {
        return this.transientArrayService.len(this.contractAddress, slot);
    }
    removeTransient(slot, index) {
        this.transientArrayService.remove(this.contractAddress, slot, index);
    }
    clearTransient(slot) {
        this.transientArrayService.clear(this.contractAddress, slot);
    }
    emitOffchainEffect(data) {
        this.offchainEffects.push({
            data,
            contractAddress: this.contractAddress
        });
        return Promise.resolve();
    }
    /** Executes another utility function from within this one and returns its serialized return values. */ async callUtilityFunction(targetContractAddress, functionSelector, args) {
        const targetArtifact = await this.anchoredContractData.getFunctionArtifactWithDebugMetadata(targetContractAddress, functionSelector);
        if (!targetArtifact) {
            throw new Error(`Cannot call ${targetContractAddress}:${functionSelector}: the contract is not registered. ` + `Register it via wallet.registerContract(...).`);
        }
        if (!targetContractAddress.equals(this.contractAddress)) {
            // Standard handshake registry reads are authorized by default; every other cross-contract call needs the hook.
            if (!await isStandardHandshakeRegistryUtilityRead(targetContractAddress, functionSelector)) {
                const [callerClassId, targetClassId] = await allToCompletion([
                    this.anchoredContractData.getCurrentClassId(this.contractAddress),
                    this.anchoredContractData.getCurrentClassId(targetContractAddress)
                ]);
                if (!callerClassId || !targetClassId) {
                    throw new Error(`Cannot authorize utility call from ${this.contractAddress} to ${targetContractAddress}: ` + `${!callerClassId ? this.contractAddress : targetContractAddress} is not registered.`);
                }
                const request = {
                    caller: this.contractAddress,
                    callerClassId,
                    target: targetContractAddress,
                    targetClassId,
                    functionSelector,
                    functionName: targetArtifact.name,
                    args,
                    callerContext: this.callerContext
                };
                const response = this.hooks?.authorizeUtilityCall ? await this.hooks.authorizeUtilityCall(request) : {
                    authorized: false,
                    reason: 'No authorizeUtilityCall hook configured'
                };
                if (!response.authorized) {
                    const reason = response.reason ? `: ${response.reason}` : '';
                    throw new Error(`Cross-contract utility call denied${reason}. ${this.contractAddress} attempted to call ` + `${targetContractAddress}:${functionSelector} (${targetArtifact.name}). ` + `See https://docs.aztec.network/errors/11`);
                }
            }
            await this.contractSyncService.ensureContractSynced({
                contract: targetContractAddress,
                functionToInvokeAfterSync: functionSelector,
                utilityExecutor: this.utilityExecutor,
                anchorBlockHeader: this.anchorBlockHeader,
                changeSetId: this.changeSetId,
                scopes: this.scopes,
                triggeredBy: {
                    address: this.contractAddress,
                    selector: this.callContext.functionSelector
                }
            });
        }
        this.logger.debug(`Calling nested utility function ${targetContractAddress}:${functionSelector} from ${this.contractAddress}`);
        const nestedOracle = new UtilityExecutionOracle({
            callContext: CallContext.from({
                msgSender: this.contractAddress,
                contractAddress: targetContractAddress,
                functionSelector,
                isStaticCall: true
            }),
            authWitnesses: this.authWitnesses,
            capsules: this.capsules,
            anchorBlockHeader: this.anchorBlockHeader,
            anchoredContractData: this.anchoredContractData,
            noteStore: this.noteStore,
            keyStore: this.keyStore,
            addressStore: this.addressStore,
            aztecNode: this.aztecNode,
            recipientTaggingStore: this.recipientTaggingStore,
            taggingSecretSourcesStore: this.taggingSecretSourcesStore,
            capsuleService: this.capsuleService,
            factService: this.factService,
            privateEventStore: this.privateEventStore,
            txResolver: this.txResolver,
            contractSyncService: this.contractSyncService,
            l2TipsStore: this.l2TipsStore,
            changeSetId: this.changeSetId,
            scopes: this.scopes,
            simulator: this.simulator,
            hooks: this.hooks,
            utilityExecutor: this.utilityExecutor,
            log: this.logger,
            // Shared across the whole execution tree: nested utility frames inherit the caller's transient-array store.
            transientArrayService: this.transientArrayService
        });
        const initialWitness = toACVMWitness(0, args);
        const acirExecutionResult = await this.simulator.executeUserCircuit(initialWitness, targetArtifact, buildACIRCallback(nestedOracle, {
            contractAddress: targetContractAddress
        })).catch((err)=>{
            err.message = resolveAssertionMessageFromError(err, targetArtifact);
            throw new ExecutionError(err.message, {
                contractAddress: targetContractAddress,
                functionSelector
            }, extractCallStack(err, targetArtifact.debug), {
                cause: err
            });
        });
        return witnessMapToFields(acirExecutionResult.returnWitness);
    }
    /** Returns offchain effects collected during execution. */ getOffchainEffects() {
        return this.offchainEffects;
    }
    /** Stores the onchain context of the given txs, so that validating the notes and events they created is free. */ #cacheValidationTxData(txs) {
        txs.forEach((tx)=>this.validationTxDataCache.set(tx.txHash.toString(), toValidationTxData(tx)));
    }
    /**
   * Returns the information needed to validate the notes and events created in the given txs, keyed by
   * `TxHash.toString()`. Txs already in {@link validationTxDataCache} cost no node request, and the rest are read from
   * the node. Txs with no tx effect are absent from the returned map.
   */ async #getValidationTxData(txHashes) {
        const known = [];
        const misses = [];
        for (const txHash of uniqueBy(txHashes, (h)=>h.toString())){
            const key = txHash.toString();
            const cached = this.validationTxDataCache.get(key);
            if (cached) {
                known.push([
                    key,
                    cached
                ]);
            } else {
                misses.push(txHash);
            }
        }
        const fetched = await allToCompletion(misses.map((h)=>this.#getTxReceiptWithEffect(h)));
        return new Map([
            ...known,
            ...misses.map((h, i)=>{
                const receipt = fetched[i];
                if (!receipt.isMined() || !receipt.txEffect) {
                    return [
                        h.toString(),
                        undefined
                    ];
                }
                return [
                    h.toString(),
                    {
                        noteHashes: receipt.txEffect.noteHashes,
                        nullifiers: receipt.txEffect.nullifiers,
                        l2BlockNumber: receipt.blockNumber,
                        l2BlockHash: receipt.blockHash,
                        txIndexInBlock: receipt.txIndexInBlock
                    }
                ];
            }).filter((entry)=>entry[1] !== undefined)
        ]);
    }
    /**
   * Reads a receipt with its effect, at most once per tx for the lifetime of this execution.
   *
   * A receipt is not cacheable in general, since pending, mined and dropped are all correct answers to the same call
   * over time. Within one execution it is: the execution is anchored at a fixed block, and validation runs in several
   * batches that name overlapping tx hashes, so re-reading would both cost extra requests and let one execution see a
   * tx as included in one batch and absent in the next.
   */ #getTxReceiptWithEffect(txHash) {
        const key = txHash.toString();
        let receipt = this.txReceiptsCache.get(key);
        if (!receipt) {
            receipt = this.aztecNode.getTxReceipt(txHash, {
                includeTxEffect: true
            }).catch((err)=>{
                this.txReceiptsCache.delete(key);
                throw err;
            });
            this.txReceiptsCache.set(key, receipt);
        }
        return receipt;
    }
    async #getTxEffectOption(txHash) {
        const receipt = await this.#getTxReceiptWithEffect(txHash);
        if (!receipt.isMined() || !receipt.txEffect || receipt.blockNumber > this.anchorBlockHeader.getBlockNumber()) {
            return Option.none();
        }
        return Option.some(this.#toTxEffectData(receipt.txEffect));
    }
    #toTxEffectData(txEffect) {
        return {
            ...txEffect,
            revertCode: txEffect.revertCode.getCode(),
            publicLogs: FlatPublicLogs.fromLogs(txEffect.publicLogs),
            contractClassLogs: txEffect.contractClassLogs.map((log)=>({
                    contractAddress: log.contractAddress,
                    fields: log.fields.toFields(),
                    emittedLength: log.emittedLength
                }))
        };
    }
    /**
   * Runs a query concurrently with a validation that the block hash is not ahead of the anchor block. `query` receives
   * the block parameter to name in its node call, which is `blockHash` itself except when it names the anchor: there
   * the anchor's height is at hand, so it travels with the hash and a node that has not seen the anchor yet can tell
   * a client one block ahead of it from one naming a block it will never have.
   *
   * Historical hashes keep their bare form deliberately. Their height is not known here, and a deliberate probe for a
   * block the node may have reorged away must stay a plain hash lookup.
   */ async #queryWithBlockHashNotAfterAnchor(blockHash, query) {
        // Most contracts query state at the "current" block, which is the anchor. Skip the validation when we can.
        const anchorHash = await this.anchorBlockHeader.hash();
        if (blockHash.equals(anchorHash)) {
            return query(await this.anchorBlockHeader.toBlockParameter());
        }
        const [response] = await allToCompletion([
            query(blockHash),
            (async ()=>{
                const block = await this.aztecNode.getBlock(blockHash);
                const header = block?.header;
                if (!header) {
                    throw new Error(`Could not find block header for block hash ${blockHash}`);
                }
                if (header.getBlockNumber() > this.anchorBlockHeader.getBlockNumber()) {
                    throw new Error(`Made a node query with a reference block hash ${blockHash} with block number ${header.getBlockNumber()}, which is ahead of the anchor block number ${this.anchorBlockHeader.getBlockNumber()} (from anchor block hash ${anchorHash}).`);
                }
            })()
        ]);
        return response;
    }
    /** The execution context of the current call. */ get callerContext() {
        return 'utility';
    }
    /** The address of the contract whose function is being executed, from the call context. */ get contractAddress() {
        return this.callContext.contractAddress;
    }
}
// Registry reads that any contract may issue without an `authorizeUtilityCall` hook. The constrained-delivery
// library calls these implicitly for the app, and they are safe to default-authorize: `get_app_siloed_secrets`
// siloes every returned secret to `msg_sender`, and `get_non_interactive_handshakes` only exposes ephemeral public
// keys, from which the shared secret cannot be derived without the recipient's secret keys.
const STANDARD_HANDSHAKE_REGISTRY_DEFAULT_AUTHORIZED_READ_SIGNATURES = [
    'get_non_interactive_handshakes((Field),u32)',
    'get_app_siloed_secrets((Field),(Field))'
];
async function doesSelectorHaveSignature(functionSelector, signature) {
    return functionSelector.equals(await FunctionSelector.fromSignature(signature));
}
/**
 * Whether a cross-contract utility call targets one of the standard handshake registry's read functions.
 *
 * These reads are authorized by PXE for every wallet, without consulting the `authorizeUtilityCall` hook, so that
 * wallets don't need to know the handshake registry exists in order to deliver and discover messages through it.
 */ async function isStandardHandshakeRegistryUtilityRead(targetContractAddress, functionSelector) {
    if (!targetContractAddress.equals(STANDARD_HANDSHAKE_REGISTRY_ADDRESS)) {
        return false;
    }
    const matches = await allToCompletion(STANDARD_HANDSHAKE_REGISTRY_DEFAULT_AUTHORIZED_READ_SIGNATURES.map((signature)=>doesSelectorHaveSignature(functionSelector, signature)));
    return matches.some(Boolean);
}
function toPendingTaggedLog(retrievedLog) {
    return {
        log: retrievedLog.logData,
        context: toResolvedTx(retrievedLog)
    };
}
function toResolvedTx(tx) {
    const { txHash, blockNumber, blockHash, noteHashes, nullifiers } = tx;
    return {
        txHash,
        uniqueNoteHashesInTx: noteHashes,
        firstNullifierInTx: nullifiers[0],
        blockNumber,
        blockHash: blockHash.toFr()
    };
}
function toLogRetrievalResponse(retrievedLog) {
    const { logData, txHash, blockNumber, blockHash, blockTimestamp, noteHashes, nullifiers } = retrievedLog;
    return {
        // Skip the tag, and clip to the wire cap: public logs can exceed PRIVATE_LOG_CIPHERTEXT_LEN, which is the fixed
        // size of the oracle's BoundedVec slot. A no-op for private logs, which are already within the cap.
        logPayload: logData.slice(1, 1 + PRIVATE_LOG_CIPHERTEXT_LEN),
        txHash,
        uniqueNoteHashesInTx: noteHashes,
        firstNullifierInTx: nullifiers[0],
        blockNumber,
        blockTimestamp,
        blockHash
    };
}
function toValidationTxData(tx) {
    const { blockNumber, blockHash, txIndexInBlock, noteHashes, nullifiers } = tx;
    return {
        noteHashes,
        nullifiers,
        l2BlockNumber: blockNumber,
        l2BlockHash: blockHash,
        txIndexInBlock
    };
}
