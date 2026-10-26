# Functional verification and cleanup — 26 October 2026

The owner paused the performance goal. It remains paused and incomplete. This pass checks the deployed testnet application and cleans up completed work; it is not production certification or a claim that every flow meets its latency target.

## Funded follow-up — completed

The owner supplied Sepolia funds. The live checks below completed, two newly discovered failures were repaired and published, and all required services are running. Coverage limitations are explicit; this is not a blanket certification of every edge case. The earlier insufficient-funds limitation below is historical.

| Flow | Current observed result |
| --- | --- |
| Posting-credit top-up | 50 FEE bridged and claimed; usable balance74.0828→123.0921FEE; then spent successfully creating a board |
| Create board / directory / rules | Release verification board created and publicly listed with exact additional rules |
| Follow board | Immediate off-chain save; Unfollow state persisted across reload |
| Collateral withdrawal | Native exit followed by successful Ethereum payout of0.001ETH; UI cleared pending refund |
| Bok withdrawal | Native exit and Ethereum payout of1USDC completed; UI cleared pending refund |
| Bok ETH top-up | 1USDC purchased and claimed through the app; available balance restored from5.99808 to6.99808USDC |
| Bok USDC top-up | App approval, portal deposit and native claim completed; additional1USDC available |
| ETH funding after completed withdrawal | Aggregate payment + native claim completed; subsequent named post and ordinary reply spent the balance |
| Named post / human reply | Named Maple Finch post and anonymous reply rendered in the new board |
| Generated app creation and edit | Actual Bok commits published counter app; increase/decrease/reset/reload passed. Reply requested heading change; updated Release Counter rendered and incremented |
| Follow/unfollow / bookmark removal | Following listed board+name and matching posts; name/board unfollow and saved-post removal completed |
| Moderator native local checks | Policy changes, authority transfer/revocation, post removal, avatar removal, board rejection passed in native TXE without proofs. These are not live browser acceptance |
| Avatar | Uploaded/cropped597-byte image rendered on public profile; clearing removed it from profile and post cards |
| Quote / repost | Quote text and empty-comment repost appeared with correct original-post links |
| Fresh ETH signup | Same Ethereum wallet created new Aztec identity0x14b9…ea65c, funded and published first included post; subsequent sign-out/sign-in restored the exact identity |
| Conditional paths | Native cancellation-versus-claim and fresh-claim-while-old-refund-pending passed. Native AVM Bok release/expiry checks passed with seeded public state; private terminal authorization and live expiry remain distinct |
| UI fixes | e4e736e4 pushed and live. Pending refund suppresses conflicting exits; fee-only actions no longer demand collateral; FEE approval labelled correctly.184 focused tests and independent review passed |

Ethereum receipts:
- FEE approval: `0x749167f11417df40ec021ccee7a444c0044ebde96ea5505ea35862e000d189a0`.
- FEE deposit: `0x2993a38a8f173da5beb1488b68a5f9a32e4c7d341bfd843579f177fdd2b2754d`.
- Collateral payout: `0x876039c1b8518159e97e3d53f6f11f13d76556ca6a6a71f13053d4fffd8f9ea2`, status1, block11997939.
- Bok ETH payment: `0xb96dd55a1ab39da2c87b865c1ec9ad54fc58aef59191f12262026e66b2d5721e`.
- Bok USDC approval: `0x8494f643f8b3c166d3fb9881c072cf66cf373e76dc5c963210fd79a2e2a39d59`.
- Bok payout: `0xbacdb05b5d6d94cf50eaa177fd97213070c85986c6162dc4c814d82f56a8b738`.
- ETH re-funding: `0x38f59b5f6e56117c785765a69b14d7ba2c5ce82d445f289d7a713cbfe49ca4eb`.
- Bok USDC deposit: `0x42c2a6108ec80856e1761f89058985afeaa1f23b93d8125e65382eac5455f67f`.

### Failures found and repaired

**First post after funding:** the native assertion was “Too early to post -- time lock not yet expired.” The one-second cooldown is evaluated against the Aztec anchor timestamp, not wall-clock time. Preparation now checks the selected deposit after normal discovery and waits for a sufficiently recent anchor before creating the action intent. After chain progress it refreshes synchronization and metadata, then prepares/submits once. There is no failed-proof retry or arbitrary transaction timeout. The final fresh USDC signup funded and posted successfully on its first attempt on UI `f9d42ce4`. This run did not enter the wait branch because an eligible anchor had arrived; focused tests cover that branch. Temporary native-error diagnostics were removed.

**USDC relay:** a successfully mined payment remained the active predecessor because the browser observed its receipt independently of the relay status route. New quote/admission requests now reconcile that exact prior signed payment under the existing exclusive guard. Only canonical completion clears the fence; uncertain payments remain fenced. Public terms recovered from HTTP503 to200, and a second fresh USDC signup succeeded.

**Test allowance:** two payments exhausted the configured cumulative allowance. The Sepolia-only ceiling was extended from0.0001 to0.01ETH; per-payment reservation remains0.00005ETH. The consumed0.0001ETH reservation, journals, signer and state directory were preserved. This is a finite admission limit, not a claim that the entire ceiling is prefunded. The updater was independently reviewed. Public terms returned200 after restart.

Final fresh post: [first post without retry](https://d30njln0kead8n.cloudfront.net/#/thread/21311202962907536564379675038888614964559247726662878926411162754003388017254).
Generated app: [Release Counter](https://dy2q03rao3se7.cloudfront.net/t/fed7b69848e69200c35ec0bbefe76b358868ca32a2d8090a6191c5d308110fab/latest/).

Affected checks:87 relay/server tests passed; all1395 unique posting-readiness checks passed across the full initial run and the final368-test wallet-session rerun after correcting three fixture responses. The initial run's fixture failures remain documented; they are not presented as an initial all-pass. Independent source/deployment review passed. The first relay deployment attempt rolled back after a publisher readiness race; the corrected publisher checks readiness before process-directory assertions, and the second publication succeeded.

### Verification limits

Actual MetaMask extension approval, restoration in an independently empty browser, live moderator UI actions, and full private Bok expiry/release authorization were not exercised in this pass. Moderator native TXE and seeded public-state Bok terminal checks are separate evidence, not substitutes for those live paths. No claim is made that every flow or every possible failure case is certified. Performance work remains paused.

### Final installed state

UI: `/opt/rolling-ui/releases/f9d42ce4616e74094c165f846d54aed264a71f17`.
Application: `/opt/rolling-app/releases/ui-f9d42ce4616e`, PID311339, including relay fix `f952b3ed`.
Final cleanup removed five owned S3 upload versions, local payload archives, inactive temporary-diagnostic releases and the agent-created app tab. Browser hooks were removed by reload; the fresh post remained visible. One reusable build and current deployment baseline remain. Core has10.8GB and Bok110.3GB free (decimal bytes).

All nine required services are active; app ready and public app/runtime/prover/USDC terms return200. Application proxyPID803, native node/query, prover, moderator and Bok were not restarted by the final budget update. Monitoring remains stopped at the owner's request. No contracts redeployed.

Evidence: `execution/evidence/G21/stable6/other-transaction-latency/functional-20261026/` contains public receipts, bounded stage data, screenshots, native results, public asset hashes and final service snapshots. Raw signing data, keys and private runtime state are excluded.


Browser transactions use an owned Sepolia test-wallet adapter with actual signatures, Ethereum transactions and Aztec proofs. This is not MetaMask extension acceptance. No mainnet funds are used.

## Historical result before funds arrived

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
- Earlier browser release99dcfe60 is superseded by the final installed state above; prover remains636d0a58. No contracts redeployed.

## Paused performance checkpoint

| Flow | Latest recorded time | Interpretation |
| --- | ---: | --- |
| Funded warm opening | 2.166935s | Above2s; not fresh signup |
| Like → included visible count | 10.657020s | 24.60% below comparable14.134775s baseline; below50% target |
| Unlike → included visible zero | 11.604790s | No goal-start baseline |
| 58-byte bio save → inclusion/editor close | 16.215390s | Historical baseline payload is not known to match |
| Create/select name | 24.028000s | Fourth name; original baseline was first name |

Do not resume optimization or describe the50% goal as achieved without further owner instruction and matched live measurements.
