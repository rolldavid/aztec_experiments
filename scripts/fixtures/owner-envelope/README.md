Native v6 foreign-call ABI fixture. It exercises owner-envelope crypto through the actual WASM ACVM without a chain or proof.

From this directory, compile with the repository-pinned nargo (`nargo compile`). Then run `node --test scripts/owner-envelope.test.mjs scripts/owner-envelope-native.test.mjs` from the repository root. The fixture uses unmodified Aztec.nr v6.0.0; generated `target/` is not source.
