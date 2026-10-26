# Wallet artifact delivery

Live policy `901eeaf8-9757-442e-b12a-7664747c826a` stripped Brotli negotiation from `/wallet/*`, although Caddy had authenticated precompressed files. Updated existing policy with its ETag: `EnableAcceptEncodingBrotli` false to true, descriptive comment only otherwise. Gzip, TTLs (0/0/1), cookies, headers, query settings, routing and security are unchanged. Independent review: pending_feed_release. No service restart. Before/applied API records are adjacent. Source publisher now produces Brotli for nine exact public contract artifact JSON paths. Actual encoded-delivery validation follows activation.

Actual public wire validation passed: Board2,926,245B Brotli→5,570,115B original, fee323,315B→608,001B, exact SHA matches. Gzip and identity paths also match; evidence in execution/evidence/G21/stable6/other-transaction-latency/preload-wire-evidence.json.
