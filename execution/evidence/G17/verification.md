# G17 verification

Pinned Node24.21.0 and Chromium155. Focused browser checks cover contextual reply targets/drafts, reactions and private preferences, read positions, explicit fee consent, no unrelated private reads for simple actions, Bok reply toggles, saved-items loading and busy serialization, balances and withdrawal dates, no retry after failed preparation, restored drafts, moderator reachability, mobile compose visibility, metadata disclosures and visible module-load errors. Desktop1440 and mobile390 screenshots were inspected.

One first integration test stopped at a stale fixture heading (“Your saved conversations”), before exercising the new behavior. The fixture now waits for the actual Bookmarks heading; the signed-in saved-feed test passes. No application timeout was added or extended. Legacy full-suite replay and new financial transactions are not claimed for this presentation-only change.

Source publication contains only apps/rolling/reader.mjs, apps/rolling/wallet-panel.mjs and apps/rolling/style.css. Existing SDK/wallet manifests are validated and retained; no build, contract or backend deployment is needed.
