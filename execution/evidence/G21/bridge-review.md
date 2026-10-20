# Checkpoint bridge review

Independent reviewer: /root/ux_review. Implementer: ux-root; bounded proposal by /root/funding_investigation.

Approved exact files:
- prover/private-query.mjs SHA256 ba8f805ca18a53d5950f1bdc9d67b399882cfa3b8eb9ec160c7e2caeaf8a0e7e
- prover/private-query.test.mjs SHA256 d2bef7e153bc149643514cb640dbd9a4902093a77a14f10e017357990010c2ad

No blocker. Message discovery and fixed-block witnesses use checkpoint readiness. Only the checkpointed header tag resolves to the captured inspector number/hash. Canonical height/hash checks and final reorg fence remain. Mixed/latest batches and health retain proposed readiness. Tests use installed native isL1ToL2MessageReady and createAztecNodeClient through the HTTP gateway, plus native witness schema. No new retry framework or operation timeout.

Baseline focused test reproduces HTTP503 when proposed synchronization is unavailable and checkpoint state exists (bridge-before.log). Corrected gateway suite:89pass,0fail,1skip; bridge-after.log. Existing funding receipt tests check witness/root verification separately (bridge-receipts.log). Fresh hosted acceptance remains outstanding; the prior trace recorded one HTTP rejection but did not retain its status, so the exact503 on that run is not claimed.
