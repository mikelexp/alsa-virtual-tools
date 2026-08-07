#!/usr/bin/env bash
set -euo pipefail

if (( EUID == 0 )); then
  printf '%s\n' 'Do not run this script as root; makepkg refuses root builds.' >&2
  exit 1
fi

for command in makepkg pacman sudo; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd -- "$script_dir"

mapfile -t packages < <(makepkg --packagelist)
if (( ${#packages[@]} != 1 )); then
  printf '%s\n' 'Could not determine the package produced by PKGBUILD.' >&2
  exit 1
fi

makepkg --cleanbuild --clean --force
sudo pacman -U --needed "${packages[0]}"

printf '\nInstalled: %s\n' "${packages[0]}"
printf '%s\n' 'Verify with: ldd -r /usr/lib/alsa-lib/libasound_module_pcm_equal.so'
