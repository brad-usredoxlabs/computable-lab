#!/usr/bin/env bash
# L2-SUITE-A: fixture smoke for lib/honest-cli.ts (the five FREEFORM
# acceptance #2 shapes (a)-(e)). Expect: (a) events-bound, (b) cards,
# (c) honest-failure, (d) exit 1 (silent), (e) exit 1 (unbound label).
set -u
# repo root = three levels up from the harness dir
cd "$(dirname "$0")/../../../.."
CLI=.hermes/plans/harness/l2-suite-a/lib/honest-cli.ts
run() {
  printf '%s' "$1" | node --no-warnings "$CLI" 2>/tmp/honest-cli-stderr.txt
  local rc=$?
  echo "rc=$rc | $(head -1 /tmp/honest-cli-stderr.txt | head -c 140)"
}
echo "(a) events-bound (bound labwareId):"
run '{"result":{"success":true,"events":[{"labwareId":"L1","details":{}}]},"context":{"deckIds":["L1"]}}'
echo "(b) cards:"
run '{"result":{"success":true,"clarificationRequests":[{"id":"c1","prompt":"?","options":[]}]}}'
echo "(c) honest-failure:"
run '{"result":{"success":false,"error":"the wall names itself"}}'
echo "(d) silent (must rc=1):"
run '{"result":{"success":true,"events":[]}}'
echo "(e) unbound raw-label (must rc=1):"
run '{"result":{"success":true,"events":[{"labwareId":"RAW-plate1","details":{}}]},"context":{"deckIds":["L1"]}}'
