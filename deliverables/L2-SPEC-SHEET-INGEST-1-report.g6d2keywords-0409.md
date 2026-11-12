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

## Step 2 — GREEN (5 files total, 21 added / 2 changed lines)

- `schema/ingestion/extraction-spec.schema.yaml`: optional `keywords` on the fieldMappings item
  (`type: array`, `items: {type: string}`, `minItems: 1`, description says the list overrides the
  keyword list derived from `source`). `additionalProperties: false` untouched.
- `schema/ingestion/spec-sheet.labware.yaml`: `topology.rows` → `keywords: ["number of rows", "rows"]`;
  `topology.columns` → `keywords: ["number of columns", "columns"]`. `source:` strings, the
  `topology.addressing` mapping and every `required:` flag untouched.
- `server/src/ingestion/SpecSheetFieldMaps.ts`: `FieldMapping` gains `keywords?: string[]`
  (optional = absent or a value; nothing constructs it as possibly-undefined).
- `server/src/ingestion/SpecSheetExtractor.ts`: new `keywordsFor(mapping)` helper — declared non-empty
  `keywords` win, else `parseSourceKeywords(mapping.source)` (byte-identical fallback for maps without
  keywords). Used at BOTH former derivation sites (header collection and per-mapping matching) so they
  cannot drift. `parseSourceKeywords` and `labelMatches` semantics unchanged.

Green:
```
 ✓ src/ingestion/SpecSheetExtractor.d2topology.test.ts  (2 tests) 11ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Schema probe (additional, scratch)

`/home/brad/.specsheet-g6d2-scratch/probe-schema-keywords.mjs` compiles the fieldMappings item schema
from the edited `extraction-spec.schema.yaml` with Ajv2020 and validates every mapping of both shipped
maps, plus a negative control (undeclared key must still be rejected):

```
checked spec-sheet.labware.yaml
checked spec-sheet.vendor-product.yaml
negative control ok: unknown key rejected -> additionalProperties
SCHEMA PROBE PASS
```

Note: the vendor-product map is byte-identical; it was only read by the probe.

## Step 3 — mutation probes (both RED, then reverted)

M1 — the two `keywords:` lines deleted from `spec-sheet.labware.yaml`:
```
 FAIL  ... > a rows-only line proposes topology.rows and NOT topology.columns
AssertionError: expected [ [ 'topology.columns', '8' ] ] to deeply equal []
 FAIL  ... > a columns-only line proposes topology.columns and NOT topology.rows
AssertionError: expected [ [ 'topology.rows', '12' ] ] to deeply equal []

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

M2 — `keywordsFor` branch reverted to `return parseSourceKeywords(mapping.source);`:
```
 FAIL  ... > a rows-only line proposes topology.rows and NOT topology.columns
AssertionError: expected [ [ 'topology.columns', '8' ] ] to deeply equal []
 FAIL  ... > a columns-only line proposes topology.columns and NOT topology.rows
AssertionError: expected [ [ 'topology.rows', '12' ] ] to deeply equal []

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Both mutations reverted from scratch backups; `grep -rn "M1\|M2"` over the two files finds nothing and
the new test is green again.

## Step 4 — verification (raw)

```
$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.d2topology.test.ts
 ✓ src/ingestion/SpecSheetExtractor.d2topology.test.ts  (2 tests) 12ms
 Test Files  1 passed (1)
      Tests  2 passed (2)

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts \
    src/ingestion/SpecSheetExtractor.labelMatch.test.ts src/ingestion/SpecSheetFieldMaps.test.ts
 ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 17ms
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (19 tests) 22ms
 ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 34ms
 Test Files  3 passed (3)
      Tests  30 passed (30)

$ cd server && npx tsc --noEmit
(no output; exit 0, 0 error lines)
```

`git -c core.fileMode=false status --short` at this point listed only the 4 modified owned files; the
new test and this report were committed separately. No prohibited path was modified. No stack restart,
no full `src/` run, no playwright.

## Changed paths

- `schema/ingestion/extraction-spec.schema.yaml`
- `schema/ingestion/spec-sheet.labware.yaml`
- `server/src/ingestion/SpecSheetFieldMaps.ts`
- `server/src/ingestion/SpecSheetExtractor.ts`
- `server/src/ingestion/SpecSheetExtractor.d2topology.test.ts` (new)
- `deliverables/L2-SPEC-SHEET-INGEST-1-report.g6d2keywords-0409.md` (this report)

## Remaining / out of scope

- g6 D1 (`topology` root requirement in `labware-definition.schema.yaml` vs. the map not supplying
  `addressing`) is an OPEN architect contract call — untouched by instruction.
- Acceptance of the ITEM stays with advc + the independent browser gate; this unit only closes D2 at the
  unit level. Scratch dir `/home/brad/.specsheet-g6d2-scratch/` is deleted at exit.
