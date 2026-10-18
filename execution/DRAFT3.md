# Rolling Chat Draft 3 execution

Source: Rolling Chat Contractor Specification Draft3, all11pages, SHA256 in draft3-requirements.json. This file and requirement map are new supplemental engineering records, not claims of application acceptance. The existing ignored local execution/graph.json and historical evidence remain the execution ledger; do not force-add132MB of earlier private working evidence.

Run `python3 execution/graph.py validate`, `python3 execution/specification_check.py`, then `python3 execution/graph.py next` in the established workspace. Every new G01–G14 task has declared paths, owner, branch, dependencies, item-level criteria, evidence paths and verification method in that graph. planned=ready only when dependencies pass; active=running; verification=checks; review=independent review; done=verified and integrated. Changes requested remain active/review with concrete findings. blocked requires evidence and recovery condition.

Integration uses execution/integration_gate.py with a lead-owned hashed policy and exact candidate/base review/check/evidence records. A work commit is not an integrated candidate. See INTEGRATION.md. Registry uses actual runtime handles and retains concise handoffs; raw runtime histories stay in host storage.

Standing authority follows the11October user mandate and specification-clarifications.md. Baseline master458724c is historical. Existing audit/network and bounded final reliability gates remain mandatory, and development acceptance never implies production qualification.

## 18 October 2026 — feature delivery first; final acceptance at the end

The owner retains the full requirement: “Delete the core database and rebuild from chain records and retained archive data. Restore private bookmarks, follows and preferences with user keys. Repeat across a simulated reorg.” Implement any remaining support and run this scenario only after all other application functionality is implemented. It is not removed and is not a routine per-change check.

Core/Bok recovery runbooks and repository/artifact backups remain final handover work. Backup/restore, outage/restart, clean independent deployment, full privacy traces, large-workload qualification, complete wallet/funding interruption matrix and real-proof testnet journeys belong to the final application acceptance stage. Preserve historical results. Re-run only an affected failed check after a relevant repair; do not repeat these exercises for unrelated edits. Development uses focused checks and one independent review of each coherent change before the normal integration gate.


## Owner delivery deadline — 18 October 2026

The owner explicitly removes the fixed14-day/336-hour soak. Complete implementation and acceptance within72hours of2026-10-18T15:25:57Z (deadline2026-10-21T15:25:57Z). T06 now requires bounded representative reliability and failure/recovery exercises on the final candidate, with real observed outcomes and incident accounting, without a minimum elapsed waiting period. Acceptance is assigned implementation work and must continue autonomously; its outstanding status is not a stopping condition. Preserve source-bound evidence, real-proof testnet acceptance, independent specialist review and network clearance; record any specific external prerequisite honestly. This amendment supersedes older duration instructions, including in the attached PDF, while retaining historical evidence. It does not change contract penalty/cooldown durations.
