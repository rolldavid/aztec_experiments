## Published f986 startup and a75 posting observations

Source `f9865f2dab7fec077a5661b6b652a6f3a2806195` is live and pushed to master and both application branches. Static publication succeeded without service restart. Native Board/FPC class preparation now starts during public startup, before Ethereum sign-in.

| Normal funded opening | Wallet selection → enabled Write a post | Account button → same endpoint |
|---|---:|---:|
| First worker after latest real post | 5.224140s | 6.199870s |
| Repeat | 3.271045s | 4.562235s |
| Instrumented repeat | 5.065945s | 6.283190s |

Same disposable test account5 and normal wallet-selection path; no explicit new-test-account shortcut. Automatic signature approval is included. Repeat2 retains endpoint evidence but no worker spans because route normalization removed the profile flag before reload. These runs do not meet2s. First run registration643ms versus a75 repeat1353ms; native class prewarm is reused. Residual artifact serialization/storage remains. Third run public deployment3072ms and fresh sync1163ms explain substantial variability; do not attribute all elapsed differences to the code change.

On published a75, ordinary135-character Post took **13.992905s from click to visible included feed row and closed composer**. Native receipt: transaction `0x213d0ffed8de96dc3431df77b5c0909310c559c16a2b918171d5fc12ae5f97bb`, block5247, block hash `0x0876878e1cee7ca051b86761e09df985c32e89ad2a330025c06f8f085105bf19`. Initial visible confirmation was pending; it subsequently became confirmed automatically. This single observation meets15s, not a guaranteed latency ceiling.

Raw evidence: `funded-opening-f986-run{1,2,3}.json` and `post-a75.json` in the current G21 other-transaction-latency directory. No new Ethereum funding was measured in this batch.

## Published startup and transaction reads — a75bd5b7

Live UI/source `a75bd5b74094c7d6680c1ea9966246dec9671b0d`, pushed to default master and both app branches. Main browser SDK8,385,064 bytes (previous~16.6MB); six immutable native artifacts independently integrity-checked/cached, published testnet registration metadata removes repeated immutable registration reads, current native node/transaction authority remains. Like/Unlike/Name overlap independent discovery/predecessor work with exact operation/barrier captured before waiting;676 application/wrapper checks passed after race/standalone lifecycle corrections. Startup80 and inclusion27 checks plus actual worker evaluation pass. No app/proxy restart, no new infra/dependency copies; transfer archive/version cleaned.

Earlier0d23post remains finalized in block5072. Its test identity5 opens funded and supplies the new measurement fixture; rolled-back identity6 is not reused as funded. Both immediate openings below select the normal wallet as soon as visible, with automated personal_sign approval included.

| Actual endpoint | Milliseconds |
|---|---:|
| Wallet click→readyWrite, first changed SDK/assets |7916.935|
| Wallet click→readyWrite, cached repeat |3556.530|
| Account button→readyWrite, cached repeat |4965.470|
| Create name→included new owned Swift Wren selected |17543.705|
| Second Like click→included visible count1 |12547.165|

Earlier8ae opening10.753s/6.322s used a different now-pruned account; these are observed improvements, not controlled attribution. Name baseline106.844s had same selectable-name endpoint; Like baseline56.933s was canonical action return while this12.547s includes visible count. Both latest observations are below half those historical values, but no all-flow/reliability claim. Raw files carry source, click origins, exact public inclusion anchors and timing spans. Name tx0x23ec385c03a7565fbf9239035b237df866dcd768a7c3b61d1934745ddba31ab5 at block5243 hash0x04829178e59d19e46a4ee4833b012f0676896dbf7d9de5a7cdf98f5435f2cbee; Like tx0x2ee53e57bd79a397e78c7fa7ec738691a6b6472390a4a62dd0a3d46399805f2a at block5244 hash0x04226fcd17761d1c4d47b86fb9f080fcfe2b5b8e6a3dfb94f08d2e10a00084cc. Endpoints were proposed inclusion, not finality; UI automatically updates confirmation separately.

First Like completed its action in~17.345s with native inclusion17.065s, but its visible endpoint observer incorrectly required word boundaries in concatenated DOM text. The inclusion evidence WAS present; there was no runtime telemetry defect. Preserve like-a75-partial.json as incomplete visible-endpoint evidence. Corrected second observer matches literal leaf text and captured12.547s normally.

Warm opening still spends1176.7ms Board class derivation +159.7ms FPC derivation after sign-in (private session1540.8ms). Reviewed next worker-only fix starts the same native memo derivation on exact authenticated artifacts during page-load public preparation; keeps independent deployment/PXE/funding branches running and drains all work. Seven focused checks and worker bundle evaluation pass; not yet measured.2s opening and all-flow50% remain open.

## Latest publication and failed measurement — d20794f6

Published UI/source `d20794f6eaf078439857eff9a4ef214f781b14c2`; pushed to master and both application branches. Composer-only change removes checkpoint-triggered restarts and cancels future advisory preparation phases while draining any active native phase. SDK bytes unchanged. No app or proxy restart. Seventy-four focused checks and the actual worker evaluation build gate passed. Publication is not a successful latency measurement.

The next real browser run failed: account opening spent24.053s in shared deployment preparation, including21.758s in node readiness. The reader request failed after20.003s concurrently. Do not add overlapping spans. Public query returned503 after10.617s; service monitor independently recorded degraded query/prover readiness19:24:23–19:25:45 UTC, healthy19:23:42 and19:26:15. Services did not restart, disk had12GBfree, and local node metadata reads later returned in60ms. Exact failure cause is not retained: query diagnostics were not wired and native node logging was disabled.

After recovery, the previous8ae post receipt0x198a3749ddc168188ef8c9c50d5270f95603737be734b866efb3afc192ad0024 and fb619 post receipt0x146f2bd0f01d5793722a6bb2012305e31496f5542562e99c08f1b754ebf3c1de both reported dropped. Native dropped means no archived effect or known pool entry, not proof of a reorg. Earlier browser evidence records actual included feed rendering and subsequent native proposed receipt/completed submission, but omitted the inclusion block/hash. Consequently their timings describe observed inclusion then, not durable present inclusion. Future real-run evidence must retain that public anchor.

For a separate new-test attempt, only the disposable IndexedDB transaction journal was cleared after signing out; native PXE/account identity remained. Subsequent opening reached Set up posting with insufficient ETH, so no new payment or post was submitted. This changed fixture cannot be compared with the earlier funded opening. No d207 posting or two-second-opening success is claimed. Raw failed-run files: funded-opening-d207-failed.json and d207-after-test-journal-clear.json. Targets remain open.

# Measured onboarding, 25 October 2026

Off-chain bookmark: click→usable Unbookmark control11.660ms on8ae95. This measures local UI readiness, not remote encrypted-preference replication durability; no blockchain transaction. Raw evidence`bookmark-8ae95.json`.

## Immediate funded opening and delayed composition — 26 October,8ae95b3d

Published source `8ae95b3d839caf7293c0aff4ab0031d0dacec552`. This run selects the test wallet as soon as its control appears after reload, removing the earlier harness pause before selection. It reopens the now-funded account; this is a different state from the preceding unfunded payment quote. Automatic signature approval included.

| Interval | Observed |
| --- | ---: |
| Wallet→readyWrite; new SDK download |10.753415s|
| Wallet→readyWrite; cached SDK, immediate selection |6.321715s|
| Post→actual included feed text visible after composition pause |18.177735s|

First funded run: wallet→worker initialization2.298s, deployment3.135s, native session0.919s, sync1.511s, account workflow/discovery/fee-note readiness2.879s plus small handoffs. Main SDK resource was4.183s, partly beforewallet selection. Repeat native ACVM cache hit:3,634,847bytes, cached response ready0.96ms, resource duration418.98ms; ABI968,847bytes, cache ready0.79ms, total16.9ms. These resource durations are not pure network time.

Post preparation overlap works: actual action.prepare1.767960s, compared with3.295275s onfb619. However the click first awaited3.052770s of an already-running composer.prepare job; actualaction started3.056250s afterclick. The composer job began580.735ms beforeclick and lasted3.633505s. It includes1.130965s speculative posting-witness work; actualaction then separately synchronizes/selects current state. Publiccheckpoint callbacks can restart that full prewarm during editing. Removing those unnecessary restarts and cooperative supersession are assigned; this observation alone does not identify which trigger started that particular job.

Actual action: sync945.560ms; fresh contractstate483.045ms overlaps predecessor791.930ms; arguments20.950ms. Witness/proof/validation8.543055s, submission500.580ms. The exact included feed rendered4.216415s after submission ended; the native receipt callback arrived75.380ms later (its inclusion span4.291795s), so the supplemental completed-spans file preserves that late timing without changing the click→visible endpoint. This is not an optimistic local post. Target15s and opening2s remain unmet.

Aztec transaction `0x198a3749ddc168188ef8c9c50d5270f95603737be734b866efb3afc192ad0024`; post9453107015421205539432382005679159514372738386618680088706709912061351820688. Raw files:`funded-opening-8ae95-run1.json`,`funded-opening-8ae95-run2.json`,`post-8ae95.json`,`post-8ae95-completed-spans.json` under the same evidence directory.

Integrated focused checks:256post path,148claim qualification,51diagnostics,9funding/lifecycle; SDK and six-script actual-worker evaluation passed. Published changes preserve native/current authorization, overlap independent reads, reuse operation-owned immutable funding observations, and retain128individual resource records. All7core service PIDs unchanged; no contract/dependency redeployment. Fresh Ethereum claim after this batch has not yet been remeasured; precedingfb619signup is not evidence of this batch's claim speedup.


## Published measurement — 26 October, fb61925c

UI/source `fb61925ce5d926c551f710c3ed0914ee4e4db3af`, actual existing IAB tab, Sepolia11155111/stable6, same Ethereum disposable test wallet. Automatic signature/payment approvals included; human MetaMask dwell is not measured. Normal signed-out account opening; no new-test shortcut in either timed opening. A fresh unfunded identity was selected before those runs. No mainnet funds.

| Measured interval | Actual time | Prior comparable observation |
| --- | ---: | ---: |
| Wallet selection → rendered enabled payment; first visit to this new asset version | 7.879700s | No matching cold-asset baseline |
| Wallet selection → rendered enabled payment; repeat visit | 3.256300s | 6.623745–6.832120s on0d23 |
| Confirm payment → rendered enabled Write a post | 58.075380s | 52.501800s on0d23 |
| Post click → actual Aztec inclusion and rendered feed text, composer closed | 19.919695s | 15.703535s on0d23 |

The2s opening/15s posting/all-flow50% goals remain unmet. Do not call a faster subsection a completed end-to-end result. Cold and repeat visits are distinct: SDK resource download was7.076455s on first load and50.465ms on repeat, both before wallet selection; their effect on remaining background preparation differs. Worker execution-engine initialization was3.667860s first load and649.200ms repeat. The current instrumentation retains only the final resource per endpoint, so it cannot establish individual WASM transfer timings; the next reviewed diagnostics change preserves bounded individual records.

Repeat opening: wallet identity/handoff261.585ms; private session916.100ms; native synchronization1436.970ms; signing capsule5.855ms; status400.285ms; other handoffs/render235.505ms. Quote work overlaps synchronization. This is a working enabled payment, not the earlier94f insufficient-test-funds refusal. The latter is retained only as failed-fixture evidence. A same-wallet sale of existing public test FEE restored sufficient test ETH before timed successful runs; no application quote/balance guard was bypassed.

Signup sequential breakdown: payment preparation/automated approvals/submission8.080580s; Ethereum receipt/effect observation9.923415s; account status0.631050s; bridge readiness4.074190s; claim preparation6.819185s; claim submission/completion23.151280s; subsequent claim completion2.256065s; final account readiness3.122495s; small handoffs0.017120s. The23.151280s stage includes10.192545s witness/proof/public validation,0.468180s Aztec submission and9.807800s inclusion, plus fee preparation/completion. Do not add nested values twice. The stage named `checkpoint` is application claim completion; its label alone does not establish protocol checkpoint waiting. Automatic payment approvals total1.418255s. One Ethereum payment and one combined Aztec claim succeeded.

Post sequential breakdown: preparation3.295275s; witness/proof/public validation8.638275s; submission0.481755s; actual inclusion6.894695s; other handoffs/render0.609695s. Preparation includes1.666760s synchronization,0.864630s contract-state discovery,0.410345s predecessor check and0.346845s arguments/screening. Private witness519.765ms, kernel witness1553.250ms, public validation472.875ms; remote native proving3036.734ms and browser proof verification1022.180ms are nested within proof work. Composer preparation→Post dwell was~14.9s, versus~1.5s in0d23; a changed anchor required fresh discovery/public reads. This is a real user-path cost, not yet a proven source regression or a reason to use stale notes.

Additional actual inline-like run: click→inclusion42.712230s; click→visible count1 at43.075745s. Preparation3.287285s, witness/proof/validation7.109750s, submission0.474820s, Aztec inclusion wait31.721330s. This observation does not satisfy50% reduction against56.933s historical like baseline. Count observer was installed before completion, and required the actual native inclusion timing before recording the visible count. Raw evidence `like-fb619.json`.

Actual inline name registration: Create name→included19.763115s, →new owned name selected in main-page dropdown23.029425s. This is below half the historical100.169/106.844s name-registration observations, with different network timing and account fixtures. It does not establish the all-flow goal. Raw evidence `name-fb619.json`.

Ethereum payment `0x26be905fc85dc3fbc5e9454a63f4a6f89efb7570e3c261edc4b6ea4e6434b77d`. First-post Aztec transaction `0x146f2bd0f01d5793722a6bb2012305e31496f5542562e99c08f1b754ebf3c1de`; post12989333108932377010284770371603363687366455205055702651248492234388637844523. The feed displayed the actual included post with confirmation pending; it was not an optimistic local insertion.

Raw numeric evidence: `execution/evidence/G21/stable6/other-transaction-latency/{normal-unfunded-fb619-run1,normal-unfunded-fb619-run2,signup-fb619,fresh-post-fb619}.json`.


Published UI/source0d23da655729212fa2fa3821ce729b943f28c33c. Real existing IAB tab, normal signed-out path, selected disposable unfunded Aztec identity, automated Sepolia wallet. Timers capture clicks and first animation-frame render; later tool inspection does not extend the result. No explicit new-test shortcut during the measured opens. Prior unsigned quote state retained, so speculative construction for an entirely empty local journal was not exercised.

| Actual interval | Run1 | Run2 |
|---|---:|---:|
| Wallet selection → enabled payment button |6.832s|6.624s|
| Included test signature approval |0.006s|0.006s|
| Previous33b same normal endpoint |8.954s|9.103s|

Neither run meets2seconds. The previous1.729s shortcut was not normal-flow acceptance. The20.476s prior observation began at navigation with a newly downloaded SDK; it is not the same interval. These runs use existing browser storage, not an empty browser, and an automated test wallet rather than human MetaMask interaction.

Second-run critical path, rounded:

| Work | Seconds |
|---|---:|
| Signature/account derivation and handoff before private session |0.293|
| Native private wallet creation |1.685|
| Account/contract registration and remaining session initialization |0.954|
| Account synchronization |1.425|
| Native Board note discovery and deposit-ID read |1.134|
| Payment qualification, nonce, quote and rendering |1.121|
| Small intervening handoffs/capsule setup |0.011|
| Total |6.624|

Independent allocation reads overlap synchronization and are not added twice. Discovery spans include native queueing. The read-only quote overlap does not run for existing unsigned stored quote records; no speedup is attributed to that branch here.

## Full real signup

Confirm payment→enabled rendered Write a post:52501.800ms. Automatic wallet approvals1312.565ms included. Ethereum transaction0x8fe1273c800e4f5fa0c74bd04e2d8a8aa9291f783ee242250db24710b04dde46. One Ethereum payment and one combined Aztec claim; usable notes were found before the ready screen. No epoch/proven-chain wait was used.

| Sequential elapsed section | Seconds |
|---|---:|
| Payment preparation, approvals and submission before receipt processing |7.449|
| Ethereum receipt/effect verification |5.796|
| Claim account-state check |0.670|
| Bridge-message readiness |4.186|
| Claim preparation |7.170|
| Fee setup, witness/proof, submission, inclusion and immediate completion |20.093|
| Subsequent claim-completion verification |2.807|
| Final account refresh and ready-screen render |4.324|
| Small handoffs |0.007|
| Total |52.502|

Nested within claim submission: proving13.121s, Aztec submission1.035s, Aztec inclusion3.057s. These nested values are not additional rows in the sequential sum. The stage historically named funding-claim.checkpoint is reported here as completion verification; its code path must be inspected before attributing it to a specific protocol wait.

First post from the new balance succeeded:15703.535ms click→actual included feed render with composer closed.135characters, transaction0x06d55549b622002d9f7a57148ebad093527ae9c126508bf1c9c91238361c5e57. Rendered with confirmation pending. This is above15seconds and does not re-establish the historical11.095/11.894s results for the current release.

## Regression and prevention

Intermediate deacc publication failed before opening a native account: ContractClassPublicSchema was undefined during bundle evaluation. The newly added trusted-private-node import in the cache injected into native contract-class code formed a circular module dependency. Source tests and successful compilation missed it.0d23 moves snapshot provenance to a dependency-free module, retaining exact-node WeakMap and detached-value semantics. The new wallet-build gate executes the six actual hash-verified worker scripts in order before publishing. It rejects the actual bad bundle and passes the corrected one; it is a bundle-evaluation check, not a substitute for initialized browser/transaction testing.

Three next lanes remain active: native pre-signature PXE preparation, synchronization/discovery critical path, and unnecessary post-inclusion signup completion work. No2s,15s or all-flow50% completion claim.
