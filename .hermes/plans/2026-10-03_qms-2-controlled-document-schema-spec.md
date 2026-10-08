# QMS-2 spec — controlled-document (cf:SOP) schema triplet + training-record ref widening

Campaign: light-qms-records-browser. THE LIST `/home/brad/.hermes/cl/task-list.md` item QMS-2.
Deps: QMS-1 items (a), (f), (g'), (h) — all RESOLVED. Decisions doc:
`/home/brad/.hermes/specs/inbox/qms-integration-contract.md` (read the (a), (f), (g'), (h), (i),
and FILE-OWNERSHIP sections before writing anything).

## Goal

Make the already-implemented `document-controlled-signing` lifecycle exercisable by giving it a
schema consumer: a new `controlled-document` record schema triplet, plus the one-time
`training-record.trainingMaterialRef` widening that prevents a second disconnected SOP
representation, plus the missing `calibration-record.ui.yaml`.

## LOCKED decisions (orchestrator — do not re-open, do not silently deviate)

- **Domain directory: `schema/lab/`.** The triplet lives at `schema/lab/controlled-document.*.yaml`.
  Rationale: `schema/lab/` holds the sibling record schemas (`training-record`, `calibration-record`,
  `person`, `equipment`, `training-material`); `schema/core/` holds meta/mixins (`common`,
  `record`, `term`, `context`, `lifecycle.meta`). Both were precedent-holding; lab wins on sibling
  proximity.
- **One canonical term: `controlled-document`.** kind `controlled-document`, id pattern
  `^DOC-[A-Z0-9][A-Z0-9_-]*$`. `cf:SOP` is NOT a kind; "sop" survives only as a `docType` enum
  value (see below). Never introduce a second local term for this entity.
- **Identity field name: `id`** (NOT `recordId`). `schema/lab/` uses `id` in 25 of 28 sibling
  schemas (only `labware`, `labware-instance`, `measurement` use `recordId`), and `training-record`,
  `calibration-record`, `person` — the three closest siblings — all use `id` with a `^XXX-` pattern.
  `RecordHandlers` extracts the record id from `payload.recordId ?? payload.id`
  (`RecordHandlers.ts:344`), so `id` works for POST /records.
- **State field name: `state`** — `LifecycleHandlers.ts:53` reads `payload.state ?? payload.status`;
  `protocol.schema.yaml:84` and `budget.ui.yaml:34` both use `state`. Use `state`.
- **docType enum: `[sop, work-instruction, policy]`** (task-list QMS-2 wording).
- **Role refs carry USR-* ids.** `authorRef` / `reviewerRef` / `approverRef` are refs with
  `kind: record`, **`type: { const: user }`**, `id` pattern `^USR-`. This is load-bearing:
  `extractRoleAssignments` (`server/src/lifecycle/lifecycleMiddleware.ts:78-93`) reads any
  `<role>Ref.id`; `requires_different_person` compares that id against the session actor id, which
  is ALWAYS a `USR-*` id (`RecordHandlers.ts:638`). A `PER-*` id there would silently defeat the
  guard (QMS-1 (e)). `type: user` (not `person`) is deliberate so a ref picker cannot offer a
  `PER-*` person record into a lifecycle-identity slot; `user` is a real record kind
  (`schema/identity/user.schema.yaml:24`).

## Contract to implement

### 1. `schema/lab/controlled-document.schema.yaml` (NEW)

Mirror the shape of `schema/lab/training-record.schema.yaml` (same header/`$id` style,
`type: object`, `unevaluatedProperties: false`, `allOf: [ {$ref: "./common.schema.yaml#/$defs/FAIRCommon"} ]`).

- `required: [kind, id, title, state, lifecycleId]` (follow the sibling convention; add further
  required fields only if the lifecycle genuinely needs them).
- `kind`: `const: "controlled-document"`.
- `id`: `type: string`, `pattern: "^DOC-[A-Z0-9][A-Z0-9_-]*$"`.
- `title`: string, minLength 1.
- `lifecycleId`: `type: string`, `const: "document-controlled-signing"` — mirrors
  `protocol.schema.yaml:234-236`.
- `state`: string enum matching the lifecycle's SIX states exactly (read
  `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` `states:` — draft, in_review,
  approved, effective, superseded, archived; confirm before writing, do not copy this prose).
- `body`: `type: string` — the editable rich-text body (HTML string). See §3.
- `docType`: string enum `[sop, work-instruction, policy]`.
- `revision`: `type: string` — a HUMAN document-revision label, explicitly documented in its
  `description` as NOT a git identity (git is the authoritative revision substrate; QMS-1 (h)).
- `authorRef` / `reviewerRef` / `approverRef`: refs per the LOCKED decision above. Not `required`
  (a draft has only an author; reviewer/approver are assigned as the flow advances); `authorRef`
  MAY be required — your call, but if you require it, say why in the report.
- `effectiveAt` / `supersededAt` (optional, `format: date-time`) only if you can justify them from
  the lifecycle; do not invent unused fields.

### 2. `schema/lab/controlled-document.lint.yaml` (NEW)

No business rules beyond schema-implied. Follow the shape of an existing sibling lint file
(e.g. `schema/lab/instrument.lint.yaml` / `schema/lab/material.lint.yaml`) — read one first; do not
invent a lint dialect. If the existing lint format has nothing meaningful to add for this schema,
a minimal valid file that declares nothing harmful is correct — but it MUST load (see tests).

### 3. `schema/lab/controlled-document.ui.yaml` (NEW)

- Declare an **`editor:` block** (blocks + slots) so the body field uses the supported editor path,
  NOT the `form.sections` fallback (which emits `UNSUPPORTED_WIDGET` for `markdown` —
  `EditorProjectionService.ts:225-230,294-307`). The ONLY existing `editor:`-block precedent in the
  repo is **`schema/workflow/budget.ui.yaml:11-51`** — read it and follow its exact shape
  (`editor.mode`, `editor.blocks[]` with `id/kind/label/help`, `editor.slots[]` with
  `id/path/label/widget`). Do not copy the campaign prose's line citations for other files; verify
  against the real files.
- Put `body` on a slot with `widget: "markdown"` (renders `RichTextField` / nested TipTap,
  `WidgetRenderer.tsx:324-326`; value round-trips as an HTML string). `widget: "textarea"` is the
  equivalent fallback if the loader rejects `markdown` — verify which the loader accepts
  (`server/src/ui/UISpecLoader.ts` VALID_WIDGET_TYPES) and say which you used and why.
- Include the other fields as slots (title, docType select, revision text, the three ref slots with
  `refKind: "user"`, and read-only display of `id`/`kind`).
- **Do NOT expose `state` or `lifecycleId` as editable field rows** (task-list QMS-2: state advance
  is a PATCH→well, PUT /records payload change gated by the lifecycle engine; there must be no
  alternate state-change affordance in the form). Read-only display of `state` is acceptable.

### 4. `schema/lab/calibration-record.ui.yaml` (NEW — currently missing)

Follow `schema/lab/training-record.ui.yaml`'s shape: cover `equipmentRef` (ref, refKind
`equipment`), `performedAt`, `dueAt`, `status` (select over the schema's enum
`[pass, fail, adjusted, limited_use]`), `performedByRef`, `notes`. Read
`schema/lab/calibration-record.schema.yaml` first and mirror its actual field names/patterns.
No lifecycle chrome (A6: calibration records get browse/edit/save only).

### 5. `schema/lab/training-record.schema.yaml` (EDIT — the ONLY existing schema you may touch)

QMS-1 (g') contract: widen `trainingMaterialRef`'s `type` from `const: training-material` to
`enum: [training-material, controlled-document]`. Single-point edit; leave
`unevaluatedProperties`, `required`, and every other property untouched. This is additive, so
existing training-record behaviour is preserved.

## Tests (write them; they are the gate)

Server-workspace tests (the schema suite lives under `server/src/schema/` or `server/test/` —
find the existing schema-validation test harness first, e.g. `governanceSchemas.test.ts` or a
schema loader test, and follow its style):

1. A valid `controlled-document` draft (`state: draft`, all required fields) passes AJV schema
   validation AND loads through the lint engine.
2. Rejections: wrong/absent `lifecycleId`, a `state` outside the six-value enum, a `docType`
   outside the three-value enum, an `id` not matching `^DOC-`.
3. `UISpecLoader` loads all three new ui.yaml files (including `calibration-record.ui.yaml`).
4. Projection test: `EditorProjectionService` for the `controlled-document` ui spec returns the
   `body` slot as an editable field (NOT an `UNSUPPORTED_WIDGET` diagnostic) — this is the
   QMS-1 (a) contract made executable.
5. `training-record` with `trainingMaterialRef.type: "controlled-document"` now validates, and with
   `type: "training-material"` still validates; behaviour of existing training-record tests
   unchanged.
6. Round-trip: a controlled-document payload survives documentMapper/recordSerializer preserving
   the structured/html `body` string.

## Acceptance criteria

1. `npm run typecheck -w server` exit 0 (and `-w app` exit 0, or if the app workspace carries
   pre-existing drift, report the baseline vs now counts and confirm none of your files appear).
2. `npx vitest run <your new/changed test files>` green.
3. `npx vitest run` over the existing schema/governance suites: no NEW failures vs the documented
   baseline (`test/api/settings.test.ts` pre-existing hook-timeout failure is permitted and NOT
   fixed — attribute it, don't touch it).
4. Every new YAML parses (`python3 -c 'import yaml,sys; yaml.safe_load(open(p))'` for each) and the
   server's schema loader reports the new kind (a small script or an API-level test using the real
   loader is fine — no fabricating counts).

## Boundaries

- EDIT (inside YOUR worktree only — the shared main checkout is Brad's live tree):
  `schema/lab/controlled-document.{schema,lint,ui}.yaml` (new),
  `schema/lab/calibration-record.ui.yaml` (new),
  `schema/lab/training-record.schema.yaml` (the ONLY existing schema file),
  plus your new/changed server test files.
- MUST NOT touch: anything under `app/`, `RecordRegistryPage.tsx`, `DocumentControlBar.tsx`,
  `client.ts`, any lifecycle YAML, any governance/role-grant/person file, or
  `training-record.ui.yaml` / `calibration-record.schema.yaml` (schema behaviour for
  training/calibration stays untouched — only the training-record ref enum is widened).
- Do NOT edit the shared main checkout and do NOT `cd` into it. Do NOT commit to `main`. Work and
  (optionally) commit only on your worktree branch.
- Password material: none — this task touches no credentials.

## Report back (write to the path the dispatcher gives you)

- Absolute paths created/changed + the diff (`git diff --stat` and the full new-file contents).
- Exact test commands + observed output (exit code, counts) for every criterion above.
- The exact `editor:` widget you used for `body` (`markdown` vs `textarea`) and the loader evidence
  that it is accepted.
- Which lint-file shape you followed.
- Any `requires-rescope` surprise — STOP and report rather than absorbing.
