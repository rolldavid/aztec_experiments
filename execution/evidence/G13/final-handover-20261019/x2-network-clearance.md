# X2 network-clearance disposition

Observed 2026-10-18T23:50:43.826642+00:00 against application candidate506ca882. Read-only source/document research; no network transactions, proofs, host tests or cloud changes. Current target supplied by the lead: Sepolia11155111, rollupVersion3409706519, rollup0xed1eb2eb670b42e2fb5a478c076a264b9604089d, SDK6.0.0-rc.3/Foundation prover6.0.0-rc.6. Actual replacement-host readiness remains lead-owned and pending.

**Conclusion:** continue the authorized V6 testnet demonstration. X2 is a production suitability gate, not an additional permission request before application acceptance. Its official-guidance research and exact identity comparison are autonomous work. No source requires an Aztec employee to issue a personalized clearance letter. Production readiness cannot currently be asserted from the inspected evidence; no owner approval can substitute for missing network-security evidence.

## Authority and exact remaining criteria

Draft3 PDF page10 says: “Independent audit, network clearance and 14-day soak remain production gates; mainnet deployment needs separate authorisation.” The owner subsequently removed the fixed soak and already selected V6/testnet. Neither change removed network clearance. `execution/tasks/X03.md` is the earlier graph identifier for this gate; final disposition names it X2:

- X03-A01: official current guidance supports intended production exposure and addresses the baseline network-security concern.
- X03-A02: exact chain, rollup, bridge addresses and supported SDK/compiler/prover combination agree with the candidate manifest.
- X03-A03: guidance and observations checked within seven days of final sign-off; any retargeting has an explicit user decision.

The graph's old “V5 target awaiting owner choice” blocker is historical and must not be presented as a current missing user decision. V6/testnet was expressly authorized. The original specification does not prescribe a particular human signatory for network clearance; separate specialist application review remains X1.

## Refreshed primary sources

1. [Network reference](https://docs.aztec.network/networks): supports proven-transaction testing on Sepolia as staging before Alpha. Its table still advertises rc.1/version2914217885/rollup0x8c2f…BbD9, conflicting with the project's already observed current canonical rc.3 target. Treat the table as stale evidence requiring reconciliation, not authority to downgrade/redeploy or invent compatibility. Match the actual node/L1 identity and exact package/protocol constants.
2. [Official V6 operator changelog](https://docs.aztec.network/operate/testnet/operators/reference/changelog/v6): describes a fresh network genesis, relocated repositories/packages and explicitly testnet-only rc.1, with stable6.0.0 intended for Mainnet. It does not declare this rc.3 candidate a production release.
3. [Official rc.3 release](https://github.com/aztec-labs-eng/aztec-node/releases/tag/v6.0.0-rc.3): tag b37a586, October8. This establishes release provenance; the brief page establishes neither live deployment nor production-security closure.
4. [August7 V5 security notice](https://aztec.network/blog/alpha-v5-proving-system-vulnerability): the V5-specific warning and pause guidance remain published. It describes fixes intended for V6, not proof that this exact testnet is production-cleared. Do not apply the old V5 pause as a prohibition on the authorized fresh V6 testnet work.
5. [October9 V6 proposal](https://forum.aztec.network/t/azup-3-is-ready-for-proposal/8670) and [October10 payload technical verification](https://forum.aztec.network/t/proposal-v6-payload/8671): completed protocol code and verified deployed proposal contracts are reported, but governance execution is a separate step. Mainnet proposal rollup0xe37a…402f/version2070860440 differs from the application's Sepolia target. Neither proposal is evidence that this application is cleared.
6. [Alpha network guidance](https://docs.aztec.network/participate/alpha): still discloses incomplete auditing, proving/circuit risks and privacy limitations, including third-party query observations. This supports explicit experimental limits, not an unqualified production assurance claim.

The bounded refresh found no applicable statement establishing unrestricted production suitability of this exact current candidate. This is a limitation of the inspected sources, not a claim that no other communication exists. The prior packets `execution/evidence/P02/current-network-inputs.md` (September12) and `execution/evidence/G02/query-operator-auth/reviewer-current-v6-network.json` (October14) remain historical; this refresh does not relabel their live observations as new.

## Finish without another approval loop

**Autonomous next steps:** lead records current hosted node chain/version/rollup; canonical L1 registry/Inbox/Outbox/FeeJuicePortal; package/compiler/prover/image hashes and protocol constants in the existing final installation manifest, reusing its already-required deployment/readiness observations. Compare that manifest with current official release source and explain the stale docs table. Attach this dated guidance refresh; refresh again only if final sign-off falls outside seven days or materially new guidance appears. Finish D1–D5 testnet acceptance regardless of X2 production status.

**Genuinely external prerequisite:** applicable upstream security/release guidance and, for a future production network, actual canonical activation/support matching the proposed exposure. The project cannot manufacture upstream assurances or governance execution. Once such evidence exists it can be checked without asking the owner to approve routine research. Separate mainnet deployment authorization is required only if mainnet deployment is actually proposed; it is not needed for the current testnet assignment. X1 remains a distinct qualified specialist review, not work to be mislabeled as network clearance.
