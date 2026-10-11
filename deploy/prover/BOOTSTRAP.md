# Bounded node and prover package bootstrap

This generator prepares one private EC2 user-data payload. It makes no cloud
calls and starts nothing on the development computer. It installs the reviewed
Linux runtime and a testnet fullnode; **the prover and its proxy remain masked**.
It supplies no Rolling contract addresses. It automatically attempts the reviewed
Linux query qualification against the explicitly labelled historical legacy board.
Existing legacy addresses may only be used later in an explicitly labelled
legacy qualification. The existing prover service's 24GiB limit is unchanged.

## Reviewed deployment inputs

The lead must first reconcile `execution/infrastructure-ledger.json`, authorize
its reservation, and verify that no old instances, volumes or fleets overlap.
The proposed host is m7a.4xlarge, 64GiB, encrypted40GiB root and one blank encrypted
1024GiB gp3 disk, both DeleteOnTermination. Default gp3 is3000IOPS/125MBps;
acceptance must measure whether this serves the node and serial proving workload.
The node is limited to24GiB with swap disabled. No extra instance profile,
SSH key, SSH ingress, NAT gateway or paid monitoring is required.

Create an owner-only directory outside every checkout, with a600 JSON input:

```json
{
  "createdAt": "YYYY-MM-DDTHH:MM:SSZ",
  "budgetStop": "YYYY-MM-DDTHH:MM:SSZ",
  "commissioningStop": "YYYY-MM-DDTHH:MM:SSZ",
  "runtimeUrl": "https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.us-east-1.amazonaws.com/releases/REVIEWED/runtime.tar.gz?REDACTED",
  "runtimeArchiveSha256": "64 lowercase hex characters",
  "manifestSha256": "64 lowercase hex characters"
}
```

Creation must be within five minutes of generation. Budget stop is at most eight
hours after creation; commissioning stop is exactly thirty minutes after creation.
The archive contains release contents directly, including `prover-release.json`,
not an enclosing directory. Its external SHA256 and manifest SHA256 must be
recorded by the lead after packaging. Node24.21.0 Linux binary, BB6rc1 binary,
and reviewed Rolling catalog hashes are additionally pinned in this generator.
A changed catalog requires source review; rebuilding an identical catalog with a
new qualification helper needs only new external archive/manifest hashes.

Use a short-lived, object-scoped S3 GET capability, valid for initial download.
This is not an AWS profile or host role, but it is a bearer secret: never paste it
into evidence, print user data, enable shell tracing, or share it with application
processes. No private configurations or wallet material belong in the archive.

```sh
python3 deploy/prover/bootstrap.py --config /private/operator/bootstrap.json \
  --output /private/operator/user-data.gz
```

The output is deterministic gzip cloud-init shell data,600, created exclusively
outside this checkout under an owner-only700 directory. The CLI prints only its
size and SHA256. It refuses output exceeding EC2's16KiB decoded user-data limit.
Pass this binary via the AWS SDK/CLI's normal base64 user-data encoding; do not
base64 it twice. Do not commit the input, generated file, or launch request.

## Independent controls and installation order

The lead must create an EC2 Fleet of **type request**, one On-Demand instance,
zero Spot, explicit persisted ClientToken, absolute ValidUntil equal to budgetStop,
and TerminateInstancesWithExpiration=true. Request fleets cannot be modified
through ModifyFleet. Verify the actual response and readback; a JSON proposal is
not an installed cloud shutdown. InstanceInitiatedShutdownBehavior must be
terminate. Reconcile ambiguous launch outcomes by the original token/fleet; do
not issue a new financial action just because its receipt is missing.

Before any package or image download, the host:

1. Persists the immutable dates and package identity under `/var/lib/rolling-bootstrap`.
   Re-running cannot extend dates or substitute a package. A file lock prevents
   simultaneous writers. Past deadlines fail closed.
2. Installs and activates absolute persistent budget and commissioning timers.
   Shutdown invokes poweroff; the launch template must make that terminate EC2.
3. Masks and stops any prover/proxy, then installs the whole physical ENI HTB
   egress ceiling of50Mbps. This covers Docker forwarding and IPv4/IPv6. It
   verifies the actual root qdisc and configured rate/ceiling using version-guarded C-locale class text and qdisc JSON.
4. Installs a five-second monitor emitting only fixed public console fields once per minute or stage change.
   Missing controls stop services and trigger shutdown. No raw service logs,
   URLs, environment, private account information or exception messages are emitted.
5. Downloads one runtime archive without redirects/retries, validates its hash,
   safely extracts it, validates the manifest and every file, checks native pins,
   runs the pinned Node/BB version checks, and loads the real Rolling catalog.
6. Mounts the dedicated1024GiB data disk by UUID. Only a blank unpartitioned disk
   may be formatted; recorded existing UUID/filesystem must agree on subsequent
   invocation. Unexpected filesystems, mounts or multiple candidates stop bootstrap.
7. Installs Docker if necessary and pulls the exact Linux amd64 image digest.
   Starts only the fullnode. After verifying the budget/egress controls, disables
   the commissioning timer; the absolute budget timer remains active. Then it starts
   the separate bounded qualification job described below.

The image is `azteclabs/aztec@sha256:e5bc218e326b4f3b1cd06b0309cb98e87fef5dfda3330157ce1e393d89416c32`.
The generator embeds the inspected11October network configuration: registry,
bootnodes, snapshot URLs and read-only blob/transaction stores. It never fetches
mutable network defaults at boot. The node receives this via NETWORK_CONFIG_LOCATION.
Trace and blob-source bypasses remain false and proofs remain real.

RPC is mapped only at127.0.0.1:8082. Admin8880 is mapped only at127.0.0.1:8882
for trusted host qualification pauseSync/resumeSync calls; its exact URL is
`http://127.0.0.1:8882/`. It remains inaccessible externally. The prover user
receives no Docker access. Only40400TCP/UDP is
published for P2P. Security groups must preserve private CloudFront routing and
must not expose node RPC, admin, Docker or SSH. IMDSv2 is used only to read the
host's public IPv4, not credentials. Require IMDSv2/hop limit1 in the launch template.
The runtime and node never receive the Docker socket or developer credentials.

All traffic initially uses the default25Mbps guaranteed class, which can borrow
up to50Mbps. Before a later prover enablement, the lead must mark the dedicated
prover/proxy UID's outbound packets with fwmark20 (IPv4 and IPv6); that class has
a separate25Mbps guaranteed share under the same aggregate50Mbps ceiling. The
aggregate ceiling already applies regardless of marks. Verify counters using a
bounded local/remote transfer before claiming a networking budget bound. The
five-second monitor detects loss but cannot make a lost shaper instantaneous;
include that failure-window allowance in the lead's launch forecast.

## Qualification and recovery gate

Console stage `installed` means installation only, never synchronization or
accounting acceptance. `linuxQueryQualified` remains false until the single
qualification attempt passes every required check and cleanup. The lead reads sanitized console output using the supported EC2 API,
verifies Fleet expiry and volume deletion controls, and checks actual canonical
identity/sync through the reviewed runtime qualification procedure. The bootstrap
does not unmask the prover or install an application config. The reviewed
`prover/qualify-runtime.mjs` must be included in a freshly hash-bound runtime archive.

The compressed Docker image is about540MB; the inspected snapshot objects total
68,390,965bytes. Decompression, catch-up, RPC throttling and shared CPU/I/O remain
unmeasured. Do not promise eight-hour acceptance. Never widen deadline, memory,
trace or proof guards just to obtain a successful startup.

A failed bootstrap emits only its fixed stage and shuts down. Partially extracted
packages are never executed or overwritten. Retry requires diagnosis and a new
lead-approved host/package with its own forecast. The original fixed expiry
remains in force. A normal reboot preserves the UUID data mount, budget timer and
shaping prerequisite. Runtime archives/evidence required after termination must
be retained externally within the ledger; the node database is deliberately
rebuildable and DeleteOnTermination, not an unbudgeted retained volume.

## Development checks

```sh
python3 scripts/test-prover-bootstrap.py
```

These are labelled unit fakes plus real shell/Python syntax and archive/file
validation. They do not execute Linux services, cloud operations, Docker, proofs,
private credentials or model calls. An actual Linux bootstrap remains a separate
reviewed commissioning exercise.

### Traffic-control format provenance

Ubuntu 24.04's reviewed iproute2 packages are `6.1.0-1ubuntu6` and
`6.1.0-1ubuntu6.4`; the host checks both the package version and `tc -V`.
Contrary to current upstream main, these packages do not support JSON class
output. The parser uses `tc -s class show dev ENI`, requires all three exact HTB
class identities/parents, 50/25/25Mbit rates and 50Mbit ceilings, and requires an
unsigned 64-bit `Sent` byte counter for every class. Missing counters never become
zero. Qdisc JSON must report the unique root `1:` HTB and default class `0x10`.
Unknown versions/formats fail commissioning; there is no alternate guessed format.

Source evidence: [Ubuntu source archive](https://archive.ubuntu.com/ubuntu/pool/main/i/iproute2/),
`iproute2_6.1.0.orig.tar.xz` SHA256
`5ce12a0fec6b212725ef218735941b2dab76244db7e72646a76021b0537b43ab`,
`iproute2_6.1.0-1ubuntu6.4.debian.tar.xz` SHA256
`d127ad985c91e0cc4192876721e533efc893deed08e256b3662205d8401552cd`.
The Ubuntu patch series changes HTB burst parsing, not its class output.
Upstream matching sources: [tc_class.c](https://raw.githubusercontent.com/iproute2/iproute2/v6.1.0/tc/tc_class.c)
(print_class), [q_htb.c](https://raw.githubusercontent.com/iproute2/iproute2/v6.1.0/tc/q_htb.c)
(htb_print_opt), [tc_util.c](https://raw.githubusercontent.com/iproute2/iproute2/v6.1.0/tc/tc_util.c)
(print_tcstats2_attr), and [tc_qdisc.c](https://raw.githubusercontent.com/iproute2/iproute2/v6.1.0/tc/tc_qdisc.c).
The root class relationship follows Linux6.8 `htb_dump_class`.

Fixtures are source-derived development cases, **not captured Linux evidence**.
The default rate formatter rounds below 1Kbit/s at these rates; the installation
sets exact rates but text readback cannot distinguish that sub-Kbit variation.
Reserve this small tolerance in the forecast and verify actual Linux shaping and
counters before workload acceptance. The five-second monitor interval is not a
hard five-second shutdown bound: scheduling and command/poweroff latency also
need budget allowance. This repair does not waive either commissioning gate.

### Automatic Linux qualification, without a remote shell

`rolling-qualification.service` starts once after installation and uses the
packaged Node24.21.0 and reviewed qualifier. Its cgroup allows loopback networking
only; node P2P/L1 synchronization runs in the separate node service. The job has a
private temporary directory, read-only system/release, empty capabilities,
`LOG_LEVEL=silent`, no `NODE_PATH`, `NODE_OPTIONS`, `BB`, Docker socket, host IAM
role or wallet. The process group is terminated at 105minutes at the latest;
readiness is additionally bounded by creation+90minutes and the complete job by
budgetStop−60seconds. The original 30minute timer protects installation; it is
retired only after installation and verified controls, never extended for sync.

The direct node readiness probe uses installed `createAztecNodeClient` with a
bounded, no-redirect/no-retry transport and `inspectTrustedNode`; it does not
mistake raw node RPC for the trusted service `/healthz` interface. Each poll
checks actual network/proof identity, coherent canonical anchors, world-state
synchronization and ≤120second L1 lag. Only public readiness data is queried.
The loopback addresses are RPC8082 and admin8882.

Scope is fixed from the repository's `deploy/prover/live-deployment.json`:
Sepolia11155111, rollupVersion2914217885,
rollup`0x8c2fb2a68a3d362ab1de99e06f83f8903160bbd9`, legacy board
`0x0346558fcce04c4bf0b0907c1ef20858b9583123ef55bceb7125cb3fc3fb3752`.
The config explicitly says `applicationProfile: legacy`, `proofs: real` and
zero public listener port. These historical addresses do not identify a Rolling
application. No proof job, model call or wallet action is submitted.

An exclusive fsynced intent is recorded before readiness polling. Then exactly
one qualifier invocation has at most 15minutes. It tests actual healthy client
composition, wrong chain/version/rollup rejection, proof configuration floor,
elapsed staleness after supported pauseSync, rejected stale queries, resumeSync
and recovered canonical queries, removed-helper startup rejection, unchanged
manifest and child/service/file cleanup. No second attempt follows a failure,
reboot, timeout, lost receipt or incomplete journal. The systemd post-stop action
turns an interrupted attempt into `interrupted-unknown`; qualification failure
requests the existing budget shutdown. If killed during pauseSync, there is no
claim that the node recovered: the host shuts down and remains unqualified.

Durable owner-only records live under `/var/lib/rolling-bootstrap/qualification`:
intent, fixed config, canonical readiness, original bounded qualifier report and
safe projected result. The existing console channel emits only validated
booleans, public network/canonical anchors, fixed stages, manifest and report
hashes. The lead can independently compare the canonical hashes and every check
via the AWS console-output API. No raw logs/errors/configuration or capability
URL enter the console. A success remains **legacy Linux query qualification**,
not genuine Rolling proofs, privacy acceptance or production release.

The host also records HTB parent bytes before and after its bounded installation
transfers and requires a positive, nonreset delta. Console `egressExercise`
identifies this as `installation-egress-not-throughput`. It observes actual
traffic accounting, including transport acknowledgments; it neither measures a
50Mbps throughput limit nor proves the complete future networking budget bound.
The lead must retain latency/failure allowances and perform separate bounded
throughput commissioning before asserting that bound.
