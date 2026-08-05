#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:?Usage: package-release.sh VERSION [ARCH]}"
ARCH="${2:-x86_64}"
APP_NAME="alsa-virtual-tools"
DIST_DIR="${ROOT_DIR}/dist"
RELEASE_DIR="${DIST_DIR}/release"
TARBALL="${DIST_DIR}/${APP_NAME}-${VERSION}-linux-${ARCH}.tar.gz"

test -x "${DIST_DIR}/${APP_NAME}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

install -m 755 "${DIST_DIR}/${APP_NAME}" "${RELEASE_DIR}/${APP_NAME}"
install -m 755 "${ROOT_DIR}/scripts/install.sh" "${RELEASE_DIR}/install.sh"
install -m 644 "${ROOT_DIR}/README.md" "${RELEASE_DIR}/README.md"

tar -C "${RELEASE_DIR}" -czf "${TARBALL}" "${APP_NAME}" install.sh README.md
sha256sum "${TARBALL}" > "${DIST_DIR}/SHA256SUMS"
printf 'Created release archive: %s\n' "${TARBALL}"
