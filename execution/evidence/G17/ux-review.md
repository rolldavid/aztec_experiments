# Everyday UX review

The product is an anonymous social message board. The reader should see conversations first; actions should carry the context the user selected. The present universal transaction form exposes implementation concepts at nearly every step.

Changes selected:
- Put writing above the feed on desktop and mobile; keep board creation in Explore and identity management in account settings.
- Replace generic Action menu and editable contextual identifiers with focused reply/post/like/bookmark screens. Keep the exact target in the action model.
- Display a human preview and named confirmation action; format posting-balance fees instead of displaying integer fee-juice units. Preserve explicit spending approval.
- Move policy provenance, chain checkpoints and technical data into disclosures while retaining moderation explanations and current rules.
- Load signed-in saved items without asking users to start a separate recovery task; make empty and error states specific and useful.
- Explain names as optional public pseudonyms, use readable balance/withdrawal labels and dates, and simplify content-limit guidance.

Visual plan: retain the established navy #182335 navigation, slate #233147 header, pale #f4f6f9 background, white reading surface and violet #6654be primary actions. Retain Avenir/system typography; message content is the visual focus. Left-aligned reading column, primary compose control at its head, quiet supporting sidebar. This is interaction simplification, not a new landing-page aesthetic.

Independent read-only audits: /root/ux_review (reader and composer), /root/funding_investigation (account and balances). CUA live browser unavailable because local browser use is disabled; use the application's existing headless browser verification and screenshots.
