# Current delivery checkpoint — owner-only discovery

Performance candidate14e43947 is integrated, not yet live. Root owns staged
native proof and activation. proposed_feed_design prepares reviewed backend
packet; pending_feed_release prepares coherent browser build/package.
pending_reply_ui implements owner-only durable note discovery in isolation:
AES unconstrained, same-wallet fresh-browser reconstruction, native commitment
and nullifier validation, no shared sender-index scans or ECDH self-delivery.
The current signature-derived key root has a separately disclosed quantum
exposure; a different cipher alone does not remove it. No old-state migration.

Previous research turn made progress: exact pinned source established custom
synchronization and validated note processing; measured scan cost1.660s; no
unsupported attribution of remaining private execution time to AES.

# Active ordinary-post performance lanes — 24 October 2026

Owner explicitly requested parallel subagents. All four available slots are active.
Current goal is15 seconds click-to-Aztec-included DOM, with complete fee and
application preparation under1 second, private witness at most1.25 seconds,
and upload/acceptance under1 second. Latest deployed46805717 measured41.051seconds;
only fee preparation458.63ms and encoding37.38ms currently meet their targets.

- `pending_feed_release`: account synchronization, predecessor/journal reads,
  rules/history reads and actual preparation overlap; isolated preparation checkout.
- `pending_reply_ui`: sender-tag scans, private witness construction, exact-anchor
  contract/state prefetch, kernel/public-validation bottlenecks; isolated checkout.
- `proposed_feed_design`: upload request path, proof worker and immediate result
  delivery; isolated checkout. No infrastructure protocol change without evidence.
- Root: independent integration review, source-bound build/publication, actual
  inclusion/feed measurements and memory-bounded browser acceptance.

Only root publishes/restarts services. Agent tests are focused; shared real proofs
are serialized. Existing IAB only; do not launch headless Chrome test suites.
Evidence counts, phase relabeling and smaller payloads do not establish the goal.

## Historical delegation records

# Current ordinary post 36-second target — 24 October 2026

Implementation, independent review, build and publication are complete for
`26be933b-closurefix`. Root owns browser-access troubleshooting and the remaining
bounded ordinary-post latency/memory acceptance. The release agent verified
publication evidence. No browser test or deployment is running.

Latest measured08734c06 remains41.711s; current26be933b is unverified. Do not mark
the36-second goal complete without current-release measurements. The browser
service returns an access denial despite the owner reporting access enabled.
No duplicate paid requests or blind repetitions for favorable block timing.

# Current ordinary post inclusion — 24 October 2026

Completed and published: static UI/SDK f12bdc3e. Real ordinary post appeared
pending with composer closed, 73.743s before checkpoint. The same browser
automatically removed its pending badge without refresh or duplicate. All assigned
agent work is complete; the read-only observer exited after confirmation.

- proposed_feed_design: existing receipt waiter emits observational inclusion;
  engine and wallet session forward exact intent/hash correlation. No second wait.
- pending_reply_ui: composer closes on matching successful inclusion; retains
  canonical completion/account lock and visible later failure. Independent callback review.
- pending_feed_release: pinned SDK/browser rebuild and static-only deployment packet.
- Root: integration, real non-Bok post/browser acceptance, publication and push.

Existing proposed feed already applies to regular posts. This fixes the sender's
modal obscuring the feed until checkpoint. No contract or server changes required.
Old test data is disposable. Keep all services running.

## Previous request (completed)

# Current proposed reply display — 24 October 2026

Completed source: core9f34170a, worker52ef5da0 and UI8f16fcd3 deployed.
Owner explicitly authorized inclusion display before checkpoint; money accounting
remains checkpointed. Actual reply appeared pending and promoted automatically,
35.220s earlier public availability, without refresh or duplicate. The same accepted
job finished with exactly two model calls, charge10962/refund239038; hosted app
was opened and checked. No additional paid request was submitted.

- proposed_feed_design: proposed feed, canonical-head race and bounded publication
  quota fixes implemented; independently reviewed final balance refresh.
- pending_reply_ui: pending/confirmed UI and checkpoint-triggered balance refresh
  implemented; independently reviewed backend and publication quota changes.
- pending_feed_release: complete source dependency checks and narrow core/worker/UI
  deployment packets reviewed; root performed all service mutations.
- Root: integration, live browser/SSE acceptance, final asset checks and push.

All agents' assigned implementation/review work is complete. Worker health is ready,
active0; no observer or paid request remains running. Focused results and exact
source bindings are in docs/BOK_LATENCY.md and the proposed-replies evidence folder.
The independent optional browser skip and baseline stale broad-reader fixtures are
explicitly recorded; do not claim the full historical browser suite passes.

Old test data is disposable. No migration/recovery project is needed. Proposed
inclusion is not Ethereum settlement. The prior30-secondcheckpoint target remains
separate from this completed earlier-display request.

## Previous performance acceptance (historical)


Browser `23e6cde5` and worker `cdab01f7` are published. SDK `267fcf91`
remains pinned. Root integrated and pushed the completed parallel work:

- Account instance reuse: 251 account/deployment/synchronization checks passed.
- Conversation pagination: 14 real-browser checks passed, including rapid navigation.
- Typed browser-plan selectors: 112 model/tool checks passed, including actual
  Chromium; 38 repository checks passed with two existing opt-in skips.
- Independent reviewers approved implementation, publication packets and timing claims.

The actual comparable request completed in 155.233 seconds, 66.6% below the
464.264-second baseline. All eight application-controlled categories improved
31.5–97.3% in this sample. One private execution/proof per ordinary transaction;
one actual generated-app validation, 176 browser checks, no model repair.
The post, canonical reply and refund rendered automatically without navigation,
reload or Load more during the request. Exact generated revision `2c0dfe06`
also passed the parent's manual completed/unchecked/reload feature check.

No agents have unfinished implementation or deployment work. No paid request,
transaction observer or service mutation remains active. Do not repeat benchmarks
merely to obtain favorable network slot timing.

The 30-second canonical-checkpoint target remains unmet. Exact current-transaction
audit shows 68.337 seconds before its eligible checkpoint slot and 2.502 seconds
between the Ethereum header timestamp and native wait completion. No substantial
avoidable application delay was found. Do not relabel proposed transactions as
settled or weaken confirmation semantics. Any further work needs evidence of an
actual avoidable delay or an explicitly authorized network/policy change.

Read `START_HERE.md`, `docs/BOK_LATENCY.md` and
`execution/evidence/G21/stable6/bok-performance/typed-confirmation-audit.json`.
Old test data is disposable; no migration or recovery project is authorized.
