# Report: L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1 unit u2proberun3

## Problem
Run 3/3 of the fresh arm failed every time with a tile-click timeout.
Runs 1-2 passed consistently. The probe fired `.click({force:true})` at
line 118 immediately after `page.goto` (domcontentloaded) with no element-presence
wait and no post-goto settle for the graph host. A cold-remount or in-flight
HMR/React suspense on the third fresh page.goto of the SAME URL could leave
`.tile` unmounted when the click was issued.

## Diagnosis
The `waitSurface` function already polls patiently (chat-clarification-slot /
clarification-identity-search, 240s) but only fires AFTER the tile click.
The click at :118 was the unpinned step — it had no `waitFor` and no retry.

## Fix
- Added `await tile.waitFor({ state: 'visible', timeout: 60000 })` before the
  tile click in both the fresh arm (runOne) and continuation arm (runContinuation).
- On click/wait failure, the probe captures a screenshot and the first 8000 chars
  of `page.content()` to `DIR/artifacts/run{idx}/` for next diagnosis.
- Measurement semantics are byte-identical (same URL, same click target, same
  well-click sequence, same requestBodySha256 capture, same clarCount extraction).

## Changed Files
- `.hermes/probes/reqcount-nondet-probe.cjs` (+22 lines, -2 lines, 24 net)

## Verification
- `node --check .hermes/probes/reqcount-nondet-probe.cjs` -> exit 0 (syntax valid)
- `git diff --stat` shows only the probe file changed
- `git diff | grep -c '^-'` = 2 (<= 10)
- Probe run N=3 (fresh arm) — all 3 runs passed:

Run 1/3...
  clarCount=0, arm=none, slots=-, streamFrames=8, streamBytes=11412, wells=16, sha=2ca35b6b63e65e25cd871164ada83b4da853eb88eefd405940f956698b3af13b
Run 2/3...
  clarCount=0, arm=none, slots=-, streamFrames=8, streamBytes=11420, wells=16, sha=2ca35b6b63e65e25cd871164ada83b4da853eb88eefd405940f956698b3af13b
Run 3/3...
  clarCount=0, arm=none, slots=-, streamFrames=8, streamBytes=11396, wells=16, sha=2ca35b6b63e65e25cd871164ada83b4da853eb88eefd405940f956698b3af13b

All runs PASSED. SHA identical across all 3 runs.

## Commits
Commit 1: 65e62aec — probe fix (waitFor + failure artifacts)
Commit 2: a6569639 — report
Commit 3: ddddc1b2 — exit marker paperwork

L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1 UNIT u2proberun3 DONE a6569639dfc32eed7232ac4419ad47af4a76a7f7

L2-CLARIFY-REQUEST-COUNT-1-u2proberun3-pwfix2 UNIT unit DONE cd08598c93b09f418dedb3b9d873e11a837cd7ef
