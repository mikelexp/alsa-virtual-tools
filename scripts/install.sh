#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"
SOURCE="${ROOT_DIR}/alsachain"
DESTINATION="${INSTALL_DIR}/alsachain"
MODULE_SOURCE="${ROOT_DIR}/libasound_module_pcm_alsachain_status.so"

test -f "${SOURCE}" || {
  printf '%s\n' "Binary not found: ${SOURCE}" >&2
  exit 1
}
test -f "${MODULE_SOURCE}" || {
  printf '%s\n' "ALSAChain status PCM module not found: ${MODULE_SOURCE}" >&2
  exit 1
}

mkdir -p "${INSTALL_DIR}"
install -m 755 "${SOURCE}" "${DESTINATION}"
for directory in /usr/lib/alsa-lib /usr/lib64/alsa-lib /usr/local/lib/alsa-lib; do
  if [[ -d "${directory}" ]]; then
    sudo install -Dm755 "${MODULE_SOURCE}" "${directory}/libasound_module_pcm_alsachain_status.so"
    break
  fi
done
printf 'Installed %s\n' "${DESTINATION}"
if [[ ":${PATH}:" != *":${INSTALL_DIR}:"* ]]; then
  printf '%s\n' "Add ${INSTALL_DIR} to PATH to run alsachain directly."
fi
