# W2-3-PROTOCOL-SEMANTIC-UPGRADE — spec DRAFT (cl-spec-composer, 2026-10-09T13:05 EDT, token l2t1251)

DRAFT — not promoted, not committed. Item: W2-3-PROTOCOL-SEMANTIC-UPGRADE (lane 2, WAVE 2
semantic-protocol-family; deps: W2-1-NAMING-CROSSWALK + W2-2-QUANTITY-CONSTRAINTS).
Base examined by composer: lane trunk /mnt/vast/home/brad/git/cl-integration-2 at code tip
e830cffb / docs tip 3d542320 — BEFORE the SPINE-7 and W2-1 merges (both in adversarial gates
at l2t1210), before W2-2 (spec drafted, not promoted). Trunk WILL have moved by claim time;
every baseline below is RE-MEASURE-ON-YOUR-BASE, SET-identity discipline is the gate
(assumption AS-LANE2-W23-SPEC-COMPOSED-PRE-DEPS — the orchestrator re-checks this spec against
merged SPINE-7/W2-1/W2-2 shapes before promotion; merged trunk WINS over every shape assumed
here). W2-1's near-final shapes were read from wt/W2-1-lane2-l2t1155 @ 79016be9 — CONFIRM
entry keys against merged trunk at promotion.
git ALWAYS `-c core.fileMode=false`. Lane stack :3093/:5193 — NEVER :3001/:5174 (main
checkout's stack). Headless item: NO browser gate.

## Goal (one sentence)

Upgrade the `protocol` triplet IN PLACE (D1 — no new kind): a schema-enforced step
discriminator where an INTENT step (semantic verb + role/capability material needs + typed
Quantity/constraint bindings to W2-2's shared datatype + provenance refs) can NEVER carry
literal vendor execution params, legacy literal steps are lint-bounded to the exact
pre-upgrade inventory, branch_axes/variants/protocolLayer are kept whole with a declared
PDT-axes -> branch_axes data flow, and the UI spec renders the intent shape — with ZERO
production TypeScript.

## 0. Orientation + grounding (every line opened first-hand by the composer at e830cffb;
scout output used only as SCREENING and re-verified — noted where)

1. THE STEP UNION (the crux). `schema/workflow/protocol.schema.yaml`:
   - record root: `unevaluatedProperties: false` (:8), `kind` const "protocol" (:24-25),
     `protocolLayer` const "universal" (:19-21) — D1 keeps both consts; NO new kind.
   - `branch_axes` (:294-299): array, items `$ref: ./datatypes/condition.schema.yaml#/$defs/BranchAxis`
     — NOTE the relative ref resolves through the $id-keyed registry, the datatype actually
     lives at `schema/core/datatypes/condition.schema.yaml` ($id
     `.../computable-lab/datatypes/condition.schema.yaml`, condition.schema.yaml:2).
   - `variants` (:283-288) + `$defs/ProtocolVariant` (:717-747), `steps` (:301-307,
     items $ref #/$defs/ProtocolStep).
   - `$defs/ProtocolStep` (:749-839): `required: [stepId,label,ordinal,kind]` (:751),
     step-level `kind` enum [add_material, transfer, mix, wash, incubate, read, harvest,
     other] (:771-773), `semanticVerb` -> `$defs/SemanticVerbRef` (:774-775, def :669-685,
     ref constrained `type: const verb-definition` :680), `methodRequirement` (:776-777,
     def :688-700), `executionPreference` (:778-779, def :702-712), `phaseId` (:787-790),
     `settings` array $ref ./setting.schema.yaml (:823-829), `subGraphRef` (:802-821),
     `executionMeta` (:831-833), `isOptional` (:835-839). The step object itself has NO
     additionalProperties — closure lives in the payload defs.
   - The discriminator today: `allOf: [ oneOf: [ StepAddMaterial, StepTransfer, StepMix,
     StepWash, StepIncubate, StepRead, StepHarvest, StepOther ] ]` (:841-850). EVERY payload
     def is `additionalProperties: false` (StepAddMaterial :855-857, StepTransfer :897-900,
     StepMix :930, StepWash :946, StepIncubate :962, StepRead :980, StepHarvest :1009,
     StepOther :1030-1033). Therefore ANY unknown key on a step object fails EVERY branch ->
     zero oneOf matches -> rejected. Verified by composer, this is the load-bearing mechanic
     the new arm exploits (§2.1).
   - Literal execution params live here: StepAddMaterial `oneOf required [volume_uL] /
     required [working_concentration]` (:862-864), `working_concentration` ->
     ./datatypes/concentration.schema.yaml (:888-889), `ratio` -> reference-ratio (:892-893),
     `volume_uL` Expr (:894-895); StepTransfer `required:[kind,source,target,volume_uL]`
     (:900); washVolume_uL/cycles/duration_min/temperature_C/modality/mappingHint/
     producesArtifactId per payload (:939-1028).
   - `Expr` (:654-667) = bare number/boolean/string or {param}. Bare scalars — W2-2's
     Quantity is the replacement contract for INTENT steps only; legacy payloads keep Expr
     byte-unchanged.
2. LINT SURFACE + DSL (SPINE-era state, verified before declaring rules):
   - `schema/workflow/protocol.lint.yaml` today carries THREE activated rules: R1
     `step-role-closure` (error, :19-63, any[not(nonEmpty refs), allIn] pattern), R2
     `labware-role-identity-bearing` (warning, :72-94), R3 `role-id-category-unique`
     (warning, :101-122) — plus a comment block (:124-169) of seven NOT-activated rules.
   - DSL ops shipped: exists/nonEmpty/regex/equals/in/all/any/not + generic relational
     allIn/everyItem/noneIn (`server/src/lint/types.ts` PredicateOp :21-38; meta-schema
     `schema/lint/lint-v1.schema.yaml` consts :147,159,177,192,211,244,285,324,350,364,378).
     `in` supports a STATIC literal `values` allowlist AND a dynamic `valuesPath`
     (types.ts :87-93 `values`/`valuesPath`; PredicateEvaluator evalIn resolves both —
     verified in-source). No arithmetic, no cross-file resolution: LintEngine evaluates ONE
     record at a time and supports record scope ONLY (`LintEngine.ts:126-129` — non-record
     scope is skipped). Rule ids are GLOBALLY unique — `addSpec` throws `Duplicate rule ID`
     (`LintEngine.ts:61`). Zero-rule specs are silently skipped at boot (`server.ts`
     `if (spec.rules.length === 0) continue;` in the spec loop at :409-411).
   - Lint on WRITE is live: `RecordStoreImpl` runs lint on write paths and REFUSES on error
     findings (`server/src/store/RecordStoreImpl.ts:492-501`), and on demand
     (`:322-323`). A new ERROR lint rule therefore hard-blocks new literal protocols at the
     ordinary write path — no endpoint change needed.
3. THE LEGACY INVENTORY IS TWO DIFFERENT WORLDS (composer-verified — do not conflate):
   (a) SIX `kind: protocol` RECORDS under `records/seed/protocols/`:
       prt-seed-biological-transfer, prt-seed-pbs-wash, prt-seed-serial-dilution-96,
       prt-seed-buffer-prep-50ml, prt-seed-incubate-plate, prt-seed-standard-curve-tubes
       (recordId at :3 of each file; e.g. records/seed/protocols/prt-seed-pbs-wash.yaml:3,
       with literal `volume_uL: 200` at :39). These validate against protocol.schema.yaml +
       protocol.lint.yaml and are the ONLY records the legacy-bounds lint can see.
   (b) `schema/registry/protocols/zymo-magbead-minimal.yaml` and
       `schema/registry/protocols/test-wash-protocol.yaml` — these are NOT records: they are
       protocol-SPEC registry docs loaded by `server/src/registry/ProtocolSpecRegistry.ts`
       (:24-40 zod schema: `steps[].{step:number, verb:string, params:record}` — `volumeUl:
       400` at zymo-magbead-minimal.yaml:27, `volumeUl: 200` at test-wash-protocol.yaml:13).
       They never touch protocol.schema.yaml or LintEngine. D2 fixes them as LEGACY INPUT.
       The lint CANNOT bound them (they are outside the record pipeline) — see reviewer bait
       §8.1 and OQ2.
4. W2-1 CROSSWALK (near-final @ 79016be9, READ in wt/W2-1-lane2-l2t1155; merged trunk wins):
   `schema/registry/wave2-naming-crosswalk.yaml` entry keys are
   `{term, status, binds_to{...}, curie_plan, source_decision, note}` with statuses
   `existing | missing-datatype | new-vocab-pending-admission`; "Semantic operation" is
   ALREADY admitted as an existing field (steps[].semanticVerb -> verb-definition), "branch
   axes" maps to protocol.branch_axes `fed_by: protocol-decision-tree`
   (crosswalk field_line protocol.schema.yaml:294, fed_by_line
   protocol-decision-tree.schema.yaml:25), Quantity is `missing-datatype` at planned
   `schema/core/datatypes/quantity.schema.yaml` with `curie_plan: cf:quantity`, and
   constraint-classes/provenance rungs are `new-vocab-pending-admission` (cf:constraint-class,
   cf:provenance-*). `forbidden_kinds` (:~168-179) lists semantic-protocol-family,
   realization-plan, semantic-extraction-ir, provenance-ladder, said, meant, constraint-class,
   quantity, provenance-rung — W2-3 mints NONE of them. Admission is enforced by
   `server/src/schema/Wave2NamingCrosswalk.test.ts`; findings F1-F6 (heat/set/shake/
   spin-pellet/map-gap/warm) are RECORDED-UNRESOLVED — W2-3 adds no verb and touches none of
   those collisions. Verb authority: `schema/registry/wave2-verb-adjudication.yaml` (counts
   31/31/10/27/26, partition 3/7/28) — W2-3 consumes verb-definition refs, NEVER a new verb
   vocabulary.
5. PDT SURFACE + THE DATA FLOW. `schema/workflow/protocol-decision-tree.schema.yaml`: kind
   const protocol-decision-tree (:24-25), `recordId ^PDT-` (:30), `axes[]` items require
   [axisId, question, choiceKey, origin, conditions] (:60-111) where `conditions` items are
   `$ref ../datatypes/condition.schema.yaml#/$defs/BranchCondition` (:109-111 — the SAME
   datatype protocol.branch_axes consumes; the file's own note says ids "converge with the
   BranchCondition datatype ... SAME predicate language (DRY)" :105-107). BranchAxis requires
   [axisId, label, conditions] (condition.schema.yaml:123-126) — so the PDT axis carries
   `question` where BranchAxis requires `label`, and adds choiceKey/origin/evidence/sectionId
   which BranchAxis (`additionalProperties: false`, :125) does NOT allow. The rebinding rule
   already exists in code (SCREENED via scout, composer-confirmed):
   `server/src/protocol-intake/deriveDecisionTree.ts:9-13` — every axis condition predicate
   path is rewritten to `$.branchSelection.${axisId}` so axes resolve independently over
   `{ branchSelection: { axisId: slug } }`; `deriveBranchAxes` lives at
   `server/src/ingestion/vendor-protocol/deriveBranchAxes.ts:167`. Branch resolution consumes
   branch_axes via `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.ts` and
   `BranchResolver.ts` (consumer list verified by grep — untouched by W2-3).
6. W2-2 CONTRACT (draft `.hermes/plans/2026-10-09_1130-W2-2-quantity-constraints-spec-DRAFT-l2t1130.md`,
   NOT promoted — its OQ1/OQ2 adjudicated provisionally in the task block): W2-3 consumes
   (a) `schema/core/datatypes/quantity.schema.yaml` — value+unit+dimension
   [count,volume,mass,molar], `minimum: 0` with optional `qualifier`
   [exact, approximately_zero] (OQ2 accepted provisionally — W2-3 BINDS THIS: intent steps
   carry ~zero as qualifier, never epsilon hacks); (b) `quantity-ratio.schema.yaml` —
   quantity-per-quantity; (c) `schema/registry/constraint-vocabulary/constraint.schema.yaml`
   — the constraint-object datatype: {class ref, bound quantity/ratio, subject applicability,
   bindingKind [vendor_default, hard_bound], overridePolicy ref, optional
   capabilityRequirement to equipment-capability/`CL:` CURIE}. W2-2 §2.3 explicitly says
   "W2-3 mounts it" and forbids referencing it before W2-3 — W2-3 IS that mount. W2-3 MUST
   read the merged file's actual `$id` and entry shape at claim and $ref THAT; the draft paths
   are assumptions AS-W23-W22-CONTRACT (§7).
7. CANONICAL-EXAMPLE / PROVENANCE (item touches provenance refs — CLAUDE.md:66 gate read):
   `docs/knowledge-layer-canonical-example.md` carries `layer_provenance` (:182) — provenance
   as DATA attached to records, refs by CURIE/record-ref, never collapsed layers
   (CLAUDE.md rule 8). The candidate side already has the shape W2-3 must mirror, not
   duplicate: `schema/workflow/vendor-protocol-candidate.schema.yaml` `$defs/Provenance`
   (:176-194: required [documentId, pageStart], optional pageEnd/sectionId/spanStart/spanEnd)
   and $defs/Quantity raw-form (:200-206). SAID immutability + StepPdfAnchor anchors are W2-1
   crosswalk-confirmed (vendor-protocol-candidate.schema.yaml:5-6). W2-4 (deps: W2-3) will
   add the four-rung ladder — so W2-3 ships a MINIMAL step-level provenance ref (record ref +
   anchor fields) and NOTHING rung-named; the rung names VENDOR/DERIVED/INFERRED_INVARIANT/
   LOCAL_REALIZATION are W2-4's admission to make, W2-3 must not spend them.
8. CONSUMER SURVIVAL (why zero churn is provable): `ProtocolCompiler` reads only
   {semanticVerb.ref/canonical/backendHints, kind, payload fields}
   (`server/src/workflow/verbs/protocolVerbRegistry.ts:19-59`,
   `server/src/compiler/protocol/ProtocolCompiler.ts:418-449`) — an extra `intent` key is
   inert. The step-PATCH route merges a KNOWN key list (`server/src/api/routes/
   protocol-steps.ts:405-430`) — `intent` is simply not PATCHable there (proposed-never-sneaks;
   whole-record PATCH carries steps verbatim; W2-5's lifecycle owns intent editing). The
   AI-8 applier keeps unknown step keys as BASE on kind-change
   (`app/src/event-editor/right-pane/protocol/protocolEditOps.ts:209-227` "anything unknown,
   which is base by exclusion") — `intent` survives AI edits UNTOUCHED. The taptab widget
   renders steps as `Array<Record<string, unknown>>` reading only known fields
   (`app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx:160-215`, composer-verified;
   scout SCREENING agreed) and round-trips via `{...step}` spreads (:178-186) — an intent
   step renders as its label/description with extras preserved. `verified by` says "app+server
   typecheck clean (schema is data — consumers untouched)" — W2-3 touches ZERO app/ or
   server/src non-test files.

## 1. Scope / non-scope (D1: in-place additive upgrade; vocabulary-first; zero TS policy)

IN SCOPE — the only files the diff may touch (plus `.hermes/plans/`):
A. `schema/workflow/protocol.schema.yaml` (EDIT, additive-only: new optional step property
   `intent` + $defs + discriminator arms; existing lines otherwise byte-unchanged), §2.1.
B. `schema/workflow/protocol.lint.yaml` (EDIT: ADD rules with ids prefixed `step-intent-` /
   `legacy-`; existing R1-R3 + comment block byte-unchanged), §2.2.
C. `schema/workflow/protocol.ui.yaml` (EDIT, additive display hints so the intent shape
   renders), §2.5.
D. `schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml` (NEW registry DATA
   doc — the declared PDT-axes -> branch_axes data flow; NOT a `.schema.yaml` so it never
   enters SchemaRegistry; naming-crosswalk precedent of a non-triplet registry doc), §2.4.
E. `schema/registry/wave2-naming-crosswalk.yaml` (EDIT — additions only, if the admission
   check demands an entry for the step-shape terms `intent step` / `literal step`; READ the
   merged file first and mirror its actual entry keys; confirm-vs-skip in report), §2.F.
F. Tests (new, under `server/src/`): `src/schema/Wave2ProtocolIntentSchema.test.ts`,
   `src/lint/Wave2ProtocolIntentRules.test.ts`, §3/§4.
G. Report `.hermes/plans/W2-3-report.wip-l2t<tickid>.md`.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- ANY production TypeScript — `server/src/lint/**` (NO DSL extension; if a rule is
  inexpressible DSL-only that is STOP-and-report, not a PredicateEvaluator edit),
  `server/src/schema/**` loader/engine, `server/src/compiler/**`,
  `server/src/api/routes/protocol-steps.ts`, `server/src/registry/**`, `server/src/ai/**`,
  ALL of `app/`. This item is SCHEMA+LINT+UI-SPEC DATA + TESTS (acceptance: "app+server
  typecheck clean (schema is data — consumers untouched)").
- New record kinds (D1 + crosswalk forbidden_kinds); new verbs or verb vocabularies (W2-1
  adjudication is the verb authority; F1-F6 stay untouched); new CURIE prefixes (cf: only).
- `schema/workflow/protocol-edit-op.schema.yaml` (PROTO-AI-2 contract),
  `schema/workflow/protocol-decision-tree.*` (reference, don't extend),
  `schema/core/datatypes/condition.schema.yaml` (shared with PDT — W2-3 may NOT edit it;
  the data flow is declared as D, not by datatype surgery),
  `schema/workflow/local-protocol.schema.yaml` (realization answers belong to W2-7/D9),
  `schema/registry/protocols/**` (the two legacy spec docs stay byte-unchanged — D2 legacy
  INPUT), `records/**` (zero record edits — legacy records validate AS-IS, unmodified),
  `schema/scientist-intent/**` + goldens MANIFEST (SPINE-7/8 territory),
  `schema/lint/lint-v1.schema.yaml`, W2-2's own files (consume via $ref; edits to the
  quantity/constraint datatypes are W2-2's, never yours), no `git add -A`.
- No rung-name usage (VENDOR/DERIVED/... belong to W2-4's admission), no `intentType`/
  `semanticVerbType` second verb noun, no `intentKind`.
- No :3093/:5193/:3001/:5174 interaction (headless; YAML-reload trap noted at §8.7). No
  browser gate.

## 2. File-by-file plan

### 2.1 A — `schema/workflow/protocol.schema.yaml` (the discriminator design)

Additive changes ONLY (every existing line byte-unchanged; verify with
`git -c core.fileMode=false diff` showing pure additions):

(i) `ProtocolStep.properties` gains ONE optional key:
      intent:
        $ref: "#/$defs/IntentStepPayload"

(ii) New `$defs/IntentStepPayload` — the intent-step payload object,
     `additionalProperties: false`, `required: [semanticVerb]`:
      - `semanticVerb`: `$ref "#/$defs/SemanticVerbRef"` (REUSE the existing def :669-685 —
        the verb-definition ref is the semantic verb, per crosswalk "Semantic operation";
        NEVER a bare string, NEVER a second verb enum).
      - `materialNeeds`: optional array, items additionalProperties:false,
        required [need]; properties: `need` (string roleRef — symbolic roleId reference,
        closure already covered by lint R1 when literal target/source exist; intent-role
        closure against declared roles is a lint arm, §2.2 R-4), `capabilityRequirement`
        ($ref equipment-capability style / `^CL:` CURIE — the bead-beater arm; REFERENCE
        the existing schema, do not extend it), `quantityConstraint` ($ref W2-2's
        constraint.schema.yaml — read its merged $id; this is the typed
        Quantity/constraint binding mount point that W2-2 §2.3 reserved for W2-3).
      - `constraints`: optional array of $ref to W2-2's constraint object (same mount).
      - `provenance`: optional array of $ref "#/$defs/StepProvenanceRef" (§2.1(v)).
      - `intentNotes`/`description`-style prose optional strings.
     Description must cite: D1 concession (intent steps cannot carry literal vendor
     execution params), the W2-2 contract it binds, and that symbolic refs only live here —
     never inline payloads, never concrete instances.

(iii) New `$defs/StepProvenanceRef` — MINIMAL provenance ref, mirroring the CANDIDATE-side
     shape (vendor-protocol-candidate.schema.yaml:176-194) WITHOUT duplicating the datatype:
     allOf [ $ref ./datatypes/ref.schema.yaml constrained { kind: const record, type: const
     vendor-protocol-candidate }, optional anchor fields pageStart/pageEnd/sectionId/
     spanStart/spanEnd ]. Provenance refs per the canonical example: the intent's evidence
     points AT the SAID (candidate record + anchors), derivation is never quoted as vendor
     truth (W2-6's rule, W2-3 just makes the slot exist and be honest — absence is lint-
     VISIBLE per §2.2 R-5, never silently vendor). NO provenance-rung field here (W2-4's).

(iv) The discriminator arms, in `ProtocolStep.allOf` (:841):
     arm 1 (UNCHANGED): the existing `oneOf` over the 8 literal payload defs.
     arm 2 (ADD): extend that SAME `oneOf` with a NINTH member `$ref #/$defs/IntentStep`
        = { type: object, required: [intent], properties: { intent:
        $ref #/$defs/IntentStepPayload } } — deliberately thin; closure comes from
        IntentStepPayload + arm 3. Because every literal payload def is
        `additionalProperties: false` (verified line list in §0.1), a step carrying BOTH
        `intent` and a literal param (volume_uL/target/washVolume_uL/...) matches NEITHER a
        literal branch (unknown key `intent`) NOR is it expressible otherwise -> zero oneOf
        matches -> schema REJECT. A step with `intent` + a hidden unknown literal field
        (e.g. `catalog: D1001`) likewise matches zero branches -> reject. This is the
        "schema-forbid literal execution params on intent steps" requirement, expressed
        entirely by shape.
     arm 3 (ADD, independent allOf element — the ACTIONABLE-ERROR arm, not load-bearing
        for rejection): { if: { required: [intent] }, then: { not: { anyOf: [
        {required:[volume_uL]}, {required:[working_concentration]}, {required:[target]},
        {required:[source]}, {required:[wells]}, {required:[material]}, {required:[cycles]},
        {required:[washVolume_uL]}, {required:[duration_min]}, {required:[temperature_C]},
        {required:[modality]}, {required:[channels]}, {required:[instrumentRole]},
        {required:[mappingHint]}, {required:[producesArtifactId]}, {required:[ratio]} ] } } }.
        Keep `settings`, `subGraphRef`, `executionMeta`, `executionPreference`,
        `methodRequirement`, `phase`, `phaseId`, `plannedOffset`, `isOptional` ALLOWED on
        intent steps (declarative envelopes, not vendor execution params; zero-churn).
     Byte-stability proof obligations (all three in the RED plan): (1) every legacy step
     shape still matches exactly its ONE literal branch (`intent` absent -> IntentStep fails
     on required; one match -> valid); (2) seed/fixture protocols validate byte-identically;
     (3) `intent` alone matches exactly IntentStep (literal defs fail on the unknown key).
     Do NOT switch the union to anyOf (§8.2). Do NOT add `stepShape` enum fields — presence
     of `intent` IS the discriminator; lint reads it with nonEmpty/everyItem (§2.2).

(v) `branch_axes`/`variants`/`protocolLayer`: NO structural change (D1 "kept whole").
     branch_axes description gets one appended sentence (data-as-doc): axes may be derived
     from a protocol-decision-tree per the declared mapping in
     `schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml`; the `conditions`
     items already converge with PDT (condition.schema.yaml is shared — §0.5).

### 2.2 B — `schema/workflow/protocol.lint.yaml` (legacy bounds + intent well-formedness)

ADD these rules (ids prefixed for global uniqueness — LintEngine.ts:61 throws on collision;
every rule DSL-only, record scope; existing R1-R3 untouched; ALL are `when`-guarded so
nothing emits noise on shapes that don't carry the field):

R-4 `legacy-literal-bounded` (ERROR) — "newly authored literal protocols cannot qualify":
  when: not(in recordId, <static allowlist>) — `in` supports literal values
  (types.ts:87-93, PredicateEvaluator evalIn verified); values: the SIX record ids of §0.3(a)
  — the inventory lives HERE, as lint YAML data, nowhere in TS.
  assert: everyItem(steps) -> not(nonEmpty intent) — per-item nonEmpty reads the item as
  root; a step WITHOUT intent fails (everyItem names the index). Meaning: any protocol NOT
  on the frozen pre-upgrade inventory must have EVERY step carry `intent` — a new all-literal
  protocol is refused (and RecordStore blocks the write, store :492-501). Mixed
  new protocols (some step lacking intent) are refused too — intent-only is the authored
  future.
  message template names recordId + failing step ids via `steps[*].stepId` projection.

R-5 `legacy-inventory-no-intent-drift` (WARNING) — the allowlist is FROZEN pre-upgrade
  content: when: in(recordId, <same six ids>); assert: everyItem(steps) ->
  not(nonEmpty intent). A legacy record gaining an intent step (i.e. being edited toward
  semantic without the W2-5 promotion lifecycle) surfaces now. Warning so seed bootstraps
  keep working; message names the drift.

R-6 `intent-step-provenance-visible` (WARNING) — when: nonEmpty steps[*].intent; assert:
  everyItem(steps) -> any[ not(nonEmpty intent) /* legacy step, vacuous */,
  nonEmpty intent.provenance ]. An intent step without provenance refs is a VISIBLE review
  issue, never a silent vendor quotation (W2-6's rule pre-stated as a warning; warning
  severity matches the PROTO-AI-4 R2 discipline for legacy tolerance).

R-7 `intent-verb-ref-declared` (ERROR) — when: nonEmpty steps[*].intent; assert: everyItem
  (steps) -> any[ not(nonEmpty intent), nonEmpty intent.semanticVerb ] — belt-and-braces
  over the schema `required`; cheap DSL, catches half-authored drafts where a future relaxed
  schema arm slips. (If the coder judges this vacuous-by-schema, ship it anyway with a
  comment, or STOP-and-report why — do NOT drop it silently.)

NOT added (state these in the report as explicit non-goals): cross-RECORD closure of
`constraints[].class` against W2-2's vocabulary (record-scope-only engine, LintEngine.ts
:126-129 — no DSL op can read a registry file; this closure is a TEST, §3 T2), the seven
commented PROTO-AI-4 rules (still out), any rung/ladder rule (W2-4).

### 2.3 Fixture family (lives in the tests, not in records/)

Intent fixture: a family protocol (protocolLayer universal, branch_axes with one
PDT-derived axis, variants optional) with >=2 intent steps: one add_material-kind step whose
IntentStepPayload carries semanticVerb ref to a REAL seed verb-definition record id
(records/seed/verb-definition/, e.g. VERB-INCUBATE — read the dir at claim; do NOT invent a
VERB id) with a canonical mirror per wave2-verb-adjudication (3/7/28 partition: only the 3
mapped + enum-covered canonicals; NEVER heat/set/shake/spin/pellet — findings F1-F4 terrain),
materialNeeds with a capabilityRequirement, and constraints carrying a class id copied from
W2-2's MERGED vocabulary data (mutation arm flips it to an undeclared class -> §3 T2 fails
it). One intent step carries provenance {kind: record, type: vendor-protocol-candidate,
id: PDT-style or CAN- style candidate id, pageStart: 1}; an intentional missing-provenance
arm expects exactly the R-6 warning.

### 2.4 D — the PDT-axes -> branch_axes data flow (declared as data)

`schema/registry/branch-axis-mapping/pdt-axis-to-branch-axis.yaml` — registry DATA doc
(kind: branch-axis-mapping; NOT `.schema.yaml`, so SchemaLoader's `*.schema.yaml` discovery
skips it, exactly like wave2-naming-crosswalk.yaml; not a record kind, not a forbidden kind).
Declared mapping (fields named from §0.5's verified datatypes):
  - source: protocol-decision-tree `axes[]` (schema file :60-111) -> target:
    protocol `branch_axes[]` items = condition.schema.yaml#/$defs/BranchAxis.
  - field map: axisId -> axisId (both `^[a-z][a-z0-9-]*$`); question -> label; conditions ->
    conditions (SAME datatype, items pass through); choiceKey + origin + evidence +
    sectionId -> NOT carried into branch_axes (BranchAxis additionalProperties:false —
    the mapping names WHERE they live instead: the PDT record itself remains the
    question/evidence surface; branch_axes carries only the executable shape).
  - predicate rebinding: condition predicate paths target
    `$.branchSelection.<axisId>` (the rule already enforced by
    deriveDecisionTree.ts:9-13 — the mapping cites it as the implementation of the flow,
    code follows data, not policy).
  - scaleAxis -> branch_axes: NO (D9: execution scale is answered at realization,
    local-protocol.branch_resolution — W2-7 territory; say so in the file).
  - shared_stepIds optional passthrough.
A fixture built BY THIS MAPPING from a PDT axis (question "What is the DNA source?",
conditions with predicates on $.branchSelection.axis-dnasource) must validate (§3 T3,
acceptance "branch_axes accepts a PDT-derived axis fixture").

### 2.5 C — `schema/workflow/protocol.ui.yaml` (UI spec so the intent shape renders)

Additive display/form hints ONLY — zero app code (consumers untouched; §0.8 proves today's
widget ignores-but-preserves unknown step keys, so the intent shape already renders as
label/description without churn):
  - under `form.sections` Protocol block, no path change needed for $.steps
    (widget `protocol-step-roles` already owns steps); ADD a `display` or step-hint section
    mirroring the uiSpec affordances that exist (`app/src/types/uiSpec.ts` FieldHint/widget
    strings are free-form `WidgetType | string`, :52-54): declare intent-step hints —
    e.g. per-step readonly hint paths `$.steps[*].intent.semanticVerb` (label "Semantic
    verb", widget "ref" style readonly), `$.steps[*].intent.materialNeeds` (list),
    `$.steps[*].intent.constraints` (list), `$.steps[*].intent.provenance` (refs) — using
    the shape the loader accepts (UISpecLoader requires uiVersion+schemaId only,
    `server/src/ui/UISpecLoader.ts:34` — validate nothing breaks by the §4 ui smoke test or
    the existing UISpec tests).
  - One comment header line: the custom `protocol-step-roles` taptab widget is the RENDERER;
    these hints are data for the W2-8 SAID/MEANT surface to consume; W2-3 changes no widget.

### 2.F E — crosswalk integration

READ the merged `schema/registry/wave2-naming-crosswalk.yaml` first (79016be9 keys per §0.4;
merged trunk wins). If `Wave2NamingCrosswalk.test.ts`'s admission predicate requires the
step-shape nouns (`intent step`, `literal step`) to be listed before fixtures/tests may use
them, add entries with status existing bound to protocol.steps[].intent (schema path + line),
curie_plan cf:intent-step per the file's own convention; if the test passes without them
(field names are not among applies_to nouns "noun, datatype, constraint class, provenance
rung, capability term"), record that finding and ADD NOTHING. Never edit the admission test.

## 3. Test plan (RED-first, exact harnesses — COPY, don't invent)

T1 `server/src/schema/Wave2ProtocolIntentSchema.test.ts` — harness: whole-tree
`loadAllSchemas({ basePath: join(process.cwd(), 'schema') })` + registry topological order +
`createValidator({ strict: false })` — the exact pattern of
`server/src/schema/BranchAxisSchemaContracts.test.ts:28-40` (vitest ONLY from `<wt>/server`).
Arms:
  a. legacy inventory byte-stability: parse all SIX `records/seed/protocols/prt-seed-*.yaml`
     from disk, validate against protocol.schema.yaml -> ALL valid (proves the 9th oneOf
     member broke nothing; acceptance "each legacy inventory record still validates
     unchanged").
  b. intent family fixture valid (schema layer).
  c. hidden literal: same fixture + `volume_uL: 7` inside an intent step -> INVALID;
     + `catalog: D1001` inside an intent step -> INVALID (the named acceptance arm).
  d. arm-3 actionability: violation on an intent step names the literal key path in at
     least one error (message-content assertion).
  e. intent WITHOUT semanticVerb -> INVALID (required [semanticVerb]).
  f. verb-definition ref shape: semanticVerb.ref constrained type const verb-definition —
     a ref with type: material -> INVALID (mirror SemanticVerbRef :674-680).
  g. PDT-derived branch_axes fixture (§2.4) validates inside a full protocol record AND
     at the condition datatype level (acceptance "branch_axes accepts a PDT-derived axis
     fixture").
  h. W2-2 cross-file closure (the DSL cannot): parse the MERGED constraint-vocabulary data
     doc, extract declared class ids, assert the fixture's `constraints[].class` ids are
     members; mutated fixture with an undeclared class fails the assertion (mutation =
     the test fails, non-vacuity). Also assert quantity datatype refs resolve inside the
     validator (integration-level).
T2 `server/src/lint/Wave2ProtocolIntentRules.test.ts` — harness: parse the REAL
  `protocol.lint.yaml` from disk into a `LintEngine` + lint inline payloads, the exact
  pattern of `server/src/lint/ProtocolLintRules.test.ts:22-55` (fileURLToPath
  ../../../schema/workflow/protocol.lint.yaml; engine.addSpec('protocol', spec)). Arms:
  a. new literal protocol (recordId NOT in allowlist, steps with volume_uL, no intent) ->
     R-4 ERROR naming the recordId + step ids (acceptance "a NEW literal protocol is
     rejected by the legacy-bounds lint");
  b. each of the six inventory payloads -> ZERO findings from R-4/R-5 (clean; plus the
     pre-existing R2 warning only if a seed role is non-identity-bearing — SET the
     expectation to what the CURRENT trunk emits on those files at claim; record it);
  c. allowlist member + one intent step -> R-5 warning (the frozen inventory bites);
  d. intent family fixture -> zero ERRORS; the missing-provenance arm -> exactly the R-6
     warning;
  e. R-1 role-closure regression: an intent fixture whose materialNeed references an
     undeclared role still errors via R1 only where R1's paths exist — state honestly in
     the report that R1 reads literal payload paths (target/source/instrumentRole) and
     intent-step role closure against declared roles is NOT yet mechanically closed (schema
     cannot; lint DSL cannot wildcard-nest under intent[] items with allIn over projections
     of a per-item object — if the coder finds an everyItem+allIn composition that DOES
     close it, ship it as R-8 and note the upgrade; otherwise §8.5 records the gap,
     W2-5/W2-6 keep it visible);
  f. existing R1-R3 suites green untouched (full src/lint scope).
T3 meta: validate both touched YAMLs against lint-v1 meta-schema + UI spec load (mirror
  ProtocolLintRules' meta-schema block pattern); integration.test.ts whole-tree loader green
  (first targeted check, §4.2).
Crosswalk leg: `Wave2NamingCrosswalk.test.ts` (W2-1's) green untouched with any §2.F
additions. Seed legs: `src/seeds/protocol.seed.test.ts` + `src/protocol/seedProtocols.test.ts`
+ `src/schema/SeedProtocolPhases.test.ts` green (record dir untouched — prove it).

## 4. RED-first build order + exact commands (vitest ONLY from `<wt>/server`; worktree
bootstrap = standard lane 6 symlinks + lane-exclude copies; git ALWAYS -c core.fileMode=false)

1. RED: write T1+T2 fixtures/arms first; they FAIL (no `intent` def yet, no lint rules).
   Capture RED output in the report.
2. FIRST TARGETED CHECK — the single command that proves the approach early and that a
   broken schema edit can never pass silently:
   `cd <wt>/server && npx vitest run src/schema/integration.test.ts` => green (whole-tree
   loader: your protocol.schema.yaml still compiles, every $ref incl. W2-2's resolves,
   `errors: []`). Run it immediately after step 3's schema edit and after every $ref change.
3. GREEN-schema: A (§2.1 arms incl. IntentStepPayload/StepProvenanceRef) ->
   `npx vitest run src/schema/Wave2ProtocolIntentSchema.test.ts` => green (arms a-g).
4. Data flow: D (§2.4) + T1 arm g PDT fixture => green.
5. Lint: B (§2.2) + crosswalk additions (E, if §2.F demands) ->
   `npx vitest run src/lint/Wave2ProtocolIntentRules.test.ts` => green;
   `npx vitest run src/lint/ProtocolLintRules.test.ts` => green (R1-R3 untouched).
6. UI spec: C (§2.5) -> `npx vitest run src/ui` (or the UISpec suite on your trunk — locate
   via `ls <wt>/server/src/ui/*.test.ts`; if none, the boot loader test in
   src/server covers load — name the one you ran).
7. Whole-scope: `npx vitest run src/schema src/lint` vs §6 baseline SET.
8. tsc + ownership greps (§6). Report + commit (owned files only). Final line `W2-3 DONE <sha>`.

## 5. Acceptance criteria (VERBATIM from the task block, `verified by:`)

> Headless: fixture family with intent steps passes schema+lint; the same content with a
> hidden literal volume/catalog field inside an intent step is REJECTED; each legacy
> inventory record still validates unchanged; a NEW literal protocol is rejected by the
> legacy-bounds lint; branch_axes accepts a PDT-derived axis fixture; app+server typecheck
> clean (schema is data — consumers untouched).

Clause -> proof map: fixture family -> T1 b + T2 d; hidden literal -> T1 c (+ d actionable);
legacy records -> T1 a (+ T2 b at lint); new literal rejected -> T2 a; PDT axis fixture ->
T1 g + T3; typecheck -> §6 pins below (zero deltas); consumers untouched -> §6 TS-emptiness
grep. Description clauses that bind: "Keep branch_axes/variants/protocolLayer: universal
semantics" (byte-unchanged except the branch_axes description sentence); "declare PDT-axes ->
branch_axes data flow" (D); "UI spec so the intent shape renders" (C).

## 6. Baselines and pins (RE-MEASURE every one on your claim base; SET identity is the gate)

- PRIMARY SCOPE SET: `cd <wt>/server && npx vitest run src/schema src/lint 2>&1 |
  grep -E "FAIL" | sed 's/.*FAIL *//' | sed 's/ >.*//' | sort -u > /tmp/l2t<id>-ff.txt;
  comm -3 /tmp/l2t1130-failfiles-schema-lint.txt /tmp/l2t<id>-ff.txt` => EMPTY vs YOUR
  claim-base re-measure. Composer's pin at e830cffb: exactly 2 failing files
  (`src/schema/EventGraphEquipmentSchema.test.ts`,
  `src/schema/LabwarePhysicalGeometryData.test.ts`, /tmp/l2t1130-failfiles-schema-lint.txt).
  Trunk WILL differ post SPINE-7/W2-1/W2-2 merges: re-measure the SET at claim; your tests
  may only REDUCE failures, never add.
- server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' |
  sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t<id>-tsc-server.txt && comm -3
  /tmp/l2t2230-tsc-server.txt /tmp/l2t<id>-tsc-server.txt` => EMPTY vs claim-time re-measure
  (pin /tmp/l2t2230-tsc-server.txt = 26 lines / 6 files, sha256
  924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41 — composer re-verified
  present+hashed this tick). Non-zero tsc exit is BY DESIGN — never demand green.
- app tsc: `cd <wt> && npm run typecheck -w app 2>&1 | grep 'error TS' |
  sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t<id>-tsc-app.txt && comm -3
  /tmp/l2t2230-tsc-app.txt /tmp/l2t<id>-tsc-app.txt` => EMPTY (pin 34 lines; app files are
  untouched so this must be trivially equal — its purpose is proving the ZERO app edits).
- Contract-only proof: `git -c core.fileMode=false diff --name-only <base>..HEAD |
  grep -v -E '^schema/workflow/protocol\.(schema|lint|ui)\.yaml$|^schema/registry/branch-axis-mapping/|^schema/registry/wave2-naming-crosswalk\.yaml$|^server/src/(schema/Wave2ProtocolIntentSchema|lint/Wave2ProtocolIntentRules)\.test\.ts$|^\.hermes/plans/'`
  => EMPTY; AND `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src app
  | grep -v '\.test\.ts$'` => EMPTY (zero production TS).
- Byte-stability proof: `git -c core.fileMode=false diff <base>..HEAD -- schema/workflow/
  protocol.schema.yaml` => additions only (no removed/modified lines except the single
  branch_axes description append); `... -- records/` => EMPTY; `... -- schema/registry/
  protocols/` => EMPTY.
- Hardcode grep: `git -c core.fileMode=false diff <base>..HEAD -- server/src |
  grep -inE 'zymo|prt-seed|volume_uL|catalog'` => EMPTY (the inventory lives in lint YAML;
  fixture strings live in test files under src/{schema,lint}/Wave2*.test.ts — allowed
  there, name them in the report).

## 7. Worker contract

- Branch `w2-3-lane2-l2t<tickid>` off `cl/integration-2` TRUNK TIP AT CLAIM; the tip MUST be
  a descendant of the W2-1 merge AND the W2-2 merge (hard deps — `git merge-base --is-ancestor`
  both, record output in the report header; if W2-2 has not merged, DO NOT START: report
  deps-unmet and exit, do not specify around the missing quantity/constraint datatypes).
- Worktree `/mnt/vast/home/brad/git/wt/W2-3-lane2-l2t<tickid>` + standard lane bootstrap
  (6 symlinks + lane-exclude copies; `/tmp/lane2-sync-wt.sh` precedent; lane-excluded
  symlinked tests resolve to MAIN's sources — never gates).
- Unique deliverables: report `<wt>/.hermes/plans/W2-3-report.wip-l2t<tickid>.md`, log
  `~/.hermes/cl/lanes/2/logs/coder-W2-3-l2t<tickid>.log`, captures `/tmp/l2t<tickid>-*`.
- Headless — NO browser gate, NO :3093/:5193/:3001/:5174; one worker; NEVER `git add -A`;
  final line `W2-3 DONE <sha>`.
- CONTRACT ASSUMPTIONS on W2-2 (verify against merged files AT CLAIM; merged trunk wins,
  adapt, record deltas — never edit W2-2's artifacts):
  AS-W23-W22-QUANTITY: `schema/core/datatypes/quantity.schema.yaml` with qualifier
  [exact, approximately_zero] at core/datatypes (OQ1 placement adjudicated core; W2-3
  references by the merged file's actual `$id`).
  AS-W23-W22-CONSTRAINT: `schema/registry/constraint-vocabulary/constraint.schema.yaml`
  with {class, bound, subject, bindingKind [vendor_default, hard_bound], overridePolicy} —
  mount per its merged shape; class ids come from the merged vocabulary DATA doc (8+1);
  capabilityRequirement reaches equipment-capability/CL: CURIE the way W2-2 declared.
  AS-W23-W21-KEYS: crosswalk entry keys per §0.4 as merged.
- Report must carry: RED capture, §4.2 first-check output, every §6 command's verbatim tail,
  the byte-stability diff proof, the W2-2/W2-1 merged-shape delta table (assumed -> found),
  the §5 clause->proof walkthrough, §8 dispositions, `diff --name-only` list, the honest
  intent-role-closure status (§2.2 R-8 or the recorded gap).
- Stop-and-report over faking: any acceptance arm unreachable at your base -> probe evidence
  + clause named, never a weakened fixture. If an intended lint arm proves DSL-inexpressible
  -> STOP-and-report (no PredicateEvaluator edits).

## 8. Reviewer bait (likely edge errors for THIS item — pre-empt each in the report)

8.1 Inventory conflation: zymo-magbead-minimal / test-wash-protocol are protocol-SPEC
    registry docs (zod, ProtocolSpecRegistry.ts:24-40), NOT kind:protocol records — no
    record-lint can ever bound them. Putting their ids into the lint allowlist is WRONG
    (recordId never equals them) and pretending they "validate unchanged via the triplet" is
    false. Correct disposition: lint allowlist = the six prt-seed-* ONLY; the two registry
    docs stay byte-unchanged under D2 as legacy input, their own tests green, and the report
    states the boundary explicitly.
8.2 The union trap: converting `oneOf` to `anyOf`, relaxing a payload def's
    additionalProperties:false, or adding `intent` to a payload def's properties list each
    SILENTLY resurrects the hidden-literal hole. The reject power comes from the closed
    payload defs + a thin intent branch; prove T1 c stays red-for-the-right-reason after
    every schema tweak (Ajv error path names the failing requirement).
8.3 OneOf ambiguity: if BOTH a literal branch and the intent branch could match, oneOf
    rejects — good — but check the thin IntentStep branch does NOT additionally require a
    kind const or payload field, or a legitimate intent step could match zero branches.
    T1 b is the tripwire.
8.4 Zero trap inheritance: do not re-implement quantity bounds in protocol.schema.yaml —
    bind W2-2's datatype by $ref; a copy of `minimum: 0`/`exclusiveMinimum: 0` here is the
    exact duplication W2-2 §6.1 warned about (concentration's exclusiveMinimum:0 trap).
8.5 Intent role closure is NOT mechanically complete: R1 reads literal payload paths only
    (§3 T2 e — record honestly, propose R-8 only if DSL-provable with an existing op, never
    "fixed it" vaguely; a DSL extension is out of scope).
8.6 Duplicate rule ID: `LintEngine.ts:61` throws GLOBALLY — prefix every new rule id; a
    collision with a SPINE/W2-2 sibling reds the WHOLE src/lint scope at boot-time tests,
    which is why §4.7 runs the scope, not just your file.
8.7 YAML-reload trap: the lane stack does NOT hot-reload YAML (`tsx --watch` caveat); W2-3
    is headless so this only matters if the orchestrator restarts :3093 after merge —
    `cl-lane-stack.sh 2 restart` is BLOCKING -> background=true. Never touch :3001/:5174.
8.8 exactOptionalPropertyTypes (backend ON): test fixtures build optional intent subfields
    (`provenance`, `capabilityRequirement`, `constraints`) — ABSENT means ABSENT, conditional
    spreads only, never `undefined` (SPINE-7 D2 was exactly this class).
8.9 Hardcode boundary (CLAUDE.md §Non-Negotiables, principles §6/§9): the legacy allowlist,
    the forbidden-literal-key list, and the PDT field map are YAML/data; a TS Set of record
    ids, a TS branch-mapping table, or a per-vendor branch anywhere in the diff = reject
    (the §6 hardcode grep enforces).
8.10 Verb sovereignty: `intent` is a SLOT, not a vocabulary — semanticVerb stays a
    verb-definition REF (SemanticVerbRef :669-685); minting `canonicalVerb`, an intent-verb
    enum, or touching the 31-enum/verb-adjudication counts = reject (W2-1 is the verb
    authority; F1-F6 verbs stay buried).
8.11 Rung-name leakage: no VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION strings in
    W2-3 files — W2-4 owns that admission; StepProvenanceRef stays rung-agnostic (refs +
    anchors only).
8.12 CURIE honesty: capabilityRequirement targets go through the EXISTING
    equipment-capability machinery (`CL:` double-namespace caveat — equipment-capability
    :39-43,57 per W2-2 §6.11); a fourth prefix = reject.
8.13 Seed-record temptation: "each legacy inventory record still validates unchanged" means
    UNCHANGED — editing a prt-seed file to make a lint arm pass is a reject; the §6 records/
    diff-empty grep enforces.
8.14 Pre-deps drift: W2-2 merged shapes (placement, class-id spellings, qualifier enum),
    W2-1 merged crosswalk keys, and post-SPINE-7 fail-file baselines may differ from this
    draft — §7 assumptions list is the reconciliation contract; merged trunk wins.

## 9. Open questions for orchestrator (composer could not resolve locally)

OQ1 — Legacy-bounds strictness for MIXED new protocols. R-4 as drafted requires EVERY step
of a non-inventory protocol to be an intent step — so a partially-upgraded new protocol
(one intent step + one literal) cannot be authored at all. Alternative reading: only
PROHIBIT intent+literal on the SAME step, allow new all-literal protocols to validate and
let W2-5/W2-6 policy phase them out. The task wording ("newly authored literal protocols
cannot qualify") supports the strict form — composer chose strict; confirm or relax (the
relaxation is a one-rule edit). Checked: task block :4236-4252, D1 wording :4081-4083,
R2-warning precedent for legacy tolerance.
OQ2 — The two registry protocol-SPEC docs (zymo-magbead-minimal, test-wash-protocol) live
outside every mechanism W2-3 ships (zod registry, not records — §8.1). They are named in the
task's inventory but lint cannot bound NEW additions to THAT surface (a new file in
schema/registry/protocols/ passes zod regardless of W2-3). Options: (a) declare the registry
surface frozen for wave 2 in the report + crosswalk note (composer's default, zero code);
(b) a collection/repo-scope lint rule — impossible today, engine is record-scope-only
(LintEngine.ts:126-129); (c) a server test asserting the directory's file set is frozen —
touches only test files but arguably duplicates lint's job and skirts "no TS policy".
Composer did (a); flag if you want (c). Checked: ProtocolSpecRegistry.ts:24-42, both YAMLs,
LintEngine scope switch.
OQ3 — W2-2 contract gaps binding W2-3: (1) W2-2 draft does not state constraint.schema.yaml's
`$id` or whether `class` is a plain string id vs {ref} object — W2-3's fixture copies the
merged shape; if W2-2 promotes with `class` as an object-ref, T1-h fixture + §7 assumption
AS-W23-W22-CONSTRAINT need the edit (confirm at promotion). (2) W2-2 draft has intent steps
consuming `capabilityRequirement` on the CONSTRAINT object; §2.1(ii) also puts one on
materialNeeds — composer kept both (constraint-scoped and need-scoped capability differ:
"this bound needs a bead-beater" vs "this material need needs a capability class"); if
redundant, drop the materialNeeds one and let constraints own capability (W2-6's extraction
shape should decide). (3) Relative-$ref reachability from schema/workflow/ to
schema/registry/constraint-vocabulary/ (../../registry/...) is unverified until W2-2 merges —
§4.2's first targeted check is the designated probe; if the loader cannot resolve it, the
fallback is $ref-by-absolute-$id (check SchemaLoader ref style precedent:
protocol-decision-tree.schema.yaml:111 uses ../ relative).

---
## ORCHESTRATOR PROMOTION RECORD (l2t1611, 2026-10-09 ~16:45 EDT) — PROMOTED, dispatch-ready

W2-2 merged into trunk at 796cfc0f (tip incl. fix cycle 1 e3756acd: the maximum class's
default pair lab-may-tighten:hard_bound is DECLARED compatible — tighten-is-always-legal
ruling; lab-may-relax:hard_bound remains undeclared/forbidden; policyBindingKeys has
exactly 4 pairs). Promotion checklist, all verified by orch against MERGED files:

- AS-W23-W22-QUANTITY CONFIRMED: schema/core/datatypes/quantity.schema.yaml exists, $id :2
  = .../computable-lab/datatypes/quantity.schema.yaml; qualifier enum [exact,
  approximately_zero] shipped (OQ2 ACCEPTED stands — W2-3 BINDS it).
- AS-W23-W22-CONSTRAINT CONFIRMED: schema/registry/constraint-vocabulary/constraint.schema
  .yaml $id :2 = .../computable-lab/registry/constraint.schema.yaml. `class` is a PLAIN
  STRING id (pattern ^[a-z][a-z0-9_]*$, :35-37) — NOT an object-ref: OQ3(1) resolved, the
  T1-h fixture shape is right as drafted. quantity-ratio ships at
  schema/core/datatypes/quantity-ratio.schema.yaml ($id .../datatypes/quantity-ratio
  .schema.yaml). bindingPolicyKey is a constraint property (:82); vocabulary ids are plain
  ids (ratio, concentration, per_unit_dose, minimum, maximum, capacity, threshold, ordering,
  completion_condition, vendor_default) + policies (lab-may-relax, lab-may-tighten,
  never-override) — the class ids in fixtures MUST match these strings exactly.
- OQ3(2) capabilityRequirement: constraint-scoped EXISTS (:109) — keep both surfaces as
  composed unless the merged shape contradicts (it does not).
- OQ3(3) relative-$ref probe: NOTHING in merged schema/workflow/ or schema/core/ uses a
  ../../registry/ ref yet — W2-3's §4.2 step 1 probe is the FIRST such ref; if the loader
  cannot resolve it, fall back to $ref-by-absolute-$id (fallback pre-approved by orch).
- OQ1 strict form ACCEPTED (registry-freeze-by-report for OQ2 ACCEPTED; both dispositions
  already pasted in the W2-2-era task block — restated here as the canonical record).

CONSTRAINT for this item: do NOT spend rung names VENDOR/DERIVED/INFERRED_INVARIANT/
LOCAL_REALIZATION (W2-4's admission).
