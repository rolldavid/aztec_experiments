# G21 development verification

One Ethereum owner retains funding, deposit ownership and refund destination. Every signup has an independent secret-hash deposit ID. Claim and cancellation share a deployment-scoped native nullifier; refunded collateral cannot become posting collateral. Optional refunds do not depend on abandoned private account keys. No signup redirect to old account recovery remains.

Observed on macOS with pinned Node24.21.0, native Nargo/TXE, Foundry regression profile and Chromium155. Native development proving disabled; these results do not assert hosted real-proof acceptance. Same-owner fresh deposits and both claim/cancel orderings are exercised at the relevant real contract boundaries. Wallet and browser checks contain labelled doubles; they qualify orchestration/UI, not cryptography.

- Native TXE:9 lifecycle cases pass (native-refund-tests.log).
- Complete Solidity regression:71 tests pass, including generated artifact bytecode (portal-all.log).
- Wallet session/Ethereum journal:425 tests pass (session-journal-tests.log).
- Shared application, aggregate funding, receipts and protocol commitments:395 tests pass (shared-final.log).
- Refund discovery14; focused balances/refund browser2; hosted prover admission13; archive serving2 pass.
- Deployment guard checks initially92/93: one fixture deleted artifact.name and thus triggered the correct earlier schema check instead of the intended artifact hash check. Fixture now preserves the schema and changes artifact content; the affected case passes (deploy-artifact-test.log). Original failure retained in deploy-tests.log.
- Canonical contracts, SDK, app and wallet builds plus artifact validation pass. Generated Solidity bytecode, browser SDK and prover artifact catalog were regenerated together.

Existing seven public posts are retained in a static read-only archive. No historical post is represented as a post on the replacement contract. Desktop/mobile archive rendering inspected at1100/390px, with seven posts and two original artifact links, no overflow.

At this snapshot the live app remains unchanged. Replacement board and portals have been submitted/deployed; native bridge settlement, coherent hosted cutover and fresh real-proof signup remain outstanding. G21 remains active. Operational proposals are separate from tested application code.
