# Budget reconciliation recommendation

Prepared 2026-10-18T16:21:29.328620+00:00. Recommend replacing the conservative296.33USD reservation with a **140USD closed-campaign bound**, releasing156.33USD and leaving **160USD** for a newly costed campaign under the300USD cap. This is a recommendation for the lead ledger owner, not a launch or invoice claim.

## Billing basis and attribution

Exactly three authorized Cost Explorer reads (0.03USD reserved) retrieved daily UnblendedCost through17October, exclusive end18October. Every period is still Estimated=true; none has an unread pagination token. Account052665140763, existing message-board-deploy profile. Raw responses and hashes are retained alongside this report.

October1–17 account total is216.3582550508USD, including36.26USD account tax and unrelated services. October11–17 total is82.1693457467USD. The separate London m6a.xlarge moderator and t2.medium application server show168hours each,33.5664USD and8.736USD; Lightsail is18.9672USD. Their61.2696USD combined cost is outside this campaign. This leaves **20.8997457467USD as a conservative campaign attribution**: it deliberately includes every other account charge, including all London EBS, IPv4, S3, cross-region transfer and requests. Campaign tags are empty, so no exact campaign invoice or individual-instance bill is claimed.

The usage report independently shows14.67278 billed m7a.4xlarge hours (13.606948334USD),0.05h m7a.large,1.490260693USD us-east-1 gp3 storage and0.158002912USD throughput. These are actual currently reported usage entries, not planned runtime. No credits or free-tier forecast is used to manufacture savings.

## Conservative replacement bound

| Component | USD |
|---|---:|
| Historical campaign bound retained in full |83.27|
| All post11Oct observed charges except separate London compute/Lightsail |20.899746|
| Extra20% tax allowance on that entire subtotal |4.179949|
| Shared delayed-billing/cleanup buffer retained |20.00|
| Future retained storage/routine network allowance, increased from5 |10.00|
| This task’s three CE reads |0.03|
| Calculated total |138.379695|
| Rounded recommended bound |140.00|

This replaces accumulated per-attempt forecasts and overlapping delay buffers using reported charges plus verified termination. It does not subtract unverified historical savings: the original83.27USD remains intact, even where it overlaps October11 usage.

## Resource and retention bounds

Fresh18October16:20UTC readback (unfiltered describe calls, all CLI pages; snapshots filtered only to self ownership; us-east-1 only): us-east-1 has zero instances, volumes, fleets, addresses and owned snapshots. Retained receipts show failed/finished campaigns terminated, volumes absent; some early fleet receipts are intermediate, superseded by the fresh empty fleet inventory. Last final campaign expired15October13:12UTC and terminated; its final instance/volume/fleet receipts were read. Relevant receipt paths and hashes are in recommendation.json.

Entire existing backup bucket, not just the last prefix:445 STANDARD versions,33,234,165,811bytes (~30.95GiB),2 delete markers,zero multipart uploads. Latest object18October11:16UTC. Existing lifecycle remains current30days/noncurrent7days/abortmultipart1day. At the observed CE London STANDARD storage rate0.024USD per GB-month, even retaining the full current inventory another month is under1USD before tax;10USD leaves storage/routine-request/network margin. Do not delete backups to achieve this release. No unrestricted future archive download is covered.

[AWS explains Cost Explorer refreshes at least daily](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html); estimated monthly charges can change. The20USD delay buffer,20% tax allowance and upward rounding are retained for that reason.

## Consequence

Budget is no longer established as a3.70USD hard blocker once the lead adopts this reconciliation. Up to160USD can support a fully forecast new run, including its independent shutdown, delayed-cost buffer, synchronization, storage, transfer and proof costs. This is not evidence that any chosen node/prover configuration will fit or synchronize. The current prover/trusted-node/deployment blockers remain technical prerequisites. No resources, services, shared ledger, secrets or application source changed.
