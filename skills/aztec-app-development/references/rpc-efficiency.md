# RPC architecture and diagnosis

Apply the entrypoint's architectural intent: remove unnecessary network work while preserving useful results. The patterns below support that judgment; they are not a mandatory test matrix or a reason to retain an inefficient abstraction.

## Established pattern

**UI → shared feature queries/actions → supported SDK client → transport.** Ethereum React libraries demonstrate this separation: Wagmi uses Viem actions with TanStack Query for keyed queries, shared cached results and targeted invalidation. For Aztec L2, apply the pattern through the target-compatible Aztec SDK/PXE and suitable application libraries. This is not a requirement to install Wagmi or replace Aztec calls with EVM methods.

- **Share reads.** Reuse clients and in-flight requests. Query keys identify the network/deployment, account where relevant, operation and inputs. Use compatible SDK/library serialization. Keep private results scoped to their account.
- **Fetch what is needed.** Use supported pages, ranges and bulk reads; resume from a valid checkpoint. Reuse immutable facts under their identity. Remove repeated discovery of the same node/contract facts and rescans of unchanged history. Do not assume mutable contract-instance data is immutable.
- **Refresh affected data.** Update or invalidate specific queries after relevant observed state changes. Share state observers instead of multiplying them per component. If state changes during a read, preserve the need to reconcile the newer state. On reconnect, reconcile from the known checkpoint. Prevent obsolete responses from updating a different account/network context; use supported cancellation where available.

Library defaults need attention. TanStack Query can retry failures and refetch on mount/focus/reconnect. Its `staleTime: Infinity` supports explicit invalidation; `'static'` prevents it. When using state-driven caching, wire the relevant observation/reconciliation path rather than relying on age-based freshness or leaving mutable data cached forever. Check the installed library's behavior before copying options.

## Fix the cause before adjusting transport

Trace excess calls to their callers and fix the producing query plan. For example, a list that rediscovers the same contract for every row needs shared lookup, not a slower loop. Several components requesting the same balance need one shared query, not separate retry policies. Reopening an index should reuse a valid checkpoint, not replay unchanged history. If a proposed fix only changes pacing, concurrency, retry count or timeout, it has not repaired these defects.

Use transport controls for a demonstrated residual constraint after correcting avoidable work. Their presence is not proof of efficiency, and their absence is not the goal. Prefer existing client facilities, avoid multiplying retries across layers, and retain the original error. During diagnosis, optional retries can be disabled to expose the first failure. Application completion still depends on observed state, never a delay or exhausted retry count. Local tests supply deterministic transport responses and native state transitions; they do not wait through external quota windows. An ambiguous submission outcome requires state reconciliation before resubmission.

JSON-RPC batching reduces HTTP envelopes but may leave logical call count and quota usage unchanged. Ethereum Multicall aggregates compatible EVM reads into one `eth_call`; it does not aggregate arbitrary Aztec operations. Verify native Aztec bulk APIs and provider batch limits. Neither batching nor concurrency compensates for redundant reads.

## Verify the improvement cheaply

Use existing traces or test counters. Count logical calls by method and operation, including retries and batch items. Separate application/PXE calls from node-to-L1 traffic. Investigate duplicates, payload size and peak rate where useful; omit keys/private payloads from traces.

Choose observations relevant to the changed behavior: cold start, unchanged reuse, shared consumers or a state change. Distinguish repeated metadata discovery from reads of genuinely distinct data; do not assume every per-record call is necessary or demand an unsupported bulk API. Request budgets should reflect the data needed, not bless the current inefficient count. Check useful results alongside counts. This needs no new test platform or live rate-limit experiment.

## Provider context — checked 15 October 2026

dRPC publishes **120,000 CU/minute/IP** for its free tier, reducible to **50,400** under load. Its listed Aztec methods cost **20 CU**: approximately **100 or 42 calls/second averaged over a minute**, not guaranteed burst allowances. Network-specific limits may differ. Free batches allow **3 items**; paid access documents no rate limit while funded. Verify the actual endpoint policy. [Limits](https://drpc.org/docs/howitworks/ratelimiting), [method costs](https://drpc.org/docs/pricing/compute-units).

Slack identified DashNodes as DashNode.org, the Dashtec team. No numeric Aztec RPC quota was verified for DashNode; the figures above belong to dRPC.

## Primary library references

[Wagmi query architecture](https://wagmi.sh/react/guides/tanstack-query), [Viem read aggregation](https://viem.sh/docs/clients/public), [Viem transport](https://viem.sh/docs/clients/transports/http), [TanStack defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

These document library capabilities. Apply this skill's state-dependent application flow; linked examples do not override it.
