## Owner correction — 18 October 2026: development loop

Apply `/Users/zac/.codex/skills/aztec-app-development/SKILL.md` to remaining work.
Use native devnet/PXE disabled-proof flags; native state/receipt controls, no custom
mining clocks, sleeps or time-based progress. Small changes get focused existing
unit/boundary tests immediately. Batch application/test repairs for review and the
normal integration gate. No migration obligation for disposable local chains;
preserve old state separately when moving to a fresh fixture. Keep only concise
change-boundary decisions and necessary acceptance evidence. Do not resume the
queued old-chain observer/refund journey merely because it was the previous task.
Real-proof testnet and final product/release requirements remain unchanged.

# Draft 3 clarifications

## 11 October 2026 — authenticated bot identity is public

Owner clarification: revealing Bok’s identity is allowed because Bok is not a human user. Authenticated bot identity and linked replies should remain publicly recognizable. This does not authorize exposing the human caller’s private account, grouping their usernames, or linking their anonymous activity. Draft3 page 6 requires replacement of the current account-to-request disclosure. The existing `on_invocation(account, post_id)` public callback refers to the invoking human account, not merely Bok’s bot identity. G10 retains the caller-privacy requirement; no change to the original PDF is needed.

## Private preferences and early feasibility

Page 2 excludes private bookmarks/follows/preferences from public persistent social state. Pages 6 and 9 explicitly require encrypted onchain records and key-assisted restoration. G07 therefore implements encrypted chain-backed recovery without publishing plaintext relationships. This resolves the apparent wording tension without dropping either privacy or recovery.

Independent review identified that aggregate funding cannot qualify against legacy public account-linked Bok escrow. G14 now establishes the private payment interface before G04; G08 demonstrates posting and an actual Bok invocation through that interface. G10 then expands persistent workspaces and summarization. Avatar encoding, cost, quality and archival feasibility moves into G03 before profile protocol freeze.

## Component acceptance and full requirement closure

Independent dependency review found copied whole-product acceptance text in early
tasks required features assigned to their own descendants (for example G06
required G07 preferences, while G07 starts after G06). The RC01–RC46 catalog,
authority, task mapping and stable acceptance IDs are unchanged. Duplicated
criteria now identify their owned component and complementary criteria explicitly.
The full original requirement remains on each scoped criterion. G13-A01 requires
the conjunction of every mapped component and the integrated final-candidate
scenario; no partial component result closes a whole requirement. This repairs
execution ordering without waiving preferences, privacy, publication or any other
product behavior. No task was marked complete as part of this correction.

## 13 October 2026 — development proof flags

Owner directs all development and debugging to devnet with native proof flags disabled at both the node/devnet (`realProofs: false`) and PXE (`proverEnabled: false`). The existing development runner defaults to `BOARD_TEST_PROOFS=disabled`. This is configuration only: application code, verification logic and cryptographic implementation must not be changed to bypass proofs. Real proofs are reserved for testnet acceptance. Historical evidence remains historical, and real-proof acceptance requirements, independent review, soak and network release gates remain mandatory. Development results never substitute for testnet proof acceptance.

## 13 October 2026 — development uses native proof configuration

Owner instruction: development and debugging use devnet with the native node `realProofs: false` and PXE `proverEnabled: false` flags. The development runner defaults to that configuration. This does not authorize modifying application cryptography, replacing proof dependencies with stubs, or weakening acceptance assertions. Real proofs remain mandatory for testnet acceptance. Historical real-proof evidence remains preserved. A setup or harness failure must be diagnosed with the smallest existing focused check before another expensive run; no separate tooling project.

## 13 October 2026 — owner-directed development loop

Implementers own components through implementation and debugging and may run focused local tests immediately without pre-run review. Batch each coherent application change with its test and fixture repairs for independent review before integration. Do not create separate preparation, source-review, execution-review or integration cycles for individual assertion repairs. Run the integration gate normally; rerun its negative self-tests only when the gate changes. Reuse existing development environments where isolation permits; fresh deployments and funding are for checks that require them. Continue with native devnet/PXE proofs disabled for development; targeted real-proof testnet acceptance and all final requirements remain. No new harness or process-improvement project. Passing the existing native flag from validated development configuration into PXE is configuration plumbing; no proof bypass, cryptographic modification or production verification weakening is authorized.

## 13 October 2026 — personal GitHub account for Bok

Owner explicitly selected the personal `zac-williamson` account instead of a dedicated organization. Public GitHub identity readback is user ID1476668. This supersedes Draft3 RC32's organization requirement only; the dedicated GitHub App, trusted broker, generated-code isolation, scoped per-thread repository writes and preservation of unrelated repositories/access remain required. Private thread repositories are a reversible engineering default; the public current source download remains on the artifact service. Do not broaden the App to every personal repository to simplify provisioning. The personal-account broker adapter is integrated at989d53f with selected-repository restrictions. Actual App installation acceptance awaits GitHub browser sign-in and setup.


## 14 October 2026 — disk footprint and GitHub setup approval

Owner directed removal of at least40GB project data after deleting Anvil temporary state, then continuing implementation. Cleanup removed46.6GB of project allocation; exact manifest/results are execution/evidence/G02/disk-cleanup-20261014.json. Keep bounded checkpoints/cache, preserve results and private journals, and never infer live chain continuity from historical results. A latest stopped native snapshot survived and requires validation before reuse.

Owner action-time approval received to create/install Rolling Chat Bok on zac-williamson, with Contents read/write, Administration read/write, Metadata read, restricted to dedicated Bok repositories; private key remains operator-only on this Mac. No unrelated repository or all-repositories selection is authorized. App5317701 installed as171412624 with selected-only bootstrap repository1419258557; live availability verified. First unused key4862919 revoked after explicit owner approval; active4862939 retained. Owner additionally authorizes application GitHub configuration changes; unrelated repositories and product permission boundaries remain preserved.

## 14 October 2026 — broad application GitHub authorization

Owner explicitly authorizes future application-scoped GitHub configuration changes without routine per-change approval and requests broad bot permissions. Applied20 read/write repository permissions plus metadata read to Rolling Chat Bok installation171412624, retaining dedicated selected repositories. This supersedes the earlier three-permission setup default. Trusted broker and generated-code isolation, unrelated repositories, private visibility, no developer credentials in generated code, and release gates remain. Permission breadth is not proof of a supported personal-account provisioning API.

## 18 October 2026 — feature delivery first; final acceptance at the end

The owner retains the full requirement: “Delete the core database and rebuild from chain records and retained archive data. Restore private bookmarks, follows and preferences with user keys. Repeat across a simulated reorg.” Implement any remaining support and run this scenario only after all other application functionality is implemented. It is not removed and is not a routine per-change check.

Core/Bok recovery runbooks and repository/artifact backups remain final handover work. Backup/restore, outage/restart, clean independent deployment, full privacy traces, large-workload qualification, complete wallet/funding interruption matrix and real-proof testnet journeys belong to the final application acceptance stage. Preserve historical results. Re-run only an affected failed check after a relevant repair; do not repeat these exercises for unrelated edits. Development uses focused checks and one independent review of each coherent change before the normal integration gate.


## Owner delivery deadline — 18 October 2026

The owner explicitly removes the fixed14-day/336-hour soak. Complete implementation and acceptance within72hours of2026-10-18T15:25:57Z (deadline2026-10-21T15:25:57Z). T06 now requires bounded representative reliability and failure/recovery exercises on the final candidate, with real observed outcomes and incident accounting, without a minimum elapsed waiting period. Acceptance is assigned implementation work and must continue autonomously; its outstanding status is not a stopping condition. Preserve source-bound evidence, real-proof testnet acceptance, independent specialist review and network clearance; record any specific external prerequisite honestly. This amendment supersedes older duration instructions, including in the attached PDF, while retaining historical evidence. It does not change contract penalty/cooldown durations.

## Owner instruction — no VoiceOver activation

The owner explicitly prohibits turning on VoiceOver on this Mac (19 October 2026 local time). Do not enable it or change system accessibility settings for testing. This restriction is superseded in scope by the removal of all accessibility requirements below. VoiceOver was verified off after the interruption.

## Owner scope amendment — 19 October 2026: proof of concept, no accessibility qualification

The owner removes all accessibility items from this proof-of-concept specification and acceptance task list. This supersedes the attached Draft 3 wording about keyboard navigation, focus, readable contrast and screen-reader status announcements, and related engineering targets or inferred assistive-technology requirements. Do not schedule or run accessibility qualification, including VoiceOver, screen-reader announcements, keyboard/focus audits or WCAG contrast checks. These are removed requirements, not passed checks. Ordinary working navigation, readable application content and honest visible loading/error/transaction states remain functional product behavior. Existing UI improvements and historical evidence need not be deleted. Do not enable VoiceOver or change the Mac’s accessibility settings.

## 19 October 2026 — authenticated rebuild measurement scope

Independent source review confirms Draft3 pages6/9 require authenticated reconstruction, cold/warm measurements and disclosed dataset size; they do not require10,000 authentic onchain posts. The authenticated10k threshold was a reversible lead-created engineering target, not an owner requirement. Retire that unvalidated corpus assumption without claiming it passed. Measure representative retained real posts/threads/identities/policies, preserve the10k synthetic UI evidence as synthetic and retain the explicit layered >1000-record C04 check. Do not generate2,500 transactions solely to satisfy the invented corpus gate. This corrects the implementation interpretation; it does not remove authenticated recovery or performance reporting.

## 19 October 2026 — infrastructure ceiling

Owner explicitly raises the cumulative infrastructure ceiling to USD500 ("I approve a $500 ceiling"). This supersedes USD300, not USD500 additional. Retain all resource reconciliation, spending buffers, independent shutdown controls and other scope/release restrictions. The first reviewed use is the same host through10:45UTC and endpoints10:50UTC, complete forecastUSD312.267094, reservationUSD315. No new server is implied.


## 19 October 2026 — independently operated Bok

The owner requires Bok to run on a separate server as an independently operated plugin, with an explicitly funded Aztec account that signs and pays for its board replies. Preserve that account and pending transaction identity when moving the service; do not use the requesting user’s account or give generated applications access to signing or developer credentials. A running process alone is not acceptance: the actual request must produce its authenticated board reply and the promised usable artifact/source. The earlier permission to reveal Bok’s public identity remains unchanged.

## Owner correction — transaction progress, 20 October 2026

Ordinary application and plugin operations advance on canonical checkpointed Aztec success or a canonical mined Ethereum receipt, not full network finality. Funding claims require actual message consumability at the consuming PXE's configured tip; withdrawals require the native Outbox witness and successful portal preflight. Do not add a second finalized-head gate. Preserve original transaction identity, reorg checks and native per-secret PXE dependencies; do not lock unrelated wallet actions behind a reverted transaction's finality. Use native state waiters and local mining/settlement controls. Canonical inclusion must never be labelled finalized. This owner direction supersedes older blanket finality requirements in the specification, fixtures and operating notes.

## Owner hosting and scheduling amendments — 20 October 2026

The owner authorizes USD1,500/month for ongoing hosting, asks that the application remain online, and supersedes the old cumulative campaign ceiling and demo shutdown intent. Persistent native/cloud cutover is complete; preserve security and failure containment. The owner subsequently requested stopping all scheduled project tasks: the Codex monitor was deleted, while live application services remain running. Do not recreate scheduled agent work without a new request. See START_HERE.md for actual resources, known readiness limits and forecast.
