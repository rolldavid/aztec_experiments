> **Current resources and authority:** [START_HERE.md](../START_HERE.md). The 20 October ongoing-hosting amendment below supersedes older budgets/deadlines. Old host IDs and local plugin checks are historical. Current Bok runs remotely on its own host.

# Development infrastructure access

The user authorized agents implementing the attached application specification to
use this computer's existing project credentials, remote prover, and plugin server
on 11 October 2026. Use those credentials through existing operator tools. Do not
ask the user to paste secrets into a prompt when this access works.

This note records connection details and verification, not product requirements.
The latest attached specification supplies those requirements. Read the application
repository instructions and current deployment records before service changes.

## Local execution context

Workspace: `/Users/zac/Documents/ChatGPT/Anonymous Message Board`.
Application repository: `aztec_experiments/` inside that workspace.

These locations belong to the `zac` macOS account. Agents with the same local
execution identity and permitted filesystem/network tools can invoke the existing
credential providers. A separate worktree does not copy credential storage. A
remote runner, container, different OS user, or restricted sandbox must verify its
own access. If a worker lacks access, route privileged operations through the
trusted local lead; do not distribute the home credential directories to workers
or to application-generated code.

## AWS access

AWS CLI: `/usr/local/bin/aws`. Profile configuration lives in
`/Users/zac/.aws/config` (mode 0600). The project uses login/SSO sessions; it does
not require a new plaintext shared-credentials file.

| Profile | Recorded purpose and region | Check on 11 October 2026 |
| --- | --- | --- |
| `message-board-deploy` | Project deployment, including prover and CloudFront; pass `us-east-1` for prover operations | STS authentication passed |
| `message-board-sso` | Existing project compute access; default `eu-west-2` | STS authentication passed |
| `message-board` | Older login profile | Session expired; use a working project profile for its intended operations |

The two working profiles resolve to the same AWS account. Their roles differ.
Choose the documented profile for the operation; successful identity verification
does not prove permission for every API action. Pass the profile and region on
each command instead of changing global defaults.

Read-only authentication checks:

```sh
aws sts get-caller-identity --profile message-board-deploy --no-cli-pager
aws sts get-caller-identity --profile message-board-sso --no-cli-pager
```

Use supported credential refresh when available. If AWS requires interactive
sign-in, record that blocker, continue independent work, and ask only for the
required sign-in. Do not replace expiring sessions with new long-lived keys.
Never print tokens, credential exports, cached session contents, or private keys.

## Remote prover

Use `aztec_experiments/deploy/V6-TESTNET.md`,
`aztec_experiments/deploy/prover/README.md`, and
`aztec_experiments/deploy/prover/live-deployment.json` as deployment references.
Verify their historical claims against AWS and the service before use.

- Public endpoint: `https://d30njln0kead8n.cloudfront.net/prover`.
- Read-only health check: append `/healthz` to that endpoint.
- Recorded region: `us-east-1`.
- Recorded instance: `i-0025eb05db3c2491c`.
- Recorded host runtime: `/opt/board-prover/releases/v6-20261010`.
- The operator handover says installation SSH access was removed. Do not assume
  an available SSH connection or reopen network access as a diagnostic shortcut.

At about 10:55 BST on 11 October 2026, the public health check returned HTTP 504.
An authenticated EC2 query for the recorded instance returned no instances; a
project-name filtered query in the same region also returned none. Credentials
work, but these checks do not establish an available prover. Reconcile current
instances, deployment routing, and recovery records before attempting proof work.
Use the existing recovery procedure only within its remaining authorization.

## Infrastructure budget and autonomous provisioning

The user revised the authorization on 11 October 2026:

- The cumulative budget is **USD 300 total**, including spending already incurred
  by the prover campaign. It is shared by the prover and the additional server
  described below. It is not an extra USD 300 or a recurring monthly allowance.
- Agents may extend shutdown times without per-extension approval when the
  forecast remains within the remaining budget.
- Agents may provision and operate **one additional server when needed**, including
  a rolling.chat backend, Aztec node, indexer, or archiver. They may choose its
  suitable instance and storage configuration within this budget. Record the need
  and check current node requirements before provisioning; do not assume the
  application prover is also an application backend or Aztec node.
- This instruction supersedes the prior USD 100 cap, the fixed 13 October 2026
  shutdown deadline, and the one-server restriction. The old deployment estimate
  of USD 83.27 remains historical evidence, not a current bill or a budget reset.
  Production-release gates and other spending permissions remain in force.

Before provisioning, replacement, resizing, or a deadline extension, update a
single resource and spending ledger in the repository's execution records. Include
prior campaign spending, accrued costs not yet reported, planned compute through
the new deadline, storage, snapshots, networking/data transfer, addresses, and
related infrastructure charges. Reserve a cost buffer for billing delays and
shutdown/cleanup. Count replacement overlap against the same budget and avoid
duplicate resources. Existing moderator operating costs retain their prior scope.

Choose and record a bounded operating period for each resource. Install and verify
its independent shutdown control; extend that control only after reconciling the
budget. A document update does not change a running server timer. Do not disable
shutdown protection to extend a run. Track charges that continue after compute
stops, preserve needed state, and include retention costs in the forecast.

Stop new paid work early enough that estimated total cost, including the reserve,
stays at or below USD 300. If the forecast cannot support a required run, checkpoint
it with the exact additional allowance needed and continue independent work. Do
not wait for a delayed billing report to reach the ceiling. This authorization
permits engineering choices within the cap without asking the user each time.

## Plugin server

The existing plugin runs on this Mac, not on the prover instance.

- LaunchAgent: `/Users/zac/Library/LaunchAgents/local.aztec.bok.plist`.
- Service label: `local.aztec.bok`.
- Runtime: `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/runtime`.
- Private directory: `/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private`.
- Service configuration: `service.json` in that private directory.
- The configuration references `operator.json` in that directory. It exists and
  is readable by the current local account. Let the service load it; do not dump it.
- Health: `http://127.0.0.1:8787/health`.

The health check on 11 October 2026 returned `ready`, with zero active jobs and no
reported last failure. The private directory has mode 0700. The Mac must stay
awake and logged in for this LaunchAgent. Preserve the configured provider and
signing facilities, state, and transaction journals. GitHub writes and automatic
provider top-ups are disabled in the current service configuration; access to the
service does not expand those permissions.

## Agent operating rules

The trusted development lead and its delegated operator role may use this access
for implementation, service inspection, integration, and tests within the user's
development mandate. Keep raw credentials out of prompts, chat messages, commits,
test evidence, build output, downloadable artifacts, and untrusted execution
environments. Application/Bok agents processing public thread input receive only
their configured scoped capabilities, not this development account's AWS access.

Serialize shared service changes and expensive prover work. Check for active jobs
before restarts or deployment. Reuse existing service-side secrets and credential
providers. Preserve account permissions, network restrictions, approval gates,
spending limits, and the separation between testnet work and production release.
Record only credential references, service identity, health, and redacted errors
in the execution ledger. Never claim connectivity solely because a key file exists.

This access setup made no cloud-resource, service-configuration, or application
code changes. Recheck credentials and service availability at the start of a run.

## Current budget amendment — 19 October 2026

The owner explicitly approved a cumulative USD500 ceiling. It replaces the earlier USD300 ceiling; it is not USD500 additional. All existing resource, forecast, buffer, isolation, shutdown and release controls continue. Use execution/infrastructure-ledger.json for current reservations. The reviewed same-host extension to10:45UTC reservesUSD315 against a completeUSD312.267094 forecast.

## Ongoing hosting amendment — 20 October 2026

The owner requests that Rolling Chat remain online and explicitly authorizes:
“Authorize $1,500/month; optimize costs while keeping the app online.” This replaces
the cumulative USD500 campaign ceiling for ongoing hosting; preserve the prior
campaign ledger as history. Do not deliberately terminate the app at the old demo
expiry. Replace obsolete native and cloud expiry controls coherently with the
reviewed persistent hosting configuration, retaining security, failure containment,
traffic controls and cost monitoring. Record actual application and Bok health,
boot/restart configuration and removal of every obsolete termination schedule.

Use `aztec_experiments/execution/infrastructure-ledger.json` for the current monthly
forecast, observed spending and resources. AWS Budget “Rolling Chat ongoing hosting”
is USD1500/month; it is a monitoring budget, not a hard spending cap. Forecast
compute, storage, archives, networking and tax with explicit buffers; optimize and
notify the owner before a projected overrun. Do not rely on this laptop or chat
renewing time-limited leases to keep the app running. No mainnet or production
release authority is added. Existing provider credentials and secret handling
requirements remain unchanged.

## Retained Sepolia browser test signer (25 October 2026)

The disposable browser fixture uses Ethereum address `0x8d83fed116a7542934ca2e968055555317f91ca4`. Its retained private credential is referenced by `deployKey` in `/private/tmp/rolling-saved-items-20261025/providers.json`, currently under `~/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-bok-owner-20261025/ethereum-deployer.json`. Read it through the existing local signer; never print or copy its contents into source or evidence. Old `/private/tmp/rolling-g21-fresh-account-*/control.json` references are obsolete. Cleanup must retain the credential even when deleting disposable browser state.
