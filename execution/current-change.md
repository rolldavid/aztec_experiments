# Everyday social UX — 20 October 2026

G17 reviews the full reader/account/composer journey against the owner's feedback: remove unexplained implementation concepts, unnecessary clicks and misleading states. The three runtime files changed are reader.mjs, wallet-panel.mjs and style.css. Contract, wallet-runtime, proof, bridge, feed selection and backend behavior are unchanged.

Implemented: mobile-visible compose entry, contextual action forms without editable IDs, automatic cost review for reactions/private settings, explicit named confirmation, human message/identity previews and readable posting credit amounts, optional Bok invitation retaining reply context, automatic saved-item and balance loading, readable withdrawal dates, useful empty/error states, details for policy/chain metadata, plain backup/profile/name copy. Exact saved action and maximum fees remain authoritative.

Independent review found and resolved saved-loading serialization, stale action on Write a post, moderator discovery, missing preference context, restored draft editing and original-post navigation. Focused browser checks exercise those cases. App-only publication follows the reviewed source-cutover procedure; live results are recorded in evidence/G17.
