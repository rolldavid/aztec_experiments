# Native sync completion

This build-time transform removes only the bespoke remote postwrite freshness sweep. The pinned native synchronizer completes its captured L2BlockStream source plan; our added exact local anchor and all-tier acknowledgement checks remain. The selected/current prewrite numeric checks, typed source-event/header binding, conservative atomic rollback, failure flags and sibling drainage remain unchanged. All action simulation/proof admission checks remain unchanged.

The removed sweep ran after local commits. Rejection did not roll those commits back, and it could not prevent a fork immediately after the final response. Completion now reports the internally coherent captured plan. Later forks are processed by the next native sync; this is not a promise that a proposed block is final.

41 focused checks exercise the actual pinned L2BlockStream/BlockSynchronizer, LMDB, NoteStore, AnchorBlockStore and staged writes. Synthetic headers and NoteDao values are used; no live encrypted collateral or cryptographic proof qualification is claimed. Tests cover sparse conservative rollback, rollback transaction failure, same-height fork after commit retracting notes and spends on next sync, incomplete local acknowledgement, swallowed source/handler failures, moving-tier prewrite canonical guards, owned read drainage and cached public anchor reads. Stable sync has one source-tip read and no redundant numeric header; advancing sync performs selected prewrite validation once, followed by local completion checks.

Command:
ROLLING_NATIVE_TEST_ROOT='/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok' node --test /private/tmp/sync-completion-coherence-draft/candidate/scripts/pxe-sync-snapshot.test.mjs

The four initial failures were fixture assumptions that all tier acknowledgements remain unchanged when an advancing checkpoint event fails. Native proposed acknowledgement can already have succeeded. The final corruption fixtures use advancing proposed tier and still assert no note/anchor/tier mutation on their selected-event failures. No runtime fix was needed.

Prewrite is deliberately separate: its current/selected numeric checks still prevent advancing an old orphan anchor without preceding rollback under contradictory source observations or the finalized walk-back floor. Removing them requires a separate native coherence argument; this patch does not alter them.

Expected saved work: one postwrite remote tips/header wave per completed sync (historical measured phase roughly 0.24–0.36 seconds, more only when moving-tier rechecks occurred). No new live performance claim.
