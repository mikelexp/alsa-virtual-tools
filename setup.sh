#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 22 or newer is required.' >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' 'pnpm is required. Install it with: corepack enable && corepack prepare pnpm@latest --activate' >&2
  exit 1
fi

pnpm install
make -C native
pnpm build
printf '%s\n' 'Setup complete. Run ./run.sh doctor before creating any interface.'
