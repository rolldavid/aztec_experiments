# Operator06 proposal — no build, upload or launch executed

One **60-minute diagnostic**, with a proposed **$25 complete reservation**, is the smallest practical next run without changing the reviewed lifecycle. At current ledger145.28 this would reserve170.28 total, leaving129.72. This remains a proposal; only the lead changes the ledger and grants each preparation/launch scope.

Current read-only evidence shows no live compute, disks, snapshots, EIPs or active fleets. AWS still lists05b as terminated; do not mistake that historical row for overlap or delete it again. Its receipt remains failed. Current instance price is0.92736/h and gp3 is0.08/GB-month. The detailed forecast includes1.5h compute,45GB network bound,24h orphan-storage contingency, retained archive/receipt costs, tax and7.72 additional buffer.

Retain the known m7a.4xlarge/64GiB,40+1024GiB encryptedgp3, exact AMD64 image, AMI and existing restricted security group. This is startup diagnosis, not sustained load acceptance: [current Aztec hardware guidance](https://docs.aztec.network/operate/testnet/operators/concepts/hardware) targets50000+random IOPS, above this baseline storage. No claim that baseline I/O caused the prior exit. Do not change CPU/storage while trying to discriminate that exit.

Existing bootstrap formulas make a60-minute budget yield readiness cutoff44minutes, qualification cutoff59minutes and independent host/Fleet termination at60minutes. Commissioning remains30minutes. A slow sync can fail this window honestly; no automatic extension or weakened inspector. Early failure cleanup is possible only after an authenticated terminal observation is actually available; without remote shell/public admin, the dedicated stage record normally arrives in the final receipt at the cutoff. Its absence is not replay authority.

c062 now has independent source approval: root `execution/evidence/G02/startup-stages-c062-review.json`, SHA256 `5eec3b1d158b464df208895d7e0fddfa797b0aa7032d9b8f35a90b06877e616b`. The root recovery campaign still holds the heavy slot. Packaging and all paid operations remain unexecuted.

## Exact existing entry points, after separate grants

Run from `/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments` only after the lead integrates the reviewed source and freezes its exact revision. The fresh output below must not already exist. Record the resulting actual integration SHA, not c062 as if it were already integrated.

```sh
python3 deploy/prover/package.py /private/tmp/rolling-prover-release-startup06-20261012 --node-archive .build/v6/infra/node-v24.21.0-linux-x64.tar.xz --application-profile rolling --validation-node '/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments/.build/A02-node/node-v24.21.0-darwin-arm64/bin/node'
```

Reuse the existing operator verification/archive procedure at `rolling-controls/.build/verify-package-0502.py` in a fresh bounded helper with only the reviewed source/output/evidence literals replaced. **Do not execute its old hardcoded version.** It checks complete manifest fileset and every hash, internal symlinks, Node/BB/catalog pins, catalog load, deterministic tar metadata and every archive member. Extend its existing exact bootstrap check to the new `startup-stages.mjs` source/Python helper pin. This is verification of a new package, not a new packager.

Cached Linux Node archive SHA256 is `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`; full revalidation remains mandatory. New archive/manifest hashes are not yet known. The old0502 archive is historical and cannot supply the new stage helper.

Create a fresh external0700 directory `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-node-20261012-06` only after preparation authority. All generated files0600. Preserve every05b intent/receipt. Reuse the existing05b upload/capability/payload procedures with fresh06 paths and immutable source-specific S3 key; never run their old literals. The key must include the new verified integration revision. No second old probe is needed: the scoped receipt PUT format already has a successful once-only test.

Before each mutation, save and fsync a new exclusive intent with exact content hash, key/name and persisted token. The following commands describe the established boundaries; their argument variables must come from verified private preparation files, not caller-provided application content. Capture results privately and project only safe receipts.

```sh
AWS_MAX_ATTEMPTS=1 /usr/local/bin/aws s3api put-object --profile message-board-deploy --region eu-west-2 --no-cli-pager --bucket anonymous-message-board-testnet-backups-nvdhcyurtoga --key "$ROLLING06_ARCHIVE_KEY" --body "$ROLLING06_ARCHIVE" --checksum-sha256 "$ROLLING06_ARCHIVE_SHA_BASE64" --server-side-encryption AES256 --content-type application/gzip --if-none-match '*' --expected-bucket-owner 052665140763
python3 deploy/prover/bootstrap.py --config "$ROLLING06_PRIVATE/bootstrap.json" --output "$ROLLING06_PRIVATE/user-data.gz"
AWS_MAX_ATTEMPTS=1 /usr/local/bin/aws ec2 create-launch-template --profile message-board-deploy --region us-east-1 --no-cli-pager --launch-template-name "$ROLLING06_TEMPLATE_NAME" --client-token "$ROLLING06_TEMPLATE_TOKEN" --launch-template-data "file://$ROLLING06_PRIVATE/launch-template-data.json"
AWS_MAX_ATTEMPTS=1 /usr/local/bin/aws ec2 create-fleet --profile message-board-deploy --region us-east-1 --no-cli-pager --cli-input-json "file://$ROLLING06_PRIVATE/fleet-request.json"
```

The upload is a paid external action too; it requires the reserved budget and separate authorization. Do not execute any command above during this read-only task. Any uncertain response is reconciled using exact S3 version/checksum or EC2 name/token/resource identity; no blind second upload/create/replacement.

Fresh private bootstrap fields: createdAt now, commissioningStop+30min, budgetStop+60min, exact fresh archive/manifest SHA256, version-bound eu-west-2 GET and narrow `receipts/rolling-node-20261012-06/final.json` PUT capabilities. Use existing `message-board-deploy` defaultProvider and SignatureV4 recipe in the prior handoff; no exported developer credentials. Credential/capability expiry must cover the entire operating/cleanup horizon. Exact-URL GET Range must return206. Gzip/LZMA decode must match the current source, syntax checks pass, compressed payload must actually be <=16384bytes. c062 preserves HOST bytes, but that does not guarantee every longer signed URL fits.

Fleet input remains Type=request, on-demand1/Spot0, fixed ClientToken, ValidUntil exactly budgetStop, TerminateInstancesWithExpiration=true, exact reviewed template version. Reject launch when less than20minutes remain in the commissioning window. Refresh preparation before any launch intent if needed; never alter or replay an already-launched operation.

Readback commands use the new receipt IDs:

```sh
/usr/local/bin/aws ec2 describe-fleets --profile message-board-deploy --region us-east-1 --fleet-ids "$ROLLING06_FLEET_ID" --no-cli-pager
/usr/local/bin/aws ec2 describe-instances --profile message-board-deploy --region us-east-1 --instance-ids "$ROLLING06_INSTANCE_ID" --no-cli-pager
/usr/local/bin/aws ec2 describe-volumes --profile message-board-deploy --region us-east-1 --volume-ids "$ROLLING06_ROOT_VOLUME" "$ROLLING06_DATA_VOLUME" --no-cli-pager
```

Use existing safe projectors rather than print full responses. Verify actual Fleet expiry/terminate, instance-initiated termination, encrypted DeleteOnTermination volumes, no IAM profile/SSH key/new ingress, persistent host timers,50Mbps shaping and exact helper/manifest/source bindings. Remain masked, no public route/proof job. On failure retain the fixed stage receipt, then perform only separately authorized owned cleanup once; confirm both disks absent and fleet deleted. A new failure requires new evidence before another paid attempt.
