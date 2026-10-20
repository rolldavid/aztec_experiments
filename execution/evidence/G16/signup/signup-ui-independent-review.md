# Independent signup UI review

Disposition: approved for integration of the reviewed UI and harness changes. No remaining blocking finding identified in this scope. This is a source review and focused evidence assessment, not a new production-readiness or real-proof assurance claim.

Reviewed the shortened signup flow, automatic quote preparation and asset changes, explicit payment consent, busy-state fencing, displayed funding progress, error cleanup, first-post harness path, and retained interruption exports. The final `work.catch` clears stale operation notices before displaying an error; it does not erase financial journals or authorize another payment. Removing the duplicate quote placeholder leaves the live status region responsible for quote progress.

The test updates follow actual UI transitions: account initialization is automatic, account creation still requires password submission, and failed quotes require explicit refresh. The removed pause-button test now checks the actual busy flow: close is disabled, Escape cannot dismiss it, no second payment action exists, and the held operation produces exactly one payment and one claim. Payment failure still must clear its approval prompt. No hidden retry, extra transaction submission, synthetic transaction completion, or alternative success path was introduced by these harness edits.

The T04 first-post check is scoped to `main article.post`, avoiding a hidden composer draft as success evidence. It still requires the exact submitted message to appear in the public feed. Interruption scenarios export prepared encrypted custody through the existing account API before signing, using an exclusive file create with mode 0600; normal signup retains its minimal UI path.

Observed evidence: `/tmp/signup-ui-fixed.log` completed with 9 tests passed, 0 failed. `execution/evidence/T04/signup-post-20261020-5.json` reports native-development execution with real MetaMask, one Ethereum payment, two L2 submissions (claim and post), canonical bridge effects, and the first post visible on Home. Proof requests were zero, as intended for native development. This reviewer read the evidence and source; no tests or services were run by this reviewer. The E2E source hashes match the current T04 driver, browser harness, and Ethereum journal. Its panel hash predates the final UI cleanup; the final panel hash below is covered by the nine affected passing UI tests. Earlier failures remain meaningful historical failures and were not converted into successes by this review.

Native Ethereum replacement handling was independently reviewed by the funding reviewer; its final focused checks belong to the root integration evidence. Backend timeout changes are outside this final UI disposition.

## Exact reviewed file hashes

| File | SHA-256 |
| --- | --- |
| `apps/rolling/wallet-panel.mjs` | `f97dd20f64ced3954110ba7c52f9def28ed60a5632ad819346eb48dc5a00e6c1` |
| `apps/rolling/wallet-panel.browser.test.mjs` | `50b9de0b00812c3c52de4b3c62ec3b7446898f5380c624483598fcaa605d8c78` |
| `apps/rolling/wallet-session.mjs` | `e8341fd4c5b80e257de6151f43cbbfb2778e65c568d4db1e777706bfcce3902c` |
| `shared/transaction-outcomes.mjs` | `2962463ce55078b6e58b8b76f905b802af7e2db398a4a6f18e4a7311bc9871cd` |
| `shared/aztec-lib.js` | `8e335110ad7c80c77d62731da8adb2d307679de673ee4cdb91ba0956c9e04d7e` |
| `shared/ethereum-journal.mjs` | `df19db475e6875d6d645facf56c2667550a54cf340b177fa6bf0a5d16eb323dd` |
| `shared/rolling/aggregate-wallet.mjs` | `7e4e1f6fc7a3b3b8bd7ef5b04307749c3f5a09c723d2ae0c5f8f7299870322c0` |
| `scripts/t04-metamask.mjs` | `7dc2f1ea5fb930ba74eb4bedd96301aca75e6f716fee4f05d3071efdcde85053` |
| `scripts/test-wallet-extension-browser.mjs` | `65abbc14baac96f00ed97a7aadd238f428712a05c40652e85c5c25fde712e295` |
| `execution/evidence/T04/signup-post-20261020-5.json` | `3454075b3e77d554ff455c88e887df12c105bfdf2a53008a7766a3edcbead146` |
