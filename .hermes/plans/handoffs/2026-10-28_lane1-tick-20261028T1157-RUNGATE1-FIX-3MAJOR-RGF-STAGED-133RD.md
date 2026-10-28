# Handoff ADDENDUM — lane 1 tick 2026-10-28 (late) · RUNGATE1 CLOSED VERDICT: FIX (3 MAJOR + 4 MINOR) · FIX RUN STAGED, NOT LAUNCHED (budget) — 133rd

Supersedes the NEXT-TICK playbook of the 132nd handoff (written pre-gate-close). Everything
else in the 132nd stands (merge c6cc1960, gc-fid-nas proved, AS ledger).

## Gate outcome (first-hand, receipts verified to exist)

RUNGATE1 (tier-1 computable vision, exited rc=0 11:32:12) rendered VERDICT: fix.
Receipts REAL: report.md 23KB + trail.json 50KB + probe2/trail.json + 17 screenshots under
/home/brad/.hermes/cl/receipts/GC-11/RUNGATE1/20261028T152158Z/. Served-candidate pre-check
passed (5192 served the merged checkout). The reviewer self-audited its trail, re-verified
negatives (attempt1 aborted on ITS OWN sequencing error — kept for honesty, not cited), and
0 console errors on the exercised flows. Criteria: (b),(c) PASS (the M2 override path and the
M1 new-run-figures render verified live); (a) FAIL (outlier marker invisible at 1:1); (e) FAIL
(13-column table wraps to 1-3 letters/line at 1280px); (d) fails via DEFECT-3.

DEFECTS (full definitions + screenshot paths + root causes in the report §DEFECTS):
- D1 MAJOR table unreadable at 1280px (CSS width:100% + overflow-wrap:anywhere, no min-width,
  no scroll wrapper) -> orch-ratified fix: min-width + horizontal-scroll + nowrap headers;
  no ellipsis re-introduction.
- D2 MAJOR outlier point not visibly marked (1px dashed rim, same color as fill) -> distinct
  rim/radius/halo, DOM contract kept.
- D3 MAJOR composite edit state survives run switch — phantom pending diff + could submit the
  OLD run's edited params against the NEW run's frozen refs (M1-class provenance; component
  useState(() => frozenParams(page)) not re-keyed on activeRunId) -> re-key/reset per GC-9
  selection-clears-edits discipline, RED test required.
- D4/D5/D6/D7 MINOR: excluded point clipped out of plot x-domain; residual labels clipped in
  24px bars; inline text runs together; disabled submit not visually distinguishable.
NOT counted against GC-11 (reviewer's own §observations): pre-existing 'No rows' cards, empty
source-run pane (fixture revision publishes no ctx.view), back-nav state loss.

## Staged for next tick (NOT launched — 45-min budget expired at 11:32 gate close)

- Brief READY: /home/brad/.hermes/cl/lanes/1/prompts/coder-GC11-rgf-l1t1150.txt (defects
  verbatim + fix directions + frozen pins: the M1 value-level test + compare.test.tsx
  stale-manifest guard must stay GREEN; ParameterForm/AnalysisPage.css/ViewRenderer.test.tsx
  0-byte; report path pattern gc11-rgf-report-l1t<ts>.md).
- Worktree READY: /mnt/vast/home/brad/git/wt/gc-11-rungate1-lane1-l1t1150 @ eec1a4ca,
  branch wt/gc-11-rungate1-lane1-l1t1150, node_modules symlinks in place (3).
- NEXT TICK FIRST ACTION: claim under queue lock, launch cl-coder slot-0 (both slots free —
  stale pid files for dead 1361737/927908; flock -n + systemd-run survivor, PATH export per
  AS-L1T1045-1). After exit: adversarial review (delta eec1a4ca..HEAD, cloud deepseek, unique
  report path), then RUNGATE2 browser gate (copy the rungategate1 prompt, stamp candidate sha,
  receipts RUNGATE2/, leg-level re-check = D1-D7 + (a)/(e)/(d) re-judged + M1/D3 regression:
  toggle-fit-switch-back must show (no pending changes)). GC-11 stays in-progress until
  RUNGATE2 accepts on real receipts.
- Then GC-12 claim (see claim_ready_20261028T1130 in its block; both slots free today, but the
  rgf fix run takes slot-0 first — GC-12 can run CONCURRENT on slot-1 if re-anchoring the
  GC-12 spec vs merged GC-11 doesn't surface a conflict; otherwise next tick).

## assumptions:

- AS-L1T1157-1 NEW: RUNGATE1 leg-(c) briefing (AS-L1T1130-3) worked as intended — the reviewer
  used the override door, verified the new run's own figures (M1 fix proven in the live
  browser), and judged (c) PASS. No assumption was needed to pass a leg; the gate exercised the
  shipped path. evidence_debt=false.
- AS-L1T1157-2 NEW: D1 fix direction ratified as CSS min-width + scroll (all 13 columns stay
  rendered full-text) rather than a column-drop — a TS allowlist would violate the no-hardcode
  rule and a declarative column-policy change exceeds a gate-fix's scope. The gate re-judges
  readability; the criterion (e) 'full-text at 1280px' is met WITH horizontal scroll.
  evidence_debt=false.
- Carried open/closed per the 132nd handoff's block (unchanged; AS-L1T0015 stays CLOSED).
