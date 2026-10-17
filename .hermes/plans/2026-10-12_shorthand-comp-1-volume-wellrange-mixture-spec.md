# SPEC — SHORTHAND-COMP-1: stop the silent data loss (volume, well range, mixture) — plan Parts III+IV, tasks 14-23

> Composed 2026-10-12 by cl-spec-composer (l2t2010) for the lane-2 coder.
> Canonical plan: `.hermes/plans/2026-10-11_115357-shorthand-material-composition-decomposition.md` — **ONLY Part III (tasks 14-18) and Part IV (tasks 19-23) are in scope.** Part I (1-7) is SHORTHAND-COMP-3, Part II (8-13) is SHORTHAND-COMP-2 — do NOT do them here.
> **Re-anchor note:** the plan pinned line numbers at `d6d2c689`. Trunk HEAD at composition time is **`df1eab12fd25467de754488d14db4a00c551151a`** ("docs(lane2): l2t1910 checkpoint…"). EVERY line number in this spec was re-verified first-hand at `df1eab12`. If trunk has moved when you branch, re-anchor before coding.

## Goal (one sentence)

When the shorthand path compiles `add_material`, the scientist's declared volume (`{value, unit}`), compact well range (`A1:H12`), and mixture must reach the emitted events (or bar loudly with a structured clarification) — and the compiled proposal must carry `details.wells` + a labware id so the deck ghosts the wells instead of rendering an empty tooltip.

## The three drops — verified BY EXECUTION at df1eab12 (not just by reading)

Probes run with `npx tsx` inside `server/` (read-only, no trunk edits):

| # | Probe input to `getExpander('add_material').expand(...)` | Actual emitted details | Fact |
|---|---|---|---|
| D2 | `params: { labware_id:'plate', wells:['A1'], volume:{value:50,unit:'uL'}, material:'DMEM' }` | `{"well":"A1","material":"DMEM"}` | the declared volume object is **gone** |
| D3 | `params: { labware_id:'plate', wells:'A1:H12', volume:{value:50,unit:'uL'}, material:'DMEM' }` | 1 event, `{"material":"DMEM"}` | **no well, no wells, no volume** |
| D1 | `params: { labware_id:'plate', well:'A1', material:'Trypsin-EDTA/DMEM (50:50)' }` | `{"well":"A1","material":"Trypsin-EDTA/DMEM (50:50)"}` | blob survives verbatim |

And through the normalizer (Brad's exact Part III document), the candidate carries everything, proving the drop is downstream:

```
candidate: {"verb":"add_material","material":"Trypsin-EDTA/DMEM (50:50)","volume":{"value":50,"unit":"uL"},"wells":"A1:H12"}
clarifications: []        ← nothing complained
```

### Drop sites (file:line at df1eab12)

1. **D2 — object volume dropped** in `server/src/compiler/biology/verbs/simpleVerbs.ts`:
   - `addMaterialExpander` at **:326**; `volumeUl` computed at **:335-351** reads only `params.volume_uL` / `params.volume_ul` / a BARE-NUMBER `params.volume` (arm at **:340**) / `material.volume_uL`. An object `{value, unit}` fails `typeof === 'number'` and is discarded.
   - Both emitted `details` write volume only from `volumeUl`: legacy branch **:365**, modern branch **:380**.
   - Proof the omission is verb-specific: `transferExpander` reads the SAME shape at **:438** (`params.volume as { value: number; unit: string }`).
   - The carrier is intact: `normalizeScientistIntent.ts` mapping `['volume', ['volume']]` (~**:203**) and `ChatbotCompilePasses.ts:1091` (`const { verb, ...params } = cand;`) hand `params.volume` to the expander. The drop is ONLY in the expander.
2. **D3 — scalar well range dropped**:
   - `add_material`'s declared vocabulary args (`schema/scientist-intent/scientist-intent-vocabulary.yaml` **:203-233**) are `source, target, labware, material, source_name, volumeUl, volume` — **no wells arg** (grep `kind: wells` shows them on other verbs only). So `declaredWellsArgs('add_material', vocab)` is ∅, SPINE-7's symbolic-label branch does not fire, and `targetWells: "A1:H12"` rides the candidate as `event.wells = "A1:H12"` — a plain string (probe above).
   - The expander gates `if (wells && Array.isArray(wells))` at **simpleVerbs.ts:354**; a string fails it, the modern branch then writes `...(well ? { well } : {})` with `well === undefined` (**:376**) → nothing.
   - The one range parser is `server/src/ai/wellRange.ts`: `expandWellTokens(tokens: readonly string[]): string[]` is **already exported** at **:38** and handles `"A1:H12"` → 96 wells (row-major, deduped). The plan's "add a tiny `expandWellRangeString`" is UNNECESSARY — call `expandWellTokens(['A1:H12'])`. There must be NO second range parser.
   - Do NOT "fix" this by declaring `targetWells` in the vocabulary YAML: per the plan (D3 note), a scalar on a declared `kind: wells` arg is a SYMBOLIC LABEL routed to the spine (SPINE-7 branch, `normalizeScientistIntent.ts:239-263`) — asking the spine to resolve "A1:H12" as a noun is the wrong fix, and the vocabulary file is MANIFEST-pinned anyway.
3. **D1 — blob mixture**: the shorthand path never decomposes a mixture (that is Part I / COMP-3). The minting door is named: `ensureLocalMaterialForDraft` (`server/src/materials/MaterialGrounding.ts:199`), reached via `normalizeCompositionMaterialRefs` → `AddMaterialSupport.ts:385`, and the shipped rule that the blob violates is the comment + code at **`AddMaterialSupport.ts:628-631`**: *"A bare concept in a well is never right. Materialize it…"*. Task 17's interim arm applies because Part I is NOT in this item.
4. **D4 — no diagnostic**: producer clarifications ride `normalizeScientistIntent`'s `unrealized` list (pattern: `UNREALIZED_WELL_LABEL_REASON` at `normalizeScientistIntent.ts:33`, pushed at **:255-263**) through the atomic 422 needs-clarification arm at `compileScientistIntent.ts:248-269` (producer items append AFTER engine clarifications, precedence preserved).

### Part IV (ghosting) facts at df1eab12

- Client ghosting contract (read first-hand): `getAffectedWells` (`app/src/types/events.ts:450`) reads `details.wells`/`source_wells`/`dest_wells`/`source.wells`/`target.wells`/`mapping` — **never a singular `details.well`**. `collectEventLabwareIds` (`app/src/event-editor/lib/previewProjection.ts:120`, private) reads `details.labwareId`/`source_labwareId`/`dest_labwareId`/`source.labwareId`/`target.labwareId`; `buildPreviewWellIndex` (**:28**) buckets by those ids — no id ⇒ no bucket ⇒ no ghost, empty tooltip.
- Client bridges already exist in `app/src/shared/hooks/useAiChat.ts` `normalizePreviewEvents` (**:1146**): top-level `event.labwareId` is copied into `details.labwareId` (**:1163-1167**), and for `add_material` a singular `details.well` is bridged to `details.wells` (**:1205-1213**). So if the server emits per-well events carrying top-level `labwareId` + `details.well`, Task 22's client leg may already pass — pin it with a test, do not assume it.
- `shorthandResultFromCompile` (`server/src/ai/shorthandChat.ts:458`) returns success with only `events`/`unresolvedRefs`/`clarificationRequests`/`shorthand`/`notes` — **no `labwareAdditions`**, unlike the raw mapper (`AgentOrchestrator.ts:612`, `:1504`). The compile result already carries them: `compileScientistIntent.ts:288-294` puts `resolveLabwareOutput.labwareAdditions` on `terminalArtifacts`.
- Pass order in `schema/registry/compile-pipelines/chatbot-compile.yaml`: `expand_biology_verbs` (:80) → `resolve_labware` (:86) → `resolve_roles` (:118, aggregates the event-producing passes). `resolve_labware` outputs `{labwareAdditions, resolvedLabwares}` (`ChatbotCompilePasses.ts:1696`).
- Chat seam call sites: turn path `parseScientistIntent(shorthandYaml)` at `AgentOrchestrator.ts:2280`, `shorthandResultFromCompile(...)` at **:2319**, fold path **:1222**. `FORCED_DRAFT_TOOL_INSTRUCTION` at **:510** (do NOT edit it — that is COMP-2). `bindShorthandEventsToDeck` (`shorthandChat.ts:144`) already rewrites deck-name→deck-id and expands a singular `details.well` via `expandWellTokens` — but only when a deck is present and only downstream of the expander, so it cannot fix D3.
- The shorthand chat stack (SHORTHAND-CORPUS/CHAT, COERCION-PINS, W2-*) is merged and live on this trunk; the coercion envelope lives at `server/src/ai/coerceAgentIntent.ts` (`event_shorthand: ['shorthand']`, `SHORTHAND_ARG_KEYS`). This spec rides that seam — no coercion changes needed.

## Acceptance criteria (VERBATIM from the task list, `~/.hermes/cl/lanes/2/task-list.md` id: SHORTHAND-COMP-1)

> verified by: >-
>   Headless: RED tests first — a shorthand draft with volume+well-range survives normalizer ->
>   expander -> compiled graph byte-faithfully (50 uL to A1:H12 lands 96 wells at 50 uL); the
>   ghosting regression test shows deck wells + tooltip populated from the compiled proposal.
>   Browser gate on :5193/runs: Brad's trypsin-EDTA/DMEM/FBS prompt renders wells with volumes;
>   VERDICT: accept.

Plan Part III acceptance criteria (tasks 14-18), condensed-cited: (1) declared `volume:{value,unit}` reaches `details.volume`, pinned by test; (2) compact range reaches events as an expanded address list, pinned by test; (3) no declared argument dropped without a structured clarification, pinned by test; (4) a mixture label never becomes a single blob-named material record, pinned by test + live trace; (5) live re-run shows volume+wells+composition. Part IV acceptance criteria: (1) compiled shorthand `add_material` carries `details.labwareId` + wells (unit tests BOTH sides); (2) `shorthandResultFromCompile` carries `labwareAdditions` (pinned); (3) mouseover shows the pending add (browser receipt + e2e stub spec); (4) raw path unchanged (byte-identity pins green); (5) report names the ONE seam producing `details.labwareId` and why the other option was rejected.

NOTE: the task list's browser-gate sentence says "trypsin-EDTA/DMEM/FBS"; the plan's Part III/IV prompt is **"Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."** (Tasks 18/23). The 4-component FBS prompt is Part I / COMP-3 territory — the browser gate for THIS item is the 50:50 prompt: wells ghosted with 50 µL, no blob record minted for a well. Composition entries are not expected until COMP-3.

## Files IN scope (product edits; ≤6)

1. `server/src/compiler/biology/verbs/simpleVerbs.ts` — Task 14 (honor object `volume` in BOTH branches) + Task 15 (string `wells` → `expandWellTokens([s])` BEFORE the `Array.isArray` branch, so the existing per-well loop fires). Mirror `transferExpander:438`; perform NO unit conversion (`{value:0.05,unit:'mL'}` carries `volume` with no `volumeUl` — say so in the report if a converter gap appears).
2. `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` — Task 16 (declared-argument reachability clarification, scoped to the two proven-lossy args `volume` + scalar `targetWells` with a TODO naming the general model) + Task 17 interim (mixture-cue bar, cues read from DATA, see below).
3. `server/src/ai/shorthandChat.ts` — Task 20: `shorthandResultFromCompile` carries `compiled.terminalArtifacts.labwareAdditions` (conditional spread) like the raw mapper. DRY check: if it now shares half its body with `compileResultToAgentResult`, extract the shared mapper — say which you chose.
4. `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts` — Task 21 Option A: `resolve_labware` writes the bound `recordId` back onto event `details.labwareId` (via `resolvedLabwares` hint→recordId it already computes) — a **no-op when the event already carries `details.labwareId`/`labwareInstanceId`**, keeping the raw path byte-identical. (LANE WARNING: shared with the raw path + `rolesSeam.test.ts` has 28 `targetWells` sites.)
5. `config/drafting/shorthand-drafting.yaml` — Task 17 interim home (RECOMMENDED): the mixture-cue list as DATA (e.g. `" / "`, `" + "`, `"%"`, `" in "`) consumed by the normalizer's producer-clarification channel. No cue literals in TypeScript. (Alternative: a new `config/drafting/mixture-material-cues.yaml` — orchestrator may prefer; see OQ1.)
6. `server/src/ai/wellRange.ts` — **expected ZERO edits** (`expandWellTokens` already exported). Listed so a reviewer sees it was considered; if you find yourself editing it, you are building a second parser — stop.

Explicitly OUT of scope: Parts I/II (composition form, `params.composition`, expander `composition_snapshot`, `contractBlock`, the lift, prompt/`FORCED_DRAFT_TOOL_INSTRUCTION` edits at `AgentOrchestrator.ts:510`); `schema/scientist-intent/scientist-intent-vocabulary.yaml`, `schema/workflow/scientist-intent.schema.yaml`, `schema/registry/compile-pipelines/scientist-intent-compile.yaml`, `server/src/compiler/scientistIntent/goldens/**` — MANIFEST-pinned (blob `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35`, verified still exact at df1eab12); `app/**` product code (client bridges exist; app gets a TEST only); `AgentOrchestrator.ts` (hot with W2-89's askWall region; this item should not need it — if you think you do, STOP and report); `review-write-wall.yaml`; lane-1 files (`server/src/security/*`, `server.ts`, `routes.ts`, `LabSettingsHandlers.ts`).

## Baselines — re-measured at df1eab12 (carry these EXACT numbers; "zero NEW" is the gate; exit-0 claims are forbidden)

| Check | Command (from the worktree) | MEASURED baseline |
|---|---|---|
| Server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0** (the plan's "19" was an older base — re-pin to 0) |
| App types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **23** (plan's "34" was an older base) |
| Compiler suite | `cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` | **17 files / 205 tests passed** |
| Shorthand chat neighborhood | `cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts src/ai/coerceAgentIntent.test.ts` | **3 files / 35 tests passed** (there is NO `src/ai/shorthandChat.test.ts` on trunk — do not "fix" a missing-file failure by renaming a source file) |
| App ghosting neighborhood | `cd app && npx vitest run src/event-editor/lib/previewProjection.test.ts src/event-editor/lib/wellRange.test.ts` | **2 files / 14 tests passed** |
| Golden pin | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` — byte-identical at branch AND head |
| Full server suite | `npm run test:run -w server` (repo root; vitest is in ROOT node_modules) | UNVERIFIED here (not run — NFS contention); capture your own at branch point, zero-NEW |

`git -c core.fileMode=false` is MANDATORY on every git command (NFS mode bits). Never restart the lane stack; never touch :3001/:5174/:3092/:5192/:3093/:5193 (read-only curl :3093/:5193 is permitted for the live leg only, orchestrator-scheduled).

## First targeted check (proves the approach early)

Branch, then RED the expander fix in one file — `cd server && npx vitest run src/compiler/biology/verbs/addMaterialVolume.test.ts`. It must FAIL today with `expected undefined to deeply equal { value: 50, unit: 'uL' }` (measured fact: the emitted details carry no `volume` key at all); after the ~10-line expander change it must PASS, plus the 96-well range test. That single file is the D2+D3 proof before anything else moves.

## RED-first commit plan (one coder item; structural RED before each GREEN)

C1 **RED — expander loss pinned**: new `server/src/compiler/biology/verbs/addMaterialVolume.test.ts`: (a) object `volume` reaches `details.volume` (+`volumeUl` when unit is uL); (b) object overrides scalar `volume_uL`; (c) `wells: 'A1:H12'` expands to 96 wells incl. A1/H12 via the per-well branch (state in the report: per-well events with `details.well`, the legacy-branch shape — matching plan Task 18's trace; the 96-event fan-out is OQ3); (d) a bare-number `volume` still behaves as today. Expected RED: 3 of 4 fail. Commit `test(add_material): pin the silent drops — object volume and compact well range never reach the event`.

C2 **GREEN — simpleVerbs.ts**: Task 14 (`declaredVolume` read at `params.volume`, mirroring `:438`, `resolvedVolumeUl` only when unit is literally `'uL'`) + Task 15 (`typeof rawWells === 'string' → expandWellTokens([rawWells])` before the branch). Both emitted `details` objects (:365 and :380 sites). Gate: C1 file passes; `src/compiler/biology/` green (35+6+… — 5 files/68 tests incl. coerce at HEAD); scientistIntent+biology 205 green; server tsc still **0**; MANIFEST still `58c447eb`. Commit `fix(add_material): honor the declared volume and expand a compact well range (silent drops end here)`.

C3 **RED→GREEN — Task 16 + Task 17**: new `server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts` (each of the two proven-lossy args: declared value must EITHER reach `details` OR produce a clarification naming the argument — today's post-C2 state passes volume/wells already, so ALSO pin the guard by feeding a value the lowering cannot carry, per plan Task 16). New assertions + producer code in `normalizeScientistIntent.ts`: reason code a stable machine string like `unrealized-declared-argument`, same envelope as `UNREALIZED_WELL_LABEL_REASON` (`label` + `reason` + `actionLocation {actionIndex, action, argument}`), appended to `unrealized`, bar via the existing 422 arm — never 500. Task 17 interim: cue list consumed from `config/drafting/shorthand-drafting.yaml`; a mixture-shaped `material` with NO components produces a clarification naming the cues found (cites the `AddMaterialSupport.ts:628-631` rule in its message); a plain single material is untouched. Drive the test from the REAL pipeline (`compileShorthandDeterministically`-equivalent or `compileScientistIntent` with a store) where feasible; the RED test must fail today. Commit pair: `test(scientist-intent): a declared argument that reaches no event must bar, and a blob mixture must not mint` + `fix(scientist-intent): loud clarifications for lossy declared args + mixture-blob bar (cues are data)`.

C4 **RED(characterization) — Task 19**: new `app/src/event-editor/lib/shorthandPreviewGhosting.test.ts` exactly per plan Task 19 (shipped payload finds no wells / buckets under no labware; fixed shape ghosts). All four assertions PASS at HEAD — say "characterization pin, not RED" in the report (claiming a false RED is a review defect). Commit `test(preview): pin the ghosting contract — a preview event needs wells AND a labware id`.

C5 **GREEN — Part IV server**: Task 20 (`shorthandChat.ts` carries `terminalArtifacts.labwareAdditions`) + Task 21 (resolve_labware write-back, no-op-safe) with new tests `server/src/ai/shorthandChat.labwareResult.test.ts` and `server/src/compiler/scientistIntent/labwareIdWriteBack.test.ts` per plan. Task 22: extend C4's file with the end-to-end leg — the REAL fixed payload through `normalizePreviewEvents` yields populated `details.wells` + `details.labwareId`. Gate: byte-identity — `npx vitest run src/compiler/` (incl. rolesSeam) green; chatbot-pipeline tests green; report the ONE seam you chose and why Option B was rejected. Commits per plan Tasks 20/21.

C6 **e2e pin — Task 23.4**: new `app/e2e/deck-ghost-shorthand.spec.ts` stubbing the AI endpoint with the FIXED payload (no model), asserting a ghost attribute/class on wells. The live legs (Tasks 18, 23.1-23.3) are ORCHESTRATOR-GATED: after merge + stack restart, on `:5193/runs` with **"Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."** — expect per-well events with `volume {value:50,unit:'uL'}` + `volumeUl:50`, ghost wells A1:H12, populated tooltip, and NO record named "Trypsin-EDTA/DMEM (50:50)". Do not restart the stack yourself; record the browser receipt per `~/.hermes/cl/browser-receipts.md`.

Final gate before reporting: the whole table above, `git -c core.fileMode=false diff --name-only df1eab12..HEAD` matching the declared file set, and MANIFEST byte-identical.

## Worker contract

- Worktree OFF trunk trunk tip at dispatch: `git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-2 worktree add /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-1-lane2-$(date +%Y%m%dT%H%M) -b cl/SHORTHAND-COMP-1-lane2-<TS> cl/integration-2`. NEVER work in `/mnt/vast/home/brad/git/cl-integration-2` itself (live stack).
- Never `git add -A`; exact paths per commit. No `goldens/` fixtures. Tests live OUTSIDE `goldens/`.
- Deliverable: the branch + report at `<worktree>/.hermes/plans/reports/SHORTHAND-COMP-1-report.<ticket>.md` containing: every baseline number (branch-point and head), each RED output pasted verbatim, the D1 minting-door sentence (`MaterialGrounding.ts:199` via `AddMaterialSupport.ts:385`), the Task 15 shape decision (per-well events), the Task 21 seam choice, the DRY choice from Task 20, and any converter-gap finding from the unit caveat.
- Hot-file rule: if `git log` shows `ChatbotCompilePasses.ts`, `shorthandChat.ts`, or `normalizeScientistIntent.ts` moved between your branch point and merge, re-anchor and re-run before merge. W2-8/W2-9 review traffic touches `AgentOrchestrator.ts` — your file set deliberately avoids it.

## Reviewer bait (pre-empt these; each is a likely adversarial finding)

1. **exactOptionalPropertyTypes** (ON — `server/tsconfig.json:13`): every new key is a conditional spread (`...(x ? { k: x } : {})`), never `k: maybeUndefined`. Applies to `volume`, `volumeUl`, `labwareAdditions`, clarification `actionLocation` fields.
2. **No-hardcode boundary**: no vendor names, no plate-size (`96`) branches, no `"A1:H12"`/verb/field literals in TS. Range expansion = the ONE `expandWellTokens`. Reachability (Task 16) = vocabulary-declared args + the two named lossy args with a TODO, NOT a new TS verb/field table (the SPINE-7 fix1/D4 ruling forbade exactly that). Mixture cues = YAML.
3. **Silent-drop vs loud-reject envelope**: new bars MUST ride the producer-clarification channel → 422 needs-clarification (`compileScientistIntent.ts:248-269`), engine clarifications keep precedence, producer items append. A thrown error / 500 / `console.warn` instead of a clarification is a defect; so is a clarification that changes an already-compilable document's outcome (byte-identity).
4. **MANIFEST freeze**: vocabulary YAML, `scientist-intent.schema.yaml`, `scientist-intent-compile.yaml`, `goldens/**` — zero edits; hash check is in the gate. Any diff there = instant reject.
5. **Raw-path byte-identity**: the resolve_labware write-back must be provably a no-op when `details.labwareId`/`labwareInstanceId` already exists and when the hint doesn't resolve; `rolesSeam.test.ts` + the full `src/compiler/` run are the evidence.
6. **Both emit branches**: the legacy wells-array branch AND the modern single-well branch each carry the volume keys — patching one and missing the other is the original bug's shape.
7. **Unit honesty**: no unit arithmetic anywhere (`mL` gets `volume` only, no `volumeUl`); claiming `volumeUl` for a non-uL unit is dimension fiction.
8. **Ontology-first**: role/cue vocabulary for Task 17 is a clarification over cue strings — do NOT mint new ontology terms or CURIEs (checked: `schema/registry/ontology-terms/exact.yaml` has no mixture/composition term; the declared mixture vocabulary that DOES exist is `schema/core/datatypes/composition-entry.schema.yaml` role enum `solute|solvent|buffer_component|additive|activity_source|cells|other` + `basis` enum incl. `volume_fraction`, and `plate-event.add-material.schema.yaml` already declares `volume` (:91), `composition_snapshot` (:114), `count` (:120), `counter_density` (:157), `formulation_kind` (:50)). The plan wants future declared vocabulary in `schema/workflow/scientist-intent.schema.yaml` — pinned, Stage-B territory, NOT this item.
9. **YAML-reload trap**: if you add cues to `shorthand-drafting.yaml`, confirm how that file is loaded (surface config vs compile-time) — the compile must not need a stack restart to see them, or the report must say the restart is scheduled with the merge. Consume the vocabulary instance threaded through the call, never the module singleton (SPINE-7 fix1/D4).
10. **Client-side temptation**: any `app/**` product edit is out of scope — the bridges (`useAiChat.ts:1163`, `:1205`) already exist; if they are insufficient, that is a finding for the orchestrator, not a license to edit.

## Open questions (≤3, with recommended defaults)

- **OQ1 — Task 17 bundled or deferred?** Interim blob-bar needs a cue list + producer code (file 5). I verified the interim mechanism exists (`unrealized` channel + 422 arm) and the RED test fails today; but the honest decomposition is COMP-3's. DEFAULT (recommended): bundle the interim cue-bar as C3 — acceptance criterion 3 demands a pinned test that no blob record is minted, and COMP-3's deps chain puts it behind this item. Fallback: ship C3 as RED-only and let the orchestrator record the deferral. Checked: plan Task 17 text, Stage C, `AddMaterialSupport.ts:628-631`, normalizeScientistIntent unrealized channel.
- **OQ2 — Task 21 write-back placement.** `resolve_labware` (:86 in chatbot-compile.yaml) runs BEFORE `resolve_roles` (:118) which aggregates events; `findLabwareTypeForEvent` only READS ids today. DEFAULT: resolve_labware mutates the `expand_biology_verbs` event list it can see (or its own post-pass event rewrite) writing `details.labwareId` only when absent and only from `resolvedLabwares`. If the coder finds the event list is not reachable at that pass without touching resolve_roles, STOP and report rather than editing resolve_roles. Checked: pipeline YAML pass order, `ChatbotCompilePasses.ts:1592-1697`, client key list at `previewProjection.ts:120-134`.
- **OQ3 — 96-event fan-out.** Expanding `A1:H12` per-well (plan Task 15/18 shape) emits 96 event primitives per draft where today it emits 1 (empty). Downstream passes (lab_state, compute_*) see a 96× event fan the shorthand path has never carried at that volume. DEFAULT: proceed per plan (raw path precedent `expandEventWells` at `AgentOrchestrator.ts:3019` fans out the same way) and have the coder time the `src/compiler/` suite; if a pass degrades or misbehaves at 96 events, report it as a finding with numbers. Checked: raw-path call site, wellRange implementation, plan Task 18 trace.

UNVERIFIED (deliberately, no substitute invented): full `npm run test:run -w server` count (probe: run it at branch point), live :5193 behavior (orchestrator leg only).

COMPOSER DONE SHORTHAND-COMP-1
