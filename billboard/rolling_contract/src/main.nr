use aztec::macros::aztec;
pub mod encoding;
mod tests;

/// G05 foundation only. Posting admission, social actions, avatars and money are
/// intentionally not exposed until their existing protocol constraints integrate.
#[aztec]
pub contract RollingBoard {
    use aztec::{
        macros::{events::event, functions::{external, initializer, internal, only_self, view}, notes::note, storage::storage},
        messages::delivery::MessageDelivery,
        note::{note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions, note_interface::NoteProperties},
        protocol::{address::AztecAddress, hash::poseidon2_hash_with_separator, traits::{Deserialize, Packable, Serialize, ToField}},
        state_vars::{Map, Owned, PrivateSet, PublicImmutable, PublicMutable},
        utils::comparison::Comparator,
    };
    use crate::encoding::{name_id, pack_bytes, subboard_id, text_hash, validate_text};

    #[derive(Deserialize, Eq, Serialize, Packable)]
    #[note]
    pub struct UsernameNote {
        pub name_id: Field,
        pub schema: u32,
    }

    #[storage]
    struct Storage<Context> {
        moderator: PublicImmutable<AztecAddress, Context>,
        main_version: PublicMutable<u32, Context>,
        main_rules: PublicMutable<Field, Context>,
        registered_names: Map<Field, PublicMutable<bool, Context>, Context>,
        names: Owned<PrivateSet<UsernameNote, Context>, Context>,
        subboards: Map<Field, PublicMutable<bool, Context>, Context>,
        local_rules: Map<Field, PublicMutable<Field, Context>, Context>,
        metadata: Map<Field, PublicMutable<Field, Context>, Context>,
        creation_version: Map<Field, PublicMutable<u32, Context>, Context>,
        rejected: Map<Field, PublicMutable<bool, Context>, Context>,
        rejection_reasons: Map<Field, PublicMutable<Field, Context>, Context>,
    }

    #[event]
    struct NameRegistered {
        schema: u32,
        name_id: Field,
        first_length: u8,
        first: [Field; 2],
        last_length: u8,
        last: [Field; 2],
    }

    #[event]
    struct MainPolicyPublished {
        schema: u32,
        version: u32,
        digest: Field,
        length: u16,
        rules: [Field; 32],
    }

    #[event]
    struct SubboardCreated {
        schema: u32,
        subboard_id: Field,
        slug_length: u8,
        slug: [Field; 2],
        name_length: u16,
        name: [Field; 3],
        description_length: u16,
        description: [Field; 16],
        local_policy_version: u32,
        rules_length: u16,
        rules: [Field; 32],
        rules_digest: Field,
        main_policy_version: u32,
        metadata_digest: Field,
    }

    #[event]
    struct SubboardRejected {
        schema: u32,
        subboard_id: Field,
        main_policy_version: u32,
        local_policy_version: u32,
        reason_length: u16,
        reason: [Field; 7],
        reason_digest: Field,
    }

    #[external("public")]
    #[initializer]
    fn init(rules: [Field; 32], length: u16) {
        validate_text(rules, length, true);
        let moderator = self.msg_sender();
        assert(moderator.to_field() != 0, "Moderator required");
        self.storage.moderator.initialize(moderator);
        self.storage.main_version.write(1);
        let digest = text_hash(rules, length);
        self.storage.main_rules.write(digest);
        self.emit(MainPolicyPublished { schema: 1, version: 1, digest, length, rules });
    }

    #[external("private")]
    fn register_name(first: [u8; 32], first_length: u8, last: [u8; 32], last_length: u8) {
        let id = name_id(first, first_length, last, last_length);
        let owner = self.msg_sender();
        self.storage.names.at(owner).insert(UsernameNote { name_id: id, schema: 1 }).deliver(
            MessageDelivery::onchain_constrained(),
        );
        // Kernel links private mint to this public uniqueness gate. Rejection rolls
        // back the entire transaction, including its ownership note.
        self.enqueue_self._register_name(first, first_length, last, last_length);
    }

    #[external("public")]
    #[only_self]
    fn _register_name(first: [u8; 32], first_length: u8, last: [u8; 32], last_length: u8) {
        let id = name_id(first, first_length, last, last_length);
        assert(!self.storage.registered_names.at(id).read(), "Name already registered");
        self.storage.registered_names.at(id).write(true);
        self.emit(NameRegistered { schema: 1, name_id: id, first_length, first: pack_bytes(first), last_length, last: pack_bytes(last) });
    }

    /// Shared in-contract ownership gate for future named posts/profile updates.
    /// No owner or list of names is passed to a public call. Consuming and replacing
    /// authenticates the owner with its nullifier key and prevents forged note reuse.
    #[internal("private")]
    fn _assert_name_owner(id: Field) {
        assert(id != 0, "Name required");
        let owner = self.msg_sender();
        let options = NoteGetterOptions::<UsernameNote, 2, Field, Field>::new()
            .select(UsernameNote::properties().name_id, Comparator.EQ, id).set_limit(1);
        let notes = self.storage.names.at(owner).pop_notes(options);
        assert(notes.len() == 1, "No owned name");
        let note = notes.get_unchecked(0);
        assert((note.schema == 1) & (note.name_id == id), "Invalid ownership note");
        self.storage.names.at(owner).insert(note).deliver(MessageDelivery::onchain_constrained());
    }

    /// A private ownership exercise, not a posting or profile-update bypass.
    #[external("private")]
    fn authenticate_name(id: Field) { self.internal._assert_name_owner(id); }

    /// Wallet-local utility only. Never expose this request through the index API.
    /// Avoid `offset`: the pinned generated call serializer uses that local name.
    #[external("utility")]
    unconstrained fn owned_names(owner: AztecAddress, page_offset: u32) -> pub [Field; 8] {
        let options = NoteViewerOptions::<UsernameNote, 2>::new().set_limit(8).set_offset(page_offset);
        let notes = self.storage.names.at(owner).view_notes(options);
        let mut result = [0; 8];
        for i in 0..8 { if i < notes.len() { result[i] = notes.get_unchecked(i).name_id; } }
        result
    }

    #[external("public")]
    #[view]
    fn name_registered(id: Field) -> pub bool { self.storage.registered_names.at(id).read() }

    /// No collateral test or creator permission is introduced. Normal transaction
    /// fees still apply. Only public board data crosses the private/public boundary.
    #[external("private")]
    fn create_subboard(slug: [u8; 40], slug_length: u8, name: [Field; 3], name_length: u16,
        description: [Field; 16], description_length: u16, rules: [Field; 32], rules_length: u16) {
        assert(self.msg_sender().to_field() != 0, "Account required");
        self.enqueue_self._create_subboard(slug, slug_length, name, name_length, description, description_length, rules, rules_length);
    }

    #[external("public")]
    #[only_self]
    fn _create_subboard(slug: [u8; 40], slug_length: u8, name: [Field; 3], name_length: u16,
        description: [Field; 16], description_length: u16, rules: [Field; 32], rules_length: u16) {
        let id = subboard_id(slug, slug_length);
        validate_text(name, name_length, true);
        validate_text(description, description_length, true);
        validate_text(rules, rules_length, false);
        assert(!self.storage.subboards.at(id).read(), "Subboard already exists");
        let rules_digest = text_hash(rules, rules_length);
        let metadata_digest = poseidon2_hash_with_separator([id, text_hash(name, name_length), text_hash(description, description_length)], 0x52434d31);
        let main_policy_version = self.storage.main_version.read();
        self.storage.subboards.at(id).write(true);
        self.storage.local_rules.at(id).write(rules_digest);
        self.storage.metadata.at(id).write(metadata_digest);
        self.storage.creation_version.at(id).write(main_policy_version);
        self.emit(SubboardCreated { schema: 1, subboard_id: id, slug_length, slug: pack_bytes(slug),
            name_length, name, description_length, description, local_policy_version: 1,
            rules_length, rules, rules_digest, main_policy_version, metadata_digest });
    }

    #[external("public")]
    fn set_main_policy(rules: [Field; 32], length: u16) {
        assert(self.msg_sender() == self.storage.moderator.read(), "Only moderator");
        validate_text(rules, length, true);
        let version = self.storage.main_version.read() + 1;
        let digest = text_hash(rules, length);
        self.storage.main_version.write(version);
        self.storage.main_rules.write(digest);
        self.emit(MainPolicyPublished { schema: 1, version, digest, length, rules });
    }

    #[external("public")]
    fn reject_subboard(id: Field, reason: [Field; 7], length: u16) {
        assert(self.msg_sender() == self.storage.moderator.read(), "Only moderator");
        assert(self.storage.subboards.at(id).read(), "Unknown subboard");
        assert(!self.storage.rejected.at(id).read(), "Already rejected");
        validate_text(reason, length, true);
        let reason_digest = text_hash(reason, length);
        self.storage.rejected.at(id).write(true);
        self.storage.rejection_reasons.at(id).write(reason_digest);
        self.emit(SubboardRejected { schema: 1, subboard_id: id, main_policy_version: self.storage.main_version.read(),
            local_policy_version: 1, reason_length: length, reason, reason_digest });
    }

    /// Local policy never replaces the parent: consumers must apply BOTH returned
    /// rule sets. Parent updates are observed dynamically with no per-subboard copy.
    #[external("public")]
    #[view]
    fn effective_policy(id: Field) -> pub (u32, Field, u32, Field, bool) {
        assert(self.storage.subboards.at(id).read(), "Unknown subboard");
        (self.storage.main_version.read(), self.storage.main_rules.read(), 1,
            self.storage.local_rules.at(id).read(), self.storage.rejected.at(id).read())
    }

    #[external("public")]
    #[view]
    fn subboard_state(id: Field) -> pub (bool, Field, u32, bool, Field) {
        (self.storage.subboards.at(id).read(), self.storage.metadata.at(id).read(),
            self.storage.creation_version.at(id).read(), self.storage.rejected.at(id).read(),
            self.storage.rejection_reasons.at(id).read())
    }

    #[external("public")]
    #[view]
    fn main_policy() -> pub (u32, Field) { (self.storage.main_version.read(), self.storage.main_rules.read()) }
}
