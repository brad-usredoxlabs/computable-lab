# Lane-1 architect decision request — `subject.revisionRef` / `subject.contentHash` undeclared in signature.schema.yaml

- **Task**: QMS-6B (integrated browser gate) — the campaign's last gate. Blocks SURFACES 5-10 and all three
  D6-D9 API probes. Newly surfaced by QMS-6B attempt 8 (VERDICT: fix) and independently reproduced by the
  orchestrator on the served candidate.
- **Class**: identical to the draft-copy defect your 2026-10-04 decision ruled **in-scope (Option B)** — a
  merged server contract writes a field the schema does not declare, and the leaf schema sets
  `additionalProperties`/`unevaluatedProperties: false`, so Ajv rejects every write.
- **Requested artifact (unique output path)**:
  `.hermes/plans/2026-10-04_lane1-signature-subject-revisionRef-decision.md`

## Evidence (orchestrator-verified, reproduced on the LIVE served candidate `cl/integration-1` HEAD `e4c76142`)

1. **Live reproduction** (my own call, `POST http://localhost:3092/api/signatures`, bearer token from a
   self-service `POST /auth/login` for `qms-admin` — no credential written anywhere):
   ```
   HTTP 422
   {"success":false,"error":"Validation failed","validation":{"valid":false,"errors":[
     {"path":"/subject","message":"Unknown property: revisionRef","keyword":"additionalProperties",
      "params":{"additionalProperty":"revisionRef"}},
     {"path":"/subject","message":"Unknown property: contentHash","keyword":"additionalProperties",
      "params":{"additionalProperty":"contentHash"}}]}}
   ```
   (Reauth passed first — `SignatureHandlers.ts:85-89` — so the 422 is genuinely the schema check, not auth.)
2. **The handler writes the fields** — `server/src/api/handlers/SignatureHandlers.ts:95`:
   `const signedRevision = { revisionRef: revisionRef(revision.recordId), contentHash: revision.payload.contentHash };`
   then `:120-126` spreads them into `subject` alongside `recordId`, optional `gitCommit`, `lifecycleId`,
   `targetState`.
   - `revisionRef(id)` (`server/src/revisions/RecordRevisionService.ts:36`) = `{kind:'record', type:'record-revision', id:'REV-…'}`
     — exactly the shape of `schema/core/datatypes/revision-ref.schema.yaml`.
   - `contentHash` (`RecordRevisionService.ts:23`) = a **sha256 hex** string (64 lowercase hex chars).
3. **The schema declares neither** — `schema/governance/signature.schema.yaml:50-60`:
   `subject: { type: object, additionalProperties: false, required: [recordId], properties: { recordId, gitCommit, lifecycleId, targetState } }`.
4. **Provenance** — `git log -- schema/governance/signature.schema.yaml` = only `56740422`; the integrity merge
   `81454a4e` touched `SignatureHandlers.ts` (+20) and did **not** touch the schema. Same shape as the
   draft-copy defect.
5. **Word of record NAMES the fields** — `docs/qms-manual-testing-cheatsheet.md:146`:
   "New signatures carry `subject.revisionRef` and `subject.contentHash`; `subject.gitCommit` is populated only
   after comparing the committed file bytes with the current source." So this is a missing **declaration**, not
   a design choice to remove the fields.
6. **Blast radius** — every SIG mint 422s, so: surface 5 passes only because reauth precedes validation;
   surfaces 6/7/8/9 and the 3 D6-D9 probes are unreachable; approved/effective can never be entered through the
   product; `POST /records` fallback is `403 SYSTEM_OWNED`. Reviewer receipt:
   `~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/api/probe-1-stale-signature.txt`.

## Options

- **(A) [recommended]** Declare, in `signature.schema.yaml` `subject.properties`, the two fields the merged
  handler writes:
  - `revisionRef: { $ref: ../core/datatypes/revision-ref.schema.yaml }` (resolve the relative path correctly
    from `schema/governance/`),
  - `contentHash: { type: string, pattern: '^[a-f0-9]{64}$' }`,
  keep `gitCommit`, `lifecycleId`, `targetState` as-is; keep `additionalProperties: false`. Mirrors your
  draft-copy Option B ruling; data-only; no product code.
- **(B)** Drop `additionalProperties: false` on `subject` — loosens the contract (the draft-copy ruling
  explicitly rejected loosening/skipValidation-style escapes).
- **(C)** Change `SignatureHandlers.ts` to stop writing the fields — rejected by the word of record (cheatsheet
  :146 names them as the signed-content evidence), and it is product code, outside this lane's authority.

## Exact uncertainty for you to resolve

Is (A) the correct shape — in particular, is `contentHash` `^[a-f0-9]{64}$` (raw sha256 hex, per
`RecordRevisionService.ts:23`) rather than a `sha256:`-prefixed form, and does `subject` stay
`additionalProperties: false`? Confirm (A) is an in-scope lane-1 repair (no Brad amendment), as you ruled for
the draft-copy case.

## Resume condition

A written decision at `.hermes/plans/2026-10-04_lane1-signature-subject-revisionRef-decision.md`. The
orchestrator then writes the RED-first fix spec (real AjvValidator/RecordStoreImpl path, mirroring QMS-6C) and
dispatches ONE cl-senior.

## Not in this request (routed separately, do not decide here)

- Draft-copy `derivedFromRevisionRef` (defect 2) — already in flight as **QMS-6C** under your prior Option-B ruling.
- Editor write-back (surface 1 save → 409 LIFECYCLE_IMMUTABLE / 422) — EDITOR-2 class.
- Different-person denial message not distinct (`lifecycleMiddleware.ts:66`) — QMS-6A class.
