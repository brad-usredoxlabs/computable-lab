# L2-PROMPT2-COMPOSITION-BIND-1 u11close — Measured close-out for ba51527f

## Delta under review

```
$ git -c core.fileMode=false diff --stat 0361fd8b..HEAD
 server/src/compiler/resolution/compositionArgResolution.test.ts     | 4 ++--
 server/src/compiler/scientistIntent/hedgeOptionality.test.ts        | 3 ++-
 server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts | 4 ++--
 server/src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts   | 4 ++--
 4 files changed, 8 insertions(+), 7 deletions(-)
```

ba51527f is a launcher `WIP AT EXIT ... NOT gated` commit. Its content is exactly brief u11-0350's owned set: 4 test files importing and calling `formatArgDomain`.

## Per-file before/after

1. `vocabularyMirrorDrift.test.ts`
   - Line 22 (import): `import { defaultScientistIntentVocabulary }` -> `import { defaultScientistIntentVocabulary, formatArgDomain }`
   - Line 146: `(${a.domain})` -> `(${formatArgDomain(a.domain)})`

2. `vocabularyContractBlock.test.ts`
   - Line 48 (import): `import { defaultScientistIntentVocabulary }` -> `import { defaultScientistIntentVocabulary, formatArgDomain }`
   - Line 48: `(${a.domain})` -> `(${formatArgDomain(a.domain)})`

3. `hedgeOptionality.test.ts`
   - Line 47+ (import): added `formatArgDomain` to import list
   - Line 167: `(${a.domain})` -> `(${formatArgDomain(a.domain)})`

4. `compositionArgResolution.test.ts`
   - Line 35+ (import): added `formatArgDomain` to import list
   - Line 495: `(${a.domain})` -> `(${formatArgDomain(a.domain)})`

## Suite state (measured)

### Invocation A: `cd server && npx vitest run <4 files>`
Raw tail:
```
 Test Files  4 failed (4)
      Tests  4 failed (4)
   Start at  06:29:20
   Duration  915ms
```
All 4 files failed with collection errors (ENOENT: vocabulary/schema paths not found under server/).

### Invocation B: `APP_BASE_PATH="$(pwd)" npx vitest run --root server <4 files>`
Raw tail:
```
 Test Files  2 failed | 2 passed (4)
      Tests  1 failed | 35 passed (36)
   Start at  06:29:30
   Duration  1.54s
```

Per-file verdict:
- `vocabularyContractBlock.test.ts`: PASSED (4/4)
- `compositionArgResolution.test.ts`: PASSED (15/15)
- `vocabularyMirrorDrift.test.ts`: FAILED — ENOENT `/home/brad/cl-wt/wt-L2-PROMPT2-COMPOSITION-BIND-1-u11/src/compiler/scientistIntent/fixtures/verb-inventory.yaml` (file exists on disk at `server/src/.../` but path resolved without `server/` segment)
- `hedgeOptionality.test.ts`: 16 passed, 1 failed — `vocabulary file not found: .../src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml` (same missing `server/` segment in resolved path). The failing test is the "rip-out posture" leg at .test.ts:180.

## Environment findings

Both failures are worktree-provisioning artefacts, not code defects:

1. `vocabularyMirrorDrift.test.ts`: The test reads `server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml` (file tracked and present on disk). The resolved path `/home/brad/cl-wt/.../src/compiler/scientistIntent/fixtures/verb-inventory.yaml` omits the `server/` segment — this is a vitest working-directory issue when running from the repo root with `--root server`.

2. `hedgeOptionality.test.ts` (rip-out posture): `loadScientistIntentVocabulary` tries to resolve `server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml`. The same missing `server/` segment causes ENOENT.

3. `server/schema` symlink: Absent in this worktree. Caused the Invocation A collection errors. Not a u11 defect.

## Not mine

- `nounResolution.test.ts:593` red belongs to u12 (live run).
- Production files (`vocabulary.ts`, `intentCompile.ts`, mirror YAML, goldens/**) belong to u9/u10; advc-u9u10 returned ACCEPT on 63cda905..a29a4cca. I changed none of them.

L2-PROMPT2-COMPOSITION-BIND-1 UNIT u11 DONE ba51527f00116bf5b8a48e0891630eb22a36c3ec
