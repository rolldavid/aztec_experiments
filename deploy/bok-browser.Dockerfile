# Operator build only. Never built by generated source or during a request.
FROM rolling-bok-node-24.21:verified AS node
FROM mcr.microsoft.com/playwright@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7
COPY --from=node /usr/bin/node /usr/local/bin/node
# This public tarball is verified against package-lock.json before the build.
COPY playwright-core-1.63.0.tgz /tmp/playwright-core.tgz
RUN mkdir -p /opt/bok-browser/node_modules/playwright-core && tar -xzf /tmp/playwright-core.tgz --strip-components=1 -C /opt/bok-browser/node_modules/playwright-core && rm /tmp/playwright-core.tgz
