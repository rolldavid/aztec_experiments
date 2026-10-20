# Signup completion verification

Fresh real MetaMask run: `execution/evidence/T04/signup-post-20261020-5.json` passed. One Ethereum payment, one consent signature, canonical three-bridge effects, automatic claim, two Aztec submissions (claim and first post), exact message visible in Home. Native development uses proofs disabled; this is not a real-proof testnet claim. The final subsequent UI-only change clears stale progress on errors and passed the targeted failure tests.

Pinned Node24.21.0 on macOS arm64. Browser Chromium155 with actual MetaMask13.49.0. Tests that create SQLite files use TMPDIR=/private/tmp to avoid the system temporary-directory symlink. Wallet and SDK builds completed successfully.

Affected checks: 197 session/price tests; 9 final funding/onboarding UI cases; 6 replacement/cancellation cases; 16 avatar cases; 120 broker cases; 86 canonical persistence cases. The final backend log records the clean native-prover/query, remote-client, moderation, worker and canonical event/index run.

Historical failures were investigated: initial browser selector/runtime pin mismatch before payment; later first-post selector matched both hidden draft and visible post (narrowed to public article); SQLite failures used noncanonical temp path; replacement tests changed a canonical block in place (fixed fixture to new block); stale approval notice was an actual UI error-state bug, now cleared. Earlier failed reports are retained and are not claimed as passes.

No contracts, dependency versions, data stores or deployment identities are changed. Review records cover UI, timeout behavior, native replacement, and publication safety. Signed quote expiry, per-request transport bounds and untrusted resource/security limits remain; they are not operation completion timers. Machine-operated hash-only Ethereum waits have no total deadline, but an externally replaced hash can remain pending; no in-app replacement path exists there.
