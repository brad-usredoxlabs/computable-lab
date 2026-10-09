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
