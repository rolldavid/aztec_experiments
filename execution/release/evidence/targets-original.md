# Predeclared acceptance targets

Recorded before Draft3 candidate measurements, 11 October2026. Prototype fixtures do not qualify application latency or chain performance. Measure 1280x900 desktop Chromium and390px mobile, keyboard and screen reader; document actual hardware/browser/network and10,000posts/100subboards/100identities dataset, cold cleared cache and warm cache separately.

- Public initial usable feed: cold <=2.5s, warm <=1s excluding unavailable network (which must show honest failure within10s).
- Thread usable: cold <=1.5s, warm <=500ms; directory/search results <=500ms from the user’s Search/Enter submission through navigation, request and visible render. The current interface submits explicitly; no debounce is part of this interaction.
- Input response <=100ms; scroll frame95th percentile <=32ms over30s; no duplicate posts or anchor jumps on append/return.
- Index freshness <=2 observed finalized checkpoints under nominal load; non-final status labelled separately. Cache rebuild10kposts <=60s on declared local hardware with retained authenticated logs; separate actual full-chain scan duration.
- Reading first page <=8 backend requests and backend chain ranges <=100blocks/request; steady refresh no rescan from genesis. Payload/page <=100posts. Measure actual RPC counts, not only cache endpoint counts.
- Individual remote proof <=120s existing service deadline; target median <=60s across >=10samples. Total browser qualification remains540s/4GiB. Network finality/bridging latency reported separately, never represented as synchronous funding.
- All keyboard controls reachable, visible focus, dialog focus return and status announcements; WCAG AA contrast measured. No success while funds unclaimed or transaction unknown.
- Exact user-paid costs in native units and quoted fiat with provenance; infrastructure cumulative forecast <=USD300 including prior campaign and buffer. No retrospective target weakening.

These are reversible engineering targets pending actual feasibility. Missing a target remains a failed result requiring repair or owner disposition where product scope changes. Specialist audit and network clearance remain. The owner removed the fixed14-day soak on18October2026; bounded final reliability exercises replace it.

18October search-trigger clarification: independent review of section2/3 and RC40 confirms that search is required, typeahead is not. Preserve the predeclared500ms threshold; measure the actual submit-driven interaction, including request and rendering, with the same cold/warm dataset conditions. This clarification precedes the focused current search measurement.
