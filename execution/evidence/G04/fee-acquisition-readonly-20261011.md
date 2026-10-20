# Testnet FeeJuice acquisition follow-up

Read-only G14→G04 feasibility, controls-20261011. Anchored to Sepolia finalized block11894279, hash `0x8c39f3ed46c20ce04b1a2573413e9457bbeef2e786e1596794d27490295700d6`; final hash recheck passed.11 fixed view calls and3 eth_getCode calls,12s timeout/retryCount0. No user accounts, mint/faucet function invocation (including eth_call), signing, sending, model calls or infrastructure changes. JSON evidence SHA256 `b273b3b5786ecb953a21e7d655023821ce4c3ec1210614b58cc9fcd976e4088a`. Procedure retained `/private/tmp/rolling-fee-handler-readonly.mjs`.

## Pinned source supports a test faucet

[Official v6.0.0-rc.1 FeeAssetHandler](https://raw.githubusercontent.com/AztecProtocol/aztec-packages/v6.0.0-rc.1/l1-contracts/src/mock/FeeAssetHandler.sol) is explicitly under `src/mock`. Its nonpayable `mint(address recipient)` is permissionless and calls the token with a fixed `mintAmount`. There is no caller/recipient equality requirement, per-user cooldown, quota, exchange price, signature requirement or payment. Only the owner may change the amount. Recipient validation is delegated to the token. This is issuance, not ETH/USDC conversion.

[Official pinned TestERC20](https://raw.githubusercontent.com/AztecProtocol/aztec-packages/v6.0.0-rc.1/l1-contracts/src/mock/TestERC20.sol) restricts direct mint to `minters[msg.sender]`; the handler must have this permission. Ordinary users call the handler rather than the token. Its inherited ERC20 rejects a zero recipient. Source has no supply cap or issuance pacing beyond uint arithmetic. The owner can remove a minter, so permissions must be rechecked before any action.

[Official CoinIssuer](https://raw.githubusercontent.com/AztecProtocol/aztec-packages/v6.0.0-rc.1/l1-contracts/src/governance/CoinIssuer.sol) is different: `mint(to,amount)` is onlyOwner and subject to a discrete annual budget. It is not a permissionless acquisition path. Independent token minters can bypass its budget, explicitly documented in source.

Installed official SDK `@aztec-labs/aztec.js/dest/ethereum/portal_manager.js` lines70–107 exposes getMintAmount and a fixed handler-mint transaction, confirming supported development tooling. No such transaction was invoked here.

## Live constants at the pinned block

- Handler `0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9`: FEE_ASSET is the verified FeeJuice `0x762c132040fda6183066fa3b14d985ee55aa3c18`; mintAmount is **1000000000000000000000**, or1000FEE at18decimals. `FeeJuice.minters(handler)` is **true**.
- CoinIssuer `0xe05d0a62045b4237556c1ec423e59eea9a24eaee`: ASSET matches; nominal annual cap is200000000000000000 (20%); deployment time1765762752; current mintAvailable200000000000000000 (0.2FEE). Its minter permission is true. Token ownership points to this issuer; issuer owner is a separate public address in JSON. None of these ownership records grant a user authority.

## Important code-binding limitation

The installed6.0.0-rc.1 source hashes match its compiled artifact metadata. Published JS creation-bytecode exports also equal the packaged Foundry artifact creation bytecode. Nevertheless, **actual deployed runtime is not an exact match**, even after masking only artifact-declared immutable cells:

| Contract | Live bytes | Pinned runtime bytes | Live Keccak256 |
|---|---:|---:|---|
|FeeAssetHandler|827|825|0xcace448da3c5061f03c1e6cdf8b49ecb6aa8b00046870f03d1289308dcd076bb|
|CoinIssuer|1622|1631|0xb05eee1fe7e0a9e396bcc321dee2f79d1a25078cced29bce50dde2e1c2a6b675|
|TestERC20|2753|2692|0x0c5e7ba8cc1b85665b72c1843e9546936973f870a7951c29722018f3f9dcee88|

Because lengths/instructions differ, immutable offsets from the pinned artifact are not applicable to live code. JSON retains those failed comparisons explicitly; sampled cells are not claimed live immutable variables. This could be a compiler/deployment-version difference, but no cause was established. A bounded public explorer verification lookup was unavailable; no retry loop was used. ABI constants and public code hashes are measured; live permissionless mint behavior is **not yet code-qualified**. Resolve with the exact deployed verified source/compiler artifact and runtime binding, or a separately authorized bounded actual test acquisition; never infer exact behavior from ABI compatibility alone.

## Atomic path and economics

For the pinned source, an ETH-funded user could pay their own L1 transaction gas and call mint(recipient) without token payment. A reviewed aggregate contract or account batch can atomically mint to the batch's token holder, approve the FeeJuice portal, then deposit. Existing pinned FeeJuicePortal.depositToAztecPublic pulls from msg.sender, binds recipient+amount in content and a secret hash in the L1→L2 message. Therefore the mint recipient must be the same holder that approves and calls the portal (or explicitly transfers into it first). Two unrelated calls from a plain EOA are not automatically atomic; named-wallet batch support and exact prompts remain untested. Privacy-preserving use must target the shared private FPC and its proven funding construction, never substitute a publicly linked human Aztec account.

This supported development issuance path may eliminate a testnet DEX FeeJuice requirement once live code/behavior and batching are qualified. Label the amount as **testnet-issued FeeJuice**, retain exact leftover/refund accounting, and keep user-paid L1 gas explicit. It does not demonstrate product-funded conversion, sustainable production liquidity or production token economics. USDC-only zeroETH still needs a real user-paid gas executor; free FEE issuance cannot pay the first Ethereum transaction. No owner decision or release gate is waived.
