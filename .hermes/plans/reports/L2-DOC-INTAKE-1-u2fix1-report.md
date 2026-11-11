# L2-DOC-INTAKE-1 u2fix1 — coder report

Item: L2-DOC-INTAKE-1 / unit u2fix1 (advc cycle-1 defects 1-3). Lane 2,
worktree /home/brad/cl-wt/L2-DOC-INTAKE-1-u2-lane2, branch
cl/lane2-docintake-1-u2-l2t1545.

Start HEAD verified: 26c68ac94d503fec47cc8b590b8151afc98f7962 (as briefed).

Commits (never amended/reset/rebased):
- 4d4428d3  RED tests — lazy StorageService ctor, typed MISSING_CONFIG code, legacy read fall-through
- f39512d1  lazy storage-device resolution, legacy read fall-through, typed MISSING_CONFIG (code+test)

STATUS: all three in-scope defects (1, 2, 3) are implemented and verified.
One VERIFY item is NOT satisfiable within the approved scope — see "Blocked"
below. That is the only open item; no code work is outstanding.

## Changes (4 source/test files, ~120 lines)

1. `server/src/ingestion/ArtifactBlobStore.ts`
   - ctor is now `(storage: StorageService, prefix, recorder, legacy?)`; the
     provider/deviceId fields are gone. `resolveDevice()` calls
     `storage.defaultDeviceId()` + `getProvider()` only inside `save()` /
     `loadBase64()`. Construction can no longer throw. Single
     `defaultDeviceId()` call per save (the duplicated call is gone).
   - `save()` takes the provider from `resolveDevice()` before any write, so an
     unconfigured device still hard-fails typed (`StorageError`
     code MISSING_CONFIG) and writes nothing / records nothing.
   - `loadBase64()`: on `StorageError` with code NOT_FOUND *or* MISSING_CONFIG,
     and only when a legacy reader is wired, it reads the legacy on-disk copy.
     READ ONLY — no write happens on that path, and any other error
     (ACCESS_DENIED, IO, ...) is rethrown untouched. If the legacy copy is also
     absent, the ORIGINAL typed error is rethrown.
   - `LegacyArtifactBlobStore.loadBase64()` also accepts the pre-migration
     records-root-relative shape `.ingestion-artifacts/<id>/<file>` by retrying
     once under `<workspaceRoot>/<recordsDir>/.ingestion-artifacts/`. Old
     records either carry `records/.ingestion-artifacts/...` (direct hit) or the
     records-root-relative form (retry hit).
2. `server/src/server.ts` (~:1014 only): passes `ctx.storageService` and
   `new LegacyArtifactBlobStore(ctx.workspaceRoot, join(ctx.recordsDir,
   '.ingestion-artifacts'))`; no `defaultDeviceId()` at construction.
3. `server/src/sequences/oligoOrder.ts`: the ctor change forced this call site;
   same wiring (the brief names `server/src/ingestion/oligoOrder.ts`; the real
   path is `server/src/sequences/oligoOrder.ts`).
4. `server/src/ingestion/ArtifactBlobStore.test.ts`
   - MISSING_CONFIG leg rebuilt the way production is wired: store built from an
     EMPTY `StorageService` (no device); asserts construction does not throw,
     `save()` rejects with `code === 'MISSING_CONFIG'`, zero provider writes,
     zero data-reference records (previously: provider whose write() threw, and
     only `rejects.toThrow(StorageError)`).
   - Sibling "no silent fallback on write" leg kept green.
   - New legacy-read legs: (a) `.ingestion-artifacts/<id>/<file>` read through
     the fall-through, zero writes/records; (b) records-rooted shape; (c) no
     legacy copy -> original NOT_FOUND surfaces.

## Verification (raw)

Baseline at HEAD 26c68ac9, before the fix (eager construction):

    StorageError: no storage device configured for analysis artifact persistence
         58|       throw new StorageError('MISSING_CONFIG', 'no storage device conf…
    Serialized Error: { code: 'MISSING_CONFIG' }
     Test Files  1 failed (1)
          Tests   (6)          <- suite aborts in beforeAll, 0 tests run

After the fix:

    $ cd server && timeout 300 npx vitest run src/ingestion/ArtifactBlobStore.test.ts
    ✓ src/ingestion/ArtifactBlobStore.test.ts  (14 tests) 18ms
     Test Files  1 passed (1)
          Tests  14 passed (14)

    $ timeout 300 npx vitest run src/api/IngestionApi.test.ts
    FAIL  … > runs Cayman ingestion to review and publishes plate layouts
    Error: ENOENT: no such file or directory, open '…/tmp/flex/cayman-lipid-library.pdf'
    FAIL  … > runs Sigma formulation ingestion to review and publishes material specs and recipes
    AssertionError: expected 400 to be 200 // Object.is equality
    FAIL  … > runs spreadsheet-only Cayman ingestion and returns review bundles from persisted refs
    Error: ENOENT: no such file or directory, open '…/tmp/downloads/Cayman-stem-cell.xlsx'
     Test Files  1 failed (1)
          Tests  3 failed | 3 passed (6)

    $ npx tsc --noEmit   (last lines)
    npm notice run 'tsc' --noEmit
    error TS2688: Cannot find type definition file for 'semver'.
      The file is in the program because:
        Entry point for implicit type library 'semver'
    -> only the pre-existing environmental TS2688; no other diagnostics.

    $ git -c core.fileMode=false status --short   -> empty (clean)

Boot regression is gone: the suite now boots and the 3 non-fixture legs of
IngestionApi.test.ts pass. Before the fix all 6 legs (and every other suite
that calls createServer) aborted at construction.

## Mutation probes (both reverted; tree clean after each)

1. Eager resolve re-introduced in server.ts before construction:

       void ctx.storageService.getProvider(ctx.storageService.defaultDeviceId());
       StorageError: no storage device configured for analysis artifact persistence
       Serialized Error: { code: 'MISSING_CONFIG' }
        Test Files  1 failed (1)
             Tests   (6)
       -> RED, as required. `git checkout -- server/src/server.ts`; status clean.

2. NOT_FOUND fall-through removed from loadBase64():

        Tests  2 failed | 12 passed (14)
       Serialized Error: { code: 'NOT_FOUND' }   (both legacy-read legs)
       -> RED, as required. `git checkout -- server/src/ingestion/ArtifactBlobStore.ts`;
          status clean.

## Blocked / decision needed (the one open VERIFY item)

`src/api/IngestionApi.test.ts` cannot be green under the approved contract.

Evidence:
- Its config is `CONFIG_PATH=…/missing-config.yaml` -> `DEFAULT_APP_CONFIG`,
  which has `storageDevices: []` (server/src/config/types.ts:570).
- The "Sigma formulation" leg POSTs inline `contentBase64`;
  `IngestionService.addArtifact` (IngestionService.ts:179) then calls
  `blobStore.save(...)`.
- Defect 3 REQUIRES `save()` to reject typed MISSING_CONFIG with zero writes
  when no device is configured (reviewer bait: "write path must still hard-fail
  typed"; "read fall-through is NOT a write fallback"). It now does exactly
  that, and the API maps it to 400.
- Therefore a device-less deployment cannot persist ingestion bytes. This is a
  pre-existing consequence of unit u2's design, newly *visible* now that boot no
  longer throws; round-1 advc only observed the boot blocker.

The remaining two failures are environmental, not code: the external fixtures
`tmp/flex/cayman-lipid-library.pdf` and `tmp/downloads/Cayman-stem-cell.xlsx`
do not exist in this worktree (documented pre-existing as Cluster 5 in
`.hermes/plans/2026-08-03_test-failures-snapshot.md`). No copy exists anywhere
on this host.

Resolution options (all need an owner decision, none is inside this unit's
owned/prohibited scope):
  (a) NEW unit: give the default config a local storage device
      (`server/src/config/{types,loader}.ts` -> config/**, prohibited here);
  (b) NEW unit: let `IngestionService` record an extraction issue instead of
      failing when no device is configured (server/src/ingestion/**, but a
      design change, not this fix unit);
  (c) this unit's test file sets up a local device (server/src/api/** is
      prohibited);
  (d) relax defect 3 to allow a legacy write-through when no device is
      configured — directly contradicts the reviewer bait, and would need a
      fabricated `device_id` in the data-reference record, so NOT recommended.
Recommendation: (a), as its own item. It is a 2-line default-device addition and
makes every device-less suite and the out-of-the-box deployment work.

Resume condition: orchestrator picks (a)/(b) as a new item (my code needs no
change), or authorizes (d) explicitly — in that case the only edit is an
~8-line legacy write branch in `save()` plus one test.

## Notes

- Lazy stays lazy: `defaultDeviceId()` appears only in `resolveDevice()`, called
  from `save()`/`loadBase64()` — never at construction, in `server.ts` or in
  `oligoOrder.ts`.
- No explicit `undefined` optional fields emitted (exactOptionalPropertyTypes).
- Local env shim, NOT committed (gitignored): `server/schema -> ../schema`
  symlink needed to run vitest with cwd=server in this worktree.
- Scratch dir `/home/brad/.docintake-u2fix1-scratch/` removed at exit.
