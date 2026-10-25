# INSTR-COLLAPSE-1 — Coder report (Lane 1, l1t0755)

Scope executed: **C1 + C2 ONLY** (contract-as-data + retarget/capability gate) per the
promotion block P1-P4. C3/C4/C5 untouched (INSTR-COLLAPSE-2).
Worktree: /mnt/vast/home/brad/git/wt/instr-collapse-1-lane1-l1t0755
Branch: cl/lane1-instr-collapse-1-l1t0755 (base dad6bbdc, post-QMS8-C)

## Commits (oldest first)

1. `986f0bb0` test(instr-collapse-1): C1 RED — acquisition-context contract as declared data
   Adds server/src/schema/AcquisitionContextContract.test.ts (15 tests). RED called out:
   8 failed / 7 passed against today's bare refs.
2. `b18d087d` feat(instr-collapse-1): C1 — acquisition-context contract AS DECLARED DATA (schema leg)
   measurement.schema.yaml: instrumentRef -> equipmentRef pinned `type: { const: equipment }`
   (allOf ref.schema.yaml + pin block). measurement-context.schema.yaml: required
   `equipment_ref` replaces `instrument_ref`; `acquisition_context` declared slot
   (calibration_refs / authorization_refs / note, additionalProperties:false).
   data-reference.schema.yaml: acquisitionContext.equipment_ref ref-host replaces the free
   `instrument` string (revisionRef legal on it). equipment-class.schema.yaml: migrated
   ontology `class` CURIE array ($defs.curie copied byte-for-byte from instrument.schema.yaml).
   eqc-quantstudio5.yaml seed: `class: [OBI:0001110]` ("real-time PCR machine", verified live
   via OLS4: https://www.ebi.ac.uk/ols4/api/ontologies/obi/terms?obo_id=OBI:0001110).
   measurement.ui.yaml field path $.equipmentRef label Equipment.
3. `0d51bb05` feat(instr-collapse-1): C1 — TS consumers follow the renamed contract (no policy in code)
   MeasurementService, MeasurementActiveControlService, MeasurementHandlers, SemanticsHandlers,
   RunContextAssembler, RunWorkspaceService, runWorkspaceAiTools, evidencePipelineTools,
   executionTools, app client.ts types, ReadPlateModal, MeasurementSetupPanel
   (equipment picker via listRecordsByKind('equipment')), useBiologyMode, useResultsMode,
   ReadoutContextPanel, MeasurementContextList, RoleAssignmentPanel. Test fixtures follow
   (dataReference.test.ts).
4. `5aab4a88` test(instr-collapse-1): C2 RED — declared capability gate + ref retarget contract
   Adds server/src/capabilities/DeclaredCapabilityGate.test.ts (18 tests). RED called out:
   17 failed / 1 passed (annotations/retargets absent, interpreter module absent).
5. `739d68fe` feat(instr-collapse-1): C2 — capability gate as declared data + ref retargets
   x-capability-gate annotations on gated slots; DeclaredCapabilityGate.ts interpreter;
   wired at MeasurementService.ingest + ExecutionOrchestrator.createPlannedRun; AjvValidator
   registers the annotation keyword; ref retargets + equipment.instrumentRef retirement
   (details below).

## C1 surfaces touched (contract-as-data)

- schema/lab/measurement.schema.yaml — equipmentRef (pinned type:equipment; retired key rejected)
- schema/lab/measurement-context.schema.yaml — equipment_ref required; acquisition_context declared
- schema/knowledge/data-reference.schema.yaml — acquisitionContext.equipment_ref ref host
- schema/lab/equipment-class.schema.yaml — `class` CURIE array + $defs.curie (migrated shape)
- schema/lab/measurement.ui.yaml — $.equipmentRef / label Equipment
- records/seed/equipment-class/eqc-quantstudio5.yaml — class: [OBI:0001110]
- TS consumers (server + app) renamed to follow the YAML; no kind-name branches, no hardcoded policy.

## C2 surfaces touched (retarget + capability gate, OQ-1 decision (a))

Declared gate (data):
- measurement.schema.yaml equipmentRef: `x-capability-gate: { verbFrom: { resolver:
  read-event-verb, path: readEventRef, graphPath: eventGraphRef }, require: verb }`
- planned-run.schema.yaml CompiledProtocolStep.equipmentRef: `x-capability-gate` with sibling
  `verbRef` as verb source (pure path data).

Interpreter (policy-free): server/src/capabilities/DeclaredCapabilityGate.ts —
reads the annotation off the schema-by-id accessor (R1 allowed), resolves the verb ONLY from
payload data via the declared path, resolves support through the EXISTING
EquipmentCapabilityService.resolveEquipmentSupport (EquipmentCapabilityService.ts:126,
CapabilityResolutionRequest {equipmentId, verbId, methodId?} capabilityAuthorization.ts:186-190).
No verb literal, no device name, no id-prefix sniff (H1/H2). Missing verb chain FAILS CLOSED
(capability_gate_verb_unresolvable). Annotation removed -> gate vanishes (rip-out proof test).
AjvValidator.ts registers x-capability-gate as an inert annotation keyword (precedent:
x-jsonld / ContextBuilder.ts:154).

Call sites (the two service write paths that persist gated payloads):
- server/src/measurement/MeasurementService.ts ingest()
- server/src/execution/ExecutionOrchestrator.ts createPlannedRun()

Ref retargets (H3: every ref TARGET pinned `type: { const: equipment }`; property NAME retained
where the name is a role/contract surface):
- planned-run InstrumentBinding.instrumentRef (bindings.instruments is a role-binding surface)
- graph-component-instance instruments[].instrumentRef
- gemini-active-read-request.instrumentRef (sidecar bridge field NAME retained, memo §5)
- instrument-log.instrumentRef (audit-retained kind name; TARGET pinned to equipment)
- equipment.instrumentRef RETIRED: schema property deleted, equipment.ui.yaml "Linked Instrument"
  field deleted, equipment.lint.yaml guardWhenChanged entry removed (memo §5 reciprocal defect)
- description retargets (word survives, target named): labware-instance location ref,
  experiment.instruments, run-timeline.instrument
- app/src/shared/reuse/ReuseAuthoringPanel.tsx emits type:'equipment' binding refs

## RED/GREEN evidence (verbatim vitest summaries from saved raws)

C1 RED (artifacts/INSTR-COLLAPSE-1/C1-RED-l1t0755.txt; copy: ~/.hermes/cl/lanes/1/instr-collapse-C1-RED-l1t0755.txt):
 Test Files  1 failed (1)
      Tests  8 failed | 7 passed (15)

C1 GREEN (artifacts/INSTR-COLLAPSE-1/C1-GREEN-schema-l1t0755.txt; copy: ~/.hermes/cl/lanes/1/instr-collapse-C1-GREEN-l1t0755.txt):
 Test Files  1 passed (1)
      Tests  15 passed (15)

C2 RED (artifacts/INSTR-COLLAPSE-1/C2-RED-l1t0755.txt; copy: ~/.hermes/cl/lanes/1/instr-collapse-C2-RED-l1t0755.txt):
 Test Files  1 failed (1)
      Tests  17 failed | 1 passed (18)

C2 GREEN (artifacts/INSTR-COLLAPSE-1/C2-GREEN-gate-l1t0755.txt; copy: ~/.hermes/cl/lanes/1/instr-collapse-C2-GREEN-l1t0755.txt):
 Test Files  1 passed (1)
      Tests  18 passed (18)

Spec targeted suite command (post-C2, artifacts/INSTR-COLLAPSE-1/specsuites-postC2-l1t0755.txt):
 Test Files  5 failed | 42 passed (47)
      Tests  3 failed | 355 passed (372)
The 5 failed files (MeasurementService, MeasurementActiveControlService,
MeasurementHandlers.applianceJob, ExecutionOrchestrator, EventGraphEquipmentSchema) are ALL in
the claim-time baseline FAIL list (artifacts/INSTR-COLLAPSE-1/baseline2-failfiles-l1t0755.txt).

Full suite (delta vs claim-time baseline):
- claim-time baseline2 (artifacts/INSTR-COLLAPSE-1/baseline-full-vitest-l1t0755.txt):
     Test Files  93 failed | 674 passed | 9 skipped (776)
          Tests  116 failed | 6384 passed | 70 skipped (6744)
         Errors  2 errors
- post-C2 full (artifacts/INSTR-COLLAPSE-1/full-postC2-l1t0755.txt):
     Test Files  90 failed | 678 passed | 9 skipped (777)
          Tests  107 failed | 6415 passed | 70 skipped (6765)
         Errors  2 errors
- comm of normalized FAIL-file lists: NEW fails = NONE; FIXED since baseline = 3
  (Qms6bSchemaDrift, AcquisitionContextContract, pdfAcquisition). ZERO-NEW PROVEN.

Hook-timeout isolation proof (artifacts/INSTR-COLLAPSE-1/hookfix-worktree-l1t0755.txt and
hookfix-trunkbase-l1t0755.txt): the 5 targeted-suite failures run with
--hookTimeout 60000 --testTimeout 60000 produce IDENTICAL failure sets in the worktree and at
the trunk base (both: ` Test Files  5 failed | 1 passed (6)` / `      Tests  11 failed | 10 passed (21)`,
diff of FAIL lines: empty). Root causes are pre-existing env debt, not my edits:
missing records/inbox/gemini.csv fixture, PLR counter drift in the durable repo,
EventGraphEquipmentSchema's unresolved ./datatypes/revision-ref.schema.yaml $ref (file absent
from the repo; baseline-listed).

App unit (spec command, artifacts/INSTR-COLLAPSE-1/app-unit-postC2-l1t0755.txt):
 Test Files  1 failed | 12 passed (13)
      Tests  2 failed | 64 passed (66)
The 2 failures are ClaimCollectionView `useOpenTabs must be used inside <OpenTabsProvider>` —
reproduced IDENTICALLY at the trunk checkout (pre-existing host-page provider debt).
RecordRegistryPage 17/17 green; shared/reuse green.

## Typecheck

- Server: `npx tsc --noEmit` -> exit 0 (exactOptionalPropertyTypes on). Verified after C1 TS leg
  and again after C2 (739d68fe).
- App: 27 errors in the worktree AND 27 at the trunk tip (identical file distribution:
  ProtocolAuthoringWidgets 4, SequencesPage 3, WorkstateProposalCard 2, QuestionsPanel 2,
  editorHistory.test 2, ...). DELTA 0 vs current trunk. Note: the brief's 23-error pin was at
  f8f49dc1; the cl/integration-1 tip has drifted to 27 — recorded, not fixed (AS-IC1-5).

## Grep proofs (spec acceptance list, C1+C2-applicable subset)

- `grep -rn "type: 'instrument'" server/src app/src --include='*.ts' --include='*.tsx' | grep -v test`
  -> exactly 1 hit: server/src/compiler/artifacts/InstrumentApplianceJob.ts:126 (pre-C4, unchanged).
- `grep -n "instrumentRef" schema/lab/instrument-log.schema.yaml` -> present (line 25,
  audit-retained NAME); `grep -n "const: equipment"` in same file -> line 34 (TARGET retargeted).
- `grep -rn "const: instrument }"` across all touched contract schemas -> NONE (clean).
- `grep -rln "^kind: instrument$" records/ | wc -l` -> 0 (stop boundary 1 clear).
- C3/C4 boundary respected: `git diff --name-only dad6bbdc..HEAD` contains NO
  instrument.{schema,lint,ui}.yaml, NO registry-kinds.registry.yaml, NO RecordRegistryPage.tsx.
  registry-kinds instrument entry (line 21) intact for INSTR-COLLAPSE-2.

## Verified-by mapping (C1+C2 portion)

(1) Contract-as-data commits (b18d087d) precede every retarget/retirement commit (739d68fe). OK.
(2) Historical-stability test: AcquisitionContextContract.test.ts 'historical stability' describe —
    revision-pinned calibration_ref still resolves the calibration in force AT acquisition after
    the live record mutates (RecordRevisionService capture+resolve). GREEN.
(3) Capability-validation pin: DeclaredCapabilityGate.test.ts — kind-correct equipment WITHOUT the
    verb binding REJECTED (capability_gate_unsupported); WITH binding accepted; verb from payload
    data only; fails closed; rip-out proof (annotation removed -> gate inert). GREEN 18/18.
(4) Grep proofs above (C1+C2 subset; full retirement proofs belong to C3/C4).
(5) Suites: targeted + full, zero-new proven (comm + identical hookfix sets). Updated-not-pinned:
    dataReference.test.ts fixture follows the renamed contract; no test was pinned around the change.
(6) BROWSER GATE: orchestrator-side (cl-browser-reviewer). Not run by me per assignment
    ("Do NOT restart or curl the lane stack"). Derived 'measurement-capable' view + registry row
    consolidation are C5 (INSTR-COLLAPSE-2) scope.

## Deviations / assumptions

- AS-IC1-1: The sidecar active-read contract field NAME `instrumentRef` (gemini bridge shape,
  memo §5 blob-path posture) is RETAINED; only its ref TARGET is pinned to equipment
  (gemini-active-read-request.schema.yaml). Renaming the bridge field itself would touch the
  appliance-job artifact type (InstrumentApplianceJob.ts:126), which is C4 scope.
- AS-IC1-2: Gate hosted as `x-capability-gate` annotation + one generic interpreter (OQ-1 shape
  (a) refined): AjvValidator registers the keyword as inert (x-jsonld precedent); structural
  validation authority stays Ajv; the pin `type: { const: equipment }` remains pure JSON Schema.
- AS-IC1-3: equipment-class `class` seed value OBI:0001110 confirmed live from OLS4
  ("real-time PCR machine"); no invented CURIE.
- AS-IC1-4: measurement-context acquisition_context uses additionalProperties:false (smuggler
  test pins it).
- AS-IC1-5: App tsc baseline at the current cl/integration-1 tip is 27 errors (brief pin 23 was
  at f8f49dc1); delta-0 proven by running both trees. Unrelated app errors not fixed.
- AS-IC1-6: Lane worktree required env repair before any test claim: server/schema + server/records
  symlinks created; 54 lane-exclude symlinks + lane-exclude REAL files replicated from trunk
  (baseline2 captured AFTER repair). Without this, the suite shows ~249 failed files of pure env debt.
- AS-IC1-7: Gate wired at the two service write paths that persist gated payloads
  (MeasurementService.ingest, ExecutionOrchestrator.createPlannedRun); HTTP/MCP handlers funnel
  through these services, so no second gate call is needed. measurement-context creation is NOT
  gated (R2: measurement-context carries no verb; the gate lives where a verb exists).
- AS-IC1-8: EmitInstrumentApplianceJobs/CheckInstrumentCapabilities passes were green in the
  targeted run (no changes needed — they consume the compiler disposition flow, unchanged in C2).

## Stop-boundary triggers

NONE. The acquisition-context contract was hosted by the existing measurement /
measurement-context / data-reference machinery exactly as the spec directs (ref.schema.yaml
hosts, revisionRef legal, additionalProperties discipline). No architecture re-up required.

## Outstanding for the orchestrator

- Browser gate (verified-by 6) + C3/C4/C5 (registry consolidation, instrument kind deletion,
  derived measurement-capable view, OWN-LAB-DEFAULT :129 retarget row) = INSTR-COLLAPSE-2.
- Pre-existing env debt worth a lane repair ticket: records/examples corpus absent in lane
  worktrees (RosRoleAndAssertion-style ENOENTs), records/inbox/gemini.csv fixture,
  schema/core/lifecycles + registry/predicates missing under test tmp schema dirs,
  revision-ref.schema.yaml $ref unresolved in event-graph.schema.yaml, ClaimCollectionView
  OpenTabsProvider mount-order debt.

STATUS: complete
