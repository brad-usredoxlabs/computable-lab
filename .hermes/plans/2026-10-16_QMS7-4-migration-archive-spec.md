# SPEC (DRAFT, composer l1t0500) — QMS7-4: Migrate existing records to the declared lifecycles + server-side archive semantics

Status: DRAFT — orchestrator review/promotion required before dispatch. Every path:line below was
read first-hand at cl/integration-1 @ **7137b1c0e528dcab92175c077fb216fc9d896984** (HEAD measured
via `git rev-parse HEAD`; porcelain -uno clean apart from untracked node_modules/plan drafts).
cl-scout was NOT dispatched — all claims are direct first-hand reads (scout output is screening,
not authority).

## Goal (one sentence)

Make the declared lifecycles real for existing data and make archive mean ruling-B
(usability-off, not erasure): stamp lifecycleId/state into the 29 covered-kind factory seeds
(resolving the EQC-QUANTSTUDIO5 `model` defect per AS-ORCH-L1-100), ship an idempotent
dry-run-first migration runner that governs existing working-data records through the existing
validation/audit/git-backed store write path, and reject NEW operational assignments to archived
(terminal-state) covered records at the API level while every historical reference —
ECP-QUANTSTUDIO5 → EQC-QUANTSTUDIO5 included — keeps resolving.

## Binding rulings and scope walls (do not re-litigate)

- **AS-ORCH-L1-100**: `records/seed/equipment-class/eqc-quantstudio5.yaml:6` carries `model:
  QuantStudio 5`, which `schema/lab/equipment-class.schema.yaml:10` (`unevaluatedProperties:
  false`) does not declare. QMS7-4 owns fixing the SEED: add lifecycleId/state AND resolve the
  `model` key per the schema. **`records/seed/**` is the ONLY code-repo write allowed** (task
  block, task-list.md:4226-4227 — "the ONLY code-repo write in the campaign").
- **QMS7-3 OQ3 ruling (kept-7)**: coverage stays exactly the 7 plain lab-registry kinds
  (person, equipment, equipment-class, training-record, competency-authorization, instrument,
  calibration-record) declared in `schema/registry/registry-kinds.registry.yaml` (QMS7-3 spec
  `.hermes/plans/2026-10-16_QMS7-3-lifecycle-coverage-spec.md` §2, promoted 906e7c82). Widening
  is an orchestrator call, not this item.
- **Ruling B archive semantics (Brad)**: archived = usability-off, not erasure. Archived records
  stay readable and historically referenceable; a NEW operational assignment to an archived
  record is rejected at API level (not UI-only — and this item is server-only: **no app/ changes,
  no browser gate**). No DELETE anywhere, no undeclared unarchive path.
- **Lane data dir** is `/home/brad/.computable-lab-lane1` (embedded git data repo;
  `lane1-config.yaml:5` `dataDir: /home/brad/.computable-lab-lane1`, `:53` `policyBundleId:
  POL-REGULATED`; live :3092 env confirmed first-hand via `/proc/<pid>/environ`:
  `CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml
  CL_DATA_DIR=/home/brad/.computable-lab-lane1`). The migration runner runs against the LANE via
  the existing validation/audit/git-backed write path — dry-run report first, idempotent apply,
  blocked records REPORTED not forced, content locks/signatures never bypassed.
- **Dispatch gate**: QMS7-2 DONE+merged (7a9a55af; the lane copy of EQC-QUANTSTUDIO5 is already
  a PROMOTED working copy — data-repo commit `f181bd0b Promote seed record EQC-QUANTSTUDIO5
  from …/records/seed/equipment-class/eqc-quantstudio5.yaml`, and the promoted file at
  `/home/brad/.computable-lab-lane1/worktrees/main/records/equipment-class/EQC-QUANTSTUDIO5__qu
  antstudio-5.yaml` carries NO lifecycleId — so the runner, not the seed edit, governs it).
  QMS7-3 must be DONE+merged before dispatch (its `KindLifecycleRegistry`,
  `registry-kinds.registry.yaml`, per-schema lifecycleId/state declarations and create-stamp are
  the substrate this item reads; branch off trunk tip that already contains it).
- Conventions: `exactOptionalPropertyTypes` ON; code follows YAML — **no hardcoded kind names,
  state names for NEW logic, or policy in TS** (existing hardcoded locked-state lists stay
  untouched); RED-first tests; worker never restarts :3092, never hits :3092/:5174/:3001.

## Measured baselines at tip 7137b1c0 (verify against these, not vibes)

- `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx tsc --noEmit | grep -c "error TS"` →
  **0** (my run this session, at this tip). Bar: stay 0.
- Covered-kind seed corpus: **29 files** — 25 under `records/seed/equipment/` + 4 under
  `records/seed/equipment-class/` (measured with `ls | wc -l`). NO seed directories exist for the
  other five covered kinds (seed tree = equipment, equipment-capability, equipment-class,
  graph-components, identity, labware, labware-definition(s), materials, platforms, protocols,
  verb-definition — measured via `find records/seed -name '*.yaml'`). So (a) = 29 seed files.
- None of the 29 seed files carries `lifecycleId` today (`grep -rln lifecycleId records/seed/` →
  empty, measured).
- `equipment.schema.yaml:15-19` requires `status` (all 25 EQP seeds carry `status: active`,
  spot-measured); `equipment-class.schema.yaml:12-14` does NOT require any status field.
- Store/HTTP walls that already cover `archived` (measured; NO change needed to make archived
  content edits fail — only TESTS pin them):
  - HTTP: `server/src/api/handlers/RecordHandlers.ts:933-934` — content lock incl. `'archived'`
    → 409 `CONTROLLED_RECORD_LOCKED`.
  - Storage: `server/src/store/RecordStoreImpl.ts:285-288` (`contentLockError`, same list incl.
    `'archived'`, requires `storedPayload.lifecycleId` — which is exactly what this item's
    migration supplies), called at `RecordStoreImpl.ts:744-745` on the update path behind
    `withRecordLock` (`:696-698`).
  - `controlledContent` (hash of payload minus `state/createdAt/createdBy/updatedAt`) is defined
    once at `server/src/revisions/RecordRevisionService.ts:29-34` and shared by both walls —
    a content edit smuggled inside a transition PUT changes `controlledContent` and trips it.
- Full-suite baseline: contention-poisoned on this shared machine (QMS7-3 spec §measured). Worker
  bar = touched suites green on a quiet run + no previously-passing test file newly failing; save
  the tail in the report.

## First targeted check (the one command that proves the approach early)

Write `server/src/seeds/equipment.seed.test.ts` following the existing seed-corpus pattern of
`server/src/seeds/labware.seed.test.ts:10-26` / `material.seed.test.ts:11-26` (readdirSync of the
seed dir, parse each YAML, validate against the real schema — the pattern exists; there is NO
equipment/equipment-class seed validation test today, which is precisely how the `model` defect
shipped unnoticed). Its assertions: every seed file under `records/seed/equipment/` and
`records/seed/equipment-class/` validates against its declared `$schema` AND carries
`lifecycleId: registry-ops` + `state` ∈ declared states.

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/seeds/equipment.seed.test.ts
```

Expect RED now on all 29 files (missing lifecycle fields) and on eqc-quantstudio5.yaml
specifically at `:6` (`model` — `unevaluatedProperties: false` at equipment-class.schema.yaml:10).
If this goes green, seed validity + lifecycle stamping + the AS-ORCH-L1-100 fix are all proven at
once. Then the migration-runner and archive-guard suites.

## The design, pinned

### 1. (a) Seed YAML — the only code-repo write

In EACH of the 29 covered-kind seed files, add (after `id:`/`name:`, plain YAML, matching each
file's existing style):

```yaml
lifecycleId: registry-ops
state: active
```

Rationale for `active` (not the create-default `draft`): these are factory-reviewed operational
defaults; 25 of them already declare domain `status: active` (equipment.schema.yaml:15-19).
`state: active` is NOT a locked state (locked list = approved/effective/superseded/archived,
RecordStoreImpl.ts:286), so seeded records stay editable pre-archive — ruling B preserved.
`draft` would strand every factory record in a state whose only transitions are author-Activate
or approver-Archive. (OQ2 covers the runner-side mapping; the seed choice needs no mapping table.)

EQC-QUANTSTUDIO5 additionally: resolve the `model` key per the schema. The schema declares
`modelFamily` at `schema/lab/equipment-class.schema.yaml:34` and `manufacturer` at `:31`; the
seed already has `manufacturer: Thermo Fisher Scientific`. **PINNED FIX: rename `model:` →
`modelFamily:`** (data-only, value unchanged — OQ3 holds the alternative). The forbidden
alternative is touching equipment-class.schema.yaml (see reviewer bait #1).

Schema files, lifecycle YAMLs, coverage YAML semantics for the 7 kinds: UNTOUCHED except as the
OQ1 data-extension ruling decides. The seed-merge suppression (RecordStoreImpl.ts:439-440 seed
marking + QMS7-2 exactly-once) is untouched — seeds stay seed-resolved; records promoted in the
lane (EQC-QUANTSTUDIO5) are governed by (b), not by the seed edit, because the working copy
shadows the seed.

### 2. (b) Migration runner — reuse `applyOwnershipDefaults`, do not invent a new shape

New: `server/src/scripts/migrateRecordLifecycles.ts` + `migrateRecordLifecycles.test.ts`, built
EXACTLY on the OWN-13 precedent (`server/src/scripts/applyOwnershipDefaults.ts:1-24` header and
`applyOwnershipDefaults()` at `:122+`):

- **Dry run by default; writes ONLY with `--apply`.** Usage
  `CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx src/scripts/migrateRecordLifecycles.ts`
  (the `CONFIG_PATH` env read exists at `server/src/config/loader.ts:47`-region: configPath
  defaults to `process.env.CONFIG_PATH` or `./config.yaml`).
- **Prints the resolved data dir FIRST and never touches a dir it did not name**
  (applyOwnershipDefaults.ts:128-130 pattern). This is a hard requirement here, not ceremony —
  see reviewer bait #4: the repo-root `config.yaml` is a SYMLINK to the live computable-lab
  config whose `dataDir: ~/.computable-lab` (measured: `readlink -f config.yaml` →
  `/mnt/vast/home/brad/git/computable-lab/config.yaml:5`). Running the migration without
  CONFIG_PATH would edit the LIVE data repo. Precedent incident:
  `/home/brad/.hermes/cl/lanes/1/cleanup-probe-grants-20261004T0620.sh:3,28`.
- **Core is a plain function over injected `(store, coverage, engine, resolvedDir, apply, log)`**
  so unit tests inject `server/src/test-support/MemoryRecordStore.ts` + a fake dir + a real
  engine loaded from `schema/core/lifecycles` + the REAL coverage file. `main()` is the thin
  wiring layer (loadConfig → resolved data dir → real embedded-git store exactly the way
  `server.ts:472-487` resolves it).
- **Driven by the coverage data, zero kind names in TS**: iterate the coverage registry's kind
  list (QMS7-3's `KindLifecycleRegistry.entryFor`), `store.list({ kind })` per covered kind,
  read each record's mapped target state from the coverage data (OQ1/OQ2). Records of other
  kinds are never listed, never touched.
- **Idempotent**: a payload already carrying `lifecycleId` is SKIPPED with a printed line
  (`SKIP <id>: already governed (<lifecycleId>/<state>)`) — the second run's dry report plans
  ZERO changes; that is the tested property, keyed on payload content, not file mtimes.
- **Preserves ids/refs/domain statuses/authorship**: the write copies the existing payload and
  ADDS only `lifecycleId` + `state` (and refreshes `updatedAt` via the normal envelope path);
  it never rewrites `id`/`recordId`/refs/`status`/`createdBy`.
- **Write path = the existing walls**: ONE `store.update({ envelope, expectedSha:
  <envelope.meta.contentSha>, message: 'Govern <id> under <lifecycleId> (QMS7-4 migration)',
  viaLifecycleApi: true, actor })` per record. `UpdateRecordOptions` already exposes
  `expectedSha`, `message`, `skipValidation?`, `skipLint?`, `viaLifecycleApi?`, `actor`
  (server/src/store/types.ts:94-115). The runner NEVER passes skipValidation/skipLint —
  validation, lint, the append-only wall (RecordStoreImpl.ts:733-741), the content lock
  (`:744-745`), the git-backed durability and the audit/write-hook path all run. A store refusal
  (content lock, append-only, sha mismatch) is **RECORDED IN THE REPORT as blocked and the record
  is left untouched** — never forced, never retried with skips.
- `viaLifecycleApi: true` + `actor` are deliberate: the bypass-audit detector
  (server/src/lifecycle/BypassAudit.ts:63-77) fires on a state flip through the store WITHOUT
  the marker; a migration is a sanctioned, reported, git-committed assignment, not a bypass —
  without the marker the data repo fills with `lifecycle_state_bypass` audit spam (bait #8).
- Report shape mirrors OWN-13's `MigrationReport` (resolvedDir, totals, planned[], applied[],
  skipped[]/blocked[] with `reason`), printed as it goes.

### 3. (c) Archive semantics — data-declared, generic, at the two write gates

Ruling B, API-level, no UI. The rule: **a NEW operational assignment to a record whose
lifecycleId is a COVERED kind and whose state is a TERMINAL state of that lifecycle is rejected
before anything durable.** Terminal-ness comes from the lifecycle YAML's `terminal: true` flag
(registry-ops declares archived terminal; QMS7-3 spec §1) — NOT from a new TS state list
(bait #3). Read paths (`get`, `list`, refs, search) are untouched: ECP-QUANTSTUDIO5 →
EQC-QUANTSTUDIO5 keeps resolving (EquipmentCapabilityService.ts:69-83 joins by ref id with zero
state filtering — verified).

Data: one block appended to the coverage file (OQ1 for placement):

```yaml
# Data-driven archive guard (QMS7-4, ruling B): a NEW ref assignment to a
# covered record in a terminal lifecycle state is refused at create, and on
# update when the ref newly CHANGES to one. Historical kinds are exempt —
# they are evidence, not operational assignments.
archiveGuard:
  exemptKinds: [audit-event, signature, record-revision]
```

Code (server generic, NO kind literals — exemptKinds values arrive via the loader, injected like
QMS7-2's appendOnlyKinds config-injection discipline):

1. **Create gate** — in `RecordHandlers.createRecord` (entry at RecordHandlers.ts:469), in the
   same create-region placement discipline QMS7-3 used (after the parent-check block, alongside
   the QMS7-3 stamp; anchor by symbol, not line — QMS7-3's stamp shifts the region): walk the
   incoming payload generically for ref objects `{ kind: 'record', type: <X>, id: <Y> }` (the
   generic `<something>Ref`-object shape `lifecycleMiddleware.ts:84-95 extractRoleAssignments`
   already demonstrates), resolve each target via `store.get`; reject 422
   `{ error: 'ARCHIVED_TARGET_ASSIGNMENT', message: '<Y> is archived under the <lifecycleId>
   lifecycle and cannot receive new assignments.' }` when target's lifecycleId is covered, its
   state is terminal per the engine, and the SOURCE payload's kind is not in
   `archiveGuard.exemptKinds`. Absent guard data / absent engine → skip entirely (every existing
   test path byte-identical, same pattern as QMS7-3's coverage accessor). The {error,message}
   shape follows the existing rejections (`:848`, `:934`).
2. **Update gate** — in `updateRecord`, at the same placement as the existing post-lock write
   gates (protocolStepWriteGate / extractionDraftWriteGate, RecordHandlers.ts:936-952 region:
   AFTER the content lock `:933-934`, BEFORE the store write): same walk, but compare ref sets
   `previous → proposed`; reject ONLY refs that NEWLY point at a terminal covered record
   (editing an ECP whose existing equipmentClassRef already points at the archived EQC stays
   legal — that's Ruling B's "historically referenceable"). 
3. **Engine accessor**: the guard needs "is state S terminal for lifecycle L". Add ONE plain
   read-only getter on `LifecycleEngine` (alongside `isLoaded` at LifecycleEngine.ts:102 —
   `terminalStates(lifecycleId): ReadonlySet<string> | undefined` or equivalent, reading the
   already-parsed spec). No policy in TS — it reports YAML facts.
4. **Explicitly NOT built here**: no archived filtering of `list()`/`get()` (QMS7-6 owns the
   browse affordance; server stays readable), no unarchive/DELETE path (archived→anything is
   undeclared → the engine denies it: `lifecycleMiddleware.ts:63` wording, `Transition from …
   is not allowed by the … lifecycle.`), no signature guard on the archive transition (QMS7-3
   OQ2 ruled role-only; if that changes it is pure YAML), no touch to LIFECYCLE_IMMUTABLE
   (`:847-849`), STALE_SIGNATURE (`:882`), SIGNED_CONTENT_CHANGED (`:885`), draft-copy
   (`:295-296`) — the cheatsheet contract
   (`docs/qms-manual-testing-cheatsheet.md:125-178`, esp. `:157-163`) stays intact, pinned by
   the regression suites in §verification.

Why the guard scopes to COVERED kinds' terminal states only (not every lifecycle's terminal):
document-control's superseded/archived targets already have working cross-kind references in
tests and lane data; scoping to the registry-ops coverage data is the minimal ruling-B surface,
keeps the fail-set provably flat for governed kinds, and is literally "interpret the declared
archived-state operational rule … per the coverage data" (task `files:` line,
task-list.md:4245-4246).

## In-scope files (§files ownership) vs explicitly out of scope

IN SCOPE (worker owns exactly this list; ownership == diff must not exceed it):

| File | Change |
|---|---|
| `records/seed/equipment/*.yaml` (25) | +lifecycleId/state |
| `records/seed/equipment-class/*.yaml` (4) | +lifecycleId/state; eqc-quantstudio5.yaml also `model:`→`modelFamily:` (AS-ORCH-L1-100) |
| `server/src/scripts/migrateRecordLifecycles.ts` (NEW) | runner core + thin main() |
| `server/src/scripts/migrateRecordLifecycles.test.ts` (NEW) | MemoryStore unit pins |
| `server/src/seeds/equipment.seed.test.ts` (NEW) | seed-corpus schema-validation + lifecycle pins |
| `server/src/governance/archivedAssignment.test.ts` (NEW) | guard RED-first suite (denialMessageBoundary real-stack harness pattern) |
| `server/src/api/handlers/RecordHandlers.ts` | create-gate + update-gate blocks ONLY (create region + the post-lock gate region; nothing else) |
| `server/src/registry/KindLifecycleRegistry.ts` | parse `archiveGuard` block (+ optional `migration` block per OQ1/OQ2) |
| `schema/registry/registry-kinds.registry.yaml` | append `archiveGuard:` (+ `migration:` if OQ2 rules mapping) — DATA-only additions, the 7-kind list untouched |
| `server/src/lifecycle/LifecycleEngine.ts` | ONE terminal-states getter, nothing else |
| `server/src/server.ts` | wiring the guard data into the handler security options ONLY |

OUT OF SCOPE (any diff line here is an instant review reject):
- ALL of `app/` — no browser gate, no UI (orchestrator ruling).
- `RecordStoreImpl.ts`, `store/types.ts`, `revisions/RecordRevisionService.ts` — the walls exist
  and stay (bait #9); QMS7-2 territory.
- `schema/lab/equipment-class.schema.yaml` and every other schema — the `model` fix is DATA-side
  (bait #1).
- The 7-kind coverage list; governed kinds' lifecycle files; `common.schema.yaml` (FAIRCommon).
- `docs/`, task list, canonical spec paths, grants/authorsing (orchestrator-authored lane data,
  GRANT-QMS7-REGOPS precedent).
- Any :3092 live verification, restarts, or data-dir pokes by the worker.

## Acceptance criteria — verbatim task-list `verified by:` mapped 1:1

Verbatim (task-list.md:4239-4244; identical in the wave-3 intake block
`~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/wave3-append-blocks.md:156-161`):

> Dry-run report lists planned changes + blockers; apply is idempotent (second run zero change);
> after restart the seeded EQC/EQP records expose the lifecycle; archiving EQC-QUANTSTUDIO5 keeps
> the ECP reference resolvable while a NEW assignment to it is rejected; archived content edits
> fail at HTTP + storage; content edits smuggled inside a transition PUT fail on locked records;
> governed kinds' signature/draft-copy protections unchanged.

| # | Clause | Worker-test (RED-first) | Live-gate step |
|---|---|---|---|
| V1 | Dry-run report lists planned changes + blockers | runner test: seeded MemoryStore with one governed-skipped, one blocked (append-only via config-injected kind, mirroring the QMS7-2 R4b pattern) → report has planned[], blocked[] with reason, zero writes | LG4 |
| V2 | Apply is idempotent (second run zero change) | runner test: apply → re-run dry → planned=[] and data-dir store contents byte-identical | LG5 |
| V3 | After restart the seeded EQC/EQP records expose the lifecycle | `equipment.seed.test.ts` validates all 29 seeds (schema-valid + lifecycleId registry-ops + declared state) | LG6 |
| V4 | Archiving EQC-QUANTSTUDIO5 keeps the ECP reference resolvable while a NEW assignment is rejected | guard suite: create ECP-shaped payload → archived covered target 422 ARCHIVED_TARGET_ASSIGNMENT; GET + existing-ref resolve unchanged; exemptKinds create passes; update with NEWLY pointed archived ref 422, update keeping existing archived ref passes | LG7, LG8, LG9 |
| V5 | Archived content edits fail at HTTP + storage | guard suite PUT archived + changed content → 409 CONTROLLED_RECORD_LOCKED (handler `:933-934`) AND direct `store.update` → `CONTROLLED_RECORD_LOCKED` (RecordStoreImpl.ts:286) | LG10 |
| V6 | Content edits smuggled inside a transition PUT fail on locked records | guard suite: PUT with state transition + changed `controlledContent` on a locked record → 409 (controlledContent excludes only state/createdAt/createdBy/updatedAt, RecordRevisionService.ts:29-34); mirrored on archived EQC in the suite | LG10 |
| V7 | Governed kinds' signature/draft-copy protections unchanged | regression run of the existing suites (below) + coverage-scope test proving document-control archived targets are NOT guard-rejected (scoped to covered kinds) | LG3 (training-material still document-control) |

## Verification commands (complete, with expected output)

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/server   # in the WORKTREE, node_modules symlinked
# first targeted check (RED before implementation):
npx vitest run src/seeds/equipment.seed.test.ts                                   # RED→GREEN
npx vitest run src/scripts/migrateRecordLifecycles.test.ts \
               src/governance/archivedAssignment.test.ts                          # RED→GREEN
# touched set, must be GREEN:
npx vitest run src/seeds src/scripts src/governance src/lifecycle src/api/Api.test.ts
# regression (V7 — signature/draft-copy/lock walls intact):
npx vitest run src/governance/denialMessageBoundary.test.ts src/governance/governanceStrictness.test.ts src/governance/denialMessage.test.ts
npx vitest run src/revisions src/store/RecordStore.test.ts src/store/LifecycleBypassAudit.test.ts
# typecheck:
npx tsc --noEmit    # EXPECT: 0 "error TS" lines (baseline measured 0 at 7137b1c0)
# seed files schema-proof (V3 static leg, also in the suite):
# (the equipment.seed.test.ts run above IS this)
```

Expected: each named suite exits 0 with all tests passed; `tsc` prints nothing. Full-suite is the
known contention-poisoned baseline — report fail-SET delta vs a fresh trunk run, never raw counts.

## YAML-reload / data-dir traps (worker contract callouts)

- `tsx --watch` does NOT reload YAML (standing trap; QMS7-3 spec §reload). All worker proof is
  vitest with engines/registries loaded from disk. Any worker report claiming live-:3092 proof is
  automatically suspect.
- Migration runner NEVER defaults onto `./config.yaml` (live-data symlink, bait #4) and prints
  the resolved dir before opening the store. Unit tests inject the dir string and a MemoryStore;
  the worker never runs `--apply` anywhere.

## Live-gate sequence (orchestrator runs POST-MERGE; worker never touches :3092)

Prereq: GRANT-QMS7-REGOPS (lifecycleId registry-ops, roles [author, approver], USR-QMS-ADMIN)
already authored in lane data per the QMS7-3 OQ1 ruling.

- LG1 RESTART lane stack (:3092) so the new seed YAML + coverage data land (tsx --watch).
- LG2 `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -- records/seed/` →
  ZERO lines post-merge (seeds committed to trunk, not to lane); and
  `grep -c 'lifecycleId: registry-ops' <(cat /mnt/vast/home/brad/git/cl-integration-1/records/seed/equipment*/*.yaml)` → 29.
- LG3 `curl -s localhost:3092/api/records/DOC-DEMO-SOP | head -c 200` → still document-control
  governed (V7 smoke).
- LG4 dry run: `cd server && CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx
  src/scripts/migrateRecordLifecycles.ts` → report names `Data dir: /home/brad/.computable-lab-
  lane1`, plans ≥1 (the promoted EQC-QUANTSTUDIO5 working copy + any lane EQP/PEOPLE records),
  lists any blocked with reason, ZERO data-repo commits (`git -C /home/brad/.computable-lab-lane1/worktrees/main
  log --oneline -1` unchanged).
- LG5 apply: same + `--apply` → data-repo commits named `Govern <id> under registry-ops
  (QMS7-4 migration)`; IMMEDIATELY re-run dry → planned = ZERO (V2), then `--apply` again → zero
  commits.
- LG6 `curl -s localhost:3092/api/records/EQP-QUANTSTUDIO5 | jq '.payload.lifecycleId, .payload.state'`
  → `"registry-ops" "active"` (seed-resolved, V3); same for EQC-QUANTSTUDIO5 via the LANE record
  API → governed (migrated working copy wins — exactly-once list() unchanged).
- LG7 archive EQC-QUANTSTUDIO5: GET its current sha, PUT payload with `state: "archived"`
  (content otherwise identical) as USR-QMS-ADMIN → 200; lifecycle audit event records the
  transition (approver role from GRANT-QMS7-REGOPS binds under POL-REGULATED deny).
- LG8 reference still resolves: `curl -s localhost:3092/api/records/ECP-QUANTSTUDIO5 | jq
  '.payload.equipmentClassRef.id'` → `"EQC-QUANTSTUDIO5"`; `curl -s
  localhost:3092/api/records/EQC-QUANTSTUDIO5` → 200 readable archived (V4, ruling B).
- LG9 NEW assignment rejected: `curl -s -X POST localhost:3092/api/records -H 'content-type:
  application/json' -d '{"schemaId":"equipment-capability","payload":{...new ECP, equipmentClassRef
  -> EQC-QUANTSTUDIO5...}}' -w '%{http_code}'` → **422** body error `ARCHIVED_TARGET_ASSIGNMENT`;
  same for a fresh `equipment` record (EQP) pointing at the archived EQC. No residue: it isn't in
  the data repo (V4).
- LG10 archived content edit: PUT EQC-QUANTSTUDIO5 with changed `name` (state left archived) →
  **409 CONTROLLED_RECORD_LOCKED** at HTTP (V5) — the storage-layer leg is the worker-suite
  direct-store assertion (V5/V6: smuggled state+content PUT also 409).
- LG11 (optional hygiene) `curl -s -X PUT .../EQC-QUANTSTUDIO5` with `state: "active"` → 422
  engine wording "not allowed by the registry-ops lifecycle" — no undeclared unarchive.

## Worker contract

- Branch `wt/QMS7-4-lane1-<YYYYMMDDTHHMM>` off cl/integration-1 tip AT DISPATCH TIME (must
  already contain QMS7-3); worktree `/mnt/vast/home/brad/git/wt/QMS7-4-lane1-<ts>` via the
  queue-*.sh flock pattern (node_modules symlinks as in queue-docingest-b.sh).
- Report `/home/brad/.hermes/cl/lanes/1/qms7-4-report-<ts>.md`; plans writes ONLY your handoff
  under `.hermes/plans/handoffs/`; end-line `QMS7-4 DONE <report>`.
- Commits: RED tests first (failing at base, called out), then seed data + coverage data, then
  runner, then guards + wiring. No commits to cl/integration-1 or computable-lab; no :3092
  requests/restarts; :3001/:5174 untouchable; NEVER run the runner against anything but an
  injected test store in the suite.
- `exactOptionalPropertyTypes`: guard-data accessor optional (`getArchiveGuard?: () => …` on the
  existing handler security options object), conditional spreads only, terminal-getter returns
  `| undefined`, never `undefined`-valued literal props.

## Reviewer bait (the likely edge errors for this item — pre-empt all)

1. **Relaxing `unevaluatedProperties: false` on equipment-class.schema.yaml:10 (or adding a
   `model` property) to "fix" the seed.** The fix is data: `model:` → `modelFamily:`
   (declared at equipment-class.schema.yaml:34). Any diff touching schema/lab/** is a reject;
   `equipment.seed.test.ts` fences the wall by validating seeds against the untouched schema.
2. **Forcing/`skipValidation`-ing the migration past a store refusal.** Blocked records are
   REPORTED (`reason` in the report) and untouched; the suite injects an append-only kind and a
   content-locked record and asserts the data dir is byte-identical after the run.
3. **A new TS state list for the archive guard** (e.g. another `['archived']` array, or worse,
   reading the pre-existing `:286` list). Terminal-ness is read from the lifecycle YAML via the
   engine (the ONE new getter); the exemptKinds list is data. Grep-level review: no
   `'archived'`/kind-name string literals in the new TS.
4. **Running the runner onto the LIVE data dir.** `./config.yaml` is a symlink to
   `/mnt/vast/home/brad/git/computable-lab/config.yaml` (`dataDir: ~/.computable-lab`, measured).
   The 2026-10-04 probe-grant incident (cleanup-probe-grants-20261004T0620.sh:3,28) is the
   precedent. Mitigations pinned: dir printed first + named-only, CONFIG_PATH explicit in every
   documented invocation, unit tests never read config, orchestrator's LG4/LG5 commands carry the
   env var verbatim.
5. **The `?? status` conflation** (lifecycleMiddleware.ts:38-39): the runner must map domain
   `status` → lifecycle `state` ONLY via the OQ2 data mapping and always write an explicit
   `state`; it must never copy `status` verbatim or leave `state` unset on covered kinds with a
   `status` field (training-record/calibration-record).
6. **Guarding READS** (hiding archived records from get/list/ref-resolution). That is erasure by
   another door — ruling B violation and a QMS7-6 UI concern. The suite asserts GET/list/ECP-ref
   on an archived covered record all still succeed.
7. **Guarding update-path refs without the diff** — rejecting any PUT that CARRIES an
   already-existing archived ref would break editing the ECP after its class archived (historical
   referenceability). The update leg fires only on NEWLY introduced/pchanged refs; pinned test.
8. **lifecycle_state_bypass audit spam** from the migration: store updates flip state without
   the API gate; without `viaLifecycleApi: true` (+ actor) the BypassAudit detector
   (BypassAudit.ts:63-77) self-reports every migrated record as a bypass. Runner sets the marker;
   API-path guards never do.
9. **"Refactoring" the store/handler walls** — RecordStoreImpl.ts:286 already locks `archived`
   once lifecycleId exists; RecordHandlers.ts:933 already answers 409. QMS7-4 ADDS tests pinning
   them; a diff re-plumbing them is scope creep into QMS7-2 territory.
10. **YAML-reload false proof**: worker claims live verification. vitest-only proof; LG1 restart
    is the orchestrator's.
11. **Ontology terms**: registry-ops is a plain operational lifecycle — no CURIE grounding on
    the guard/migration data; don't bolt vocabulary fields on.
12. **Seed edit leaking beyond `records/seed/**`**: ownership check is `git diff --name-only
    trunk...HEAD` ⊆ the §files table; anything outside = reject.

## Open questions for the orchestrator (with recommendations)

- **OQ1 — where the guard/migration data lives.** `archiveGuard:` (+ optional `migration:`)
  blocks need a home. RECOMMEND: append to `schema/registry/registry-kinds.registry.yaml` and
  extend `KindLifecycleRegistry` to parse them (the registry IS the lifecycle-coverage file and
  QMS7-4's task line says "server validation hooks per the coverage data", task-list.md:4245-4246;
  a second sibling file splits one fact across two files). Alternative if QMS7-3's file must
  stay frozen: new `schema/registry/registry-ops-guard.registry.yaml` + second loader pass —
  more wiring, same behavior. Both listed; the §files table assumes the recommendation. Checked:
  coverage file + loader exist only in QMS7-3's in-flight branch (absent from 7137b1c0 —
  greps empty), so the exact merge shape must be re-anchored at dispatch.
- **OQ2 — migration state mapping (active vs draft for existing working records).** The lane has
  promoted/created records (e.g. EQC-QUANTSTUDIO5, PER-* records) with NO domain status at all.
  RECOMMEND: data-declared mapping in the coverage file (`migration: { stateByDomainStatus:
  { active: active }, default: draft }`-style — shape coder-finalizes as data) so active-status
  equipment lands `active`, status-less/plain records land `draft`, all reported per-record in
  the dry run; the runner never guesses per-kind in TS. Alternative (everything →
  defaultState `draft`): simpler but strands operationally-in-use equipment pre-Activate and
  needs an author-Activate sweep the UI won't offer until QMS7-6. Seed choice (`active`) is
  pinned in §1 regardless.
- **OQ3 — `model` → `modelFamily` rename vs folding the value into `notes`.** RECOMMEND:
  `modelFamily: QuantStudio 5` (declared property, manufacturer already present, zero information
  loss, minimal diff). Alternative: delete `model:` and prefix notes — loses queryable structure.
  The forbidden path is any schema change. Checked: the promoted lane copy already dropped
  `model` (file measured), so the rename cannot conflict with lane data; `grep -rn '"model"'` for
  consumers of that seed key returned no TS reader (only the seed file and notes text).

COMPOSER NOTES: trunk sha measured 7137b1c0e528dcab92175c077fb216fc9d896984. QMS7-3 artifacts
(registry-ops lifecycle, coverage file, KindLifecycleRegistry, create stamp) are NOT yet on this
trunk — they live in the queued QMS7-3 run; every anchor into them is by-name, to be re-anchored
by the coder against a tip that contains the merge (dispatch gate already requires it).

## ORCHESTRATOR PROMOTION + OQ RULINGS (20261016T0820, tick)

PROMOTED from drafts/...l1t0500.draft.md (composer retry session; draft byte-identical except
this block). Rulings on the open questions:
- OQ1: APPROVED recommendation — archiveGuard (+ migration) blocks appended to
  schema/registry/registry-kinds.registry.yaml; KindLifecycleRegistry parses them. Re-anchor the
  loader to the MERGED QMS7-3 shape (now on trunk at fedbc17c — KindLifecycleRegistry.ts exists;
  the draft's "absent from 7137b1c0" note is superseded: re-anchor path:line against current tip).
- OQ2: APPROVED recommendation — data-declared mapping block in the coverage file
  (stateByDomainStatus + default); runner never guesses per-kind in TS. Seed state `active`
  pinned as drafted.
- OQ3: APPROVED recommendation — `model:` -> `modelFamily:` (verified myself:
  equipment-class.schema.yaml declares modelFamily at :33-34, manufacturer :31).
Dispatch gate status: QMS7-2 DONE (7a9a55af); QMS7-3 adv-review r2 ACCEPT
(reviews/qms7-3-advreview2-l1t0745.md), MERGED fedbc17c, orchestrator live gate pending at
dispatch note (see handoff). Fleet lock: free.
