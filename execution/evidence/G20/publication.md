# G20 publication

Published c04ac3f7a02ac1cb56efae57afe74fda868d7255 to existing CloudFront app, release /opt/rolling-app/releases/ux-c04ac3f7a02a. Only wallet-panel.mjs and style.css changed. Existing SDK/contract/build assets, private configurations, chain state and other service processes remain unchanged. Five focused browser checks pass; desktop/mobile screenshots show the prominent progress screen. Independent source/harness/publisher review and normal integration gate passed.

Live readback compares both UI file hashes and the existing feed. The first local feed request hit a25second transport watchdog with no response; the two UI requests succeeded. The follow-up public feed request also timed out. Direct application-origin check on its configured port4318 returned all7posts,complete=true,and the same board identity. Public UI file hashes match. No operation or transaction was retried.
