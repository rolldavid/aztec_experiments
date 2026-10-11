# Board prover deployment

A c7a.4xlarge provides 16 physical cores and 32 GiB RAM. The historical bounded
deployment used Spot in us-east-1. Reconcile current deployment records and the
shared infrastructure ledger before selecting capacity or extending a deadline.
One serial worker; no autoscaling, Redis, public service discovery or wallet on
this machine. The website's operator selects the endpoint. Browser signing and
private execution remain local.

## Build

Use a clean pinned repository installation and an official Linux x64 Node archive
whose SHA256 has been verified against Node's release checksums. Run:

```
python3 deploy/prover/package.py NEW_OUTPUT --node-archive VERIFIED_NODE_ARCHIVE
```

The native binary must match the platform SHA256 in toolchain.json before it can
execute, and must report the exact pinned V6 version. Its source is the
integrity-locked official @aztec-foundation/bb.js npm package.

The output contains source, installed dependencies, trusted circuit artifacts,
CRS files, native Linux BB and Node. prover-release.json records every file hash.
The source commit alone does not identify uncommitted changes; those file hashes
do. Copy only this package; never copy .build, wallets or the whole workspace.

## Host

Install the package in /opt/board-prover/releases/RELEASE and point
/opt/board-prover/current at it. Create a system user/group board-prover. Install
board-prover.service into /etc/systemd/system. The host needs no AWS role to prove.
Use encrypted EBS with DeleteOnTermination and restrictive SSH access for installation.
A live deployment must have an explicit spending horizon; trial instances should
have an independently scheduled shutdown within the user's approved budget.

Place the public operator config at /etc/board-prover/config.json:

- host 127.0.0.1, port 8081, proofs real, threads 16
- actual board address, chainId and rollupVersion from published board config
- privateFeeAddress matching that board’s published privateFee.contractAddress
- origins containing the website's exact HTTPS origin
- trustedProxy 127.0.0.1
- queueDirectory /run/board-prover, crsPath /run/board-prover/crs
- queryNode, when private wallet queries are enabled:
  `{"url":"http://127.0.0.1:8082/","rollupAddress":"ACTUAL_LOWERCASE_L1_ROLLUP_ADDRESS","maxLagSeconds":120}`

`queryNode.url` is a fixed loopback HTTP root URL (127.0.0.1 or ::1); it has no
credentials, path, query or fragment. `rollupAddress` is the actual nonzero
20-byte L1 address, not a placeholder. The adapter also binds the full node to
`chainId`, `rollupVersion` and the service's `proofs` policy. `maxLagSeconds`
defaults to 120 and accepts integers 1–600; this is an engineering freshness
policy, not a claim of network finality. Omitting `queryNode` disables private
queries. It must not silently select the ordinary public node.

Operate the full node, persistent world state, archiver, contract-data and log
providers inside the same explicitly disclosed trusted prover boundary. Verify
its fixed L1 synchronization/data sources and their ingestion behavior: user-specific
misses must never be forwarded to the ordinary board backend or another node.
An HTTP adapter around an independently operated external archive does not
establish this boundary. Endpoint configuration and matching chain IDs do not
prove operator identity.

Provision and supervise this full node separately. Its database, archive,
backups and journals must not use `/run/board-prover`, the temporary proof queue,
or any directory removed by the proof service. The current proof-service unit
has no fullnode lifecycle or persistent-storage permission; do not casually
broaden it. Verify synchronization, recovery, capacity, the cumulative budget
and independent shutdown controls before enabling paid infrastructure.

Set ownership root:board-prover and mode0640. The service writes only in its
systemd RuntimeDirectory, so orphan queue files are removed between starts.
Install a verified pinned Caddy binary and the included Caddyfile, running it as
a separate nonprivileged service on port8080. Caddy overwrites X-Real-IP after
reading CloudFront's appended X-Forwarded-For from right to left. Restrict inbound
8080 to CloudFront's service-managed VPC-origin security group. Never open this
port to the public internet or unrelated VPC callers: the proxy trusts the
private transport, not arbitrary incoming forwarded headers.

## HTTPS route

Create a CloudFront VPC origin referring to the EC2 instance. The website keeps
its existing S3 origin. withProverOrigin in cloudfront.mjs produces the minimal
distribution change: /prover/* uses that private origin, HTTPS viewers only,
caching disabled, all viewer headers forwarded, one connection attempt. Caddy
strips /prover before proxying to the service. Unsupported methods are rejected
by the service. No public origin, additional domain or paid load balancer is needed.

Preserve a copy of the existing distribution config/ETag and published website
objects before updating. Do not overwrite concurrent changes: use current ETags.
Publish the rebuilt pages and their corresponding CSP function together, then
publish board-reader-config.json with remoteProver.url equal to the website
origin plus /prover. Other discovered boards cannot inherit that proof endpoint.
Also publish `trustedProverNode` separately:

```json
{ "trustedProverNode": { "url": "https://YOUR_SITE/prover/v1/node", "proofs": "real" } }
```

Use the actual website origin. `proofs` defaults to `real`; `disabled` is allowed
only for explicit loopback development on chain 31337. This query connection
remains selected when the user chooses local proof generation. The ordinary
`network.nodeUrl` remains the public-feed connection. Missing or unhealthy
trusted query configuration blocks private wallet, fee and recovery operations,
while public browsing remains available. The existing `/prover/*` route already
covers `/prover/v1/node`; no separate ingress or public node port is needed.
Invalidate changed paths and verify from a fresh browser. On rollback, restore
matching website/config/CSP and distribution routing before removing the VPC origin.

`deployment-permissions.json` is a self-contained replacement inline policy for
one SSO permission set (currently MessageBoardCompute2). No additional managed
policies are required for this deployment. It grants account-wide EC2 and
CloudFront management, website object access restricted to the board bucket,
creation of the Spot and CloudFront VPC-origin service-linked roles, and deployment
inspection. It does not grant general IAM administration. Assign and provision
this same permission set to the operator and account; separate SSO roles do not
combine. The API-action checklist includes upload, verification, rollback and
cleanup, including CloudFront tagging and multipart upload cleanup.

## Qualification and health

GET /prover/healthz returns mode, aggregate queue/job counters and separate
`query.enabled` / `query.ready` facts, never witnesses or bearer job IDs. Top-level
`ready` describes the proof service and must not be treated as fullnode readiness.
For wallet use require `query.enabled: true` and `query.ready: true`; identity,
proof-policy, canonical-anchor, synchronization or freshness failures close the
query gate. Check systemd is active and production health reports real. Then submit
an actual board transaction from a fresh browser and verify node acceptance and
feed visibility; repeat with remote disabled and then enabled. Native benchmark
time alone is not service acceptance.

Queue capacity is 1000 retained jobs/2GiB, with one active process and 120-second
worker deadline. Pending jobs expire after30minutes, completed results after60seconds.
A restart fails outstanding jobs rather than silently replaying them. The browser
must create a fresh transaction after expiration. Per-IP admission limits do not
prevent distributed abuse. MemoryMax and fixed instance count bound resource use.
No witnesses or job URLs should be logged. The operator can see private witness
information and must be trusted by users.


## Isolated package verification gate

The packaging unit regression copies the real source through `copy_sources`,
then runs the unmodified query adapter and inspector outside repository ancestors,
with `NODE_PATH` and `NODE_OPTIONS` cleared. Its SDK is explicitly fake. Removing
the copied helper makes enabled-query construction fail, even though the disabled
query path still imports successfully. Run it with the pinned validation Node:

```
PROVER_VALIDATION_NODE=/ABSOLUTE/PINNED/NODE python3 scripts/test-prover-package.py
```

This source-copy check on a Mac does **not** qualify the Linux runtime. Before
activation, build the complete candidate with `--application-profile rolling`
and `--validation-node /ABSOLUTE/PINNED/NODE`, then perform these checks on Linux
x86-64 against that exact release:

1. Place the release outside the checkout and every directory containing the
   development `node_modules`; do not symlink dependencies back to the workspace.
   Clear `NODE_PATH`, `NODE_OPTIONS` and any external `BB` override. Use only
   `RELEASE/node/bin/node`. Verify `process.platform === 'linux'`,
   `process.arch === 'x64'` and its version against `toolchain.json`.
2. Verify **every** `prover-release.json.files` SHA256 before executing package
   code, including `shared/trusted-private-node.mjs`, the packaged Node executable,
   artifacts and dependencies. Reconcile the recorded source commit and manifest
   with the reviewed candidate. With the packaged Node, call
   `resolveNativeProver()` from `prover/native-binary.mjs`; it checks the Linux BB
   SHA256 before executing `--version` and requires the pinned version. For rolling
   candidates call `loadRollingArtifacts()` from `prover/rolling-artifacts.mjs`.
3. Under the existing test supervisor, start a labelled disposable local **actual
   pinned SDK node** with proofs disabled and chain 31337. Keep all its accounts,
   state and ports isolated. Start the packaged `prover/start.mjs` using a private
   temporary config with `proofs: "disabled"`, matching network scope and
   `queryNode.url` pointing to that node. Do not inject an inspector or replace SDK
   dependencies in this gate. The production adapter must dynamically load the
   packaged helper, and `/healthz` must report query enabled/ready.
4. From a separate process using the packaged Node and modules, call
   `createTrustedPrivateNode` from `shared/trusted-private-node.mjs` with the
   packaged service's loopback `/v1/node` URL, the exact expected network scope,
   `proofsEnabled: false` and `allowLocalDev: true`. Query public node info and a
   canonical block. This exercises the real client, service, inspector and SDK node
   together without claiming genuine proof or privacy acceptance.
5. In isolated negative cases change expected rollup/chain/version; require client
   rejection. A real-proof policy against the disabled local node must reject.
   Stop/pause L1 ingestion using the fixture's supported controls, wait beyond its
   configured freshness bound, and require unready health and rejected queries.
   Resume supported ingestion and verify recovery. Never edit observed timestamps
   or substitute a passing inspector. Check there is no ordinary-node fallback.
6. Use a disposable **copy** of the candidate for the missing-file control: remove
   `shared/trusted-private-node.mjs` and start with queries enabled. Startup must
   fail before accepting requests. A disabled-query startup is not this test.
   Preserve failure output, then discard the altered copy; do not remove or restore
   files in the active release. Recheck the intact candidate's manifest.
7. Stop the fixture and verify all owned processes are absent. Record package
   manifest hash, source revision, Linux/Node/BB identities, exact config public
   fields, commands, outcomes and cleanup. Exclude credentials and RPC bodies.

Only after this gate should the intended synchronized network node replace the
local qualification fixture. Verify its archive completeness and storage recovery,
then collect the required two-account cold/warm/restoration/reorg traces and
upstream capture with both proof preferences. Independent privacy review and
production release gates remain open until their actual evidence exists.
