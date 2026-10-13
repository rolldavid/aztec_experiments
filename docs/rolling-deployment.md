# Independent Rolling Chat operator runbook

This runbook covers the Draft 3 Rolling application. The legacy deployment in
`deploy/V6-TESTNET.md` is historical evidence for different contracts. Its endpoint,
accounts, funds, archive references and dates are not independent-installation
defaults. The current implementation still needs a complete Rolling deployment
and recovery rehearsal before this runbook qualifies RC36–RC38.

## Operator inputs and roles

Record a public installation manifest containing the source revision, network
identity, compiled contract identities, actual deployment receipts, board origin,
artifact origin and service URLs. Record the operator and backup/incident owner.
Use separate private files for Ethereum and Aztec signing material, query-gateway
capability, model-provider credential and GitHub App key. Keep these outside the
checkout, web roots and generated-code workspace in private directories. Export
encrypted backups before funding. Do not copy the contractor's local configuration.

The operator supplies a funded Ethereum deployer, Aztec deployer/moderator and
public Bok operator, plus the private fee funding and service liquidity required
by the chosen configuration. Human users retain their own keys and encrypted
recovery; do not introduce custody or sponsored user transactions. Distinguish
refundable collateral, fee credit, conversion/gas and Bok credit in every quote.
An unsupported one-transaction funding route requires measured alternatives and
the owner's decision before changing that product promise.

Use one curated main board for this installation. User-created subboards belong
to that board; a separately operated main board uses its own hosting and is not
automatically indexed or promoted by another installation.

## Reproducible build

Use `toolchain.json`, `.nvmrc` and both npm lockfiles as the source of exact
versions. At this revision Node is24.21.0, Aztec SDK is6.0.0-rc.3 and the foundation
prover is6.0.0-rc.6; their release numbers intentionally differ. Follow
[BUILDING.md](../BUILDING.md) for verified Node, Noir, Foundry and dependencies.
Use a physical owned dependency installation. Never bootstrap patches while
another process uses that installation.

From a fresh checkout with pinned Node first on PATH:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix billboard/portal --ignore-scripts --no-audit --no-fund
npm run bootstrap:dependencies
npm run bootstrap:noir
node scripts/build-contracts.mjs
node billboard/rolling_contract/build.mjs
node experiments/avatar/build.mjs
node experiments/private-bok/build.mjs
node prover/pin-rolling-artifacts.mjs
npm run build:sdk
npm run build:crs
npm run build:apps
node scripts/rolling-wallet-assets.mjs
```

Run serially. The first build can replace workspace targets with raw artifacts;
therefore the processed Rolling/Avatar/Bok builds follow it. Review changed
artifact catalog entries and run existing provenance checks; never edit hashes
to admit stale output. Preserve compiler diagnostics for specialist review.
The final clean-build rehearsal must record commands, versions and observed
outputs. A developer's cached artifacts are useful during iteration but do not
qualify that rehearsal.

## Network and deployment

Before loading signing material, compare the intended chain ID, rollup address,
rollup version and current official network requirements with live node and
Ethereum reads. Check existing deployment records and health from the actual
execution host. An authenticated cloud account does not mean a prover is healthy.

Deploy the canonical private fee contract, RollingBoard, its correctly bound
Ethereum collateral portal, and PrivateBok with its token portal. Authenticate the
moderator, main rules, bot registration and public descriptor against the actual
contract state. Preserve constructor configuration, deployment block/hash and
transaction hash. Activate each portal only after its genuine Ready message and
network finality are verified. Prove real transactions on testnet; local settlement
controls belong only to disposable development chains.

The existing deployment manifest and engine support RollingBoard: select
`schemaVersion: 2` and `board.kind: "rolling"`. The board fields contain `salt`,
`minDeposit`, `maxDeposit`, `baseCooldown`, `kMultiplier`, `censorWindow`,
`maxSaveUp` and `policy` (maximum992 UTF-8 bytes). Schema2 uses the deployer as the
initial moderator and has no separate `censor` field. Network and actor fields
follow [the deployment manifest guide](deployment.md). Prepare the source-bound
manifest with `node scripts/prepare-deployment-manifest.mjs intent.json deployment.json`.
The existing deployment engine selects RollingBoard, binds its portal, observes
Ready and checks canonical configuration. It must still pass the independent
fresh-identity/origin rehearsal; code support alone is not deployment acceptance.

The development engine reads the node's native proof configuration and uses
reconciliation-only recovery for uncertain Rolling transactions. The Rolling
`plugins/operator.mjs` supports `fees`, `claim-fees`, `deploy-escrow`,
`deploy-portal`, `bind`, `activate`, `register` and `status`. Each lifecycle step
verifies its canonical prerequisites and retains uncertain signed transactions.
The fresh-identity deployment rehearsal and real-proof testnet qualification
remain open; passing component checks does not establish either acceptance.

The existing constructor commands take a public config, separate private actor
file and private journal, as documented in [plugin deployment](../plugins/DEPLOYMENT.md).
Use `applicationProfile: "rolling"`. Repeat commands reconcile original intents;
they do not authorize replacement transactions. Preserve uncertain/preparing
records and locks until the owning process and canonical outcome are resolved.

## Reader, wallet and services

[The connected reader guide](../apps/rolling/README.md) defines the exact public
reader and wallet schemas. Configure its scope and deployment anchor from real
receipts. Start the application with:

```sh
node apps/rolling/start.mjs /absolute/public-reader.json /absolute/public-wallet.json
```

Without the wallet file this is a public reader only. The design preview
`apps/rolling/serve.mjs` contains labelled fixtures and is not a connected app.
The public reader's SQLite cache is derived state, separate for each deployment.
Its canonical node/archive supplies recovery authority. Private wallet state
remains encrypted in the user's browser; no names/account-list cache API is added.

Serve the board on HTTPS with the application's CSP, worker/WASM permissions and
cross-origin isolation headers intact. The private query endpoint must be the
explicitly trusted, correctly scoped route; do not proxy arbitrary credentialed
RPC to application users. An optional remote prover uses the explicit Rolling
profile in [prover/ROLLING.md](../prover/ROLLING.md). It sees private witnesses and
must remain an identified trust boundary. Preserve local verification of proofs.

Run Bok under a distinct unprivileged service identity with its own private state
directory and exact Rolling descriptor. `plugins/main.mjs` starts the service and
separate artifact listener. Configure a distinct cookie-free artifact origin and
board origin. No wallet, provider or GitHub secrets go to generated processes.
The isolated executor needs its pinned container runtime/image; Aztec devnet
itself does not require Docker. Test and build generated code with no network,
fixed resource limits and verified owned-container cleanup.

Use a dedicated GitHub App installed on the owner's personal `zac-williamson`
account (User ID1476668), as directed by the owner on 13 October 2026. Select only
Bok-owned repositories; the broker rejects an installation covering all personal
repositories. App registration and installation remain service prerequisites.
Repository creation uses an installation token with `administration:write` and
`POST /user/repos`; GitHub automatically grants the App access to repositories it
creates. This permission is broader than creation: the selected-repository
boundary protects unrelated repositories. Source writes use a separate token
restricted to the exact new repository ID with `contents:write`. Do not use an
unrelated repository as a setup seed. Keep the private App key in operator-only
configuration, never in source, model prompts or generated-code processes.
See the current broker instructions in [plugin deployment](../plugins/DEPLOYMENT.md).

Artifact latest links and source downloads identify the same current revision.
Only latest is public; internal history remains in backups. The trusted host
capability `setPublicationDisabled` changes abuse visibility; it is never exposed
as an unauthenticated HTTP write. Stop new writes at capacity, retain current
latest indefinitely, and arrange funded storage/backup retention before launch.
Do not solve quota exhaustion by silently deleting the required latest revision.

## Recovery, monitoring and costs

Before paid capacity, reconcile prior/accrued usage and forecast compute, storage,
archives, network, API/model charges and cleanup/billing delay through a named
deadline. Include overlap during replacement and storage after shutdown. Use
the operator's explicit allowance; this repository grants none. Verify independent
host and cloud shutdown controls before workload starts. Extension needs a new
forecast within that allowance, not disabling the controls.

Monitor canonical node/index lag, archive completeness, portal readiness and
liabilities, fee liquidity, wallet outcome uncertainty, moderator delay, Bok
reserved/settled credit, unresolved paid calls, queue length and storage capacity.
Record measured rates and workload. Existing service templates in `deploy/` are
starting points tied to their profiles; do not claim the legacy moderator unit
already operates Rolling rules. Rolling moderation service wiring and its real
model evaluation remain required deployment acceptance.

Stop and drain the owning service before consistent private backup. Back up Bok's
accepted Git repositories, invocation/payment journals, summaries, execution
snapshots, publication catalog/history and GitHub broker journals together.
Keep private keys separately encrypted with documented restore ownership.
Core recovery must succeed without Bok backups: rebuild authenticated board state
from the complete chain/archive and restore encrypted preferences with user keys.

For a crash, inspect process liveness and exact lock ownership before replacing
the writer. Reopen the same configuration and journals. Reconcile original chain
hashes, nonces and remote Git objects; never assume a missing response means no
action occurred. Publication's local idempotent recovery does not authorize
replaying a paid provider call. Inspect storage integrity before serving it.

For rotation, use only the contract's actual authority mechanism. PrivateBok's
operator/board binding is immutable; replacement requires a new adapter and
explicit registration/funding/recovery transition. Preserve old contracts and
withdrawal records. A website rollback cannot move collateral or change onchain
ownership. Keep old runtime, public configuration and encrypted recovery until
all old liabilities are resolved.

Rehearse restore with a second operator, fresh local storage, fresh identities and
separate origin. Test actual funding, posting/Bok, moderation, withdrawal, receipt
loss, restart, cache rebuild and Bok outage. Record source revision, environment,
commands, exact accounting and evidence. Agent review, mock ports, proof-disabled
development and old testnet results do not satisfy independent expert audit,
current network clearance or the full14-day qualification period.
