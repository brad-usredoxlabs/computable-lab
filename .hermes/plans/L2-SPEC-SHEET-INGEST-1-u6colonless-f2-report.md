# L2-SPEC-SHEET-INGEST-1 — unit u6colonless-f2 report (run u6colonless-f2-l2t2250)

Base 8511cc85 (verified at start). Ruling A applied: gate, not delete.

## Change
`server/src/ingestion/SpecSheetExtractor.ts` — ONE site, the multi-segment whole-line
fallback (~:261). Condition changed from `if (rawValue === null) {` to:

```ts
        if (
          rawValue === null &&
          !segments.some((seg) => seg.label !== seg.value)
        ) {
```

plus the binding comment line above it. If any segment carried a value delimiter the
line was already parsed segment-wise; re-slicing `trimmed` from its first colon is what
produced the page-wide blob vendor. Positional arm (:248-259), guard (:242),
single-segment branch, segmentLine, isHeaderRow, TRANSFORMS, YAML — untouched.
Diff: 1 file, +5/-1. Commit 1 = 1731837e65081b0821ca8251d6d93f0d6258e016.

## VERIFY (raw tails)

### SpecSheetExtractor.test.ts — expected 19/19 (baseline at 8511cc85: 1 failed | 18 passed)
```
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (19 tests) 17ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```
The flipped pin at test :210 (`expect(vendors).toHaveLength(0)`) is GREEN.

### 21-suite combined leg
`SpecSheetExtractor.internalError.test.ts` is NOT PRESENT in this worktree — skipped
per brief ("different worktree file not present here is fine"). The 19-test file above
stands in for its legs; u4catch seams untouched.

### labelMatch / FieldMaps (glob `src/ingestion/labelMatch` misses; real paths run)
```
 ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 14ms
 ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 41ms
 Test Files  2 passed (2)
      Tests  11 passed (11)
```

### tsc
`npx tsc --noEmit -p .` from server/ — zero output, exit 0.

### MUTATION PROBE
Reverted condition to `if (rawValue === null) {`, reran test file:
```
    210|     expect(vendors).toHaveLength(0);
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```
Exactly 1 failure = the :210 vendor pin. Restored, reran:
```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

## Exit state
`git -c core.fileMode=false status --short` clean at exit (commit 2 = this report).

L2-SPEC-SHEET-INGEST-1 UNIT u6colonless-f2 DONE 1731837e65081b0821ca8251d6d93f0d6258e016
