use crate::{RollingBoard, posting::{PostDraft, invocation_preimage, invocation_target, validate_draft}, encoding::{pack_bytes, name_id}, admission::{deposit_chain_id, get_deposit_msg_hash, post_id}};
use aztec::{test::helpers::test_environment::TestEnvironment, protocol::{address::{AztecAddress, EthAddress}, traits::FromField}};

fn text<let N: u32, let F: u32>(value: str<N>) -> [Field; F] { pack_bytes(value.as_bytes()) }
fn fixed<let N: u32>(value: str<N>) -> [u8; 32] {
    let mut result = [0; 32]; for i in 0..N { result[i] = value.as_bytes()[i]; } result
}
fn draft() -> PostDraft {
    PostDraft { subboard: 0, parent: 0, root_reference: 0, kind: 1, name_id: 0,
        reference: 0, message: text("Hello"), length: 5,
        expected_main_policy_version: 1, expected_local_policy_version: 0 }
}
// These exercise the actual constrained bridge receipt and private note logic in
// TXE; they are not evidence of a Sepolia transfer or a generated proof.
unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let moderator = env.create_light_account(); let alice = env.create_light_account(); let bob = env.create_light_account();
    let board = env.deploy("@rolling_contract/RollingBoard").with_public_initializer(moderator,
        RollingBoard::interface().init(text("No threats"), 10, 1, EthAddress::from_field(0x1111), 1, 10, 1000, 10, 3, 100, 10));
    env.call_private(moderator, RollingBoard::at(board).update_portal(EthAddress::from_field(0x1234)));
    (env, board, moderator, alice, bob)
}
unconstrained fn fund(env: TestEnvironment, board: AztecAddress, owner: AztecAddress, secret: Field) -> Field {
    let portal = EthAddress::from_field(0x1234); let depositor = EthAddress::from_field(0xbeef);
    let content = get_deposit_msg_hash(1, portal, board, 1, depositor, 10);
    let leaf = env.send_l1_to_l2_message(content, secret, portal, board);
    env.call_private(owner, RollingBoard::at(board).claim_deposit(depositor, 10, secret, leaf));
    deposit_chain_id(board, owner, content, secret, leaf)
}
unconstrained fn publish(env: TestEnvironment, board: AztecAddress, owner: AztecAddress, chain: Field, nonce: Field, data: PostDraft) -> Field {
    env.mine_block_at(env.last_block_timestamp() + 11);
    let (child, grandchild) = env.execute_utility(RollingBoard::at(board).get_screen_hints(owner, chain));
    env.call_private(owner, RollingBoard::at(board).post(chain, nonce, data, child, grandchild));
    post_id(board, nonce)
}
#[test]
fn invocation_has_exact_frozen_45_field_order() {
    let fields = invocation_preimage(1, 6, AztecAddress::from_field(3), AztecAddress::from_field(4), 12, draft());
    assert_eq(fields.len(), 45);
    assert_eq(fields[0], 1); assert_eq(fields[1], 1); assert_eq(fields[2], 6);
    assert_eq(fields[3], 3); assert_eq(fields[4], 4); assert_eq(fields[5], 0);
    assert_eq(fields[6], 0); assert_eq(fields[7], 0); assert_eq(fields[8], 1);
    assert_eq(fields[9], 0); assert_eq(fields[10], 0); assert_eq(fields[11], 12);
    assert_eq(fields[12], 5); assert_eq(fields[13], draft().message[0]);
    for i in 14..45 { assert_eq(fields[i], 0); }
    let original = invocation_target(1, 6, AztecAddress::from_field(3), AztecAddress::from_field(4), 12, draft());
    assert(original != invocation_target(1, 6, AztecAddress::from_field(3), AztecAddress::from_field(5), 12, draft()));
    assert(original != invocation_target(1, 6, AztecAddress::from_field(3), AztecAddress::from_field(4), 13, draft()));
}
#[test(should_fail_with="Text length")]
fn oversized_post_fails_without_truncation() { let mut d = draft(); d.length = 993; validate_draft(d, 1); }
#[test(should_fail_with="Invalid post reference")]
fn ordinary_post_cannot_smuggle_reference() { let mut d = draft(); d.reference = 1; validate_draft(d, 1); }
#[test(should_fail_with="Invalid root reference")]
fn unattached_root_reference_rejected() { let mut d = draft(); d.root_reference = 1; validate_draft(d, 1); }
#[test(should_fail_with="Text required")]
fn empty_quote_rejected() { let mut d = draft(); d.kind = 2; d.reference = 1; d.message = [0; 32]; d.length = 0; validate_draft(d, 1); }
#[test]
fn empty_repost_is_canonical() { let mut d = draft(); d.kind = 3; d.reference = 1; d.message = [0; 32]; d.length = 0; validate_draft(d, 1); }
#[test]
unconstrained fn funded_anonymous_post_and_reply_have_canonical_thread() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft());
    let (exists, record, status, _, _) = env.view_public(RollingBoard::at(board).get_post(root));
    assert(exists); assert_eq(record.root, root); assert_eq(record.name_id, 0); assert_eq(status, 0);
    let bob_chain = fund(env, board, bob, 102); let mut reply = draft(); reply.parent = root; reply.root_reference = root;
    let id = publish(env, board, bob, bob_chain, 202, reply);
    let (_, child, _, _, _) = env.view_public(RollingBoard::at(board).get_post(id));
    assert_eq(child.root, root); assert_eq(child.parent, root); assert_eq(child.name_id, 0);
    assert_eq(env.view_public(RollingBoard::at(board).get_post_count()), 2);
}
#[test]
unconstrained fn named_post_requires_and_retains_private_ownership() {
    let (env, board, _, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    env.call_private(alice, RollingBoard::at(board).register_name(fixed("John"), 4, fixed("Doe"), 3));
    let mut d = draft(); d.name_id = name_id(fixed("John"), 4, fixed("Doe"), 3);
    let id = publish(env, board, alice, chain, 201, d);
    let (_, record, _, _, _) = env.view_public(RollingBoard::at(board).get_post(id)); assert_eq(record.name_id, d.name_id);
    env.call_private(alice, RollingBoard::at(board).authenticate_name(d.name_id));
}
#[test(should_fail_with="No owned name")]
unconstrained fn funded_account_cannot_post_under_another_name() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, bob, 101);
    env.call_private(alice, RollingBoard::at(board).register_name(fixed("John"), 4, fixed("Doe"), 3));
    let mut d = draft(); d.name_id = name_id(fixed("John"), 4, fixed("Doe"), 3);
    let _ = publish(env, board, bob, chain, 201, d);
}
#[test(should_fail_with="No deposit note found -- claim a deposit first")]
unconstrained fn unfunded_post_is_not_an_endpoint() {
    let (env, board, _, alice, _) = setup();
    env.call_private(alice, RollingBoard::at(board).post(123, 201, draft(), Option::none(), Option::none()));
}
#[test(should_fail_with="No deposit note found -- claim a deposit first")]
unconstrained fn another_accounts_deposit_identity_does_not_authorize() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    env.mine_block_at(env.last_block_timestamp() + 11);
    env.call_private(bob, RollingBoard::at(board).post(chain, 201, draft(), Option::none(), Option::none()));
}
#[test(should_fail_with="Main policy changed")]
unconstrained fn stale_policy_rolls_back_private_admission() {
    let (env, board, moderator, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    env.call_public(moderator, RollingBoard::at(board).set_main_policy(text("Updated"), 7));
    let _ = publish(env, board, alice, chain, 201, draft());
}
#[test(should_fail_with="Wrong canonical root")]
unconstrained fn forged_thread_root_rejected() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft()); let other = fund(env, board, bob, 102);
    let mut d = draft(); d.parent = root; d.root_reference = root + 1; let _ = publish(env, board, bob, other, 202, d);
}
#[test]
unconstrained fn removal_preserves_thread_and_timely_penalty() {
    let (env, board, moderator, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    let id = publish(env, board, alice, chain, 201, draft());
    env.call_public(moderator, RollingBoard::at(board).remove_post(id, 1, 0, text("Threat"), 6));
    let (exists, record, status, _, reason) = env.view_public(RollingBoard::at(board).get_post(id));
    assert(exists); assert_eq(record.root, id); assert_eq(status, 3); assert(reason != 0);
}
#[test(should_fail_with="Parent removed")]
unconstrained fn new_reply_cannot_target_removed_post() {
    let (env, board, moderator, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft());
    env.call_public(moderator, RollingBoard::at(board).remove_post(root, 1, 0, text("Threat"), 6));
    let other = fund(env, board, bob, 102); let mut d = draft(); d.parent = root; d.root_reference = root;
    let _ = publish(env, board, bob, other, 202, d);
}
#[test]
unconstrained fn late_or_changed_policy_removal_does_not_add_penalty() {
    let (env, board, moderator, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    let id = publish(env, board, alice, chain, 201, draft());
    env.call_public(moderator, RollingBoard::at(board).set_main_policy(text("Updated"), 7));
    env.call_public(moderator, RollingBoard::at(board).remove_post(id, 2, 0, text("Current rule"), 12));
    let (_, _, status, _, _) = env.view_public(RollingBoard::at(board).get_post(id)); assert_eq(status, 1);
}
#[test(should_fail_with="Plugin adapter immutable")]
unconstrained fn plugin_disable_does_not_enable_identity_reassignment() {
    let (env, board, moderator, alice, bob) = setup();
    env.call_public(moderator, RollingBoard::at(board).configure_plugin(1, alice, true));
    env.call_public(moderator, RollingBoard::at(board).configure_plugin(1, alice, false));
    env.call_public(moderator, RollingBoard::at(board).configure_plugin(1, bob, true));
}
#[test(should_fail_with="Only moderator")]
unconstrained fn nonmoderator_cannot_register_plugin() {
    let (env, board, _, alice, _) = setup(); env.call_public(alice, RollingBoard::at(board).configure_plugin(1, alice, true));
}
#[test(should_fail_with="Too early to post -- time lock not yet expired")]
unconstrained fn funding_does_not_bypass_initial_cooldown() {
    let (env, board, _, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    env.call_private(alice, RollingBoard::at(board).post(chain, 201, draft(), Option::none(), Option::none()));
}
#[test(should_fail_with="Too early to withdraw -- not all posts screened")]
unconstrained fn unscreened_post_blocks_exit() {
    let (env, board, _, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    let _ = publish(env, board, alice, chain, 201, draft());
    env.mine_block_at(env.last_block_timestamp() + 200);
    env.call_private(alice, RollingBoard::at(board).withdraw(chain));
}
#[test]
unconstrained fn mature_post_screening_retains_recovery_and_exit() {
    let (env, board, _, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    let _ = publish(env, board, alice, chain, 201, draft());
    env.mine_block_at(env.last_block_timestamp() + 200);
    let (child, grandchild) = env.execute_utility(RollingBoard::at(board).get_screen_hints(alice, chain));
    assert(child.is_some()); assert(grandchild.is_none());
    env.call_private(alice, RollingBoard::at(board).screen(chain, child, grandchild));
    let info = env.execute_utility(RollingBoard::at(board).get_deposit_info(alice, chain));
    assert_eq(info[5], 2); assert_eq(info[7], 1); assert_eq(info[8], 1);
    env.mine_block_at(env.last_block_timestamp() + 11);
    env.call_private(alice, RollingBoard::at(board).withdraw(chain));
    assert_eq(env.execute_utility(RollingBoard::at(board).get_deposit_info(alice, chain)), [0; 10]);
    assert_eq(env.view_public(RollingBoard::at(board).get_post_count()), 1);
}
#[test(should_fail_with="Plugin disabled")]
unconstrained fn funded_invocation_cannot_use_disabled_plugin() {
    let (env, board, moderator, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    env.call_public(moderator, RollingBoard::at(board).configure_plugin(1, bob, false));
    env.mine_block_at(env.last_block_timestamp() + 11);
    env.call_private(alice, RollingBoard::at(board).post_with_bok(chain, 201, draft(), Option::none(), Option::none(), 1, 99));
}
#[test]
unconstrained fn quote_and_empty_repost_keep_explicit_reference() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft()); let other = fund(env, board, bob, 102);
    let mut quote_draft = draft(); quote_draft.kind = 2; quote_draft.reference = root;
    let quoted = publish(env, board, bob, other, 202, quote_draft);
    let (_, q, _, _, _) = env.view_public(RollingBoard::at(board).get_post(quoted));
    assert_eq(q.kind, 2); assert_eq(q.reference, root); assert_eq(q.root, quoted);
    let mut repost = draft(); repost.kind = 3; repost.reference = root; repost.message = [0; 32]; repost.length = 0;
    let repeated = publish(env, board, alice, chain, 203, repost);
    let (_, r, _, _, _) = env.view_public(RollingBoard::at(board).get_post(repeated));
    assert_eq(r.kind, 3); assert_eq(r.reference, root); assert_eq(r.root, repeated);
}
#[test(should_fail_with="Referenced post removed")]
unconstrained fn removed_quote_target_rejected() {
    let (env, board, moderator, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft());
    env.call_public(moderator, RollingBoard::at(board).remove_post(root, 1, 0, text("Threat"), 6));
    let other = fund(env, board, bob, 102); let mut d = draft(); d.kind = 2; d.reference = root;
    let _ = publish(env, board, bob, other, 202, d);
}
#[test(should_fail_with="Function _publish can only be called by the same contract")]
unconstrained fn public_publish_cannot_bypass_private_admission() {
    let (env, board, _, alice, _) = setup(); env.call_public(alice, RollingBoard::at(board)._publish(201, draft(), 0, 0));
}
#[test(should_fail_with="Post already exists")]
unconstrained fn different_funded_account_cannot_replay_post_nonce() {
    let (env, board, _, alice, bob) = setup(); let chain = fund(env, board, alice, 101);
    let _ = publish(env, board, alice, chain, 201, draft()); let other = fund(env, board, bob, 102);
    let _ = publish(env, board, bob, other, 201, draft());
}
#[test(should_fail_with="Child note required for screening")]
unconstrained fn caller_cannot_skip_prior_history() {
    let (env, board, _, alice, _) = setup(); let chain = fund(env, board, alice, 101);
    let _ = publish(env, board, alice, chain, 201, draft()); env.mine_block_at(env.last_block_timestamp() + 11);
    env.call_private(alice, RollingBoard::at(board).post(chain, 202, draft(), Option::none(), Option::none()));
}
#[test(should_fail_with="Invocation scope required")]
fn invocation_requires_real_scope() { let _ = invocation_preimage(1, 1, AztecAddress::from_field(1), AztecAddress::from_field(0), 1, draft()); }
unconstrained fn make_subboard(env: TestEnvironment, board: AztecAddress, owner: AztecAddress) -> Field {
    let mut slug = [0; 40]; slug[0] = 97; slug[1] = 98; slug[2] = 99;
    env.call_private(owner, RollingBoard::at(board).create_subboard(slug, 3, text("ABC"), 3, text("Community"), 9, text("Be kind"), 7));
    crate::encoding::subboard_id(slug, 3)
}
#[test]
unconstrained fn funded_subboard_post_binds_local_and_parent_policy() {
    let (env, board, _, alice, _) = setup(); let subboard = make_subboard(env, board, alice); let chain = fund(env, board, alice, 101);
    let mut d = draft(); d.subboard = subboard; d.expected_local_policy_version = 1;
    let id = publish(env, board, alice, chain, 201, d);
    let (_, record, _, _, _) = env.view_public(RollingBoard::at(board).get_post(id)); assert_eq(record.subboard, subboard);
}
#[test(should_fail_with="Local policy changed")]
unconstrained fn omitted_local_policy_is_not_parent_only_acceptance() {
    let (env, board, _, alice, _) = setup(); let subboard = make_subboard(env, board, alice); let chain = fund(env, board, alice, 101);
    let mut d = draft(); d.subboard = subboard; let _ = publish(env, board, alice, chain, 201, d);
}
#[test(should_fail_with="Subboard rejected")]
unconstrained fn rejected_subboard_cannot_receive_new_post() {
    let (env, board, moderator, alice, _) = setup(); let subboard = make_subboard(env, board, alice); let chain = fund(env, board, alice, 101);
    env.call_public(moderator, RollingBoard::at(board).reject_subboard(subboard, text("Invalid rules"), 13));
    let mut d = draft(); d.subboard = subboard; d.expected_local_policy_version = 1; let _ = publish(env, board, alice, chain, 201, d);
}
#[test(should_fail_with="Cross-board reply")]
unconstrained fn reply_cannot_move_thread_between_boards() {
    let (env, board, _, alice, bob) = setup(); let subboard = make_subboard(env, board, alice); let chain = fund(env, board, alice, 101);
    let root = publish(env, board, alice, chain, 201, draft()); let other = fund(env, board, bob, 102);
    let mut d = draft(); d.subboard = subboard; d.expected_local_policy_version = 1; d.parent = root; d.root_reference = root;
    let _ = publish(env, board, bob, other, 202, d);
}
#[test]
unconstrained fn rejected_subboard_does_not_trap_eligible_withdrawal() {
    let (env, board, moderator, alice, _) = setup(); let subboard = make_subboard(env, board, alice); let chain = fund(env, board, alice, 101);
    let mut d = draft(); d.subboard = subboard; d.expected_local_policy_version = 1;
    let _ = publish(env, board, alice, chain, 201, d);
    env.call_public(moderator, RollingBoard::at(board).reject_subboard(subboard, text("Invalid rules"), 13));
    env.mine_block_at(env.last_block_timestamp() + 200);
    let (child, grandchild) = env.execute_utility(RollingBoard::at(board).get_screen_hints(alice, chain));
    env.call_private(alice, RollingBoard::at(board).screen(chain, child, grandchild));
    env.mine_block_at(env.last_block_timestamp() + 11);
    env.call_private(alice, RollingBoard::at(board).withdraw(chain));
    assert_eq(env.execute_utility(RollingBoard::at(board).get_deposit_info(alice, chain)), [0; 10]);
}
#[test]
unconstrained fn grouped_subboard_rejection_preserves_rules_metadata_and_creation() {
    let (env, board, moderator, alice, _) = setup(); let id = make_subboard(env, board, alice);
    let (exists, metadata, created, rejected, _) = env.view_public(RollingBoard::at(board).subboard_state(id));
    assert(exists & !rejected);
    let (_, _, local_version, rules, _) = env.view_public(RollingBoard::at(board).effective_policy(id));
    env.call_public(moderator, RollingBoard::at(board).set_main_policy(text("Updated"), 7));
    env.call_public(moderator, RollingBoard::at(board).reject_subboard(id, text("Invalid rules"), 13));
    let (after_exists, after_metadata, after_created, after_rejected, reason) = env.view_public(RollingBoard::at(board).subboard_state(id));
    assert(after_exists & after_rejected); assert(reason != 0);
    assert_eq(after_metadata, metadata); assert_eq(after_created, created);
    let (main_version, _, after_local_version, after_rules, policy_rejected) = env.view_public(RollingBoard::at(board).effective_policy(id));
    assert_eq(main_version, 2); assert_eq(after_local_version, local_version); assert_eq(after_rules, rules); assert(policy_rejected);
}
