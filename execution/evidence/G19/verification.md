# G19 account tools loading

The old page started loading only when the account panel opened, with serial contract and script downloads. The live cold measurement took71,396ms to reach the password field; the SDK alone transferred28,104,954 compressed bytes. Chromium also redownloaded that SDK on a repeat visit despite immutable HTTP headers.

The reader now prepares public account tools on startup, shares the same promise with the panel, downloads independent assets concurrently and evaluates scripts in their required order. A bounded service-worker CacheStorage cache persists hash-verified public SDK/scripts/artifacts. Metadata stays fresh; account data, API traffic and transactions are excluded. Failed runtime initialization offers an explicit page reload without re-executing partially initialized custody scripts. Browser storage failure still permits the verified network response.

Focused checks:20 server/assets/cache tests;4 loader lifecycle checks;1 Chromium155 test with the real63MB SDK, real contract artifacts and a labelled public-index fixture. The second visit verifies each asset is read from the origin exactly once across both visits, not merely transferSize0. No account/session is created and no transaction or private API call occurs. See local-cold-warm.json for timings. This qualifies loading, not transaction behavior.

Independent review is by /root/ux_review; root alone edits and publishes. SDK/contracts/CRS and existing account/post state are preserved. Live publication results are appended separately.
