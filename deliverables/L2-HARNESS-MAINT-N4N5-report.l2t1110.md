# L2-HARNESS-MAINT-N4N5 — report (l2t1110)

Worktree /mnt/vast/home/brad/git/wt/L2-HARNESS-MAINT-N4N5-lane2, branch
cl/lane2-harness-maint-n4n5 off trunk 943c4314. Owned files: run-journeys.py,
check-gate.py, ui-drive.cjs, test-channel-selfcheck.py (all under
.hermes/plans/harness/l2-trunk-journeys/). No product code touched.

## 0. Baseline facts (verified before any edit)

- journeys/ declares exactly: J1, J2, J3 (grep '^id:' journeys/*.yaml).
- Lane receipts root latest -> 20261101T151312Z; run-meta: verdict ALL-GREEN,
  verdicts {J1:green, J2:green, J3:green}, fake_mode true, advisory false,
  app_base http://localhost:5193, fake_restore.restore_ok true.
  (Full capture: this section was produced by direct run-meta read; no other
  receipts-root mutation.)

## 1. RED-first captures

### RED-1 (pre-fix): check-gate superset mutant PASSES (the N5 hole)
Crafted run-meta with verdicts {J1,J2,J3,JBOGUS} all green, fake_mode, trunk,
restore ok -> `check-gate.py` rc=0, "GATE-VERDICT green". JBOGUS never declared.

### RED-2 (pre-fix): driver never reads the attestation (the N4 hole)
`grep -n route_api_wrapped run-journeys.py` -> no match (rc=1). The grading
lives inline in run_journey() (subprocess-coupled); no pure function exists to
drive, so a receipt with route_api_wrapped:false could not make the driver RED.

### RED-3 (pre-fix): prototype-extraction bypasses counter AND attestation
ui-drive /tmp copy with `delete context.route;
Object.getPrototypeOf(context).route.call(context, '**/api/ai/**', ...)`
before the first goto, run against a dead app-base:
  route_handlers_used = 0   (counter missed the handler)
  route_api_wrapped   = True (attestation still claimed wrapped)
=> the interception landed with BOTH tripwires reporting clean. This is the
advc-c2 evidence shape; post-fix the identity snapshot must flip it false.

### RED-4 (pre-fix): dead self-check regex arm
test-channel-selfcheck.py:153 arm `setDefaultNavigation\s*\(` can never match
the real Playwright API name `setDefaultNavigationTimeout(` (the literal
`Timeout` sits between the arm and the paren) — a future text-scan bypass
through that call would be invisible.

## 2. Implementation

### N4 arm 1+2 — ui-drive.cjs + run-journeys.py
- ui-drive.cjs: wrapper identities recorded (`_wrappers`) at wrap time;
  `routeApiWrappedNow()` compares each live receiver's RESOLVED method
  (own property, prototype chain as fallback) against the recorded wrapper
  OBJECT — identity, not just the `_clInterceptionProbe` marker, so a forged
  marker on a foreign function also fails. Re-evaluated at receipt write
  time. setRequestInterception is now in the snapshot set too.
- run-journeys.py: new PURE `attestation_violations(ui)` — counter arm +
  attestation arm (`attestations.route_api_wrapped is not True` -> named
  ATTESTATION-RED violation). run_journey() calls it; the self-check drives
  THE SAME function (the old local `banned_check` copy is gone — no helper
  divergence possible).
- Comment honesty (N4 arm 3): the ui-drive block at former :44-46 restated
  to exactly what the tripwires catch; residual gaps named (CDP-level
  Fetch.enable from injected page code is not observable from node; the
  snapshot grades at receipt-write time).

### N5 arm 1 — check-gate.py
`missing = declared - verdicts` replaced by exact-set equality:
declared-minus-verdicts (INCOMPLETE) and verdicts-minus-declared (SUPERSET,
tamper evidence) each block separately; a mixed diff names BOTH sides.

### N5 arm 2 — dead regex arm
Verified what ui-drive wraps today: route, routeFromHAR, setRequestInterception
ONLY — nothing wraps setDefaultNavigationTimeout. The arm is fixed to the real
API name `setDefaultNavigationTimeout` (not deleted): the CONSTRUCTION text
scan now sees that call if anyone ever writes it. Honest residual (per spec):
the runtime counter does not cover setDefaultNavigationTimeout — the text scan
is the guard; recorded in the self-check comment.

### Self-check gains (spec Verification 1-2)
- (2a2) N4 driver-enforcement arms x3: route_api_wrapped=false with a clean
  counter, attestations missing entirely, truthy-but-not-true ("yes") — all
  RED via the driver's own attestation_violations().
- (2d) N4 LIVE injection: /tmp ui-drive copy with `delete context.route;
  Object.getPrototypeOf(context).route.call(context, '**/api/ai/**', ...)` —
  asserts receipt route_api_wrapped is False AND attestation_violations()
  names it. (Pre-fix this exact scenario was the silent-green RED-3.)
- (2c) existing own-property injection hardened: also asserts the driver
  function returns NO attestation violation for the honest wrapped receipt.
- (3) GATE N5 arms x3: superset (extra JBOGUS) blocks naming JBOGUS; mixed
  diff (J3 missing + JBOGUS extra) names both; exact set still greens.

## 3. GREEN outputs (all real runs)

### Full self-check: 50/50 OK, rc=0
Full capture: /tmp/sc-n4n5-run1.txt (tail excerpt):
    N4 INJECTION (prototype-extraction flips the attestation + driver names the violation) OK
    GATE N5: SUPERSET verdicts table (extra JBOGUS) BLOCKS, names the diff OK
    GATE N5: mixed diff (J3 missing + JBOGUS extra) BLOCKS, names BOTH OK
    GATE N5: EXACT declared set (J1/J2/J3) still greens              OK
    ...
    SELFCHECK: PASS
(grep -c ' OK$' = 50; previously 42 arms, none weakened — the 2 old belt-check
arms were REWIRED to the driver's shared function, not removed.)

### POST-FIX replay of the RED-3 bypass (the tripwire bites)
Same injection, fixed ui-drive.cjs (capture: /tmp/postfix-proto.txt):
    route_handlers_used = 0        (counter still misses it — by construction)
    route_api_wrapped   = False    (identity snapshot flipped — NEW)
    driver: ATTESTATION-RED ... route_api_wrapped is False (want true) -> journey RED

### Lane-root gate regression (spec Verification 2)
`python3 check-gate.py` against the REAL receipts root, latest
20261101T151312Z (exactly J1/J2/J3): rc=0, "GATE-VERDICT green". The
exact-set change does not disturb the real green run.

### Backend untouched (no --fake runs performed)
No journey runs were executed (spec: crafted receipts + direct function
drives preferred). Health probe proves the :3093 backend is untouched:
    health status: ok
    inferenceUrl: http://127.0.0.1:18099/api/v1   (live sampler — restored state)
    profiles: [lfm-local, qwen3.6-appliance-2, qwen3.8-thunderbeast,
               spark-x2.5-4b, qwen3.8-flash-OR, ds4.1-flash-OR]
    l2trunkj-fake present: False   zero fake profiles
:3093/:5193 never restarted or touched; no git ops outside this worktree.

## 4. Diff stat + commits

    check-gate.py               |  34 ++++-
    run-journeys.py             |  35 +++++-
    test-channel-selfcheck.py   | 140 +++++++++++++++++++--
    ui-drive.cjs                |  64 ++++++++--
    4 files changed, 243 insertions(+), 30 deletions(-)

Code commit: 24ef453775b66d4e2799fb2895e71ba6e456e120 (owned files only;
ZERO product code; no receipt-directory edits). This report + the marker are
committed in the follow-on commit on the same branch.

## 5. Honest residual-gap notes

1. setDefaultNavigationTimeout: the N5 regex fix closes the TEXT-SCAN hole
   only. No runtime counter wraps it (nothing calls it today; a future
   caller would be caught by the construction scan, not by a receipt
   counter). Noted in the self-check comment.
2. CDP-level interception (Fetch.enable from injected page code) is not
   observable from the node side at all — named in the ui-drive comment as
   a permanent gap of this tripwire design; the construction ban + the
   REAL-transport receipt (ai_request_bodies carrying real backend answers)
   remain the defense against that class.
3. The identity snapshot grades at receipt WRITE time. A detour that
   restores OUR wrapper before the write hides the swap from the snapshot;
   it cannot also un-run the handler it registered (the handler was
   registered off-protocol, and a call that went through the original never
   lands in the counter — so counter+snapshot+the zero-handler write-proof
   remain independently graded). Named in the comment block.
4. `is not True` strictness: a legacy pre-N4 receipt that predates the
   attestation field (if any existed post-merge) grades RED by design — the
   spec's "missing = RED" mandate; all lane receipts from the merged
   harness carry the field true (real latest verified green above).
5. AMENDMENT (fix-run 1, advc cycle-1 DEFECT 1, append-only — items 1-4 and
   the RED captures above stand as originally written): items 1-4 did NOT
   name the ITEM-CITED no-delete prototype-extraction shape. With the own
   wrapper left INTACT, `Object.getPrototypeOf(context).route.call(...)`
   (no deletion) keeps `recv[meth] === _wrappers[key]` TRUE, so
   route_api_wrapped stays TRUE while the ORIGINAL runs (counter 0):
   proven SILENT GREEN pre-fix (P1/P3 captures, fix-run 1 report). This is
   an UNDETECTABLE residual for the identity-snapshot tripwire — no
   property/identity inspection from node can see that class; only the
   construction ban + the real-transport ai_request_bodies receipt defend
   it. Fixed in fix-run 1: comment gap (d) in ui-drive.cjs, narrowed
   violation text in run-journeys.py, and self-check arm (2e) PINS the
   limitation (asserts route_api_wrapped stays TRUE for the no-delete
   shape — labelled a limitation pin, not a detection claim).

N4N5 DONE 24ef453775b66d4e2799fb2895e71ba6e456e120
