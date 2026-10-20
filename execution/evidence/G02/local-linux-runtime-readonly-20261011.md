# Local prerequisite diagnosis before another paid node launch

Read-only metadata at22:23–22:26UTC,11October2026. JSON SHA256 `e00ce4242fff19dc36f86f506a0115801d499a7983358ebcd8b26604602b7b59`. No runtime start, image pull, container execution/build, AWS operation, credential/config read or source change occurred.

## Actual Mac state

Docker CLI28.1.1 and Docker Desktop4.41.2(build191736) are installed. A process whose executable basename is exactly com.docker.backend exists, and the selected Unix socket exists. Nevertheless, Docker version/info/image-inspect return **Cannot connect to the Docker daemon**. An explicit read using the existing desktop-linux context also cannot connect. No DOCKER_HOST/DOCKER_CONTEXT override is present. Thus neither a working Linux daemon nor image availability is established; failed image-inspect is **not evidence that the image is absent**. Colima/OrbStack/Podman/Lima/nerdctl executables were not found on the current PATH; OrbStack.app is absent at its standard path. Do not infer an emulation capability from the installed application alone.

The root must recover/verify the existing local Docker runtime through its supported controls before attempting an offline container. That operation was not part of this read-only assignment. If the exact image is absent, a pull requires a separately authorized step and must remain pinned; there is no reason to spend on another cloud host before this distinction is measured.

## Pinned image and startup stages

Pin: `azteclabs/aztec@sha256:e5bc218e326b4f3b1cd06b0309cb98e87fef5dfda3330157ce1e393d89416c32`; design's registry inspection found image config digest `6bff2197228924d2dee751d3e2fbf13e02821e942b9ce3bad01b724342e27e43`, default root user, working directory `/usr/src/yarn-project`, entrypoint `node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js`. [Matching official Dockerfile](https://raw.githubusercontent.com/aztec-labs-eng/aztec-node/54e3383c4baa491a83ce129709023d0b6dcf8bc3/release-image/Dockerfile). Existing bootstrap entrypoint matches; a root-user/entrypoint defect is not established.

[Matching startNode source](https://raw.githubusercontent.com/aztec-labs-eng/aztec-node/54e3383c4baa491a83ce129709023d0b6dcf8bc3/yarn-project/aztec/src/cli/cmds/start_node.ts) performs these ordered prerequisites before node RPC starts:

1. Configuration, then verification CRS preload when realProofs true. Actual API is preloadCrsDataForVerifying({realProofs:true}, silentLog), which loads BN2542points and Grumpkin65536points. CRS_PATH defaults to ~/.bb-crs; cache may need writes/locks even for existing public data. Do not mount a live shared CRS directory as writable or mistake an offline download failure for a native-binary failure.
2. computeExpectedGenesisRoot using actual configured testAccounts/sponsoredFPC/prefundAddresses; then registry-presence validation. Native world-state startup can fail here. Default config has both booleans false, empty prefund addresses; do not substitute a different genesis merely to pass.
3. waitForCompatibleRollup, getL1Config, and exact genesis-root comparison against registry/rollup before createAztecNode.
4. Node construction/sync and public/admin RPC startup. Readiness absence alone cannot distinguish steps1–4.

The installed CLI's terminal catch logs and rethrows the original error; LOG_LEVEL=silent does not guarantee the runtime's uncaught exception output is secret-safe. The installed admin startup explicitly states userLog is never filtered by LOG_LEVEL. Raw stderr/stdout must never be forwarded to public console or receipts.

## Exact bounded offline probe command design (not executed)

First, after the proof slot and runtime recovery, use Docker metadata commands again and require the exact locally present image. The following container argv uses --pull=never, no network, no published ports and no host mounts. Root's existing bounded process supervisor must impose a60second deadline and remove the single named container on success/failure; do not create another supervisor.

```sh
docker --context desktop-linux run --pull=never --name rolling-offline-image-probe \
  --platform linux/amd64 --network none --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --log-driver none --env LOG_LEVEL=silent --env OTEL_SDK_DISABLED=true \
  --env CRS_PATH=/tmp/crs --entrypoint node \
  azteclabs/aztec@sha256:e5bc218e326b4f3b1cd06b0309cb98e87fef5dfda3330157ce1e393d89416c32 \
  --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js --version
```

This establishes image execution/architecture/CLI import only. Record exit/signal/OOM and expected version, not generic stdout. Retain the container until fixed State inspection, then remove it under the same supervisor; no restart policy.

A second **reviewed small stdin probe**, with the same resource/network isolation and `--interactive --entrypoint node IMAGE --input-type=module -`, can import the pinned exported preloadCrsDataForVerifying and computeExpectedGenesisRoot functions, emit a fixed phase marker immediately before/after each, use silentLog, and run actual genesis with the matching public config. Use separate calls so a missing offline CRS cache does not hide a native-genesis diagnostic; explicitly label these independent prerequisite probes, not a successful normal startup. For a positive CRS case, prepare a disposable writable copy of hash-verified public CRS data under a fresh probe directory; never mount keys, application state, private configs, Docker socket or the live shared cache. Only that fresh directory may be mounted. A cold offline CRS fetch failure is expected/insufficient evidence, not justification to disable real-proof verification. Module import/export paths must first be verified inside the exact image; installed Mac sources alone do not prove its resolved package layout. No public network/readiness claim follows from the offline probe.

## Minimum safe observability change before another host

Add fixed startup phase/result observations around the actual prerequisite calls or a trusted root-run prerequisite probe; do not patch SDK responses/cache or emit arbitrary errors. Suggested finite phases: image-entrypoint, module-import, verification-crs, native-genesis, registry-identity, rollup-config, node-create, query-readiness, admin-auth. Categories: MODULE_UNAVAILABLE, FILE_MISSING, PERMISSION, NETWORK_UNAVAILABLE, TIMEOUT, NATIVE_EXIT, NATIVE_SIGNAL, CONFIG_INVALID, IDENTITY_MISMATCH, UNKNOWN. Map only known literal error codes and trusted stage identity; read potentially throwing getters once. Do not persist messages, stacks, URLs, environment, command arguments, API key/hash values or model/application data. Preserve actual exitCode/signal/OOM, image/source hashes, control deadlines, last completed phase and canonical network/tips separately. Unknown is a valid diagnostic outcome.

The existing immutable final receipt is the right channel. Add the safe phase record to its reviewed allowlist and tests, preserving all shutdown/upload-once bounds and host-private raw journal separation. Keep qualification's loopback-only egress restriction, public prover masking, deadline controls and no-proof-job policy. Current container State alone proves exit/OOM, not its cause.

## Admin authentication: separate later qualification blocker

[Official admin key store](https://raw.githubusercontent.com/aztec-labs-eng/aztec-node/54e3383c4baa491a83ce129709023d0b6dcf8bc3/yarn-project/aztec/src/cli/admin_api_key_store.ts) uses AZTEC_ADMIN_API_KEY_HASH when configured. Otherwise it creates a random key, stores only its hash under dataDirectory/admin/api_key_hash and returns the raw key for unconditional userLog display. The raw generated key cannot be recovered from its hash. Existing bootstrap supplies no preconfigured hash; existing qualifier publicRpc sets only content-type, so a healthy node's pauseSync/resumeSync admin requests would receive401. This does not explain an earlier node exit1.

Required handoff: trusted root generates a fresh256bit admin capability outside the untrusted qualifier, stores the raw key mode0600 in a dedicated narrow private location, supplies only lowercase64hex SHA256(UTF8(raw-key-string)) through AZTEC_ADMIN_API_KEY_HASH to the node, and gives the qualifier read-only access to that one capability file. Do not disable admin authentication. Extend the qualifier's fixed-loopback admin client to add x-api-key only for adminUrl; never send the key to public node/query/prover clients or write it into public config/result/source/console. Keep redirects rejected. This requires a reviewed config/file-path seam plus narrow sandbox ReadOnlyPaths/InaccessiblePaths adjustment for a dedicated capability file, not access to the entire bootstrap-private directory. A valid configured hash prevents first-start raw-key printing. Test missing/wrong key rejection, correct header pause/resume/recovery, and cleanup without raw secret output before cloud use.

Next real evidence needed: available local daemon + exact image identity; bounded offline entrypoint/native-genesis and verified-cache CRS results; then a separately authorized credential-free public-L1 startup probe with fixed stage output, and an authenticated loopback admin exercise. None is yet qualified by this read-only work.
