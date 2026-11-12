# L2-SPEC-SHEET-INGEST-1 — unit g6d2fix1 (test-only pin)

Base 57b4353fbc58828ae5a5456410b580139092edac — branch cl/lane2-specsheet-g6d2keywords-0409.
Scope: review c1 defect D1 MINOR — header-collection site `SpecSheetExtractor.ts:208`
(`const kw = keywordsFor(mapping)`) had no behavioural witness. D2 belongs to the
g6d2keywords report and that file was left untouched.

## What changed (1 file, test-only)
`server/src/ingestion/SpecSheetExtractor.d2topology.test.ts`: one new `it` — "a short-label
header table fills both topology fields from the declared keywords". Fixture exactly
`text: 'Rows | Columns\n8 | 12'`; real map via `getSpecSheetFieldMap('labware')`; real
`extractProposals`. Asserts exactly one `topology.rows` proposal value `'8'`, exactly one
`topology.columns` value `'12'`, and no other `topology.*` targetField. Imports, file header
and both existing legs unchanged. Production TS and all YAML byte-identical.
GREEN at HEAD (missing witness, not a live bug): 3 passed (3), baseline 2 passed (2).

## Mutation probe (raw)
Edit at `SpecSheetExtractor.ts:208` only:
  -    const kw = keywordsFor(mapping);
  +    const kw = parseSourceKeywords(mapping.source);
$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.d2topology.test.ts
 ❯ src/ingestion/SpecSheetExtractor.d2topology.test.ts  (3 tests | 1 failed) 17ms
   ❯ ... > a short-label header table fills both topology fields from the declared keywords
     → expected [] to have a length of 1 but got +0
AssertionError: expected [] to have a length of 1 but got +0
  ❯ src/ingestion/SpecSheetExtractor.d2topology.test.ts:70:18
      70|     expect(rows).toHaveLength(1);
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
Pin goes RED. Restored with `git checkout -- server/src/ingestion/SpecSheetExtractor.ts`;
never committed. Restoration proof: index blob == worktree blob (`git ls-files -s` and
`git hash-object` both c9f0455735ee37c764b445b11bf22e0258c0be95).

## Verification (raw)
$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.d2topology.test.ts
 ✓ src/ingestion/SpecSheetExtractor.d2topology.test.ts  (3 tests) 13ms
 Test Files  1 passed (1)
      Tests  3 passed (3)         [baseline 2 passed (2)]
$ cd server && npx vitest run <d2topology> <SpecSheetExtractor> <labelMatch> <FieldMaps>
 ✓ src/ingestion/SpecSheetExtractor.d2topology.test.ts  (3 tests) 17ms
 ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 19ms
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (19 tests) 24ms
 ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 32ms
 Test Files  4 passed (4)
      Tests  33 passed (33)       [baseline 32 passed (32)]
$ cd server && npx tsc --noEmit; echo EXIT=$?
EXIT=0                            [no output; baseline 0 lines, exit 0]
$ git -c core.fileMode=false status --porcelain
(no output)

## Diff proof
$ git -c core.fileMode=false diff --name-only 57b4353f..HEAD   # after probe restore, pre-report
server/src/ingestion/SpecSheetExtractor.d2topology.test.ts
At exit the same command lists exactly the two owned files: that test file and this
report; no product/schema path appears in the range.

## Decisions / out of scope
- Assertions ride the shipped declared `keywords`; none added or reordered (O2 out).
- O1 (loadFieldMaps lacks Ajv validation) is a product change — prohibited here.
L2-SPEC-SHEET-INGEST-1-g6d2fix1 UNIT unit DONE 89165ecc6aa3ce7d5baed8150f2e945c47e8ebec
L2-SPEC-SHEET-INGEST-1 UNIT g6d2fix1 DONE 89165ecc6aa3ce7d5baed8150f2e945c47e8ebec
