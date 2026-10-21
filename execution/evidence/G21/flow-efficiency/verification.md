# Account flow and composer efficiency

Reviewed source changes remove duplicate strict simulations using a one-shot validation bound to wallet, PXE, payload, gas and anchor. Local identity fences remain at asynchronous boundaries. One account operation shares its readiness checks and synchronization; confirmed state transitions invalidate the sync snapshot. Bridge readiness checks run concurrently. Required bridged fee validation remains. Signup no longer waits for name/moderator reads.

Composer displays Balance and Max cost, omits the permanent-publication warning, and closes on a confirmed social post before public feed refresh.

Checks: 41 simulation/validation tests; 14 focused engine tests; 187 funding/receipt tests; 34 UI/synchronization tests; 28 selected session tests; 10 focused application tests. Cross-review of simulation identity/mutation fences, operation scoping and funding changes completed with no remaining blockers. Integrated UI/synchronization 34/34 passed on pinned Node24. SDK and wallet build completed.

Native proving still executes private code and requires accepted bridge membership evidence. No claim of measured live speedup; no new browser/payment test for this batch. No board contract or deployment changes.

Integrated public wallet config checks: 8/8 passed.
