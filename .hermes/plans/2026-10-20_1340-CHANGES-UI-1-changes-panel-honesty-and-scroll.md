# CHANGES-UI-1 spec — Changes-panel honesty + scroll (lane 1)

Author: orch tick l1t1330. Trunk base: cl/integration-1 @ ed0f5d09.
All facts below verified FIRST-HAND by the orchestrator against the served trunk
(scout screening corroborated where noted). Worktree: /mnt/vast/home/brad/git/wt/CHANGES-UI-1-lane1-l1t1340,
branch cl/lane1-changesui1-l1t1340. App-only (no server, no YAML, no schema).

## Mission (render layer only; ZERO compiler/record changes)

File primarily touched: `app/src/event-editor/right-pane/ai/draftChanges.ts`
(96 lines, pure description of draft events — header rule: NEVER re-derive the
graph), plus `ChangesPanel.tsx`/`ChangesPanel.css` (or ai.css) for (D).

### (A) Composition row honesty — draftChanges.ts describeMaterial :45-64

VERIFIED: `describeMaterial` walks ref fields and returns the FIRST ref label —
for a minted mixture that is the blob label (e.g. "Trypsin-EDTA + DMEM + FBS +
HepG2 cells"). But `AddMaterialDetails` (types/events.ts:145-160, verified)
carries `composition_snapshot?: CompositionEntryValue[]` where
`CompositionEntryValue = { componentRef: MaterialRefValue; role:
CompositionRole; concentration?; concentrationRange?; source? }`
(types/material.ts:50-56, verified; parse accepts snake_case component_ref too,
:269).

Requirement: when `details.composition_snapshot` is a non-empty array, the row
must enumerate the COMPONENTS with their roles, like the well tooltip does
(focus/WellTooltip.tsx renders `m.materialRef · m.role` per row — the role
pattern to follow; scout screened eventGraph.ts applyAddMaterial :509-538 as the
graph-side consumer — screening only, do NOT copy its graph projection, just
read the snapshot off the event details).
Render shape (one description string, keep the row a single line):
`add_material · <wells> · <mixLabel> (<comp1 label> as <role1>; <comp2 label>
as <role2>; ...) · <amount> · on <labware>` — the mint blob label may appear
ONLY as the mixture's proposed name BEFORE the parenthetical, never in place of
components. Entry label = `componentRef.label || componentRef.id` (same
fallback as formatCompositionSummary, types/material.ts:431-440, verified).
Ignore concentration rendering inside the row (tooltip's job); roles only.
If snapshot entries lack a usable label AND id, skip that entry; if the whole
snapshot yields nothing, fall back to today's behavior (no fabricated text).
Use ` · ` separators consistent with existing fragments. No hardcoded role
vocabulary — roles come from the snapshot data verbatim.

### (B) Numeric amounts drop — describeAmount :38-41

VERIFIED: `asString(volume['value'])` returns '' for numbers (asString is
string-only, :21-23) → " uL" or empty; compiler emits `{value:number,unit}`
commonly (types/events.ts:145 `volume?: { value: number; unit: string }`,
verified). Same bug for concentration at :41.

Requirement: render finite numbers with `formatAmountValue` helper:
number → plain string (no scientific notation for normal magnitudes;
toLocaleString is fine), keep existing string path. Result for
`{value:100,unit:'uL'}` → `100 uL`; `{value:0.5,unit:'mL'}` → `0.5 mL`. A
dict with a non-finite/non-number/non-string value renders NOTHING (no "uL"
orphan unit, no "undefined").

### (C) Labware handle raw — changesFromDraftEvents :87-88

VERIFIED: `on ${labware}` prints `details.labwareId || labware_id` verbatim.
A requirement ghost's labwareId IS the raw handle
`req:<classCurie>:<t36>:<rand>` (types/labwareRequirement.ts:126, verified).
There is NO existing handle→human-label resolver in app/src (orchestrator
grep-verified; scout agrees — createLabwareFromRequirement stores
requirementClassCurie + a generated name).

Requirement: resolve via the LABWARE instances already in the draft's preview
state if available — but draftChanges is a pure function over events only
(caller AiTabPanel.tsx:533/:707 passes just events). Keep it pure: accept an
OPTIONAL resolver map `labwareLabels?: ReadonlyMap<string,string>` as a second
arg to `changesFromDraftEvents`, defaulting to undefined. Rendering rule:
1. If map has the handle → `on <label>`.
2. Else if handle starts with `req:` → humanize from the handle itself: take
   the classCurie segment (`CL:96_well_plate`), render `on 96_well_plate
   (req:CL:96_well_plate…)` — shortened display label `96_well_plate` = last
   CURIE segment, underscores→spaces is NOT wanted (term id stays intact);
   shortened handle suffix shown as `req:CL:96_well_plate…` (prefix + ellipsis,
   NEVER the full random tails).
3. Else print the handle as today (non-`req:` ids are already human names like
   `plate1`).
At the call sites (AiTabPanel.tsx:533 and :707): pass nothing NEW if wiring a
map is invasive — the `req:` humanizer alone satisfies (C) since the raw
handle is the observed defect. OPTIONAL (recommended if trivial): build the map
from `editor.actions.getPreview()/preview labwares` name-by-labwareId at :707
where `preview` is in scope (verified `const preview` exists around :695). Do
not touch draftPreview.ts.

### (D) Scroll — ChangesPanel / ai.css

VERIFIED layout facts:
- `.ai-tab__section` base rule is `flex-shrink: 0` (ai.css:13-16) and there is
  NO `.ai-tab__section--changes` rule at all (grep-verified) → the changes
  section grows unbounded.
- The precedent to follow is IN THE SAME FILE: `.ai-tab__section--questions`
  (ai.css:130-136 + `.questions-panel__list` flex:1/min-height:0/overflow-y
  :auto, :171-177), added for the identical 2026-09-20 incident.
- The "LIVE CLARIFYING QUESTION" the task names is the QuestionsPanel path;
  with a shorthand draft the ChangesPanel itself renders verbatim shorthand
  (long <pre>) + up to 40 change rows + actions bar, pushing content past the
  pane (ai-tab container overflow hidden per task description).

Pick ONE (spec pick, per the task text): INTERNAL SCROLL of the changes list,
demonstrated with a >=40-row fixture in the unit test AND the browser gate:
- Add `.ai-tab__section--changes { flex: 1; min-height: 0; padding: 0;
  display: flex; flex-direction: column; }` mirroring --questions.
- Make `.changes-panel` a flex column, min-height:0, height:100%
  (mirror `.questions-panel`, verified pattern).
- `.changes-panel__diff` gets `flex: 1 1 auto; min-height: 0; overflow-y:
  auto; overscroll-behavior: contain;` (the scrolling region). Shorthand view,
  warnings, actions bar stay flex:0 0 auto (actions bar must remain pinned and
  visible).
- The Apply/Discard actions bar and any warnings stay OUTSIDE the scroll
  region so they never get pushed off.

## RED-FIRST tests (app workspace; `cd app && npx vitest run <files>` or the
repo's existing runner — follow draftChanges.test.ts conventions):
1. Composition row: an add_material event with 4-entry composition_snapshot
   (labels Trypsin-EDTA/DMEM/FBS/HepG2 cells, roles base_medium/supplement/
   cells/media) renders ALL FOUR component labels + roles in the description,
   AND the blob mint label appears only as the mixture name, not instead of
   components (assert each component substring present).
2. `{volume:{value:100,unit:'uL'}}` → description contains `100 uL`;
   `{concentration:{value:0.5,unit:'% (v/v)'}}`-style numeric renders;
   `{volume:{value:NaN,unit:'uL'}}` renders no orphan unit; string values keep
   working (existing tests must stay green).
3. Labware: `details.labwareId='req:CL:96_well_plate:mu9azzva:if7jwo'` →
   description contains `96_well_plate` and does NOT contain `mu9azzva` or
   `if7jwo`; plain `plate1` → `on plate1` unchanged; resolver map hit →
   `on Plate for assay`.
4. Layout/DOM: render ChangesPanel with >=40 change rows; assert the diff
   container is the scroll region (computed/inline style or CSS-module rule
   presence is acceptable if jsdom can't compute — prefer asserting
   `overflow-y: auto` on `.changes-panel__diff` via getComputedStyle after
   importing the real CSS per ChangesPanel.styling.test.tsx's existing
   approach — READ that file first and follow its technique).
Existing pin tests in ChangesPanel.test.tsx / ChangesPanel.styling.test.tsx /
draftChanges.test.ts must not regress.

## Gate order
1. RED tests written first, failing on pristine trunk (capture RED evidence).
2. Implement, suites green: draftChanges.test.ts, ChangesPanel.test.tsx,
   ChangesPanel.styling.test.tsx + touched AiTabPanel suites.
3. `cd app && npx tsc --noEmit` (or repo typecheck script) — NO new errors vs
   trunk baseline.
4. Commit on branch cl/lane1-changesui1-l1t1340.
5. Report to UNIQUE path: /home/brad/.hermes/cl/lanes/1/changes-ui-1-report-l1t1340.md
   (what changed, RED evidence, test output tail, typecheck delta). Log is
   orch-owned; do not write other reports.

## Constraints
- No server/ changes, no YAML, no compiler/grammar changes, no new widgets.
- No hardcoded material/role vocabulary in TS — everything from event data.
- draftChanges stays a pure function (no imports of editor state).
- exactOptionalPropertyTypes is ON in this repo — conditional spreads only.
- Do not restart the lane stack (orch does that); do not touch :3001/:5174.
- node_modules: symlink app/node_modules -> /mnt/vast/home/brad/git/cl-integration-1/app/node_modules (the lane's established worktree pattern; frozen-lockfile install is known-broken on this trunk — do NOT pnpm install).

## Browser gate criteria (verbatim from the list, orch-owned)
cl-browser-reviewer VERDICT: accept against :5192 on the canonical 40-well
utterance: composition rows readable, amounts complete, labware human-named,
long list scrolls, clarification visible without window-scroll.
