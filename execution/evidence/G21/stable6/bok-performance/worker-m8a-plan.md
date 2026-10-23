# Proposed same-instance Bok CPU-family change — review only

No infrastructure, source, configuration, ledger or service change has been executed.

## Recommendation and cost

Change only existing Bok instance i-0a7d9957f2b3d7f19 in us-east-1a from r7i.xlarge to m8a.xlarge. Keep nativeProverThreads=4. This changes two physical Intel cores/four SMT threads to four physical AMD cores/four threads, with RAM32→16GiB. Current AWS API price0.26460→0.24344USD/hour. Existing complete31-day forecast1462.937679780822→1444.046031780822USD, including unchanged storage,500GB network, archives,100USD buffer and20% tax allowance. Saving18.891648USD/month; headroom55.953968USD. No overlap or new instance/storage/IP is proposed. Retain old campaign spending/history; before execution append a planned same-instance amendment to authoritative aztec_experiments/execution/infrastructure-ledger.json, then record actual result and revert forecast if rollback.

A20% performance gain is a qualification target, not a measured promise. Prior same-input4-thread proof4.937s was on only two physical cores. Next successful real proof must be verified and compared with current same-workload native5.2505s/whole~6.5s; target native<=4.2004s and whole<=5.2s, with observed variation reported.

## Verified compatibility and route

- EC2DescribeInstanceTypes: both x86_64/Nitro, support UEFI, require ENA and NVMe EBS; current UEFI/ENA already enabled. m8a.xlarge defaults4cores×1thread; r7i.xlarge2×2.
- Both have no instance storage. Only attached block is encrypted root EBSvol-0ca9cecb276f3094b,128GiB, delete-on-termination true. This plan never terminates/detaches/deletes it. /etc/rolling-bok-testnet, /var/lib/rolling-bok-testnet and /var/lib/docker are ext4 on/dev/nvme0n1p1; source/config/native artifacts remain on same EBS filesystem. /run is volatile and intentionally recreated on boot.
- Existing Node and nativeBB are Linuxx86-64 ELF, same binaries retained. Actualpostboot CPUflags/native startup and real proof verification remain required; architecture match alone is not proof qualification.
- ENIeni-09fd71a9b7ea33c9c and private172.31.45.95 remain attached. No EIP exists. Current public3.92.22.208 is ephemeral and will change; do not pin/reuse it.
- Actual artifact distributionE1M12FHGQ0S5ST uses ip-172-31-45-95.ec2.internal and deployed VPCoriginvo_6ujPhXLuxnuG1hnAFME247 referencing SAMEinstanceARN on8809. Thus no CloudFront/origin/security-group change is planned.
- Core/application distributionE3BMCK3MOVYK1K routes to separate core172.31.32.101; all core source/config/processes remain untouched.
- No AutoScalinggroup membership. m8a.xlarge offering verified us-east-1a; this does NOT reserve/guarantee current capacity. Dry-run authorizes API only and cannot prove capacity.

## Actual full-job memory evidence

Current workerPID266588 active since23:21:30UTC. Parent has exact latest proofcomplete23:24:20.051159UTC and fullrequestterminal23:25:28.101540UTC. Readback after those events confirms samePID and cgroup MemoryPeak816209920bytes(~0.760GiB), no OOM/max events. Both nativeBBchildPIDs266618/266619 belong to same /system.slice/rolling-bok-testnet.service cgroup; asyncBBHWM270180KiB, NodeHWM720000KiB. This therefore includes an actual completed model/proof job, unlike an idle-only reading. Historicalservice peaks sampled under1GiB. Separate generated Docker container is not included, but remains limited768MiB,2CPU,256PIDs,45s work. One validation lane remains.

Propose exact new worker-only drop-in /etc/systemd/system/rolling-bok-testnet.service.d/memory-limit.conf with bytes '[Service]\nMemoryMax=12G\n'. Assert path absent before creating, or abort for review; root-owned0644, atomic write. This leaves~4GiB forOS/Docker/proxy and >15× measuredworkerpeak. It replaces effective24G only; preserve request-drain.conf infinite stop and all namespace/credential/egress/generated-code restrictions. Capture exact prior unit/dropin hashes/modes and config hash. Rollback removes only this exact newlycreated drop-in and verifies prior effective24GiB.

## Exact execution sequence for separately reviewed operator

1. Recheck current type/state/ENI/EBS/privateIP, oldsource+config+unitpins and Bokready/active0; capture core PIDs and public application/artifact readback hashes. Assert no other deployment, no generatedvalidation/proof/model in progress. Stage cost amendment first. API permission dry-runs can run before outage; no force stop.
2. Gracefully stop rolling-bok-testnet.service. Existing TimeoutStopUSec=infinity closes intake and drains a racing admitted request; await actual successful inactive state and bound artifactproxy inactive. Never kill/timeout a paid request or infer idle solely from earlier health. If it is still draining, defer instance stop. After drain capture canonical private-state inventory/hash, without copying values to output. Do not restore older ledgers/journals later.
3. Install only reviewed memory-limit.conf and daemon-reload; verify effectiveMemoryMax12884901888bytes, TimeoutStopUSec=infinity. Preserve normal boot enablement and all other units/dropins.
4. EC2 stop-instances (normal graceful, no --force or --skip-os-shutdown), wait stopped. Modify instance-type m8a.xlarge. Explicitly set CPUoptions CoreCount4/ThreadsPerCore1 while stopped using modify-instance-cpu-options; verify via DescribeInstances before start. Do not assume carried old2-core options reset correctly. Start instance, wait running/statuschecks/SSM.
5. Bound infrastructure wait: allow normal EC2control-plane/SSM startup checks up to10minutes after start, observing state and health. This is an operator rollback decision window, not a blockchain wait or forced request drain. On explicit capacity/start error, do not repeatblindly: restore oldtype while stopped and restart once. If controlplane remains pending, inspect actualstate before any rollback; never force-stop a potentially activepaid request.
6. On restoredSSM verify sameinstance/EBS/ENI/privateIP,4physicalcores×1thread,16GiB,CPUfeatures, exactNode/native/source/config hashes, nativeThreads4, MemoryMax12GiB/infinite drain, existing isolation and Dockerlimits, networkprovideraccess, persistentindexgeneration, worker/proxy ready and active0. Existing boot-enabled services start normally; confirm they do not need source/state migration. Compare artifactHTTPS readback and corePIDs/readiness unchanged. No provider/model/testtransaction is sent merely for these checks.
7. Only after ordinary readiness, root serializes next comparable actualworkload; verify real proof and accepted app, no hidden retries, preserve canonical accounting. Measure fullproof and memory/OOM. Keep m8a only if validated stable and meaningfulgain; report exact speed rather than assumingcores double throughput.

## Rollback

On capacity failure with instance stopped: modify back r7i.xlarge, explicitly set2cores/2threads, verify and start. Oldcapacity is also not guaranteed; do not promise a hard outage bound or allocate another instance automatically. If running but qualification fails, wait actualBokidle and use same infinite graceful drain before normalstop/type rollback. After SSMreturns remove only exact new memory-limit.conf (no other config/state rollback), daemon-reload, verify effective24GiB and start/verify services as necessary. All request/payment/index journals remain whatever canonical state they reached; never restore predraintiming snapshots. Record oldtype and original forecast restored. PublicIP may change again; privateorigin remains unchanged.

There is an unavoidable Bok/artifact maintenancegap during same-instance stop/start. Mainboard remains online. Zero Bok/artifact downtime cannot be promised without a separate handoff architecture, which is deliberately not proposed.

## Evidence and primary references

- /tmp/bok-compute-family-assessment.json
- /tmp/bok-compute-fit-prices.json
- /tmp/bok-compute-fit-types.json
- /tmp/bok-type-change-inspect-result.json
- /tmp/bok-type-change-proof-memory-result.json
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/change-instance-type-of-ebs-backed-instance.html
- https://docs.aws.amazon.com/cli/latest/reference/ec2/modify-instance-cpu-options.html
- https://aws.amazon.com/ec2/instance-types/m8a/
