use aztec::protocol::{address::AztecAddress, hash::poseidon2_hash_with_separator, traits::{Deserialize, Serialize, Packable, ToField}};
use crate::encoding::validate_text;

#[derive(Deserialize, Serialize, Eq)]
pub struct PostDraft {
    pub subboard: Field,
    pub parent: Field,
    pub root_reference: Field,
    pub kind: u8,
    pub name_id: Field,
    pub reference: Field,
    pub message: [Field; 32],
    pub length: u16,
    pub expected_main_policy_version: u32,
    pub expected_local_policy_version: u32,
}

/// Content lives in authenticated logs; fixed metadata keeps combined invocation
/// transactions below the public write limit. No human account is stored here.
#[derive(Deserialize, Serialize, Eq, Packable)]
pub struct PostRecord {
    pub subboard: Field,
    pub parent: Field,
    pub root: Field,
    pub kind: u8,
    pub name_id: Field,
    pub reference: Field,
    pub content_digest: Field,
}
#[derive(Deserialize, Serialize, Eq, Packable)]
pub struct PluginRecord { pub adapter: AztecAddress, pub enabled: bool }

pub fn validate_draft(draft: PostDraft, nonce: Field) {
    assert(nonce != 0, "Zero post nonce");
    assert((draft.kind >= 1) & (draft.kind <= 3), "Invalid post kind");
    assert((draft.kind == 1) == (draft.reference == 0), "Invalid post reference");
    assert((draft.parent == 0) == (draft.root_reference == 0), "Invalid root reference");
    validate_text(draft.message, draft.length, draft.kind != 3);
}

/// Exact frozen shared/rolling/invocation.mjs 45-field preimage, with no account,
/// deposit identity, note link, caller-selected hash or unrelated name list.
pub fn invocation_preimage(chain: Field, version: Field, board: AztecAddress,
    adapter: AztecAddress, nonce: Field, draft: PostDraft) -> [Field; 45] {
    validate_draft(draft, nonce);
    assert((chain != 0) & (version != 0) & (board.to_field() != 0) & (adapter.to_field() != 0), "Invocation scope required");
    [1, chain, version, board.to_field(), adapter.to_field(), draft.subboard,
        draft.parent, draft.root_reference, draft.kind as Field, draft.name_id,
        draft.reference, nonce, draft.length as Field].concat(draft.message)
}
pub fn invocation_target(chain: Field, version: Field, board: AztecAddress,
    adapter: AztecAddress, nonce: Field, draft: PostDraft) -> Field {
    poseidon2_hash_with_separator(invocation_preimage(chain, version, board, adapter, nonce, draft), 0x52434931)
}
pub fn policy_identity(main_version: u32, local_version: u32) -> Field {
    main_version as Field + local_version as Field * 0x100000000
}
