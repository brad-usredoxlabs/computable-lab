# INSTR-COLLAPSE-2 — B-prime collapse part 2: delete the instrument kind, clear TS residue, derived measurement-capable filter view + browser gate

PROMOTED 2026-10-22T04:50 by the lane-1 orchestrator tick (l1t0445). Composed 2026-10-22T03:10 EDT
by cl-spec-composer (unit cl-l1-speccomposer-instr2-0310). ORCH PROMOTION BLOCK — OQ answers applied
inline at the OQ section below (OQ-A=i client-side derivation; OQ-B predicate CONFIRMED; OQ-C(1) toggle
pill on Equipment tab, C(2) kindHints row DELETE, C(3) settled — QMS8-C lands 'Equipment'). Orch
spot-checked the survey first-hand at trunk c53d2a69: RecordEditController.ts:312 'INS' row,
InstrumentApplianceJob.ts:126 type 'instrument', registry-kinds:14, OWN-LAB seed row :86,
verb-read.yaml:6 domain analytical_readout, ReadPlateModal.tsx:55-56 positional emitter — ALL CONFIRM.
Canonical line numbers remain pinned to 455b6c4a per the re-pin rule; every cite is re-derived at claim.
 Scope = C3+C4+C5 ONLY (deletion + TS residue + UI
survival + browser gate). C1+C2 (acquisition-context contract as data + ref retarget + capability gate)
are shipped by INSTR-COLLAPSE-1 — the promoted contract host:
.hermes/plans/2026-10-22_INSTR-COLLAPSE-1-contract-as-data-spec.md. Ruling authority (binding, do not
re-litigate): ~/.hermes/specs/intake/2026-10-21_instrument-vs-equipment/answer.md §3/§4/§5/§7 +
.hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md addendum :106-124. OQ-2/OQ-3 blessings (P3 of the
promotion block: instrument-definition kind + schema/registry/instruments/ KEEP; 'instrument'
concept-vocabulary surfaces KEEP) apply verbatim to this item — do NOT re-ask, do NOT widen deletion.

## Scope split rationale (one line)

Deletion may only run after every ref retargeted on trunk and gone green twice (the ruling's own
gate), and the C3-C5 legs fit one coder session while honoring that order — so they are a sequential
item with deps [INSTR-COLLAPSE-1].

## Trunk state at composition (recorded pin)

- Trunk /mnt/vast/home/brad/git/cl-integration-1, branch cl/integration-1, **HEAD 455b6c4a** at
  composition time. All line numbers below were re-derived first-hand from that HEAD.
- **QMS8-C IS NOT YET MERGED** (cl/lane1-qms8c-l1t2205 at d044fafd, cycle-2 adv gate pending). This
  item will be claimed POST-QMS8-C and POST-INSTR-COLLAPSE-1 — every file:line below must be re-pinned
  at claim time. Files this spec touches that QMS8-C's branch also edits (re-pin after QMS8-C merge;
  disjoint ownership: QMS8-C owns `status`, this item owns instrument-kind):
  - schema/registry/registry-kinds.registry.yaml — instrument entry is :14 on trunk 455b6c4a but **:21
    on the QMS8-C branch** (its D5 rewrites the migration block below it; merge-tree preview = 0
    conflict hunks, so the entry survives the merge at :21, NOT :14).
  - schema/lab/instrument.{schema,ui}.yaml — the branch retires their `status` field only (whole-file
    deletion here is immune to that drift).
  - app/src/collections/LabCollectionView.tsx — branch :32 already renames 'Instruments & Equipment'
    → **'Equipment'** (D8-i). The C5 label end-state is therefore ALREADY SETTLED by QMS8-C; C5 keeps
    only the regression test.
  - server/src/api/handlers/RecordSearchHandlers.ts, server/src/registry/KindLifecycleRegistry.test.ts,
    app/src/pages/RecordRegistryPage.archiveBrowsing.test.tsx — branch-touched; re-pin before editing.
- Orchestrator re-pin facts (03:05, re-verified first-hand here): trunk grep `type: 'instrument'` =
  1 non-test hit (InstrumentApplianceJob.ts:126); 0 instrument-kind records in the lane corpus; the
  single repo `kind: instrument$` hit is the OWN-LAB seed row itself; 11 lane instrument-log records
  (ILOG-000001..11) keep the blessed kind NAME; 19 lane equipment records + 25 seed files.
  **COMPOSER DELTA (first-hand, not a re-litigation — a broader grep):** the app has a SECOND ref
  emitter that the object-literal grep cannot see: app/src/event-editor/rail/ReadPlateModal.tsx:56
  `recordRef('instrument/gemini-em', 'instrument', 'Gemini EM')` (positional type arg). It emits
  `type: 'instrument'` into the appliance-job POST (:243 → /measurements/appliance-jobs/execute) and
  into a measurement-context `instrument_ref` (:146). It is in C4's scope below; after it, verified-by
  (4)'s no-residue grep is honestly zero.

## Goal (one sentence)

With the acquisition-context contract shipped and every ref retargeted by INSTR-COLLAPSE-1, delete the
`instrument` record kind outright (schema/lint/ui triplet, oneOf entry, registry-kinds entry, OWN-LAB
ownership row, authoring-gate and lifecycle fixtures), clear the last TS/UI kind-literal residue, and
prove "instrument" survives exactly as blessed: an equipment-side DERIVED measurement-capable filter
computed from equipment-capability data — under a browser gate showing one row per machine.

## Acceptance criteria — VERBATIM from the task list (INSTR-COLLAPSE-2, verified-by inherits
## INSTR-COLLAPSE-1 (4),(5),(6); /home/brad/.hermes/cl/lanes/1/task-list.md:6958-6961 + 6908-6916)

Task block: "Task-list verified-by (4),(5),(6) of INSTR-COLLAPSE-1 apply verbatim to this item (grep
proofs, suites green updated-not-pinned-around, BROWSER GATE accept: one row per machine, derived
filter shows EQP-QUANTSTUDIO5 via ECP-QUANTSTUDIO5, no Create instrument entry)."

Inherited verbatim:
  (4) Grep proof: zero instrument-kind refs after merge (except instrument-log's own historical kind
  name if retained per spec audit); instrument.{schema,lint,ui} absent; registry-kinds entry gone; no
  TS kind-literal residue. (5) Suites green updated-not-pinned-around (measurement, planned-run,
  event-graph, readiness, run-context, registry). (6) BROWSER GATE: the registry shows ONE row per
  machine (equipment) with a derived 'measurement-capable'/'instrument' filter view proving (a)/(b)
  survival; no 'Create instrument' entry; EQP-QUANTSTUDIO5 still shows its capability ECP-QUANTSTUDIO5.
  VERDICT: accept.

## First-hand code survey (all read at 455b6c4a; deltas vs the architect list marked DELTA)

### C3 surface — kind deletion

- schema/lab/instrument.schema.yaml (129 lines; kind const :16-18, id pattern ^INSTR- :23),
  schema/lab/instrument.lint.yaml (denyCode INSTRUMENT_AUTHORING_FORBIDDEN :9, gateOnPolicySetting,
  guardWhenChanged list), schema/lab/instrument.ui.yaml (schemaId-bound form/list) — DELETE all three.
- schema/core/record.schema.yaml:17 `- $ref: "./instrument.schema.yaml"` — delete the oneOf entry.
  :18 instrument-definition is a DIFFERENT kind — KEEP (P3).
- schema/registry/registry-kinds.registry.yaml:14 `- kind: instrument` (post-QMS8-C re-pin: :21) —
  delete the entry.
- OWN-LAB ownership-policy seed row: SEED SOURCE (repo) =
  records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml **:86** `- kind: instrument`
  (7-line rule block owner:lab ... GRP-LAB-ADMINS grant) — delete the row. RUNTIME TWIN =
  /home/brad/.computable-lab-lane1/worktrees/main/records/ownership-policy/
  OWN-LAB-DEFAULT__lab-ownership-sharing-policy.yaml:129 (verified first-hand; matches the orch
  03:05 re-pin) — that is lane DATA (embedded data repo), ORCH-OWNED; the coder edits the seed file
  ONLY and never writes the data dir. The runtime row going stale is inert data under Brad's
  all-records-are-test-data ruling; the orch's re-seed/restart handles it.
  The ownership-policy schema (schema/identity/ownership-policy.schema.yaml:55) treats `kind` as a
  free string ("exactly as it appears in payload.kind") — deleting the row cannot dangle a schema
  enum; server/src/schema/OwnershipPolicySchema.test.ts reads the REAL seed file (:33,:69-70) and
  stays green with one row fewer — that test IS the retarget-row proof.
- server/src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts — the ONLY authoring-gate suite;
  it is PARAMETERIZED over instrument AND equipment (:453 cases array: instrument + equipment
  lint/schemaId/denyCode; :505 asserts BOTH denyCodes resolve). RETIRE-THE-FILE-WHOLE would silently
  drop equipment's authoring-gate + lint-file-contract coverage — FORBIDDEN. Plan: drop the
  instrument case and instrument-specific tests (:248-:424 instrument legs, INSTRUMENT_SCHEMA_ID :44,
  :261/:331/:342/:412 INSTR-* fixtures), keep every generic-leg/equipment case, rename the file to
  RecordHandlers.authoring.test.ts, and record the coverage delta in the report (task: "retire with a
  note... do not silently drop coverage of OTHER kinds").
- server/src/governance/registryOpsLifecycle.test.ts — COVERED_KINDS :53 includes 'instrument'
  (comment says "7 approved kinds, OQ3 KEEP AT 7": the collapse ruling SUPERSEDES that older
  orchestrator ruling — the list becomes 6 with a commit-message note); the instrument special-case
  block :656-688 (provenance-injection defect probe on instrument create, `it.fails` :679) retires
  with the kind — the defect it certifies is about creating an instrument, which no longer exists;
  drop the block with a retirement comment.
- server/src/registry/KindLifecycleRegistry.test.ts:42 KINDS includes 'instrument' — drop
  (QMS8-C branch touches this file — re-pin). server/src/scripts/migrateRecordLifecycles.test.ts:100
  covered-kind list includes 'instrument' — drop.
- server/src/governance/archivedAssignment.test.ts — grep-clean of instrument (verified) — no change.

### C4 surface — TS residue (verified emitters/pins)

- server/src/compiler/artifacts/InstrumentApplianceJob.ts:123-127 — the ONLY non-test object-literal
  emitter: `instrumentRef: { kind:'record', id: instrumentRecordId(runFile.instrument), type:
  'instrument' }` — type → 'equipment'. instrumentRecordId (:96-101) returns the slug-style id
  `instrument/<slug>` — the slug/id STYLE is a directory-name fact (memo §5, blob paths do not
  move); the id STAYS, the type changes. `missing_instrument_ref` blocker (:153-154) keeps its
  message (word, not kind).
- **DELTA emitter (app, first-hand): app/src/event-editor/rail/ReadPlateModal.tsx:55-56** —
  `recordRef('instrument/gemini-em', 'instrument', 'Gemini EM')` → type 'equipment' (id slug stays);
  consumers :118 (appliance-job POST) and :146 (measurement-context instrument_ref). Wizard
  Step2ControlKind.tsx:22 `value:'instrument'` is a well CONTROL-KIND concept ("instrument control"
  wells) — NOT a record ref; survives.
- server/src/ui/views/RecordEditController.ts:312 `'instrument': 'INS'` id-prefix map row — delete
  (the kind cannot be created; the map falls through to 'REC' for unknown kinds anyway).
- server/src/registry/InstrumentRegistry.ts:35 loader `kind: 'instrument'` LABEL (zod kind is
  'instrument-definition' :19; DIR :30 serves the KEPT schema/registry/instruments/) — label →
  'instrument-definition' (file SURVIVES; AUDIT KEEP per P3/INSTR-1 (f)).
- server/src/api/handlers/RecordSearchHandlers.ts:111 kindHints `'instrument': 'analytical instrument
  specifications'` — the map is keyed by RECORD KIND; the kind is gone → dead-data row, delete it
  (QMS8-C branch edits this file — re-pin; concept-vocabulary KEEP applies to descriptions, not to a
  dead registry key).
- app/src/shared/reuse/ReuseAuthoringPanel.tsx:558-561
  `bindings.instruments = [{ roleId, instrumentRef: toRecordRef(id, 'instrument', id) }]` → type
  'equipment'; :941 placeholder `INS-...` → `EQP-...` (property NAME instrumentRef stays — the
  graph-component-instance bindings shape is C2's pinned-type ref, name retained per INSTR-1 C2).
- Measurement test fixtures: server/src/measurement/MeasurementService.test.ts:90 and
  MeasurementActiveControlService.test.ts:86 — `instrumentRef: { kind:'record', id:'INSTR-GEMINI',
  type:'instrument' }` → EQP-GEMINI / type 'equipment' (field NAME as it stands post-C1/C2 — re-pin;
  C1 renamed the SCHEMA field; re-check whether the ingest input name followed).
- server/src/compiler/artifacts/InstrumentApplianceJob.test.ts:38-41 expected-ref flip to
  type 'equipment'; server/src/compiler/pipeline/passes/EmitInstrumentApplianceJobs.test.ts:99,:143
  keep slug-style ids, pin any asserted type to equipment (open-object pass-through today).
- instrument-log fixtures: repo grep FIRST-HAND FIND — the execution-suite instrument-log fixtures
  (ExecutionControlService/TaskService/Poller/RetryWorker/RunService/Orchestrator/Timeline tests)
  carry NO instrumentRef VALUES (they inline a minimal instrument-log schema only). The
  "re-target INSTR->EQP-" fixture work therefore lands at the two measurement tests above
  (MeasurementActiveControlService's instrumentRef flows into the instrument-log create at
  MeasurementActiveControlService.ts:156,:238,:254-258). The 11 RUNTIME ILOG records carry slug ids
  `instrument/gemini-em-plate-reader` (no `type:` at all) — lane DATA, orch-owned, nothing for the
  coder. instrument-log KIND NAME + property names stay everywhere (P3/audit (g)).
- blessed-KILL-SURVIVOR allow-list (do NOT touch; a reviewer demanding removal is over-collapse):
  server/src/terms/{EnsureTerm.ts:27,MigrateTerms.ts:36}, schema/core/term.schema.yaml kind enum,
  server/src/ontology/biologicalTypes.ts:26 TERM_KINDS, TermSchema.test.ts:93, scientist-intent
  vocabulary, TaggerOutput, predicates CL:measures subject_kinds, executionMode 'instrument' MODE
  name, run-timeline display field, procurement 'instrument-supply' category string
  (ProcurementManifestService.ts:193), vendor-protocol roleKind enum
  (ingestion/vendor-protocol/types.ts:175, ZymoNormalization.ts:196 — a role classification, naming
  polish = separate item), event-editor deck labwareType 'instrument' (AddToDeckDialog.tsx,
  addDeckDialogModel.ts, LabwareFocus/LabwareGlyph — equipment-placement UI, verify-only), wizard
  ControlKind, inline test fixtures that use 'instrument' as an ARBITRARY kind string
  (OwnershipPolicyService.test.ts:31, applyOwnershipDefaults.test.ts:61-204,
  LocalAuthorization.test.ts:489 — the policy/ownership engine treats kind as an opaque string;
  these test the policy machinery, not the kind registry), instrument-definition/INSTDEF-,
  instrument-appliance-job / instrument-log / instrument-readout artifact/kind/log-type NAMES.

### C5 surface — UI survival + browser gate

- app/src/pages/RecordRegistryPage.tsx:27 instruments tab `{ id:'instruments', label:'Instruments',
  kinds:['instrument'] }` inside exported REGISTRY_TABS (:22-32; tab strip + combobox kinds + Create
  picker all derive from this data — :234 listRecordsByKind per kind). Delete the row. The "Create
  instrument entry" has NO literal string anywhere (verified grep): Create seeds its id from the
  schema's declared `^INSTR-` pattern via seedIdFromDeclaredPattern (:47-66) — removing the tab row
  removes the create entry BY CONSTRUCTION; the browser gate confirms absence.
- app/src/pages/RecordRegistryPage.createTab.test.tsx:439 iterates REGISTRY_TABS (no test-side kind
  map) → auto-retires; the `declaredPattern` helper's instrument:'INSTR' row (:87-:100 map, comment
  :90) is test-side data — drop the row. Other registry page suites (createSearch, createWhileOpen,
  qms6e, rail, styling, archiveBrowsing[QMS8-C-touched], test.tsx) — re-pin, run, expect delta-zero.
- app/src/collections/LabCollectionView.tsx:32 — label END-STATE is the single 'Equipment' (the
  QMS8-C branch already lands it; this item's removal supersedes any interim, per task block). C5
  adds/keeps the assertion in app/src/collections/LabCollectionView.test.tsx that the equipment
  category label === 'Equipment' and no 'Instrument' string appears in CATEGORIES.
- Derived measurement-capable filter (the ruling's survival view (b), NEW): computed from
  equipment-capability/verb-binding DATA, zero name-literals:
  data sources = apiClient.listRecordsByKind for 'equipment', 'equipment-capability',
  'verb-definition' (all already served; REGISTRY_TABS already lists capabilities/verbs tabs proving
  reachability); join shape mirrors server EquipmentCapabilityService.ts:59-115 (instance
  equipmentRef OR class join on the class ref id — an EQC record OR a CL: ontology CURIE).
  Seed evidence the filter must light up: records/seed/equipment-capability/ecp-quantstudio5.yaml
  (equipmentClassRef → EQC-QUANTSTUDIO5, capabilities[].verbRef → VERB-READ) and verb-definition
  seed verb-read.yaml (`domain: analytical_readout`, canonical: read). NO TS literal may name
  'EQP-QUANTSTUDIO5', 'ECP-*', 'VERB-READ', or 'INSTR'/'EQP' prefixes (H1/H2 carry over).
  No HTTP endpoint exposes the inventory today (verified: /execution/capabilities is the runtime
  adapter map — NOT this) → wiring-point is OQ-A below.

## Ordered commit rollout (C3 → C4 → C5; each = one reviewable commit pair RED→GREEN or one RED and
## one GREEN commit per the lane's QMS8-C convention)

Precondition (H4 carry-over, verified-by (1) history proof for THIS item): C1+C2 of
INSTR-COLLAPSE-1 merged to trunk and green BEFORE the C3 commit exists in history. The reviewer
checks `git log --oneline` shows the INSTR-COLLAPSE-1 merge as an ancestor of the first C3 commit.

**C3 — KIND DELETION** (verified-by (4) core; schema YAML ships inert until orch restart — H6 carry):
  RED (new file server/src/schema/InstrumentKindRetirement.test.ts, committed RED at the pre-deletion
  tree):
    (a) record.schema.yaml text + loadAllSchemas(): no `$ref` to instrument.schema.yaml in the oneOf;
    (b) full-pipeline validation REJECTS a minimal `{kind:'instrument', id:'INSTR-RETIRE-TEST',
        name:'x'}` payload (no oneOf branch / unknown kind) — asserts via the real Ajv registry like
        OwnershipPolicySchema.test.ts does, not a text grep of the schema;
    (c) loadKindLifecycleRegistry().coveredKinds does NOT include 'instrument';
    (d) the REAL OWN-LAB seed file (repo path, same read pattern as
        server/src/schema/OwnershipPolicySchema.test.ts:33) has no `- kind: instrument` rule and
        still validates;
    (e) files schema/lab/instrument.{schema,lint,ui}.yaml do not exist (existsSync false) — this
        assertion may live in the retirement suite so the deletion itself is test-pinned, not just
        rm'd.
  GREEN (same commit or follow): the deletions listed in the survey (3 files, record.schema.yaml :17,
  registry-kinds entry, seed row :86), plus collateral UPDATES (not weakenings): instrumentAuthoring
  suite retirement (instrument cases dropped, equipment coverage intact, file renamed),
  registryOpsLifecycle COVERED_KINDS 6 + :656-688 block dropped, KindLifecycleRegistry.test :42,
  migrateRecordLifecycles.test :100.
  Evidence: artifacts/INSTR-COLLAPSE-2/C3-RED-l1<tick>.txt / C3-GREEN-l1<tick>.txt.

**C4 — TS RESIDUE** (verified-by (4) tail):
  RED (flip expectations at the pre-change tree): InstrumentApplianceJob.test.ts:38-41 expects
  type 'equipment' (RED against the current 'instrument' emitter); NEW assertion in
  app/src/event-editor/rail/ReadPlateModal.test.tsx (suite exists, asserts nothing about the ref
  today — first-hand) that the POSTed appliance job carries request.instrumentRef.type ===
  'equipment' (RED via the mocked client capture). Measurement fixtures
  MeasurementService.test.ts:90 / MeasurementActiveControlService.test.ts:86 re-target to
  EQP-GEMINI/'equipment' (these are pass-through data updates, not assertion flips — they go GREEN
  either way; the two above are the real RED witnesses).
  GREEN: emitter type 'equipment' (InstrumentApplianceJob.ts:126; slug id stays — H8 blob-path rule
  carry-over), ReadPlateModal.tsx:56 type 'equipment', RecordEditController.ts:312 row deleted,
  RecordSearchHandlers.ts:111 dead row deleted, InstrumentRegistry.ts:35 label 'instrument-definition',
  ReuseAuthoringPanel.tsx:560 type 'equipment' + :941 'EQP-...' placeholder.
  Evidence: C4-{RED,GREEN}-l1<tick>.txt.

**C5 — UI SURVIVAL + DERIVED FILTER** (verified-by (6) substrate):
  RED: in a NEW suite app/src/pages/RecordRegistryPage.measurementCapable.test.tsx —
    (a) REGISTRY_TABS has no tab with id 'instruments' and no tab kind 'instrument';
    (b) with mocked listRecordsByKind fixtures (equipment incl. EQP-QUANTSTUDIO5 + a non-measuring
        EQP; equipment-capability incl. an ECP-style record bound to a verb-definition with
        domain analytical_readout + one bound to a liquid_handling verb; verb-definition list) the
        filter view shows EXACTLY the analytical-readout-capable equipment and names its capability
        record; the liquid_handling-only machine does NOT appear (the bait-6 discrimination: the
        filter must resolve verbs through declared data, not presence-of-any-capability);
    (c) implementation-source guard in the same suite: readFileSync(RecordRegistryPage.tsx) contains
        no 'INSTR-' / no 'VERB-READ' literal (name-literal ban made mechanically checkable).
  Update app/src/collections/LabCollectionView.test.tsx: label 'Equipment', no 'Instrument' in
  CATEGORIES.
  GREEN: tab row deleted; derived filter per OQ-A/OQ-B/OQ-C answers (defaults below if promoted
  unamended). Evidence: C5-{RED,GREEN}-l1<tick>.txt.

Evidence artifact naming (all legs): /home/brad/.hermes/cl/lanes/1/artifacts/INSTR-COLLAPSE-2/
C{n}-{RED,GREEN}-l1<tick>.txt (same convention as artifacts/QMS8-C/ — raw command output, first line =
timestamp + git HEAD + command).

## First targeted check

Step 0 — baseline pin (claim time, BEFORE any edit; read-only):
    cd /mnt/vast/home/brad/git/cl-integration-1
    git -c core.fileMode=false log --oneline -1                       # record HEAD (post both merges)
    grep -rn "type: 'instrument'\|'instrument', " server/src app/src --include='*.ts' --include='*.tsx' \
      | grep -v test | grep -vE "term|biological|procurement|roleKind|ControlKind"   # expect ONLY
      # InstrumentApplianceJob.ts:126 + ReadPlateModal.tsx:56 (allow-list matches excluded)
    grep -rn "kind: instrument$" /home/brad/.computable-lab-lane1/worktrees/main/records | wc -l  # expect 0
    grep -rln "kind: instrument-log" /home/brad/.computable-lab-lane1/worktrees/main/records | wc -l  # expect 11
    ls schema/lab/instrument.schema.yaml schema/lab/instrument.lint.yaml schema/lab/instrument.ui.yaml  # expect present (C3 deletes)
    grep -rn "kind: instrument$" records/ | wc -l                     # expect 1 (the OWN-LAB seed row — C3's own)
    npx vitest run (server, targeted suite list below) → record the pass/fail counts as the
    claim-time baseline; npm run typecheck -w server → record the error count (QMS8-C's post-merge
    trunk tsc baseline MUST be re-derived here, not carried from the 33-error era).
  If the corpus grep is NONZERO for instrument-kind records → STOP BOUNDARY 1.
  If instrument.{schema,lint,ui}.yaml are ALREADY GONE (someone widened an earlier item) → STOP, report.

Step 1 — the early proof (the single command that proves the approach, from the worktree's server/):
    npx vitest run src/schema/InstrumentKindRetirement.test.ts
  Expected: RED on every assertion (a)-(e) when committed before the deletions (today the files
  exist, the oneOf entry is record.schema.yaml:17, registry-kinds:14/:21 lists the kind, the seed
  row is :86) → GREEN after C3. Save as artifacts/INSTR-COLLAPSE-2/C3-RED-l1<tick>.txt before
  touching any deletion. This is the early-deletion-safety check: if it does NOT go RED, the
  precondition state is wrong — stop.

## Verification commands (complete; coder runs in the worktree, orch re-verifies on trunk)

Server (from server/):
    npx vitest run src/schema/InstrumentKindRetirement.test.ts src/schema/OwnershipPolicySchema.test.ts \
      src/api/handlers/RecordHandlers.authoring.test.ts \
      src/governance/registryOpsLifecycle.test.ts src/governance/archivedAssignment.test.ts \
      src/registry/ src/scripts/migrateRecordLifecycles.test.ts src/scripts/applyOwnershipDefaults.test.ts \
      src/security/LocalAuthorization.test.ts src/security/OwnershipPolicyService.test.ts \
      src/measurement/ src/compiler/artifacts/ src/compiler/pipeline/passes/EmitInstrumentApplianceJobs.test.ts \
      src/compiler/pipeline/passes/CheckInstrumentCapabilities.test.ts \
      src/api/handlers/MeasurementHandlers.applianceJob.test.ts src/execution/ src/terms/ src/ai/ \
      src/readiness/ src/capabilities/ src/compiler/protocol/
  Expected: ALL green, 0 failed (terms/readiness/execution green UNCHANGED is the point: the blessed
  keeps and the name-retentions must not need edits there).
  Full suite ONCE after C4: `npx vitest run` — delta vs step-0 claim-time baseline = zero failures
  (record both counts; never exclude silently).
Typecheck: `npm run typecheck -w server` → delta-0 vs the step-0 trunk baseline (re-derived, not
  assumed); `npm run typecheck -w app` → delta-0 vs trunk baseline.
App (from app/):
    npx vitest run src/pages src/collections src/shared/reuse src/event-editor/rail
  Expected: all green; RecordRegistryPage.createTab.test.tsx passes off REGISTRY_TABS with 8 tabs.
Grep proofs (worktree root, AFTER C3+C4 — expected outcomes exact):
    ls schema/lab/instrument.schema.yaml schema/lab/instrument.lint.yaml schema/lab/instrument.ui.yaml  → No such file ×3
    grep -n "kind: instrument$" schema/registry/registry-kinds.registry.yaml                            → no output
    grep -rn "instrument.schema.yaml" schema/ server/src app/src records scripts | grep -v instrument-log.schema | grep -v instrument-definition.schema → no output
    grep -rn "kind: instrument$" records/                                                               → no output
    grep -rn "type: 'instrument'\|type: \"instrument\"" server/src app/src scripts                      → no output outside InstrumentKindRetirement/retirement-pinning tests
    grep -rn "recordRef('instrument/gemini-em', 'instrument'" app/src                                   → no output
    grep -n "'instrument': 'INS'" server/src/ui/views/RecordEditController.ts                           → no output
    grep -n "kinds: \['instrument'\]" app/src/pages/RecordRegistryPage.tsx                              → no output
    grep -c "instrument-log" schema/lab/instrument-log.schema.yaml                                      → PRESENT (retained kind name — this grep MUST still hit; deleting it is over-collapse)
    grep -rn "INSTR-" server/src app/src schema --include='*.ts' --include='*.tsx' --include='*.yaml' | grep -v test → no output (test-side retirement fixtures allowed; schema/registry/instruments/ INSTDEF- ids are instrument-definition — different kind, keep)
Live re-probe (ORCH ONLY, read-only GETs on :3092 after the restart): kind=instrument list → empty/
unknown-kind per store behavior post-deletion; GET /records/EQP-QUANTSTUDIO5 → 200; GET
/records/ECP-QUANTSTUDIO5 → 200.
Browser gate: surfaces below; receipts under ~/.hermes/cl/receipts/INSTR-COLLAPSE-2/.

## Browser-gate surfaces (for the orch's later cl-browser-reviewer dispatch on :5192)

1. /registry: equipment tab lists ONE row per machine (no parallel instruments tab; EQP-QUANTSTUDIO5
   present exactly once); tab strip has no 'Instruments' tab.
2. The derived measurement-capable filter view shows EQP-QUANTSTUDIO5 and names capability
   ECP-QUANTSTUDIO5 (VERDICT-critical: the ECP record must be VISIBLE/attributable in the view, not
   just the machine).
3. No 'Create instrument' entry: the Create affordance offers no instrument kind; no ^INSTR- id is
   ever seeded.
4. Equipment editor unregressed: EQP-QUANTSTUDIO5 opens its editor, fields render, no console errors
   (negative claims re-verified per the reviewer reliability rule — API readback before reporting).
5. /lab collection: single 'Equipment' category label, no 'Instruments & Equipment' string.

## Worker contract

- Branch: cl/lane1-instr-collapse-2-l1t<tick> off trunk cl/integration-1 HEAD AT CLAIM TIME (after
  BOTH the QMS8-C merge and the INSTR-COLLAPSE-1 merge; do not assume any hash in this draft).
- Worktree: /mnt/vast/home/brad/git/wt/INSTR-COLLAPSE-2-lane1-l1t<tick> (node_modules + server/app
  symlinks per lane practice; background the NFS worktree add).
- Report (unique per tick): ~/.hermes/cl/lanes/1/instr-collapse-2-report-l1<tick>.md; evidence
  artifacts/INSTR-COLLAPSE-2/C{3,4,5}-{RED,GREEN}-l1<tick>.txt; log logs/coder-INSTRCOLLAPSE2-l1<tick>.log.
- Fleet-coder note: server vitest runs from server/, app vitest from app/; NFS: ALL git via
  `git -c core.fileMode=false`; tsx --watch does NOT reload YAML — the orchestrator restarts the
  :3092/:5192 stack; the coder NEVER restarts it and makes NO mutating :3092 calls.
- Coder NEVER: edits the task list or canonical spec; touches /mnt/vast/home/brad/git/computable-lab,
  :3001/:5174; writes lane runtime data (incl. the OWN-LAB runtime twin — orch-owned data repo);
  renames blob paths / the `instrument/<slug>` id style (memo §5, H8); touches instrument-definition
  / INSTDEF- / readout/assay-definition kinds, schema/registry/instruments/, or the blessed-keep
  vocabulary list (file-ownership + survey allow-list).
- Coder OWNS: C3 = the 3 deleted files + record.schema.yaml + registry-kinds + the seed OWN-LAB file +
  instrumentAuthoring suite (retire/rename) + registryOpsLifecycle + KindLifecycleRegistry.test +
  migrateRecordLifecycles.test + new InstrumentKindRetirement.test.ts. C4 = InstrumentApplianceJob.ts
  + its test, ReadPlateModal.tsx (+ test assertion), RecordEditController.ts, RecordSearchHandlers.ts
  (re-pin), InstrumentRegistry.ts:35, ReuseAuthoringPanel.tsx, the 2 measurement test fixtures,
  EmitInstrumentApplianceJobs.test.ts. C5 = RecordRegistryPage.tsx + REGISTRY_TABS-fed tests +
  measurementCapable suite (new), LabCollectionView(.test) label assertion, and the derived-filter
  implementation module per OQ answers.

## Reviewer bait (anticipating the adversarial review — the coder pre-empts each with named evidence)

1. **Deletion-before-retarget commit-order check:** the deletion commit must be a DESCENDANT of the
   INSTR-COLLAPSE-1 merge AND of the QMS8-C merge in trunk history; `git merge-base --is-ancestor` is
   the mechanical proof. If instrument.schema.yaml vanishes in a commit that ALSO retargets refs,
   that inverts the ruling's gate — block.
2. **Name-literal filter check:** the derived filter must resolve verbs through verb-definition
   records. Hunt for `'VERB-READ'`, `'EQP-QUANTSTUDIO5'`, `'INSTR'`/`'EQP'` prefix sniffs, or
   "any capability ⇒ measurement-capable" shortcuts in the C5 diff (the liquid_handling-only-machine
   test case is the discriminator; the implementation-source guard assertion is in the suite).
3. **Pin-weakening:** COVERED_KINDS 7→6 and the deletion of registryOpsLifecycle's instrument block
   and instrumentAuthoring's instrument cases are RETIREMENTS of a retired kind, not weakened pins —
   every surviving case must still assert its original claim. Any assertion edited from `expect(x).toBe(y)`
   to a looser form, or any `.skip`/`it.fails` churn, is a STOP (boundary 4), not a fix.
4. **OWN-LAB row retarget proof:** deletion of the seed row must leave
   OwnershipPolicySchema.test.ts (which reads the REAL file) green AND the retirement suite's
   assertion (d) green — proof the row is gone without dangling a per-kind policy. The runtime twin
   in the lane data dir staying stale is data (orch-owned), NOT a coder deliverable — a reviewer
   demanding a data-dir write is out of contract.
5. **instrument-log NAME retention proof:** after all greps, schema/lab/instrument-log.* must still
   exist with kind const 'instrument-log' and property instrumentRef; the 10 TS files querying
   kind 'instrument-log' must show a ZERO diff. Any diff touching those names is over-collapse.
   Same for instrument-definition/INSTDEF-, instrument-appliance-job, instrument-readout,
   executionMode 'instrument', terms/ontology surfaces, wizard ControlKind, deck labwareType.
6. **Coverage-silent-drop check:** instrumentAuthoring.test.ts also guards EQUIPMENT authoring
   (denyCode EQUIPMENT_AUTHORING_FORBIDDEN, :453/:505). Post-retirement the equipment cases must be
   present and green — count the `it(` blocks per describe in the report.
7. **exactOptionalPropertyTypes sites:** server/tsconfig has it ON. The ReadPlateModal and
   MeasurementActiveControlService spread-idiom copies (`...(x !== undefined ? { x } : {})` at
   MeasurementActiveControlService.ts:156,:238) must not gain `: undefined` assignments; the C5
   filter's optional props (capability label, matched verb) follow the same idiom.
8. **YAML-reload trap:** C3 deletes schema/lint/ui YAML — inert on the live stack until the ORCH
   restarts. "kind=instrument still lists 200" after merge = missing restart, not a broken delete;
   the coder runs NOTHING against :3092 — any live claim in the report without an orch restart stamp
   is unverified theater.
9. **Slug-id confusion:** `instrument/gemini-em-plate-reader` (appliance-job refs, ILOG runtime refs)
   is a directory-style id retained per memo §5; the `^INSTR-` PATTERN is the kind's — gone with the
   schema. A "fix" rewriting slug ids to EQP- in C4/C5 widens the scope (blob-path rule H8).
10. **QMS8-C / INSTR-1 rebase residue:** registry-kinds instrument entry is :14 pre-QMS8-C, :21 on
    the branch; equipment/measurement cites in the INSTR-1 spec are pre-merge. All cites here are at
    455b6c4a — reviewer checks against claim-time HEAD, not this draft's numbers.
11. **Superseded-ruling bait:** registryOpsLifecycle's comment cites an orchestrator ruling "KEEP AT
    7"; the collapse ruling (Brad 2026-10-21T19:15) supersedes it for this kind — 6 is correct WITH
    a commit-message note; a reviewer citing the old ruling is stale, a coder silently editing the
    comment count without the note is sloppy.
12. **Second-emitter check:** the 1-hit re-pin was an object-literal grep; the honest end-state
    requires the ReadPlateModal.tsx:56 positional emitter gone too (survey DELTA) — verified-by (4)
    "no TS kind-literal residue" is only true including it.

## Hard rules carried over (from INSTR-COLLAPSE-1, binding here unchanged)

H1 no hardcoded policy in TS (device names / id-prefix sniffs / permanent VERB-READ-only rules) —
the C5 filter is the live test of this. H2 a forced TS verb-literal = STOP. H5 exactOptionalPropertyTypes
spread idiom. H6 YAML ships in commits, restart is the orchestrator's. H7 RED-first per leg. H8 blob
paths / slug id styles do not move. H9 clean-break: fixtures/docs update in-diff, no shims.

## Stop boundaries (identical list to INSTR-COLLAPSE-1; task block: "same hard stops")

1. Live/seed corpus shows ANY instrument-kind record (0-records is the ruling's premise): STOP;
   record migration = re-scope with Brad. (Also tripped by instrument.{schema,lint,ui}.yaml already
   absent at claim time — precondition violation.)
2. Any C3-C5 ref surface whose contract-host cannot be expressed as tabled by C1/C2 (e.g. a post-C2
   schema pins a shape the C4/C5 fixtures cannot legally emit): STOP AND FLAG architecture-re-up — do
   not invent a new kind or re-open C1/C2 in this branch.
3. The derived filter forcing a TS verb/device literal anyway (H2): STOP — that is the OQ-A/OQ-B
   design answer, not a worker pick.
4. Any suite only goes green by WEAKENING (not re-seeding/retiring-with-note) its assertion: STOP —
   the pin is truth; escalate.
5. Need to touch instrument-definition/readout/assay kinds, schema/registry/instruments/, blob paths,
   protocol-role naming, or the blessed-keep vocabulary list: STOP — out of scope.
6. registry-kinds / task-YAML rebase conflict where both rulings cannot coexist: STOP with the exact
   hunk — never resolve a governance conflict unilaterally.

## OQ list for the orchestrator (genuine ambiguities; defaults stated so promotion can amend inline)

**ORCH ANSWERS (promotion 2026-10-22T04:50, l1t0445 — binding, replaces the open questions):**
- OQ-A: (i) APPROVED — client-side derivation in RecordRegistryPage from the three existing
  listRecordsByKind reads. Zero new API surface; the item's file list owns no server route file.
- OQ-B: CONFIRMED — qualifies iff instance-OR-class join resolves >=1 capability whose verbRef
  verb-definition declares `domain: analytical_readout` (resolved from verb-definition RECORD data,
  never a verb id literal). The RED suite's mock fixtures follow this.
- OQ-C(1): toggle/pill 'Measurement-capable' on the Equipment tab (recommended option adopted; no
  kind-shaped pseudo-tab for a retired kind). (2) RecordSearchHandlers.ts:111 kindHints row: DELETE
  ratified (dead registry key; the concept-vocabulary blessing covers descriptions, not dead keys).
  (3) settled: the QMS8-C branch lands 'Equipment' (D8-i) — C5 keeps only the regression assertion.

OQ-A (C5 wiring point). No HTTP endpoint exposes the per-equipment capability inventory today
(server EquipmentCapabilityService.ts:59 is in-process only; /execution/capabilities is the adapter
map — both verified first-hand). Options: (i) client-side derivation in RecordRegistryPage from the
three existing listRecordsByKind reads (zero new API surface; mirrors the service's join shape in TS;
checked by the vitest suite above) — RECOMMENDED; (ii) a new GET /equipment/:id/capabilities endpoint
reusing EquipmentCapabilityService (cleaner shape-ownership but adds API surface this item's file
list does not own). Checked: server/src/server.ts route wiring, ExecutionHandlers.ts:1658-1670,
app/src/shared/api/client.ts listRecordsByKind usage at RecordRegistryPage.tsx:234.
OQ-B (selection predicate for 'measurement-capable'). Derived-from-data rule proposed: a machine
qualifies iff it resolves (instance OR class join, EquipmentCapabilityService shape) at least one
capability whose verbRef verb-definition declares `domain: analytical_readout` (verb-read.yaml
verified: canonical read, domain analytical_readout; verb-definition.schema.yaml:36 enum). Alternative:
a NEW declared flag (e.g. a capability-gate-style annotation) — heavier and not blessed anywhere.
'analytical_readout' is a declared schema-enum operation-layer term, not a device name — H1-compatible.
Confirm the predicate; this decides the RED suite's mock fixtures.
OQ-C (UI shape + two small calls). (1) Filter shape: a 'Measurement-capable' toggle/pill on the
Equipment tab (recommended — the tab strip stays a pure kind list, one-row-per-machine is the default
view, verified-by (6) reads 'filter view') vs. a derived pseudo-tab 'Instruments' (keeps the word
visible but re-introduces a kind-shaped tab for a retired kind). (2) RecordSearchHandlers.ts:111's
dead kindHints row: spec says DELETE (dead registry key) vs. KEEP (concept-vocabulary blessing) —
orch ratify. (3) If QMS8-C's merge somehow landed the interim label WITHOUT D8-i (branch check says
it lands 'Equipment'): C5 owns the rename to 'Equipment' (single Equipment end-state per task block).

STATUS: draft-complete
