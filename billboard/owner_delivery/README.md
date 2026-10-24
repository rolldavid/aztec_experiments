# Owner-only private delivery

Board and fee-credit writes are self-owned. This library replaces only their delivery with unconstrained AES-256-GCM and a contract/owner/network-scoped secret derived from the native outgoing application key. It uses the native unconstrained sender index and recipient expiry-window discovery. It never searches ECDH handshake secrets, adds a storage variable, creates a discovery note, or emits a discovery nullifier/header.

The native note hashes, nullifiers, note-log squashing, private event encoding, and partial-refund validation remain authoritative. Decryption is bound to the transaction's kernel-checked first nullifier, so copying an authenticated ciphertext into another transaction does not recreate a note. The cipher oracle is local; it never publishes keys or plaintext. A new browser with the same account keys discovers native records from chain logs and validates them normally.

| Operation | Existing notes retained | Private logs |
| --- | --- | --- |
| Deposit claim | 1 deposit | 1 |
| Name registration/authentication | 1 ownership | 1 |
| Preference update | 1 replacement preference head | 2 (head and existing event) |
| Anonymous post | 1 post + 1 replacement deposit | 2 |
| Named post | Above + 1 replacement ownership | 3 |
| Fee mint | 1 balance if amount is nonzero | 1 if nonzero |
| Fee reservation | 1 change balance if nonzero | Change plus existing partial-refund message |
| Public fee teardown | Existing refund note if refund is nonzero | No additional private log |

A named post plus fee reservation still creates four private notes when change is nonzero. The existing public teardown can complete a fifth, the fee-refund note. There are no delivery-only notes.

Native unconstrained index allocation permits two independently operating browsers to reuse an index. Discovery processes all matching valid records, including later arrivals, but those concurrent records can have the same public lookup tag. This library does not claim to eliminate that native concurrency linkage. Its AES key also inherits the application's current account-root derivation; it does not make signature-derived account roots quantum-resistant.

Run `node experiments/owner-state/test-production.mjs` with the pinned Node/Nargo toolchain to compile and process the actual Board/FPC and execute the atomic named-post/fee-refund/empty-private-store case. The fixture uses native TXE with proofs disabled, not a blockchain deployment or real-proof qualification. `node experiments/owner-state/test.mjs` runs the 12 smaller native delivery/negative cases.
