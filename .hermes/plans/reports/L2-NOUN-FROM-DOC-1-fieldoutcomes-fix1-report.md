# L2-NOUN-FROM-DOC-1 — fieldoutcomes fix cycle 1 — unit foD1pin (report)

- Worktree: /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2
- Branch: cl/lane2-nounfromdoc-fieldoutcomes-2156
- Base (HEAD at start, verified clean): cfc9901ba060a02a1f144f9247d9a11e79a1fb0e
- Finding fixed: advc c1 D1 — the VALUE of `fieldOutcomes` on the two no-proposals
  return sites was unpinned; `fieldOutcomes: []` shipped 21/21 green.
  Review: /home/brad/.hermes/cl/lanes/2/reviews/L2-NOUNFROMDOC-fieldoutcomes-advc-c1-l2t1855.md:21-49
- Change: assertions added inside the TWO existing no-proposals pins
  (SpecSheetExtractor.test.ts). No new top-level `it(`, no renumbering, no product
  change (product file mutated for the probe only, reverted, never committed).

## 0. Baseline GREEN at HEAD cfc9901b, product file clean (pre-fix, 21/21)

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests) 27ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  22:43:54
   Duration  707ms (transform 68ms, setup 0ms, collect 108ms, tests 27ms, environment 0ms, prepare 120ms)

## 1. RED-first — the hole, recorded BEFORE adding assertions

Reviewer's mutant applied verbatim at SpecSheetExtractor.ts:422 (the noProposals
return site at :418), one line only: `        fieldOutcomes,` -> `        fieldOutcomes: [],`
Assertions NOT yet added at this moment. Raw run:

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests) 27ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  22:44:11
   Duration  631ms (transform 57ms, setup 0ms, collect 90ms, tests 27ms, environment 0ms, prepare 130ms)

GREEN with the empty list — the recorded hole (matches advc c1 D1 mutant, 21/21).
Then restored: `git checkout -- server/src/ingestion/SpecSheetExtractor.ts`;
`git -c core.fileMode=false status --short` -> (empty). Nothing committed.

## 2. The change — assertions in BOTH existing pins (data-derived, 5 lines each)

Pin 1 (no_field_match, existing `it` at former :365) and pin 2 (empty_document,
existing `it` at former :389) each gain, after their existing assertions:

    const declared = (await getSpecSheetFieldMap('labware')).fieldMappings.map((m) => m.targetField);
    const outcomes = (result as any).fieldOutcomes as Array<{ targetField: string; status: string; passage?: string }>;
    expect(outcomes.map((o) => o.targetField)).toEqual(declared); // every declared field, YAML order
    expect(outcomes.every((o) => o.status === 'not_present')).toBe(true);
    expect(outcomes.every((o) => !('passage' in o))).toBe(true); // no empty-string / guessed passage

- Expected list is DATA: read through `getSpecSheetFieldMap('labware')`
  (import already present at test :12); labware YAML declares 9 mappings with no
  repeated targetField, so the plain declared order is asserted (no de-dup needed).
- No field-name literal array anywhere in the diff (AC3).
- `passage` asserted ABSENT with `!('passage' in o)` — exactOptionalPropertyTypes
  (server/tsconfig.json): the not_present arm carries no passage key at all;
  `o.passage === undefined` would be a weaker test, `passage: ''` a lie.
- Existing assertions in both pins unchanged; `fieldOutcomesFor` (:363-388), the
  projection site (:417), payload types, `noProposals` reasons, `proposals: []`
  semantics, and the other 19 tests untouched.
- No fixture swap, no `reload()` call — the loader cache is read as loaded
  (SpecSheetFieldMaps caches at module load; this unit does not touch it).

## 3. GREEN with product file at HEAD (AC1)

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests) 26ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  22:44:24
   Duration  1.57s (transform 56ms, setup 0ms, collect 97ms, tests 26ms, environment 0ms, prepare 103ms)

21/21 — assertions added, not tests (still 21).

## 4. MUTATION PROBE — the pin now has teeth (AC2, non-vacuity)

Mutant re-applied verbatim at SpecSheetExtractor.ts:422 (`fieldOutcomes,` ->
`fieldOutcomes: [],`), ONE line, nothing else. Raw output:

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ❯ src/ingestion/SpecSheetExtractor.test.ts  (21 tests | 2 failed) 40ms
   ❯ src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — zero proposals returns typed no-proposals > returns noProposals with reason no_field_match when text has no matching Key:Value lines
     → expected [] to deeply equal [ 'display_name', 'vendor', …(7) ]
   ❯ src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — zero proposals returns typed no-proposals > returns noProposals with reason empty_document when fetched text is empty
     → expected [] to deeply equal [ 'display_name', 'vendor', …(7) ]

⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — zero proposals returns typed no-proposals > returns noProposals with reason no_field_match when text has no matching Key:Value lines
AssertionError: expected [] to deeply equal [ 'display_name', 'vendor', …(7) ]

- Expected
+ Received

- Array [
-   "display_name",
-   "vendor",
-   "capacity.max_well_volume_uL",
-   "physical_geometry.well_length_mm",
-   "physical_geometry.well_width_mm",
-   "physical_geometry.well_depth_mm",
-   "topology.addressing",
-   "topology.rows",
-   "topology.columns",
- ]
+ Array []

 ❯ src/ingestion/SpecSheetExtractor.test.ts:389:48
    387|     const declared = (await getSpecSheetFieldMap('labware')).fieldMapp…
    388|     const outcomes = (result as any).fieldOutcomes as Array<{ targetFi…
    389|     expect(outcomes.map((o) => o.targetField)).toEqual(declared); // e…
       |                                                ^
    390|     expect(outcomes.every((o) => o.status === 'not_present')).toBe(tru…
    391|     expect(outcomes.every((o) => !('passage' in o))).toBe(true); // no…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — zero proposals returns typed no-proposals > returns noProposals with reason empty_document when fetched text is empty
AssertionError: expected [] to deeply equal [ 'display_name', 'vendor', …(7) ]

- Expected
+ Received

- Array [
-   "display_name",
-   "vendor",
-   "capacity.max_well_volume_uL",
-   "physical_geometry.well_length_mm",
-   "physical_geometry.well_width_mm",
-   "physical_geometry.well_depth_mm",
-   "topology.addressing",
-   "topology.rows",
-   "topology.columns",
- ]
+ Array []

 ❯ src/ingestion/SpecSheetExtractor.test.ts:416:48
    414|     const declared = (await getSpecSheetFieldMap('labware')).fieldMapp…
    415|     const outcomes = (result as any).fieldOutcomes as Array<{ targetFi…
    416|     expect(outcomes.map((o) => o.targetField)).toEqual(declared); // e…
       |                                                ^
    417|     expect(outcomes.every((o) => o.status === 'not_present')).toBe(tru…
    418|     expect(outcomes.every((o) => !('passage' in o))).toBe(true); // no…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed (1)
      Tests  2 failed | 19 passed (21)
   Start at  22:44:40
   Duration  627ms (transform 64ms, setup 0ms, collect 95ms, tests 40ms, environment 0ms, prepare 65ms)

FAIL as required — and the failure names the empty outcome list
(`expected [] to deeply equal [9 declared fields]`) at the new toEqual assertion
in BOTH pins, not any unrelated assertion.

## 5. Revert — product file back to HEAD, proven

$ git checkout -- server/src/ingestion/SpecSheetExtractor.ts
$ git -c core.fileMode=false status --short
 M server/src/ingestion/SpecSheetExtractor.test.ts        (the committed test file — see below)
(no server/src/ingestion/SpecSheetExtractor.ts entry; at the moment of this
proof the test file was the only modification and was committed as step (1)
immediately after)
$ git diff --stat HEAD -- server/src/ingestion/SpecSheetExtractor.ts
(empty)
$ git diff --numstat HEAD -- server/src/ingestion/SpecSheetExtractor.ts
(empty)

## 6. Restored-state GREEN 21/21 (final exit state of the test file)

$ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests) 28ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  22:44:49
   Duration  1.62s (transform 54ms, setup 0ms, collect 74ms, tests 28ms, environment 0ms, prepare 57ms)

## 7. Loader regression — cache/fixtures not disturbed

$ cd server && npx vitest run src/ingestion/SpecSheetFieldMaps.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 28ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  22:44:55
   Duration  1.09s (transform 41ms, setup 0ms, collect 71ms, tests 28ms, environment 0ms, prepare 110ms)

Typecheck: NOT run — not required (no `.ts` signature change; product file
reverted, never committed).

## 8. Line count of the test diff — counting method: `git diff --numstat`
(blank lines NOT excluded; measured after the test commit, base = cfc9901b)

$ git -c core.fileMode=false diff --numstat cfc9901ba060a02a1f144f9247d9a11e79a1fb0e...HEAD -- server/src/ingestion/SpecSheetExtractor.test.ts
10	0	server/src/ingestion/SpecSheetExtractor.test.ts

Test diff = 10 insertions / 0 deletions (5 lines x 2 pins). Output budget
(files <= 2, lines <= 50): owned code diff is 1 file / 10 lines; the second owned
file is this report (new evidence file, not counted as code-diff lines).
Product code: 0 lines changed (mutant applied twice, reverted twice, never
committed).

## 9. AC mapping

- AC1: with the product file at HEAD, SpecSheetExtractor.test.ts is 21/21 green
  -> PASS (section 3 and section 6).
- AC2: with `fieldOutcomes: [],` at SpecSheetExtractor.ts:422 the file FAILS and
  the failure names the empty outcome list -> PASS (section 4, raw output above).
- AC3: the expected field list is data, read through
  `getSpecSheetFieldMap('labware').fieldMappings.map((m) => m.targetField)`;
  no field-name literal array appears in the diff -> PASS (section 2, numstat
  above shows the only added identifiers are `declared`/`outcomes` and the
  status token 'not_present').

## 10. Scope compliance

- Owned files (exactly): server/src/ingestion/SpecSheetExtractor.test.ts (10/0)
  + this report. Prohibited files untouched (SpecSheetFieldMaps.ts, schema/**,
  app/src/shared/api/client.ts, predecessor report, handlers, documentIntake,
  pipelines, ai). No D2 edit (predecessor report's arithmetic is a
  paperwork-fixer obligation, not this unit).
- Commits for this unit: (1) cdee80c3 test assertions; (2) this report; (3)
  marker correction to the final sha. No `git reset` / `--amend` / `rebase`.

L2-NOUN-FROM-DOC-1 UNIT 1 DONE 03bf3fbf1a4c19b42be4b9228279527d68e30149 (report contained at this sha)
