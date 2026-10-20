# Independent review

Reviewer `/root/ux_review`, read-only. Product and harness structural review approved after fixes to new-user routing, existing-deposit routing, stale Bok topup selection, automatic topup gas estimation, false immediate-posting readiness, and obsolete selectors. No new payment replay, refund identity, provider icon injection or private-state boundary defect found. Harness retains explicit scenarios and no-replay assertions without extra retries/fallbacks/lifecycle owners. Source hashes supplied by reviewer are stored in review-hashes.json.

Deployment script independently approved for scoped app cutover: baseline verification, explicit closure, atomic shared-inode preservation, idle-payment and journal fences, configuration/PID checks, and app-unit-only rollback. HTTP/served-asset readback remains required after process start.

`/root/funding_investigation` independently checked contract/default choices, refund conditions and deployment/attestation behavior. The application attestor monitors query/prover admission; app-only working-directory change does not require disabling or amending it. Current timers and protected native/control sources remain.

Final supplemental approval: CRS compressed-length fix, decoded-bound regression tests, actual-runtime diagnostic and revised12-file deployment closure approved by ux_review. Reported hashes match review-hashes.json. No retry/fallback or verification weakening introduced.
