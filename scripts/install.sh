#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"
SOURCE="${ROOT_DIR}/alsa-virtual-tools"
DESTINATION="${INSTALL_DIR}/alsa-virtual-tools"

test -f "${SOURCE}" || {
  printf '%s\n' "Binary not found: ${SOURCE}" >&2
  exit 1
}

mkdir -p "${INSTALL_DIR}"
install -m 755 "${SOURCE}" "${DESTINATION}"
printf 'Installed %s\n' "${DESTINATION}"
if [[ ":${PATH}:" != *":${INSTALL_DIR}:"* ]]; then
  printf '%s\n' "Add ${INSTALL_DIR} to PATH to run alsa-virtual-tools directly."
fi
