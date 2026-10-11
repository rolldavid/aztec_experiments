# Bounded node and prover package bootstrap

This generator prepares one private EC2 user-data payload. It makes no cloud
calls and starts nothing on the development computer. It installs the reviewed
Linux runtime and a testnet fullnode; **the prover and its proxy remain masked**.
It neither supplies Rolling contract addresses nor qualifies a running service.
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
   verifies the actual root qdisc and configured rate/ceiling using JSON tc output.
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
   the commissioning timer; the absolute budget timer remains active.

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

Console stage `installed` means installation only, never synchronization,
accounting acceptance, or Linux qualification. `linuxQueryQualified` remains
false. The lead reads sanitized console output using the supported EC2 API,
verifies Fleet expiry and volume deletion controls, and checks actual canonical
identity/sync through the reviewed runtime qualification procedure. The bootstrap
does not unmask the prover or install an application config. The later reviewed
qualification helper must be included in a freshly hash-bound runtime archive.

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
