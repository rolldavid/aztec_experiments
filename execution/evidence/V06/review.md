# Independent agent review record

Read-only reviewers: `/root/v6_migration_review`, `/root/deployment_review`.
Root alone changed source and ran heavyweight tests and live transactions.

The migration review covered namespace/version compatibility, native and browser
Chonk interfaces, RPC batching, viem error identity, private funding, CLI identity,
plugin funding and recovery, the hosted harness and remaining V5 API references.
The final bounded sweep found no additional functional V5 assumptions in active
application/prover/build paths. Historical assets, retired network-prover paths,
negative fixtures and cosmetic comments were distinguished from active behavior.

The recovery review required the exact V6 Inbox MessageSent event as well as the
portal deposit event, because the portal event does not carry the secret hash.
Root integrated one shared canonical verifier for normal and recovered funding,
added meaningful wrapped/incorrect-event/reorg tests, included the new module in
build provenance, and stopped nonce scans after a verified match. The reviewer
approved the final implementation and inspected the 23-check passing result.

The reviewer also required board withdrawal qualification to wait for the latest
moderation fixture's verified deadline, because the application plan initially
returns the first unscreened post. Root integrated that guard without changing
contract timing. Refund checks retain exact portal emission, principal/liability,
wallet balance minus actual gas, canonical receipt and replay assertions.

The local wrong-origin test's V6 event index and scalar deposit return corrections
were independently approved. Sanitized diagnostics reuse the existing failure
formatter; no alternate proving path, hidden retry or weakened invariant was added.

Deployment review verified the refreshed package manifests, archive sizes and
encryption, one-instance Spot cap and persistent termination timer. Root corrected
stale V5 direction and documented S3 versions/expiry and the scope of the prover
campaign budget. Full reply/refund results remain subject to live evidence.

This is independent internal agent review, not an external security audit.

Additional native-test review approved the exact V6 structured witness reference and cache restoration. Run3 verified all negative probes, then exposed in-flight empty checkpoint publication during the ordinary V6 wallet fee simulation sync. Root reused the existing pause/convergence/resume helper before selecting the common proof anchor, retaining exact header equality. Twenty targeted checks and the final independent diff review passed. Run4 exposed the same barrier omission in post/screen eligibility. The reviewer approved the shared correction and real pending-publication regression;17focused tests passed, followed by the complete genuine run5.

The reviewer approved the streaming hosted-asset verifier implementation: one request/controller/inactivity timer, full decoded EOF size and hash, unconditional cleanup, and unchanged outer Supervisor. Nine realHTTP tests cover progress, stalled headers/body/EOF, exact size/hash and request cancellation. No retries, alternate source or larger total test deadline were added.

Read-only review approved lazy checkout and the explicit replacement plugin request after canonical zero-charge closure. It also approved the browser preflight correction to observe the actual fee estimator at an unaffordable unit price, retaining exact rejection and state invariants. Deployment review independently verified the Spot capacity replacement at13:41–13:42UTC and proved that website routing/security fields outside the prover were unchanged.

The migration reviewer approved the current-UI restoration/completion helpers and sanitized diagnostic reuse. Fourteen real-template browser checks and twenty-two focused driver checks passed before browser run3. Older lifecycle/funding selectors remain outside this plain-post qualification.

The reviewer approved filtered Git cloning and sparse materialization, exact commit/tree binding, preserved PR base and executable modes, retained failure memoization and command limits. Review caught case-insensitive filesystem aliases; root added normalized/case-folded oversized keys and case-insensitive .git rejection with actual Git regressions. All92pluginchecks and the live read-only repository smoke passed. No PR was published.

Final withdrawal-guard review approved exact current-feed binding for every recorded own post and maximum deadline selection. Root corrected optional loading so only ENOENT permits omission; null, false and wrong-phase reports fail closed. Nine focused deadline checks and the full78-check harness pass.

The independent migration reviewer reaffirmed rc.1 as the current officially prescribed V6 testnet version from the network table and live RPC. rc.3 is a newer npm publication, with network deployment/circuit compatibility unverified; it is not substituted into the working rc.1 stack. The inconsistent getting-started page was excluded from this decision.

Read-only review approved waiting for the independent AI plugins panel rather than the posting composer. The composer correctly hides after board withdrawal; plugin redemption remains available. Final phase order is plugin credit withdrawal, board exit/pause, plugin redemption, board refund. This preserves the latest authenticated board L2 withdrawal journal; later plugin redemption is L1-only. No deadline or canonical assertion changed.

The completed plugin reply differed only by leading whitespace and a missing final period. Public contract storage and canonical event decoding agree exactly on all24UTF-8bytes. Independent deployment review approved accepting only surrounding whitespace/optional finalperiod while comparing DOM textContent exactly to canonical feed bytes. The original literal assertion failure is retained; no model call was repeated and all monetary and parent-link checks remain unchanged. Filtered-tool installation and versioned recovery-index promotion passed after successful idle completion.

The actual board exit reached canonicalblock15548 and paused at settlement. Its browser qualification then failed because the caller omitted rollupAddress and passed a checksummed depositor to the strict commitment encoder. The reviewer approved the exact fullscope/lowercase fix and five focused checks. Read-only reconciliation verified the same receipt/effect identities, exact exit leaf, full live network, unchanged nonce/principal and elapsed ownpost deadlines. The failed browser report and supervisor are preserved; the reconciled result explicitly records originalBrowserRunPassed=false and references the archived failure SHA. No new exit transaction or relaxed validation was introduced.

Final read-only operational review at15:26–15:29UTC found exactly one running Spot prover, fleet target1/Spot1/OnDemand0, $0.40 cap, terminate behavior, disk deletion and CloudFront-only8080 ingress. Public health showed4completed/0failed proofs and no queue. Moderator command5138044e-8715-48f1-b383-32426be3599a succeeded: active service, active backup timer, zero feed lag/errors, fourallowed/oneconfirmedflag; both new plugin request and reply were allowed. The termination deadline remains supported by the prior installed-timer verification; no fresh in-guest read or SSH reopening was claimed.

Final migration-review disposition found no blocker in completed live acceptance.
The reviewer verified both finalized exits, canonical wrapped Sepolia payments,
exact999652microUSDC and1e13wei returns, replay rejection and nonces7→8→9.
Both redemption supervisors pass within540s/4GiB and all owned processes exited;
their recorded source hashes still match the current files. The earlier board
withdrawal supervisor remains failed with clean cleanup, and the original failure
and reconciliation SHA references were independently verified. This supports the
completed application exit/refund flow without falsely claiming that the earlier
browser qualification passed. No production audit or soak gate was waived.
