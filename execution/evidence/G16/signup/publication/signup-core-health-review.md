# Hosted core health review — 20 October 2026

Final disposition: application APIs and moderator independently observed healthy after publication of c9c850df. Investigation performed only read-only SSM service inspection, HTTP/RPC reads, read-only SQLite control queries and sanitized aggregate log extraction. No service restart, source edit, credential change, wallet use or state write was performed.

The application returned local status 200 in 0.03 seconds with ready/complete/cacheComparison complete, home 200 in 0.07 seconds, and wallet runtime 200 in 0.03 seconds. Node and query retained their original PIDs. All inspected services were active with no automatic restarts. These observations match root's later successful public endpoint checks.

Moderator initially logged CYCLE_FAILED and INGESTION_STALE while its durable public index replayed canonical history. Read-only control samples advanced from 8589 through 9332, 9460 and 9667 to 9668. Authenticated node identity, checkpoint and historical block-body reads succeeded in approximately 0.07 seconds. No fixed failing historical block was observed. The application deliberately sanitizes underlying exceptions; the exact transient error was not established, and no speculative fix was applied.

At 10:47:53 UTC the moderator logged severity ok at checkpoint 9668, successful ingest age 10 ms, 12 evaluated-ok records, zero queued/leased/retry/signing/manual records and no alerts. This was read at 10:48:17 UTC using SSM 16a88989-aa30-4497-b9bf-7f972434c6cb. Recovery occurred without intervention after replay. Further polling was stopped at root's request.

Sanitized evidence is /tmp/signup-core-final-health.json. Main app observation command: dd2d6af1-139d-4446-8ef2-b2d7b754e937. Final moderator observation command: 16a88989-aa30-4497-b9bf-7f972434c6cb. This evidence covers service/feed health; root's separate fresh-account real-proof browser test remains the end-to-end signup gate.
