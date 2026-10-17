# SH-QA-4 — Deck tooltip states mixture volume once, not per component (SPEC DRAFT, l2t2250)

Status: DRAFT for orchestrator review. Not canonical until promoted.
Item: SH-QA-4 (campaign: shorthand hardening, lane 2), task-list.md:7971-8017.
Compose-time trunk: 228a3f84 (`git -c core.fileMode=false rev-parse --short HEAD` at compose; trunk
moved past 532ec676 -> ... -> 760a86c4 -> 228a3f84 since the task block was authored — EVERY cite
below was re-verified by direct read at 228a3f84, and every line number from the 532ec676-era map
still holds exactly at this tip).

## Goal (one sentence)

Stop the deck well tooltip from asserting a fabricated per-component volume (the mixture's carrier
volume pasted onto every composition row) and instead state volume once at well level, showing on
each composition row only what the snapshot actually carries — fraction, role, count, density.

## Contract header

- Worktree/branch: `wt/SH-QA-4-lane2-l2t<tick>` + branch `cl/SH-QA-4-lane2-l2t<tick>` off the
  CURRENT trunk tip AT CODER START (re-pin; trunk is 228a3f84 at compose time and SH-QA-3 will
  likely merge first — re-verify all cites at the branch point). `git -c core.fileMode=false` for
  EVERY git call.
- Deliverable path: report `.hermes/plans/SH-QA-4-report.wip-l2t<tick>.md` (unique per tick);
  commits `test(SH-QA-4): RED ...` then `feat(SH-QA-4): GREEN ...` in the same branch.
- File ownership IN scope (client presentation/projection ONLY):
  - `app/src/graph/lib/eventGraph.ts` (the fabrication sites :325, :428, :447, :469-475 and the
    concentration-misattribution guard :309/:312-314)
  - `app/src/event-editor/focus/WellTooltip.tsx` (the deck tooltip renderer — :88 per-row volume)
  - NEW/extended app tests (see RED plan): `app/src/event-editor/focus/wellStateProjection.test.ts`
    (extend), `app/src/event-editor/focus/WellTooltip.test.tsx` (NEW).
- OUT of scope (HARD):
  - ALL of `server/**` — pinned by evidence below (§both-ends: the server computes no per-well
    state and already carries everything the fix needs inside the event details).
  - The SH-QA-3 live cluster (coder running RIGHT NOW): `server/src/compiler/scientistIntent/**`,
    `server/src/compiler/resolution/resolutionEngine.ts`, `server/src/ai/shorthandChat.ts`,
    `config/drafting/shorthand-drafting.yaml` — byte-untouchable, and NOT needed (server out).
  - `app/src/event-editor/EventEditorContext.tsx` + ghost/preview wiring (SH-QC-1's domain; this
    item needs zero hunks there — the projection is pure).
  - `schema/**`, `config/**` (no YAML change — see bait B8), goldens/**, MANIFEST.
  - The three SIBLING render sites that show the same fabricated volume
    (`app/src/graph/labware/WellTooltip.tsx:104`, `app/src/graph/wellcontext/WellContextPanelV2.tsx:284`,
    `app/src/graph/context-panel/ContextPanel.tsx:266`) — NOT in the task block's `files:` line;
    fold-in is OQ1 (recommendation there). Default: byte-unchanged until the orchestrator rules.
- Serialization: SH-QA-4 is file-disjoint from SH-QA-1/2/3, SH-QB-1, SH-QC-1 per the wave note
  (task-list.md:8021-8024) — its owned files (app graph-projection + focus tooltip) intersect none
  of SH-QA-3's owned files (server-side only per the promoted SH-QA-3 spec). May ride alongside the
  live SH-QA-3 coder.
- Lane stack: backend :3093, frontend :5193; UI gate = NO separate run — fold the deck-tooltip
  criteria into SH-QB-1's or SH-QC-1's gate run on :5193 (task block, verbatim below).

## Ground-truth findings (verified by direct read at 228a3f84)

### The deep-dive report the task block cites
No standalone F1 deep-dive file exists under `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/`
(exhaustive greps: `carrierVolume` — zero .md hits in the whole `.hermes/` tree; `tooltip`+`F1` —
only the files listed at OQ2). What the task block calls the "verified cause + deep-dive report" is
carried by the intake tally
`/home/brad/.hermes/specs/intake/2026-10-14_post-suite-manual-findings/tally.md` (F1 block :25-36,
forensics note :88: "F1 root cause verified directly by architect: eventGraph.ts:325/:428/:469 +
WellTooltip.tsx:88") plus the honest-display audit embedded in the task block itself
(task-list.md:7988-7995). Everything from that map that I could re-check, I re-checked at the
current tip — all holds (below). OQ2 asks whether a separate deep-dive doc lives elsewhere.

### Both ends of the volume data flow

SERVER END (emits truth; computes no per-well state — evidence-pinned OUT of scope):
- The compiler's mixture expander is the ONLY place the fraction truth is authored:
  `server/src/compiler/biology/verbs/simpleVerbs.ts:385` —
  `...(typeof entry.fraction === 'string' ? { source: \`${entry.fraction} of the mixture\` } : {})`
  — i.e. each `composition_snapshot` entry may carry `source: "50% of the mixture"`. Per-component
  volume is NEVER emitted (expander doc-comment :334-341: "A `cells` component carries a COUNT,
  never a volume"). `counter_density` is event-level: `simpleVerbs.ts:84/:506/:530`
  (`counter_density: composition.counterDensity`).
- Store-write normalization KEEPS the fraction string:
  `server/src/materials/AddMaterialSupport.ts:186` (`source` preserved in
  `canonicalCompositionSnapshot`). The sibling enrichment builder
  `server/src/ai/materialRefLabels.ts:524-530` (`makeCompositionEntry`) emits
  `component_ref`/`role`/`concentration` only — no `source` — so snapshot entries on that path
  legitimately have NO fraction to show (the tooltip must tolerate absence; do not fix this
  server-side in this item).
- `grep -rn "computeLabwareStates" server/src` returns ZERO — the server has no well-state or
  per-component-volume projection at all. Ghost payload path: compiler -> assist stream /
  `/intent/compile` -> client preview events -> client projection. Server END NEEDS NO CHANGE:
  every field the honest tooltip needs (`source` fraction, per-entry `role`/`concentration`,
  event-level `count`/`counter_density`, event-level `volume`) already rides the event details.

CLIENT END (the fabrication, all four task-block lines still exact at this tip):
- `app/src/graph/lib/eventGraph.ts:311` `const volume_uL = details.volume?.value || 0` — the EVENT
  (mixture) volume.
- `:325` `carrierVolume_uL: volume_uL` — stamped on EVERY composition component via
  `createLedgerEntry` called per snapshot entry at `:466-476` (duplicated, not divided).
- `:342` `existing.carrierVolume_uL += incoming.carrierVolume_uL` in `mergeLedgerEntry` — repeat
  adds of the same component SUM the fiction (matches task block's mergeLedgerEntry note).
- `:428` `volume_uL: component.carrierVolume_uL` in `deriveMaterialEntry` — re-publishes the shared
  carrier as EACH material row's `volume_uL`.
- `:459` `newState.volume_uL += volume` — the well TOTAL is correct (added exactly once).
- `:469` `const count = typeof details.count === 'number' && (entry.role === 'cells' ||
  snapshot.length === 1) ? details.count : undefined` — the count grant to the cells row.
- `:309` `options?.concentration ?? details.concentration` + `:312-314` canonicalAmountValue =
  concentration x carrier volume — if `details.concentration` (the MIXTURE's) ever rides a
  composition add, it is misattributed to every component (requirement 4).
- Honest data the projection NEVER reads (verified: no `.source` read on snapshot entries, no
  `counter_density` read anywhere in eventGraph.ts): the fraction string and the density are inert.
- `app/src/event-editor/focus/WellTooltip.tsx:61` renders the honest well total
  (`formatVolume(state.volume_uL)`); `:88` renders `formatVolume(m.volume_uL)` per row — the
  fabricated 100.0 µL on every component row, `:87` the conc/count cell
  (`conc ?? count ?? '—'`), `:85` the role suffix. Tooltip body sums to 4x the header — F1 verbatim.
- Render chain of the deck tooltip: `app/src/event-editor/focus/LabwareFocus.tsx:555` ->
  `WellTooltip`; well state from
  `app/src/event-editor/focus/wellStateProjection.ts:7-12` (`eventsWithPreviewState` — preview
  events merge straight into `computeLabwareStates`, no volume re-derivation anywhere else).
- Row-survival gate: `eventGraph.ts:447` `.filter((material) => material.volume_uL > 0.001 ||
  typeof material.count === 'number')` in `syncDerivedMaterials` — if a composition row stops
  carrying a volume it DROPS OUT of the display unless this predicate learns about the new shape
  (bait B3).
- Other consumers of `MaterialEntry.volume_uL` (must keep compiling/behaving):
  `app/src/graph/lib/acceptedEventGraphProjection.ts:168-171` (already guards
  `typeof material.volume_uL === 'number'`), the three sibling render sites (OQ1),
  `app/src/graph/lib/wellSignature.ts` (uses concentrations only, not volumes — unaffected).

### Reference context (cited, untouched)
- SH-QA-1 gated channel: `server/src/ai/shorthandChat.ts:306` (auto-satisfy ledger note), `:316`
  (slot identity), `:347`/`:428` (content-keyed chat answer join), `:496` (ledger drop). Clarifies
  HOW the mixture turn reaches a proposal cleanly; irrelevant to volume but names files this item
  must not touch.
- SH-QB-1 recompile channel: `server/src/api/handlers/IntentCompileHandlers.ts:22-76` (deck-context
  threading via imported shorthandChat composition), `:126-150` (deck pass + loud-failure gaps
  channel); client leg `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:623` (same resolution
  context) and `:647` (loud-failure rule). Confirms the recompile path lands the SAME event details
  (composition_snapshot included) — the SH-QA-4 fix therefore also covers Save-&-Re-compile ghosts.

## Design

Presentation-only, vocabulary-free, no fraction math (stop_boundary honored):

1. `eventGraph.ts` — mark, don't erase. Keep `carrierVolume_uL` on the LEDGER (transfer/dilution
   bookkeeping at `:387-400` and `:515-528` scales it — do not break it), but stop
   `deriveMaterialEntry` (`:402-434`) from re-publishing it as per-row truth for rows that came
   from a multi-entry `composition_snapshot`: on those `MaterialEntry` rows the volume is not the
   material's own. Representation is the coder's call under bait B-3/B-4; the spec's floor is that
   `WellTooltip` cannot distinguish fabrication from truth without it (e.g. an optional
   provenance marker plus the carried fraction/density strings, chosen so
   `acceptedEventGraphProjection` and `wellSignature` stay green). Surface on composition rows what
   the snapshot carries: the fraction parsed generically from `source` (shared exported parser,
   e.g. leading proportion token `^\s*([\d.]+\s*%)\s+of\s+the\s+mixture\s*$` — generic, applied to
   whatever the entry says, NEVER keyed to reagent names; if it does not parse, show the raw
   `source` string or nothing — do not invent), `role` (already rendered), and `counter_density`
   (event-level at `details.counter_density`, attached generically to the row that carries the
   count — the cells row — never by name lookup).
2. Cells row: count, fraction/density — never a carrier volume (requirement 2). Single-material
   adds (`snapshot.length === 1` or no snapshot — `:477-492`): volume IS the material's volume;
   current display byte-unchanged (requirement 3, and it keeps the existing
   `deck-ghost-shorthand.spec.ts:329` `/50/` tooltip pin honest — that leg is a single-material
   50 µL add).
3. Requirement 4 guard: in `applyAddMaterial`'s snapshot arm (`:466-476`) pass ONLY
   `entry.concentration` — never fall through to event-level `details.concentration` — so no
   component's canonicalAmountValue can be computed from the mixture's concentration x full
   carrier (kills the `:309/:312-314` misattribution for composition rows; the no-snapshot arm
   keeps today's behavior byte-identical).
4. `WellTooltip.tsx` — the volume cell (`:88`) renders the volume only for own-volume rows; for
   composition rows it renders the fraction (parsed share), and the conc cell keeps
   `conc ?? count ?? '—'`, extended so a cells row can show count and density side by side without
   ever showing a volume. Header (`:61`) stays the single volume assertion.
5. NO changes to: event schema, composition_snapshot shape, server, EventEditorContext, the
   ledger's numeric behavior (well total `:459`, transfer scaling, merge sums).

## Acceptance criteria (task-list.md:8010-8014, verbatim)

> Red-first unit tests on the well-state projection + WellTooltip render: composition event ->
> exactly one volume assertion (well total), component rows show fraction/role, cells row
> count-only; single-material and dilution tooltips unchanged (existing tests green). Browser
> spot-check in SH-QB-1's or SH-QC-1's gate run (same deck surfaces) — no separate gate run.

Stop_boundary (task-list.md:8016-8017, verbatim):
> if honest display requires a field the composition_snapshot does not carry, return to architect —
> do not synthesize per-component volumes by fraction math.

(Finding: it does NOT require a new field — `source`, `role`, `concentration`, `count`,
`counter_density`, event `volume` are all already carried; verified above.)

## RED-first test plan

Unit harnesses that EXIST (use them; both already import `computeLabwareStates`/render react):
- `app/src/event-editor/focus/wellStateProjection.test.ts` — projection harness (vitest, jsdom via
  `app/vitest.config.ts`; pattern: build `createLabware('plate_96', ...)` + a preview add_material
  event, `computeLabwareStates`, assert well state). EXTEND with:
  - T1 RED: mixture fixture (event-level `volume {100, uL}`, `count 50000`,
    `counter_density {500, cells/uL}`, `composition_snapshot` = 4 entries with roles
    solvent/buffer_component/additive/cells and `source: "50% of the mixture"` style fractions —
    fixture data, no logic branches on labels) -> well `volume_uL` 100 ONCE; every composition-
    derived `materials` row makes NO own-volume claim (the assertion that reproduces F1); cells row
    carries count 50000 + no volume; fraction/role surfaced on rows.
  - T2 RED (requirement 4): composition event with event-level `details.concentration` -> no
    component row derives a concentration/canonical amount from it.
  - T3 GREEN-keeping pins (must pass NOW and stay passing): single-material add (no snapshot) keeps
    `materials[0].volume_uL === volume` (this is the existing test at `:33-36`);
    `eventGraph.tube.test.ts` + dilution paths unchanged.
- `app/src/event-editor/focus/WellTooltip.test.tsx` — NEW, `@testing-library/react` render (the
  `WellGrid.test.tsx` harness pattern: `render`, `container.querySelector`, `cleanup` in
  `afterEach`). RED:
  - T4: render the T1 fixture's well state -> header shows `100.0 µL` EXACTLY ONCE
    (`well-tooltip__volume` count assertion); ZERO `.well-tooltip__material-vol` cells reading
    `100.0 µL`; HepG2-fixture row shows `50,000 count` and no volume cell; fraction visible.
  - T5: render single-material state -> row volume cell renders exactly as today (pin against
    regression; keeps `deck-ghost-shorthand.spec.ts` contract honest).
- Browser leg (NO separate gate run — fold into SH-QB-1's or SH-QC-1's :5193 gate; criteria
  operationalized for the reviewer): on the run/deck surface, ghost the mixture sentence
  "Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL
  to each well." (the wave's SHARED REPRO ENV sentence, task-list.md:7555-7557; accept-path
  whatever that gate's fixture already exercises), hover a ghosted well, screenshot the tooltip.
  PASS = (a) exactly one volume string on the whole tooltip (the header total); (b) no component row
  shows the carrier volume (`100.0 µL` or equivalent formatted form) — F1's "every row 100.0uL"
  gone; (c) the cells row shows the count (and density where carried) and no volume; (d) single-
  material hover (e.g. the existing clofibrate-style add) still shows its per-row volume.

## Verification bars

- First targeted check (the early proof, run after the eventGraph flag+parser lands, BEFORE
  touching the tooltip): `cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run
  src/event-editor/focus/wellStateProjection.test.ts` — expect T1/T2 to flip RED->GREEN while the
  pre-existing single-material test stays GREEN throughout.
- Targeted suites: `cd app && npx vitest run src/event-editor/focus src/graph/lib src/graph/labware
  src/shared/lib` — expected: 0 failed files (measure the failing-file set at the branch point
  BEFORE the first commit; the owned diff must not ADD any failing file — comm-discipline on
  sorted fail-file lists, base vs head, per lane custom).
- Typecheck baselines MEASURED at 228a3f84 by the composer:
  - app: `cd /mnt/vast/home/brad/git/cl-integration-2/app && npx tsc --noEmit 2>&1 | grep -c "error TS"`
    -> **23** (all in test files + viewer/ingestion files unrelated to this item's owned files).
    Zero NEW lines allowed; sorted diff of the error list vs the branch-point baseline must be empty.
  - server: same command in `server/` -> **1** (`src/ai/AgentOrchestrator.ts(345,18): error
    TS2339 ... 'id' does not exist ...` — pre-existing at tip; owned diff must not touch server at
    all, so server tsc output must stay byte-identical).
- Full app unit suite is the orchestrator's merge-time step (CPU courtesy to the live SH-QA-3
  coder): `npm run test:unit -w app` from the lane worktree ROOT — compare full failing-file sets
  base vs head as per lane custom. Vitest cwd matters: run from `app/` (or via `-w app`), never a
  shell that mixes `server/` vitest config in.
- No YAML touched -> no :3093 stack restart needed for the unit track; the folded browser spot-check
  rides whatever gate run is live after the merge + stack restart.

## Reviewer bait (the likely edge errors for this item — pre-empt them)

- B1 NO FRACTION MATH. The single most tempting "fix" — 50% x 100 µL = 50 µL per row — is the
  stop_boundary verbatim forbidden ("do not synthesize per-component volumes by fraction math").
  The fraction is displayed AS FRACTION, never multiplied. Stash-proof expectation: any diff line
  multiplying `volume` by a parsed percentage in projection code is a reject.
- B2 Count-grant regression (`:469` `snapshot.length === 1` arm). Requirement 3 says single-
  material and `snapshot.length === 1` keeps current display. A fix that keys "composition event"
  off `snapshot.length > 0` instead of `> 1` silently changes single-component-snapshot adds. Pin
  with T3/T5.
- B3 Row-evisibility gate `:447` (`volume_uL > 0.001 || count`) and `isMeaningfulComponent`
  (`:381-385`, gates the ledger, keeps ghosts' purple wells alive via `getAffectedWells`). If rows
  stop carrying a volume without updating the display filter, the four mixture rows VANISH and the
  tooltip collapses to "No materials" — a worse fabrication. T1/T4 pin the opposite. Also do NOT
  zero the ledger `carrierVolume_uL`: transfer scaling (`:387-400`), wash/merge, and
  `isMeaningfulComponent` all depend on it; only the per-row PUBLICATION changes.
- B4 `MaterialEntry.volume_uL` is typed required and consumed by
  `acceptedEventGraphProjection.ts:171` and (pending OQ1) three sibling renderers. If the design
  makes it optional, those sites must be checked/touched deliberately, not accident-patched — and
  `app/tsconfig.json` has `noUnusedLocals/noUnusedParameters` + `strict` (note:
  `exactOptionalPropertyTypes` is SERVER-only (`server/tsconfig.json:13`); app is NOT
  exactOptional — but keep the repo's conditional-spread idiom anyway for diff hygiene).
- B5 Requirement-4 misattribution (`:309` fallback `?? details.concentration`, `:312-314`). Fix it
  in the snapshot arm only; a global removal of the fallback regresses no-snapshot adds that rely
  on `details.concentration` (e.g. the existing clofibrate fixture in
  `wellStateProjection.test.ts:20`). T2 pins composition rows; T3 pins the rest.
- B6 Hardcode boundary (repo rule: business logic in data, code makes no policy decisions). NO
  reagent/cell-line literals ("HepG2", "DMEM", "Trypsin", "FBS") anywhere in product code; role
  checks ride the `role` field (`'cells'`) exactly as `:469` already does. Fixture TEST data may
  use the mixture sentence verbatim (it is repro data, not policy). The fraction parser matches the
  GENERIC shape the compiler emits (`simpleVerbs.ts:385`), not any material name; unparseable
  `source` degrades to raw-string-or-nothing, never to a guess.
- B7 YAML-reload trap: do NOT be clever and move the display rule into
  `config/drafting/shorthand-drafting.yaml` (SH-QA-3's LIVE file — fleet-lock collision) or any
  other YAML requiring a :3093 restart. No schema/YAML change exists in scope; any diff touching
  them is out-of-contract.
- B8 `exactOptionalPropertyTypes` (server) does not apply to owned files, but `PlateEvent.details`
  re-publishing does: do not mutate `details`/snapshot entries in place (the projection clones
  state; a mutation leaks into the editor's committed events). Clone discipline per existing
  `cloneWellState` pattern.
- B9 Existing e2e pin `app/e2e/deck-ghost-shorthand.spec.ts:329` asserts a ghosted-well tooltip
  `toContainText(/50/)` — that's a single-material 50 µL add: the HEADER total keeps it passing
  (requirement 3 keeps its row too). Do not "help" by editing that spec.

## Open questions (recommendations included; orchestrator rules)

- OQ1 Sibling render sites: the same `m.volume_uL` fabrication renders at
  `graph/labware/WellTooltip.tsx:104`, `WellContextPanelV2.tsx:284`, `ContextPanel.tsx:266` (all
  verified at tip). The task block's `files:` names only focus/WellTooltip.
  RECOMMEND: include them in this item — they are one-line-each reads of the same new field/flag
  with the identical bug, and leaving them renders the same well inconsistently across surfaces.
  If the orchestrator rules strict-to-files-line instead, they stay byte-unchanged (bait B-OQ1 pin:
  tests must not depend on them) and a follow-up item is filed.
  Checked: task block :8015 files line; all three sites read `state.materials` from the same
  projection; no other display consumer exists (`wellSignature` ignores volumes).
- OQ2 The task block cites a "deep-dive report" under `.hermes/plans/`; no such standalone file is
  there (searched: `carrierVolume` zero .md hits across the lane `.hermes/` tree; the F1 map lives
  in the intake `tally.md` + the task block itself, and every architectural claim in it re-verified
  at 228a3f84). RECOMMEND: accept tally.md + the re-verified task-block map as the deep-dive
  provenance (nothing load-bearing is missing). Checked: `.hermes/plans/**` greps (tooltip, F1,
  carrier, HepG2, deep-dive, 532ec676), `.hermes/plans/drafts|reviews|reports|handoffs`, intake dir.
- OQ3 Cells-row density when the count grant fires via the `snapshot.length === 1` arm with NO
  `counter_density` (density is event-level and may be absent): show count only (density absent
  silently), never a derived density. This is a display-ethics default, not a data gap; RECOMMEND
  count-only. Checked: `AddMaterialDetails.counter_density` optional (`app/src/types/events.ts:159`),
  compiler emits it only when the cells entry declared one (`simpleVerbs.ts:389-393`),
  `AddMaterialSupport.ts` never synthesizes it.

## Assumptions the coder may NOT make

- That any server change is needed — it is not (evidence: zero `computeLabwareStates` in
  server/src; fraction string + role + per-entry concentration + count + counter_density all
  already ride the event to the client). Touching server/** is an instant out-of-contract.
- That per-component volumes may be computed from fractions (stop_boundary) or that the ledger's
  `carrierVolume_uL` may be zeroed/removed (it is transfer/dilution bookkeeping and the meaningful-
  component gate).
- That "HepG2", "DMEM", "Trypsin", "FBS" (or any material/cell-line literal) may appear in product
  code, or that `'cells'`-role logic may read labels — role/shape-driven only.
- That `EventEditorContext.tsx`, the SH-QA-3 hot cluster, `schema/**`, or any YAML may be edited
  "while passing through".
- That the browser gate is this item's own run — it is a SPOT-CHECK folded into SH-QB-1's or
  SH-QC-1's gate; a coder shipping without any browser evidence is fine ONLY because the
  orchestrator owns that folded leg.
- That the existing single-material/dilution tests, the `/50/` e2e tooltip pin, the goldens, or the
  accepted-graph projection may be adjusted to accommodate the fix (fix the fix, not the pins) —
  except where OQ1 rules fold in the sibling renderers, which then get their own test coverage.
- That the 532ec676-era line numbers are current without re-verification — they happen to hold at
  228a3f84, but the coder branches later; re-pin every cite at branch point.

SPEC-DRAFT-SHQA4 DONE /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_2355-SH-QA-4-tooltip-volume-spec-draft-l2t2250.md
