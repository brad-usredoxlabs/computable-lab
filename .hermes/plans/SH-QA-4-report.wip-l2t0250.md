# SH-QA-4 coder report (wip, l2t0250)

Branch: cl/SH-QA-4-lane2-l2t0250 @ worktree /mnt/vast/home/brad/git/wt/SH-QA-4-lane2-l2t0250
Branch point: 95f73755 (tip of cl/integration-2 at coder start).
node_modules: symlinked from trunk worktree (lane convention: SH-QB-1-lane2-l2t1535 precedent; gitignored).

## Cite re-pins at branch point 95f73755 (ALL spec cites hold exactly)

- app/src/graph/lib/eventGraph.ts
  - :309 `normalizeConcentration(options?.concentration ?? details.concentration)` — HOLDS
  - :311 `const volume_uL = details.volume?.value || 0` — HOLDS
  - :312-314 canComputeAmount / canonicalAmountValue = conc x carrier — HOLDS
  - :325 `carrierVolume_uL: volume_uL` in createLedgerEntry — HOLDS
  - :342 `existing.carrierVolume_uL += incoming.carrierVolume_uL` (mergeLedgerEntry) — HOLDS
  - :381-385 isMeaningfulComponent (carrierVolume>0.001 || amount || count) — HOLDS
  - :393/:520 transfer scaling `carrierVolume_uL * fraction` — HOLDS
  - :428 `volume_uL: component.carrierVolume_uL` in deriveMaterialEntry — HOLDS
  - :447 `.filter((material) => material.volume_uL > 0.001 || typeof material.count === 'number')` — HOLDS
  - :459 `newState.volume_uL += volume` — HOLDS
  - :465 `if (snapshot.length > 0)` — HOLDS
  - :469 count grant `(entry.role === 'cells' || snapshot.length === 1)` — HOLDS
  - :470-476 snapshot arm createLedgerEntry call — HOLDS
  - :477-492 no-snapshot arms (CURIE split + plain) — HOLDS
  - :941 formatVolume, :948 getMaterialsSummary — HOLDS
- app/src/event-editor/focus/WellTooltip.tsx :61 header volume, :85 role suffix, :87 `conc ?? count ?? '—'`, :88 per-row `formatVolume(m.volume_uL)` — ALL HOLD
- Siblings (OQ1 fold-in): graph/labware/WellTooltip.tsx:104, graph/wellcontext/WellContextPanelV2.tsx:284, graph/context-panel/ContextPanel.tsx:266 — ALL HOLD (identical `formatVolume(...volume_uL)` reads)
- Types: MaterialEntry eventGraph.ts:31-44 (volume_uL required), WellComponentLedgerEntry :47-63, CompositionEntryValue app/src/types/material.ts:50-56 (has `source?: string`), AddMaterialDetails.counter_density events.ts:159 — HOLD
- acceptedEventGraphProjection.ts:171 already guards `typeof material.volume_uL === 'number'` — HOLD
- Other MaterialEntry.volume_uL consumers found beyond spec list: graph/LabwareEventEditor.tsx :1881/:1997/:3340 (event-drafting paths, OUT of scope, must keep compiling — they do since volume_uL stays required).

## Branch-point baselines (measured BEFORE any edit)

- Targeted vitest `src/event-editor/focus src/graph/lib src/graph/labware src/shared/lib`: 16 files / 81 tests, ALL PASS (zero fail-files). Raw: /tmp/shqa4-base-targeted.txt
- app `npx tsc --noEmit`: 27 error lines (spec said 23 at 228a3f84/27ef008f; trunk drifted — RE-MEASURED per dispatch instruction). File breakdown: ProtocolAuthoringWidgets 4, SequencesPage 3, WorkstateProposalCard 2, QuestionsPanel 2, editorHistory.test 2, + 14 singles. Raw: /tmp/shqa4-base-app-tsc.txt. Zero NEW lines allowed vs THIS baseline.
- server `npx tsc --noEmit`: 26 error lines (md5 3fa15838b3faaa90b45b9662d928c059). NOTE: spec's "1" was measured in the TRUNK worktree, which has untracked server/src/ai/*.ts files (SH-QA-3 in-flight cluster) that satisfy imports my clean worktree cannot — hence TS2307 noise here. My owned diff touches zero server files, so my server tsc output must stay byte-identical to THIS baseline. Raw: /tmp/shqa4-base-server-tsc.txt

## Design (coder's representation call under bait B3/B4, spec floor honored)

Mark, don't erase:
1. `WellComponentLedgerEntry` + `MaterialEntry` gain optional fields:
   - `volumeIsCarrier?: boolean` — set ONLY when the row derives from a MULTI-entry composition_snapshot (snapshot.length > 1). Means: `volume_uL` on this row is the mixture's carrier, NOT the material's own volume.
   - `fractionOfMixture?: string` — generic parse of the snapshot entry's `source` via exported `parseMixtureFraction` in eventGraph.ts (`^\s*([\d.]+\s*%)\s+of\s+the\s+mixture\s*$`, matches simpleVerbs.ts:385 shape; NO material-name keys; unparseable -> absent, display shows nothing — spec's allowed "raw-string-or-nothing" degradation, chose nothing to avoid dumping raw prose into a numeric column).
   - `counterDensity?: ConcentrationValue` — event-level `details.counter_density` attached generically to the row that carries the count (same predicate as the :469 count grant; never name lookup).
2. `volume_uL` stays REQUIRED on MaterialEntry (B4): LabwareEventEditor/acceptedEventGraphProjection keep compiling untouched; ledger `carrierVolume_uL` NOT zeroed (transfer scaling :393/:520, isMeaningfulComponent, merge sums all intact). Only the PUBLICATION semantics change: the row is marked, and presentation suppresses the carrier claim on marked rows.
3. Row-survival gate :447 needs NO change: carrier rows still carry volume_uL > 0.001, so the four mixture rows stay visible (bait B3 defused by design).
4. Requirement-4 guard: createLedgerEntry options gain `noEventConcentrationFallback?: boolean`, passed true ONLY from the snapshot arm -> `:309` fallback to `details.concentration` is dead for composition rows; no-snapshot arms byte-identical (clofibrate fixture keeps working).
5. Focus WellTooltip: volume cell renders `fractionOfMixture` for carrier rows (never a volume); conc cell for carrier rows joins conc/count/density side-by-side (`' · '`-joined, missing parts dropped); non-carrier rows byte-identical (`conc ?? count ?? '—'`, `formatVolume`). Header :61 stays the single volume assertion.
6. Siblings (OQ1): same one-line pattern — meta line built as filtered join; carrier rows show fraction (not volume), density beside count; non-carrier rows byte-identical output.
7. NO fraction math anywhere (B1): the parsed share is displayed AS text, never multiplied. NO reagent/cell-line literals in product code (B6): only role==='cells' (existing) + generic regex. NO YAML/schema/server touches (B7).

## Test plan (RED-first)

- EXTEND app/src/event-editor/focus/wellStateProjection.test.ts:
  - T1 RED: mixture fixture (volume 100 uL, count 50000, counter_density 500 cells/uL, 4-entry snapshot solvent/buffer_component/additive/cells with "NN% of the mixture" sources) -> well total 100 once; every composition row marked volumeIsCarrier (no own-volume claim); cells row count 50000 + density, marked; fractions surfaced; rows survive filter.
  - T2 RED: composition event with event-level details.concentration -> no composition row carries a concentration (misattribution dead).
  - T3 GREEN pins: no-snapshot single-material keeps volume_uL === event volume, unmarked; single-entry snapshot (length===1) keeps volume display, unmarked (B2 pin).
- NEW app/src/event-editor/focus/WellTooltip.test.tsx:
  - T4 RED: T1 state rendered -> `100.0 µL` appears exactly once (header); zero `.well-tooltip__material-vol` cells reading `100.0 µL`; cells row shows `50,000 count` + density, no volume; fraction `50%` visible.
  - T5 GREEN pin: single-material state -> row volume cell `100.0 µL` as today.
- NEW sibling tests (OQ1 fold-in): graph/labware/WellTooltip.test.tsx, graph/wellcontext/WellContextPanelV2.test.tsx, graph/context-panel/ContextPanel.test.tsx — mixture event -> material meta rows contain NO `100.0 µL` carrier claim, fraction visible; single-material meta line byte-identical to today.

## Progress log

- [x] Worktree + branch created off 95f73755; node_modules symlinked.
- [x] All spec cites re-pinned at branch point (above) — every one holds.
- [x] Branch-point baselines captured (targeted vitest clean; app tsc 27; server tsc 26 byte-pinned).
- [ ] RED tests committed.
- [ ] GREEN implementation + targeted runs.
- [ ] tsc sorted-diff empty vs baselines; commit GREEN.

## RED leg (commit 26017219)

`npx vitest run <5 test files>` at RED: **6 failed | 7 passed (13)**.
Failed (expected RED): T1 (projection carrier marking/fraction/density), T2 (concentration misattribution), T4 (focus tooltip single-volume assertion), sibling mixture legs x3 (graph/labware WellTooltip, WellContextPanelV2, ContextPanel).
Passed throughout (pins, requirement 3): original preview test, T3 no-snapshot, T3 single-entry snapshot, T5 focus pin, sibling single-material pins x3.
Fixture pitfall found+fixed during RED authoring: `createLabware(type, name)` mints a RANDOM labwareId (generateLabwareId) — event details.labwareId must be built from `labware.labwareId`, not the name; panel tests render empty otherwise.

## GREEN leg (commit af5e9936)

Diff scope (git diff --stat HEAD before commit): exactly the 5 owned files —
app/src/graph/lib/eventGraph.ts (+60/-...), app/src/event-editor/focus/WellTooltip.tsx,
app/src/graph/labware/WellTooltip.tsx, app/src/graph/wellcontext/WellContextPanelV2.tsx,
app/src/graph/context-panel/ContextPanel.tsx. 119 insertions / 36 deletions. Zero server/, zero YAML, zero schema, zero e2e-spec, zero pin edits.

Targeted suites after GREEN:
- `src/event-editor/focus src/graph/lib src/graph/labware src/shared/lib`: **18 files / 89 tests passed** (base was 16/81; +2 new sibling test files). Fail-file comm base vs head: EMPTY (both zero fails).
- Sibling panel tests (wellcontext + context-panel): 2 files / 4 tests passed.
- Extra eventGraph consumers probed: event-editor/menus/wellMenuItems.test.ts + shared/hooks/useAiChat.empty.test.ts: 2 files / 11 tests passed.
- eventGraph.tube.test.ts + wellSignature.test.ts covered inside the graph/lib set: green.

Typecheck bars:
- app `npx tsc --noEmit`: 27 error lines head == 27 base; sorted diff EMPTY (raws /tmp/shqa4-base-app-tsc.txt vs /tmp/shqa4-head-app-tsc.txt).
- server `npx tsc --noEmit`: byte-identical to branch-point baseline (md5 3fa15838b3faaa90b45b9662d928c059 both sides; diff empty).

T1/T2/T4 + sibling mixture legs flipped RED->GREEN; T3/T5 pins stayed GREEN throughout (one mid-GREEN correction: fraction attach gated on `isCarrierComposition` so a single-entry snapshot keeps display byte-identical — caught by the T3 pin itself).

## Stop_boundary compliance

- No fraction math anywhere: the parsed share is displayed as text only; no diff line multiplies volume by a percentage (grep of added lines reviewed).
- Ledger `carrierVolume_uL` NOT zeroed/removed: transfer scaling (:393/:520-era), merge sums, isMeaningfulComponent all intact; only publication semantics changed via the marker.
- No reagent/cell-line literals in product code (regex is shape-only: `^\s*([\d.]+\s*%)\s+of\s+the\s+mixture\s*$` + role==='cells' predicate reuse). Fixture labels live only in test files.
- No YAML/schema/server/EventEditorContext/e2e-spec touches.
- Honest display needed NO new snapshot field (source/role/concentration/count/counter_density already carried) — no architect return required.

## Notes for the orchestrator

- Full app unit suite NOT run here (spec: orchestrator's merge-time step; CPU courtesy to live SH-QA-3 coder). Compare full fail-file sets base 95f73755 vs head af5e9936 at merge.
- Browser leg folded into SH-QB-1/SH-QC-1 gate per spec; reviewer criteria: (a) exactly one volume string on the mixture ghost tooltip (header), (b) no row shows 100.0 µL, (c) cells row shows 50,000 count + 500 cells/uL and no volume, (d) single-material hover (clofibrate-style) still shows its per-row volume; sibling surfaces (graph/labware tooltip, WellContextPanelV2, ContextPanel) show fraction instead of carrier volume.
- e2e pin app/e2e/deck-ghost-shorthand.spec.ts:329 `/50/` untouched; its single-material 50 µL leg keeps its row + header (requirement 3).
- app tsc baseline at MY branch point is 27 (not the spec's 23 — trunk drift), zero-new proven by sorted-diff against my own base raw.
