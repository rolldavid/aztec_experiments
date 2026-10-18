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

The native development runner starts the existing trusted query service on an
ephemeral loopback port. Generated browser configuration points to its `/v1/node`;
cold recovery uses `/v1/compact-block` and authenticates returned blocks in the PXE.
`developmentQueryServiceConfig` currently sets `compactRequestsPerMinute: 1800`;
the server default remains 600. This is a bounded admission setting, not a recovery
performance result. Avoid duplicate reads and retain valid progress; do not use
rate-limit waits to advance a development flow. Cold recovery still has to meet
the predeclared 120-second target with its required evidence.

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
npm run build
node scripts/rolling-wallet-assets.mjs
npm run check:artifacts
```

Run serially. The canonical build compiles and processes RollingBoard, including
its profile/avatar functions, then PrivateBok, the SDK, CRS and browser apps.
It forces regeneration of all private-function verification keys. The separate
wallet asset build verifies those contract and SDK inputs. A fresh operator build
must match the checked-in Rolling artifact catalog; intentional catalog updates
belong to reviewed release preparation. Never edit hashes to admit stale output.
Preserve compiler diagnostics for specialist review.
The final clean-build rehearsal must record commands, versions and observed
outputs. Official compiler download caches may be reused after checking the
documented version and archive checksum. Preserve that provenance separately
from generated application outputs; copying another deployment's generated
outputs or mutable state does not qualify a clean rehearsal.

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

## Transfer Rolling moderator authority

The current onchain moderator can transfer authority to a different, nonzero
Aztec address. Confirm that the successor controls that account and can pay its
future transaction fees before transferring. The deployment's initial moderator
is not a permanent administrator: the wallet reads canonical current authority
and checks it again before sending.

1. Open the connected application with the current moderator account unlocked.
   Select **Transfer moderator authority** and enter **Successor Aztec address**.
2. Select **Check action and review fee**. Verify the exact successor, current
   parent rules and maximum fee. Select **Confirm and send** only after review.
3. Observe the confirmed transaction and `ModeratorTransferred` event. Refresh
   the wallet with the successor account; it now has the moderator actions.
   The former key is rejected for moderation and cannot transfer authority back.

The exported application interface uses
`session.application.readModeratorStatus()` to report `{ authorized }`,
`session.application.prepare({ type: 'transfer-moderator', successor })` to
prepare the reviewed action, and
`session.application.submitPrepared(prepared.intentId)` to submit it. These use
the existing wallet, fee and saved-intent flow; there is no separate transfer CLI.
If the outcome is uncertain, use **Check existing transaction** or
`session.application.reconcile(prepared.intentId)` for that original intent.
Do not create a replacement merely because a response is missing.

The contract's `current_moderator()` view exposes the current authority.
`transfer_moderator(successor)` changes only that authority; policy and users'
collateral remain unchanged. Any return to the previous moderator is another
transfer signed by the successor (or whoever subsequently holds authority),
with its own fee review. The former key, original deployer and website operator
have no override. Record the confirmed transaction and successor in the public
installation handover, without including signing material.

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

## Private balances and withdrawals (RC22)

Deploy the matching wallet/SDK assets, PrivateBok class and public accounting
service together. The authenticated public scope includes the exact Bok contract,
class, operator, deployment identity and canonical anchor. The wallet also verifies
its own contract instance. Missing or incompatible accounting is unavailable,
never a zero balance. Keep the existing complete archive as authority; SQLite is
only a derived cache.

1. In **Balances and withdrawals**, check private balances. Posting collateral is
   refundable ETH, FEE credit pays later network transactions and has no redemption
   operation in the current FeeJuice protocol, and Bok credit is USDC-backed.
   Conversion charges and Ethereum gas are separate costs, not refundable credits.
   Additional fee/Bok funding uses **Top up fees or Bok** without withdrawing and
   redepositing posting collateral; its token approval and deposit are separate
   reviewed actions when approval is needed.
2. Use **Check all Bok requests**, then **Continue checking Bok requests** until
   complete. Each click performs bounded work; **Stop checking requests** abandons
   that scan without changing funds. All public pages must retain one revision and
   match the canonical PXE anchor. A moving anchor requires a fresh scan, not
   combining old and new totals. Private ownership pages remain in the wallet;
   `/api/bok-accounting` receives only `limit` and `cursor`, never owned IDs.
3. Read free, allocated, reserved, charged and returned credit separately. Returned
   credit is already in the current free balance. Incomplete accounting does not
   establish zero reservations. Unreserved waiting/active work can be reviewed for
   release; reserved or fenced work must resolve under the existing contract rules.
   The public event does not expose a deadline, so do not infer expiry from it.
4. For collateral, finish required history screening and maturity, then **Review
   collateral exit**. A rejected board does not remove the original withdrawal
   rights or waive those conditions. For Bok, select the receiving Ethereum wallet
   and **Review Bok credit exit** for an amount of free credit. Review and confirm
   the private transaction's maximum fee before its single submission.
5. Keep the encrypted original exit and wait for real Outbox settlement. **Review
   Ethereum refund** is a separate gas review. Collateral returns only to its
   original depositor; Bok returns to the recipient fixed in the private exit.
   The current wallet requires that saved recipient to pay Ethereum gas; it does
   not provide a gasless refund relay. Never substitute a recipient after an exit.
6. After interruption, reopen the same account/recovery and use **Check existing
   refund**. A missing response, unknown transaction, reorg or unavailable witness
   does not authorize another payment. Exact saved calldata, successful canonical
   effects and the correct portal event are required; testnet refunds also require
   finalized inclusion. The workflow stays retained until refund verification.

The matching ownership utility preserves cancelled-request history for its new
class. It cannot restore ownership notes previously removed by an older class.
Do not advertise complete restored history for such an old deployment. Rotate only
with an explicit recovery/old-liability plan; changing the website is insufficient.

## Privacy and acceptance boundary (RC23–RC26)

Uniform public accounting and local intersection avoid sending a human's request
list to the public server. Do not introduce personalized public balance endpoints,
account/name-group lookups or operator-visible Home/follow subscriptions. Private
wallet utilities use the authenticated private node; preserve its existing privacy
routing. Public request IDs and the authenticated public Bok identity remain public.
The chosen prover may see witnesses, and network timing, content and other observer
correlations still need the documented threat analysis. A request trace or component
test is not cryptographic unlinkability evidence.

The [balance/exit component record](../execution/evidence/G04/rc22-balances-withdrawals/bok-final-review.json)
and [real-cursor repair record](../execution/evidence/G04/rc22-balances-withdrawals/bok-cursor-repair-review.json)
cover source-bound local application, encrypted-journal and labelled browser checks.
Retain those records with the operator handoff; they do not establish live withdrawal.
Before marking the installation usable, record actual complete accounting with the
matching deployed class, private exit, settled canonical Ethereum refund, interrupted
recovery and additional funding. Also retain actual private-account initialization,
initial funding/claims, post and Bok readiness evidence on the final assets. A
canonical Ethereum funding payment alone is not successful private setup or Ready.

The named-wallet matrix remains separate: local native-proof-disabled MetaMask
results do not qualify real-proof testnet or Phantom. Phantom's observed onboarding
availability failure remains an external-response ambiguity, not a validated payment
route; do not weaken wallet security or assert support from a mock. Current target
network/liquidity, the selected personal GitHub App's live permissions, full archive
recovery, independent fresh-operator restore, expert audit and the required soak
remain their own evidence gates. Check current records rather than treating a
transient development startup failure or success as permanent deployment status.

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
already operates Rolling rules. The explicit `--rolling-config` profile in
`censor-daemon/daemon.mjs` operates Rolling posts through the native wallet and
canonical public index; see `censor-daemon/README.md` for its operator configuration.
Its focused tests use labelled chain/model doubles. Actual native-wallet removal,
real model evaluation under the new prompt identity, targeted real-proof testnet
acceptance, specialist review and elapsed qualification remain separate gates.

Stop admission and drain the owning service, including any artifact API fetch,
before taking a consistent private backup. Verify process and hosted-lease
ownership; never copy over a live writer. Back up Bok's whole private state
rather than selecting only published files: accepted Git repositories and refs,
invocation/payment and pending-publication journals, summaries, execution
snapshots, publication catalog/history, GitHub broker journals, and the optional
`artifact-api.json` allowance ledger with `artifact-api.initialized.json`.
Keep matching configuration, deployment/namespace identity and separately stored
wallet/PXE recovery material in the encrypted operator recovery set. Keep private
keys separately encrypted with documented restore ownership. The detailed local
restoration procedure is in `plugins/DEPLOYMENT.md`.

An older API allowance backup must never become new spending authority. Preserve
the latest durable counters, including failed or uncertain reservations; the
initialization marker detects a missing ledger, not rollback to an older valid
ledger. If the latest counters cannot be established, leave the affected API
aliases disabled until explicitly reconciled. Restoring an artifact or Git
revision does not reset its thread's lifetime allowance.
Core recovery must succeed without Bok backups: rebuild authenticated board state
from the complete chain/archive and restore encrypted preferences with user keys.

For a crash, inspect process liveness and exact lock ownership before replacing
the writer. Reopen the same configuration and journals. Reconcile original chain
hashes, nonces and remote Git objects; never assume a missing response means no
action occurred. Publication's local idempotent recovery does not authorize
replaying a paid provider call. Inspect storage integrity before serving it.

For Rolling moderator rotation, follow
[Transfer Rolling moderator authority](#transfer-rolling-moderator-authority).
This does not rotate Bok's operator. PrivateBok's
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

## Native local Rolling development

The development entry is the existing plugin devnet command. Rolling is its
default profile; each new invocation defaults to a fresh disposable directory.
It does not require a model-provider key for the reader,
private wallet or local chain. Finish the normal pinned builds above first; do not
repin generated manifests by hand. The canonical build already orders RollingBoard
before PrivateBok and the final wallet asset build.

Prepare the pinned Anvil binary and local liquidity artifacts before startup:

```sh
node scripts/bootstrap-anvil.mjs
node plugins/devnet/liquidity.mjs --prepare-artifacts
```

The installed native SDK also compiles its L1 deployment with Solidity **0.8.30**
(`0.8.30+commit.73712a01`), as specified in its packaged `l1-contracts/foundry.toml`.
Foundry can download that compiler, or use an existing official compiler cache.
The macOS example below references the standard Foundry cache; verify that path
and version first, or supply your installation's verified compiler path. If no
cached compiler exists, omit its version-check line and `FOUNDRY_SOLC` assignment
so Foundry downloads the version selected by the SDK. Scope
`FOUNDRY_SOLC` to native startup: the application's portal build uses **0.8.27**.
Keep the pinned Node first on PATH and leave the host's HOME and CODEX_HOME unchanged.

On macOS, use short canonical paths for **both** temporary files and development
state. The native SDK uses Unix sockets, and the deployment child uses the state
directory for its temporary files. A long checkout path can truncate a socket
name and stall native account derivation. This example creates fresh owned
mode-0700 directories without changing another development instance:

```sh
"$HOME/Library/Application Support/svm/0.8.30/solc-0.8.30" --version
ROLLING_DEV_ROOT="$(mktemp -d /private/tmp/rolling-dev.XXXXXX)"
mkdir -m 700 "$ROLLING_DEV_ROOT/state"
NODE_BACKEND=js TMPDIR="$ROLLING_DEV_ROOT" \
  ANVIL_BIN="$PWD/.build/anvil-1.7.0/anvil" \
  FOUNDRY_SOLC="$HOME/Library/Application Support/svm/0.8.30/solc-0.8.30" \
  node plugins/devnet/start.mjs --profile rolling \
  --directory "$ROLLING_DEV_ROOT/state" \
  --app-port 4318 --node-port 8082 --ethereum-port 8546
```

On Linux, choose an equivalent short canonical temporary/state location and the
verified compiler cache path for that host. `ANVIL_BIN` explicitly selects the
checksum-verified repository pin rather than relying on SDK executable discovery.

Without `--directory`, the command creates `.build/rolling-devnet-<UUID>`. To
choose a location, add `--directory /absolute/private/new-rolling-devnet` with a
fresh, canonical mode-0700 directory owned by the current user and no symlinked
parents. The existing inode-bound hosted lease owns the local process. Startup
rejects prior network, deployment, cache or journal contents; it does not reopen
an old chain or migrate its data. Preserve old directories and unresolved owner
records rather than deleting them to bypass admission.

The three ports must be distinct and unused; listeners bind to `127.0.0.1`.
Choose another free set when an existing development environment owns them.
Do not stop or repurpose another project's node. Native node `realProofs:false`
and PXE `proverEnabled:false` are configuration flags; `PLUGIN_PROOFS=true` is
rejected. `NODE_BACKEND=js` selects the supported bcrypto backend used by the local
application fixtures; it does not change application proof implementation.

Keep a healthy live environment running for ordinary application iteration.
Reload changed frontend source and reuse matching artifacts, funded disposable
accounts and current contracts where the check permits. A new runner invocation
creates a new network/deployment scope: use its generated public configuration
and matching development wallet state. An old browser recovery file remains
valuable evidence, but cannot restore a stopped disposable chain.

Startup uses the schema-2 deployment CLI, current Rolling artifact and real
canonical ownerless PrivateFPC, retaining signed-once journals for that run. The
original board creation receipt is retained separately from portal binding and
supplies the public index's initial anchor. The local portal's Ready step uses
native SDK settlement and canonical finality checks; it is not an L1 proof or
testnet qualification.
The public reader/wallet configs are generated from these actual results, then
served by the existing `apps/rolling/start.mjs` components. Only the local public
operator receives disposable genesis fee funds. This is not a free token exchange
or evidence of router liquidity.

The liquidity preparation above checks locked Uniswap package versions and
artifact hashes, verifies Circle
commit `fc85788bc7c23cefe3df1a757133048bfddadeaa` and all compiler source inputs,
and compiles that official source with pinned solc 0.6.12 and OpenZeppelin 3.4.2.
The bounded compiler writes `.build/local-liquidity/`; it does not deploy anything.
An explicit dependency-root argument can reuse an existing matching installation.
Use published Uniswap bytecode, preserving its pool CREATE2 identity.

Startup reconciles the original PrivateBok constructor before deploying Circle's
FiatTokenV2_2 implementation, FiatTokenProxy and MasterMinter. It locks the
implementation and retains a separate private proxy administrator. Initialization
and the fixed 1,000,000 USDC local issuance use original signed-once journals.
The real authorization domain and six-decimal token identity are checked before
Bok portal binding. Missing original scope or administrator records halt recovery;
unknown operations are reconciled without retransmission. Existing token-bound
campaigns cannot silently change to another token.

`bok-lifecycle-config.json` captures the real token and Bok plugin ID separately
from the original constructor identity. The existing operator then reconciles
`deploy-portal`, `bind`, `activate`, `register` and `status` in order, with the
existing official native local Ready settlement queue between binding and activation.
An already matching canonical Outbox root skips repeated settlement. This remains
explicit test-controlled local settlement, not a network proof. Only canonical
portal-active/registered status writes the wallet's `config.bok` identity; missing
original token/lifecycle records halt an advanced campaign. The public readiness
record reports the deployment actor's test inventory and **unfunded user Bok
credit**, separately from hosted service and aggregate liquidity.

The exchange stage deploys official WETH9, Uniswap V3 factory, position manager,
SwapRouter02 and QuoterV2, then seeds three actual pools (WETH/FEE, WETH/USDC,
USDC/FEE). Declared seed ratios are local inventory policy, not market quotes.
Only actual canonical QuoterV2 reads become route-availability evidence. Exact
approvals are revoked after seeding; the local issuance and ten ETH WETH inventory
belong to the deployment actor. The existing RollingFundingRouter binds all three
real portals and the verified private FPC. No private user fee credit or model
provider is invented. Real user payment, private claims and named-wallet behavior
remain separate acceptance; target testnet addresses and liquidity must be
measured independently. A dedicated private relay signer is funded once with
0.1 local ETH through the same retained transaction machinery; it is never the
operator or proxy administrator. Its fixed 0.01 ETH per-operation ceiling and
0.1 ETH total budget are persisted. The initial USDC fee uses the real pool quote
for that ceiling plus 5%; later price changes can block new payments, not silently
change signed terms. Bootstrap returns private relay configuration with
`configured-not-started` status. The host opens the existing relay ledger before
serving its status/recovery route; a pending payment does not justify another
funding transaction or key. Failed on-chain relay transactions still consume the
relay's ETH gas, and no user payment or reimbursement is claimed by setup.
A separate private `--hosted-config /absolute/service.json` can opt into the existing
hosted service; it must explicitly select development mode and supply its own
validated current deployment. Provider secrets and deployment actor keys do not
belong in public wallet configuration or process arguments. A fresh app user
receives no local deployment privileges. Actual initial funding, authenticated
hosted replies and zero-ETH USDC conversion remain separate acceptance checks.

Stop with Ctrl-C or SIGTERM and wait for cleanup to finish. The owner closes
Bok (if configured), the reader/index and relay, then the query service, wallet,
native RPC, SDK network and Anvil, and finally releases its lease. Successful
native teardown records `network.json` as `mode: "native-disposable"`,
`phase: "stopped"`. A cleanup failure exits unsuccessfully, retains ownership
for reconciliation and reports `shutdown-failure.json` when it can write it.
Verify that the owned processes/listeners are gone; a terminal closing, laptop
sleep or saved journal is not proof of shutdown or autonomous recovery.

This runner has no persistent snapshot or same-chain restart operation. Preserve
its original private directory, deployment/transaction journals, browser recovery
and any service/user state needed for investigation. Do not reset, sweep or reuse
that directory. A later development run needs a fresh directory and its own
network scope; never replay uncertain old operations into the new chain. This
local teardown does not qualify production backup/restore or archive recovery.

The existing small configuration/recovery and deployment-engine checks are:

```sh
NODE_BACKEND=js .build/A02-node/node-v24.21.0-darwin-arm64/bin/node \
  --test --test-concurrency=1 --test-timeout=60000 \
  plugins/devnet/operator-test.mjs scripts/test-w03-deploy-engine.mjs
```

Node's test context always selects the non-operational startup checks. The old
legacy contract lifecycle remains available only through explicit direct execution
of `plugins/devnet/operator-test.mjs`; it is not current Rolling acceptance.
Fresh deployment, graceful cleanup and an included wallet action require actual
local runtime evidence. Focused checks do not prove same-chain restart support.

### Native progress and finality

`network.mjs` composes the pinned SDK's `startAnvil` and `createLocalNetwork` with
native automining and proofs disabled. The SDK owns block production and local
settlement; no application idle clock, custom consensus loop, Anvil dump schedule
or persistent checkpoint rotation is involved. The configured 6-second block
geometry supplies the SDK's documented class-publication capacity; it is not an
application sleep or polling schedule.

When a development check needs missing state, use the native node controls
`mineBlock()` and `prove()` (also exposed by `createAztecNodeDebugClient` on the
loopback node RPC). Read the actual message, receipt or witness before advancing.
`ensureDevelopmentMessageReady` mines only while the Inbox message is not
consumable. Ready handling verifies the original effect and canonical Outbox
witness. `waitDevelopmentFinality` accepts an already finalized receipt, otherwise
proves a successful checkpointed transaction or mines native blocks while it is
proven, rechecking the original canonical anchor each time. Its 120-second bound
reports failure; elapsed time never establishes readiness or permits a resend.
These controls are exclusively for the disposable native chain. Testnet acceptance
still requires real proofs, settlement and the existing release gates.

The relay initialization marker lives beside `relay-state`, not inside it. Once
that marker exists, loss of its original directory or `funding-budget.json` is a
recovery failure before any relay funding stage. Never delete the marker or
recreate a ledger to clear an unresolved plan.


Rolling automated moderation evaluates the authoritative main rules first, with
no local-rule text in that model request. A main violation is sufficient for
removal. Only when main rules permit does it evaluate nonempty local rules in a
second request. Both must permit for the post to remain evaluated OK; either
request failing or returning an invalid verdict leaves durable unresolved work
and submits nothing. Local instructions therefore cannot override a parent
prohibition by contaminating its prompt. This costs up to two sequential model
calls and requires renewed latency/capacity evidence. The existing runtime
identity binds the moderation implementation, invalidating earlier decisions
after this change. Legacy moderation and qualification thresholds are unchanged.
