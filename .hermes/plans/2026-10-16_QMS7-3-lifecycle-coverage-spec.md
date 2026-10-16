# SPEC (DRAFT, composer, l1t0120) — QMS7-3: minimal operational lifecycle + data-declared kind coverage (D3 groundwork)

Status: DRAFT — orchestrator review/promotion required before dispatch. Every file:line below was
re-anchored first-hand at cl/integration-1 @ **829e514e** (worktree /mnt/vast/home/brad/git/cl-integration-1,
clean at recon). cl-scout was NOT dispatched — every claim is direct first-hand reads (scout is
screening, not authority; direct reads are strictly stronger here).

## Goal (one sentence)

Ship the YAML-first groundwork for registry archive-as-transition (Brad ruling B): a new
`registry-ops` lifecycle file, a DATA-declared registry-kind→lifecycle coverage file, and one
generic stamp-at-create in the create handler that reads the coverage data — so newly-created
plain registry records (equipment-class et al.) arrive as governed `draft`s with zero kind-name
switches in TypeScript, while every already-governed kind stays byte-for-byte untouched.

## Binding rulings and scope walls (do not re-litigate)

- **Ruling B (Brad 2026-10-15, intake packet `~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/intake-packet.md`)**:
  archive is a DECLARED lifecycle transition, NEVER a DELETE affordance; archived =
  usability-off, not erasure. Archive *semantics at the selection/validation surfaces* and the
  migration of EXISTING records are QMS7-4, not this item.
- Governed kinds KEEP their existing lifecycleId declarations untouched:
  controlled-document (`schema/lab/controlled-document.schema.yaml:22,36` required+const),
  training-material (`schema/lab/training-material.schema.yaml:91-94` const `document-control`),
  material, material-spec, protocol, role-grant, request, sample, term, audit-event, signature,
  tyf order.schema, material-profile.registry.yaml reference.
- **QMS7-2 is coding IN PARALLEL** on `server/src/store/RecordStoreImpl.ts` + store/types.ts +
  its update-path pieces (and per orchestrator ruling OQ2, a small audit stamp on the
  `updateRecord` success path). This spec's coder MUST NOT touch RecordStoreImpl.ts,
  store/types.ts, or the PUT/update path in RecordHandlers.ts. The create-path stamp lands in the
  `createRecord` region of `server/src/api/handlers/RecordHandlers.ts` only. (Create collision/path
  generation in `createUnlocked` is store-side — NOT ours.) If the design is discovered to be
  impossible above the store, STOP and return `requires-rescope`; do not borrow QMS7-2's files.
- No server restarts by the worker (see YAML reload trap below). No :3001/:5174. No commits to
  cl-integration-1 or computable-lab.

## In-scope files

- `schema/core/lifecycles/registry-ops.lifecycle.yaml` (NEW)
- `schema/registry/registry-kinds.registry.yaml` (NEW — the coverage data file)
- `schema/lab/person.schema.yaml`, `schema/lab/equipment.schema.yaml`,
  `schema/lab/equipment-class.schema.yaml`, `schema/lab/training-record.schema.yaml`,
  `schema/lab/competency-authorization.schema.yaml`, `schema/lab/instrument.schema.yaml`,
  `schema/lab/calibration-record.schema.yaml` — add `lifecycleId` + `state` property
  declarations ONLY (pinned shape below; no other schema edits).
- `server/src/registry/KindLifecycleRegistry.ts` (NEW loader) + its test
- `server/src/api/handlers/RecordHandlers.ts` — `createRecord` region ONLY (see exact placement)
- `server/src/server.ts` — coverage-loader wiring ONLY (a few lines near the lifecycle load)
- `server/src/security/LocalIdentityService…` NO. New test file(s) under
  `server/src/governance/` (pattern-matched to the two existing real-stack governance suites).

## Explicitly out of scope

- Any PUT/update/delete-path change; draft-copy; signatures; revision machinery.
- The governed kinds' legacy create switches (protocol force at :529-533, controlled-document
  INITIAL_STATE_REQUIRED at :534-536, access-policy check :537+, SYSTEM_OWNED wall :524-527) —
  these STAY; this item only ADDS a generic data-driven stamp, it does not refactor legacy.
- QMS7-4 (migration runner, archived-operational-semantics at selection surfaces), QMS7-5/6/7
  (all UI), seed YAML edits, `records/seed/**`.
- Adding `qualification-record`, `equipment-training-requirement`, `verb-definition`,
  `equipment-capability` to coverage. They are registry-tab kinds (app/src/pages/RecordRegistryPage.tsx:16-24)
  but the orchestrator re-verified coverage against the 7 plain lab-registry kinds; widening the
  declared set is an orchestrator/architect call (OQ3 below). Undeclared kinds are simply unchanged.
- No UI, no browser gates (QMS7-5/6 own those).

## Acceptance criteria (verbatim from the task list, lane 1, QMS7-3 `verified by:`)

> Failing tests first for stamp-on-create, lifecycle-change-refusal on governed records,
> unknown-mapping validation errors. After lane-stack RESTART (tsx --watch does not reload YAML):
> POST /records for e.g. equipment-class yields a governed draft; PUT draft->active succeeds for
> the authorized role; undeclared transitions / unauthorized roles fail 422 with the
> denial-message boundary intact; training-material still document-control.

## Measured baselines at tip 829e514e (verify against these, not vibes)

- `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx tsc --noEmit | grep -c "error TS"` → **0**.
  The bar is: stay 0. (EDITOR-era "33-error baseline" notes are stale at this tip.)
- Full `npx vitest run` at pristine tip under heavy shared-machine load: 103 failed files /
  600 passed, 112 failed tests / 5585 passed (collect 3680s — contention-poisoned, NOT a green
  baseline claim). The worker's bar is the TUCHED suites green on a quiet run, plus no test file
  that passed before now failing. Save the tail of your run in the report.
- Lane config is `policyBundleId: POL-REGULATED` (config.yaml:51 — a SYMLINK to the shared
  computable-lab config.yaml; do not edit). `enforceTransitionRoles: deny` for POL-REGULATED
  (`schema/core/policy-bundles/regulated.policy-bundle.yaml`), so transition roles bind live.

## First targeted check (proves the approach early — run it RED before anything else)

Write `server/src/governance/registryOpsLifecycle.test.ts` following the harness pattern of
`server/src/governance/denialMessageBoundary.test.ts` (real store + real handlers + real
LifecycleEngine loaded from disk: see :19, :27, :76 there and governanceStrictness.test.ts:54,61,192).
Its first test asserts: POST /records with `schemaId: 'equipment-class'`, payload without
lifecycleId → 201 and created payload `lifecycleId: 'registry-ops'`, `state: 'draft'`.

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/governance/registryOpsLifecycle.test.ts
```

Expect RED (lifecycle not on disk, no coverage file, no stamp). This single command exercises the
landmine, the loader, and the stamp — if it goes green, the whole design works.

## The design, pinned

### 1. The lifecycle file — `schema/core/lifecycles/registry-ops.lifecycle.yaml`

Valid against `schema/core/lifecycle.meta.schema.yaml` (required: lifecycleVersion, id, states,
transitions at :6; transition items require from/to/role at :41; `additionalProperties: false`
throughout at :7/:22/:42 — you cannot bolt coverage data onto the lifecycle file, and must not try).

Role vocabulary follows the existing files (checked first-hand: document-control uses
author/reviewer/approver; lab-sample and service-request use lab-intake/lab-operator;
lab-vocabulary-control adds `steward`). `registry-ops` uses the two most established ids:

```yaml
lifecycleVersion: 1
id: registry-ops
description: >-
  Minimal operational lifecycle for plain registry kinds (ruling B): draft -> active ->
  archived. Archived means not-newly-usable, never erasure.
roles:
- id: author
  label: "Author"
  description: "The person who creates and activates the record."
- id: approver
  label: "Approver"
  description: "A person authorized to retire the record from active use."
states:
- id: draft
  label: "Draft"
  initial: true
  description: "Created, not yet usable operationally."
- id: active
  label: "Active"
  description: "In operational use."
- id: archived
  label: "Archived"
  terminal: true
  description: "Retired from operational use; kept, readable, historically referenceable."
transitions:
- from: draft
  to: active
  role: author
  label: "Activate"
- from: [draft, active]
  to: archived
  role: approver
  label: "Archive"
```

No guards in this item (see OQ2 for the signature-guard question; denial wording stays the
engine's generic role denial — `lifecycleMiddleware.ts:74-75` fallback — which is exactly the
"denial-message boundary intact" requirement: NO wording is invented in TS).
The `[draft, active] → archived` arm mirrors document-control's Archive arm
(`document-control.lifecycle.yaml:64-67`) so an unactivated draft can be discarded without an
Activate round-trip. There is deliberately NO unarchive transition (terminal = terminal;
QMS7-6 explicitly forbids an undeclared unarchive path).

### 2. THE coverage data file — `schema/registry/registry-kinds.registry.yaml`

Shape follows the `*.registry.yaml` precedents found first-hand — `schema/registry/predicates.registry.yaml`
(versioned data + typed loader `server/src/registry/PredicateRegistry.ts`, loaded once at startup
at `server/src/server.ts:406-413`) and `schema/lab/material-profile.registry.yaml`
(loader throws on malformed content, `MaterialProfileRegistry.ts:318-336`). Both are existing
loaders with existing directories — no bespoke new loader directory, and the new loader mimics
PredicateRegistry's throw-on-invalid discipline.

```yaml
# Registry-kind lifecycle coverage — which plain kinds get the minimal operational
# lifecycle and what creates are stamped with. Consumed by KindLifecycleRegistry.ts
# at create time and by the QMS7-4 migration runner. Governed kinds are NOT listed:
# their lifecycleId stays declared per-schema (const in *.schema.yaml).
registryVersion: 1
lifecycleId: registry-ops
defaultState: draft
kinds:
  - kind: person
  - kind: equipment
  - kind: equipment-class
  - kind: training-record
  - kind: competency-authorization
  - kind: instrument
  - kind: calibration-record
```

Loader `server/src/registry/KindLifecycleRegistry.ts` (mirror PredicateRegistry's structure) with
LOAD-TIME VALIDATION that FAILS THE LOAD (throw, like PredicateRegistry's duplicate-id throw at
its :52-54):
- unknown `lifecycleId` → `lifecycleEngine.isLoaded(...)` false → throw. (Engine holds the
  loaded set: `LifecycleEngine.ts:102-104`.)
- `defaultState` not a declared state of that lifecycle (nor the transition source of any
  `from` containing it) → throw. Keep it simple: require defaultState ∈ lifecycle states and
  equal to the initial state — the loader is given the `LifecycleEngine` (or a minimal
  `{ isLoaded, specFor }` accessor — if you expose `specFor`, add it as a plain spec-getter on
  the engine; NO policy in TS).
- duplicate kind entries → throw. Unknown kind (not a registered record kind) → throw: wire the
  check against the already-built SchemaRegistry (`server/src/server.ts:364` `createSchemaRegistry()`;
  `SchemaRegistry.getAll()/has()` at `SchemaRegistry.ts:95,109`) OR a `knownKinds: Set<string>`
  parameter injected at wiring — the unit test injects a tiny kind set and proves a bogus kind
  and a not-on-disk lifecycle id BOTH throw.
- server.ts wiring: load AFTER lifecycles load (`server.ts:449-452`), same try/catch + loud
  console line pattern as the predicate-registry block (:406-413) — see OQ4 for warn-vs-fail.
  The registry is passed to `createRecordHandlers` via the existing `security` options object
  (`RecordHandlerSecurityOptions`, server.ts:743-769 wiring, `getPolicySettings` at :760 is the
  live-accessor precedent) as `getKindLifecycleCoverage?: () => KindLifecycleRegistry | undefined`.
  Optional so existing tests/harnesses compile untouched.

### 3. THE LANDMINE — where `lifecycleId`/`state` are DECLARED (pinned: per-schema fields)

Verified first-hand at 829e514e:
- `schema/lab/equipment-class.schema.yaml:10` = `unevaluatedProperties: false` at the TOP level
  (:44's `additionalProperties` belongs to `readinessRequirements` only). Same top-level
  `unevaluatedProperties: false` on person:9, equipment:8, training-record:9,
  competency-authorization:9, calibration-record:8. `instrument.schema.yaml:8` uses
  `additionalProperties: false` AND does **not** mix in FAIRCommon (no $ref, no createdAt
  declaration — see reviewer bait #6).
- `schema/core/common.schema.yaml` FAIRCommon (:10-98) declares NO `lifecycleId` and NO `state`.
- None of the 7 kinds declares lifecycleId today (re-verified; the 24 schema-tree `lifecycleId`
  hits are all governed/other kinds).

**PINNED SHAPE: per-schema field declarations.** Add to EACH of the 7 schemas, in `properties`:

```yaml
  lifecycleId:
    type: string
    enum: [registry-ops]
    description: "Lifecycle governing this record's state transitions (declared per kind in schema/registry/registry-kinds.registry.yaml)."
  state:
    type: string
    enum: [draft, active, archived]
    description: "Lifecycle state (operational). DISTINCT from domain status/result fields."
```

Rationale (blast-radius analysis, not a wave-through):
- A FAIRCommon addition would touch EVERY kind that mixes FAIRCommon (dozens of schemas,
  including every future kind) and would let ANY payload carry arbitrary `lifecycleId`/`state`
  strings — including governed kinds whose own `const`/enum declarations merge via `allOf`
  (both constraints apply, so governance technically survives, but the corpus-wide acceptance of
  free-form lifecycle fields is a governance hole and a review surface 10x larger than this
  item). It also collides semantically with kinds that already carry unrelated `status`/`state`
  data.
- Per-schema declaration is the EXISTING precedent: every governed kind does exactly this
  (training-material.schema.yaml:91-94 const, material.schema.yaml:35, sample.schema.yaml:112,
  term.schema.yaml:59, …). Enum (not `const`) because these kinds legitimately hold all three
  states; governed kinds keep their `const` untouched.
- The `enum` values MUST match the lifecycle file's states — pin with a test (bait #3).

**The coder must NEVER "fix" a validation failure by relaxing `unevaluatedProperties` /
`additionalProperties`.** The declaration above IS the fix.

### 4. Generic stamp-at-create — exact placement

`server/src/api/handlers/RecordHandlers.ts`, function `createRecord`, INSIDE the create region
only. Current anchor points (re-verified): :514-521 recordId extraction, :523 `payloadKind`,
:524-527 SYSTEM_OWNED wall, :529-533 protocol force, :534-536 controlled-document
INITIAL_STATE_REQUIRED, :537-557 access-policy/parent checks, :559+ provenance injection,
:624 `createEnvelope`, :646 `store.create`.

**Land the stamp immediately after the parent-check block (after :557, before the provenance
comment at :559)**, operating on `payload` (the mutable `payloadObject`) before
`payloadWithProvenance`/`createEnvelope`. Generic algorithm — NO kind names anywhere:

1. `const coverage = security?.getKindLifecycleCoverage?.()`; if undefined → skip entirely
   (every existing test path is byte-identical).
2. `const entry = coverage.entryFor(String(kind))` — coverage is keyed by the payload `kind`
   (:523 `payloadKind`). Undeclared kind (includes every governed kind, event-graph, inventory,
   protocol, …) → skip. Undeclared kinds are UNCHANGED, full stop.
3. Declared kind, payload omits `lifecycleId`: set `lifecycleId = entry.lifecycleId` and (if
   `state` absent) `state = entry.defaultState`.
4. Declared kind, payload PROVIDES `lifecycleId`: it must equal `entry.lifecycleId`, else
   422 `{ error: 'LIFECYCLE_COVERAGE_MISMATCH', message: ... }` (shape follows the existing
   {error:TOKEN,message} rejections; clients cannot smuggle a different lifecycle onto a
   covered kind). If the payload provides `state` it must equal `entry.defaultState` when the
   record is being created without a governing lifecycle already, else 422
   `INITIAL_STATE_REQUIRED` — reuse the exact token+wording pattern of :534-536.
5. Do NOT touch: :847-849 LIFECYCLE_IMMUTABLE (PUT guard — governs post-create stripping),
   :900-924 transition gate (it will accept draft→active PUTs once the engine knows the
   lifecycle; `lifecycleMiddleware.ts:31-35` allows records without lifecycleId untouched),
   :933-934 CONTROLLED_RECORD_LOCKED.

State-advance verb = PUT /records/:id (existing, unchanged). Transitions preview
`GET /lifecycle/:id/transitions?recordId=` (`LifecycleHandlers.ts:19-69`) becomes non-empty for
covered kinds for free once the engine has `registry-ops` — zero change there.

### 5. Lifecycle state ⟂ domain status — pinned by test

Domain fields verified first-hand: training-record `status` enum [passed, completed, failed,
in_progress] (`training-record.schema.yaml:56-58`); calibration-record `status` enum [pass,
fail, adjusted, limited_use] (`calibration-record.schema.yaml:42-44`). The lifecycle middleware
reads `nextPayload.state ?? nextPayload.status` (`lifecycleMiddleware.ts:38-39`) — the `?? status`
fallback is a REAL conflation trap for kinds that have `status` but no `state`, which is exactly
why the stamp ALWAYS writes an explicit `state` (step 3 above) and the schemas now declare it.

Test (in the new governance suite): create a training-record with `status: passed` → stored
payload has `state: draft`, `lifecycleId: registry-ops` AND `status: passed`; PUT draft→active
(authorized) → `state: active`, `status: passed` UNCHANGED; a PUT setting `state: archived`
never rewrites `status`. Same shape for calibration-record `status: pass`. A test must also
prove a lifecycle-gated denial does NOT modify the domain status.

## RED-first test plan (write these BEFORE implementation; call the inversion out in the commit)

New file `server/src/governance/registryOpsLifecycle.test.ts` (harness = denialMessageBoundary's
real-stack pattern; construct `createRecordHandlers` with a `getKindLifecycleCoverage` backed by
the REAL `schema/registry/registry-kinds.registry.yaml` + real engine from
`schema/core/lifecycles` — same dir constants as denialMessageBoundary.test.ts:27):

1. **Stamp-on-create (RED today)**: POST equipment-class without lifecycleId → 201, payload has
   `lifecycleId: registry-ops`, `state: draft` and validates against the real equipment-class
   schema (this is simultaneously the unevaluatedProperties-landmine test).
2. **Payload-provided lifecycle mismatch**: lifecycleId `document-control` on equipment-class →
   422 LIFECYCLE_COVERAGE_MISMATCH.
3. **Governed kinds unaffected**: training-material create keeps const `document-control`
   (schema :91-94); controlled-document create as non-draft still 422 INITIAL_STATE_REQUIRED
   (:534-536); a person record is NOT lifecycle-managed until covered — assert the coverage
   list is exactly the 7 kinds (loads the real YAML, so this test IS the "coverage is data" proof).
4. **Unknown-mapping load failures (RED today — file absent)**: `loadKindLifecycleRegistry`
   throws on (a) `lifecycleId` not on disk, (b) `defaultState` not in that lifecycle's states,
   (c) unknown kind, (d) duplicate kind entry.
5. **Transitions**: authorized actor (role via RoleResolver or assignment) PUT draft→active
   succeeds; PUT draft→archived WITHOUT the approver role 422 LIFECYCLE_TRANSITION_DENIED with
   the generic role-denial wording (`You do not have the required role for this transition.`)
   when enforceTransitionRoles deny — denial-message boundary intact, nothing invented in TS;
   undeclared `active→draft` (and any unarchive attempt) 422 with the engine's
   "not allowed by the registry-ops lifecycle" wording (lifecycleMiddleware.ts:63).
6. **State ⟂ domain status** (section 5).
7. **Schema-shape guards**: equipment-class schema still has top-level `unevaluatedProperties:
   false` (anti-"fix" fence); the 7 enums match the lifecycle YAML states (YAML-reload-proof
   cross-check, parse both files); lifecycle file validates against lifecycle.meta.schema.yaml
   via the real Ajv2020 validator (`src/validation/AjvValidator.ts:17` — there is no existing
   meta-schema validation test; this one is new).

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/server
npx vitest run src/governance src/lifecycle src/schema/ControlledDocumentSchemas.test.ts src/api/Api.test.ts   # touched set — GREEN
npx tsc --noEmit                                                                                                 # 0 error lines (baseline measured 0)
```

Live-behavior gate (POST yields governed draft on :3092 etc.) is the **orchestrator's
post-merge restart + curl**, verbatim from the task-list `verified by:` above.

## YAML RELOAD TRAP (callout — worker contract)

`tsx --watch` does NOT reload YAML. The worker NEVER restarts :3092 and NEVER verifies against
the warm lane stack; all verification is vitest with engines/registries loaded from disk (the
harnesses above do exactly this). The orchestrator restarts the lane stack post-merge, then runs
the live gate. A worker report claiming live-:3092 proof before an orchestrator restart is
automatically suspect.

## Worker contract

- Branch: `wt/QMS7-3-lane1-<YYYYMMDDTHHMM>` off cl/integration-1 tip at dispatch time (rebase
  onto tip if QMS7-2 merged meanwhile; the two items share ONLY RecordHandlers.ts in different
  functions — if a merge conflict appears there, take QMS7-2's update-region edits verbatim and
  keep yours in `createRecord`; anything uglier → stop and report).
- Worktree: `/mnt/vast/home/brad/git/wt/QMS7-3-lane1-<ts>` (queue-*.sh pattern, node_modules
  symlinks as in queue-docingest-b.sh).
- Report: `/home/brad/.hermes/cl/lanes/1/qms7-3-report-<ts>.md`; plans-file writes: ONLY your
  handoff under `.hermes/plans/handoffs/`. No commits to cl/integration-1 or computable-lab; no
  :3092 restart; no PUT/POST against :3092; :3001/:5174 untouchable.
- `exactOptionalPropertyTypes` is ON: optional coverage accessor ⇒ spread-conditional patterns
  as in RecordHandlers existing code; no `undefined`-valued literal props.
- Commit style: RED tests first (separate commit or called out in message), then data (lifecycle
  YAML + coverage YAML + schema field declarations), then loader + wiring + stamp.

## Reviewer bait (the likely edge errors for this item — pre-empt all of them)

1. **Opening `unevaluatedProperties: false` on equipment-class (or any of the 7) to "make the
   stamp pass."** That is the forbidden fix. The per-schema `lifecycleId`/`state` enum
   declarations are the fix; test #7 fences the wall in place.
2. **Adding lifecycleId/state to FAIRCommon.** Rejected here with blast-radius analysis
   (section 3); a reviewer must reject any diff that touches common.schema.yaml.
3. **Drift between coverage YAML and lifecycle YAML**: `defaultState: draft` / the enums / the
   lifecycle states are three copies of one fact — pinned by the cross-check test (#7) that
   parses both YAMLs at test time.
4. **YAML-reload false proof**: vitest passes but :3092 stays stale (tsx --watch). Worker proves
   via unit/contract tests ONLY; orchestrator restarts for live proof.
5. **Bespoke loader directory / putting coverage inside the lifecycle file.** The meta-schema's
   `additionalProperties: false` (lifecycle.meta.schema.yaml:7) forbids the latter; the
   `*.registry.yaml` precedent (predicates, material-profile) forbids a third loader style.
   Reuse `schema/registry/` + a PredicateRegistry-shaped loader.
6. **instrument.schema.yaml is special**: `additionalProperties: false` WITHOUT the FAIRCommon
   mixin and with no `createdAt`/`createdBy`/`updatedAt` declared, while the create handler
   injects those at :559-579 (the exemption list at :564-571 covers only event-graph /
   material-instance / aliquot). FIRST-HAND CHECK before stamping instrument: does POST of a
   plain instrument even validate today (vitest, not :3092)? If provenance injection already
   breaks instrument creates, that is a PRE-EXISTING defect — declare lifecycleId/state per the
   pinned shape, write the instrument stamp test as `it.fails`-documented or fix the injection
   exemption generically ONLY if it's a one-line data move; otherwise report as a finding, do
   NOT silently widen instrument's schema beyond the two declared fields.
7. **The `?? status` fallback** (lifecycleMiddleware.ts:38): any code path that stamps
   lifecycleId without an explicit `state` on training-record/calibration-record would silently
   treat the DOMAIN status as the lifecycle state. Stamp always sets both.
8. **Role grants are lifecycle-scoped**: RoleResolver skips a grant whose `lifecycleId` differs
   from the queried lifecycle (`RoleResolver.ts:23-24`). Both existing lane grants
   (GRANT-DEMO-REVIEWER, GRANT-QMS8-ADMIN) are scoped `document-controlled-signing` — under
   POL-REGULATED (`enforceTransitionRoles: deny`, config.yaml:51, shared symlink) USR-QMS-ADMIN
   holds NOTHING for `registry-ops`. The live gate therefore needs a NEW data-side grant
   (lifecycleId `registry-ops`, roles author+approver, userId USR-QMS-ADMIN) — lane DATA, not
   code, authored by the orchestrator post-merge like the OPS-1 preconditions (see OQ1 ruling).
9. **exactOptionalPropertyTypes** sites: the new optional `getKindLifecycleCoverage` accessor
   and any `specFor` addition on LifecycleEngine (return `LifecycleSpec | undefined`, don't
   stuff `undefined` into optionals).
10. **Ontology terms**: registry-ops is a plain operational lifecycle — it needs NO ontology
    CURIE grounding (that's lab-vocabulary-control's contract). Do not bolt grounding fields on.

## Open questions for the orchestrator (with recommendations)

- **OQ1 — live-gate role grant (data precondition).** The task-list `verified by` row "PUT
  draft->active succeeds for the authorized role" cannot pass on current lane data: the only
  grants are lifecycle-scoped to document-controlled-signing and the lane runs POL-REGULATED
  (both verified first-hand; see bait #8). RECOMMEND: orchestrator authors (post-merge, data
  repo, same OPS-1 precedent) `GRANT-QMS7-REGOPS` for USR-QMS-ADMIN, `lifecycleId: registry-ops`,
  roles [author, approver]. Alternative (NOT recommended): unscoped grant — weakens the very
  scoping this machinery enforces. Verified locally: RoleResolver.ts:17-30, both grant files,
  config.yaml:51, regulated bundle.
- **OQ2 — archive guard on registry-ops.** Should `→ archived` carry a `requires_signature` or
  `requires_role` guard now? I recommend NO for QMS7-3 (ruling B only demands the transition be
  declared+role-gated; the approver role already binds under POL-REGULATED), leaving the
  decision to QMS7-4/QMS7-6 where archive semantics are built. Guard machinery + denialMessage
  pass-through is already in place if the ruling changes — it's pure YAML.
- **OQ3 — coverage breadth of the other registry-tab kinds.** qualification-record and
  equipment-training-requirement sit on registry tabs (RecordRegistryPage.tsx:19,21) and share
  the 7 kinds' shape (unevaluatedProperties:false, no lifecycleId — verified), but the corrected
  recon's "all 7 registry kinds" excludes them, and QMS7-5's Create-per-tab will produce
  UNMANAGED records for those two tabs if they stay uncovered. RECOMMEND: keep coverage at the
  approved 7 in this item; widen via a data-only follow-up (one YAML entry + two schema field
  blocks) if the orchestrator wants Create-per-tab to land governed from day one. verb-definition
  and equipment-capability could not be located as standalone schema files under those kind names
  (grep for their `kind` const resolves into protocol.schema.yaml / constraint vocabulary) — that
  is why they are not proposed here; I checked schema-tree greps both ways.
- (OQ4, folded into the design: coverage-load failure in server.ts warns+continues, matching the
  predicate-registry try/catch at server.ts:406-413 — the LOADER throws, so unit tests prove the
  malformed-entry failure while a bad deploy degrades to today's no-stamp behavior loudly on the
  console. If the orchestrator prefers hard-fail startup, say so in promotion; it's a 2-line
  difference.)

=====================================================================
ORCHESTRATOR RULINGS (promotion, 2026-10-16 l1t0345) — BINDING, read first
=====================================================================

STATUS: PROMOTED. This section supersedes "DRAFT" in the title. Composer recon
was spot-checked first-hand by the orchestrator at trunk a584770c: lifecycle.meta
properties (roles/description allowed, additionalProperties:false),
document-control archive arm, RoleResolver grant-scoping (:23-24), all three lane
grants scoped document-controlled-signing, POL-REGULATED enforceTransitionRoles:deny,
the 7 schemas bare of lifecycleId with top-level unevaluatedProperties:false, FAIRCommon
bare, instrument's special shape, middleware `?? status` fallback + generic denial
wording, PredicateRegistry throw pattern. All holds.

OQ1 RULED YES (orchestrator-authored data precondition): post-merge, the orchestrator
authors GRANT-QMS7-REGOPS in the LANE DATA repo (lifecycleId registry-ops, roles
[author, approver], userId USR-QMS-ADMIN) + its ACL, per the OPS-1 precondition
precedent. Worker: do NOT author grants; design your live-path tests to inject the
grant via the harness store (real-stack governance suites already seed stores).

OQ2 RULED NO GUARD in this item (recommendation accepted): archive stays role-only;
signature/guard decision deferred to QMS7-4/QMS7-6 where archive semantics get built.

OQ3 RULED KEEP AT 7 (recommendation accepted): coverage = exactly the 7 approved
plain lab-registry kinds. qualification-record / equipment-training-requirement
widen via a data-only follow-up if wanted. Test #3 pins the 7 exactly.

OQ4 RULED warn+continue (recommendation accepted): server.ts wraps the coverage load
in the predicate-registry try/catch pattern; the LOADER throws (unit-proven), a bad
deploy degrades loudly to no-stamp behavior.

STALE-TEXT CORRECTION: QMS7-2 is MERGED (7a9a55af, verified). Its RecordStoreImpl.ts /
store/types.ts / update-path territory is STILL OFF-LIMITS to you; the RecordHandlers.ts
merge-collision contingency is moot — you branch off current trunk tip which already
contains QMS7-2. The tsc baseline (server 0 errors) re-verified at trunk by the
orchestrator this week (AS-ORCH-L1-098 cleared).

NOTE for the worker: the EQC-QUANTSTUDIO5 seed file carries a top-level `model` key
that equipment-class.schema.yaml rejects (AS-ORCH-L1-100, seed-content defect). Do NOT
touch records/seed/** (out of scope) — but if test #1 (POST equipment-class) ever
reuses that seed content, build your own minimal payload instead; do not "fix" the seed.
