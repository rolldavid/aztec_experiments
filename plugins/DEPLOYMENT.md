> The V5 implementation and deployment history below is superseded for the current
> live application by the [V6 testnet handover](../deploy/V6-TESTNET.md).
> Preserve V5 recovery configuration for any older deposits.

# Deploying a plugin

Use the built plugin-enabled board and escrow artifacts from the same commit.
The existing pre-plugin board cannot be upgraded by merely registering this
adapter: deploy a compatible board using the application's board deployment flow.
No server or blockchain infrastructure is provisioned by these commands.

Copy `operator-config.example.json` outside the source tree. Verify the network,
board and six-decimal USDC contract against your deployment. The example endpoints
are the existing project's V5/Sepolia configuration, not mainnet defaults.
Create a fresh operator with `node plugins/create-actor.mjs /absolute/private/path/operator.json`. This writes keys only to a new mode-0600 file and prints only its address.
The operator and board owner may be different Aztec accounts. Their private JSON
files have `address`, `secret`, `salt`, `signingKey` and must have mode 0600.
Use `npm run plugin:operator -- fees CONFIG.json STATE.json` to check the selected actor.
The operator pays its own public Aztec transaction fees; fund its public Fee Juice
balance using the network's ordinary fee bridge before starting the service.
Save its private receipt (`claimAmount`, `claimSecret`, `messageLeafIndex`) and run
`npm run plugin:operator -- claim-fees CONFIG.json STATE.json --claim RECEIPT.json`.
This claims the credit and pays that transaction from the same credit, so a fresh
operator does not need an already-funded Aztec fee balance.
The user continues using the application's private fee account for user actions.
Do not include operator keys in a public descriptor or web bundle.

## Deployment

Set `PLUGIN_ACTOR_FILE` to the board owner's private account file and
`PLUGIN_ETHEREUM_PRIVATE_KEY` locally to the deployment wallet. Use the same
private state file throughout. Each command persists an exact transaction before
broadcast. Repeating an interrupted command uses the same signed transaction;
it does not generate another deployment or debit.

```
npm run plugin:operator -- deploy-escrow CONFIG.json STATE.json
npm run plugin:operator -- deploy-portal CONFIG.json STATE.json
npm run plugin:operator -- bind CONFIG.json STATE.json
npm run plugin:operator -- activate CONFIG.json STATE.json
npm run plugin:operator -- config CONFIG.json STATE.json > SERVICE.json
```

Setup sends return after checkpoint inclusion. Public activation/redemption require
a successful finalized Aztec receipt and actual Outbox settlement. If it is not yet available, rerun
`activate` later. No development root injection exists in this command. A dropped
or reverted transaction is not treated as success. Reverted operations require
inspection and a new operation state; never delete pending financial records.

The generated service config points to the operator's private file. Keep it local.
Start `npm run bot:serve -- /absolute/path/SERVICE.json`. Publish the `descriptor`
object from SERVICE.json as a static JSON file on an existing HTTPS site. This
needs no reverse proxy or public inbound access to the operator. When the descriptor
is hosted on a different origin from the board page, serve that public JSON with
`Access-Control-Allow-Origin: *` (no credentials). CSP permission alone does not
permit cross-origin fetching. Verify the fetch in a browser before registering. Add that HTTPS
origin to the application CSP when it differs from the frontend origin. The local
service binds loopback; `/health` reports active jobs and the latest outcome.
Then register its pinned descriptor with the board:

```
npm run plugin:operator -- register CONFIG.json STATE.json
```

Public configurations cannot select development confirmation rules. Both node
identity and plugin scope are checked before the service starts. Application
proofs are enabled outside the explicitly disposable local network.

## Earnings and provider treasury

Set `PLUGIN_ACTOR_FILE` to the configured operator, keeping the same deployment
state. Use an Ethereum wallet able to pay redemption gas; the recipient is explicit.

```
npm run plugin:operator -- earnings CONFIG.json STATE.json
npm run plugin:operator -- withdraw-earnings CONFIG.json STATE.json --amount 1 --recipient 0xYOUR_ADDRESS
npm run plugin:operator -- redeem-earnings CONFIG.json STATE.json
```

The second command debits only operator earnings; the third waits for the ordinary
Outbox path and returns USDC on Ethereum. It cannot spend user balances. Preserve
STATE.json until redemption completes. It contains signed transactions and must
remain private. It is operational recovery data, not a service billing database.

Venice is paid separately from the operator's Base USDC wallet configured in
`plugins/.env`. `VENICE_AUTO_TOP_UP=true` buys credits within the configured per-top-up
limit. Replenish that wallet from redeemed earnings with the CCTP command below; no
bridge or swap is silently performed by the bot. Operator fees are not charged as
LLM token usage. Monitor Fee Juice, provider credits, and stopped requests.

## User failures

The Plugin balance panel lists the account's requests directly from Aztec, 50
scanned requests per page. It distinguishes replies, cancellation, expiry, known
failure and uncertain provider calls. Cancellation is available only with no
outstanding reservation. Expired reservations can be released by anyone.
No retry of an uncertain paid request occurs. A crashed execution is not resumed.

## Operator earnings to Base

`node plugins/treasury.mjs CONFIG TRANSFER_JOURNAL` moves an explicit batch of
operator-owned native USDC from Ethereum to Base through Circle CCTP v2 forwarding.
This command does not access the escrow, user balances, or request execution.
Redeem operator earnings first; the Ethereum wallet pays source gas. Circle pays
destination gas from the bounded USDC forwarding fee. No additional service runs.

Configuration contains `network` (`testnet` for Sepolia/Base Sepolia, or `mainnet`
for Ethereum/Base), `ethereumUrl`, `baseUrl`, `ethereumWalletFile` (private JSON
containing `privateKey`), `recipient`, `amountUSDC`, and `maxFeeUSDC`. For live Venice,
recipient is the public address of `VENICE_WALLET_PRIVATE_KEY`. Testnet USDC cannot
fund mainnet Venice credits. The two RPC chain IDs are checked before signing.

Use one new journal path per intended transfer. Resume the same path while the
command reports `awaiting-*`; it reuses the exact signed source transactions.
Never delete the journal to retry a transfer. Run one transaction command at a
time per Ethereum wallet. A fresh forwarding quote is bounded by `maxFeeUSDC`
before signing the burn; a signed burn is never changed automatically.

Completion requires the source burn to match the configured route and amount,
the destination nonce/body to match Circle's attested message, exact native-USDC
mint and fee events, and destination finality. Unknown future standard-transfer
fee schedules and ambiguous batched receipts are rejected. The current reference
uses standard transfers; it does not trade assets or choose an alternative bridge.

Protocol references: [Circle forwarding](https://developers.circle.com/cctp/concepts/forwarding-service),
[contract registry](https://developers.circle.com/cctp/references/contract-addresses),
[message encoding](https://github.com/circlefin/evm-cctp-contracts/blob/a92a2b4e7e6ef99bf0b05dca71780f5ec190e729/src/messages/v2/MessageV2.sol).

## Local persistent operator installed for this deployment

The macOS LaunchAgent `local.aztec.bok` runs pinned Node with the private `.env`
file, this checkout's `plugins/main.mjs`, and `.build/public-plugin/service.json`.
Its plist is at `~/Library/LaunchAgents/local.aztec.bok.plist`; it contains paths,
not credentials. It starts at login and restarts after an unexpected exit. Logs
are in the private `.build/public-plugin/service*.log` files. No remote instance
was provisioned. The machine must remain online for the operator to process work.

Check `http://127.0.0.1:8787/health` and `launchctl print gui/$(id -u)/local.aztec.bok`.
Before a planned stop, wait for `active: 0`, then run
`launchctl bootout gui/$(id -u)/local.aztec.bok`. Start again with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.aztec.bok.plist`.
Interrupted invocations follow the documented on-chain expiry rules; the service
never repeats an uncertain provider call on restart.

The separate `local.aztec.bok-moderator` LaunchAgent runs the existing censor
service for this board. It uses its own claimed private Fee Juice balance and
persistent moderation queue. The bot's public Fee Juice balance is not a substitute.
The installed local model is Qwen3.5-9B-Q4_K_M, SHA-256
`03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`,
in the native ARM llama.cpp b11058 image
`ghcr.io/ggml-org/llama.cpp@sha256:3a6c3e3b22dca42ae12dbdfb5cb53531ca1f7ea8fd4348e9ef2503b2bc8629a6`.
It uses four threads, context 4096 and an 8192 MiB container limit. Docker Desktop
must be running. The service does not automatically restart after a runtime error;
inspect `.build/public-plugin/moderator*.log` and the durable queue before restarting.
Health must show successful feed ingestion and no pending error, not merely a live
process. A clean moderation decision is distinct from contract screening.

These are testnet installation records. Preserve the private deployment directory,
wallets and queue; they are not disposable test output. The public browser sequence
is documented in [public/README.md](public/README.md).

## Generated static execution (G11)

`createIsolatedExecution` in `isolated-execution.mjs` is a **trusted host
capability**, not an arbitrary shell tool. Construct it with real, owned
`workspaceRoot` and `outputRoot` directories. Call
`execute({sourceDirectory, revision})` while the repository's invocation lease is
held. Call read-only `assertAvailable()` during hosted startup before accepting
paid execution work: it checks the reachable Docker daemon's exact cached image
identity/platform without creating a container. It reports the pinned expected
Node v24.21.0; each execution verifies that version before generated commands.
`revision` is the exact 40-character source commit; the caller must bind it
to that materialized directory before accepting its compare-and-swap update.
The executor additionally captures a SHA-256 manifest of actual bytes and checks
that the public source has not changed before returning success.

The capability uses the already-installed Docker runtime and exact cached public
image `sha256:44479404b67dde931cf8f202a3ce34703876e709ce124924251da8435d5d8651`.
It never pulls images, installs dependencies, or passes host Docker/configuration
access to generated code. Source comes from a public invocation tree, not the
operator's checkout or home. Root `.git` metadata is omitted without being read;
ordinary dotfiles such as `.gitignore` remain part of the byte manifest. Links,
`.github`, credential configuration, environment files, and `node_modules` are
rejected. Credential-free, pinned dependencies may be designed separately later;
there is no host install fallback.

Both `node --test` and `node --run build` must succeed; a real Node test file and
a package build script are required. The build must produce `dist/`. Generated
code runs as UID/GID 1000 with no Linux capabilities, no new privileges, no
network or published ports, no host mounts, a read-only image, and private PID,
IPC and cgroup namespaces. Writable storage is bounded tmpfs: 64 MiB work,
16 MiB temporary files, and 1 MiB shared memory. Limits are one CPU, 256 MiB RAM
and equal memory/swap bound, 64 processes, 256 file descriptors, 8 MiB per written
file, 64 KiB combined program output, and at most 45 seconds for both commands.
The host reserves cleanup time within a 60-second envelope. Trusted callers may
reduce the work deadline; they cannot increase it or supply commands, environment,
mounts, images or network settings.

The host records an exclusive intent before create, verifies container settings
before start, and removes only the exact owned container ID. An ambiguous create
is reconciled by its fresh name and ownership label, never repeated. A failed
cleanup rejects the call and leaves its private intent/cleanup record for the
operator. Never turn that into an automatic retry. A hard host crash requires
operator reconciliation of that retained name; this is not a remote service or
an independent cloud shutdown mechanism.

Successful output includes `passed`, exact `revision`, `sourceDigest`, captured
source manifest, actual container Node version, test/build outcomes, artifact
manifest, and digests of `source-snapshot.json` and `artifacts.json`. These JSON
archives contain exact base64 bytes, not executable extraction instructions.
Regular bounded artifacts are also written under the new private `dist/` output
folder after path, size, duplicate and link checks; the captured public source is
written under `source/`. Returned logs are bounded **untrusted generated text**.
Do not interpret their contents as operator instructions or independent test
attestation. Source and generated tests can intentionally be wrong even when the
commands exit successfully.

This capability does not publish, deploy a server, access a wallet, prove a
transaction, merge a PR, or activate cloud infrastructure. Generated HTML/JS is
untrusted active browser content and must later use a separate origin with no
board/operator credentials. That publication gate is independent of static
build success.

On failure, `error.code` is a fixed `STATIC_FAILED`, `STATIC_CLEANUP_REQUIRED`,
or `STATIC_RECORD_FAILED` category. `error.result` provides `passed:false`, the
validated revision, optional captured `sourceDigest`, finite phase/outcome, and
a bounded `log` for the model's repair loop. Logs are untrusted generated output;
no raw host exception, path, Docker diagnostic or host environment is included.
Startup unavailability throws only `STATIC_UNAVAILABLE`. A successful checked
Git tree may be reused by the repository owner only after validating its exact
parent/tree/revision binding; plain chat requires no build or checkout.
