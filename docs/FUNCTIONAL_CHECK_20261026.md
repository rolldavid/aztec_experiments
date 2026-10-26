# Functional verification and cleanup — 26 October 2026

The owner paused the performance goal. It remains paused and incomplete. This pass checks the deployed testnet application and cleans up completed work; it is not production certification or a claim that every flow meets its latency target.

## Result

The site is online. Real posting and a real paid `@bok` request completed. This check found and repaired a Bok failure that service uptime alone did not reveal.

| Area | Observed result |
| --- | --- |
| Public site, runtime configuration, prover health | HTTP 200; real prover ready, 11/11 jobs completed, zero failed; query ready |
| Required services | Application, app proxy, node, query, moderator, prover, prover proxy, Bok and artifact proxy running |
| Ordinary post | Submitted through live composer, included in Aztec, rendered in feed; composer closed |
| Bok request → reply | Submitted through live composer; real model reply rendered; native transaction succeeded and checkpointed at block 6763 |
| Bok accounting | Initial 7 USDC; 0.25 reserved; final available 6.99808 USDC. Unused reservation returned automatically |
| Like / Unlike | Both real native-included state changes verified on current UI99dc |
| Name / profile | New name selected and 58-byte biography rendered publicly in current-session c993 checks; those paths unchanged by99dc |
| Bookmarks | Save → Bookmarks page listed the exact post; saved state survived normal reload; no chain transaction |
| Normal page reload | Confirmed conversation and bookmark render after removing temporary profiling hooks; remembered account reopens to Ready for a conversation, and balance reloads to6.99808USDC |
| Fresh signup and Ethereum funding | Not rerun in this cleanup pass. Owned test wallet has 0.000313693859922125 Sepolia ETH, below 0.001 ETH collateral plus fees. Funded reopening is not fresh signup evidence |
| Follows, withdrawal, generated-app creation, moderation action | Not rerun in this pass; do not infer full end-to-end qualification from service health |

Public HTTP checks also showed variable latency from this laptop: one sequence took approximately23/38/14seconds for site/runtime/prover, and a subsequent runtime request5.12seconds (DNS0.52, connect2.56, TLS3.33, first byte5.12). These are observations, not a diagnosed server or network cause. Performance targets remain open.

## Repaired failure

Bok called the native PXE proof method directly. The embedded wallet disables automatic synchronization because its normal `sendTx` method owns that step. Our direct path bypassed `sendTx` and omitted the synchronization. A restarted operator consequently attempted its first proof with no synchronized anchor and repeatedly failed before submission.

A no-send reproduction against the installed native SDK failed with `Trying to get block header with a not-yet-synchronized PXE`; the same native queue check with explicit synchronization passed. The fix restores one `wallet.pxe.sync()` before fee preparation/proof in the serialized operator mutation path. Receipt-only reconciliation does not resynchronize or reprove. No extra transaction or model call was introduced.

- Commit: `be6f9f724e69faef3f64802ccbe4782fb7dce082`, pushed to `master`, `codex/rolling-chat-account-ux`, and `codex/rolling-chat-draft3`.
- 81 focused tests passed, including cold first operation, sync failure before proof/send, successive mutations, and no extra sync during receipt reconciliation.
- Independent source and deployment-script review passed.
- Only Bok was naturally drained/restarted. Running source: `/opt/rolling-bok/releases/operator-be6f9f724e69faef3f64802ccbe4782fb7dce082`, PID118936. Credentials/configuration and other services were unchanged.
- Final Bok health: ready, active0, lastFailure null.

The ordinary post is [visible here](https://d30njln0kead8n.cloudfront.net/#/thread/2542270031634159188815892126479396696553523949648524340220227112295110503916).
The [Bok conversation](https://d30njln0kead8n.cloudfront.net/#/thread/3678383847321825079022706629928459954143186285856269002467095413239603142834) contains the reply “I am online and ready for release verification.”

Bok reply transaction: `0x02981f0151ccd10087739e53d93177fbc5780a5ed019d83e655b4715a076ac41`.
Native observation: checkpointed, successful, canonical, block6763 / `0x26798c14ce38a75cee5dc5d118fdad9828f8d63d4188b371a27f4df428e7c994`.

## Cleanup and retained work

- Performance goal paused; all performance agents finished. No optimization drafts were applied during cleanup.
- Removed two inactive scratch worktrees (~987MB) and redundant generated output/payload copies (~595MB). Small uncommitted source drafts retained in a private283KB archive; no credentials removed.
- Removed completed source-draft directories and temporary deployment uploads/launchers. Kept one current reusable build and the small unpublished drafts for a future explicit resume.
- Browser profiling hooks removed by normal reload; no new Chrome instance or unattended benchmark left running.
- Core disk: 12GB free; Bok disk: 103GB free. Required services remain running. No new recurring automation was created.
- Current browser release remains99dcfe60; prover remains636d0a58. No contracts redeployed.

## Paused performance checkpoint

| Flow | Latest recorded time | Interpretation |
| --- | ---: | --- |
| Funded warm opening | 2.166935s | Above2s; not fresh signup |
| Like → included visible count | 10.657020s | 24.60% below comparable14.134775s baseline; below50% target |
| Unlike → included visible zero | 11.604790s | No goal-start baseline |
| 58-byte bio save → inclusion/editor close | 16.215390s | Historical baseline payload is not known to match |
| Create/select name | 24.028000s | Fourth name; original baseline was first name |

Do not resume optimization or describe the50% goal as achieved without further owner instruction and matched live measurements.
