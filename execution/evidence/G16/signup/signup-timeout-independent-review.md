# Independent bounded review — 20 October 2026

Scope: root's current working-tree diff for avatar-upload, public-feed/source, browser-connection-check, deployment-manifest, legacy deployment engine, legacy censor signer, plugin operator/treasury/public fees/prepare, private-PXE CRS loader. Also reviewed replacement waiter proposal separately and current native/source publisher proposals. Read-only source review; no tests or live service actions performed by reviewer.

## Root timeout edits

No blocking correctness finding in inspected changes:
- Avatar conversion still checks explicit abort before/after awaited work, closes late decoded bitmaps, clears canvas backing stores, and enforces byte/dimension/output limits. Removed timer ownership has no remaining dangling references.
- Public-feed zero default reaches no timer; optional explicit finite limit remains validated for callers/tests. Public-feed-source removes the aggregate timer while retaining per-page reads, maxPages, maxEvents, and canonical conflicting-hash rejection.
- Deployment-manifest and legacy Ready checks give each read its existing bound; activation transaction waits are outside that bound. Legacy wallet forwards timeout0 to existing successful-receipt adapter, matching root's state-driven waiter changes.
- Browser connection verification no longer shares a diminishing global budget. Ethers/provider transport behavior remains the network-read boundary; verification checks/cleanup remain in place.
- Private-PXE CRS fetch still omits credentials, rejects redirects, and validates bounded response bytes against the pinned manifest; only the total download deadline changes.
- Legacy signer removes child runtime kill, preserving stdout bound, trusted executable/environment and journaled command behavior.
- Operator/Aztec fee waits use SDK timeout0; Ethereum operations remove ethers timeout argument while retaining status checks and journaled raw submission.

Remaining limitation worth preserving in integration notes: machine-operated plugin Ethereum helpers use hash-only waitForTransaction. An external same-nonce replacement can leave their original-hash waiter pending. They have no in-app wallet speed-up UI; this review did not silently extend scope into a second replacement scheduler. Fresh signup's wallet replacement handling is separately fixed and reviewed.

## Replacement waiter proposal

Reviewed /tmp/rolling-replacement-wait.patch after latest correction (3157644... reported by author). Approve for root application and focused tests: canonical RPC response preferred; retained genuine response is fallback; no synthetic transaction object; native replacement/error only wakes exact canonical intent reconciliation; account lifetime guards remain; wallet guard immediately precedes actual signer submission. No successful-funding result is inferred from cancellation/replacement alone.

## Native deployment proposal

Latest compact inventory is consistent with expected persistent-control topology: native71d5 manifest, control475ec7 pin, identical persistentHosting policy hash, no activationDelivery, healthy independent/application observers, no application failure marker. Current source95baf36d and native PID10376/startTicks284552 are bound. Bok is absent on core; proposal amended to preserve node/query/application PIDs and Bok not-found/inactive/PID0.

Reviewed staging, PINS-only patch, exact delta allowlist, whole manifest verification, source hardlink inode replacement, qualification provenance/rebinding, receipt creation using existing native helper, idle-queue gating, monitor writer locks, rollback and independent safety-timer preservation. No remaining blocking source-level finding. Requires owning agent's final native affected-test evidence and actual staged validation; no native execution/qualification is claimed by this review.

## Source publisher proposal

Requested corrections from publication_prepare before approval:
1. Bind old changed-file hashes to supplied observed inventory; checking only build/config hashes while computing source hashes opportunistically is insufficient publication baseline binding.
2. Derive moderator state directory from actual ExecStart; missing/wrong directory must not pass via empty glob/all(empty).
3. Verify moderator hosted.lock has been released after stop, just as Bok, before changing unit/restarting.

Source publisher final disposition pending corrected proposal and fresh expanded inventory. No repository or live writes.

## Source publisher final disposition

Re-reviewed corrected publisher SHA256 `59273d9a17be08ab33235b6a5e774b6d666304e0a605ced0a1a2ee748176fd18` and inventory SHA256 `81b8ab6de8994fa665db2d290fa97df69df1110177a87c25ce1d3fa6f9f03d94`: previous findings resolved. Moderator uses actual ExecStart state directory, canonical directory inode, expected DB set, and live PID lock; stop requires ownership lock release. Delta source hashes are bound to baseline before clone. Approve proposed publisher for owning agent use with fresh expanded inventories and passed integration gate. Existing earlier moderator inventory lacks new required fields and must be refreshed. Publisher startup result is not application functional proof; root retains live readback duty.

Final reviewed native proposal SHA256 `78fa8a3d8cb165d5c7b1643d69335949f3fbe7883a7eff96f498845edb23cf18`. Local pinned-control source SHA256 matches observed475ec7 exactly. Stage/promote must run serially with component publication so preservation assertions do not race intentional restarts.
