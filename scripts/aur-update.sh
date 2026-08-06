#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:?Usage: aur-update.sh VERSION}"
REPO_NAME="alsachain-bin"
AUR_SSH="ssh://aur@aur.archlinux.org/${REPO_NAME}.git"
ARCHIVE="alsachain-${VERSION}-linux-x86_64.tar.gz"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alsachain-aur.XXXXXX")"
trap 'rm -rf "${WORK_DIR}"' EXIT

cd "${ROOT_DIR}"
gh release download "v${VERSION}" \
  --repo mikelexp/alsachain \
  --pattern "${ARCHIVE}" \
  --dir "${WORK_DIR}" \
  --clobber

HASH="$(sha256sum "${WORK_DIR}/${ARCHIVE}" | cut -d' ' -f1)"
git clone "${AUR_SSH}" "${WORK_DIR}/aur"
cp "${ROOT_DIR}/PKGBUILD" "${WORK_DIR}/aur/PKGBUILD"

cd "${WORK_DIR}/aur"
sed -i "s/^pkgver=.*/pkgver=${VERSION}/" PKGBUILD
sed -i "s/^pkgrel=.*/pkgrel=1/" PKGBUILD
sed -i "s/^sha256sums=.*/sha256sums=('${HASH}')/" PKGBUILD
makepkg --verifysource
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "Update to v${VERSION}"
git push origin master
