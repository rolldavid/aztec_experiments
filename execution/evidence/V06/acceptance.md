# V06 migration acceptance — passed testnet qualification

The user authorized migration of the complete latest merged application to V6
testnet and revival of the remote Spot prover within a $100 total prover-testing
budget. The source baseline was master `0baa9c3426bfc348c1873e61e5f9a54ebd0431d0`.
Root owns integration; `v6_migration_review` and `deployment_review` performed
bounded independent agent reviews. These are engineering reviews, not external
audits. No changes have been pushed.

## Source and network

The current official V6 testnet is6.0.0-rc.1. A final check found npm prerelease
6.0.0-rc.3 (published8October), while the official network table and live RPC
still prescribe/report6.0.0-rc.1 with rollup2914217885. The stack remains matched
to that deployed network; no unverified rc.3 circuit-compatibility claim is made.
See https://docs.aztec.network/networks and version-refresh.json.

All current SDK packages are pinned to6.0.0-rc.1, with the matching immutable
Noir dependencies, compiler, native binaries, browser workers, circuit metadata,
Solidity artifacts and CRS. Node is pinned to 24.21.0. The application uses the
Aztec viem 2.38.3 package consistently so decoded SDK error identities agree.

The public endpoint reports V6 real proofs, Sepolia chain 11155111 and rollup
version 2914217885. `node-info.json` records its addresses. The current deployment
and exact public URLs are in `deploy/prover/live-deployment.json` and
`deploy/V6-TESTNET.md`. This is a fresh deployment; V5 runtime, state, configuration
and website snapshots remain recoverable.

## Completed checks

Commands ran from this repository with its pinned Node on the PATH. Heavy
application scenarios use the existing 540-second/4-GiB supervisor and official
local settlement controls; no network epoch prover was built or run.

- Noir: 197 checks; canonical contracts and verification keys rebuilt.
- SDK/browser assets: V6 build passed; all public pages rebuilt. The final recovery
  rebuild changed only plugins.js. Deployed board JSON, portal bytecode and runtime
  metadata identities were independently rechecked with their exact encoding.
- Components: 370 checks in the integrated suite, plus the subsequent focused CLI
  identity regression. Existing graph task results remain historical to their own
  source snapshots.
- Solidity portal tests: 40 passed against the V6 Inbox constructor.
- Plugins: 92 passed after receipt recovery, lazy checkout and filtered repository materialization. The first restricted
  attempt failed only because sandbox policy denied test loopback listeners; its
  permission-enabled rerun passed.
- Receipt recovery and refund oracle: 23 focused checks passed. Real V6 Inbox ABI
  fixtures bind wrapped funding to the expected recipient, amount and secret,
  and reject substituted identity, wrong effects and noncanonical receipts.
  The same code independently verified the actual wrapped one-USDC Sepolia deposit.
- Build provenance/artifact and claim-boundary regressions: 50 passed. The new
  receipt module is included in build provenance, and the regression detects
  edits paired with stale output. The first fixture lacked the newly required
  input and was corrected without changing the provenance rule.
- Native private fees: real funding, claim, withdrawal, refund and replay checks
  passed in the existing bounded local scenario. The public remote prover also
  completed a separate real private-fee claim with accepted on-chain receipt.
- Hosted browser: fresh test account, actual MetaMask approvals, actual Ethereum
  funding, private board claim and public post passed. Remote proof counters and
  exact canonical public event were checked; owned browser processes were cleaned up.
- Plugin funding: one free test USDC was deposited, claimed on V6, and used to
  submit the paid request. The operator correctly waits for normal finality before
  metered execution. Paid reply, unused-credit exit and exact Sepolia redemption all pass.
- Moderation: the first post was evaluated as allowed. The credible-threat fixture
  was flagged in checkpointed block 15402 by the configured moderator, with the correct
  policy, exact post identity and a timestamp inside the one-hour window. The
  canonical flag receipt and decoded public event are recorded separately. Its
  receipt is finalized, and the moderator independently reconciled the job to
  confirmed-flag with no error or orphaned state.

## Wallet and test corrections

MetaMask's optional protected transaction execution may use a wallet envelope
instead of sending directly to the requested contract. Receipt verification now
binds sender, nonce, chain, canonical block and exact portal/Inbox effects. It
retains saved intents for uncertain or incorrect effects and never substitutes
an automatic new payment. Normal completion and interrupted recovery share this
validator. Tests use ordinary wallet confirmation; wallet protection was not
disabled.

A reverted early fee-funding attempt and failed harness assertions are retained
under `.build/hosted-v6-onboarding-20261010/`. Successful prior funding was
reconciled explicitly before further payments. V6 identities are fresh disposable test accounts and all assets are test-only.
An existing project test funder supplied the initial 0.0003 Sepolia ETH bootstrap;
subsequent qualification uses the fresh accounts. No pre-existing user wallet
key was used.

The local unflagged journey exposed obsolete test assumptions: the V6 deposit
getter returns a scalar, the membership oracle uses a structured block number/hash,
and ordinary V6 fee simulation synchronizes PXE even when background sync is off.
The first three bounded failures retain cleanup evidence. Run3 passed wrong-origin
rejection and all four malformed-claim probes, including the exact constrained
Merkle rejection and authentic cache restoration, then caught an in-flight empty
checkpoint changing the selected positive-proof anchor. The test now uses its
existing checkpoint-publication barrier before selecting that anchor. Exact proof
header equality and all rejection requirements remain mandatory. Twenty focused
checks and independent final diff review passed. Run4 then reproduced the same
pending-checkpoint race in the shared post/screen eligibility helper. Its cheap
regression failed before the repair and passed afterward; seventeen focused
checks and independent review passed. Run5 completed the genuine wrong-origin
and malformed-message rejection, legitimate claim, post, screening, withdrawal,
refund and replay checks in342736ms, with1667440KiB peak aggregate memory and
complete owned-process and temporary-directory cleanup. See unflagged-journey.json.

Hosted transfer preflight now streams and hashes exact decoded bytes, enforcing
a30second inactivity timeout under the unchanged540second total supervisor.
Nine real-HTTP progress/stall/size/hash checks passed and independent structural
review approved. Four oversized website text assets use explicit deterministic
gzip; their decoded application contents are unchanged. This does not establish
cold-load performance.

The first plugin request failed because toolbox initialization cloned GitHub even
for a plain response. This happened before provider spending. Canonical state
confirmed closed-without-reply, zero charged/reserved and the full1000000testUSDC
units remaining. Checkout is now lazy and memoized, including rejection, so plain
replies and API-only PR reads do not clone. The reproduced regression failed before
the fix;12focused and89plugin checks passed, followed by independent review.
The lazy-checkout correction is installed with KeepAlive restored. The new explicit
request completed one paid call, with a verified linked reply. The old
request is never replayed. Repository filesystem tools separately reproduced a
60-second timeout because a full clone downloaded unsupported generated blobs.
Filtered clone and size-aware sparse materialization pass a real Git regression
that failed before the fix, 92 plugin checks and independent review. A single live
read-only clone/list/README check passed in15.876seconds. The filtered module was installed after successful idle completion at14:55UTC;
its verified archive and versioned recovery index were promoted afterward.

The first local browser-post run failed before browser startup because its fee
preflight still expected a positive balance below the configured ceiling to be
rejected. Current production correctly measures the actual required reservation.
The test now uses the real private simulator at a deliberately unaffordable unit
price, requiring exact bounded estimator rejection, no public simulation/proof/send,
and unchanged state.47focused checks and independent review passed; browser rerun
is running after a second preserved failure at obsolete browser restore controls.
The corrected driver uses the current Restore account password field, observes the
actual completed post hash and visible result, and retains the same deadlines.
Fourteen actual-template browser checks and twenty-two driver checks passed with
independent final diff approval. Browser run3 then passed the actual GUI/WASM proof
and canonical inclusion in209669ms with2203088KiB peak aggregate memory
and complete cleanup; see browser-post.json. The distinct
flagged journey also passed in486588ms with1938192KiB peak aggregate memory
and complete cleanup, exercising two flagged posts, authentic
screening replacement notes, penalty/debt rejection, eligible withdrawal, official
local Outbox settlement and exact refund/replay; see flagged-journey.json.

## Prover and operations

The existing CloudFront endpoint routes to one c7a.4xlarge Spot instance, with
$0.40/hour ceiling and an active termination timer for 13 October 08:42:31 UTC.
The conservative prover campaign maximum is $83.27, including the earlier
$49.47 allowance, new maximum compute of $28.80 and $5 ancillary reserve. This
is not measured account-wide spending; existing moderator costs are separate.
Installation SSH access was removed. Encrypted EBS is deleted on termination.
AWS reclaimed the earlier V6 instance at12:20:20UTC with instance-terminated-no-capacity.
The failed hosted withdrawal retained cleanup evidence and changed no deposit.
Root confirmed no overlap, restored226123verified files from the current backup
and replaced only the private prover route. Independent live AWS review confirmed
public real-proof readiness, one instance, the same price/deadline and restricted
firewall. All non-prover distribution fields, including CSP, were unchanged.

Current operator and prover package inventories were completely hash-verified,
and their archives uploaded to the existing private encrypted backup bucket.
`current-release-archives.json` contains exact S3 versions, SHA-256 hashes and
10 November retention expiry. The moderator's fresh encrypted V6 state was
backed up, downloaded and verified for file hashes and SQLite integrity; its
normal backup timer is enabled.

## Completion and scope

V06 testnet acceptance is complete. Both exits finalized normally at15:30UTC,
then the plugin and board refunds passed serially with exact accounting and
replay rejection. The latest own-post moderation deadline was14:48:12UTC; actual
board withdrawal began after it. No timing or resource limits were extended.

Production gate R04 remains separate, including external review, current network
clearance and fourteen days of representative soak evidence. This testnet
qualification does not waive those gates, qualify Safari or assert cold-load
performance. Existing V5 recovery assets remain intact and no source was pushed.

## Final live exit evidence

The paid reply matches the requested phrase with a leading space and no final
period. Independent public contract storage and canonical PostPublished plus
PluginReplyLinked events agree on its exact24UTF-8bytes and parent/transaction.
The failed exact-punctuation oracle is preserved; the reviewed assertion permits
only surrounding whitespace and an optional final period, while DOM textContent
must still exactly equal the canonical feed. No provider call was repeated.
The completed invocation charged348microUSDC and returned999652unused units.

Plugin credit withdrawal passed177078ms, peak2962096KiB, with full cleanup, exact
999652unit exit, zero remaining credit and unchanged Ethereum nonce7. The board
browser exit ran178256ms, peak3510480KiB and full cleanup. It successfully reached
settlement and paused at block15548, then its leaf assertion failed before reading
the effect because it omitted rollupAddress and supplied a checksummed depositor
to a strict lowercase commitment encoder. The correction preserves strict input
validation; all5focused tests pass. Read-only reconciliation verifies the original
receipt/effect identities, exact expected leaf once, unchanged latest/pending
Ethereum nonce7 and principal10000000000000wei, and all four elapsed own-post
deadlines. The original failed browser report and supervisor remain unchanged;
withdraw.json explicitly records originalBrowserRunPassed=false and references
the archived failure hash. This is not represented as a successful browser rerun.

The final live plugin redemption passed in67296ms, peak3111728KiB, returning
999652microUSDC in Sepolia transactionbf32ef99658d9e4109d6156cecde8997b616cd2415f8527bc7ae5a23670e97ed.
It verified the exact wrapped-wallet portal event, token balance increase,
nonce7to8, cleared saved withdrawal and Outbox__AlreadyNullified replay rejection.
The final board refund passed in99178ms, peak3218400KiB, returning10000000000000wei
in transactionf562b397d431b56e2ea45564ccdf8a114df69d7765c534ea463699d77d517df2.
It verified canonical Withdrawn event, zero remaining deposit, exact liability
and portal balance reduction, wallet increase minus actual2596484414016wei gas,
nonce8to9 and No active deposit replay rejection. Both browser runs completed
owned-process cleanup and stayed below540seconds/4GiB. See live-qualification.json
and the original phase/supervisor reports.

Final read-only service health at15:37:59UTC reports public proverready, four
completed/zero failed real proofs and an empty queue, and pluginready/idle with
no failure. The independent moderator health review confirms active service and
backup timer, no feed lag/errors and correct allowed decisions for request/reply.
