# Source-only operator update, 26 October 2026

These root-operated publishers deploy the three reviewed bff92b32 runtime changes over the observed bbf76 source. They are fixed to that source preimage, not generic deployment commands. Root supplies the authenticated plan and exact source payload. The application/proxy/node/prover services remain running; only the selected Bok or moderator process drains and restarts.

Use the existing dependency tree, detach changed source and source-pin files atomically, preserve private configuration and all service security properties, and verify the attestor/control bytes. These runtime edits do not require changing the attestor or prover activation. Stage changes no service. Activate verifies current source, units and observed processes before draining.

Every failed graceful drain restores the original restart policy. It starts the original/current source only after the previous main process and all children have exited. It never force-kills work, starts a duplicate owner, or leaves an owned `Restart=no` override behind. Successful activation and rollback verify the service under its original restart policy.

Run the bounded failure checks with `python3 deploy/updates/20261026-operator/test-drain-failure.py`. Tests exercise the actual restart-restoration and owned-override removal functions, including active children and foreign overrides. Publication evidence lives in execution/evidence/G21/stable6/other-transaction-latency/operator-observation-batch.json. Future updates must bind their own current source and process observations; do not reuse historical constants blindly.
