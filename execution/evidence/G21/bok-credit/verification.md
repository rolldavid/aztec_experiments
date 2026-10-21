# Bok credit purchase and dialog

New ETH purchases use a narrow immutable BokCreditRouter: ETH is exchanged for exact USDC, deposited through the existing PluginPortal, and unused ETH is refunded in one Ethereum transaction. No board contract/address/state changed. No operator or trusted intermediary was introduced. Existing USDC funding remains supported.

The dialog quotes automatically, keeps the amount editable while quoting, discards stale quotes, displays balance and payment total, and uses one Pay action. Only a genuinely pending payment offers Continue. Posting balances and upper limits use compact numbers, with conservative rounding and exact amounts preserved for authorization. Rule history moved behind collapsed details; unrelated errors preserve loaded preferences.

Removed the Ethereum journal read deadline. Wallet approval and transaction completion remain state-driven. Fixed known-unsent errors being classified as uncertain submissions; network, identity and fee preparation happen before the wallet-send boundary. Automatic topups use the current wallet-confirmed gas fee; explicitly supplied fee ceilings remain enforced. Original user's precise provider error was erased by old wrappers and cannot be reconstructed from its displayed message.

Validation: 427 combined focused funding/journal/receipt checks passed; final219 journal tests include held approval across one hour of virtual time and unsent preflight cleanup. Solidity12/12 passed. Actual local EVM payment through the production Ethereum journal, real PluginPortal and native Aztec Inbox passed with one send, exact credit, refund and no retained balance/approval. UI/config40/40, scoped application/session4/4, publisher8/8 passed. Independent review approved contract, client, receipts, preflight boundary, UI concurrency and release-local configuration publication.

Sepolia router deployment was canonical and immutable bindings checked. Live public quote+gas estimation passed without sending a payment; see deployment.json and live-preflight.json. No new MetaMask browser journey or live Aztec credit-claim proof was performed for this batch. Reader syntax/diff checks pass; full reader browser suite has an unrelated stale wallet fixture and was not claimed passing.

Remaining UX audit findings: likes/bookmarks/follows and profile edits still have review/confirm duplication; separate Like/Unlike controls need authenticated current-user state before becoming a toggle; saved-items and withdrawal views can further reduce redundant controls. These were identified in the wider review and are separate from the shipped posting/Bok changes.

Integrated boundary checks:53/53 passed, including actual local EVM transaction. Runtime build caught the new quote helper importing ethers into the lightweight UI bundle; moved the quote entry point behind the existing SDK boundary rather than relaxing the bundle gate. Currency-switch continuation regression passes with all105 aggregate wallet tests.

Final pinned SDK and lightweight runtime builds passed; runtime has no bundled node_modules. Narrow Bok router build preserves existing portal, funding router and all Noir artifacts. Publisher uses an immutable release-local wallet configuration; existing running configuration and services stay untouched.

After publication, the existing in-app browser tab was refreshed; Home rendered both current posts and the main-page Post as selector. No browser was launched or killed, and no account/payment operation was triggered.
