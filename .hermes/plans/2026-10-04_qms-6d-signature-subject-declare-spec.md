# QMS-6D spec — declare `subject.revisionRef` + `subject.contentHash` in signature.schema.yaml
# (repair `POST /api/signatures` 422 — the signature-mint blocker)

- Lane: 1 · Campaign: light-qms-records-browser · Author: orchestrator tick 20261004T2105
- Base: branch `cl/integration-1` @ `e4c76142` · Worker worktree: `/mnt/vast/home/brad/git/wt/qms-6d-lane1-20261004T2115`
- Worker branch: `wt/qms-6d-lane1-20261004T2115`
- AUTHORITY: architect decision at
  `/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-signature-subject-revisionRef-decision.md`
  (READ IT END TO END FIRST — it is the authority for the exact edit shape and carries the stop-boundaries).
  Request + evidence: `.hermes/plans/2026-10-04_lane1-signature-subject-revisionRef-decision-request.md`.

## Why

`POST /api/signatures` returns **HTTP 422** for EVERY mint (orchestrator reproduced on the served candidate):

```
{"success":false,"error":"Validation failed","validation":{"valid":false,"errors":[
  {"path":"/subject","message":"Unknown property: revisionRef","keyword":"additionalProperties",
   "params":{"additionalProperty":"revisionRef"}},
  {"path":"/subject","message":"Unknown property: contentHash","keyword":"additionalProperties",
   "params":{"additionalProperty":"contentHash"}}]}}
```

`server/src/api/handlers/SignatureHandlers.ts:95` builds `{revisionRef, contentHash}` and `:120-126` spreads it
into `subject`; `schema/governance/signature.schema.yaml:50-60` declares `subject.properties` = recordId,
gitCommit, lifecycleId, targetState with `additionalProperties: false`. The integrity merge `81454a4e` changed the
handler and did not update the schema (schema last touched `56740422`). Word of record
(`docs/qms-manual-testing-cheatsheet.md:146`) NAMES both fields → this is a **missing declaration**, not a design
choice. Blast radius: every SIG mint 422s → QMS-6B surfaces 6/7/8/9 and all three D6-D9 probes are unreachable.

## Deliverable (data only — NO product code)

Apply EXACTLY the edit the architect decision §2 specifies to
`schema/governance/signature.schema.yaml`, inside `subject.properties` (keep `additionalProperties: false`).
Placeholder (confirm/override against the decision before editing):

```yaml
      revisionRef:
        $ref: "./datatypes/revision-ref.schema.yaml"
      contentHash:
        type: string
        pattern: "^[a-f0-9]{64}$"
```

**Use this EXACT form.** The architect VERIFIED (decision §2) that a file-relative
`../core/datatypes/revision-ref.schema.yaml` **fails Ajv compilation** (refs resolve against each schema's
absolute `$id`, not the file path) — `./datatypes/…` is the correct `$id`-relative form and the established
cross-directory convention (`schema/services/request.schema.yaml:73`). Do not improvise a different `$ref` form;
if your RED probe contradicts the compiled result, STOP and report.

- `revisionRef` matches `schema/core/datatypes/revision-ref.schema.yaml`
  (`{kind:'record', type:'record-revision', id:'REV-…'}`; see `RecordRevisionService.ts:36`).
- `contentHash` is a raw sha256 hex (`RecordRevisionService.ts:23`).
- Keep both OPTIONAL (do NOT add to `required:`). Do NOT touch `gitCommit`/`lifecycleId`/`targetState`.
  Do NOT loosen the schema (`additionalProperties: false` stays). Do NOT touch any TypeScript. Do NOT pass
  `skipValidation`. Do NOT touch `common.schema.yaml` or `RecordRevisionService.ts`.

## Tests (RED FIRST — load-bearing)

Add/extend a server test that exercises the **REAL** validation path (the real `AjvValidator` whose registry loads
from `schema/`, as `server/src/schema/governanceSchemas.test.ts:22-34` does) — NOT an in-memory store that skips
AJV (which is why this passed two gates). **The architect's decision §5.2 specifies the assertions** — extend
`governanceSchemas.test.ts` (its `:66-75` only exercises the legacy shape):
- ACCEPT a `signature` payload whose `subject` carries
  `revisionRef: {kind:'record', type:'record-revision', id:'REV-<UPPERCASE-HEX>'}` + a 64-lowercase-hex
  `contentHash` (the handler's exact shape) — zero errors;
- REJECT a `sha256:`-prefixed `contentHash`; REJECT a lowercase `REV-` id (the datatype's `^REV-[A-F0-9]+$` does
  this — do NOT restate the pattern inline); KEEP rejecting unknown `subject` properties;
- ACCEPT the legacy minimal subject `{recordId, gitCommit}` (no new field is `required`).
Commit the test RED against the un-edited schema FIRST (run it, capture the failure), then apply the edit and show
it green. Report both outputs verbatim. Do NOT "fix" red by skipping validation.

## Acceptance

1. Red-first real-validation-path test: fails pre-edit, passes post-edit (evidence in the report).
2. Runtime: `POST /api/signatures` → **200** with a 64-hex `subject.contentHash` and a `subject.revisionRef`
   of type `record-revision`; and the previously-blocked body no longer 422s.
   **[ORCHESTRATOR ADAPTATION — MANDATORY] The shared lane stack `:3092`/`:5192` is LIVE and other lane work may
   depend on it. You MUST NOT restart, stop, or write through it, and MUST NOT write into
   `/home/brad/.computable-lab-lane1` or `/home/brad/.computable-lab`. Do the runtime check on your OWN backend
   on a PRIVATE port (e.g. `3192`) against a PRIVATE copy of the lane data dir
   (`cp -a /home/brad/.computable-lab-lane1 /tmp/qms6d-lane1-data`). Never touch `:3001`/`:5174`.**
3. No schema-wide regression: `npm run test:run -w server` — failing-FILE set UNCHANGED vs your re-measured base.
4. Types: `npx tsc --noEmit -p server/tsconfig.json` — no NEW errors (baseline ~33; report delta).
5. Commit on your branch when green. Do NOT merge. Do NOT edit the task list.

## Files you own

`schema/governance/signature.schema.yaml` and one new/edited server test under `server/src/` (cite its path).

## Report — write EXACTLY this path (do NOT write the canonical name)

`/home/brad/.hermes/cl/lanes/1/qms-6d-report-20261004T2115.md`

Include: STATUS done|blocked · branch + commit sha · the RED output verbatim · the GREEN output verbatim · the
runtime 200 receipt (sanitized; NO credentials/tokens) · the regression delta (before/after failing-file sets and
tsc counts) · every consequential assumption · and, if blocked, the structured blocker fields
(blocker_kind/owner/portion/evidence/completed/independent_work/recommendation/resume_condition).

## Stop-boundaries

- No product-code change authorized. If the test still fails after the schema edit, **STOP and report** — do not
  reach into `SignatureHandlers.ts`, `RecordStoreImpl.ts`, or `skipValidation`.
- Do NOT change signature minting behavior or add UI.
- Note in the report whether any OTHER schema-invisible field the merged contract writes remains undeclared
  (a candidate third instance of this defect class) — report, do not fix.

END YOUR FINAL MESSAGE WITH: `STATUS: done` or `STATUS: blocked`, then the branch commit sha, the exact test
command + result counts, the tsc result, and (if blocked) the structured blocker fields.
