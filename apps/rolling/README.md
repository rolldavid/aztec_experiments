# Rolling Chat clickable prototype

A Draft 3 design-stage deliverable, intentionally disconnected from wallets and
production services. It is not the delivered chain application. All fixtures and
local actions are labelled in the interface; refresh resets local changes.

## Run

From a fresh repository checkout with Node installed (repository target Node 24):

```sh
node apps/rolling/serve.mjs
```

Open http://127.0.0.1:4317. To isolate another instance:

```sh
ROLLING_PREVIEW_PORT=4318 node apps/rolling/serve.mjs
```

No install, build, external fonts, third-party images or backend credentials are
needed. Stop the process with Ctrl-C. The server binds to loopback, serves only its
five public assets, and blocks browser connections with a content security policy.
No mutable files or data need cleanup.

## Verification

```sh
node --check apps/rolling/app.mjs
node --test apps/rolling/model.test.mjs
```

Browser acceptance procedure for the lead/reviewer:

1. At desktop width, browse Home without connecting a wallet. Scroll to append more
   fixture posts, open a thread, follow its individual reply links, then use Back.
   Check the previous feed position and previously loaded content are retained.
2. Search all subboards for `building`; open the result. Inspect effective rules.
   Search `no-rules`, inspect the rejection and open balances from its tombstone.
3. Like/unlike, repost, save a post, and inspect Bookmarks. Quote and reply to a
   particular post; inspect the local-only preview and its canonical reference.
4. Compose 248 `🙂` characters (992 UTF-8 bytes), then add one more. Submission must
   disable and text must remain intact. Preview `[bad](javascript:alert(1))` and
   `<script>alert(1)</script>`; neither becomes executable content.
5. Visit every sidebar link and each profile. Public profiles show one identity
   only; the private Names/composer previews list example owned names.
6. Open onboarding, review ETH/USDC choices and three steps. Completion must say
   no account was funded. Inspect withdrawal and recovery previews; no sensitive
   input or real connection should be requested.
7. Use Tab/Shift-Tab and Escape in a modal. Focus stays inside until dismissal and
   returns to its opener. At 390px, open/close the navigation menu by keyboard.
8. Exercise loading, empty, pending and failure options in Design review. Retry
   restores the fixture feed. Open Quiet map thread to inspect a removed parent.
9. Inspect at desktop and 390px, including focus rings, line lengths, action
   wrapping and contrast. Record screenshots and source revision separately.

The independent browser review is not claimed by the six pure model checks.
Production acceptance still needs real wallet/proof/social-chain integration,
private-state recovery, trace analysis, measured performance and specialist review.

## Integration boundaries

`fixtures.mjs`: disposable public fixture data. `model.mjs`: pure allowance,
ranking, directory search and safe-link helpers. `app.mjs`: DOM-based rendering,
hash navigation and local state. `style.css`: tokens and responsive UI.

All user content is inserted through text nodes. Rich text supports safe http(s)
links; arbitrary HTML remains text. No author edit/hide controls exist. Authenticated
bot appearance is fixture-labelled; the preview does not assert cryptographic
verification. Future adapters must provide real authenticated state and explicit
pending/failure statuses; they must not convert fixture success into real success.
