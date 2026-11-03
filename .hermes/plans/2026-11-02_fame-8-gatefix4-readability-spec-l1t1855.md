# FAME-8 GATEFIX4 — presentation fix for re-gate cycle 2 defects (A3 flags-cell reachability)

Item: FAME-8 (in-progress, campaign terminus). Spec id: l1t1855. Author: lane-1 orchestrator.
Base: `cl/integration-1` @ `02335c1e` (docs-only above the gated candidate `746edf67`).
Worktree to create: `/mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1`
Branch: `cl/lane1-fame8-gatefix4-l1t1855`
Owner: one `cl-coder` run (fleet slot required; NO slot was available at spec time — see dispatch note).
Deliverable report (unique): `.hermes/plans/deliverables/fame-8-gatefix4-report-l1t1855.md` in the worktree.
Receipts (unique): `~/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/`.

## Why this run exists

The gate-2 browser re-gate (`brgate-f8-gate2-l1t1745`, receipts
`~/.hermes/cl/receipts/FAME-8/gate2-254TH/`) rendered **VERDICT: fix** on the merged candidate
`746edf67`. Its A3 leg graded **FAIL on the visibility/readability clause only** — the data, the
DOM and the emitted flag are correct and were independently verified by the orchestrator
(`AOUT-000134` row `peak:1` carries
`CONTESTED_CLAIM:Methyl hexanoate (6:0 FAME) - FAME-2 standard peak 1 (tentative)|CHEBI:143577|provisional`;
31 rows; 3-field split; 0 numeric deltas vs `AOUT-000127`). This run fixes presentation ONLY.

This is a changed diagnostic boundary (layout/table presentation), not a repeat of the two prior
data-emission cycles. The flag text, its producer and the artifacts are frozen: do not re-mint, do
not edit `scripts/fame-gatefix/**`, do not touch any record.

## Defects (verbatim from the gate report)

### D1 (gating, medium) — peaks-1 flags cell not readable at the landed viewport

Where: `/analysis` → ANR-000071 landed screen → `.analysis-right` →
`.view-spec[assignment_results_view] tbody tr[0] td[flags]` (`.view-spec__table`).

Criterion graded (verbatim): *"the peak-1 row's flags cell must SHOW the CONTESTED_CLAIM flag
naming CHEBI:143577 + provisional, readable at viewport (not hidden in scroll or truncated to
meaninglessness)"*.

Measured actual: at 1440×900 with the default 574 px report pane the flags `td` starts at x=1878
while the pane's right edge is 1440 — the whole column is outside the pane (table width 1723 px).
At maximum pane horizontal scroll (`scrollLeft 1169`) the 730 px cell is clipped on BOTH sides. It
is fully readable only after dragging the workspace divider (`dx:-620`, pane 1148 px) plus
horizontal scroll. Payload and cell text are character-identical (`clientWidth 729 == scrollWidth
729`, no truncation) — **this is reach, not content**.

Screenshots (absolute):
- `/home/brad/.hermes/cl/receipts/FAME-8/gate2-254TH/legA3MANUAL/shots/12-03-assignment-table-in-view.png`
- `/home/brad/.hermes/cl/receipts/FAME-8/gate2-254TH/legA3MANUAL/shots/15-04-peak1-row-closeup.png`
- `/home/brad/.hermes/cl/receipts/FAME-8/gate2-254TH/legA3WIDE/p2/shots/09-03-default-pane-max-hscroll.png`
- `/home/brad/.hermes/cl/receipts/FAME-8/gate2-254TH/legA3WIDE/p2/shots/15-04-widened-pane-max-hscroll.png`

### D2 (low, same run — fix only if it is a genuine one-liner in the same file, else follow-up)

Outer x-axis tick label clipped: `43.514` paints 1405..1437 against an svg right edge at 1420, so it
reads `43.` on screen. Where: `[data-testid=chromatogram-svg] .chromatogram__ticklabel`.
Shot: `/home/brad/.hermes/cl/receipts/FAME-8/gate2-254TH/legA2/shots/06-01-chromatogram-in-view.png`.
Do NOT redesign the chromatogram; if the fix is not a bounded padding/anchor tweak, record it as a
follow-up and leave the leg as it is (A2/B1 otherwise PASSED: ticks 9 px, y-unit clears by 12 px).

### D3 (out of scope — pre-existing, frozen run)

`effective_parameters_view` `params` cell renders `[object Object]` on ANR-000056 (frozen from
ANREV-000016). Do not fix it in this run; it is recorded as a follow-up.

## Orientation (orchestrator's bounded local inspection — verified first-hand at 02335c1e)

- Two table arms render cells identically: `app/src/analysis/ViewRenderer.tsx:105` and `:233`,
  `<td key={c}>{String(r[c] ?? '')}</td>`. An array value is comma-joined by `String()` with no
  space, producing long unbreakable runs.
- Table CSS is `app/src/analysis/AnalysisPage.css:110-112`: `.view-spec__table { border-collapse:
  collapse; width: 100%; font-size: .85rem; }` and `th, td { border: 1px solid #e5e7eb; padding:
  .3rem .5rem; text-align: left; }`. **No `white-space:nowrap`, no `table-layout`, no max-width**
  anywhere on this table or its cells (grep over `app/src/**/*.css` found none for `.view-spec__table`;
  the only analysis-FILE nowrap rules are `.compare-overlay__readout-row` :237 and :269).
- Hypothesis to verify (do not assume): the table's auto layout is sized by *min-content* of its
  columns; long unbreakable tokens in headers (e.g. `contributed_area_pa_min`,
  `observed_denominator_pa_min`) and in cells (the comma-joined flags string) push total min-content
  past 1700 px, so the table overflows the pane and the flags column's share exceeds the pane width.
  Verify by measuring before changing anything, and state the measured cause in the report.
- FAME-LAYOUT-1's scroll door is present and must be preserved:
  `app/src/analysis/AnalysisPage.css` `.analysis-right { overflow: auto; min-width: 0; ... }`
  (merged `8a8b69a5`). Do not remove or redefine it.

## Fix direction (outcome-defined; coder picks the minimal generic mechanism)

Make long cell values and long header tokens readable **within the default 574 px report pane at
1440×900, with no pane resize required**, while keeping the existing horizontal-scroll door for
genuinely wide tables (the 14-column comparison table must stay reachable, not regress).

Acceptable mechanisms (generic, no artifact/column special-casing):
1. allow breaking inside long tokens for these cells — e.g. `overflow-wrap: anywhere` (this also
   reduces min-content sizing, unlike `word-wrap: break-word`) plus `white-space: normal`; or
2. cap column min widths / use a deliberate `table-layout: fixed` with sensible widths; or
3. render array-valued cells as stacked items (one line per element) via a small generic
   array-branch in the two cell arms, so each flag is on its own line.

Rules:
- Do NOT change emitted flag text, the flag format, the producer script, or any record
  (`AOUT-000134`, `ANREV-000022`, `ANR-000071` are frozen). No re-mint.
- Do not weaken `UNDEFINED_SIBLING_AREA_NULL` / `CONTESTED_CLAIM:` content.
- Keep it generic: no `if (artifact === 'AOUT-000134')`, no flag-substring sniffing, no
  column-name special cases tied to this artifact. A rule on `.view-spec__table th/td` or a
  generic array-cell branch is the target shape.
- App-side only. Boundary: `app/src/analysis/**` (AnalysisPage.css, ViewRenderer.tsx and their
  tests). No server, no schema, no YAML, no `scripts/`.

## Test discipline and required evidence

1. RED-first where a unit can express it. If you change the renderer (mechanism 3), add a unit test
   in `app/src/analysis/ViewRenderer.*.test.tsx` proving an array cell renders its elements singly
   (one per line/block) and a scalar cell is unchanged. If the fix is pure CSS, jsdom cannot measure
   layout — say so honestly and supply (2) instead; do not write a vacuous "CSS rule exists" test.
2. **Deterministic browser measurement, supplied by YOU (not the orchestrator)**: a headless
   Playwright script in your receipts dir that loads the served candidate at 1440×900, lands on
   ANR-000071's assignment_results view at the DEFAULT pane width, and records: pane clientWidth,
   table scrollWidth, the flags `td` offsetLeft + clientWidth + scrollWidth, and whether the flag
   string's full text is inside the pane's visible box (no pane resize, no horizontal scroll). Run
   it BEFORE the change (must reproduce the failure) and AFTER (must pass). Save both JSON outputs
   plus before/after full-page screenshots. Harness facts: import `playwright-core` by absolute
   path from trunk `node_modules`; chromium at
   `/home/brad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`; wait for networkidle +
   ~2 s; lane backend `:3092`, frontend `:5192` (restart the lane stack only if you touch YAML —
   you should not).
3. Run the analysis suites you touch plus `app` typecheck against your base; report honest counts
   (run vs not-run). `npx tsc --noEmit` in `app` — report the error count and whether any error is
   new vs base; do not claim "exit 0" if the pre-existing baseline is non-zero.
4. Commit early and often (`git -c core.fileMode=false`), one commit per concern, and keep the
   branch a clean fast-forwardable descendant of `02335c1e`.

## Acceptance for THIS run

- Before/after measurement JSONs + screenshots show the peak-1 flags cell fully readable at the
  default pane at 1440×900, with the full `CONTESTED_CLAIM:…|CHEBI:143577|provisional` text visible,
  and the 14-column comparison table still reachable by the preserved scroll door.
- D2 either fixed minimally (with a shot showing `43.514` fully painted) or explicitly deferred with
  a one-line reason.
- Zero changes outside `app/src/analysis/**`; zero record/artifact mutations.
- Report states what was run vs not run, and names the measured root cause.

## Dispatch note (orchestrator)

No fleet coder slot was available when this spec was written (both `appliance2-coder-slot-0/1`
held by live lane-2 coders, and the lane-2 corpus campaign has fleet priority per the list header
BRAD-BINDING 2026-11-02T17:05). Dispatch deferred to the next tick when a slot frees. Do NOT
dispatch this spec against a stale base: re-verify `cl/integration-1` tip and re-pin the base sha in
the launcher.

## Pre-validation — orchestrator-measured at the served candidate (ADDED 256TH tick, 2026-11-03T00:0xZ)

The orchestrator ran a deterministic Playwright probe against the SERVED lane frontend (http://localhost:5192,
worktree `/mnt/vast/home/brad/git/cl-integration-1` at `29ec4be3`; :3092/api/health 200), 1440x900, route
`/analysis` -> run `GATEFIX3 D1 replay` -> `.view-spec[assignment_results_view]`, DEFAULT pane, no resize, no
scroll. Script: `/home/brad/.hermes/cl/lanes/1/scripts/fame8-gatefix4-prerecon2-l1t1915.js`
Artifacts: `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-prerecon-l1t1900/` (measure.json, 00-baseline.png,
01-<variant>.png, 02-variantN-fullpage.png). These are ORCHESTRATOR measurements, not gate receipts — they
validate the fix direction; they do NOT substitute for your own before/after measurement.

Measured BASELINE (independently reproduces the gate's D1 numbers exactly): pane clientWidth 574,
pane scrollWidth 1743, table width 1723, table height 1120, flags td index 9 at x 1878..2609 (730 px),
`clientWidth 729 == scrollWidth 729` (no truncation), fullyInsidePane FALSE. Peak-1 cell text begins
`UNDEFINED_SIBLING_AREA_NULL,CONTESTED_CLAIM:Methyl hexanoate (6:0 FAME) - FAME-2 standard ...`.

Candidate mechanisms injected as a probe `<style>` (CSS only; no product change):

| variant | CSS | tableW | tableH | pane scrollW | flags cell | inside pane |
|---|---|---|---|---|---|---|
| A | `th, td { overflow-wrap: anywhere; white-space: normal }` | 534 | 4089 | 574 | 141 px @1279..1420 | **TRUE** |
| B | `th, td { overflow-wrap: break-word; word-wrap: break-word }` | 1723 | 1120 | 1743 | 730 px @1878..2609 | FALSE |
| C | `table-layout: fixed` + anywhere | 534 | 6373 | 574 | **53 px** @1366..1420 | TRUE |
| D | anywhere on `td` ONLY (headers untouched) | 830 | 7267 | 944 | 49 px @1667..1715 | FALSE |
| E | anywhere + `max-width: 26em` | 534 | 4165 | 574 | 86 px @1333..1420 | TRUE |
| F | anywhere + `max-width: 18em` | 534 | 4451 | 574 | 74 px @1346..1420 | TRUE |

Conclusions you may rely on (measured, not hypothesised):
1. **Variant A alone is sufficient** for the gating criterion: table min-content collapses to 534 px, the pane
   needs no horizontal scroll (scrollWidth == clientWidth == 574) and the flags cell sits fully inside the pane.
2. **`overflow-wrap: break-word` provably does not help** (B is byte-equal to baseline) — confirms the spec's
   min-content analysis. Do not ship mechanism "word-wrap: break-word".
3. **Header tokens must break too**: td-only (D) leaves the table 830 px wide and the flags cell outside the pane.
4. **Bare `table-layout: fixed` is actively harmful** (C: 53 px flags column) unless column widths are declared.
5. Cost of A: table height 1120 -> 4089 px (≈132 px/row over 31 rows) because every column wraps. That is
   *reachable and legible* but materially taller. You MAY reduce the cost (e.g. a narrower `max-width` on cells,
   a two-line array-cell branch, or a declared width for the wide columns) provided the criterion above still
   holds — but you MUST measure and REPORT the table height in your before/after JSON so the orchestrator can
   judge the trade-off rather than discover it at the gate.

The row height metric is therefore a REQUIRED part of your evidence: report `tableH` before and after.
