use aztec::{macros::{aztec, AztecConfig}, test::helpers::test_environment::TestEnvironment};
use owner_delivery::delivery::sync_owner_state;

#[aztec(AztecConfig::new().custom_sync_state(sync_owner_state))]
pub contract OwnerFixture {
    use aztec::{
        macros::{events::event, functions::{external, internal, only_self, allow_phase_change}, notes::note, storage::storage},
        protocol::{address::AztecAddress, traits::{Deserialize, Serialize, Packable}},
        state_vars::{Owned, PrivateMutable, StateVariable},
    };
    use owner_delivery::envelope;
    use owner_delivery::delivery::{deliver_note, deliver_message, deliver_optional_note};
    use uint_note::{UintNote, PartialUintNote};
    use balance_set::BalanceSet;

    #[derive(Deserialize, Eq, Serialize, Packable)]
    #[note]
    pub struct ValueNote { pub value: Field }

    #[derive(Serialize)]
    #[event]
    struct PrivatePreference { value: Field }

    #[storage]
    struct Storage<Context> {
        values: Owned<PrivateMutable<ValueNote, Context>, Context>,
        refunds: Owned<BalanceSet<Context>, Context>,
    }

    #[external("private")]
    fn put(value: Field) { self.internal._put(value); }

    #[external("private")]
    fn put_twice(first: Field, second: Field) {
        self.internal._put(first);
        self.internal._put(second);
    }

    #[internal("private")]
    fn _put(value: Field) {
        let owner = self.msg_sender();
        let note = self.storage.values.at(owner).initialize_or_replace(|_previous| ValueNote { value }).get_new_note();
        deliver_note(self.context, note);
    }

    #[external("private")]
    fn preference(value: Field) {
        let message = self.emit(PrivatePreference { value }).get_plaintext();
        deliver_message(self.context, message);
    }

    #[external("private")]
    fn credit(value: u128) {
        let note = self.storage.refunds.at(self.msg_sender()).add(value).get_new_note();
        deliver_optional_note(self.context, note);
    }

    #[external("private")]
    fn refund(value: u128) {
        let owner = self.msg_sender();
        let (partial, message) = UintNote::partial_with_message(owner, self.context, self.address);
        deliver_message(self.context, BoundedVec::from_array(message));
        self.enqueue_self._complete(partial, value);
    }

    #[external("public")]
    #[only_self]
    fn _complete(partial: PartialUintNote, value: u128) {
        if value > 0 { partial.complete(self.context, self.address, self.storage.refunds.get_storage_slot(), value); }
    }

    #[external("private")]
    #[allow_phase_change]
    fn reverted_app(value: Field) {
        self.internal._put(value);
        self.enqueue_self._fail();
    }

    #[external("private")]
    #[allow_phase_change]
    fn setup_refund_reverted_app(value: u128) {
        let owner = self.msg_sender();
        let (partial, message) = UintNote::partial_with_message(owner, self.context, self.address);
        deliver_message(self.context, BoundedVec::from_array(message));
        self.set_as_teardown(OwnerFixture::at(self.address)._complete(partial, value));
        self.context.set_as_fee_payer();
        self.context.end_setup();
        self.internal._put(999);
        self.enqueue_self._fail();
    }

    #[external("public")]
    #[only_self]
    fn _fail() { assert(false, "Deliberate owner-delivery app revert"); }

    #[external("private")]
    fn replay(tag: Field, ciphertext: [Field; 15]) {
        self.context.emit_private_log_unsafe(tag, BoundedVec::from_array(ciphertext));
    }

    #[external("utility")]
    unconstrained fn copy_record(owner: AztecAddress, sequence: u64) -> (Field, [Field; 15]) {
        owner_delivery::delivery::copy_record_for_test(self.address, owner, sequence)
    }

    #[external("utility")]
    unconstrained fn balance(owner: AztecAddress) -> u128 {
        self.storage.refunds.at(owner).balance_of()
    }

    #[external("utility")]
    unconstrained fn read(owner: AztecAddress) -> Field {
        self.storage.values.at(owner).view_note().value
    }


    #[external("utility")]
    unconstrained fn envelope_roundtrip(secret: Field, domain: [Field; 4]) -> bool {
        let plaintext = BoundedVec::from_array([17, 23, 42]);
        let ciphertext = envelope::seal(secret, domain, 0, 1, plaintext);
        let restored = envelope::open(secret, domain, 0, 1, ciphertext).unwrap();
        assert_eq(restored, plaintext);
        assert(envelope::open(secret, domain, 0, 2, ciphertext).is_none());
        let second = envelope::seal(secret, domain, 0, 1, plaintext);
        assert(ciphertext != second, "Each attempted write needs a fresh nonce");
        assert_eq(envelope::locator(secret, domain, 0, 1), envelope::locator(secret, domain, 0, 1));
        assert(envelope::locator(secret, domain, 0, 1) != envelope::locator(secret, domain, 1, 1));
        true
    }
}

#[test]
unconstrained fn owner_delivery_create_sync_replace() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    assert_eq(env.execute_utility(instance.read(owner)), 17);
    env.call_private(owner, instance.put(23));
    assert_eq(env.execute_utility(instance.read(owner)), 23);
}

#[oracle(rolling_test_forget_private_state)]
unconstrained fn forget_private_state() {}

#[test]
unconstrained fn owner_delivery_empty_private_store_restores_and_spends() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    env.call_private(owner, instance.put(23));
    assert_eq(env.execute_utility(instance.read(owner)), 23);
    forget_private_state();
    assert_eq(env.execute_utility(instance.read(owner)), 23);
    env.call_private(owner, instance.put(42));
    assert_eq(env.execute_utility(instance.read(owner)), 42);
}

#[test]
unconstrained fn owner_delivery_transient_notes_do_not_leave_discovery_gaps() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put_twice(17, 23));
    forget_private_state();
    assert_eq(env.execute_utility(instance.read(owner)), 23);
    env.call_private(owner, instance.put(42));
    assert_eq(env.execute_utility(instance.read(owner)), 42);
}

#[test]
unconstrained fn owner_delivery_native_partial_refund_restores() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.refund(123));
    assert_eq(env.execute_utility(instance.balance(owner)), 123);
    forget_private_state();
    assert_eq(env.execute_utility(instance.balance(owner)), 123);
    env.call_private(owner, instance.refund(77));
    assert_eq(env.execute_utility(instance.balance(owner)), 200);
}

#[test]
unconstrained fn owner_delivery_zero_refund_does_not_create_balance() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.refund(0));
    forget_private_state();
    assert_eq(env.execute_utility(instance.balance(owner)), 0);
    env.call_private(owner, instance.refund(77));
    assert_eq(env.execute_utility(instance.balance(owner)), 77);
}

#[oracle(rolling_test_allow_mined_revert)]
unconstrained fn allow_mined_revert() {}
#[oracle(rolling_test_allow_setup_revert)]
unconstrained fn allow_setup_revert() {}
#[oracle(rolling_test_assert_mined_revert)]
unconstrained fn assert_mined_revert() {}

#[test]
unconstrained fn owner_delivery_reverted_app_leaves_no_gap() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    allow_mined_revert();
    env.call_private(owner, instance.reverted_app(999));
    assert_mined_revert();
    forget_private_state();
    assert_eq(env.execute_utility(instance.read(owner)), 17);
    env.call_private(owner, instance.put(42));
    assert_eq(env.execute_utility(instance.read(owner)), 42);
}

#[test]
unconstrained fn owner_delivery_setup_refund_survives_app_revert() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    allow_setup_revert();
    env.call_private(owner, instance.setup_refund_reverted_app(123));
    assert_mined_revert();
    forget_private_state();
    assert_eq(env.execute_utility(instance.read(owner)), 17);
    assert_eq(env.execute_utility(instance.balance(owner)), 123);
    env.call_private(owner, instance.put(42));
}

#[test]
unconstrained fn owner_delivery_copied_ciphertext_is_not_a_new_note() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let attacker = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    let (tag, ciphertext) = env.execute_utility(instance.copy_record(owner, 0));
    env.call_private(attacker, instance.replay(tag, ciphertext));
    forget_private_state();
    assert_eq(env.execute_utility(instance.read(owner)), 17);
    env.call_private(owner, instance.put(42));
}

#[oracle(rolling_test_use_tag_index)]
unconstrained fn use_tag_index(index: u32) {}
#[oracle(rolling_test_assert_effects)]
unconstrained fn assert_effects(notes: u32, logs: u32) {}
#[oracle(rolling_test_report_counts)]
unconstrained fn report_counts() {}

#[test]
unconstrained fn owner_delivery_late_same_index_preserves_both_refunds() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.refund(123));
    assert_eq(env.execute_utility(instance.balance(owner)), 123);
    // Model a second browser that allocated index zero before the first was mined.
    use_tag_index(0);
    env.call_private(owner, instance.refund(77));
    assert_eq(env.execute_utility(instance.balance(owner)), 200);
    forget_private_state();
    assert_eq(env.execute_utility(instance.balance(owner)), 200);
    env.call_private(owner, instance.refund(10));
    assert_eq(env.execute_utility(instance.balance(owner)), 210);
    report_counts();
}

#[test]
unconstrained fn owner_delivery_adds_no_notes_or_logs() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.put(17));
    assert_effects(1, 1);
    env.call_private(owner, instance.put_twice(23, 42));
    assert_effects(1, 1);
    env.call_private(owner, instance.refund(123));
    assert_effects(1, 1);
    report_counts();
}

#[oracle(rolling_test_assert_event_count)]
unconstrained fn assert_event_count(count: u32) {}

#[test]
unconstrained fn owner_delivery_private_event_restores_natively() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.preference(42));
    assert_effects(0, 1);
    assert_eq(env.execute_utility(instance.balance(owner)), 0);
    assert_event_count(1);
    forget_private_state();
    assert_event_count(0);
    assert_eq(env.execute_utility(instance.balance(owner)), 0);
    assert_event_count(1);
}

#[test]
unconstrained fn owner_delivery_optional_balance_preserves_zero_behavior() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let instance = OwnerFixture::at(env.deploy("OwnerFixture").without_initializer());
    env.call_private(owner, instance.credit(0));
    assert_effects(0, 0);
    env.call_private(owner, instance.credit(123));
    assert_effects(1, 1);
    forget_private_state();
    assert_eq(env.execute_utility(instance.balance(owner)), 123);
}
