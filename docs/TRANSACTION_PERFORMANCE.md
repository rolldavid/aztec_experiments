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

No 50% end-to-end claim has been established for this batch. Publication and matched after measurements remain required.
