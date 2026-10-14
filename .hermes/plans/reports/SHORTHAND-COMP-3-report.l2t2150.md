# SHORTHAND-COMP-3 coder report — l2t2150 (lane 2, Part I tasks 1-7 headless)

Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-3-lane2-l2t2150
Branch: cl/SHORTHAND-COMP-3-lane2-l2t2150
Branch point (OQ3 anchor): 968ceaf9769d64ef15df28f1a8d90e9158bbe235 (cl/integration-2 tip at dispatch; contains SHORTHAND-COMP-2 merge)
HEAD (all commits landed): def12ec40433adca4d1e0be1f81978cc8ab17f54
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-13_1830-SHORTHAND-COMP-3-spec.md (read in full, incl. the l2t1830 promotion note)
Raw evidence: /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-3-lane2-l2t2150/.hermes/plans/reports/raws/ (every vitest tail below is spliced verbatim from these files — CODER-CAPTURED)

## Commits (exact messages, exact paths — never `git add -A`)

| Commit | Message | Files |
|---|---|---|
| 0d1358db (C1) | test(shorthand): pin composition carry-through and RED the missing composition_snapshot (Part I tasks 1-2) | compositionDecomposition.test.ts |
| 6b3d070f (C2) | feat(shorthand): add_material emits a composition_snapshot from declared components (one entry per component; cells count stays a count) | simpleVerbs.ts |
| 2b67f335 (C3) | test(shorthand): a declared mixture mints one material per component + one complex_composition material-spec (reuses AddMaterialSupport) | compositionDecomposition.test.ts |
| def12ec4 (C4) | feat(prompt): mixtures are components, never a blob — material-system-rules + the forced-draft bullet | material-system-rules.md, AgentOrchestrator.ts |

C5 is this report (report-only, untracked until committed).

## 1. RE-ANCHOR PROTOCOL (run before the first commit)

(1) `git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-2 log --oneline b25d2505..HEAD -- server/src/ai/shorthandChat.ts server/src/ai/AgentOrchestrator.ts server/src/compiler/scientistIntent/vocabulary.ts server/src/compiler/scientistIntent/liftScientistIntent.ts`:

```
33affe3e feat(shorthand): disclose the closed vocabulary to the model (generated from the vocabulary YAML) in the tool def, the forced prompt and the repair prompt
b2e70349 fix(shorthand-chat): lift model aliases (verb:, verb-as-key, parameters:, snake_case) before the Ajv door on the run-chat turn
7ea9ffb9 fix(scientist-intent): the lift must not drop the open params slot (composition survives compile and corpus capture)
```

COMP-2's task-8 lift fix (7ea9ffb9 "the lift must not drop the open params slot") is present at my branch point. Verified first-hand at 968ceaf9769d64ef15df28f1a8d90e9158bbe235: `liftScientistIntent.ts` has the `if (canonicalKey === 'params')` VERBATIM-carry block (`if (value && typeof value === 'object' && !Array.isArray(value)) out['params'] = value;` at :168) — the old `continue` skip is gone.

(2) Every spec region re-found BY NAME at my tip: `addMaterialExpander` (simpleVerbs.ts:327), `volumeDetails` block (:383-388), `const events: PlateEventPrimitive[]` (:390), legacy wells-array branch (:392-407), modern branch (:408-422), `FORCED_DRAFT_TOOL_INSTRUCTION` (AgentOrchestrator.ts:512), the "ALWAYS carry the actions for an add-materials request" bullet (:522), the open-params carry block (normalizeScientistIntent.ts:549-555), `upsertProposedMaterialSpecFromComposition` (AddMaterialSupport.ts:205), `implicitMaterialSpecId` (:164), `normalizeEventGraphMaterialUsage` (:607).

(3) PROBE P6 re-run at my tip (raws/probe-rerun.txt):

```
P6 lifted action keys: action,material,params,volumeUl
P6 params present: true
P6 params.composition length: 4
```

params SURVIVES the lift — DISPATCH GATE CLEARED. No STOP.

(4) Full baseline table re-measured at the branch point BEFORE the first commit — section 2.

## 2. Baselines at BRANCH POINT 968ceaf9769d64ef15df28f1a8d90e9158bbe235 (CODER-CAPTURED, serialized one suite at a time)

| Check | Command | MEASURED at branch point | Spec's b25d2505 number | Note |
|---|---|---|---|---|
| Server types | `cd server && npx tsc --noEmit \| grep -c "error TS"` | **0** (raws/b1-server-tsc.txt) | 0 | match |
| App types | `cd app && npx tsc --noEmit \| grep -c "error TS"` | **23** (raws/b2-app-tsc.txt) | 23 | match |
| Compiler+biology+materials | `cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/biology/ src/materials/` | **31 files / 321 tests passed** (raws/b3-compiler-materials.txt) | 26/297 | +5 files/+24 tests = COMP-2's own test files landed between b25d2505 and my branch point; branch-point measurement is the gate (OQ3) |
| Shorthand/prompt neighborhood | the 8-file list from the spec | **8 files / 52 tests passed** (raws/b4-neighborhood.txt) | 8/52 | match |
| Golden pair (PRE-EXISTING) | `npx vitest run src/ai/AgentOrchestrator.golden.test.ts src/ai/AgentOrchestrator.goldenWithSeeds.test.ts` | **2 files failed / 2 tests failed** (raws/b5-golden-pair.txt) | both fail | carried as trunk debt — section 8 |
| Prompt ratchet (printed line) | inside promptBudget.test.ts | `draft prompt budget: 45439 chars (agent 24543 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 1741)` | 45,439/47,180 headroom 1,741 | match |
| MANIFEST pin | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | **83fda3b42519eed879bc5e49290e724f727be509** | 83fda3b4… | match; task-list's 58c447eb confirmed stale (OQ3) |

Branch-point vitest tails (verbatim from raws):

compiler+biology+materials (b3):
```

 Test Files  31 passed (31)
      Tests  321 passed (321)
   Start at  22:28:24
   Duration  9.01s (transform 4.93s, setup 6ms, collect 35.22s, tests 15.28s, environment 10ms, prepare 15.94s)
```

neighborhood (b4):
```

 Test Files  8 passed (8)
      Tests  52 passed (52)
   Start at  22:28:34
   Duration  6.68s (transform 1.93s, setup 1ms, collect 9.08s, tests 617ms, environment 2ms, prepare 6.61s)
```

golden pair (b5):
```

 Test Files  2 failed (2)
      Tests  2 failed (2)
     Errors  2 errors
   Start at  22:28:42
   Duration  9.16s (transform 790ms, setup 1ms, collect 2.35s, tests 7.54s, environment 0ms, prepare 139ms)
```

## 3. First targeted check — the spec's own command, C1 RED (verbatim)

`cd server && npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts` at the branch point (raws/c1-red.txt):

```

 ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts  (8 tests | 2 failed) 46ms
   ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > writes one entry per component, with the cells count kept as a count
     → Target cannot be null or undefined.
   ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > drops malformed entries defensively and emits no snapshot when fewer than two valid entries remain (OQ2 pin)
     → Target cannot be null or undefined.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > writes one entry per component, with the cells count kept as a count
AssertionError: Target cannot be null or undefined.
 ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts:188:22
    186|     const details = event!.details as Record<string, unknown>;
    187|     const snapshot = details['composition_snapshot'] as Array<Record<s…
    188|     expect(snapshot).toHaveLength(4);
       |                      ^
    189|     expect(details['formulation_kind']).toBe('complex_composition');
    190|     expect((snapshot[3]!['component_ref'] as Record<string, unknown>)[…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > drops malformed entries defensively and emits no snapshot when fewer than two valid entries remain (OQ2 pin)
AssertionError: Target cannot be null or undefined.
 ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts:213:43
    211|       'not-an-entry',
    212|     ]);
    213|     expect(mixed['composition_snapshot']).toHaveLength(2);
       |                                           ^
    214| 
    215|     // A non-string role becomes 'other' — the role enum lives in

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > writes one entry per component, with the cells count kept as a count
AssertionError: Target cannot be null or undefined.
 ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts:188:22
    186|     const details = event!.details as Record<string, unknown>;
    187|     const snapshot = details['composition_snapshot'] as Array<Record<s…
    188|     expect(snapshot).toHaveLength(4);
       |                      ^
    189|     expect(details['formulation_kind']).toBe('complex_composition');
    190|     expect((snapshot[3]!['component_ref'] as Record<string, unknown>)[…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/compiler/scientistIntent/compositionDecomposition.test.ts > add_material expander emits a composition snapshot (task 2 — RED) > drops malformed entries defensively and emits no snapshot when fewer than two valid entries remain (OQ2 pin)
AssertionError: Target cannot be null or undefined.
 ❯ src/compiler/scientistIntent/compositionDecomposition.test.ts:213:43
    211|       'not-an-entry',
    212|     ]);
    213|     expect(mixed['composition_snapshot']).toHaveLength(2);
       |                                           ^
    214| 
    215|     // A non-string role becomes 'other' — the role enum lives in

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

```

 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
   Start at  22:35:56
   Duration  1.83s (transform 162ms, setup 0ms, collect 577ms, tests 46ms, environment 0ms, prepare 457ms)
```

Reading: the carry pins are GREEN (characterization, per PROBE P1/P6 — never claimed as a false RED): lift+parse+normalize carry `composition` (4 entries); the blob-bar exemption/bar pins pass; the plain-add and byte-identity pins pass. The snapshot tests FAIL because `details['composition_snapshot']` is undefined — vitest 1.6.1 renders `expect(undefined).toHaveLength(4)` as `AssertionError: Target cannot be null or undefined.` (the spec's "expected undefined to have length 4" is the same RED in the older matcher wording; the raw above is the truth). The OQ2 defensive-drop leg is also a real RED at C1 (the helper does not exist yet).

## 4. C2 (task 3) — GREEN + gate

`compositionDecomposition.test.ts` after the simpleVerbs.ts change (raws/c2-green-file.txt):
```

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  22:37:26
   Duration  1.03s (transform 139ms, setup 0ms, collect 315ms, tests 39ms, environment 0ms, prepare 164ms)
```

C2 gate (raws/c2-compiler-materials.txt, c2-server-tsc.txt):
```


 Test Files  32 passed (32)
      Tests  329 passed (329)
   Start at  22:37:41
   Duration  4.30s (transform 3.39s, setup 6ms, collect 21.26s, tests 11.98s, environment 9ms, prepare 5.29s)
```
server tsc errors: 0. MANIFEST at C2: 83fda3b42519eed879bc5e49290e724f727be509 (unchanged).

Expander output for the 4-component input at C2 (probe P3 re-run, raws/probe-rerun-postC2.txt):
```
P3 expander details keys: composition_snapshot,count,counter_density,formulation_kind,material,material_ref,volume,volumeUl,well
P3 composition_snapshot present: true
```

## 5. C3 (task 4 + OQ1) — mint proof, zero production change

Intermediate honest RED (raws/c3-green.txt): the plan's Task 4 assertion `components.length === 4` FAILED against the real chain — `expected 5 to be 4` — because the stamped mixture-label `material_ref` grounds to its OWN material (reviewer bait #7, pre-existing chain behavior at normalizeAddMaterialDetailsMaterialRefs). The two end-to-end legs failed `expected … to have a length of 1 but got 2` because `targetWells: [A1, H12]` fans out to one add_material EVENT per well and the chain upserts one spec PER EVENT (`implicitMaterialSpecId` = MSP-DRAFT-<graphId>_<eventId>, AddMaterialSupport.ts:164-168 — pre-existing idiom, fan-out probe in section 9). Both are TEST-SHAPE corrections (pin the real chain behavior: 5 materials = 4 components + mixture label; single well for the exactly-1-spec pin), NOT production defects — no production file was edited in C3.

Final C3 (raws/c3-green2.txt):
```

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  22:40:30
   Duration  1.29s (transform 360ms, setup 0ms, collect 640ms, tests 72ms, environment 0ms, prepare 109ms)
```

12 tests: task-1 pins (3), task-2/3 expander pins (5), task-4 mint proofs (2: plan-stamped shape + OQ1(a) no-stamp shape), both-Brad-prompts end-to-end (2).

## 6. C4 (tasks 5-6) — prompt DATA + one bullet

material-system-rules.md: the plan's block (plan :412-442) appended VERBATIM — programmatically verified byte-equal to the plan block (`equal to plan block? True`), file 3,849 -> 5,430 chars (+1,581, the spec's measured block size). `grep -c "params.composition" prompts/material-system-rules.md` = 1.

promptBudget printed line after Task 5 (raws/c4-promptbudget.txt):
```
draft prompt budget: 47020 chars (agent 24543 + material-rules 5430 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 160)
```
Matches the spec's expected `47020 … ceiling 47180 (headroom 160)`. CORE_PROMPT_CEILING_CHARS UNMOVED (47,180) in every commit of this item.
```

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  22:49:22
   Duration  5.09s (transform 259ms, setup 0ms, collect 1.86s, tests 27ms, environment 0ms, prepare 866ms)
```

Neighborhood after C4 (raws/c4-neighborhood.txt) — the two FORCED_DRAFT guard tests (AgentOrchestrator.equipmentInstruction.test.ts, equipmentVocabulary.test.ts) green UNEDITED:
```


 Test Files  8 passed (8)
      Tests  52 passed (52)
   Start at  22:49:39
   Duration  4.21s (transform 3.22s, setup 0ms, collect 19.53s, tests 941ms, environment 1ms, prepare 1.38s)
```

Task 6 per-turn char delta (raws/bullet-delta.py, computed from the TS literals):
- FORCED_DRAFT_TOOL_INSTRUCTION joined chars: 5,161 (branch point) -> 5,476 (HEAD) = **+315 chars per forced-draft turn** (314-char bullet + 1 join newline).
- FORCED_DRAFT_TOOL_INSTRUCTION is NOT one of the four ratchet-measured strings (the ratchet measures event-graph-agent.md + material-system-rules.md + SUBMIT_SUGGESTION_INSTRUCTION + JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)) — the growth is outside the ratchet but stated here so it stays auditable.

## 7. Final battery at HEAD def12ec40433adca4d1e0be1f81978cc8ab17f54 (raws/f1..f7)

| Check | Branch point | HEAD | New failures |
|---|---|---|---|
| server tsc | 0 | **0** (f1) | 0 |
| app tsc | 23 | **23** (f2) | 0 |
| compiler+biology+materials | 31 files/321 tests | **32 files/333 tests** (f3) | 0 — +1 file/+12 tests is exactly compositionDecomposition.test.ts; fail-set comm empty (both lists empty) |
| neighborhood | 8/52 | **8/52** (f4) | 0 |
| golden pair | 2 failed | **2 failed** (f5) | 0 — identical test names, section 8 |
| MANIFEST | 83fda3b4… | **83fda3b42519eed879bc5e49290e724f727be509** (f6) | byte-identical (OQ3: freeze = identical to branch-point hash) |

HEAD tails (verbatim):

compiler+biology+materials (f3):
```


 Test Files  32 passed (32)
      Tests  333 passed (333)
   Start at  22:51:05
   Duration  6.71s (transform 4.29s, setup 4ms, collect 36.63s, tests 18.88s, environment 15ms, prepare 9.74s)
```

neighborhood (f4):
```

 Test Files  8 passed (8)
      Tests  52 passed (52)
   Start at  22:51:13
   Duration  3.70s (transform 2.32s, setup 0ms, collect 15.68s, tests 913ms, environment 3ms, prepare 3.14s)
```

golden pair (f5):
```

 Test Files  2 failed (2)
      Tests  2 failed (2)
     Errors  2 errors
   Start at  22:51:18
   Duration  6.90s (transform 904ms, setup 0ms, collect 2.68s, tests 5.11s, environment 0ms, prepare 302ms)
```

Zero-new proof by fail-SET (not headline): branch-point b3 FAIL lines: 0 (none). HEAD f3 FAIL lines: 0 (none). Golden pair branch-point FAILs:
```
 FAIL  src/ai/AgentOrchestrator.golden.test.ts > AgentOrchestrator - golden test for auto-create labware > should bypass LLM and compile events when labware hint resolves via searchLabwareByHint
 FAIL  src/ai/AgentOrchestrator.goldenWithSeeds.test.ts > AgentOrchestrator - golden test with real seed records > should bypass LLM and compile events with REAL seed records
```
Golden pair HEAD FAILs:
```
 FAIL  src/ai/AgentOrchestrator.golden.test.ts > AgentOrchestrator - golden test for auto-create labware > should bypass LLM and compile events when labware hint resolves via searchLabwareByHint
 FAIL  src/ai/AgentOrchestrator.goldenWithSeeds.test.ts > AgentOrchestrator - golden test with real seed records > should bypass LLM and compile events with REAL seed records
```
`comm -3` of the sorted lists is empty — same two pre-existing failures, same test names.

Diff hygiene (f7): `git -c core.fileMode=false diff --name-only 968ceaf9..HEAD`:
```
server/prompts/material-system-rules.md
server/src/ai/AgentOrchestrator.ts
server/src/compiler/biology/verbs/simpleVerbs.ts
server/src/compiler/scientistIntent/compositionDecomposition.test.ts
```
Exactly the declared in-scope set (4 paths; simpleVerbs.ts carries both task 3 and the OQ1 emission — same file, same commit, per spec file-5). No YAML, no goldens/, no lane-1 files, no shorthandChat.ts, no liftScientistIntent.ts.

## 8. Pre-existing golden-pair failures (re-measured at branch point AND head; NOT chased — out of scope)

Both files fail identically at 968ceaf9769d64ef15df28f1a8d90e9158bbe235 and at def12ec40433adca4d1e0be1f81978cc8ab17f54:
- AgentOrchestrator.golden.test.ts > "should bypass LLM and compile events when labware hint resolves via searchLabwareByHint" — `AssertionError: expected false to be true` at :66 (`expect(result.success).toBe(true)`), plus the unhandled "Should not be called" rejection from the bypass mock client (:21).
- AgentOrchestrator.goldenWithSeeds.test.ts > "should bypass LLM and compile events with REAL seed records" — `expected false to be true` at :150 (needs live seed records — environment-dependent).

Trunk debt per the spec's baseline table; carried, not fixed.

## 9. Probes P1-P8 re-run in MY tree (raws/probe-rerun.txt at branch point, probe-rerun-head.txt at HEAD)

At HEAD (def12ec40433adca4d1e0be1f81978cc8ab17f54):
```
P6 lifted action keys: action,material,params,volumeUl
P6 params present: true
P6 params.composition length: 4
P1 candidate keys: composition,labware,labware_id,verb,volume_uL,wells
P1 composition length: 4
P1 clarifications: []
P2 role:42 parses CLEAN; composition length: 4
P3 expander details keys: composition_snapshot,count,counter_density,formulation_kind,material,material_ref,volume,volumeUl,well
P3 composition_snapshot present: true
P8 outcome: needs-clarification
P8 clarifications: [{"label":"plate","reason":"unknown-noun","candidates":[{"label":"Create local term “plate”","confidence":0.05},{"label":"Create local term “plate”","confidence":0.05}],"actionLocation":{"actionIndex":0,"action":"add_material","argument":"labware"}}]
P5 material_spec_ref: {"kind":"record","id":"MSP-DRAFT-EG_COMPOSITION_PROBE_EV_1","type":"material-spec","label":"Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells"}
P5 spec name: Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells | formulation_kind: complex_composition
P5 spec composition length: 4
P5 grounded component_refs: record:MAT-thermo-trypsin-edta-1fqu | record:MAT-thermo-dmem-1vq1 | record:MAT-thermo-fbs-1qbj | record:MAT-hepg2-cells-4oys
P5 material records: 5 -> MAT-hepg2-cell-suspension-pdsx HepG2 cell suspension | MAT-thermo-trypsin-edta-1fqu Thermo trypsin-EDTA | MAT-thermo-dmem-1vq1 Thermo DMEM | MAT-thermo-fbs-1qbj Thermo FBS | MAT-hepg2-cells-4oys HepG2 cells
P5 material-spec records: 1
P7 material_spec_ref present: false
P7 material records: 4 -> MAT-thermo-trypsin-edta-1fqu Thermo trypsin-EDTA | MAT-thermo-dmem-1vq1 Thermo DMEM | MAT-thermo-fbs-1qbj Thermo FBS | MAT-hepg2-cells-4oys HepG2 cells
P7 material-spec records: 0
```

- P1 GREEN: candidate keys `composition,labware,labware_id,verb,volume_uL,wells`; composition length 4; zero clarifications.
- P2 GREEN (deviation pin): `role: 42` parses CLEAN — params is an open slot.
- P3: at branch point details were `material,volume,volumeUl,well` (no snapshot); at HEAD `composition_snapshot,count,counter_density,formulation_kind,material,material_ref,volume,volumeUl,well`.
- P5 reproduced at HEAD: spec `MSP-DRAFT-EG_COMPOSITION_PROBE_EV_1`, name "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells", `formulation_kind: complex_composition`, 4 composition entries, every component_ref `record:MAT-…` (MAT-thermo-trypsin-edta-1fqu, MAT-thermo-dmem-1vq1, MAT-thermo-fbs-1qbj, MAT-hepg2-cells-4oys); store holds 5 material records = 4 components + the mixture label itself (MAT-hepg2-cell-suspension-pdsx) — the stamped ref mints too (pre-existing chain behavior, bait #7, quoted not massaged).
- P7 reproduced at HEAD: WITHOUT material_ref, 4 component materials mint, `material_spec_ref` ABSENT, 0 specs — the load-bearing gap OQ1(a) closes.
- P8: the `labware: plate` variant on an empty store bars `unknown-noun` (as the spec predicted). The labware-omitted variant (raws/p8-nolabware-head.txt) compiles `complete`, 1 event, details keys at HEAD: `composition_snapshot,count,counter_density,formulation_kind,material,material_ref,volume,volumeUl,well`.

Fan-out probe (raws/probe-fanout.txt) — FINDING FOR THE LIVE LEG: `targetWells: [A1, H12]` compiles to 2 add_material events and the chain mints ONE MSP-DRAFT per event (MSP-DRAFT-EG_FANOUT_EVT_ADD_MATERIAL_GCP72Q30, …_5VEUQRXS) while the 4 component materials are REUSED (same MAT- ids across events; dedup by name). This is the existing chain's per-event idiom (implicitMaterialSpecId), not introduced by this diff. The headless "exactly 1 composition spec" pin therefore runs a single-well document; on the live leg, a multi-well "each well" draft will show one spec per event sharing the same component materials.

## 10. OQ implementation notes (BINDING rulings, as implemented)

- **OQ1 = (a), implemented in C2 (simpleVerbs.ts only).** `compositionSnapshotFromParams` emits `material_ref: {kind:'draft', id:'mint:<label>', label}` whenever a snapshot is emitted. Label = `params.material` when the model named the mixture, else `componentLabels.join(' + ')` — mirroring AddMaterialSupport.ts:224-228's existing naming idiom. No noun literals: every string is derived from the document. Pinned in C3: with `material: 'HepG2 cell suspension'` the emitted ref is exactly `{kind:'draft', id:'mint:HepG2 cell suspension', label:'HepG2 cell suspension'}`; without a mixture name the fallback label is the joined component labels, and the spec mints from EXPANDER OUTPUT ALONE (no stamping). Consequence (settled as the spec predicted): the mixture label itself mints a 5th material record.
- **OQ2 = APPROVED re-scope, recorded.** Plan Task 1 test 2 (`parseScientistIntent(bad)).toThrow()`) is replaced by (a) a characterization pin that `role: 42` parses CLEAN and (b) the defensive-drop pin: blank/non-string component names SKIPPED, non-object entries SKIPPED, non-string role -> `'other'` (no TS role table), <2 valid entries -> no snapshot. Deviation from the plan is explicit in the test-file header and here.
- **OQ3 = DEFAULT.** Gate = byte-identity against the hash MEASURED AT MY BRANCH POINT: 83fda3b42519eed879bc5e49290e724f727be509 at 968ceaf9769d64ef15df28f1a8d90e9158bbe235; identical at HEAD def12ec40433adca4d1e0be1f81978cc8ab17f54. The task-list's 58c447eb is stale (confirmed: MANIFEST.yaml history shows only pre-branch-point commits; DECK-FOLD-1 re-bless). No re-bless performed (forbidden and unnecessary).

## 11. Reviewer-bait self-checks (run, with results)

1. Blob bar untouched: `normalizeScientistIntent.ts` not in my diff; exemption + bar legs both pinned in my test (mixture-shaped label WITH composition -> no `unrealized-mixture-blob-material`; WITHOUT -> bar fires). Cue DATA read, never edited; zero cue literals in my TS.
2. Additive honesty: explicit deep-equality pin — a no-composition expand emits exactly `{well, material, volumeUl, volume:{value,unit}}` and `Object.keys` sorted equals `[material, volume, volumeUl, well]`; one-entry composition pinned as plain add. Whole suite green (32/333).
3. Count never becomes a volume: `grep -n "density \* volume" simpleVerbs.ts` -> no match; count lands on the event ONLY from a `cells`-role entry's finite numeric `count`; volume stays the stated 50 uL in both prompt legs (pinned).
4. exactOptionalPropertyTypes: every conditional key via `...(x !== undefined ? {x} : {})` / `...(x ? {x} : {})`; server tsc 0. camelCase->snake_case mapping happens ONCE, in the expander (`counterDensity` wire -> `counter_density` event).
5. No hardcodes: zero material names/noun literals/percent strings/role tables in production TS; role validated structurally (string else 'other'); test fixtures' component names are test DATA.
6. MANIFEST drift: hash byte-identical; the only golden with add_material (labware-hint-lookup-failure.yaml) carries no params.composition; golden suite green inside the 32-file run; no re-bless.
7. P5's fifth record: reproduced and quoted (section 9), not massaged.
8. Task 1 test 2: shipped as the OQ2-approved substitute with the deviation named (section 10).
9. Ratchet: printed line `47020 … ceiling 47180 (headroom 160)`; ceiling never moved in any commit; Task 6 delta stated (+315/turn, outside the four measured strings).
10. COMP-2 rebase zones: diff contains NO shorthandChat.ts; the AgentOrchestrator edit is the single bullet after the ALWAYS-carry bullet (re-anchored by string, landed at :523 post-COMP-2).
11. Ontology: components are DRAFT refs grounded by the existing store-write door; no CURIE minted at the drafting door; no new ontology terms.
12. Reuse: C3 contains ZERO production change; the mint is the existing AddMaterialSupport chain end to end.
11b. vocabularyRipOut bait-11 scan (non-test .ts in scientistIntent/ for /spawn|line-dsl|shorthand/i): my new file is a .test.ts (scan excludes it); no new non-test module added to that dir.

## 12. Task 7 — LIVE PROCEDURE, handed back VERBATIM (orchestrator runs the live legs; the coder did NOT touch the stack)

Headless equivalent already shipped: the end-to-end chain of tasks 1-4 IS the headless proof (section 5, both Brad prompts).

Live legs (orchestrator):
1. Restart lane 2: `cl-lane-stack.sh 2 restart` (orchestrator/Brad only).
2. Brad's prompt 1 verbatim in `:5193/runs`: "Add 50uL of 50% Thermo trypsin-EDTA / 50% Thermo DMEM with 10% FBS containing 200 HepG2 cells per uL to each well." Expect FOUR `params.composition` entries in the shorthand panel (not a blob).
3. Accept, then:
```
curl -s "http://localhost:3093/api/records?kind=material-spec" | head -c 800
curl -s "http://localhost:3093/api/records?kind=material" | head -c 800
```
Expect one `material-spec` with `formulation_kind: complex_composition` and four `formulation.composition` entries; four `material` records named after the components (reused, not duplicated, on a second accept). NOTE (fan-out probe, section 9): if the accepted draft fans out to multiple wells, the chain mints one MSP-DRAFT per add_material EVENT (per-event implicitMaterialSpecId) sharing the same four component materials — decide the live assertion ("exactly 1 spec" holds per event / per single-well draft) before the browser gate.
4. Prompt 2 ("I just trypsinized cells in a flask … I need to seed each well with 10,000 HepG2 cells."): expect a `cells` component carrying `count: 10000` + `counter_density {value: 200, unit: "cells/uL"}` and NO count-to-volume conversion.
5. Browser receipt per `~/.hermes/cl/browser-receipts.md` (receipts under `~/.hermes/cl/receipts/`).

Live-path turn shape verified headlessly at my tip: run-chat -> `parseShorthandForChat` (AgentOrchestrator.ts:2280 region) -> `compileShorthandDeterministically` (shorthandChat.ts:249) -> `shorthandResultFromCompile` (:546); events ride to the client WITHOUT material normalization; minting happens at RECORD WRITE — `RecordHandlers.ts` create/update both call `normalizeEventGraphMaterialUsage` (gates on the event-graph schemaId).

## 13. Tree-state notes + unresolved items

- Worktree symlinks verified intact (no exclude-materialization repair needed): `server/schema -> ../schema`, `server/node_modules` and `app/node_modules` -> computable-lab disk, the 43+15 tracked symlink files present (`find -type l`). The tracked `computable-lab` root symlink is a self-loop blob (5fed690a, target "computable-lab") in BOTH trunk and this worktree — broken in every checkout, referenced by no code path in the battery; noted, not touched (tracked file, out of scope).
- `server/prompts/material-system-rules.md` measures 3,873 BYTES on disk but 3,849 CHARS (4 multi-byte em-dashes/×) — the ratchet counts JS chars; both my delta (+1,581 chars) and the printed line are char-based, matching the spec's numbers.
- Vitest 1.6.1 renders the task-2 RED as `Target cannot be null or undefined.` rather than the spec's older `expected undefined to have length 4` wording — same failure, raw pasted verbatim.
- Unresolved / handed to orchestrator: (a) the live multi-well spec-count assertion (fan-out finding, section 9); (b) golden-pair trunk debt (carried, unfixed); (c) the browser gate :5193 (orchestrator dispatches cl-browser-reviewer).

COMP-3 headless implementation complete: C1..C4 committed, C5 = this report. Acceptance criteria 1-4 verified headless (carry-through pins, expander snapshot, >=4 materials + exactly 1 complex_composition spec per event, count stays a count, MANIFEST byte-identical, zero NEW failures). Browser gate: orchestrator's.
