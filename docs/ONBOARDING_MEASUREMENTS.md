# Measured onboarding, 25 October 2026

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
