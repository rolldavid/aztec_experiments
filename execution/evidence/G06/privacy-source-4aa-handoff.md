# Bounded privacy source handoff — G05-A11 / G06-A07

Read-only engineering analysis by design-20261011. Source baseline: `ca9a8802697fb30d215f125ee4f0858f9ecec83c`, read with `git show` rather than assuming current checkout equivalence. Primary HEAD at inspection was `e3c9ebfe1f6a216baa2d3312833e6a40af12ace6`. Social assertion consumer `4aa078ab8650b9cf8d533c74a8049cf94f88ca89` is a separate source-only candidate; its synthetic tests are not genuine social traces. No build, test, service, network operation or private-key read was performed for this handoff. No assurance or acceptance closure.

## Source argument, with its cryptographic dependencies

1. **Names.** `billboard/rolling_contract/src/main.nr:170,246–283` places UsernameNote in Owned<PrivateSet>, creates constrained private delivery, and enqueues only canonical name components into an only_self uniqueness gate. Named operations pop and reinsert the authenticated ownership note. There is no owner-address argument in _register_name. `profiles.nr:16–29` recomputes the constrained metadata hash. Public registered-name existence and name/content links are intentional; private ownership and the rest of a person's names are not public fields. Separate registration transactions avoid explicit batching links, but their timing is still observable. Kernel rollback of a losing concurrent registration needs its separate actual race acceptance; a passing sequential registration does not prove it.

2. **Private recovery and selected identity.** `main.nr:301–308` exposes owned_name_records as a utility over private note storage. A `pub` utility return annotation is not a public-chain log. `shared/rolling/application.mjs:227–242` calls it with the owner through the private wallet, validates eight records, zero padding/schema/display names, and recomputes IDs. It does not resolve each owned name through the public index. `application.mjs:218–219` uses the same wallet for profile_state. These operations necessarily reveal private query patterns to the explicitly trusted query operator; they are not safe to send to an arbitrary synchronized RPC.

3. **Anonymous admission.** `main.nr:545–569` binds a real portal message, depositor, amount, private sender and nonzero secret into a private deposit chain. `main.nr:600–602,703–723` obtains the authenticated app NHK and builds a per-post link from the new note hash including note randomness. `admission.nr:46–51` uses separate Poseidon domains for post ID and admission link. `application.mjs:248` chooses fresh random nonce/intent fields. `main.nr:861–867` privately consumes eligibility and, for a nonzero name, ownership; _publish receives nonce/draft/plugin/request, not owner/deposit-chain. The public record at `main.nr:919–935` contains selected name (zero for Anonymous), thread/reference/content metadata and timestamp. This is a source construction consistent with hiding the owner, conditional on the pinned note/nullifier/kernel/hash security assumptions. It is not a proof that all private delivery tags, public protocol fields, initializer nullifiers or timing are unlinkable. Nonce freshness and per-note randomness must remain verified, never replaced by a stable anonymous author ID.

4. **Reactions.** `main.nr:1095–1100` requests the authenticated owner's app-siloed NHK and forwards only post/tag/active. `posting.nr:61–64` hashes `[1,chain,version,board,post,nhk]` under `0x52434c31`. No selected name participates, so aliases cannot create extra active likes for the same account/post. `_set_like` (`main.nr:1105–1121`) exposes a stable tag only on that post; like/unlike/re-like linkage there is intentional. Different tags across posts/accounts are necessary empirical checks, not proof of pseudorandomness or resistance to derived-identifier analysis. Like counts are not Sybil resistance.

5. **Profile/Bok public facts.** Public profiles are keyed by selected names, not owners (`profiles.nr:44–55`). Reused text, avatars/digests or publishing schedules may correlate names voluntarily. Bok/plugin/operator identity is permitted public by the owner; that permission does not extend to the invoking human, hidden name set, signing credentials or developer privileges. This handoff does not establish private Bok invocation or workspace isolation acceptance.

## Routing argument and authority boundary

- `apps/rolling/wallet-session.mjs:34–64` constructs the branded trusted node, verifies deployment, builds PXE and encrypted journal with that node, and gives the same node to both wallet-facing and raw submission paths. `application.mjs:132` checks actual wallet/PXE provenance. `shared/private-pxe.mjs:22–25,89–117` remembers the construction node plus SDK cache object; local/remote proving changes transport, not the private query node. `apps/src/billboard/user/engine.js:146–153,255–270` checks the captured raw submission route as well as public wallet properties. These WeakMaps protect a correctly loaded application against accidental routing substitution; they cannot protect against malicious replacement of the entire delivered app bundle.
- `shared/trusted-private-node.mjs:55–79` validates chain/version/rollup/proof policy, coherent canonical tips/world state, timestamp freshness and canonical recheck. `:103–134` uses silent official schema transport, no redirects/retries/fallback, omitted credentials/referrer and bounded response handling. Network identity/freshness does not prove the operator's identity or infrastructure ownership.
- `prover/private-query.mjs:16–24` restricts upstream to fixed loopback; `:47–59` forwards its own content-type header only, and `:88–105` validates the whole schema batch and readiness before dispatch. A local proxy can still front an externally owned source; loopback alone is not deployment proof.
- `apps/rolling/reader-client.mjs:3–11` permits explicit GET feed/directory/thread/profile/post interest. `shared/rolling/public-index.mjs:74–84,138–158` scans complete bounded canonical block bodies, decodes authenticated events, and constructs public identity dictionaries only for selected public posts. Reader cache queries are not private owned-name discovery. Public profile interest, IP and timing remain visible; automatic private ownership/subscription enumeration must not be routed here.

## What actual capture can and cannot establish

`rolling-wire-trace.mjs:29–37,60–68,87–101,128–182,189–207` captures explicit serialized fetch request components using bounded traversal, exact role matches and ephemeral salted relation aggregates. It inspects envelope IDs/keys/explicit headers and supported parameters; proof/binary Tx/calldata/blob fields remain explicitly opaque. No raw bodies, field digests, salts or error contents belong in public evidence. Preserve original fetch this/arguments/Promise/result/error, one request, and no response-stream consumption.

`rolling-wire-campaign.mjs:8–38,41–54` installs before factories and compares real same-process HTTP ingress counts with outgoing labelled requests. Both private role positive controls are mandatory. Unknown/unsupported/truncated/observer errors/pending requests fail the scoped gate. The campaign uses a bounded30,000-request cap. Its scoped `passed` is not `requestCoverageComplete`: any opaque field keeps complete coverage false. Repetition aggregates include protocol constants and public data; phases identify action intervals, not authenticated request ownership when both accounts are queried within one interval.

Explicit exclusions: runtime-added headers/cookies, response bodies, native/undici transports, other processes, proof witnesses, opaque SDK Tx bytes/calldata/EIP4844 blobs, unregistered earlier funding/setup requests, and arbitrary network/IP/timing analysis. Receiver counts cover same-process loopback adapters, not Anvil/native traffic. Current trusted and ordinary adapters share a disposable underlying node; source labels distinguish interfaces, not independent deployed operators.

`rolling-application-fixture.mjs:19,332–339` enforces exact known-address absence in its eight PERSONAL public categories and shared FPC. `scripts/t03-public-footprint.mjs:26–55` additionally projects note commitments, nullifiers, L2-to-L1 hashes and encrypted delivery fields. Its own limit statement disclaims derived-linkage detection. `:60–75` can compare nonzero note/nullifier/delivery-tag equality without retaining those identifiers. A social campaign should bind these comparisons to actual canonical TxEffect SHA/hash/block, retain intentional same-post reaction linkage, and review account initialization/contract-class/public calldata separately. SDK-decoded public effects complement opaque transport classification; they do not decode or certify every omitted proof/blob byte. Absence of raw-address equality or repeated scalar values is not cryptographic anonymity assurance.

## Historical failures remain failures

- `wire-60df-diagnosis-review.json`: actual399288ms; unknown193, unsupported35, truncated4341 above10,000 cap; HTTP raw projection revision mismatch. Four names and fresh-PXE subresults do not rescue final capture. Installed-source reproductions did not identify each missing historical body.
- `wire-4a1f-diagnosis-review.json`: actual403398ms,14506 requests, unknown20/unsupported4, no truncation; source-backed blob-base-fee/blob estimate hypotheses only. Retained complete-looking profile/recovery subresults are not full privacy acceptance.
- `wire-f54e-diagnosis-review.json`: ca9 actual403419ms,14513 requests, unknown12/unsupported0/truncated0; unknown public-L1 rows remain unattributed. Installed eth_simulateV1 reproduction is a candidate explanation, not retrospective proof.
- `wire-e3c9-review.json` approves changed source and104 cheap tests for one instrumented campaign. It is not that campaign's outcome. At inspection the primary G05 directory contained three actual owned-names-wire outer reports, all failed; no fourth actual wire result was available to certify.

The fourth **remote node** attempt is separately concrete: `G02/rolling-node-04-readonly-221236.json` binds the manifest/bootstrap and final receipt;314 readiness attempts UNAVAILABLE, node/container exit1, OOM false, legacy-query-only qualification failed, prover masked. This demonstrates unavailable deployment qualification, not a known startup cause or a working trusted node. No new cloud action is authorized by this report.

## Required next evidence and release gate

1. Independently accept the repaired actual two-human/two-name capture with real receiver reconciliation, both exact private ownership sets and genuinely fresh PXE recovery; keep existing-secret fixture recovery distinct from seed/device/process restoration.
2. Run real social-wire and reaction-wire campaigns under540s/4GiB with canonical effects, both private fee debits, exact992-byte content and source-bound routing. Consumer4aa has two names total; it must not be relabelled as the separate two-names-each scenario. Explain compositional coverage across bounded campaigns and preserve any requirement that needs the same identities across actions.
3. Exercise trusted endpoint denial/staleness during personalized work: zero ordinary-node/cache fallback, no automatic resend/new proof/payment, retained recovery intent and genuine actor cleanup. Verify actual production browser account switch/composer separately from injected UI doubles.
4. Complete atomic concurrent normalized collision, same-post duplicate/unlike, alias-independent limit and canonical loser rollback as their own reviewed actual evidence; do not infer them from private-key secrecy or sequential success.
5. Resolve deployed topology: same explicitly authorized prover operator controls query/fullnode/archive/logs and upstream credentials; real pinned Linux node reaches canonical readiness; trace client→service→local node; inventory remaining L1/blob sources and restrict personal query forwarding. Failed remote bootstrap and a correct endpoint URL cannot satisfy this gate.
6. Preserve independent specialist privacy review, production network clearance, elapsed qualification and G13 release gates. No local equality test, agent source review or successful proof substitutes for these.

## Reproduction and binding

Read-only commands: `git show ca9a880:<path>` with numbered source lines; JSON inspection of the named review/outer reports; SHA256 and Git blob IDs below. No test rerun. The following content hashes bind exact source reviewed here, not the subsequently changed primary checkout.

| ca9 path | Git blob | SHA256 |
|---|---|---|
| `billboard/rolling_contract/src/main.nr` | `322abc63774d31ab4e81f4ba41b744e0044c59ef` | `32ebdead7ef12c68c16e2d3dcf871ce521d1ddb33c5ae7955756ecd6d0817660` |
| `billboard/rolling_contract/src/profiles.nr` | `61e9e26c2da494363cca719ae82faabdee2d8c74` | `b12124ca50d181f9798c24e3373f9ba358697fdb433cc7d696c3a69ac9d53efd` |
| `billboard/rolling_contract/src/admission.nr` | `c235604f9a259c037683c4908052f2c38c9a7a6a` | `83868ff1dd7b5f7841fdff2f1252d76d96c68db9554d9bb93e65b6a6a7011b38` |
| `billboard/rolling_contract/src/posting.nr` | `198718dc0c7643b063fa72e65a0c16e9cb377d3d` | `1bac8187638522892d6389a6d4b34185c4bd46297dddcba6102b2a3b81098bda` |
| `shared/rolling/PRIVACY_DESIGN.md` | `63f1c609fa37bc50f999ae136b62145d0cae4511` | `01aba893d4de055abb3cc0de9ec76fead366e497d78fece722a5ebc4d700d389` |
| `shared/rolling/application.mjs` | `e6112f17df6c8e033f5cf24b3535d81f5b8df24a` | `071e2bbe9c6226b2d10c15425cabcacb8ccca445cea9396b617a8d9c613151d6` |
| `apps/rolling/wallet-session.mjs` | `33126ab5bb70cee1035a4b2a80f748ccaada6d71` | `d3cbd87202efafc6b44a2512e3404feb8c92494f8c713d5e7efcca8f5e69eecd` |
| `apps/src/billboard/user/engine.js` | `632472a2af83f056c7fc4a59f7353d56c791cf4f` | `75545948bc065a123bcbc745d516b2eaf2310f61246418a019ba361fd93d00f2` |
| `shared/private-pxe.mjs` | `d623f71ed82e0cdea27a17ad8ffd1d21b7c47e1f` | `2526df63f7e29d2a5854a96666c62f3e695e85a8944078d6d447d3de9a04d59c` |
| `shared/trusted-private-node.mjs` | `fd5358e8226fd5a1070e2784b598ddb42daaae04` | `98ebbc01e11fd2b760bee045c77971bcd0432cfbbe18181cf3ba08efe47cb30e` |
| `prover/private-query.mjs` | `e021198637d930d8d8d539a07661550e0b76fb2c` | `d3f1822905228dc0d10f14c6289ff628bceeba7cb22463b97bb72e64a3ab4895` |
| `shared/rolling/public-index.mjs` | `17e4e98dbd27c0ff4cf7de7f156b03f6dfef520e` | `d3bbd418f9f8aca9bc93021ecd04b7da3e92983c3e7f1b0a086cd0bcb6ca5d4f` |
| `apps/rolling/reader-client.mjs` | `795dac9030828e46197ba61bb7e266fd1584a206` | `8ac27c50b3cc413c74db48b9230c1c702ce6f6670a81a48d61b7f0cf21be2525` |
| `scripts/testing/rolling-application-fixture.mjs` | `27fc8d543bd884e83af06bad7eb2cbedc77b2495` | `b8455806a00220b663d28e6235b85b2c36d054a4c3cbbc89d3d1c19303fc5bfb` |
| `scripts/testing/rolling-wire-trace.mjs` | `1c5fdca540f074eb7e83ce848248b9640b99ea32` | `376b143b37f85f6cf6ac0b0f6af79d1a91de55615518e535baf16282f61d10a9` |
| `scripts/testing/rolling-wire-campaign.mjs` | `718ffa7076891db003f547e8bb78abb8a6b28c73` | `e508c4b86fef720ed9615183a6aed8ab54c15ebe1bce8afa07c77f3b1f667971` |
| `scripts/t03-public-footprint.mjs` | `43c20c73387060e30844c4b2443f11f4a5395fe9` | `5c284ad31f1db26e6c896c9fc0252b7b86c035cc012e502080c6c14c577a7f4e` |
| `noir-dependencies.json` | `7f0ef41636d6cac12510bba38b3fef95454368e0` | `7d7d9db800156399d12ea966b10d0f8699165c0ac17e08a4de540a668ca09c7e` |
| `package-lock.json` | `15c7c13af80d91c32e2309a8834ff4a34c7d9147` | `d8c43be2eea22e1a19c184206bf3ee16b7d2ed0503c0dfc4489f57f4dbee832a` |

Review/evidence documents inspected at current primary checkout (content hashes):

- `execution/evidence/G05/privacy-gaps-55e0772-review.json`: `a2e4f54dc74a80a2c767162341f8f10d1c601b5692f1ec2ffe9892069b76908b`
- `execution/evidence/G06/component-gaps-17e-review.json`: `e5b215ba7f09c4cca4e01158a5891d45c2d0fdb93a4acce5b495fa5bf6088588`
- `execution/evidence/G05/wire-60df-diagnosis-review.json`: `19fe318e605df03025b16c5c0ca778183ab65b064dd0eae12e2b8a8df9352048`
- `execution/evidence/G05/wire-4a1f-diagnosis-review.json`: `afd1888f68f9b9ed2228695c7739e6d8ef0260f3bcfb095df4e3821f3125871f`
- `execution/evidence/G05/wire-f54e-diagnosis-review.json`: `41a7732a31d74e47c39229e4a399275d24c88859ce030acb57cf0bbae9ab239e`
- `execution/evidence/G05/wire-ca9a880-review.json`: `9a2b7f97ea40198519c6ecbbb0b0b422e84a7c33a65ec94ce1420bad3fab7b7b`
- `execution/evidence/G05/wire-e3c9-review.json`: `e8e0f148e626f5864dca64228078cedd9ca3b0b8dc01e4da304a61b4fbd3c8e3`
- `execution/evidence/G02/rolling-node-04-readonly-221236.json`: `9ec68c534a07477c6febf826c644192664d241137ecf1ee377b1f24dc68250a8`
