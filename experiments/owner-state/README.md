# Owner-only delivery: native v6 prototype

This fixture replaces self-delivery encryption and secret selection, not native
note ownership, commitments, nullifiers, partial-note completion or discovery
index bookkeeping. It adds **zero notes, zero discovery nullifiers and zero
metadata/header logs**. Existing squashable full-note logs remain squashable.

An owner/chain/version-separated secret is derived locally from the existing
contract-scoped outgoing viewing key. Native unconstrained sender indexes and
recipient expiry-window discovery use this secret directly, without ECDH or a
handshake. The explicit owner-only oracle searches only the supplied stream;
ordinary native discovery elsewhere retains its existing behavior.

Native note/event/partial plaintext is encrypted using WebCrypto AES-256-GCM,
with a random nonce per attempt and fixed padded envelope length. Encryption is
unconstrained. Its key also binds the existing kernel-checked protocol nullifier
(the transaction's first public nullifier), so copying bytes into another
transaction cannot produce a valid decrypted message. Native validation remains
authoritative after decryption.

## Qualification

Run with the repository's pinned Node, Nargo and native bb:

```
node experiments/owner-state/test.mjs
```

The runner starts only an owned loopback native TXE, uses one test worker and two
native threads, and closes it afterward. No browser, network account or deployed
contract is used. The source-pinned dependency copy is local and ignored; the
user's global Nargo cache is unchanged. The host module `shared/owner-envelope.mjs`
is required from its independently reviewed implementation.

The twelve native cases cover:

- create/replace and spend after clearing native notes, events, facts, sender and
  recipient index stores while retaining the account keys and canonical chain;
- transient-note squashing and exact no-extra-note/log effect counts;
- delayed valid transactions reusing the same native index, processing every
  matching record both warm and after resetting the private store;
- copied ciphertext in a different transaction;
- positive/zero native partial refunds and native optional-balance behavior;
- native private-event commitment validation and fresh-store reconstruction;
- an actual AVM-reverted app call and nonrevertible setup refund surviving it.

Native TXE ordinarily throws before mining an AVM-reverted result. The fixture
has a source-pinned, one-call opt-in that mines the actual native processed revert
effects, asserting the native failure and subsequent state. It does not replace
AVM results. Setup tests start before the native phase boundary instead of TXE's
default all-revertible entrypoint. The compiler's existing unconstrained-call
coverage diagnostics are retained, not suppressed or treated as proof evidence.
These are native functional tests; production real-proof qualification is separate.

## Limits and performance

Native discovery scans this owner's indexed stream, not every transaction in
network history. Fresh restoration therefore scales with this owner's records;
warm discovery retains the native finalized/aged-index expiry window. Numeric
query and tag counts are printed for representative fixture sequences. They are
actual local RPC-method invocations, not WAN latency measurements.

Uncoordinated browsers can choose the same unconstrained index. All records are
recovered, but their equal public tags can link those concurrent transactions.
This is an existing native unconstrained-delivery privacy limitation, not fixed
by changing encryption. No claim of globally unique concurrent tags is made.

The root is still derived from the existing deterministic Ethereum signature.
AES-256 does not eliminate the separate future-ECDSA-key-recovery concern.
Native zero-valued partial completion is still omitted; its pending metadata can
remain in the native partial-note state machine. No custom refund state machine
or historical-data compatibility was introduced.
