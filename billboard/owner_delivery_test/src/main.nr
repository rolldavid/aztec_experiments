use aztec::{macros::aztec, test::helpers::test_environment::TestEnvironment,
    protocol::{address::{AztecAddress, EthAddress}, constants::FEE_JUICE_ADDRESS}};
#[aztec]
pub contract OwnerPostingAccount {
    use aztec::{macros::functions::{external, allow_phase_change}, protocol::address::AztecAddress};
    use rolling_contract::{RollingBoard, posting::PostDraft};
    use private_fee_contract::PrivateFPC;
    // Test-only account entrypoint: the actual Board and FPC execute unchanged.
    #[external("private")]
    #[allow_phase_change]
    fn post(board: AztecAddress, fpc: AztecAddress, deposit: Field, nonce: Field, draft: PostDraft) {
        PrivateFPC::at(fpc).pay_fee(1000).call(self.context);
        RollingBoard::at(board).post(deposit, nonce, draft, Option::none(), Option::none()).call(self.context);
    }
}

use rolling_contract::{RollingBoard, encoding::{pack_bytes, name_id}, posting::PostDraft,
    admission::{get_deposit_msg_hash, deposit_chain_id, post_id}};
use private_fee_contract::PrivateFPC;
#[oracle(rolling_test_forget_private_state)]
unconstrained fn forget_private_state() {}
#[oracle(rolling_test_assert_effects)]
unconstrained fn assert_effects(notes: u32, logs: u32) {}
#[oracle(rolling_test_assert_private_notes)]
unconstrained fn assert_private_notes(notes: u32) {}
#[oracle(rolling_test_report_counts)]
unconstrained fn report_counts() {}
#[oracle(rolling_test_reset_query_counts)]
unconstrained fn reset_query_counts() {}
#[oracle(rolling_test_begin_setup)]
unconstrained fn begin_setup() {}
#[oracle(rolling_test_end_setup)]
unconstrained fn end_setup() {}
#[oracle(rolling_test_assert_event_count)]
unconstrained fn assert_event_count(count: u32) {}
fn text<let N: u32, let F: u32>(value: str<N>) -> [Field; F] { pack_bytes(value.as_bytes()) }
fn fixed<let N: u32>(value: str<N>) -> [u8;32] { let mut out=[0;32]; for i in 0..N {out[i]=value.as_bytes()[i];} out }

#[test]
unconstrained fn actual_named_post_preserves_note_count_and_restores_every_self_record() {
    let mut env = TestEnvironment::new();
    let moderator=env.create_light_account();
    let owner=env.deploy("OwnerPostingAccount").without_initializer();
    let board=env.deploy("@rolling_contract/RollingBoard").with_public_initializer(moderator,
        RollingBoard::interface().init(text("No threats"),10,1,EthAddress::from_field(0x1111),1,10,1000,10,3,100,10));
    let fpc=env.deploy("@private_fee_contract/PrivateFPC").without_initializer();
    let portal=EthAddress::from_field(0x1234); let depositor=EthAddress::from_field(0xbeef);
    env.call_private(moderator,RollingBoard::at(board).update_portal(portal));
    let content=get_deposit_msg_hash(1,portal,board,1,depositor,10);
    let leaf=env.send_l1_to_l2_message(content,101,portal,board);
    env.call_private(owner,RollingBoard::at(board).claim_deposit(depositor,10,101,leaf));
    assert_effects(1,1);
    let deposit=deposit_chain_id(board,owner,content,101,leaf);
    let (chain,version)=env.utility_context(|ctx| (ctx.chain_id(),ctx.version()));
    let claim=PrivateFPC::compute_feejuice_claim_nullifier(fpc,5000,123,owner,42,chain,version);
    env.private_context_at(FEE_JUICE_ADDRESS,|ctx| {ctx.push_nullifier_unsafe(claim);});
    env.call_private(owner,PrivateFPC::at(fpc).mint(5000,123,42));
    assert_effects(1,1);
    env.call_private(owner,RollingBoard::at(board).register_name(fixed("John"),4,fixed("Doe"),3));
    assert_effects(1,1);
    let name=name_id(fixed("John"),4,fixed("Doe"),3);
    forget_private_state();
    assert_eq(env.execute_utility(PrivateFPC::at(fpc).balance_of(owner)),5000);
    assert_eq(env.execute_utility(RollingBoard::at(board).owned_names(owner,0))[0],name);
    assert_event_count(0);
    env.mine_block_at(env.last_block_timestamp()+11);
    let draft=PostDraft{subboard:0,parent:0,root_reference:0,kind:1,name_id:name,reference:0,
        message:text("Hello"),length:5,expected_main_policy_version:1,expected_local_policy_version:0};
    reset_query_counts();
    begin_setup();
    env.call_private(owner,OwnerPostingAccount::at(owner).post(board,fpc,deposit,201,draft));
    end_setup();
    // Four existing private notes: post, replacement deposit, name and FPC change.
    // The unchanged native public teardown completes a fifth (fee-refund) note.
    report_counts();
    assert_private_notes(4);
    assert_effects(5,5);
    let (exists,record,_,_,_)=env.view_public(RollingBoard::at(board).get_post(post_id(board,201)));
    assert(exists); assert_eq(record.name_id,name);
    // Native TXE uses zero transaction fee: all reserved credit is refunded.
    assert_eq(env.execute_utility(PrivateFPC::at(fpc).balance_of(owner)),5000);
    forget_private_state();
    assert_eq(env.execute_utility(PrivateFPC::at(fpc).balance_of(owner)),5000);
    assert_eq(env.execute_utility(RollingBoard::at(board).owned_names(owner,0))[0],name);
    assert_event_count(0);
    env.call_private(owner,RollingBoard::at(board).authenticate_name(name));
    assert_effects(1,1);
}
