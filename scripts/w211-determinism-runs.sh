#!/usr/bin/env bash
# W211-MACH-1 determinism runs (l2t1740): 3 CONSECUTIVE green G1 runs against
# the coder-owned SEAM-A private stack (:3193/:5293/:43117 — never the orch
# stack). Each run's receipts are snapshotted into run-N/ for the byte-stability
# comparison (deck content md5 + canonical compile sha).
set -uo pipefail
WT=/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210
RC="$WT/app/e2e/receipts/w211-mach1-l2t1740"
NODE_BIN=/home/brad/.local/share/mise/installs/node/26.8.1/bin
export PATH="$NODE_BIN:/home/brad/.local/bin:/usr/local/bin:/usr/bin:/bin"
for n in 1 2 3; do
  echo "=== G1 determinism run $n ==="
  ( cd "$WT/app" \
    && BASE_URL=http://localhost:5293 API_URL=http://localhost:3193 \
       W211_REPLAY_LOG="$WT/.run/w211/replay-requests.jsonl" \
       npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium -g "G1" \
       > "$RC/run-$n.raw" 2>&1 )
  code=$?
  echo "run $n exit=$code"
  mkdir -p "$RC/run-$n"
  cp "$RC"/g1-*.json "$RC"/g1-*.jsonl "$RC"/run-$n/ 2>/dev/null
  [ $code -ne 0 ] && { echo "RUN $n FAILED — stopping the determinism claim"; exit $code; }
done
echo "=== byte-stability comparison ==="
for n in 1 2 3; do
  md5sum "$RC/run-$n/g1-deck-content.json" | awk -v n=$n '{print "run",n,"deck-content md5:",$1}'
  python3 -c "import json;d=json.load(open('$RC/run-$n/g1-final-compile-sha.json'));print('run',n,'canonicalCompileSha:',d['canonicalCompileSha']);print('run',n,'rawCompileSha:',d['rawCompileSha'])"
done
echo "DETERMINISM RUNS COMPLETE"
