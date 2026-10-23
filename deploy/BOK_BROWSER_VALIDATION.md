# Bok browser publication gate

New generated revisions must pass Node tests, the static build, and real Chromium
checks before acceptance and publication. `plugins/hosting-policy.mjs` is the
single hosting-header, MIME-type and authoring-guidance definition. Publication
requires a browser receipt bound to the exact artifacts, source scenario plan,
and current policy. Existing published revisions remain readable.

Authors supply `browser-tests.json` (version 1). Its bounded declarative scenarios
use CSS selectors and the actions documented in `HOSTING_GUIDANCE`. Every scenario
needs an assertion; the plan must exercise reload. The trusted runner opens every
HTML file and executes the scenarios in fresh desktop/mobile contexts. It checks
opaque origin, runtime errors, policy violations, unsupported popup/download
attributes and action coverage of visible enabled native controls, contenteditable
fields and internal links. Errors return through `check_workspace` for repair.
There is no arbitrary model-authored browser test JavaScript or permission grant.

The browser receives captured built bytes via intercepted production-shaped URLs,
with the publisher's actual headers, MIME types and routing restrictions. External
network is unavailable. Apps must bundle essential resources and visibly handle
unavailable APIs; handled offline failures alone are not rejected. External links
are not visited. This gate checks exercised behavior, not all possible JavaScript
paths, future external-service behavior or every browser engine.

## Execution image and isolation

The existing executor owns test, build, browser and cleanup stages in one container.
Generated test/build descendants are killed before the browser runs. The browser
driver is trusted serialized code; it uses the original captured scenario plan and
captured artifact bytes, never a generated executable test or mutable dist files.

Image: `sha256:3d3169b41e9cc39b6db208b733f3f9339fd8ecbc7260612a420b663c3cf77222`.
Node 24.21.0, playwright-core 1.63.0, Chromium 153.0.8010.12. The operator builds
`bok-browser.Dockerfile` with the already verified Node image aliased as
`rolling-bok-node-24.21:verified` and the public playwright-core tarball. Verify
that tarball against the repository lock's SHA512 before building. No project
credentials or generated source enter this build context. Runtime never pulls or
builds an image.

The Dockerfile pins the official Playwright linux/amd64 manifest. The execution
capability pins the resulting local image ID and the seccomp profile SHA256.
The profile is the official Playwright v1.63.0 Docker profile, with its existing
`chroot` syscall allowance no longer conditional on an outer CAP_SYS_CHROOT.
This permits Chromium's inner user-namespace sandbox without granting that
capability in the outer namespace. Its historical Docker baseline is **not**
represented as identical to the current Docker daemon's default profile.

The container has no network, mounts or credentials, a read-only root, private
IPC, no-new-privileges, and only the executor's existing SETUID/SETGID/KILL outer
capabilities. Generated processes and Chromium run as UID/GID 1000, with
`chromiumSandbox:true`; there is no no-sandbox fallback. Limits are 768 MiB memory,
256 PIDs, 128 MiB shared memory and /tmp. Existing aggregate work/deadline and
owned-container cleanup remain authoritative. Watchdogs fail checks; elapsed time
never authorizes publication.

## Verification

Focused tests:

```
BOK_BROWSER_TESTS=1 node --test plugins/test/browser-validation.test.mjs
node --test plugins/test/isolated-execution.test.mjs plugins/test/static-publication.test.mjs plugins/test/github.test.mjs plugins/test/thread-repositories.test.mjs plugins/test/hosted-private-bok.test.mjs
```

On the existing Bok host, with its real service identity/groups and pinned Node:

```
node plugins/test/browser-executor-qualification.mjs
```

This explicitly exercises the actual Docker executor with a working fragment-state
app and Node/build-passing apps that fail on startup or click-time localStorage.
It checks browser acceptance/rejection and exact owned-container absence. It does
not need a wallet, L1/L2 transaction, model call, service restart or new host.
