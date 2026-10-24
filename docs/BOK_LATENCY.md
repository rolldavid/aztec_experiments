# Bok request latency — 24 October 2026

This investigation measures from the browser's actual Post click through the
canonical Bok reply, charge/refund, and automatic browser rendering. It uses the
existing funded test identity and real proofs on stable Aztec testnet 6.0.0.
There are no Ethereum transactions in an already-funded `@bok` request.

## Concurrent preparation and numeric anchor — verified 3m08.1s

Browser0021c30a/runtime371eee5d completed the same267-character request from
original app tree a25ff3c2 in **188.077s** to the rendered canonical reply;
worker completion was188.150s. This is59.5% below464.264s but20.5% slower than
the preceding156.085s run. Preparation and proving improved; extra model reads,
a malformed selector requiring a repair, and a longer checkpoint wait increased
total time. These are complete measured results, not a new best-time claim.

| Stage | Original seconds | This run seconds | Reduction |
| --- | ---: | ---: | ---: |
| Browser preparation |13.944|6.562|52.9%|
| Remaining fee estimation |15.486|0.439|97.2%|
| Browser proof including local work and transport |37.196|18.922|49.1%|
| Model calls |192.671 (14)|47.452 (5)|75.4%|
| Board reads |3.482|0.471|86.5%|
| Validation, static publication and GitHub mirror |13.068|15.569|19.1% slower|
| Worker proof |6.619|3.522|46.8%|
| Other worker processing |15.960|6.430|59.7%|
| Final canonical checkpoint wait |56.215|82.220|46.3% slower|

Fee metadata preparation now overlaps message arguments within preparation.
The3.357s prefetch is nested and must not be added again. Combined preparation
and remaining estimation is7.001s, versus15.169s in9e66 and29.430s originally.
The main private execution runs once; native proof synchronization is zero.
The browser's first transaction confirmation was89.146s; Bok began work before
that checkpoint completed, so the two confirmation intervals must not be summed
into total elapsed time. Admission was32.486s, previously52.542s.

Bok read existing files then made grouped edits. Its first browser-plan validation
failed on overescaped checkbox selectors. It corrected only that plan and passed
176 checks. A separate real-browser check confirmed correct Clear completed
behavior and reload persistence. Charge0.034716USDC/refund0.215284USDC;
balance updated automatically from0.641309 to0.606593. Accepted source is
`591c78f8976f1c14a52dddd6166d75743499eac5`.

The conversation tail was loaded before posting, but the confirmed-action render
reset pagination. One further Load more click exposed the tail before the final
reply; the reply then appeared automatically. This is not an entirely
hands-free render acceptance. A separate pagination correction is being tested.
Seven of eight application-controlled categories met20% in this sample;
validation/publication did not. The public checkpoint goal remains unmet.

[Browser measurements](../execution/evidence/G21/stable6/bok-performance/overlap-browser.json),
[worker partitions and receipt](../execution/evidence/G21/stable6/bok-performance/overlap-profile.json).

## Subsequent preparation fix — published, no new wall-time claim

Source371eee5d starts ordinary immediate post arguments and fee preparation
together. Previously all screening/policy reads completed before fee metadata,
contract binding and balance preparation began. Native PXE still serializes the
two different private utilities. A single-use result binds the exact encrypted
intent and original wallet/PXE/node within the same locked operation; separate
submits, reviews and claims retain their normal preparation. Both reads drain
before failure releases the account lock. All567 affected checks passed and
independent review approved. The runtime is published; SDK/services are unchanged.
Payment prefetch overlaps arguments, so its duration must not be added to them.
No new wall-time percentage is claimed for this subsequent change.
[Change evidence](../execution/evidence/G21/stable6/bok-performance/fee-preparation-overlap.json),
[public readback](../execution/evidence/G21/stable6/bok-performance/fee-overlap-publication.json).

## Verified release9e66 — 2m36.1s

Browser9e66ca7a and worker392bee96 on m8a completed the identical267-character
request from the original app tree in **156.085s**, **66.4% below464.264s**.
Worker completion was156.375s. All174 browser checks passed on the first attempt;
a separate manual check confirmed clearing completed habits keeps unchecked
habits, survives reload and disables the button when no completed habits remain.

| Stage | Original seconds | Exact deployed release seconds | Reduction |
| --- | ---: | ---: | ---: |
| Browser preparation |13.944|11.240|19.4%|
| Fee estimation |15.486|3.929|74.6%|
| Browser proof including local work and transport |37.196|28.782|22.6%|
| Model calls |192.671 (14)|22.523 (2)|88.3%|
| Board reads |3.482|0.392|88.7%|
| Validation, static publication and GitHub mirror |13.068|6.514|50.2%|
| Worker proof |6.619|3.477|47.5%|
| Other worker processing |15.960|5.291|66.8%|
| Final canonical checkpoint wait |56.215|65.636|16.8% slower|

Seven of eight application-controlled categories exceeded20% reduction in this
sample. Preparation varied from4.186s in the preceding run to11.240s here;
its19.4% reduction must not be rounded up to claim every category met20%.
The final checkpoint still exceeds30seconds. These categories overlap; only
the linked worker partition is disjoint. No new paid run is justified merely
to obtain more favorable scheduling or model timings.

The long test conversation crossed its32-post initial page. One **Load more**
click exposed the request while Bok was working; the final reply and balance
then rendered automatically without a page refresh. Charge0.014592USDC,
refund0.235408USDC, balance0.655901→0.641309. Accepted app source is
`e135bea9536cddebe9312f6c60e6804210a32978`; final transaction
`0x228ccda78bc34a1d6683164e057f30db92b22eb2301ecee449a9fdf3910b58b3`
succeeded canonically at block1885. Two model calls, no summary or repair loop.

[Exact release browser timings](../execution/evidence/G21/stable6/bok-performance/release9e66-browser.json),
[worker timings and publication receipt](../execution/evidence/G21/stable6/bok-performance/release9e66-profile.json).

A separate source-and-live-block audit of the **preceding** transaction confirmed
its assigned checkpoint slot could not publish before23:55:24UTC,54.500s after
submission. The native waiter returned2.945s after that boundary, with no initial
delay or stronger finality requirement. Its remaining post-wait canonical checks
were0.871s. That explains the preceding57.381s wait; it is not a measurement of
the latest transaction's exact L1 inclusion. No duplicate application wait was
found. [Confirmation audit](../execution/evidence/G21/stable6/bok-performance/confirmation-slot-audit.json).

## Preceding verified run — 2m40.5s, all application-controlled categories improved

The same 267-character feature request, same parent and 0.25 USDC budget, starting
from the exact original four-file app tree, completed in **160.534s** from the
actual Post click to the automatically rendered canonical reply. That is **65.4%
less elapsed time** than 464.264s. Worker completion was 161.237s. All 174 browser
checks passed on the first attempt; manual testing confirmed completed habits
disappear, unchecked habits remain, and that state survives reload.

| Stage | Original seconds | This run seconds | Reduction |
| --- | ---: | ---: | ---: |
| Browser preparation |13.944|4.186|70.0%|
| Fee estimation |15.486|0.835|94.6%|
| Browser proof including local work and transport |37.196|24.855|33.2%|
| Model calls |192.671 (14)|48.972 (3)|74.6%|
| Board reads |3.482|0.381|89.1%|
| Validation, static publication and GitHub mirror |13.068|7.476|42.8%|
| Worker proof |6.619|3.470|47.6%|
| Other worker processing |15.960|5.532|65.3%|
| Final canonical checkpoint wait |56.215|57.381|2.1% slower|

These categories overlap; do not sum them. The linked partition is disjoint for
worker processing. All application-controlled categories exceeded 20% improvement
in this run. This is a measured sample, not a latency guarantee: model work and
public network scheduling vary. The final checkpoint wait still does not meet a
20% reduction or a 30-second target.

The same Bok server now has four physical AMD cores (`m8a.xlarge`) instead of two
physical cores with SMT (`r7i.xlarge`). Native proof generation fell from 5.251s
to 2.483s; the complete worker proof fell from 6.509s to 3.470s, **46.7% lower than
the preceding run**. Native witness generation took 0.549s, public validation 0.382s,
and synchronization 0s. Monthly hosting forecast fell from USD 1,462.94 to USD 1,444.05.
No new server was created. All core services stayed online.

Browser source 1310bb4e removes a duplicated predecessor receipt/block pair in the
same immediate operation while retaining fresh pre-proof and post-proof checks.
Bok source 392bee96 is unchanged. The model made 3 calls with grouped edits, one
workspace check and finalization; no summaries, repairs or rejected tools.
It spent 21.84s more than the previous run's model, while browser/worker improvements
and network timing reduced total elapsed time by 6.50s.

Final transaction `0x20b3ef3b92aac1b2c1e6b726ad028577186d1a22951ddf644762b38c14d3122d`
succeeded canonically at block 1857. Generated revision
`6b11a8eec0334c7610f202c1d4c89f1fe16cad12` is published. Charge 0.018806 USDC and
unused budget 0.231194 USDC were settled in the same reply transaction; visible
balance refreshed automatically from 0.674707 to 0.655901.

[Measured browser flow](../execution/evidence/G21/stable6/bok-performance/m8a-browser.json),
[worker partition and actual receipt](../execution/evidence/G21/stable6/bok-performance/m8a-profile.json),
[hardware activation](../execution/evidence/G21/stable6/bok-performance/worker-m8a-activation.json),
[published browser readback](../execution/evidence/G21/stable6/bok-performance/predecessor-static-readback.json).

### Simulation ownership and remaining exceptions

The SDK defect changed in-memory log/public-input objects; simulation did not write
canonical blockchain state. Native validation now receives a detached SDK value,
leaving the private execution and witnesses unchanged. The measured copy costs
0.894ms, not seconds. The normal funded main-board path has one private execution,
one actual kernel witness pass, one public transaction simulation, one node
transaction validation and one proof. There is no separate fee-estimation simulation.

SDK method names alone do not determine cost. Unconstrained balance and screening
reads call executeUtility. Static public views, including subboard policy, are
dispatched straight to node.simulatePublicCalls and do not execute private kernels.
Earlier source comments claiming a whole wallet transaction were corrected.

The low-credit search is different: each fee reservation can select different
notes and gas settings are private execution inputs. Source d2c9eba8 removes its
unnecessary standalone final strict simulation for immediate sends. The exact final
payload is validated inside native proving instead. A successful first search
pass now has five private executions including proving, versus six previously;
remaining candidate probes are not claimed to be one-pass. Explicit review
behavior is unchanged, and no witness is cached across completed PXE operations.
All 205 affected estimator, engine, native-validation and immutable-log tests passed.
No separate low-credit wall-time speedup is claimed.

[Final simulation audit](../execution/evidence/G21/stable6/bok-performance/final-simulation-audit.json).

## Previous published result — 2m47s from Post to settled, visible reply

The identical feature request from the same original app source now completes in
**167.038 seconds**, down from464.264 seconds: **64.0% less elapsed time**. Worker
completion was167.217 seconds. Revision`5544d5e5` passed174 actual browser checks
on the first attempt and the separate manual completed/unfinished/reload check.
The reply appeared automatically. The unused0.234643USDC returned automatically:
Bok balance0.690064→0.674707, actual charge0.015357USDC.

| Stage | Original seconds | Latest seconds | Change |
| --- | ---: | ---: | ---: |
| Browser preparation |13.944|11.622|17% faster|
| Fee estimation |15.486|4.476|71% faster|
| Browser proof, including local work and transport |37.196|27.294|27% faster|
| Model calls |192.671 (14 calls)|27.131 (2 calls)|86% faster|
| Board reads |3.482|0.314|91% faster|
| Validation, static publication and GitHub mirror |13.068|7.562|42% faster|
| Worker proof |6.619|6.509|2% faster|
| Final canonical checkpoint wait |56.215|66.645|19% slower|
| Other worker processing |15.960|6.159|61% faster|

These overlapping categories must not be summed into the total. The linked
partition assigns worker time once. Browser preparation varies: recent comparable
samples were10.260,5.554,5.367 and11.622 seconds. This latest run's incremental sync
and private utility reads were slower; no repeated execution appeared inside proof
generation. Do not select only the fastest sample to claim every stage met20%.

The first model response contained all edits in four tool calls, including two
batches of HTML changes, one unit-test batch and a browser-plan append. The second
response finished the workspace. No summary, tool errors, repair loops or repeated
source discovery occurred. This is a measured result from the published tool
change, not a prediction from lower call counts.

The application runs two Aztec transactions and no Ethereum transactions for this
funded request. Final native proving remains about5.25s on the worker's two physical
cores; full worker proof6.51s. Its validation copy costs under1ms. The final66.65s
wait remains the deployed public network's72-second pipelined checkpoint schedule,
not an elapsed application deadline. The requested per-stage improvement and
~30s checkpoint round-trip goals are **not fully met**; the substantial end-to-end
improvement and the limits above are separately evidenced.

Live worker source`392bee96`; final deployment changed only the model/tool and
browser-validation modules. No contract/config/core service change was needed.
[Browser timings](../execution/evidence/G21/stable6/bok-performance/batched-edits-browser.json),
[complete partition and publication](../execution/evidence/G21/stable6/bok-performance/batched-edits-profile.json),
[release receipt](../execution/evidence/G21/stable6/bok-performance/batched-edits-publication.json),
[simulation audit](../execution/evidence/G21/stable6/bok-performance/simulation-copy-audit.json).

## Comparable feature run — 3m26s, remaining work explicit

The identical **Clear completed** request, starting from the same original app
source, now completes in **205.939 seconds from Post to the automatically rendered
reply**, versus464.264 seconds: **55.6% faster**. Canonical worker completion was
206.435 seconds. Two Aztec transactions succeeded; no Ethereum transaction was
needed. Accepted revision `12e36fda2ab57895ea7e1d8811b762de4cb9c93f` passed198
real desktop/mobile browser checks. A separate browser check verified checked
habits disappear, unchecked habits survive reload, and the button disables when
nothing is checked.

| Measured stage | Previous seconds | New seconds | Change |
| --- | ---: | ---: | ---: |
| Browser preparation |13.944|10.260|26% faster|
| Browser fee estimation |15.486|3.701|76% faster|
| Browser proving, including transport/local work |37.196|23.616|37% faster|
| Model calls |192.671 (14 calls)|56.062 (6 calls)|71% faster|
| Board/conversation reads |3.482|1.186|66% faster|
| Validation and publication, including GitHub mirror |13.068|12.396|5% faster|
| Worker proof |6.619|6.550|1% faster|
| Final checkpoint wait |56.215|73.958|32% slower|

These are comparable categories, not a disjoint sum: browser confirmation and
Bok processing now overlap after canonical proposed-state verification. The linked
partition assigns each millisecond once. This result does **not** meet the target
of20–50% improvement in every application-controlled stage. Validation, repository
work and proving are still being investigated.

The browser remote prover now uses8threads. A same-input comparison measured
21.668s at1thread,8.600s at4threads and5.609s at8threads, with verified proofs.
The worker already used4threads through the native singleton, despite an ignored
later1thread option. Explicit initialization now removes that ambiguity; it is
not a claimed worker speedup. The same worker input measured10.246s at1thread,
4.937s at4threads and5.159s at8threads. These isolated proof timings are not the
whole application proof stage.

The final reply was sent at22:25:24.095UTC and its checkpoint appeared on Ethereum
at22:26:36UTC. This deployment's Rollup has72-second slots. The native sequencer
pipelines proposals for the next slot, and the Rollup rejects publication before
that slot starts. Node observation followed by22:26:38.498. Therefore most of this
sample's74-second wait was the actual public testnet protocol schedule, not an
application timeout. Required completion remains checkpointed; proposed inclusion
is not labelled settled.

Evidence: [browser](../execution/evidence/G21/stable6/bok-performance/successful-feature-browser.json),
[partition](../execution/evidence/G21/stable6/bok-performance/successful-feature-profile.json),
[publication](../execution/evidence/G21/stable6/bok-performance/successful-feature-publication.json).

## Instrumented repeat — successful publication, avoidable model regression

The next identical feature request published revision`47f5931c` and passed174
browser checks, but took267.616s to render (268.462s to worker completion).
Validation fell to3.962s and validation plus static/GitHub publication to8.037s,
38.5% below the original13.068s. Browser preparation was5.554s, fee estimation
3.314s and proving22.827s. Fifteen board reads totalled0.860s.

Model time grew to147.445s over11 calls. Five append-only scenario edits were
rejected because the tool required two unused empty arrays and returned a generic
error. Those calls spent37.722s; reading and rewriting the whole plan then spent
53.971s. The interface now accepts focused operations and gives precise malformed
input errors; complete resulting-plan validation remains unchanged. This is a
confirmed performance defect, not model work required by the feature.

The worker's native proof profile was6.737s: witness generation0.916s, proof5.411s,
public validation0.346s, other0.065s and effectively zero synchronization. The final
checkpoint wait was55.121s. The browser's native proof executed once with zero
internal synchronization; its transport13.753s includes upload/admission4.561s,
queue/result wait8.132s and serialization0.839s. Local verification was0.185s.
These nested measurements must not be added to their containing totals.

[Run partition](../execution/evidence/G21/stable6/bok-performance/tool-repair-run-profile.json),
[browser measurements](../execution/evidence/G21/stable6/bok-performance/tool-repair-run-browser.json),
[exact rejected argument shapes](../execution/evidence/G21/stable6/bok-performance/focused-plan-edit-failure.json).

## Capacity-aware repeat — 3m43s, automatic refund verified

The next comparable request completed in **223.087s** from actual Post click to
visible settled reply (52.0% below464.264s). It published revision`9bf01d61`, passed
164 browser checks and passed the separate manual completed/unfinished/reload
check. The balance automatically changed from0.742963 to0.690064USDC: charge0.052899,
unused budget0.197101. No page refresh or account recovery was involved.

There were no history-summary calls or rejected append-only tool arguments.
Thirteen model calls took71.333s. Nine initial exact edits were all independent:
six in HTML, two in unit tests and one in the browser plan. Their combined arguments
were about7.1KB, so neither dependencies nor output capacity required nine turns.
The tool now accepts a bounded array of replacements against one original file;
all replacements validate before one atomic write. Its latency effect remains to
be measured in the next run.

The first app check contained an impossible `expectChecked` assertion on a button.
The model repaired the test without changing app HTML. Both checks totalled12.382s;
GitHub publication3.858s; native final proof6.542s; board reads0.838s; final canonical
wait77.032s. This run was slower than the earlier205.939s best sample despite fewer
unnecessary operations, because generated tool choices and network slot timing vary.

[Partition](../execution/evidence/G21/stable6/bok-performance/capacity-fixed-profile.json),
[browser and app acceptance](../execution/evidence/G21/stable6/bok-performance/capacity-fixed-browser.json).

A local native-type microbenchmark measured the detached public-tail copy at
0.894ms for82,774bytes (rollup variant0.423ms for38,609bytes). Original bytes remained
unchanged. This copy is not the multi-second bottleneck. The worker already uses
all four logical CPUs on two physical cores. A same-family four-physical-core host
would exceed the existing monthly infrastructure budget; no resize was made.
[Copy measurement](../execution/evidence/G21/stable6/bok-performance/detached-tail-copy.json),
[capacity assessment](../execution/evidence/G21/stable6/bok-performance/worker-capacity-assessment.json).

## Follow-up validation measurement

The same accepted92-step plan and198 checks took7.562s with one CPU and serial
viewport suites, versus4.298s with two CPUs and concurrent desktop/mobile suites:
**43.2% less validation time**. Each scenario still has a fresh browser context;
all coverage, permission and resource checks remain. Both suites drain before
browser shutdown on failure. The generated-app execution lane still admits one
container at a time, bounded to2CPUs,768MiB and256processes on the existing4CPU
worker. This is an isolated same-source measurement, not another full-request result.

The regression suite passed33 tests:21 actual Chromium cases and12 schema or
controlled-boundary cases. An empty-control-identity race exposed by parallel
execution was fixed without repeating the action or suppressing coverage.
[Comparison evidence](../execution/evidence/G21/stable6/bok-latency/validation-two-cpu-comparison.json).

## Single-execution investigation — performance follow-up

The first attempt to reuse the SDK's simulated private execution exposed an SDK
mutation: synthetic kernel generation siloed a private log in place while the
original partial witness still contained the unsiloed value. The real proof then
failed. The failed attempt never reached transaction submission or model work;
it is not a successful performance result.

The pinned SDK patch now copies log fields before synthetic simulation, with a
regression test using native log types. Ordinary funded posting no longer uses
that synthetic kernel path at all. It executes the private program once, builds
the actual kernel witnesses once, validates a detached copy of their public
output with the node, and proves the original witnesses. Public validation still
checks revert status, actual gas use, and transaction validity before the costly
proof. It cannot alter the authoritative kernel output. Bok finalization uses the
same explicit SDK capability, with a fresh fee-balance check before execution.

This distinguishes three different kinds of state: simulation cannot change
chain state; the native PXE can persist synchronized local facts and capsules;
and transaction execution constructs transient notes, nullifiers and logs. The
bug was mutation of a result later reused as proof input, not a simulated chain
write. The new normal path removes that reuse boundary instead of relying on it.

The low-credit estimator remains a separate fallback. Its repeated probes change
fee reservation, gas limits, prices or teardown allowance. A reservation-only
cache would therefore be incorrect. Starting from the maximum available credit
was also rejected: selecting more fee notes can increase private gas and make an
otherwise affordable transaction fail. This audit does not claim that the
fallback is minimal; it documents why those two shortcuts are not equivalent.

The changes passed focused native-orchestration and worker checks, then actual
browser and worker proofs in the comparable successful run above. The low-credit
fallback remains outside that ordinary funded-path performance claim.

## Successful two-transaction test

The new feature update completed automatically in **464.264 seconds (7m44s)**
from the actual Post click to the visible reply. Canonical worker completion was
464.974 seconds. Exactly two request transactions succeeded: post plus full budget
reservation at block1684, then reply plus charge/refund at1688. The0.25USDC budget
charged0.086098USDC and refunded0.163902USDC, with no reserved balance remaining.

Bok added **Clear completed** to Daily Three, published a new app revision and
GitHub commit, and passed its browser gate. A separate actual browser check
confirmed disabled/enabled states, removal of checked habits, retention of
unchecked habits after reload, and no runtime errors. The main page displayed the
reply automatically without reload or operator continuation of this request.

| Measured work | Seconds |
| --- | ---: |
| Browser click to confirmed post |176.334|
| Of that: browser proof |37.196|
| Of that: first checkpoint wait |104.010|
| Model processing,14 calls |192.671|
| Board and conversation reads |3.482|
| Validation and publication |13.068|
| Final proof |6.619|
| Final checkpoint wait |56.215|
| Other worker work, including guards/tools/handoffs |15.960|

The browser subrows overlap its total; worker rows do not overlap. The complete
worker partition is288.014 seconds; admission followed post confirmation within
one second. This run is about55% shorter than the17m01 baseline, but this
is an existing-app feature update, not an identical fresh-generation workload.
The previous three-transaction success took7m23s: this run did **not** beat it.
Its longer first checkpoint wait and14 versus10 model calls outweighed the
removed transaction. Two transactions reduce dependencies, not network block time.

The operator's test fee inventory was replenished separately during this run;
that administrative deposit/claim is not a third transaction in the user request.
No user-flow step waited for that funding, and the request had no manual retry.

The largest remaining component is model processing. The measured source6beaebe9
still instructed edits to be spread across responses. Prompt correction8efe8919
is deployed and groups small exact edits, retaining complete JSON and normal validation;
76 model checks pass and independent review approved it. This wording change is
after the benchmark; no additional latency improvement is claimed for it.

Evidence: [browser](../execution/evidence/G21/stable6/bok-latency/two-transaction-success-browser.json),
[partition](../execution/evidence/G21/stable6/bok-latency/two-transaction-success-profile.json),
[canonical accounting and publication](../execution/evidence/G21/stable6/bok-latency/two-transaction-success-canonical-publication.json).

## Two-transaction implementation and earlier failures

The live path now uses two Aztec transactions: the user's post reserves its full
Bok budget, and Bok's final reply settles actual usage and refunds the remainder.
The optional Bok contract was replaced; the board, account ownership, deposits,
private fees, existing posts and generated-app repository were retained. No
Ethereum transaction is needed for an already-funded request.

The browser removes seven public-wallet simulations, reduces private utility
checks from three to one, shares plugin metadata and an owning synchronization
scope, and reads independent fee metadata concurrently. The worker shares
canonical reads by block/index revision and keeps one admitted repository session.
Generated-app validation still exercises the actual published environment.

A live attempt on23October produced a canonical failure reply after291.281s; it
is **not a successful latency result**. The provider reached4096 output tokens
while rewriting two files and returned malformed second-call JSON despite a
`tool_calls` finish reason. The entire batch was rejected before any edits ran.
Exactly two chain transactions completed, charging0.024776USDC and refunding
0.225224USDC from the0.25USDC allowance. No new app was published.

The repair adds exact small file edits, removes guidance to group large rewrites,
and requests up to8192 output tokens subject to the existing model and remaining
budget bounds. Truncated/malformed batches still execute no tools and are never
silently replayed. Combined affected checks passed345 tests with two existing
opt-in skips; independent review approved the code and worker-only publication.
The repeat confirmed the user post in118.684s, then exposed two more defects:
startup replay delayed worker admission by257.897s, and a reservation guard failure
was incorrectly recorded as a possibly sent provider call even though no provider
execution began. This attempt is also excluded from successful latency results.

The fixes explicitly resume private service-owned index state after version,
scope, deployment and canonical-anchor checks, and place all pre-dispatch checks
before the durable provider fence. Original unsent quotes can wait through repeated
preflight failures; paid or possibly sent requests are not replayed. Default
untrusted/imported caches still undergo full authentication. Root's integrated
checks passed408 tests with two existing opt-in skips. These changes are live: core
and Bok resumed generations3 and12 respectively, without full history replay.

The remaining preflight failure was reproduced as HTTP429: thirteen concurrent
RPC batches exceeded the query gateway's eight-request limit. An SDK semaphore
now permits four concurrent batches and releases capacity on every outcome. It
adds no retries or delays. The exact live guard then passed in296ms with every
response HTTP200;143 integrated operations/escrow checks passed. The earlier request was subsequently completed as a failure; the successful
fresh benchmark is recorded above.

The resumed attempt did not publish an app: its generated test plan exceeded64
steps, while generic tool feedback hid that specific cause. It exhausted16 model
calls in110.187s. The final transaction submission then failed; the original node
reason was discarded. Read-only reconstruction found a concrete fee-admission
problem: default network-maximum gas committed13.923754FEE against an operator
balance of11.604265FEE. This is a sufficient current rejection condition, not a
retained historical rejection message. Canonical charge/refund had not occurred.

The subsequent fixes expose exact test-plan reasons and field paths, and use
native atomic simulation/proving with SDK measured gas and standard10% padding.
They preserve the single proof and one synchronization scope. Focused integrated
checks passed88 tests (30 existing opt-in skips) for plan feedback and48 for fees
and exact-authority dropped-finalization handling. The fresh acceptance above passed.

The proxy shutdown issue is independently fixed: the application drains before
its proxy stops. A real held browser feed reached clean EOF; the application
stopped in451ms and the proxy in4ms, with normal exits and no forced termination.
A new connection received live feed revisions after restart.

Evidence: [proxy shutdown](../execution/evidence/G21/stable6/bok-latency/proxy-shutdown.json),
[failed attempt](../execution/evidence/G21/stable6/bok-latency/two-transaction-failed-profile.json),
[canonical accounting](../execution/evidence/G21/stable6/bok-latency/two-transaction-failed-canonical.json),
[actual MetaMask funding](../execution/evidence/G21/stable6/bok-latency/two-transaction-funding.json).

## Previous three-transaction result

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

That release sent **three Aztec transactions and zero Ethereum transactions**:

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

## Previous-release changes

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

No contracts, account ownership or deployment addresses were changed in that earlier release.
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

## Previous-release interpretation and remaining opportunities

The biggest measured waste was repeated transaction round trips and a validator
race that forced unnecessary model repairs. Both are fixed and published. The
first instrumented run's 82.632 seconds of board reads fell to 26.346 seconds in
the successful repeat, but this combines fewer model turns and cheaper reads:
it is not an isolated per-read benchmark.

The targets identified at that checkpoint were:

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


That release waited for three dependent Aztec checkpoints, not proven or
finalized L1 settlement. SDK transaction waits have no elapsed-time failure
deadline. One-second receipt polling is not the source of multi-minute waits.

The remote prover currently uses one thread. More threads may reduce part of the
25.689-second remote interval; they cannot remove local witness generation,
upload or blockchain waits. The six-second Bok reservation proof is a smaller
target. No unmeasured thread-count speedup is claimed. No hosts were added or resized;
prover thread counts were unchanged.

## Previous-release verification and publication

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

## Final fee correction deployed —24October IST

Worker6beaebe9 uses the SDK combined simulation/proof path, estimates actual gas
with standard padding, and proves once. The failed test's exact final batch was
confirmed at block1675: measured maximum7.718352075606FEE, actual4.1196781591484FEE.
Its original16 provider calls and billing were unchanged; canonical charge83256
and refund166744 microUSDC. The failure reply rendered automatically. This was an
operator-intervened failed request, not a successful latency benchmark. The fresh test above subsequently measured the normal path through actual
application publication.

The owner reiterates that all old test application data is disposable. Retaining
old releases, accounts or incomplete runs is not a delivery requirement; do not
add migration, recovery or backward compatibility work for it.
