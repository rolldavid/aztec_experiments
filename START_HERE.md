# Rolling Chat: start here

Current handover, 23 October 2026. Read this before historical execution records. Later owner instructions supersede old campaigns. Credentials, private account material and signed transaction journals are intentionally outside Git.

## Current deployment

Website: https://d30njln0kead8n.cloudfront.net
Source: https://github.com/zac-williamson/aztec_experiments (default branch `master`). Integration branch: `codex/rolling-chat-account-ux`; default `master` and `codex/rolling-chat-draft3` receive the same completed source and handover.

The public Aztec testnet changed to stable **6.0.0**, rollup `0x1f435a7f2da358caf887a470faeee7d5d5f4efba`, version **679261766**, on Ethereum Sepolia (11155111). Contracts, SDK, browser assets and native services have been rebuilt and published. Frontend/application source is **ee6195e5eb214f7a3b3f4c8d24585c34b81b9a11**; subsequent packaging correction **6727ebcf** preserves installing-user ownership of extracted Node files.

**Owner explicitly discards all old application state.** This is a fresh board, fresh service accounts and fresh application databases. Do not migrate, recover or archive old accounts/posts/balances. Existing authorized provider credentials and infrastructure security remain. No mainnet work is authorized.

All nine application services are active. Fresh MetaMask signup and the first post passed on the published site. Bok portal activation and board registration are confirmed; its balance query works. Actual ETH-to-Bok funding also passed: one MetaMask approval, one Ethereum payment and one automatic real-proof Aztec claim increased credit from0 to1USDC. The moderator processed the first post. No new Bok model/code-generation request was run in this upgrade acceptance. See [current verification](execution/evidence/G21/stable6/verification.md).

| Contract | Fresh address |
| --- | --- |
| Board | `0x122f9579999a8a25e47564f656182429fc3182d22d9229afb9310232de20aefc` |
| Posting deposit portal | `0xc8f9d5dfd6acedb32b65bec19ef4c97f27dd77d3` |
| Signup payment router | `0x849d66e8027d7c9ba2bb2105900319a2ebd53d4d` |
| Bok escrow | `0x29c5c41fae8d4d0460e30ba13c56160206e8bc54922df727275c9ecce88c9432` |
| Bok portal | `0x7a851d33bbb8858d6575b79b0bf04663a305aeb0` |
| Canonical private fee contract | `0x24241a5c67daaded1c810026729bea12bac430b725e8a0aff59f4cc1de980868` |
| Bok credit router | `0x78e74b6174fcb0afb9f24f1dc37f828f0bcbba5d` |

The account derives from the Ethereum wallet signature; there are no password/backup import flows. A new test account with the same Ethereum owner can be selected through Your account → Start new test account or `/#/new-account`. Basic signup funds the posting deposit and posting fees. Bok remains optional. Post/Reply, likes, bookmarks and profile edits submit directly; the composer closes after confirmation. Typing `@bok` selects a request without blocking on a balance read. Main-page Bok balance and Add credit remain visible. Earlier flow evidence applies to the old deployment only.

## Persistent hosting

AWS account 052665140763, region us-east-1, existing profile `message-board-deploy`; SSM is the management path. Read the workspace `INFRASTRUCTURE_ACCESS.md` before service or credential work. Never open SSH or expose credentials to generated code.

| Component | Resource | Current source/runtime |
| --- | --- | --- |
| Core | `i-0a9b5b9ba55815cda`, `172.31.32.101`, m7a.4xlarge | Node, authenticated query, real prover, app/index, moderator |
| Bok | `i-0a7d9957f2b3d7f19`, `172.31.45.95`, r7i.xlarge | Separate plugin worker and artifact proxy |
| Main CloudFront | `E3BMCK3MOVYK1K` | App, query and prover routes |
| Artifact CloudFront | `E1M12FHGQ0S5ST` | `dy2q03rao3se7.cloudfront.net` |

Core native release: `/opt/board-prover/releases/rolling-8fed2c764e5b62fc`, manifest `8fed2c764e5b62fc626e985e6b022ef3908605c7401200d4f8f09e9e07157097`. Real Linux qualification passed against this exact complete package. Official Aztec image: `azteclabs/aztec@sha256:59b10cc8e89bb9226db1f771a5abbe5d5f8d71483c00c7472187e6ddc7adab8d`.

Running app, moderator and Bok source: `/opt/rolling-upgrade-6.0.0`. App next-start source: `/opt/rolling-app/releases/ui-ee6195e5eb21`. Public UI: `/opt/rolling-ui/releases/ee6195e5eb214f7a3b3f4c8d24585c34b81b9a11`, selected through `/opt/rolling-ui/current`. Frontend publication changes the static pointer without restarting the app/index. App runtime config is `/etc/rolling-app/wallet.json`; fresh state directories include `stable6-` and the board address. Core and Bok share pinned application Node 24.21.0; the official Aztec container uses Node 24.22.1. Native prover assets and CRS were rebuilt for 6.0.0.

Fresh moderator/deployer identity: `0x0233a0ebe93af15f273c200ce05a893ae2c7e87c0b24196eec705c1d09f6ceaa`. Fresh Bok identity: `0x119fa1d976f386eb0b3577a9661c923ce02ca500fbc1e68096718aa7f24948e5`. Bok proves natively on its own host and uses authenticated node queries; generated code receives neither actor keys nor AWS access.

Bok uses the unused private repository `zac-williamson/rolling-chat-bok-pool-20261015-03`, repository ID 1420006279, initial README commit `f7427999c32ee1ae5bd5bac35f0e1af523e70afe`. Existing GitHub App 5317701, installation 171412624 already has access; Actions are disabled. No GitHub sign-in or permission change is needed. The newly created `rolling-chat-bok-pool-20261023-01` is unused.

## Operations and cost

Owner authorizes **USD 1,500/month ongoing hosting**. The existing forecast is approximately USD 32.96/day before tax/traffic andUSD 1,462.94 for 31 days including allowances. These are estimates, not billed spend. Reconcile [infrastructure ledger](execution/infrastructure-ledger.json) before changing resources. No additional hosts were created for this upgrade.

Obsolete expiry timers are masked and cloud termination schedules removed. Services must remain running. Monitoring reports availability problems; it must not stop healthy services after an observation failure. Systemd owns failed-process restart and cgroup cleanup. Existing security groups, private origins, scoped credentials, traffic shaping and generated-code isolation remain. Owner stopped scheduled agent work; do not create recurring agent automation or promise its alerts.

Use actual service state and narrow logs before intervening. Public checks are `/`, `/wallet/runtime.json` and `/prover/healthz`; authenticated node access uses existing private configuration. An old journal error may belong to an earlier PID. Wait for actual transaction/bridge state through native SDK waiters; a missing response is not grounds to resubmit a payment. Keep the current flow's signed transaction identity until its actual outcome is known.

## Development and evidence

Read `AGENTS.md`, [Aztec skill](skills/aztec-app-development/SKILL.md), [BUILDING.md](BUILDING.md) and [TESTING.md](TESTING.md). For continue/resume, validate the graph and select ready work, but current owner scope takes priority over historical campaigns. Native local development uses `realProofs: false` and `proverEnabled: false`; real proofs belong to the affected testnet acceptance boundary. Do not repeat complete onboarding to test a small UI change.

The historical graph is not evidence of the current network or an instruction to restart stopped campaigns. Broader production audit/network clearance gates remain separate from this owner-authorized testnet deployment. Source, public hashes and selected observations belong in Git. Secrets, signed URLs, raw account state, private service configs and raw signing/provider journals do not.
