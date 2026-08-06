#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist"
OUT_FILE="${OUT_DIR}/alsachain"

command -v bun >/dev/null 2>&1 || {
  printf '%s\n' 'Bun is required. Install it from https://bun.sh' >&2
  exit 1
}

mkdir -p "${OUT_DIR}"
rm -f "${OUT_FILE}"

cd "${ROOT_DIR}"
bun build src/index.tsx \
  --compile \
  --target=bun-linux-x64 \
  --outfile="${OUT_FILE}"

test -x "${OUT_FILE}"
"${OUT_FILE}" doctor >/dev/null
printf 'Built standalone executable: %s\n' "${OUT_FILE}"
