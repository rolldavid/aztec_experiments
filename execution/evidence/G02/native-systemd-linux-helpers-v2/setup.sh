#!/bin/sh
# Public official packages only. No developer/project environment or mounts.
set -eu
umask 077
# Drain every byte while retaining at most two64KiB chunks. Unlike ulimit -f,
# this caps only the diagnostic sink, never authenticated APT data files.
bounded_log() {
  directory=$1
  while :; do
    dd bs=4096 count=16 of="$directory/setup-next.log" 2>/dev/null
    if [ ! -s "$directory/setup-next.log" ]; then rm "$directory/setup-next.log"; break; fi
    if [ -f "$directory/setup.log" ]; then mv "$directory/setup.log" "$directory/setup-previous.log"; fi
    mv "$directory/setup-next.log" "$directory/setup.log"
  done
}
if [ "${1-}" = '--log-sink' ]; then
  [ "$#" -eq 2 ] || exit 70
  bounded_log "$2"
  exit
fi
[ "$#" -eq 0 ] || exit 70
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
# Preserve originals; select only authenticated main packages required here.
cat >/opt/rolling-systemd-regression/main.sources <<'APT_SOURCES'
Types: deb
URIs: http://ports.ubuntu.com/ubuntu-ports/
Suites: noble noble-updates noble-security
Components: main
Architectures: arm64
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
APT_SOURCES
apt_public() {
  apt-get -o Dir::Etc::sourcelist=/opt/rolling-systemd-regression/main.sources \
    -o Dir::Etc::sourceparts=- -o Acquire::Languages=none "$@"
}

# FIFO is transient; bounded log/stage files survive container exit for capture.
mkfifo "$S/log-pipe"
/bin/sh /opt/rolling-setup.sh --log-sink /opt/rolling-systemd-regression <"$S/log-pipe" &
sink=$!
phase() { printf '%s\n' "$1" >/opt/rolling-systemd-regression/setup-stage; }
(
  phase apt-index
  apt_public -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 -o Acquire::http::Timeout=8 -o Acquire::https::Timeout=8 update
  phase apt-plan
  apt_public -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 --print-uris --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3 >"$S/uris"
  # APT derives these byte counts/hashes from authenticated package indexes.
  awk '/^\047/ {if ($3 !~ /^[0-9]+$/ || $4 !~ /^SHA256:[0-9a-f]+$/) exit 1; count++; total+=$3} END {if(count<1 || count>64 || total>104857600) exit 1; print total}' "$S/uris" >"$S/archive-byte-bound"
  phase apt-download
  apt_public -o Acquire::ForceHash=SHA256 -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o Acquire::Retries=0 -o Acquire::http::Timeout=8 -o Acquire::https::Timeout=8 --download-only --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3
  # --no-download prevents an install-time fallback to another network fetch.
  phase apt-install
  apt_public --no-download --yes --no-install-recommends install \
    systemd=255.4-1ubuntu8.17 libsystemd-shared=255.4-1ubuntu8.17 \
    libsystemd0=255.4-1ubuntu8.17 systemd-dev=255.4-1ubuntu8.17 python3
  phase closure
  /usr/bin/python3 /opt/rolling-closure.py
  phase complete
) >"$S/log-pipe" 2>&1 &
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
set +e
wait "$pid"
code=$?
wait "$sink"
sink_code=$?
set -e
[ "$sink_code" -eq 0 ] || exit 73
[ "$code" -eq 0 ] || exit "$code"
printf 'SETUP_COMPLETE\n'
