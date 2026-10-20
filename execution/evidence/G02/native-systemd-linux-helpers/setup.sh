#!/bin/sh
# Public official packages only. No developer/project environment or mounts.
set -eu
umask 077
export DEBIAN_FRONTEND=noninteractive LC_ALL=C
S=/run/setup
mkdir -p "$S" /opt/rolling-systemd-regression
printf '#!/bin/sh\nexit 101\n' >/usr/sbin/policy-rc.d
chmod 755 /usr/sbin/policy-rc.d
# The image's official source/keyring bytes are retained as provenance.
# Disable only the disposable image's archive deletion hook, retaining debs for closure.
if [ -f /etc/apt/apt.conf.d/docker-clean ]; then
  sha256sum /etc/apt/apt.conf.d/docker-clean >"$S/docker-clean.sha256"
  rm /etc/apt/apt.conf.d/docker-clean
fi
sha256sum /usr/share/keyrings/ubuntu-archive-keyring.gpg >"$S/keyring.sha256"
find /etc/apt/sources.list.d -type f -exec sha256sum '{}' \; >"$S/sources.sha256"
# Finite logs in tmpfs; apt authentication is never disabled.
ulimit -f 8192
(
  apt-get -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 -o Acquire::http::Timeout=8 -o Acquire::https::Timeout=8 update
  apt-get -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 --print-uris --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3 >"$S/uris"
  # APT derives these byte counts/hashes from authenticated package indexes.
  awk '/^\047/ {if ($3 !~ /^[0-9]+$/ || $4 !~ /^SHA256:[0-9a-f]+$/) exit 1; count++; total+=$3} END {if(count<1 || count>64 || total>104857600) exit 1; print total}' "$S/uris" >"$S/archive-byte-bound"
  apt-get -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 -o Acquire::http::Timeout=8 -o Acquire::https::Timeout=8 --download-only --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3
  # --no-download prevents an install-time fallback to another network fetch.
  apt-get --no-download --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3
  /usr/bin/python3 /opt/rolling-closure.py
) >"$S/log" 2>&1 &
pid=$!
# Monitor finite public setup traffic and writable-root usage. Crossing either
# cap is a failure, never a successful setup. Overshoot is bounded by polling,
# not represented as a kernel network quota.
start=$(date +%s)
while kill -0 "$pid" 2>/dev/null; do
  now=$(date +%s)
  rx=$(cat /sys/class/net/eth0/statistics/rx_bytes)
  disk=$(du -skx /usr /etc /opt /var/lib/dpkg | awk '{n+=$1} END {print n}')
  if [ $((now-start)) -ge 150 ] || [ "$rx" -gt 157286400 ] || [ "$disk" -gt 1048576 ]; then
    kill -TERM "$pid" 2>/dev/null || true
    printf 'SETUP_LIMIT\n'
    exit 71
  fi
  sleep 1
done
wait "$pid"
printf 'SETUP_COMPLETE\n'
