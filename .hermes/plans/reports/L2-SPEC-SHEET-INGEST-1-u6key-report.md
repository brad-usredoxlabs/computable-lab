# L2-SPEC-SHEET-INGEST-1 — unit u6key — report

- Lane 2, worktree /home/brad/cl-wt/L2-SPECSHEET-u6key-lane2
- Branch cl/lane2-specsheet-u6key-2055, base a4ca2e9afa3b056d2d3a53d3038cd44d92cddb52 (ancestor check: OK)
- Defect: g4 D4 — React "Encountered two children with the same key … XSPEC-LABWARE" on /lab/labware/new

## What changed (2 files, 23 insertions, 1 deletion)

1. `app/src/collections/LabLabwareNewPage.test.tsx` — added ONE test
   `does not warn about duplicate React keys when proposals share a specId (g4 D4)`:
   renders the success arm with two proposals sharing `specId: 'XSPEC-LABWARE'` and
   distinct targetFields (exactly what SpecSheetExtractor.ts:192 emits), spies on
   console.error, asserts no call whose first arg contains `same key`.
2. `app/src/collections/LabLabwareNewPage.tsx:330` — `key={proposal.specId}` →
   `key={proposal.targetField}`.

Justification: the extractor emits at most one proposal per field
(`SpecSheetExtractor.ts:283` `break; // one match per field`), so `targetField` is
unique within the table. `specId` is derived per record kind
(`SpecSheetExtractor.ts:192` `const specId = \`XSPEC-${fieldMap.recordKind.toUpperCase()}\``)
and can never be unique per proposal. No index keys, no type changes, no extractor
edits, no dedupe/renumber; cell contents, citation testids, and save logic untouched.

## RED (raw, before fix — fails as predicted: console.error received a /same key/ call)

```
 ❯ src/collections/LabLabwareNewPage.test.tsx  (19 tests | 1 failed) 196ms
   ❯ src/collections/LabLabwareNewPage.test.tsx > LabLabwareNewPage > does not warn about duplicate React keys when proposals share a specId (g4 D4)
     → expected true to be false // Object.is equality

 FAIL  src/collections/LabLabwareNewPage.test.tsx > LabLabwareNewPage > does not warn about duplicate React keys when proposals share a specId (g4 D4)
AssertionError: expected true to be false // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```

## GREEN (raw, after fix)

```
cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx
 ✓ src/collections/LabLabwareNewPage.test.tsx  (19 tests) 184ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
   Duration  7.30s
```

Typecheck: not run — no .ts signature changed (inline JSX key only).

`git -c core.fileMode=false status --short` → (empty, clean tree).

## Commits

- 969c1e2c test(...u6key): RED — duplicate React key when proposals share specId (g4 D4)
- efc90931 fix(...u6key): key proposal table rows by targetField, not specId (g4 D4)

L2-SPEC-SHEET-INGEST-1 UNIT u6key DONE efc90931813834664e5c9d918220717cc88c8bc4
