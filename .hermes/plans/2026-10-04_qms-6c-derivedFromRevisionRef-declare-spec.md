# QMS-6C spec — declare `derivedFromRevisionRef` per-kind (repair draft-copy runtime validation)

- Lane: 1 · Campaign: light-qms-records-browser · Author: orchestrator tick 20261004T2008
- Base: branch `cl/integration-1` @ `e4c76142` · Worktree: `/mnt/vast/home/brad/git/wt/qms-6c-lane1-20261004T2018`
- Worker branch: `wt/qms-6c-lane1-20261004T2018`
- AUTHORITY: architect decision **B** —
  `/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-draftcopy-derivedFromRevisionRef-decision.md`
  (read it end to end; it also carries the stop-boundaries). Scope ruling: **in-scope lane-1 repair, no Brad amendment.**
- Why: `POST /api/records/:id/draft-copy` returns **422** for both draft-copyable kinds because the merged
  revision contract injects `derivedFromRevisionRef` (`RecordHandlers.ts:180`) into a payload validated against
  a schema that declares it nowhere, with `unevaluatedProperties: false`. See
  `.hermes/plans/2026-10-04_lane1-draftcopy-derivedFromRevisionRef-decision-request.md` (evidence) — this is the
  missing declaration only.

## Deliverable (data only — NO product code)

Add this property to the top-level `properties:` mapping of BOTH leaf schemas (identical block):

```yaml
  derivedFromRevisionRef:
    $ref: "./datatypes/revision-ref.schema.yaml"
    readOnly: true
    description: >
      Lineage back to the captured revision this draft was derived from
      (draft-copy only; set once by the server at derivation, never edited).
```

- File 1: `schema/lab/controlled-document.schema.yaml` (top-level `properties:`; `unevaluatedProperties: false` is at :13).
- File 2: `schema/workflow/protocol.schema.yaml` (top-level `properties:`; `unevaluatedProperties: false` is at :8).
- Keep it OPTIONAL (do not add to `required:`). Do NOT loosen `schema/core/datatypes/revision-ref.schema.yaml`.
  Do NOT touch `common.schema.yaml`. Do NOT touch any TypeScript. Do NOT pass `skipValidation`.

## Tests (RED FIRST — this is the load-bearing requirement)

Add a server test that exercises the **REAL** validation path (construct `RecordStoreImpl` via
`createRecordStore(...)` with the real `AjvValidator` whose registry is loaded from `schema/`) — NOT the
in-memory store that `server/src/revisions/RevisionRoutes.test.ts` uses (that store skips AJV, which is exactly
why this defect passed two gates). Assert that a `controlled-document` payload and a `protocol` payload each
carrying `derivedFromRevisionRef: {kind:'record', type:'record-revision', id:'REV-<hex>'}`:
- pass `store.validate` / `store.create` (success), and
- are rejected when `derivedFromRevisionRef` is malformed (e.g. id not matching `^REV-[A-F0-9]+$`), so the
  declaration is actually typed, not merely permitted.
Commit the test RED against the un-edited schemas FIRST (run it, capture the failure), then apply the two
schema edits and show it green. Report both outputs. Do NOT "fix" red by skipping validation.

## Acceptance (verbatim from the architect decision §4; orchestrator's runtime adaptation in brackets)

1. Red-first real-validation-path test: fails pre-edit, passes post-edit (evidence in the report).
2. Runtime: `POST /api/records/<controlled-doc>/draft-copy` as `x-user-id: USR-QMS-ADMIN` → **200**; the new
   draft payload carries `derivedFromRevisionRef` of type `record-revision`, `state: 'draft'`, fresh `createdBy`,
   and ABSENT `authorRef`/`reviewerRef`/`approverRef`/`signatureRefs` (assert the strip list at
   `RecordHandlers.ts:181`). Same exercise for a protocol record.
   **[ORCHESTRATOR ADAPTATION — MANDATORY] The shared lane stack `:3092`/`:5192` is LIVE and a QMS-6B browser
   reviewer is running against it RIGHT NOW. You MUST NOT restart, stop, or write through it, and MUST NOT
   write into `/home/brad/.computable-lab-lane1` or `/home/brad/.computable-lab`. To do the runtime check,
   run your OWN backend on a PRIVATE port (e.g. `3192`) against a PRIVATE copy of the lane data dir
   (`cp -a /home/brad/.computable-lab-lane1 /tmp/qms6c-lane1-data` and point your process at it), or an
   equivalent private data dir you seed yourself via the API. Prove the 200 there. Never touch `:3001`/`:5174`.**
3. No schema-wide regression: `npm run test:run -w server` — the failing-FILE set is UNCHANGED vs the base
   commit's baseline (recorded as ~125 files red at trunk; RE-MEASURE at your base commit before editing and
   report the before/after file sets). If any kind-mixed-in-`FAIRCommon` schema test moves, your edit leaked scope.
4. Types: `npx tsc --noEmit -p server/tsconfig.json` — no NEW errors (baseline ~33; re-measure and report delta).
5. Commit on your branch when green. Do NOT merge. Do NOT edit the task list.

## Files you own

`schema/lab/controlled-document.schema.yaml`, `schema/workflow/protocol.schema.yaml`, and one new/edited
server test file under `server/src/` (your choice of locality; cite it in the report).

## Report — write EXACTLY this path (do NOT write the canonical name)

`/home/brad/.hermes/cl/lanes/1/qms-6c-report-20261004T2018.md`

Include: STATUS done|blocked · branch + commit sha · the RED output verbatim · the GREEN output verbatim ·
the runtime 200 receipt (sanitized; no credentials) · the regression delta (before/after failing-file sets and
tsc counts) · every consequential assumption · and, if blocked, the structured blocker fields
(blocker_kind/owner/portion/evidence/completed/independent_work/recommendation/resume_condition).

## Stop-boundaries (carry; from the decision §5)

- No product-code change is authorized. If the test still fails after the two schema edits, **STOP and report** —
  do not reach into `RecordHandlers.ts`, `RecordStoreImpl.ts`, or `skipValidation`.
- Do NOT add a UI/viewer for `derivedFromRevisionRef` (it is intentionally write-only in this repair).
- `readOnly: true` is documentation (Ajv does not enforce it) — do not build code that assumes enforcement.
- Note in the report that a 3rd draft-copyable kind needs BOTH the `RecordHandlers.ts:176` whitelist AND this
  property in that kind's schema.

END YOUR FINAL MESSAGE WITH: `STATUS: done` or `STATUS: blocked`, then the branch commit sha, the exact test
command + result counts, the tsc result, and (if blocked) the structured blocker fields.
