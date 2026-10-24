# Rolling Chat: start here

Current handover: 25 October 2026. Current owner scope takes precedence over historical task records. Credentials and private account material remain outside Git.

## Active performance work

Ordinary post click → visible after actual Aztec inclusion must be ≤15 seconds. Fee preparation, complete pre-proof application preparation and browser-to-prover acceptance must each be <1 second; private witness construction ≤1.25 seconds.

**UI source `729a7fb1` is published. Latest real141-character post:13.859s; preparation737ms, private application790ms, separate kernel952ms, upload809ms, fee estimate28ms. Automatic checkpoint promotion observed. This single passing total does not establish consistent latency.** Previous source `fdf3a0ad` The goal remains active.** Its real 136-character post took **24.654s** from click to unobstructed display after actual Aztec inclusion. Complete preparation took892ms, private application execution1115ms, separate kernel processing965ms, upload acceptance866ms. Kernel class-hint reads dropped to0.5ms after prefetch. Kernel witness work is nested in kernel processing; do not add it twice or describe application execution alone as the full witness pipeline.

Independent one-second observation found the included block at our node273ms before the public reference node. The block became available13.579–14.586s after submission acknowledgement; browser display followed its receipt by382ms. This establishes a network/proposer delay, not a checkpoint wait or a lagging local node. Gossip arrival vs proposer scheduling is not yet separated. Prior real ef779 runs13.717s and28.189s remain recorded; do not discard slow runs or claim a consistent15-second result.

Deployed: exact processed owner-log identities, shared native preparation, redundant registration/anchor-read removal, background selected-deposit screening, native kernel class witness prefetch. Production native tests preserve note counts, native authorization and empty-store restoration. Published729a7fb1 removes disabled kernel debug/test work and adds disjoint substage timings;87 focused checks pass. Publication validation rejected an incomplete source package; corrected package passed and was activated without restarting any service. Exact kernel instrumentation identifies238ms between circuits spent on native note/nullifier membership reads. Next patches overlap these reads and the late private historical-note read. No migrations, new private notes, skipped validation or fabricated confirmation.

Instrumentation requires actual included feed text visible at an animation frame with the composer closed and no obstruction. Previous2aac timings13.507s/13.836s and4a14.780s were DOM-insertion lower bounds, not complete click-to-visible results. The current exact-transaction feed callback closes the matching composer immediately while canonical confirmation and account locking continue independently. Both7a posts promoted to checkpointed automatically.

CRS cache now verified:8MiBasset returned from cache in11.66ms with zero network bytes. HTTP3 experiment was slower and reverted to HTTP2. Real HTTP2 uploads now satisfy the1s target. CloudFront prover origin keepalive is60s; this is connection reuse, not a transaction/read timeout, and has no isolated measured speedup claim.

Root owns one retained build at `/private/tmp/rolling-browser-proof-spans-build` and the existing IAB test tab. No new dependency copies or Chrome profiles. Source-only agent drafts; clean owned scratch and transfer archives after integration. Completed transfer payloads and exact S3 versions are deleted; retain small hash plans for incremental publication.

## Current deployment

Website: https://d30njln0kead8n.cloudfront.net
Repository: https://github.com/zac-williamson/aztec_experiments — default branch `master`. Integration branch `codex/rolling-chat-account-ux` and `codex/rolling-chat-draft3` receive the same reviewed changes.

Network: Aztec stable6.0.0, rollup `0x1f435a7f2da358caf887a470faeee7d5d5f4efba`, version679261766, Ethereum Sepolia11155111. No mainnet work.

| Component | Installed source |
| --- | --- |
| Browser UI | `/opt/rolling-ui/releases/ef77925c197de7f6946a75ccc9dbb30e3832c71a` |
| Browser SDK SHA256 | `0b7c99a42b5be9a54508ad77ba2665bc20600ecf8827d80c6415011e78099e40` |
| Running app | `/opt/rolling-app/releases/ui-7a3ad91ffc14` |
| Next-start app | `/opt/rolling-app/releases/ui-ef77925c197d` |
| Prover | `/opt/board-prover/releases/upload-f4cd0f662e3e5253af47a5ff67eb907e72626dda` |
| Bok | `/opt/rolling-bok/releases/6cb76060aba07b2eae31284d0e949517dd240d48` |

| Contract | Current address |
| --- | --- |
| Board | `0x19ee03e617512ca48271634629d9b48e815ab1ba46c3eef3b7edaafc345d7be6` |
| Private fee contract | `0x2fff4f1bed0f240982804499d6693530343bd3f9236fe82851fb7d46be990b3c` |
| Bok | `0x18fc6cbfced589411864ae3b2551f0c1c37e80da11445cb839588db2d68f358a` |
| Posting deposit portal | `0x237ce50c8418c812d564b34be84f0174fd4072a2` |
| Signup payment router | `0x39f3aba2180b75c18080ee2c4687553a3e250645` |
| Bok portal | `0x340d8c7e17e7c23d247d1f66d2b8753f32bd561a` |
| Bok credit router | `0x6bcd002949bbb3ff053790691f0771f227c8eeb7` |

Canonical Bok plugin ID is `0x0000000000000000000000000000000000000000000000000000000000626f6b`. Rollout templates previously copied a different ID; both live configs and their producers are corrected. Registration was already successful; no replacement transaction was needed. Main-page balance now displays0USDC instead of unavailable. See owner-plugin-configuration.json in the evidence folder.

Owner-only discovery is deployed: unconstrained AES256-GCM delivery with native note authorization/nullification and zero extra notes or logs. The rejected counter-note journal must never ship. Empty-store restoration and partial-refund behavior have focused native checks. The signature-derived account root remains quantum-vulnerable as previously disclosed; this change does not claim post-quantum confidentiality.

Accounts derive from the Ethereum wallet signature, with no password/backup import. Your account → Start new test account allows a fresh test account using the same Ethereum owner. Bok remains optional. Posts render at Aztec inclusion; the transaction waiter retains the account lock until checkpoint. Do not relabel included transactions as settled.

**All old test application data is disposable.** Do not preserve, migrate, recover or maintain compatibility with accounts, posts, balances, databases or incomplete flows from old releases. Keep credentials and security controls.

## Hosting and service ownership

Read workspace `INFRASTRUCTURE_ACCESS.md` before credentials or service work. Existing AWS profile `message-board-deploy`; management through SSM. Core `i-0a9b5b9ba55815cda`, m7a.4xlarge; Bok `i-0a7d9957f2b3d7f19`, m8a.xlarge. Main CloudFront `E3BMCK3MOVYK1K`; artifact CloudFront `E1M12FHGQ0S5ST` (`dy2q03rao3se7.cloudfront.net`).

All nine services are verified active. The40GiB core root filled with accumulated release/upload copies; the separate1TiB chain volume was unaffected. Root was cleaned offline using the existing Bok host, restored to core /dev/sda1, and all seven core services restarted. A further2.967GB of authenticated obsolete public artifacts was removed, leaving over4GB free. No new infrastructure/security changes. Publisher now checks operating reserve and removes successful upload payloads automatically. Active runtimes/configs/credentials remain. Pruned historical releases are explicitly unusable; never choose one as a rollback source. See server-root-recovery.json and server-public-artifact-prune.json. Query actual current PIDs before intervention.

Health endpoints: app `/api/status` on4318; prover `/healthz` on8081; Bok `/health` on8807 returns `status: ready`. Public `/wallet/runtime.json` and `/prover/healthz` are suitable read-only checks. Do not assume every service uses a boolean `ready` or `/health`.

Bok uses private repository `zac-williamson/rolling-chat-bok-pool-20261015-03`, existing GitHub App5317701/installation171412624. No new repository/access grant is needed. Generated code receives no actor keys or AWS access. Its publication requires the isolated browser validation described below.

## Operations and cost

Owner authorizes **USD 1,500/month ongoing hosting**. The current forecast is **USD 1,444.05 for 31 days including allowances**, following the same-instance worker change to m8a.xlarge. This saves approximatelyUSD18.89/month; no new resource was created. These are estimates, not billed spend. Reconcile [infrastructure ledger](execution/infrastructure-ledger.json) before changing resources. No additional hosts were created for this upgrade.

Obsolete expiry timers are masked and cloud termination schedules removed. Services must remain running. Monitoring reports availability problems; it must not stop healthy services after an observation failure. Systemd owns failed-process restart and cgroup cleanup. Existing security groups, private origins, scoped credentials, traffic shaping and generated-code isolation remain. Owner stopped scheduled agent work; do not create recurring agent automation or promise its alerts.

Use actual service state and narrow logs before intervening. Public checks are `/`, `/wallet/runtime.json` and `/prover/healthz`; authenticated node access uses existing private configuration. An old journal error may belong to an earlier PID. Wait for actual transaction/bridge state through native SDK waiters; a missing response is not grounds to resubmit a payment. Keep the current flow's signed transaction identity until its actual outcome is known.

## Development and evidence

Read `AGENTS.md`, [Aztec skill](skills/aztec-app-development/SKILL.md), [BUILDING.md](BUILDING.md) and [TESTING.md](TESTING.md). For continue/resume, validate the graph and select ready work, but current owner scope takes priority over historical campaigns. Native local development uses `realProofs: false` and `proverEnabled: false`; real proofs belong to the affected testnet acceptance boundary. Do not repeat complete onboarding to test a small UI change.

The historical graph is not evidence of the current network or an instruction to restart stopped campaigns. Broader production audit/network clearance gates remain separate from this owner-authorized testnet deployment. Source, public hashes and selected observations belong in Git. Secrets, signed URLs, raw account state, private service configs and raw signing/provider journals do not.

## Generated-app hosting checks — 23 October

Bok now uses one hosting policy for generation guidance, public headers and mandatory browser validation. Every new published revision needs desktop/mobile interaction and reload scenarios; runtime/policy failures return to Bok for repair. Receipts bind the exact artifact bytes, captured scenario plan and current policy. The browser remains sandboxed in the existing credential-free executor. Nineteen focused browser checks passed; the actual server executor accepted a working app and rejected both startup and click-only storage failures despite passing Node tests/builds. All nine services are running and the existing Daily Three app remains served. See [gate evidence](execution/evidence/G21/stable6/bok-browser-gate.json) and [operator documentation](deploy/BOK_BROWSER_VALIDATION.md). Checks cover exercised workflows and discovered controls, not all possible code paths or browser engines.
