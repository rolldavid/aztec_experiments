# Transaction performance beyond ordinary posting

## Active goal and latest evidence

Owner goal: reduce end-to-end time by at least **50% for every other live application transaction flow**. The goal remains open. Opening has its separate2-second target and ordinary posting its15-second target. Publication, passing checks, faster preparation or earlier pending feedback do not complete these goals.

Bookmarks and follows moved off-chain in `bbf76d92`; conversation read state is also off-chain. Their retired Aztec preference/read-marker implementations are not current transaction work. Preserve the historical measurements below as evidence of those releases, without restoring deleted contract paths or comparing local UI feedback with blockchain settlement.

| Flow | Goal-start observation | Latest actual observation | Comparison and remaining evidence |
|---|---:|---:|---|
| Like: visible included count |14.135s|12.547165s (`a75bd5b7`)|11.2% lower. The later `87` action returned in13.260s versus56.933s initially (76.7% lower), but its visible-count observer was invalid; these endpoints cannot be mixed. |
| Unlike: visible count and inclusion |None|About19.608s (`87`)|Count reached zero at19.191s; native receipt arrived417ms later. No goal-start denominator. |
| Register name: included and selected |106.844s|16.385465s (`3b032339`)|84.7% observed reduction at the same useful endpoint. Single observations under different network/account conditions; latest source not remeasured. |
| Set bio: included and editor closed |About75.020s|25.481420s (`af0`)|About66.0% lower; baseline click was approximate. Public profile was verified afterward, not continuously timed. |
| Clear bio; set/clear avatar |None|None complete|Baseline and after-run missing. |
| Create subboard: included directory entry |None|14.478s (`e752`)|No goal-start denominator. Other administrator flows lack complete paired timings. |
| ETH signup: payment confirmation to ready to post |None|58.075380s (`fb61925c`)|Full payment flow measured, but no goal-start baseline. Later quote/claim changes need a new full-flow observation. |
| USDC signup |None|None complete|Signatures, relay, bridge claim and usable account must all be included. |
| Posting-credit top-up |None|134.757725s (`f16`)|Includes36.180520s test-adapter repair dwell. Functional evidence only; clean approval-present/absent observations missing. |
| ETH-to-Bok: Pay to usable credit |165.094s|37.178030s (`f20`, repeat)|77.5% lower historical wall time. Baseline wallet/tool dwell was unmeasured, so application-only reduction is unknown. |
| Direct-token Bok funding |None|None complete|Approval-present/absent branches missing. |
| Collateral cancellation/refund and withdrawal |None|No complete mined-payout timing|Report protocol maturity waits separately; inclusion is not payout. |
| Bok withdrawal |None|Mined ETH payout verified (`ef358`), no continuous total|Functional evidence; no percentage. |
| Bok request to visible usable reply |No clean full baseline|Request included/visible43.754055s (`30fb`)|Reply already existed before observer attached. This does not measure request-to-reply completion. |
| Automatic moderation |None|Functional evidence only|Inference through included removal and backlog completion remain unmeasured. |
| Bookmarks, follows and read state |Now off-chain|Bookmark control11.660ms (`8ae95b3d`)|Local interaction only; encrypted replication durability measured separately. Do not compare with retired on-chain transactions. |

These are observed results, not guarantees or matched multi-run distributions. Different network conditions do not erase an observed reduction, but endpoint differences and unmeasured wallet dwell limit what it establishes. Live `eda83e16` has no new browser timings yet. The all-flow50% target remains open.

[Onboarding measurements](ONBOARDING_MEASUREMENTS.md) retains exact intervals and raw evidence. The latest `d20794f6` opening attempt failed during degraded node/query readiness; it supplies no successful posting or opening result. The preceding `8ae95b3d` delayed-composer post was observed visible at18.177735s. Its and the `fb61925c` post receipts later reported dropped, and the original traces omitted inclusion block/hash. Those observations do not establish durable present inclusion; future evidence must retain the public inclusion anchor. Do not infer a reorg from dropped status alone.

## Reviewed preparation batch — 26 October

Immediate bio, avatar, name and subboard actions load public fee metadata alongside native synchronization. Fresh native credit is still read after the existing discovery barrier; zero credit rejects before saving an intent. Reuse remains bound to the same encoded action and held operation, wallet, PXE and node. This overlaps approximately286ms of payment preparation seen in the earlier bio trace; actual elapsed savings are unmeasured.

Immediate moderation reuses its completed review before proving only for the same encoded action, operation and native anchor. It removes one of three authority/target review passes. The final fresh moderator, policy, target and canonical checks remain before sending. Separate or changed operations use the normal full review.

Published `eda83e16`; served worker/SDK hashes verified, with no service restart. Independent review approved both patches. The integrated affected suite passed863 checks. No browser measurement or50% claim follows from these checks. Cold SRS work is deferred by owner direction.

## Live f16 measurements — 26 October 2026

Published and pushed `f16ff3d778a31563c66b1169708b6d353efa8cfa`. Same34-character bio shape on Clear Finch succeeded in15.299050s from Save bio to native inclusion/editor closed; public profile then displayed the exact new text. Previous3b observation14.560285s. Preparation fell3.177420s→1.870050s, but depleted test credit triggered2.169740s fee estimation absent from the earlier run. Proof6.808930s vs6.927570s. The differing credit state prevents a matched end-to-end improvement claim. Current inclusion: transaction`0x115249ed7cf0cbe554c9d2f601439871b71b5f607f5cd07e0057e435c5159568`, block5291/hash`0x1948798d660936526bebb350cce9f13764565bb2c138a68b1d2a513eb6008625`.

Normal immediate account-opening wallet→ready5.734270s first changed SDK and3.558800s cached. All targets remain open. Raw traces are in the current transaction-latency evidence directory. Actual standalone credit top-ups are being exercised; a test-signer provider-binding repair introduced recorded wallet dwell in the posting-credit test and must not be counted as application latency or hidden from total wall time.

### f16 actual funding results

ETH-to-Bok: **46.175275s** Pay→native Aztec inclusion and usable1USDC, one Ethereum payment. Wallet request at+3.388s; automatic approval accepted+3.611s and submitted+4.122s. Funding-claim work began+20.098s. Sequential inspect1.335s, saved-payment verification0.804s, account status2.328s, bridge0.547s, prepare3.996s, submit14.057s, checkpoint0.507s and required balance refresh2.488s. Submit contains fee preparation1.013s, proving9.495s, Aztec submission0.422s and inclusion2.763s; do not sum child and parent spans. This result is slower than the prior39.222685s observation; no speedup claim. Exact Ethereum and Aztec receipt anchors retained in the raw files.

Posting-credit top-up:100FEE credited in **134.757725s** Pay→usable credit, including36.180520s recorded test-adapter repair dwell before accepting the first wallet request. The fresh fixture required an Ethereum allowance approval plus deposit. Aztec included at block5296; required balance refresh2.417s. This is successful functional evidence, not a clean timing acceptance or controlled baseline. No app error, duplicate deposit or recovery path occurred. Test signer now uses its existing provider; no real funds were used.

### Reviewed claim and measurement improvements

The completed-workflow probe now performs its authenticated receipt check before synchronization for completed ordinary/deposit/fee/Bok claims. It no longer synchronizes only to have the bridge step invalidate that work; actual claim preparation still selects fresh native state afterward. Display-only account readiness uses fresh native collateral/credit for completed fee/Bok histories, removing historical receipt rereads that gave no new posting authority. Release/request/withdrawal/replacement and pending-exit handling remains separate. Native fee measurement now reuses the exact attested PXE node cache for immutable membership reads already performed during private simulation; every public gas simulation remains fresh and content dependent. Independent reviews approved;774 integrated application/wrapper/native measurement checks and actual six-script build pass. Publish and live measurement remain separate evidence.

### Native claim and synchronization follow-up

Reviewed Bok claim prefetch reuses the existing native FactStore/cache and exact anchored current class/layout checks for portal, L1 chain and version immutables. Compiled native fixtures perform7 grouped cold requests instead of9 sequential ones, then no additional immutable reads in the claim; recorded native facts require only3 hash witnesses. Actual claim still verifies initialization, values and root.

Removed the application-added postcommit remote synchronization sweep. It was a later freshness veto after local commits, not a rollback mechanism. The synchronizer still checks prewrite canonical ancestry, applies native atomic rollback and verifies its final local anchor/all-tier acknowledgements against the captured plan. Actual next-sync fork tests restore spends and remove orphan notes; transaction validation remains fresh. This removes one network round trip without asserting permanent chain freshness.

751 integrated native-sync/compiled-claim/application checks and actual six-script build pass. Publication and measured end-to-end savings are separate evidence. At resumption browser control reported disabled, so no new browser result is asserted. Prior c790 first changed-SDK opening6.322200s is retained; its cached run was interrupted before evidence capture.

## Opening quote overlap — 26 October 2026

`af0aea9c` removes the worker dependency that delayed public funding quote construction until private session initialization completed. The existing allocation, ETH quote and USD reads now start while the session initializes. Actual native account status still decides whether signup is needed; installation remains inside the account operation with the existing wallet, nonce, quote and custody checks. USDC only overlaps its public allocation/rate preparation. No early payment or duplicate quote is introduced.

The worker reserves the opening operation before starting these reads, avoids waiting on its own completion promise and drains outstanding reads on failure. Closing and competing funding calls remain blocked until the operation finishes. The preparation is local, one-use and bound to the funding context and asset; it is not a cache or a renderer capability.

The actual worker build passed. The affected integration suite passed601 checks, and the final focused opening file passed18 tests including the child VM lifecycle cases. Independent review approved the runtime and tests. These checks establish overlap and failure/authority behavior, not elapsed-time savings. Browser control still reports disabled; no new2-second or50% acceptance measurement is claimed.

## Actual af0 measurements after browser restoration — 26 October 2026

Browser access resumed after the owner restarted the desktop application. No permission setting was changed. One retained IAB tab and the disposable Sepolia test wallet were used.

| Flow | Click to useful completion | Observed detail |
|---|---:|---|
| Warm funded account opening |3.264900s|205ms automatic signature; session429ms, native sync1.254s, account status1.278s. Page was already warm; not cold or immediate opening. |
| ETH-to-Bok,1USDC |38.281095s|One successful Ethereum payment, actual Aztec inclusion block5611, refreshed usable balance2USDC. Proof6.520s; native inclusion4.014s. Previous f16 run46.175s; not50% acceptance. |
| Bio,34ASCII characters |25.481420s|Sufficient private credit; preparation2.237s, proof4.975s, submit425ms, actual Aztec inclusion17.716s. Editor closed at inclusion; public profile subsequently displayed exact text and confirmed state. Slow observation retained. |

Raw evidence: `opening-af0-warm.json`, `bok-topup-af0.json`, `bio-af0-run1.json` in the transaction-latency evidence directory. The first opening recorder missed the icon-prefixed wallet label; that observer failure supplies no timing result. The bio observer deadline expired while the real transaction remained pending; observation continued without resubmission and captured completion. Neither observer deadline controlled application progress.

## Joint account and funding read waves

Opening now uses the existing joint Board/FPC native discovery wave immediately, while public fee metadata loads concurrently. It removes the separate Board-only preliminary discovery and reads actual deposit IDs and fee balance once. Empty accounts also read the fee contract; only an actual insufficient-credit result with native empty collateral and no pending exit becomes normal setup readiness. Other errors still reject.

Bok funding overlaps fixed-block L1 portal getters with the existing L2 canonical check, final gas-price reads with funding-scope verification, and public plugin admission with native credit discovery. A shared admission helper serves all Bok balance callers; no duplicate status implementation or new cache was added. All reads drain before the operation releases. Independent source reviews approved both changes. Live measurements are required before a speedup claim.

## e4 live follow-up

`e4a02f22` is published with no service restart. Public worker SHA256`092990e513ece69bd4b0e8effbee329e91241e4e3a240c6b76547a866768e862` matched. Funded opening observations:2.995600s after the earlier bio,2.500210s after a Bok top-up, and2.424945s on immediate cached reload with no intervening transaction. The last case includes236ms automatic signature and measured3.315740s from the earlier account-button click. None establishes the2s target or cold new-account acceptance.

The first e4 status took1.271s because it discovered a real pending refund, including326ms partial completion lookup and238ms native validation absent from the prior af0 trace. Repeat status fell to697/684ms; actual Board/FPC reads overlap. The tagged lookup is native partial-refund discovery, not legacy encrypted sender delivery.

Actual1USDC ETH-to-Bok payment took49.345615s and exposed3USDC usable balance after proposed inclusion. Pay→wallet request improved9.044→6.727s, but the Ethereum interval increased. Postpayment claim work remained approximately26s. Native proof6.654s; observed Aztec inclusion4.015s; required credit refresh2.381s. These observations do not satisfy the50% goal.

The next source change separates immutable encrypted storage namespace from current payment admission. It removes full remote portal qualification merely to read local custody, including the repeat after bridge readiness. Quote and the final presend boundary qualify current scope; receipt, network, canonical and actual claim validation remain. The prior scope WeakMap is deleted, not replaced with another cache. Independent review approved; affected checks and published measurement remain recorded separately. The redundant initial confirm qualification is removed because the existing journal always invokes final qualification before its only wallet-send call; preflight failure restores its local records.

Readonly opening now uses one freshly captured, internally consistent snapshot. Its local anchor is verified against the selected header with the native archive membership proof; subsequent transaction preparation still synchronizes freshly. This replaces the later serial remote freshness sweep only on forward, non-pruned readonly paths. It deliberately reports captured-snapshot state, not a promise that the chain cannot change afterward. Rollback, tier acknowledgment and operation ownership remain.57 focused native checks passed, and a real witness from the published node verified its root at block5649 for retained block5615. No measured latency gain is claimed before publication.

## 87 live follow-up — 26 October

Published `87c0014d0411b0538f4cbc37c6aad78144018309` without app/proxy restart. Public worker SHA256 `8f5a4a65122bcf9e1fed4dedb50a63411a9ce775154b26883f0b44a893ac0f47` matched. Actual ETH-to-1USDC Bok credit completed in **31.069425s**, including the successful Ethereum payment, native Aztec inclusion and refreshed usable4USDC balance. Pay→first wallet request3.445835s; inspect1.5ms; payment recovery1.0601s; account status1.0883s; bridge wait3.7210s; claim preparation2.6933s; submission/proof/inclusion12.1116s; completion checkpoint522ms; usable-credit refresh2.2222s. Native proof6.2903s and observed inclusion4.0334s are contained in the submission interval, not added to it. The49.345615s e4 and38.281095s af0 observations had different Ethereum/bridge waits; these runs do not establish matched50% acceptance.

Funded normal opening measured **2.406370s** on the first changed-SDK visit and **2.425505s** on immediate cached reload. The cached run includes236.390ms automatic signature; account-button→ready3.216845s includes the separate wallet selection. Session363ms, native sync673ms, account status605ms. Its native source snapshot324ms preceded the313ms ancestry lookup. Both opening runs miss2s. This is funded reopening, not fresh-account payment readiness or human MetaMask timing. Evidence: `opening-87-first.json`, `opening-87-cached.json`, `bok-topup-87.json`.

The current87 Like transaction returned in13.260s and the page showed1like; its visible-count observer selected the wrong element, so there is no precise visible-completion timestamp for that run. Unlike reached the visible zero count in19.191350s; its native proposed receipt arrived417ms later (the server feed had already indexed the effect). Preparation2.853s, proving4.682s and observed receipt wait11.813s are retained, not excluded as a slow run. The native transaction is0x2f6b35e5c8668712ba3153e180275a2c823ddf9b7e1e2beb182bcebddbf8a13a at block5681/hash0x16deb7e704c2a0b490afb0e8399666348a7487e5bffb1f190855e535a892088d. No50% claim follows from this run.

A read-only probe through the actual installed private-query handler measured empty synthetic-tag requests at8.17–19.33ms, including5.69–7.78ms node admission. This does not explain browser250–330ms round trips. The public-feed read gate remains unchanged. The probe created no listener or persistent service and removed its temporary server file.

## Next reviewed source: owned claims and browser artifacts

Standalone Bok continuation now verifies its Ethereum payment once, then retains exact authenticated custody only inside the existing account operation. Native message reconstruction, anchored membership, canonical checks and the contract proof authorize credit. Preparation/submission no longer repeat the L1 payment verification. Generic claims still use their original receipt path; no renderer-controlled verification flag or persistent verification cache exists. Independent review approved; root42 affected checks passed (author163 native,105 boundary and6 application checks separately passed).

Readonly signup quote construction now overlaps independent scope/fee admission with nonce and price reads. Both finish before any local token; no custody write, signature or payment happens speculatively. Installation retains fresh wallet/nonce/quote checks and exact record comparison. Root21 focused checks passed.

The browser artifact projection removes compiler source maps/debug symbols only, retaining bytecode, verification keys, ABI errors and assertion messages. Native class IDs,41 function hashes and deployed Board/FPC addresses are unchanged;4 real-native checks passed. Original compiler artifacts stay intact. Published artifact payload falls by7.71MB; reduced browser source mapping is the diagnostic tradeoff. Actual SDK and wallet builds passed,90 files/111 inputs. These changes still require published timing measurements.

## Remaining qualification work

Use the live coverage table below as the worklist. Each branch needs a recorded baseline and after-run with the same useful endpoint and sufficiently matched action shape, funding state and wallet interaction. Where no qualified baseline exists, record one rather than inventing a percentage. Repeat across inclusion phases and keep failed/slow runs.

- Reactions: current Like and Unlike, including usable count/control feedback. Identity/profile: name registration and set/clear bio/avatar. Boards/admin: create subboard, remove post/avatar, reject board, transfer moderator and main-policy changes. No current matched evidence covers all these branches.
- Funding: complete ETH and USDC signup, posting-credit top-up with approval present/absent, and ETH/direct-token Bok credit. Include approval/signature dwell, actual Ethereum receipt, bridge usability, Aztec inclusion and spendable native credit. Quote-only or claim-preparation timings are incomplete.
- Exits: cancellation/refund, collateral withdrawal with/without screening, and Bok withdrawal through the mined Ethereum payout. Native cooldown/proven Outbox waits remain separately reported; Aztec inclusion alone is not completion. Current matched full-path evidence is missing.
- Bok and moderation: request→visible usable reply, cancel/expire and genuine uncertain-provider reconciliation; inference/removal and backlog catch-up. Keep model/inference, proof, inclusion and final visible effect separate. Preserve the old observations below; do not treat them as current matched qualification.
- Ordinary variants retain their named/main/subboard/reply/quote/repost coverage and posting endpoint. Off-chain saved items/read state retain bidirectional interaction, persistence and synchronization checks as nontransaction work. Operator setup remains separately reported without an invented everyday-user baseline.

## Measurement contract

Baseline UI: `74c2142c08b6a9cdeabefe6e46ebfa5ec4578836`. Baseline source: `ac27cc2bbc70e4302be4468e6a398dadd40ab270`. Hosted Bok still uses its independently recorded service release. Do not compare against historical releases as if they were this baseline.

Record click, preparation, fee work, private execution, kernel witness construction, public validation, proof transport/native proving, submission, actual Aztec inclusion, rendered effect, checkpoint, and required private-state refresh separately. Ethereum flows additionally record wallet response time, mined receipt and bridge-message usability. Withdrawal availability depends on native cooldown and proven Outbox membership; report these waits explicitly.

An earlier pending display does not establish faster canonical settlement or spendable funds. A trace ending at inclusion cannot establish completion of a bridge claim. Match action shape, payload size, credit availability, account readiness and note fragmentation. Preserve unsuccessful and slow runs. Repeat comparisons across network inclusion phases.

## Next reviewed source batch

Owned-name refresh warms the existing exact-anchor Board class/initialization reads during its fresh native synchronization; actual ownership discovery remains unchanged. Account-status presentation skips the historical receipt reread for included ordinary actions, as it already did for included signup claims. Fresh native balances determine the display. Actual prepare/submit and funding authority still validate predecessor state; rollback and missing-credit cases do not obtain new send authority. Independent source review approved both changes; integrated411 session/native/wrapper checks and626 application checks pass. Published in3b032339. Real name completion16.385465s, required ownership refresh1693ms. Earlier a7517.543705s/refresh1954ms are single observations with different native state; tests alone establish no speedup.

## Reviewed follow-on transaction batch

Current3b bio baseline:34ASCII characters, Save bio→native inclusion and editor closed14.560285s. Public profile subsequently displayed the exact text. Receipt0x21d2a26a85332dbd4d47256dc628e05762273ddb488aa26f0f40eec1324365b0, block5275/hash0x3025a09d811ceff1608b17129161262f677cfd8c9ae709fb86949453afab61b3. This gives a current complete-action observation; public-profile visibility was checked afterward, not timed from Save.

Next integrated source removes browser Buffer UTF8 hand-loop (native JSON and malformed-string behavior preserved), overlaps bio/avatar/subboard discovery with existing predecessor checks, overlaps funded-opening FPC discovery with metadata, and removes standalone Bok custody's duplicate Ethereum receipt verification. Actual full receipt/effect/intent/canonical verification still runs before any custody disclosure. Independent source reviews approved.33 encoding/native startup checks,925 other affected checks and49 combined opening/native checks pass. The full built six browser scripts evaluate successfully. No live speedup claim yet.

To enable real funding tests, the known Sepolia fixture minted1000free FEE through the pinned faucet and swapped500test FEE for0.000286985593182275ETH, leaving500FEE and0.000478127271250505ETH. All mined receipts retained; no real/mainnet funds and no application balances fabricated. These fixture transactions are not included in application-flow timings.

## Live flow coverage

| Family | Branches to qualify | Transactions and required endpoint |
|---|---|---|
| Ordinary variants | Named posts, replies, quotes, reposts; main/subboard | One Aztec transaction; included visible post and checkpoint. Main-board paths already share the optimized post implementation. |
| Reactions | Like, unlike | One Aztec transaction; included public count and checkpoint/account availability. |
| Saved items (off-chain) | Bookmark, follow board and follow name; both toggle directions | No Aztec transaction. Measure usable control/local persistence and encrypted replication separately. |
| Conversation read state (off-chain) | Current read/unread behavior | No Aztec transaction. Measure the current visible/persisted behavior. Former contract subscription, notification and read-marker paths are retired, not missing transaction benchmarks. |
| Identity/profile | Register name; set/clear bio and avatar | One Aztec transaction; included feedback, canonical profile and usable selected name. |
| Boards/admin | Create subboard, remove post/avatar, reject board, transfer moderator, main policy | One Aztec transaction each; exact target/policy authority and included/canonical effects. |
| Signup ETH | New account with combined collateral and fee claim | One typed consent, one Ethereum transaction, one combined Aztec claim; account ready to post. |
| Signup USDC | Relayed combined funding | Two typed signatures, one relayed Ethereum transaction, one combined Aztec claim; account ready to post. |
| Posting credit | Direct token top-up, approval present/absent | Optional approval plus Ethereum deposit and Aztec claim; available credit. |
| Bok credit | ETH atomic swap/deposit; direct USDC, approval present/absent | One ETH purchase or optional token approval plus deposit, then Aztec claim; available credit. |
| Collateral cancellation/refund | Stuck funding deposit | Ethereum refund request, Aztec cancellation, Ethereum refund; mined refund. |
| Collateral withdrawal | No screening and required-screening cases | Optional screening transactions, Aztec withdrawal, proven Outbox and Ethereum withdrawal. |
| Bok withdrawal | Owner withdrawal | Aztec withdrawal, proven Outbox and Ethereum withdrawal. |
| Bok request lifecycle | Request/post, cancel, expire; normal reply and failed-provider reconciliation | Request/post atomic; normal reply settles/publishes/finishes atomically. Genuine uncertain provider outcomes remain distinct. |
| Automatic moderation | Inference, removal, backlog catch-up | Measured inference and exact-authority transaction; included/canonical flag. |
| Operator setup | Fee claim, escrow deployment/binding/registration, L1 deployment/activation | Separate infrequent operations; no invented user-flow baseline. |

Historical everyday inventory: `execution/evidence/G21/stable6/other-transaction-latency/everyday-flow-inventory.json`. It predates the off-chain change; the live coverage above controls current work.

## Historical goal-start observations — UI74c2142c / sourceac27cc2b

| Baseline action | Actual inclusion | Effect | Canonical action returned | Qualification |
|---|---:|---:|---:|---|
| Like | 13.672 s | 14.135 s visible frame | 56.933 s | Public feed already renders the included like while the account lease continues. Full account refresh continued after canonical return. |
| Bookmark | 13.417 s | 58.718 s DOM update | 58.264 s | Target was outside the viewport when the label changed; this is not a qualified visible-frame timing. |
| Register name | 15.479 s | 106.844 s selectable, visible | 100.169 s | The required account/name refresh added another6.675s after canonical return. |

These are single baseline observations, not medians. Evidence contains exact click origins and scoped timing spans. Never sum nested SDK/native spans into end-to-end time. The generic confirming span currently includes observer lifetime and can finish after the canonical action; use the action promise/receipt boundaries, not its label, until corrected.

## Historical release work and measurements

The records below describe their named releases. Statements such as “published”, “unpublished”, “current” or “next” refer to that record, not the latest deployment. Preference/read-marker transaction records predate their retirement in `bbf76d92`.

### First implementation batch

- Preference reads reuse one validated head only within the same held, synchronized operation and exact PXE anchor. Different operation, account, wallet, node or anchor cannot reuse it. Normal proof guards retain journal/epoch/identity checks without synchronizing the same snapshot repeatedly. Read-marker canonical block checks and interrupted-flow checks remain fresh.
- ETH/USDC quote metadata reads share their captured Ethereum block and run in drained parallel waves. Dependent asset quotes overlap. ETH confirmation removes one duplicate simulation and its six surrounding network checks; the final exact signed-request simulation still runs before journal/send.
- Moderator authority reads overlap at exact captured anchors, retaining both pre/post-proof checks and final canonical fences. Deadline reads use batches of eight. Catch-up skips idle sleeping only after verified progress with remaining work.

- Generic fee estimation reuses the node limits already verified during payment preparation, removing another readiness RPC without changing native admission.
- Native account/Board/FPC preparation now covers14 explicitly qualified Board methods using their actual registered selectors. It reuses the existing anchor-scoped native caches, never ordinary-post gas or history assumptions.
- Top-up journal reads reuse scope only within their held operation; fresh payment boundaries still requalify mutable portal/network state. Withdrawal confirmation reuses exact immutable effect/path bytes with a fresh final receipt/header/network fence, removing7RPCs.
- Immediate actions display exact included receipts, keep private preferences canonical, and avoid unrelated Bok/account reads on the completion path. Confirmation timing now ends before UI refresh.

First batch041a624b is published and public asset hashes verified. No50% end-to-end claim has been established; matched after measurements remain required.

Second reviewed source batch removes discarded review simulation for subboard/admin actions and Aztec exit preparation, retaining explicit moderator-transfer consent and exact withdrawal recipients. Current refund intent remains until actual Ethereum completion. Integrated891/891 tests passed. Same-operation bridge evidence and fee preparation reuse passed535/535 integrated tests; canonical L1/L2 receipts, anchors, current FPC identity and native admission remain fresh. Bok atomic finalization reuses its own exact authenticated terminal result, avoiding a second27-RPC inspection; uncertain/restored outcomes still inspect. These second-batch changes are not yet published.

Bok ETH funding baseline: one$1 test purchase, one Ethereum transaction and one Aztec claim. Bridge-ready UI91.684s from Pay; claim arguments9.484s, private execution5.292s, proof transport/native proving4.105s, submission0.400s, inclusion2.816s after submission. Account-ready UI165.094s from Pay. Initial wallet-adapter handling includes unmeasured tool-scheduling dwell, so total is observational and not a clean matched speedup denominator. No second payment was sent. Funded balance1USDC was verified on the main page.

Generic immediate actions now start unchanged fee preparation alongside their independent arguments/authority reads and bind reuse to the same held operation and encrypted intent. No ordinary-post gas assumption is applied to generic actions.

Reviewed sequencing candidate permits ordinary account actions to return at exact successful native inclusion. A subsequent action freshly checks the predecessor against the synchronized native anchor. Preference and name state comes from native reads. Display-only checkpoint observation cannot mutate journals or release private-account locks. Both independent reviewers approved;911 affected checks,2 real SDK waiter/engine boundary checks and1 native LMDB rollback scenario passed. Live qualification is outstanding. Bok accounting now accepts an exact public hash/height snapshot, matched to the private reader anchor, with hash-bound pagination and reorg checks.

Bok sourcea160e83f is deployed: an exact finalization that failed before serialization/submission can be attempted on the next normal worker cycle without repeating model work. The original failed baseline reply proved in3.397s (witness0.547s, native proving2.456s, validation0.341s), submitted in0.344s and appeared in the browser. Its failure/repair downtime makes it unsuitable as a clean speedup comparison.

## Live follow-up and current candidates

UI08b4ce33 is live with the exact-anchor public accounting backend. Its like test returned usable in12.199s versus56.933s baseline (78.6% reduction in the action lifetime). Included feedback took11.419s; visible controls became ready at11.877s. The like-count frame probe had an incorrect regular expression, so this run does not qualify the precise visible-count time. A faster action lifetime is not a claim of equally faster network inclusion.

Bookmark inclusion took11.618s, but required preference refresh continued for minutes. The UI returned to Bookmark while account controls remained locked. This is a failed usability qualification, retained in after-bookmark-08-refresh-regression.json. The cause is a cold preference reader walking from block1 in32-block pages, repeating sync/head/checks on every page. Fix and matched rerun are required.

Bok94d1a719 is live and healthy. Successful finalization releases at exact Aztec inclusion, then the existing scanner follows that same transaction to checkpoint. It cannot repeat paid model work or resend a rolled-back reply automatically. The latest change fixes contradictory selector guidance: object selectors belong only to edit_browser_plan, while browser-tests.json requires CSS strings. Five failed paid repairs in the retained baseline were caused by that mismatch.126 checks passed;25 existing browser opt-in tests were skipped. A clean new live request is still required.

Unpublished candidates extend native included usability to incoming claims; qualify like/unlike fee bounds independently; batch deposit refunds, nullifier and canonical-block reads; and overlap final L1 gas/fee metadata and exit membership reads. The combined first candidate set passed1143 tests with0 failures and25 existing browser opt-in skips. Native public like branches and the full private-effect bound were tested; a fresh native balance read uses the fixed bound when affordable and otherwise routes through the existing measured estimator before proving or sending. Low-credit affordability is retained. Final native proof/admission remains authoritative. No50% claim is made for these candidates before live tests.

The sparse preference reader f844b1de is published. Its first bookmark test completed in22.773s (required native preference refresh7.608s), versus58.264s baseline. This is a60.9% action-lifetime reduction; the target was offscreen and an account modal was opened during refresh, so it does not qualify a visible-frame result. Consecutive unbookmark completed in20.037s, with its final label visible at12.685s and native refresh finishing later. The prior bookmark still displayed confirmation-pending at the second click; an exact network checkpoint-at-click probe was not captured, so this alone does not certify a pre-checkpoint note spend. Active-button feedback was also lost during an unrelated feed render; a follow-up UI fix is required.


UI d4cfeee0 is published and public runtime/SDK hashes verified. It includes proposed incoming claim completion, independently qualified like/unlike fees with fresh low-credit handling, withdrawal/refund read overlap and inline name completion. Name creation returned in15.805s versus100.169s baseline (84.2% action-lifetime reduction). The selected control was offscreen, so this is not a qualified visible-frame comparison. The resulting owned name immediately signed one real post: actual included post visible at13.459s, action returned13.927s. No matched named-post baseline is available.

Next reviewed batch: native bridge-message readiness at proposed tier with actual tree membership; preference-specific fee bounds and low-credit measured fallback; one head/class read per held preference anchor with both fresh canonical fences; captured in-flight reader actions surviving feed rerenders; atomic Bok and terminal actions at included tier; one-time newly selected-name feedback; native-supported reply/quote/repost/like controls on included posts. Actual native public transitions qualified15 Bok race cases and15 target-state cases. Browser renderer regression remains to be exercised in the existing IAB. Initial root preference artifact test failed on an ignored stale Oct23 target; rerun against exact retained deployed artifact passed53/53, without changing any runtime pin.

Integrated next-batch application/session/preference/UI checks passed1008/1008, plus the separately run native target fixture. Public deployment and matched live runs remain required.

UI5df7df9d is published; exact public runtime/SDK hashes verified and no backend/proxy restart. Real bio edit34characters returned21.490s, modal closed after included feedback at20.720s, against approximate baseline75.020s modal endpoint. Native confirmation wait12.051s, preparation2.274s, real proof6.685s. Public profile subsequently displayed the exact new text. This is a single observation; the baseline click origin is approximate and profile-visible timing was not captured.

Repeat Bok-funding qualification encountered an obsolete retained74c completion record after d4 deliberately changed the disposable test format. No second payment was sent. Current-format repeat-payment/replaced-workflow/reorg scenarios passed7/7. Root is verifying and discarding only the completed obsolete fixture, with no production migration. Follow-up candidate adds nested receipt/membership/canonical timing, overlaps immutable receipt bindings, permits natively valid included read markers and keeps optional moderator menu discovery from disabling navigation (dependent native reads still join its lease). Root124 receipt tests and112 composer tests pass.


UI e752cf00 is published with immutable receipt binding overlap and honest native bridge membership; read markers accept included native state, optional moderator-menu discovery does not disable unrelated navigation. Public runtime and SDK hashes match, application/proxy PIDs unchanged.

Latest like completed in27.491s, visible count at27.493s, versus56.933s baseline action lifetime (51.7% reduction). This retained slower sample spent18.874s in actual Aztec inclusion; fee estimation40ms, private execution95ms, proof stage4.876s. Earlier12.199s result remains. The intermediate observer omitted the actual Liking label, so intermediate feedback timing is not qualified.

Bookmark5df completed23.632s with final Unbookmark visibly rendered23.636s (59.4% reduction in action lifetime versus58.264s). Saving remained disabled through feed rerenders. Required native preference refresh6.621s; follow-up readiness handoff removes its duplicate inspector while preserving native routes, anchor and canonical fences.

Current-format ETH-to-Bok funding on e752 completed86.374s, one Ethereum purchase and one Aztec claim; fresh native balance1.728084USDC was displayed. Arguments2.705s versus9.484s baseline, private5.414s, kernel0.781s, validation0.572s, remote proof4.034s, inclusion3.178s. Full account refresh5.397s then Bok balance4.917s still delayed completion. A reviewed candidate requires only native Bok credit on this completion path and defers unrelated account reads. Baseline165.094s includes unmeasured wallet dwell, so no clean matched50% acceptance is claimed. A fresh quote after the completed current-format funding and an unrelated like succeeded without another payment or migration.

Fresh root Bok request5df reached included visible post32.009s and usable account32.660s but failed admission before any model call: the only configured repository was already assigned. This is retained as a failed end-to-end run, not a latency success. A newly created empty private repository could not receive the selected-installation token (422); existing owner CLI grant update was rejected403, with no permissions changed. No further creation or permission attempts. Bounded reuse of an older selected, unreferenced disposable test repository is being reviewed.

The native performance observer must start before the click. Reading final Performance entries loses earlier repeated same-name oracle measures, because the SDK clears them; the existing bounded observer retains every measured occurrence and overflow markers. No inference about duplicate oracle counts should be drawn from the old truncated snapshots.

Next integrated source removes duplicated preference readiness and unrelated full-account reads after a successful standalone Bok claim. The required Bok balance still comes from a fresh native read. Top-up progress now changes from the wallet prompt to Ethereum confirmation immediately after the hash is durably recorded. Integrated readiness/claim checks435/435 and payment/journal/UI/capacity checks469/469 pass. Follow-board on e752 completed22.793s with native included preference visible22.795s; no matched baseline for this branch yet.


UI ddea0a72 is published and exact public hashes verified; no backend or proxy restart. Seven Bok/four fee portal bindings now run concurrently at the same captured L1 block with drained failures and unchanged final fences (14 integrated boundary tests). Create-subboard on e752 produced an included directory entry14.478s after click; no matched baseline for this branch.

Bok capacity repaired by resetting only old unreferenced selected slot20261015-01 to its authenticated genesis with exact Git expected-head lease, appending its existing grant to configuration, then restarting Bok alone. Existing assignment and artifact proxy remained unchanged. The blocked request resumed: two model calls55.556s total instead of the prior9calls/78.8s, one native reply proof3.432s, send0.341s, actual inclusion17.600s. It published and returned unspent credit; its capacity-failure downtime remains in the end-to-end record, so this is not a clean50% latency acceptance.

Pending-exit candidate passed929 integrated application/session/composer/automatic-withdrawal tests. Native included exit identity is durably retained in one current pending slot before unrelated private actions can proceed. The exact native proven waiter runs without holding the account lease, followed by one canonical Outbox check; actual Ethereum payment still requires complete authority. No migration or old-release compatibility is added. It remains unpublished pending the next coherent build.


Reply166characters on ddea closed the composer10.214s after click and inserted the native included reply10.660s after click, but it was below the viewport (top689px in571px viewport). This is retained as a visible-completion defect, not a qualified visible-frame result. Follow-up reveals only the exact newly included user submission once.

UIeecd4f60 activated without app/proxy restart and is pushed to all three application branches. Public runtime SHA256b77462023033a9422d77adb9b6f431fa014975b7c1a9732d57c77345f019641b; SDK unchanged d244ae0d. Exact transfer archive/S3 version cleaned. Live withdrawal preparation exposed a pre-existing wrapper mismatch: readBalances rejected the UI’s valid includeBok boolean before RPC. No withdrawal was sent; boundary correction is required before continuing. Read-marker action took24.230s (prepare2.443s, inclusion7.588s, preference refresh4.339s), with no matched baseline.

Follow-up integration:163/163 composer/navigation/synchronized-boundary tests passed. Included-post reveal now targets the exact rendered transaction once and defers while another dialog is open; hidden rows cannot receive focus. Ethereum withdrawal preparation and wallet request use one app action with unchanged proof/recipient/amount/canonical checks. The shared balance wrapper now accepts the existing includeBok selection before awaiting. Progress from idle background reads no longer leaves a loading message. Live reload restored both Unfollow board and Unbookmark without account dialogs. Bok owner-delivery source4f107032 remains a qualified but not-yet-deployed contract candidate; current UI artifact scope still uses the old Bok.

Live ef358 validation: Show Bok balance now loads1.964222USDC instead of failing. A0.10USDC real withdrawal reached Aztec inclusion22.229s after click; submit returned23.001s. Preparation5.679s, fee preparation1.343s, private execution2.031s, kernel body0.879s, remote proof4.257s, native inclusion wait5.146s. No qualified exact ready-frame timestamp: first pending snapshot49.828s is only an observation upper bound. Unfollow completed15.940s while that same exit remained pending; the saved exit stayed accessible afterward. Ethereum payout is still awaiting actual proven Outbox readiness, not claimed complete.

Next funding candidate: aggregate gas estimate and fee-price read overlap with sibling failure draining; the final fresh fee check remains. Claim continuation now inspects authenticated current workflow without unrelated deposit/private-fee reads, retaining uncertainty and current owner checks. Zero-Bok current-format signup correctly compares absent optional Bok receipts on both sides. Integrated application/aggregate/synchronized tests662/662; focused session continuation1/1. These source changes are not yet in public ef358 assets.

Follow-on source candidate: standalone posting-credit completion reads its native anchored credit instead of waiting for full deposit inventory; signup still checks combined readiness.665/665 integrated application/UI/wrapper checks passed. Aggregate funding’s independent L2 canonical, L1 scope and node-trust reads overlap and drain on failure;9/9 added integrated wave checks passed. Withdrawals now have explicit action timing/proof progress and a separate Ethereum-payment span. Native current withdrawal trace confirms no repeated fee-probe execution in that case; remaining5.679s preparation needs further breakdown.

Integrated cancellation/withdrawal read waves:547/547 application and refund checks pass. Empty cancellation journals now perform one fresh pre-sign qualification instead of two, removing10 logical RPCs; saved/uncertain operations retain exact-transaction reconciliation and final fresh qualification. Bok withdrawal native balance and portal reads overlap in preparation and submission, retaining canonical anchor, owner, amount and scope checks. No measured end-to-end speedup is claimed before publication. Read-only stable6 network constants confirm72-second slots and32-slot epochs (38.4minutes), so actual Ethereum payout depends on protocol proving, separately from Aztec inclusion and account usability.


Reviewed moderation and paid-refund tail integrated:671/671 application/composer checks pass. Moderator authority and policy reads overlap while draining failures and preserving fresh authority/version fences. A canonically paid Ethereum withdrawal ends its action at payment completion; unrelated account inventory refreshes in the background and cannot erase another pending action. Source remains unpublished until the coherent build.

Exact153-character reply on public ef358ebb appeared unobstructed at an animation frame11.646505s after click, with the composer closed and actual Aztec inclusion. Preparation0.927090s, fee stage0.020715s, proof stage5.765195s, submission0.411965s, native inclusion waiter3.964675s. Included display can precede the final account callback. Complete bounded400-event trace retained in after-reply-visible-ef358.json; no observer overflow. No matched visible baseline exists, so this establishes working visible completion rather than a claimed50% reduction.

Real old-scope Bok withdrawal completed on Ethereum:0.10USDC, successful receipt0x7c022571d209d45f59c74982954d730835f3255a6fab5c801f57fa2ebe0991a6, block11988338. Native Transfer event matches portal, token, recipient and exact amount; UI showed Withdrawn to Ethereum and no pending refund. No continuous end-to-end payment timing was captured, so elapsed idle/browser-observer time is not attributed to network settlement.

Aggregate signup now updates progress immediately after a validated submission acknowledgment, rather than leaving Approve payment displayed until mining. ETH uses the existing durable journal callback; USDC requires a validated saved relay hash. Callback failures cannot change transaction authority.288/288 integrated aggregate/composer checks pass; exact Ethereum receipt and claim checks remain.

Deployment reliability fix: the node pruned state before constructorblock3227 (oldest3291), so a historical instance lookup prevented later portal deployment. Reconciliation now requires the original canonical transaction effect contain exactly one native public initialization nullifier, then validates current checkpoint instance/version/classes/address and immutable values with both canonical fences. No historical-state fallback or new deployment.102 operations checks passed; one stale ignored artifact preflight was corrected by reusing matching qualified outputs and its actual-SDK constructor case passed separately. Independent review approved.

Collateral readiness now hands its exact selected-deposit observation to immediate preparation within the same held operation and native anchor. Screening hints similarly reuse that observation once. The final submission still rereads native deposit state and canonical anchor; changed account, node, wallet, route, anchor or operation invalidates reuse.542/542 integrated application tests pass; independent review approved. This removes one native readiness/preparation utility call, with no unmeasured latency percentage claim.


25 October resumed observations: a155-character quote appeared unobstructed with the composer closed15.812345s after click, at actual inclusion, and later checkpointed automatically. The independent visibility observer completed; its phase observer overflowed, and a release archive upload overlapped the run. No matched quote baseline or isolated speedup claim. Known-state thread subscription rendered its usable inverse after33.080405s: native inclusion16.507740s, real proof stage4.826075s, submission0.416270s; remaining head/preparation/completion work is being optimized. Earlier unknown-state subscription opened the saved-items dialog without sending a transaction, an identified one-click defect.

Next reviewed source: unknown authenticated preference clicks now own loading and the following toggle in one inline action, using the real loaded value and captured account/target fences. They no longer redirect to a saved-items dialog.163/163 integrated composer/model checks pass; live candidate verification pending. Aggregate funding retains all five fresh USDC authorization boundaries while overlapping each boundary's independent reads, and overlaps its post-plan checks. Reconciliation shares one immutable exact-hash transaction within one receipt verification, retaining fresh receipt/code/canonical checks.206/206 integrated funding/wallet checks pass. Neither change has a measured percentage claim before publication.

Preference action preparation now starts predecessor and qualified payment metadata during the initial synchronization, with existing class-pinned Board/FPC preparation before the one preference-head read. The later native preparation guard remains and reuses the same owned anchor. After inclusion, the preference reader overlaps independent network readiness with native synchronization; the new head and fresh canonical/CAS publication fences remain. Independently reviewed; root31 synchronization/action tests,146 composer tests and50 reader tests pass. These target measured serial segments; live comparison is still required.

Moderation completed-action sweeps now synchronize the index once per sweep and reconcile up to8 existing records concurrently. For64 completed records, refresh calls fall from65 to2 including normal ingestion;64 exact receipts and128 canonical checks remain. The worker applies no invalidations until the complete sweep passes intent, index revision/checkpoint and held-lease checks. Root90worker +66authority/outcome checks pass; independent review approved. This follow-up is separate from the frozen93954017 release and has no measured wall-time claim yet.

Follow-up funding/exit changes reuse the exact authenticated result returned by a successful Ethereum send, keeping a fresh final canonical block check; restored or uncertain operations still inspect their saved transaction. Exit preparation now verifies a saved receipt and native Outbox membership once instead of twice. Top-up discovery overlaps independent L1/L2 reads; Bok withdrawal overlaps fee metadata with credit and portal reads, while cancel/expire share same-operation fee preparation. Root1048/1048 application, aggregate funding and wallet-session checks pass after independent review. The preference mutation test now verifies the concurrent-read boundary: no work for an already changed account, and no head/events/send after a mid-read change; the held account operation drains before release. These changes follow frozen93954017 and are not yet published or a measured50% result.

Next-source name/admin/profile follow-up: name availability joins the immediate fee-preparation wave; moderator target reads join authority/policy reads while preserving native queue ordering, failure priority and final revalidation.46 root focused application checks pass, alongside59 agent checks and independent review. Bio/avatar editors stop owned-name pagination once the selected name is authenticated, retaining the fresh profile version, explicit Load more, complete new-name discovery and account-change guards;151 root composer checks pass. No additional simulations or new timing claims; publication and measured effects remain separate.

### Completed-payment regression —25 October

The live posting-credit quote failed with `ROLLING_INTENT_NOT_FOUND`. Its authenticated local payment record contained `confirmedClaim`, but d4cfeee0 had unnecessarily renamed the persisted property to `claimCompletion`. The reader ignored completion and attempted to reconcile the old claim through the single active application workflow, which a subsequent action had replaced. Restore the established storage property; keep the current `recordClaimCompletion` API and native included/confirmed checks. No migration, fallback or recovery path is added. The full aggregate-wallet suite passes163checks, including aggregate, fee and Bok claim completion followed by another action and a new payment quote, plus canonical-fork rejection. Live payment acceptance follows publication.

### Live funding and Bok request follow-up —25 October

f0dc is published. Fresh posting-credit payment and claim succeeded. Fresh ETH-to-Bok took39.222685s from Pay click to the rendered usable-credit result after native Aztec inclusion, using one Ethereum payment and one Aztec claim. The historical165.094s baseline gives an observed76.24% reduction, but wallet dwell was not measured in that baseline; this is not matched-case proof for every funding flow. Exact trace and summary: after-bok-funding-f0dc-{summary,trace}.json in the other-transaction-latency evidence directory.

The funded real @bok request appeared34.026425s after Post. Its generated reply entered the conversation DOM264.637745s after that click and automatically checkpointed at334.231620s. The reply was below the viewport, so its DOM insertion is not a measured visible-frame endpoint. Generated app Start→Pause→Resume→Pause and Reset→Start were exercised successfully in a temporary browser tab, then closed. Request private execution391ms, kernel body9484ms and local returned-proof verification11081ms expose a browser bottleneck requiring investigation; do not describe this as the ordinary11-second post path. Worker model calls181.956s and five workspace checks24.710s dominate job processing.

Published589b5f2f removes duplicate synchronization, signing-capsule initialization and receipt verification when recording an included funding claim. One fresh exact signed-journal reconciliation remains immediately before storing completion, and later payments still check the prior claim afresh. Preference reads overlap initial canonical anchor, head and contract class, with both later canonical checks retained. Static update published without service restarts; actual preference-flow qualification is in progress.

Published79af02f2 fixes included-action observation: pending/dropped receipts or temporarily missing block data no longer erase a successful private setting. Only a mismatching canonical block at its saved inclusion height establishes an orphan. UI runtime and panel public hashes verified; no app/proxy restart.483 focused session/composer checks plus7 root targeted checks passed.589b subscription remained33.326s click-to-usable frame, including15.120s inclusion wait; no improvement claimed. Its later native checkpoint and subscription were valid despite the previous false-orphan display.

79af real unsubscribe:24.796770s click-to-usable visible frame; native inclusion3.158590s, proving12.567440s, completion preference refresh5.681660s. Later exact receipt checkpointed/success at3536 and UI automatically showed confirmed without losing state. No speedup claim: network wait changed substantially.

Bok30fb four-file repair-loop update published to existing host, ready active0 with no last failure; no SDK/native/config/proxy changes. Real167-character request produced reply and published Reset timer update; Start/Pause/Resume/Reset controls verified. Browser CPU-profiled posting took43.754055s click-to-included visible frame. Kernel reset13.2745s and local proof verification12.3319s remain poor. CPU profile has irregular sample gaps; cannot infer CPU cost or OS throttling from wall-weighted samples. Exact reply appearance was already present before the reply observer attached, so no precise click-to-reply browser latency is claimed.

### 25 October latest measured release b787

Clean fresh signup took40.797s from Confirm payment to visible enabled Write a post, one successful Ethereum transaction and one successful native included Aztec claim. Compared with the later clean01cb59.033s reference this is30.9percent lower, not the50percent target and not a clean goal-start baseline. Private execution4.915s→1.705s; native readiness still4.037s.

Fresh bookmark from unknown state took15.068s click to visible enabled Unbookmark after native proposed inclusion; inverse14.951s to visible enabled Bookmark. Exact receipt blocks3695/3696 succeeded. Starting bookmark action58.264s; this is74.1percent lower action completion, but baseline effect was offscreen. The b787 Like action returned in10.033s; its10.305s visible observer incorrectly targeted the permanent secondary Unlike control and is not qualified visible-count evidence. Receipt3687 checkpointed successfully.

Reviewed next sourcecd798d9e removes duplicate custody receipt verification, overlaps fee metadata/custody and runs native Board/FPC readiness discovery together. Root179 aggregate,708 readiness/application and12 new fee-wave checks pass. Actual next-source speedup remains to be measured.

### Deferred by owner: read request synchronization

Live93954017 public server has a persistent localSQLite index, but ordinary public reads call freshRead→index.sync unless an explicit publication revision matches the ready current snapshot. Sync performs network/contract/header RPCs. Matching SSE publication reads can reuse data but wait for active verification. Owner requested diagnosis only on25October: do not fix this request-gating architecture as part of off-chain saved items. Future change should decouple indexed public reads from background indexing, retaining deliberate freshness requirements for transaction preparation.

### Dedicated wallet worker — 25 October

Published `ca625ce5`: Aztec SDK, crypto, verifier, artifacts and deployment preparation run in one dedicated worker at page load. Main-thread SDK is absent; hosted browser checks passed under existing COOP/COEP/CORP and CSP. Warm-page explicit new test account: wallet selection to visible enabled Confirm payment **6.350s**, including **0.011s** automated test-wallet approval. This is not a cold-page result; the2s target remains unmet. Actual Ethereum payment and combined Aztec claim reached usable posting balance; adapter transaction-lookup interruption makes that funding duration unsuitable for performance comparison. First post took **15.237s** click to included visible content and closed composer; confirmation updated automatically. Follow-up changes prewarm initial ETH funding scope and overlap independent quote reads, retaining final send checks.


25 October worker opening follow-up: published2d9f63d0 measured1,728.790ms from wallet selection to the first visible enabled Confirm payment frame, including14.485ms automated personal-sign dwell. This was an explicit fresh account on a warmed page (click26.067s after navigation), not cold startup and not full funded readiness. Funding stages: allocation366.565ms, fee/scope qualification298.305ms, journal3.405ms, custody0.910ms, Ethereum nonce161.865ms, secrets2.410ms, quote599.450ms, encrypted save6.635ms. Remaining~289ms covers sign-in/derivation and UI handoff/rendering; stages use distinct browser/worker time origins. Exact evidence: opening-worker-2d9-warm.json.

The first attempt exposed exhausted Sepolia swap inventory:22.592fee tokens could not satisfy the31.328starter amount. Exact-output QuoterV2 reverted, and the UI incorrectly replaced this with an account-connection error. Replenished the existing pool with600fee tokens through the existing position manager; then exchanged100owned test tokens to replenish the active price range and test wallet. No contract redeployment or configuration change.8b5 preserves quote errors and provides accurate exchange/read messages;246 affected composer/funding checks and5 native-worker lifecycle cases pass.

Real same-owner setup on2d9 succeeded after replenishment: one Ethereum payment9f2265ce…0937 and one combined Aztec claim; visible enabled Write a post after80,734.995ms. Instrumented automation wallet dwell23,861.235ms; remaining56,873.760ms. This is functional evidence, not a matched50% signup improvement.

### Normal opening acceptance correction —33b55824

The1728.790ms result was a warm explicit new-test-account shortcut, not normal onboarding acceptance. Goal remains incomplete. Published261 startup changes exposed a persisted-instance field mismatch;33b fixes it and exercises the actual native ContractStore shape (7/7 checks). Normal remembered funded-account reopen succeeded20.476s from navigation; the account click occurred15.838s after navigation and remaining wait was4.637s. Changed SDK was downloaded; do not present this as matched cold/warm improvement. Real post succeeded17.089s click→included feed rendering; preparing/estimating73ms, proving8038ms, submission465ms, inclusion4278ms, with other preparation/visible completion in the total. Pending source-only normal-opening-gates.patch is peer-approved14/14, not integrated.

Normal unfunded sign-in now measured twice on the actual33b published build (normal /home path, explicit fresh shortcut NOT used during measured runs). Cached SDK; selected disposable unfunded test identity; automatic test-wallet approval, no Ethereum/Aztec payment submitted. Wallet selection→enabled Confirm payment RAF:8953.660/9103.410ms. Approval243.030/237.885ms included. Page load→same endpoint12705.535/13059.225ms; account-button click→endpoint10710.905/10888.645ms. SDK verified cache hits32.795/36.055ms. Critical path: remaining shared startup1530.510/1643.220; private session2228.325/2312.710; sync1967.775/2170.760; capsule8.940/8.315; metadata/balance read1072.790/934.625; remaining quote-to-ready2141.420/2029.965; small handoffs3.900/3.815ms. These are normal sign-in-to-quote measurements, NOT payment-to-ready-to-post or human MetaMask timings. Both fail2secondtarget. First approval-interrupted run was discarded, not mixed into results.


### f20 deployed Bok observation — 26 October

Repeat ETH top-up to visibly usable Bok balance: **37.178030s**, balance 6 USDC. Claim begins 16.827s after Pay; claim preparation 1.882s, submit 12.704s (proof 6.714s; native receipt wait 4.959s), completion 0.540s. Previous 87 observation was 31.069425s; total did not improve in this sample despite less claim work. The first f20 top-up took 58.937450s including 15.627735s test-handler dwell and is functional evidence only. Both actual payments completed. Raw snapshots preserve the complete spans; nested spans must not be added together. No matched 50% completion claim.
