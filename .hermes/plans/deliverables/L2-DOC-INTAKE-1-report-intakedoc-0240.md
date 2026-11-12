# L2-DOC-INTAKE-1 — unit intakedoc (lane 2)

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-intakedoc-lane2
Branch: cl/lane2-docintake-intakedoc-0240
Base: 878483217e2a321c99ad0faf20fe8b9c03928ab2

## Scope

Add `intakeDocument` (acquisition half) to `server/src/ingestion/documentIntake.ts`:
store bytes via injected structural blob-store seam, then extract per-page text from
the in-hand buffer via a scratch temp file (removed in `finally`), returning the
store's own identity + the existing `DocumentIntakeResult`, converting every failure
into a typed diagnostic (never throws).

Owned files: documentIntake.ts, documentIntake.test.ts, this report.

## Decisions

- `DocumentIntakeWithBlobResult = DocumentIntakeResult & { storedPath; sha256; sizeBytes; drefId }`
  (intersection — `pages`/`diagnostics`/`toolsAvailable` keep exact meaning).
- `DocumentBlobStoreLike` structural seam: `save({ artifactId; fileName?; contentBase64 })`
  → `ArtifactBlobStoreResult`-shaped. Production can pass the server `ArtifactBlobStore`
  unchanged; tests pass a fake with no `StorageService`.
- Store FIRST (one save per call), then temp file named from `extname(fileName)` under
  `mkdtemp(join(tmpdir(), 'cl-doc-intake-'))`; `rm` in `finally`. Returned sha256/sizeBytes/
  drefId are the STORE's values, never recomputed.
- New code `STORAGE_FAILED: 'DOCUMENT_INTAKE_STORAGE_FAILED'` appended after the existing two;
  message = the caught error's own text (so MISSING_CONFIG surfaces verbatim).
- Store failure → `{ pages: [], diagnostics: [STORAGE_FAILED], toolsAvailable: {},
  storedPath: '', sha256: '', sizeBytes: 0, drefId: '' }` (never silent-empty success).
- Extensionless/absent fileName: temp file is written with no extension and the existing
  format gate returns its typed UNSUPPORTED_FORMAT diagnostic — no hardcoded `.pdf`, no throw.
  (No mediaType is available on this seam to infer a format; guessing would fabricate.)

## Progress / evidence

- [x] RED test added (`describe('intakeDocument')`, 3 tests), commit 37541bcd.
  Raw failure at base:
      Tests  3 failed | 10 passed (13)
      TypeError: intakeDocument is not a function   (x3)
- [x] implementation: `DocumentBlobIdentity`, `DocumentIntakeWithBlobResult`,
  `DocumentIntakeBlobStore`, `DocumentIntakeArgs`, `intakeDocument` appended; only
  additivity in the diff (98 insertions, 1 deletion = the import line).
- [x] mutation probe: `throw err; // PROBE ONLY` in the store catch →
      FAIL  intakeDocument > resolves with a typed STORAGE_FAILED diagnostic …
      Error: MISSING_CONFIG: no storage device configured
      Tests  1 failed | 12 passed (13)
  Probe reverted (`grep -c 'PROBE ONLY'` → 0); suite green again.
- [x] targeted vitest (after revert):
      ✓ src/ingestion/documentIntake.test.ts  (13 tests) 56ms
      Test Files  1 passed (1) / Tests  13 passed (13)
      Duration 727ms
- [x] tsc --noEmit: EXIT=0, 0 error lines.
- [ ] commit + clean tree

## Environment note

The launcher promise of `node_modules` was NOT met for this worktree (no
`node_modules`, no `server/node_modules`; `npx vitest` → "vitest: command not
found"). Resolved without installing: symlinked `node_modules` and
`server/node_modules` to the sibling worktree /home/brad/cl-wt/L2-DOCINTAKE-u4wire-lane2
(same dependency tree); both paths are gitignored, tree stays clean.

## Verification results (raw)

    $ cd server && npx vitest run src/ingestion/documentIntake.test.ts
    ✓ src/ingestion/documentIntake.test.ts  (13 tests) 56ms
    Test Files  1 passed (1)
         Tests  13 passed (13)

    $ cd server && npx tsc --noEmit
    EXIT=0   (0 error lines)

## Verification commands

```
cd server && npx vitest run src/ingestion/documentIntake.test.ts
cd server && npx tsc --noEmit
git -c core.fileMode=false status --short
```
