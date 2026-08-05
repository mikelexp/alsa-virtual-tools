#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f dist/index.js ]]; then
  printf '%s\n' 'Build output is missing. Running setup first.' >&2
  ./setup.sh
fi

exec node dist/index.js "$@"
