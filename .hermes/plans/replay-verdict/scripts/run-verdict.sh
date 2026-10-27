#!/usr/bin/env bash
# MATRES-REPLAY VERDICT leg V2 — one-command offline replay.
#   bash .hermes/plans/replay-verdict/scripts/run-verdict.sh
# Reuses the harvest harness's resolve hook (read-only) + node_modules lane
# standard. NO network (fetch stubbed to throw, OAK env deleted). Writes ONLY
# under .hermes/plans/replay-verdict/fates/.
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"          # replay-verdict/
ROOT="$(cd "$BASE/../../.." && pwd)"
cd "$ROOT"

[ -e node_modules ] || ln -sfn /mnt/vast/home/brad/git/computable-lab/node_modules node_modules

if [ -x node_modules/.bin/tsx ]; then TSX="$ROOT/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then TSX="$(command -v tsx)"
else TSX="/home/brad/.hermes/hermes-agent/node_modules/.bin/tsx"; fi

# the resolve hook is the HARVEST one (byte-pinned, read-only — reused as-is)
"$TSX" --import "file://$ROOT/.hermes/plans/replay-harvest/scripts/hooks-resolve.mjs" "$BASE/scripts/replay_verdict.mts"

echo "== verdict fates:"
ls "$BASE/fates" | grep -c json || true
