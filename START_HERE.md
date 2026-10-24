# Rolling Chat: start here

Current handover, 24 October 2026. Read this before historical execution records. Later owner instructions supersede old campaigns. Credentials, private account material and signed transaction journals are intentionally outside Git.

## Active performance goal

Ordinary post click → visible after actual Aztec inclusion must be ≤15 seconds; complete fee preparation <1 second; complete pre-proof application preparation <1 second; private witness construction ≤1.25 seconds; browser-to-prover submission/acceptance <1 second (owner added24October). Inspect actual prover CPU/topology and spot options within existing1500USD/month budget. **Goal remains active.**

Live static browser is a8ae686d; prover remains14e43947. Latest actual ordinary post took36.728s click→Aztec-included DOM, missing15s. The trace exposed a3.778s pre-action queue caused by composer warmup starting a full private balance scan. That warmup has been removed for the next normal release; an actual lightweight browser fixture verified that a checkpoint does not start a balance scan or block Post. Submission still synchronizes and validates current state. Full preparation1.490s, private witness3.987s, publicvalidation0.626s, uploadacceptance0.749s, proofwait4.671s. These overlap in places; see a8ae686d-live-post-timing.json rather than summing them. No claim that the goal has been reached.
Native507-case qualification and finite-state mixedUTF8 maximum check pass; worst observed publicL2gas1,868,273 against2,000,000 bound. The actual gas charge varies with content; unused reserved credit is refunded.

The4.582s earlier private trace contained11 sequential HTTPrequests totaling3.900s. No background throttling was observed. Runtime2dece9d9 eliminates private/public fee-estimation executions but still executes the real private transaction once. The prover now uses16threads on the existing16physicalcores; isolated native tail improved4.36→3.38seconds with real proof. Other services were not restarted. ExistingIAB/disposable testprovider gives realproof/Aztec acceptance, not MetaMask acceptance; do not relaunch the memory-heavy CFT session.

## Active owner-only record implementation

Owner requires durable owner-only state discovery, automatic restoration using the
same wallet in another browser, AES encryption unconstrained, no ECDH self-delivery,
no sender-index scanning, no new trusted intermediary and no old-state migration.
The counter-note journal prototype was rejected and must never ship. Replacement uses native unconstrained owner-only tagging bookkeeping and custom AES256-GCM envelopes, keeping existing native note authorization, nullification, partial-refund validation and reorg handling. Discovery must add zero private notes and zero logs. Native prototype tests verify note/log counts, empty-store restoration, transient-note squash, partial refunds and reverted application calls; production Board/FPC wiring and release qualification are still underway. Current signature-derived account root remains quantum-vulnerable as disclosed;
this delivery change does not claim post-quantum confidentiality or change login.

## Current deployment

Website: https://d30njln0kead8n.cloudfront.net
Source: https://github.com/zac-williamson/aztec_experiments (default branch `master`). Integration branch: `codex/rolling-chat-account-ux`; default `master` and `codex/rolling-chat-draft3` receive the same completed source and handover.

The public Aztec testnet is stable **6.0.0**, rollup `0x1f435a7f2da358caf887a470faeee7d5d5f4efba`, version **679261766**, on Ethereum Sepolia (11155111). The two-transaction Bok contract and optimized browser/worker path are deployed. Core runs **6c2c64f033ab8d35ed66fe2de76066a64a9bbc37**; Bok runs **52ef5da01fccd811db416eef83eba02561a09726** with measured settlement fees, precise browser-plan feedback, retained indexes, bounded parallel RPC reads, grouped exact file edits and an8192-token output allowance within existing budgets; the static client is **46805717** with arithmetic ordinary-post fee bounds and checkpoint-driven composer warming. The browser uses one private execution and one proof per normally funded main-board post; same-operation predecessor checks share their exact observation. Independent anchored reads run concurrently. Immediate posting now also overlaps fee metadata preparation with argument reads within the same locked action;567 checks passed, without a new live wall-time claim. Immediate low-credit sends also omit their redundant final standalone simulation, validating the exact final payload inside native proving; their changing fee-reservation probes now reuse the exact private measurement for native public simulation, avoiding two duplicate private executions per reservation. The authoritative proof executes separately. The latest SDK removes a redundant hash-addressed anchor lookup while retaining numeric height, returned/computed hash and fresh-tip checks. Actual SDK read counts for an advancing anchor change from 7→6 with a warm cache and 9→6 without it; an unchanged anchor remains 1→1. Integrated 73 checks passed with zero skips. Public SDK SHA-256: `e0b0a3e1fe52450fb288217d7009d013c3be2d30d1e86d5c3fef4b66412ef834`. These are read counts, not a new wall-time result; see [publication evidence](execution/evidence/G21/stable6/bok-performance/numeric-anchor-publication.json).

**Owner instruction, reaffirmed24October: this is not live production and all old application data is disposable.** Do not preserve, migrate, recover, archive or maintain backward compatibility with old accounts, posts, balances, databases or incomplete test flows. Discard or replace old state whenever that simplifies delivery; do not build machinery or delay work to retain it. This supersedes older preservation requirements. Keep authorized infrastructure credentials and security controls. No mainnet work is authorized.

All nine application services are active. The proxy shutdown ordering is permanently corrected: an actual held browser feed closed cleanly, the app stopped in451ms, then Caddy in4ms, without forced termination. A browser-only fix allows an existing account to open after replacement of the optional Bok plugin, while preserving canonical transaction checks. The retained test account opens without reset and all ten existing posts render.

**Ordinary posts now dismiss the composer at Aztec inclusion.** Static UI/SDK `f12bdc3e` uses the existing receipt waiter; no extra RPC or transaction. The real non-Bok test entered the feed 41.982s after Post, with the composer closed and “Confirmation pending”; it became checkpointed 73.743s later and the badge disappeared automatically without refresh. All services/configurations were unchanged. Canonical completion and account locking continue in the background. See [ordinary-post evidence](execution/evidence/G21/stable6/regular-post-inclusion/live-transitions.json).

**Earlier reply display is deployed and verified.** Replies render at Aztec inclusion with “Confirmation pending”, then update automatically at Ethereum checkpoint. The actual test reply was available35.220s earlier; the open browser observed both states with no refresh or duplicate. Accounting stays checkpointed and UI8f16fcd3 refreshes the balance once when the reply confirms. The same accepted job completed with two model calls; charge0.010962USDC/refund0.239038USDC. The old20static/64mirrorrevision caps now use a shared2048ceiling derived from the existing8192-file budget; byte/catalog limits remain. See [current evidence](execution/evidence/G21/stable6/proposed-replies/live-transitions.json).

**Previous comparable latency acceptance;30-second checkpoint target remains unmet.** Exact browser23e6cde5/worker cdab01f7 completed the identical request in **155.233s (2m35.2s)**,66.6% below464.264s. All eight application-controlled categories improved31.5–97.3% in this sample. No model repairs, one actual isolated validation,176browserchecks and a separate manual Clear completed/reload check passed. The post, settled reply and refund rendered automatically without Load more, reload or navigation during the request. Charge0.023465USDC, balance0.606593→0.583128. Final checkpoint70.839s remains above30s:68.337s preceded its eligible public-network slot and native waiting ended2.502s after the L1 timestamp. No avoidable substantial app delay was found in that wait. See [latency report](docs/BOK_LATENCY.md).

| Contract | Fresh address |
| --- | --- |
| Board | `0x122f9579999a8a25e47564f656182429fc3182d22d9229afb9310232de20aefc` |
| Posting deposit portal | `0xc8f9d5dfd6acedb32b65bec19ef4c97f27dd77d3` |
| Signup payment router | `0x83f9b76475b9e183b712474b2e61791f81b52fec` |
| Bok escrow | `0x12329a549afe3657974572c699ae5f7fcf855fe5f36e558073e259d739639aa9` |
| Bok portal | `0x9b4c7f1173d587fb1769c8bad0959eb8ff64ab48` |
| Canonical private fee contract | `0x24241a5c67daaded1c810026729bea12bac430b725e8a0aff59f4cc1de980868` |
| Bok credit router | `0x7a8f48615719475d0f184609f4d5415158c7f36f` |

The account derives from the Ethereum wallet signature; there are no password/backup import flows. A new test account with the same Ethereum owner can be selected through Your account → Start new test account or `/#/new-account`. Basic signup funds the posting deposit and posting fees. Bok remains optional. Post/Reply, likes, bookmarks and profile edits submit directly; the composer closes at successful Aztec inclusion. The feed shows “Confirmation pending” until Ethereum checkpoint; the original transaction waiter and account lock continue in the background. Typing `@bok` selects a request without blocking on a balance read. Main-page Bok balance and Add credit remain visible. Earlier flow evidence applies to the old deployment only.

## Persistent hosting

AWS account 052665140763, region us-east-1, existing profile `message-board-deploy`; SSM is the management path. Read the workspace `INFRASTRUCTURE_ACCESS.md` before service or credential work. Never open SSH or expose credentials to generated code.

| Component | Resource | Current source/runtime |
| --- | --- | --- |
| Core | `i-0a9b5b9ba55815cda`, `172.31.32.101`, m7a.4xlarge | Node, authenticated query, real prover, app/index, moderator |
| Bok | `i-0a7d9957f2b3d7f19`, `172.31.45.95`, m8a.xlarge (4 physical cores, 16 GiB) | Separate plugin worker and artifact proxy |
| Main CloudFront | `E3BMCK3MOVYK1K` | App, query and prover routes |
| Artifact CloudFront | `E1M12FHGQ0S5ST` | `dy2q03rao3se7.cloudfront.net` |

Core native release: `/opt/board-prover/releases/rolling-8fed2c764e5b62fc`, manifest `8fed2c764e5b62fc626e985e6b022ef3908605c7401200d4f8f09e9e07157097`. Real Linux qualification passed against this exact complete package. Official Aztec image: `azteclabs/aztec@sha256:59b10cc8e89bb9226db1f771a5abbe5d5f8d71483c00c7472187e6ddc7adab8d`.

Running/next-start app source: `/opt/rolling-app/releases/6c2c64f033ab8d35ed66fe2de76066a64a9bbc37`. Moderator source remains `/opt/rolling-upgrade-6.0.0`. Bok source: `/opt/rolling-bok/releases/52ef5da01fccd811db416eef83eba02561a09726` (shared hosting contract and mandatory isolated Chromium validation before new generated-app publication). Public UI: `/opt/rolling-ui/releases/a8ae686ddd6ba6f44b429ecf9027b182f6230d3b-closurefix`, selected through `/opt/rolling-ui/current`. The latest static publication preserved all service PIDs and private configuration. Worker publication source pins are `6b78d99d29f25f22060df8ca3d1e26e4b2ab867b2ba673b95a38b0a24eb73704`; its configuration hash remains `fc3543d2f224104fe9c6b0a6fc0fdbe6a455030e8a4d0f2b997ba4ddd0a3e636`. The latest worker/proxy restart produced PIDs15179/15181. The core app/proxy are709116/709119. Final UI-only publication preserved every service PID. App runtime config is `/etc/rolling-app/wallet.json`; fresh state directories include `stable6-` and the board address. Core and Bok share pinned application Node24.21.0; the official Aztec container uses Node24.22.1. Native prover assets and CRS are6.0.0.

Fresh moderator/deployer identity: `0x0233a0ebe93af15f273c200ce05a893ae2c7e87c0b24196eec705c1d09f6ceaa`. Fresh Bok identity: `0x119fa1d976f386eb0b3577a9661c923ce02ca500fbc1e68096718aa7f24948e5`. Bok proves natively on its own host and uses authenticated node queries; generated code receives neither actor keys nor AWS access.

Bok uses the private repository `zac-williamson/rolling-chat-bok-pool-20261015-03`, repository ID 1420006279, initial README commit `f7427999c32ee1ae5bd5bac35f0e1af523e70afe`. It now holds the real Daily Three generated app for [this conversation](https://d30njln0kead8n.cloudfront.net/#/thread/4765888027184167413378790215818002954126604611785256906826698634731597930115). The current accepted generated source is `0502cb031c8cbe0dd9458542315fa072270c99cb`, updating the subtitle to “Three habits. One day at a time.” with its corresponding browser check. Its predecessor `2c0dfe060bdecfe69027e382949009dedc23ee12` implemented Clear completed with176 first-pass browser checks and a successful separate manual reload check. It was measured against the original `a25ff3c2b161e73c2a40e59a73f25567d646bc92` app tree. No account or financial-state reset was used. [Open Daily Three](https://dy2q03rao3se7.cloudfront.net/t/5b889916416d6fe106a8eefbdd68d913ef089ea956638738305fe7c46d5fbcc0/latest/). Its current URL retains and shares its state; Reset today is manual. Existing GitHub App 5317701, installation 171412624 already has access; Actions are disabled. No GitHub sign-in or permission change is needed. The newly created `rolling-chat-bok-pool-20261023-01` is unused.

## Operations and cost

Owner authorizes **USD 1,500/month ongoing hosting**. The current forecast is **USD 1,444.05 for 31 days including allowances**, following the same-instance worker change to m8a.xlarge. This saves approximatelyUSD18.89/month; no new resource was created. These are estimates, not billed spend. Reconcile [infrastructure ledger](execution/infrastructure-ledger.json) before changing resources. No additional hosts were created for this upgrade.

Obsolete expiry timers are masked and cloud termination schedules removed. Services must remain running. Monitoring reports availability problems; it must not stop healthy services after an observation failure. Systemd owns failed-process restart and cgroup cleanup. Existing security groups, private origins, scoped credentials, traffic shaping and generated-code isolation remain. Owner stopped scheduled agent work; do not create recurring agent automation or promise its alerts.

Use actual service state and narrow logs before intervening. Public checks are `/`, `/wallet/runtime.json` and `/prover/healthz`; authenticated node access uses existing private configuration. An old journal error may belong to an earlier PID. Wait for actual transaction/bridge state through native SDK waiters; a missing response is not grounds to resubmit a payment. Keep the current flow's signed transaction identity until its actual outcome is known.

## Development and evidence

Read `AGENTS.md`, [Aztec skill](skills/aztec-app-development/SKILL.md), [BUILDING.md](BUILDING.md) and [TESTING.md](TESTING.md). For continue/resume, validate the graph and select ready work, but current owner scope takes priority over historical campaigns. Native local development uses `realProofs: false` and `proverEnabled: false`; real proofs belong to the affected testnet acceptance boundary. Do not repeat complete onboarding to test a small UI change.

The historical graph is not evidence of the current network or an instruction to restart stopped campaigns. Broader production audit/network clearance gates remain separate from this owner-authorized testnet deployment. Source, public hashes and selected observations belong in Git. Secrets, signed URLs, raw account state, private service configs and raw signing/provider journals do not.

## Generated-app hosting checks — 23 October

Bok now uses one hosting policy for generation guidance, public headers and mandatory browser validation. Every new published revision needs desktop/mobile interaction and reload scenarios; runtime/policy failures return to Bok for repair. Receipts bind the exact artifact bytes, captured scenario plan and current policy. The browser remains sandboxed in the existing credential-free executor. Nineteen focused browser checks passed; the actual server executor accepted a working app and rejected both startup and click-only storage failures despite passing Node tests/builds. All nine services are running and the existing Daily Three app remains served. See [gate evidence](execution/evidence/G21/stable6/bok-browser-gate.json) and [operator documentation](deploy/BOK_BROWSER_VALIDATION.md). Checks cover exercised workflows and discovered controls, not all possible code paths or browser engines.
