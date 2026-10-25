# Measured onboarding, 25 October 2026

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
