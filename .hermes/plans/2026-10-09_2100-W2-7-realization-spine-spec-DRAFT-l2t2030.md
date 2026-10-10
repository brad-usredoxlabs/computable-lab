# W2-7-REALIZATION-SPINE — spec DRAFT (cl-spec-composer, 2026-10-09 ~21:00 EDT, token l2t2030)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes. COMPOSED PRE-DEPS: W2-3 merging now (fix-cycle 1 live), W2-4/W2-6 NOT merged. Every
bind to a W2-3/W2-4/W2-5/W2-6 shape is CONFIRM-AGAINST-MERGED-TRUNK (CAMT) and listed in §7.

## Goal (one sentence)

Realize the W2-6 family (universal `protocol` with intent steps) into a `local-protocol` whose
`branch_resolution` records the lab's answers (the robot, not the vendor format) as
LOCAL_REALIZATION choices, deterministically LOWER that pair to a scientist-intent YAML document
on the frozen 31-verb contract, and compile it through the EXISTING `scientist-intent-compile`
pipeline to a run graph — byte-identically on identical inputs, gating compilation on
capability/quantity/constraint checks that fail loudly, never silently.

## 0. TRUNK REALITY (every file:line opened first-hand this session at trunk tip b6f7095c /
code tip 7f4e751b, `git -c core.fileMode=false` throughout; W2-3 branch cites pinned at
c5b69a57 and marked CAMT(W2-3))

1. `schema/workflow/local-protocol.schema.yaml` (read in full, 203 lines): `unevaluatedProperties:
   false` (:11); `inherits_from` REQUIRED (:19, property :72-74 "the global protocol this
   realizes" -> `datatypes/ref.schema.yaml`); `variantRef` (:76-82); `branch_resolution` (:88-110):
   items `required: [ axisId, matched ]` (:94), `branchIds[]` = "Chosen branch ids
   (branch_axes[].conditions[].id / variants[].variantId)" (:103-106), `choices` an OPEN object
   `additionalProperties: true` described "The localization choices that produced this resolution
   (provenance)" (:107-110) — the LOCAL_REALIZATION carrier; `overrides.substitutions[]` carry
   `role` + `material_ref` + `rationale` (:148-160); plate-setting `labwares/equipment/materials`
   SetupRows with optional `ref` (:51-70, :189-203); `status` enum (:176-178). NO edit to this
   schema is needed or permitted by this item — `choices` is already expressive.
2. `schema/registry/compile-pipelines/local-protocol-compile.yaml` (read in full):
   `resolve_branch_axes` (:33-36), `expand_local_customizations` (:38-41),
   `project_local_expanded_protocol` (:43-46). REUSE; no new pipeline file.
3. `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.ts` (read in full): blocks with
   `BRANCH_RESOLUTION_MISSING` when the canonical declares branch_axes and the LPR carries no
   branch_resolution (:57-63 no-axes back-compat, :68-81 the block); reads the ALREADY-resolved
   entries via `activeStepIdsForResolution` (:83).
4. `server/src/protocol/BranchResolver.ts` (read in full): `resolutions.push({ axisId, matched,
   branchIds })` (:133); an axis whose conditions match nothing -> `ok:false` + gap "provide a
   choice that matches a declared branch" (:136-142) — THE unresolved-required-axis fail-loud,
   already shipped; `BranchResolutionEntry { axisId, matched, branchIds? }` (:153-158) — note it
   carries NO `choices` field; the compiler leg is choice-blind.
5. `server/src/compiler/protocol/ProtocolCompiler.ts`: writes `branch_resolution` entries WITHOUT
   choices (:710-714, `axisId/matched/branchIds` only, sourced from `resolveBranchAxes()` at
   :400) — so the choices-carrying realization write is NOT this leg's. The CHOICES precedent is
   `server/src/api/handlers/IntentAcceptHandlers.ts`: `POST /intent/accept` (:121) builds
   `branch_resolution: Object.entries(body.answers).map(([axisId, chosenValue]) => ({ axisId,
   matched: true, branchIds: [chosenValue], choices: { [axisId]: chosenValue } }))` (:77-82) —
   raw values in `choices`, no rung marker yet (W2-4 owns the rung; W2-7 upgrades the SHAPE per
   merged W2-4 vocabulary, OQ2).
6. `server/src/compiler/scientistIntent/compileScientistIntent.ts` (read in full): loads
   `scientist-intent-compile.yaml` (:76-79); REQUIRES an injected store-backed spine —
   registration THROWS without `deps.spine` (:140-147, "NO degraded no-resolution mode"); the
   SPINE-4 bar returns `outcome:'needs-clarification'` with ZERO artifact slots atomically
   (:249-268). The production composition is `POST /intent/compile`
   (`server/src/api/handlers/IntentCompileHandlers.ts` — `createResolveSpineFromContext` at
   :59-62, `compileScientistIntent(doc, …)` at :96, route registration :119; wired at
   `server/src/server.ts:1510-1511`). `POST /intent/compile-from-prompt`
   (`IntentCompileFromPromptHandlers.ts:320`) is the LLM route — NOT this item's.
7. `schema/registry/compile-pipelines/scientist-intent-compile.yaml` (read in full, 99 lines):
   `ai_precompile` seeded by `normalizeScientistIntent` (:13-15), `resolve_nouns` SPINE-4 bar
   (:22-25), lowering/expansion/labware/roles/volumes/resources/deck/lab-state/run-files/validate
   (:27-99). It does NOT include `derive_execution_scale_plan` — that pass exists ONLY on
   `chatbot-compile.yaml` (:139). And this YAML is a goldens treeState pin
   (`goldens/MANIFEST.yaml:11`; `replayKernel.ts` `manifestHashMismatches` re-hashes it and fails
   LOUD on drift, :376-384). => For W2-7 the scientist-intent pipeline is FROZEN: zero pass-list
   edits (§No-bypass and §bait both lean on this).
8. `schema/workflow/scientist-intent.schema.yaml`: `additionalProperties:false` (:10), required
   `[intentId, actions]` (:12-14), `$defs/actionVerb` the 31-verb enum (:22-…), actions carry
   SYMBOLIC labels never resolved ids (description :6-9). `parseScientistIntent.ts` validates it
   with Ajv sole authority + machine verb-enum injection from the vocabulary (:43-60).
9. `schema/registry/wave2-verb-adjudication.yaml`: the ONE adjudication table —
   `count: 31` (:21), `mirror_count: 31` (:23), `same_operation` EXACTLY 3 entries
   incubate/read/shake (:44-55), `protocol_semantic_only` 7 verbs NEVER lowered
   (:57-73, findings F1/F2), `enum_only` 28 verbs with no verb-definition record — seed, mix,
   transfer, wash, elute, spin, pellet, aliquot, harvest, serial_dilution, … (:74-103),
   findings F1-F6 (:105-129). FROZEN contract: W2-7 mints no verb anywhere.
10. `server/src/compiler/protocol/ProtocolCompiler.ts` contains NO `intent` handling (grep
    `intent` over the file at trunk: zero matches) — literal-compile cannot consume intent
    steps. §No-bypass proof anchor.
11. `schema/registry/execution-scale-profiles/robot-assist-plus-96.yaml` (read in full):
    `sourceLevel manual_tubes -> targetLevel robot_deck` (:7-8), `prompt_cues` incl. robot/deck/
    assist (:11-18), `sampleLayout` 96_well_plate `lbw-def-generic-96-well-plate` (:21-25),
    `reagentSource` 1_well_reservoir trough (:26-31), `pipetting` 8-channel parallel,
    `maxVolumeUl: 20`, `requiredTools: [pipette-capability/p20-multi-8]` (:32-40), `deckBinding`
    platform `integra_assist` + requiredLabwareDefinitions + requiredTools (:41-47). Loaded by
    `server/src/registry/ExecutionScaleProfileRegistry.ts` (DIR :86, zod levels/platforms
    :11-25, `maxVolumeUl`/`requiredTools` optional :67-68, :73). Tool data exists:
    `schema/registry/pipette-capabilities/p20-multi-8.yaml:2-4`. CAMT-AT-CLAIM: whether
    `createPlanDeckLayoutPass` consumes profile data (unverified by composer; §OQ4 assumes it
    does NOT and keeps the profile consumption in W2-7's own gate, not in the pipeline).
12. `schema/registry/constraint-vocabulary/constraint.schema.yaml`: required `[class,
    bindingKind]` (:30-32); `bound` oneOf Quantity|QuantityRatio (:44-52); symbolic `subject`
    with composed `dimensionKey` + `bindingPolicyKey` (:56-97, dimension-preservation law as
    DATA); `bindingKind` enum `[vendor_default, hard_bound]` (:91-98) — SPINE-8's strictness
    seam; `overridePolicy` ref (:101-107); `capabilityRequirement` on the EXISTING
    equipment-capability machinery, `ECP-`/`EQC-` record ref or `CL:` CURIE (:109+, bead-beater
    arm `CL:bead_beater`). `server/tsconfig.json`: `exactOptionalPropertyTypes` +
    `noUncheckedIndexedAccess` ON (:13-14).
13. `schema/core/datatypes/quantity.schema.yaml` (W2-2 MERGED, 796cfc0f): required
    `[value, unit, dimension]` (:33); per-dimension CONTROLLED unit sets enforced by native
    if/then cross-enforcement (description :6-9) — dimension `count` with unit `uL` is a
    SCHEMA error. count-vs-volume conflation therefore fails at Ajv, never in a TS branch.
    `constraint-vocabulary.yaml`: strictness seam as data (:188, :208, :220 policyBindingKeys
    membership; class defaults :225-233; profiles :239).
14. `schema/workflow/protocol.schema.yaml` at TRUNK: `ProtocolStep` (:749), literal `kind` enum
    `[ add_material, transfer, mix, wash, incubate, read, harvest, other ]` (:773),
    `SemanticVerbRef` (:669-685) — verified it declares NO `required:` list, so `ref` is
    OPTIONAL and `canonical: string` exists (:680-681) — the adjudication seam; `branch_axes`
    (:294-298) PDT-derived per `schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml`
    (present in HEAD's tree; header: registry-style DATA doc, "adds no code and no policy").
15. W2-3 INTENT ARM — CAMT(W2-3), pinned at branch c5b69a57 (fix-cycle 1 live): `$defs/IntentStep`
    (branch :903-935, "realization answers belong to local-protocol (W2-7/D9)" verbatim),
    `IntentStepPayload` (branch :936-1011): required `[semanticVerb]`, `materialNeeds` with
    `capabilityRequirement` (CL:bead_beater arm) + `quantityConstraint` ($ref constraint
    datatype), `constraints[]` (constraint datatype), `provenance[]` -> `StepProvenanceRef`
    (branch :1013-1052, RUNG-AGNOSTIC, type-const vendor-protocol-candidate only),
    `protocol.lint.yaml` R-7 `intent-verb-ref-declared` (branch :235-259). The fixture discipline
    is W2-3 spec §2.3: semanticVerb ref to a REAL seed verb-definition id, "canonical mirror per
    wave2-verb-adjudication (3/7/28 partition… NEVER heat/set/shake/spin/pellet)".
    `server/src/schema/Wave2ProtocolIntentSchema.test.ts` (branch) builds `verbRef(id, canonical)`
    (:56) — canonical IS carried alongside the ref. => the family's intent steps name their verb
    BOTH ways; the lowerer adjudicates the canonical (§2.1).
16. `schema/workflow/protocol-decision-tree.schema.yaml`: `axes` (:50-…), predicates target
    `$.branchSelection.<axisId>`, `choiceKey` shared `'branchSelection'` namespaced by axisId
    (:53-75) — the family QUESTIONS; lab answers fill `branchSelection`.
17. `server/src/lint/LintEngine.ts`: record scope ONLY (:126-135) — cross-record closure
    (axisId exists on the family, branchIds are family ids) is structurally impossible in lint;
    W2-7's compiler gate is the ONLY place it can live (it resolves `inherits_from` anyway).
18. `schema/workflow/local-protocol.lint.yaml` EXISTS with ZERO rules (header comment only) —
    W2-4 activates it (`prov-local-choices-recorded` ERROR on matched-without-choices,
    W2-4 draft §2.6 :503-516; CAMT(W2-4)). W2-7 does NOT add rules there; it must SATISFY them.
19. `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts`:
    `createDeriveExecutionScalePlanPass` (:3039+), cue gate `EXECUTION_SCALE_PROMPT_CUES`
    (:2777, :3045) — cue-driven, chatbot-route only; the GUESSED DEFAULT: robot_deck + valid
    profile + no sample count -> silently defaults to 8 samples first column (:3087-3101) with
    an `assumptions` note, vs `missing_sample_count` blocker elsewhere (:3102-3109);
    `maxProfileVolume = profile?.pipetting.maxVolumeUl ?? 20` (:3146). W2-7 does NOT touch this
    file (shared chatbot product); the guessed-default fail-loud is enforced UPSTREAM of it
    (§2.2 gate R3).
20. Goldens discipline: `goldens/MANIFEST.yaml` + `replayKernel.ts` — fixtures/records re-hashed,
    drift fails LOUD (:376-384). This item NEVER touches `goldens/` (MANIFEST constraint); its
    golden lives in its OWN test file with inline fixtures (W2-3 spec §2.3 precedent "lives in the
    tests, not in records/").
21. W2-6's OUTPUT (my input; CAMT(W2-6)): a kind-`protocol` record, `protocolLayer: universal`,
    intent steps, server-bound `branch_axes` via `deriveBranchAxes`/`deriveStepVariantAxes`
    (W2-6 draft :215-217), question-asking deferred to realization (W2-6 draft :184). I do NOT
    pin W2-6 internals; my interface is the family RECORD shape at trunk.

## 1. SCOPE / NON-SCOPE

IN scope:
- ONE registry-style DATA doc (§2.2): the realization policy — required answers, axis->profile
  binding, capability closure, substitution-adjudication posture. Business rules live HERE.
- ONE new TS module + ONE small runner (§2.1, §2.3): deterministic lowering/emission + the gates
  that READ the data. This is the ONLY legitimate new TS (lowering/emission logic).
- Test files (§4): the RED-first realization suite + the headless golden (own fixtures inline).

OUT of scope (explicit):
- `schema/**` EDITS: zero. `local-protocol.schema.yaml` `choices` is already open (:107-110); the
  rung vocabulary is W2-4's files; the intent arm is W2-3's. If claim-time reality demands an
  additive schema edit, it is a HAND-OFF SEAM declared in the report, not this item's diff.
- `schema/registry/compile-pipelines/*.yaml`: zero edits (scientist-intent-compile.yaml is a
  treeState pin; local-protocol-compile.yaml already has every pass needed).
- `records/**`, `schema/knowledge/**`, `goldens/**` (incl. MANIFEST): untouched, per constraint.
- `schema/workflow/scientist-intent.schema.yaml`, `scientist-intent-vocabulary.yaml`,
  `wave2-verb-adjudication.yaml`: untouched — FROZEN contract, FROZEN adjudication.
- `app/**`, `schema/**/*.ui.yaml`: zero (headless item; NO browser gate).
- `ChatbotCompilePasses.ts`, `ProtocolCompiler.ts`, `BranchResolver.ts`, goldens harness:
  untouched (reused as-is).
- No new record kinds, NO third IR (scientist-intent YAML IS the existing IR; family = `protocol`,
  realization = `local-protocol` per D1), no new route family, no endpoint additions (the emitted
  document rides the existing `POST /intent/compile`).
- No new verbs, no rung re-mint (VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION strings are
  W2-4's vocabulary — W2-7 consumes, never re-declares).
- W2-8's UI, W2-10's model matrix, W2-11's E2E demo: not here.

## 2. DESIGN — declarative-first

### 2.1 THE LOWERING (new TS, justified: deterministic emission is not expressible in lint/schema)

`server/src/compiler/scientistIntent/realizeScientistIntent.ts` (NEW) — a PURE function, no IO,
no clock, no uuid (byte-identical determinism is a structural property, not a test wish):

    lowerRealization(input: {
      family: ProtocolPayloadLike;          // W2-6's universal protocol (intent steps, branch_axes)
      realization: LocalProtocolPayloadLike; // local-protocol (inherits_from, branch_resolution,
                                             // overrides, labwares/equipment/materials SetupRows)
      policy: RealizationPolicy;            // loaded from §2.2 data
      verbAdjudication: VerbAdjudication;   // loaded from wave2-verb-adjudication.yaml
      scaleProfile?: ExecutionScaleProfileRecord; // from ExecutionScaleProfileRegistry by id
    }): { intentYaml: string } | { failures: RealizationFailure[] }

Pipeline of the lowering, each step fail-loud with a stable machine code (never a guess):
- L1 BIND: `realization.inherits_from.id === family.recordId` else
  `REALIZATION_INHERITS_MISMATCH` (LintEngine.ts:126-135 is why this cross-record check lives
  here).
- L2 BRANCH GATE: reuse the SHIPPED leg — run `resolve_branch_axes` semantics over
  `family.branch_axes` x `realization.branch_resolution` via
  `activeStepIdsForResolution` (BranchResolver.ts:159); a `matched:false` or missing entry for a
  declared axis -> the existing unresolved-axis gap text path (BranchResolver.ts:136-142 /
  ResolveBranchAxesPass.ts:68-81) surfaced as `REALIZATION_BRANCH_UNRESOLVED` naming the axisIds
  and the question (`family.branch_axes[axisId].label`). Never a default branch.
- L3 ANSWER CLOSURE (guessed-default bar): every answer the §2.2 policy declares REQUIRED for the
  bound scale profile (sample count, plate role, reagent source) must be present in
  `branch_resolution[].choices` / SetupRows WITH a LOCAL_REALIZATION carrier (OQ2 shape, per
  merged W2-4) else `REALIZATION_ANSWER_MISSING` naming the answer + where to answer it. This
  bars BEFORE the pipeline, so the chatbot guessed default (:19 above, :3087-3101) can NEVER fire
  on a W2-7 realization without the answer having been recorded.
- L4 CAPABILITY GATE: every `materialNeeds[].capabilityRequirement` on surviving intent steps +
  every `requiredTools`/`requiredLabwareDefinitions` of the BOUND scale profile (§0.11) must be
  satisfied by the realization's `equipment`/`labwares` SetupRows (`ref` present, kind matches)
  else `REALIZATION_CAPABILITY_MISSING` naming role + capability (e.g. "pipette-capability/
  p20-multi-8 for the robot_deck profile; answer the equipment role" / the `CL:bead_beater` arm
  when a branch's `then_resourceRefs` survived selection). Substitution ADJUDICATION posture:
  a `overrides.substitutions[]` entry against a `hard_bound` constraint whose vocabulary
  `overridePolicy` disallows it (bindingPolicyKey membership, constraint-vocabulary
  :220/:225-233) -> `REALIZATION_SUBSTITUTION_DISALLOWED` citing class + bindingKind + policy id;
  `vendor_default` under a declared permissive policy passes, recorded. All membership is data
  lookups — zero verb/class/policy lists in TS.
- L5 ADJUDICATE + EMIT: for each surviving intent step, resolve the action:
  `intent.semanticVerb.canonical` MUST be a member of the 31-verb enum
  (via `defaultScientistIntentVocabulary()` / the adjudication table's `scientist_intent_enum` —
  the enum_only 28 need no mapping; the 3 `same_operation` canonicals map via
  `scientist_intent_action`; the 7 `protocol_semantic_only` canonicals and every unmappable verb
  -> `REALIZATION_VERB_UNADJUDICATED` (never heat/set/shake-as-mix silent folding — findings
  F1-F4 terrain). Symbolic `need` roles become scientist-intent SYMBOLIC labels (source/target/
  labware/material strings — the contract's own idiom, §0.8); typed constraint bounds that carry
  scientist-intent-representable parameters (volumes/durations/cycles as Quantity in the declared
  dimension) ride as natural-language-or-numeric params (actions' shape, scientist-intent
  schema §0.8); parameters an intent step declares that have NO scientist-intent representation
  and NO realization answer -> `REALIZATION_ANSWER_MISSING` (a dropped constraint is silent data
  loss — SPINE-7 fix1/D1 doctrine). Scale-profile labels (96-well plate def, trough, 8-channel
  p20) enter the emitted SYMBOLIC labels declaratively from the profile data (§0.11), so the
  frozen pipeline resolves them downstream unchanged.
  Emission: build a plain JSON object with a FIXED key insertion order, `yaml.stringify` it —
  determinism by construction.
- L6 VALIDATE-IN-PLACE: run the emitted string through the REAL `parseScientistIntent` (Ajv sole
  authority, §0.8) before returning; a validation failure is a lowering BUG, reported as
  `REALIZATION_EMISSION_INVALID` with the Ajv errors verbatim (never a repaired re-try).

Production route (no new endpoint): the emitted YAML is an ordinary scientist-intent document —
`POST /intent/compile` (IntentCompileHandlers.ts:119) consumes it through the unchanged
parse + spine composition (:59-62) + `compileScientistIntent`. W2-7's golden calls
`compileScientistIntent` directly with the SAME production spine composition (headless; the
route is verified unchanged, not re-wired).

### 2.2 THE REALIZATION POLICY (new DATA, justified: "business rules in YAML" canon)

`schema/registry/realization/robot-realization.policy.yaml` (NEW) — registry-style pure DATA doc,
`branch-axis-mapping` precedent (§0.14: kind is a plain data field, NOT a `*.schema.yaml`, NOT a
record kind, NOT a crosswalk forbidden_kind):
- `scaleBindings:` lab choice value `robot` (the family's labware-format axis answer — "neither
  spin column nor plate — the robot") -> `scaleProfileId: robot-assist-plus-96`; the profile's
  OWN `matching.prompt_cues`/`platforms` (§0.11) stay the matching authority — the policy NAMES
  the binding, never re-lists cues.
- `requiredAnswers:` per bound profile — sampleCount (role + positive count Quantity),
  sample plate role bound to `sampleLayout.labwareRole`, reagent source role — each with the
  question text pointer (PDT axis `question`, §0.16) and the answer location
  (`branch_resolution[].choices` / SetupRow `ref`). This is what L3 consumes.
- `capabilityClosure:` profile `requiredTools`/`requiredLabwareDefinitions` -> required
  SetupRow roles. L4 consumes.
- `substitutionAdjudication:` declares that disallowance is DECIDED by the constraint
  vocabulary's `bindingKind` x `overridePolicy` data (SPINE-8 seam, §0.12) — the policy doc
  adds NO new policy, it points at the seam.
Loaded by a plain YAML read in the realization module (RegistryLoader-style, precedent
ExecutionScaleProfileRegistry.ts:86). No new loader family.

### 2.3 THE RUNNER GLUE (part of 2.1's module — no second file)

`realizeAndCompile(...)` thin export: L1-L6 then `compileScientistIntent(parsed, { spine })`.
The run graph = the existing `TerminalArtifacts` (§0.6). Zero pipeline wiring changes; the
local-protocol-compile pipeline (§0.2) is exercised by the REALIZATION WRITE leg tests (branch
filtering via `ResolveBranchAxesPass`) but the golden's lowering consumes the family directly —
documented honestly: the golden drives family+answers -> local-protocol payload -> lowerer; the
`local-protocol-compile` passes are covered by their own suite + T1's pass leg (they already
exist and pass at trunk).

## 3. FILE-BY-FILE PLAN (complete; everything else is untouched)

| # | Path | Kind | Justification |
|---|------|------|---------------|
| A | `schema/registry/realization/robot-realization.policy.yaml` | NEW DATA | §2.2 — every business rule (required answers, profile binding, capability closure, substitution posture) as data |
| B | `server/src/compiler/scientistIntent/realizeScientistIntent.ts` | NEW TS | §2.1 — lowering/emission + data-lookup gates (the ONLY new product TS) |
| C | `server/src/compiler/scientistIntent/realizeScientistIntent.test.ts` | NEW TEST | §4 T1-T3, T5-T6 gates |
| D | `server/src/compiler/scientistIntent/realizationGolden.test.ts` | NEW TEST | §4 T4 the byte-identical golden (inline fixtures, own file — goldens/ untouched) |
| E | `server/src/compiler/scientistIntent/noBypass.test.ts` | NEW TEST | §4 T7 route proof (grep-arms) |

Zero edits to trunk files. Zero app files. Zero schema/registry edits.

## 4. TEST PLAN (RED-first, all headless; exact harness precedents)

Harness canon: vitest ONLY from `<wt>/server`; schema validation via the REAL `createValidator`
(Ajv sole authority); the golden runs the REAL pipeline + shipped vocabulary + store-backed spine
(test seam `createResolveSpine({})` is BANNED in the golden — production composition
`createResolveSpineFromContext` shape, IntentCompileHandlers.ts:59-62 precedent; mocking the Ajv
parse, the pipeline YAML, or the vocabulary voids the criterion — SPINE-6 §4.1 doctrine).
Fixtures: a Zymo-shaped family — `protocolLayer: universal`, one PDT-derived branch axis whose
question is the labware-format choice with a `robot` condition, >=3 intent steps
(semanticVerb refs with enum-coverable canonicals per §0.15 — add_material/transfer/wash via
enum_only canonicals, never the 7 forbidden canonicals; one `materialNeeds` with the bead-beater
`CL:` arm on the NON-selected branch so L4 fires only when selected), constraints carrying real
vocabulary class ids + `bindingKind`s, `StepProvenanceRef`-shaped provenance (CAMT(W2-3) field
names at claim).

- T1 (RED first, then GREEN) golden happy leg: family + "neither spin column nor plate — the
  robot" answers -> local-protocol payload (choices per OQ2 shape) -> `lowerRealization` emits ->
  (a) emitted YAML PASSES `parseScientistIntent` on the 31-verb contract; (b) every
  `actions[].action` is enum-member, zero fabricated verbs; (c) `branch_resolution` entries:
  robot axis `matched:true`, `branchIds` = FAMILY condition ids (never vendor step ids),
  choices carry the LOCAL_REALIZATION carrier (CAMT(W2-4)); (d) `compileScientistIntent` ->
  `outcome:'complete'` (or 'gap'-free per contract) + non-empty events.
- T2 DETERMINISM (the byte-identical clause): run T1's whole chain TWICE in-process; assert
  `lowerRealization` YAML strings byte-equal AND serialized `TerminalArtifacts` byte-equal
  (stable order); a third run after re-loading the policy YAML from disk (YAML-reload bait) is
  byte-equal too.
- T3 fail-loud arms, each an actionable error naming what+where, each RED at base:
  (a) missing capability: equipment SetupRow `ref` absent for `p20-multi-8` ->
  `REALIZATION_CAPABILITY_MISSING`; second arm: bead-beater branch selected without the CL:
  capability bound;
  (b) count/volume conflation: a required-answer bound that puts a volume Quantity
  (`dimension: volume, unit: uL`) where the policy demands count -> REJECTED by the shipped
  Quantity schema (§0.13) — the test asserts the failure is a SCHEMA validation error (Ajv path),
  proving no TS branch does the dimensional work;
  (c) guessed default: sampleCount answer omitted -> `REALIZATION_ANSWER_MISSING` BEFORE compile;
  the same input routed to `compileScientistIntent` directly (bypass probe) WOULD have hit the
  8-sample default (:19 evidence) — assert the gate makes that unreachable from the realization
  route, ChatbotCompilePasses untouched;
  (d) unresolved required axis: answers missing one declared branch axis -> the
  BranchResolver/ResolveBranchAxes gap surfaces with the axisId + question, `ok:false`, zero
  emitted YAML;
  (e) disallowed substitution: `vendor_default` relax under a disallowing policy ->
  `REALIZATION_SUBSTITUTION_DISALLOWED` citing class + policy id (flip arm: the permissive policy
  passes and is recorded).
- T4 rung discipline (CAMT(W2-4)): W2-7's non-test TS contains ZERO rung string literals
  (`grep -rn "VENDOR\|DERIVED\|INFERRED_INVARIANT\|LOCAL_REALIZATION" B.ts` = 0; the value comes
  from the merged rung-vocabulary data / W2-4 datatype, read at claim); W2-4's activated
  `prov-local-choices-recorded` fires on a matched-without-choices arm (T3d payload) — proving
  W2-7 satisfies, not duplicates, W2-4.
- T5 verb-adjudication non-vacuity: flip a fixture canonical to `heat` ->
  `REALIZATION_VERB_UNADJUDICATED`; flip to a lowercase-neologism `vortex` -> rejected at L5 AND
  (belt-and-braces) by `parseScientistIntent` — two independent doors, each arm mutation-tested
  non-vacuously.
- T6 policy-is-data: change the policy YAML's `scaleBindings` robot target to
  `robot-opentrons-ot2-96` (in-memory or temp copy) -> the emitted labels change with ZERO code
  edits (mirrors W2-6's model-swap proof shape).
- T7 NO-BYPASS (structural, grep + import arms): (a) `grep -rn "steps\\[.\\*\\].intent\|\.intent"
  server/src/compiler/protocol/` stays EMPTY (literal compiler consumes no intents — trunk fact
  §0.10); (b) `grep -rn "compileScientistIntent" server/src --include=*.ts -l` = the known set
  {compileScientistIntent.ts, IntentCompileHandlers, IntentCompileFromPromptHandlers, tests} plus
  ONLY this item's realization files; (c) `grep -n "instance.post" server/src/api/handlers/*new*`
  — this item adds zero routes; (d) scientist-intent-compile.yaml sha256 UNCHANGED (the
  MANIFEST-pinned line, §0.7). Together: family -> run-graph has exactly one down-route:
  realization -> lowerer -> the frozen contract -> the frozen pipeline.

Verification commands (worker): `cd <wt>/server && npx vitest run src/compiler/scientistIntent`
(new + all pre-existing scientistIntent suites green; vocab/mirror/drift pins UNTOUCHED and
green); `npx vitest run src/schema src/lint` -> fail-file SET stays exactly
{EventGraphEquipmentSchema.test.ts, LabwarePhysicalGeometryData.test.ts} (baseline pins:
handoff l2t1955 §Baseline facts; RE-MEASURE on claim base, SET identity); `npx tsc -p .`
(= typecheck) vs `/tmp/l2t2230-tsc-server.txt` by STRIPPED-COORDINATE SORTED MULTISET diff =
EMPTY (26-line pin; the 27th wrapped-continuation line is expected per cleared assumption);
goldens suites green (proves MANIFEST untouched). App tsc: N/A (app untouched — assert
`git -c core.fileMode=false diff --stat` shows ZERO app files).

FIRST TARGETED CHECK (proves the approach early, before writing any lowering code): hand-author
one minimal robot-realization-flavored scientist-intent YAML (96-well plate + trough + 8-channel
labels, 3 actions on enum verbs) as a SCRATCH probe — do NOT commit it — and run it through the
REAL `parseScientistIntent` + `compileScientistIntent` (production spine composition) in a throw
away vitest probe or `tsx` scratch script (W2-3 probe discipline: scratch stays uncommitted).
Expected: `outcome:'complete'`, non-empty events. If the frozen contract cannot express the
robot-shaped document, STOP and report — the whole approach pivots there, not at review.

## 5. WORKER CONTRACT

- Worktree `<wt>/wt/W2-7-lane2-l2t2030` off trunk `cl/integration-2` tip AT CLAIM (orch
  reconciles current tip; W2-3/W2-4/W2-5/W2-6 merges may have landed — re-run every CMT pin);
  branch `W2-7-lane2-l2t2030`. Lane bootstrap: replicate trunk's untracked/ignored entries 1:1
  (symlinks as symlinks: node_modules, server/schema -> trunk schema; W2-2 report §0 precedent);
  per-worktree excludesFile `/home/brad/.hermes/cl/lanes/2/lane-exclude-W2-7-l2t2030`.
- `git -c core.fileMode=false` for EVERY git command.
- Deliverable report: `.hermes/plans/W2-7-report.wip-l2t2030.md` (trunk checkout, untracked;
  promote at acceptance). One commit; no scratch files in it; final stdout line
  `W27 DONE <sha>`.
- Pins to re-measure at claim on MY base: src/schema+src/lint fail-file SET, server tsc multiset,
  goldens count (expect 15 at l2t1955 facts). exactOptionalPropertyTypes: every optional field
  `...(x ? {k: v} : {})` — never `undefined`.
- Fleet rules: one worker, fleet lock, do not touch the lane stack (:3093/:5193) — headless item,
  NO restart needed unless claim-time merges already scheduled one; NO browser gate.

## 6. NO-BYPASS PROOF (§4 T7 formal statement)

Claim: there is NO route from a family (universal protocol with intent steps) to a run graph that
does not pass through a realization. Evidence at trunk: (i) the literal ProtocolCompiler has zero
intent handling (§0.10) — an intent step cannot become an event there; (ii) the ONLY compiler that
produces run graphs from high-level documents is the scientist-intent pipeline, reachable by
`/intent/compile` (document in) and `/intent/compile-from-prompt` (LLM out — still lands ON the
same contract; it is the wave-1 chat route, not a family route); (iii) W2-7's lowerer is the only
deterministic family->contract emitter, and its input is a local-protocol whose
`branch_resolution` is MANDATORY when the family declares branch_axes (ResolveBranchAxesPass
:68-81 — the existing block; plus W2-4's lint R1 once merged); (iv) this item adds zero routes,
zero pipeline pass-list edits (MANIFEST pin §0.7). The test arms above make each clause machine-
checked, and (ii)-(iii) are asserted as IMPORT-SET + ROUTE-GREP closure so a future bypass is a
test failure.

## 7. CMT / CONFIRM-AGAINST-MERGED-TRUNK REGISTER

- CMT(W2-3): intent arm final shapes — `IntentStepPayload` field names, `StepProvenanceRef`
  fields, R-7 wording, `canonical` on SemanticVerbRef (branch c5b69a57 §0.15). Lowerer reads the
  MERGED protocol.lint/schema at claim; fixture field names copied verbatim from merged
  `Wave2ProtocolIntentSchema.test.ts`.
- CMT(W2-4): rung enum home (`rung-vocabulary.yaml`), `provenance-rung-ref` datatype,
  `local-protocol.lint.yaml` activated rules (R1 nonEmpty-choices semantics — the draft flags
  empty-object `{}` vs absent ambiguity; W2-7's L3 treats `{}` as ABSENT choice defensively and
  says so in the report), AND the `choices` LOCAL_REALIZATION representation (OQ2).
- CMT(W2-5): draft lifecycle only if the golden persists records — the golden does NOT persist
  (pure payloads in-memory), so W2-5 is a soft bind here.
- CMT(W2-6): the family record's final shape (branch_axes ids, intent step verb discipline). If
  merged W2-6 families carry canonicals outside the enum-coverable set, L5 fails loudly (correct
  behavior) — but the golden fixture must then be re-sourced from W2-6's merged test fixtures.
- trunk tip drift: re-pin ALL line numbers at claim; this draft cites b6f7095c / 7f4e751b /
  c5b69a57 explicitly.

## 8. REVIEWER BAIT (what the adversarial cycle will hunt; pre-empt every one)

1. exactOptionalPropertyTypes sites: `branchIds?`, `choices?`, `variantRef?`, gate-failure
   unions — absent-or-value, never `undefined` (server/tsconfig.json:13). Every spread-conditional
   must mirror IntentAcceptHandlers.ts:77-82 shape.
2. YAML-reload trap: the policy doc + vocab YAMLs are read per-process; a test that mutates a
   cached module-level registry is lying — T6 must FRESH-load (and note: lane-stack tsx --watch
   does NOT reload YAML — irrelevant here, headless, but say it in the report).
3. Determinism fakes: `Map` iteration order, `Object.keys` insertion order, `Date.now`,
   `randomUUID` (ProtocolRealizePass's randomUUID is the ANTI-precedent for THIS module),
   locale-sensitive sort. The lowerer must be pure; T2 is a BYTE compare, not deepEqual.
4. MANIFEST freeze: editing `scientist-intent-compile.yaml` (e.g. to bolt the robot scale-plan
   pass in) silently re-blesses goldens — replayKernel FAILS LOUD (§0.7); the correct answer is
   the profile consumption lives in the gate + symbolic labels, not a pipeline edit.
5. Verb fabrication: ANY literal string list of verbs in TS = contract violation; the enum is
   consumed via `defaultScientistIntentVocabulary()` / the adjudication data; shake must NOT be
   silently folded to mix (finding F3) — T5 arms.
6. Hardcode boundary: the profile id, the answer names, the capability roles, the substitution
   policy all live in §2.2 data; the lowerer branching on the string 'robot-assist-plus-96' is
   bait #6 — profile ids arrive only via `scaleBindings` + the registry loader.
7. Rung re-mint: rung string literals in W2-7 TS (bait #7; W2-4 owns them; T4 greps).
8. Masquerading branch ids: `branchIds` must be the FAMILY's condition ids (schema :103-106);
   copying vendor branch/step ids from provenance is the exact sin the item text names — assert
   every branchId appears in `family.branch_axes[].conditions[].id`.
9. The guessed-default seduction: "just reuse derive_execution_scale_plan" reopens cue-matching
   (the robot choice was ANSWERED, not guessed from prompt cues) and edits a MANIFEST-pinned
   pipeline — refuse, document, keep the gate upstream (T3c).
10. Choice-carrier drift: writing `choices: { robot: true }`-style ad-hoc shapes instead of the
    merged W2-4 representation (OQ2) — the report must quote the merged W2-4 vocabulary line.
11. Ontology terms: no new CL:/cf: prefix, no new verbs, no `constraint-class`/`quantity`/
    `provenance-rung` kinds (crosswalk forbidden_kinds), the policy doc is NOT a record kind.
12. Report honesty: line counts machine-measured (`git diff --numstat`), baselines quoted with
    capture paths, T3 arms shown RED-at-base with the failing assertion text.

## 9. ACCEPTANCE CRITERIA (VERBATIM task block `verified by:`, numbered mechanically)

Headless golden: Zymo family + "neither spin column nor plate — the robot" answers ->
robot-assist-plus-96 realization -> scientist-intent YAML validates against the wave-1 contract
-> run graph compiles deterministically (identical inputs, byte-identical output); robot choice
recorded LOCAL_REALIZATION; missing capability / count-volume conflation / guessed default each
fail with actionable errors; no bypass route from family straight to run graph.

- AC1 golden chain: family + robot answers -> realization payload -> emitted YAML validates via
  the real Ajv contract -> `compileScientistIntent` completes with non-empty events (T1).
- AC2 byte-identical determinism: two (three with YAML reload) full-chain runs, emitted YAML and
  serialized TerminalArtifacts byte-equal (T2).
- AC3 robot choice recorded LOCAL_REALIZATION: branch_resolution robot entry with family condition
  ids + merged-W2-4 LOCAL_REALIZATION choice carrier; zero rung literals in product TS; W2-4
  R1-green (T1c, T4; spends a W2-4 rung — OQ1).
- AC4 fail-loud trio + two: missing capability / count-volume conflation (schema-path failure) /
  guessed default / unresolved required axis / disallowed substitution — each actionable, naming
  the missing thing and where to answer it (T3a-e).
- AC5 no bypass: import-set + route-grep + pipeline-sha closure arms green (T7, §6).
- AC6 pins: fail-file SET identity, tsc multiset EMPTY vs pin, existing scientistIntent + goldens
  suites green, ZERO app/records/goldens/schema diff lines (§4 commands).

## 10. PROMPT BUDGET — N/A

This item is deterministic data + compiler passes. Zero LLM calls, zero prompts, zero models.
State so in the report (task-list convention).

## 11. OPEN QUESTIONS (each: recommendation + smallest orchestrator ruling)

OQ1 — W2-4 HARD DEPENDENCY. AC3 spends a W2-4 rung: the LOCAL_REALIZATION carrier shape, the
rung enum, and the activated `prov-local-choices-recorded` lint are all W2-4's surface. Writing
choices WITHOUT them makes W2-7's own output a W2-4 lint violator at W2-4's merge.
RECOMMENDATION: YES — declare W2-4-PROVENANCE-LADDER a HARD dep of W2-7 (add to the task block's
deps line at promotion); queue ordering already places W2-4 before W2-6 before W2-7. SMALLEST
RULING: "deps += W2-4-PROVENANCE-LADDER; composer's OQ1=(hard) accepted." Consequence if not:
either W2-7 lands rung-bare (W2-4 then fails on W2-7's data — the ladder gets blamed for a
dependency bug) or W2-7 re-mints the carrier (rung re-mint — banned by constraint).

OQ2 — CHOICES REPRESENTATION. `choices` is an open object (:107-110); today's only writer stores
raw `{ [axisId]: chosenValue }` (IntentAcceptHandlers.ts:81) with no rung. Options: (a) keep that
shape, the rung is DECLARED by W2-4's vocabulary/lint over that path (no inline marker);
(b) `{ value, rung: <w2-4 enum member>, askedAt }` per-entry. RECOMMENDATION: (a)+(b) as merged
W2-4 dictates — read W2-4's `prov-local-*` rules + rung-vocabulary lineage declaration at claim
and copy VERBATIM; the fixture must satisfy W2-4's R1 either way (that rule is the tiebreaker:
if R1 reads only `nonEmpty choices`, shape (a) suffices and is back-compat with the accept
handler). SMALLEST RULING: "OQ2 = whatever merged W2-4 R1 requires; W2-7 copies it verbatim,
reports which." Consequence if unresolved: W2-7 invents a third carrier shape — the exact
masquerading failure mode.

OQ3 — ROBOT BINDING DEPTH INSIDE THE FROZEN PIPELINE. The scientist-intent pipeline has NO scale
pass (§0.7) and is MANIFEST-frozen. The golden proves robot realization via: gate closure
(profile requiredTools/requiredLabwareDefinitions), profile-sourced SYMBOLIC labels (96-plate def,
trough, p20 8-channel) flowing into resolve_labware/resolve_roles/plan_deck_layout downstream.
CAMT-AT-CLAIM: how deeply `plan_deck_layout` honors those labels for integra_assist (composer did
NOT verify deckBinding consumption inside the pass — flagged, not guessed). RECOMMENDATION:
accept gate+labels depth as the golden's proof bar (run graph deterministic + tool/label closure
asserted); do NOT edit the pipeline YAML. SMALLEST RULING: "(a) gate+labels depth accepted; if at
claim the deck pass ignores the profile entirely, escalate for a MANIFEST re-bless DECISION —
orchestrator act, never coder act." Consequence if pinned too high: W2-7 forces a goldens
re-bless (forbidden) or fakes deck claims (worse).

OQ4 — GUESSED-DEFAULT CLAUSE SCOPE. The pipeline's 8-sample default (:3087-3101) is a CHATBOT
product behavior; W2-7 bars it upstream per L3/T3c rather than editing ChatbotCompilePasses.
RECOMMENDATION: as designed (upstream gate; chatbot behavior untouched, disclosed). SMALLEST
RULING: "(a) upstream gate is the correct reading of 'guessed default fails'; chatbot default
stays." Consequence otherwise: shared chatbot product regressions on a realization item.

## 12. ASSUMPTIONS

- A1 W2-6's merged family uses enum-coverable canonicals per W2-3 §2.3 discipline; if not, L5
  fails loudly and the golden fixture re-sources from W2-6's merged fixtures (CMT list).
- A2 The realization leg needs no persisted record for the golden (in-memory payloads; W2-5
  lifecycle is exercised by its own item). Persistence via the ordinary store paths is a later
  surface (W2-8 entry).
- A3 `POST /intent/compile` remains the production consumer of emitted documents; if a merged
  W2-5/W2-8 adds an orchestration endpoint that CALLS the lowerer, that is their diff riding this
  module, not this item's.
- A4 `ExecutionScaleProfileRegistry` loads robot-assist-plus-96 at boot today (its test suite
  passes at trunk per task facts); no loader change.
- A5 The 3/7/28 verb partition and the F1-F6 findings stay as merged; any W2-1 deferred-collision
  disposition (AS-LANE2-W21-COLLISION-FINDINGS-DEFERRED) that lands before claim only NARROWS the
  unadjudicated list — L5 reads the table at runtime, so it self-follows.
- A6 This draft's line numbers are trunk b6f7095c / code 7f4e751b / W2-3-branch c5b69a57 pins;
  every one re-pinned at claim (drift expected — three merges may land first).

COMPOSED 2026-10-09 ~21:00 EDT by cl-spec-composer (l2t2030). All §0 cites opened first-hand at
trunk this session (scout screening used once, for the ProtocolCompiler branch_resolution write —
re-opened and verified at :710-714/:400 personally before citing). Nothing here is promoted.
