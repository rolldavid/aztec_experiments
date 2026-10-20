# Focused directory search measurement

This records the actual narrowed run; the earlier broad browser campaign was not rerun.

The source-bound server is `rolling-lead-bok/.build/final-search-current-20261018/serve-reader.mjs`, admitted at b27bec99, launched from the rolling-design working directory so the retained SQLite dataset resolves correctly. It uses production startRollingReader and createRollingPublicSqliteStore with a labelled synthetic unauthenticated adapter, 10,000 posts, 100 subboards and 100 identities.

For each viewport width 1280 and 390 (height 900), create a fresh browser context. Navigate to /#/directory and wait for the actual Board 000 heading. For the cold search, clear browser HTTP cache and disable it. Fill the search box with Board 099. Install a capture-phase, one-shot submit listener before pressing Enter; record performance.now at the actual submit event, install a MutationObserver, and finish when the exact matching heading exists in main .feed and two animation frames have occurred. The 10-second Playwright timeout detects failure only. Then enable HTTP cache and repeat the same observation with Board 098 for the warm search. Close the context. Compare each submit-to-visible value with the predeclared 500 ms limit.

Raw results and the six actual SQLite API requests are retained beside that server. The directory requests are empty, Board 099 and Board 098, once per viewport; every searched result returns one row. Four samples are not percentiles. HTTP-cold does not mean cold OS, SQLite or first-ever application startup. Two animation frames are a rendering-opportunity proxy, not hardware display instrumentation. No chain authentication, proofs or complete privacy/performance qualification is claimed.
