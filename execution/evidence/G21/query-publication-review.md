# Query-only publication review

Independent reviewer /root/funding_investigation approves source36bc680e publication. Root inspected the same scripts.

- /tmp/g21-query-native-inventory.py: d050155acb751aa3724b9fb81f7234b3caa5073689ac90f3392a8e1504bdae1c
- /tmp/g21-query-native-update.py: d3cbddc3aa856380e32ab5716f874531cdae9ca7fb4f7996fcdeaaa78e55239f
- /tmp/g21-query-native-packet.py: 15a32437e46557e49244b174bc50dd13ce63962b09c2b2bf87b8f041515c4749
- /tmp/g21-query-native-dispatch.py: 9acf098e31c07d10f47242852f7445c71e435afada6bf090ee907df8d8445378

Only private-query.mjs and runtime manifest change. Contract catalog/control/config are preserved. Proof admission closes before idle verification and query/prover restart. Node/app/moderator identities are checked unchanged; Bok is on a separate host. Canonical service state and provenance remain bound. Rollback is forbidden after new proof admission. Query startup uses the existing local-listener readiness observation; it does not add transaction/bridge retries or time-driven success.

Initial generated query-publication packet was not dispatched. query-publication-startup binds the reviewed startup correction. Stage/promotion outcomes recorded separately; this review does not establish hosted signup acceptance.

The first promotion exposed an overlooked moderator dependency; see query-activation-failure.md. Independent reviewer /root/funding_investigation approved the corrected resume helper90b06bd45fcfa702dccb8387b63f604940404fe0f36c0d58d78bd5bdae490688. It reached new admission and started the existing moderator, then its immediate process identity assertion observed the systemd child before exec/chdir completed. Later readback established the original executable and source directory exactly; no identity check was relaxed. Root checked finalizer39bb9537a9599c33722a6f4706e39900065b5da9bd180df0280fa60fb7abc021, which verifies original moderator identity, state/lease, new native query/prover and original app/node before resuming application observation. No post-admission rollback or second source deployment.
