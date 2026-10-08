# Handoff — QMS-2 controlled-document schema triplet COMPLETE (light-qms-records-browser)

Date: 2026-10-03 (~02:35 EDT). Orchestrator tick. Campaign: light-qms-records-browser.
Task: QMS-2 (THE LIST `/home/brad/.hermes/cl/task-list.md`).

## Status: DONE and orchestrator-verified

- Spec: `.hermes/plans/2026-10-03_qms-2-controlled-document-schema-spec.md` (written this tick,
  with LOCKED decisions: `schema/lab/` domain, `id` field, `state` field, docType enum, USR-* role
  refs).
- Worker: cl-senior (local Qwen3.8 on thunderbeast), isolated worktree
  `/mnt/vast/home/brad/git/wt/qms-2`, branch `wt/qms-2` off `main @ 2a1102bc`. ~62 min.
- Worker log `/tmp/qms-2-worker.log`; report
  `~/.hermes/cl/worker-reports/2026-10-03_qms-2.20261003-0120.md`.
- **Deliverable (canonical = the worktree commit): `bb5a2c66`**
  `feat(qms-2): controlled-document schema triplet, calibration-record.ui.yaml, trainingMaterialRef widening`
  — 6 files, +689 −1:
  - NEW `schema/lab/controlled-document.schema.yaml` (87 L)
  - NEW `schema/lab/controlled-document.lint.yaml` (8 L)
  - NEW `schema/lab/controlled-document.ui.yaml` (153 L)
  - NEW `schema/lab/calibration-record.ui.yaml` (74 L)
  - EDIT `schema/lab/training-record.schema.yaml` (the ONE existing schema file; widening only)
  - NEW `server/src/schema/ControlledDocumentSchemas.test.ts` (363 L, 21 tests)
  Not merged into main (same promotion note as QMS-1A).

## Orchestrator verification (run myself, not the worker summary)

- `git show bb5a2c66 --stat` + read every new file in full:
  - `controlled-document.schema.yaml` — `kind: controlled-document`; `id` `^DOC-[A-Z0-9][A-Z0-9_-]*$`;
    `state` enum **exactly** the lifecycle's six states; `lifecycleId` `const: document-controlled-signing`;
    `docType` enum `[sop, work-instruction, policy]`; `body` string documented as rich-text HTML;
    `revision` string documented explicitly as a HUMAN label and NOT a git identity (QMS-1 (h));
    `authorRef`/`reviewerRef`/`approverRef` refs with `kind: record`, `type: const user`, `id` `^USR-`.
    `required: [kind, id, title, state, lifecycleId]`; `unevaluatedProperties: false` + FAIRCommon.
    Matches the spec contract and every LOCKED decision.
  - `controlled-document.ui.yaml` — declares an `editor:` block (`mode: document`, blocks + slots)
    with `body` on `widget: markdown`, and `state` as a **readonly** slot; `lifecycleId` absent from
    both the editor slots and the `form.sections` fallback; fallback body uses `textarea` (documented
    in a comment as the fallback-only path).
  - `controlled-document.lint.yaml` — `rules: []` with a comment pinning that signing gates live in
    the lifecycle YAML, not duplicated in lint.
  - `calibration-record.ui.yaml` — mirrors `training-record.ui.yaml`; fields read from the real
    `calibration-record.schema.yaml`; `status` select over `[pass, fail, adjusted, limited_use]`;
    no lifecycle chrome (A6).
  - `training-record.schema.yaml` diff — single-point `type: { const: training-material }` →
    `type: { enum: [training-material, controlled-document] }` with the (g') rationale in a comment;
    nothing else touched.
- Re-ran the new suite myself (`npx vitest run src/schema/ControlledDocumentSchemas.test.ts` in the
  worktree): **1 file passed, 21/21 tests, exit 0.**
- Read the test file's structure: it drives the REAL pipeline — `loadAllSchemas` + `createSchemaRegistry`
  + `createValidator` (Ajv) + `loadAllLintSpecs`/`createLintEngine` + `createUISpecLoader`/`loadAllUISpecs`
  + `projectRecord` + `extractRoleAssignments`. It asserts, among others: the loader reports the new
  kind; wrong/absent `lifecycleId` rejected; out-of-enum `state`/`docType` rejected; bad `id` rejected;
  **a `PER-*` id in a role ref is REJECTED** (protects `requires_different_person`, QMS-1 (e));
  role refs feed `roleAssignments` as USR-*; `trainingMaterialRef` → `controlled-document` now validates
  while `training-material` still does and unrelated ref types are still rejected; `UISpecLoader` loads
  both new ui specs with zero spec errors; `projectRecord` returns `body` as an editable slot with NO
  `UNSUPPORTED_WIDGET` diagnostic (the QMS-1 (a) contract made executable); html-body round-trip.
- **Mode noise fixed by me**: the worker's original commit `137900c1` carried
  `mode change 100644 => 100755` on `training-record.schema.yaml` and created all new files 755.
  I `chmod 644` + `git update-index --chmod=-x` on all six and amended → **`bb5a2c66`**,
  `git show --summary | grep 'mode change'` = 0, all six blobs now `100644`.
- Followed the worker's typecheck claim by re-reading the errors: server 26 errors, all in `src/ai/*`
  + `src/api/routes.ts` (modules untracked in HEAD — see the QMS-1A handoff); none name QMS-2 files.

## Surprises / environment notes (none absorbed)

1. **`server/schema` is a git-ignored symlink in the live tree and is absent from a fresh worktree.**
   The worker recreated it worktree-locally (not committed) so `SchemaLoader` resolves. Any future
   worker touching schema loading must do the same.
2. 7 pre-existing `*.ui.yaml` files repo-wide already fail `UISpecLoader`; the worker's "zero load
   errors" assertion is therefore scoped to the new files, with a comment. Do not treat the repo-wide
   count as a QMS-2 regression.
3. Ajv `strictTypes` required `type: string` alongside `id: { pattern }` in the ref `allOf` blocks.
4. Worktree `tsc` baseline is not clean (26 server / 16 app pre-existing errors) — attributable, not
   fixable inside this task's boundaries.

## Promotion

Canonical artifact = **branch `wt/qms-2` commit `bb5a2c66`**. Same as QMS-1A: not merged into `main`
by an unattended tick. **Blocking consequence:** QMS-4's seed script must first verify the live server
serves the new schema via `GET /api/schemas`; that needs `bb5a2c66` (and QMS-1A's `dbd390f3`) merged
into `main` and the `:3001` stack restarted (tsx --watch does NOT reload YAML).

## State / git

- Live tree `/mnt/vast/home/brad/git/computable-lab`: untouched (HEAD `2a1102bc`).
- THE LIST updated: QMS-2 -> in-progress -> done.

## Next ready item(s)

- **QMS-4** (DEMO seed + actor matrix) — deps satisfied in THE LIST, but practically blocked on the
  merge+restart above. Do not dispatch it again until the schema is visible to the live server.
- **QMS-3** (client signature plumbing) — dispatched this tick, worktree `/mnt/vast/home/brad/git/wt/qms-3`.
- QMS-5/QMS-6/QMS-7 remain dependency-blocked.

## Open questions carried

1. **Merge policy (raised by both QMS-1A and QMS-2):** three worktree branches now hold verified,
  unmerged deliverables (`wt/qms-1a` `dbd390f3`, `wt/qms-2` `bb5a2c66`, and soon `wt/qms-3`). The
  campaign cannot be exercised (QMS-4 onward) until an attended session merges them onto `main` and
  restarts `:3001`.
2. `authorRef` is intentionally NOT required (FAIRCommon `createdBy`→`author` legacy mapping covers the
  draft author). If the architect wants it required, that is a schema edit, not a bug.
