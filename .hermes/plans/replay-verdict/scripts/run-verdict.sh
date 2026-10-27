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

# D11 (advc-cycle-1): this script MUST NOT create paths outside
# .hermes/plans/replay-verdict/ (spec Rules). The worktree is expected to
# already carry node_modules (lane standard provisioning, or tsx on PATH);
# if neither is available we fail with a diagnostic instead of silently
# writing a root-level symlink.
if [ ! -e node_modules ] && ! command -v tsx >/dev/null 2>&1 \
   && [ ! -x /home/brad/.hermes/hermes-agent/node_modules/.bin/tsx ]; then
  echo "run-verdict.sh: FATAL - no node_modules in $ROOT and no tsx on PATH." >&2
  echo "  Provision node_modules in this worktree (lane standard: symlink to the" >&2
  echo "  main checkout's node_modules) BEFORE running; this script will not" >&2
  echo "  create it (creating root-level paths violates the lane's file scope)." >&2
  exit 1
fi

if [ -x node_modules/.bin/tsx ]; then TSX="$ROOT/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then TSX="$(command -v tsx)"
else TSX="/home/brad/.hermes/hermes-agent/node_modules/.bin/tsx"; fi

# the resolve hook is the HARVEST one (byte-pinned, read-only — reused as-is)
"$TSX" --import "file://$ROOT/.hermes/plans/replay-harvest/scripts/hooks-resolve.mjs" "$BASE/scripts/replay_verdict.mts"

echo "== verdict fates:"
ls "$BASE/fates" | grep -c json || true
