# FAME-4 browser-gate platform gap — decision request (lane 1, 2026-11-01 19:45)

## What happened
FAME-4 (data-only, zero-code item) passed adv cycle-2 ACCEPT with an orchestrator live recompute
(AOUT-000099: eligible 1664.7037274749032/pct 100, excluded row null, denom exact). The final gate —
browser render of the published summary (spec §11 AC8) — returned VERDICT: fix
(/home/brad/.hermes/cl/receipts/FAME-4/gate-l1t1855/report.md, trail.json + shots). Obligations 3
(D3 echo render) and 4 (append-only history) PASSED with full round trips. Obligations 1-2 could
NOT be exercised due to two PRE-EXISTING platform defects:

- D1 MAJOR: /analysis run list caps at the oldest 50 runs (server/src/analysis/analysisService.ts:240
  `list(kind, limit = 50)`; AnalysisHandlers.listRuns reports total = runs.length so the client is
  told 50 of 61). Deep link /analysis?run=<id> gates on list membership
  (app/src/analysis/AnalysisPage.tsx:298-300), so unlisted runs are unreachable in the UI. Cap
  predates FAME-4 (56d4a49f, 2026-09-05); FAME-4's 15 new runs pushed the lane past it.
- D2 MAJOR: no surface renders an analysis-output artifact's {columns,rows} tables.
  /record/AOUT-000096 -> UI_SPEC_NOT_FOUND (no generic artifact ui spec exists); /registry has no
  artifacts tab; /runs/<id> run sheet renders 0 tables. Only ViewRenderer under /analysis renders
  VSPEC tables — behind D1.

Reviewer says explicitly: "D1/D2 are not fixable inside FAME-4's file ownership — owner decision
needed." FAME-4 is a zero-code item by ruling (R3), so a coder fix run would violate the item's own
scope boundary. Minors D3-D5 (provenance-badge circle, table overflow, [object Object] cell) are
intake-grade.

## Why this blocks
- FAME-4 DONE requires a browser accept on the summary surface (gate rule: no done without browser
  evidence; the artifacts are honest on the wire — the UI simply cannot reach them).
- FAME-5 is CODING NOW (slot-0 since 19:34) and its acceptance renders on the SAME surface
  (reference_check / standard_summary tables via /analysis on its runs). It will hit D1/D2 verbatim
  at its own gate. FAME-6's whole point is report rendering via view specs; FAME-7 binds across runs.

## Question (bounded, within approved wave intent)
Decide the disposition of D1+D2 so the lane can close FAME-4 and not re-trip at FAME-5/6:
Option 1: authorize a SMALL platform fix item the lane creates + dispatches itself — (a) run list:
  honor a limit param / newest-first paging so deep-linked runs resolve (listRuns must report the
  true total); (b) make a run's output artifacts navigable+renderable (e.g. run sheet renders
  artifact VSPEC tables via the existing ViewRenderer path, or a generic artifact view spec).
  Strictly generic, declarative-first, no FAME vocabulary.
Option 2: accept FAME-4 on the amended reading — artifacts proven honest on the wire (adv2 + orch
  recompute) + render PASS on a reachable older sibling run (ANR-000049 rendered its
  effective_parameters + summary through the same code path) — and fold D1/D2 into a NEW approved
  platform task (FAME-4G) that must land BEFORE FAME-5/FAME-6 browser gates.
Option 3: something better you define within the same boundaries.

Constraints you should hold us to: no hardcode, declarative surfaces preferred, zero bespoke FAME
UI, lane-1 worktree/trunk only, existing merge gates apply to any fix item (adv + browser + orch).

## Evidence pack
- Gate report: /home/brad/.hermes/cl/receipts/FAME-4/gate-l1t1855/report.md (+ trail.json, shots/,
  api/ with the 404/200 re-verifications).
- FAME-4 spec §11 (AC8), §7 W6-W7; adv reviews/FAME4-adv1-l1t1705.md + FAME4-adv2-l1t1815.md.
- Orch live verify (tick 239TH log + handoff): AOUT-000096/099 values, ANREV-000016 exists.
- analysisService.ts:240, AnalysisHandlers.listRuns, AnalysisPage.tsx:298-300, ViewRenderer.tsx:95.

## Decision path (write EXACTLY here)
/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-11-01_fame-4g-platform-render-decision.md
End the file with a line: FAME-4G RULED <option + one-line ruling>.
