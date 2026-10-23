# Pristine V6 RC1 synchronizer fixtures

These two files are byte-identical copies of the installed, pinned
`@aztec-labs/pxe@6.0.0-rc.1` synchronizer before this patch. Their immutable hashes
are `PXE_REORG_ANCHOR_PINS[*].before` in the installer. Tests copy them into isolated
temporary packages before applying the exact transform; the installed dependency
may be original or already patched, but is only inspected, never changed.

The native regression uses the actual installed L2BlockStream, L2TipsKVStore,
LMDB, NoteStore, AnchorBlockStore and StagedWriteCoordinator. Synthetic headers,
node responses, and directly inserted NoteDao fixtures are labelled in the test.
They establish conservative rollback/atomicity and canonical anchor delivery,
not real encrypted-note discovery, FPC balances, or historical incident cause.

The `preparation-` pair captures the previously deployed, pass-owned reorg patch.
Its exact hashes are the installer's `preparation` pins. The read-efficiency
regression executes that implementation and its replacement against identical
chain fixtures, counting actual node calls and requiring identical final state.
Only hash-pinned data is shared within one sync. Numeric canonical checks and
live tips remain fresh; a second numeric check is omitted only when the two
fresh surrounding live tip identities match. Any tip change retains the final
canonical reauthentication. SDK anchor/cache invalidation clears this cache too.
