# Native controls: verified Aztec 6.0.0-rc.3 example

**The entrypoint's mandatory state-dependent execution rule applies to every example here. No timestamp or elapsed-duration condition may advance an application or test flow. Native controls produce state; receipts and state observations establish completion. Timeouts only report failure.**

Verified against installed `@aztec-labs/*` source on 15 October 2026. This example does not select the project's version: first align the toolchain with the user's required protocol/network target as directed in SKILL.md. Then check that release's package exports and implementation; do not retain an incompatible installation or pin rc.3 merely to match this example. Public documentation may describe a different version or use `devnet` for a public network; here local development means an owned local network with disposable assets.

## Entry points and proof configuration

`aztec start --local-network` uses the native local-network factory and exposes the node/debug RPC services.

For in-process tests, `setupLocalNetwork` is exported from `@aztec-labs/aztec/testing`:

```js
import { setupLocalNetwork } from '@aztec-labs/aztec/testing';

const network = await setupLocalNetwork({
  config: { realProofs: false },
  // fundedAddresses: [testAccountAddress], // optional genesis fee-juice setup
});
try {
  // Construct the normal application wallet/PXE with proverEnabled: false.
  // Execute the application behavior being developed.
} finally {
  await network.stop();
}
```

The helper owns its Anvil instance on a random port and returns an in-process node, L1 RPC URL and teardown. It does not itself provide the browser-facing HTTP service. It skips the CLI's standard account/FPC/token setup; application-specific prerequisite contracts still need their normal setup.

The local-network factory defaults to `useAutomineSequencer: true`, `automineEnableProveEpoch: true`, `realProofs: false` and a zero-member committee. Prefer this coherent setup over assembling individual protocol settings. For existing fixtures, use the version's supported options rather than mutating a previously deployed rollup into a different mode.

PXE supports `proverEnabled: false`; `EmbeddedWallet.create` accepts this under `pxe`. The SDK itself implements disabled proving. In the normal non-profiling disabled path it also skips private-kernel witness generation; avoid assumptions derived from the method name `proveTx`. Application execution still runs. No custom random-proof adapter is required to disable proving.

## Block and settlement controls

The in-process node exposes these operations; the local debug RPC client exposes equivalents in the `aztecDebug` namespace. Locate `createAztecNodeDebugClient` through the installed package exports.

| Operation | Native control | Meaning |
|---|---|---|
| Advance a block | `node.mineBlock()` | Under automine, builds an empty block through the native sequencer |
| Make L2-to-L1 outputs consumable | `node.prove()` | Synthetic local settlement, including Outbox updates; does not generate a real epoch proof |

These operations share the automine sequencer's serial queue. Local-network automatic settlement is already enabled by default; call explicit settlement when the test needs a deterministic boundary. Do not add another timer/miner alongside it. Use the automine implementation through its supported interface.

Await the relevant observable state. Measure delays and investigate them rather than guessing that public-network waiting periods apply locally.

## Observe state through the SDK

Application progress follows receipts and observable state through SDK promises, callbacks, subscriptions or supported state waiters. Register observation before initiation, or use a waiter that recognises already-completed operations. Accept an established result immediately without requiring a transient pending stage. Drive native controls only for prerequisites still missing, then await normal application completion. A timeout only reports failure. An SDK waiter's internal polling does not authorize a custom timer-driven flow.

Use native operations at the level of the state transition under test. Do not calculate slots, compare clocks, create timestamp freshness gates or inject a clock service into the application. Consult source when needed to understand the supported API or diagnose a failure; source lookup is not a requirement to audit protocol internals or reproduce their scheduling.

## Source lookup map

Paths are relative to the installed package directories:

- `@aztec-labs/aztec/src/testing/local-network.ts`: fixture options, lifecycle, genesis fee funding and `TEST_FEE_PADDING` for test-wallet fee-estimate drift. Use supported padding for fixtures where appropriate; it does not waive application user-consent ceilings.
- `@aztec-labs/aztec/src/local-network/local-network.ts`: coherent local defaults and PXE setup.
- `@aztec-labs/aztec/src/cli/aztec_start_action.ts`: CLI service/debug API wiring.
- `@aztec-labs/stdlib/src/interfaces/aztec-node-debug.ts`: debug operations and client.
- `@aztec-labs/aztec-node/src/aztec-node/server.ts`: implementations of `mineBlock` and `prove`.
- `@aztec-labs/sequencer-client/src/sequencer/automine/README.md`: intended application-test use and serial queue.
- `@aztec-labs/pxe/src/pxe.ts` and `src/private_kernel/private_kernel_execution_prover.ts`: native disabled-proof behavior.

Official starting point: [Getting Started on Local Network](https://docs.aztec.network/developers/getting_started_on_local_network). Verify flags/imports against the installed release; the retrieved documentation during this investigation showed v5.2.0 while the application used rc.3.
