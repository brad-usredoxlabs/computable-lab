# Architect decision request — draft-copy is runtime-broken: `derivedFromRevisionRef` is undeclared in schema

- Lane: 1 · Campaign: light-qms-records-browser · Raised by: orchestrator tick 20261004T2000
- Task: QMS-6B (integrated browser gate) — blocks SURFACE 10 (locked doc → draft-copy) and the D6 row.
- Priority: blocks the campaign's last gate. QMS-7's final lap gates on QMS-6B accept.
- Decision artifact requested at:
  `/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-draftcopy-derivedFromRevisionRef-decision.md`

## The defect (orchestrator-verified, reproducible on the served candidate)

`POST /api/records/DOC-DEMO-SOP/draft-copy` (as `x-user-id: USR-QMS-ADMIN`) returns:

```
HTTP 422
{"error":"Validation failed","validation":{"valid":false,"errors":[
  {"path":"/","message":"must NOT have unevaluated properties","keyword":"unevaluatedProperties",
   "params":{"unevaluatedProperty":"derivedFromRevisionRef"}}]}}
```

Same class of failure for the other draft-copyable kind: `protocol.schema.yaml:8` also sets
`unevaluatedProperties: false`.

## Root cause (path:line evidence)

- `server/src/api/handlers/RecordHandlers.ts:180` — `draftCopy` builds the copy payload with
  `derivedFromRevisionRef: revisionRef(revision.recordId)`.
- `server/src/revisions/RecordRevisionService.ts:36` — `revisionRef()` returns
  `{kind:'record', type:'record-revision', id}` (matches `schema/core/datatypes/revision-ref.schema.yaml`).
- `derivedFromRevisionRef` is declared NOWHERE in `schema/` (`grep -rn derivedFromRevisionRef schema/` = 0 hits).
- `schema/lab/controlled-document.schema.yaml:13` = `unevaluatedProperties: false`;
  `schema/workflow/protocol.schema.yaml:8` = `unevaluatedProperties: false`.
- `server/src/store/RecordStoreImpl.ts:481-489` — `createUnlocked` validates the envelope against the
  schema unless `skipValidation`; `draftCopy` passes no `skipValidation` → the undeclared property is rejected → 422.
- `derivedFromRevisionRef` has exactly ONE code reference in `server/src`+`app/src` (the injector above);
  nothing reads it. So the lineage link is currently write-only AND the write cannot land.

## Why this is a defect, not a design choice

- Word of record names the field: `docs/qms-manual-testing-cheatsheet.md:162` — a draft copy is
  "a new draft with `derivedFromRevisionRef`, fresh session authorship, and no inherited
  reviewer/approver/signatureRefs". Delta doc `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md:88`
  makes draft-copy the only path to edit approved content (D6). The merged revision contract is `81454a4e`.
- QMS-6A's audit read the CODE (`RecordHandlers.ts:180-181`) and asserted draft-copy sets the field —
  it never exercised `store.create`, so the runtime rejection was never seen. QMS-6A's new tests are
  frontend (mock the API) and `server/src/revisions/RevisionRoutes.test.ts` uses an in-memory store that
  does not run the real AJV validation.

## DECISION REQUESTED (one of A/B; C is recorded as rejected-by-word-of-record)

The only open question is WHERE the property is declared; that is a declarative-model choice, so it is yours.

- **A — declare it once in `$defs/FAIRCommon`** (`schema/core/common.schema.yaml`), typed as
  `$ref: ./datatypes/revision-ref.schema.yaml`. Pro: any record kind a future `draftCopy` supports gets
  lineage for free; one ownership representation. Con: `common.schema.yaml:5` states the file
  "intentionally does NOT include provenance (use your event system + evidence records)" — A contradicts
  that stated intent (though `FAIRCommon` already declares `createdBy` at `:48`).
- **B — declare it per-kind** in `schema/workflow/protocol.schema.yaml` and
  `schema/lab/controlled-document.schema.yaml` only. Pro: honours the leaf-schema/provenance intent;
  narrow blast radius. Con: every future draft-copyable kind must remember to declare it.
- **C — strip `derivedFromRevisionRef` in code** and record lineage elsewhere (e.g. `meta`). Rejected by
  word of record (cheatsheet:162 names the payload field as the draft's lineage).

Also please state whether the chosen fix is an in-scope lane-1 repair under the existing tasks
(orchestrator's reading: YES — it repairs the already-merged, already-approved revision contract, not new
scope) or requires a Brad scope amendment.

## Acceptance the fix must satisfy (for the follow-on worker)

- `POST /records/DOC-DEMO-SOP/draft-copy` → 200; the new draft's payload carries
  `derivedFromRevisionRef` of type `record-revision`, `state: draft`, fresh `createdBy`, and
  NO `authorRef`/`reviewerRef`/`approverRef`/`signatureRefs`.
- Same for a protocol record.
- A red-first test that exercises the REAL `RecordStoreImpl` validation path (not the in-memory store):
  the pre-fix build must fail it.
- No schema-wide regression: `npm run test:run -w server` failing-file set unchanged (baseline ~125 files
  red at trunk) and `npx tsc --noEmit -p server/tsconfig.json` shows no NEW errors (baseline ~33).
- Lane stack restart; re-run the draft-copy call; then QMS-6B may re-run surface 10.

## Context the architect should know

- `cl/integration-1` HEAD = `e4c76142`; served frontend `:5192`, backend `:3092`, lane data
  `/home/brad/.computable-lab-lane1`.
- A live QMS-6B reviewer (attempt 8) is running against this candidate right now and has already hit this
  422 on its own probe (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/api/probe-0-copy-setup.txt`), so its
  verdict will be `fix` or `BLOCKED` on this row unless the defect is repaired.
- Do NOT have the architect edit product code. Return the decision; the orchestrator will write the fix spec.
