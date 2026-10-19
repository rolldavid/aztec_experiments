# Rolling Chat engineering candidate — 19 October 2026

Implementation is connected; final acceptance is in progress. Integrated source is `6382a97017b2cf4a33ae1c133194c7ca4515f085` on `codex/rolling-chat-draft3` ([PR8](https://github.com/zac-williamson/aztec_experiments/pull/8)). The live application is `bbcf43dc9fb3603343e2e3a717d8184d027cef61`; the integrated SDK edge-cache change is not published. [Content provenance](artifact-manifest.json) records application, build and separately admitted service versions without pretending they are one revision.

## Use the application

- [Public testnet application](https://d30njln0kead8n.cloudfront.net/#/home): browse without a wallet. [Quiet Garden](https://d30njln0kead8n.cloudfront.net/#/board/16531251284017372607999499758343293895515598907671524799007971503298483300712) contains the confirmed Sage Reed conversation.
- [Local native devnet](http://127.0.0.1:8080/#/home): separate disposable balances, native node/PXE proof flags disabled. Demo Willow and Demo Cedar contain actual contract-backed conversations. Port4317 is the design fixture, not the connected application.
- The separate [Bok artifact origin](https://dy2q03rao3se7.cloudfront.net/) is configured; current-testnet generated-page acceptance is still pending.

Open Account and choose **Create account and download recovery**, or **Import recovery** for an existing account. Creating an account does not fund it. Preserve the encrypted file and password, and connect the original Ethereum wallet when the application requests it. Existing interrupted payments must resume from their saved records, not a new account or another payment.

For a fresh checkout use [BUILDING](../../BUILDING.md), [native startup and recovery](../../docs/rolling-deployment.md#access-and-resume-the-local-application), [application configuration](../../apps/rolling/README.md) and [Bok operation](../../plugins/DEPLOYMENT.md). Local startup uses the documented runner and generated artifacts; generated binaries and private deployment files are intentionally outside Git. Reuse a healthy development node and native mining/settlement. Frontend edits do not require chain redeployment.

## Completed functionality and remaining observations

[Feature status](../feature-status.md) describes connected product behavior. The [46-row requirement disposition](final-requirement-disposition.json) links byte-preserved evidence with its original source/environment limits. No whole-spec completion percentage is claimed.

Both genuine MetaMask and Phantom zero-ETH USDC payments and private claims succeeded. Names, a subboard, named/anonymous posts and a cross-account like are confirmed. Both original collateral refunds returned exactly0.001ETH and finalized; MetaMask’s failed wallet-wrapped transaction has separate gas accounting. Ten useful real proofs took18.794–33.565seconds, median25.142seconds.

Both subsequent ETH payments also succeeded, each allocating0.001ETH collateral,2FEE and0.1USDC. Their private claims remain pending while the common native simulation failure is diagnosed. Preserve Phantom’s original before-ack interruption and MetaMask’s paid-pending recovery. No original payment is replayed.

The original Bok response was charged5664microUSDC but lost before publication. Its original accounting is now closed:250000microUSDC budget=5664charged+244336returned, reserved0. The lost output is unavailable and the model call is never replayed. A new ordinary request must still demonstrate reply, generated page, source download and accounting together; Bok withdrawal and complete fee accounting remain.

Retain the completed scoped recovery, archive/key reconstruction/reorg, model/repository/failure and layered capacity observations. Do not repeat those campaigns. Remaining measurements concern complete cold/warm wallet readiness and any absent final index freshness observation. Accessibility requirements and the fixed14-day soak were removed by the owner; bounded reliability remains. Never enable VoiceOver.

## Hosting and precise resume entry

The paid host stops **2026-10-19T18:00:00Z**; management endpoints are removed at18:05. Both attached volumes delete on termination. ForecastUSD359.850284 and reservationUSD365 are within the owner-authorized cumulativeUSD500 ceiling. This temporary preview is not indefinite hosting.

The operator retains the private campaign at `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-final-20261018-c71ecfaa7e/`. Do not commit or expose its keys or journals. Historical08:45/10:45export packets must not run against the extended deadline. A final quiet-state encrypted export is still required; preparation is not backup completion.

Resume the sole lead with these instructions:

1. Read this page, the [owner clarifications](../specification-clarifications.md) and [requirement disposition](final-requirement-disposition.json). Reconcile the actual application/service revisions, shutdown controls and original browser/journal state before changing anything.
2. Continue the original Phantom ETH transaction `0x808d30914c53b90c84158ca511df84c564c123b751482ee9e9b67fae4a8bdc00` and MetaMask ETH transaction `0x73520e90bdc7af48c8102b9f73224eb5354b46fcdcd35a289857640c3429f154` through their saved private claims. Diagnose the existing simulation failure at its component boundary; do not resend Ethereum funding.
3. After collateral is restored, complete one new ordinary Bok output/withdrawal journey. Retain the prior accounting-only closure and do not repeat its paid call. Finish only the outstanding disposition items, then capture the quiet-state export and final delivery revision.

If the host has expired, use the recovery runbooks and retained private export; do not interpret dead URLs as lost transaction identity or provision paid capacity without fresh budget reconciliation. Public chain data can be resynced; private financial/model journals and account keys cannot be recreated from it.

Specialist auditX1 and target-network release clearanceX2 remain external release gates. Delivery deadline2026-10-21T15:25:57Z does not extend the paid-host cutoff. No production/mainnet release is claimed.
