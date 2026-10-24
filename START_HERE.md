# Rolling Chat: start here

Current handover: 25 October 2026. Current owner scope takes precedence over historical task records. Credentials and private account material remain outside Git.

## Active performance work

Ordinary post click → visible after actual Aztec inclusion must be ≤15 seconds. Fee preparation, complete pre-proof application preparation and browser-to-prover acceptance must each be <1 second; private witness construction ≤1.25 seconds.

**Published source `2aac56a1` measured 13.507 seconds and 13.836 seconds** in two consecutive real-proof browser posts (92 and252 characters). The composer closed at inclusion, posts showed “Confirmation pending”, and checkpoint confirmation updated automatically. One private execution took650ms and601ms. Fee arithmetic took under1ms. No simulated proof, artificial inclusion or favorable-slot selection was used.

The complete goal remains active: first-run pre-proof preparation1.684s and upload acceptance1.274s still exceed their subsecond targets. The repeated run had1.199s preparation and1.177s upload. Exact numeric traces and deployment receipts are in [ordinary-post evidence](execution/evidence/G21/stable6/ordinary-post-latency/). SDK child/aggregate spans overlap; never sum them as separate sequential work.

The published fixes preload two native kernel artifacts, reuse exact-operation authenticated journal metadata, remove duplicate UI policy reads, overlap predecessor/policy reads, prefetch the immutable Board configuration witness and return a completed proof before worker teardown. Worker capacity remains reserved until cleanup; native proof verification and canonical transaction checks remain.

Next: finish measured preparation/upload reductions and the discovered uncached8MiBCRS download. Root owns one retained build at `/private/tmp/rolling-browser-proof-spans-build` and the existing IAB test tab. No new dependency copies or Chrome profiles. Use source-only agent drafts; clean owned scratch and transfer archives after integration.

## Current deployment

Website: https://d30njln0kead8n.cloudfront.net
Repository: https://github.com/zac-williamson/aztec_experiments — default branch `master`. Integration branch `codex/rolling-chat-account-ux` and `codex/rolling-chat-draft3` receive the same reviewed changes.

Network: Aztec stable6.0.0, rollup `0x1f435a7f2da358caf887a470faeee7d5d5f4efba`, version679261766, Ethereum Sepolia11155111. No mainnet work.

| Component | Installed source |
| --- | --- |
| Browser UI | `/opt/rolling-ui/releases/2aac56a180423d89fada24cf575ac41072df2cff` |
| Browser SDK SHA256 | `6ee6787e6c1c1f00dc77573bfadeadd08752e4e8f26946f77b5d19460f942854` |
| Running app | `/opt/rolling-app/releases/6cb76060aba07b2eae31284d0e949517dd240d48` |
| Next-start app | `/opt/rolling-app/releases/ui-2aac56a18042` |
| Prover | `/opt/board-prover/releases/result-2aac56a180423d89fada24cf575ac41072df2cff` |
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

All nine services were verified active after publication. Both application and Bok artifact proxies retain egress/security dependencies but no longer stop when their upstream worker stops. The Bok fix required daemon reload only; worker/proxy PIDs45774/45776 stayed unchanged. Core app/proxy PIDs791316/787665, prover791632. Query actual current state before intervention.

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
