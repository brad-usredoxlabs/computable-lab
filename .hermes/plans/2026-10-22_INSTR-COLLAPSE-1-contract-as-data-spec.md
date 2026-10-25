# INSTR-COLLAPSE-1 — B-prime collapse: retire the instrument record kind; equipment owns asset truth; acquisition-context contract AS DATA first

PROMOTED 2026-10-22T01:30 by the lane-1 orchestrator — CANONICAL for INSTR-COLLAPSE-1.
PROMOTION BLOCK (binding; supersedes conflicting draft text):
  P1. SCOPE = C1+C2 ONLY. C3/C4/C5 are authored as the follow-up item INSTR-COLLAPSE-2
      (deps [INSTR-COLLAPSE-1]); the C3-C5 rollout text below remains as the follow-up's
      contract sketch and the C1/C2 rebase context — do NOT ship C3+ commits in this item.
  P2. OQ-1 IS DECIDED (architect, 2026-10-22, .hermes/plans/2026-10-22_instr-collapse-oq1-capability-gate-decision.md,
      STATUS: decided — shape (a) refined): the declared capability requirement is a schema-side
      `x-capability-gate` annotation on the equipment ref slot (added in C2 alongside the retarget),
      consumed by ONE generic TS validator server/src/capabilities/DeclaredCapabilityGate.ts with
      name-registered verb resolvers (precedents: x-jsonld ContextBuilder.ts:154; derivedFrom.fn
      verb-definition.schema.yaml:83-86). Two resolvers ship: sibling-verb-ref (planned-run compiled
      step verbRef :412-413) and read-event-verb (measurement readEventRef -> event-graph
      semanticKeyComponents.verb -> verb-definition byCanonical, reusing ProtocolCompiler.ts:317-334
      index shape). Wire at MeasurementService.ingest (post ref-parse, pre store.create) and the
      planned-run save path; reject code capability_gate_unsupported (400); verb-unresolvable FAILS
      CLOSED code capability_gate_verb_unresolvable. Stop boundary 3 is SATISFIED and closed. The
      decision doc's RED-first test shape (incl. reject-kind-correct-no-binding and the RIP-OUT
      annotation-removal proof), R1 (schema-by-id accessor allowed), R2 (measurement-context
      un-gated in C2) and R3 (planned-run reduction rule) are BINDING for C2.
  P3. OQ-2 BLESSED KEEP (instrument-definition kind + schema/registry/instruments/ stay; naming
      fold = separate future item). OQ-3 BLESSED KEEP ('instrument' concept-vocabulary surfaces
      stay). Do NOT re-ask either.
  P4. Cite correction from orch review: ref.schema.yaml lives at schema/CORE/datatypes/ (revisionRef
      :29/:31-40); `$ref: "./datatypes/ref.schema.yaml"` in schema files resolves via the loader's
      core mapping — cite schema/CORE/datatypes/ref.schema.yaml in new docs.
Composed as draft 2026-10-21T23:40 EDT by cl-spec-composer (session for lane 1, tick l1t2340) for lane 1.
Trunk: /mnt/vast/home/brad/git/cl-integration-1, branch cl/integration-1, HEAD 75f1c74f at composition time.
All file:line evidence below was read first-hand in the trunk at 75f1c74f (no scout used — every cite is a
first-hand read). Live corpus facts carried from the decision record + QMS8-C spec recon (0 instrument
records, 38–39 equipment); NOT re-probed against :3092 this composition (lane stack belongs to the running
QMS8-C coder — probe at claim time, see first-targeted-check).

Authorities honored (binding, do not re-litigate):
- Ruling memo ~/.hermes/specs/intake/2026-10-21_instrument-vs-equipment/answer.md — §2 (five load-bearing
  facts), §3 (ownership boundaries; historical context must not silently resolve to today's facts),
  §4 (field dispositions), §5 (what breaks / capability-validation not kind-widening / blob paths don't
  move), §7 (migration sequence).
- Decision addendum .hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md :106-124 (Brad B-prime ruling
  2026-10-21T19:15; sequencing gate: contract-as-data BEFORE removal; instrument.schema.yaml owned HERE).
- Task block /home/brad/.hermes/cl/lanes/1/task-list.md:6739-6838 (surface list re-verified against code —
  deltas recorded in the recon section below).

## Goal (one sentence)

Retire the `instrument` record kind (schema/lint/ui, registry entry, refs, create surface) so `equipment`
is the single asset identity — after FIRST declaring the measurement/acquisition-context contract as data
(equipment source + operation/capability binding + configuration + produced data-references +
revision-pinned QMS-at-acquisition context) — with "instrument" surviving only as ontology classification
on equipment-class and a capability-derived UI filter view.

## Accepted intent — acceptance criteria VERBATIM from the task block (lines 6806-6821)

verified by: >-
  (1) Spec contains the acquisition-context contract AS DECLARED DATA (paths
  named, slots listed) BEFORE any deletion step — reviewer blocks merge if
  deletion commits precede the contract commit. (2) Historical-stability test:
  an acquisition keeps naming the calibration/method context in force AT
  acquisition time after the equipment record later changes (memo §3's pin).
  (3) Capability-validation pin: a ref contract rejects equipment lacking the
  required capability binding (not record-kind, not name-literal). (4) Grep
  proof: zero instrument-kind refs after merge (except instrument-log's own
  historical kind name if retained per spec audit); instrument.{schema,lint,ui}
  absent; registry-kinds entry gone; no TS kind-literal residue. (5) Suites
  green updated-not-pinned-around (measurement, planned-run, event-graph,
  readiness, run-context, registry). (6) BROWSER GATE: the registry shows ONE
  row per machine (equipment) with a derived 'measurement-capable'/'instrument'
  filter view proving (a)/(b) survival; no 'Create instrument' entry;
  EQP-QUANTSTUDIO5 still shows its capability ECP-QUANTSTUDIO5. VERDICT: accept.

## RECOMMENDED LEG SPLIT (honest scope read — exceeds one 2-4h coder session)

Full surface below is ~5 commit legs (C1..C5) ≈ 6-8h across two sessions. RECOMMENDATION: ship this item
as C1+C2 (contract-as-data + retarget + capability validation — the ruling's binding sequence step (1) and
(2)); open a sequential follow-up item **INSTR-COLLAPSE-2** = C3+C4+C5 (deletion + code residue + derived
UI view + browser gate), deps [INSTR-COLLAPSE-1]. The follow-up split is ALSO the safe order: deletion
only after every ref has actually retargeted on trunk and gone green twice. If the orchestrator rejects
the split, C1..C5 run as one item across a resume session (QMS8-C resume precedent). The remainder of this
spec covers all five legs; legs are independently reviewable commit boundaries either way.

============================================================================
## Rebase note — QMS8-C lands BEFORE this item (binding)

QMS8-C (retire domain `status` on lifecycle-governed kinds) merges first. What may shift under this spec:
- schema/lab/instrument.schema.yaml: its `status` property (:75-78 today) is expected to be ALREADY
  deleted by QMS8-C when this item's C3 deletes the whole file — whole-file deletion is immune to line
  drift; re-take the diff at claim time. (Task note: QMS8-C must NOT touch instrument.schema.yaml beyond
  status-retirement — decision file :119-120.)
- schema/lab/equipment.schema.yaml: `status` required-entry (:16) and property (:73-75) will be gone;
  `required` becomes [kind, id, name]. All :49-56 cites below are pre-QMS8-C; equipment.instrumentRef
  RETIRES HERE (C2), unaffected by QMS8-C scope.
- schema/registry/registry-kinds.registry.yaml: QMS8-C's C4 retires the migration block in this file —
  this item's C3 deletes only the `- kind: instrument` entry (:14 today). Same file, adjacent hunks —
  expect one rebase conflict; resolve toward both rulings.
- app LabCollectionView label: QMS8-C's D8-(i) interim rename ("Instruments & Equipment" → truth-label)
  is SUPERSEDED by this item's removal of the separate kind (task block :6786-6787); resolve toward the
  single Equipment view + derived filter (C5).
- Grep baselines pinned in this draft were taken at 75f1c74f, BEFORE QMS8-C merges; re-pin at claim time
  (first-targeted-check step 0).

============================================================================
## The acquisition-context contract AS DECLARED DATA (verified-by 1 — this section IS the contract; C1 ships it)

Contract (memo §3): Evidence → data-reference → acquisition context → equipment, plus operation+capability,
configuration, materials/plate mapping, and QMS-at-acquisition context that is revision-pinned or
snapshotted. Every slot below REUSES existing machinery and names it; no new kind is introduced anywhere
in this spec (the ruling's "STOP AND FLAG architecture-re-up" block was NOT triggered — every slot has a
host, see table).

| Slot (memo §3)                                  | Host (existing, named)                                                             | C1 change |
|---|---|---|
| physical source (equipment ref)                 | schema/lab/measurement-context.schema.yaml `instrument_ref` (required :18, property :36-37) and measurement.schema.yaml `instrumentRef` (:38-40) | rename to `equipmentRef`/`equipment_ref`; constrain ref target `type: const equipment` (pattern precedent: equipment.schema.yaml equipmentClassRef :34-47 pins `type: equipment-class` inside allOf on datatypes/ref.schema.yaml) |
| operation + applicable capability binding       | equipment-capability records (schema/workflow/equipment-capability.schema.yaml: `equipmentRef` :32-38, `equipmentClassRef` :45, `capabilities[].verbRef` VERB-* :64-71; seed ECP-QUANTSTUDIO5 records/seed/equipment-capability/ecp-quantstudio5.yaml binds VERB-READ) | no new fields; the contract DECLARES that a measurement's source must resolve a verb binding via the shipped resolver EquipmentCapabilityService (server/src/capabilities/EquipmentCapabilityService.ts:50, CapabilityResolutionRequest {equipmentId, verbId} types/capabilityAuthorization.ts:186-188) — verb comes from the read event's data, never a TS literal (see hard rules) |
| plate/sample mapping                            | measurement-context.schema.yaml `source_ref` (:33-34) + well-role machinery (already hosts it); measurement.schema.yaml `labwareInstanceRef` :42-44 | none |
| configuration / settings                        | equipment.schema.yaml `settings` (:83-85, instance settings keyed by class `settingsDefinition`, equipment-class.schema.yaml :59-109); measurement.schema.yaml `channels` (:62-77) + `notes` | none |
| method / readout                                | measurement-context.schema.yaml `assay_def_ref` :39-40, `readout_def_refs` (required, minItems 1) :42-46 | none |
| QMS-at-acquisition context (calibration / authorization), historically stable | ref.schema.yaml `revisionRef` (:31-40, "Optional immutable revision; resolves instead of the mutable record head") + governance/record-revision.schema.yaml; calibration-record (schema/lab/calibration-record.schema.yaml), competency-authorization (schema/lab/competency-authorization.schema.yaml) | measurement-context.schema.yaml gains `acquisition_context` (small object: `calibration_refs`, `authorization_refs` — each item a datatypes/ref.schema.yaml so revisionRef pinning is legal at every element, + free `note`), `additionalProperties: false` keeps smugglers out |
| produced data references                        | data-reference.schema.yaml (kind :19-20, `acquisitionContext` :63-73, `sourceRunRef` :75-86, `path` example "instruments/qs5/run42.fcs" :38); measurement.schema.yaml `artifacts` :115-127 | data-reference `acquisitionContext.instrument` (:68, free string) → `equipment_ref` object host of ref.schema.yaml (keeps `revision`/`note`); string blob paths DO NOT MOVE (memo §5) |
| experiment convenience list                     | experiment.schema.yaml `instruments` (:89-91, "convenience only") | retarget to equipment ids in C2, description re-worded (memo §5: must not substitute for acquisition provenance) |

Historical-stability mechanism (verified-by 2): reuse ref.schema.yaml revisionRef — C1's contract commit
ships the shape; C1's RED-first test writes a measurement-context whose calibration_ref carries a
revisionRef, mutates the live calibration record afterward, and asserts the pinned revision content still
resolves. No new immutability machinery is invented.

## Recon (first-hand at 75f1c74f; deltas vs the task block's architect list are marked DELTA)

(a) SURFACE CONFIRMED — instrument-kind refs (file:line, all read this session):
- schema/lab/instrument.schema.yaml — 129 lines; kind const :16-18; id pattern ^INSTR- :23; duplicated
  asset fields manufacturer/model/serial :50-60; ontology `class` CURIE array :41-48 (MIGRATES to
  equipment-class in C1 — see (d)); informal `capabilities` strings :80-86 (die — memo §4: no second
  capability vocabulary); `interfaces` :88-109 (dies with the kind; NOTE: equipment.schema.yaml has NO
  interfaces property — see OQ-2); `equipmentRef` :62-69; lifecycleId/state :115-123.
- schema/lab/instrument.lint.yaml (authoring guard, denyCode INSTRUMENT_AUTHORING_FORBIDDEN :9) +
  instrument.ui.yaml (schemaId-bound) — both die in C3 with the schema.
- schema/core/record.schema.yaml :17 — oneOf entry $ref instrument.schema.yaml (must drop in C3;
  :18 instrument-definition is a DIFFERENT kind, stays).
- schema/registry/registry-kinds.registry.yaml :14 `- kind: instrument` (C3).
- schema/lab/measurement.schema.yaml :38-40 instrumentRef (bare ref.schema.yaml, NO type constraint
  today — any ref shape passes); measurement.ui.yaml :42-44 renders it with label "Instrument" (no refKind).
- schema/lab/measurement-context.schema.yaml :18,:36-37 instrument_ref (required, bare ref).
- schema/knowledge/data-reference.schema.yaml :63-73 acquisitionContext (instrument: string :68).
- schema/workflow/planned-run.schema.yaml bindings.instruments :128-131; $defs/InstrumentBinding
  roleId+instrumentRef :343-352 ("Concrete instrument reference", bare ref); executionMode enum
  [manual, instrument] :420 — MODE NAME, survives (see f); planned-run.ui.yaml :62-64 "Instrument Bindings".
- schema/workflow/event-graph.schema.yaml executionMeta.instrumentRef :119-121 ("Robot/instrument that
  executed the run") + instrumentLogRef :122-124 (a STRING id link to the instrument-log kind — kind name
  survives per audit (g)); freebench deck placements :255-275 key off lawn/surfaceId, no instrument kind
  ref — DELTA vs task block: the deck/lawn surface carries NO instrument-kind references; nothing here to
  retarget.
- schema/workflow/graph-component-instance.schema.yaml instruments[].instrumentRef :68-76 (open object,
  additionalProperties: true).
- schema/workflow/sidecar/gemini-active-read-request.schema.yaml instrumentRef :11-12 (open object).
- schema/lab/instrument-log.schema.yaml instrumentRef :25-27 ("Which instrument produced this log"),
  kind const "instrument-log" :17, id ILOG-* :22; instrument-log.lint.yaml rules: [] (:3 schemaId only);
  instrument-log.ui.yaml :42-44 renders $.instrumentRef. AUDIT (verified-by 4's "retained per spec audit"):
  the KIND NAME instrument-log survives (it is an operational log of a machine, memo §2: an execution log
  is not a measurement); its `instrumentRef` retargets to equipment-ref in C2 and the file/property NAMES
  stay. 10 TS files query kind:'instrument-log' (ExecutionControlService.ts:166, ExecutionTaskService.ts:502,
  ExecutionTimelineService.ts:75, ExecutionRunner.ts:28,156,337, executionTools.ts:1460,
  ExecutionHandlers.ts:812, MeasurementActiveControlService.ts:9,106,254-258, instrument-log fixtures) —
  all stay green unchanged if the kind name stays.
- schema/lab/equipment.schema.yaml instrumentRef :49-56 — RETIRES (self-reference class; the memo's
  reciprocal-ref defect). equipment.ui.yaml :46-49 ("Linked Instrument", refKind: "instrument") — field
  gone C2. equipment.lint.yaml guardWhenChanged entry :23 — entry gone C2.
- schema/lab/labware-instance.schema.yaml location.kind :58-60 — "instrument" appears ONLY in the
  description text (no enum); location.ref :61-62 is a plain string. Memo §5: the WORD stays (a plate sits
  IN a machine); C2 updates the description to name equipment as the resolution target.
- schema/studies/experiment.schema.yaml :89-91 convenience list (items: plain strings today — C2 keeps the
  string shape, retargets semantics + description).
- schema/studies/run-timeline.schema.yaml :229-230 `instrument: type: string` — free-text display field,
  not a ref contract; C2 relabels description (DELTA: task block did not name it; grep found it).
- schema/registry/predicates.registry.yaml CL:measures subject_kinds ["assay","measurement","instrument"]
  :204-211 — "instrument" here is an ONTOLOGY subject class, matching the ruling's survival of instrument
  as a classification; C2 keeps the term (it denotes the class, not the record kind). Flag to reviewer.
- schema/core/term.schema.yaml kind enum includes `instrument` :31; server/src/terms/EnsureTerm.ts:27,
  MigrateTerms.ts:35-36 map instrument/instrument-definition → instrument TERM domain;
  schema/scientist-intent/scientist-intent-vocabulary.yaml :196-199 arg `instrument` domain instrument;
  TaggerOutput.ts:11 'instrument' tag. These are CONCEPT-VOCABULARY surfaces (the word, not the kind).
  AUDIT DECISION (this spec): they SURVIVE — the ruling preserves "instrument" as classification
  vocabulary; changing them re-mines the one-vocabulary rule against the surviving ontology term.
  See OQ-3 for the orchestrator's confirm.

(b) TS surfaces (code-reading was mandatory; memo §5 understated this, task note correct):
- server/src/registry/InstrumentRegistry.ts — loads schema/registry/instruments/ (DIR :31) with zod
  kind 'instrument-definition' (:16-28) but loader `kind: 'instrument'` label (:35). DELTA: this file
  serves the instrument-definition registry, NOT the retired kind — it does NOT die; the :35 label string
  is the only residue (rename to 'instrument-definition' in C4). The task block's "InstrumentRegistry.ts
  ... per code-reading at spec time" resolves to: AUDIT KEEP (see (f)).
- server/src/compiler/artifacts/InstrumentApplianceJob.ts :123-127 — synthesizes
  `instrumentRef: { kind:'record', type:'instrument', id }` for Gemini EM active-read jobs. THE ONLY
  non-test TS site that emits a live `type: 'instrument'` record-ref (verified by full-tree grep,
  non-test residue = 1). C4 retypes to 'equipment' + derives id from the run-file instrument name
  (instrumentRecordId slug :~110 `instrument/${slug}` path style — blob-path-style names stay, memo §5).
  Blocker code `missing_instrument_ref` :153-154 — message may keep the word, the ref target changes.
- server/src/ai/RunContextAssembler.ts :41,:125,:315 — passes measurement-context `instrument_ref`
  through as `instrumentRef` into run context (feeds mcp/tools/runWorkspaceAiTools.ts:115,
  evidencePipelineTools.ts:49,:111, RunWorkspaceService.ts:33,:553,:702). Follows the C1 field rename.
- server/src/readiness/ReadinessReportService.ts :22 — already reads bindings.instruments[].instrumentRef
  and treats the ids AS equipmentIds (calibration/authorization checks :27-37). Green by construction;
  C2's planned-run rename (roleId/instrumentRef → keep property NAME instrumentRef, pin type to equipment
  in schema) leaves this file untouched. DELTA vs task block: no code change needed here — reviewer should
  NOT expect a diff.
- server/src/compiler/protocol/ProtocolCompiler.ts :350 normalizeRecordId(binding.instrumentRef) —
  shape-agnostic; green. server/src/api/handlers/{SemanticsHandlers,MeasurementHandlers,ProtocolHandlers,
  ExecutionHandlers}.ts + mcp/tools/executionTools.ts:1221-1274 — pass-through instrumentRef shapes;
  green under schema retarget except wherever they pin `type:'instrument'` (grep at claim time; baseline
  found none non-test beyond InstrumentApplianceJob).
- server/src/ui/views/RecordEditController.ts:312 `'instrument': 'INS'` id-prefix map, and
  server/src/api/handlers/RecordSearchHandlers.ts:111 `'instrument': 'analytical instrument
  specifications'` — C4 deletes the prefix row (kind gone), keeps/adjusts the search description per the
  surviving vocabulary. exactOptionalPropertyTypes is ON (server/tsconfig.json:13) — optional-ref copies
  follow the file's `...(x !== undefined ? { x } : {})` idiom (MeasurementActiveControlService.ts:156,:238).
- app: src/pages/RecordRegistryPage.tsx:27 instruments tab `kinds:['instrument']` — REMOVE tab def (C5;
  supersession of QMS8-C D8-(i) interim). src/collections/LabCollectionView.tsx:32 label line (see rebase
  note). src/shared/reuse/ReuseAuthoringPanel.tsx:557-560 builds `instrumentRef: toRecordRef(id,
  'instrument', id)` for graph-component-instance bindings + :941 placeholder "INS-..." — C4 retargets to
  'equipment' + EQP- placeholder. src/shared/api/client.ts:387-438 instrument-definition +
  instrument_ref material-ref types — definition kinds survive. event-editor/* "instrument" strings are
  equipment-placement UI (LabwareFocus.equipment tests) — verify-only.
- server/src/registry/{ReadoutDefinitionRegistry,AssayDefinitionRegistry}.ts instrument_type zod enums
  (:22-23,:23) — instrument-definition-adjacent classifier vocabulary; survives (C4, no change).
- scripts/qms-demo-seed.mjs — grep shows EQP-only fixtures (:169-190), ZERO instrument refs. DELTA vs task
  block hypothesis: nothing to migrate there.
- Corpus: records/ has ONLY seed/ (ls verified); zero files under records/ carry instrumentRef (grep 0
  hits); the ONE kind-keyed seed hit is records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-
  sharing.yaml:86 `- kind: instrument` ownership-policy row — C3 deletes the row (kind gone). Live lane
  corpus: 0 instrument records (decision file :16, QMS8-C spec :89); re-probe at claim time — if NONZERO,
  STOP (the ruling's zero-migration premise is dead; that is a stop boundary, not a worker pick).

(c) Capability-validation machinery that already exists (verified-by 3's host):
- EquipmentCapabilityService (server/src/capabilities/EquipmentCapabilityService.ts:50) resolves the
  capability inventory for an equipment id across instance+class (instance-equipmentRef and
  equipmentClassRef sources, :71-115), typed request {equipmentId, verbId} (capabilityAuthorization.ts
  :186-188). Consumers today: EquipmentAcceptanceService.ts:77, ProtocolCompiler.ts:308-313,
  OperationalAdmissibilityService.ts:77-80. Compile-pass precedent:
  server/src/compiler/pipeline/passes/CheckInstrumentCapabilities.ts (header :1-7 — checks registered
  instruments against operation constraints, warns on no support).
- The lint predicate DSL CANNOT express it: PredicateEvaluator ops are exists/nonEmpty/regex/equals/in/
  all/any (+ allIn cross-collection membership, CrossCollectionPredicate.test.ts:47) — no cross-store
  capability lookup. So schema pins the ref TARGET (type: const equipment) as the floor, and the
  capability gate is a TS validator that READS THE DECLARATION (OQ-1).

(d) Ontology-class migration target: equipment-class.schema.yaml (read whole, 122 lines) has NO ontology
class property today (properties end notes/lifecycleId/state :111-122). C1 adds `class` to
equipment-class.schema.yaml — array of CURIEs, copied verbatim in shape from instrument.schema.yaml
:41-48 ($defs curie pattern :126-129) — per the ruling ("the current instrument.schema.yaml `class` field
migrates there"). Seed EQC-QUANTSTUDIO5 (records/seed/equipment-class/eqc-quantstudio5.yaml) gains an
OBI/EFO measurement-device CURIE so the derived UI view (C5) has data to filter on; the CURIE value is
architecture-visible DATA (reviewer checks it names a measuring-device class).

(e) First-hand live facts NOT re-probed this session (:3092 belongs to the running QMS8-C coder):
instrument-record count (carried: 0), equipment count (carried: 38→39 across QMS8-C recon). Coder step 0
re-pins both (read-only GET allowed once QMS8-C's session exits; if unclear, the dry counts come from the
lane data dir file walk).

(f) schema/registry/instruments/ audit (task block: "do not silently delete, do not silently keep"):
three files, all kind `instrument-definition` (generic-qpcr.yaml:1, generic-plate-reader.yaml,
generic-gcms.yaml); consumers: lab-profile.yaml :15-21 (ref type: instrument-definition),
SemanticsHandlers.ts:58,:213-215, readout/assay registries, app client.ts:387+. AUDIT DECISION: KEEP as a
distinct kind (a reusable measurement-setup PROFILE with instrument_type + supported readouts — not an
asset registry, no serials, no lifecycle); fold-under-equipment-class-class renaming is a NAMING follow-up
at most (wave2-naming-crosswalk precedent schema/registry/wave2-naming-crosswalk.yaml). Recorded as
OQ-2 for orchestrator blessing — this spec does not rename them.

(g) instrument-log audit: KEEP kind name (see (a)); ref retargets. verified-by (4)'s carve-out applies.

============================================================================
## Ordered commit rollout (binding sequence per the ruling — contract BEFORE deletion)

C1 — ACQUISITION-CONTEXT CONTRACT AS DATA (this item's verified-by (1)+(2); NO deletions):
     measurement.schema.yaml instrumentRef→equipmentRef (+type equipment), measurement-context.schema.yaml
     instrument_ref→equipment_ref (+acquisition_context slot (a)-table), data-reference.schema.yaml
     acquisitionContext.equipment_ref, equipment-class.schema.yaml gains `class` CURIE array,
     seed EQC-QUANTSTUDIO5 class CURIE, RunContextAssembler/RunWorkspaceService/AI-tool passthroughs follow
     the renamed fields, RED-first tests: (i) measurement-context/measurement/data-reference schema-shape
     REDs (equipment-ref required, non-equipment ref rejected by schema), (ii) the historical-stability
     test (revisionRef pin survives a later calibration-record mutation), (iii) measurement-context
     seeds/fixtures update in-diff. YAML ships in commit; ORCH RESTART after merge (fields inert till
     restart — YAML-reload trap).
C2 — REF-CONTRACT RETARGET + DECLARED-CAPABILITY VALIDATION (verified-by (3)):
     planned-run InstrumentBinding + graph-component-instance + gemini-active-read-request refs pinned to
     type: equipment; equipment.schema.yaml instrumentRef property DELETED (+ equipment.ui.yaml :46-49,
     equipment.lint.yaml :23 entry); labware-instance location description names equipment;
     experiment.instruments retarget; run-timeline description; predicates CL:measures kept (classification);
     capability gate: measurement/planned-run write path rejects an equipment source without the required
     verb binding resolved via EquipmentCapabilityService (verb id sourced from data — see hard rule H2);
     RED-first test = gate rejects a plate-reader EQP bound only to a non-READ verb, accepts
     EQP-QUANTSTUDIO5 via ECP-QUANTSTUDIO5. ORCH RESTART.
C3 — KIND DELETION (only after C1/C2 have merged and gone green; verified-by (4) core):
     delete schema/lab/instrument.{schema,lint,ui}.yaml; record.schema.yaml :17 oneOf entry;
     registry-kinds.registry.yaml :14 entry; ownership seed row :86;
     RecordHandlers.instrumentAuthoring.test.ts retires with the kind (its pins test a kind that no longer
     exists — retirement note in report, do not silently drop coverage of OTHER kinds);
     registryOpsLifecycle.test.ts instrument fixtures (:660-688) move to another covered kind or drop with
     a note. ORCH RESTART.
C4 — TS RESIDUE + code surfaces (verified-by (4) tail):
     InstrumentApplianceJob.ts:123-127 type 'equipment'; RecordEditController.ts:312 prefix row;
     InstrumentRegistry.ts:35 loader label; ReuseAuthoringPanel.tsx:557-560,:941 ('equipment', EQP-);
     instrument-log fixtures re-target their instrumentRef ids to EQP- (kind name unchanged);
     measurement tests' INSTR-GEMINI fixtures (MeasurementService.test.ts:90,
     MeasurementActiveControlService.test.ts:86) → EQP-GEMINI/type equipment.
C5 — UI SURVIVAL + browser gate (verified-by (6)):
     remove RecordRegistryPage.tsx:27 instruments tab (and 'Create instrument' create entry wherever the
     interim QMS8-C rename left it); derived "measurement-capable" filter view on the equipment registry
     computed FROM equipment-capability data (fetch equipment-capability list, mark equipment whose
     instance-or-class resolves a VERB-READ capability — the same EquipmentCapabilityService shape;
     no name-literals, no serial-sniffing); LabCollectionView label settles per rebase note. BROWSER GATE:
     one row per machine, filter shows EQP-QUANTSTUDIO5 (capability ECP-QUANTSTUDIO5 visible), no Create
     instrument entry.

If split as recommended: INSTR-COLLAPSE-1 = C1+C2, INSTR-COLLAPSE-2 = C3+C4+C5 (browser gate on the last).

## First targeted check (single command that proves the approach early)

Step 0 (baseline pin, claim time, before ANY edit):
    cd /mnt/vast/home/brad/git/cl-integration-1 && git -c core.fileMode=false log --oneline -1   # record HEAD
    grep -rn "type: 'instrument'" server/src app/src --include='*.ts' --include='*.tsx' | grep -v test    # expect exactly 1: InstrumentApplianceJob.ts:126 (pre-C4; re-pin if QMS8-C drifted)
    # corpus premise (stop boundary 1 if nonzero instruments):
    ls <lane1 data dir>/records | grep -c . ; grep -rln "kind: instrument$" <lane1 data dir>/records | wc -l   # expect 0
Step 1 (the early proof, from the worktree's server/ dir, RED-first):
    npx vitest run src/schema/AcquisitionContextContract.test.ts -t "equipment source"
where that NEW test file (created at C1's first commit) asserts measurement.schema.yaml /
measurement-context.schema.yaml / data-reference.schema.yaml reject a non-equipment source ref and require
the (d)/(a)-tabled slots. Expected: FAILS RED before the C1 schema edits (today the refs are bare —
measurement.schema.yaml :38-40 proves it), PASSES GREEN after. RED evidence saved as
~/.hermes/cl/lanes/1/instr-collapse-C{n}-RED-l1<tick>.txt.

## Verification commands (complete; coder runs from worktree, orch re-verifies on trunk)

Server (from the worktree's server/ dir — fleet-coder note, task :6836-6837):
    npx vitest run src/schema/AcquisitionContextContract.test.ts src/measurement/MeasurementService.test.ts \
      src/measurement/MeasurementActiveControlService.test.ts src/storage/dataReference.test.ts \
      src/readiness/ src/capabilities/ src/compiler/artifacts/InstrumentApplianceJob.test.ts \
      src/compiler/pipeline/passes/CheckInstrumentCapabilities.test.ts \
      src/compiler/pipeline/passes/EmitInstrumentApplianceJobs.test.ts \
      src/governance/registryOpsLifecycle.test.ts src/registry/ src/ai/RunContext* \
      src/api/handlers/EquipmentHandlers.test.ts src/api/handlers/MeasurementHandlers.applianceJob.test.ts \
      src/schema/EventGraphEquipmentSchema.test.ts src/scripts/migrateRecordLifecycles.test.ts
    Expected: all green (0 failed). Baseline is the trunk's post-QMS8-C known-failure list in the coder
    brief — report any NEW failure as a defect; never exclude silently. Full suite run once at C3/C4:
    `npx vitest run` — delta vs claim-time baseline must be zero (record both counts in the report).
Typecheck (exactOptionalPropertyTypes on server):
    npm run typecheck -w server → 0 errors; npm run typecheck -w app → delta-0 vs trunk baseline.
App unit (from app/): `npx vitest run src/pages/RecordRegistryPage src/collections src/shared/reuse` →
    green (C5: createTab test :90 fixture expectations updated for the retired kind).
Grep proofs (verified-by (4), worktree root, AFTER C3+C4; expected hits named):
    ls schema/lab/instrument.schema.yaml schema/lab/instrument.lint.yaml schema/lab/instrument.ui.yaml   → No such file (×3)
    grep -n "kind: instrument$" schema/registry/registry-kinds.registry.yaml                             → none
    grep -rn "instrument.schema.yaml" schema/ server/src app/src records scripts                         → none
    grep -rn "type: 'instrument'\|type: \"instrument\"" server/src app/src scripts                       → none outside tests that pin the retirement
    grep -rn "'INSTR-" server/src app/src schema scripts --include='*.ts' --include='*.tsx' --include='*.yaml' → none outside the retirement-pinning tests (schema/registry/instruments/ INSTDEF- ids are instrument-definition — different kind; keep)
    grep -rn "instrumentRef" schema/lab/instrument-log.schema.yaml                                        → present (audit-retained kind name, ref retargeted to equipment)
    grep -n "kinds: \['instrument'\]" app/src/pages/RecordRegistryPage.tsx                                → none
Live re-probe (orchestrator only, read-only GETs): kind=instrument → 404/unknown-kind or 0 (per store
behavior after kind deletion); kind=equipment → EQP-QUANTSTUDIO5 present; ECP-QUANTSTUDIO5 resolves.
Browser gate (tier per lane ladder): as C5 describes; receipts under ~/.hermes/cl/receipts/INSTR-COLLAPSE-1/.

## File ownership

Coder OWNS (by leg): C1 schema/lab/{measurement,measurement-context}.schema.yaml + measurement.ui.yaml +
schema/knowledge/data-reference.schema.yaml + schema/lab/equipment-class.schema.yaml +
records/seed/equipment-class/eqc-quantstudio5.yaml + server/src/ai/RunContextAssembler.ts +
server/src/run-workspace/RunWorkspaceService.ts + mcp passthroughs + new/updated tests.
C2 schema/workflow/{planned-run,planned-run.ui,graph-component-instance,sidecar/gemini-active-read-request}
+ schema/lab/{equipment.schema.yaml,equipment.ui.yaml,equipment.lint.yaml} + instrument-log schema/ui ref
wording + schema/studies/{experiment,run-timeline}.schema.yaml + labware-instance description +
capability-gate validator placement (per OQ-1 blessing) + tests.
C3 deletions named above + registry-kinds + record.schema.yaml + ownership seed + authoring-gate test
retirement. C4 InstrumentApplianceJob.ts, RecordEditController.ts:312, InstrumentRegistry.ts:35,
ReuseAuthoringPanel.tsx, measurement test fixtures named. C5 app registry collections + derived view +
its tests.
Coder NEVER: edits the task list or canonical spec; touches /mnt/vast/home/brad/git/computable-lab,
:3001/:5174; writes lane runtime data or runs migrations --apply (none here anyway); restarts the
:3092/:5192 stack (orchestrator owns restarts — YAML-reload trap); makes mutating :3092 calls; renames
blob paths (memo §5 — "instruments/qs5/run42.fcs" stays); touches instrument-definition / INSTDEF- /
readout-definition / assay-definition kinds (distinct kinds, out of scope except the noted audit-keeps).
EXPLICITLY OUT OF SCOPE: schema/registry/instruments/ rename; term-kind vocabulary change (OQ-3);
predicates.registry.yaml re-terming; run-timeline `instrument` field removal (display field, survives);
protocol roles.instrumentRoles / InstrumentRole.allowedInstrumentIds (ROLE names + already-equipment
mentions per ProtocolAuthoringWidgets.tsx:408 — naming polish is a separate item); executionMode
'manual'|'instrument' enum (a MODE name); 'instrument-appliance-job' / 'instrument-log' /
'instrument-readout' artifact/kind/log-type NAMES; freebench deck/lawn geometry (no instrument refs found).

## Hard rules

H1 No hardcoded policy in TS: the capability gate must not contain device names, id-prefix sniffs, or a
    permanent "only VERB-READ measures" rule (memo §2 :69). The verb to check comes from the operation's
    data (read event / measurement readout chain); the EquipmentCapabilityService request shape already
    takes verbId as data.
H2 If shipping the gate forces a TS literal 'VERB-READ' not derived from the record/event data, STOP —
    that is OQ-1's design question, not a worker pick.
H3 Never widen: every retargeted ref either pins `type: const equipment` (schema floor) or is covered by
    the capability gate; "any ref" is not an accepted end state (memo §5).
H4 Deletion-after-contract: if C1/C2 are not merged-and-green, C3 does not ship (verified-by (1) block).
H5 exactOptionalPropertyTypes: optional-ref writes use the spread-guard idiom; never assign undefined.
H6 YAML ships in commits; restart belongs to the orchestrator.
H7 RED-first per leg: behavior changes get a failing test at the pre-fix commit; evidence path per worker
    contract.
H8 Blob paths and storage directories DO NOT move (memo §5).
H9 Records are test data (Brad A4); full-clean-break posture (A1): fixtures/examples/docs update in-diff,
    no compatibility shims, no tolerated-legacy lint rules.

## Worker contract

- Branch: cl/lane1-instr-collapse-1-l1t<tick> off trunk cl/integration-1 HEAD AT CLAIM TIME (spec written
  at 75f1c74f; QMS8-C merges land above it — rebase, do not assume the hash).
- Worktree: /mnt/vast/home/brad/git/wt/INSTR-COLLAPSE-1-lane1-l1t<tick> (node_modules + server/app
  symlinks per lane practice; background the NFS worktree add).
- Deliverable/report (unique per tick): ~/.hermes/cl/lanes/1/instr-collapse-report-l1<tick>.md; evidence
  instr-collapse-C{1..5}-{red,green}-l1<tick>.txt; log logs/coder-INSTRCOLLAPSE1-l1<tick>.log.
- Vitest from server/ for server tests, app/ for app tests.
- Follow-up item leg split (if orch accepts): branch naming ...-l1t<tick> per item; item 2 branches off
  trunk AFTER item 1 merge.

## Reviewer bait (anticipating the adversarial review)

1. exactOptionalPropertyTypes sites: measurement-context acquisition_context and every renamed optional
   ref (RunContextAssembler.ts:315 already uses the spread idiom — keep it; the C2 gate validator must
   not invent `ref: undefined`).
2. YAML-reload trap: C1/C2/C3 schema/lint/ui edits are inert until the orchestrator restarts the lane
   stack; "the schema still accepts it" after a merge = missing restart, not a broken edit.
3. The ref-rename blast radius: measurement-context's field is snake_case (instrument_ref) while
   measurement's is camelCase (instrumentRef) — a rename that "fixes" the inconsistency in passing
   inflates the diff and breaks RunWorkspaceService/RunWorkspaceAiTools/evidencePipelineTools consumers;
   the spec renames, the reviewer checks ALL FOUR consumer sites named in (b).
4. Kind-name survival confusion: instrument-log, instrument-definition (INSTDEF-), instrument_type fields,
   instrument-appliance-job, instrumentRoles, executionMode 'instrument' are NOT the retired kind — a
   reviewer demanding their removal is over-collapse; a grep proof that deletes them is wrong. The two
   seeds' prose ("on an instrument", eqp-qpcr.yaml:4 name) is display text, not a contract.
5. Capability-validation fake: a "gate" that checks record-kind only (type==='equipment') fails
   verified-by (3) — the test must show a kind-correct equipment WITHOUT the verb binding being rejected.
   Hunt for a fixture that fakes a VERB-READ binding by naming (H1).
6. Hardcode boundary: instrumentRecordId slug path style in InstrumentApplianceJob is fine (directory
   name); an id-prefix whitelist ('EQP- allowed, INSTR- denied') in the gate is NOT (H1) — the gate must
   resolve real capability data.
7. Revision-pin theater (verified-by 2): the test must actually mutate the calibration record AFTER
   acquisition and re-read through the revisionRef; asserting two objects are equal at write time proves
   nothing.
8. QMS8-C rebase residue: check equipment.schema.yaml required list and registry-kinds hunk against the
   post-QMS8-C trunk, not this draft's line numbers.
9. Deletion-order bait: instrument.schema.yaml vanishing in the same commit as its refs retargeting hides
   contract regressions — reviewer checks C2 merged green BEFORE C3 exists in history.
10. OWN-LAB-DEFAULT seed ownership row: deleting the kind row without checking the ownership-policy
    schema's kind enum/validation leaves a dangling per-kind policy — verify the seed test stays green.

## Verified-by crosswalk (each mechanically checkable)

(1) this document's contract table + C1-before-C3 history order (git log --oneline shows C1 schema commit
    ancestor of the deletion commit; greps above). (2) AcquisitionContextContract.test.ts historical-
    stability case green. (3) capability-gate test: reject-no-binding / accept-EQP-QUANTSTUDIO5 cases
    green. (4) grep proofs above. (5) suite commands above, delta-zero vs claim-time baseline. (6) browser
    gate receipts with the filter view + no Create instrument entry + ECP-QUANTSTUDIO5 visible.

## OQ / decision requests — ALL RESOLVED AT PROMOTION (worker must not pick; do not re-ask)

OQ-1 DECIDED (see PROMOTION BLOCK P2 — the decision doc is binding for C2's gate design).
OQ-2 BLESSED: KEEP instrument-definition kind + schema/registry/instruments/ (P3).
OQ-3 BLESSED: KEEP 'instrument' concept-vocabulary surfaces (P3).

## Stop boundaries (hard stops — stop and report, do not improvise)

1. Live/seed corpus shows ANY instrument-kind record (premise "0 records" is the ruling's — decision file
   :16, memo §5): STOP; record migration = re-scope with Brad.
2. The acquisition-context contract cannot be expressed on measurement/measurement-context/data-reference
   as tabled (a slot genuinely has no host): STOP AND FLAG architecture-re-up (task :6769-6771) — do not
   invent a new kind.
3. (RESOLVED — P2: OQ-1 decided; shape (a) refined, no TS verb literal needed.) The gate forcing a TS verb literal anyway remains a STOP (H2).
4. Any suite only goes green by weakening (not re-seeding) its assertion: STOP — the pin is truth; escalate.
5. Need to touch instrument-definition/readout/assay kinds, blob paths, or protocol-role naming: STOP —
   out of scope (file-ownership list).
6. registry-kinds / QMS8-C rebase conflict where both rulings cannot coexist: STOP with the exact hunk —
   never resolve a governance conflict unilaterally.

STATUS: promoted-canonical (scope C1+C2 per P1)
