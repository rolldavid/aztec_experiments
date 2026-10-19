# Retain the latest Bok page without its compute server

The live Bok service publishes accepted static files and source downloads automatically.
At a final quiet handover, retain those public bytes in a dedicated private S3 bucket
behind the existing artifact CloudFront hostname. Private backups are separate and
must never be used as a public origin. No expiration rule applies to current pages.

1. Reconcile the shared infrastructure budget, storage and delivery rates, and the
   operating forecast. Storage and public delivery continue to cost money after
   compute stops; indefinite retention is not a promise of free hosting.
2. Wait for terminal request accounting. While the artifact HTTP service is still
   running, copy its trusted static `catalog.json` into operator storage. Do not accept
   a catalog supplied by generated code or a participant.
3. Provision a private artifact-only bucket with public access blocked, encryption,
   and a CloudFront origin access control. Restrict GetObject to the exact distribution
   and immutable publication prefix; never grant bucket listing or checkpoint access.
4. Run `retain-bok-static.py` with that catalog, the current HTTPS artifact origin,
   bucket, a fresh `published/<snapshot-id>` prefix, and an output inventory path.
   It fetches only enabled latest public routes, authenticates bytes and revisions,
   stages the entire snapshot, and reads every S3 object back. Directory aliases are
   real objects, so existing `/latest/` links need no rewrite function. It never
   switches the distribution. A failed stage leaves the existing origin unchanged.
5. Use the existing graceful drain to stop admission and finish any intervening job.
   Compare the now-quiescent catalog against the staged inventory's `catalogSha256`
   (SHA256 of Python `json.dumps(catalog, sort_keys=True).encode()`). A mismatch blocks
   the switch: retain the existing origin, restart the drained service normally and
   stage its actual current publication before a new quiet handover. Never switch to
   a stale snapshot. Preserve the artifact sandbox CSP, no-referrer, nosniff, cross-origin resource
   policy and CORS headers in a CloudFront response policy. Forward no viewer cookies
   or authorization to S3. Keep GET/HEAD only and no-store; source objects retain their
   download disposition. Change the existing distribution to the authenticated
   bucket origin and this snapshot prefix only after all objects are verified.
6. Use the native AWS deployment waiter. Retrieve the actual page, its assets and
   source through the unchanged public URLs; compare against the staged inventory.
   Confirm old revisions, private files and disabled threads are not exposed. Record
   the distribution revision, prefix, hashes and recurring cost in the handover.

This is static hosting. It does not keep model execution or configured secret API
endpoints running after Bok stops. Do not describe those APIs as available from S3.
Moderation/removal requires a new authenticated snapshot excluding the disabled
thread, followed by the same atomic origin-prefix switch. To resume live publication,
restore the service's accepted catalog and artifacts and switch the distribution
back to its verified live origin before accepting new requests. Preserve the retained
snapshot until the new origin is verified. Never restore an older public revision.
