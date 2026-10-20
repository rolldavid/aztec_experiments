# Phantom acceptance prerequisite

Observed 18 October 2026. Genuine installed extension 26.33.0 does not support the existing local Ethereum chain 31337 (0x7a69). No native local setup was found or documented. This is a source/documentation conclusion; no wallet/profile was opened and no live provider request was made.

Installed binary evidence: `installed-binary-evidence.json` retains file hashes, exact character offsets and bounded excerpts. The service worker checks both add-chain and switch-chain requests against `getSupportedNetworks()` before proceeding; an unknown chain opens the unsupported-network notice and returns chain-disconnected. The add-chain handler additionally rejects unsupported chains. Its Ethereum network enums are mainnet 1 and Sepolia 11155111; the multichain union has no eip155:31337. Merely accepting an rpcUrls field in the input schema does not make custom chains supported. Solana localnet support is unrelated.

Official references:
- [Supported networks](https://help.phantom.com/articles/what-blockchain-networks-does-phantom-support-41372840389651): networks outside the supported list are unsupported.
- [Testnet settings](https://help.phantom.com/articles/view-testnets-in-phantom-5997313271699): profile avatar → Settings → Developer Settings → Testnet Mode → Ethereum Sepolia.
- [EVM integration](https://docs.phantom.com/ethereum-monad-testnet-base-and-polygon/getting-started): window.phantom.ethereum, EIP-1193/EIP-6963; Ethereum testnet 11155111 / 0xaa36a7.

## Free authentic route

Use genuine Phantom in an isolated acceptance profile with a disposable account, enable Ethereum Sepolia as above, connect through its injected provider, and switch using wallet_switchEthereumChain with chainId 0xaa36a7 when needed. Check eth_chainId before signing. No custom RPC override or network impersonation is needed or acceptable.

Acquire free Sepolia ETH from an [Ethereum.org-listed faucet](https://ethereum.org/developers/docs/networks/#sepolia), subject to that faucet’s current eligibility/captcha limits. Obtain test USDC from [Circle’s public faucet](https://faucet.circle.com/) by selecting Ethereum Sepolia and the disposable account address: currently 20 USDC per address/network every two hours, no Circle account required. [Circle’s Sepolia USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses) is 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238. Circle’s ETH faucet in its developer console is restricted to Circle-created wallets, so it is not the direct Phantom ETH route. Faucet receipt and transaction acceptance have not been attempted or demonstrated here.

## Exact application blocker

This route makes genuine wallet-side ETH/USDC interaction feasible. It cannot fund the current local Rolling deployment: Phantom would be on Sepolia while application scope and contracts are on chain 31337. Changing only a label or RPC route would not create a valid deployment. Production shared/rolling/aggregate-wallet.mjs checks the signer/provider chain against configured scope (lines 52,159,388 in the inspected rolling-lead-bok tree).

For full Rolling acceptance, a compatible Sepolia-backed Rolling deployment, funding router/portals/tokens, matching public configuration and trusted synchronized Aztec/prover service are needed. Existing read-only infrastructure evidence from approximately 15:46–15:48 UTC is in ../final-testnet-prerequisites/report.json and retention-and-node.json: prover health 504 with absent us-east-1 backend; current public Aztec metadata rollup3409706519 differs from published legacy config2914217885; required getBlockData reads returned403 and a trusted synchronized boundary was not established. The old report also mentions getL2Tips403; that obsolete method is not relied on here (installed SDK uses getChainTips). Budget ledger then showed 296.30 reserved and 3.70 remaining. No ready full testnet route was established. Those observations are timestamped prior evidence, not a new health check during this task.

No source, service, chain, extension, private profile, ledger, paid capacity or secret changes. No transactions, faucet claim, proof, build, or downloaded tooling.
