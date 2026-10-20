# Rolling Chat: start here

This is the current handover for a fresh checkout. Read this before historical execution notes. No previous chat, personal agent memory or local worktree is required to understand the project. Credentials and private account/journal data require the authorized operator's access; they are intentionally not in Git.

## Branch and current scope

- Work from **`codex/rolling-chat-draft3`** in `zac-williamson/aztec_experiments`. The default branch is not the delivery reference.
- Accepted application: `f4eb6515e4f55330e07e10ec348b3bd3532199cb`.
- Reviewed persistent-hosting control update: `0205d08b52d23b0167cc91b11463ee80b0fc403d`. This handover adds documentation and archived evidence without replacing accepted application code.
- [PR 8](https://github.com/zac-williamson/aztec_experiments/pull/8). [Functional status](execution/feature-status.md), [requirement disposition](execution/release/final-requirement-disposition.json), [engineering acceptance](execution/release/engineering-handover-20261020.md).
- This is the owner's testnet proof of concept. Specialist security/privacy audit X1 and production-network clearance X2 remain external release gates. No mainnet release is authorized.
- The owner stopped **all scheduled project agent work** on 20 October 2026. The recurring Codex monitor was deleted. Do not recreate it or restart old campaigns without a new request. Keep the live services running.

## Current application and actual observations

[Open Rolling Chat](https://d30njln0kead8n.cloudfront.net/#/home).
[Original conversation with authenticated Bok reply](https://d30njln0kead8n.cloudfront.net/#/thread/15660648287099192392566570599913171983157817601529053133981747474837257128506).
[Generated page](https://dy2q03rao3se7.cloudfront.net/t/54f74bcaa3f0f1a59b0358a11dd85dcb885bf5aaec7f26e23b6c81c56db3ca1d/r/4055ef22dbf2e9971676d2c22706885d6884d3e4/files/index.html).

On 20 October, the restored app, query and prover were healthy; the real browser displayed the preserved human conversation, authenticated Bok reply and generated page. Bok's separate service was ready with no active job or reported failure, and its three original terminal journals were unchanged. No payment, proof or model call was replayed to demonstrate restoration.

**Remaining concrete verification:** the current moderator process started successfully and is boot-enabled, but its ingestion readiness was not observed before work was stopped. Last observation: 07:56:39 UTC, PID 13994, running, startup log only. Do not equate process startup with working moderation. On explicit resume, inspect that existing service's health/ingestion and queue first; do not create another model-call campaign. Historical successful moderation evidence remains historical.

## Running services

All compute below is AWS `us-east-1`, account `052665140763`. Use existing `message-board-deploy` credentials; see [access instructions](deploy/INFRASTRUCTURE_ACCESS.md). AWS SSM is the management path. Do not open SSH or copy developer credentials into application/generated-code processes.

| Component | Current resource | Purpose |
| --- | --- | --- |
| Core | `i-0a9b5b9ba55815cda`, `172.31.32.101`, m7a.4xlarge | Aztec node, authenticated query, real prover, public app/index, moderator |
| Bok | `i-0a7d9957f2b3d7f19`, `172.31.45.95`, r7i.xlarge | Independent funded plugin, model/tool execution, authenticated reply submission, artifact proxy |
| Management | `vpce-073682b5fca1c98be`, `vpce-0ce0780db34669ea7` | SSM and SSM Messages |
| Main distribution | `E3BMCK3MOVYK1K` | App, query and prover public routes |
| Artifact distribution | `E1M12FHGQ0S5ST` | Bok page/source routes |

Main VPC origins: app port 4319 `vo_B9DnVYF8QMyD8Oicgnf6yB`; query port 8083 `vo_KPPWjKZImfsF23fYbu5ymr`; prover port 8080 `vo_HFsw1JnwT9pFieCQYQRDig`. Bok artifact port 8809: `vo_6ujPhXLuxnuG1hnAFME247`. Preserve current authentication, private-origin security groups and isolation headers.

Bok signs using its own preserved public Aztec identity `0x17d5f49a10c969293812ab72418fa947414e704ea13f540486b46dae4fad139e`. Its public identity is owner-approved; its private keys are not public. Bok uses authenticated `/v1/node` and its own native prover, not the core HTTP prover. Generated code receives neither these keys nor the operator AWS account.

Core native runtime manifest: `71d5e83614a05c429ebf419c7d8f98a1b19dc10ef7aba8cace7d2e1141bf55f9`, release `/opt/board-prover/releases/rolling-71d5e83614a05c42`. Bok native manifest: `05d526891911bd90eaa84711d99f08d894ff1976beee80a544863636d65e8e5e`. Browser/app runtime is the complete `34cc7252` source closure; moderator adds the exact two `f3e23bf4` runtime files, already present in accepted source. Bok includes eight exact `84a5c525` runtime files. Persistent control module is pinned separately at `/usr/local/lib/rolling-control/deploy/prover/bootstrap.py`, SHA256 `475ec726af446708826098d06be0770d41a007d480ff173ae3e716bdbfe97a38`.

## Persistent hosting and cost

Owner authorization: **“Authorize $1,500/month; optimize costs while keeping the app online.”** This supersedes old cumulative campaign limits for ongoing hosting. Old cutoff dates in historical packets are not live instructions.

Both hosts' native expiry timers are masked. All three obsolete cloud shutdown/endpoint-cleanup schedules were removed. Core request fleet `fleet-f51f0f40-7b4c-42c2-afde-b94b2e5dedd8` was deleted with **no instance termination** (`deleted_running`). Both hosts remain running with guest shutdown behavior `stop` and API termination protection. Security, traffic shaping and emergency containment remain. Service boot configuration is verified; a reboot trial was not performed.

Estimated fixed running cost is approximately **$32.96/day before tax and traffic**. The 31-day forecast is **$1,462.94**, including a 20% tax allowance, 500 GB network allowance, $20 archive/static allowance and $100 uncertainty buffer. This is an estimate/reservation, not billed spend. AWS budget `Rolling Chat ongoing hosting` is $1,500 monthly and is a monitor, not a hard cap. Its accountwide-except-Lightsail scope conservatively includes unrelated London compute; project allocation must be reconciled separately. The owner deleted the agent monitor, so there is no recurring agent health/cost supervision. Existing AWS budget configuration remains unchanged; do not promise automatic agent alerts.

[Current resource ledger](execution/infrastructure-ledger.json) · [forecast](execution/evidence/G12/service-restoration-20261020/persistent/monthly-forecast.json) · [cloud cutover](execution/evidence/G12/persistent-hosting-20261020/cloud-persistent-readback.json) · [independent review](execution/evidence/G12/persistent-hosting-20261020/independent-cutover-review.json).

## Safe operational continuation

1. Read `AGENTS.md`, the repository-local [Aztec skill](skills/aztec-app-development/SKILL.md), and this file. Reconcile the actual branch and uncommitted changes. The recorded lead lease is historical runtime identity; age alone never authorizes taking over a live writer.
2. Inspect existing resources/units before changing anything. Public read-only checks are app `/` and `/prover/healthz`; use authenticated query credentials through their existing service configuration. SSM identity and resource inspection require the trusted operator. Do not print private configurations or raw environment variables.
3. On a real failure, inspect the existing unit status and narrow logs. Reconcile saved transaction/provider identities before any resubmission. No payment/model replay because a response is missing.
4. Bok's bounded native restart policy preserves `hosted.lock`. A hard crash may leave that lock and deliberately fail closed. Confirm no live writer and reconcile original journals before removing only a demonstrated abandoned lock. See [Bok operations](deploy/restoration-20261020/bok/OPERATIONS.md).
5. Bok's service-only hosts map and IP allowlist pin the same five declared provider peers. If actual connectivity fails because a provider retires an address, refresh both together, preserving TLS names, metadata denial and generated-code network isolation. Do not widen to unrestricted egress.
6. Preserve original accounts, state and encrypted archives. Chain/index caches can resynchronize; financial/model journals and keys cannot be recreated by replay. The core historical checkpoint anchor was refreshed to verified checkpoint 9500 during restoration; future startup must reconcile actual canonical state, not hardcode a historic unavailable block.
7. No broad acceptance/backup campaign is needed for a status check. For development use native devnet `realProofs: false` and PXE `proverEnabled: false`, native mining/settlement and SDK state waiters. Test only the changed boundary; independent review remains before integration. Real proofs belong to targeted testnet acceptance.

## Configuration amendments carried into restoration

App native executable paths changed from the old 81f release to 71d, and two contract-artifact paths from 791 to the complete 34cc closure. Source parent directories are root-owned with rolling-runtime group and mode 0750. Original relay credentials and mutable journals were retained.

Moderator retains the original actor, queue/state and query capability. Its exact 53-file 34cc source closure has the f3 overlay; native path is 71d, transaction cap is **20 FEE**, and original model/image pins and CRS paths remain. Historical templates containing 81f or 2 FEE must not be installed unchanged. Restoration scripts preserve supplementary groups and scoped credential copies. The fixed persistent control module is separate from admitted runtime provenance; do not rebuild or replace the runtime just to amend a control policy.

## Reproduction, archives and exclusions

[BUILDING.md](BUILDING.md), [TESTING.md](TESTING.md), [deployment skill](skills/rolling-chat-deploy/SKILL.md) and [deployment docs](deploy/V6-TESTNET.md) describe the version-pinned build/development paths. The original source specification and owner amendments are indexed in [execution/README.md](execution/README.md), [Draft 3 requirements](execution/draft3-requirements.md) and [clarifications](execution/specification-clarifications.md). Latest explicit owner scope wins over historical notes.

[Restoration scripts and manifest](deploy/restoration-20261020/README.md) preserve non-secret operational changes and exact provenance. These are historical, environment-bound procedures, not a launch command: never replay their old dates, instance identifiers or financial actions. The current resources above supersede earlier deployment records.

Encrypted backup bucket: `anonymous-message-board-testnet-backups-nvdhcyurtoga`, region `eu-west-2`. Static artifacts remain in private bucket `rolling-bok-public-052665140763-20261019`. Private restore custody on the operator Mac: `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-final-20261018-c71ecfaa7e/checkpoint-20261019/deadline-0300-20261020-two-hosts/`. The published final-preservation evidence records encrypted object versions/hashes and inventory; obtain decryption/credential access through the trusted operator, never by pasting keys into chat. Fresh machines need their own authorized provider access.

Git intentionally excludes credentials, signed URLs, private bootstrap payloads, account recovery files, plaintext service configuration, raw financial/provider journals, decrypted archives, raw private agent transcripts, dependency installations and rebuildable caches. Public summaries, hashes, source and access references are published instead. Historical engineering branches are indexed in `execution/history/published-branches-20261020.json`; the archive branch preserves their commit ancestry but is **not deployable current source**. Do not merge its old source tree over the accepted application.
