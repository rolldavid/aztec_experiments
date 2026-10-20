# Account and funding UX — 20 October 2026

Owner request: remove jargon, separate funding into its own dialog, offer wallet icons, calculate required deposit/fees/gas/slippage, explain deposit and included Bok succinctly. G16 is the active application lane. Prior acceptance is historical after these edits.

Design: retain the message board’s Avenir typography and slate navigation. Use white #ffffff, paper #f4f6f9, ink #26364b, muted #596779, violet #6654be, line #dbe1e9. Left aligned, compact dialog, one primary action per step. Account creation → wallet choice → payment review → posting. Secondary recovery lives behind “Sign in” or account settings. Funding occupies a dedicated view with no account tools around it. Keep honest privacy information in a concise expandable explanation. No branding overhaul or decorative cards: the board and conversations remain the focus.

Review against brief: simplifying labels alone would leave the intimidating form intact. Remove allocation/gas/slippage inputs and derive them at the trusted funding boundary. Keep the payment total and actual refund conditions visible.

Runtime verification reproduced an existing account-setup blocker: Fetch returns decoded gzip bytes but preserves the compressed Content-Length. The CRS reader compared that header to decoded size. Scope includes shared/crs-client.js and its existing tests to validate decoded bytes, keeping exact stream-length and hash checks.
