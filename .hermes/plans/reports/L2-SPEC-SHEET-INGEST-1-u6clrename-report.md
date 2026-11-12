# L2-SPEC-SHEET-INGEST-1 / unit u6clrename — report
Base 090c055b -> rename commit a0d41e6c (1 line, server/src/ingestion/SpecSheetExtractor.test.ts:189).
RED: test named "extracts vendor from pipe-separated colon-less segment (real receipt pattern)" but body asserts `expect(vendors).toHaveLength(0);` (:210) — the opposite.
GREEN: renamed to "does not extract a vendor from pipe-separated colon-less segment (real receipt pattern)"; assertion untouched; vitest 19 passed (19); `tsc --noEmit` clean.
No other file touched (SpecSheetExtractor.ts untouched). Diff vs 090c055b: 1 test-file line + this report.
