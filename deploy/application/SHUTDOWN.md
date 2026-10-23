# Application and live-feed proxy shutdown

Apply `proxy-before-app.patch` to the **full installed base unit**, preserving
its binary path, credentials, network restrictions and all other directives.
This changes ordering only. Keep the existing `BindsTo`/`Requires` dependencies,
Caddy `Type=notify` readiness, and the application's `TimeoutStopSec=infinity`.

The proxy starts first and reports its own listener readiness. The application
then starts. Shutdown runs in reverse: the application receives SIGTERM first,
ends its live-feed streams, stops admitting requests, and waits for its existing
requests and funding relay to finish. Only then does the proxy shut down. No
transaction or bridge completion deadline is added.

Do not implement this with an empty `After=` in a drop-in. Systemd dependency
lists cannot be cleared there; adding `Before=rolling-application.service` while
retaining the old `After` creates an ordering cycle. The existing availability
file's empty dependency assignments do not remove base dependencies either.
See [systemd.unit, Example 2](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#Example%202.%20Overriding%20vendor%20settings).

Before applying, inspect the base unit and all drop-ins. There must be no proxy
`ExecStartPost` or other startup command that waits for the application, and no
other `After=rolling-application.service` edge. Caddy readiness must mean its
listener is ready, not that its upstream is ready. The observed October 23 unit
uses `Type=notify`/`NotifyAccess=main` and has no `ExecStartPost`.

After `daemon-reload`, verify the **effective** proxy `Before` contains
`rolling-application.service`, its `After` does not, and the app's stop timeout
remains infinite. Validate the exact installed unit graph with
`systemd-analyze verify`. A controlled restart should queue both units together;
do not manually stop the proxy first while an application event stream is open.

The existing `scripts/rolling-public-server.test.mjs` includes a real loopback
HTTP check with an open event stream and an admitted, gated funding request.
It verifies the stream ends before funding finishes, shutdown preserves the
funding request, and the same ports can restart and publish a new revision.
The proxy in this local check is native Node HTTP, not Caddy or systemd. On the
host, separately hold `/api/events` open through Caddy during the coordinated
restart and verify EOF, normal service exit (no SIGKILL/watchdog), listener
readiness, and a new revision stream after restart. Root owns this live check.
