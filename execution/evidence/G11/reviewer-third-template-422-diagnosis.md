# Third template creation rejection: independent diagnosis

Reviewer: reviewer-resume-20261014. Source inspected: 85ba37b4058586076936856fff1d7052845c4db4. Read-only review; no provider, wallet, GitHub mutation or service operation performed.

## Observed result and limits

The retained C trace shows installation availability 200, template validation success, creation token issuance 201, target GET 404, then exactly one template generation POST returning 422. Request ID: C2A0:12CA79:689E7B:9B461F:6ACFB7EB. The accepted-permission header includes contents:read plus repository_creation:write, matching this operation. Original journal hash remains unchanged. Trace SHA256: 34b0e5ae2f6db72bb7e775d7dec2e89a5a8bf590418e41328a9f21612afcc847.

The lead separately reports an owner-authenticated GET found exact private repository 1419512819, created 2026-10-14T17:12:12Z with the durable marker, empty Git data, and no installation selection. The lead has disabled Actions and read back false; selection remains two repositories. This observation is attributed to the lead, not independently repeated by this reviewer.

This is the third template 422 under different credential capabilities. It disproves “no resource was created” and makes missing creation permission an inadequate explanation. It does not establish the exact initialization failure. The current error path cancels the response body before preserving only closed status/header diagnostics; the actual validation reason was discarded. Stop template experiments and preserve all three incomplete durable intents. Neither another POST nor changing the same intent to a different route is justified.

## Supported personal-account mechanism

Use the existing broker's direct personal creation mode for a future distinct genuine creation. Current official REST documentation lists GitHub App installation tokens for POST /user/repos with repository_creation:write as an alternative to Administration write. auto_init:true creates a minimal README. This avoids template copying. The existing direct mode already emits this request and the broad profile now mints the specific creation permission. No new OAuth subsystem is required for this documented route. [Repository creation API](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-for-the-authenticated-user)

GitHub's own installation instructions explicitly state that a selected installation automatically gains access to repositories created by the App. This is documented intended behavior, not evidence that this failed partial template operation completed it. [Install your own GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)

A user access token is not an established workaround: GitHub states that its resources and permissions are the intersection of the user and App. Owner authorization does not by itself grant the App access to unselected private repositories. It also adds authorization/refresh/revocation lifecycle. [Generate an App user token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## Smallest next action and safeguards

Retain old broker state unchanged. creationTemplate is part of the persisted configuration, so simply removing it from the existing template journal correctly fails configuration equality. Use a separately owned direct-mode state directory for a distinct genuine thread/accepted receipt, or an explicitly reviewed append-only per-repository provisioning-mode design if long-term coexistence requires it. Do not weaken the equality check, migrate old incomplete intents, or manufacture a new request just to gather diagnostics.

Keep auto_init:true for the first direct mode operation: it is already implemented and avoids inventing a staged empty-repository initializer. Its success requires more than HTTP201: exact owner/private/name/marker, a fresh exact-repository token, Actions disable and readback, actual initial branch, and final source hash verification. Existing checks implement these boundaries. If fresh scoped access or initialization fails, retain the exact intent and stop; never broaden selection to unrelated repositories or pass developer credentials into the runtime. A 422 may still have side effects.

## Minimal diagnostic repair for the next genuine operation

In the existing request helper, preserve the original status/header failure first. For rejected creation routes only, attempt a strictly size/time-bounded JSON read (for example 64 KiB within the existing request deadline), then project only known validation error code/resource/field enums and recognized fixed message categories into the existing WeakMap diagnostic and durable intent. Never retain arbitrary message, value, URL, request, token, or raw response in public/application evidence. Oversize, malformed, aborted or unrecognized bodies must leave the original rejection and uncertain intent intact. No automatic retry follows diagnostic capture. The missing original body cannot be recovered retroactively; the request ID can support an operator support inquiry if needed.

Reuse the existing broker tests for known/unknown validation payloads, oversize/malformed/read-error bodies, no secrets in projected diagnostics, and reopened incomplete creation issuing zero POSTs. Existing direct-mode request-body and scoped-token tests should remain strict. This is a small existing-helper change, not another harness or provisioning framework.
