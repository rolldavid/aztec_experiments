# Draft 3 clarifications

## 11 October 2026 — authenticated bot identity is public

Owner clarification: revealing Bok’s identity is allowed because Bok is not a human user. Authenticated bot identity and linked replies should remain publicly recognizable. This does not authorize exposing the human caller’s private account, grouping their usernames, or linking their anonymous activity. Draft3 page 6 requires replacement of the current account-to-request disclosure. The existing `on_invocation(account, post_id)` public callback refers to the invoking human account, not merely Bok’s bot identity. G10 retains the caller-privacy requirement; no change to the original PDF is needed.

## Private preferences and early feasibility

Page 2 excludes private bookmarks/follows/preferences from public persistent social state. Pages 6 and 9 explicitly require encrypted onchain records and key-assisted restoration. G07 therefore implements encrypted chain-backed recovery without publishing plaintext relationships. This resolves the apparent wording tension without dropping either privacy or recovery.

Independent review identified that aggregate funding cannot qualify against legacy public account-linked Bok escrow. G14 now establishes the private payment interface before G04; G08 demonstrates posting and an actual Bok invocation through that interface. G10 then expands persistent workspaces and summarization. Avatar encoding, cost, quality and archival feasibility moves into G03 before profile protocol freeze.
