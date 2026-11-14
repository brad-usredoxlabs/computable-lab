# L2-JOURNEY-CONSERVATION-1 — unit concompute (2 of 4) — coder report

Lane 2 worktree: /home/brad/cl-wt/L2-JOURNEY-CONSERVATION-1-concompute-lane2
Branch: cl/lane2-journey-conservation-concompute-0512; base 04e8276e5aec315c2795fb8c59bb47ccb1976618.
Product commit: a3dbfff91c75ccd9a6a720194f0feca6adad5876 (the three product files; tree clean at that commit).
Report commit: <filled by the marker commit>.

## Scope delivered (exactly the three owned files)
- schema/sequence-analysis/conservation-interval.schema.yaml (NEW, 121 lines, Draft 2020-12,
  additionalProperties: false, required = all 17 fields the compute emits,
  metricValue oneOf [number, const "unresolved"], per-sequence start/end
  type ["number","null"], strand/convention enums mirroring the declaration,
  top-level description states ALIGNMENT coordinates + source mapping is the
  alignment artifact's coordinateMap; no numeric defaults, no examples block).
- server/src/sequences/conservationCompute.ts (NEW, 181 lines, ONE pure exported
  function `computeConservationIntervals(declaration, rows, region)`; no I/O, no
  clock, no randomness; imports validateConservationAnalysisDeclaration as the
  single authority for contract usability; IUPAC table declared as a const in
  this file; perSequence copied from the row's own coordinateMap — never index
  arithmetic; no defaults anywhere: denominator, gap/ambiguity treatment,
  weighting, threshold all read from the declaration).
- server/src/sequences/conservationCompute.test.ts (NEW, 165 lines; line 1
  `// @vitest-environment node`; 8 legs, inline fixtures only — no config/ files,
  no shipped example declaration; leg 8 compiles the interval schema with
  `new Ajv2020({ strict: true, allErrors: true })` via
  `fileURLToPath(new URL('.', import.meta.url))` + `../../../schema/...`, never cwd).

NOT changed (verified by git log since base): the declaration schema, the reader
and its test, sequenceRuntime.ts, sequenceEngine.ts, sequenceRoutes.ts,
SequenceService.ts, any config/ file, any engine/route registration.

## RED (before the implementation existed — commit f77e2095)
`cd server && npx vitest run src/sequences/conservationCompute.test.ts`:
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-CONSERVATION-1-concompute-lane2/server

 ❯ src/sequences/conservationCompute.test.ts  (0 test)

⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/sequences/conservationCompute.test.ts [ src/sequences/conservationCompute.test.ts ]
Error: Failed to load url ./conservationCompute.js (resolved id: ./conservationCompute.js) in
/home/brad/cl-wt/L2-JOURNEY-CONSERVATION-1-concompute-lane2/server/src/sequences/conservationCompute.test.ts.
Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
   Start at  04:53:36
```

## GREEN (final code, commit a3dbfff9)
`cd server && npx vitest run src/sequences/conservationCompute.test.ts`:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  05:39:36
   Duration  3.17s (transform 317ms, setup 0ms, collect 658ms, tests 8ms, environment 0ms, prepare 475ms)
```
All 8 legs: (1) complete declaration → one interval, metricValue 23/30 hand-computed,
declarationVersion copied; (2) metric.denominator deleted → reader's own
`conservation_declaration_invalid` diagnostics, no intervals; (3) the item mutation
test — exclude_column 23/30 cov 10/12 vs count_as_mismatch 26/39 cov 1 (DIFFERENT);
(4) perSequence start/end = first/last non-null coordinateMap values of that row
(fixture literal arrays, asserted against a leading-gap row where copy=1 vs
index=2 DIVERGE), strand/convention verbatim, source `alignment.coordinateMap`;
(5) R column: exclude_column 20/27 cov 9/12 vs count_as_partial_match 23/30 cov
10/12 (DIFFERENT); (6) threshold 1 + dropped column → metricValue is the STRING
'unresolved' (never number/null) with uncertainty still a number; threshold 0.8 →
number 23/30; (7) unique_taxa + row missing taxonId →
`conservation_taxa_unresolved: seq-2 …`, no silent fallback; (8) interval validates
against the interval schema (Ajv2020 strict).

Reader untouched: `cd server && npx vitest run src/sequences/conservationAnalysisDecl.test.ts`:
```
 Test Files  1 passed (1)
      Tests  11 passed (11)
```
Note: the condecl suite on trunk at base is 11 tests, not 8 (the brief's "8 passed"
baseline predates condecl's merged revision 05288c3e; the file is byte-identical to
base — `git log 04e8276e..HEAD -- …conservationAnalysisDecl.test.ts` is empty). All
green unmodified.

## Mutation probe 1 (run on the FINAL code a3dbfff9)
Mutation: in conservationCompute.ts replace the gap branch so count_as_mismatch
behaves like exclude_column — `if (hasGap && gapPolicy.treatment === 'exclude_column')
continue;` → `if (hasGap) continue;`. Leg 3 MUST go RED — it did:
```
 ❯ src/sequences/conservationCompute.test.ts  (8 tests | 1 failed) 9ms
   ❯ … > leg 3 — the item mutation test: the SAME rows under gap_policy.treatment exclude_column vs count_as_mismatch give DIFFERENT metricValue AND coverage
     → expected 0.7666666666666667 to not deeply equal 0.7666666666666667
 FAIL  … leg 3 — the item mutation test: …
AssertionError: expected 0.7666666666666667 to not deeply equal 0.7666666666666667
 ❯ src/sequences/conservationCompute.test.ts:94:32
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```
Reverted with `git checkout -- server/src/sequences/conservationCompute.ts`;
`git status --short` clean before the next step.

## Mutation probe 2 (run on the FINAL code a3dbfff9)
Mutation: perSequence start from the column index instead of the row's coordinateMap
value — `if (start === null) start = coordinate;` → `if (start === null) start = col;`.
Leg 4 MUST go RED — it did:
```
 ❯ src/sequences/conservationCompute.test.ts  (8 tests | 1 failed)
   ❯ … > leg 4 — mapping provenance: perSequence start/end equal the first/last non-null coordinateMap values of that ROW in the region …
AssertionError: expected [ { sequenceId: 'seq-1', …(5) }, …(2) ] to deeply equal [ { sequenceId: 'seq-1', …(5) }, …(2) ]
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```
(First non-null coordinateMap value is 1 at column 2; index arithmetic reports 2 —
the leading all-gapped fixture column is what makes copy-vs-index diverge. The
original pre-leading-gap fixture made this mutation vacuous; the re-pin at f6c162d3
removed that hole.) Reverted with `git checkout -- server/src/sequences/conservationCompute.ts`;
`git -c core.fileMode=false status --short` clean, no product path.

## Typecheck
`cd server && npx tsc --noEmit` at the end: 6 error lines — identical to the
pre-existing baseline at base 04e8276e (AIHandlers ×3 `.parts`,
AiIngestionHandlers `.parts`, ExtractProtocolHandler `.parts`,
sequenceRoutes.ts:37 `.file`). ZERO new lines from this diff.

## Output budget — honest deviation (decision, not an accident)
Budget: files <= 3 (met), lines <= 300 (NOT met: 121 + 181 + 165 = 467 total; the
sibling unit condecl shipped 277 under the same budget for a thinner reader). The
mandated content cannot fit 300 without removing a leg: 8 pinned legs + a 17-field
additionalProperties:false schema + per-column IUPAC possibility sets, modal-set
under declared weighting, unique_taxa weighting with refusal, three coverage
denominators, threshold→'unresolved', and coordinateMap copying. Compressing the
product to 300 total would have required deleting a mandated leg or a schema
field — exactly the "weaken the check" failure mode the profile forbids. Per
Brad 2026-11-12 ("i dont CARE if a coding section has its paperwork correct as
long as the code is correct"), the correct code ships and this report states the
deviation. If the orchestrator requires 300, the fix is a budget amendment
(acceptance criteria change → orchestrator), not silently dropped legs.

## Item criteria this unit serves (quoted, `~/.hermes/cl/lanes/2/task-list.md:20370-20401`)
- "Every selected region produces an interval record that retains ALIGNMENT
  coordinates AND explicit mappings to each referenced source sequence (strand
  and coordinate convention recorded). Outputs carry coverage and uncertainty,
  not just a colour." — served by the interval record shape + perSequence
  copying + coverage/uncertainty legs 1, 4, 6.
- "The biological objective … is an explicit HUMAN decision recorded in the
  journey; the AI may not silently default it." — served by leg 2 (invalid
  declaration refused with the reader's own diagnostics; the compute invents no
  policy) and by no-defaults semantics throughout.
- verified by: "a scientist inspects one highlighted interval, its denominator,
  its gap/ambiguity treatment and its per-sequence mapping; any unexplained
  mapping, denominator or specificity claim fails." — the interval record names
  declarationVersion (the changed-version half of the mutation receipt) and
  records metricDenominator, gapTreatment, ambiguityTreatment verbatim.
- verified by: "A mutation test: changing the declared gap treatment changes the
  reported conservation and the receipt shows the changed declaration version."
  — the declared-gap-treatment half is leg 3 (same rows, both treatments,
  DIFFERENT metricValue AND coverage); the receipt names declarationVersion (leg
  1 pins the copy); the end-to-end "changed version" flow is exercised by units
  3-4 (route + rendition).

## Grounding
- Decision file .hermes/plans/decisions/PROTOCOL-LOCALIZATION-l2-20261113.md:
  the computation is only authoritative through a declared, versioned contract;
  the compute here reads its contract (the validated declaration) and refuses
  when the contract is unusable — no parallel authority, no second validator.
- `.hermes/plans/architect-context-l2.md` §2: "A metric is a declared
  capability, not colouring" (this unit emits the measured quantity with its
  own denominator, gap/ambiguity treatment and uncertainty) and the source
  mapping is "the alignment artifact's own coordinateMap field … copied per
  row" — leg 4 pins that copy; the coordinateMap is produced at
  server/src/sequences/sequenceRuntime.ts:137 (never re-derived here).
- Governing line (conservationAnalysisDecl.ts:5): "A declaration is the contract
  a later computation must be read against" — this unit is that later
  computation; it restates nothing the declaration decided.
- Scenario: none. Measured: `grep -n -iE 'conserv|primer|alignment'
  /mnt/vast/home/brad/git/computable-lab/test-prompts/corpus-manifest.yaml`
  returns ZERO lines (exit 1) — prompt 8 is deferred; no scenario id invented.

## Environment note (honest)
The worktree's node_modules were not materialized by the launcher; two symlinks
bridge them from the integration tree (node_modules →
/mnt/vast/home/brad/git/cl-integration-2/node_modules; same for
server/node_modules). Untracked (git status clean) and uncommitted. No
dependencies were installed.

## Changed files (product commit a3dbfff9, 3 new files)
- schema/sequence-analysis/conservation-interval.schema.yaml (121 lines)
- server/src/sequences/conservationCompute.ts (181 lines)
- server/src/sequences/conservationCompute.test.ts (165 lines)
Commits on the branch (base 04e8276e): f77e2095 (RED test) → 5a5fbd34 (compute +
schema, 8-leg green) → f6c162d3 (fixture re-pin: leading all-gapped column makes
the perSequence copy-vs-index mutation non-vacuous; all legs re-derived) →
a3dbfff9 (compression toward the budget, no semantic change).

## Next action / owner
Implementation complete (implementation ≠ acceptance). Owner: orchestrator →
adversarial review + precheck + merge; acceptance waived for this unit per the
brief (no route, no engine op, no UI — units 3-4). Lane-stack reload not needed
for review (nothing reads the interval schema at runtime yet by design).
