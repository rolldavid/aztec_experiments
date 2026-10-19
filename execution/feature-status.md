# Rolling Chat — functional delivery

Application source: `f3e23bf4a09ac6350ea2add12feb47b475a427a3` ([PR 8](https://github.com/zac-williamson/aztec_experiments/pull/8)). The public browser uses reviewed `34cc7252` assets. The moderator now runs the exact reviewed `f3e23bf4` daemon/adapter overlay over its `34cc7252` base.

[Open the application](https://d30njln0kead8n.cloudfront.net/#/home).

## Implemented functionality

| Area | Working behavior | Evidence or current limit |
| --- | --- | --- |
| Conversations | Boards, threads, named and anonymous posts, replies, quotes, reposts, likes, search and navigation | Connected local journeys and actual testnet posts/replies/like; component evidence for remaining social cases |
| Accounts | Private accounts, names and profiles, avatars, bookmarks, follows, subscriptions and read markers | Two-account private recovery and public-reader observations; specialist privacy assurance remains external |
| Funding | MetaMask and Phantom, both zero-ETH USDC and ETH funding routes, private claims | Both genuine wallets completed both routes |
| Withdrawals | Collateral refunds and unused Bok credit withdrawal | Both original collateral refunds and Phantom's Bok-credit withdrawal completed; no payments repeated |
| Boards and moderation | Subboards, effective-rule consent, manual removal, authority transfer, collateral accounting and automated policy evaluation | Current isolated model evaluated five human posts and Bok's authenticated reply. All were allowed; this is not evidence of a current testnet removal |
| Bok | Separate funded plugin identity, model calls, source generation, isolated tests/build, published page/source, authenticated board reply, exact charge and refund | Original request completed. One generated-test identifier was corrected by the operator, explicitly recorded. New requests are paused while the Bok server is stopped |
| Generated pages | Stable latest and revision URLs, matching source downloads, separate origin | Five exact routes now use private static storage independently of temporary compute |
| Deployment and recovery | Native proof-disabled development, real testnet wallet/proof operation, clean independent deployment, core/archive/key reconstruction, reorg and Bok recovery | Existing scoped exercises retained; final current-state handover being closed |

## Actual Bok result

[Authenticated reply](https://d30njln0kead8n.cloudfront.net/#/thread/15660648287099192392566570599913171983157817601529053133981747474837257128506) · [Working page](https://dy2q03rao3se7.cloudfront.net/t/54f74bcaa3f0f1a59b0358a11dd85dcb885bf5aaec7f26e23b6c81c56db3ca1d/latest/) · [Source download](https://dy2q03rao3se7.cloudfront.net/t/54f74bcaa3f0f1a59b0358a11dd85dcb885bf5aaec7f26e23b6c81c56db3ca1d/source.json).

The generated Quiet Garden page cycles through three prompts and wraps. Its original HTML, build and package were retained. The generated test referred to `nextBtn` instead of the actual `btnEl` binding; the one-line operator correction was independently reviewed. No model call was replayed.

Request `0cc4` completed all eight paid calls. Reply `226ef5d6` was included at checkpoint 8960 and displayed as authenticated Bok. Finish `0d2aaa36` was included at 8961: **0.013944 USDC charged and 0.236056 USDC refunded** from its 0.25 USDC budget, with nothing reserved or available left. Earlier unsuccessful requests remain recorded as unsuccessful.

## Work being closed

The moderator's configured 2 FEE ceiling was below the native SDK's current 13.923754 FEE maximum. Its existing funded balance is 39.965588 FEE. The ceiling is corrected to 20 FEE, retaining the spending guard. The app and moderator are restored after the final core checkpoint; the moderator is reauthenticating retained public history with its reviewed catch-up fix. This is configuration repair, without a new model or transaction campaign.

Final handover binds the actual deployed versions, preserved state, service availability and requirement evidence. The [46-row requirement map](release/final-requirement-disposition.json) retains evidence scopes and limitations; there is no invented whole-spec completion percentage. Independent review found no additional concrete user-facing feature gap beyond these closure tasks. Specialist security/privacy audit and network release clearance remain separate external gates.

## Availability and cost

The generated page and source remain available through private static storage. Bok compute was stopped at 21:09 UTC after its encrypted state was preserved, to avoid idle charges. **New Bok requests are not currently processed.** The saved resume procedure restores its original account, journals, live origin and sole writer.

The core host has independent termination at **03:00 UTC on 20 October**, with management endpoint cleanup at 03:05. The full conservative forecast is **USD 479.248472398**, with USD 480 reserved under the owner's cumulative USD 500 ceiling. These are forecast figures, not actual spending. Retained storage, cleanup buffers and a USD 20 forecast allowance for twelve months of static delivery are included; that allowance is not unlimited hosting or a hard traffic cap.

Ordinary transactions now advance on canonical Aztec checkpoint inclusion or mined Ethereum receipts. Actual bridge consumability and Outbox readiness remain necessary. No extra full-finality gate is imposed. Native development/PXE proof flags remain disabled; real proofs are reserved for testnet acceptance.

Accessibility qualification and the fixed fourteen-day soak were removed by the owner. Bounded final reliability evidence remains. The delivery deadline is 21 October at 15:25:57 UTC; it does not extend paid hosting.
