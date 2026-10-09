1|# W2-3-PROTOCOL-SEMANTIC-UPGRADE — coder report (WIP, l2t1650)
2|
3|Branch: W2-3-lane2-l2t1650 @ base 7f4e751b (trunk tip; W2-1 merge cdfdc56c and W2-2 merge
4|796cfc0f both verified ancestors — `git merge-base --is-ancestor` output:
5|"W2-1 merge cdfdc56c IS ancestor" / "W2-2 merge 796cfc0f IS ancestor").
6|Worktree: /mnt/vast/home/brad/git/wt/W2-3-lane2-l2t1650 (bootstrapped 1:1 from TRUNK
7|untracked/ignored set: 66 links + 40 copies; `comm -3` of trunk-vs-worktree
8|`git status --porcelain -uall --ignored=matching` => EMPTY, 106/106 entries. server/schema
9|symlink points at THIS worktree's schema so the loader sees my edits).
10|
11|## 0. FIRST TARGETED CHECK (§4.2 step 1) — the relative-$ref probe, run BEFORE building
12|
13|Probe harness: scratch test (src/schema/ScratchProbe8L2t1650.test.ts, scratch-only, NOT
14|committed) injecting `intentProbe: {$ref: "./registry/constraint.schema.yaml"}` into
15|ProtocolStep.properties — the $id-space relative ref (protocol $id is
16|.../computable-lab/protocol.schema.yaml, constraint $id is
17|.../computable-lab/registry/constraint.schema.yaml, so `./registry/...` is the correct
18|$id-space relative form; `../../registry/constraint-vocabulary/...` from the FILE path
19|would resolve to .../computable-lab/registry/constraint-vocabulary/... which is NOT the
20|constraint $id — the composer's §0.1 note about file-path refs does not survive the
21|$id-keyed registry; the $id-space form is what SchemaRegistry.normalizeRef computes).
22|
23|Verbatim probe output:
24|
25|  whole-tree compile error: undefined
26|  whole-tree valid: true []
27|  constraint registered: true
28|
29|  partial-load harness (ProtocolPhasesSchema.test.ts-style loadSchemasFromContent with a
30|  FIXED 7-path list): addSchema/compile error: undefined, then validate threw:
31|  Error: can't resolve reference ./registry/constraint.schema.yaml from id
32|  https://computable-lab.com/schema/computable-lab/protocol.schema.yaml
33|  Serialized Error: { missingRef: '.../computable-lab/registry/constraint.schema.yaml',
34|  missingSchema: '.../computable-lab/registry/constraint.schema.yaml' }
35|
36|=> The whole-tree loader (integration.test.ts harness, the §4.2 designated probe) RESOLVES
37|the ref. The pre-existing PARTIAL-load harnesses (ProtocolPhasesSchema.test.ts,
38|CandidateMapperSchemaConformance.test.ts — fixed path lists that never load the constraint
39|datatype) would fail at Ajv compile if protocol.schema.yaml carries the ref. See §Open
40|questions OQ-A: this is the real §4.2 finding — not relative-vs-absolute, but
41|whole-tree-vs-partial-load.
42|
43|## 1. Baselines re-measured at claim base (pristine 7f4e751b, before any edit)
44|
45|- `npx vitest run src/schema src/lint` (from <wt>/server):
46|  Test Files  2 failed | 42 passed | 5 skipped (49)
47|  Tests  5 failed | 521 passed | 53 skipped (579)
48|  fail-file SET (/tmp/l2t1650-ff.txt): {src/schema/EventGraphEquipmentSchema.test.ts,
49|  src/schema/LabwarePhysicalGeometryData.test.ts} — EXACTLY the task's stated SET.
50|- server tsc: `npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
51|  => 26 lines; `comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1650-tsc-server.txt` => EMPTY.
52|- Seed lint baseline (scratch probe 6): all six prt-seed-* payloads lint with
53|  errors=0 warnings=0 rules=[] at base.
54|- Seed schema-validation baseline (scratch probes 2+5): AT BASE the six seed records do NOT
55|  all validate against protocol.schema.yaml as raw files: every one fails
56|  `unevaluatedProperties: $schema` (the store strips `$schema` — RecordParser.ts:45 /
57|  seedProtocols.ts:108 "the store validates the payload, which must not carry it"), and
58|  after stripping, 5 of 6 still fail (`Missing required property: ordinal` on steps;
59|  2 also fail `Unknown property: notes` on roles.labwareRoles[0]). Only
60|  prt-seed-biological-transfer validates. "Legacy inventory keeps validating exactly as
61|  today" therefore means: the same validation outcome as today (the seed legs that gate
62|  them — src/seeds/protocol.seed.test.ts, src/protocol/seedProtocols.test.ts,
63|  src/schema/SeedProtocolPhases.test.ts — parse/shape-test them, they do NOT Ajv-validate
64|  them; verified by reading all three). My change must not make any of them WORSE.
65|
66|## 2. Spec-premise correction discovered by probe (merged trunk wins — §7 AS-list)
67|
68|The composer's §0.1 load-bearing claim — "EVERY payload def is additionalProperties: false
69|(verified line list)" — is FALSE at merged trunk. Commit 7a85e479 ("Ralph iteration 1",
70|2026-04-27) REMOVED `additionalProperties: false` from ProtocolStep and from every step
71|payload def (git show 7a85e479 -- schema/workflow/protocol.schema.yaml proves the removals;
72|the stray blank line after `type: object` in each def is the residue). The composer read
73|the file at e830cffb but the claim was inherited from the older spec text.
74|
75|Consequence: the spec's §2.1(iv) reject mechanic ("unknown key `intent` fails every literal
76|branch -> zero oneOf matches") does NOT hold as drafted — an OPEN literal def tolerates the
77|unknown `intent` key, so an intent+literal step would match a literal branch AND the thin
78|intent branch -> oneOf "exactly one" fails for the WRONG reason, and a hidden unknown key
79|(e.g. `catalog`) on an intent step would slip through an open intent arm.
80|
81|Adaptation (data-only, additive, zero TS), proven by scratch probe
82|(server/scratch-probe4.mjs, verbatim tail in §5 below):
83|- each of the 8 literal payload defs gains ONE added element `not: {required: [intent]}`
84|  (additive line; existing lines byte-unchanged) — an intent-carrying step can NEVER match
85|  a literal arm;
86|- the 9th oneOf member `$defs/IntentStep` is CLOSED (`additionalProperties: false`) with the
87|  envelope keys listed as pass-through `{}` properties + `intent: $ref IntentStepPayload` —
88|  closure of the intent arm is what rejects hidden unknown keys (probe case D: `catalog`
89|  named in the Ajv error);
90|- arm 3 (if intent -> not anyOf[16 literal keys]) kept as the actionable-error arm (probe
91|  case C names `volume_uL` via additionalProperties + the `not` fires).
92|Legacy openness is UNCHANGED (probe case F: legacy step + unknown key still valid — the
93|trunk behavior today is preserved byte-for-byte).
94|

## 3. What was built (all data; zero production TypeScript)

A — `schema/workflow/protocol.schema.yaml` (additive; 217 added lines, ONE removed line =
the sanctioned branch_axes description append):
- `ProtocolStep.properties.intent: {$ref: "#/$defs/IntentStepPayload"}` (the discriminator slot).
- `$defs/IntentStepPayload` — additionalProperties:false, required:[semanticVerb];
  semanticVerb REUSES the existing `$defs/SemanticVerbRef` (no new verb noun, no enum);
  `materialNeeds[]` {need (symbolic roleId), capabilityRequirement (allOf ref datatype +
  oneOf equipment-capability record ref | `^CL:` ontology id — mirrors constraint.schema.yaml's
  shape, no new prefix), quantityConstraint ($ref constraint datatype)}; `constraints[]` and
  `provenance[]` as above; `intentNotes` prose.
- `$defs/StepProvenanceRef` — record ref constrained {kind: const record, type: const
  vendor-protocol-candidate} + candidate-side anchors (pageStart/pageEnd/sectionId/
  spanStart/spanEnd), allOf $ref ./datatypes/ref.schema.yaml. RUNG-AGNOSTIC: no provenance
  rung field (W2-4's admission — see Open questions).
- Discriminator arms in `ProtocolStep.allOf`: arm 1 = the existing oneOf over the 8 literal
  payload defs EXTENDED with a 9th member `$defs/IntentStep` (CLOSED envelope,
  additionalProperties:false, envelope keys by JSON-pointer $ref to ProtocolStep — DRY, no
  duplicated envelope); arm 2 = `if: {required:[intent]} then: {not: {anyOf:[16 literal
  keys]}}` (actionable-error arm, not load-bearing).
- Each of the 8 literal payload defs gains `not: {required: [intent]}` (adaptation proven by
  probe — §2).
- `branch_axes` description: the single appended sentence naming the declared data flow.
- `variants` / `protocolLayer`: NO structural change (D1 "kept whole").

B — `schema/workflow/protocol.lint.yaml` (4 rules appended after R3; R1-R3 and the trailing
"Remaining intended rules" comment block byte-unchanged):
- `legacy-literal-bounded` (ERROR): when all[equals protocolLayer universal, not(in recordId,
  <the six seed ids as lint YAML DATA>)] -> everyItem(steps) nonEmpty intent.
- `legacy-inventory-no-intent-drift` (WARNING): when in recordId <the six ids> ->
  everyItem(steps) not(nonEmpty intent).
- `intent-step-provenance-visible` (WARNING): when nonEmpty steps[*].intent ->
  everyItem(steps) any[not(nonEmpty intent), nonEmpty intent.provenance].
- `intent-verb-ref-declared` (ERROR): everyItem(steps) any[not(nonEmpty intent),
  nonEmpty intent.semanticVerb] (belt-and-braces over the schema's required:[semanticVerb]).
The frozen pre-upgrade inventory lives ONLY here, as lint YAML data (proven: §6 hardcode grep).

C — `schema/workflow/protocol.ui.yaml`: one additive `form.sections` entry "Intent" with four
readonly display hints ($.steps[*].intent.{semanticVerb,materialNeeds,constraints,provenance},
widgets ref/array from the ui-v1 enum). NO widget change, NO app code change: the existing
custom `protocol-step-roles` taptab widget remains the renderer of $.steps (it round-trips
unknown keys via {...step} spreads, so intent steps already render).

D — `schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml` (NEW data doc,
crosswalk precedent): declares the PDT-axes -> branch_axes flow — field_map (axisId passthrough,
question->label, conditions pass through the SHARED BranchCondition datatype,
shared_stepIds passthrough), not_carried [choiceKey, origin, evidence, sectionId] (they stay on
the PDT record), predicate_rebinding (`$.branchSelection.<axisId>`, implemented by the EXISTING
deriveDecisionTree.ts:9-13 / deriveBranchAxes.ts — named, not written), scaleAxis carried:false
(D9: scale is answered at realization, W2-7). `kind: branch-axis-mapping` is NOT in the
crosswalk's forbidden_kinds list and is not a *.schema.yaml (SchemaLoader discovery skips it).

Tests (mine, the only .ts edits): `server/src/schema/Wave2ProtocolIntentSchema.test.ts` (15),
`server/src/lint/Wave2ProtocolIntentRules.test.ts` (19).

## 4. Acceptance criteria — clause-by-clause disposition (VERBATIM clauses)

| clause | proof | result |
|---|---|---|
| "fixture family with intent steps passes schema+lint" | T1(b) intent family validates; T2(d) same fixture yields ZERO errors | GREEN |
| "the same content with a hidden literal volume/catalog field inside an intent step is REJECTED" | T1(c) volume_uL rejected, T1(d) catalog rejected, T1(e) full literal payload rejected, T1(f) hidden literal even when the step ALSO matches a literal arm (kind other + description + catalog) rejected, T1(g) the error names the literal key path | GREEN (rejection + actionable naming) |
| "each legacy inventory record still validates unchanged" | T1(a) pins each of the six records' EXACT base outcome (valid flag + sorted error-key multiset) — identical before/after; T2(b) all six lint with zero findings; §1 documents that raw-Ajv seed validation already fails at base for 5/6 (store strips $schema; missing ordinal) and my change did not worsen any outcome | GREEN (no new failure, no changed outcome) |
| "a NEW literal protocol is rejected by the legacy-bounds lint" | T2(a) fires `legacy-literal-bounded` naming recordId + step ids; T2(a2) MIXED protocol also rejected (OQ1 strict form); T2(a3) fully intent-bearing new protocol passes | GREEN |
| "branch_axes accepts a PDT-derived axis fixture" | T1(h) validates at condition.schema.yaml#/$defs/BranchAxis datatype level; T1(i) validates inside the full protocol record; T3 doc declares the flow | GREEN |
| "app+server typecheck clean (schema is data — consumers untouched)" | server tsc 26 lines, comm EMPTY vs pin; app tsc 34 lines, comm EMPTY vs pin; zero production TS (§6) | GREEN at the pinned baselines (non-zero exit by design) |
| "Keep branch_axes/variants/protocolLayer: universal semantics" | diff: only the branch_axes description line changed; variants/protocolLayer untouched | GREEN |
| "declare PDT-axes -> branch_axes data flow" | file D | GREEN |
| "UI spec so the intent shape renders" | file C + T3 arm: the edited spec loads through the REAL UISpecLoader with zero validation errors and the Intent section + exact 4 paths | GREEN |

Every new lint rule has a FIRING negative fixture asserting the exact rule id:
legacy-literal-bounded (T2 a, a2), legacy-inventory-no-intent-drift (T2 e),
intent-step-provenance-visible (T2 h), intent-verb-ref-declared (T2 i).

## 5. RED-first record + probe evidence

RED run before the schema/lint edits (both new test files, verbatim tail of
/tmp/l2t1650-red.txt):
  Test Files  2 failed (2)
  Tests  19 failed | 14 passed (33)
(the 14 early passes were the arms that only read base state — T1(a) legacy pin, the seed-lint
silence arms, the W2-2 vocabulary/registration arms; the 19 failures are the intent arms the
schema+lint edits then turned green.) After the edits: 15 + 19 = 34 passed, 0 failed
(the 34th test is the T3 UI-load arm added after the RED capture).

Discriminator probe (scratch, not committed) verbatim arms:
  (b) legacy valid: false [...oneOf@/steps/0...]      <- probe harness fixture was itself a
      deliberately-bad step (no wells); the T1(a) pin test is the authoritative legacy proof
  (b) intent valid: false [... additionalProperties@/steps/0 Unknown property: intent ...]
  (b) hidden volume_uL valid: false [... Unknown property: volume_uL ...]
  (b) hidden catalog valid: false [... Unknown property: catalog ...]
  (b) intent w/o semanticVerb valid: false [... required@/steps/0/intent Missing required
      property: semanticVerb]
  (b) verb ref type=material valid: false
  (c) frozen fixture findings: ["legacy-literal-bounded"] Protocol 'PRT-r1-dangling'...
=> the rejection mechanic works and NAMES the offending key.

Relative-vs-absolute $ref probe (OQ3(3) resolution): the whole-tree loader resolves the
$id-space relative ref `./registry/constraint.schema.yaml` (probe 8: "whole-tree compile error:
undefined / whole-tree valid: true [] / constraint registered: true"), but the three
pre-existing PARTIAL-load harnesses throw
"can't resolve reference https://computable-lab.com/schema/computable-lab/registry/constraint.schema.yaml"
(probe 10(a), verbatim in §0). I therefore mounted by ABSOLUTE $id
`https://computable-lab.com/schema/computable-lab/registry/constraint.schema.yaml`
(pre-approved fallback) — the resolution failure mode is identical either way, and absolute
$id is what SchemaRegistry.normalizeRef produces for cross-directory refs anyway.

## 6. Gates — verbatim tails (all run in MY worktree)

PRIMARY SCOPE SET (`cd <wt>/server && npx vitest run src/schema src/lint`):
  Test Files  2 failed | 44 passed | 5 skipped (51)
  Tests  5 failed | 555 passed | 53 skipped (613)
  fail-file SET: src/schema/EventGraphEquipmentSchema.test.ts
                 src/schema/LabwarePhysicalGeometryData.test.ts
  comm -3 /tmp/l2t1130-failfiles-schema-lint.txt <claim-set> => EMPTY (COMM_EXIT=0)
  claim-base re-measure: Test Files 2 failed | 42 passed | 5 skipped (49);
  Tests 5 failed | 521 passed | 53 skipped (579) => same 2-file SET, 5 failed tests.
  My tests ADD 34 passing tests and add ZERO failing files.

server tsc (`npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`):
  26 /tmp/l2t1650-tsc-server-final.txt
  comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1650-tsc-server-final.txt => EMPTY (COMM_EXIT=0)
  (non-zero exit by design — never demanded green)

app tsc: 34 /tmp/l2t1650-tsc-app.txt; comm -3 /tmp/l2t2230-tsc-app.txt => EMPTY (APP_COMM_EXIT=0).
  I touched NO app/ file; the app gate is the proof of that.

FULL SUITE (`npx vitest run`, whole server) base vs post:
  base: Test Files 92 failed | 558 passed | 9 skipped (659); Tests 113 failed | 5088 passed | 68 skipped (5439); Errors 2
  post: Test Files 91 failed | 556 passed | 9 skipped (656); Tests 113 failed | 5113 passed | 68 skipped (5464); Errors 2
  fail-file SET diff: base contained src/schema/ScratchProbe8L2t1650.test.ts (my own scratch
  probe, since deleted); otherwise IDENTICAL. Failed-test count identical (113), unhandled
  errors identical (2, both pre-existing AgentOrchestrator golden mock rejections).

Legacy inventory tests (run before and after):
  src/seeds/protocol.seed.test.ts 11 passed; src/protocols/seedProtocols.test.ts 2 passed;
  src/schema/SeedProtocolPhases.test.ts 30 passed; src/registry/ProtocolSpecRegistry.test.ts 3
  passed; src/compiler/pipeline/passes/ExpandProtocol.test.ts 12 passed;
  src/compiler/pipeline/fixtures/ProtocolRegistry.test.ts 1 passed;
  src/compiler/pipeline/TerminalArtifactsShape.test.ts 3 passed.
  The two registry protocol-SPEC docs (schema/registry/protocols/zymo-magbead-minimal.yaml,
  test-wash-protocol.yaml) are byte-unchanged (diff EMPTY) and their tests pass.

Contract-only proofs:
  git diff --name-only 7f4e751b -- server/src app | grep -v '\.test\.ts$' => EMPTY (zero production TS)
  git diff --name-only 7f4e751b -- records/ schema/registry/protocols/ => EMPTY
  git diff 7f4e751b -- server/src | grep -inE 'zymo|prt-seed|volume_uL|catalog' (excluding my
    Wave2* test files) => EMPTY (inventory lives in lint YAML only)
  git diff -- schema/workflow/protocol.schema.yaml | grep '^-' => exactly ONE removed line:
    the branch_axes description (the sanctioned append). 217 added lines.
  W2-2 test files (Wave2Quantity*.test.ts, Wave2ConstraintVocabularyRules.test.ts) untouched and
  green (33 + 19 passed). lint-v1.schema.yaml, LintEngine.ts, MANIFEST.yaml, scientist-intent/**,
  amount/concentration/reference-ratio datatypes, records/**: untouched.

## 7. diff --name-only (base 7f4e751b -> HEAD)

  schema/workflow/protocol.lint.yaml
  schema/workflow/protocol.schema.yaml
  schema/workflow/protocol.ui.yaml
  schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml
  server/src/lint/ProtocolLintRules.test.ts
  server/src/lint/Wave2ProtocolIntentRules.test.ts
  server/src/schema/CandidateMapperSchemaConformance.test.ts
  server/src/schema/ProtocolPhasesSchema.test.ts
  server/src/schema/ProtocolProseFieldsSchema.test.ts
  server/src/schema/Wave2ProtocolIntentSchema.test.ts
  .hermes/plans/W2-3-report.wip-l2t1650.md

## 8. Forced deviations from the spec's §6 contract-only grep (evidence-backed)

The spec's §6 grep allows only protocol.{schema,lint,ui}.yaml, branch-axis-mapping/,
wave2-naming-crosswalk.yaml, my two new test files, and .hermes/plans/. I additionally touched
FOUR existing test files. Both deviations are forced by the binding SET-identity gate and by an
internal contradiction in the spec; neither touches production code or W2-2 artifacts.

(1) ProtocolPhasesSchema.test.ts / CandidateMapperSchemaConformance.test.ts /
    ProtocolProseFieldsSchema.test.ts — 5 added lines each (3 path-list entries + 2 comment
    lines). These harnesses call loadSchemasFromContent with a FIXED path list and load
    protocol.schema.yaml. Once IntentStepPayload $refs the constraint datatype, Ajv throws
    "can't resolve reference .../registry/constraint.schema.yaml" for those harnesses: 13 new
    failing tests across the three files (verbatim FAIL list captured at /tmp/l2t1650-post-suite.txt),
    which would have BROKEN the fail-file SET gate. The edit mirrors the schema's dependency
    closure in the harness path list (the same pattern SchemaLoader's whole-tree walk provides).
    Alternative considered and rejected: dropping the $ref mount and re-declaring constraint
    bounds inline — that would duplicate W2-2's validator (a forbidden second validator) and
    violate the architecture of record. The mount is exactly what W2-2 §2.3 reserved for W2-3.
    After the edit all three files are GREEN (14 tests passed).

(2) ProtocolLintRules.test.ts — the frozen pin `activates only the three role-integrity rules`
    asserts spec.rules.map(id) toEqual EXACTLY the three R1-R3 ids. Spec §2.2 mandates adding
    four rules to the SAME file. The two cannot both hold. I extended the pin list to the full
    declared set (7 ids) with a W2-3 comment, keeping R1-R3 ids/severities asserted unchanged.
    Evidence: the pin's own text and spec §2.2's "ADD these rules ... existing R1-R3 untouched".
    The file's other 41 tests are untouched and green (42 passed).

## 9. Open questions

OQ-A (for the orchestrator/architect): the three partial-load harnesses encode the schema's
dependency closure in a hardcoded path list. Any future cross-directory $ref from
protocol.schema.yaml will break them the same way. A loader-provided closure (or a shared
harness helper) would remove this recurring trap. I did NOT build one (out of scope, and it
would touch loader code).

OQ-B (recorded lint gap, spec §8.5 confirmed by probe 12): intent materialNeed role closure is
NOT mechanically expressible in the current lint DSL — PathResolver supports only single-`[*]`
projections, so `steps[*].intent.materialNeeds[*].need` cannot be selected (double-`[*]`
returns nothing; allIn over it silently yields zero values, i.e. a vacuous pass). My T2 arm
`intent materialNeed role closure is NOT mechanically expressible` pins this as a known gap
rather than shipping a rule that can never fire. Closing it needs a PathResolver capability
(LintEngine.ts is OFF LIMITS to me).

OQ-C (rung names NOT spent): I did NOT mint VENDOR / DERIVED / INFERRED_INVARIANT /
LOCAL_REALIZATION anywhere. StepProvenanceRef is deliberately RUNG-AGNOSTIC (it names WHERE the
evidence lives, not what rung it is). The temptation to add a `provenanceRung`/`origin` field on
intent provenance (which would read naturally as VENDOR) was declined; the crosswalk lists all
four rungs as new-vocab-pending-admission under W2-4. If W2-4 wants rung-bearing provenance it
should extend StepProvenanceRef after admission.

OQ-D (registry freeze, OQ2 accepted): the two protocol-SPEC registry docs under
schema/registry/protocols/ are zod-validated registry docs, never records — no record-scope lint
can bound them. R-4's allowlist is therefore exactly the six records/seed/protocols ids, and the
registry surface is declared frozen for wave 2. No registry file was added to the allowlist.

OQ-E (crosswalk ADD-NOTHING): `intent` already exists in the crosswalk vocabulary; no new term
was needed and none was added. `branch-axis-mapping` is a doc `kind` value, not a record kind,
and is absent from forbidden_kinds. Flagging for the record: if the orchestrator prefers the doc
to carry no `kind:` key at all, that is a one-line change.

OQ-F (seed raw-validation debt, pre-existing, NOT mine): 5 of the 6 prt-seed records fail raw
Ajv validation against protocol.schema.yaml at base (missing `ordinal` on steps; `notes` on
roles.labwareRoles[0]), and all six carry `$schema` in the payload which the store strips before
validating. No test Ajv-validates them, so nothing gates this today. My T1(a) pins the exact
base outcomes so the debt cannot silently grow. Fixing the seeds is a records/** edit — OFF
LIMITS for this item.

## 10. Assumptions

- "Legacy inventory keeps validating exactly as today" = identical validation outcome per record
  (pinned multiset), not "all six pass" (they do not pass raw Ajv today either — §1).
- The frozen inventory is the six records/seed/protocols records ONLY; the two
  schema/registry/protocols docs are registry SPEC docs, not records (§9 OQ-D).
- Declarative envelope keys (settings, subGraphRef, executionMeta, executionPreference,
  methodRequirement, phase, phaseId, plannedOffset, isOptional) stay ALLOWED on intent steps per
  spec §2.1(iv); only vendor execution params are refused.
- protocolLayer: universal is the authored-protocol marker (what ProtocolExtractionService
  emits); the six seed records carry no protocolLayer, so R-4's `when` guard leaves them out
  without hardcoding a negative list.
- Fixture strings (record ids, verb ids, class ids, CL: ids) live only in my two Wave2* test
  files and in protocol.lint.yaml data — allowed by §6.
