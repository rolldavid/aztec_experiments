# Current Rolling Chat delivery records

Start with [the runnable candidate and resume instructions](rolling-current-candidate.md). This is an engineering candidate, not a cleared production release.

- [46-row requirement disposition](final-requirement-disposition.json): implemented behavior, evidence, outstanding observations and external release gates.
- [Content provenance](artifact-manifest.json): integrated source, published application, generated build input hashes and separately admitted runtime package. Large binaries and all private state remain outside Git.
- [Functional status](../feature-status.md) and [owner clarifications](../specification-clarifications.md): current scope and explicitly changed defaults.
- [Original Draft3 requirement catalog](../draft3-requirements.md): stable requirement identifiers, interpreted with owner amendments.

Evidence registry paths are relative to the disposition and manifest in this directory. Included summaries/reviews retain their original bytes and hashes. Their internal absolute paths identify historical operator artifacts; they do not require a fresh checkout to contain private files or every intermediate log. Current acceptance does not follow merely from copying an old review.

The former `artifact-manifest.json` was a historical Billboard V5.2 inventory. Its exact hash is retained under `historicalManifest` in the current inventory, but it is not the current application manifest. No V5 checksum or deployment identity was relabelled as V6.

Use [BUILDING](../../BUILDING.md), [TESTING](../../TESTING.md) and the [deployment runbook](../../docs/rolling-deployment.md) for supported commands. This package is intentionally small: no node_modules, generated SDK bundle, full private archives, wallet secrets, witnesses or paid-provider credentials. Final acceptance and the quiet-state export remain explicit assigned work; specialist audit and network clearance remain separate gates.
