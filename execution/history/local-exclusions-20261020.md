# Local material intentionally not published

Secrets/private runtime state are excluded as described in START_HERE.md. Dependency trees, chain databases, binaries, build caches and disposable test outputs are reproducible, not authoritative source.

Separate historical worktree `Anonymous-Message-Board-remote-prover` has a pre-existing uncommitted change to `deploy/prover/deployment-permissions.json` plus untracked Foundry outputs. Ownership/intent of that edit is not established; it has not been adopted or represented as delivered code. Its committed branch history is preserved in the archive. Future agents must inspect the existing local diff if that separate workstream is resumed. This does not affect the current deployed application/control source.

Raw agent transcripts remain in access-controlled runtime storage. Concise session registry, handoffs, decisions, reviews and public evidence are published. Private transfer variants and presigned URLs are deliberately excluded from restoration source; regenerate short-lived capabilities through the authorized provider when actually needed.
