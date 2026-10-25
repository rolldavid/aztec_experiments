# Signup failure, 25 October 2026

A real fresh signup on bbf76d92 paid successfully on Sepolia, then failed during claim witness preparation before proving or Aztec submission. The browser raised AggregateError containing two ReferenceErrors: syncSiloNullifier was not defined.

Commit6368f2b2 removed the old preference prefetch code and an import shared with the remaining claim prefetch. The claim test extracted the method and manually injected its dependencies, so it could pass while the complete module was broken.

The fix restores the native siloNullifier import. SDK builds now scope-check each complete transformed module against its pinned original and reject newly unresolved names. The broken module was rejected; all10 corrected transformed modules passed. This is a dependency-binding check, not a claim of complete semantic correctness.

A second defect discarded the funding phase after an exception and offered Refresh price even though the payment had succeeded. The UI now retains the current account/session/capability-bound payment state, provides the existing Continue setup action, and records bounded stage/error-class/error-code diagnostics without raw errors or private payloads. It does not authorize or automatically repeat payment.

The prior deploy helper also allowed its restrictive process umask to change replaced service configurations to unreadable0600. Current configuration files were repaired to root:rolling-runtime0640 and both services verified healthy; the helper now explicitly restores the original file mode after creation. No credential bytes or security group permissions changed.

Publication and real fresh-signup verification are pending. The all-flow50% performance goal remains incomplete.
