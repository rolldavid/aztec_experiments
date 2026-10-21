# Anchored query gateway publication — 21 October 2026

These are the exact reviewed operator sources used for the successful second publication attempt. They are historical, pin-bound operators, not a generic restart command. Do not rerun against the now-promoted manifest.

The sole runtime source change was `prover/private-query.mjs` at commit `1d72b5e43e090cf749f72fbdbbdaa2080aa1c52e`. The resulting native manifest is `a461700b7e53774429eb76675964ff2aae11c68eafc2e23fc780fcf1f8cfd962`. Native binaries, contract artifacts, service configuration and application data were retained.

`inventory.py` collects nonsecret hashes, service state and process identities. `packet.py` binds the committed focused tests and integration gate to the source-only delta. `update.py` stages and promotes that exact delta; `dispatch.py` transports the immutable packet using the existing AWS credential provider. The packet builder retains its original temporary input paths so its saved bytes match the deployed operator. Those inputs remain under authorized operator custody; none contain source changes beyond the declared gateway file.

Promotion takes the existing writer locks, verifies the queue is idle, and validates contract/network identity against a fresh canonical checkpoint before closing proof admission. The checkpoint selector is ephemeral; historical deployment evidence is not rewritten. It then restarts the gateway, authenticated query and proxy. The moderator is explicitly restored because its existing systemd dependency stops it when the query service stops. Native node and application process identities are preserved. Before public admission, startup, exact configuration, canonical identity and readiness are checked.

Before reopening admission, failure restores the old metadata and runtime. Restoration attempts each required service independently before diagnostics, so a changed moderator PID cannot prevent proxy restoration. After new admission may have occurred, automatic rollback is prohibited to preserve any newly accepted proof jobs.

The initial attempt used the old historical activation checkpoint and failed. Its rollback assertion also prevented reopening the proxy after systemd stopped the dependent moderator. Existing services were restored immediately. The corrected operator first passed current-state identity validation, then promoted successfully. See `execution/evidence/G21/anchored-query/publication.json` for sanitized evidence. Full diagnostics and SSM request parameters are private under `.build/private/G21-anchored-query`; signed URLs and private configuration are not committed.

Existing completed native qualification was carried forward with explicit provenance. This source change was checked by 101 passing gateway tests and one retained-proof fixture skip, native syntax checks, independent review, the integration gate and live startup/readiness checks. This publication is not a new full native qualification campaign.
