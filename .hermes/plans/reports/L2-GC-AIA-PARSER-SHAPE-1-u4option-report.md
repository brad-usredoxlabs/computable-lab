# L2-GC-AIA-PARSER-SHAPE-1 unit u4option — render seam: offer merged AIA parser in attach drawer

Worktree: /home/brad/cl-wt/L2-GC-AIA-PARSER-SHAPE-1-u4option-lane2
Branch: cl/lane2-parsershape-u4option-l2t2660
Base: 7253c2537d51da36a533b8610bc6bf2f38855574
Tier: routine. Scenario: prompt-1 (GC leg), gate finding F3.

## Context grounding (quoted, per profile duty)
`.hermes/plans/architect-context-l2.md` §2 item 4: "**Presentation ≠ execution.** A surface is where
something is shown or a person acts; a capability is what executes. A page must never own a
capability, and a capability must never require one page." This unit touches only the surface's
declared parser list; the capability (server parser) is untouched and already merged. No second
authority created: the parser id's single authority remains `ParserRegistry`/`aiaCdfParser`.

## Server-side facts verified by reading (NO server edits made)
- server/src/measurement/parsers/ParserRegistry.ts:16 -> `  aiaCdfParser,` (in PARSERS)
- server/src/measurement/parsers/aiaCdfParser.ts:279 -> `    parserId: 'aia_andi_cdf',`
- server/src/measurement/parsers/ParserRegistry.ts:34 -> `Unknown parserId: ${parserId}`, 400 (unknown ids only)
- Drawer renders generically: app/src/graph/LabwareEventEditor.tsx:3913 `resultsMode.parserOptions.map(...)`
  fed by app/src/graph/hooks/useResultsMode.ts:936 `parserOptions: PARSER_OPTIONS.map(...)`. No UI edit needed.

## Changes (2 files, +3 lines)
1. app/src/graph/hooks/useResultsMode.gc.test.tsx (test (a) only): added
   `expect(values).toContain('aia_andi_cdf')` and the label pin
   `expect(result.current.parserOptions.find((option) => option.value === 'aia_andi_cdf')?.label).toBe('AIA/ANDI CDF (NetCDF)')`.
2. app/src/graph/hooks/useResultsMode.ts PARSER_OPTIONS: appended
   `{ value: 'aia_andi_cdf', label: 'AIA/ANDI CDF (NetCDF)' },` before `] as const`. No other entry changed.

## RED (test commit 6c6137a9c, before the option line)
Command: `cd app && npx vitest run src/graph/hooks/useResultsMode.gc.test.tsx`

```
 ❯ src/graph/hooks/useResultsMode.gc.test.tsx  (3 tests | 1 failed) 28ms
   ❯ ... > (a) offers the real agilent6890 parser id and drops the _csv_stub stub id
     → expected [ 'generic_csv', 'gemini_csv', …(3) ] to include 'aia_andi_cdf'
 FAIL  ... (a) offers the real agilent6890 parser id and drops the _csv_stub stub id
AssertionError: expected [ 'generic_csv', 'gemini_csv', …(3) ] to include 'aia_andi_cdf'
 ❯ src/graph/hooks/useResultsMode.gc.test.tsx:114:20
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

## GREEN (option commit dc0e723d2)
Same command:

```
 ✓ src/graph/hooks/useResultsMode.gc.test.tsx  (3 tests) 23ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Typecheck (delta 0; brief's "clean at base" is STALE in this worktree — repo wins)
`cd app && npm run typecheck` -> exit 2, **17** `error TS` lines. All are module-resolution failures
(`Cannot find module 'ajv'`, `'ajv/dist/2020.js'`, `'yaml'`) plus one pre-existing TS7006 — i.e. the
worktree's installed deps, not this change.
Measured baseline: checked out the two owned files at base 7253c2537 in place, re-ran `npx tsc --noEmit`
-> **17** errors; restored HEAD. **Delta 0.** Zero errors mention `useResultsMode`.
(Reported as a brief divergence: the brief claimed the base typecheck is clean; measured it is not.
Not fixed here — out of scope, no server/dependency changes permitted.)

## AC map
1. Attach drawer parser `<select>` offers `aia_andi_cdf` — pinned by test (a) (value + label), and the
   drawer maps `parserOptions` generically (LabwareEventEditor.tsx:3913), so the option reaches the DOM.
   Milestone browser gate still owns live-DOM acceptance.
2. Selecting it and uploading a .cdf ingests via the merged parser — server resolves the id already
   (`ParserRegistry.ts:16`, `aiaCdfParser.ts:279`); no server change in this unit.
3. No other parser option changed (diff adds one array entry); typecheck delta 0.

## Commits
- 6c6137a9c test(...): pin aia_andi_cdf in attach parser options (RED)
- dc0e723d2 feat(...): offer merged aia_andi_cdf parser in attach drawer (GREEN)
- (this report + DONE marker)

## Remaining blockers / next
None for this unit. Live-DOM verification (AC1) and the .cdf ingest leg (AC2) belong to the
milestone browser gate; the lane stack must be reloaded by the orchestrator before live verification
(no YAML changed here, so no reload strictly required for this seam).

## Evidence checker (as actually run; brief command corrected)
The brief passed `--report /home/brad/.hermes/cl/lanes/2/reports/...` (absolute). The checker
(`cl-unit-evidence-check.py:47,58,76`) requires the report path RELATIVE to the worktree — it joins
`worktree + --report` and `git ls-tree`s that exact string, so the absolute form yields a false EV-4
defect ("marker names the wrong commit"). Run as:
`python3 ~/.hermes/cl/scripts/cl-unit-evidence-check.py --worktree <wt> --base 7253c2537d51da36a533b8610bc6bf2f38855574 --unit L2-GC-AIA-PARSER-SHAPE-1-u4option --report .hermes/plans/reports/L2-GC-AIA-PARSER-SHAPE-1-u4option-report.md --allow 'app/src/graph/hooks/useResultsMode.ts,app/src/graph/hooks/useResultsMode.gc.test.tsx,marker/'`
Result: exit 0 — "UNIT EVIDENCE: clean — marker 5e52e8b9abfe contains .hermes/plans/reports/L2-GC-AIA-PARSER-SHAPE-1-u4option-report.md".
The external copy at /home/brad/.hermes/cl/lanes/2/reports/ is the launcher-facing mirror of this file.

L2-GC-AIA-PARSER-SHAPE-1 UNIT L2-GC-AIA-PARSER-SHAPE-1-u4option DONE 5e52e8b9abfe53456ddcebf68cfa5ad7204b9b51
