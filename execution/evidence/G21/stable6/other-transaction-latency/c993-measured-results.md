# Actual c993 measurements — 26 October 2026

UI c9930368858f06622dfc2d13305b82662862b76e is live and pushed to master and both application branches. Prover remains636. Account status reads native FPC balance without preparing payments.765 affected tests and SDK/wallet builds passed; independent review approved. No contract deployment or service restart. Public worker SHA0d3e34151ed1e272a6e2ec87086009820b157134b5551dd765cdfdb2559ad1fc,433661bytes verified.

| Endpoint | Actual | Assessment |
|---|---:|---|
| Wallet click → funded ready |2.166935s|Fails2s; not fresh signup|
| Like click → included visible count |11.420380s|19.20% below14.134775s baseline; fails50%|
| Bio Save → included editor closure,58ASCII bytes |16.215390s|About78.4% below old75.0202s; baseline payload missing|
| Create name → included selected enabled name |24.028000s|77.51% below106.844070s baseline; first vs fourth name caveat|
| Unlike click → visible zero, prior636 release |10.530325s|No goal-start baseline; no50% claim|

Warm breakdown: automated signing response82.205ms; session initialization505.675ms; sync672.805ms; signing capsule4.620ms; status591.655ms. Status discovery553.935ms, balance utility34.780ms. First attempted c993 warm capture missed its DOM start and is excluded. Successful run uses the bounded observer, preserving repeated spans.

Like native proposed receipt: tx0x0beb40fc357da4dcd1e647dc676140412a4d99000beefa5a522fb798728638e5, block6670/hash0x090f193225eb69eb2d1481e2a19a720b65d75e05d11ffc0de61471c803f1ed59. Receipt11.031790s after click; visible11.420380s. Prepare1.963605s; prove/public-validation4.434170s; upload548.375ms; result2341.465ms; native inclusion3995.935ms. Sync1025.220ms comprises source343.140ms, header/ancestor interval~335.640ms and prewrite334.285ms. Prewrite-snapshot330.665ms is nested, not additive.

Bio native proposed receipt: tx0x20494df3b9fe0f3885393750dd669d6e6881e8e6f559056d6de1fea780357201, block6684/hash0x1a382db903ff8d741fc53759d66d1a238e3f12825e9042ca7242f1ae7ad82da2. Exact58-byte text subsequently verified on River Cedar public profile. This subsequent navigation was not part of the timed endpoint.

Existing IAB tab reused, no Chrome launch or browser setting change. Test-wallet replies now bind request ID and method. The current warm measurement adapter supports reads/signing only; it rejects Ethereum payments. No production payment-adapter change is claimed. Temporary publication object/version, signed launcher and archive were removed; one build and current baseline retained.

Fresh signup remains unqualified: owned test wallet has0.000313693859922125ETH, below0.001ETH collateral plus fees. Current relay0.000249975721127208ETH has operating commitments, not sufficient surplus. Older project wallet has0ETH. Private Bok7USDC cannot pay Ethereum signup. No balance fabrication or funding-check waiver.

Next: Like/Unlike snapshot-ancestry draft awaits the persisted note/nullifier reorg regression before integration. Combined opening snapshot RPC is a design only, estimated225–365lines for at most~327ms saving. Both goals remain open; missing paired baselines remain explicit.
