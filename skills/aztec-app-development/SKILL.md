---
name: aztec-app-development
description: Build and debug complete Aztec applications with fast local iteration, state-dependent flows, native network controls and proofs disabled. Use for Aztec contracts, PXE, wallets, bridges and application integration; align the toolchain with the requested protocol/network version.
---

# Aztec application development

## Intent: make working application development fast

**Deliver the full requested application with the short edit-to-working-result loop expected of ordinary backend application development.** Optimize for completed, integrated behavior. Test counts, preserved fixtures, extensive diagnostics and elaborate infrastructure are not progress by themselves. Faster development must come from removing unnecessary work, not reducing product scope or disguising failures.

**The user's required behavior and target network determine the setup; the existing setup does not determine what the application must do.** Installed packages, passing tests, wrappers, runbooks, historical release evidence and previous agent decisions can all embody mistakes. Preserve required behavior while changing or removing the machinery that obstructs it. Reuse is useful when it saves work; it is not a reason to retain an incompatible dependency or inefficient architecture.

Treat slow local iteration as a problem to solve at its cause. Do not infer that proving, network waiting, repeated RPC reads or preserving chain history is necessary because the application uses a blockchain. Use Aztec's development abstractions to make required state transitions cheap. Fix the path obstructing feature delivery, then resume building; do not turn environment improvement into a separate platform project.

These principles guide decisions, not a new checklist or approval process. Preserve explicitly required review and acceptance gates at their intended boundaries. A blocked external qualification does not stop unrelated implementation.

## Use a compatible native development environment

Start from the protocol/network version required by the current request and specification. Select and pin a compatible SDK/PXE, node and contract toolchain using official compatibility information, consulting source when needed. An installed or pinned SDK is not authoritative, and a shared major-version label alone does not establish compatibility. Update incompatible components, regenerate affected artifacts and align running services. Keep an already-compatible setup unless a concrete requirement or defect warrants changing it; do not chase latest for its own sake.

Use that release's native local-network facilities with proving disabled, on-demand blocks and native local settlement. In the verified example, the flags are node `realProofs: false` and PXE `proverEnabled: false`; ensure the exercised path, including its browser wallet, actually receives the intended configuration. Test assertions must reflect the selected mode. Read [native-controls.md](references/native-controls.md) when locating these APIs; its release-specific example is not a version recommendation.

Keep the same application flow across local development, testnet and mainnet, changing environment configuration. Integration exercises the actual contracts and SDK behavior; disabling proving does not mean fabricating success. Real-proof and public-network qualification belong at their specified boundaries. An isolated UI or component edit need not repeat network integration to establish its changed behavior.

Let native controls own mining and settlement. Use supported SDK facilities before constructing infrastructure; do not recreate proposer selection, consensus scheduling or protocol internals in an application harness. A demonstrated SDK defect may require a compatible released fix or a narrow patch, not an application-side imitation of the network.

## State determines progress; time never does

**Application and test flows MUST advance only on the required observable state, NEVER on timestamps, elapsed durations or scheduled delays.** Use promises, callbacks, events or supported SDK state/receipt waiters. Wrapping a delay in a callback does not make it state-dependent. A payment is confirmed by its receipt; a claim is available when its message is consumable.

In local tests, trigger the native operation that produces missing state and observe the application's normal completion. Accept an already-established result immediately; do not require observing a transient pending stage. Register observation before initiation or use a waiter that recognises completed operations. SDK polling is an implementation detail, not a reason to create another polling scheduler.

Timeouts only detect failure and capture diagnostics. They never establish success, authorize the next step, trigger fallback transactions or automatically resubmit. Performance measurements do not control application progress. Never introduce clock synchronization, timestamp freshness gates, injected clock frameworks, manual slot arithmetic or sleeps to make flows work. If existing code demands them, replace the mistaken abstraction with the actual state requirement and native control.

## Efficient RPC access is an architectural responsibility

**Treat RPC like ordinary application network access: request the data needed for the operation, share work and avoid repeating it. Excessive traffic is a defect to fix, not a workload to accommodate.** Bursts, node thrashing, duplicate reads, pacing, retries and increased timeouts are code smells. Investigate the producing architecture instead of assuming the SDK or provider makes them necessary.

Use shared feature queries/actions over the compatible SDK client. Reuse clients and identical in-flight reads; cache under the correct network, deployment and account identity. Fetch relevant pages/ranges, retain valid progress and refresh affected data when state changes. Additional consumers must not multiply identical work. Correct invalidation and required validation remain part of the result; stale data is not an optimization.

Judge an RPC improvement by useful results and fewer unnecessary logical calls, including retries and batch items. Lower request rates and fewer HTTP envelopes alone do not establish efficiency. Use relevant existing traces or focused checks, not a new measurement platform. Fix or replace an inefficient data-access abstraction where necessary; do not merely wrap it with another cache or limiter.

Transport controls remain legitimate for demonstrated residual constraints after avoidable work is removed. Prefer bounded library facilities over layered retry loops. Application completion stays state-dependent, and local tests must not wait through external quota windows. Reconcile genuinely ambiguous submissions from saved transaction identity and authoritative state before resubmission. Read [rpc-efficiency.md](references/rpc-efficiency.md) when designing or diagnosing network access.

## Keep the development loop proportional to the change

Connect features through real exported interfaces early. Use SDK types and serializers rather than reconstructing protocol semantics. A test double exposing nonexistent methods or repeating the implementation's encoding mistake hides integration defects. Exercise the relevant real boundary with independently justified expectations, without dragging unrelated onboarding and deployment into every check.

Reuse healthy local state and matching build artifacts. Rebuild/reload what changed; frontend assets should not require restarting the chain. Correct recurring build or lifecycle coupling instead of repeatedly repairing its symptoms. When disposable state blocks development, use a fresh coherent fixture unless the behavior under test needs that exact history. Reset dependent state coherently. Testing account restoration or interrupted actions does not require preserving the agent's old development chain indefinitely. External accounts, credentials, paid services and user data retain their actual boundaries.

Diagnose at the smallest boundary that retains the failure condition, including realistic data where relevant. Preserve the original error and operation stage. A trace establishing failure before submission calls for boundary repair, not transaction recovery; missing confirmation alone does not establish this. Add missing diagnostic context where it is lost rather than build an observability subsystem. If harness repairs keep creating prerequisites, change the approach.

Keep ordinary diagnosis and repair with the implementer; review coherent changes under existing requirements. Repair brittle selectors, source-text matching and impossible fixtures at their cause. Reuse valid completed stages when their relevant inputs/state remain unchanged and project rules permit it. Once affected behavior is verified, return to feature work; broaden testing only for an identified integration risk or required gate. Do not invent per-transaction approvals or review handoffs for disposable local work.

Use observed edit-to-result time and working behavior to judge improvement; do not claim unmeasured speedups. [Historical failure evidence](references/development-failure-patterns.md) is optional background for reviewing an established setup, not instructions to reproduce its workflow or gates.
