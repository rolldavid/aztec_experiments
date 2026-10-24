use aztec::{
    context::{PrivateContext, UtilityContext},
    ephemeral::EphemeralArray,
    keys::getters::{get_ovsk_app, get_public_keys},
    messages::{delivery::{OnchainDeliveryMode, MessageDelivery},
        discovery::{ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, finish_plaintext_discovery,
            process_message::process_message_plaintext},
        logs::note::encode_private_note_message,
        processing::{ResolvedTx, offchain::OffchainInboxSync}},
    note::{lifecycle::NewNote, note_interface::NoteType},
    oracle::notes::get_next_tagging_index,
    protocol::{address::AztecAddress, constants::{DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG, PRIVATE_LOG_SIZE_IN_FIELDS},
        hash::{compute_log_tag, poseidon2_hash, poseidon2_hash_with_separator},
        traits::{Deserialize, Packable, Serialize, ToField}},
    utils::array,
};
use crate::envelope;

global OWNER_TAG_DOMAIN: u32 = 2291287651;
global OWNER_ENCRYPTION_DOMAIN: u32 = 1153397793;

#[derive(Deserialize, Serialize)]
struct ProvidedSecret { secret: Field, mode: OnchainDeliveryMode }
#[derive(Deserialize, Serialize)]
struct PendingLog { log: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>, context: ResolvedTx }

#[oracle(aztec_utl_getPendingOwnerTaggedLogsV1)]
unconstrained fn get_pending_owner_logs(scope: AztecAddress, secrets: EphemeralArray<ProvidedSecret>) -> EphemeralArray<PendingLog> {}

unconstrained fn secret(owner: AztecAddress, chain: Field, version: Field) -> Field {
    poseidon2_hash_with_separator([get_ovsk_app(get_public_keys(owner).ovpk_m_hash), chain, version, owner.to_field()], OWNER_TAG_DOMAIN)
}

/// All encryption/tagging is unconstrained. Existing native note hashes and nullifiers
/// remain the only value authority. There are no discovery notes or sequence nullifiers.
fn encrypted_message(context: &mut PrivateContext, plaintext: BoundedVec<Field, 12>) -> (Field, BoundedVec<Field, 15>) {
    let owner = context.maybe_msg_sender().unwrap();
    let chain = context.chain_id();
    let version = context.version();
    let domain = [chain, version, context.this_address().to_field(), owner.to_field()];
    // Pure projection of an already existing kernel-bound input; no extra circuit effect.
    let protocol_nullifier = context.finish().protocol_nullifier;
    let (tag, ciphertext) = unsafe {
        let key = secret(owner, chain, version);
        let index = get_next_tagging_index(key, MessageDelivery::onchain_unconstrained());
        let tag = compute_log_tag(poseidon2_hash([key, index as Field]), DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG);
        let encryption_key = poseidon2_hash_with_separator([key, protocol_nullifier], OWNER_ENCRYPTION_DOMAIN);
        (tag, envelope::seal(encryption_key, domain, 0, 0, plaintext))
    };
    (tag, ciphertext)
}

pub fn deliver_message(context: &mut PrivateContext, plaintext: BoundedVec<Field, 12>) {
    let (tag, ciphertext) = encrypted_message(context, plaintext);
    context.emit_private_log_unsafe(tag, ciphertext);
}

pub fn deliver_note<Note>(context: &mut PrivateContext, created: NewNote<Note>)
where Note: NoteType + Packable {
    assert_eq(created.owner, context.maybe_msg_sender().unwrap());
    let (tag, ciphertext) = encrypted_message(context, BoundedVec::from_array(encode_private_note_message(created.note, created.owner, created.storage_slot, created.randomness)));
    context.emit_raw_note_log_unsafe(tag, ciphertext, created.note_hash_counter);
}

pub fn deliver_optional_note<Note>(context: &mut PrivateContext, created: Option<NewNote<Note>>)
where Note: NoteType + Packable {
    if created.is_some() { deliver_note(context, created.unwrap_unchecked()); }
}

pub unconstrained fn sync_owner_state(
    contract_address: AztecAddress, compute_hash: ComputeNoteHash, compute_nullifier: ComputeNoteNullifier,
    custom: Option<CustomMessageHandler>, _offchain: Option<OffchainInboxSync>, scope: AztecAddress,
) {
    let context = UtilityContext::new();
    assert_eq(context.this_address(), contract_address);
    let key = secret(scope, context.chain_id(), context.version());
    let domain = [context.chain_id(), context.version(), contract_address.to_field(), scope.to_field()];
    let secrets = EphemeralArray::from_array([ProvidedSecret { secret: key, mode: MessageDelivery::onchain_unconstrained().into() }]);
    let logs = get_pending_owner_logs(scope, secrets);
    for i in 0..logs.len() {
        let log = logs.get(i);
        if log.log.len() == 16 {
            let encryption_key = poseidon2_hash_with_separator([key, log.context.first_nullifier_in_tx], OWNER_ENCRYPTION_DOMAIN);
            let message = envelope::open(encryption_key, domain, 0, 0, array::subbvec(log.log, 1));
            if message.is_some() {
                process_message_plaintext(contract_address, compute_hash, compute_nullifier, custom, message.unwrap(), log.context, scope);
            }
        }
    }
    finish_plaintext_discovery(contract_address, compute_hash, compute_nullifier, scope);
}
