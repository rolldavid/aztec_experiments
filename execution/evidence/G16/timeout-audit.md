# Application timeout audit — 20 October 2026

Audited the Rolling Chat browser, wallet/journals, public reader/index, prover/query service, moderator, Bok/plugin runtime, and live hosting limits. Tests, test harnesses, one-off build/deployment commands, historical diagnostic campaigns, generated duplicate bundles and underlying blockchain consensus timers are excluded. Shared legacy UI paths are explicitly labelled below rather than presented as current Rolling signup.

**Live browser baseline: `0ea73a59`. The signup edits in the working tree are not deployed.** Tables give the live/source baseline unless a local change is explicitly stated. Source links point to the current checkout, so changed lines can show the proposed value. Configurable defaults are distinguished from live hosting values. This inventories application-owned limits and the directly invoked SDK defaults; it does not claim an exhaustive audit of every timer inside every dependency.

Elapsed time does not establish transaction failure. A receipt can establish success/revert; a transport timeout establishes that a response was unavailable. Proof/model/resource limits and signed authorisation expiry are separate policy decisions.

## Transaction and user-flow completion limits

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| Ethereum transaction confirmation | 20 s, less time already spent reading | The same reader budget covers RPC reads and waiting for mining. Expiry reports recovery-required even when the payment is pending. Clear onboarding defect; other default journal sends still use this path. | [shared/ethereum-journal.mjs:159](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/ethereum-journal.mjs:159>) |
| Aggregate Ethereum payment continuation | 120 s | Expiry rejects the continuation. Local unpublished change uses the native receipt waiter without a completion deadline. | [shared/rolling/aggregate-wallet.mjs:311](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/aggregate-wallet.mjs:311>) |
| Standalone top-up Ethereum continuation | 120 s | Same issue; local unpublished change removes completion deadline. | [shared/rolling/aggregate-wallet.mjs:430](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/aggregate-wallet.mjs:430>) |
| Funding bridge delivery | 120 s per bridge leg | SDK throws if a message is still not consumable at the checkpointed tip. Local unpublished change waits for actual readiness. | [apps/rolling/wallet-session.mjs:50](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:50>) |
| Funding private-claim confirmation | 120 s | SDK throws while confirmation can still be pending. Local unpublished change waits for the receipt. | [apps/rolling/wallet-session.mjs:55](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:55>) |
| Other private transaction confirmation | 540 s / 9 min | SDK expiry becomes BB_SUBMISSION_UNKNOWN with recovery wording. Used by the Rolling L2 journal; remains unchanged. | [shared/transaction-outcomes.mjs:56](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/transaction-outcomes.mjs:56>) |
| Rolling L2 journal waiting | Inherits 540 s | Journal reconciles using waitForCanonicalReceipt; wallet session does not override the default. | [shared/l2-journal.mjs:218](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/l2-journal.mjs:218>) |
| Remote proof: submit + queue + execution + result | 1,800 s / 30 min | A single browser AbortSignal expires the whole job. Reports BB_REMOTE_PROVER_TIMEOUT without cancelling the remote job. | [shared/remote-prover-client.mjs:5](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/remote-prover-client.mjs:5>) |
| Deployment verification during account connection | 20 s for the entire sequence | Multiple reads consume one budget. Expiry is labelled ROLLING_DEPLOYMENT_INVALID; underlying calls are not cancelled. Slow verification is not proof of an invalid deployment. | [shared/rolling/deployment.mjs:45](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/deployment.mjs:45>) |
| Warm saved-preference read | 5 s per read operation | Checks the deadline between SDK operations; preserves progress but rejects the read as unavailable. | [shared/rolling/preference-reader.mjs:69](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/preference-reader.mjs:69>) |
| Cold saved-preference read | 10 s per read operation | Checks between operations, retains progress, reports unavailable. In-flight work is drained. | [shared/rolling/cold-preference-reader.mjs:95](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/cold-preference-reader.mjs:95>) |
| Restore previously loaded feed pages | 20 s for all restoration requests | Shared abort signal stops multi-page back-navigation restoration, regardless of continued useful progress. | [apps/rolling/reader.mjs:135](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/reader.mjs:135>) |
| CRS download for browser prover | 120 s per file | Aborts a potentially large immutable asset download; mapped to prover configuration failure. | [shared/private-pxe.mjs:68](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/private-pxe.mjs:68>) |
| Browser capability/storage check | 5 s | Probe stops and cleans up, returning READINESS_TIMEOUT. A bounded probe is distinct from unsupported browser capability. | [shared/browser-readiness.js:7](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/browser-readiness.js:7>) |
| Passkey ceremony | 120 s browser hint | Browser controls cancellation. Rolling signup currently sets autoPasskey:false; this is an available shared capability. | [shared/passkey-wallet.js:45](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/passkey-wallet.js:45>) |

## Browser transport, data work and image limits

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| Wallet metadata and funding-relay HTTP | 30 s | Aborts request. A timed-out relay submission does not establish that payment was not sent. | [apps/rolling/wallet-runtime.mjs:7](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-runtime.mjs:7>) |
| Bok accounting snapshot HTTP | 20 s | Aborts request and reports unavailable. | [apps/rolling/wallet-session.mjs:89](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:89>) |
| Private Aztec JSON-RPC HTTP/body | 30 s | Aborts request; trusted-node unavailable; no application retry. | [shared/trusted-private-node.mjs:185](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/trusted-private-node.mjs:185>) |
| Generic transaction read wrapper | 20 s default/max | Promise.race rejects BB_SUBMISSION_UNKNOWN; does not cancel the underlying request. Also used around sendTx before exact-hash reconciliation. | [shared/transaction-outcomes.mjs:6](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/transaction-outcomes.mjs:6>) |
| Ethereum journal multi-read wrapper | 20 s default/max | One shared budget for a read sequence, not necessarily one request; original promise can continue. | [shared/ethereum-journal.mjs:165](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/ethereum-journal.mjs:165>) |
| L2 journal checks and receipt reads | 20 s default | Uses bounded transaction reads; some calls wrap several reads. Timeout can produce unknown/rejected operation. | [shared/l2-journal.mjs:119](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/l2-journal.mjs:119>) |
| Withdrawal verification/read wrapper | 20 s | Tracks and drains underlying pending promises before releasing operation ownership. | [apps/rolling/wallet-session.mjs:108](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:108>) |
| Refund-only public Aztec RPC wrapper | 20 s | Wraps public RPC; inner SDK request/retries can outlive the outer race. | [apps/rolling/wallet-session.mjs:232](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:232>) |
| Top-up claim canonical verification | 20 s per read | Receipt/block verification rejects on unavailable response. | [apps/rolling/wallet-session.mjs:503](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:503>) |
| Compact private-data HTTP | 10 s | Aborts request; includes guard/body-processing time. Holds ownership until pending work settles. | [shared/rolling/compact-client.mjs:6](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/compact-client.mjs:6>) |
| Public reader API HTTP | 20 s default; configurable up to 60 s | Aborts GET/body read; navigation also cancels it. | [apps/rolling/reader-client.mjs:4](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/reader-client.mjs:4>) |
| Public event decoding | 20 s default/max per operation | Deadline checked around reads; current read finishes before failure. | [shared/rolling/public-events.mjs:186](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/public-events.mjs:186>) |
| Public index sync, in-memory | 20 s default/max per sync | Checks deadline between reads; ROLLING_PUBLIC_TIMEOUT. | [shared/rolling/public-index.mjs:30](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/public-index.mjs:30>) |
| Public index sync, persistent | 20 s default/max per sync | Shared budget includes event decoding; retains ownership of in-flight read. | [shared/rolling/public-index.mjs:194](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/public-index.mjs:194>) |
| Avatar upload decode/resize/encode | 10 s total | Processing timeout; late images/resources cleaned. Device-dependent computation limit. | [apps/rolling/avatar-upload.mjs:6](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/avatar-upload.mjs:6>) |
| Displayed avatar decoding | 5 s | Shows unavailable placeholder and suppresses late publication. | [apps/rolling/profile-view.mjs:109](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/profile-view.mjs:109>) |
| SQLite busy-lock waiting | 0 s | Immediate contention error instead of waiting. | [shared/rolling/public-sqlite.mjs:69](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/public-sqlite.mjs:69>) |

## Authorisation, freshness and contract validity

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| ETH and USDC funding authorisation | 120 s live; 900 s local proposed | Signed deadline starts during quote preparation, before review and wallet prompts. Enforced by Ethereum contracts. The two-minute lifetime is too short for the interactive flow. | [shared/rolling/aggregate-funding.mjs:5](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/aggregate-funding.mjs:5>) |
| Trusted-node freshness | 120 s default/live; allowed 1–600 s | Rejects a proving-enabled node when its synced L1 timestamp is too old or in the future. A freshness rule, not a completion deadline. | [shared/trusted-private-node.mjs:55](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/trusted-private-node.mjs:55>) |
| New USD-display oracle freshness | 86,400 s / 24 h (local only) | Stale Chainlink data yields no USD estimate; does not authorise or block payment. | [apps/rolling/wallet-session.mjs:516](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/wallet-session.mjs:516>) |
| Bok request lifetime | 86,400 s / 24 h | Contract rejects ordinary work after expiry; explicit expiry releases/reconciles credit. | [experiments/private-bok/escrow/src/main.nr:39](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/experiments/private-bok/escrow/src/main.nr:39>) |
| Bok paid-call start margin | 7,200 s / 2 h before request expiry | A new paid call must begin with more than two hours remaining on the request. | [experiments/private-bok/escrow/src/main.nr:40](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/experiments/private-bok/escrow/src/main.nr:40>) |
| Plugin-adapter request lifetime / start margin | 24 h / 2 h | Separate adapter contract has equivalent expiry/start constraints; not a browser wait. | [billboard/plugin_adapter/src/main.nr:74](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/billboard/plugin_adapter/src/main.nr:74>) |
| Funding deposit consent / USDC authorisation | Signed plan deadline, no independent hardcoded duration | fund/depositFor/USDC authorisation reject expired signatures; same funding TTL, not extra timers. | [billboard/portal/src/RollingFundingRouter.sol:73](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/billboard/portal/src/RollingFundingRouter.sol:73>) |
| Posting cooldown / moderation window | Deployment-configured, not a fixed JS timeout | Economic/withdrawal eligibility rules. This audit does not treat required contract waiting periods as application failure timeouts. | [billboard/rolling_contract/src/admission.nr:124](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/billboard/rolling_contract/src/admission.nr:124>) |
| Aztec transaction lifetime used in contract safety bound | 86,400 s / 24 h protocol constant | Protocol validity used when calculating recovery/withdrawal safety bounds, not a UI completion timer. | [billboard/rolling_contract/src/admission.nr:144](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/billboard/rolling_contract/src/admission.nr:144>) |

## Other shipped/shared paths, not current Rolling signup

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| Shared deployment preflight | 20 s whole sequence | Uses remaining budget across reads. Legacy/shared preflight, not an independent Sepolia inclusion window. | [shared/deployment-manifest.mjs:37](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/deployment-manifest.mjs:37>) |
| Shared browser connection check | 20 s whole sequence | Reports unavailable on deadline. | [shared/browser-connection-check.js:7](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/browser-connection-check.js:7>) |
| Legacy wallet receipt wait | 540 s default | Older wallet send path; same canonical receipt helper. | [shared/aztec-lib.js:257](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/aztec-lib.js:257>) |
| Legacy manual bridge helper | 600 s / 10 min; polls every 20 s | Returns false and suggests continuing later if delivery has not completed. | [shared/aztec-lib.js:635](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/aztec-lib.js:635>) |
| Legacy SDK boot check | 120 polls × 500 ms ≈ 60 s | Shows reload failure. Current Rolling loader does not use this boot poll. | [shared/app-env.js:59](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/app-env.js:59>) |
| Legacy public feed range/source | 20 s default/max | Mix of per-read and whole-range scanning budgets. | [shared/public-feed-source.mjs:78](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/public-feed-source.mjs:78>) |
| Legacy public feed sync | 20 s default; up to 60 s | Races whole sync; original work can outlive the rejected promise. | [shared/public-feed.mjs:15](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/public-feed.mjs:15>) |
| Legacy public RPC HTTP | 20 s default/max | Aborts request, preserves cached feed. | [shared/public-feed-rpc.mjs:2](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/public-feed-rpc.mjs:2>) |
| Legacy public-reader config HTTP | 20 s | Metadata fetch abort. | [shared/public-app-bootstrap.js:4](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/public-app-bootstrap.js:4>) |
| Shared board catalog HTTP | 10 s | Fetch abort; rejected promise remains cached. | [shared/board-catalog.js:5](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/board-catalog.js:5>) |
| Legacy optional prover health check | 10 s | Failure is swallowed; readiness remains unset. | [shared/application.js:149](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/application.js:149>) |

Additional legacy wallet code is shipped as `apps/src/billboard/user/engine.js`, but current Rolling calls its private-route binding rather than these older UI workflows:

| Legacy engine operation | Limit | Effect |
|---|---|---|
| Deposit bridge-readiness helper (`engine.js:567–597`) |240s default whole wait,1s polling; `waitUntilAvailable:true` removes overall deadline but keeps240s per-call bound |Reports pending when its budget expires. Used by legacy fee/deposit flows; current Rolling funding uses its native continuation. |
| Existing deposit lookup (`engine.js:1291–1296`) |60s total, each read at most20s |Reports BB_DEPOSIT_LOOKUP_FAILED on time budget exhaustion. |
| Legacy wallet receipt callback (`engine.js:280`) |540s unless caller overrides |Uses the shared canonical receipt helper. |
| Legacy screening wait (`engine.js:1786`) |Up to30s between checks of the contract deadline |Polling pause, not elapsed-time success or a failure timeout. |

## Directly used dependency defaults

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| Ethereum JSON-RPC HTTP | 300 s / 5 min default | FetchRequest default; journal outer20s races can reject earlier. | [node_modules/ethers/lib.esm/utils/fetch.js:398](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/ethers/lib.esm/utils/fetch.js:398>) |
| Ethers transaction receipt waiter | No timeout unless supplied | Native wait ends on receipt or error; live application supplies20s/120s in the paths listed above. | [node_modules/ethers/lib.esm/providers/abstract-provider.js:975](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/ethers/lib.esm/providers/abstract-provider.js:975>) |
| Aztec transaction receipt waiter | 300 s default; application usually overrides | Default1s polling and5s dropped-receipt grace; app journal overrides to540s and funding live to120s. timeout:0 means no completion expiry. | [node_modules/@aztec-labs/aztec.js/dest/contract/wait_opts.js:1](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/@aztec-labs/aztec.js/dest/contract/wait_opts.js:1>) |
| Aztec bridge waiter | Caller-provided timeout; 1 s polling | Readiness comes from actual checkpointed message availability. | [node_modules/@aztec-labs/aztec.js/dest/utils/cross_chain.js:11](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/@aztec-labs/aztec.js/dest/utils/cross_chain.js:11>) |
| Default Aztec public/refund RPC fetch | No explicit request timeout; retry delays1,2,3 s | Rolling private route replaces this transport with its own30s abort. Outer read races do not cancel default public RPC. | [node_modules/@aztec-labs/stdlib/dest/interfaces/aztec-node.js:392](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/@aztec-labs/stdlib/dest/interfaces/aztec-node.js:392>) |

## Live hosting limits (read-only verification)

CloudFront configuration and both hosts were inspected on20October; evidence: [hosting-readback.json](timeout-audit/hosting-readback.json). SSM read IDs: `182279f4-9033-4da7-9176-476ad804dd99` and `62580464-54de-4ee8-b2b8-e0c43a966252`. Only duration settings were returned; no credentials or user records were read into this report.

| Surface | Current limits | Effect |
|---|---|---|
| CloudFront application origin | Connect10s; one attempt; response-read60s; keepalive5s | Can terminate a stalled origin request; keepalive only closes an idle connection. |
| CloudFront query origin | Connect10s; one attempt; response-read30s; keepalive5s | Query response may be cut off independently of browser/server limits. |
| CloudFront prover origin | Connect10s; one attempt; response-read30s; keepalive5s | Bounds individual submit/status HTTP responses, not the asynchronous proof job. |
| CloudFront Bok artifact origin | Connect10s; one attempt; response-read30s; keepalive5s | Artifact response connection limit. |
| Retained website origin | Connect10s; three attempts | Separate retained distribution origin; not an extra mining wait. |
| App/query/prover services | Start90s; stop30s | Startup/shutdown process controls. |
| Aztec node service | No startup deadline; stop45s | Shutdown containment. |
| Moderator service | Start90s; stop300s | Shutdown containment; live value differs from old360s template. |
| Bok service | Start90s; stop45s | Shutdown containment. |
| Application/Bok artifact proxies | Start90s; stop90s | Process lifecycle. |
| Prover proxy | Start15s; stop5s | Process lifecycle. |
| Host and application attestors | Start100s; stop5s | Operational checks. An application attestation failure can stop query/prover listeners; not a user transaction outcome. |
| All listed service lifetimes | Unlimited; process watchdog disabled | No active fixed hosting expiry. Old campaign shutdown dates are not live timers. |

## Scheduling and cleanup timers (not failure deadlines)

- Remote proof status polling:1s (`shared/remote-prover-client.mjs:30`).
- SDK receipt/message polling:1s; Ethers provider polling:4s, batching10ms, cache250ms. Provider lookup/network-startup retries also use100ms/1s intervals.
- Download object-URL cleanup:1s (`apps/rolling/wallet-panel.mjs:243`, `shared/wallet-buttons.js:29`, `shared/public-app-config-ui.js:20`).
- Legacy withdrawal settlement polling pause:30s (`shared/application.js:426`).
- Legacy UI success/navigation delay:700ms; block monitor refresh:10s; elapsed-time display refresh:1s (`shared/helpers.js`, `shared/board-view.js`).
- Zero-delay worker/event-loop yields are scheduling, not timeout errors.

## Prover, query, public backend, Bok and moderation

Source defaults below were traced through their active constructors. Private deployment settings were inspected only for numeric timing overrides; none were returned except the120s query/prover freshness setting. Optional GitHub/treasury/legacy features are included as application capabilities, without claiming they are currently enabled.

| Operation | Limit | On expiry / assessment | Source |
|---|---|---|---|
| Hosted proof worker | 120 s | SIGKILLs the entire worker process group; job fails. Includes worker startup and computation. service.mjs:112 supplies no override. | [prover/process-worker.mjs:3](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/process-worker.mjs:3>) |
| Queued proof lifetime | 30 min | Nonrunning expired job is deleted without execution; running work excluded. | [prover/queue.mjs:5](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/queue.mjs:5>) |
| Completed/failed proof-result retention | 60 s | Result/job deleted; delayed browser retrieval becomes unavailable. Short retention is a separate risk from slow proof computation. | [prover/queue.mjs:9](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/queue.mjs:9>) |
| Prover/query incoming HTTP request | 30 s | Incoming body timeout, not asynchronous proof-computation timeout. | [prover/server.mjs:97](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/server.mjs:97>) |
| Prover/query HTTP headers | 10 s | Rejects incomplete headers. | [prover/server.mjs:97](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/server.mjs:97>) |
| Native binary version identification | 10 s | Terminates unsuccessful startup --version subprocess. | [prover/native-binary.mjs:12](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/native-binary.mjs:12>) |
| Query-server upstream Aztec RPC | 10 s per request | Aborts upstream fetch/body. This is shorter than browser private-RPC30s. Includes send methods; missing reply cannot establish transaction failure. | [prover/private-query.mjs:137](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/private-query.mjs:137>) |
| Compact gateway whole request | 10 s | Aborts upstream and destroys incoming request/socket; retains pending work ownership. | [prover/private-query.mjs:345](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/private-query.mjs:345>) |
| Native compact-block response | 10 s | Destroys request/socket; outstanding native work remains owned until settlement. | [prover/compact-block-native.mjs:18](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/prover/compact-block-native.mjs:18>) |
| Public API fresh-snapshot request | 20 s total | Returns503 not-ready while the index can still be catching up. Index work is not detached/cancelled. | [scripts/rolling-public-server.mjs:43](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/scripts/rolling-public-server.mjs:43>) |
| Public-index upstream RPC | 20 s | Aborts HTTP/body; no transport retry. | [scripts/rolling-public-server.mjs:170](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/scripts/rolling-public-server.mjs:170>) |
| Funding POST body upload | 10 s | Destroys incomplete request; upload/resource protection. | [scripts/rolling-public-server.mjs:73](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/scripts/rolling-public-server.mjs:73>) |
| Public-server incoming request / headers | 10 s each | Incoming request limits, not outgoing wallet asset-transfer limits. | [scripts/rolling-public-server.mjs:107](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/scripts/rolling-public-server.mjs:107>) |
| Funding-relay Ethereum RPC | 10 s | Ethers fetch timeout, one attempt, retry disabled. Relay retains uncertain submission identity. | [plugins/operations.mjs:336](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/operations.mjs:336>) |
| Funding relay authorisation admission | Must have >30 s remaining | Rejects a plan too close to its signed deadline before relay payment. | [plugins/rolling-funding-relay.mjs:55](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/rolling-funding-relay.mjs:55>) |
| Bok/moderator authenticated node RPC | 10 s | Aborts fetch/body; Operator RPC unavailable. Shared by hosted Bok and Rolling moderator. | [plugins/operations.mjs:140](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/operations.mjs:140>) |
| Venice model/provider HTTP | 120 s | Aborts chat/catalog/balance/top-up requests including body. Paid call can become transport-unknown. | [plugins/venice.mjs:24](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/venice.mjs:24>) |
| Untrusted generated-code test + build | 45 s shared default/max | Kills guest process group; validation fails. Intentional resource limit; configuration can lower it. | [plugins/isolated-execution.mjs:12](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/isolated-execution.mjs:12>) |
| Generated-code outer container lifecycle | Work budget+15 s =60 s default | Bounds Docker lifecycle, reserves8s cleanup. Failed cleanup blocks later execution. | [plugins/isolated-execution.mjs:165](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/isolated-execution.mjs:165>) |
| Docker control command | 5 s default, also limited by outer deadline | Kills CLI, reports timeout, reconciles daemon-side container state. | [plugins/isolated-execution.mjs:140](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/isolated-execution.mjs:140>) |
| Attached Docker test/build command | Work budget+3 s =48 s default | Kills attached CLI; guest independently has45s total work budget. | [plugins/isolated-execution.mjs:198](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/isolated-execution.mjs:198>) |
| Thread-repository Git operations | 60 s | Terminates/rejects Git subprocess. | [plugins/thread-repositories.mjs:14](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/thread-repositories.mjs:14>) |
| Git clone / sparse checkout / checkout | 60 s each | Terminates/rejects tool subprocess; can interrupt a healthy slow repository operation. | [plugins/github-tools.mjs:24](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/github-tools.mjs:24>) |
| GitHub API tool HTTP | 30 s | Aborts request/body; write is not blindly retried. | [plugins/github-tools.mjs:175](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/github-tools.mjs:175>) |
| GitHub App broker operation session | 120 s aggregate | Further calls denied once multi-request operation budget expires. | [plugins/github-app-broker.mjs:85](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/github-app-broker.mjs:85>) |
| GitHub App broker HTTP call | min(8 s, remaining session time) | Aborts request; independent short nested cutoff. | [plugins/github-app-broker.mjs:87](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/github-app-broker.mjs:87>) |
| Published app external API fetch | 20 s total | Aborts request and cancels body reader. | [plugins/artifact-api.mjs:63](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/artifact-api.mjs:63>) |
| Plugin public metadata HTTP | 10 s | Aborts discovery request. | [plugins/protocol.mjs:53](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/protocol.mjs:53>) |
| Treasury Circle API | 20 s | Aborts request; treasury reconciliation unavailable. | [plugins/treasury.mjs:21](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/treasury.mjs:21>) |
| Moderation model startup | 120 s | Aborts startup/readiness/verification and performs cleanup. | [censor-daemon/daemon.mjs:114](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/daemon.mjs:114>) |
| Moderation model inference client | 120 s default/max | Aborts request and rejects MODEL_TIMEOUT; post remains unresolved. | [censor-daemon/moderation.mjs:6](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/moderation.mjs:6>) |
| Moderation inference proxy whole request | 120 s | Independent second deadline: destroys upstream and returns504; also covers health route. | [censor-daemon/model-runtime-proxy.cjs:19](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime-proxy.cjs:19>) |
| Moderation proxy upstream socket inactivity | 120 s | Destroys inactive upstream socket; separate from total120s deadline. | [censor-daemon/model-runtime-proxy.cjs:33](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime-proxy.cjs:33>) |
| Moderation proxy incoming request / headers | 125 s /10 s | Incoming HTTP protection. | [censor-daemon/model-runtime-proxy.cjs:53](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime-proxy.cjs:53>) |
| Moderation Docker control | 30 s default | Terminates/rejects control command. | [censor-daemon/model-runtime.mjs:13](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime.mjs:13>) |
| Moderation Docker cleanup | 8 s each | Cleanup failure retained on timeout. | [censor-daemon/model-runtime.mjs:112](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime.mjs:112>) |
| Moderation readiness HTTP probe | 1.5 s each | Aborts check; retries every500ms inside outer startup budget. | [censor-daemon/model-runtime.mjs:158](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime.mjs:158>) |
| Moderation model/runtime identity verification | 10 s default | Aborts verification; parent startup signal can replace default. | [censor-daemon/model-runtime.mjs:174](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime.mjs:174>) |
| Model network-isolation probe | 1.2 s socket inactivity | Reports probe unsuccessful; startup check. | [censor-daemon/model-runtime-probe.cjs:10](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/model-runtime-probe.cjs:10>) |
| Moderation job ownership lease | 6 min default; configurable up to15 min | Expired lease invalidates ownership. Signed work enters reconciliation, unsigned leased work can retry. Renewal occurs between stages, so a long proof can outlast ownership. | [censor-daemon/job-store.mjs:25](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/job-store.mjs:25>) |
| Moderation SQLite busy-lock waiting | 1 s | Busy wait then persistence error. | [censor-daemon/job-store.mjs:32](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/job-store.mjs:32>) |
| Native BB socket startup | 60 s SDK backstop | Native process must expose its socket before the backstop.50ms observation cadence; no per-proof timeout in this backend. | [node_modules/@aztec-foundation/bb.js/src/bb_backends/node/native_socket.ts:18](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/node_modules/@aztec-foundation/bb.js/src/bb_backends/node/native_socket.ts:18>) |
| Legacy moderator signer subprocess | 300 s /5 min | Kills subprocess. Production-capable legacy path, not selected by current Rolling adapter. | [censor-daemon/signer.mjs:103](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/signer.mjs:103>) |
| Legacy moderator health public-feed RPC | 5 s override | Transport check in legacy configuration, not current Rolling index path. | [censor-daemon/daemon.mjs:117](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/censor-daemon/daemon.mjs:117>) |
| Bok pre-provider contract-deadline guard | 180 s remaining | Additional deadline-admission guard before provider work; not a timer that kills an admitted call. | [plugins/private-bok-escrow.mjs:212](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/private-bok-escrow.mjs:212>) |

## Backend scheduling, retention and unlimited paths

| Mechanism | Timing / behavior | Source |
|---|---|---|
| Proof queue expiry sweep |1s maintenance cadence; close polls at10ms until worker settles | `prover/queue.mjs:10,16` |
| Query diagnostic suppression / prover rate buckets |60s windows; do not cancel an admitted job | `prover/private-query.mjs:159`; `prover/server.mjs:35` |
| Public-index idle polling |1s default, configurable100ms–30s. Catch-up steps continue immediately; no whole catch-up deadline | `scripts/rolling-public-server.mjs:13,31` |
| Funding HTTP rate window |60s; more than60 requests returns429 | `scripts/rolling-public-server.mjs:63` |
| Hosted Bok discovery polling |2s default; no overlapping cycles and no whole-agent time limit | `plugins/escrow-service.mjs:91,170` |
| Moderation retry eligibility |30s default, configurable up to1h; does not kill current work | `censor-daemon/job-store.mjs:25,145` |
| Moderation polling |30s default, configurable1s–1h; shutdown interrupts delay | `censor-daemon/daemon.mjs:73,127` |
| Moderation stale-health warning |90s default; max(3×poll interval,60s); diagnostic only | `censor-daemon/daemon.mjs:123`; `health.mjs:26` |
| Moderation on-chain deadline warning |300s lead time; diagnostic only | `censor-daemon/health.mjs:26` |
| Direct Bok transaction finality |Native timeout:0; receipt-driven, subject to individual RPC errors | `plugins/private-bok-escrow.mjs:193` |
| Direct Bok and moderator proving |No enclosing application proof deadline. They do not use the hosted120s worker; moderation lease still applies | `plugins/private-bok-escrow.mjs:236`; `censor-daemon/rolling-adapter.mjs:177` |
| Bok whole agent run |No overall elapsed deadline; individual call limits and token/call-count budgets apply | `plugins/main.mjs:354`; `plugins/agent.mjs` |
| Bok process ownership lock |No age-based expiry or automatic takeover | `plugins/main.mjs:79` |
| Wallet assets/CRS server response |No app-level elapsed response deadline; bytes owned until finish/close/error. Network/proxy limits still apply | `apps/rolling/start.mjs:44,91` |

For HTTP servers that leave defaults untouched, the pinned Node24.21.0 runtime was checked directly: incoming request300s, headers60s, keepalive5s plus1s buffer, socket inactivity timeout0, and connection-timeout checking every30s. Prover/public/moderation servers override the values listed above. These request limits do not mean a handler has300s to finish an asynchronous job.

## Priority findings

1. The20s Ethereum mining wait is a confirmed flow defect. It shares a budget with earlier network reads and reports recovery-required for normal pending inclusion.
2. Live funding also expires bridge delivery and private-claim waiting after120s. The private journal's separate540s completion deadline remains elsewhere.
3. Deployment verification can call a slow but valid deployment **invalid** after20s. Similar whole-sequence budgets exist in preferences and page restoration.
4. The hosted proof worker is forcibly killed after120s, independently of the browser's30min allowance; finished proof results are retained for only60s. These need a coherent job lifecycle.
5. Model calls have120s cutoffs; moderation duplicates that limit in its client and proxy and has a separate6min ownership lease. Review each as computation/ownership policy rather than blindly increasing every number.
6. Ordinary HTTP body/header limits, untrusted-code resource budgets, signature expiry, and idle-connection cleanup are legitimate categories. Their expiry must be reported accurately and must not be confused with a failed on-chain transaction.

The account-flow edits remain local. This audit did not publish software, change services, recover the owner's transaction, or remove any of these other limits.
