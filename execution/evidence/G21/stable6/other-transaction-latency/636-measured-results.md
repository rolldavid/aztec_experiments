# Actual 636 measurements — 26 October 2026

Runtime source 636d0a581fe81108f09bfc04731e45c46ce35abf. UI and prover published; public worker SHA f30917dff5d4ac1c1af9353c1776467efaacf5b1cd26224fa5df4188feabd545 verified. Prover PID270182; unrelated services unchanged. Reused the existing IAB tab and authorized disposable Sepolia wallet, funded test-account scope5. No contract deployment.

| Endpoint | Actual run1 | Actual run2 | Acceptance |
|---|---:|---:|---|
| Wallet click → funded account ready |2.712740s|2.255880s|Fails2s; funded reopening is not fresh signup acceptance|
| Like click → included visible count |19.399400s|15.196415s|Fails50% vs14.134775s baseline|
| Like preparation |3.064200s|2.978725s|Previously4.218925s; observed27–29% reduction|
| Canonical predecessor check |0.608950s|0.470200s|Previously2.531775s, overlaps discovery; do not add overlapping savings|
| Proof result transport |2.718635s|2.012525s|Includes server proving, not network-only time|
| Proof result encoded bytes |25,282|25,324|Decoded149,486/149,490;83.1% fewer bytes|
| Proof upload |2.608890s|4.222005s|Regression/variation under investigation|
| Actual Aztec inclusion wait |8.257600s|3.172835s|Both proposed native receipts captured|

Like native receipts are in the bounded trace files. The first visible update followed native inclusion by342.915ms. The second by506.845ms (calculate exact from JSON). Both operations used real proofs and real chain receipts. Neither is a claimed50% end-to-end success.

Warm phase breakdown: run1 pre-session152ms/session334ms/sync712ms/capsule4ms/status1507ms; run2 145/316/997/4/790ms. The warm files contain measures only, so repeated oracle spans can be overwritten by background discovery. Use the existing bounded observer snapshot for detailed next-run attribution. No discovery was removed or stale state reused.

## Upload control measurements

Same113,399-byte invalid envelopes, rejected400 without creating proof jobs: browser ResourceTiming first7.045425s, repeat1.538765s; Python HTTPS0.886703s; curl HTTP2 0.915539s and HTTP1.1 0.830297s. Browser first origin body reception5.421218s comprised2.802ms loop-active and5.418371s loop-idle. Repeat body641.491ms, active1.628ms/idle639.805ms. These controls establish variable browser upload arrival, not server decoding/proving or a duplicate encoder. They are not blockchain performance acceptance. No network/security controls changed.

## Standalone posting-credit top-up

Attempted27.84750827277444FEE. Approval40ff0a4c628276b5f01fc88e45ef98790788550a741eb79c2477f621ce33252f and deposit96e5256e1de522f8baea48f491e7bc7210e275615d112720111fa464ccdc7299 mined. Deposit status0, gasLimit205630/gasUsed203461. Identical eth_call at that block fails with205630 gas and succeeds with411260. Likely inner-call out-of-gas, not yet proven by a trace (debug_traceTransaction unsupported). Application already supplies2× estimated gas; no speculative multiplier change made.

The test adapter was interrupted by a CUA kernel timeout before completing its response sequence. Therefore this run is excluded from latency acceptance and its UI unknown-payment error is not attributed to application code. Original EIP1193 request gas was not persisted, so distinguish an adapter conversion defect from changing Inbox insertion cost before modifying the application. Do not resubmit the mined payment blindly; reconcile the failed receipt first.

## Remaining goal

The2-second fresh signup endpoint and all-flow50% target remain unachieved. Earlier e291 name/bio/ETH-to-Bok reductions retain their recorded fixture/dwell caveats; they were not rerun here. Fresh signup fixture still lacks0.001ETH deposit; do not waive funding checks. Owner-log discovery prefetch and status-only native balance reading are source-backed candidates, not implemented/measured improvements.
