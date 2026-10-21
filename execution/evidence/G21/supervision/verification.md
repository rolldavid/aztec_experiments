# Persistent supervision verification

The legacy monitoring dispatchers are replaced by reporting-only observations. Systemd supervises long-running services with automatic restart, no permanent restart limit, and no dependency stop cascade between application services. The node startup precheck validates controls and its runtime pin without a shutdown handler.

A kernel flock replaces exclusive-file existence ownership. The parent Node process retains the descriptor; process death releases ownership automatically. The persistent inode and transaction/provider journals are preserved.

Focused results: 136 Node component checks, seven monitor/startup checks, 26 prover activation checks and 16 query boundary/lifecycle checks pass. The known baseline payload-size check is outside this selection. Linux evidence includes four real lock tests and an isolated systemd process SIGKILL/restart, with unchanged uncertain journal and no live services touched. Initial Node test invocation omitted NODE_BACKEND=js; its failure is retained separately, then the configured run passed.

Publication stages future startup source and reloads service configuration without restarting healthy services. This change does not rerun whole onboarding or qualify the entire G21 feature. Old service generations remain running until their next normal restart; no new-generation one-shot consumer may be started against their state while they live.

Publication completed on both hosts, source69eb1831. Core and Bok monitor reports are ready; all nine pre-existing service PIDs/cwds unchanged. Effective Restart=always, RestartUSec=5s, StartLimitIntervalUSec=0 and KillMode=control-group verified by publisher. Legacy shutdown observers masked. Source/control identities and current versus next-start paths are in core-publication.json and bok-publication.json.
