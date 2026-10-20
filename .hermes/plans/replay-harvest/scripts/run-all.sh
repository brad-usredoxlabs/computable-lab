#!/usr/bin/env bash
# MATRES-REPLAY harvest leg — ONE-COMMAND OFFLINE RE-RUN PROOF.
#
#   bash .hermes/plans/replay-harvest/scripts/run-all.sh
#
# Rebuilds H1 index + H2/H3/H4 fate/panel artifacts from the harvested read-only
# copies ONLY. NO network (fetch is harness-stubbed to throw; OAK env var is
# deleted; engine path is remote-blind by construction). NO writes outside
# .hermes/plans/replay-harvest/. NO product code touched.
#
# Requires: node >= 22.6 with type stripping (tsx fallback), PyYAML.
# node_modules resolves via the lane-standard symlink to the shared checkout:
#   node_modules -> /mnt/vast/home/brad/git/computable-lab/node_modules
set -euo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$BASE/../../.." && pwd)"
cd "$ROOT"

# lane-standard dependency path (idempotent, matches every other wt/ worktree)
[ -e node_modules ] || ln -sfn /mnt/vast/home/brad/git/computable-lab/node_modules node_modules

# tsx: prefer worktree/shared, fall back to the hermes-provided one
if [ -x node_modules/.bin/tsx ]; then TSX="$ROOT/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then TSX="$(command -v tsx)"
else TSX="/home/brad/.hermes/hermes-agent/node_modules/.bin/tsx"; fi

echo "== H1 harvest index"
python3 "$BASE/scripts/harvest_index.py"

echo "== H2/H3/H4 instrumented replay (offline)"
"$TSX" --import "file://$BASE/scripts/hooks-resolve.mjs" "$BASE/scripts/replay_spine.mts"

echo "== source hashes (originals are read-only copies; sha256 pin of what was harvested)"
( cd "$BASE" && { find transcripts journal records fixtures/materialRefFields.pinned.ts -type f \( -name '*.json' -o -name '*.yaml' -o -name '*.ts' \) -print0 | sort -z | xargs -0 sha256sum; } > fates/harvest-hashes.txt )

echo "== done. artifacts:"
ls "$BASE" && echo "panels: $(ls "$BASE/panels" | wc -l)  fates: $(ls "$BASE/fates" | grep -v '^_' | grep -c json || true)"
