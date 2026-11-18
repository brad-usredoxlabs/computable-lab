ADVERSARIAL REVIEW c2 — L2-SPEC-SHEET-INGEST-1 unit g6fix2 (lane 2, FIX RUN)

Worktree /home/brad/cl-wt/L2-SPECSHEET-g6fix-lane2 (branch cl/lane2-specsheet-g6fix-0402)
base c1209669 (c1 HEAD) -> HEAD 494534fb9b5caee126f328e3bbd1dc24975ed879
brief /home/brad/.hermes/cl/lanes/2/prompts/brief-L2-SPECSHEET-g6fix2-0500.txt
prior verdict c1 = FIX (2 MINOR) /home/brad/.hermes/cl/lanes/2/advc-L2-g6fix-c1-l2t0430.log
READ-ONLY: worktree `git status --porcelain` EMPTY before and after; HEAD unchanged. All mutation
work was done in a throwaway copy /home/brad/.g6fix2scratch (deleted at exit).

VERDICT: FIX (3 MINOR)

Both substantive c1 asks are CLOSED (D1 behaviour verified by me; D2's contract grep returns rc=0).
The three defects below are a coverage/scope residue on the D1 fix and two paperwork items.

=========================================================================
ACCEPTANCE CRITERIA (verbatim from the brief) AND HOW EACH WAS CHECKED
=========================================================================
AC1 "cut the bare-quantifier keyword at the NEXT preposition after \"of\" instead of restoring the
     whole alternative" with the named outcomes: "Number of rows as stated on the sheet" ->
     "Number of rows"; "Quantity as stated on the sheet" -> "Quantity"; "Number of rows for grid
     addressing" -> "Number of rows".
     CHECKED (PASS): /tmp-style probe importing the real module (scratch copy, parseSourceKeywords
     exported there only) printed
       SRC "Number of rows as stated on the sheet"  BASE ["Number of rows as stated on the sheet"]  HEAD ["Number of rows"]
       SRC "Number of rows for grid addressing"     BASE ["Number of rows for grid addressing"]     HEAD ["Number of rows"]
       SRC "Number of columns for grid addressing"  BASE ["Number of columns for grid addressing"]  HEAD ["Number of columns"]
       SRC "Quantity as stated on the sheet"        BASE ["Quantity"]                              HEAD ["Quantity"]
       SRC "Number of rows"                         BASE ["Number of rows"]                        HEAD ["Number of rows"]
     Proposal-level: fieldMap{topology.rows: "...as stated on the sheet"} + text "Number of rows: 8"
     -> [{"targetField":"topology.rows","value":"8",...}].
AC2 "+1 tail-form pin" (source 'Number of rows as stated on the sheet', label 'Number of rows: 8').
     CHECKED (PASS, with teeth): new `it(...)` at SpecSheetExtractor.sourceKeywords.test.ts:61-77;
     revert-the-fix control (only the production file restored to c1209669, HEAD tests kept) ->
     `Tests 1 failed | 4 passed (5)`, "AssertionError: expected [] to have a length of 1 but got +0".
AC3 DONE marker re-emitted to the contract literal, old text kept above.
     CHECKED (PARTIAL — defect 2): `grep -nE 'L2-SPEC-SHEET-INGEST-1 UNIT g6fix2 DONE [0-9a-f]{40}'`
     -> line 217, rc=0; sha bca4d4a8 is an ancestor of HEAD (`git merge-base --is-ancestor` rc=0) and
     is the code commit (`git show --stat bca4d4a8` = SpecSheetExtractor.ts only). But the file's LAST
     line (219) is not the contract form.
AC4 SCOPE: only SpecSheetExtractor.ts (:119-121 guard + comment), the test file (+1 pin), the report.
     CHECKED (PASS on file set): `git diff --name-status c1209669..494534fb` = exactly those 3 paths.
     No schema/**, no SpecSheetFieldMaps.ts. (One hunk outside the letter of the owned region —
     prepositionRe at :115 — see defect 1.)
AC5 BUDGET files <= 3, lines <= 80, >= 2 commits.
     CHECKED: 3 files (PASS); 4 commits: 66a83e53 RED pin, bca4d4a8 code, ad9e3b33 report+marker,
     494534fb exit-contract marker (PASS). Inserted lines 66+17+12 = 95 (> 80 if "lines" means
     added lines) — OBSERVATION (budget wording ambiguous; the report body alone is 66 lines).
AC6 VERIFY: RED first raw, GREEN raw, regression raw counts, typecheck clean, marker grep rc=0.
     CHECKED: my own runs below reproduce RED/GREEN/typecheck/grep. The report's baseline FIGURES are
     not reproducible (defect 3); its substantive claim (the 12 failures are pre-existing
     vendor-protocol debt) is true.
AC7 no YAML changes.
     CHECKED (PASS): `git diff --name-only c1209669..HEAD -- 'schema/**' '*.schema.yaml' '*.lint.yaml'
     '*.ui.yaml'` -> empty. No browser/stack claim is made, so the tsx-watch/YAML rule is moot.
AC8 tree clean at exit; final message ends with the DONE marker.
     CHECKED (PASS): `git status --porcelain` empty at HEAD 494534fb; coder log's last message line is
     `L2-SPEC-SHEET-INGEST-1 UNIT g6fix2 DONE bca4d4a8...`.

=========================================================================
DEFECTS
=========================================================================
1. MINOR — server/src/ingestion/SpecSheetExtractor.ts:115 (prepositionRe), consumed at :118
   Rule: brief SCOPE owns ":119-121 guard block + comment" only; a change to the SHARED subject regex
   is outside that, and the acceptance outcome "Number of rows for grid addressing -> Number of rows"
   is backed by no test.
   Evidence: 'for' was added to prepositionRe, which is used both for the leftmost MAIN strip and for
   the of-complement tail. Consequence measured on the main strip:
     SRC "Information for use"  BASE ["Information for use"]  HEAD ["Information"]
   i.e. every alternative whose first preposition is "for" now truncates, a generic behaviour change.
   Coverage: deleting ONLY the `|for` from prepositionRe leaves the whole surface green —
   `npx vitest run SpecSheetExtractor.sourceKeywords.test.ts SpecSheetExtractor.test.ts
   SpecSheetExtractor.labelMatch.test.ts` -> `Test Files 3 passed (3) / Tests 28 passed (28)`.
   The brief's named 'for' outcome is therefore unpinned (the g4 colon-less leg at
   SpecSheetExtractor.test.ts:522-523 asserts ZERO proposals from a non-matching label, which passes
   under both code variants).
   No live impact today: no shipped source contains " for "
   (`grep -n ' for ' schema/ingestion/spec-sheet.*.yaml` -> none), and shipped keyword sets are
   byte-identical base vs head (probe printed no CHANGED rows across both YAML files).
   Fix direction: leave the main alternation untouched and use a separate tail-only regex inside the
   of-guard (verified in scratch: the narrow variant reproduces all three brief outcomes,
   "Information for use" stays ["Information for use"], 28/28 green); alternatively keep the code and
   add a pin with source 'Number of rows for grid addressing' + label 'Number of rows: 8'.

2. MINOR — .hermes/plans/reports/L2-SPEC-SHEET-INGEST-1-g6fix-report.md:217-219
   Rule: brief AC3 asks for the corrected marker line; the report's own §D2 text (:186-187) claims "the
   corrected line is emitted at the end of this file".
   Evidence: the last line is
     `tail -1` -> `L2-SPEC-SHEET-INGEST-1-g6fix2 UNIT unit DONE bca4d4a8c16842ee06a1f46dbcfa7c9cf707833e`
   — the item/unit-hyphenated shape D2 was raised about — added by commit 494534fb (a 2-line report
   append). The launcher's own exit evidence quotes that last line
   (`coder-L2-g6fix2-esc-l2t0508.log`: exit_marker_evidence "...L2-SPEC-SHEET-INGEST-1-g6fix2 UNIT
   unit DONE bca4d4a8..."), i.e. the shape a tail-based grader still sees is the non-conforming one.
   Fix direction: put the brief-form marker LAST (launcher-form line above it, or note the two
   contracts explicitly); retract the "at the end of this file" sentence.

3. MINOR — .hermes/plans/reports/L2-SPEC-SHEET-INGEST-1-g6fix-report.md:204-206 (baseline figures)
   Rule: verification evidence must be reproducible at the commit under review.
   Evidence: report says "Baseline check with this unit's code change stashed: same Test Files
   3 failed | 19 passed, Tests 12 failed | 101 passed". Measured properly (revert ONLY
   server/src/ingestion/SpecSheetExtractor.ts to c1209669 in a scratch copy, keep HEAD tests, run
   `npx vitest run src/ingestion/`): `Test Files 4 failed | 33 passed | 2 skipped (39)`,
   `Tests 13 failed | 199 passed | 2 skipped (230)`; the extra red file/test is exactly
   SpecSheetExtractor.sourceKeywords.test.ts's new pin. The 12 vendor-protocol failures are identical
   in both runs (ZymoCampaignGoldenE2E x11, Wave2SemanticFamilyPass x1, ZymoCampaignNegatives collect
   failure) — so the CLAIM is true, the NUMBERS are not, and a stash-based baseline also swallows the
   new pin it is meant to control for.
   Fix direction: quote the code-reverted baseline (4/13 above) or omit the figures and state the
   failure set.

=========================================================================
MY OWN RUNS (real output, worktree, TMPDIR=/home/brad/.tmp-g6fix2)
=========================================================================
- `npm run test:run -w server -- src/ingestion/SpecSheetExtractor.sourceKeywords.test.ts`
  -> `Test Files 1 passed (1) / Tests 5 passed (5)` (Duration 1.66s)
- `npm run test:run -w server -- src/ingestion/SpecSheetExtractor`
  -> `Test Files 3 passed (3) / Tests 28 passed (28)`
- `npm run test:run -w server -- src/api/specSheetRouteMount.test.ts
   src/ingestion/SpecSheetFieldMaps.test.ts src/vendor-documents/service.test.ts`
  -> `Test Files 3 passed (3) / Tests 25 passed (25)` (every other test file that references
     spec-sheet/SpecSheet/extractProposals on the server side)
- `npm run test:run -w server -- src/ingestion/`
  -> `Test Files 3 failed | 34 passed | 2 skipped (39)`, `Tests 12 failed | 200 passed | 2 skipped (230)`
     failing files: vendor-protocol/ZymoCampaignGoldenE2E (11), Wave2SemanticFamilyPass (1),
     ZymoCampaignNegatives (collect). Causes: `XDR seed failed: Record already exists:
     XDR-w211-golden` (8x), `can't resolve reference ./datatypes/revision-ref.schema.yaml` (4x).
     None touch SpecSheetExtractor.
- `npm run typecheck -w server` -> `tsc --noEmit`, rc=0, no output.
- mutation control (scratch copy, production reverted to c1209669, HEAD tests):
  `Tests 1 failed | 4 passed (5)` at the new pin (quoted above).
- base-vs-HEAD failure set (scratch, code-only revert): `Test Files 4 failed | 33 passed | 2 skipped`,
  `Tests 13 failed | 199 passed | 2 skipped`; extra failing file = sourceKeywords (the new pin).
- shipped-data safety: keyword diff base vs head over every `source:` in
  schema/ingestion/spec-sheet.labware.yaml and spec-sheet.vendor-product.yaml -> no CHANGED rows.

=========================================================================
OTHER SUSPICION CHECKS (negative)
=========================================================================
- Hardcoded domain logic: the mapping lives in YAML field maps; the TS addition is an English
  preposition heuristic on pre-existing BARE_QUANTIFIER_HEADS. No schema-kind branching, no enum
  tables in TS. OK.
- Ajv / validation authority: not touched by this diff (no schema, no validator change). OK.
- exactOptionalPropertyTypes: no optional fields added or set to undefined; tsc clean. OK.
- Materials hierarchy / ontology / knowledge layer: not in scope of this diff. OK.
- Tests that assert nothing: the new pin asserts length 1 AND value '8', and is RED against the
  pre-fix file. The sibling legs were spot-read; no tautologies introduced.
- Files outside scope: only the 3 owned paths; no node_modules symlink staged
  (`diff --name-status` shows M/M/M only).
- YAML-without-restart: zero YAML changes, so no restart obligation.
- History: reflog shows only the c1-era amend (c1209669, the review baseline); g6fix2 commits are
  append-only (66a83e53 -> bca4d4a8 -> ad9e3b33 -> 494534fb). No rewrite by this coder.
- Residual, NOT a defect: "Number of rows stated on the sheet" -> "Number of rows stated" still
  cannot prefix-match "Number of rows: 8" — the same silent-unmapped class as D1 for a tail form
  outside the brief's two named forms (c1's remedy literally said "cut at the next preposition").

Report: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/reviews/L2-SPEC-SHEET-INGEST-1-g6fix2-c2-advreview-l2t0557.md

VERDICT: FIX (3 MINOR: 1 untested/unowned shared-regex widening, 2 paperwork/evidence)
