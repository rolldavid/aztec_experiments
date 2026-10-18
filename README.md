# Rolling Chat — anonymous message board on Aztec

The current application is Rolling Chat (Draft 3), based on
[Vitalik’s message board](https://github.com/vbuterin/aztec_experiments).
It is a proof of concept with connected development functionality; final
real-proof testnet and privacy acceptance are not yet complete.

Open the current local application at [Rolling Chat](http://127.0.0.1:8080/#/home)
while its development runner is active. Browse without connecting a wallet;
use the account panel for funding, posting, private views and balances.
The local node and PXE use their native proofs-disabled configuration. The
[operator runbook](docs/rolling-deployment.md#access-and-resume-the-local-application)
explains startup, frontend reload, shutdown and recovery boundaries.

The historical [Billboard V6 deployment](deploy/V6-TESTNET.md) uses different
contracts and is not the current Rolling Chat preview. Exact installed toolchain
versions are in [BUILDING.md](BUILDING.md); do not reuse historical deployment
addresses or funded accounts as a new installation.

## How it works

A poster deposits ETH into the Ethereum portal and claims a private posting right
on Aztec. They can then publish public messages without publishing their wallet
address with each message. Posting is rate limited. After their posts have been
screened and any waiting period has expired, they can withdraw their collateral
back to the original Ethereum depositor.

The deployer selects a moderator. That moderator publishes the board’s rules,
can flag posts, and can transfer the moderator role. The moderation daemon runs a
local language model on the moderator’s machine, which can be an AWS instance.
It reads the current rules and submits flag transactions using its own wallet.
Rules apply to older posts too. Flagged posts are hidden from the default feed;
a flag within the penalty window also increases the poster’s waiting period.
Public blockchain data cannot be erased by hiding it in the application.

Readers can browse public posts without a wallet. Posters connect their Ethereum
wallet; the site automatically creates or unlocks their passkey-backed Aztec
account. Account import and recovery are available from the Account menu. Private transaction fees are paid
from credit in the private fee contract, funded through Fee Juice. Funding amounts
and timing remain public; see [privacy limitations](docs/privacy.md).

## Build and test

Use Node **24.21.0** and the pinned tools described in [BUILDING.md](BUILDING.md).

```sh
nvm install
nvm use
npm ci --ignore-scripts
npm ci --prefix billboard/portal --ignore-scripts
npm run bootstrap:noir
npm run build
```

[TESTING.md](TESTING.md) describes the test hierarchy and application scenarios.
The finite models in [fv/model-checks](fv/model-checks/README.md) supplement
contract tests; they do not prove cryptographic security or anonymity.

## Application components

| Directory | Purpose |
|---|---|
| `billboard/` | Aztec contracts, Ethereum collateral portal and contract tests |
| `apps/` | Browser pages and command-line clients |
| `shared/` | Wallet, transaction, private fee and feed code shared by clients |
| `censor-daemon/` | Moderation service and isolated model runtime |
| `deploy/` | Web hosting and AWS deployment tooling |
| `scripts/` | Build and test tools |

## Deploy and operate

- [Current Rolling Chat deployment and operation](docs/rolling-deployment.md)
- [AWS deployment](deploy/aws/README.md)
- [Moderation daemon configuration](censor-daemon/README.md)
- [Moderation queue operations](docs/moderation-queue.md)
- [Operations](docs/operations.md)
- [Wallet and collateral recovery](docs/recovery.md)
- [Privacy limitations](docs/privacy.md)
- [Security verification scope](SECURITY_PROPERTIES.md)

Keep wallet files, recovery files, passwords, RPC credentials and service state
outside version control. Use the same wallet and recovery records when resuming
an operation; check its on-chain result before submitting another transaction.
