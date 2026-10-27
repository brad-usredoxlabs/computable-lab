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

# D11 (advc-cycle-1) + N5 (advc-cycle-2): this script MUST NOT create paths
# outside .hermes/plans/replay-verdict/ (spec Rules), and its fail-diagnostic
# must be REACHABLE in the realistic failure mode. Cycle-2 finding N5: the old
# single guard required the hardcoded hermes-agent tsx fallback to ALSO be
# missing, so on any host where that fallback exists the script sailed past the
# guard and tsx died with ERR_MODULE_NOT_FOUND ('ajv'). Root cause: the repo's
# own module resolution REQUIRES the worktree node_modules — tsx-on-PATH or the
# fallback is only a LAUNCHER, never a substitute for repo deps. Two reachable
# branches, neither of which creates any external path:
if [ ! -d node_modules ]; then
  echo "run-verdict.sh: FATAL - no node_modules in $ROOT." >&2
  echo "  The harness imports server/ modules (ajv, yaml, ...); those resolve via" >&2
  echo "  the WORKTREE's node_modules regardless of which tsx launcher runs, so a" >&2
  echo "  tsx on PATH does not substitute. Provision node_modules in this worktree" >&2
  echo "  (lane standard: symlink to the main checkout's node_modules) BEFORE" >&2
  echo "  running; this script will not create it (root-level paths violate the" >&2
  echo "  lane's file scope — D11)." >&2
  exit 1
fi
if [ ! -x node_modules/.bin/tsx ] && ! command -v tsx >/dev/null 2>&1 \
   && [ ! -x /home/brad/.hermes/hermes-agent/node_modules/.bin/tsx ]; then
  echo "run-verdict.sh: FATAL - node_modules present but no tsx launcher (worktree .bin, PATH, or known fallback)." >&2
  echo "  Install tsx (or provision the main checkout's node_modules) BEFORE running." >&2
  exit 1
fi

if [ -x node_modules/.bin/tsx ]; then TSX="$ROOT/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then TSX="$(command -v tsx)"
else TSX="/home/brad/.hermes/hermes-agent/node_modules/.bin/tsx"; fi

# the resolve hook is the HARVEST one (byte-pinned, read-only — reused as-is)
"$TSX" --import "file://$ROOT/.hermes/plans/replay-harvest/scripts/hooks-resolve.mjs" "$BASE/scripts/replay_verdict.mts"

echo "== verdict fates:"
ls "$BASE/fates" | grep -c json || true
