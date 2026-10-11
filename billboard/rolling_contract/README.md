# RollingBoard protocol foundation

G05 implementation candidate for Draft 3 names, subboards and policy authority.
This package is a **new, undeployed contract**, pinned to Aztec 6.0.0-rc.1. It does
not replace the existing funded board, and it does not yet meet all G05, G08 or
G13 acceptance criteria. The assigned changes outside this package are its entry in the parent Nargo
workspace and the corresponding local-manifest/embedded-source dependency inventory.

## Names and private ownership

`register_name(first[32], first_length, last[32], last_length)` is private. Inputs
are the normalized display arguments produced by `shared/rolling/name-policy.mjs`:
ASCII letters, spaces, apostrophes and hyphens, each component 1–32 bytes, with
letter boundaries, no repeated spaces, zero padding. The wallet trims/collapses
spaces; the circuit rejects noncanonical input and derives lowercase canonical
bytes itself. Reserved first name `bok` is rejected in every display case.

The six-field canonical hash preimage exactly matches the JavaScript policy:
`[first_length, first_packed_31, first_tail_padded_31, last_length,
last_packed_31, last_tail_padded_31]`, Poseidon2 domain `0x52434e31`. Length framing
separates component boundaries. The public `_register_name` gate is `only_self`
and atomically rejects duplicate IDs. Private mint and public registration share
one transaction; a rejected registration cannot leave a usable ownership note.

A two-field `UsernameNote {name_id, schema}` is inserted into a fixed-slot
`Owned<PrivateSet<UsernameNote>>` belonging to the authenticated private caller.
Constrained encrypted onchain delivery is required. `_assert_name_owner(id)`
selects the exact note, pops it with authenticated ownership/nullification and
recreates it for the same caller. Future posts and profile updates must invoke
this in-contract helper. `authenticate_name(id)` currently exercises only this
ownership path; it is neither a post nor a bypass of posting admission.

`owned_names(owner, page_offset)` is a wallet-local, eight-item utility page. Zero
entries mark unused results. Its owner argument and results must never go to the
public index/cache API. Names cannot be retired or transferred. Public state
contains registration flags and display logs, never an owner address or a list
of other names belonging to an account. Global uniqueness is within one curated
RollingBoard deployment, not across independent operators' deployments.

**Limits:** callers must use the existing private fee path; this package alone
does not enforce fee-payer privacy. Separate registrations must not be batched in
one public transaction. Encrypted note delivery does not prove node-query privacy.
Real competing transactions, reverted-mint behavior, key-assisted account restore,
public-effect inspection and RPC trace analysis still require G08/G13 execution.

## Subboards and effective policy

`init(main_rules[32], length)` records the public moderator and main policy v1.
The moderator can publish a new main policy through `set_main_policy`; each update
increments its version and emits the complete policy bytes and digest.

`create_subboard(slug[40], slug_length, name[3], name_length, description[16],
description_length, rules[32], rules_length)` is private and checks an authenticated
nonzero caller. It has no posting-collateral condition. Normal transaction fees
still apply. Only metadata crosses the `only_self` public creation gate; creator
identity is not stored or emitted. Slugs use 3–40 lowercase ASCII letters, digits
and hyphens, with alphanumeric boundaries and no repeated hyphens. This is a
reversible first-release encoding choice, to be reflected in the index/client.
The slug hash uses `[length, packed_31, padded_tail]`, domain `0x52435331`.

Creation records a unique immutable slug, complete display name/description/local
rules in authenticated logs, metadata and local-rule digests, and the main-policy
version at creation. No nested-board, rename, archive, transfer, local-policy-edit
or homepage-promotion operation is exposed. Local rules remain v1 in this slice.

`effective_policy(id)` returns `(current_main_version, current_main_digest,
local_version=1, local_digest, rejected)`. The parent reference is read dynamically,
so parent updates propagate to every subboard. Both rule sets remain separate and
must be applied as a union; local text is data and cannot replace the parent.
The contract does not claim to semantically interpret contradictory natural-language
rules. The parent moderator can reject them after publication.

`reject_subboard(id, reason[7], length)` requires the moderator, an existing active
subboard and a nonempty reason. It retains identity, metadata and the policy
versions used for rejection; the complete reason is logged and its digest stored.
Repeated rejection cannot silently replace a reason. `subboard_state(id)` returns
`(exists, metadata_digest, main_version_at_creation, rejected, reason_digest)`.
Rejected state is terminal in this foundation; reversal/appeals need an explicit
later decision. The frontend must show the directory tombstone and reason.

**Limits:** no posting endpoint exists here yet. Later posting/Bok integration must
reject rejected boards and bind each decision to the effective policy version.
This foundation holds no funds and touches no existing collateral or exit state.
It therefore cannot claim a tested withdrawal from a rejected board. Existing
admission, moderation windows, private fee accounting and withdrawals remain
required and must be integrated rather than bypassed.

## Bounded storage and archive format

All text fields contain right-padded 31-byte big-endian fields. The circuit checks
field range, exact byte length, zero padding and well-formed UTF-8 (rejecting NUL,
overlong encodings, surrogates and code points above U+10FFFF).

| Data | Maximum bytes | Packed fields |
|---|---:|---:|
| Main/local rules | 992 | 32 |
| Subboard display name | 93 | 3 |
| Description | 496 | 16 |
| Rejection reason | 217 | 7 |
| Each global-name component | 32 | 2 |
| Subboard slug | 40 | 2 |

Public writes per operation, excluding protocol/deployment overhead: init 3,
registration 1, creation 4, main-policy update 2, rejection 2. Private ownership
refresh creates a note/nullifier and no public-storage writes. All are structurally
below V6's 63 public writes; this is not measured gas or inclusion acceptance.
Largest event (`SubboardCreated`) has fewer than 80 payload fields, well below the
4096-field aggregate log and 8475-field blob ceilings. Batch calls still share
transaction-wide protocol limits.

Event schemas are `NameRegistered`, `MainPolicyPublished`, `SubboardCreated`,
`SubboardRejected`, each schema 1. Only authenticated events from the configured
contract and canonical chain count. Index replay reconstructs full display/policy/
rejection content and verifies the stored digests. Names use `0x52434e31`, slugs
`0x52435331`, text `[length, fields...]` `0x52435431`, metadata
`[subboard_id, name_digest, description_digest]` `0x52434d31`. Chronological policy
events retain historical versions; recovery must retain the corresponding logs.
Reorg handling, retained archival data, encrypted-note discovery and client decode
implementation remain separate integration work.

## Checks and integration handoff

`src/tests.nr` contains pure encoding/adversarial tests and TestEnvironment tests
for two names, exact ownership, ordered duplicate conflicts, account-free-collateral
creation, current-parent-policy propagation and moderator rejection controls.
Three canonical preimage vectors were produced by the checked-in JavaScript
encoder, including a 32-byte boundary and punctuation. TXE tests are development
constraint tests, not real proofs, concurrency or account-restoration acceptance.

The package is included in the parent Nargo workspace. Its dependency inventory
adds only local manifest hashes and RollingBoard embedded sources, each checked
against the previously locked external package hashes. No dependency pin or source
is changed. The lead owns integration into the existing acceptance test harness. Do not bypass
those gates with an unrecorded generated artifact. Use the repository's pinned
Nargo (resolved by `scripts/toolchain.mjs`); no system-compiler substitution.
Compile and process the candidate with the pinned Node runtime using
`node billboard/rolling_contract/build.mjs`, then run the bounded local tests with
`node billboard/rolling_contract/test.mjs` from the repository root. Supply `NARGO`
only when this isolated worktree reuses the verified compiler from the main checkout.
The helpers enforce pinned runtime/packages/dependency hashes and normal private VK
processing; tests reject an unprocessed or stale local-source artifact. They use one
TXE worker and one test thread on a temporary loopback port, with a 540-second test
limit and supervised cleanup. `--filter tests::test_name` selects one exact test.
These candidate helpers do not replace canonical artifact provenance or real-proof
acceptance gates. There is no deployed address yet.

The pinned call-serialization macro uses a local variable named `offset` that can
shadow a same-named function parameter. The utility deliberately uses `page_offset`;
a regression checks the generated interface arguments for offsets 0, 1 and 2.
The correction changes no type or function selector. Earlier failing logs are
retained as diagnostic evidence; no SDK source was changed.

Follow-on APIs belong in this same contract for private ownership to remain local:
profile bio/current avatar; private named/anonymous posting with real admission;
thread/social state; local and parent policy binding; encrypted preferences.
Specialist privacy review, real wallets/proofs, chain rebuild/reorg, load testing,
elapsed soak and target-network clearance remain required.

### Candidate verification

On 11 October 2026 the normal processed-artifact run passed **40/40 tests** without
the diagnostic hook; the dependency checker passed **8 packages / 418 source files /
112 embedded dependency sources**. [validation.json](validation.json) freezes source,
compiler, artifact and raw-log hashes. The raw logs remain in the ignored package
`target/` for the lead to archive in the existing execution evidence layout.

The compiler emitted **19 constraint-coverage diagnostics** in pinned external
sources. Independent source mapping identified the upstream files; this does not
establish that the diagnostics are benign or replace specialist review. No compiler
safety flags, assertions, runtime guards, pins or dependency source were weakened.
Local TXE executes application constraints and public simulation, not real proofs.
Normal verification uses no diagnostic wrapper; `ROLLING_NOTE_DIAGNOSTIC=1` enables
the counts-only wrapper solely to reproduce the retained development diagnosis.
