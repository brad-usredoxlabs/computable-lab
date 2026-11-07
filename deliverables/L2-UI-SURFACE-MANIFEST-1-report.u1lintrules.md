# L2-UI-SURFACE-MANIFEST-1 Report - Unit u1lintrules

## STEP-0: Base Verification (PASSED)
- Both `config/ui/surfaces.yaml` and `schema/ui/surface-manifest.schema.yaml` exist
- Branch: `cl/lane2-ui-surface-manifest-1-u1lintrules`
- Base SHA: 17d68069

## RED-First Evidence (test fails without rule)
```
Error: ENOENT: no such file or directory, open 'surface-manifest.lint.yaml'
Test Files  1 failed (1)
      Tests   (4)
```

## GREEN Evidence (4 tests pass)
```
Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Regression Evidence
```
Test Files  1 passed (1)
      Tests  45 passed (45)
```

## Typecheck
Pre-existing error only (S3StorageProvider.ts @aws-sdk/client-s3). New file adds 0 errors.

## Changed Files
- `schema/ui/surface-manifest.lint.yaml` (NEW) - 1 rule: surface-pane-vocabulary-closure (L-SM-2)
- `server/src/schema/SurfaceManifestLint.test.ts` (NEW) - 4 tests

## L-SM-2 Rule Structure
everyItem(surfaces) -> everyItem(panes) -> in(".", values: [ai-chat, event-editor, deck, project-tabs])

L2-UI-SURFACE-MANIFEST-1 UNIT u1lintrules DONE b333de158df5011b15f7b040a5e7c3824d73d26d
