# Sepolia nonce15 recovery and real-proof prerequisites

Independent reviewer: reviewer-resume-20261014. Current operator source inspected in rolling-lead-bok at391dee212be5aa07d442ada070f3dda0b53aad4c; coordination graph/history/evidence inspected separately. No keys loaded, transactions signed/sent, RPC mutations, cloud operations, new harness or source edits. This is a recovery recommendation, not an executed financial action.

## Established facts

Original USDC approval: 0x405b19bb9cfb6f88fce7aef123460cf0a809df0cbfd4c9b68d11e6fe52d6c746. Existing self-cancellation: 0x65bef1b976cf34cb08520796608d4b21d8bbba9228ca890ad38ef2aef9b11e61. Both are structurally valid signed type2 Sepolia transactions from project account0x0443527ca2fd922e62cda88a087757116c71dc21 at nonce15. Their original journals remain reconcile-only.

The latest retained read-only record inspected here is 2026-10-14T15:53:21.944Z: both transaction and receipt queries returned null, latest/pending nonce15. Earlier independent PublicNode reads were403, so they did not corroborate absence. These are historical observations, not a fresh current network check. Further identical null reads alone cannot prove global mempool absence or safe replay. The historical broadcast exception was discarded; signed persistence is not proof of endpoint acceptance.

Frozen funding plan expired2026-10-14T14:07:57Z. That deadline constrains the local operator, not the ERC20 approve transaction; the signed approval can still execute later. Neither expiry nor a null hash permits ignoring the unresolved nonce or repeating completed inventory/approval stages.

## Existing recovery semantics

plugins/operations.mjs:445 inspectSeedResolution validates the exact original finalized prefix and both retained signed transactions, then identifies a canonical finalized winner. runSepoliaLiquidityCancellation:468 returns reconciliation whenever any cancellation record already exists, including preparing. The existing fixed120percent cancellation plan cannot be “retried” with a changed expiry, state path or fee without breaking its intended identity boundary.

runSepoliaLiquidityContinuation:493 requires a successful finalized winner. It carries the exact original prefix, omits completed inventory and FEE approval, and either includes or skips USDC approval according to which transaction won. It requires a distinct continuation plan with fresh deadlines and nonce layout. Do not edit/re-date the frozen original plan, clear either journal, blindly run a generic seed command, or advance to nonce16 without identifying the consumed nonce15 effect.

## Smallest supported recovery decision

First perform one meaningful reconciliation pass from a working independent canonical Sepolia source if available: chain identity, both receipts/transactions, finalized head and account nonce; if the nonce advanced, identify the actual sender/nonce winner rather than inferring cancellation. If a known transaction is finalized, use existing exact-effect reconciliation and existing continuation. A previously recorded403 is not an independent negative result. Provider-side original request/broadcast evidence would also add information; repeated same-endpoint null checks do not.

If both remain unresolved, Ethereum supports a distinct zero-value transaction to the same account using the same nonce to cancel pending work. A new explicitly authorized replacement of the already uncertain cancellation can consume nonce15 safely once finalized; it cannot cause both same-nonce transactions to execute in the canonical chain. [Ethereum transaction cancellation](https://ethereum.org/community/support/faq/)

This requires a narrow coherent extension of the existing operator recovery path, not a new framework: immutable successor resolution binding the original plan hash, both retained hashes/journal bindings, same chain/sender/nonce/self/zero-value/empty-data shape, fresh fixed fee and gas caps, and an independent once-only journal. Preserve both earlier records. Reconcile all known candidate winners before signing and after the single send; persist the new signed intent before transport. A race where the original approval wins must reconcile its real allowance, not be labelled a successful cancellation. An unknown successor outcome remains fenced.

Choose fees from fresh network and reachable provider evidence, with both caps above the prior cancellation and sufficient for current base fee plus priority. Geth documents a configurable replacement bump, default10percent; this is local mempool policy, not proof of the original failure or guaranteed acceptance by an unknown provider. Do not hardcode another repeated20percent experiment solely because receipts are absent. [Geth transaction-pool options](https://geth.ethereum.org/docs/fundamentals/command-line-options)

Reuse the installed strict sender lease, private journal, bounded transport and finite broadcast diagnostics; retain meaningful no-replay, fee-bound, finality/reorg, raced-original-winner and exact-prefix tests in the existing suite. No new send is performed or approved by this read-only report. The lead's existing testnet authority is sufficient for an intentionally planned recovery; it does not turn absent receipts into permission to retransmit old bytes. If no new cancellation is chosen, only verified winner/provider reconciliation can unlock this account.

## Real-proof acceptance remains separate

1. Resolve nonce15 and reconcile existing inventory, ETH reserve and allowances. Prepare a fresh remaining-only funding/cleanup plan; old funding deadline is expired and no automatic re-dating is allowed. The provided top-up means missing owner funds is not the established current blocker.
2. Re-establish a live supported AztecV6 testnet identity and current application deployment/catalog against exact compiled artifacts, portal addresses and compatible compiler/SDK/prover versions. Historical V06 completion is not current Rolling Draft3 acceptance.
3. Restore and verify the actual trusted query/fullnode/prover path with native proofs enabled for acceptance, including healthy canonical sync and current artifact policy. Development devnet/PXE false must remain development-only. The most recent infrastructure record inspected showed no us-east-1 project compute/volumes and an8s remote health timeout; historical service availability cannot substitute for a new live check.
4. Before any paid recovery, reconcile the shared ledger, resource identity, accrued costs and a complete bounded forecast plus independent shutdown controls. Ledger currently retains235.28USD conservative bound and64.72USD remaining, not fresh billing or a new launch grant. No paid launch is part of this review.
5. Run genuine wallet funding routes, private fee/account setup, posts/social/profile/preferences recovery, moderation, Bok accounting and exit/refund for the affected final revision. Preserve existing real-proof, privacy and observer-trace thresholds. Devnet evidence and mocked provider ports cannot close these requirements. Required Phantom interaction remains open where authentic extension acquisition/use is blocked.
6. Independent specialist review, representative workload,14actual-day soak and target-network clearance remain release gates even after development/testnet acceptance.

## Evidence bindings

- execution/evidence/G02/query-operator-auth/reviewer-approve-usdc-original-broadcast-diagnosis.json: `409b9c9ff107c6f7ffd9914d087bdd1b12114a26cf8853c5453be28f2d4c903f`
- execution/evidence/G02/query-operator-auth/reviewer-cancel65-readonly-diagnosis.json: `a55f11be805a6c93e9c088750404b10599ee06f6762d383eeee94229e57f4a6c`
- execution/evidence/G02/query-operator-auth/reviewer-seed-nonce15-cancellation-design.json: `d10b41a892b4bda514d92957836b7df782eac7f8464156dc09057806abb9a6e6`
- execution/evidence/G02/query-operator-auth/sepolia-after-disk-recovery-readonly.json: `446fb9503d7cbc8dcdef69d6c9337b1269fed203ebf5fd2b0d0a4efda7f9b4c1`
- execution/infrastructure-ledger.json: `a762e70cefe09fc4d09774e46ceed58dcf93d40a4ac64105f9ca1ad713eec5c7`
