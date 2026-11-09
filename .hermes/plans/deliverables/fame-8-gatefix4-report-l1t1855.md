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
worktree branch code, not trunk :5192. Provenance audit of exactly that claim (the script as
it stood during the run wrote `served: null`): see §9.3 and `served-attestation.json`.

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

- **D2 (low — outer x tick `43.514` clipped, reads `43.`): DEFERRED — a tick-anchor change
  requires re-measuring the chromatogram leg, which this run did not budget.** Where the
  label comes from: the x-tick `<text>` at `app/src/analysis/ChromatogramView.tsx:386`
  (`<text x={xToPx(t)} y={PAD_T + PLOT_H + 16} className="chromatogram__ticklabel">`) carries
  NO `textAnchor` (the only `textAnchor` attributes in that file are the y-tick label `:395`
  and the two axis labels `:401`/`:404`), and no `text-anchor` rule exists in any `app/src`
  CSS, so the SVG default `start` applies and the outermost label paints past the svg's right
  edge. That file is INSIDE this run's boundary (spec line 101, `app/src/analysis/**`); the
  deferral is a budget decision, not a boundary one. Recorded as a follow-up; leg left as-is
  (A2/B1 otherwise passed per the gate). *Corrected by paperwork run l1t2105 — the earlier
  wording of this bullet was factually wrong twice; see §9.1.*
- **D3 (params `[object Object]` on ANR-000056): OUT OF SCOPE, pre-existing, NOT touched**
  (frozen run; recorded as a follow-up per the spec).

## 6. Tests and typecheck (honest run vs not-run)

RAN (all green):
- `npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.artifact-table.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/ViewRenderer.signal.test.tsx`
  -> **4 test files, 46 tests, all passed** (includes my 2 new array-cell pins).
- RED->GREEN proof: my new `ViewRenderer.test.tsx` pin FAILED at base with
  `expected 'ALPHA_FLAG,BETA_FLAG' to be 'ALPHA_FLAGBETA_FLAG'` (the comma-joined run) and
  PASSES after; the scalar pin is unchanged. Cited artifacts (filed by paperwork run l1t2105,
  which re-ran both legs itself — see §9.2): receipts
  `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-green-head.txt` (worktree HEAD
  `522040e9`: `Test Files 4 passed (4)` / `Tests 46 passed (46)`, exit 0) and
  `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-red-base.txt` (/tmp scratch with
  `git show 5e861a0e:app/src/analysis/ViewRenderer.tsx` restored, HEAD tests kept:
  `Test Files 1 failed | 3 passed (4)`, `Tests 1 failed | 45 passed (46)`, exit 1).

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

---

## 9. Correction log — paperwork run l1t2105 (EVIDENCE-TRAIL only)

Source of these corrections: adversarial review
`/home/brad/.hermes/cl/lanes/1/reviews/FAME8-GATEFIX4-adv1-l1t2005.md` (3 EVIDENCE-TRAIL
minors, 0 product defects). This run changed **no product file** — every edit below is to this
report, to a probe/measure script in the receipts dir, or to a new receipts file. Product code
is byte-identical to `522040e9`.

### 9.1 [review defect 1] D2 deferral justification was false twice — restated (§5)

What §5 used to say (quoted from the pre-correction text at `522040e9`, report:146-152):

> "... rendered in `app/src/analysis/ChromatogramView.tsx:386` ... with a CENTERED default
> `text-anchor`), outside this run's boundary (AnalysisPage.css + ViewRenderer.tsx only)."

Both halves were wrong:

(a) **Boundary.** The binding boundary is the glob in spec:101 — `Boundary: app/src/analysis/**`
  (`(AnalysisPage.css, ViewRenderer.tsx and their tests)` is the parenthetical, not the rule).
  `app/src/analysis/ChromatogramView.tsx` IS inside `app/src/analysis/**`. The reviewer put it
  correctly: the file is in boundary; only the parenthetical enumerates two files.

(b) **Anchor.** There is no `textAnchor` on the x-tick `<text>`:
  `app/src/analysis/ChromatogramView.tsx:386` is
  `<text x={xToPx(t)} y={PAD_T + PLOT_H + 16} className="chromatogram__ticklabel">` — no
  `textAnchor` prop. The only `textAnchor` attributes in the file are the y-tick label at `:395`
  (`textAnchor="end"`) and the axis labels at `:401`/`:404` (`textAnchor="middle"`). And
  `grep -rn 'text-anchor' app/src --include=*.css` returns nothing, so no stylesheet sets it
  either. The SVG default is `start` (left-aligned) — which is exactly the mechanism that paints
  the outermost label past the svg's right edge.

Corrected disposition: §5 now gives a truthful one-line reason ("a tick-anchor change requires
re-measuring the chromatogram leg, which this run did not budget") and both false claims are
gone. The reviewer identified the fix as the 1-line, in-boundary tweak
`textAnchor={i === xTicks.length - 1 ? 'end' : 'start'}` at `ChromatogramView.tsx:386`; the
orchestrator is **carrying D2 as a follow-up rather than closing it here**, per its chosen
closure for this defect (truthful restatement, not a code change). No product file was touched
by this correction.

### 9.2 [review defect 2] RED->GREEN proof cited a receipt that did not exist — filed

What §6 used to say (pre-correction text at `522040e9`, report:161-163):

> "... the scalar pin is unchanged. (Receipts in this dir's git log / test output.)"

No such artifact existed. What the receipts dir actually held before this correction (`ls`
counted first-hand: `json=7 png=5 js=5 txt=4`) was 7 measure/compare JSONs, 5 PNGs, 5 `.js`
(the measure harness plus 4 probes: `compare-probe`, `compare-shot`, `diag-cols`,
`door-probe`) and 4 `.txt` (`tsc-base`, `tsc-head`, `door-base`, `door-head`) — no vitest
output at all, and the receipts dir is not a git repo (`git -C ~/.hermes/cl/receipts/.../
rev-parse --show-toplevel` -> `fatal: not a git repository`), so "this dir's git log" pointed
at nothing. The claim was therefore unsupported as written.

Filed now, by actually running both legs in this run (paperwork run l1t2105):

| leg | where | command (identical both legs) | artifact |
|---|---|---|---|
| GREEN (candidate) | worktree `FAME-8-GATEFIX4-lane1/app` @ `522040e9` | `npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.artifact-table.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/ViewRenderer.signal.test.tsx` | `test-green-head.txt` |
| RED (control) | `/tmp/f8pap-d2/app` — `cp -r` copy of the worktree `app/`, `app/node_modules` symlink preserved, then `git show 5e861a0e:app/src/analysis/ViewRenderer.tsx` restored over it (sha256 `d44a08e5…`, byte-identical to base), HEAD test file kept | same | `test-red-base.txt` |

Actual output, quoted:

GREEN (`test-green-head.txt`):
```
 Test Files  4 passed (4)
      Tests  46 passed (46)
EXIT=0
```
RED (`test-red-base.txt`):
```
 FAIL  src/analysis/ViewRenderer.test.tsx > TableView array-valued cells (FAME-8 GATEFIX4 reachability) > renders an array cell as one element per line (not a comma-joined run)
AssertionError: expected 'ALPHA_FLAG,BETA_FLAG' to be 'ALPHA_FLAGBETA_FLAG' // Object.is equality
 Test Files  1 failed | 3 passed (4)
      Tests  1 failed | 45 passed (46)
EXIT=1
```

Both files record their own command line, the revision they ran against, and the timestamp in
their headers. The worktree was not modified by the RED leg (the scratch copy was made and the
revert applied there only); `/tmp/f8pap-d2` was removed after the run. The one-file RED proves
the new pin is non-vacuous: it fails on the pre-fix renderer and passes on the candidate.

### 9.3 [review defect 3] no receipt attested which revision :5201 served — attested as far as evidence allows

What the review found: `fame8-gatefix4-measure-l1t1855.js` line 76 hardcoded
`served: null, steps: []`, so all four measure JSONs (`before`, `after-arraybranch`, `after`,
`after-final`) carry no record of which app revision the dev server was serving.

Both halves of the review's closure options were used, and what could NOT be recovered is
stated as such rather than invented:

**(i) The script now captures it, and was re-run.** `fame8-gatefix4-measure-l1t1855.js` now
records, per run, into `served`: `git rev-parse HEAD` of the serving worktree, its branch, its
`git status --porcelain`, the sha256 of the module bytes the dev server actually returned for
`/src/analysis/ViewRenderer.tsx` and `/src/analysis/AnalysisPage.css`, whether those bytes
carry the array-cell marker (`view-spec__cell-item`) and `overflow-wrap: anywhere`, plus the
git-cat-file sha256 of the committed sources; and `steps` now holds the real navigation steps
with timings. Fresh run (this run's own vite on :5201, `VITE_API_PROXY=http://localhost:3092`,
screenshot `00-after-served-fullpage.png`):

- artifact: `after-served-measure.json` (`at` 2026-11-03T02:06:25Z)
- `served.head` **42425c39** (branch `cl/lane1-fame8-gatefix4-l1t1855`; dirty = the three
  pre-existing `?? node_modules` lines only)
- `served.viewRenderer` HTTP 200, 76082 bytes, sha256 `0015ebfd…`, `hasArrayCellMarker: true`
- `served.css` HTTP 200, 19591 bytes, sha256 `a0cbc1ef…`, `hasOverflowWrapAnywhere: true`
- `steps`: 10 entries, `git-served-capture` -> `served-module-capture` -> `goto-/analysis` ->
  `run-list-ready` -> `click-GATEFIX3-D1-replay` -> `table-mounted` -> `networkidle+2s` ->
  `pane-reset` -> `geometry-measured` -> `screenshot-written`
- geometry: pane 574/574 `noHScroll true`, tableW **534**, tableH **4165**, flags index 9 at
  **1296..1420** (w 123, clientW 122 == scrollW 122), `cellItemCount: 2`, `fullyReadable: true`

42425c39 is the candidate 522040e9 plus two docs-only commits; `git diff --stat
522040e9..42425c39 -- app server schema records scripts` is EMPTY, so the served product bytes
are the candidate's.

**Reproduction check:** `after-served-measure.json` is identical to the historical
`after-measure.json` on every field present in both (pane 574/574, tableW 534, tableH 4165,
flags 1296..1420 w123, fullyReadable true). The historical AFTER numbers therefore reproduce on
code whose revision is now attested.

**(ii) The historical window is reported as unattested, with corroboration.** Sidecar:
`/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/served-attestation.json`. It states
plainly that the revision served during 2026-11-03T01:19Z..01:39Z (20:19-20:39 EST) cannot be
recovered — the old script recorded nothing, the serving process was gone before review, and no
vite/coder log naming the :5201 launch survived — and lists only what was actually gathered:
the four JSONs self-record `frontend: http://localhost:5201`; BEFORE reproduces the gate's D1
numbers (1723 / 730 px @x1878); AFTER matches the orchestrator's independent prerecon (534 /
574); product commits 780bc393 (20:34:25) and 522040e9 (20:38:54) predate the last window
artifact and the later commits are docs-only; and the intermediate `after-arraybranch` (20:26,
tableW 1286) already showed the array branch, which exists only in the worktree, never on trunk
:5192. **No revision string is invented for that window**, and the before leg was not re-run
(it would need a second server on a non-worktree port, which this run's rules disallow); the
sidecar records that too.

Housekeeping: the :5201 vite this run started (pid 3636873) was stopped afterwards; :5192 was
never contacted; `/tmp` is clean.
