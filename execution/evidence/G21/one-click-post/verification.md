# One-click posting — 21 October 2026

Post, Reply, Quote and Repost prepare and submit the captured draft from one click. Bok proceeds through its authorized request and exact saved post only after authoritative authorization; unknown/reverted outcomes stop. Busy state prevents double clicks and progress starts before asynchronous work. Wallet proof/broadcast/confirmation stages now reach the UI.

Immediate social preparation records the existing configured fee ceiling without estimating. Submission still freshly estimates and enforces that ceiling. Ordinary reviewed actions keep existing estimation. This removes one full estimate per post (two for two-stage Bok), not a measured latency claim. Existing operation-lock serialization remains.

495 application/session checks passed; three focused immediate tests (including Bok) pass; 21 mounted-UI checks pass including double click, changed rules, exact reply/reference preservation, unresolved send and Bok continuation. Eight wallet-asset checks pass. Initial UI tests exposed a double-click label reset, repaired with synchronous busy guard; test cleanup waits for background balance completion. Rules-change test corrected to mutate the injected reader source rather than a global fetch the reader had already captured. Build initially refused default Node25; rebuilt successfully with pinned24.21.0. No browser launch, payment or real proof was performed for this focused component change.

Independent review: post_path_review found no blocking correctness issues; requested changed-rules and unresolved-submission cases added and passed. No contract or service changes in this publication.
