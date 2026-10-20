# Funding feasibility inputs — 11 October 2026

Read-only preparation, not named-wallet acceptance or owner decision. G04 implementation remains dependent on G14 private funding interface.

[MetaMask gas included transactions](https://support.metamask.io/manage-crypto/transactions/metamask-gas-station/) lists Ethereum Mainnet and several other networks, but does not list Sepolia. User-funded alternative-token gas is distinct from wallet sponsorship. This documentation does not prove the pinned extension’s actual capabilities.

[Phantom gasless EVM transactions](https://help.phantom.com/articles/53467684967443) describes eligible swaps, alternate-token fee payment or sponsorship, and explicitly excludes gasless sends. It does not establish arbitrary application funding-call support. [Phantom transaction API](https://docs.phantom.com/ethereum-monad-testnet-base-and-polygon/sending-a-transaction) documents eth_sendTransaction. Search absence for wallet_sendCalls is not proof of unsupported capability.

Required next evidence: fresh disposable MetaMask and Phantom Ethereum-mode accounts; actual chain selection and wallet_getCapabilities results; zero-ETH USDC quote/approval/send behavior; exact prompts and transactions. Never take funds on a route inferred supported solely from these pages.

Potential alternative to evaluate before declaring impossibility: a user-paid relayer accepting scoped signed USDC authorization and refunding itself from the user’s quoted fee/conversion allocation. This is not automatically qualified or authorized as a paid external service. It requires exact accounting, bounded signed fee/expiry/recipient, replay protection, usable Sepolia conversion liquidity and noncustodial principal. No hidden app subsidy or presumed token permit support. If infeasible in the target wallets/network, prepare measured alternatives for the owner instead of silently requiring ETH or waiving USDC-only onboarding.


## Installed-wallet follow-up, 11 October 2026

Independent controls worker verified the pinned MetaMask manifest is13.49.0.0 and installed code exposes wallet_getCapabilities, wallet_sendCalls and wallet_getCallsStatus. Official MetaMask batching documentation explicitly includes Sepolia and distinguishes a ready capability requiring an account-upgrade prompt. This is static/API evidence, not a successful account upgrade, transaction bundle or USDC gas payment.

Phantom official provider documentation supports EIP-1193 eth_sendTransaction and developer testnet mode includes Ethereum Sepolia. No repository-pinned Phantom extension or dedicated driver was found. Its documented gasless EVM swaps do not qualify arbitrary application funding. Obtain an isolated disposable profile through the official installation route, without reading personal wallet storage.

Next probe: actual provider identity/version/account/chain and wallet_getCapabilities(account,[0xaa36a7]); retain unsupported/missing/rejected separately. Measure ETH-only and USDC-only/zero-ETH for both named wallets. If atomic batching is supported, use atomicRequired with exact approval and router call, count connection/upgrade/signature/transaction prompts separately, and resolve bundle ID into canonical receipts. Test zero-native-gas support before any approval/deposit; never top up ETH and call it USDC-only. Preserve intent before sole submission and recover by exact transaction/bundle identifier. Aggregate allocation, conversion liquidity, private fee bootstrap and actual claims remain unmeasured prerequisites.

Sources: https://docs.metamask.io/metamask-connect/evm/guides/send-transactions/batch-transactions/ ; https://docs.phantom.com/ethereum-monad-testnet-base-and-polygon/sending-a-transaction ; https://docs.phantom.com/developer-powertools/testnet-mode ; https://help.phantom.com/articles/53467684967443 ; https://help.phantom.com/articles/4412436271635 . No browser/service/funding action was performed for this follow-up.
