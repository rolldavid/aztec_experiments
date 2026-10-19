# Predeclared acceptance targets

Recorded before Draft3 candidate measurements, 11 October2026. Prototype fixtures do not qualify application latency or chain performance. Measure 1280x900 desktop Chromium and390px mobile; document actual hardware/browser/network and10,000posts/100subboards/100identities dataset, cold cleared cache and warm cache separately.

- Public initial usable feed: cold <=2.5s, warm <=1s excluding unavailable network (which must show honest failure within10s).
- Thread usable: cold <=1.5s, warm <=500ms; directory/search results <=500ms from the user’s Search/Enter submission through navigation, request and visible render. The current interface submits explicitly; no debounce is part of this interaction.
- Input response <=100ms; scroll frame95th percentile <=32ms over30s; no duplicate posts or anchor jumps on append/return.
- Index freshness <=2 observed finalized checkpoints under nominal load; non-final status labelled separately. Authenticated cache rebuild: measure a representative retained real corpus including posts, threads, identities and policies, cold/warm, with actual record counts, RPCs, hardware and storage disclosed; target <=60s for that declared corpus. Report full-chain scan separately. The10k synthetic UI target above does not require generating10k onchain posts.
- Reading first page <=8 backend requests and backend chain ranges <=100blocks/request; steady refresh no rescan from genesis. Payload/page <=100posts. Measure actual RPC counts, not only cache endpoint counts.
- Individual remote proof <=120s existing service deadline; target median <=60s across >=10samples. Total browser qualification remains540s/4GiB. Network finality/bridging latency reported separately, never represented as synchronous funding.
- No success while funds unclaimed or transaction unknown.
- Exact user-paid costs in native units and quoted fiat with provenance; infrastructure cumulative forecast <=USD300 including prior campaign and buffer. No retrospective target weakening.

These are reversible engineering targets pending actual feasibility. Missing a target remains a failed result requiring repair or owner disposition where product scope changes. Specialist audit and network clearance remain. The owner removed the fixed14-day soak on18October2026; bounded final reliability exercises replace it.

18October search-trigger clarification: independent review of section2/3 and RC40 confirms that search is required, typeahead is not. Preserve the predeclared500ms threshold; measure the actual submit-driven interaction, including request and rendering, with the same cold/warm dataset conditions. This clarification precedes the focused current search measurement.

19October authority correction: independent review traced the authenticated10k rebuild corpus to lead-authored commit0e9bdb38, not Draft3. PDF pages6/9 require authenticated reconstruction and measured rebuild duration/dataset size, without a corpus count. Retire that unvalidated engineering-scale assumption; it is not recorded as passed. Preserve the already measured10k synthetic UI result and its limits, real nonempty reconstruction requirements, and explicit >1000-record layered C04 acceptance. No2,500-transaction corpus campaign is required.
