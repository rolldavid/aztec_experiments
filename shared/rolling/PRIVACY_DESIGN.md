# Private ownership and public bot identity

Draft 3 RC15–17, RC23–24 and G14. Design proposal at pinned Aztec6.0.0-rc.1; no assurance claim. The owner permits Bok's authenticated public identity. The human invoking Bok remains subject to the same privacy requirements as other human activity.

## Ownership and duplicate protection

Each registered name creates an encrypted ownership note in `Owned<PrivateSet<UsernameNote>>`. A private entrypoint authenticates the caller and consumes/recreates or reads that note using authenticated note nullifiers. It enqueues only the selected canonical name and public content. An `only_self` public operation rejects a previously registered canonical name atomically. The first successfully ordered registration wins; an unsuccessful transaction must not create a usable ownership note. No public owner-address map or account-indexed public storage slot is permitted.

A stable name intentionally links its own public posts. Anonymous posts contain neither name ID nor another reusable author value. Per-post admission/censorship commitments remain separately randomized; extending existing collateral notes must not expose the author when moderators remove text. Registering several names in a single transaction visibly groups them, so the wallet must submit registrations separately. This does not itself eliminate timing correlation.

One active like per account and post uses a domain-separated tag derived from the account's authenticated application nullifier-hiding key, chain, contract and post ID. Public state changes count only when the tag's active state changes. Names cannot bypass the account limit. The tag links like/unlike/re-like on that one post, which is intended; it must not link actions on other posts. Independent accounts can still create additional likes. No Sybil-resistance claim.

## Canonical name policy before deployment

Choose a small circuit-enforceable first-release character set: ASCII letters, spaces, apostrophes and hyphens; each first/last component1–32bytes after trimming and collapsing spaces, starts and ends with a letter. Preserve readable display case, compare lowercase canonical components with unambiguous lengths. Reserve canonical first name `bok` for the registered plugin identity, regardless of surname. First and last remain separate, so John Doe and Jane Doe differ. No Unicode characters are accepted in this initial policy; return an explicit validation error, never transliterate silently.

Reason: JavaScript Unicode NFC/casefold does not prove the same normalization in Noir. Draft3 delegates supported character/normalization details; its mandatory privacy and uniqueness requirements require an identical circuit check. Reversal path: a versioned future registry may add a specified Unicode normalization circuit and cross-version collision rules. Do not reinterpret existing names or introduce a frontend-only uniqueness check. G05 must test concurrent registration, display-case collisions, whitespace, reserved names and forged ownership. This replaces the earlier unverified Unicode working default in G03/defaults.md.

## Bok credit and request escrow

Private `Owned<BalanceSet>` credits replace current public `balances[account]`. An authenticated bridge claim adds encrypted credit directly and retains one-use bridge-message nullification. The L1 portal publicly emits its recipient field: the new escrow interprets this field as a fresh domain-separated recipient commitment binding chain, portal, escrow, version, private owner and random salt. Private claim recomputes that commitment; passing the human Aztec address would retain the disclosure and is prohibited. Preserve the V1 byte layout only, never silently accept legacy address-based semantics. A private `authorize_request(requestId,budget)` debits those notes, creates a private request-control note and two fresh partial refund commitments (ordinary unused credit and late reservation reconciliation). The only public payload is request ID, budget and fresh commitments. The application batches a public `only_self` escrow-opening operation before the configured board's authenticated invocation callback in one transaction; failed activation reverts the batch. The protocol may retain waiting escrow opened separately: operator spending is forbidden until board activation, and its private controller can cancel. Batch ordering alone is not a claim of protocol-enforced same-transaction activation. Neither callback nor public escrow stores the human account.

Operator reserve/settle uses `(requestId,callId,maximum/actual)` with checked integer accounting, receipt binding and maximum budget. Public bot/operator authorization is expected. Cost/call/remaining request budget can be public. Uncertain external paid outcomes fence replay. Private cancellation proves request-control ownership, exposing only request ID, and cannot close an unsettled reservation. Available private credit and publicly reserved request credit are separate quantities.

Normal terminal completion returns the aggregate unused request credit privately through the first commitment. Expiry with an unresolved paid-call reservation returns only unreserved available credit through the first commitment and fences the reservation. Authenticated late receipt reconciliation charges the actual cost and returns the remainder through the second commitment. Neither deadline nor missing receipt proves an uncertain call was free. No new paid calls may start after expiry. If the operator cannot reconcile, reserved funds remain explicitly blocked; there is no administrative sweep or silent replay. Pinned `PartialUintNote.complete` neither authenticates its caller nor enforces one completion; repeated completion can mint duplicate notes while discovery sees only the first. Therefore each refund channel needs a distinct fresh commitment, authenticated eligible action and atomic one-use completion flag. Normal completion must permanently close both channels; late reconciliation is eligible only after the reserved-expiry transition. Never reuse one partial note for multiple model-call refunds. Complete against the fixed `Owned` balance storage slot, never a public account-derived slot; skip zero-value completion. Cancellation rejects unresolved reservations; expiry and late settlement obey their respective guards. Withdrawals spend private notes and create authenticated L1 messages bound to exact recipient/amount; these L1 effects remain public.

## Observers and falsification

| Observer | Expected visibility | Required investigation |
|---|---|---|
| Public chain/archive | Names, content, thread links, per-post like tags, bot identity, request budget/cost/timing, funding and withdrawal effects | No human-address mapping, cross-name owner marker, reusable anonymous author tag or duplicated private refund |
| Index/backend | Public ranges, public profile/thread interest, IP/timing | Never send owned-name lists, follows/bookmarks, private account or subscription lists; derive relationships locally |
| Aztec node | RPC payloads, public-key lookups, note-tag/nullifier requests, IP/timing | Real request traces must show whether wallet discovery/recovery links private names. Shared ranges/local processing need measured coverage, not an assumption |
| Remote prover | Private witnesses | Explicitly trusted for witness privacy by specification; transport/authentication and secret retention remain bounded |
| Bok/model/generated code | Public invocation/thread/context and allowed workspace files | No developer/provider/signing/admin secrets, other workspaces or hidden human ownership |

Text, funding amounts, temporal correlation and network behavior remain observations. A node trace linking private activity is a failed objective to repair or disclose, not erased by a clean public schema. Independent privacy specialist review remains required before assurance claims.

Falsification scenarios: two accounts with two names each; concurrent normalized-name claims; anonymous and named nested posts; duplicate/concurrent like/unlike; privately funded Bok requests; forged ownership/operator actions; replayed terminal settlement; zero refund; cancellation/expiry with unsettled reservations; restart after uncertain paid call; exact withdrawal; key-assisted restoration and full archive rebuild. Use real proofs for acceptance and inspect actual transaction effects plus request traces.

## Pinned source basis

- aztec-nr/v6.0.0-rc.1 `aztec/src/state_vars/private_set.nr` and `owned.nr`: private ownership and fixed note storage slot.
- aztec-nr/v6.0.0-rc.1 `uint-note/src/uint_note.nr`: partial-note completion caveats.
- `billboard/private_fee_contract/src/main.nr`: existing fixed-slot private balance/refund implementation.
- `billboard/plugin_adapter/src/main.nr`: legacy public account maps to replace; not acceptable for anonymous Bok acceptance.

These source-backed designs still need compilation, real transaction tests, accounting and observer review.
