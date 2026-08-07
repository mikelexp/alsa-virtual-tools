#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="$(mktemp -d)"
CONFIG="${TEMP_DIR}/asound.conf"
STATUS="${TEMP_DIR}/profile.status"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

cat > "${CONFIG}" <<EOF
</usr/share/alsa/alsa.conf>

pcm.monitored {
    type alsachain_status
    status_path "${STATUS}"
    slave_name "monitored_target"
}

pcm.monitored_target {
    type plug
    slave.pcm "null"
}
EOF

ALSA_PLUGIN_DIR="${ROOT_DIR}/build" ALSA_CONFIG_PATH="${CONFIG}" \
  aplay -D monitored -t raw -f S16_LE -c 2 -r 44100 -d 1 /dev/zero

test -f "${STATUS}"
test "$(<"${STATUS}")" != "${STATUS#*state: Playing}"
