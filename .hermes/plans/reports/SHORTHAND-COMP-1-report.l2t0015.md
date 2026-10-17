# SHORTHAND-COMP-1 — coder report (lane 2, ticket l2t0015)

Branch: `SHORTHAND-COMP-1-lane2-l2t0015` off lane-2 trunk `a28d9789`.
Code tip: **44b037f6**; this report is committed on top of it (branch tip = the report commit). Working tree committed clean.
Spec: `.hermes/plans/2026-10-12_shorthand-comp-1-volume-wellrange-mixture-spec.md` (Parts III+IV, tasks 14-23).

## 0. Baselines (measured at MY branch point a28d9789, after reproducing lane-sync: symlinks + `server/schema` -> worktree `schema`; git status clean)

| Check | Command | Branch-point measurement | Spec pin | Head measurement |
|---|---|---|---|---|
| Server types | `cd server && npx tsc --noEmit \| grep -c "error TS"` | **0** | 0 | **0** (`/tmp/final-server-tsc.txt`) |
| App types | `cd app && npx tsc --noEmit \| grep -c "error TS"` | **23** | 23 | **23** (`/tmp/c5-app-tsc.txt`) |
| Compiler suite | `npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` | **17 files / 205 tests** | 17/205 | **19 files / 217 passed** (= baseline + my 2 new files: addMaterialVolume 5, declaredArgumentReachability 7) |
| Shorthand neighborhood | 3 named files | **3 files / 35 tests** | 3/35 | **3 files / 35 tests** (`/tmp/final-shorthand.txt`) |
| App ghosting neighborhood | previewProjection + wellRange | **2 files / 14 tests** | 2/14 | **3 files / 18 tests** (= baseline + my shorthandPreviewGhosting 4) |
| Golden pin | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` | same | `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` — **byte-identical, goldens never regenerated** |
| Full server suite | `npm run test:run -w server` | **90 failed / 607 passed / 9 skipped (706 files); 99 failed / 5597 passed / 70 skipped tests** | unverified in spec | **89 failed / 612 passed / 9 skipped (710); 98 failed / 5615 passed / 70 skipped** |
| Full `src/compiler/` (byte-identity gate) | `npx vitest run src/compiler/` | **16 failed / 136 passed (152); 33 failed / 1312 passed** | — | **16 failed / 138 passed (154); 33 failed / 1324 passed** |

Zero-NEW proof (exit-0 claims forbidden): the FAIL-FILE SETS are identical.
`grep '^ FAIL ' <run> | awk '{print $2}' | sort -u` then `comm -3 base head` → **empty** for `src/compiler/` (16 files both sides: seedModels.fluorescence, QuadrantStampExpander, aiPrecompileGating, BaselineFixtures, CrossTurnMini, FixItFixtures, FixtureRunner, PatternExpandersDebug, Prompt01Green, Prompt02Green, Prompt04DeepDebug, ParserEvalHarness, AiPrecompileShapeMismatch.log, GeminiEmAppliancePath, FourLayerCorrespondence, StructuralCorrespondencePass).
Full suite: `comm -3` shows ONE baseline-only entry — `src/integration/W25DraftLifecyclePromotion.test.ts` (baseline fail: "(e) candidate sha invariant"; passes at head, and passes standalone at head: 1 file / 5 tests). Net: **zero new failures; one baseline failure disappeared** (sha-invariant test sensitive to durable-repo state across full-suite runs — reported as observed, not claimed as my fix).

Spec parenthetical note: the spec's C2 gate line says biology-alone "5 files/68 tests incl. coerce at HEAD"; at MY branch point biology-alone is 4 files/59 tests (BiologyVerbExpander 35, compoundVerbs 14, ReadVerb 6, centrifugeVerbs 4) — the spec's parenthetical drifted from a28d9789; the AUTHORITATIVE compiler pin 17/205 matches exactly and is the gate I used.

## 1. First targeted check (spec-mandated): RED the expander file alone BEFORE any source change

`cd server && npx vitest run src/compiler/biology/verbs/addMaterialVolume.test.ts` (`/tmp/c1-red.txt`):

```
→ expected undefined to deeply equal { value: 50, unit: 'uL' }
→ expected { value: 10, unit: 'uL' } to deeply equal { value: 50, unit: 'uL' }
→ expected undefined to deeply equal { value: 0.05, unit: 'mL' }
→ expected 1 to be 96 // Object.is equality
 Test Files  1 failed (1)
      Tests  4 failed | 1 passed (5)
```

(The spec expected "3 of 4 fail"; my file pins a 5th assertion — the no-conversion arm — which also fails, so 4 of 5.)

## 2. Commit plan C1..C6 (RED->GREEN), with real outputs

| # | Commit | Message | Evidence |
|---|---|---|---|
| C1 RED | `e4196563` | `test(add_material): pin the silent drops — object volume and compact well range never reach the event` | §1 RED output |
| C2 GREEN | `807a846b` | `fix(add_material): honor the declared volume and expand a compact well range (silent drops end here)` | C1 file 1/5 passed (`/tmp/c2-green-c1file.txt`); biology 5/64 (`/tmp/c2-biology.txt`); compiler suite 18/210 = 205+5 (`/tmp/c2-suite.txt`); server tsc 0; MANIFEST `58c447eb…` |
| C3 RED | `ef2bbbc4` | `test(scientist-intent): a declared argument that reaches no event must bar, and a blob mixture must not mint` | `Test Files 1 failed (1); Tests 3 failed \| 4 passed (7)` (`/tmp/c3-red.txt`) — the 3 GUARD tests fail today, the 4 characterization pins pass |
| C3 GREEN | `01cf2958` | `fix(scientist-intent): loud clarifications for lossy declared args + mixture-blob bar (cues are data)` | target 1/7 passed; rip-out guard green (`/tmp/c3-green2.txt`: 2 files/15); compiler suite 19/217 (`/tmp/c3-suite2.txt`); shorthand 3/35; server tsc 0; MANIFEST unchanged |
| C4 pin | `f089f849` | `test(preview): pin the ghosting contract — a preview event needs wells AND a labware id to reach a well` | **characterization pin, not RED** — all assertions pass at HEAD as the spec predicted (`/tmp/c4-pin.txt`: 1 file / 3 tests passed) |
| C5 RED (Task 20) | `c9191e81` | `test(shorthand): the shorthand result must carry labware additions like the raw mapper (ghosting lost them)` | `Tests 1 failed \| 1 passed (2)` — `expected undefined not to be undefined` on `result.labwareAdditions` (`/tmp/c5-red-task20.txt`) |
| C5 GREEN (Task 20) | `069c9173` | `fix(shorthand): the shorthand result carries labware additions like the raw mapper (ghosting lost them)` | 1/2 passed (`/tmp/c5-green-task20.txt`); shorthand neighborhood 3/35; server tsc 0; MANIFEST unchanged |
| C5 RED (Task 21) | `93ff0283` | `test(shorthand): the compiled event must carry details.labwareId when the deck binds it (ghost has no bucket today)` | `Tests 2 failed \| 1 passed (3)` — `expected undefined to be 'LBW-96-1'` (`/tmp/c5-red-task21.txt`) |
| C5 GREEN (Task 21) | `c572d523` | `fix(shorthand): write the deck-bound labware id into details.labwareId so the deck can ghost it (seam: bindShorthandEventsToDeck, no-op-safe)` | 5 files/40 passed (`/tmp/c5-green-task21.txt`); full `src/compiler/` FAIL-set identical base↔head (§0) |
| Task 22 app leg | `41a7ddd8` | `test(preview): the fixed shorthand payload ghosts end-to-end through normalizePreviewEvents (bridges exercised, not assumed)` | 1 file/4 passed (`/tmp/c5-task22.txt`); app ghosting 3/18; app tsc 23 |
| Task 22 RED (server) | `40e13d6a` | `test(shorthand): a deck-bound singular well must ride the wells carrier the deck ghosts (Task 22 server leg)` | `Tests 2 failed \| 2 passed (4)` — `expected undefined to deeply equal [ 'A1' ]` (`/tmp/c5-red-task22-server.txt`) |
| Task 22 GREEN | `f8927e6e` | `fix(shorthand): a deck-bound singular well rides details.wells so the deck channel ghosts it (Task 22)` | 5 files/41 passed (`/tmp/c5-green-task22.txt`) |
| C6 e2e | `aea6e4e2` | `test(e2e): the fixed shorthand proposal ghosts A1:H12 with volumes on the deck (no model)` | `✓ [chromium] › e2e/deck-ghost-shorthand.spec.ts … (4.7s); 1 passed (6.3s)` against the RUNNING :5174 dev server (read-only; no stack restart) |
| docs | `44b037f6` | `docs(scientist-intent): name the cue data home in the reachability test header (mixture-material-cues.yaml)` | target re-run 1/7 passed |

## 3. D1/D2/D3/D4 drop proofs — before/after

**D2 (object volume dropped)** — BEFORE: probe `getExpander('add_material').expand({params:{labware_id:'plate',wells:['A1'],volume:{value:50,unit:'uL'},material:'DMEM'}})` emitted `{"well":"A1","material":"DMEM"}` — no volume key (spec probe; reproduced by C1 RED `expected undefined to deeply equal { value: 50, unit: 'uL' }`). AFTER: `addMaterialVolume.test.ts` pins `details.volume = {value:50,unit:'uL'}` + `volumeUl:50` in BOTH emit branches (legacy per-wells loop and modern single-well), object overrides scalar `volume_uL`, bare-number arm byte-identical. GREEN at `807a846b`.

**D3 (compact well range dropped)** — BEFORE: `wells:'A1:H12'` → 1 event, `{"material":"DMEM"}` — no well, no wells, no volume (C1 RED `expected 1 to be 96`). AFTER: `typeof rawWells === 'string' → expandWellTokens([rawWells])` BEFORE the `Array.isArray` branch (the ONE parser, `server/src/ai/wellRange.ts` — ZERO edits, no second parser), so the existing per-well loop fires: **96 per-well events** carrying `details.well` + volume (Task 15 shape decision: per-well events, matching the raw path's `expandEventWells` fan-out precedent). OQ3 timing: full `src/compiler/` at head carries the 96-event fan fine — 1357 tests, identical 33-fail set as base (§0). GREEN at `807a846b`.

**D4 (no diagnostic)** — BEFORE: the Part III document compiled `complete` with `clarifications: []` while values were dropped (spec probe; C3 RED: the string-volume document compiled complete with no clarification). AFTER: `normalizeScientistIntent.ts` producer clarifications — reason codes `unrealized-declared-argument` (Task 16, scoped to the two proven-lossy args `volume` + scalar `targetWells`, TODO naming the general model) and `unrealized-mixture-blob-material` (Task 17) — same envelope as `UNREALIZED_WELL_LABEL_REASON` (label + reason + actionLocation{actionIndex, action, argument}), appended after engine clarifications, bar via the existing atomic 422 needs-clarification arm (`compileScientistIntent.ts`), never 500. C3 GREEN test asserts `outcome === 'needs-clarification'` AND `terminalArtifacts.events === []` (atomic bar, no half-graph ships). **Task 16 guard pinned per the mandate by feeding a value the lowering CANNOT carry** (`volume: 50 uL` — a string, neither number nor quantity object), not just the already-passing volume/wells.

**D1 (blob mixture minting door)** — the minting door: `ensureLocalMaterialForDraft` (`server/src/materials/MaterialGrounding.ts:199`), reached via `normalizeCompositionMaterialRefs` → `AddMaterialSupport.ts:385`; the shipped rule the blob violates is at `AddMaterialSupport.ts:628-631` ("A bare concept in a well is never right. Materialize it…"). BEFORE: `Trypsin-EDTA/DMEM (50:50)` rode the candidate verbatim and compiled complete — one blob-named material reachable by the door. AFTER (interim, per OQ1 default): a cue-shaped `material` with NO declared components bars with `unrealized-mixture-blob-material` naming the cues found and citing the rule; the blob never reaches an event, so nothing downstream can mint it. A mixture label WITH declared `params.composition` (Part I form) is NOT barred; a plain single material is untouched. Cues are DATA: `config/drafting/mixture-material-cues.yaml` (`cues:` list), loaded PER call (never process-cached — bait 9: no stack restart needed to see a cue edit; absent file/section ⇒ bar OFF). Zero cue literals in TypeScript.

## 4. Part IV seam decision (criterion 5): the ONE producer of `details.labwareId`

**CHOSEN seam: `bindShorthandEventsToDeck` (server/src/ai/shorthandChat.ts)** — the chat seam's declared boundary repair. When the event's labware label is deck-provable (exact deck-name match → bound id, or already a known deck id) and `details` carries NO `labwareId`, the bound id is written there; an existing `details.labwareId` is never overwritten and an unprovable label is never copied (byte-passthrough arms unchanged; pinned in `shorthandChat.labwareIdBinding.test.ts` NO-OP arm).

**REJECTED: Option A (resolve_labware write-back onto events)** — rejected BY EXECUTION, not by reading. I applied the write-back as a probe (temporary, reverted; `ChatbotCompilePasses.ts` has ZERO edits on this branch) and ran the suite: the three MANIFEST-pinned graph goldens diverged:

```
FAIL goldenIntentToGraph.transfer-read   → blessed vs replay diverge at char 569
  blessed: …"details":{"destination_labware":"destination plate",…,"volumeUl":50},"event_type":"transfer","labwareId":"des…
  replay:  …"details":{"destination_labware":"destination plate","labwareId":"LAB-dest-plate",…
FAIL goldenIntentToGraph.labware-hint-regression (char 489)
FAIL goldenRolesSeam
```

The goldens' events and the shorthand events are the SAME shape (symbolic label as top-level `labwareId`, no `details.labwareId`), so any guard that spares the goldens also no-ops the shorthand fix — and `goldens/**` is MANIFEST-frozen + explicitly out of scope. Option B (client resolves hints via the `resolvedLabwares` table) was not chosen because the table is not guaranteed present on every channel; the chosen seam instead makes the EVENT itself carry the provable id, server-side, where the deck buckets it. Task 20 (`labwareAdditions` on the result) still ships the placement so the ghost labware can be placed.

**Task 22 finding (named per plan):** the shorthand proposal reaches the DECK through `buildPreviewFromDraft` → `buildPreviewWellIndex`/`getAffectedWells`, which ghost wells ONLY from `details.wells`/`source_wells`/`dest_wells`/`source.wells`/`target.wells`/`mapping` — never the singular `details.well`. The `normalizePreviewEvents` bridge (useAiChat.ts) runs only on the labware-editor chat channel. So a deck-bound singular well was invisible on the deck. Fixed server-side at the chat seam: a deck-bound singular well now also rides `details.wells` (single-element array; the >1 range arm unchanged). The app was NOT edited (out of scope; bridges exercised by the Task 22 app leg through the real `normalizePreviewEvents` seam via `useAiChat` + mocked stream).

**Task 20 DRY choice:** kept two mappers. `compileResultToAgentResult` maps a `ChatbotCompileResult` and lives in `AgentOrchestrator.ts` (out of scope); `shorthandResultFromCompile` maps a `ScientistIntentCompileResult`. They share a few spread lines, not half their body — shared-mapper extraction NOT warranted.

## 5. Volume unit-conversion gap statement (spec Task 14 caveat)

No unit arithmetic anywhere. `{value:0.05, unit:'mL'}` carries `volume` with NO `volumeUl` (pinned: `'volumeUl' in details === false`) — claiming volumeUl for a non-uL unit would be dimension fiction. Gap observed downstream (NOT fixed, out of scope): the client's `applyAddMaterial` (`app/src/graph/lib/eventGraph.ts:457`) adds `details.volume?.value` to `volume_uL` regardless of unit, so a mL volume would render as µL in the tooltip; the server's `maxTransferVolumeUl` (ChatbotCompilePasses.ts) reads only `unit==='ul'` structured volumes. Reported as a finding for the orchestrator; the acceptance prompt uses uL so the gate is unaffected.

## 6. Assumptions made

1. **Cue data home = `config/drafting/mixture-material-cues.yaml`** (the spec's OQ1 alternative), NOT `shorthand-drafting.yaml`: the rip-out guard `vocabularyRipOut.test.ts` bait 11 ("no parser module for any other grammar exists in the scientistIntent dir") FAILS when `normalizeScientistIntent.ts` imports the shorthand drafting layer — proven by execution (`/tmp/c3-suite.txt`: `vocabularyRipOut.test.ts (8 tests | 1 failed)` at line 52). The scientistIntent layer therefore loads the cue YAML itself (local loader, per-call, no process cache). The guard is also case-insensitive on the word "shorthand" in scientistIntent comments — comments were reworded; final guard run green (8/8 within the 19/217 suite).
2. **Task 21 commit message deviates from the plan's `fix(resolve_labware): …` shape** because Option A was empirically rejected (§4); the plan's own criterion 5 requires naming the chosen seam and the rejected option. `ChatbotCompilePasses.ts` untouched.
3. **e2e spec uses the seeded deck fixture `EVG-SPK-VERIFY`** (idempotent PUT reset, the same pattern as `deck-equipment-via-agent.spec.ts` et al.): the live stack's PUT does not CREATE a record (`NOT_FOUND` for a fresh id), and creating records/stack changes is out of bounds.
4. **e2e ran against the already-running :5174 dev server** (read-only; no stack restarted; no ports touched). The stubbed payload is the exact FIXED server shape (per-well events with `details.labwareId` + `details.wells` + `volume`/`volumeUl` + `labwareAdditions`), verified against the real seam output (`shorthandChat.labwareIdBinding.test.ts` first test drives parse→compile→result→deck-bind).
5. **Live legs (Tasks 18, 23.1-23.3) are ORCHESTRATOR-GATED** and were NOT run here: no stack restart, no :5193 browser gate. The browser receipt for "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well." on :5193/runs (ghost wells A1:H12 at 50 µL, no blob record) is pending the orchestrator's post-merge leg. The e2e stub spec is the deterministic stand-in (Task 23.4).

## 7. Acceptance criteria → evidence map

- **Headless: shorthand draft with volume+well-range survives normalizer→expander→compiled graph byte-faithfully (50 uL to A1:H12 lands 96 wells at 50 µL)**: `declaredArgumentReachability.test.ts` CHARACTERIZATION drives the REAL pipeline (parse→normalize→compileScientistIntent with store-backed spine): `outcome complete`, `clarifications []`, **96 events**, `details.volume {value:50,unit:'uL'}`, `volumeUl 50`. Plus `addMaterialVolume.test.ts` 5/5 at the expander.
- **Ghosting regression test shows deck wells + tooltip populated from the compiled proposal**: `shorthandPreviewGhosting.test.ts` (4/4: shipped payload finds no wells / buckets under no labware = the pinned regression; fixed shape ghosts; end-to-end through `normalizePreviewEvents` yields `details.wells` + `details.labwareId`) + `deck-ghost-shorthand.spec.ts` e2e (ghost tile `data-ghost="true"`, 96 wells `data-preview="true"`, A1 tooltip shows 50) — 1 passed.
- **Unit tests BOTH sides (server event carries details.labwareId + wells; client buckets it)**: `shorthandChat.labwareIdBinding.test.ts` 4/4 (server side incl. NO-OP arms) + app ghosting file (client side).
- **`shorthandResultFromCompile` carries `labwareAdditions` (pinned)**: `shorthandChat.labwareResult.test.ts` 2/2 (present with recordId; ABSENT key when none — exactOptionalPropertyTypes).
- **No declared argument dropped without a structured clarification (pinned)**: C3 guard tests (string volume bars naming `volume`; blob material bars naming cues).
- **A mixture label never becomes a single blob-named material record (pinned)**: C3 blob bar test asserts `needs-clarification` + `events []` (the minting door can never see it). Live trace = orchestrator leg (§6.5).
- **Raw path unchanged (byte-identity pins green)**: full `src/compiler/` (incl. rolesSeam 20/20, goldens, chatbot-pipeline fixtures) FAIL-set identical base↔head (§0); Task 21 NO-OP arms pinned; bare-number volume arm byte-identical; `bindShorthandEventsToDeck` byte-passthrough pin still green (deck-binding neighborhood 3/35).
- **MANIFEST freeze**: hash `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` identical at branch point AND head; `goldens/**`, vocabulary YAML, scientist-intent schema, pipeline YAML: zero edits.
- **File set**: `git -c core.fileMode=false diff --name-only a28d9789..HEAD` = exactly 10 paths — product: `server/src/compiler/biology/verbs/simpleVerbs.ts`, `server/src/compiler/scientistIntent/normalizeScientistIntent.ts`, `server/src/ai/shorthandChat.ts`, `config/drafting/mixture-material-cues.yaml` (4 of the ≤6 in-scope; `ChatbotCompilePasses.ts` and `wellRange.ts` ZERO edits); tests: `addMaterialVolume.test.ts`, `declaredArgumentReachability.test.ts`, `shorthandChat.labwareResult.test.ts`, `shorthandChat.labwareIdBinding.test.ts`, `app/src/event-editor/lib/shorthandPreviewGhosting.test.ts`, `app/e2e/deck-ghost-shorthand.spec.ts`. No `AgentOrchestrator.ts`, no MANIFEST-pinned file, no lane-1 file touched.

## 8. Unresolved / for the orchestrator

- Live browser gate on :5193 (Tasks 18, 23.1-23.3) — orchestrator-scheduled after merge; expect per-well events `volume {value:50,unit:'uL'}` + `volumeUl:50`, ghost A1:H12, populated tooltip, NO record named "Trypsin-EDTA/DMEM (50:50)".
- Client unit-fiction gap for non-uL volumes (§5) — finding, not fixed (app product code out of scope).
- Hot-file rule: `shorthandChat.ts` and `normalizeScientistIntent.ts` are on my diff; if trunk moves them before merge, re-anchor and re-run (§0 table commands).
- Full-suite W25DraftLifecyclePromotion flake direction flipped base→head (§0) — worth a glance at merge, not a blocker.

## 9. Final commits

`e4196563` C1 RED · `807a846b` C2 GREEN · `ef2bbbc4` C3 RED · `01cf2958` C3 GREEN · `f089f849` C4 pin · `c9191e81` T20 RED · `069c9173` T20 GREEN · `93ff0283` T21 RED · `c572d523` T21 GREEN · `41a7ddd8` T22 app leg · `40e13d6a` T22 RED · `f8927e6e` T22 GREEN · `aea6e4e2` C6 e2e · `44b037f6` code tip · report commit (branch tip, `git log -1`).
