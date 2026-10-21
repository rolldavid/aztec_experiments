# Account setup outage, 21 October 2026

Actual existing user tab retained session-initialization/trusted-node/BB_TRUSTED_NODE_UNAVAILABLE. Public aztec_getNodeInfo returned HTTP504. SSM found query, prover and proxy stopped; node and app stayed running. Journal shows application observer starting20October19:52:20UTC, stopping prover19:52:26, then query19:52:39. Application failure marker states APPLICATION_OBSERVATION_FAILED; last attestation had controlsVerified=true/applicationVerified=false. The exact thrown observation error was not retained. Six-second timing is consistent with the five-second health-request timeout; that cause is inferred, not directly logged.

Confirmed architectural defect: a transient health-request timeout or unavailable listener permanently stops all three services. Repair classifies only runtime availability errors as degraded. Strict admission, service/config/manifest identity and authentication-boundary checks remain enforced. No larger timeout, automatic transaction retry, chain reset, contract deployment or browser launch.

Restored the existing services under writer/receipt locks after full release/control verification. Existing user tab successfully reconnected and opened Set up posting -> wallet chooser. No wallet transaction or account replacement performed.

Affected checks: all ProverActivation tests and all QueryHost boundary/lifecycle tests pass. The separate payload-size test is excluded from the focused boundary run because it fails on untouched HEAD. Full broad suite results are preserved; all nine failures and two errors also occur on baseline (oversize legacy userdata, stale catalog fixture, missing qualification helper, native closure fixture). Baseline copy additionally has symlink-location fixture errors. No failing test was weakened or marked passed.

Publication scope: only the host control overlay function definitions and its pinned attestor hash. Preserve live CATALOG_SHA and native manifest f3efd677aa45a7ececada71b0f23d4a05966ec4081c27a4ffacf9e801aa6aa27. Service PID equality is required before/after; no app restart or feed replay.

Published c5272579: live control SHA256 bc00fa0d6a759df9c273e12ccb96720147b9bda824641f5a998a7c1253f6bb18, attestor0891e16b218036c69b3430d2c78246ac1c6c49e7a1e54648e7b2100c23d2ffe7. Native manifest unchanged. Publication verified all seven PIDs unchanged; query/prover ready.26 ProverActivation and16 QueryHost boundary/lifecycle checks passed. Public metadata readiness then passed for checkpointed and proposed tiers.
