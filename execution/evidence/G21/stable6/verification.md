# Stable6 restoration — in progress

The owner requests a clean deployment and discards all old application state.

Canonical Sepolia rollup:0x1f435a7f2da358caf887a470faeee7d5d5f4efba, version679261766. Official Aztec6.0.0 image starts and synchronizes; observed block929/checkpoint891, world state synchronized. Native Linux BB reports6.0.0 and SHA2565bbb64800d431c6760a70d8723be4eaf37ed10e8fbfe2842bb85b8436180c130.

Rebuilt all Noir contracts, SDK, CRS and browser assets. Independent upstream patch review retained all intended SDK modifications. The stable image uses Node24.22.1 (application runtime remains24.21.0); its startup guard now matches. Stable SDK RPC clients require isLevelEnabled on logging adapters; browser, query and qualifier adapters now provide it.

Validation:138 query/trusted-node integration tests pass, including native/bundled PXE, official WASM, authenticated operator requests and admitted-request draining.33 toolchain tests pass.74 startup/preference/native-adapter checks passed. The375-test affected batch passed372; its remaining3 stale native-version expectations were corrected and the33-test toolchain suite rerun successfully. Earlier wallet test expectations were corrected to match existing committed lazy synchronization and explicit read-failure behavior.

This is engineering validation, not a completed live application flow. Full Linux package qualification, fresh contracts/configuration, signup/post/Bok checks and publication remain pending.
