# Rolling Chat handover draft — remaining acceptance is in progress

Source: `506ca88234424152d7438dcee016ae57d7fa06cc`, integrated development branch `codex/rolling-chat-draft3`, [PR8](https://github.com/zac-williamson/aztec_experiments/pull/8). That revision changes bootstrap observer-state allocation; application code is unchanged by it. This draft uses the coordinator's existing 46-row disposition and current runbooks, not a new acceptance claim. Hosted deployment addresses, activated URLs, runtime manifest and final results remain **pending lead completion**.

## Use the application

The existing connected native-development preview is [http://127.0.0.1:8080/#/home](http://127.0.0.1:8080/#/home) while its owning runner is alive. Reading requires no wallet. The recorded preview contains Demo Willow and Demo Cedar, genuine devnet named/anonymous conversations, replies and likes. Use **Your account** to create/unlock the matching local account, fund it or use private views. This draft did not recheck live availability. Port4317 is the separate fixture prototype and does not prove connected behavior.

Implemented connected areas include feeds/threads/search, names/profiles, replies/quotes/reposts/likes, private bookmarks/follows/read markers, subboards and parent/local moderation, moderator transfer, ETH/USDC funding and withdrawals, resumable original transactions, encrypted recovery, Bok replies/accounting/summaries/pages/source and repository integration. Implementation coverage is distinct from complete acceptance; no completion percentage is claimed.

For a fresh checkout, use the pinned versions and serial install/build commands in [BUILDING.md](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/BUILDING.md) and the [native development runbook](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/docs/rolling-deployment.md). Current pins are Node24.21.0, Aztec SDK6.0.0-rc.3 and native prover6.0.0-rc.6. After the documented dependency/contract/SDK/wallet build:

```sh
node scripts/bootstrap-anvil.mjs
node plugins/devnet/liquidity.mjs --prepare-artifacts
ROLLING_DEV_ROOT="$(mktemp -d /private/tmp/rolling-dev.XXXXXX)"
mkdir -m 700 "$ROLLING_DEV_ROOT/state"
NODE_BACKEND=js TMPDIR="$ROLLING_DEV_ROOT" \
  ANVIL_BIN="$PWD/.build/anvil-1.7.0/anvil" \
  node plugins/devnet/start.mjs --profile rolling \
  --directory "$ROLLING_DEV_ROOT/state" \
  --app-port 4318 --node-port 8082 --ethereum-port 8546
```

Run from the application checkout with pinned Node/Foundry on PATH and those ports free; the SDK obtains its pinned Solidity0.8.30 compiler or uses the verified cache described in the runbook. Node `realProofs:false` and PXE `proverEnabled:false` are the native development defaults. Application proof logic is unchanged. Native mining/settlement advances missing state. Reuse a healthy running environment for edits. Stop the owning runner with Ctrl-C/SIGTERM and observe cleanup. This disposable runner cannot restart the same stopped chain; preserve its journals/recovery files and create a fresh coherent scope if needed. Laptop sleep or a saved handoff does not guarantee unattended execution.

## Interfaces and adopted engineering defaults

[Architecture](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/shared/rolling/ARCHITECTURE.md), [UI interfaces](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/docs/ux/interfaces.md), [reader/wallet configuration](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/apps/rolling/README.md) and [plugin deployment](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/DEPLOYMENT.md) define the boundaries. Existing publication entrypoint is `node apps/rolling/start.mjs READER_JSON PUBLIC_WALLET_JSON PRIVATE_RELAY_JSON`; deployment receipts supply actual board/Bok/router identities. Public configuration never contains developer credentials. Hosted query/prover activation and deployment manifests are pending, not inherited from an older endpoint.

The [working defaults](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/execution/evidence/G03/defaults.md) remain reversible engineering choices, not owner-confirmed product mandates: Home includes main/operator-featured boards ranked `3*likes+2*replies+reposts`; subboards initially appear only in directory/search. Slugs use lowercase ASCII letters/digits/internal hyphens,3–40bytes. First/last names use constrained ASCII letters/spaces/apostrophe/hyphen,1–32bytes each, canonical case-insensitive uniqueness; first name Bok is reserved. Parent rules prevail over local rules; local rules are immutable and rejection permanent in this initial version. Acceptance deployment's “No threats” policy is test data, not a production moderation decision.

Bok uses the owner's personal `zac-williamson` installation and dedicated selected private repositories; approved broad App permissions do not grant generated code developer privileges. Public Bok identity is permitted; human caller identity remains private. Artifact retention defaults are128threads,20revisions/thread,256MiB content,8192files and8MiB catalog. Capacity rejects new updates while preserving latest; no automatic history deletion. Only latest is public and retained indefinitely, with private history/backups kept under explicit storage policy. See plugin runbook for whole-store backup and allowance-counter preservation.

## Exact unfinished delivery work

| Group | Remaining work; reuse accepted evidence |
|---|---|
| D1 | Qualify the actual hosted synchronized node, board-scoped query and prover, then publish current deployment/runtime identities. Native package/control/import observations alone do not establish this. |
| D2 | Complete genuine MetaMask and Phantom ETH/zero-ETH USDC testnet paths, real proofs, linked social/Bok behavior and withdrawal/accounting; collect the required10-proof measurements. Both prepared genuine wallets now have60USDC/0ETH from lead-reconciled inventory transfers, not application funding. Original finalized FEE claims109/110 must be consumed/reconciled once, never bridged again. |
| D3 | Fold ETH interruption before receipt acknowledgement and bridge-pending reload into the required original D2 payment. Retain accepted USDC relay, exact submitted-L2 recovery and funded encrypted-backup evidence; do not replay completed payments. |
| D4 | Capture/decode actual current transaction public effects and deployed observer boundaries during D2; finish privacy reasoning. Existing method-only captures cannot prove opaque payload privacy. |
| D5 | Record representative authentic nonempty reconstruction, cold/warm/freshness/RPC/storage/hardware and proof measurements. Reuse passed UI/large-history samples. The invented authenticated10k-post campaign is retired, not passed; the explicit large-note requirement remains. |
| D8 | Integrate this handover with final source/build/runtime manifest, actual operator/backup/incident owners, measured results and residuals. D6/D7 scoped accepted model/repository/reliability conjunctions do not need rerunning merely to produce a summary. |
| X1 | Qualified independent security/privacy specialist review and remediation of blocking findings; agent review is not a substitute. |
| X2 | Current target-network suitability/clearance and required fresh network observations; testnet success is not production clearance. Mainnet needs separate authorization. |

The fixed14-day soak and accessibility qualification were removed by the owner; never enable VoiceOver. Bounded final reliability remains, within the delivery deadline2026-10-21T15:25:57Z. Neither acceptance work nor this draft is a reason to stop implementation.

## Recovery and next entry point

Use [Rolling operator runbook](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/docs/rolling-deployment.md) for startup, source refresh, moderator transfer, core chain/archive/key reconstruction and budget controls; [plugin runbook](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/plugins/DEPLOYMENT.md) for separate Bok/repository/artifact recovery and uncertain paid calls; [TESTING.md](/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-lead-bok/TESTING.md) for the existing genuine-wallet continuation. Legacy recovery/deployment sections retain their original scope and cannot supply current network defaults.

The sole lead resumes from [feature status](/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/feature-status.md), [requirement disposition](/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/execution/release/final-requirement-disposition.json), the session handoff and lead lease: finish the current reviewed hosted restore, establish actual query/prover readiness, reconcile original claims/deployments, publish the application and execute D2–D5 together. Preserve ambiguous signed transactions and paid calls; missing receipts never authorize replay. The Mac still owns private plugin/wallet configuration until a remote replacement is verified. All hosted addresses, current manifest, runtime outcomes and final acceptance results must be filled by the lead from actual observations before this becomes the final handover.
