# FAME-LAYOUT-1 SPEC DRAFT — l1t0555 (composer draft; orchestrator reviews, promotes, then dispatches)

Item: FAME-LAYOUT-1 "Analysis-page report panes clip wide artifact tables" — lane 1, trunk
`cl/integration-1`.
Authority: /home/brad/.hermes/cl/lanes/1/task-list.md:11494-11513 (the item block is BINDING; the
`verified by:` text is copied verbatim in §5).
Composed at trunk **17a760f7** (2026-11-02 ~05:5x-06:0x EST). Every file:line and every measurement
below was read FIRST-HAND at this SHA, except where it cites the FAME-6 gate receipt as the
measuring instrument (that receipt's DOM chain was re-read from `supplement/trail.json`, not
remembered). No scout call was needed; nothing here is screening-grade.

Scope in one line: ONE CSS rule on the analysis page's content root gives the report pane a
real scroll door. No TSX, no server, no schema, no per-artifact column policy (R8).

---

## 1. Context

The right-hand workspace pane on `/analysis` is the campaign's terminus surface: it renders the
four view-spec tables of ANR-000061 (`analyte_summary`, `composition_check`, `standard_summary`,
`assignment_results` — live-confirmed on :3092 this tick) and, on the older runs, the legacy
`table` renderer's output (ANR-000056 has three `table` views — live-confirmed). At the shipped
1440x900 viewport the right pane measures **534 px of content box / 574 px of `.analysis-right`
border box**, while the tables measure **587 / 646 / 844 px** (ANR-000061) and **1378-1723 px**
(ANR-000056, legacy renderer).

The FAME-6 browser gate disclosed this as a pre-existing defect and measured the whole ancestor
chain (receipt `/home/brad/.hermes/cl/receipts/FAME-6/gate-l1t0435/report.md:80-95` +
`supplement/trail.json` step n=4, purpose string "computed overflow-x / scrollability of every
ancestor between each table and the document root"):

```
title analyte_summary_view, tableW 587
  .view-spec / .analysis-right__views   w 534  sw 587..844   ox visible
  .analysis-right                       w 574  sw 864       ox visible
  .cl-workspace__pane--right            w 575  sw 864       ox hidden   <-- the clip
  .cl-workspace__panels / .cl-workspace  ox hidden
```

Two consequences, both user-visible on the shipped build:

1. `area_percent` (last column of `analyte_summary_report` and of `assignment_results_report`),
   `area_pa_min` (assignment_results) and `units` (composition_check, column 3 of 4) are outside
   the pane's right edge and cannot be scrolled into view.
2. The report is also taller than the pane (chat column + up to 31 table rows), so its bottom is
   clipped too. `overflow:hidden` is programmatically scrollable, which is why gate screenshots
   could still show those rows via `scrollIntoView` — but no wheel/drag/scrollbar path exists for
   a human. This item's door fixes both axes with one declaration.

This is analysis-page LAYOUT. It is not the FAME-6 renderer: the legacy `table` arm clips worse
in the same box, so no renderer/id/binding change can close it and none is in scope.

---

## 2. Root cause (verified file:line)

Three layers, in the order they bite:

1. **The library's inline style, not the stylesheet, is the clipper.**
   `app/node_modules/react-resizable-panels@3.0.6` (package.json version, read) stamps every
   `Panel` with an INLINE style object; `getPanelStyle()` returns `overflow: "hidden"`
   (`app/node_modules/react-resizable-panels/dist/react-resizable-panels.js:1458`), and the
   `PanelGroup` wrapper gets `overflow: "hidden"` too (`...dist/react-resizable-panels.js:2182`).
   Inline declarations beat any stylesheet rule short of `!important`.
2. **Therefore the existing pane CSS rules are inert for overflow.**
   - `app/src/shared/shell/AppShell.css:368-375` — `.cl-workspace__pane { ... overflow: hidden; }`
     (harmless; already what the inline style says).
   - `AppShell.css:381-384` — `.cl-workspace__pane--left { overflow-y: auto; overflow-x: hidden; }`
     is DEAD CODE at runtime: the Panel's inline `overflow:hidden` wins. Do not "repair" it here
     (see §3 rejected option R3 / §7 bait 2).
   - `AppShell.css:386-389` — `.cl-workspace__pane--right` sets only `background` + `border-left`;
     it inherits nothing but the inline clip.
   - Confirmed live by the gate's computed chain above: pane `ox:hidden` while its child
     `.analysis-right` reports `sw 864 > cw 574` with `ox:visible`.
3. **The page-owned content root has no overflow door.**
   `app/src/analysis/AnalysisPage.tsx:769` renders `<div className="analysis-right"
   data-testid="analysis-right">` with **no `style` prop** (verified) as the direct child of that
   Panel, and `app/src/analysis/AnalysisPage.css:57` is:
   `.analysis-right { padding: 1rem 1.25rem 2rem; display: flex; flex-direction: column; gap: 1rem; }`
   — no `overflow`, no `flex`, no `min-height`. So the element grows to content height inside a
   clipped box and its scrollWidth (already 864 px) has nowhere to go.

The tables themselves are innocent: both arms emit `<table className="view-spec__table">`
(`app/src/analysis/ViewRenderer.tsx:96` legacy `table` arm; `:224` artifact-table arm), styled
`width: 100%` at `AnalysisPage.css:86`, inside a per-view `.view-spec` wrapper
(`ViewRenderer.tsx:551`) inside `.analysis-right__views` (`AnalysisPage.tsx:836`). They are wide
because their declared column sets are wide — data, not a bug.

---

## 3. Required change (exact rule shape)

**One file, one rule, CSS only.** Extend the existing `.analysis-right` rule in
`app/src/analysis/AnalysisPage.css:57` to:

```css
/* FAME-LAYOUT-1 — the report pane's content is taller than the pane and (for any
   view-spec table) wider than it. react-resizable-panels pins the Panel itself to
   inline overflow:hidden, so the scroll door lives on the page-owned content root:
   this element fills the pane box and scrolls both axes, which makes every bound
   column and the report's last row user-reachable at the shipped viewport. Generic
   by construction — no column, artifact or renderer knowledge here (R8). */
.analysis-right {
  padding: 1rem 1.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
```

Why exactly these declarations (each is load-bearing; the reviewer will re-derive them):

- `flex: 1 1 auto` + `min-height: 0` — the Panel is `display:flex; flex-direction:column;
  height:100%` (library `PanelGroup` style, dist:2179-2185), so the child must claim the pane's
  height. Without this the element keeps content height; `overflow:auto` on it then puts the
  horizontal scrollbar at the bottom of an off-screen element — the rule would LOOK applied and
  still fail the gate (§7 bait 3).
- `min-width: 0` — belt-and-braces so the flex item can never be pushed past the pane by a wide
  child (it is the cross axis here, so stretch already caps it; the declaration is free insurance
  and matches the house pattern at `AnalysisPage.css:167`/`.compare-surface`).
- `overflow: auto` — one declaration, both axes: x exposes the 290 px of already-present
  horizontal overflow (`sw 864 / cw 574`, measured), y makes the tall report scrollable.

No TSX change. No wrapper div. No new class. No `!important`. No px/em widths, no breakpoints, no
column/artifact names, no FAME vocabulary.

### Rejected alternatives (state them in the coder report; do not drift into them)

- **R1 `.cl-workspace__pane--right { overflow: auto }` in AppShell.css** — silently NO-OP: the
  Panel's inline `overflow:hidden` wins (root cause 1). Only `!important` would land, and that
  fights the library for every right pane in the app (AI chat, browser, ingestion) with an
  unmeasured blast radius. Rejected.
- **R2 per-table door `.analysis-right .view-spec { overflow-x: auto }`** — ergonomically nicer
  (a scrollbar under each table) but it needs a second rule AND a vertical door anyway, and its
  horizontal scrollbar lives at the bottom of a usually-off-screen table block. Two rules, one
  failure mode more, for no acceptance gain. Rejected — but if the browser gate later shows the
  pane-level door is unusable in practice, this is the documented fallback and would be a
  follow-up, not a coder improvisation.
- **R3 fix `.cl-workspace__pane--left { overflow-y:auto }`** (the dead rule at AppShell.css:381)
  — different surface, not part of this defect, unmeasured. Out of scope.
- **R4 reflow instead of scroll** (shrink/truncate columns, `table-layout: fixed`, smaller font)
  — would need per-surface column policy and destroys number legibility. The task allows reflow as
  optional; friction-first says scroll. Rejected.

---

## 4. Hard boundaries

- **Files: exactly one.** `app/src/analysis/AnalysisPage.css`. A `git diff --stat` naming any
  second file is a reject unless the orchestrator re-ruled it in writing.
- **Server untouched** (`server/**` zero hunks). No schema/lint/ui YAML. No records written.
- **No TSX changes**: not `AnalysisPage.tsx`, not `ViewRenderer.tsx`, not `AppShell.tsx`, not
  `AppShell.css`. (`AppShell.css` is explicitly out — see R1.)
- **R8**: no per-artifact column policy, no table/renderer identification, no `view-spec`,
  `artifact-table`, `analyte`, `fame`, `assignment`, `composition` selectors or comments. The door
  must serve ANY view-spec table, including ones that do not exist yet.
- No hardcoded widths (`px`/`rem`/`vw`), no viewport breakpoints, no `!important`, no
  `white-space`/`table-layout`/`font-size` changes, no truncation, no hiding.
- No stack restarts, no :3092/:5192 mutation, no `:3001`/`:5174` touch, no pkill, no merge, no
  task-list edit. Worker marks in-progress on claim and NEVER done.
- Genuine platform gap discovered mid-flight -> STOP and return `requires-rescope`; never absorb.

---

## 5. Acceptance criteria (VERBATIM from task-list.md:11510-11513)

```
verified by: >-
  Browser: at the shipped viewport, every column of ANR-000061's four views is reachable (scroll
  or reflow) and a screenshot pair proves area_percent + units visible; no new clipping on the
  legacy table renderer surfaces; ROUND-TRIP-GATE-1 pairs.
```

Standing gates that ride with it: dead chrome is a defect; friction-first; no new clipping on any
surface the change touches; ROUND-TRIP-GATE-1 (task-list.md:69-82, BRAD-BINDING: every browser gate
includes at least ONE full live round trip per changed surface — real stream, ZERO interception of
`/api/ai/**`, a user-visible AI answer, the outgoing REQUEST BODY captured as a receipt artifact
PAIRED with the rendered-answer screenshot; mounted/visible DOM alone is NOT evidence).

The browser gate is the real acceptance and is ORCHESTRATOR-RUN (cl-browser-reviewer) after merge.
The coder does not and cannot grade it (the coder's worktree is not what :5192 serves).

---

## 6. Gates the coder must run

Run all from the worktree root (`WT=/mnt/vast/home/brad/git/wt/<branch>`).

**G0 — pristine baseline BEFORE editing** (the gate is a baseline DIFF, not "exit 0"; app tsc is
NOT clean on this trunk):

```bash
cd "$WT/app" && npx tsc --noEmit > /tmp/tsc-before-$USER.txt 2>&1; echo "exit=$?"
grep -c 'error TS' /tmp/tsc-before-$USER.txt
```

Composer-measured at trunk 17a760f7: `exit=2`, **21** `error TS` lines, zero of them under
`src/analysis/`. If your baseline differs, record the number and the per-file counts — it drifts.

**G1 — after the edit, proof of the diff boundary:**

```bash
cd "$WT" && git diff --stat
```

Expected: `1 file changed, N insertions(+), M deletions(-)` with N+M small (rule + comment) and
the file name `app/src/analysis/AnalysisPage.css`. `git diff` shows no `style=` attribute, no JSX,
no selector other than `.analysis-right`.

**G2 — typecheck baseline-diff empty:**

```bash
cd "$WT/app" && npx tsc --noEmit > /tmp/tsc-after-$USER.txt 2>&1; echo "exit=$?"
diff <(sort /tmp/tsc-before-$USER.txt) <(sort /tmp/tsc-after-$USER.txt) && echo TSC-BASELINE-IDENTICAL
```

Expected: `TSC-BASELINE-IDENTICAL` (still `exit=2`, still 21 lines). A CSS-only diff cannot change
tsc output; if it does, you edited the wrong file.

**G3 — vitest: NOT REQUIRED, and say so in the report.** No TS/JSX/DOM-structure change exists,
and jsdom does not apply stylesheet layout, so no unit test can observe this fix and none is
added. For a cheap regression smoke (optional, 13 s):

```bash
cd "$WT/app" && npx vitest run src/analysis/AnalysisPage.test.tsx src/analysis/AnalysisPage.compare.test.tsx
```

Expected (composer-measured at 17a760f7): `Test Files 2 passed (2) / Tests 10 passed (10)`.
Do NOT claim the fix from this run — it only proves the page still mounts.

**G4 — CSS loads/parses.** Pick ONE:
`cd "$WT/app" && npx vite build` (expect success; `dist/` is gitignored — never commit it), or the
orchestrator's post-merge dev-server fetch (§8 step 1) which is the stronger receipt. Report which
you used.

**G5 — the premise re-check** (this is the first targeted check; §9).

---

## 7. Reviewer bait (pre-empt these; the adversarial reviewer will hunt them)

1. **The inline-style trap — the #1 failure.** A coder who "fixes" `AppShell.css:386-389` adds a
   rule that computes to nothing, ships a green-looking diff, and fails the gate. Evidence to put
   in the report: `dist/react-resizable-panels.js:1458` (getPanelStyle `overflow:"hidden"`),
   `:2182` (PanelGroup style), plus the gate's measured `pane ox:hidden`. The door MUST be
   `.analysis-right` (no inline style — `AnalysisPage.tsx:769` verified).
2. **Don't touch the `--left` dead rule.** `AppShell.css:381-384` is inert for the same reason and
   is out of boundary. Fixing it here = unmeasured blast radius on every left pane.
3. **`overflow:auto` without `flex:1 1 auto; min-height:0` is a NON-FIX.** The element stays
   content-height; its scrollbars land below the pane's clip; the gate's screenshot pair shows
   nothing new. All four "layout" declarations are one unit.
4. **Double scrollbars / nested scroll.** `.analysis-chat__messages` already scrolls
   (`AnalysisPage.css:65`, `max-height:14rem; overflow-y:auto`). After this change it is a nested
   scroll region inside the pane scroll — intended; wheel chaining is normal. Do not "fix" it by
   adding `overscroll-behavior` or by removing its max-height.
5. **`.compare-surface` container queries** (`AnalysisPage.css:167-183`, `container-type:
   inline-size`) must keep their measured behaviour: the containment box width does not change
   (574 px), so the `>= 40rem` track split still does not engage at the shipped viewport. If a
   gate screenshot of the Compare overlay looks different, that is a defect — report it, don't
   re-tune breakpoints.
6. **No new clipping class introduced.** `.analysis-right` now clips like the pane did (same box,
   ±1 px). Any popover/menu anchored inside the report pane was already clipped by the pane; if
   the gate finds one newly cut, that is a real finding — but do not pre-empt it by adding
   `overflow: visible` anywhere.
7. **Hardcode boundary / R8.** Any selector or comment naming a renderer, artifact, column or the
   FAME domain is a reject. Any `px` width, `!important`, `table-layout: fixed`, `white-space:
   nowrap`, column hiding, or truncation is a reject (the item forbids per-column policy; the
   legacy renderer must not be tweaked either).
8. **Diff discipline.** The comment must be a normal code comment (no ticket narration essay).
   `exactOptionalPropertyTypes` is irrelevant here (no TS) — say that explicitly so a reviewer
   does not go fishing in `server/tsconfig.json`.
9. **Don't grade the fix yourself.** A report claiming "columns now visible" without a
   post-merge browser receipt is the void-accept pattern the lane's reliability rule bans. The
   coder states the diff + static gates and hands off; the orch gate adjudicates.

---

## 8. What the orchestrator's browser gate must prove (orch-run; the acceptance)

Pre-launch on :5192 after merge + hard reload:

1. **Served-CSS receipt** (proves the door is in the bundle, not just the worktree):
   `curl -s http://localhost:5192/src/analysis/AnalysisPage.css | grep -n "min-height: 0"` ->
   one hit inside the `.analysis-right` rule.
2. **Viewport 1440x900** (the shipped viewport the defect was measured at), deep link
   `http://localhost:5192/analysis?run=ANR-000061` (param name verified: `AnalysisPage.tsx:299`).
3. **Reachability measurement, per view** (4 views, DOM-bound so it cannot be faked by a
   screenshot): for each `.view-spec` table, read the pane's scroll container
   (`.analysis-right`) `scrollWidth/clientWidth`, set `scrollLeft = scrollWidth`, then assert the
   LAST header cell's `getBoundingClientRect()` lies inside the pane's rect. Receipt = JSON per
   view.
4. **Screenshot pair** for `analyte_summary` (area_percent, 8th/last column) and
   `composition_check` (`units`, column 3): one shot at `scrollLeft=0`, one at max scroll, both
   after network settle. That is the verbatim "screenshot pair proves area_percent + units
   visible" leg.
5. **Vertical leg** (bonus, newly reachable): `scrollTop = scrollHeight` on `assignment_results`
   (31 rows) and screenshot the last rows + the promote block. Today this is unreachable too;
   the door is expected to fix it and the gate should record it honestly either way.
6. **Legacy renderer control**: `?run=ANR-000056` (3 `table` views, 1378-1723 px pre-fix) — same
   scrollLeft assertion + one screenshot; "no new clipping on the legacy table renderer surfaces"
   is graded here (before/after comparable to the FAME-6 control run).
7. **ROUND-TRIP-GATE-1**: one full live round trip on the analysis surface — real `/api/ai/**`
   stream, ZERO route interception, user-visible AI answer, outgoing REQUEST BODY captured as an
   artifact paired with the rendered-answer screenshot. Mounted DOM is not evidence.

---

## 9. First targeted check (single command, before anything else)

The item stands or falls on ONE fact: the clip is the library's inline style, so the door must be
the page-owned root. Prove it in one shot at claim time:

```bash
cd "$WT" && grep -n 'overflow: "hidden"' app/node_modules/react-resizable-panels/dist/react-resizable-panels.js | head -2; grep -n 'className="analysis-right"' app/src/analysis/AnalysisPage.tsx; grep -n '^\.analysis-right {' app/src/analysis/AnalysisPage.css
```

Expected:
```
1458:    overflow: "hidden",        <- getPanelStyle (Panel inline style)
2182:    overflow: "hidden",        <- PanelGroup inline style
769:    <div className="analysis-right" data-testid="analysis-right">   <- no style prop
57:.analysis-right { padding: 1rem 1.25rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
```
(Line numbers are the composer's at 17a760f7 with the shared `node_modules` symlink; if npm drift
moves them, the two `overflow: "hidden"` hits and the absence of `style=` on line 769 are the
proof, not the numbers.)

Then the diff in §3 is a mechanical consequence. There is no cheaper live check available to the
coder: :5192 serves the trunk checkout, not the worktree.

---

## 10. Worker contract

- **Branch**: `wt/fame-layout-1-lane1-l1t<dispatch-ts>` off `cl/integration-1` at the tip the
  orchestrator pins at dispatch. Worktree under `/mnt/vast/home/brad/git/wt/`. Never branch off
  `cl/lane1-fame7-l1t0445` or any in-flight item branch.
- **Deliverable report (unique path)**: `/home/brad/.hermes/cl/lanes/1/fame-layout-1-report-l1t<ts>.md`
  containing: the exact rule, the G1 stat, the G2 `TSC-BASELINE-IDENTICAL` line, the G3 statement
  ("vitest not required: CSS-only, jsdom cannot observe layout") plus the optional smoke numbers,
  the §9 premise output, and an explicit "browser gate owed by orchestrator" line.
- **Receipts** (if the coder captures any): `~/.hermes/cl/receipts/FAME-LAYOUT-1/<ts>/`.
- **Commit**: one commit, message naming the item and the mechanism, e.g.
  `[FAME-LAYOUT-1] analysis report pane scroll door — .analysis-right fills the pane and scrolls
  both axes (Panel is inline overflow:hidden, so the door cannot live on the pane class)`.
  Author/committer per lane convention; `git -c core.fileMode=false`; never commit
  `node_modules`/`dist`.
- **Markers**: in-progress on claim; final line `FAME-LAYOUT-1 DONE <full-sha>` or
  `FAME-LAYOUT-1 BLOCKED <one line>`. The orchestrator merges and restarts nothing (CSS is served
  by running Vite; a hard reload suffices — if the served-CSS receipt in §8 step 1 shows the old
  file, the orchestrator restarts :5192 with `cl-lane-stack.sh 1 restart`, not the coder).

---

## 11. Assumptions (composer, unblocked by repo evidence — correct any you disagree with)

1. **The shipped viewport is 1440x900** — the FAME-6 gate measured the defect there
   (`report.md:82-83`). If Brad's morning click-test uses a different window, the fix is
   width-agnostic (no breakpoints) and the gate should still be graded at 1440x900 plus whatever
   window Brad uses.
2. **`.analysis-right` is the only content root of `/analysis`'s right pane.** Verified: it is the
   single `rightPane` root (`AnalysisPage.tsx:768-769`, passed to `AppShell` at `:861-868`); every
   view-spec surface on this page is a descendant. No second report surface exists in `app/src`
   (`view-spec__table` appears only in `AnalysisPage.css` and `ViewRenderer.tsx`).
3. **Vertical clipping of the report is a real user-facing defect on the shipped build**, not just
   a programmatic artifact. Derived from the same computed chain (pane `overflow:hidden`, content
   taller than 900px) — the gate's step 5 records it; if the grader finds the report *was* somehow
   vertically reachable before, that leg is downgraded to a bonus and the horizontal legs stand
   unchanged.
4. **`flex: 1 1 auto` is compatible with the drawer/mobile pane too** (`.cl-workspace__pane--main`,
   `AppShell.css:517`, same flex-column parent). Mobile is not in acceptance; no mobile-specific
   rule is added.
5. **No lane restart is required for this change** (CSS is fetched per page load; a hard reload is
   enough). If the gate's served-CSS receipt disagrees, the orchestrator restarts — see §10.
6. **Nothing in the acceptance requires the legacy renderer to be re-flowed** — only "no new
   clipping", which a scoped, additive scroll door cannot cause.

---

## 12. Open questions for the orchestrator (max 3; each with what I checked)

- **OQ-1 — door placement (`analysis-right` vs per-table).** I ruled for the single pane-content
  scroll door (§3) on robustness + tiny diff; R2 (`.analysis-right .view-spec { overflow-x:auto }`)
  is the documented fallback if the gate finds whole-pane 2D scroll poor UX. Checked: measured
  ancestor chain, the flex parents, and the `.compare-surface` container-query precedent
  (`AnalysisPage.css:160-186`, rule at :167, `@container` at :181 — it deliberately REFLOWED
  rather than scrolled the compare overlay). If you prefer R2 up front, say so at promotion — it
  changes the rule but not the gates.
- **OQ-2 — is vertical reachability in the acceptance or not?** Verbatim acceptance is columns
  only; the door fixes both axes and I added a bonus gate leg (§8.5). Checked: the computed chain
  proves the report is taller than the pane but no gate shot measured the bottom. Confirm the
  bonus leg is not to be graded as pass/fail.
- **OQ-3 — `AppShell.css:381-384` (`--left` overflow rule) is dead code.** It is a real latent
  bug (left panes are not scrollable despite a rule saying they are) but a different surface and
  out of this item. Checked: the library inline style at dist:1458 + the fact that no other rule
  sets `!important`. Recommend filing as its own item rather than widening this diff; confirm you
  do not want it in this pass.
