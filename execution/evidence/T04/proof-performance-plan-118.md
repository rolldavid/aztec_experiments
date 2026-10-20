# Remaining application proving performance campaign

Read-only design review; not measured acceptance evidence.

The recorded product specification requires cold proving p95 <=180s, warm proving
p95 <=90s and at least30posts per supported engine, excluding inclusion/finality.
To report both percentiles rather than pool them, predeclare30cold and30warm
observations per engine. Record p50/p95/max, all failures and fixed conditions.

Existing per-run GUI times cannot populate the proving dataset: they include
preparation/submission and deliberately leave proofTimingMs null. The completed
journeys establish functionality, not this performance criterion.

Use the existing browser/application lifecycle and supervisor. Add one explicit
cold-post plus warm-post scenario with two independently verified canonical posts,
notes and private-fee debits. Measure existing proveTx/toTx boundaries without
changing arguments, outcomes or error behavior. Report SDK readiness and CRS
initialization separately; cold setup-plus-proof must include first-use proving
initialization even when initialization happens before the post button.

Cold means a fresh browser process/profile with no prior proof. Locally hosted
assets and OS caches are not necessarily cold; record this limitation. Warm means
the second post in the same live wallet/prover. First run one two-post pilot under
the unchanged540s/4GiB cap. Only if it fits, collect30serial batches per engine.
No concurrency, automatic retry, alternate engine or reset of a running deadline.

Aggregate source-bound reports using exact browser versions, hardware/configuration
and source hashes. Require distinct run IDs and retain failed attempts. For30
samples, nearest-rank p95 is the29th ordered observation. Installed-browser support
and bundled-engine performance remain separate claims. No new scheduler/service
or general-purpose orchestration framework is needed.

## September20 scheduling revision

Campaign136 remains a fixed30-slot cohort; retain all observations and missing slots.
After attempt02, defer its remaining runs while closing actual feed synchronization
and wallet integration gaps. It is incomplete and cannot qualify; no failed samples
are replaced. Final-source performance qualification remains required. This avoids
spending hours qualifying a source candidate already known to need application edits.

## Fixed-fee development pilot after full wallet integration

Independent source review found cohort136 differed only in maximum L2 fee price.
Use the higher successful136-01 fixture without automatic adjustment:
DA/L2 limits271200/6540000; teardown135600/817500; maximum prices1/669090960;
priority prices0/0. Maximum charge4375854878671200 raw units. This is a benchmark
fixture only, not a production fee recommendation. Ordinary application clients
continue estimating. Insufficient fees must fail instead of being increased.

Wire the explicit settings through existing browserPost/fees preparation, clone at
the funding boundary, and fingerprint the fixture. Before the native claim require
funding for three maximum charges; before browser handoff require remaining credit
for two. Existing serialization and canonical fee oracles remain unchanged. Run
one bounded pilot after integration, with all source inputs frozen; retain the
failed/incomplete136 cohort unchanged. Final campaign scheduling remains separate.
