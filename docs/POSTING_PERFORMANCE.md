# Posting performance — 25 October 2026

Published browser source: `74c2142c08b6a9cdeabefe6e46ebfa5ec4578836`.
Native prover timing source: `702c153c5c2e65099a66d7d8288d052f19aa51ad`.

Two real-proof posts (228 and 600 characters) took **11.095s and11.894s** from Post click to an unobstructed visible animation frame after actual Aztec inclusion. The composer closed on inclusion and both posts automatically checkpointed afterward. No slot timing, favorable-sample selection or manual refresh. These are observed acceptance cases, not a guaranteed ceiling for the external testnet. Earlier 27–28 s outcomes remain recorded. They must not be silently excluded from reliability claims.

## Disjoint browser wall time

These rows partition each observed click-to-visible interval. They sum to the totals; native aggregate counters below are nested diagnostics and must not be added again.

| Phase | 228 characters | 600 characters |
| --- | ---: | ---: |
| Account, rules, arguments and fee preparation | 0.836s | 0.814s |
| Private application execution | 0.538s | 0.521s |
| Private kernel execution and its wrapper | 0.705s | 0.698s |
| Public validation at the node | 0.465s | 0.453s |
| Encode/compress the proving request | 0.034s | 0.038s |
| Upload request and receive acceptance | 0.815s | 0.773s |
| Wait for native proof result to reach browser | 3.373s | 3.425s |
| Verify returned proof, save transaction journal and prepare send | 0.436s | 0.369s |
| Submit transaction to Aztec node | 0.518s | 0.520s |
| Wait for Aztec inclusion and render unobstructed post | 3.375s | 4.284s |
| **Total** | **11.095s** | **11.894s** |

Fee estimate available from click:769/755 ms (fee-specific work including metadata and binding about271/265 ms). Entire preparation before private execution:836/814 ms. Encoding through request acceptance:848/810 ms. Full private execution through kernel completion, including wrapper gaps:1243/1218 ms; the narrower native witness aggregates1185/1145 ms must not replace this wall interval. The first full witness case has only 7 ms headroom against 1.25 s.

## What was fixed

Disabled debug serialization and disabled test-data conversion were still doing work in the kernel path; those calls now do no work when disabled. Required native note/nullifier witnesses are fetched while kernel initialization executes. The exact two selected historical-post note witnesses are prefetched using native metadata and hashing, with no scans or extra notes. Existing composer preparation now also primes its required maturity-gated public witnesses. Post repeats its authoritative selection at the current anchor; changed anchors miss the native cache and fetch current data. Native authorization, moderation and proof verification remain intact.

## Native prover measurements

The server now reports fixed numeric timings for native BB calls. These include native call/IPC time, may overlap, and sit inside the enclosing server proof duration.

| Native operation | 228 characters | 600 characters |
| --- | ---: | ---: |
| Start | 0.35ms | 0.36ms |
| Load circuits | 403ms | 408ms |
| Accumulate circuits | 1302ms | 1341ms |
| Produce proof | 915ms | 910ms |
| Verify | 41ms | 40ms |
| Compress proof | 1.98ms | 1.94ms |

The second transaction was observed pending on the independent public node within 470 ms of our submission acknowledgement, and successfully included within 2807 ms. Browser receipt polling and rendering complete the final row. Nearby header timestamps establish checkpoint identity, not actual block-arrival wall time; they must not be used as arrival timestamps.

## Verification and evidence

239 integrated account-session tests and 18 native witness/cache/maturity tests passed, plus the preceding 555 integrated witness/application checks. Independent review verified one authoritative private execution and one admission check per post, actual inclusion before unobstructed display, current-state selection, source closure and all measured thresholds. Tests cover anchor changes and cleanup on failure/account replacement. All three repository branches (`master`, `codex/rolling-chat-account-ux`, `codex/rolling-chat-draft3`) receive the same commits.

Evidence: [228-character trace summary](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-first-summary.json), [600-character trace summary](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-second-summary.json), [independent node observations](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-second-network.json), [review](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-review.json), [publication](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-publication.json), [transfer cleanup](../execution/evidence/G21/stable6/ordinary-post-latency/owner-74c-cleanup.json).

Publication changed static browser assets without restarting application or proxy. The prover instrumentation update used one idle graceful restart with the same real-proof configuration and 16 threads. Other services stayed running. Owned transfer archives, exact S3 versions and source drafts were removed; one reusable 2.7 GB build tree remains. No Chrome process/profile was created. A final health-check script initially used the wrong Bok unit name; corrected to the existing `rolling-bok-testnet.service`, without changing or restarting the healthy service.
