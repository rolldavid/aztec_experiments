# Sepolia funding liquidity: measured read-only feasibility

Logical session controls-20261011; parent lead-20261011. Measured 2026-10-11T21:15:16.589Z through 2026-10-11T21:18:56.994Z. This is G04 prerequisite evidence, not a wallet, aggregate-funding, privacy or release acceptance result. No account was loaded; no signature, send, faucet, model call, purchase, provision or private service mutation occurred. The infrastructure access note was read first. Public configuration supplied public RPC endpoints, so no credential discovery was needed.

## Canonical snapshot and procedure

Ethereum chain ID11155111; finalized block **11894279**, hash **0x8c39f3ed46c20ce04b1a2573413e9457bbeef2e786e1596794d27490295700d6**, timestamp 1791752532. The block hash was rechecked unchanged. All Ethereum token, code, pool and quote calls used this explicit block number, with installed viem and pinned Node24.21.0, timeout12s and retryCount0. The node identity query was a contemporaneous public node_getNodeInfo request, not a pinned Aztec block/readiness qualification. No personalized node query was made. Neither this response nor the archived project node qualifies a trusted live fullnode.

The JSON records86 labelled read checks plus5 pool-code observations. Evidence SHA256 **a1690b42cfc3552a47589daec30a1bad0ff8af2b5ef83794655d7e580b606a72** in `liquidity-readonly-20261011.json`. Procedure scripts retained outside source at `/private/tmp/rolling-funding-liquidity-readonly.mjs`, `/private/tmp/rolling-funding-followup-readonly.mjs` and `/private/tmp/rolling-funding-code-readonly.mjs`.

Reproduction: obtain chain ID and a finalized block; pin subsequent eth_getCode and eth_call to that number. Read Rollup.getFeeAsset/getFeeAssetPortal; token name/symbol/decimals/totalSupply; portal UNDERLYING/ROLLUP/VERSION/INBOX/L2_TOKEN_ADDRESS; router WETH9/factory; USDC version/DOMAIN_SEPARATOR. Query V3 getPool for WETH/USDC, WETH/FeeJuice and USDC/FeeJuice at fees100,500,3000,10000, then token0/token1/liquidity/slot0/token balances and QuoterV2.quoteExactInputSingle in both directions for each nonzero pool. Query official V2 getPair for the same three pairs and reserves for nonzero pairs. Recheck block hash. Never substitute latest for historical calls that fail.

## Token, portal and router identities

Official [Circle USDC address table](https://developers.circle.com/stablecoins/usdc-contract-addresses) identifies Sepolia USDC **0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238**. Onchain name/symbol USDC, decimals6, version2. DOMAIN_SEPARATOR equals locally computed EIP712Domain(name=USDC,version=2,chainId=11155111,verifyingContract=that address): **0xb90e5057db141a932946e64d09ccb7ffc9b00bd79fec26f698d29af0c83320a6**. This domain comparison does not establish an executed permit or EIP3009 transfer. Circle explicitly states testnet tokens have no financial value.

[Official Uniswap v3 Ethereum deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) identify WETH **0xfff9976782d46cc05630d1f6ebab18b2324d6b14**, factory **0x0227628f3F023bb0B980b67D528571c95c6DaC1c**, QuoterV2 **0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3**, and SwapRouter02 **0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E**. Router WETH9 and factory reads matched. WETH decimals18. All token/router/factory/quoter/rollup/portal code was nonempty, with byte lengths and Keccak hashes retained in JSON.

The repository deployment and current public Aztec node agree on SDK/node6.0.0-rc.1, rollup version2914217885 and rollup **0x8c2fb2a68a3d362ab1de99e06f83f8903160bbd9**. At the pinned Ethereum block, the rollup returned FeeJuice **0x762C132040fdA6183066Fa3B14d985ee55aA3C18** and portal **0x5Bb7523A95c1FDF1D2A3DD9fb7d497E7F5142D7F**. FeeJuice name FeeJuice/symbolFEE/decimals18. Portal UNDERLYING, ROLLUP and VERSION match; its inbox matches node metadata and L2_TOKEN_ADDRESS is field3. All8 explicit network cross-checks pass.

## Measured conversion liquidity

Each listed pool has code, matching token0/1, positive active liquidity and balances. The following are read-only QuoterV2 results, not executable slippage guarantees or economic USD prices:

| V3 fee | Pool | USDC out for0.001WETH | WETH wei out for1USDC |
|---|---|---:|---:|
|100|0xFeEd501c2B21D315F04946F85fC6416B640240b5|47.240132|21158277431228|
|500|0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1|46.890006|21304826881175|
|3000|0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50|46.826662|21226882248282|
|10000|0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47|46.107179|21256949888636|

Quotes have positive outputs and observed simulation gas estimates95,197–114,211. These cover a pool quote, not the complete approval/router/portal/relayer transaction. Testnet spot prices are artificial; no fair-value or stable-rate claim follows.

Both WETH/FeeJuice and USDC/FeeJuice returned the zero pool address for all four checked V3 fee tiers. [Official Uniswap v2 deployments](https://developers.uniswap.org/docs/protocols/v2/deployments) factory0xF62c03E08ada871A0bEb309762E260a7a6a880E6 and router0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3 have code and matching WETH/factory reads. WETH/USDC pair0x72e46e15ef83c896de44B1874B4AF7dDAB5b4F74 has nonzero reserves. Both FeeJuice pairs are absent there too. This is an explicit bounded direct-route search, not proof no other DEX, V4 pool, intermediary token or operator inventory exists.

## Consequences and next bounded work

ETH→canonical USDC conversion has measured positive quotes; user-selected slippage, atomic allocation/refunds, portal deposits and wallet interactions remain untested. The complete ETH→USDC+FeeJuice route is **blocked for these checked direct routes** because the FeeJuice leg has no pool. Unlock with a separately verified existing route or a reviewed explicitly funded inventory mechanism; do not mint/add liquidity or conceal an app subsidy under this evidence.

ZeroETH USDC-only onboarding has two independent unresolved prerequisites: a real user-paid gas execution mechanism in each named wallet (or an audited scoped relayer authorization), and FeeJuice acquisition. USDC→WETH quote liquidity makes user-paid gas reimbursement plausible, but a quote cannot bootstrap a zeroETH EOA transaction. No wallet capability or relayer acceptance is claimed. Verify real provider capabilities and authorization semantics before requesting any approval/deposit; preserve the aggregate user-funded economics and exact refund accounting. An official test faucet, if later authorized, would be labelled test funding and would not prove the mandated conversion route.

Source evidence and network reads are sufficient to reject the prior blanket assumption that Sepolia USDC/ETH liquidity might be absent. They do not remove the concrete FeeJuice-route blocker or the trusted-node, genuine-proof, aggregate-funding and wallet acceptance gates.
