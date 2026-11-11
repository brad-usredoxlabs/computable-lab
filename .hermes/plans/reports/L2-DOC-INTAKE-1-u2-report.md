# L2-DOC-INTAKE-1 UNIT 2 Report

## Unit Intent
Move ingestion artifact bytes OFF the git worktree. ArtifactBlobStore writes through the configured storage device's provider and every write yields a data-reference record.

## Changed Files
1. `server/src/ingestion/ArtifactBlobStore.ts` — Rewritten. New `ArtifactBlobStore` constructor takes `(provider, deviceId, prefix, recorder)`. `save()` writes via `provider.write()` then calls the recorder to create a data-reference record. Legacy `LegacyArtifactBlobStore` kept for reading pre-existing on-disk blobs. Exported `ArtifactBlobStoreRecorder` interface and `createArtifactBlobStoreRecorder(store)` factory.
2. `server/src/ingestion/ArtifactBlobStore.test.ts` — NEW. 11 tests covering: writes to provider not filesystem, device-relative storedPath, data-reference record creation, typed MISSING_CONFIG diagnostic, no silent filesystem fallback, loadBase64, safeName sanitization, LegacyArtifactBlobStore backward compat, recorder optional-field safety, sequential DREF IDs.
3. `server/src/server.ts` — Rewired the ONE construction site at :1014 to build `ArtifactBlobStore` from `ctx.storageService.getProvider(ctx.storageService.defaultDeviceId())` with `createArtifactBlobStoreRecorder(ctx.store)`.
4. `server/src/sequences/oligoOrder.ts` — Rewired the ONE inline construction at :100 to the same storage-backed form.

## RED Summary (from test file)
- `save()` against a fake StorageProvider writes to that provider and NOT to the filesystem — asserted via fake write calls and empty workspace dir
- The returned `storedPath` is device-relative (no leading `/`, no `..`, not absolute)
- A `data-reference` record is created with `storageDeviceId`, `path` = same relative path, `contentHash` == sha256, `sizeBytes` == byte length, non-empty `dataKind`
- With no configured device, `save()` throws the typed `MISSING_CONFIG` diagnostic and writes no bytes anywhere

## Mutation Probes
1. **Silent-fallback defect**: Added `try/catch` around `provider.write()` that falls back to `writeFile` into the worktree. Result: 2 tests failed — the "throws typed MISSING_CONFIG" and "no silent filesystem fallback" legs both resolved instead of rejecting. Reverted.
2. **Deleted data-reference creation**: Commented out the `recorder()` call in `save()`. Result: 1 test failed — "creates a data-reference record with correct fields" expected `createdEnvelopes.length` to be 1 but got 0. Reverted.

Both probes confirm the correct implementation catches the defects.

## Invariants Preserved
- `loadBase64` keeps working: reads from the provider instead of the filesystem. For new artifacts this is the same device-relative path returned by `save()`.
- `sha256`/`sizeBytes` return semantics unchanged.
- Pre-existing on-disk blobs: NOT migrated, NOT deleted. The `LegacyArtifactBlobStore` class preserves the old filesystem path for reading them.
- 12 pdfAcquisition tests and 6 dataReference tests stay green (18 passed).

## Verification Results
- `cd server && npx vitest run src/ingestion/ArtifactBlobStore.test.ts` → Test Files 1 passed (1), Tests 11 passed (11)
- `cd server && npx vitest run src/vendor-documents/pdfAcquisition.test.ts src/storage/dataReference.test.ts` → Test Files 2 passed (2), Tests 18 passed (18)
- `cd server && npx tsc --noEmit` → 1 pre-existing error (semver type definitions missing in environment, not from these changes)
- `git -c core.fileMode=false status --short` → clean

## Design Decisions
- **Recorder pattern over ctx.store direct dependency**: Keeps ArtifactBlobStore decoupled from the store implementation, enables clean testing with fakes, and mirrors the existing `artifactPromotion.ts` pattern where the caller supplies store access.
- **No hardcoded device ID**: Device ID comes from `ctx.storageService.defaultDeviceId()` at both construction sites.
- **No literal mount path**: `storedPath` is always device-relative (e.g., `ingestion-artifacts/ING-001/document.pdf`).

L2-DOC-INTAKE-1-u2 UNIT 2 DONE 8ffe234e5c3aa5e9691571c351261e7e67ba9b59
report_commit: 8ffe234e5c3aa5e9691571c351261e7e67ba9b59
