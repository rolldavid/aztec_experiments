# Bok request latency — 23 October 2026

This investigation measures from the browser's actual Post click through the
canonical Bok reply, charge/refund, and automatic browser rendering. It uses the
existing funded test identity and real proofs on stable Aztec testnet 6.0.0.
There are no Ethereum transactions in an already-funded `@bok` request.

## Published result

The repeat real-proof request completed in **443.421 seconds (7m23s)**, versus
**1,020.560 seconds (17m01s)** for the earlier successful request: 577.139 seconds
shorter, an observed **56.55% reduction / 2.30× faster**. The authenticated reply
appeared automatically in the already-open browser at **440.354 seconds**;
terminal accounting observation completed 3.065 seconds later. No manual refresh,
operator settlement or request replay was needed.

**Workload qualification:** the new request asked for a rebuild, but Bok retained
the existing HTML and added/repaired the browser test plan. It published revision
`028da8d40cdd024b67e72956a411aa38a8886c83` after the actual isolated browser gate.
This is a measured successful update/publication flow, **not a fresh application
generation benchmark or a controlled same-workload comparison**. Model output,
repair count and testnet confirmation time vary. Do not attribute the whole
577-second difference to the code changes, or promise this latency for every app.

The live flow now sends **three Aztec transactions and zero Ethereum transactions**:

1. Authorize Bok spending and publish the user's post together.
2. Reserve the request's spending allowance before paid model work.
3. Settle the actual charge, publish the authenticated reply and return unused
   credit together.

Request `0x1963faf148cb8bb50f9386a5b52306325b7fd36051a31c31641582cdac0eb2a7`
charged **0.045416 USDC**, returned **0.204584 USDC**, and has zero reserved credit.
Its final transaction `0x1a4135cea8c6b1781164b3e6dac9d4a46ca102132f02489fe014b53bfd9095ea`
is canonical in checkpointed Aztec block 1286. "Settled" here means this canonical
application accounting, not Ethereum proven/finalized settlement.

## Where the 7m23s went

These categories partition the entire observed interval; nested spans are not
added twice. Values are rounded to milliseconds.

| Work | Seconds | Share |
| --- | ---: | ---: |
| Three Aztec confirmation waits | 154.903 | 34.93% |
| Model provider responses, 10 calls | 96.282 | 21.71% |
| Proof stages: browser 48.728 + operator 12.296 | 61.024 | 13.76% |
| Browser preparation, fee estimate and other work before proof | 47.342 | 10.68% |
| Board reads, 14 calls | 26.346 | 5.94% |
| Workspace validation and publication acceptance | 19.746 | 4.45% |
| Other measured RPC/setup/tools | 14.070 | 3.17% |
| Other worker work not separately instrumented | 18.749 | 4.23% |
| Submission and browser-to-worker handoff | 4.959 | 1.12% |
| **Total** | **443.421** | **100%** |

User post confirmation took 151.672 seconds. The browser preparation span includes
10.089 seconds of synchronization; the fee estimate took 15.736 seconds. Those
are included in the table, not additional time. The worker ran for 288.529
seconds. Its two confirmation waits were 51.035 and 50.005 seconds; user post
confirmation waited 53.863 seconds. Wait spans include observation/verification
overhead as well as chain progress.

The final feed notification/update took 0.750 seconds, of which DOM rendering was
0.017 seconds. It overlapped the worker's final verification and is therefore
not added to the table. The browser proof span includes local witness work,
upload, remote proving/polling and verification, not just prover arithmetic.
Cross-machine correlation assumes UTC clocks agree; individual span durations use
monotonic clocks. The [complete partition](../execution/evidence/G21/stable6/bok-latency/second-run-partition.json)
retains boundaries, source hashes and explicit unattributed time.

## What the previous 17-minute result establishes

The original successful Daily Three request took 1,020.560 seconds from Post to
terminal accounting. It used six Aztec transactions: authorize, post, reserve,
settle, reply, and finish. App publication occurred at 801.244 seconds; final
accounting followed 219.316 seconds later. The old feed required a refresh, so
this was not an automatically rendered browser completion measurement.

The old run had eight model calls, including directory/source discovery. It did
not retain separate proof, RPC, provider or rendering timings. Its block-header
timestamps are protocol times, not observed receipt arrival times. Those cannot
honestly be used to assign exact durations to individual old stages.

## Changes

- Combine user authorization and posting into one atomic transaction.
- Combine operator settlement, authenticated reply and unused-credit refund into
  one atomic transaction. The reservation remains a separate transaction.
- Keep one wallet operation scope through preparation and submission, with one
  strict fee estimate; close the composer after confirmation.
- Read independent chain values concurrently against one canonical block hash.
  Remove repeated board checks while retaining the check immediately before paid
  provider execution. A counted adapter fixture reduced escrow-guard RPCs from
  380 to 29; that is a call count, not a wall-clock speedup claim.
- Supply a bounded initial repository snapshot and instruct Bok to use provided
  source and group related edits before checking them.
- Push actual index-content revisions to browsers. Refresh public content
  automatically without resetting scroll or an open draft.
- Record bounded, content-free browser and worker stage timings.
- Refresh cached Bok credit when opening the composer, without blocking typing or
  clearing drafts. The test found that a completed refund could otherwise leave
  a stale insufficient-balance display. This UI-only fix is also published.

No contracts, account ownership or deployment addresses were changed.
Real proofs, canonical checks, payment limits and generated-app sandboxing remain.

## First instrumented run: a real validator defect

This run ended after 797.878 seconds with correct terminal accounting, but app
generation failed. It is **not a successful performance result**. The failure
reply rendered automatically at 794.332 seconds.

| Measured work | Seconds |
| --- | ---: |
| Browser click to confirmed user post | 148.232 |
| Model HTTP calls, 16 calls | 290.410 |
| Repeated board reads | 82.632 |
| Explicit workspace checks | 95.175 |
| Final failed app acceptance | 17.932 |
| Operator reservation and final proof generation | 12.160 |
| Operator checkpoint waits | 112.427 |

This is a selected breakdown. The [complete partition](../execution/evidence/G21/stable6/bok-latency/first-run-partition.json) assigns each millisecond once and excludes nested enclosing spans.
Browser preparation took 7.863 seconds, estimation 8.859 seconds, the proof stage
42.215 seconds and confirmation 82.375 seconds. The proof stage includes local
witness work, upload, remote processing and browser verification. Resource timing
separates it into 7.115 seconds before upload, 4.932 seconds uploading, 25.689
seconds remote processing/polling, and 4.480 seconds after the result.

The validator inspected control visibility and identity in separate browser
tasks. A hash-change rerender could detach a checkbox between them; its detached
label became `nth-of-type(0)`. The validator then demanded tests for this
nonexistent control, driving six test-plan rewrites. A real browser reproduced
the exact failure. Atomic DOM capture fixes it: the same failed app passes all
140 checks unchanged. Regression tests still reject untested siblings and permission failures, and
require coverage for controls that are explicitly re-enabled.

## Interpretation and remaining opportunities

The biggest measured waste was repeated transaction round trips and a validator
race that forced unnecessary model repairs. Both are fixed and published. The
first instrumented run's 82.632 seconds of board reads fell to 26.346 seconds in
the successful repeat, but this combines fewer model turns and cheaper reads:
it is not an isolated per-read benchmark.

The remaining targets are:

- **Chain dependencies (154.903s):** three waits remain. Further reduction needs a
  specifically verified reservation/accounting design or lower checkpoint latency;
  reducing a receipt polling interval does not eliminate these waits. The current
  three-transaction design is verified with actual proofs and atomic rollback tests.
- **Model turns (96.282s):** ten calls remain, including redundant discovery despite
  seeded source context. Guidance is improved, but this run shows it does not
  reliably eliminate those turns. A changed tool/model flow needs a fresh-app
  benchmark before claiming another gain; retained HTML is insufficient evidence.
- **Browser proof and preparation (96.070s combined):** separate remaining PXE
  synchronization, fee simulation, witness generation and transfer work before
  optimizing. The SDK's prove call still performs witness work; renaming it to a
  combined simulate/prove API would not demonstrate that the work disappeared.


The normal flow waits for three dependent Aztec checkpoints, not proven or
finalized L1 settlement. SDK transaction waits have no elapsed-time failure
deadline. One-second receipt polling is not the source of multi-minute waits.

The remote prover currently uses one thread. More threads may reduce part of the
25.689-second remote interval; they cannot remove local witness generation,
upload or blockchain waits. The six-second Bok reservation proof is a smaller
target. No unmeasured thread-count speedup is claimed. No hosts were added or resized;
prover thread counts were unchanged.

## Verification and publication

Five native contract/SDK scenarios checked transaction order, charge/refund and
atomic rollback with native proofs disabled. The actual testnet runs then proved
the user batch, reservation and final accounting/reply batch normally. Focused
integrated checks passed 193 tests (16 opt-in browser cases skipped there);
23 actual browser validator checks passed separately. The unchanged previously
rejected candidate passed all 140 corrected checks. The balance fix passed 57
focused checks. Independent review covered the transaction and browser changes.

Core application source is `d0f079eb4c8732725dae88661a3d6cd69d0d2101`, Bok source
is `e600751259d9cdbf79651a8ce8d615caac289e5c`, and the final UI-only balance fix is
`ab72bc43290d72c6209828a3bbfacc9cadb7f071`. All nine services were verified running.
UI-only publication preserved every service PID/start time, SDK asset and private
configuration. No contract or state reset occurred during this work.

Evidence: [successful request](../execution/evidence/G21/stable6/bok-latency/profile-second-run.json),
[browser measurements](../execution/evidence/G21/stable6/bok-latency/browser-second-run.json),
[final health](../execution/evidence/G21/stable6/bok-latency/final-health.json),
[baseline](../execution/evidence/G21/stable6/bok-latency/baseline.json),
[first profile](../execution/evidence/G21/stable6/bok-latency/profile-first-run.json),
[implementation checks](../execution/evidence/G21/stable6/bok-latency/implementation-checks.json),
[publication](../execution/evidence/G21/stable6/bok-latency/publication.json).
