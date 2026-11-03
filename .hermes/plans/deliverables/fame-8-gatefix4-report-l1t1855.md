# FAME-8-GATEFIX4 (l1t1855) — coder report

Item: FAME-8-GATEFIX4 — presentation fix for re-gate cycle-2 browser defect D1 on the
MERGED analysis screen. Data emission is CORRECT and FROZEN; this run fixes only how the
table renders.

Worktree: /mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1
Branch: cl/lane1-fame8-gatefix4-l1t1855 (base 29ec4be3, a descendant of gated candidate 746edf67; trunk cl/integration-1)
Commits ON TOP of base (no rebase): ced0d634 (array-cell branch + unit test), 780bc393 (CSS width-control)
Owner: cl-coder (lane-1 fleet)

---

## 1. Measured root cause (first-hand)

At 1440x900 with the default 574 px report pane, ANR-000071's assignment_results table
(10 columns) had a total **min-content** that exceeded the pane, so the flags column
(which holds the long `CONTESTED_CLAIM:...|CHEBI:143577|provisional` flag) was pushed
entirely off the right edge of the pane — NOT truncated, but UNREACHABLE at the landed
viewport (no resize / no scroll applied yet).

Measured BEFORE (my own Playwright probe, my worktree-served vite on :5201, proxying
:3092; JSON in receipts `before-measure.json`):
- pane clientWidth **574**, scrollWidth **1743** (horizontal overflow), right edge 1440
- table width **1723** px, table height **1120** px
- flags `td` index 9 at **x 1878..2609** (730 px), clientWidth 729 == scrollWidth 729
  (no clip — content present, just outside the 1440 pane right edge)
- full flag string present in the cell (hasFullFlag true) but `cellRightWithinPane`
  FALSE -> **fullyReadable: false** (reproduces the gate's D1 numbers exactly)

Two additive causes, both confirmed by measurement:
1. **The flags cell is a comma-joined array** rendered as ONE unbreakable run. ANR-000071's
   `flags` payload is a 2-element ARRAY of strings (`["UNDEFINED_SIBLING_AREA_NULL",
   "CONTESTED_CLAIM:...|CHEBI:143577|provisional"]`); the two ViewRenderer table arms
   rendered every cell with `String(r[c] ?? '')`, so `String(array)` =
   `UNDEFINED_SIBLING_AREA_NULL,CONTESTED_CLAIM:...` with NO space -> one 730 px
   unbreakable token. (Verified first-hand from the :3092 payload, receipts `run71.json`.)
2. **Long header/other-column tokens** also carried min-content. Even after fixing (1),
   the table was still 1286 px (columns 0-8 min-content pushed flags to x1878, receipts
   `diag-cols.json`): `rt_min` 149, `assigned_label` 114, `assignment_state` 132,
   `area_pa_min` 149, `area_percent` 102, etc. So the flags column's share still
   exceeded the pane.

Root cause: the table's **auto layout sized by min-content** of its columns; long
unbreakable tokens (the comma-joined flag run + long header tokens) pushed total
min-content past 1723 px, so the flags column's share exceeded the 574 px pane. This is
REACH, not content — the cell text was character-identical to the payload.

## 2. What I changed, and why it is generic

Two coordinated, both-generic changes (no artifact-id / column-name / flag-substring
special-casing anywhere):

### 2a. Generic array-cell branch (ViewRenderer.tsx, both table arms) — commit ced0d634

Added a `cellContent(value)` helper used by BOTH table arms (`TableView` :96->:119 and
`ArtifactTable` :224->:247 cell maps, replacing `String(r[c] ?? '')`):
- **Array value** -> one element per line, each in a `.view-spec__cell-item` block
  (a `<div>` per element). This breaks the comma-joined run: each flag is now its own
  stacked line, so the longest single flag line (the CONTESTED_CLAIM line) is what
  drives the column's min-content instead of the whole joined run.
- **Scalar value** -> `String(value ?? '')` — byte-identical to the prior behaviour.
- **Empty array** -> `''` (renders nothing, same as the prior `String([])`='').

Genericity: the branch is on the VALUE'S SHAPE (`Array.isArray`) only. No artifact id,
no column-name check, no flag-substring sniffing. Any table whose cell value is an array
gets one-line-per-element; any scalar table renders exactly as before.

### 2b. Generic width-control CSS (AnalysisPage.css, `.view-spec__table` th/td) — commit 780bc393

One rule scoped to `.view-spec__table th, .view-spec__table td`:
`overflow-wrap: anywhere; white-space: normal;`
- `overflow-wrap: anywhere` (NOT `word-wrap: break-word`) actually REDUCES a column's
  min-content, so the table can shrink to the pane width instead of overflowing it.
  `word-wrap: break-word` was measured by the orchestrator to be byte-equal to the
  broken baseline (does not reduce min-content) — not shipped.
- `white-space: normal` lets long tokens wrap to the pane width.
- Headers (`th`) included, not just cells — the orchestrator's td-only variant D left
  the table 830 px wide and the flags cell outside the pane.
- Deliberately NOT bare `table-layout: fixed` (orchestrator variant C: actively harmful,
  53 px flags column without declared widths).

Scoped to `.view-spec__table` ONLY. The FAME-LAYOUT-1 scroll door (`.analysis-right {
overflow:auto; min-width:0 }`) is byte-identical to base (verified by diff, receipts
`door-base.txt`/`door-head.txt`), and `.chromatogram__table` / `.calibration-curve__table`
are untouched — so genuinely wide tables keep their horizontal-scroll reachability.

The two changes are complementary: (2a) makes each flag its own line (correct
semantics — a flags column is a list of flags, not a joined string), and (2b) ensures
whatever the per-line token is, it wraps so the table fits the pane. Either alone left
the flags column off-pane; together the table fits.

## 3. Before/after measurement (my own deterministic Playwright probe)

Harness: `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/fame8-gatefix4-measure-l1t1855.js`
(absolute-path playwright-core from trunk node_modules; chromium at
`/home/brad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`; 1440x900 viewport;
`networkidle` + 2 s; lands ANR-000071 via the "GATEFIX3 D1 replay" run button, default
pane, no resize, no scroll). Served from MY worktree's own vite on :5201 proxying the
lane backend :3092 (`VITE_API_PROXY=http://localhost:3092`) — so BEFORE/AFTER measure the
worktree branch code, not trunk :5192.

### BEFORE (base code, must reproduce the failure) — receipts `before-measure.json`
- pane clientWidth **574**, scrollWidth **1743**, right edge 1440, `noHScroll: false`
- table width **1723**, tableH **1120**
- flags td index 9: x **1878..2609** (730 px), clientWidth 729 == scrollWidth 729 (no clip)
- flag string present, `cellRightWithinPane: false` -> **`fullyReadable: false`, `passed: false`**
- screenshot: `00-before-fullpage.png`
- Matches the gate's D1 numbers (table 1723, flags 730 px @x1878) and the orchestrator's
  prerecon baseline exactly.

### AFTER (fixed code, must pass) — receipts `after-measure.json`
- pane clientWidth **574**, scrollWidth **574** (== clientWidth), right edge 1440, `noHScroll: true`
- table width **534**, tableH **4165**
- flags td index 9: x **1296..1420** (123 px), clientWidth 122 == scrollWidth 122 (no clip)
- full flag string present, `cellRightWithinPane: true` -> **`fullyReadable: true`, `passed: true`**
- screenshot: `00-after-fullpage.png` (visual check: the `CONTESTED_CLAIM:...|CHEBI:143577|provisional`
  flag is fully legible in the flags column, no right-edge cutoff; table fits the pane)

### tableH trade-off (REQUIRED metric)
- tableH **1120 -> 4165 px** (~3.7x taller) over the 31 rows. This is the documented cost of
  making every column wrap at the narrow 574 px pane (the orchestrator's own variant-A
  measured 1120 -> 4089; my after-arraybranch intermediate is 1120 -> 1273). The table is
  fully reachable and legible; the vertical scroll on `.analysis-right` (the preserved door)
  covers the extra height. Reported so the orchestrator can judge the trade-off.
- Intermediate (array-cell branch ALONE, before the CSS) — receipts
  `after-arraybranch-measure.json` + `00-after-arraybranch-fullpage.png`: table 1286, tableH
  1273, flags cell 293 px @x1878 (still off-pane) -> proves the CSS width-control is the
  component that actually brings the flags column inside the pane.

## 4. FAME-LAYOUT-1 scroll door + 14-column comparison table reachability

- **Door preserved:** `.analysis-right` still computes `overflow:auto` (x and y) + `min-width:0`
  in the AFTER state (receipts `door.json`, `door-probe.js`). The door block is byte-identical
  to base (diff of the `.analysis-right` rule, receipts `door-base.txt` vs `door-head.txt`).
- **14-column comparison_report still reachable:** measured on ANR-000069's `comparison_report`
  table artifact (14 columns, same `.view-spec__table` class) — receipts `compare.json`,
  `compare-probe.js`, screenshot `14col-comparison-ANR-000069-after.png`: 14 cols, table
  table 534 px, tableH 498, `tableFitsWithoutScroll: true`, `lastHeaderInsidePaneNow: true`,
  `doorSurvives: true`, `reachable: true`. The fix makes it FIT the pane (no scroll needed)
  while the door remains intact for any future wider table — strictly better than the
  original "reachable via scroll" state.

## 5. D2 and D3 disposition

- **D2 (low — outer x tick `43.514` clipped, reads `43.`): DEFERRED, one-line reason.** The
  clipped outer x tick label is rendered in `app/src/analysis/ChromatogramView.tsx:386`
  (`<text x={xToPx(t)} ... class="chromatogram__ticklabel">` with a CENTERED default
  `text-anchor`), outside this run's boundary (AnalysisPage.css + ViewRenderer.tsx only). A
  CSS `text-anchor` change in AnalysisPage.css would shift ALL tick labels (not a bounded
  padding/anchor tweak) and the spec says do NOT redesign the chromatogram. Recorded as a
  follow-up; leg left as-is (A2/B1 otherwise passed per the gate).
- **D3 (params `[object Object]` on ANR-000056): OUT OF SCOPE, pre-existing, NOT touched**
  (frozen run; recorded as a follow-up per the spec).

## 6. Tests and typecheck (honest run vs not-run)

RAN (all green):
- `npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.artifact-table.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/ViewRenderer.signal.test.tsx`
  -> **4 test files, 46 tests, all passed** (includes my 2 new array-cell pins).
- RED->GREEN proof: my new `ViewRenderer.test.tsx` pin FAILED at base with
  `expected 'ALPHA_FLAG,BETA_FLAG' to be 'ALPHA_FLAGBETA_FLAG'` (the comma-joined run) and
  PASSES after; the scalar pin is unchanged. (Receipts in this dir's git log / test output.)

NOT RUN (and why):
- The broader AnalysisPage.* / ChromatogramView / CompareTraces / CalibrationCurveView
  suites: my CSS is a pure layout rule and my TS change is the two ViewRenderer table arms;
  none of those suites mount a ViewRenderer table cell with array values, and the CSS
  change is not jsdom-measurable (jsdom cannot measure layout). The Playwright
  before/after is the authoritative layout evidence. I did not run the full app suite to
  avoid chasing pre-existing trunk debt unrelated to this change.
- jsdom cannot measure layout, so I did NOT write a vacuous "CSS rule exists" test (the
  spec explicitly forbids it); the renderer change IS unit-covered, the CSS change is
  Playwright-covered.

Typecheck (`npx tsc --noEmit` in `app`):
- **21 pre-existing `error TS` lines, exit 2 — a NON-zero baseline** (do NOT claim exit 0).
- **Zero-new proof:** I reverted ONLY `ViewRenderer.tsx` to HEAD (base) and re-ran tsc ->
  **21 identical error lines** (receipts `tsc-head.txt` vs `tsc-base.txt`; `comm -3` empty).
  All 21 are pre-existing trunk debt in `src/event-editor/`, `src/shared/`,
  `src/ingestion/`, `src/editor/` (useAiChat.surfaceContext, useChatThread.deckLayout,
  LawnSurface.moveAcross, etc.). NONE are in `app/src/analysis/**` — my change introduces
  no new type error. (Note: the server tsconfig excludes `**/*.test.ts`, so the test file is
  not typechecked at trunk; the only typechecked change is `ViewRenderer.tsx`.)

## 7. Scope, boundaries, zero mutation

- **Changed files (vs base 29ec4be3), code only:** `app/src/analysis/ViewRenderer.tsx`,
  `app/src/analysis/ViewRenderer.test.tsx`, `app/src/analysis/AnalysisPage.css` — ALL within
  the `app/src/analysis/**` boundary. The `.hermes/plans/**` delta above base is docs-only
  (the spec/handoff/ruling, pre-existing above base 29ec4be3, not my change).
- **No** server, schema, YAML, `scripts/`, or any app file outside `app/src/analysis/` touched
  (verified: `git diff --name-only 29ec4be3..HEAD` shows only the 3 analysis files + the
  docs-only `.hermes/plans` docs above base).
- **Zero record/artifact mutation:** no re-mint, no edits to `scripts/fame-gatefix/**`, no
  change to AOUT-000134 / ANREV-000022 / ANR-000071. The emitted flag text, flag format, and
  `UNDEFINED_SIBLING_AREA_NULL` / `CONTESTED_CLAIM:` content are UNCHANGED — the fix only
  changes how the already-correct cell value is laid out (one flag per line) and how the
  table wraps to fit the pane. The `:3092` payload is read-only (I fetched it to measure,
  never wrote it).
- **No YAML touched** -> the lane stack was NOT restarted (only my own worktree vite on
  :5201, proxying :3092, was started for measurement; the lane :5192/:3092 and Brad's
  :3001/:5174 were never restarted/killed).
- **Commits (one per concern):** `ced0d634` (array-cell branch + unit test),
  `780bc393` (CSS width-control). Branch is a clean descendant of `29ec4be3`.

## 8. Assumptions and notes
- The lane frontend `:5192` serves TRUNK (cl-integration-1), not the lane worktree, so for a
  true before/after of MY branch I ran my OWN vite from the worktree on a spare port (:5201)
  proxying the lane backend `:3092` (per the computable-lab-lane-verification skill: a
  worktree-only branch is invisible to :5192 pre-merge). The backend (records, payload) is
  the same frozen :3092 the gate used; only the served app bundle differs (my branch vs
  trunk), which is exactly the variable under test.
- The gating criterion is judged by the orchestrator via `tableH` (the readability
  trade-off); it is reported in §3 (1120 -> 4165 px).
