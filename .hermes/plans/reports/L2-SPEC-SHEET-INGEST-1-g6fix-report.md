# L2-SPEC-SHEET-INGEST-1 / unit g6fix-fieldmap — report

- Lane: 2
- Worktree: /home/brad/cl-wt/L2-SPECSHEET-g6fix-lane2
- Branch: cl/lane2-specsheet-g6fix-0402
- Base: 55b9c86c (trunk cl/integration-2 tip at dispatch, verified with `git rev-parse HEAD`)
- Code commit: a2bb73fabbb0f031fca03eda01824a365a06b499
- Unit: 1 of 1 (g6fix-fieldmap). Implementation complete; acceptance (browser re-gate) NOT claimed here.

## Root cause (two defects in one field map)

1. D1 (HIGH, g6) — `parseSourceKeywords` did `source.split('/')` *before* removing
   parentheticals, so the shipped labware addressing source
   `"Addressing type (grid/linear/single) from the sheet"` produced the literal keyword
   `Addressing type (grid`. `labelMatches` is `labelNorm.startsWith(kwNorm)`
   (`server/src/ingestion/SpecSheetExtractor.ts:113-119`), so no real label matched and
   `topology.addressing` — REQUIRED by `schema/workflow/labware-definition.schema.yaml`
   (`required: [addressing]`, `enum: [grid, linear, single]`) — never received a value:
   every Save 422'd, 0 records written.
2. D2 (MINOR, g6) — `"Number of rows for grid addressing"` and
   `"Number of columns for grid addressing"` both stripped at `of` to the single keyword
   `Number`, so one sheet line filled both `topology.rows` and `topology.columns`

The defect class is the extractor field map + its keyword parser. The schema is untouched.

## Change (3 files, 141 added lines — product+test; budget 3 files / 150 lines)

### `server/src/ingestion/SpecSheetExtractor.ts` (+21/-4, parseSourceKeywords only)
- Drop parenthetical groups (`(...)`) **before** splitting on `/`: a parenthetical
  enumerates allowed values/units, it is never a label alternative (fixes D1).
- Keep the complement of an "of"-strip when the stripped head is a bare quantifier
  (`BARE_QUANTIFIER_HEADS = number|no|count|quantity|total|amount`), so
  `"Number of rows"` stays `Number of rows` instead of collapsing to `Number` (fixes D2).
  Deliberately scoped to an `of` complement so provenance tails (`"Package size / Quantity as
  stated on the sheet"`) still strip to `Quantity` — the vendor-product map is unchanged.
- No new extraction path, no signature change, `labelMatches` untouched.

### `schema/ingestion/spec-sheet.labware.yaml` (+8/-3, topology block only)
Each targetField now lists label **openings** a sheet actually starts with, and the
rows/columns alternatives are disjoint:

    - targetField: topology.addressing
      source: "Addressing type / Addressing (grid / linear / single)"
    - targetField: topology.rows
      source: "Number of rows / Rows / Row count"
    - targetField: topology.columns
      source: "Number of columns / Columns / Column count"

Parsed keywords (verified through the tests): `Addressing type`, `Addressing`;
`Number of rows`, `Rows`, `Row count`; `Number of columns`, `Columns`, `Column count`
— intersection between the rows and columns sets is empty, and each keyword is a prefix
of a plausible label (`Addressing type: grid`, `Number of rows: 8`, `Columns: 12`).

### `server/src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts` (new, 112 lines)
`parseSourceKeywords` is private, so its behaviour is pinned through `extractProposals`
(no API surface added):
1. D1 truncation pin — pre-fix source line, doc `Addressing type: grid` → exactly one
   proposal, value ∈ {grid, linear, single} (RED before the parser fix: 0 proposals).
2. D2 collapse pin — sources `Number of rows` / `Number of columns`, doc with only
   `Number of rows: 8` → rows = `8`, columns = **0 proposals** (RED before: columns = 8).
3. Shipped-map distinctness — `getSpecSheetFieldMap('labware')`, doc
   `Rows: 8 / Columns: 12` → rows `8`, columns `12`, distinct passages.
4. End-to-end realistic plate sheet (display name, vendor, max well volume, well length,
   addressing, rows, columns) → addressing ∈ enum, rows/columns from their own lines, and
   the non-topology fields still map (no regression).

## Schema untouched (reviewer bait #1)

    $ git diff HEAD~1 HEAD -- '*.schema.yaml' | wc -l
    0

`git show --stat` for the code commit lists exactly three paths, none of them `*.schema.yaml`.

## VERIFY (raw)

Base baseline — `timeout 240 npx vitest run src/ingestion/ --root server`:

    Test Files  3 failed | 33 passed | 2 skipped (38)
         Tests  176 passed | 2 skipped (225)

After the change, same command:

    Test Files  3 failed | 34 passed | 2 skipped (39)
         Tests  180 passed | 2 skipped (229)

Named suites (all green, reviewer bait #4):

    ✓ src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts  (4 tests) 50ms
    ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 131ms
    ✓ src/ingestion/SpecSheetExtractor.test.ts  (19 tests) 69ms
    ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 47ms

New test file alone — `timeout 240 npx vitest run src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts --root server`:

    RUN  v1.6.1 /home/brad/cl-wt/L2-SPECSHEET-g6fix-lane2/server
    ✓ src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts  (4 tests) 14ms
    Test Files  1 passed (1)
         Tests  4 passed (4)

Typecheck — `timeout 300 npx tsc --noEmit -p server`:

    (no output) tsc_exit=0

### Pre-existing failures (NOT caused by this unit; identical before and after)

The same three files fail at collection on the untouched base and after the change:
`src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts`,
`ZymoCampaignGoldenE2E.test.ts`, `ZymoCampaignNegatives.test.ts`.
First error in both logs: `ENOENT ... /home/brad/cl-wt/schema/lab/material-profile.registry.yaml`
— those suites compute their repo root with `resolve(here, '../../../..')`, which lands one
directory above this pre-existing worktree layout. Environment/worktree-depth gap, outside
this unit's owned files; every file that passed at baseline still passes (33 → 34 files,
+4 tests, all mine). Owner: orchestrator/lane env; resume condition: run the same suite in a
tree where that repo-root probe resolves, or fix the helper's depth.

## MUTATION PROBE (required) — all RED

| mutant | change | result |
|---|---|---|
| A | parser fully reverted (no paren strip, no quantifier guard) | `Tests 3 failed | 1 passed (4)` — D1 addressing test: `expected [] to have a length of 1 but got +0`; D2: `expected [ { …(5) } ] to have a length of +0 but got 1`; e2e: `expected '8' to be '12'` |
| B | rows/columns YAML sources reverted to the two old lines | `Tests 2 failed | 2 passed (4)` — distinctness + e2e: `expected [] to have a length of 1 but got +0` (both fields unmapped) |
| C | paren strip kept, quantifier guard removed | `Tests 2 failed | 2 passed (4)` — one line fills both: `expected [ { …(5) } ] to have a length of +0 but got 1`, `expected '8' to be '12'` |

Files were byte-restored after each mutant (`restored: True True`) before committing.

## Reviewer bait

- "You relaxed the schema" — schema diff is empty (0 lines), see above.
- "Magic string" — every keyword is justified by `labelMatches` = `startsWith` on the label
  text before `:`; the YAML now lists label openings (`Addressing type`, `Rows`,
  `Number of columns`, …) and the parser strips only parentheticals and prepositional tails.
- "rows/columns still share a keyword" — test 2 and test 3 kill both the parser-level and the
  shipped-map version of that (columns = 0 proposals when only the rows line exists).
- "vendor-product map regressed" — the quantifier guard is scoped to `of` complements, so
  `Quantity as stated on the sheet` still yields `Quantity`; `SpecSheetExtractor.test.ts`
  (19 tests, includes the vendor-product happy path) and `SpecSheetFieldMaps.test.ts`
  (7 tests) both pass.

## Notes / follow-ups for the orchestrator

- YAML changed ⇒ the lane stack needs a reload before any live/browser re-verification
  (no stack was restarted by this coder). The browser gate owns acceptance; I claim
  implementation only.
- Accepted-stale comment: `server/src/ingestion/SpecSheetExtractor.test.ts:517-522` still says
  its inline sources are "verbatim from schema/ingestion/spec-sheet.labware.yaml:53-56". That
  test asserts colon-less chrome rejection using pre-fix strings and is independent of YAML
  fidelity, so it was left untouched (it would also have breached the 3-file budget).
  Optional follow-up: reword that comment or drive the strings from the shipped map.
- Observed during the work: worktree `node_modules` were materialised as symlinks to
  /mnt/vast/home/brad/git/cl-integration-2/node_modules; `server/schema` is a symlink into
  this worktree's `schema/`. No files were edited through symlinks.

L2-SPEC-SHEET-INGEST-1-g6fix UNIT unit DONE a2bb73fabbb0f031fca03eda01824a365a06b499
