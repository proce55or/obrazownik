#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print -u2 "Nie znaleziono Node24.21.x. Launcher niczego nie instaluje."
  exit 1
fi
exec node scripts/start-bielik.mjs "$@"
