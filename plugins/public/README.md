# Public testnet qualification

## Current V6 browser qualification

Use `scripts/run-hosted-onboarding.mjs` for a fresh disposable MetaMask account
and the published V6 board. It completes fee funding, board deposit, private
claim and a real remotely proved post. Its encrypted backup and transaction
journals remain in the ignored `.build/hosted-RUN/private` directory.

After a successful onboarding report, use the same account with:

```sh
node scripts/run-hosted-followup.mjs --run=RUN --phase=PHASE \
  --site-config=SITE_CONFIG --service-config=SERVICE_CONFIG \
  --max-fee-gwei=0.05 --priority-fee-gwei=0.01
```

Run `plugin-deposit`, `plugin-claim-post`, `plugin-reply-withdraw`, and
`plugin-redeem` in order. These use one free test USDC, the normal MetaMask
confirmation interface, a plain text Bok reply, exact metered credit accounting,
and real network settlement. GitHub writes and automatic paid credit purchases
are disabled for this qualification. The fee arguments are explicit test choices;
the runner checks live base-fee headroom, affordability and mined fee fields.

Use `withdrawal-plan`, `withdraw`, and `refund` to verify board collateral
recovery after the deployed moderation period. Each phase has one supervisor,
a nine-minute total limit and a 4 GiB process-tree limit. An `awaiting` result
records unmet network eligibility; wait outside the run and resume that phase.
Do not repeat a completed phase or clear a failed phase marker without inspecting
its transaction journal and preserving the failure. A successful phase requires
both its canonical transaction assertions and its clean supervisor report.

## Retired V5 fixture workflow

The old `prepare.mjs`, `qualify.mjs`, `worker.mjs` and `browser.mjs` runners were
removed with password-protected account-file sign-in. Their historical evidence
remains in version control; they are not supported wallet-sign-in acceptance paths.
