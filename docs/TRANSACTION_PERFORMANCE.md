# Transaction performance beyond ordinary posting

Active owner goal, 25 October 2026: reduce end-to-end time by at least 50% for every other application transaction flow. This is an acceptance target, not a completed result.

## Measurement contract

Baseline UI: `74c2142c08b6a9cdeabefe6e46ebfa5ec4578836`. Baseline source: `ac27cc2bbc70e4302be4468e6a398dadd40ab270`. Hosted Bok still uses its independently recorded service release. Do not compare against historical releases as if they were this baseline.

Record click, preparation, fee work, private execution, kernel witness construction, public validation, proof transport/native proving, submission, actual Aztec inclusion, rendered effect, checkpoint, and required private-state refresh separately. Ethereum flows additionally record wallet response time, mined receipt and bridge-message usability. Withdrawal availability depends on native cooldown and proven Outbox membership; report these waits explicitly.

An earlier pending display does not establish faster canonical settlement or spendable funds. A trace ending at inclusion cannot establish completion of a bridge claim. Match action shape, payload size, credit availability, account readiness and note fragmentation. Preserve unsuccessful and slow runs. Repeat comparisons across network inclusion phases.

## Coverage

| Family | Branches to qualify | Transactions and required endpoint |
|---|---|---|
| Ordinary variants | Named posts, replies, quotes, reposts; main/subboard | One Aztec transaction; included visible post and checkpoint. Main-board paths already share the optimized post implementation. |
| Reactions | Like, unlike | One Aztec transaction; included public count and checkpoint/account availability. |
| Preferences | Bookmark, follow board, follow name, thread subscription, reply notifications; both toggle directions | One Aztec transaction; pending feedback, then canonical private preference. |
| Read state | Mark thread read | One Aztec transaction; canonical private marker with exact acknowledged block. |
| Identity/profile | Register name; set/clear bio and avatar | One Aztec transaction; included feedback, canonical profile and usable selected name. |
| Boards/admin | Create subboard, remove post/avatar, reject board, transfer moderator, main policy | One Aztec transaction each; exact target/policy authority and included/canonical effects. |
| Signup ETH | New account with combined collateral and fee claim | One typed consent, one Ethereum transaction, one combined Aztec claim; account ready to post. |
| Signup USDC | Relayed combined funding | Two typed signatures, one relayed Ethereum transaction, one combined Aztec claim; account ready to post. |
| Posting credit | Direct token top-up, approval present/absent | Optional approval plus Ethereum deposit and Aztec claim; available credit. |
| Bok credit | ETH atomic swap/deposit; direct USDC, approval present/absent | One ETH purchase or optional token approval plus deposit, then Aztec claim; available credit. |
| Collateral cancellation/refund | Stuck funding deposit | Ethereum refund request, Aztec cancellation, Ethereum refund; mined refund. |
| Collateral withdrawal | No screening and required-screening cases | Optional screening transactions, Aztec withdrawal, proven Outbox and Ethereum withdrawal. |
| Bok withdrawal | Owner withdrawal | Aztec withdrawal, proven Outbox and Ethereum withdrawal. |
| Bok request lifecycle | Request/post, cancel, expire; normal reply and failed-provider reconciliation | Request/post atomic; normal reply settles/publishes/finishes atomically. Genuine uncertain provider outcomes remain distinct. |
| Automatic moderation | Inference, removal, backlog catch-up | Measured inference and exact-authority transaction; included/canonical flag. |
| Operator setup | Fee claim, escrow deployment/binding/registration, L1 deployment/activation | Separate infrequent operations; no invented user-flow baseline. |

Detailed everyday inventory: `execution/evidence/G21/stable6/other-transaction-latency/everyday-flow-inventory.json`.

## Current-release observations

| Baseline action | Actual inclusion | Effect | Canonical action returned | Qualification |
|---|---:|---:|---:|---|
| Like | 13.672 s | 14.135 s visible frame | 56.933 s | Public feed already renders the included like while the account lease continues. Full account refresh continued after canonical return. |
| Bookmark | 13.417 s | 58.718 s DOM update | 58.264 s | Target was outside the viewport when the label changed; this is not a qualified visible-frame timing. |
| Register name | 15.479 s | 106.844 s selectable, visible | 100.169 s | The required account/name refresh added another6.675s after canonical return. |

These are single baseline observations, not medians. Evidence contains exact click origins and scoped timing spans. Never sum nested SDK/native spans into end-to-end time. The generic confirming span currently includes observer lifetime and can finish after the canonical action; use the action promise/receipt boundaries, not its label, until corrected.

## First implementation batch

- Preference reads reuse one validated head only within the same held, synchronized operation and exact PXE anchor. Different operation, account, wallet, node or anchor cannot reuse it. Normal proof guards retain journal/epoch/identity checks without synchronizing the same snapshot repeatedly. Read-marker canonical block checks and interrupted-flow checks remain fresh.
- ETH/USDC quote metadata reads share their captured Ethereum block and run in drained parallel waves. Dependent asset quotes overlap. ETH confirmation removes one duplicate simulation and its six surrounding network checks; the final exact signed-request simulation still runs before journal/send.
- Moderator authority reads overlap at exact captured anchors, retaining both pre/post-proof checks and final canonical fences. Deadline reads use batches of eight. Catch-up skips idle sleeping only after verified progress with remaining work.

- Generic fee estimation reuses the node limits already verified during payment preparation, removing another readiness RPC without changing native admission.
- Native account/Board/FPC preparation now covers14 explicitly qualified Board methods using their actual registered selectors. It reuses the existing anchor-scoped native caches, never ordinary-post gas or history assumptions.
- Top-up journal reads reuse scope only within their held operation; fresh payment boundaries still requalify mutable portal/network state. Withdrawal confirmation reuses exact immutable effect/path bytes with a fresh final receipt/header/network fence, removing7RPCs.
- Immediate actions display exact included receipts, keep private preferences canonical, and avoid unrelated Bok/account reads on the completion path. Confirmation timing now ends before UI refresh.

First batch041a624b is published and public asset hashes verified. No50% end-to-end claim has been established; matched after measurements remain required.

Second reviewed source batch removes discarded review simulation for subboard/admin actions and Aztec exit preparation, retaining explicit moderator-transfer consent and exact withdrawal recipients. Current refund intent remains until actual Ethereum completion. Integrated891/891 tests passed. Same-operation bridge evidence and fee preparation reuse passed535/535 integrated tests; canonical L1/L2 receipts, anchors, current FPC identity and native admission remain fresh. Bok atomic finalization reuses its own exact authenticated terminal result, avoiding a second27-RPC inspection; uncertain/restored outcomes still inspect. These second-batch changes are not yet published.

Bok ETH funding baseline: one$1 test purchase, one Ethereum transaction and one Aztec claim. Bridge-ready UI91.684s from Pay; claim arguments9.484s, private execution5.292s, proof transport/native proving4.105s, submission0.400s, inclusion2.816s after submission. Account-ready UI165.094s from Pay. Initial wallet-adapter handling includes unmeasured tool-scheduling dwell, so total is observational and not a clean matched speedup denominator. No second payment was sent. Funded balance1USDC was verified on the main page.

Generic immediate actions now start unchanged fee preparation alongside their independent arguments/authority reads and bind reuse to the same held operation and encrypted intent. No ordinary-post gas assumption is applied to generic actions.

Reviewed sequencing candidate permits ordinary account actions to return at exact successful native inclusion. A subsequent action freshly checks the predecessor against the synchronized native anchor. Preference and name state comes from native reads. Display-only checkpoint observation cannot mutate journals or release private-account locks. Both independent reviewers approved;911 affected checks,2 real SDK waiter/engine boundary checks and1 native LMDB rollback scenario passed. Live qualification is outstanding. Bok accounting now accepts an exact public hash/height snapshot, matched to the private reader anchor, with hash-bound pagination and reorg checks.

Bok sourcea160e83f is deployed: an exact finalization that failed before serialization/submission can be attempted on the next normal worker cycle without repeating model work. The original failed baseline reply proved in3.397s (witness0.547s, native proving2.456s, validation0.341s), submitted in0.344s and appeared in the browser. Its failure/repair downtime makes it unsuitable as a clean speedup comparison.

## Live follow-up and current candidates

UI08b4ce33 is live with the exact-anchor public accounting backend. Its like test returned usable in12.199s versus56.933s baseline (78.6% reduction in the action lifetime). Included feedback took11.419s; visible controls became ready at11.877s. The like-count frame probe had an incorrect regular expression, so this run does not qualify the precise visible-count time. A faster action lifetime is not a claim of equally faster network inclusion.

Bookmark inclusion took11.618s, but required preference refresh continued for minutes. The UI returned to Bookmark while account controls remained locked. This is a failed usability qualification, retained in after-bookmark-08-refresh-regression.json. The cause is a cold preference reader walking from block1 in32-block pages, repeating sync/head/checks on every page. Fix and matched rerun are required.

Bok94d1a719 is live and healthy. Successful finalization releases at exact Aztec inclusion, then the existing scanner follows that same transaction to checkpoint. It cannot repeat paid model work or resend a rolled-back reply automatically. The latest change fixes contradictory selector guidance: object selectors belong only to edit_browser_plan, while browser-tests.json requires CSS strings. Five failed paid repairs in the retained baseline were caused by that mismatch.126 checks passed;25 existing browser opt-in tests were skipped. A clean new live request is still required.

Unpublished candidates extend native included usability to incoming claims; qualify like/unlike fee bounds independently; batch deposit refunds, nullifier and canonical-block reads; and overlap final L1 gas/fee metadata and exit membership reads. The combined first candidate set passed1143 tests with0 failures and25 existing browser opt-in skips. Native public like branches and the full private-effect bound were tested; a fresh native balance read uses the fixed bound when affordable and otherwise routes through the existing measured estimator before proving or sending. Low-credit affordability is retained. Final native proof/admission remains authoritative. No50% claim is made for these candidates before live tests.

The sparse preference reader f844b1de is published. Its first bookmark test completed in22.773s (required native preference refresh7.608s), versus58.264s baseline. This is a60.9% action-lifetime reduction; the target was offscreen and an account modal was opened during refresh, so it does not qualify a visible-frame result. Consecutive unbookmark completed in20.037s, with its final label visible at12.685s and native refresh finishing later. The prior bookmark still displayed confirmation-pending at the second click; an exact network checkpoint-at-click probe was not captured, so this alone does not certify a pre-checkpoint note spend. Active-button feedback was also lost during an unrelated feed render; a follow-up UI fix is required.


UI d4cfeee0 is published and public runtime/SDK hashes verified. It includes proposed incoming claim completion, independently qualified like/unlike fees with fresh low-credit handling, withdrawal/refund read overlap and inline name completion. Name creation returned in15.805s versus100.169s baseline (84.2% action-lifetime reduction). The selected control was offscreen, so this is not a qualified visible-frame comparison. The resulting owned name immediately signed one real post: actual included post visible at13.459s, action returned13.927s. No matched named-post baseline is available.

Next reviewed batch: native bridge-message readiness at proposed tier with actual tree membership; preference-specific fee bounds and low-credit measured fallback; one head/class read per held preference anchor with both fresh canonical fences; captured in-flight reader actions surviving feed rerenders; atomic Bok and terminal actions at included tier; one-time newly selected-name feedback; native-supported reply/quote/repost/like controls on included posts. Actual native public transitions qualified15 Bok race cases and15 target-state cases. Browser renderer regression remains to be exercised in the existing IAB. Initial root preference artifact test failed on an ignored stale Oct23 target; rerun against exact retained deployed artifact passed53/53, without changing any runtime pin.

Integrated next-batch application/session/preference/UI checks passed1008/1008, plus the separately run native target fixture. Public deployment and matched live runs remain required.

UI5df7df9d is published; exact public runtime/SDK hashes verified and no backend/proxy restart. Real bio edit34characters returned21.490s, modal closed after included feedback at20.720s, against approximate baseline75.020s modal endpoint. Native confirmation wait12.051s, preparation2.274s, real proof6.685s. Public profile subsequently displayed the exact new text. This is a single observation; the baseline click origin is approximate and profile-visible timing was not captured.

Repeat Bok-funding qualification encountered an obsolete retained74c completion record after d4 deliberately changed the disposable test format. No second payment was sent. Current-format repeat-payment/replaced-workflow/reorg scenarios passed7/7. Root is verifying and discarding only the completed obsolete fixture, with no production migration. Follow-up candidate adds nested receipt/membership/canonical timing, overlaps immutable receipt bindings, permits natively valid included read markers and keeps optional moderator menu discovery from disabling navigation (dependent native reads still join its lease). Root124 receipt tests and112 composer tests pass.
