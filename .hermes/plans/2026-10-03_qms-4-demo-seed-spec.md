# QMS-4 spec — Minimal DEMO seed + actor matrix

Campaign: light-qms-records-browser. THE LIST `/home/brad/.hermes/cl/task-list.md` item QMS-4.
Deps: QMS-1 (e) RESOLVED, QMS-2 `done` (merge `1565ee18`). Decisions doc:
`/home/brad/.hermes/specs/inbox/qms-integration-contract.md` — read §(e), §(g'), §(i) verbatim.
Status of the prerequisite gate (verified by the orchestrator before dispatch, 2026-10-03 ~10:15 EDT):
`main` HEAD `dbb5ba3e`; the three branches are MERGED (`b8417d65`/`1565ee18`/`dbb5ba3e`); the live
`:3001` server IS RUNNING and `GET /api/schemas` returns `lab/controlled-document.schema.yaml`
(count 1). `GET /api/config` → `lab.policyBundleId: "POL-SANDBOX"`. The gate is PASSED; do not re-gate.

## Goal

The data repo has ZERO person / training / calibration / grant / signature records — there is nothing
to click and no way to prove role resolution. Produce (1) ONE idempotent DEMO seed script committed to
the CODE repo that creates the minimal fixture set through the record API under POL-SANDBOX, and (2)
the ACTOR MATRIX (R4) — a table mapping session user ↔ person ↔ grants ↔ credential state ↔ expected
permission per transition, which QMS-6 and QMS-7 will consume verbatim.

## Hard constraints

- **No passwords, no pre-created users, no pre-faked signatures/audit events.** The seed NEVER writes
  a `signature` or `audit-event` record (those are 405 APPEND_ONLY anyway) and never invents a
  credential. Demo passwords are set by Brad afterwards via the documented `POST /auth/set-password`
  curl (QMS-7 owns that runbook text).
- **All ids/titles DEMO-labeled.** Every seeded record's id carries a `DEMO` segment and its title
  starts with `DEMO `.
- **Fail closed on missing configuration.** Any unresolvable reference or rejected prerequisite →
  the seed STOPS with a single clear message naming exactly what is missing and what command fixes
  it. Never silently omit a fixture, never substitute an arbitrary real record.
- **Idempotency = skip-if-exists.** A rerun NEVER overwrites or updates an existing fixture of any
  kind (a DOC- fixture may have advanced its lifecycle state or carry signatures by the time the
  seed is rerun — reverting it would be data loss). Only `User.personRef` linkage is write-once: if
  already set to the intended PER- id, skip; if unset, set it; if set to a DIFFERENT PER- id, STOP
  (do not fight another session's linkage — report it).
- **No app/ or schema/ edits.** Deliverable is the script + its test + the matrix doc.
- **Contract is data, not policy in code.** The script contains NO role→action table, NO state
  inference, NO "approved means sign" logic. It creates records with explicit payloads taken from
  this spec + the real schemas; the signing rules stay in the lifecycle YAML.

## Verified existing contracts (cite these; do not re-derive)

Record API (all `path:line` opened 2026-10-03):
- `POST /api/records` body `{ schemaId, payload, message? }` — `server/src/api/routes.ts:227`,
  `server/src/api/types.ts:34-41`. `recordId` is authored by the caller inside the payload
  (`payload.recordId` or `payload.id`; `RecordHandlers.ts:344-351`); kind comes from `payload.kind`.
- `GET /api/records/:id` — `routes.ts:224`. `PUT /api/records/:id` body `{ payload, expectedSha?, message? }`
  — `routes.ts:230` (there is NO records PATCH route).
- `POST /api/signatures` — `routes.ts:599`. NOT used by this task (no signature is pre-faked).
- Identity resolution — `server/src/security/LocalIdentityService.ts:97-168`:
  - header `x-user-id: <USR-id>` resolves to that active user record (no session needed);
  - `x-user-id: USR-LOCAL-ADMIN` resolves `isSystem: true` ONLY while the local admin has NO
    credential (the self-closing bootstrap window, `:117-141`); once a credential exists the header
    is DEAD and falls through to the first active non-admin user (today `USR-BRAD`).
  - a valid session token `x-cl-session` (from `POST /auth/login`) is the strongest signal.
- Role-grant authoring gate — `schema/identity/role-grant.lint.yaml`: actor must satisfy
  `anyOf: [systemActor, localAdmin, role: admin]`; `denyCode: GRANT_FORBIDDEN`; on create the resolved
  actor is stamped into `grantedBy` (`stampActorAs`). Actor context: `isLocalAdmin = userId ===
  'USR-LOCAL-ADMIN'`, `isSystem` from the resolver (`RecordHandlers.ts:140-149`).
- Live facts (verified by curl this tick): `GET /api/me` with no header → `USR-BRAD`;
  with `x-user-id: USR-LOCAL-ADMIN` → `{userId:'USR-LOCAL-ADMIN', isSystem:true}`. `credentials.json`
  contains ONLY `USR-BRAD` (so the Local Admin bootstrap window is OPEN right now, and this will
  change the moment Brad sets an admin password — the script MUST handle both states, see §Auth).

Schemas (read them; do not trust this summary alone — it is exact as of this tick):
- `schema/lab/controlled-document.schema.yaml` — required `[kind, id, title, state, lifecycleId]`;
  `id ^DOC-…`; `state` ∈ {draft,in_review,approved,effective,superseded,archived}; `lifecycleId`
  `const document-controlled-signing`; `docType` ∈ {sop,work-instruction,policy}; `body` string
  (rich-text HTML); `revision` string (HUMAN label, not a git identity); `authorRef`/`reviewerRef`/
  `approverRef` each `{kind:'record', type:'user', id:'^USR-'}`. `unevaluatedProperties:false`.
- `schema/lab/person.schema.yaml` — required `[kind, id, displayName, status]`; `id ^PER-…`.
- `schema/lab/training-material.schema.yaml` — required `[kind, id, title, materialType]`;
  **`id` pattern is `^TRM-…`** (the task-list draft's `TRAINMAT-DEMO-GC` is NOT schema-valid —
  use `TRM-DEMO-GC`); `materialType` enum includes `slide_deck`.
- `schema/lab/training-record.schema.yaml` — required `[kind, id, personRef, trainingMaterialRef,
  status, completedAt]`; `id ^TRR-…`; `trainingMaterialRef.type` is now
  `enum [training-material, controlled-document]` (the QMS-2 widening — this is what lets the
  training record point at the SOP canon, QMS-1 (g')); `status` ∈ {passed,completed,failed,in_progress}.
  There is NO revision field — record the trained-against revision in `notes`.
- `schema/lab/calibration-record.schema.yaml` — required `[kind, id, equipmentRef, performedAt,
  status]`; `id ^CAL-…`; `equipmentRef` `{kind:'record', type:'equipment'}`; `status` ∈
  {pass,fail,adjusted,limited_use}.
- `schema/lab/equipment.schema.yaml` — required `[kind, id, name, status]`; `id ^EQP-…`.
- `schema/identity/role-grant.schema.yaml` — required `[kind, recordId, userId, roles]`;
  `recordId ^GRANT-…`; `userId ^USR-…`; `lifecycleId` optional scope; `roles` array of
  `^[a-z][a-z0-9_]*$`.
- `schema/core/datatypes/ref.schema.yaml` — record refs require `id` + `type`
  (and `kind:'record'`); `label` optional.
- FAIRCommon (`schema/core/common.schema.yaml`) supplies `createdAt`/`createdBy`/`updatedAt`; the
  server stamps `createdAt`/`createdBy` on create (`RecordHandlers.ts:388-427`), so DO NOT set them
  in the payloads (only `POST /records` provenance matters).
- Lifecycle `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` — roles
  {author, reviewer, approver}; `in_review→approved` = role reviewer + guards
  `requires_different_person(than: author)` + `requires_signature(signatureAction: approved)`;
  `approved→effective` = role approver + `requires_signature(signatureAction: approved)`.
  (Read-only for this task — do not edit.)

## Fixture set (exact)

Acting identities are EXISTING users; the seed creates none (satisfies "no passwords in fixtures"):

- **Author identity = `USR-BRAD`** (exists, has a credential, `x-user-id: USR-BRAD` works today and
  will keep working).
- **Reviewer identity = `USR-LOCAL-ADMIN`** (exists; the task text explicitly allows "a demo user or
  Local Admin"). Brad sets its password once via `POST /auth/set-password` before QMS-6 runs.

Records (payload = exactly the schema's fields; order-insensitive):

1. `PER-DEMO-AUTHOR` — `{kind:'person', id:'PER-DEMO-AUTHOR', displayName:'DEMO Author (USR-BRAD)',
   status:'active', notes:'DEMO fixture — QMS-4, not real personnel.'}` (`person.schema.yaml:66`
   declares `notes`, so this is schema-legal — no cosmetic-field hedge needed).
2. `PER-DEMO-REVIEWER` — same shape for `USR-LOCAL-ADMIN`.
3. Linkage (write-once, per §Hard constraints): `USR-BRAD.personRef = {kind:'record', type:'person',
   id:'PER-DEMO-AUTHOR'}`; `USR-LOCAL-ADMIN.personRef = {kind:'record', type:'person',
   id:'PER-DEMO-REVIEWER'}`. Implement as GET → merge into the existing payload → `PUT
   /api/records/USR-…` preserving every other field. If the PUT is rejected by the server, STOP and
   report verbatim (do not proceed with a half-linkage, do not fabricate).
4. `DOC-DEMO-SOP` — `{kind:'controlled-document', id:'DOC-DEMO-SOP', title:'DEMO GC-FID Standard
   Injection SOP', state:'draft', lifecycleId:'document-controlled-signing', docType:'sop',
   revision:'Rev A (DEMO)', body:'<h2>DEMO GC-FID standard injection</h2><p>Sandbox-only fixture
   authored by QMS-4; not a real procedure.</p>', authorRef:{kind:'record', type:'user',
   id:'USR-BRAD'}}`, created as `USR-BRAD` (⇒ `createdBy`/legacy author = `USR-BRAD`, matching
   `authorRef`, so `requires_different_person` has like-vs-like ids — QMS-1 (e)).
5. `TRM-DEMO-GC` — `{kind:'training-material', id:'TRM-DEMO-GC', title:'DEMO GC-FID familiarisation
   deck', materialType:'slide_deck', version:'DEMO-1'}` — the non-signed training flavor (QMS-1 (g'):
   it must NOT be a second SOP representation, hence `slide_deck`, not `sop`).
6. `TRR-DEMO-1` — `{kind:'training-record', id:'TRR-DEMO-1', personRef:{kind:'record',
   type:'person', id:'PER-DEMO-AUTHOR'}, trainingMaterialRef:{kind:'record',
   type:'controlled-document', id:'DOC-DEMO-SOP'}, status:'completed', completedAt:<ISO now>,
   notes:'DEMO fixture — trained against DOC-DEMO-SOP revision: Rev A (DEMO)'}` — the SOP canon
   reference + the trained-against revision both resolvable (QMS-1 (g')).
7. `EQP-DEMO-GC` — `{kind:'equipment', id:'EQP-DEMO-GC', name:'DEMO GC-FID system',
   status:'active'}`. **Orchestrator ruling:** the demo needs a GC, and the only equipment records in
   the data repo are unrelated (a Kuhner shaker, a Thermo water bath); pointing a GC SOP's calibration
   at a water bath would be fabrication-by-mismatch, and stopping the whole seed on a data gap is
   exactly the failure mode Brad rejects. So the seed creates its OWN DEMO-labeled equipment fixture
   — a labeled fixture, not a claim about real lab hardware. It is NOT an "arbitrary pick" of a real
   instrument.
8. `CAL-DEMO-GC` — `{kind:'calibration-record', id:'CAL-DEMO-GC', equipmentRef:{kind:'record',
   type:'equipment', id:'EQP-DEMO-GC'}, performedAt:<ISO now>, status:'pass',
   performedByRef:{kind:'record', type:'person', id:'PER-DEMO-AUTHOR'}, notes:'DEMO fixture —
   not a real calibration.'}`. **Fail closed:** if `EQP-DEMO-GC` cannot be created or read back, STOP
   — never emit a dangling `equipmentRef`.
9. `GRANT-DEMO-AUTHOR` — `{kind:'role-grant', recordId:'GRANT-DEMO-AUTHOR', userId:'USR-BRAD',
   roles:['author'], lifecycleId:'document-controlled-signing', notes:'DEMO fixture.'}`.
10. `GRANT-DEMO-REVIEWER` — `{kind:'role-grant', recordId:'GRANT-DEMO-REVIEWER',
    userId:'USR-LOCAL-ADMIN', roles:['reviewer','approver'],
    lifecycleId:'document-controlled-signing', notes:'DEMO fixture — holds both gated roles so one
    demo identity can complete the lap; USR-BRAD intentionally holds only "author" so the regulated
    denial lap (QMS-7) has a real under-granted actor.'}`.
    Both grants are minted with the local-admin actor; the server stamps `grantedBy`.

## Auth in the script (§Auth) — the one real trap

Grants require the admin actor. The script must resolve it in this order and NEVER guess:

1. If env `CL_SEED_ADMIN_PASSWORD` is set → `POST /api/auth/login {username:'local-admin',
   password}` → use the returned `x-cl-session` token for ALL admin-actor requests.
2. Else → send `x-user-id: USR-LOCAL-ADMIN` and **verify** `GET /api/me` returns
   `userId === 'USR-LOCAL-ADMIN'` AND `isSystem === true`. If both hold → the bootstrap window is
   open; proceed.
3. Else → STOP with:
   `STOP: the Local Admin bootstrap window is closed and CL_SEED_ADMIN_PASSWORD is not set. Either
   run: curl -s -X POST localhost:3001/api/auth/set-password -H 'x-user-id: USR-LOCAL-ADMIN'
   -H 'content-type: application/json' -d '{"password":"<choose>"}' (bootstrap window only), or
   export CL_SEED_ADMIN_PASSWORD=<the admin password> and rerun.`
   Rationale: once an admin credential exists the `USR-LOCAL-ADMIN` header silently degrades to
   `USR-BRAD` (LocalIdentityService.ts:117-141) and the grant create would be denied
   `GRANT_FORBIDDEN` with a confusing message — the script must detect this state, not discover it
   from a 403.

The non-grant fixtures are created as `USR-BRAD` (`x-user-id: USR-BRAD`). The doc create MUST be
`USR-BRAD` so `createdBy === authorRef.id`.

Env: `CL_API_BASE` (default `http://localhost:3001`). Print a final summary table of
`id → created|skipped|STOPPED` and exit non-zero on any STOP.

## Deliverables (UNIQUE PATHS — do not vary them)

Inside YOUR worktree ONLY (`/mnt/vast/home/brad/git/wt/qms-4`, branch `wt/qms-4`):
- `scripts/qms-demo-seed.mjs` — the seed. Export the pure builders (`buildFixtures(nowIso)`,
  `planActions(existing)`-style) plus a `runSeed({ baseUrl, fetchImpl, env })` entry so the test can
  drive it with a fake `fetch`; `process.exit` only in the CLI tail, not in the exported functions.
  Use built-in `fetch` (node ≥ 18; local node is v26).
- `scripts/qms-demo-seed.test.mjs` — `node --test` (built-in `node:test`, ZERO new deps). Assert:
  every payload id matches its schema pattern; the DOC/TRR/EQP/CAL/GRANT payloads carry the exact
  required fields; a second `runSeed` against a fake store that already contains the ids issues NO
  POST/PUT for them (skip-if-exists); the linkage path is write-once (already-correct personRef ⇒ no
  PUT; different personRef ⇒ STOP); **no request body anywhere contains a `password` key** and the
  only request that could carry one is the login; the admin-actor STOP message fires when `/api/me`
  reports a non-admin/non-system identity.
- `docs/qms-actor-matrix.QMS-4.20261003T101017.md` — the ACTOR MATRIX (unique name; the orchestrator
  promotes it to the canonical `docs/qms-actor-matrix.md` after verification). Columns: session user
  (`USR-BRAD`, `USR-LOCAL-ADMIN`), linked person, effective grants (role + lifecycleId scope),
  credential state (brad: set; local-admin: NOT set until Brad runs the curl), and one row per
  lifecycle transition (draft→in_review, in_review→approved, in_review→draft, approved→effective,
  effective→superseded, *→archived) giving: role required, guard(s), expected outcome for each
  user under POL-SANDBOX and under POL-REGULATED, and the exact expected failure reason for the
  under-granted actor. State plainly which rows QMS-6 exercises (sandbox happy path + same-person
  denial) and which QMS-7 adds (regulated authorized success + role denial).
- Your report: `~/.hermes/cl/worker-reports/2026-10-03_qms-4.<YYYYMMDD-HHmm>.md`.

## Dev loop you must run (real output, not claims)

1. `node --test scripts/qms-demo-seed.test.mjs` → green.
2. Run the seed against the LIVE server twice:
   `CL_API_BASE=http://localhost:3001 node scripts/qms-demo-seed.mjs` (run 2 must report every
   fixture `skipped`).
3. Read back every fixture with `GET /api/records/<id>` and paste the status codes + a trimmed body
   for each into your report. Confirm `GRANT-DEMO-*` carry `grantedBy: USR-LOCAL-ADMIN`.
4. Confirm `DOC-DEMO-SOP` validates (a 2xx create IS the validation — Ajv+lint run inside
   `POST /records`); confirm `TRR-DEMO-1.trainingMaterialRef` resolves to `DOC-DEMO-SOP` and the
   revision note is present; confirm `CAL-DEMO-GC.equipmentRef` resolves to `EQP-DEMO-GC`.
5. Record in your report the exact run-2 output proving idempotency, and the data-repo paths the
   records landed at (e.g. `records/controlled-document/DOC-DEMO-SOP__*.yaml`).

Do NOT run `git commit` with a global mode flip: the worktree inherits Brad's exec-bit noise —
commit with `git -c core.fileMode=false add <your files>` so only content enters the commit.

## Boundaries

- Files: `scripts/qms-demo-seed.mjs`, `scripts/qms-demo-seed.test.mjs`,
  `docs/qms-actor-matrix.QMS-4.20261003T101017.md` — nothing else. No `app/`, no `schema/`,
  no server code, no edits to the live checkout `/mnt/vast/home/brad/git/computable-lab`.
- Do not merge your branch. Do not restart the dev server. Do not mark any task-list item done.
- If a REQUIRED contract above turns out false (e.g. the personRef PUT is rejected, or `person`
  rejects every non-required field you chose), STOP and report the verbatim server response — do not
  work around a platform gap by writing records outside the API.
