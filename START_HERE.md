# Rolling Chat: start here

Current handover, 24 October 2026. Read this before historical execution records. Later owner instructions supersede old campaigns. Credentials, private account material and signed transaction journals are intentionally outside Git.

## Current deployment

Website: https://d30njln0kead8n.cloudfront.net
Source: https://github.com/zac-williamson/aztec_experiments (default branch `master`). Integration branch: `codex/rolling-chat-account-ux`; default `master` and `codex/rolling-chat-draft3` receive the same completed source and handover.

The public Aztec testnet is stable **6.0.0**, rollup `0x1f435a7f2da358caf887a470faeee7d5d5f4efba`, version **679261766**, on Ethereum Sepolia (11155111). The two-transaction Bok contract and optimized browser/worker path are deployed. Core runs **ae9d60b807316d5ce0e2df38e47c4129fb8178e8**; Bok runs **392bee960c08086f234f631e8cf5c157cfe3e63b** with measured settlement fees, precise browser-plan feedback, retained indexes, bounded parallel RPC reads, grouped exact file edits and an8192-token output allowance within existing budgets; the static client is **acbcf73f3e71a4775245cd942ad2751b974809eb**. The browser now uses one private execution and one actual proof per normally funded post; same-operation predecessor checks share their exact observation.

**Owner instruction, reaffirmed24October: this is not live production and all old application data is disposable.** Do not preserve, migrate, recover, archive or maintain backward compatibility with old accounts, posts, balances, databases or incomplete test flows. Discard or replace old state whenever that simplifies delivery; do not build machinery or delay work to retain it. This supersedes older preservation requirements. Keep authorized infrastructure credentials and security controls. No mainnet work is authorized.

All nine application services are active. The proxy shutdown ordering is permanently corrected: an actual held browser feed closed cleanly, the app stopped in451ms, then Caddy in4ms, without forced termination. A browser-only fix allows an existing account to open after replacement of the optional Bok plugin, while preserving canonical transaction checks. The retained test account opens without reset and all ten existing posts render.

**Two-transaction acceptance passed:** real MetaMask ETH-to-Bok funding and an actual feature update published new app code to GitHub and the hosted site. The latest measured identical Clear completed request took **160.534s (2m40.5s)** from Post click to automatically rendered, settled reply, down from464.264s (7m44s). The model made3calls in48.972s instead14calls in192.671s. The accepted app passed174 browser checks and the separate completed/unfinished/reload check. Charge0.018806USDC/refund0.231194USDC; balance updated automatically. All measured application-controlled categories improved by33–95% in this run; worker proof is3.470s on the cheaper four-physical-core host. The final57.381s public-network checkpoint wait still misses the requested30-second target. See [latency report](docs/BOK_LATENCY.md).

| Contract | Fresh address |
| --- | --- |
| Board | `0x122f9579999a8a25e47564f656182429fc3182d22d9229afb9310232de20aefc` |
| Posting deposit portal | `0xc8f9d5dfd6acedb32b65bec19ef4c97f27dd77d3` |
| Signup payment router | `0x83f9b76475b9e183b712474b2e61791f81b52fec` |
| Bok escrow | `0x12329a549afe3657974572c699ae5f7fcf855fe5f36e558073e259d739639aa9` |
| Bok portal | `0x9b4c7f1173d587fb1769c8bad0959eb8ff64ab48` |
| Canonical private fee contract | `0x24241a5c67daaded1c810026729bea12bac430b725e8a0aff59f4cc1de980868` |
| Bok credit router | `0x7a8f48615719475d0f184609f4d5415158c7f36f` |

The account derives from the Ethereum wallet signature; there are no password/backup import flows. A new test account with the same Ethereum owner can be selected through Your account → Start new test account or `/#/new-account`. Basic signup funds the posting deposit and posting fees. Bok remains optional. Post/Reply, likes, bookmarks and profile edits submit directly; the composer closes after confirmation. Typing `@bok` selects a request without blocking on a balance read. Main-page Bok balance and Add credit remain visible. Earlier flow evidence applies to the old deployment only.

## Persistent hosting

AWS account 052665140763, region us-east-1, existing profile `message-board-deploy`; SSM is the management path. Read the workspace `INFRASTRUCTURE_ACCESS.md` before service or credential work. Never open SSH or expose credentials to generated code.

| Component | Resource | Current source/runtime |
| --- | --- | --- |
| Core | `i-0a9b5b9ba55815cda`, `172.31.32.101`, m7a.4xlarge | Node, authenticated query, real prover, app/index, moderator |
| Bok | `i-0a7d9957f2b3d7f19`, `172.31.45.95`, m8a.xlarge (4 physical cores, 16 GiB) | Separate plugin worker and artifact proxy |
| Main CloudFront | `E3BMCK3MOVYK1K` | App, query and prover routes |
| Artifact CloudFront | `E1M12FHGQ0S5ST` | `dy2q03rao3se7.cloudfront.net` |

Core native release: `/opt/board-prover/releases/rolling-8fed2c764e5b62fc`, manifest `8fed2c764e5b62fc626e985e6b022ef3908605c7401200d4f8f09e9e07157097`. Real Linux qualification passed against this exact complete package. Official Aztec image: `azteclabs/aztec@sha256:59b10cc8e89bb9226db1f771a5abbe5d5f8d71483c00c7472187e6ddc7adab8d`.

Running/next-start app source: `/opt/rolling-app/releases/ae9d60b807316d5ce0e2df38e47c4129fb8178e8`. Moderator source remains `/opt/rolling-upgrade-6.0.0`. Bok source: `/opt/rolling-bok/releases/392bee960c08086f234f631e8cf5c157cfe3e63b` (shared hosting contract and mandatory isolated Chromium validation before new generated-app publication). Public UI: `/opt/rolling-ui/releases/acbcf73f3e71a4775245cd942ad2751b974809eb`, selected through `/opt/rolling-ui/current`. The final account-history client publication preserved all service PIDs, SDK assets and private configuration. App runtime config is `/etc/rolling-app/wallet.json`; fresh state directories include `stable6-` and the board address. Core and Bok share pinned application Node24.21.0; the official Aztec container uses Node24.22.1. Native prover assets and CRS are6.0.0.

Fresh moderator/deployer identity: `0x0233a0ebe93af15f273c200ce05a893ae2c7e87c0b24196eec705c1d09f6ceaa`. Fresh Bok identity: `0x119fa1d976f386eb0b3577a9661c923ce02ca500fbc1e68096718aa7f24948e5`. Bok proves natively on its own host and uses authenticated node queries; generated code receives neither actor keys nor AWS access.

Bok uses the private repository `zac-williamson/rolling-chat-bok-pool-20261015-03`, repository ID 1420006279, initial README commit `f7427999c32ee1ae5bd5bac35f0e1af523e70afe`. It now holds the real Daily Three generated app for [this conversation](https://d30njln0kead8n.cloudfront.net/#/thread/4765888027184167413378790215818002954126604611785256906826698634731597930115). Current accepted generated source is `6b11a8eec0334c7610f202c1d4c89f1fe16cad12`, implementing Clear completed with174 first-pass browser checks and a separate successful manual reload check. It was measured against the exact original app tree; no account or financial-state reset was used. [Open Daily Three](https://dy2q03rao3se7.cloudfront.net/t/5b889916416d6fe106a8eefbdd68d913ef089ea956638738305fe7c46d5fbcc0/latest/). Its current URL retains and shares its state; Reset today is manual. Existing GitHub App 5317701, installation 171412624 already has access; Actions are disabled. No GitHub sign-in or permission change is needed. The newly created `rolling-chat-bok-pool-20261023-01` is unused.

## Operations and cost

Owner authorizes **USD 1,500/month ongoing hosting**. The current forecast is **USD 1,444.05 for 31 days including allowances**, following the same-instance worker change to m8a.xlarge. This saves approximatelyUSD18.89/month; no new resource was created. These are estimates, not billed spend. Reconcile [infrastructure ledger](execution/infrastructure-ledger.json) before changing resources. No additional hosts were created for this upgrade.

Obsolete expiry timers are masked and cloud termination schedules removed. Services must remain running. Monitoring reports availability problems; it must not stop healthy services after an observation failure. Systemd owns failed-process restart and cgroup cleanup. Existing security groups, private origins, scoped credentials, traffic shaping and generated-code isolation remain. Owner stopped scheduled agent work; do not create recurring agent automation or promise its alerts.

Use actual service state and narrow logs before intervening. Public checks are `/`, `/wallet/runtime.json` and `/prover/healthz`; authenticated node access uses existing private configuration. An old journal error may belong to an earlier PID. Wait for actual transaction/bridge state through native SDK waiters; a missing response is not grounds to resubmit a payment. Keep the current flow's signed transaction identity until its actual outcome is known.

## Development and evidence

Read `AGENTS.md`, [Aztec skill](skills/aztec-app-development/SKILL.md), [BUILDING.md](BUILDING.md) and [TESTING.md](TESTING.md). For continue/resume, validate the graph and select ready work, but current owner scope takes priority over historical campaigns. Native local development uses `realProofs: false` and `proverEnabled: false`; real proofs belong to the affected testnet acceptance boundary. Do not repeat complete onboarding to test a small UI change.

The historical graph is not evidence of the current network or an instruction to restart stopped campaigns. Broader production audit/network clearance gates remain separate from this owner-authorized testnet deployment. Source, public hashes and selected observations belong in Git. Secrets, signed URLs, raw account state, private service configs and raw signing/provider journals do not.

## Generated-app hosting checks — 23 October

Bok now uses one hosting policy for generation guidance, public headers and mandatory browser validation. Every new published revision needs desktop/mobile interaction and reload scenarios; runtime/policy failures return to Bok for repair. Receipts bind the exact artifact bytes, captured scenario plan and current policy. The browser remains sandboxed in the existing credential-free executor. Nineteen focused browser checks passed; the actual server executor accepted a working app and rejected both startup and click-only storage failures despite passing Node tests/builds. All nine services are running and the existing Daily Three app remains served. See [gate evidence](execution/evidence/G21/stable6/bok-browser-gate.json) and [operator documentation](deploy/BOK_BROWSER_VALIDATION.md). Checks cover exercised workflows and discovered controls, not all possible code paths or browser engines.
