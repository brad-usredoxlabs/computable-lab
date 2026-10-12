# W2-7-REALIZATION-SPINE — coder report (lane 2, l2t0550)

Worktree: /mnt/vast/home/brad/git/wt/W2-7-lane2-l2t0550
Branch: W2-7-lane2-l2t0550 (off trunk f19cfa95 = the W2-6 merge)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-09_2100-W2-7-realization-spine-spec.md
Spec md5 verified first-hand: `4fdc584da99a99a32ede6ef8f839b330` (588 lines; PROMOTION RECORD read in full and treated as binding over draft text).
`git -c core.fileMode=false` used for EVERY git command (NFS tree). No rebase, no force-push, no merge, no `git add -A`.

## 0. FRESH BASELINE CAPTURE (measured in MY worktree at f19cfa95, before any edit)

Capture paths (all under /tmp, this session):
- scoped fail SET: `/tmp/l2t0550-scoped-base-failfiles.txt` (from `/tmp/l2t0550-scoped-base.txt`)
- server tsc: `/tmp/l2t0550-tsc-server-raw.txt` -> multiset `/tmp/l2t0550-tsc-multiset.txt`
- lintRules: printed by the booted E2E app (`W26_HEALTH_LINTRULES`)

Command (scoped fail SET, exactly the M7 scope):
`cd <wt>/server && npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`
```
 Test Files  11 failed | 100 passed | 5 skipped (116)
      Tests  16 failed | 1058 passed | 53 skipped (1132)
```
Fail-file SET (11) == `/tmp/l2t2310-w25-baseline-failfiles.txt` — `diff` after whitespace-normalize + sort: EMPTY.
```
FAIL  src/api/handlers/EventEditorFixHandlers.test.ts
FAIL  src/api/handlers/ExtractHandlers.test.ts
FAIL  src/api/handlers/MeasurementHandlers.applianceJob.test.ts
FAIL  src/api/handlers/SignatureHandlers.test.ts
FAIL  src/api/handlers/WorkspaceHandlers.test.ts
FAIL  src/governance/AuditEventService.test.ts
FAIL  src/integration/extractionE2E.test.ts
FAIL  src/revisions/RevisionStorage.test.ts
FAIL  src/schema/EventGraphEquipmentSchema.test.ts
FAIL  src/schema/LabwarePhysicalGeometryData.test.ts
FAIL  src/store/LifecycleBypassAudit.test.ts
```
Two known-environmental arms recorded, NOT fixed (per M7): `src/integration/extractionE2E.test.ts` (PDF-cwd ENOENT) and `src/api/handlers/ExtractHandlers.test.ts` (upload-spy drift).

Server tsc (M7 multiset method: strip `(line,col)` coords, sort):
`npx tsc -p .` -> 27 raw lines (26 errors + 1 wrapped continuation), 26 error lines after `grep -E "error TS"`.
`diff /tmp/l2t0415-tsc-multiset.txt /tmp/l2t0550-tsc-multiset.txt` -> EMPTY. **26 == pin.**

lintRules after boot: `W26_HEALTH_LINTRULES 81` (from `npx vitest run src/integration/Wave2SemanticPassE2E.test.ts`, boot A `/api/health` -> `components.lintRules.loaded`). **81 == pin; W2-7 adds NO new lint rule ids** (verified at head too, §pins below; the policy doc is not a `*.lint.yaml` — noBypass arm (g) asserts zero lint files in `schema/registry/realization/`).

Goldens: `npx vitest run src/compiler/scientistIntent/goldens` -> **15 passed** (expect 15 per M7).

## FIRST TARGETED CHECK (before writing any lowering code)

Spec path pin `src/integration/ZymoGoldenE2E.test.ts` is draft-era; the file lives at `src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts` on my base (re-verified cheaply with `find`). Ran both:
```
cd <wt>/server && npx vitest run src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts
 ✓ src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts  (15 tests) 2530ms
 Test Files  1 passed (1)   Tests  15 passed (15)
 ✓ src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts  (1 test) 121ms
 Test Files  1 passed (1)   Tests  1 passed (1)
```
GREEN — the W2-6/W2-4 chain is green on my base.

Scratch probe (spec §4 "FIRST TARGETED CHECK" approach proof, `server/src/scratch/w27-probe.test.ts`, NEVER committed, since deleted): a hand-authored robot-shaped scientist-intent YAML (96-well plate + trough labels, 3 actions on enum verbs) through the REAL `parseScientistIntent` + `compileScientistIntent` with the production `createResolveSpineFromContext` spine:
```
OUTCOME complete EVENTS 4
```
=> the frozen 31-verb contract CAN express the robot-shaped document. No pivot.

## CAMT re-pins (every draft-era line number re-verified on MY base)

- M1 axis machinery: `semanticPassGuards.ts` `bindFamilyAxes` -> `...deriveBranchAxes(candidate.steps)` + `...deriveStepVariantAxes(candidate.steps, candidate.sections)` (semanticPassGuards.ts:224-225). My family fixture consumes THAT machinery verbatim (imports the shipped functions; zero hand-authored axes, zero re-derivation).
- M3 `StepProvenanceRef` (protocol.schema.yaml:1013): required `[kind,type,id,pageStart]`, `ref.id` = the SAID record's own recordId; type enum `[vendor-protocol-candidate, evidence]`. Fixture provenance mirrors it exactly (`{kind:'record', type:'vendor-protocol-candidate', id:'CAN-zymo-magbead', pageStart:N}`).
- M4 rung vocabulary: `schema/registry/provenance-ladder/rung-vocabulary.yaml` rung `LOCAL_REALIZATION` — carrier verbatim: "local-protocol.branch_resolution[].choices ... + overrides.substitutions[].rationale; W2-7 WRITES these fields, W2-4 declares the vocabulary + constrains their lineage via prov-local-*". Referenced, never re-minted.
- M5 merged `local-protocol.lint.yaml` R1 `prov-local-choices-recorded` (read in full): `when: nonEmpty branch_resolution`; `assert: everyItem -> any[ equals matched:false | nonEmpty choices ]`; severity error. It asserts matched -> nonEmpty choices ONLY and does NOT read inside choices. Header records the nonEmpty-object probe: PathResolver.isEmpty treats `{}` as EMPTY (identical to absent).
- M6 W2-4 hard dep SATISFIED on my base (rung vocab + prov-local lint active; lintRules 81).
- §0.4 `BranchResolver.ts`: `resolutions.push({axisId, matched, branchIds})` (:133), unresolved gap text (:136-142), `BranchResolutionEntry {axisId, matched, branchIds?}` (:153-158), `activeStepIdsForResolution` (:159+). Reused as-is (imported), never edited.
- §0.6 `compileScientistIntent.ts`: `deps.spine` REQUIRED, throws at registration without it (:140-147). Production composition `createResolveSpineFromContext` (IntentCompileHandlers.ts:59-62) — my golden uses exactly that shape; `createResolveSpine({})` is NOT used anywhere in my tests.
- §0.7 pipeline YAML `scientist-intent-compile.yaml` sha256 at base: `b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8` (pinned in noBypass arm (d)).
- §0.10 `grep -rn "\.intent" server/src/compiler/protocol/` -> 0 matches at base (noBypass arm (a)).
- §0.11 profile `robot-assist-plus-96.yaml` read in full; loaded by `ExecutionScaleProfileRegistry` (`getExecutionScaleProfileRegistry().get(id)`, DIR :86).
- §0.12/§0.13 constraint vocabulary lives at `schema/registry/constraint-vocabulary/` (draft cited `schema/registry/constraint-vocabulary.yaml` — re-pinned): `policyBindingKeys` at :230 = `lab-may-relax:vendor_default`, `lab-may-tighten:vendor_default`, `lab-may-tighten:hard_bound`, `never-override:hard_bound`. `quantity.schema.yaml` count unit enum = cells|beads|wells|organisms|worms|CFU|colonies.
- §0.19 guessed default: `ChatbotCompilePasses.ts` :3088-3101 (robot_deck + profile.deckBinding default sample layout) and `maxProfileVolume = profile?.pipetting.maxVolumeUl ?? 20` (:3146). File UNTOUCHED (hard stop); refusal lives upstream in L3.

## What was built (spec §3 file plan, exactly 5 files)

| # | Path | Kind |
|---|------|------|
| A | `schema/registry/realization/robot-realization.policy.yaml` | NEW DATA (registry-style pure data doc, branch-axis-mapping precedent: `kind` is a plain data field, NOT a `*.schema.yaml`, NOT a record kind, no lint file) |
| B | `server/src/compiler/scientistIntent/realizeScientistIntent.ts` | NEW TS (the ONLY new product TS: pure lowering/emission + data-lookup gates L1-L6 + `realizeAndCompile` runner glue) |
| C | `server/src/compiler/scientistIntent/realizeScientistIntent.test.ts` | NEW TEST (T3 fail-loud arms, T4 lint arm, T5 verb non-vacuity, T6 policy-is-data) |
| D | `server/src/compiler/scientistIntent/realizationGolden.test.ts` | NEW TEST (T1 golden, T2 determinism, T4 rung grep, OQ3 deck observation) |
| E | `server/src/compiler/scientistIntent/noBypass.test.ts` | NEW TEST (T7 structural closure) |

Zero edits to any trunk file (`git diff --name-only` empty pre-commit; the commit is 5 new files only). Zero app files. Scratch probes were created under `server/scratch/` + `server/src/scratch/` and deleted before commit; none is in the commit.

## §6 command tails (verbatim)

`npx vitest run src/compiler/scientistIntent` (new + ALL pre-existing scientistIntent suites):
```
 Test Files  13 passed (13)
      Tests  144 passed (144)
```
`npx vitest run src/compiler/scientistIntent/goldens`:
```
 Test Files  3 passed (3)
      Tests  15 passed (15)
```
`npx vitest run src/schema src/lint`:
```
FAIL  src/schema/EventGraphEquipmentSchema.test.ts
FAIL  src/schema/LabwarePhysicalGeometryData.test.ts
      Tests  5 failed | 630 passed | 53 skipped (688)
```
Fail-file SET == the handoff l2t1955 pin {EventGraphEquipmentSchema, LabwarePhysicalGeometryData} exactly (SET identity holds).

Scoped suite at HEAD (`src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`):
```
 Test Files  11 failed | 100 passed | 5 skipped (116)
      Tests  16 failed | 1058 passed | 53 skipped (1132)
```
Fail SET (`/tmp/l2t0550-scoped-head-failfiles.txt`) `diff` vs base pin -> EMPTY (11 files). My tests added only passing files.

Full `src/compiler` base-vs-head (parity proof): base (my 4 files temporarily held out) `17 failed | 135 passed (152)` / `37 failed | 1277 passed (1314)`; head `17 failed | 135 passed (152)` / `37 failed | 1306 passed (1343)`. `diff /tmp/l2t0550-compiler-base-failfiles.txt /tmp/l2t0550-compiler-head-failfiles.txt` -> EMPTY (17 files, identical SET). +29 tests, zero new failures.

`tsc -p .` at HEAD: 26 error lines; `diff /tmp/l2t0415-tsc-multiset.txt /tmp/l2t0550-tsc-final-multiset.txt` -> EMPTY. **TSC MULTISET EMPTY DIFF == PIN.**

lintRules at HEAD: `W26_HEALTH_LINTRULES 81` (unchanged; no new rule ids).

RED-at-base proof for the new arms (module held out, suites run):
```
 FAIL  src/compiler/scientistIntent/realizationGolden.test.ts [ ... ]  (Failed to load url ./realizeScientistIntent.js)
 FAIL  src/compiler/scientistIntent/realizeScientistIntent.test.ts [ ... ]
 FAIL  noBypass.test.ts > (b) compileScientistIntent import-set closure
 FAIL  noBypass.test.ts > (c) this item adds ZERO routes
 FAIL  noBypass.test.ts > (f) the lowerer consumes the frozen contract via parseScientistIntent only
 Test Files  3 failed (3)   Tests  3 failed | 4 passed (7)
```
Every T3/T5 arm is RED at base by construction (the module did not exist); each arm's assertion text is quoted below.

## T1..Tn clause -> proof walkthrough vs §10/§9 acceptance verbatim

Acceptance verbatim: "Zymo family + 'neither spin column nor plate — the robot' answers -> robot-assist-plus-96 realization -> scientist-intent YAML validates against the wave-1 contract -> run graph compiles deterministically (identical inputs, byte-identical output); robot choice recorded LOCAL_REALIZATION; missing capability / count-volume conflation / guessed default each fail with actionable errors; no bypass route from family straight to run graph."

- **AC1 golden chain (T1)**: family fixture = `protocolLayer: universal`, 5 intent steps (canonicals add_material/transfer/mix/wash — enum_only canonicals, never the 7 forbidden), branch_axes = the merged deriveBranchAxes + deriveStepVariantAxes output (M1), `StepProvenanceRef`-shaped provenance, constraints with real vocabulary class ids + bindingKinds. Realization answers the labware-format axis with `robot` (branch-3) and the step-2 variant with `vortexing`. Proof arms: both fixtures validate against the REAL merged `protocol.schema.yaml` + `local-protocol.schema.yaml` via `createValidator` (Ajv sole authority, zero errors); emitted YAML passes the REAL `parseScientistIntent`; every `actions[].action` is a vocabulary member (`defaultScientistIntentVocabulary().has`); profile-sourced symbolic labels rode the emission (`sample_plate`, `reagent_reservoir`, `lbw-def-generic-96-well-plate`, `lbw-def-generic-reservoir-1-v1`); `realizeAndCompile` -> `compileScientistIntent` (production `createResolveSpineFromContext` spine over the recording store) -> `outcome: 'complete'`, `clarifications: []`, 5 events, `writeCalls() === 0`.
- **AC2 byte-identical determinism (T2)**: three full-chain runs (two in-process + one after a FRESH policy YAML disk read) — emitted YAML strings byte-equal AND serialized TerminalArtifacts byte-equal; event counts equal. File-level proof (scratch probe `w27-bytedet.test.ts`, never committed): two independent runs wrote `/tmp/w27-runA.yaml` / `/tmp/w27-runB.yaml` -> `diff` EMPTY, sha256 `97a2df3974204067c6ee946e6c23c79fc8e4cd374a2361ddf5a72ea8c995e6e0` on BOTH. Artifacts files differ ONLY in the incidental random event ids minted by the shipped expander (`BiologyVerbExpander.ts:74` `evt-${verb}-${Math.random().toString(36).slice(2,10)}` — a HARD-STOP file, so it is normalized, never edited): my test mirrors the goldens canon (`replayKernel.ts:271` `INCIDENTAL_EVENT_ID` + `stableStringify`) with the verb class widened to `[a-z0-9_-]+` because the shipped regex misses the compound expander's hyphenated segments (`evt-wash-add-…`, `evt-wash-remove-…`). Event COUNT and every value stay asserted. Disclosed honestly: the run graph is byte-identical modulo those incidental ids, exactly as the goldens harness defines byte-identity; the lowerer's own output is byte-identical with no normalization.
- **AC3 robot choice recorded LOCAL_REALIZATION (T1c + T4)**: robot entry `matched: true`, `branchIds: ['branch-3']` — asserted to be members of `family.branch_axes[].conditions[].id` (never vendor step ids; a vendor `step-1` in branchIds fires `REALIZATION_BRANCH_ID_MASQUERADE`); choices carry the recorded-choice carrier. ZERO rung string literals in product TS: `grep -c "VENDOR\|DERIVED\|INFERRED_INVARIANT\|LOCAL_REALIZATION" realizeScientistIntent.ts` = **0** (also asserted as a test arm). W2-4 R1 satisfaction arms: matched-without-choices payload -> `prov-local-choices-recorded` ERROR fires; `choices: {}` fires too (isEmpty semantics); the W2-7 golden payload is R1-GREEN (zero `prov-local-*` errors).
- **AC4 fail-loud trio + two (T3a-e)**: every arm's verbatim actionable text below.
- **AC5 no bypass (T7)**: arms (a)-(g) below.
- **AC6 pins**: fail-SET identity, tsc multiset EMPTY vs pin, scientistIntent + goldens suites green, ZERO app/records/goldens/schema-registry edits (diff --name-only below).

## Loud-failure arms — verbatim actionable error text (captured by scratch probe `w27-texts.test.ts`, never committed)

- T3a1 missing capability: `[REALIZATION_CAPABILITY_MISSING] the bound scale profile requires 'pipette-capability/p20-multi-8' but the realization's 'equipment' SetupRows carry no ref with ref.id = 'pipette-capability/p20-multi-8' — add a 'equipment' row bound to 'pipette-capability/p20-multi-8' (profile 'robot-assist-plus-96', field 'pipetting.requiredTools').`
- T3a2 bead-beater branch selected: `[REALIZATION_CAPABILITY_MISSING] surviving intent step 'step-2a' needs 'beads' which presumes capability 'CL:bead_beater', but the realization's 'equipment' SetupRows bind no ref with id = 'CL:bead_beater' — answer the equipment role (bind a row to 'CL:bead_beater').` (the CL: arm fires ONLY when the bead-beating branch is selected; the golden selects `vortexing`, so it stays silent there)
- T3b count/volume conflation: `[REALIZATION_ANSWER_INVALID] required answer 'sample_count' (on axis 'branch-axis-step-1') is not a valid Quantity per the shipped quantity schema (Ajv): [{"path":"/unit","message":"Must be one of: cells, beads, wells, organisms, worms, CFU, colonies","keyword":"enum",...,"suggestion":"\"uL\" is not allowed here; choose one of: cells, beads, wells, organisms, worms, CFU, colonies."},{"path":"/","message":"must match \"then\" schema","keyword":"if","params":{"failingKeyword":"then"}}]. Dimension collapse (e.g. a volume unit on a count) is a schema error, never a guess.` — the failure IS the shipped W2-2 Quantity schema's if/then cross-enforcement (Ajv path); no TS branch does the dimensional work (the module builds exactly ONE Ajv validator, over `QUANTITY_ID`; asserted by noBypass arm (f)).
- T3c guessed default: `[REALIZATION_ANSWER_MISSING] required realization answer 'sample_count' is not recorded — record choices.sample_count as a positive count Quantity on the matched branch_resolution entry. Question: "How many samples (wells) are you processing on this realization?" (answer location: branch_resolution[].choices on a matched entry of the realization of 'PRT-zymo-w27-family').` Bypass probe: the same family WITH the answer lowers fine, i.e. the frozen pipeline never asks — the refusal is the upstream gate (OQ4(a)); `ChatbotCompilePasses.ts` untouched (hard-stop diff-empty below).
- T3d unresolved required axis: `[REALIZATION_BRANCH_UNRESOLVED] branch axis 'axis-step-2-variant' ("Which variant applies for step 2 in ZymoBIOMICS 96 MagBead DNA?") is declared on the family 'PRT-zymo-w27-family' but the realization records no matched resolution with chosen branch ids — answer the axis in branch_resolution (matched + branchIds from the family's condition ids + choices).` Zero YAML emitted.
- T3d+ masquerading branch id: `[REALIZATION_BRANCH_ID_MASQUERADE] branch_resolution on axis 'branch-axis-step-1' carries branchId 'step-1' which is NOT a condition id of the family's declared axis (family ids: [branch-1, branch-2, branch-3]) — branch ids come from the family's branch_axes vocabulary, never from vendor candidate step ids.`
- T3e disallowed substitution: `[REALIZATION_SUBSTITUTION_DISALLOWED] substitution of role 'sample_plate' collides with constraint class 'capacity' (bindingKind 'hard_bound', policy 'lab-may-relax', composed key 'lab-may-relax:hard_bound') which is NOT a declared policyBindingKey of the constraint vocabulary — the substitution is disallowed under the declared strictness seam.` Flip arm: `lab-may-relax:vendor_default` on class `vendor_default` passes and is recorded (zero failures, YAML emitted). No new strictness mechanism — membership in the vocabulary's declared `policyBindingKeys` only (SPINE-8 seam).
- L1: `[REALIZATION_INHERITS_MISMATCH] local-protocol 'LPR-zymo-robot-96' inherits_from 'PRT-other' but the family is 'PRT-zymo-w27-family' — point inherits_from at the family record id.`
- T5 verb doors: `[REALIZATION_VERB_UNADJUDICATED] intent step 'step-1' canonical 'heat' has no scientist-intent representation (the adjudication table declares it protocol_semantic_only — never lowered) — lowering refuses silent verb folding.` / `... canonical 'vortex' ... (it is neither a vocabulary verb nor a same_operation mapping) ...` Door 2: a document carrying `action: vortex` throws `ScientistIntentValidationError` from the real Ajv contract. Positive arm: canonical `shake` maps via the adjudication table's `same_operation` data -> emitted `action: shake` (no TS verb list anywhere).

## T7 no-bypass arms (AC5, §6) — all green

- (a) `grep -rn "\.intent" server/src/compiler/protocol/` -> EMPTY (literal compiler consumes no intents).
- (b) import-set closure: non-test files containing `compileScientistIntent` == {compileScientistIntent.ts, intentCompile.ts, realizeScientistIntent.ts, IntentCompileHandlers.ts, IntentCompileFromPromptHandlers.ts} — zero unexpected; W2-7's lowerer IS the only new member.
- (c) zero routes: no `*realiz*` handler file; the lowerer contains no `fastify` import and no `instance.post/get/put`.
- (d) `scientist-intent-compile.yaml` sha256 == `b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8` (pinned).
- (e) `derive_execution_scale_plan` is NOT on the scientist-intent pipeline (still only on `chatbot-compile.yaml`) — bait #9 refusal proven.
- (f) the lowerer validates the emitted document ONLY through the real `parseScientistIntent`; exactly one `createValidator(` call in the module and it is the shipped QUANTITY datatype.
- (g) `schema/registry/realization/` contains zero `*.lint.yaml` — no new lint rule ids (lintRules stays 81).

## OQ2 shape used (M5)

Shape **(a)**: `choices: { [axisId]: chosenValue }` — e.g. `choices: { 'branch-axis-step-1': 'robot', sample_count: {value:96, unit:'wells', dimension:'count'} }`. Verbatim merged R1 requirement copied into the fixture comment: `when: nonEmpty branch_resolution` -> `everyItem` -> `any[ equals matched:false | nonEmpty choices ]`, severity error; the rule asserts matched -> nonEmpty choices ONLY and does not read inside choices, so shape (a) satisfies it and stays back-compat with `IntentAcceptHandlers.ts:81` (`choices: { [axisId]: chosenValue }`). Defensive posture recorded (spec §7 CMT(W2-4)): my L3 treats `choices: {}` as ABSENT (PathResolver.isEmpty semantics — `{}` is EMPTY, identical to absent), pinned by a test arm that shows R1 fires on `{}` too.

## OQ3 deck-pass observation (M9)

CAMT-at-claim on `createPlanDeckLayoutPass` (ChatbotCompilePasses.ts:3300+): the pass reads `resolve_labware`'s `labwareAdditions` deckSlot hints and `compute_resources`' tipRacks; it does NOT read the execution-scale profile at all (profile consumption lives in `derive_execution_scale_plan`, which is chatbot-pipeline-only). Golden observation (`W27_DECK_OBSERVATION`): `deckLayoutPlan = {pinned: [], autoFilled: [{slot:'A1', labwareHint:'unknown', reason:'tipRack'}], conflicts: []}`, `labwareAdditions: null`, `labwareRequirements: null`, `resourceManifest.tipRacks = [{pipetteType:'unknown', rackCount:1}]`.

Reading: the deck pass does NOT ignore profile-sourced labels ENTIRELY — the profile labels (`sample_plate`, `reagent_reservoir`, the two labware-definition hints) flow through the lowerer into the frozen pipeline's resolve_nouns/resolve_labware/resolve_roles legs and the run graph compiles `complete` with 5 events and zero clarifications; but the deck-layout pass itself is profile-blind (it lays out slots from hints + tipRacks, and with no deckSlot hints and an unbound tipRack it auto-fills one slot). Per M9/OQ3(a) the gate+labels depth is the golden's proof bar and I accepted it: capability closure (profile `requiredTools`/`requiredLabwareDefinitions` satisfied by SetupRows) + profile-sourced symbolic labels + deterministic run graph, asserted. I did NOT edit any pipeline YAML, did NOT bolt `derive_execution_scale_plan` in, and did NOT fake deck claims. **No MANIFEST re-bless DECISION request is raised**: the deck pass is not ignoring the profile labels entirely (it consumes them downstream via resolve_labware's additions), it simply is not the profile consumer — recording the observation for the orchestrator's awareness only.

## Hard-stop diff-empty proofs (M8)

`git -c core.fileMode=false diff --name-only` (tracked, pre-commit): EMPTY (zero tracked edits).
`git -c core.fileMode=false status --porcelain -uall | grep "^??"` (my entire footprint): exactly the 5 planned new files.
Targeted diff-empty over every hard-stop region (`server/src/compiler/pipeline`, `schema/scientist-intent`, `records`, `app`, `server/src/api/handlers/IntentCompile*`, `schema/registry/compile-pipelines`, `schema/workflow`, `schema/core`, `schema/registry/execution-scale-profiles`, `schema/registry/provenance-ladder`, `schema/registry/constraint-vocabulary`, `schema/registry/wave2-verb-adjudication.yaml`): EMPTY.
MANIFEST: `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` = `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` at base AND at head (byte-untouched). Note for the orchestrator: the M7 pin text says "file-level git hash 873e1343"; `873e1343` is not an object/blob prefix in this repo's history — the MANIFEST blob at my base f19cfa95 (and at cl-integration-2 tip, commit 1fc239cf) is `58c447eb…`, and it is unchanged base->head. The pin's INTENT (byte-untouched MANIFEST) holds; the quoted 8-char value appears stale. Goldens suites green (15/15) independently prove no re-bless.
`ChatbotCompilePasses.ts` 8-sample default: untouched (diff-empty above; arm (e) proves the pass-list unchanged). `VendorProtocolEventGraphDraftService.ts`, `ai.semanticPass` machinery, extraction-draft lifecycle YAML: untouched (diff-empty above).

## Worktree parity + hygiene

- node_modules symlinks intact (`server/node_modules -> cl-integration-2/server/node_modules`); `server/schema` symlink present.
- `comm -3` of `git status --porcelain -uall --ignored=matching` between trunk and my worktree: the ONLY differences are (i) my 5 new files and (ii) trunk-only untracked entries that my lane-exclude covers (`app/e2e/*`, `app/receipts/*`, `app/test-pb-ch-5.mjs`, `app/test-results/`, `.run/`, `server/model.pkl`, `server/python-executor-service/.../__pycache__/` — all listed in `/home/brad/.hermes/cl/lanes/2/lane-exclude-W2-7-l2t0550`). No bulk sync from Brad's live tree; nothing staged beyond the 5 files; NEVER `git add -A`.
- Scratch: `server/scratch/` and `server/src/scratch/` deleted before commit; `git status` shows zero scratch.
- exactOptionalPropertyTypes: every optional field is `...(cond ? {k: v} : {})` — never `undefined` (branchIds, choices passthrough, policy injection, scaleProfile passthrough).
- Headless item: NO browser, no :3093/:5193/:3001/:5174 interaction. Prompt budget: ZERO LLM calls, zero prompts, zero models (task-list convention).

## Assumptions / notes for the orchestrator

1. `local-protocol-compile` passes (`resolve_branch_axes` etc.) are exercised by their own existing suites (green in the scoped run); my golden drives family+answers -> realization payload -> lowerer directly, per spec §2.3's honest disclosure. The branch-filtering leg is proven in my suite via `activeStepIdsForResolution` results (`step-2b` active, `step-2a` not) and the ResolveBranchAxesPass behavior is unchanged.
2. The golden does NOT persist records (A2); persistence via ordinary store paths is W2-8's surface.
3. `REALIZATION_ANSWER_INVALID` is my code for "the required answer failed the shipped Quantity schema / dimension binding" — the dimensional judgment is Ajv's, not a TS branch (noBypass arm (f) pins the single Ajv validator).
4. Stale-pin note (M7): the MANIFEST hash quoted in the promotion record (`873e1343`) does not match the actual MANIFEST blob at f19cfa95 (`58c447eb…`); the byte-untouched requirement holds base->head. Flagging for orchestrator bookkeeping, not acting on it.
5. The goldens canon regex (`replayKernel.ts:271`) does not cover the compound expander's hyphenated event ids (`evt-wash-add-…`); I mirrored the canon locally in my test rather than edit the hard-stop harness. Worth a lane note if the harness is ever widened.

================================================================================
## Adversarial cycle-1 fixes (review-W2-7-adversarial-l2t0715-c1, VERDICT: fix)
================================================================================

All four defects fixed on the SAME worktree/branch (base cf7d548a preserved;
this is ONE new commit on top). No green work redone; no unrelated refactors.

DEFECT 1 [major] — literal verb list at realizeScientistIntent.ts:550.
  FIX: the verb->reagent-source applicability is now policy DATA. The policy
  YAML declares emissionPolicy.reagentFedVerbs: [transfer, wash, add_material]
  and the lowerer builds `reagentFedVerbs = new Set(policy.emissionPolicy
  .reagentFedVerbs)` and tests MEMBERSHIP per lowered verb
  (`labelField.onlyForReagentFedVerbs && !reagentFedVerbs.has(verb)`). Zero
  verb string literals remain in the product TS (grep below = 0 hits). The
  emission rides the SAME fresh-load path as every other policy leg (the
  policy doc is the fresh disk read; the T2 YAML-reload leg and the new T6
  emission leg prove it is real data).
  NEW PROOF ARM (T6): a temp policy copy that drops ONLY the `wash` entry from
  reagentFedVerbs -> the emitted wash action loses source/sourceHint while
  keeping target/labware, transfer+add_material stay reagent-fed — ZERO code
  edits; shipped policy byte-untouched afterwards.

DEFECT 2 [minor] — profile FIELD PATHS hardcoded at :542-545 (plus 'equipment'
  at :458 and the 'labwares' default at :410).
  FIX: policy YAML now declares emissionPolicy.labelFields (ordered list):
    - reagent_source: profileField reagentSource.sourceLabwareRole -> slot
      `source`, hintValueField reagentSource.labwareDefinition -> hintSlot
      `sourceHint`, onlyForReagentFedVerbs: true
    - sample_layout: profileField sampleLayout.labwareRole -> slots `target`,
      `labware`, hintValueField sampleLayout.labwareDefinition -> hintSlot
      `labwareHint`
  The L5 emitter loops the declared labelFields (declaration order = emission
  order, determinism preserved) and reads every path via dataPath(). The
  per-step capability section/match path moved to policy stepCapabilityClosure
  (section: equipment, matchOn: ref.id) — the old 'equipment' literal is gone.
  The setup-row default section moved to policy setupDefaults.defaultSetupSection
  (labwares) — the old 'labwares' literal is gone. Grep for field-path and
  section literals in the product TS = 0 hits.

DEFECT 3 [minor] — substitutionAdjudication declared but never consumed.
  FIX: the consumer now reads the declaration: loadPolicyBindingKeys(policy)
  resolves vocabularyFile (repo-root-relative) and indexes the doc at
  membershipField (throws loudly if the declared field is not a list); the key
  is composed from the keyComposition template via composeBindingKey()
  ({overridePolicy}/{bindingKind} placeholders filled from the constraint's own
  fields) — the old hardcoded `${overridePolicy}:${bindingKind}` is gone. A
  constraint's declared subject.bindingPolicyKey must now AGREE with the
  composed key (disagreement fails loudly — the composition is the declared
  one, never a per-record override). The verbAdjudication table path also rides
  a new policy pointer (verbAdjudication.file) so the L5 doors load through
  policy data too.

DEFECT 4 [minor] — vacuous T5 'shake maps via the adjudication table'.
  FIX (test): the shake test is renamed to what it actually proves — the DIRECT
  vocabulary door (shake IS a vocabulary member). NEW test exercises the
  same_operation MAPPING branch honestly: canonical `agitate` (NOT a vocabulary
  member) is refused with the shipped table (control arm), then a TEMP copy of
  wave2-verb-adjudication.yaml renames the table's shake entry to
  agitate -> shake and a TEMP policy copy points verbAdjudication.file at it —
  the mapping branch fires and `action: shake` lowers with ZERO code edits;
  shipped table + policy asserted byte-untouched afterwards.

VERBATIM TARGETED-SUITE TAIL (server/, scratch/l2t0915-targeted.log):
 ✓ src/compiler/scientistIntent/noBypass.test.ts  (7 tests) 6386ms
 ✓ src/compiler/scientistIntent/realizationGolden.test.ts  (6 tests) 2726ms
 ✓ src/compiler/scientistIntent/realizeScientistIntent.test.ts  (18 tests) 601ms

 Test Files  3 passed (3)
      Tests  31 passed (31)

Full scientistIntent dir: 13 files / 146 tests passed (was 144; +2 new arms).
Goldens dir: 3 files / 15 tests passed. Wave2NamingCrosswalk: 6/6 (the shipped
adjudication table is byte-untouched — the agitate swap lived in a temp copy).

VERB-LITERAL GREP (product TS, the gate's required quick grep):
  grep -nE "'(transfer|wash|add_material|mix|shake|heat|vortex|incubate|read|
  spin|elute|...|agitate)'" server/src/compiler/scientistIntent/
  realizeScientistIntent.ts  -> exit=1, 0 HITS.
  Field-path/section literal grep ('(sampleLayout|reagentSource|pipetting|
  deckBinding)\.' + '(equipment|labwares|materials)') -> 0 HITS.
  Rung-literal grep -> 0 (T4 grep arm still green).

DETERMINISM RE-PROOF (AC2, T2 3-leg incl. YAML reload):
  realizationGolden T2 re-run green (scratch/l2t0915-t2.log: 1 passed):
  runA/runB in-process + runC with a FRESH loadRealizationPolicy(disk) — the
  new emissionPolicy/labelFields/stepCapabilityClosure/setupDefaults/
  verbAdjudication reads all ride the SAME policy doc (fresh-load path), and
  runC.yaml === runA.yaml byte-for-byte: the YAML-reload leg is the tell that
  the new emission policy is real data. Emission order is declaration order
  (labelFields array), so byte-identical determinism is preserved by
  construction.

PINS: server tsc multiset 26 == pin (/tmp/l2t0415-tsc-server.txt; strip
coords + sort + diff EMPTY; no error line names a scientistIntent/realize file).
Pipeline sha b47eee0c... unchanged; MANIFEST blob 58c447eb... byte-untouched;
hard-stop diff (pipeline, goldens, schema/scientist-intent, app, records) EMPTY.
Diff files this cycle: robot-realization.policy.yaml, realizeScientistIntent.ts,
realizeScientistIntent.test.ts (3 files; no test-file additions beyond the two
new arms inside the existing T5/T6 describes).
