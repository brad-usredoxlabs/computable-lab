# SPINE-7-ROLES-SEAM — FINAL report (l2t1010, resume run 2)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-7-lane2-l2t0810
Branch: SPINE-7-lane2-l2t0810 (base 24b43bca)
Spec: .hermes/plans/2026-10-09_0820-SPINE-7-roles-seam-spec.md
Ruling: ~/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md ("New product item 1")
Prior WIP (design decisions 1-4, probes 1-3, baselines): .hermes/plans/SPINE-7-report.wip-l2t0810.md
This run inherited the previous session's uncommitted edits + new test files, verified
everything from scratch, fixed two reds, added the missing mutation legs, re-blessed the
manifest once, and ran the full verification battery.

## What this resume run changed on top of the inherited WIP

1. ResolveRolesSpine7Regression.test.ts:53 — the WIP's chatbot byte-identity pin asserted
   `details.destination_labware` UNDEFINED; the shipped transfer expander has ALWAYS lowered
   `labware_id` into `destination_labware` (simpleVerbs.ts :411/:440). A byte-identity test must
   pin the shipped value, not absence. Fixed to `toBe('plate-1')`. (Test-authoring error, not a
   product defect: the pre-SPINE-7 lowering is unchanged.)
2. goldenRolesSeam.test.ts — the WIP header promised mutation legs but none existed. Added the
   three mutation legs (M1/M2/M3, below) and corrected the header to describe what is actually
   implemented.
3. goldenRolesSeam.test.ts role-key assertion — the resolve_roles pass clears the role on
   expanded events via `role: undefined` (ChatbotCompilePasses.ts :2440). The in-process mock
   reply keeps the key with an undefined value (the live Express route JSON-serializes and drops
   it). The test now asserts `details.role === undefined` on the live payload AND key ABSENCE
   on the blessed record's event details (SPINE-1 key-absence-vs-undefined convention).
4. MANIFEST re-bless (leg 4): the WIP blessed roles-seam.golden.json BEFORE the
   INCIDENTAL_EVENT_ID `_rN` extension landed in replayKernel.ts, so the record carried
   `"eventId": "evt-transfer-0h9yeeli_r0"` while the final normalizer drops it. Re-blessed once
   on the final tip (diff below).
5. Import hygiene: `PipelineState` imported from `../types.js` / `../../pipeline/types.js`
   (the canonical home; PipelineRunner.ts does not export it — the WIP import would have added
   a tsc error).

## Acceptance legs (ruling items 1-4) — evidence

RED-first transcript (this run, `git stash push -u` of the 7 product edits at base 24b43bca,
new test files kept): 7 failed tests —
- rolesSeam leg1 parse + engine: "scientist-intent failed schema validation: 1 error(s)" (×3)
- rolesSeam leg3 vocabulary: "expected false to be true" (required flag absent at base)
- rolesSeam leg3 sweep: "expected true to be false" (pass not blocked at base)
- golden roles-seam: "expected 502 to be 200" (scalar doc rejected at base)
- golden missing-required-address: "expected 200 to be 422" (no sweep at base)
`git stash pop` restored byte-clean (8 modified files re-confirmed via git status).

### Leg 1 — ROUTE-REACHABILITY (schema-valid scalar wells label compiles through the real route)
- Unit: `rolesSeam.test.ts > leg 1` — parse keeps the trimmed scalar (`targetWells ===
  'control_well'`); the REAL resolve_nouns pass + store-backed spine exposes
  `resolvedByLabel['control_well'] = {verb: transfer, argument: targetWells, recordId:
  well:A12, resolvedLabel: A12, addresses: [A12], actionIndex: 0}`, blocked=false. GREEN.
- Route golden: `golden.intent-to-graph.roles-seam` — 200 `outcome: complete` through the REAL
  `createIntentCompileFromPromptHandlers` (parse REAL, zero vi.mock; only model client + store
  harness-controlled per replayKernel discipline); `localMacro.actions[0].targetWells ===
  'control_well'`; full 200 body deep-equal vs blessed record. GREEN.

### Leg 2 — D4 CLEARANCE (closes AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE)
Test: `golden.intent-to-graph.roles-seam` + `SPINE-7 D4 mutation legs` (goldenRolesSeam.test.ts).
Pin arm named (the ruling's "provably-different defaults OR spy/mirror pin" — the mirror-pin arm,
with M1 supplying the provably-different value; probe 3 proved a provably-different DEFAULT is
impossible for the only production-reachable single-address binding, because the engine's wells
arm IS defaultRoleResolver):
(a) emitted wells EQUAL engine slot addresses: mirror pin runs the same fixture store through the
    REAL resolve_nouns pass -> `resolvedByLabel['control_well'].addresses === ['A12']`,
    `recordId === 'well:A12'`; emitted event count === addresses.length; `details.well ===
    engineAddresses[0]` ('A12').
(b) NO wells array in event details: `Object.keys(details)` excludes 'wells' and 'source_wells'
    (the scalar is never lowered as addresses); blessed record details keys are exactly
    [destination_labware, source_labware, volume, volumeUl, well].
(c) fallback pinned SEPARATELY: `defaultRoleResolver('control_well', {orientation:'landscape',
    labwareType:'96-well-plate'}) === ['A12']` asserted independently.
(d) mutation legs (test-local state; NO product file touched, so restore is byte-clean by
    construction — SPINE-3 restore discipline):
    M1: slot addresses ['B5'] (≠ fallback ['A12']) -> emitted well 'B5', NOT 'A12' — only the
        authoritative arm (ChatbotCompilePasses.ts :2410-2412) can produce B5. GREEN.
    M2: slot keyed 'some_other_label' (keying contract broken) -> emitted well 'A12' (fallback).
        GREEN — proves the golden's role==label equality is what makes the authoritative arm live.
    M3: producer removed (no details.role) -> event passes through unchanged, NO well, eventId
        untouched. GREEN.
All 5 goldenRolesSeam tests GREEN. AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE closes on
`golden.intent-to-graph.roles-seam` (with its mutation legs) per ruling item 2.

### Leg 3 — MISSING-ADDRESS LEG (422 arm, never the 500 arm)
Shipped vocabulary data: `aliquot.targetWells` `kind: wells` `required: true`
(scientist-intent-vocabulary.yaml :486-489). Lint-clean: `vocabulary.test.ts > the shipped
vocabulary validates + lints CLEAN (zero findings)` GREEN (P3 forbids only required RESOLVABLE
args on pattern verbs; aliquot is a compound verb, wells arg).
- Unit: `rolesSeam.test.ts > leg 3` — requiredArgumentClarifications fires with reason
  `missing-required-argument`, label 'targetWells', actionLocation {actionIndex:0, action:'aliquot',
  argument:'targetWells'}; pass blocked. GREEN.
- Route golden: `golden.intent-to-clarification.missing-required-address` — 422
  `NEEDS_CLARIFICATION`, outcome 'needs-clarification', classifier NOT_SUCCESS_CLARIFICATION,
  exactly ONE sweep item (deep-equal), atomic zero-artifact (events/gaps [], key absence for
  labwareAdditions/deckLayoutPlan/resourceManifest/instrumentRunFiles/labStateDelta), localMacro
  held, zero store writes, record deep-equal. NO 500 anywhere. GREEN.

### Leg 4 — MANIFEST RE-BLESS (once, final tip, before/after diff)
Before (inherited WIP manifest, sha 55d3e079…):
  records roles-seam  8d2b16ef4482e26625f21d32e61f8ed3cf89fd291bcb6aa15506794988687fe1
After (final tip, manifest sha 6b5e23e93a21544bb4c9c359abfed369f82a51d2809efbc1f44a63107935da93):
  records roles-seam  c0ba793eaab0af8ce9a5dd4f4a5f9491f70025119f72e3c8ce12f45662cd921b
Single-line diff (MANIFEST.yaml line 32). Cause: the WIP blessed the record before the
INCIDENTAL_EVENT_ID `_rN` extension landed in replayKernel.ts; the old record carried
`"eventId": "evt-transfer-0h9yeeli_r0"`, which the final normalizer drops (the `_rN` suffix is
the resolve_roles regeneration counter, ChatbotCompilePasses.ts :2437 — deterministic, carries no
identity; event COUNT and every well/address value remain asserted).
Unchanged pins verified current: treeState vocabulary 2ae54320…, schema bb5cc4d0… (WIP re-hash,
still exact), pipeline b47eee0c…; all 6 SPINE-6 fixtures + records byte-identical to their pins;
missing-required-address record 0b78c911… unchanged (422 arm has no expanded events).
`golden.manifest.versions-current` GREEN (zero mismatches across all 17 pins).

## Chatbot byte-identity evidence
- Producer grep: `grep -rn wellRole server/src --include='*.ts'` — the ONLY writer of candidate
  `wellRole` is normalizeScientistIntent.ts :167 (scientist-intent chain); the only reader is the
  transfer expander (simpleVerbs.ts :428/:444, passive conditional spread). Chatbot chain
  (ChatbotCompilePasses ai_precompile lowering, zod `candidateEvents: z.array(z.any())`) has no
  wellRole producer; a chatbot candidate's own `role` param is NOT lowered into details.
- Regression test `ResolveRolesSpine7Regression.test.ts` (3 tests GREEN): chatbot candidate with
  `role` param lowers exactly as pre-SPINE-7 (no details.role, wells pass through,
  destination_labware shipped value); `wellRole` IS lowered to details.role (producer path);
  resolve_roles with NO resolve_nouns slot (chatbot pipeline registers no such pass) ->
  defaultRoleResolver fallback 'A12', role cleared — byte-identical to today's code.
- Suite: all chatbot-pipeline pass tests green in the targeted run (50 passed files; the 3 fail
  files are the pre-existing baseline trio).

## Baselines before/after
- Targeted suite (`vitest run src/compiler/scientistIntent/ src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/pipeline/passes/`):
  BASE (WIP capture): 3 failed files / 8 failed tests, 47 passed files / 467 passed tests.
  FINAL: 3 failed files / 8 failed tests, 50 passed files / 481 passed tests (53 files).
  Fail files identical set: AiPrecompileShapeMismatch.log.test.ts, GeminiEmAppliancePath.test.ts,
  ProtocolRealizePass.test.ts (pre-existing). Delta +3 files / +14 tests = the 3 new SPINE-7 test
  files (rolesSeam 6, goldenRolesSeam 5, ResolveRolesSpine7Regression 3).
- `vitest run src/compiler` fail-file SET: 17 files == baseline
  /tmp/l2t0810-baseline-compiler-failfiles.txt (diff EMPTY; capture
  /tmp/l2t1010-compiler-failfiles-final.txt).
- `vitest run src/ai`: 10 failed files / 21 failed tests == baseline (644 passed).
- server tsc (`npx tsc -p .`): 26 error lines / 6 files; normalized error SET identical to pin
  /tmp/l2t2230-tsc-server.txt (sha 924c18bd…, which was captured position-stripped; my capture
  /tmp/l2t1010-tsc-server-final.txt includes positions + one TS2322 continuation line — after
  `sed 's/([0-9]*,[0-9]*)//'` + sort the diff is EMPTY). Files: AgentOrchestrator,
  ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard, bootstrapAdmin, RecordStoreImpl.
  ZERO new errors from SPINE-7.

## Deviations from the WIP design decisions (and why)
1. D4 verb choice: WIP said `transfer.targetWells -> required: true`; shipped data is
   `aliquot.targetWells -> required: true` (the inherited implementation already chose aliquot;
   this run verified the choice is REQUIRED, not cosmetic: transfer.targetWells required would
   bar the blessed SPINE-6 golden `golden.intent-to-graph.transfer-read` (transfer WITHOUT
   targetWells) into a 422 — breaking a pinned golden. aliquot is semantically defined by its
   target wells and no shipped golden/route test compiles an aliquot without them. Lint-clean
   (P3 compliant).
2. D3 producer key: WIP said candidate `role: <label>`; shipped implementation uses candidate
   `wellRole` (expander maps wellRole -> details.role). This is a strengthening: the chatbot
   zod candidate schema is `z.any()`, so a chatbot candidate CAN carry a `role` param; keying the
   producer on `role` would lower it and break byte-identity. `wellRole` is written ONLY on the
   scientist-intent chain — pinned by the regression test's first leg.
3. Mutation-leg mechanism: WIP header promised an engine-side adapter mutation; implemented as
   test-local seam mutations M1/M2/M3 on freshly built PipelineState (product files never touched
   => restore byte-clean by construction). M1 supplies the provably-different value (slot B5 vs
   fallback A12) the ruling's item-2 alternative demanded; the mirror pin (a)+(c) supplies the
   spy/mirror arm. Same evidentiary shape, cleaner discipline.
4. Chatbot regression assertion fix (destination_labware) — see "What this resume run changed" #1.

## Files (owned, committed)
Tracked edits (8): schema/workflow/scientist-intent.schema.yaml (oneOf [array,string] widening,
array branch first/byte-stable); schema/scientist-intent/scientist-intent-vocabulary.yaml
(aliquot.targetWells required:true); server/src/compiler/scientistIntent/parseScientistIntent.ts
(scalar canonicalization in normalizeDocument); server/src/compiler/scientistIntent/normalizeScientistIntent.ts
(vocabulary-driven wells-label lowering -> candidate wellRole, arrays verbatim);
server/src/compiler/biology/verbs/simpleVerbs.ts (transfer expander wellRole->details.role spread);
server/src/compiler/scientistIntent/types.ts (string|string[] widening);
server/src/compiler/scientistIntent/goldens/MANIFEST.yaml (re-bless);
server/src/compiler/scientistIntent/goldens/replayKernel.ts (INCIDENTAL_EVENT_ID _rN extension).
New (7): server/src/compiler/scientistIntent/rolesSeam.test.ts;
server/src/compiler/scientistIntent/goldens/goldenRolesSeam.test.ts;
goldens/fixtures/roles-seam.yaml; goldens/fixtures/missing-required-address.yaml;
goldens/__records__/roles-seam.golden.json; goldens/__records__/missing-required-address.golden.json;
server/src/compiler/pipeline/passes/ResolveRolesSpine7Regression.test.ts.
Report: .hermes/plans/SPINE-7-report.wip-l2t1010.md.
ZERO new branches in resolutionEngine.ts (untouched); chatbot chain behavior unchanged;
no vendor-kind terms; SPINE-8's levelFor seam untouched.

## Status (supersedes the WIP checkboxes)
- [x] bootstrap + parity (inherited, verified via suite baselines matching the WIP capture)
- [x] probes (inherited)
- [x] baselines (re-verified: compiler 17-file set, ai 10/21, tsc 26/6)
- [x] leg 1 RED->GREEN
- [x] leg 2 RED->GREEN (D4 clearance: AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE closed on
      golden.intent-to-graph.roles-seam + mutation legs)
- [x] leg 3 RED->GREEN
- [x] chatbot byte-identity regression
- [x] manifest re-bless (once, final tip, diff above)

END REPORT: SPINE7_ROLES_SEAM_COMPLETE

## Fix run 1 (l2t1110) — adversarial review l2t1050, cycle 1/2

Base: e0426fd9. Fix commit on branch SPINE-7-lane2-l2t0810 (new commit, not amend).
Tracked edits (5 files + 1 new fixture triplet dir):
- server/src/compiler/scientistIntent/normalizeScientistIntent.ts (D1 + D4)
- server/src/compiler/scientistIntent/compileScientistIntent.ts (D1 bar wiring + D4 threading)
- server/src/compiler/biology/verbs/compoundVerbs.ts (D2 aliquotExpander)
- server/src/compiler/scientistIntent/rolesSeam.test.ts (D1/D2/D4 legs, +8 tests)
- server/src/compiler/scientistIntent/goldens/goldenRolesSeam.test.ts (D3 spy arm +2 tests, D5 mirror)
- server/src/compiler/scientistIntent/fixtures/vocab-wells-flip/ (D4 fixture vocabulary triplet)
resolutionEngine.ts and ChatbotCompilePasses.ts: NOT touched (git diff confirms).

### D1 (major) — scalar sourceWells silent drop: OPTION (b) CHOSEN (fallback arm)
The orchestrator's preferred symmetric realization is genuinely impossible under
this item's constraints, and the report says so explicitly:
- The resolve_roles seam (ChatbotCompilePasses.ts :2391-2454, NOT touched) consumes
  exactly ONE role per event: details.role -> details.well. That is a DESTINATION-side
  coordinate. There is no source-side role consumer anywhere in the shipped chain
  (grep: details.source_wells is read only as an ADDRESS array by eventReducers.ts:207
  and transferPrograms.ts:389; a label lowered as source_wells:[label] would fabricate
  an address — labels are not addresses).
- Realizing a source label would require a NEW consumer in ChatbotCompilePasses.ts
  (forbidden by the fix brief) or a new (verb,arg)->role-key TS table (new hardcoded
  policy — forbidden). Schema narrowing is not approved. So: reviewer option (b).
Implementation: normalizeScientistIntent.ts now exports
UNREALIZED_WELL_LABEL_REASON ('unrealized-well-label'); toCandidateEvent records
{label, reason, actionLocation{actionIndex, action, argument}} for a scalar on a
declared kind:wells arg whose event family has no role consumer (the source_wells
family); normalizeScientistIntent returns it as an additive `clarifications` field
(key ABSENT when empty — exactOptionalPropertyTypes). compileScientistIntent.ts bars
atomically on it on the SAME 422 needs-clarification arm as the engine sweep (engine
clarifications keep verbatim precedence; producer items append). NO silent drop,
NO 500.
Tests (rolesSeam.test.ts, all green):
- 'scalar sourceWells: NO silent drop — the producer emits the structured
  unrealized-well-label clarification' — candidate carries NO source_wells key,
  clarifications deep-equal the structured item.
- 'array sourceWells form stays byte-identical' — source_wells:['A1','B2'] verbatim,
  wells:['C1'], NO clarifications KEY at all (byte-identical array behavior pinned).
- 'route arm: the unrealized label bars atomically on the 422 needs-clarification arm
  (engine bound it cleanly — the producer bar alone), NEVER 500' — real store-backed
  spine compile: outcome needs-clarification, clarifications == [the producer item]
  (engine contributed ZERO clarifications: control_well binds fine via the role-address
  arm), terminalArtifacts.events/gaps == [], no labwareAdditions/deckLayoutPlan/
  instrumentRunFiles keys.

### D2 (major) — aliquotExpander consumes BOTH carriers (orchestrator decision executed)
compoundVerbs.ts aliquotExpander now:
- SCALAR carrier: candidate `wellRole` (engine-bound label, same producer key transfer
  uses) lowers to ONE role-carrying transfer event (details.role == label, NO
  source_well/destination_well placeholders); resolve_roles (:2410 authoritative arm)
  substitutes the engine binding's addresses — placeholder well-0 pair REPLACED.
- ARRAY carrier: consumes `wells` (scientist-intent normalizer key) FIRST, then the
  shipped `target_wells` (chatbot/deterministic shape); n_targets defaults to the
  carrier LENGTH when a carrier is present (module contract "N transfer events ... to
  each target well"); the shipped default-1 placeholder stays when NO carrier exists.
SCOPE DECLARATION (per the fix brief's escape clause): the array-carrier consumption
is a behavior change for ANY candidate carrying a wells array (the drop was
pre-existing; the orchestrator's decision explicitly chose wiring over moving the
required declaration, so the pinned transfer-read golden stays). No shipped test pins
a chatbot-chain aliquot candidate carrying wells (grep: chatbot candidates with
target_wells are verb 'transfer'; lowerCandidateActionsToEvents carries `wells` only
for LLM candidate actions). All suite baselines unchanged (see Verification), and the
chatbot byte-identity regression (ResolveRolesSpine7Regression, 3 tests) stays green:
the chatbot producer key stays wellRole-only — a chatbot candidate's own `role`/wells
params never ride the scalar arm.
Tests (rolesSeam.test.ts, all green):
- 'array carrier (scientist-intent wells): bound addresses REPLACE the well-0
  placeholder pair; n_targets defaults to carrier length' — wells:['A1','B1','C1'] ->
  3 events, source/destination wells A1/B1/C1, no 'well-' placeholder anywhere.
- 'array carrier (shipped target_wells shape) unchanged' — n_targets:3 + target_wells
  -> 3 bound events; no-carrier leg pins the shipped default-1 well-0 placeholder.
- 'scalar carrier (wellRole): lowers ONE role-carrying transfer event ... NO placeholder
  wells ride'.
- 'route: an aliquot with a SCALAR targetWells compiles complete and the emitted event
  carries the engine-bound address (placeholder well-0 pair replaced); missing targetWells
  still bars (422 sweep)' — real spine compile: outcome complete, event details.well ==
  'A12' (engine binding), no source_well/destination_well, no 'well-0' substring; the
  missing-targetWells document still yields needs-clarification with
  MISSING_REQUIRED_ARGUMENT_REASON.

### D3 (minor) — spy arm added (ruling's named spy/mirror arm)
goldenRolesSeam.test.ts new describe 'SPINE-7 D4 spy arm (fix1/D3)' (2 tests, green):
- 'route run: defaultRoleResolver is NEVER invoked from the resolve_roles FALLBACK arm
  for the bound label' — vi.spyOn(roleResolverModule, 'defaultRoleResolver') around the
  REAL runGolden(fixture) route run. The two arms that call defaultRoleResolver on this
  route are distinguishable by CONTEXT: the ENGINE binding arm (resolve_nouns ->
  explicit_wells -> createRoleAddressAdapter, adapters.ts:190-224) calls it with NO
  ctx.args (resolveNounsPass builds createRoleAddressAdapter() with none); the
  resolve_roles FALLBACK arm (:2413) always passes ctx.args = event details.
  Assertions: >=1 engine-arm call for 'control_well' (the binding computation) AND
  ZERO fallback-arm calls — the authoritative slot arm produced the emitted well.
  vi.restoreAllMocks in finally (no cross-test leakage).
- 'spy control (non-vacuity)' — the M2 mismatched-key state DOES fire the fallback-arm
  signature (ctx.args present), proving the zero-assertion above is not vacuous.
This closes the reviewer's "route golden alone is satisfied by the fallback arm" gap:
the route run now carries a direct spy assertion, not only synthetic mutation legs.

### D4 (minor) — injected vocabulary threaded into the producer
normalizeScientistIntent(intent, options?: NormalizeOptions) — options.vocabulary is
the SAME instance compileScientistIntent threads into resolve_nouns
(deps.vocabulary ?? defaultScientistIntentVocabulary()); the producer's wellsLabelArgs
now reads that instance, never the singleton. compileScientistIntent.ts computes the
instance once and passes it to BOTH normalizeScientistIntent and the resolve_nouns
registration. All 15 existing single-arg call sites keep working (options optional).
Test (rolesSeam.test.ts, green): 'a fixture vocabulary that reclassifies
transfer.targetWells as resolvable (not wells) flips the producer classification' —
new fixture triplet server/src/compiler/scientistIntent/fixtures/vocab-wells-flip/
(vocabulary + schema + lint copies; Ajv + lint run REAL on load). Under the injected
vocab the scalar rides as a raw `wells` value with NO wellRole; under the shipped
singleton the same document produces wellRole (mutation proof of the seam).

### D5 (minor) — mirror document built from fixture.modelOutput
goldenRolesSeam.test.ts: engineSlotForFixture(fixture, stringify(fixture.modelOutput))
— the duplicated literal is GONE; the mirror now re-parses the blessed fixture's own
canned intent (yaml stringify of the fixture object), so fixture drift can no longer
make the mirror check a different document. Golden stays green (slot.blocked false,
binding recordId well:A12, addresses ['A12'] — identical values re-derived from data).

## MANIFEST: NO re-bless needed (before == after)
No rule file, fixture, or golden record content changed in this fix run (git diff
--stat: only TS product/test files + the new test-local fixture vocab dir, which the
manifest does not pin). Independent re-hash vs MANIFEST pins (unchanged):
- schema/scientist-intent/scientist-intent-vocabulary.yaml 2ae54320... == pin
- schema/workflow/scientist-intent.schema.yaml bb5cc4d0... == pin
- schema/registry/compile-pipelines/scientist-intent-compile.yaml b47eee0c... == pin
- fixtures/roles-seam.yaml 37dbaabb... == pin; fixtures/missing-required-address.yaml 61f6ad87... == pin
- __records__/roles-seam.golden.json c0ba793e... == pin (UNCHANGED — the roles-seam
  golden's asserted behavior was not intentionally changed; its emitted event is a
  transfer, untouched by the aliquot wiring)
- __records__/missing-required-address.golden.json 0b78c911... == pin (UNCHANGED — the
  fixture carries NO targetWells, so the expander wiring cannot alter its 422 body)
- MANIFEST.yaml itself 6b5e23e9... (unchanged). golden.manifest.versions-current green.
Before/after hash diff: EMPTY. Zero goldens re-blessed; zero existing goldens changed.

## Verification (fix tip, all captured)
Cmd A targeted suite: cd server && npx vitest run src/compiler/scientistIntent/
src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/pipeline/passes/
-> Test Files 3 failed | 50 passed (53); Tests 8 failed | 491 passed (499).
Fail-file SET == baseline trio (AiPrecompileShapeMismatch.log 3, GeminiEmAppliancePath 1,
ProtocolRealizePass 4) — identical to the pre-fix capture /tmp/l2t1110-baseline-targeted.txt
(3/8). Test count grew 489 -> 499: the 10 new fix1 tests (8 rolesSeam + 2 golden spy)
are ALL green; no new failing file.
Cmd B: npx vitest run src/compiler -> 17 failed | 132 passed (149); 37 failed | 1267 passed
(1304). Fail-FILE set comm -3 vs /tmp/l2t0810-baseline-compiler-failfiles.txt: EMPTY (17/17).
npx vitest run src/ai -> 10 failed | 74 passed (84); 21 failed | 644 passed (665) == pin.
Cmd C: npx tsc -p . -> EXIT=2, 26 "error TS" lines / 6 files (AgentOrchestrator,
ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard, bootstrapAdmin, RecordStoreImpl).
Position-stripped sorted diff vs pin /tmp/l2t2230-tsc-server.txt: EMPTY — "TSC SET IDENTICAL TO PIN".
Cmd D: verbose run of the three SPINE-7 files: 24 tests, all ✓ (rolesSeam 14,
goldenRolesSeam 7, ResolveRolesSpine7Regression 3).
Chatbot chain: ResolveRolesSpine7Regression.test.ts green unchanged; producer key stays
wellRole-only; no ChatbotCompilePasses.ts edit.

## Assumptions recorded
- D1 option (b) is a consequence of the constraints (no source-side role consumer exists
  without touching ChatbotCompilePasses.ts or adding a hardcoded table); documented above.
- D2 array-carrier consumption is declared explicitly (not silent): it is the orchestrator's
  chosen wiring; baselines prove no shipped behavior regressed.
- The D3 spy classifies arms by ctx.args presence (engine adapter context vs resolve_roles
  fallback context) — verified against adapters.ts:190-224 and ChatbotCompilePasses.ts:2403-2413.

END REPORT: SPINE7_FIX1_COMPLETE
