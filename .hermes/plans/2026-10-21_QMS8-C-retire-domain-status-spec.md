# QMS8-C — Retire the domain status field for lifecycle-governed kinds (lifecycle state is the single truth)

DRAFT — composed 2026-10-20T22:10 by cl-spec-composer (session proc_c30eac6b3ca5) for lane 1.
Trunk: /mnt/vast/home/brad/git/cl-integration-1, branch cl/integration-1, HEAD 9a51c1f2.
All file:line evidence below was read first-hand in the trunk at 9a51c1f2 (no scout used —
every claim is a first-hand read; scout output would have been screening, not authority).
Live-corpus counts were re-probed first-hand via bounded read-only GETs on :3092 at ~22:15
(no mutating calls, no restarts).

============================================================================
## BRAD-DECISION (flagged in the draft header, per the task block)

The task block rules the SPIRIT is CLEAN BREAK but does NOT pre-approve the tolerated-legacy
alternative, and the recon found a third axis Brad's ruling must land on: the `state ?? status`
fallback is SHARED with lifecycle kinds that are NOT registry-ops-covered (material/term/
material-spec on lab-vocabulary-control) whose records have NO `state` at all — deleting the
fallback outright silently disarms the vocabulary-curation gate. The one question for Brad:

  "How deep is the clean break?"

  BRAD-A1 (full clean break): schema REJECTS status outright on instrument+equipment
    (data edit: delete the property + required-list entry — `additionalProperties:false` /
    `unevaluatedProperties:false` then reject smugglers); the migration's forward leg strips
    status from every covered record; the `state ?? status` fallback is DELETED OUTRIGHT in
    lifecycleMiddleware.ts AND LifecycleHandlers.ts:53; material/term/material-spec are
    state-stamped FIRST (a small sibling migration, status→state, their enums are 1:1 with
    lab-vocabulary-control states — corpus today: 8 material + 8 material-spec records, 0
    carry state) or the gate is fail-open between commits.
    Blast radius: largest — touches materials (OAS.ts:169 equipment leg, draft-projection
    docs, ingestion/records.ts:152 writes status:'in_review' server-side), all seeds, all
    fixtures, both fallback sites. Migration burden: covered corpus (51 lane records + 25
    equipment seed files, see counts) + vocab-control corpus (≤13 records).

  BRAD-A2 (clean break for covered kinds; fallback retired coverage-scoped) — RECOMMENDED:
    same schema/migration/UI/seed rejections for instrument+equipment; the middleware stops
    consulting `status` for any kind the COVERAGE DATA declares (KindLifecycleRegistry is
    injected — no kind literals), so the covered leak is dead; the residual `status` fallback
    survives ONLY for non-covered lifecycle kinds (exactly the vocab-control kinds today) and
    is flagged in-file as dead-once they migrate, which becomes its own honest follow-up item.
    Blast radius: registry corpus only; zero materials/ingestion coupling; ordering trap
    avoided by construction. Migration burden: 51 covered records.
    Decisive argument: the task's own ordering rule — "fallback removal lands BEFORE any
    schema stops accepting status, or governed reads silently regress" — is exactly the trap
    an outright deletion re-arms for lab-vocabulary-control (the middleware is shared:
    MaterialLifecycleHandlers.ts:589 calls the SAME checkLifecycleTransition; live probe
    shows material records lifecycleId='lab-vocabulary-control', status:'proposed', NO state;
    schema/lab/material.schema.yaml declares no `state` property at all). A2 removes the
    status channel for exactly the kinds the ruling covers, keeps zero fail-open windows,
    and defers nothing about the one-vocabulary rule for covered kinds — it only defers the
    vocab-control corpus to its own item, where the ingestion write path must ride with it.

  BRAD-B (tolerated-legacy, NOT pre-approved): schemas KEEP accepting status on covered
    kinds; a lint rule forbids status when lifecycleId is present (lint failures block writes
    — RecordStoreImpl.ts:581-585). Blast radius: smallest code, but the false claim stays
    latent ON DISK (the migration is still needed to clean 51 records), old records keep
    status forever if lint scoping slips, and the mapping data (stateByDomainStatus) can
    never be retired — the reconciler's reason to exist survives, which is what the task's
    why-block explicitly rejects ("this removes the mapping's reason to exist rather than
    adding a parallel reconciler"). RECOMMEND AGAINST.

============================================================================
## Goal (one sentence)

Retire the domain `status` field for lifecycle-governed registry kinds so lifecycle state is
the single truth: fallback gone, schema rejects status on instrument/equipment, every covered
record stripped via the existing QMS7-4 runner, no UI surface renders domain status for
covered kinds, and the create-instrument surface made honest.

## Accepted intent — acceptance criteria VERBATIM from the task block (lines 6217-6227)

verified by: >-
  (1) RED-first server tests: creating a covered record carrying status -> 4xx
  after switchover; a governed transition no longer resolves state from status
  (fallback removed). (2) Migration dry-run report on the lane corpus: N records
  stripped, zero validation failures post-migration, re-derivable. (3) Grep
  proof: no covered-kind creation form sends status; no list/card renders domain
  status for covered kinds. (4) All existing lifecycle/registry suites green
  (registryOpsLifecycle, archivedAssignment, W25RegulatedLifecycle — they
  currently seed status; fixtures update). (5) Browser gate: registry shows
  EQP-NEW-7LS1 as Draft (not active) with the status field absent from its form;
  VERDICT: accept.

Ordering rule (task notes, binding): "fallback removal (1) lands before any schema stops
accepting status, or governed reads silently regress."

## Live-corpus counts (re-verified first-hand, GET :3092, 2026-10-20 ~22:15)

CONFIRMS the orchestrator evidence and the honest-create finding:
- kind=instrument: **0 records** (`{"records":[],"total":0}`).
- kind=equipment: **39 records**; ALL 39 carry BOTH `status` and `state`
  (+ lifecycleId=registry-ops on all). 16 of them carry status:"active" while
  state != "active" — the defect class, including the motivating EQP-NEW-7LS1
  (status:active + state:draft, createdBy USR-BRAD, payload kind:"equipment")
  and EQP-AUTOCLAVE/BALANCE/CENTRIFUGE/FREEZER-20/QUANTSTUDIO5 (active/archived).
- Full covered-kind sweep (dry-run denominator, per coverage file):
  equipment 39 (39 with status), person 8 (8), training-record 3 (3),
  calibration-record 1 (1), instrument 0, equipment-class 4 (0),
  competency-authorization 0 → **migration strip count = 51 records**, plus the
  repo seed corpus: records/seed/equipment = 25 files, ALL carrying `status: active`
  (already carry lifecycleId+state from QMS7-4). Non-zero-status enums seen in the
  lane corpus: person includes contractor (legit non-lifecycle vocabulary — see scope),
  training-record includes completed, calibration-record includes pass.
- Vocabulary-control kinds (for the BRAD gate): material 8 records (5 with status,
  0 with state), material-spec 8 (1 status, 0 state), term 0, request 0, sample 0, order 0.

============================================================================
## Recon (CONFIRMED/CORRECTED, file:line evidence at 9a51c1f2)

(a) THE FALLBACK — lifecycleMiddleware.ts:38-39
    `const nextState = (nextPayload.state ?? nextPayload.status)` / same for previousState.
    CONFIRMED. Callers of checkLifecycleTransition:
      - server/src/api/handlers/RecordHandlers.ts:1115 (updateRecord leg)
      - server/src/api/handlers/MaterialLifecycleHandlers.ts:589 (MATERIALS update leg —
        material/term review transitions)
    Second leak surface the task block does not name:
      - server/src/api/handlers/LifecycleHandlers.ts:53 (GET /lifecycle/:id/transitions?recordId=…)
        `state = String(payload.state ?? payload.status ?? 'draft')` — this is how the UI
        (DocumentControlBar) computes AVAILABLE transitions; a status-carrying record gets
        transitions computed from its DOMAIN status. For covered kinds it is dead once state
        is stamped; it is a genuine silent-leak site and must be named in the retirement.
    State-is-always-stamped claim — CONFIRMED for COVERED kinds:
      - create stamp: RecordHandlers.ts:698-721 ("QMS7-3 generic stamp-at-create") unconditionally
        sets stamped.lifecycleId + stamped.state for any kind with a coverage entry; refuses
        non-default state at create (INITIAL_STATE_REQUIRED :710-715).
      - existing records: QMS7-4 migration already stamped all of them (live probe: 51/51
        covered records with a status carry a state too).
      - the archive guard already reads state ONLY, never status (RecordHandlers.ts:289-291,
        pinned since QMS7-4 as "bait #5").
    CORRECTED / THE CRITICAL NUANCE: "covered kinds always have state" is true, but the
    middleware is NOT covered-only. Material/term/material-spec schemas DECLARE lifecycleId
    (schema/lab/material.schema.yaml:35-38 const lab-vocabulary-control) + a `status` enum,
    and declare NO `state` property (grep: no `state:` in material.schema.yaml); live records
    carry status with no state (MAT-MESH-D056945: lifecycleId=lab-vocabulary-control,
    status='proposed', state absent). Deleting the fallback outright makes checkLifecycleTransition
    see previousState===nextState===undefined → early-allow at :42 → the lab-vocabulary-control
    role gate fails OPEN. This is the fail-open landmine that shapes the BRAD gate.
    Also stale-but-harmless: comment at RecordHandlers.ts:717-718 references "the lifecycle
    middleware's `state ?? status` fallback" — text fix only, must not delete the BOTH-stamp.

(b) SCHEMA SITES
    - schema/lab/instrument.schema.yaml:8 `additionalProperties:false`; status property
      declared at :75-78 (enum [active, out_of_service, retired, maintenance]).
      CORRECTED vs the task block: instrument status is NOT required (required list :10-13 =
      kind/id/name). Only the .ui.yaml form declares it required.
    - schema/lab/equipment.schema.yaml:8 `unevaluatedProperties:false`; **status in required
      list at :16** (CONFIRMED REQUIRED) + property :73-75 (same enum).
    - UI forms demanding status: schema/lab/instrument.ui.yaml:29-37 (form field, select);
      schema/lab/equipment.ui.yaml:27-38 (form field, `required: true`) and :86 (list column).
    - Covered kinds' status is NOT uniformly lifecycle-vocabulary (scope question, see D3):
      person.schema.yaml:17 required + :31-33 enum [active, inactive, contractor, suspended];
      training-record.schema.yaml:18 required + :56-58 [passed, completed, failed, in_progress];
      calibration-record.schema.yaml:17 required + :43-45 [pass, fail, adjusted, limited_use];
      competency-authorization.schema.yaml:18 required + :36-38 [active, suspended, revoked];
      equipment-class: NO status (nothing to do, CONFIRMED clean).

(c) COVERAGE FILE — schema/registry/registry-kinds.registry.yaml
    Covered kinds (:8-15): person, equipment, equipment-class, training-record,
    competency-authorization, instrument, calibration-record. lifecycleId: registry-ops,
    defaultState: draft. `migration.stateByDomainStatus: {active: active}` + `default: draft`
    at :29-32. "Retire the forward use" as a DATA edit: delete the whole `migration:` block —
    parseMigration treats the block as OPTIONAL (KindLifecycleRegistry.ts:93-94: raw===undefined
    → undefined), and migrateRecordLifecycles.mappedState's no-block branch (:143-151) then maps
    status-less records to the declared defaultState and REFUSES to guess for status-carrying
    records (never-forced). CAUTION (reviewer bait): deleting only `stateByDomainStatus` while
    keeping `migration:` throws at loader validation (:96-105 requires raw.default) — the block
    goes whole or not at all.

(d) THE RUNNER — server/src/scripts/migrateRecordLifecycles.ts (QMS7-4 pattern, CONFIRMED)
    - Dry run BY DEFAULT, writes only with --apply (:10-11, :217-245); resolved data dir printed
      FIRST (:167); CONFIG_PATH REQUIRED, never defaults onto live data (:275-285); coverage-driven,
      no kind names in TS (:179-183); mapping is DATA (:118-156); idempotent on payload CONTENT —
      already-governed records SKIP (:189-200); ONE store.update per record with expectedSha +
      viaLifecycleApi + actor, never skipValidation/skipLint; store refusals REPORTED, never
      forced (:225-243).
    - The forward "strip status after mapping" leg rides THIS runner as a new phase (not a new
      script): the file's whole posture (injected core function, MemoryRecordStore-testable,
      report shape, walls) is exactly what a strip leg needs; a new script duplicates ~90 lines
      of wiring. See D5 for the design.

(e) UI RENDER SITES for covered-kind domain status
    - schema UI slots (the projection the registry forms render): equipment.ui.yaml:27-38 (form
      select, required) + :86 (list column); instrument.ui.yaml:29-37 (form select).
      NO state slots exist in these ui files today; the record's state pill comes from
      app/src/components/registry/DocumentControlBar.tsx:66-67,142-143, which already renders
      `payload.state` ONLY (no status anywhere in that component — CONFIRMED). Retirement =
      removing the status slots/columns; state labels are the lifecycle YAML's own `label:`
      values (schema/core/lifecycles/registry-ops.lifecycle.yaml: draft→"Draft",
      active→"Active", archived→"Archived") surfaced by DocumentControlBar — NO client label
      map may be invented (ontology/vocabulary rule).
    - app/src/collections/LabCollectionView.tsx:128-131 — the /lab equipment category card
      renders `p.status` as a helper token via statusVariant() (:48). This IS a covered-kind
      domain-status render. (person card :147-151 does not read status; controlled-document
      :160 already prefers state; vendor-pdf :174 state-only — out of scope.)
    - app/src/components/registry/RecordListTable.tsx:65 renders any 'status' column with a
      badge — CONFIRMED UNUSED: no importer outside its own test exists (grep). Do not extend;
      its ui-driven columns go blank automatically when the ui.yaml column is removed.
    - The /registry row list (RecordRegistryPage.tsx:703-717) renders title + kind badge only —
      no status render there (task block's "registry list columns" refers to the ui.yaml list
      columns above).
    - NOT covered-kind status (explicitly OUT of scope): run/analysis/execution-task status
      (ExecutionTaskService.ts etc.), ingestion/lint status fields, user.schema status
      (AuthorizationService.ts:458, LocalIdentityService.ts:24), equipment-capability status
      (EquipmentCapabilityService.ts:93 — kind NOT in coverage), material-instance/aliquot
      status (:86/:95, not lifecycle-bearing), material/material-spec/term status (vocab-
      control; see BRAD gate), services request/sample status, tyf order status.

(f) THE HONEST-CREATE SURFACE (EQP-NEW-7LS1)
    - /registry tab data (RecordRegistryPage.tsx:23-31): `{ id:'instruments', label:'Instruments',
      kinds:['instrument'] }` EXISTS, and the QMS7-5 per-tab Create resolves kind→schema from
      GET /schemas + deriveSchemaNode (RecordRegistryPage.tsx:351-393, app/src/browser/SchemaTree.ts:39-59)
      — on CURRENT trunk that path would POST kind:'instrument' (seed id INSTR-NEW-XXXX, :55-62).
      CONFIRMED instrument kind is created 0 records on the lane.
    - WHY instrument create is effectively dead: registryOpsLifecycle.test.ts:660-681 PINS a
      pre-existing defect — instrument.schema.yaml (additionalProperties:false, FAIRCommon NOT
      mixed in) rejects the provenance fields the create handler injects (createdAt/createdBy/
      updatedAt, RecordHandlers.ts:747-759) → every API instrument create 422s ("Unknown property
      createdAt"). The `it.fails` test at :678 flips to failing the moment the injection
      exemption is fixed — that test must be reconciled by this item's C3.
    - Surfaces that promise "instrument" and PRODUCE equipment records (the one-entity-one-term
      defect sites):
        1. /lab category `{ id:'equipment', label:'Instruments & Equipment', kind:'equipment' }`
           (LabCollectionView.tsx:32) — label promises instruments, fetches/creates equipment kind.
        2. server POST equipment-from-Exa: EquipmentHandlers.ts:101-123 `createFromExa` builds
           `kind:'equipment'` with HARDCODED `status:'active'` (:117) — a second "instrument"
           mint (the AddEquipmentDialog Exa path) and a live hardcode the retirement must delete.
        3. AI deck mints: app/src/event-editor/deck/acceptedEquipmentAdditions.ts:41-53 mints
           EQP- records for AI-added "instruments".
      EQP-NEW-7LS1's payload (name "Quant Studio 5", manufacturer "Thermo", serialNumber "12345")
      is hand-form data, -NEW- id → a registry/lab create FORM produced it (form default +
      ui required status:'active'). The exact affordance Brad clicked is not fully pinned from
      the code alone; the create affordance inside /lab/:category is flagged UNVERIFIED.
    - Smallest honest-fix candidates (Brad rules; recommendation below):
        (i) RENAME the conflated labels: LabCollectionView.tsx:32 label → 'Equipment'; the deck
            dialog keeps its instrument-CLASS words but the record vocabulary stays 'equipment'.
            Cost: data-ish one-liners, zero risk.
        (ii) RETIRE the duplicate entry: remove the Instruments tab + declare instrument a
            vestigial kind — honest today (0 records, create broken), but it deletes a declared
            kind surface without fixing its create bug.
        (iii) REROUTE: fix the instrument-create provenance defect (add the FAIRCommon mixin to
            instrument.schema.yaml, the pattern equipment already uses) and make 'instrument'
            actually creatable, then every "instrument" word routes to instrument kind.
      RECOMMENDATION: (i) now (this item, one label line) + open a follow-up item for the
      instrument-kind existence question (fix create or retire the kind — Bradley's call once
      create works and the kind can be exercised). (iii) inside THIS item risks scope creep
      past the status retirement; (ii) without fixing create just moves the lie.

(g) COVERED vs NOT — the exact schema-edit scope (2-vocabulary map)
    COVERED (registry-ops, per coverage file): person, equipment, equipment-class (already
    status-free), training-record, competency-authorization, instrument, calibration-record.
    The task block's FILES name ONLY instrument + equipment schema/ui edits — and the recon
    says that scope is principled, not an omission: instrument.status and equipment.status
    contain the lifecycle word `active` (duplicate vocabulary of registry-ops states) while
    person (contractor/suspended/inactive), training-record (passed/failed), calibration-record
    (pass/fail/adjusted) carry ORTHOGONAL domain facts that the admissibility wall CONSUMES
    (server/src/authorization/OperationalAdmissibilityService.ts:169 equipment, :207 person,
    :219/:251 competency-authorization, :285 training, :337 calibration, :351 qualification).
    Retiring those statuses would delete real admissibility semantics = platform gap →
    REQUIRES-RESCOPE (stop boundary). They stay in this item's scope as: covered records of
    those kinds get the fallback retired (never read status as state) but KEEP their domain
    status fields; a follow-up item redesigns admissibility per orthogonal vocabulary.
    NON-COVERED kinds KEEPING status legitimately (untouched): user, equipment-capability,
    qualification-record, material-instance, aliquot, run/analysis/execution kinds, services
    request/sample, tyf order, plus vocab-control kinds (material, material-spec, term — with
    the lab-vocabulary-control status/state collision flagged for its own item; note their
    status enum IS the state vocabulary, proposed/in_review/... — a true single-vocabulary
    migration target later).
    The CLEAN-BREAK schema edit (BRAD-A): delete the status property + required entry from
    schema/lab/instrument.schema.yaml and equipment.schema.yaml — with additionalProperties:false
    (instrument) / unevaluatedProperties:false + FAIRCommon-not-declaring-status (equipment;
    schema/core/common.schema.yaml FAIRCommon has NO status — verified) this rejects smugglers
    OUTRIGHT at Ajv with no new syntax. No lint needed for A; B would add the lint rule instead.

============================================================================
## Design decisions (the chosen shape; assumes BRAD-A2 — A1 differs only at D1/D4 + the
## vocab-control sibling migration; B differs at D4/D5/schema and is NOT recommended)

D1 — Fallback retirement (commit C1, FIRST, per the task's ordering rule).
    server/src/lifecycle/lifecycleMiddleware.ts:38-39 stop consulting `status` for kinds the
    COVERAGE DATA declares. Mechanic WITHOUT kind literals: RecordHandlers.ts:1115 already knows
    the payload kind; pass a coverage-scoped resolver (e.g. an optional `coveredKinds: Set<string>`
    / `isCoveredKind(kind)` callback from security.getKindLifecycleCoverage().kinds() into
    LifecycleCheckInput, or resolve state=state-only when covered) — the coverage registry is
    already wired at server.ts:465/790. Non-covered kinds with lifecycleId (material/term) keep
    the legacy read until their own item migrates them (under BRAD-A1 this exception vanishes —
    the migration of vocab-control kinds lands in the SAME commit as the outright deletion).
    LifecycleHandlers.ts:53 gets the same coverage-scoped treatment. In-file comment at both
    sites: "status fallback retired for lifecycle-covered kinds (QMS8-C); residual read exists
    only for lab-vocabulary-control kinds, pending their own state migration — do not widen."
    Also in C1: delete the prompt-policy sentence "- Set status to 'active' if the schema has a
    status field" from the AI precompile system prompt (server/src/api/handlers/RecordSearchHandlers.ts:238)
    — the server must stop INSTRUCTING creation payloads to carry status (hardcoded policy in TS).

D2 — Create-stamp hardening (rides C1 or C3, coder's call): RecordHandlers.ts:698-721 stays
    (BOTH-stamp is load-bearing until C3 ships); under BRAD-A a covered create carrying status
    is rejected by SCHEMA (4xx, verified-by 1). Under B it would need an explicit 422 leg — B's
    extra cost, not recommended.

D3 — Schema + UI DATA edits (commit C3): instrument.schema.yaml delete :75-78; equipment.schema.yaml
    delete :16 (required entry) + :73-75; instrument.ui.yaml delete :29-37; equipment.ui.yaml
    delete :27-38 and the :86 list column. No state-column addition needed: rows already show the
    kind badge and the form header shows the DocumentControlBar state pill with lifecycle-YAML
    labels. Update the stale exclusion comment in schema/lab/equipment.lint.yaml (lines 4-7 mention
    `status` exclusion) in the same commit.

D4 — The strip migration (runner leg, lands C2 BEFORE C3 ships, applied by the ORCHESTRATOR):
    extend migrateRecordLifecycles.ts with a second phase keyed off NEW coverage DATA:
    `migration.stripDomainStatus: true` (data flag in the `migration:` block). Semantics: for
    covered records that are ALREADY governed (today's SKIP branch, :189-200 — that branch is
    precisely the set the strip leg must process, so the idempotency key CHANGES: skip only when
    governed AND payload lacks the key), plan a write whose payload deletes the `status` key.
    The key name `status` lives in the runner exactly as mappedState already reads `payload.status`
    generically (:133) — one declared migration instruction, no per-kind branching; the DATA flag
    decides whether the leg runs. Report lines carry `STRIP <id>: domain status retired
    (state <state>)`; planned/applied/blocked/skipped reuse the existing report shape; the second
    dry run plans ZERO (re-derivable, verified-by 2). Test file: migrateRecordLifecycles.test.ts
    gains the strip-phase suite; the old status-map fixtures are retired WITH their data (a leg
    no valid record can exercise is dead code — delete in C4's commit alongside the data).

D5 — Coverage-data retirement (commit C4, ONLY after the strip apply proves zero status-bearing
    covered records): delete the whole `migration:` block from registry-kinds.registry.yaml
    (whole block — partial deletion throws, see recon (c)). ArchiveGuard and stamp-at-create are
    unaffected (they read other blocks).

D6 — Admissibility reroute (rides C3): OperationalAdmissibilityService.ts:169 reads
    `equipment.status !== 'active'`. Post-strip that is undefined → fail-closed: EVERY equipment
    would block compilation (ProtocolCompiler consumes this) — a functional cliff, not a leak.
    The generic replacement mirrors the archive guard's data-driven posture: covered-kind →
    consult the lifecycle's terminalStates (registry-ops declares archived terminal,
    lifecycle.yaml:24-26): state terminal ⇒ refuse (`Equipment X is ${state} under the
    ${lifecycleId} lifecycle and is not admissible.`). Note honestly: draft-equipment admissible
    or not is a policy call the OLD status field silently made ('active' only); the lane seed
    corpus is all active-state so the switch is behavior-preserving on the lane; flag in the
    report. person/authz/training/calibration legs (:207-:351) are OUT of scope (orthogonal
    vocabularies, see D3/g).
    The lifecycleId 'active'/'status' literals already in that file are pre-existing; the NEW
    code adds none.

D7 — Server hardcode: EquipmentHandlers.ts:117 `status:'active'` in createFromExa DELETED (C1;
    the record arrives draft-stamped by the coverage stamp like any create). Under BRAD-A the
    field would also fail validation once C3 ships — the deletion is required under both.

D8 — Honest-create label (rides C3, pending Brad's (i)/(ii)/(iii) ruling; recommended (i)):
    LabCollectionView.tsx:32 label 'Instruments & Equipment' → 'Equipment'. Grep-proof line
    (verified-by 3): `grep -rn "Instruments & Equipment" app/src` → 0 hits.

## Explicitly OUT of scope
- person/training-record/calibration-record/competency-authorization status FIELDS (orthogonal
  vocabulary + live admissibility consumers — deleting them = platform gap, stop boundary).
- material / material-spec / term status→state migration (BRAD-A1 pulls a minimal version into
  the fallback commit; otherwise a follow-up item; ingestion/records.ts:152 rides with it).
- run/analysis/execution-task/user/equipment-capability/material-instance/aliquot/services/tyf
  status fields; lint/ingestion status wording; RecordListTable extension or deletion.
- Fixing the instrument-create provenance defect (follow-up; this item only reconciles the
  `it.fails` pin at registryOpsLifecycle.test.ts:678 if C3 touches instrument fixtures).
- The lane DATA dir (~/.computable-lab-lane1) — the coder never writes it; the orchestrator
  runs the migration apply.

## Ordered rollout (commit order is binding)

C1 — Fallback retirement + leak sites: lifecycleMiddleware.ts (coverage-scoped per D1 / outright
     per BRAD-A1), LifecycleHandlers.ts:53, RecordSearchHandlers.ts:238 prompt line,
     EquipmentHandlers.ts:117 hardcode, stale comment RecordHandlers.ts:717 (text only; do NOT
     touch the BOTH-stamp). RED test first: a covered update that moves ONLY status must NOT be
     treated as a transition (pre-fix it reaches the engine and 422s with 'Transition from
     'active' to … not allowed'); plus a vocab-control REGRESSION test pinning whether the gate
     still fires (pass under A2; under A1 only after the vocab-control state-stamp ships in the
     same commit). Evidence files: qms8c-C1-RED/GREEN.
C2 — Runner strip leg + its unit suite (dry-run ONLY, no lane writes by the coder, no data flip).
     Coder deliverable: the exact dry-run report (see first-targeted-check) pasted in the report.
     ORCH STEP between C2 and C3 (fleet-lock discipline): run dry-run (expect the exact planned
     count), then `--apply` against CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml,
     re-run dry (expect 0 planned), RESTART the lane stack (tsx --watch does NOT reload YAML),
     re-probe :3092 (0 covered records with status).
C3 — The flip (DATA commit, single): schema edits (D3) + ui edits (D3) + seed edits
     (records/seed/equipment/*.yaml ×25: delete the status line) + equipment.lint.yaml comment +
     admissibility reroute (D6) + honest-create label (D8, per Brad) + fixture updates (below) +
     RED-first 4xx tests (verified-by 1). ORCH RESTART after merge; this is the switchover.
C4 — Coverage-data retirement (D5) + retirement of the now-dead status-map leg & its fixtures
     (D4 tail). ORCH RESTART; final re-probe.
Then: browser gate (verified-by 5) on the lane stack: /registry shows EQP-NEW-7LS1 with the
Draft state pill, no Status field in its form, and the Equipment/Instruments tabs render no
status column anywhere.

## First targeted check (the single command that proves the approach early)

From the coder's worktree server/ dir:
    CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx src/scripts/migrateRecordLifecycles.ts
Expected on the CURRENT lane corpus (before any strip ships: leg ships in C2; pre-C2 the runner
prints SKIPs for all 51 covered records, which is itself the count proof):
    Data dir: <lane1 data dir>
    … 51 `STRIP`-planned lines once C2's leg is in (equipment 39 + person 8 + training-record 3
    + calibration-record 1); zero BLOCKED; `DRY RUN: 51 planned change(s).`
If C2 is not yet merged, `SKIP … already governed` ×51 + `planned: 0` is the expected pre-leg
baseline — and 51 vs the task note's "at least 39" is the discrepancy the report must call out
(the note counted equipment only).

## Verification commands (complete)

Server tests (from the worktree's server/ dir; the coder runs them, the orchestrator re-verifies):
    npx vitest run src/governance/registryOpsLifecycle.test.ts src/governance/archivedAssignment.test.ts \
      src/api/handlers/W25RegulatedLifecycle.test.ts src/scripts/migrateRecordLifecycles.test.ts \
      src/governance/governanceStrictness.test.ts src/lifecycle/denialMessage.test.ts \
      src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts src/api/handlers/EquipmentHandlers.test.ts \
      src/seeds/equipment.seed.test.ts src/authorization/OperationalAdmissibilityService.test.ts \
      src/validation/TrainingRecordDateTimeAcceptance.test.ts src/schema/ControlledDocumentSchemas.test.ts \
      src/schema/EquipmentFirstClass.test.ts src/schema/BackendFoundations.test.ts \
      src/api/handlers/LifecycleHandlers*.test.ts src/registry/KindLifecycleRegistry.test.ts
    Expected: all green (0 failed). RED evidence saved FIRST at pre-fix commits as
    ~/.hermes/cl/lanes/1/qms8c-C{n}-RED-l1<tick>.{md,txt}.
    NOTE the lane's pre-existing-failure list in the coder brief is authoritative for exclusions;
    report any failure the list does not cover as a defect, never exclude silently.
Typecheck (exactOptionalPropertyTypes is on — backend):
    npm run typecheck -w server   → 0 errors
    npm run typecheck -w app      → 0 errors (delta-0 vs trunk baseline)
App unit tests: `npm run test:unit -w app` (at minimum RecordRegistryPage.* and LabCollectionView
    suites; expected green).
Grep proofs (verified-by 3, run from worktree root, expected ZERO hits outside tests that pin the
retirement itself):
    grep -n "state ?? nextPayload.status\|state ?? previousPayload.status" server/src/lifecycle/lifecycleMiddleware.ts   → none
    grep -rn "Set status to 'active'" server/src app/src                                                                  → none
    grep -n "status" schema/lab/instrument.ui.yaml schema/lab/equipment.ui.yaml                                            → none
    grep -n "status" schema/lab/instrument.schema.yaml schema/lab/equipment.schema.yaml | grep -v "DISTINCT from"          → none
    grep -rn "stateByDomainStatus" schema/registry/registry-kinds.registry.yaml                                            → none (C4+)
    grep -rn "Instruments & Equipment" app/src                                                                            → none (D8-(i))
    grep -rn "p.status" app/src/collections/LabCollectionView.tsx                                                          → no equipment-case hit (128-131 removed;
                                                                                                                             other cases unchanged)
Live re-probe (orchestrator, read-only): GET :3092/api/records?kind=equipment&limit=1000 →
    every payload: status ABSENT, state present; ?kind=instrument → still 0;
    GET /records/EQP-NEW-7LS1 → payload has lifecycleId+state:draft, no status key.

## Fixtures that seed covered status (RED-first inventory; verified-by 4's real list)

CORRECTED vs the task block's named three: W25RegulatedLifecycle.test.ts seeds NO covered-kind
status (it runs the protocol/document world) — it must merely STAY green. The suites that DO
seed status on records this item touches:
  - registryOpsLifecycle.test.ts: instrument fixtures carry NO status (:660-681, pinning the
    create 422; the it.fails pin needs a one-line reconciliation note if C3 changes fixture
    shape); user/role-grant fixtures' status is the user kind — untouched.
  - archivedAssignment.test.ts:241 equipment fixture `status:'active'` → STRIP the seed line
    (the fixture stays governed via the create stamp); :303 person fixture KEEP (person status
    is in scope per D3); :222 ECP fixture KEEP (not covered).
  - migrateRecordLifecycles.test.ts: status-map fixtures rewritten for the strip phase (C2);
    map-leg fixtures retired with their data (C4).
  - seeds/equipment.seed.test.ts: validates the 25 seed files — flips green only after the C3
    seed edits (seeds currently all carry `status: active`).
  - RecordHandlers.instrumentAuthoring.test.ts, EquipmentHandlers.test.ts (createFromExa
    payload/status assertions), OperationalAdmissibilityService.test.ts (equipment legs →
    state-based fixtures), schema-shape suites ControlledDocumentSchemas.test.ts /
    EquipmentFirstClass.test.ts / BackendFoundations.test.ts (they assert the equipment status
    enum — flip to absence).
  - App: RecordRegistryPage.{createTab,createSearch,archiveBrowsing}.test.tsx /
    DocumentControlBar.test.tsx / recordSerializer / documentMapper / DefaultEditorFixtures /
    acceptedEquipmentAdditions — grep for `status: 'active'` seeds and drop only the
    covered-kind (equipment/instrument) ones.

## Worker contract

- Branch: cl/lane1-qms8c-l1t<tick> off trunk cl/integration-1 HEAD AT CLAIM TIME (spec written
  at 9a51c1f2; rebase, do not assume the hash).
- Worktree: /mnt/vast/home/brad/git/wt/QMS8-C-lane1-l1t<tick> (node_modules + server/app
  symlinks per lane practice; NFS checkout is slow — background the worktree add).
- Deliverable/report paths (unique per tick): ~/.hermes/cl/lanes/1/qms8c-report-l1<tick>.md,
  evidence qms8c-C{1..4}-{red,green}-l1<tick>.txt, log logs/coder-QMS8C-l1<tick>.log.
- Coder OWNS (files): server/src/lifecycle/lifecycleMiddleware.ts;
  server/src/api/handlers/{LifecycleHandlers,RecordHandlers(comment only),RecordSearchHandlers,
  EquipmentHandlers,MaterialLifecycleHandlers(if A1),W25…(no edit needed)}.ts as scoped above;
  server/src/authorization/OperationalAdmissibilityService.ts; server/src/scripts/
  migrateRecordLifecycles.ts (+test); schema/lab/{instrument,equipment}.schema.yaml + .ui.yaml;
  schema/lab/equipment.lint.yaml (comment); schema/registry/registry-kinds.registry.yaml (C4);
  records/seed/equipment/*.yaml; server fixtures/suites listed above; app: LabCollectionView.tsx
  (:128-131, :32 label pending Brad), RecordRegistryPage/createTab test files; the app tests
  named in the fixture inventory.
- Coder NEVER: writes lane data (~/.computable-lab-lane1), runs the runner with --apply,
  restarts the :3092/:5192 stack (YAML-reload trap — orchestrator restarts after each merged
  data commit), touches :3001/:5174 or /mnt/vast/home/brad/git/computable-lab, makes mutating
  :3092 calls, or edits the task list.
- Ground rules that bind: no hardcoded policy in TS (the prompt line, the Exa status stamp,
  any label map — all DATA or deleted); one vocabulary per entity is THIS item's hard rule;
  lifecycle state labels come from lifecycle YAML, never invented; every behavior change
  RED-first.

## Stop boundaries (hard stops, stop-and-report, do not improvise around)

1. Any need to introduce a NEW lifecycle state or vocabulary (e.g. a 'maintenance' state to
   absorb out_of_service/maintenance) → platform gap, REQUIRES-RESCOPE, stop.
2. Any pressure to retire person/training-record/calibration/competency-authorization status
   (admissibility couples to them; see D3/g) → REQUIRES-RESCOPE, stop.
3. Any need to touch material/term/material-spec schemas, MaterialLifecycleHandlers, or
   ingestion/records.ts:152 beyond the BRAD-A1 state-stamp sibling → stop (vocab-control item
   boundary) unless the promoted spec records the A1 ruling.
4. If the strip dry-run reports ANY blocked record (store wall refusal), stop and report the
   exact reasons; never force, never add skip flags.
5. If an existing suite cannot go green without weakening its assertion (rather than updating
   the seed), stop — the pin is telling the truth; escalate.

## Reviewer bait (anticipating the adversarial review)

1. exactOptionalPropertyTypes: the strip-leg payload copy must DELETE the key (`delete
   nextPayload.status` on a clone), never assign `undefined`; report-shape optionals follow the
   file's existing `...(x !== undefined ? {x} : {})` style.
2. YAML-reload trap: schema/lint/ui/coverage edits are INERT until the orchestrator restarts
   :3092 (tsx --watch reloads TS only). Any "it didn't take" is a missing restart, and the
   coder MUST NOT self-restart.
3. Coverage-data trap: deleting `stateByDomainStatus` alone THROWS at loader
   (KindLifecycleRegistry.ts:96-105 requires `migration.default`) — retire the whole block in C4.
4. Fail-open landmine: outright fallback deletion without the vocab-control state migration
   makes checkLifecycleTransition early-allow materials (undefined===undefined at :42). The
   vocab-control REGRESSION test is mandatory whichever way Brad rules; reviewers, hunt it.
5. Ordering bait: if the schema flip (C3) merges before the strip apply ran, seed/record writes
   fail validation. Verify the orchestrator's apply-then-restart precedes C3 in the trunk history.
6. Hardcode sweep: `status:'active'` must be gone from EquipmentHandlers.ts:117 AND the AI
   prompt line at RecordSearchHandlers.ts:238; no new status literals in the new middleware
   signature (the coverage accessor decides, TS never names a kind).
7. Idempotency: the strip leg's key changes (governed AND status-less). Second dry run MUST
   plan 0; reviewers re-run it, don't trust the transcript.
8. The BOTH-stamp at RecordHandlers.ts:698-721 stays — "we removed the fallback so the stamp is
   redundant" is wrong (it stamps STATE, the fallback only READ status); the :717 comment is
   reworded, the logic untouched.
9. Seed shadowing: the lane store serves seed + lane records; verified-by 2's count (51 lane)
   and the seed corpus (25 files) are different denominators — report both, never conflate.
10. Ontology discipline: 'Archived'/'Draft' labels are lifecycle-YAML data; inventing a TS
    label map, or reusing an old status word as a new state name, is the exact defect class.
11. Out-of-scope drift: user.status, run.status, lint status, material-instance status — a
    diff touching them fails the scope gate (files list owns the boundary).

## Open questions for the orchestrator (everything EXCEPT the BRAD-DECISION above)

OQ-1. Instrument create is broken and pinned so (registryOpsLifecycle.test.ts:660-681, provenance
    injection vs additionalProperties:false). This item deletes instrument.status but cannot make
    an instrument creatable. RECOMMENDATION: keep the pin as-is (it stays honest), open the
    create-fix/retire decision as its own follow-up bundled with the D8-(i) label change's
    aftermath; checked: schema (:8, no FAIRCommon), RecordHandlers.ts:747-759 injection logic,
    the pinned test, live probe (0 instrument records).
OQ-2. Equipment admissibility after the strip: terminal-ness from registry-ops YAML reproduces
    today's behavior on the lane corpus, but 'draft equipment' admissibility was previously
    status-implied. RECOMMENDATION: ship terminal-based refusal (data-driven, no literals) and
    record the draft-question in the report for Brad's next dogfood; checked: OAS.ts:169,
    registry-ops.lifecycle.yaml (archived terminal only), seed states (all active).
OQ-3. The exact affordance that produced EQP-NEW-7LS1 is not fully pinned from code (lab
    category create vs registry tab create-vs-search); the /lab/:category create affordance is
    UNVERIFIED. RECOMMENDATION: coder does ONE read-only :3092 GET + one app grep to pin the
    /lab create path before choosing label wording; the (i)/(ii)/(iii) ruling itself is Brad's
    alongside the header decision; checked: REGISTRY_TABS data + QMS7-5 create path (would make
    INSTR- now), LabCollectionView.tsx:32, EquipmentHandlers.ts:101-123, deck mints, git log
    -G on the tab data (tab predates QMS7-5; the instrument-422 pin explains the 0 count).
OQ-4. verified-by 4 names three suites; the real fixture inventory is larger (this spec's list).
    RECOMMENDATION: treat this spec's inventory as the operative list, keep the task block's
    three as the named gate; checked by grep across server/app suites for covered-kind status
    seeds (inventory above).

STATUS: draft-complete

============================================================================
## PROMOTION BLOCK — orch-promoted 2026-10-21T21:05 EDT (tick l1t2040)
### BRAD'S RULING IS IN: BRAD-A1 — FULL CLEAN BREAK (RULED 2026-10-21T18:45 EDT,
### interactive; rationale verbatim: "we are not protecting any legacy data.")

Source of ruling: .hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md
(watch-path answer). Binding consequences, verbatim from the ruling:
  - fallback deletion is GLOBAL (no coverage-scoped scoped fallback survives);
  - `status` rejected outright on covered kinds + strip-only migration over the
    equipment corpus (all already state-stamped; never synthesize a state);
  - the vocab-control SIBLING state-stamp migration MUST ship in the SAME COMMIT
    as the fallback deletion — that is what closes the fail-open window;
  - no tolerated-legacy lint rule anywhere.

### ORCH-PROMOTED AMENDMENTS (first-hand verified this tick at trunk 0814cd6a;
### these OVERWRITE the A2-default text above wherever they conflict)

A1-1 (over D1 — global deletion): lifecycleMiddleware.ts:38-39 and
     LifecycleHandlers.ts:53 drop the `?? ...status` reads OUTRIGHT (orch-verified
     both sites live at the tip). No isCoveredKind plumbing, no residual read,
     no in-file "pending migration" comment — the residual case is closed by the
     sibling migration, not narrowed. Keep: RecordSearchHandlers.ts:238 prompt
     line deletion and EquipmentHandlers.ts:117 hardcode deletion (both
     orch-verified live), RecordHandlers.ts:717 comment reword only.

A1-2 (NEW sibling, ships IN THE C1 COMMIT — schema-declaration leg):
     material.schema.yaml, material-spec.schema.yaml and term.schema.yaml today
     declare `status` (enum proposed/in_review/active/rejected/deprecated —
     EXACTLY 1:1 with lab-vocabulary-control's five lifecycle states) and NO
     `state` property, under `unevaluatedProperties: false` (orch-verified
     material.schema.yaml:8/30-37, material-spec :10/:36, term.schema.yaml
     unevaluatedProperties :17; equipment/instrument DO already declare `state`
     at their :109/:120 — the pattern to mirror). C1 must ADD an optional `state`
     property (same enum, description per lifecycle-YAML, mirroring
     equipment.schema.yaml's state block) to all three schemas IN THE SAME COMMIT.
     Without the declaration the stamp leg cannot write state — validation rejects
     it — so declaration + runner leg + fallback deletion are one atomic commit.

A1-3 (runner leg, same C1 commit as A1-2): extend migrateRecordLifecycles.ts
     with a vocab-control STAMP leg keyed off coverage data (same data-flag shape
     as the D4 strip flag; no kind literals in TS): for records whose payload
     carries lifecycleId + status and lacks state, stamp state := status (the
     enums are 1:1 — the mapping is identity, and that identity is why the leg is
     a stamp, not a mapping). Report lines `VOCAB-STATE <id>: state stamped from
     status <status>`. Second dry run plans ZERO. The coder ships dry-run ONLY
     (no --apply, never writes lane data); the ORCHESTRATOR applies.

A1-4 (orch runtime lap, recorded here so no window is forgotten): tsx --watch
     reloads TS the instant C1 lands in the trunk checkout — the fallback is dead
     in the live lane BEFORE the stamp apply can run (the runner leg ships in the
     same commit; it cannot apply before it merges). The lane corpus today has
     exactly 1 material + 1 material-spec governed record carrying status with no
     state (orch-verified live GET :3092 2026-10-21T21:00; the composer's ≤13 was
     a schema-wide bound). Between C1-merge and the orch apply those records'
     gate would fail-open. ORDER FOR THE ORCH: merge C1 -> immediate
     dry-run+apply of the stamp leg (CONFIG_PATH=
     /home/brad/.hermes/cl/lanes/1/lane1-config.yaml) -> restart stack ->
     re-probe. The window is minutes, test-data-only (Brad A4: all records are
     test data); record as an explicit orch assumption, not silently.

A1-5 (vocab-regression test is mandatory, unchanged from reviewer-bait #4): the
     vocab-control gate-fires test must assert checkLifecycleTransition DENIES an
     unauthorized vocab transition on a STAMPED record (state present) — proving
     global deletion did not disarm the gate.

A1-6 (honest-create D8 remains HELD): Brad ruled A1 on the clean-break axis; the
     honest-create (i|ii|iii) sub-ruling is STILL PENDING (watch path, do not
     re-ask until changed). The coder MUST NOT pick label wording: skip D8's
     LabCollectionView.tsx edit; the `Instruments & Equipment` grep-proof line
     does NOT apply this item. The pending sub-ruling rides a follow-up.

A1-7 (OQ ratifications by the orch, per the draft's recommendations):
     OQ-1 accept (keep the instrument-create pin honest, follow-up item).
     OQ-2 accept (terminal-based refusal; report the draft-equipment admissibility
       question for Brad's next dogfood).
     OQ-3 narrowed: with D8 held, the affordance pin reduces to the coder's
       read-only GET + grep noted in the draft; report only.
     OQ-4 accept (spec inventory is operative).

A1-8 (counts to reconcile, do not conflate): covered lane corpus 51 (equipment 39
     + person 8 + training-record 3 + calibration-record 1 per the draft's
     first-targeted-check) vs 25 seed files vs the vocab-control lane corpus
     (2 governed records today, live-measured). Strip leg covers the first; the
     seed edits are C3 data; the stamp leg covers the third.

### STATUS: PROMOTED — spec is execution-ready for the fleet coder. Fleet order:
### ESM-DIRNAME-1 fix-run-2 (staged) fires first when the appliance-2 slot frees;
### QMS8-C dispatches on the next free slot. Run server vitest from server/,
### app from app/.
