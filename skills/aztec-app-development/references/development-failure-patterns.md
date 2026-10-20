# Evidence behind the development guidance

This is optional diagnostic background from the “Implement latest application spec” investigation, reviewed 15 October 2026. The original Draft 3 specification explicitly requested local development with proofs disabled and the same transaction flow on testnet. These cases explain skill decisions; they are not new work packages, prerequisites or release gates. Source paths below refer to the investigated local workspace and may not exist elsewhere.

## Native development capabilities were treated as inadequate

Historical environment decisions rejected synthetic local settlement and disabled-proof configurations in favor of real server proofs and ordinary sequencer behavior. The installed rc.3 native local-network factory instead supplies automine, synthetic settlement and disabled proving together. Some later persistent setup adopted automine; the historical mistake must not be described as the configuration of every current runner.

The correction is to use the existing native application-development abstraction and check effective configuration across node, PXE, browser and assertions. Changing only the launcher left browser proving enabled and proof-count expectations incompatible with the new mode.

Evidence: [historical proof-environment decision](</Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/evidence/C01/proof-environment-preparation.md>); installed source locations are in [native-controls.md](native-controls.md).

## Read amplification survived disabling proofs

A public-index rebuild and reopen issued **39,242 RPC requests in 97.963 seconds**, with proving disabled and no wallet/signing involved. Counts included 4,524 node-info reads, 9,112 contract reads and 23,920 block-data reads. This measured a small retained chain, not a dense archive or private-preference restoration. Its aggregate average was approximately 401 requests/second; no peak-rate series was recorded in this artifact.

Repeated identity discovery and historical reads are targets for query-plan investigation. The artifact does not establish that every call can be removed, nor quantify a repaired implementation. Measure by operation/method, inspect repeated arguments and callers, and eliminate redundant work. Treat this trace as a query-plan problem: spreading the same 39,242 calls over a longer period would not demonstrate improved efficiency.

Evidence: [actual public-index measurement](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/execution/evidence/G07/retained-chain-clean-rebuild/actual.json>).

## Tests and implementation shared incorrect assumptions

A FeeJuice receipt verifier reconstructed the message with the physical portal as sender; the actual Inbox used the FeeJuice system identity. Its fixture repeated the same encoding assumption. The real flow exposed the mismatch. Another failure passed SDK field objects to a journal expecting primitive credentials; standalone tests already supplied primitives and missed the integration boundary.

The useful check is the real SDK/application composition with independently established expected values. It can often be isolated without running onboarding, funding and a browser campaign again. Use native serializers/helpers instead of duplicating protocol encoding.

Evidence: [FeeJuice sender review](</Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/evidence/G02/query-operator-auth/reviewer-1b2c-fee-sender-review.json>), [journal credential diagnosis](</Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/evidence/G02/query-operator-auth/reviewer-withdrawal-journal-credential-diagnosis.json>).

## Frontend rebuilds were coupled to chain restarts

An application build record explicitly reports restarting the native network to reload its immutable asset inventory. The combined launcher owned the reader/assets and native fixture together. That lifecycle coupling turned frontend iteration into infrastructure work.

Reload affected application services/assets while keeping the network running. Retain release-package integrity checks at their proper boundary; do not weaken them or build another harness to compensate for coupled lifecycles.

Evidence: [backup import build record](</Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/execution/evidence/G07/backup-import-build.json>).

## Retained development state became its own project

A retained Anvil snapshot reached **6.34 GB**. A focused standalone load needed **55.571 seconds** to expose RPC and approximately **6.3 GiB** peak resident memory. The snapshot was readable; this probe did not establish the cause of failures in combined application startup. Separate investigations found duplicate cache/dump storage.

Reuse healthy state, but prefer small reproducible fixtures and coherent resets when local state becomes burdensome. Product requirements for account restoration or reload after payment do not require keeping an agent's growing local chain indefinitely.

Evidence: [standalone load assessment](</Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/evidence/G07/recovery-cost/native-load-08c88-assessment.json>).

## Repeated campaigns and review handoffs amplified each mistake

The raw chat shows repeated full browser/fixture campaigns for diagnosis and obsolete assertions, plus separate handoffs around small test and diagnostic repairs. This inflated the cost of otherwise narrow defects. Run the changed behavior's focused check immediately and review coherent fixes under existing project requirements. Preserve useful first-failure diagnostics so the next run answers a new question. Do not recreate the project's execution graph as a universal skill requirement.

Raw record: [implementation chat transcript](</Users/zac/.codex/sessions/2026/10/11/rollout-2026-10-11T11-14-40-01a12a75-1b50-7871-a73b-4253a1010194.jsonl>). Episode durations overlap parallel work; they are not additive agent-hours.

## What this establishes

The evidence supports concrete changes to environment selection, data access, SDK integration and iteration workflow. It does not isolate “security consciousness” as the single cause, or measure a 50× gap against a backend-server implementation. The skill's effectiveness must be judged by completed application behavior, fewer requests, faster edit-to-result cycles and fewer repeated detours—not by a passing skill-format validator.

## Retrospective skill review, 15 October 2026

The raw implementation chat, original specification, recorded runs and Git patches were checked again against the skill. This is causal analysis of observed decisions, not a controlled measurement of what a different agent would have done.

| Observed decision or outcome | Skill coverage and remaining limitation |
| --- | --- |
| Before the 13 October proof correction, 59 recorded application-proof-enabled runs consumed 377.83 runner minutes; 32 failed. | Native proof flags and effective browser configuration directly address the wrong development mode. These minutes include setup/testing, not only proving; they are not a savings estimate. |
| Six notification-browser campaigns failed between 12 October 11:05 and 13:26 UTC, consuming 30.68 runner minutes. Several failures exposed only fixture/browser exit categories. | Preserve the first error and reproduce its boundary before rerunning. Skill guidance cannot recover diagnostics the old harness did not record. |
| On 14 October the agent called the wallet's rejection of an ahead-of-wall-clock local chain correct, then repaired clock configuration. | The state-only rule directly rejects the premise. Removing an invented check must preserve the actual required state validation. |
| Native automine/settlement was discovered on 14 October at 00:53 UTC, after restart/pruning problems. | Inspect the installed native development entry point before assembling protocol machinery. A passing inherited fixture is not evidence of an appropriate development architecture. |
| Commit `e9a0df2` raised retained-snapshot startup from 60 to 120 seconds; later the preview ran on a fresh roughly 61 MB chain. | The revised skill chooses a fresh coherent fixture when retaining disposable history blocks work, unless the check needs that exact history. It does not wait for repeated failed rescue attempts. |
| On 15 October a focused recovery check processed 256 empty blocks in 4.32 seconds versus 32 in 4.83 seconds under the same simulated latency. The agent subsequently noted that populated history prevented predicting whole-journey acceptance. | Architectural optimization can improve throughput substantially. Preserve the failure-causing workload in the focused reproduction; an empty-page microbenchmark is not application acceptance or a whole-project speedup. |

The evidence scan above covers root `execution/evidence/**/application-*.json` with `startedAt` from 11 October through 13 October 15:51 UTC and an explicit boolean `applicationProofs`. It excludes copies in other worktrees. Runner durations and chat episode spans overlap other work and must not be added as elapsed project time.

A separate read-only decision exercise supplied the skill and raw snapshot/build/proof-environment records to an independent agent. The first response still included more retained-startup diagnosis. After clarifying the disposable-state rule, it selected a fresh fixture and actual wallet restoration. It also exposed overly broad preflight wording, which was narrowed to the affected path. This establishes limited decision-level evidence, not implementation success or measured acceleration. The reviewer also suggested allowing application timing exceptions; that suggestion was rejected under the user's explicit state-only requirement.

The original implementation instructions explicitly required independent review and integration gates; some later workflow changes were already user-authorized. The skill must distinguish those requirements from accidental per-step ceremony. It cannot silently remove required acceptance to make the speed comparison look favorable.

## Additional decision replay, 15 October 2026

Eight further checkpoints from the raw transcript were replayed against the skill, without executing application work. Source patches were inspected where indicated. This tests plausible next decisions, not measured implementation speed.

| Evidence | Gap tested and resulting guidance |
| --- | --- |
| Transcript lines 2877 and 24890: stale manifests/artifacts interrupted chain runs and packaging. | Repeated manual repair could satisfy “rebuild affected components.” Fix recurring dependency errors in the existing build and reuse matching artifacts. Do not build a new provenance system. |
| Line 94038; commit `0a6bbdd`: moderation called a method absent from the owned-reader facade; the test double had exposed it. | Exercise real exported interfaces early. Testing only after a full application journey discovers the mismatch too late. |
| Line 65443: a test located code by exact source-line text. | Fix brittle test coupling at its cause rather than accumulate new text-matching patches. This is distinct from legitimate artifact-integrity checks. |
| Lines 107492–107553: a failed node read was followed by checking the saved intent, which was still prepared with no signed transaction recorded. | Inspect actual operation stage first. A demonstrably pre-submission failure needs boundary repair; an unobserved outcome alone still requires reconciliation. The recorded check itself was not shown to be wasteful. |
| Lines 116699 and 123502–123739: scan failure handed off for diagnosis; a stale reorg fixture later proved to request rollback of a finalized block. | Keep ordinary diagnosis with the implementer. Repair the smallest valid scenario and return to features after relevant verification; an independent diagnostic handoff is not a default prerequisite. |
| Lines 116891–116929: a selector failed after successful transaction phases; its repair did not repeat them. | Positive example: reuse valid completed stages under existing evidence rules. |

The other replay checkpoints were a GitHub-authentication integration hold (112087) and a model-run timeout with a missing transfer receipt (113644). Neither establishes dispensable ceremony: the first involved an explicit gate, and the second required distinguishing runner failure from model failure and determining the transfer outcome. Commit `ecc3f0c` confirmed the runner shortened the model request timeout at the batch boundary. No application timing exception was added to the skill.

An independent agent read the then-current skill and the eight historical checkpoints without proposed answers. Its responses generally chose focused work, but still left room for broad transaction reconciliation and open-ended diagnosis. After revision, replay of four checkpoints chose conditional reconciliation based on the recorded stage, implementer-owned repair and explicit stopping at the relevant verified behavior. This is limited decision evidence from a before/after exercise, not a blinded benchmark or proof of delivery improvement. The entrypoint was shortened while adding these corrections; no new checklist, script or gate was created.

## Shorter skill replay

The 1,256-word entrypoint was tested at 13 transcript checkpoints: 2877, 63599, 77381, 94038, 107026, 107492, 112087, 113644, 114684, 115960, 116699, 116891 and 123502. Two independent readers received the same observations and implementation request, without prior conclusions or this evidence file. One received the complete skill; the other received it without the opening intent section. Both could consult the native-control and RPC references. This was a read-only decision exercise, not application execution.

Both selected browser proof-configuration repair, removal of application clock gates, focused interface/scan/fixture repairs and reuse of successful transaction stages. Both retained explicit acceptance gates and reconciliation of truly uncertain submissions. No material loss of these protections was observed after compression. Most selected actions were alike, so this comparison does not establish that the opening intent independently caused better decisions. The reader without that introduction raised a possible security justification for timestamp freshness in its caveats, although its selected action still removed the clock gate. That is a warning against dropping the explicit state-only rule, not proof of a causal difference from one sample.

The snapshot case initially looked like continued preservation of disposable state. Fuller context at lines 114621–114801 showed loading had already succeeded and the diagnostic probe failed during shutdown; normal startup subsequently passed. It does not justify a blanket rule to reset after every fixture failure. Exact-history necessity and the cheaper valid route remain contextual judgments.

No additional execution rules were added from this exercise. Concrete rules about state, effective proof settings and relevant verification still carry essential information; the opening intent supplies priorities for cases they do not enumerate.

**50× remains unvalidated.** Equivalent completed scope would need to take 2% of the baseline elapsed time. The audit identifies removable work and several plausible mechanisms, but provides neither that complete baseline nor an equivalent implementation using the skill. Historical diagnosis, forward decision checks and actual measured application delivery are different evidence levels.
