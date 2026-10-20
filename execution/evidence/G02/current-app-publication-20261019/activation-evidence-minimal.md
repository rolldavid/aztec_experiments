# Existing activation evidence: minimum observation sequence

Source: `791297f7` (application/bootstrap behavior unchanged from `7a36784b`). This note does not mark any check passed and does not authorize a financial replay. Existing functions in `deploy/prover/bootstrap.py` are the authoritative execution path; no new harness is needed.

1. Reuse the lead’s existing native finality observer and original journals for FPC, board, Ready and Bok. Observe the retained hashes; never reconstruct deployments. Choose a single canonical finalized L2 block at or after the latest required deployment/Ready transaction and record its actual hash. Native checkpointed state can support dependent setup earlier, but final acceptance still records finality.
2. Complete/reconcile the existing collateral portal activation route. A finalized Ready transaction alone is insufficient: the existing portal must have consumed its actual L2-to-L1 authorization and `depositsEnabled()` must be true. This is the board collateral portal, not the separate Bok portal or funding router.
3. Fill the already prepared `prover-activation-scope-proposed.json` with the current installed manifest hash and common anchor. Read the four artifact digests from that exact release manifest. Do not use an older package’s digests.
4. Run the existing read-only `activation_identity(h, scope)` on the installed host runtime. It executes the fixed `ACTIVATION_CHECK` source with native SDK against local8082 and performs the checks below. It does not sign, prove, deploy, activate or send a transaction. Save the successful bounded result and original journal/finality references as evidence. Failure leaves the corresponding boolean unestablished.
5. Construct the existing closed evidence schema only from those observations. `activation_evidence(value, scope, manifest["files"])` must accept its scope/artifact/check binding. Hash the exact persisted evidence bytes into scope.deploymentEvidenceSha256; validate scope with `activation_record`. Keep `bokScope: constructor-allowlist-only`: this is not acceptance of Bok model, repository or accounting journeys.
6. Lead uses the already implemented normal `--activate-prover <scopeSHA>` route once files are present under the existing private directory and all prior full qualification/admission requirements pass. That route repeats its own live identity check before its exclusive activation intent; do not bypass it or replay it if an intent already exists. Public origin correction is separate routing configuration and must not bypass activation.

## Six booleans and their exact evidence

| Boolean | Minimum actual observation |
| --- | --- |
| boardConstructor | At the common L2 anchor, board exists; original/current class matches the pinned artifact; computed address and deployer match. Read canonical config and match L1 chain, rollup, version and board deployer. |
| boardPortalRuntime | Canonical board portal storage points to the recorded L1 portal; anchored L1 runtime matches pinned runtime template and all required immutables, including board, rollup, inbox/outbox, version, chain, economics and config commitment. |
| boardReady | Original Ready receipt is successful/finalized; the actual bound portal returns depositsEnabled=true. The fixed activation checker establishes the latter, not a guessed transaction outcome. |
| privateFeeCanonical | Actual FPC instance exists at the address independently derived from pinned fee artifact, zero salt/deployer and empty constructor; original/current class and derived address match. |
| bokConstructor | Canonical Bok instance/class/address/deployer and storage board/operator/owner/L1-chain/version match the recorded scope. This verifies constructor allowlisting only. |
| canonicalAnchors | Common L2 hash is read before/after checks; finalized original receipts are included by that anchor. Fixed checker also verifies L1 chain, current registry rollup/version, fresh anchored L1 block and identical L1 block hash afterward, plus native readiness. |

The existing checker returns only a combined scopeVerified result, current readiness, anchor and scope label. Retain its source binding and the original finalized receipt observations so this combined result is not misrepresented as six independently measured flows. No additional proof, broad rebuild, backup exercise or repeated deployment is required for this evidence preparation.
