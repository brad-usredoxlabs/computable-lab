# Architect decision — `derivedFromRevisionRef` declaration site (lane 1, QMS-6B blocker)

- Date: 2026-10-04 · Lane: 1 (campaign light-qms-records-browser) · Trunk: `cl/integration-1` @ `e4c76142`
- Responds to: `.hermes/plans/2026-10-04_lane1-draftcopy-derivedFromRevisionRef-decision-request.md`
- Decision authority: declarative-model choice (WHERE a property is declared). No new intent, no
  acceptance-criteria change → no Brad amendment required (see §3).

## 1. Decision: **Option B — declare `derivedFromRevisionRef` per-kind**

Declared in exactly the two draft-copyable leaf schemas
(`schema/lab/controlled-document.schema.yaml`, `schema/workflow/protocol.schema.yaml`), typed as
`$ref: ./datatypes/revision-ref.schema.yaml`.

Rationale: "things that can be data should be data" cuts both ways — the *intent* that
`common.schema.yaml:5` states in its own description ("intentionally does NOT include provenance")
is itself declared data, and Option A would violate a rule the schema file itself declares. Decisive
corroborating fact I verified: Option A's stated pro ("any future draft-copyable kind gets lineage
for free") is hypothetical — `RecordHandlers.ts:176` already hardcodes the draft-copyable kind set
(`['protocol','controlled-document']`), so a future kind needs a code change anyway; per-kind
schema declaration is exactly parallel to the handler's per-kind opt-in, and nothing drifts
silently. Narrow blast radius matters against the ~125-file red baseline. The draft-copy lineage
field is owned by the revision contract at the kind boundary, not by the generic FAIR mixin.

(Option C remains rejected by word of record — `docs/qms-manual-testing-cheatsheet.md:162` names
the payload field explicitly.)

## 2. The exact declarative edit (data only — no product code changes)

**File 1: `schema/lab/controlled-document.schema.yaml`** — add inside the existing top-level
`properties:` mapping (alongside `kind`/`id`/`title`/…):

```yaml
  derivedFromRevisionRef:
    $ref: "./datatypes/revision-ref.schema.yaml"
    readOnly: true
    description: >
      Lineage back to the captured revision this draft was derived from
      (draft-copy only; set once by the server at derivation, never edited).
```

**File 2: `schema/workflow/protocol.schema.yaml`** — the identical property block inside its
top-level `properties:` mapping:

```yaml
  derivedFromRevisionRef:
    $ref: "./datatypes/revision-ref.schema.yaml"
    readOnly: true
    description: >
      Lineage back to the captured revision this draft was derived from
      (draft-copy only; set once by the server at derivation, never edited).
```

Mechanics verified:
- `$ref` resolution works from both leaves: both files' `$id`s are flattened under
  `https://computable-lab.com/schema/computable-lab/`, so `./datatypes/revision-ref.schema.yaml`
  resolves to that datatype's exact `$id`. This is the established convention (`schema/knowledge/*`
  already `$ref` `./datatypes/ref.schema.yaml` the same way).
- `unevaluatedProperties: false` is satisfied: a local `properties` entry counts as evaluated,
  so no change to the `allOf: FAIRCommon` structure or the leaf `unevaluatedProperties` flag is
  needed.
- Shape matches what `revisionRef()` emits (`RecordRevisionService.ts:36`:
  `{kind:'record', type:'record-revision', id:'REV-…'}`) and what
  `schema/core/datatypes/revision-ref.schema.yaml` requires (`required: [kind,type,id]`,
  `additionalProperties: false`, id pattern `^REV-[A-F0-9]+$`). Do NOT loosen the datatype.
- Optional (not in `required:`): only draft copies carry it; normal creates must stay valid.
- No changes to `common.schema.yaml`, no changes to any TypeScript.

## 3. Scope ruling

**In-scope lane-1 repair. No Brad amendment.** The field, the endpoint, and the payload contract
are already merged and already word-of-record (cheatsheet:162; delta doc
`~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md:88`; merged revision contract
`81454a4e`). The schema simply never caught up with the merged code; this repairs the existing
contract rather than adding intent.

## 4. Acceptance checks for the fix worker

1. **Red-first test against the REAL validation path**: a server test that builds a
   `RecordStoreImpl` with the real `AjvValidator` (schema registry loaded from `schema/`) — NOT
   the in-memory store used by `RevisionRoutes.test.ts:30` — and asserts a controlled-document
   (and a protocol) payload carrying `derivedFromRevisionRef: {kind:'record',
   type:'record-revision', id:'REV-…'}` passes `store.validate` / `store.create`. The test MUST
   fail on the pre-fix build (commit it red before the schema edit, or demonstrate the red in the
   handoff). It must NOT be "fixed" by passing `skipValidation` to `store.create` — that is the
   exact anti-pattern that let this defect through.
2. **Runtime**: restart lane stack (`:3092`/`:5192`, lane data
   `/home/brad/.computable-lab-lane1`); `POST /api/records/DOC-DEMO-SOP/draft-copy` as
   `x-user-id: USR-QMS-ADMIN` → 200; new draft payload carries `derivedFromRevisionRef` of type
   `record-revision`, `state: 'draft'`, fresh `createdBy`, and NO
   `authorRef`/`reviewerRef`/`approverRef`/`signatureRefs` (the strip list at
   `RecordHandlers.ts:181` — assert it, don't trust it). Same exercise for a protocol record.
3. **No schema-wide regression**: `npm run test:run -w server` failing-file set UNCHANGED vs the
   recorded baseline (~125 files red at trunk); no new failures in schema-validation suites for
   any kind that mixes in `FAIRCommon` (B must not touch them — if other kinds' tests move, the
   edit leaked scope).
4. **Types**: `npx tsc --noEmit -p server/tsconfig.json` shows no NEW errors (baseline ~33).
5. Then QMS-6B may re-run SURFACE 10 (D6 row) as a fresh reviewer attempt.

## 5. Stop-boundaries and risks the orchestrator must carry

- **No product-code change is authorized by this decision.** If the red-first test still fails
  after the two schema edits, STOP and re-raise — do not reach into `RecordHandlers.ts` or
  `RecordStoreImpl.ts`, and never into `skipValidation`.
- **Risk — write-only lineage**: `derivedFromRevisionRef` currently has no reader in
  `server/src`/`app/src` outside tests/fixtures. This decision makes the WORD write land;
  surfacing lineage in the UI is NOT part of this repair. Do not scope-creep a viewer into the fix.
- **Risk — live reviewer**: QMS-6B attempt 8 is running against the pre-fix candidate and will
  verdict `fix`/`BLOCKED` on this row; its receipt
  (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/…probe-0-copy-setup.txt`) stays as evidence.
  The gate verdict must come from a NEW attempt against the post-fix build, not from salvaging 8.
- **Risk — `readOnly: true` is documentation here** (Ajv does not enforce readOnly by default);
  the server remains the only writer via `draftCopy`. Fine, but do not add client code that
  relies on readOnly being enforced.
- **Risk — future kinds**: adding a third draft-copyable kind requires BOTH the
  `RecordHandlers.ts:176` whitelist AND this property in that kind's schema. When that day comes,
  that's a one-line-per-site repair; note it in the handoff so it isn't rediscovered as a defect.
- Baselines (~125 red test files, ~33 tsc errors) are trunk facts, not targets; the worker
  re-measures at the fix's base commit and reports the delta.

DECISION: B — declare `derivedFromRevisionRef` per-kind in `controlled-document.schema.yaml` and `protocol.schema.yaml` as `$ref: ./datatypes/revision-ref.schema.yaml` (read-only, optional); honours `common.schema.yaml:5`'s stated no-provenance intent, mirrors the handler's per-kind draft-copy whitelist, in-scope lane-1 repair, no Brad amendment.
