# ADVERSARIAL REVIEW c1 — L2-SPEC-SHEET-INGEST-1 unit g6fix (lane 2)

- Worktree: /home/brad/cl-wt/L2-SPECSHEET-g6fix-lane2
- Branch: cl/lane2-specsheet-g6fix-0402, base 55b9c86c, head c1209669
- Diff reviewed: `git -c core.fileMode=false diff 55b9c86c..c1209669` — 4 files, all read in full
- Mode: READ-ONLY. No worktree file was edited; `git status --porcelain` empty at start and at end.

## Diff inventory (numstat at HEAD)

    153  0  .hermes/plans/reports/L2-SPEC-SHEET-INGEST-1-g6fix-report.md
      8  3  schema/ingestion/spec-sheet.labware.yaml
    112  0  server/src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts
     21  4  server/src/ingestion/SpecSheetExtractor.ts

Exactly the 3 product/test files + the report. No out-of-scope path.

## Check 1 — D1 pin honesty + no schema relaxation

Full YAML hunk (`git diff 55b9c86c..c1209669 -- schema/ingestion/spec-sheet.labware.yaml`):

    @@ -48,9 +48,14 @@ targets:
             source: "Well depth as stated on the sheet"
             unit: "mm"
             required: false
    +      # Label forms the sheet uses for each topology field. Keywords are
    +      # matched as prefixes of the label before ":" (startsWith), so every
    +      # alternative below must be a plausible label OPENING. topology.addressing
    +      # is required by labware-definition.schema.yaml with enum
    +      # [grid, linear, single] — a sheet that states its addressing must map.
           - targetField: topology.addressing
    -        source: "Addressing type (grid/linear/single) from the sheet"
    +        source: "Addressing type / Addressing (grid / linear / single)"
           - targetField: topology.rows
    -        source: "Number of rows for grid addressing"
    +        source: "Number of rows / Rows / Row count"
           - targetField: topology.columns
    -        source: "Number of columns for grid addressing"
    +        source: "Number of columns / Columns / Column count"

Only `source` strings + comments changed. No key added/removed, no `required`/`unit`/`transform`
touched, no structural relaxation. `git diff 55b9c86c..HEAD -- '*.schema.yaml' '*.lint.yaml' '*.ui.yaml' | wc -l` = **0**.
The field-map file is itself validated by `extraction-spec.schema.yaml` (source is a free string)
and the existing conformance suite still resolves every targetField against
`workflow/labware-definition.schema.yaml` (7/7 green below).

D1 pin has teeth — I re-ran the coder's mutant myself in a scratch tree
(/home/brad/.g6scratch, worktree untouched), replacing only
`server/src/ingestion/SpecSheetExtractor.ts` with `git show 55b9c86c:...`:

    FAIL ... > D1 truncation pin
    AssertionError: expected [] to have a length of 1 but got +0
    FAIL ... > D2 pin
    AssertionError: expected [ { …(5) } ] to have a length of +0 but got 1
    FAIL ... > realistic plate sheet
    AssertionError: expected '8' to be '12'
    Tests  3 failed | 1 passed (4)

Identical to the coder's mutant A table.

My own independent probe (vitest run from /tmp against the REAL modules, not the test file):

    P5 prefix source (pre-fix verbatim "Addressing type (grid/linear/single) from the sheet"):
      topology.addressing="grid"
    P1 shipped map on a realistic sheet:
      display_name="96-Well Polypropylene Microplate" | vendor="Corning" |
      capacity.max_well_volume_uL="350 uL" | physical_geometry.well_length_mm="8.0 mm" |
      topology.addressing="grid" | topology.rows="8" | topology.columns="12"
    P2e label "Addressing: linear" -> topology.addressing="linear"

`topology.addressing` is required + enum [grid, linear, single]
(`schema/workflow/labware-definition.schema.yaml:92-96`) — now supplied.

## Check 2 — D2 distinctness (rows vs columns)

New shipped sources: rows `"Number of rows / Rows / Row count"`, columns
`"Number of columns / Columns / Column count"` (YAML:59,61). Trace:
`parseSourceKeywords` (SpecSheetExtractor.ts:104-125) strips parentheticals, splits on `/`,
then for `Number of rows` the lazy preposition match lands on **of** (line 112, capture group 2),
`phrase` = "Number" which is in `BARE_QUANTIFIER_HEADS` (line 102), so line 120 restores the
whole alternative -> keyword `Number of rows`. Columns produces `Number of columns`. The two
sets are disjoint. My probes:

    P2  rows-only  "Number of rows: 8"    -> topology.rows="8"                      (columns absent)
    P2b cols-only  "Number of columns: 12" -> topology.columns="12"                 (rows absent)
    P2c "Row count: 8"     -> topology.rows="8"
    P2d "Column count: 12" -> topology.columns="12"
    P2f "Rows: 8"          -> topology.rows="8" only, no addressing fabricated

Mutation control (guard removed, paren-strip kept), run by me in the scratch tree:

    Tests  2 failed | 2 passed (4)
    → expected [ { …(5) } ] to have a length of +0 but got 1
    → expected '8' to be '12'

and YAML-reverted (parser fixed, pre-fix sources):

    Tests  2 failed | 2 passed (4)   → expected [] to have a length of 1 but got +0  (x2)

Both reproduce the coder's mutant C / B exactly: the parser change and the YAML change are each
independently load-bearing.

## Check 3 — no regression on "Quantity as stated on the sheet"

`prepositionRe` now captures the preposition; the guard fires only when
`preposition === 'of'` (line 119). "Quantity as stated on the sheet" first matches **as**, so
`phrase` stays "Quantity". Probe against the shipped vendor-product map:

    P3a "Quantity: 500 g"        -> package_size="500 g"
    P3b "Package size: 500 g"    -> package_size="500 g"
    P3c "Catalog Number: C1234"  -> catalog_number="C1234"
    P3d "Associated documents: MSDS" -> documents="MSDS"   (parenthetical strip is an improvement here)

Sibling suites that consume the parser (my runs):
`SpecSheetExtractor.test.ts` 19/19, `SpecSheetExtractor.labelMatch.test.ts` 4/4,
`SpecSheetFieldMaps.test.ts` 7/7 — 30/30 green.

## Check 4 — tests / typecheck (raw)

    $ npm run test:run -w server -- src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts
     ✓ src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts  (4 tests) 11ms
     Test Files  1 passed (1)
          Tests  4 passed (4)

    $ npm run test:run -w server -- src/ingestion/
     Test Files  3 failed | 34 passed | 2 skipped (39)
          Tests  12 failed | 199 passed | 2 skipped (229)

    $ npx tsc --noEmit -p server > /tmp/tsc-g6fix.log 2>&1 ; echo $?
    tsc_exit=0   (0 lines of output)

The 3 red files are the known excluded set (`Wave2SemanticFamilyPass`, `ZymoCampaignGoldenE2E`,
`ZymoCampaignNegatives`); not counted per brief. NOTE (honesty, not a defect): in this worktree
their HEAD failure cause is NOT the coder's quoted ENOENT at collection — they collect and fail
12 tests with `Error: XDR seed failed: Record already exists: XDR-w211-golden` plus Ajv ref
codegen noise, i.e. leftover record state in the lane worktree. The report's "180 passed, 0
failed tests" is therefore not reproducible verbatim here (199 passed / 12 failed, same 229
total, same 39 files). No file in the diff is imported by those suites
(`grep -rn SpecSheetExtractor server/src/ingestion/vendor-protocol/*.ts` -> no hits).

## Check 5 — marker / report

- Code commit named in report: `a2bb73fabbb0f031fca03eda01824a365a06b499` — matches `a2bb73fa`
  and `git merge-base --is-ancestor a2bb73fa HEAD` rc=0.
- RELEASE REGEX FAILS: `grep -nE 'L2-SPEC-SHEET-INGEST-1 UNIT g6fix.*DONE [0-9a-f]{40}'` -> rc=1.
  Shipped last line is `L2-SPEC-SHEET-INGEST-1-g6fix UNIT unit DONE a2bb73fa...` — item and
  `g6fix` are hyphen-joined before `UNIT`, and the unit token is duplicated. See defect 1.
- Stat claims measured at HEAD (`--numstat` above): extractor 21/4, yaml 8/3, new test 112/0,
  product+test total 141 added -> report's "+21/-4, +8/-3, 112 lines, 3 files, 141 added" all
  accurate. Full `--stat` (with report) 294/7.
- YAML-without-restart rule: the report explicitly states the lane stack was NOT restarted and
  that browser acceptance is not claimed. Compliant.
- `exactOptionalPropertyTypes`: no optional properties added. Ajv: untouched, no parallel
  validation. No hardcoded domain logic added (head set is a parser grammar constant, not a
  domain/kind map; the label strings live in YAML).

## DEFECTS

1. MINOR — `.hermes/plans/reports/L2-SPEC-SHEET-INGEST-1-g6fix-report.md:153`
   Done marker does not match the required `L2-SPEC-SHEET-INGEST-1 UNIT g6fix.*DONE [0-9a-f]{40}`.
   Shipped: `L2-SPEC-SHEET-INGEST-1-g6fix UNIT unit DONE <sha>`. Rule violated: lane marker
   contract (item/unit token order), so a launcher grepping the documented pattern sees no
   marker at all. Fix direction: re-emit the last line as
   `L2-SPEC-SHEET-INGEST-1 UNIT g6fix DONE <40-hex>` (keep the sha of the code commit).

2. MINOR — `server/src/ingestion/SpecSheetExtractor.ts:119-121`
   The "keep the complement" guard restores the WHOLE alternative, not head + complement:
   for `"Number of rows as stated on the sheet"` (the file's own dominant authoring style — 4 of
   9 labware entries end in `as stated on the sheet`) the keyword becomes
   `number of rows as stated on the sheet`, and `labelMatches` (startsWith) can never match a
   real `Number of rows: 8` line. Proven in my probe: P4 -> `(none)` for both
   `"Number of rows as stated on the sheet"` and `"Number of rows for grid addressing"`.
   The shipped YAML happens to avoid the tail, so there is no live failure today; but this
   reproduces exactly the D1 failure class (a required field silently never maps) for any future
   source written in the map's established style, and the comment/report claim ("keep the
   complement") does not describe the code. Fix direction: keep `head + 'of' + complement`,
   i.e. cut the phrase at the NEXT preposition after the `of` (or reconstruct from the matched
   `of` clause) rather than falling back to `alt.trim()`; add one pin with the tail form.

## What I did not check
Nothing in the diff went unread. Browser re-gate acceptance was not checked (out of scope; the
report does not claim it).

VERDICT: FIX (2)
