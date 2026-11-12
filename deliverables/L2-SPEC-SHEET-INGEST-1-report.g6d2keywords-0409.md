# L2-SPEC-SHEET-INGEST-1 — unit g6d2 (distinct keywords for topology rows/columns)

- Item: L2-SPEC-SHEET-INGEST-1 (lane 2)
- Unit: g6d2 — pin + fix browser-gate g6 defect D2
- Worktree: /home/brad/cl-wt/L2-SPECSHEET-g6d2keywords-lane2
- Branch: cl/lane2-specsheet-g6d2keywords-0409
- Base: 55b9c86c167209779764bb5c4842f27c7c323cb0 (cl/integration-2 tip, clean at start)
- Scope: D2 only. `topology.addressing` mapping, every `required:` flag,
  `schema/workflow/labware-definition.schema.yaml`, the vendor-product map and the shipped pins are
  untouched.

## Diagnosis (unchanged from brief, re-verified in code)

`parseSourceKeywords` (SpecSheetExtractor.ts:95-108) strips at the first preposition, `of` included, so
"Number of rows for grid addressing" and "Number of columns for grid addressing" both derive the keyword
`Number`. `labelMatches` startswith-matches both, so one line fills both fields.

## Step 1 — RED (new pin file)

File added: `server/src/ingestion/SpecSheetExtractor.d2topology.test.ts` (real labware map via
`getSpecSheetFieldMap('labware')`; one line per test; asserts the other topology field gets NO proposal).

Raw failure (two failures, exactly the double-fill):

```
 FAIL  src/ingestion/SpecSheetExtractor.d2topology.test.ts > g6d2 — rows/columns keywords cannot cross-fill > a rows-only line proposes topology.rows and NOT topology.columns
AssertionError: expected [ [ 'topology.columns', '8' ] ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   Array [
+     "topology.columns",
+     "8",
+   ],
+ ]

 ❯ src/ingestion/SpecSheetExtractor.d2topology.test.ts:32:58
 FAIL  src/ingestion/SpecSheetExtractor.d2topology.test.ts > g6d2 — rows/columns keywords cannot cross-fill > a columns-only line proposes topology.columns and NOT topology.rows
AssertionError: expected [ [ 'topology.rows', '12' ] ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   Array [
+     "topology.rows",
+     "12",
+   ],
+ ]

 ❯ src/ingestion/SpecSheetExtractor.d2topology.test.ts:48:55

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Env note: the worktree had no `server/node_modules`; created the launcher-style symlink
`server/node_modules -> /home/brad/git/cl-integration-2/server/node_modules` (gitignored, no install).

## Steps 2+ — GREEN, mutation probes, verification

(filled in below as the run proceeds)
