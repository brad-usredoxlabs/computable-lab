# L2-DOC-INTAKE-1 / unit dupdoc — implementation report

Worktree: /tmp/wt-L2-DOC-INTAKE-1-dupdoc
Branch: cl/lane2-docintake-dupdoc-2325
Base: a5ebf79191f50a02951c0991e0adbd3270afb2f1
Scope: durability/dedup, DEDUP half only. Files touched: exactly the 2 owned files.

## Decision

The identity check lives in `attachVendorDocumentExtraction` only. Key =
`document.file_ref.sha256` (where `buildVendorDocumentExtraction` already puts
it), read through a new private helper `documentFileSha256(document)` that
returns `undefined` for a missing/odd `file_ref`. When the incoming key is
present AND a stored document carries the equal key, the function returns the
STORED document object (plus optional `duplicateOf`) before `nextPayload` is
built, so no `store.update` happens, `updatedAt` does not move and no
`composition_drafts` entry is created. No sha256 on either side => today's
append path, unchanged.

`VendorDocumentExtractionResult` gained `duplicateOf?: string`, set only via
`...(duplicateId ? { duplicateOf: duplicateId } : {})` — absent, never
`undefined` (exactOptionalPropertyTypes). No schema/lint/app/route edit.

## Changed code (server/src/vendor-documents/service.ts)

- L51-62: `duplicateOf?: string` added to `VendorDocumentExtractionResult`
  (documented; absent on real attach).
- L74-84: helper `documentFileSha256(document: unknown): string | undefined`
  (defensive read of `file_ref.sha256`).
- L456-472: dedup branch in `attachVendorDocumentExtraction`; `storedDocuments`
  is now computed once (L457) and reused for the append at L478-480 instead of
  re-reading `Array.isArray(payload.documents)`.

## Tests (server/src/vendor-documents/service.test.ts, +90 lines)

New `describe('attach vendor document extraction is idempotent on file sha256')`
with a fake `RecordStore` exposing only `get`/`update`:
1. same bytes (`acme-hepes-formulation.txt`) as stored doc `VDOC-EXISTING` with
   the same sha256 => returned `document.id === 'VDOC-EXISTING'`,
   `duplicateOf === 'VDOC-EXISTING'`, `store.update` NOT called.
2. different bytes => new id, `duplicateOf` absent, `update` called once,
   written `documents.length === 2` (idempotency is not "one doc per product").
3. manual uploads (no sha256 on either side) still append (length 2).

The 17 pre-existing tests are UNMODIFIED and still green.

## RED before the fix (raw)

```
 ❯ src/vendor-documents/service.test.ts  (20 tests | 1 failed) 117ms
   ❯ ... > reuses the stored document when the same file bytes are attached again
     → expected { id: 'VDOC-MWE6HV1T-A4C461', …(4) } to match object { id: 'VDOC-EXISTING', …(1) }
-   "id": "VDOC-EXISTING",
+   "id": "VDOC-MWE6HV1T-A4C461",
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

Note: only case 1 can be red pre-fix — cases 2 and 3 are guards that must stay
green (they assert the append path is preserved). They were green before and
after, by design.

## GREEN after the fix (raw)

```
 RUN  v1.6.1 /tmp/wt-L2-DOC-INTAKE-1-dupdoc/server
 ✓ src/vendor-documents/service.test.ts  (20 tests) 68ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
   Duration  835ms
```

## Typecheck (raw)

`cd server && npx tsc --noEmit` → no output, exit 0 (0 errors; run exactly once,
per brief).

## MUTATION PROBE (non-vacuous pin)

Deleted ONLY the dedup branch — service.ts L462-472 (`incomingSha`,
`duplicate`, `if (duplicate) { … return … }`) replaced by a single comment.
Raw mutation run:

```
 ❯ src/vendor-documents/service.test.ts  (20 tests | 1 failed)
   ❯ ... > reuses the stored document when the same file bytes are attached again
     → expected { id: 'VDOC-MWE6IMRD-A4C461', …(4) } to match object { id: 'VDOC-EXISTING', …(1) }
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

Restored from a scratch copy; verified `diff -q` against the fixed file (clean),
no `MUTATION PROBE` string left, and green re-run (20/20). The mutation touched
only service.ts L462-472; `git status` after restore listed only the two owned
paths as modified.

## Exit state

```
$ git -c core.fileMode=false status --short
(clean)
$ git log --oneline -3
71a2be3a fix(vendor-documents): refuse duplicate document append on vendor product (L2-DOC-INTAKE-1 dupdoc)
7e20f0c9 test(vendor-documents): pin sha256-idempotent attach (RED for L2-DOC-INTAKE-1 dupdoc)
a5ebf791 docs(plan): lane-2 tick l2t1805 handoff ...
```

Environment note: `server/node_modules` did not exist in this fresh worktree; a
gitignored symlink to the lane's shared install
(`/home/brad/git/cl-integration-2/server/node_modules`) was used for vitest/tsc.
No install was run; no dependency file changed; the symlink is ignored by
`.gitignore:5` and not part of the commit.

## Notes for the gate / orchestrator

- The API handler (`VendorDocumentHandlers.ts`, PROHIBITED here) returns
  `{success, vendorProductId, document, draft?, drafts?}` and therefore does NOT
  forward `duplicateOf`. AC1 is graded from the record read-back, so this is
  compliant; if a later item wants the browser to show "already attached", the
  handler needs a 1-line pass-through — out of this unit's scope.
- On a duplicate attach the second tab's response carries the EXISTING document
  and no `draft`; no `composition_drafts` entry is written, so draft counts stay
  stable (AC3).
- YAML unchanged, so no lane-stack reload is needed for behavioural verification
  beyond the ordinary server restart the gate already does.

Next actions (owner: L2 orchestrator): dispatch browser gate re-run for g3 LEG 1
(AC1/AC2/AC3) against this branch; nothing else is blocked.

L2-DOC-INTAKE-1 UNIT dupdoc DONE 71a2be3afed131e92e3d82da26d0d0f4ee1bb5f0
