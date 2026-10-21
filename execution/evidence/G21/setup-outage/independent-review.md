Independent review by /root/ux_review approved the bootstrap availability change: observation-only transport failures report degraded; manifest/config/process identities, authentication bypass, malformed health and strict admission remain fatal. Both query probes run even if one is unavailable. No hidden retry or admission fallback.

Reviewed bootstrap SHA256 aa4d4c41af7346aba41495bae40a8921f4461160cd89e755e8270acc36e0d6da; tests fb66600a1086d8ae1ffcc9a0598c8310b1b78076276efd319dbbeb8561f56837.

Service restoration review identified partial-start rollback and premature marker archival; root moved all starts under rollback, included moderator in rollback, and archived the incident only after all checks succeeded. Restoration succeeded with the original manifest and controls.

Publication review by /root/publication_prepare required verified matched control source/pin before restarting observer timers even during rollback. Root added explicit controls_coherent gating. Changes are restricted to the six reviewed function definitions and the control-source hash pin; all other declarations, native manifest, service processes and application source remain unchanged.

Final handover review by /root/ux_review approved publication/readback documentation and screenshot. They support restored readiness and the existing account reaching the wallet chooser; original timeout remains explicitly inferred, baseline failures preserved, G21 incomplete. No new services, browser launches or tests run by reviewer.
