/* eslint-disable camelcase */ import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec-labs/constants';
import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { FieldReader } from '@aztec-labs/foundation/serialize';
import { toACVMField } from '@aztec-labs/simulator/client';
import { ARRAY, AZTEC_ADDRESS, BLOCK_HASH, BLOCK_HEADER, BLOCK_NUMBER, BLOCK_REFERENCE, BOOL, BOUNDED_VEC, CALL_PRIVATE_RESULT, CONTRACT_INSTANCE, DELIVERY_MODE, EPHEMERAL_ARRAY, EVENT_VALIDATION_REQUEST, FACT_COLLECTION, FACT_SCOPE, FIELD, FIXED_ARRAY, FUNCTION_SELECTOR, KEY_VALIDATION_REQUEST, LOG_RETRIEVAL_REQUEST, LOG_RETRIEVAL_RESPONSE, MEMBERSHIP_WITNESS, NOTE, NOTE_ORIGIN, NOTE_SELECTOR, NOTE_VALIDATION_REQUEST, NULLIFIER_MEMBERSHIP_WITNESS, NULLIFIER_STATUS, OPTION, PENDING_TAGGED_LOG, POINT, PROVIDED_SECRET, PUBLIC_DATA_WITNESS, PUBLIC_KEYS_AND_PARTIAL_ADDRESS, RESOLVED_TAGGING_STRATEGY, RESOLVED_TX, STR, TX_EFFECT, TX_HASH, U8, U32, UNSILOED_MESSAGE_NULLIFIER, UTILITY_CONTEXT, assertReadersConsumed, slotsOf } from './oracle_type_mappings.js';
export { ARRAY, AZTEC_ADDRESS, BIGINT, BLOCK_NUMBER, BOOL, BOUNDED_VEC, U8, DELIVERY_MODE, RESOLVED_TAGGING_STRATEGY, EPHEMERAL_ARRAY, EVENT_VALIDATION_REQUEST, FIELD, FUNCTION_SELECTOR, LOG_RETRIEVAL_REQUEST, LOG_RETRIEVAL_RESPONSE, MEMBERSHIP_WITNESS, NOTE_VALIDATION_REQUEST, OPTION, PENDING_TAGGED_LOG, POINT, PROVIDED_SECRET, RESOLVED_TX, STR, U32, slotsOf } from './oracle_type_mappings.js';
export const ORACLE_REGISTRY = {
    aztec_misc_assertCompatibleOracleVersion: makeEntry({
        params: [
            {
                name: 'major',
                type: U32
            },
            {
                name: 'minor',
                type: U32
            }
        ]
    }),
    aztec_misc_getRandomField: makeEntry({
        returnType: FIELD
    }),
    aztec_misc_log: makeEntry({
        params: [
            {
                name: 'level',
                type: U32
            },
            {
                name: 'message',
                type: STR
            },
            {
                name: 'fieldsSize',
                type: U32
            },
            {
                name: 'fields',
                type: ARRAY(FIELD)
            }
        ]
    }),
    aztec_utl_getUtilityContext: makeEntry({
        returnType: UTILITY_CONTEXT
    }),
    aztec_utl_getKeyValidationRequest: makeEntry({
        params: [
            {
                name: 'pkMHash',
                type: FIELD
            },
            {
                name: 'keyIndex',
                type: FIELD
            }
        ],
        returnType: KEY_VALIDATION_REQUEST
    }),
    aztec_utl_getContractInstance: makeEntry({
        params: [
            {
                name: 'address',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: CONTRACT_INSTANCE
    }),
    aztec_utl_getNoteHashMembershipWitness: makeEntry({
        params: [
            {
                name: 'anchorBlockHash',
                type: BLOCK_HASH
            },
            {
                name: 'noteHash',
                type: FIELD
            }
        ],
        returnType: MEMBERSHIP_WITNESS(NOTE_HASH_TREE_HEIGHT)
    }),
    aztec_utl_getBlockHashMembershipWitness: makeEntry({
        params: [
            {
                name: 'anchorBlockHash',
                type: BLOCK_HASH
            },
            {
                name: 'blockHash',
                type: BLOCK_HASH
            }
        ],
        returnType: OPTION(MEMBERSHIP_WITNESS(ARCHIVE_HEIGHT))
    }),
    aztec_utl_areBlockHashesInArchive: makeEntry({
        params: [
            {
                name: 'anchorBlockHash',
                type: BLOCK_HASH
            },
            {
                name: 'blockHashes',
                type: EPHEMERAL_ARRAY(BLOCK_HASH)
            }
        ],
        returnType: EPHEMERAL_ARRAY(BOOL)
    }),
    aztec_utl_getNullifierMembershipWitness: makeEntry({
        params: [
            {
                name: 'blockHash',
                type: BLOCK_HASH
            },
            {
                name: 'nullifier',
                type: FIELD
            }
        ],
        returnType: NULLIFIER_MEMBERSHIP_WITNESS
    }),
    aztec_utl_getLowNullifierMembershipWitness: makeEntry({
        params: [
            {
                name: 'blockHash',
                type: BLOCK_HASH
            },
            {
                name: 'nullifier',
                type: FIELD
            }
        ],
        returnType: NULLIFIER_MEMBERSHIP_WITNESS
    }),
    aztec_utl_getPublicDataWitness: makeEntry({
        params: [
            {
                name: 'blockHash',
                type: BLOCK_HASH
            },
            {
                name: 'leafSlot',
                type: FIELD
            }
        ],
        returnType: PUBLIC_DATA_WITNESS
    }),
    aztec_utl_getBlockHeader: makeEntry({
        params: [
            {
                name: 'blockNumber',
                type: BLOCK_NUMBER
            }
        ],
        returnType: BLOCK_HEADER
    }),
    aztec_utl_getAuthWitness: makeEntry({
        params: [
            {
                name: 'messageHash',
                type: FIELD
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_getPublicKeysAndPartialAddress: makeEntry({
        params: [
            {
                name: 'address',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: OPTION(PUBLIC_KEYS_AND_PARTIAL_ADDRESS)
    }),
    aztec_utl_getNullifierStatuses: makeEntry({
        params: [
            {
                name: 'innerNullifiers',
                type: EPHEMERAL_ARRAY(FIELD)
            }
        ],
        returnType: EPHEMERAL_ARRAY(NULLIFIER_STATUS)
    }),
    aztec_utl_getL1ToL2MembershipWitnessV2: makeEntry({
        params: [
            {
                name: 'messageHash',
                type: FIELD
            },
            {
                name: 'nullifier',
                type: OPTION(UNSILOED_MESSAGE_NULLIFIER)
            }
        ],
        returnType: MEMBERSHIP_WITNESS(L1_TO_L2_MSG_TREE_HEIGHT)
    }),
    aztec_utl_tryGetL1ToL2MembershipWitness: makeEntry({
        params: [
            {
                name: 'messageHash',
                type: FIELD
            },
            {
                name: 'nullifier',
                type: OPTION(UNSILOED_MESSAGE_NULLIFIER)
            }
        ],
        returnType: OPTION(MEMBERSHIP_WITNESS(L1_TO_L2_MSG_TREE_HEIGHT))
    }),
    aztec_utl_getFromPublicStorage: makeEntry({
        params: [
            {
                name: 'blockHash',
                type: BLOCK_HASH
            },
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'startStorageSlot',
                type: FIELD
            },
            {
                name: 'numberOfElements',
                type: U32
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_getNotes: makeEntry({
        params: [
            {
                name: 'owner',
                type: OPTION(AZTEC_ADDRESS)
            },
            {
                name: 'storageSlot',
                type: FIELD
            },
            {
                name: 'numSelects',
                type: U32
            },
            {
                name: 'selectByIndexes',
                type: ARRAY(U32)
            },
            {
                name: 'selectByOffsets',
                type: ARRAY(U32)
            },
            {
                name: 'selectByLengths',
                type: ARRAY(U32)
            },
            {
                name: 'selectValues',
                type: ARRAY(FIELD)
            },
            {
                name: 'selectComparators',
                type: ARRAY(U32)
            },
            {
                name: 'sortByIndexes',
                type: ARRAY(U32)
            },
            {
                name: 'sortByOffsets',
                type: ARRAY(U32)
            },
            {
                name: 'sortByLengths',
                type: ARRAY(U32)
            },
            {
                name: 'sortOrder',
                type: ARRAY(U32)
            },
            {
                name: 'limit',
                type: U32
            },
            {
                name: 'offset',
                type: U32
            },
            {
                name: 'status',
                type: U32
            },
            {
                name: 'maxNotes',
                type: U32
            },
            {
                name: 'packedHintedNoteLength',
                type: U32
            }
        ],
        returnType: BOUNDED_VEC(NOTE)
    }),
    aztec_utl_getSettledNoteOrigin: makeEntry({
        params: [
            {
                name: 'noteHash',
                type: FIELD
            },
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'noteNonce',
                type: FIELD
            }
        ],
        returnType: OPTION(NOTE_ORIGIN)
    }),
    aztec_utl_getPendingTaggedLogsV2: makeEntry({
        params: [
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            },
            {
                name: 'providedSecrets',
                type: EPHEMERAL_ARRAY(PROVIDED_SECRET)
            }
        ],
        returnType: EPHEMERAL_ARRAY(PENDING_TAGGED_LOG)
    }),
    aztec_utl_validateAndStoreEnqueuedNotesAndEvents: makeEntry({
        params: [
            {
                name: 'noteValidationRequests',
                type: EPHEMERAL_ARRAY(NOTE_VALIDATION_REQUEST)
            },
            {
                name: 'eventValidationRequests',
                type: EPHEMERAL_ARRAY(EVENT_VALIDATION_REQUEST)
            },
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            }
        ]
    }),
    aztec_utl_getLogsByTagV2: makeEntry({
        params: [
            {
                name: 'requests',
                type: EPHEMERAL_ARRAY(LOG_RETRIEVAL_REQUEST)
            }
        ],
        returnType: EPHEMERAL_ARRAY(EPHEMERAL_ARRAY(LOG_RETRIEVAL_RESPONSE))
    }),
    aztec_utl_getResolvedTxs: makeEntry({
        params: [
            {
                name: 'requests',
                type: EPHEMERAL_ARRAY(FIELD)
            }
        ],
        returnType: EPHEMERAL_ARRAY(OPTION(RESOLVED_TX))
    }),
    aztec_utl_getTxEffect: makeEntry({
        params: [
            {
                name: 'txHash',
                type: TX_HASH
            }
        ],
        returnType: OPTION(TX_EFFECT)
    }),
    aztec_utl_getTxEffects: makeEntry({
        params: [
            {
                name: 'txHashes',
                type: EPHEMERAL_ARRAY(TX_HASH)
            }
        ],
        returnType: EPHEMERAL_ARRAY(OPTION(TX_EFFECT))
    }),
    aztec_utl_setCapsule: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'capsule',
                type: ARRAY(FIELD)
            },
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            }
        ]
    }),
    aztec_utl_getCapsule: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'tSize',
                type: U32
            },
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: OPTION(ARRAY(FIELD))
    }),
    aztec_utl_deleteCapsule: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            }
        ]
    }),
    aztec_utl_copyCapsule: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'srcSlot',
                type: FIELD
            },
            {
                name: 'dstSlot',
                type: FIELD
            },
            {
                name: 'numEntries',
                type: U32
            },
            {
                name: 'scope',
                type: AZTEC_ADDRESS
            }
        ]
    }),
    aztec_utl_decryptAes128: makeEntry({
        params: [
            {
                name: 'ciphertext',
                type: BOUNDED_VEC(U8)
            },
            {
                name: 'iv',
                type: FIXED_ARRAY(U8, 16)
            },
            {
                name: 'symKey',
                type: FIXED_ARRAY(U8, 16)
            }
        ],
        returnType: OPTION(BOUNDED_VEC(U8))
    }),
    aztec_utl_getSharedSecrets: makeEntry({
        params: [
            {
                name: 'address',
                type: AZTEC_ADDRESS
            },
            {
                name: 'ephPks',
                type: EPHEMERAL_ARRAY(POINT)
            },
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: EPHEMERAL_ARRAY(FIELD)
    }),
    aztec_utl_setContractSyncCacheInvalid: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'scopes',
                type: BOUNDED_VEC(AZTEC_ADDRESS)
            }
        ]
    }),
    aztec_utl_emitOffchainEffect: makeEntry({
        params: [
            {
                name: 'data',
                type: ARRAY(FIELD)
            }
        ]
    }),
    aztec_utl_recordFact: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'scope',
                type: FACT_SCOPE
            },
            {
                name: 'factCollectionTypeId',
                type: FIELD
            },
            {
                name: 'factCollectionId',
                type: FIELD
            },
            {
                name: 'factTypeId',
                type: FIELD
            },
            {
                name: 'payload',
                type: EPHEMERAL_ARRAY(FIELD)
            },
            {
                name: 'originBlock',
                type: OPTION(BLOCK_REFERENCE)
            }
        ]
    }),
    aztec_utl_deleteFactCollection: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'scope',
                type: FACT_SCOPE
            },
            {
                name: 'factCollectionTypeId',
                type: FIELD
            },
            {
                name: 'factCollectionId',
                type: FIELD
            }
        ]
    }),
    aztec_utl_getFactCollection: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'scope',
                type: FACT_SCOPE
            },
            {
                name: 'factCollectionTypeId',
                type: FIELD
            },
            {
                name: 'factCollectionId',
                type: FIELD
            }
        ],
        returnType: OPTION(FACT_COLLECTION)
    }),
    aztec_utl_getFactCollectionsByType: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'scope',
                type: FACT_SCOPE
            },
            {
                name: 'factCollectionTypeId',
                type: FIELD
            }
        ],
        returnType: EPHEMERAL_ARRAY(FACT_COLLECTION)
    }),
    aztec_utl_callUtilityFunction: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'functionSelector',
                type: FUNCTION_SELECTOR
            },
            {
                name: 'args',
                type: ARRAY(FIELD)
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_pushEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'elements',
                type: ARRAY(FIELD)
            }
        ],
        returnType: U32
    }),
    aztec_utl_popEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_getEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_setEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            },
            {
                name: 'elements',
                type: ARRAY(FIELD)
            }
        ]
    }),
    aztec_utl_getEphemeralLen: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ],
        returnType: U32
    }),
    aztec_utl_removeEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            }
        ]
    }),
    aztec_utl_clearEphemeral: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ]
    }),
    aztec_utl_pushTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'elements',
                type: ARRAY(FIELD)
            }
        ],
        returnType: U32
    }),
    aztec_utl_popTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_getTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_utl_setTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            },
            {
                name: 'elements',
                type: ARRAY(FIELD)
            }
        ]
    }),
    aztec_utl_getTransientLen: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ],
        returnType: U32
    }),
    aztec_utl_removeTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            },
            {
                name: 'index',
                type: U32
            }
        ]
    }),
    aztec_utl_clearTransient: makeEntry({
        params: [
            {
                name: 'slot',
                type: FIELD
            }
        ]
    }),
    aztec_prv_setHashPreimage: makeEntry({
        params: [
            {
                name: 'values',
                type: ARRAY(FIELD)
            },
            {
                name: 'hash',
                type: FIELD
            }
        ]
    }),
    aztec_prv_getHashPreimage: makeEntry({
        params: [
            {
                name: 'returnsHash',
                type: FIELD
            }
        ],
        returnType: ARRAY(FIELD)
    }),
    aztec_prv_notifyCreatedNote: makeEntry({
        params: [
            {
                name: 'owner',
                type: AZTEC_ADDRESS
            },
            {
                name: 'storageSlot',
                type: FIELD
            },
            {
                name: 'randomness',
                type: FIELD
            },
            {
                name: 'noteTypeId',
                type: NOTE_SELECTOR
            },
            {
                name: 'note',
                type: ARRAY(FIELD)
            },
            {
                name: 'noteHash',
                type: FIELD
            },
            {
                name: 'counter',
                type: U32
            }
        ]
    }),
    aztec_prv_notifyNullifiedNote: makeEntry({
        params: [
            {
                name: 'innerNullifier',
                type: FIELD
            },
            {
                name: 'noteHash',
                type: FIELD
            },
            {
                name: 'counter',
                type: U32
            }
        ]
    }),
    aztec_prv_notifyCreatedNullifier: makeEntry({
        params: [
            {
                name: 'innerNullifier',
                type: FIELD
            }
        ]
    }),
    aztec_prv_isNullifierPending: makeEntry({
        params: [
            {
                name: 'innerNullifier',
                type: FIELD
            },
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: BOOL
    }),
    aztec_prv_notifyCreatedContractClassLog: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'message',
                type: ARRAY(FIELD)
            },
            {
                name: 'length',
                type: U32
            },
            {
                name: 'counter',
                type: U32
            }
        ]
    }),
    aztec_prv_callPrivateFunction: makeEntry({
        params: [
            {
                name: 'contractAddress',
                type: AZTEC_ADDRESS
            },
            {
                name: 'functionSelector',
                type: FUNCTION_SELECTOR
            },
            {
                name: 'argsHash',
                type: FIELD
            },
            {
                name: 'sideEffectCounter',
                type: U32
            },
            {
                name: 'isStaticCall',
                type: BOOL
            }
        ],
        returnType: CALL_PRIVATE_RESULT
    }),
    aztec_prv_assertValidPublicCalldata: makeEntry({
        params: [
            {
                name: 'calldataHash',
                type: FIELD
            }
        ]
    }),
    aztec_prv_notifyRevertiblePhaseStart: makeEntry({
        params: [
            {
                name: 'minRevertibleSideEffectCounter',
                type: U32
            }
        ]
    }),
    aztec_prv_isExecutionInRevertiblePhase: makeEntry({
        params: [
            {
                name: 'sideEffectCounter',
                type: U32
            }
        ],
        returnType: BOOL
    }),
    aztec_prv_getAppTaggingSecret: makeEntry({
        params: [
            {
                name: 'sender',
                type: AZTEC_ADDRESS
            },
            {
                name: 'recipient',
                type: AZTEC_ADDRESS
            }
        ],
        returnType: OPTION(FIELD)
    }),
    aztec_prv_getNextTaggingIndex: makeEntry({
        params: [
            {
                name: 'secret',
                type: FIELD
            },
            {
                name: 'deliveryMode',
                type: DELIVERY_MODE
            }
        ],
        returnType: U32
    }),
    aztec_prv_getSenderForTags: makeEntry({
        returnType: OPTION(AZTEC_ADDRESS)
    }),
    aztec_prv_resolveTaggingStrategy: makeEntry({
        params: [
            {
                name: 'sender',
                type: AZTEC_ADDRESS
            },
            {
                name: 'recipient',
                type: AZTEC_ADDRESS
            },
            {
                name: 'deliveryMode',
                type: DELIVERY_MODE
            }
        ],
        returnType: RESOLVED_TAGGING_STRATEGY
    }),
    aztec_prv_resolveCustomRequest: makeEntry({
        params: [
            {
                name: 'kind',
                type: FIELD
            },
            {
                name: 'payload',
                type: ARRAY(FIELD)
            }
        ],
        returnType: ARRAY(FIELD)
    })
};
export function makeEntry({ params, returnType } = {}) {
    return {
        params: params ?? [],
        returnType,
        deserializeParams (inputs) {
            const resolvedParams = params ?? [];
            // Walk the input slots left-to-right, advancing by each param's slot count.
            let offset = 0;
            const named = resolvedParams.map((param)=>{
                if (!param.type.deserialization) {
                    throw new Error(`Param '${param.name}' has no deserialization defined`);
                }
                // Collect the slots for this param and wrap each in a FieldReader.
                const slotCount = slotsOf(param.type);
                const readers = inputs.slice(offset, offset + slotCount).map((slot)=>new FieldReader(slot.map((hex)=>Fr.fromString(hex))));
                offset += slotCount;
                // Delegate to the TypeMapping's deserializer, assert the param's slots are fully consumed, and tag the
                // result with the param name.
                const value = param.type.deserialization.fn(readers);
                assertReadersConsumed(readers);
                return {
                    name: param.name,
                    value
                };
            });
            // Every input slot must be specified by a param: oracles whose Noir decl passes an extra field must declare it
            // (the handler can ignore it). Otherwise an under-declared shape would silently drop a field into nothing.
            if (offset !== inputs.length) {
                throw new Error(`Oracle received ${inputs.length} input slot(s) but the registry specifies ${offset}`);
            }
            return named;
        },
        serializeReturn (result) {
            if (returnType?.serialization === undefined) {
                return [];
            }
            return returnType.serialization.fn(result).map((slot)=>Array.isArray(slot) ? slot.map(toACVMField) : toACVMField(slot));
        }
    };
}
