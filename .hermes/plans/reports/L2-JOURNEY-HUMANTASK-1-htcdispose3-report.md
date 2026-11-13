# L2-JOURNEY-HUMANTASK-1 / unit htcdispose3 — report

Worktree: /home/brad/cl-wt/L2-JOURNEY-HUMANTASK-1-htcschema-lane2
Branch: cl/lane2-journey-humantask-htcschema-2345
Item base: a4bcb39f; run started at HEAD 867d7edb (unit 2's own probe commit on
top of a4bcb39f), final HEAD 7f7017836a0a5cf843a9671d62be15be94811226.

## STEP 0 (predecessors present in THIS worktree)
- `schema/workflow/human-task.schema.yaml` present; `grep -c on_cancel` = 3,
  `grep -c on_defer` = 3 (on_cancel at :71, enum :73, on_defer :75, enum :77).
- `server/src/compiler/journey/humanTaskCompletion.ts` present (unit 2 committed).
- `humanTaskDisposition.ts` was absent — no partial work inherited.
- HEAD was 867d7edb rather than the brief's a4bcb39f: unit 2 added one probe
  commit (mutation-coverage fixture reversal in its own test). No predecessor
  file was edited; that is unit 2's scope.

## Committed types consumed (unit 2 wins over brief paraphrase)
Imported from `./humanTaskCompletion.js` (type-only import):
- `HumanTaskReceipt` — fields as committed: `kind: 'human-task-receipt'`,
  `task_id`, `record_id`, `member_refs[{record_id, revision_id}]`,
  `completed_at`, `schema_id`.
- `RECEIPT_KIND` is exported but NOT imported: the literal already lives in the
  `HumanTaskReceipt.kind` type, so importing it would be dead weight (no
  receipt is ever constructed here).
No other unit-2 symbol (`decideHumanTaskCompletion`) is called.

## Implementation
New `server/src/compiler/journey/humanTaskDisposition.ts` (112 lines):
- `decideHumanTaskDisposition({ task_id, disposition, contract, receipt? })`
  returns `{ ok:true, task_status:'cancelled'|'deferred', journey_continues }`
  or `{ ok:false, diagnostics:[{rule, task_id, message}] }`.
- Decision order: committed `receipt` present ->
  `journey_human_task_disposition_after_completion` (no status returned);
  disposition outside `'cancel'|'defer'` ->
  `journey_human_task_disposition_undeclared` naming the value; contract key
  (`on_cancel` for cancel, `on_defer` for defer) absent or outside
  `keep_journey_active|end_journey` -> same undeclared refusal naming the key
  and the found value. Never defaults `journey_continues`.
- Exhaustiveness: `STATUS_BY_DISPOSITION: Record<'cancel'|'defer', ...>` and
  `KEY_BY_DISPOSITION: Record<'cancel'|'defer', ...>` plus
  `CONTINUES_BY_DECLARED: Record<'keep_journey_active'|'end_journey', boolean>`
  — a third disposition or a third enum value is a compile error. Documented in
  the module docstring.
- Purity: no fs/store/clock/uuid. `receipt?: HumanTaskReceipt` is never
  assigned `undefined`; the input is only read via `!== undefined`, so
  `exactOptionalPropertyTypes` is respected without a conditional spread.
- Status vocabulary limited to `cancelled`/`deferred`; `JourneyNotReadyReason`
  untouched; no completion/receipt construction.

New `server/src/compiler/journey/humanTaskDisposition.test.ts` (99 lines,
`// @vitest-environment node` line 1): arms (a) cancel+keep, (b) cancel+end,
(c) defer+keep, (d) defer+end, (e) real `HumanTaskReceipt` value => refused,
no `task_status` key, (f) undeclared disposition `'resume'` => refused naming
`'resume'`, (g) absent `on_cancel` => refused (no default), (h) totality of
`DECLARED_JOURNEY_DISPOSITIONS` => `['cancelled','deferred']`.

Output budget: 2 files, 211 lines total (<= 220).

## Commits
- 6ddebf53 `humantask htcdispose3 step 1: RED tests for declared disposition decision (module absent)`
- 8de1d918 humantask htcdispose3 step 2: pure declared disposition decision (cancel/defer, receipt refuses)
- 7f701783 `humantask htcdispose3 step 2 fix: compact disposition tests to the output budget`

## Verification (exact results, this worktree)
- RED first: `npx vitest run src/compiler/journey/humanTaskDisposition.test.ts`
  -> `Failed to load url ./humanTaskDisposition.js ... Does the file exist?`,
  `Test Files 1 failed (1) / Tests no tests`.
- `cd server && npx vitest run src/compiler/journey/humanTaskDisposition.test.ts`
  -> `✓ ... (8 tests)`, `Test Files 1 passed (1) / Tests 8 passed (8)`.
- `cd server && npx vitest run src/compiler/journey`
  -> `Test Files 11 passed (11) / Tests 79 passed (79)` (includes unchanged
  humanTaskCompletion, humanTaskContract, journeyDocumentLint, journeyCompiler,
  journeyEnvelope suites).
- `cd server && npx tsc --noEmit; echo $?` -> `TSC_REAL_EXIT=0` (no output).
- `grep -n "Date.now|randomUUID|readFile|import .*store"
  server/src/compiler/journey/humanTaskDisposition.ts` -> no hits (exit 1).
- `git status --porcelain` at exit -> empty.

## Next actions / handoff
- Ready for adversarial/coder review of the two owned files only.
- Reviewer focus: refusal-before-status shape, absence of a fourth status
  vocabulary, undeclared-value messages quoting the offending value.
- No blockers.

L2-JOURNEY-HUMANTASK-1 UNIT htcdispose3 DONE e72a0814d3e71a4b222d6d8f48e0004a5d6c2202
