# C generated application and next concurrency observation

Reviewer: `/root/reviewer_resume`, 14 October 2026. Read-only diagnosis against integrated application `953429ed8fbf4a0afdf666d3de74adebb3588ca1`; the observed C generation ran service `391dee212be5aa07d442ada070f3dda0b53aad4c`. No source edits, application execution, browser, service, provider or financial actions by reviewer.

## Confirmed failure and cause boundary

C accepted revision `a1d4da6b9682b6bbed3b905d9340bb33aacdd66c` fails the requested browser behavior. The existing real-browser record observes 0 → 2 → 6 and `ReferenceError: module is not defined`. Its retained source has separate click `+2` and keydown `+4` handlers, then unconditional `module.exports`. Its generated Node test supplies a mock document, loads that script with CommonJS `require`, and asserts 6 after Enter. Thus the test actively confirms the wrong behavior and its CommonJS execution masks the browser error. This is a concrete test/runtime mismatch in the produced application, not a conjectured native-chain or harness failure.

The latest canonical request explicitly contains the 0/click2/keyboard4 sequence. The approved input and discovered canonical parent text agree. `plugins/agent.mjs` retains this latest request verbatim as the main model user message; summary input explicitly excludes it. There is no evidence that summary compression lost this acceptance criterion. The private journal does not retain the actual summary or full provider wire transcript, so it cannot prove what every model response contained. The bad generated decision is observed model behavior, not proof of a deterministic agent transport defect.

The host correctly reports what it checks: isolated Node tests and build. `plugins/isolated-execution.mjs` invokes Node `--test`, then the build script, and validates bounded static artifacts. It does not load those artifacts in a browser. Its `passed` result is therefore not browser or user-specification acceptance. No source-backed security failure or test-run suppression was found. The hosted system instruction says “runtime has Node” without distinguishing the build/test runtime from the published browser runtime; this is a concrete instruction ambiguity that can encourage the observed mismatch.

## Smallest coherent correction

Clarify the existing static-application instruction in `plugins/main.mjs`: Node is the isolated build/test runner; published `dist` executes in a browser and has no CommonJS `module`, `exports`, `require`, or Node globals. Preserve the latest request's explicit expected state sequence in tests; do not change expected values to match implementation. Tests should exercise browser entry/registered handlers without injecting CommonJS globals into browser entry code. This is a prompt-quality repair in the existing component, not a guarantee of model correctness or a new validation framework.

For this generated counter, the minimal actual application repair is one `+2` activation behavior and no unconditional CommonJS export in the browser script. Native button click activation can cover pointer and keyboard without a duplicate keydown action. Existing Node test can evaluate the entry script in a `node:vm` context exposing only its required DOM double and no CommonJS globals, asserting 0 → 2 → 4. This is a labelled focused test, not a replacement for the existing real browser click/Enter/Space check and console-error inspection. Do not independently hand-edit accepted generated source outside the normal retained-repository continuation; the lead owns that next authorized action.

Use existing model tests to verify the latest acceptance request remains unchanged alongside the cheaper summary and that no instruction claims Node-only test success proves browser behavior. No new model call is needed to test that wiring. A subsequent ordinary authorized model continuation and real browser verification are still needed for generated-app acceptance. Preserve original failing revision and real billed records.

## Concurrency measurement after queue repair

RC29/RC41 require actual cross-thread concurrent execution. The previous C/D run does not qualify: saved canonical C finish1191 precedes D first reserve1192. Source14e's focused tests prove scheduling with doubles; current953 includes that repair, but no live overlap evidence has yet been established.

Before the next already-authorized paired run, use one bounded trusted observation at the existing provider execution boundary, recording only request/call identity, model identifier, monotonic start/end times, outcome class and retained billing-receipt linkage. A pair qualifies provider-request overlap when `max(startA,startB) < min(endA,endB)` for different threads, and both calls later settle to distinct real receipts. Keep source revision, observer hash and wall-clock correlation. This demonstrates overlapping provider requests; internal provider GPU scheduling is not observable and must not be claimed.

Two active jobs or simultaneous journal `possibly-sent` states alone are insufficient: private-bok-metering writes that state before additional canonical checks, and runPrivateBokRequest also checks canonical history before its actual provider call. These states can overlap without any provider HTTP requests overlapping. Exact per-call timestamps are absent from existing journals. Do not add a scheduler, new persistent accounting system or replay old calls for measurement. If the next run lacks precise provider boundary observation, record concurrency as unqualified rather than inferring a pass from publication or final accounting.

For the paired run also retain: both canonical invocations before first completion, independent thread/repository IDs, no same-thread overlap, exact read/accepted revision lineage, actual summary completion, generated tests and real browser results, canonical charge/refund, and unchanged historical uncertain-call fences. Source review and elapsed operation overlaps do not replace these requirements.

## Evidence inspected

- `execution/evidence/G14/c-step2-browser-20261014.json` in coordination.
- Controls `execution/evidence/G14/continued-campaign/cfix-391-source-terminal.json` and `two-followups-391-terminal.json` (actual canonical refunds now separately verified by Controls: C288182, D287478 micro).
- Private retained C source/test and approved/canonical request were inspected read-only; no raw private transcript or credentials copied into this report.
- Current `plugins/agent.mjs`, `main.mjs`, `github-tools.mjs`, `isolated-execution.mjs`, `private-bok-metering.mjs`, and `escrow-service.mjs`.
- `execution/evidence/G14/reviewer-summary-concurrency-391.json` and independent exact14e queue review.
