# Live e291 measurements — 26 October 2026

Browser access restored through the existing in-app browser without changing permissions, restarting services or editing the application. One tool-runtime reset repaired aborted dispatches without replacing the tab. These are actual cached-browser runs on e291136f04155604e8414e0da0f3d97275a8ff67 using the retained disposable Sepolia fixture. The goal remains incomplete.

| Endpoint | Baseline seconds | Current seconds | Observed reduction |
|---|---:|---:|---:|
| Funded warm wallet click → enabled Write, run1 | — | 2.255125 | Above2s |
| Same funded opening, run2 | — | 1.914850 | One passing observation |
| Create name → included, selected and enabled | 106.844070 | 20.912730 | 80.43% |
| Save58-byte bio → included and editor closed | ≈75.020200 | 18.548505 | ≈75.28% |
| Like → included visible count increase, run2 | 14.134775 | 14.691035 | −3.94%; target missed |
| $1 ETH→Bok Pay → included claim and usable7USDC | 165.094005 | 55.345905 | 66.48% observed wall |

Fresh signup payment readiness is NOT established by funded reopening. The first fresh-account attempt rejected insufficient fixture ETH and has no successful ready endpoint. The fixture is being replenished using its existing free test faucet/exchange helper. No ready timing is inferred from the failure.

Name baseline registered the first name; this fixture registered its third (River Cedar). The bio baseline payload was not retained and its endpoint was approximate. The historical Bok baseline includes unmeasured wallet/tool dwell; the current three provider calls total1.252s. These are observed comparisons, not controlled distributions or guarantees.

Like run1 reached native proposed receipt19.567835s after click, but its old-article observer was invalidated by DOM replacement. The repeat uses a document-level observer: proposed receipt14.105720s and visible count14.691035s. Its separate action lifetime14.593s is74.37% lower than56.933s, but that does not meet the visible-result target7.0673875s.

## Measured bottlenecks

Warm run1: sign-in/handoffs0.321s, private session0.240s, synchronization0.951s, status0.744s. Concurrent owner reads must not be summed. Warm run2 improves mainly synchronization(−173.765ms) and status(−143.405ms).

Like run2: preparation4.219s, proof5.882s, submission≈0.578s, inclusion wait3.336s. Its remote-proof4.654s includes2.096s server native proving; queue wait was0.023ms. Submission was706ms for113389bytes; result wait/receive3756ms for149485 uncompressed bytes; local verification135ms. Server work overlaps transport, so subtracting server time does not identify exact network latency. Predecessor2.532s mostly overlaps discovery2.132s. Name preparation7.863s and required ownership refresh1.792s remain substantial. Bio proof9.748s includes8.146s remote proving.

Bok proposed receipt arrived50.165840s after Pay; usable credit took another5.180065s, including3.841220s readiness with1.259240s native Bok synchronization nested. UI showed6→7USDC without a second payment.

## Evidence

Adjacent *e291*.json files contain browser traces and UI observer timings. Files accumulate earlier spans: scope each transaction to flow.start. Native proposed receipts establish Aztec inclusion, not checkpoint settlement. Cached startup assets were reused; cold SRS download was excluded as instructed. The private key remained in the local signer, never in the webpage or evidence. Agent pending_feed_release independently reconciled timings, endpoints, overlap and baseline caveats. Read-only agents warm_trace_analysis and like_trace_analysis traced measured costs to source; no patches have been integrated from these investigations.
