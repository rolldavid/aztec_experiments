# Direct personal creation: installation access blocker

Independent reviewer: reviewer-resume-20261014. Reviewed integrated source 85ba37b4058586076936856fff1d7052845c4db4 and the existing direct-qualification evidence. Read-only diagnosis; no external mutation, service, model, wallet or financial operation.

## Result

The distinct direct-mode operation at 2026-10-14T17:17:05Z passed installation identity/profile availability and POST /user/repos returned 201. The durable broker journal records create.done=true with repository ID 1419524327 and branch main. Target is zac-williamson/bok-297c2ac922742d51f91d581254f6b53479f9b7c59d6f6e5a8e3bb2e612940b6e. The next exact-repository administration token request returned 422, request C6BB:3BC398:797670:ACDE14:6ACFB916.

Fresh access readback at 17:18:31.887Z still lists only bootstrap1419258557 and original assisted mirror1419307628. Exact new-repository token issuance again returned422, request C7E8:86A59:687C07:9BF910:6ACFB967, with the recorded explanation that the repository does not exist or is inaccessible to the parent installation. Owner readback establishes that this repository does exist, is private, and has Actions disabled. This resolves the alternative in the error: the concrete blocker is access by installation171412624. Owner readback is retained evidence, not a new reviewer API observation.

Creation authority worked. Broad permissions were accepted. This is not another template-copy failure and not evidence that repository_creation needs a different speculative permission. Ninety seconds and fresh token issuance did not resolve selection. There is no justified create replay.

## Documentation discrepancy

The official installation instructions say a selected App automatically gains access to repositories it creates. The installation management instructions repeat that rule. Successful direct creation followed by absent inventory membership and exact-scoped-token rejection does not satisfy that documented behavior. The available evidence cannot identify GitHub's internal cause or distinguish a platform defect from an undocumented condition. [Install your own App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app), [Manage installed Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)

POST /user/repos is documented for installation tokens with repository_creation:write; auto_init:true requests an initial README. It is the documented direct automatic route, and actual creation has now passed. Its automatic-access portion has not. [Repository REST API](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-for-the-authenticated-user)

The selection endpoint also documents installation tokens and installation_repositories:write, with an administrator prerequisite. The already recorded exact-target attempt returned404. No further automatic route is established by current documentation or this experiment. An App user token remains limited to resources shared by user and App; OAuth therefore cannot be presented as a proven bypass for this boundary. [Selection API](https://docs.github.com/en/rest/apps/installations#add-a-repository-to-an-app-installation), [App user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## Minimal supported unblock

Use the account owner's existing installed-App settings to add ONLY repository1419524327 while retaining Only select repositories and the existing selections. GitHub documents this repository-access control. Verify fresh inventory contains the exact new numeric ID and no unrelated additions, then obtain a fresh exact-repository token. This requires no new repository, guessed permission, all-repositories scope, OAuth subsystem, or developer token in the application. The lead already has application configuration authorization; this report does not request a new permission approval.

The existing broker can safely resume the same direct-mode journal and identical receipt after selection. Source lines207–219 show that once(create) checks its saved identity and returns the saved result when done=true; it does not execute POST/user/repos. The subsequent exact-scoped administration token and owner/name/private/marker verification remain mandatory. Existing Actions disable/readback, actual initial branch, exact accepted source and final nonforced ref checks then proceed normally. Do not edit the completed create record, reset the journal, change its configuration, clear a reservation or synthesize a new source receipt.

This is assisted recovery of the created repository. It must not be counted as unattended automatic provisioning qualification. The unresolved G11 requirement is automatic addition/access for each future private thread repository under a selected personal installation. Unlock it through GitHub clarification/fix or a separately validated supported mechanism; preserve request IDs for an operator support inquiry. Do not initiate further speculative creation or selection calls. Other application work and acceptance remain independent.

## Evidence bindings

All evidence below is under rolling-lead-bok/.build/github-direct-qualification. The state hash is a binding only; no raw private state is copied here.

- direct-result.json: `fc51b3e092d72b54d773f3e6eb81436ae194e65ef812cbb915541540c2ebb592`
- access-readback.json: `85f308150896f59aee0109158a012a35e11c3d0ecddb33687e16849939c6d3eb`
- owner-readback.json: `237153cb34b4f1179cb20f2af77acf1aab295681f5481c1c57ac042b843e1fbe`
- qualification.json: `8fb88cf1b23abd1eccddb6d35d183430dbc54166a67fdec6ec3c31191207eacb`
- github-app-state.json: `f4568060bc8f58e5b89607f50058efe869f331e185e7aa8a7bded2bc6132ae9d`
