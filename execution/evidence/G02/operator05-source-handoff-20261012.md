# Operator05 preparation handoff — read-only, no build/upload/launch

Candidate inspected: `2fc6c952c46dcbb65723dcad08a43a30f4930b16`. This is the lead's candidate, not the current worker checkout. Root remains responsible for transferring reviewed changes after its active proof run and giving a separate build/paid-action grant.

## Blocking pin mismatch

At 2fc, `deploy/prover/bootstrap.py` CATALOG_SHA is `e7eb93bf9aeed96ec5acd7c8fad09f385177a87b05f96b9a5aa5321bfe70edf3`. Actual candidate `prover/rolling-artifacts.json` SHA256 is **`be38c8784994f3b90873e2c7f115ae6dec17b6d72802f192fe9c2e4924d21b64`**. Bootstrap checks this exact file against CATALOG_SHA before startup. A fresh package would fail. Require narrow independently reviewed pin update; never revert the current catalog to satisfy the old pin. Also add/retain a direct test binding CATALOG_SHA to repository catalog.

The catalog binds current normal processed RollingBoard `6553d89d4ab0b576ad8d80c0833f0b05cbedff175102beb8f335fdef98807ace` and PrivateBok `524078a8f81f14f811be4fa8687a55ee1fc65ca81926a4d69803191d29bc7935`. The actual installed artifact hashes match; RollingBoard has set_bio/set_avatar/remove_avatar. Its profiles.nr input is `b12124ca50d181f9798c24e3373f9ba358697fdb433cc7d696c3a69ac9d53efd`. No build/proof acceptance was repeated in this inspection.

2fc bootstrap file SHA256 `bc43198d43b36d0cd980475eb7c02d20cbda0b7c6028aedf8925371677b34c60`; package.py `2de694fe076e8cf24d79b495363f5a27c041e0d067d4cb1d00879aceff0933ff`. Pin repair changes bootstrap source/hash: regenerate userdata AFTER repair, from the exact same source copied into the package. PINS.startup hashes that file; PINS.bootstrap hashes generated HOST; archive/manifest hashes are separate external inputs.

## Cached public inputs and packaging entry point

Repository: `/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments`.

- Linux archive: `.build/v6/infra/node-v24.21.0-linux-x64.tar.xz`, 31,890,184 bytes, SHA256 `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`.
- Cached official checksum list: `.build/A02-node/SHASUMS256.txt`, matching exact archive row. Origin: `https://nodejs.org/dist/v24.21.0/SHASUMS256.txt`.
- Read-only archive-member hashing confirms `bin/node` SHA256 `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`, equal to NODE_SHA. No extraction/execution.
- Pinned Mac validation executable: `.build/A02-node/node-v24.21.0-darwin-arm64/bin/node`.
- BB pin `ba8bbb2b82c573153511e638c97100791f0186ef40ee5dd41e911bb5286b29d9`; package.py verifies installed official amd64-linux/bb against toolchain before copying.

After source repair/integration and build grant, reuse existing command (choose a fresh nonexistent output; placeholders below are not executable paths):

```sh
python3 deploy/prover/package.py NEW_OUTPUT --node-archive .build/v6/infra/node-v24.21.0-linux-x64.tar.xz --application-profile rolling --validation-node .build/A02-node/node-v24.21.0-darwin-arm64/bin/node
```

`--application-profile rolling` is required even though automatic HTTP qualification uses the historical legacy board: bootstrap runs loadRollingArtifacts and requires the complete current catalog/source/artifact closure. The package retains legacy resources too. This is a **mixed prover/query runtime, not a qualified standalone native fullnode package**. Fullnode remains exact Docker image `azteclabs/aztec@sha256:e5bc218e326b4f3b1cd06b0309cb98e87fef5dfda3330157ce1e393d89416c32` on native AMD64 hardware. Do not replace its node with package/aztec: Linux WSDB/LMDB optional dependency closure is not qualified.

After package creation, verify the complete manifest file set/hashes and catalog loader. Create a new tar.gz with release contents at archive root, no enclosing directory. Record archive SHA256, manifest SHA256, exact source revision and source-input hashes before one immutable upload. Do not reuse `/private/tmp/rolling-prover-release-5235f49-20261011.tar.gz` or its historical key as current runtime. Existing `prover/qualify-runtime.mjs` performs actual Linux qualification; it is not run by this handoff.

## Existing operator inputs and facilities

Prior private operator records are at `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-node-20261011-04/`. Preserve them. Filenames were inspected, not raw secret-bearing configuration/userdata:

- `launch-intent.json`, `fleet-intent.json`, `fleet-request.json`, `launch-result.json`, `fleet-receipt.json` preserve request history.
- `launch-template-data.json` is a private historical template, not safe to print or blindly reuse.
- `bootstrap-v2.json`, `user-data-v2.gz`, `fleet-policy-v2.json`, `payload-verification-v2.json`, `handoff.json` are historical04 inputs/evidence, never05 inputs.
- `/private/tmp/rolling-node-04-readonly.py` is the existing bounded console/receipt projector. It is hardcoded to04 IDs/manifest. Adapt exact identifiers only after new receipts; do not run it expecting05 observations.

No persistent general launch/preparation script was found in these locations. Prior preparation used AWS CLI/installed SDK primitives and durable private records. Reuse those narrow operations; no supervisor/framework is needed.

Credential provider is existing `message-board-deploy`; EC2 us-east-1; archive bucket eu-west-2. Installed Node packages provide `@aws-sdk/credential-provider-node` defaultProvider (3.972.83) with fromIni/login support, `@smithy/signature-v4` (5.7.3), `@smithy/core/protocols` HttpRequest and `@smithy/core/checksum` Sha256Node. `@aws-sdk/s3-request-presigner` and system boto3 are absent; do not introduce them merely to sign capabilities. Use supported defaultProvider in trusted memory and SignatureV4.presign(service=s3, region=eu-west-2, uriEscapePath=false) with fixed bucket/key, HTTPS, unsigned payload and host-only signed header. For receipt PUT, bootstrap receipt_url rejects extra query fields: do NOT add X-Amz-Content-Sha256 to the URL. With low-level SignatureV4, set original x-amz-content-sha256=UNSIGNED-PAYLOAD and mark that header both unhoistable and unsignable; construct the URL from protocol/host/path/query only. Verify final SignedHeaders=host and only the exact receipt_url allowlisted query keys before use. This source-backed parameter recipe still requires the separately authorized nonsecret one-send probe; it was not signed or sent here. GET binds exact new object/version; PUT binds only `receipts/rolling-node-20261012-05/final.json`. Never print the returned request/query/URL or credentials. Existing AWS CLI can perform authenticated archive PutObject/HEAD and EC2 requests; use AWS_MAX_ATTEMPTS=1 at financial mutation boundary.

## Required once-only operator sequence (not executed)

1. After approved ledger reservation, create a NEW0700 external private05 directory. All config/capability/request/intent files600. Never modify04 journals.
2. Fresh archive key under `releases/rolling-<reviewed-revision>-20261012/`. Before one `aws s3api put-object`, fsync exclusive upload intent with exact body hash/key. Use `--if-none-match '*' --checksum-sha256 BASE64_DIGEST --server-side-encryption AES256 --expected-bucket-owner 052665140763`, eu-west-2/profile. Capture result privately, retain safe version/checksum receipt. If response missing, HEAD/reconcile; no automatic second upload. HEAD exact version verifies full-object checksum/bytes.
3. Generate private GET/PUT capabilities through existing provider in memory. Bound expiry by current credential expiration and two-hour budget horizon; never copy raw credentials to host. Perform exact-URL GETRange preflight206, region/version/hash consistency. A separate receipt probe key, if separately authorized, gets its own once-intent and fixed nonsecret payload; never use final receipt key for probe.
4. Fill fresh bootstrap createdAt, commissioningStop=+30min, budgetStop=+2h, new archive/manifest hashes; generation must occur within5min of createdAt. Reuse `python3 deploy/prover/bootstrap.py --config PRIVATE05/bootstrap.json --output PRIVATE05/user-data.gz`. Inspect decoded gzip/LZMA roundtrip privately, exact source/hash consistency, shell/Python syntax and <=16,384byte AWS cap. Do not log decoded input. New longer credentials/URLs must pass the real size check.
5. Use existing `aws ec2 create-launch-template --launch-template-data file://PRIVATE05/launch-template-data.json --client-token FRESH_PERSISTED_TOKEN` after exclusive fsynced creation intent. Preserve existing reviewed AMI/SG/subnet/metadata/terminate behavior/noSSH/noinstanceprofile/40+1024encryptedgp3 DeleteOnTermination. Userdata is base64 exactly once in the private JSON. Capture receipt; missing response requires token/name reconciliation, not guessed repetition.
6. Fsync separate immutable fleet intent BEFORE one `aws ec2 create-fleet --cli-input-json file://PRIVATE05/fleet-request.json`, us-east-1/profile, retries disabled. Existing request shape: Type=request, TotalTargetCapacity1, OnDemandTargetCapacity1, SpotTargetCapacity0, DefaultTargetCapacityType=on-demand, absolute ValidUntil=budgetStop, TerminateInstancesWithExpiration=true, fresh persisted ClientToken, returned launch-template ID/version. Never use instant fleet.
7. Read back actual fleet expiration/terminate flag, instance shutdown terminate, encrypted volumes/DeleteOnTermination, no IAM profile/key/ingress expansion. Validate fixed safe host console control marker with exact runtime/manifest/source hashes, persistent hostbudget/commissioning timers and shaping. No publicprover/routing/proofjobs. Follow existing canonical query qualification and final receipt, without inferential success from installed.

Missing controls before authority can become concrete: reviewed CATALOG_SHA repair; freshly built/verified archive and manifest; actual private userdata size/roundtrip; fresh capability preflight/expiration;35USD ledger reservation; exclusive durable operation intents; actual launch readbacks. Source inspection alone does not satisfy those gates. No paid operation, package build, credential read, capability generation or source mutation occurred here.
