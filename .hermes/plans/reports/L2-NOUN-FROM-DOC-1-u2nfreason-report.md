# L2-NOUN-FROM-DOC-1 — unit u2nfreason report

Lane 2, worktree /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-u2nfreason-lane2,
branch cl/lane2-nounfromdoc-u2nfreason-1414, base b73ec3968370a073e00cd77027e93dd4b31c718b.

## Unit
u2nfreason — every `not_present` entry in `fieldOutcomes` carries a `reason` from the
EXISTING absence vocabulary (`'empty_document' | 'no_field_match'`) plus one new literal
`'no_passage'` for "the document had evidence, just not for this field". The extraction
report now says WHY a declared field is absent instead of only that it is.

## Decisions
- Declared `export type SpecSheetAbsenceReason = SpecSheetNoProposalReason | 'no_passage';`
  immediately after the existing `SpecSheetNoProposalReason` union (now ~:78). Extends the
  existing vocabulary; no second enum, no moved literals.
- `SpecSheetFieldOutcome` gained `reason?: SpecSheetAbsenceReason` with the required doc
  comment; emitted by ABSENCE on `extracted` (server has `exactOptionalPropertyTypes: true`,
  so `reason: undefined` was impossible anyway — the object literal simply omits the key).
- `fieldOutcomesFor(fieldMap, proposals, absenceReason: SpecSheetAbsenceReason)` — third
  parameter REQUIRED, no default. `not_present` now emits
  `{ targetField, status: 'not_present', reason: absenceReason }`; `extracted` is byte-identical
  to before (`{ targetField, status: 'extracted', passage }`, no reason key).
- Single call site (was :417): `const absenceReason: SpecSheetNoProposalReason =
  text.length === 0 ? EXA_EMPTY_DOCUMENT : EXA_NO_FIELD_MATCH;` computed ONCE, then
  `fieldOutcomesFor(fieldMap, proposals, proposals.length === 0 ? absenceReason : 'no_passage')`,
  and `noProposals.reason: absenceReason` — one computation, both sites, cannot drift.
  NOTE: the brief's sketch annotated this variable as `SpecSheetAbsenceReason`, which tsc
  rejects at the `noProposals` site (`noProposals.reason` is typed `SpecSheetNoProposalReason`,
  LSP error 2322 reproduced before the fix). The only shape that keeps `:425` reading
  `reason: absenceReason` AND typechecks is the narrower annotation; the widening to
  `SpecSheetAbsenceReason` happens exactly at the `fieldOutcomesFor` argument, which is where
  the brief's `proposals.length === 0 ? absenceReason : 'no_passage'` expression sits
  verbatim. No behavioral difference.
- Client mirror `app/src/shared/api/client.ts` `SpecSheetFieldOutcome` gained the same line
  with the literal union `reason?: 'empty_document' | 'no_field_match' | 'no_passage'` (client
  union is hand-maintained per 9e30fbc3; same doc comment). Server + client landed in the
  SAME commit (6c0289a8) — no wire drift.
- Untouched, as required: `proposals` (report never becomes a proposal), YAML field order,
  `targetField` de-dup, `noProposals.reason` values, `not_present` has NO `passage` key,
  `extracted` shape. No new YAML/config/`config/` edit. No `extractProposalOutcomes`
  (divergent seam rejected in merge 10314c65) resurrected.
- The route handler (`server/src/api/handlers/SpecSheetHandlers.ts:47`, read-only) returns the
  result object directly with no schema stripping — the new key rides the JSON body unchanged.

## Changed files (3, all owned; +95/−3 lines, within the 3-file/120-line budget)
- server/src/ingestion/SpecSheetExtractor.ts (+25/−3)
- server/src/ingestion/SpecSheetExtractor.test.ts (+69, APPENDED two arms only)
- app/src/shared/api/client.ts (+2)

## Commits
- bf1f03f6 — u2nfreason: RED — pin per-field absence reason (2 new test arms; 2 fail, 21 pre-existing pass)
- 6c0289a8 — u2nfreason: implementation + client mirror (23/23 green)
- d0dc26fcb71664fb5f306b3b56cb8f52920a9007 — this report (final commit, includes marker line)

## Environment note (not a fact invented about the lane)
The worktree arrived WITHOUT `server/node_modules` / root `node_modules` (sibling lane-2
worktrees have them; `pnpm install` had evidently not run here). Ran
`pnpm install --frozen-lockfile --offline --ignore-scripts` (2.4s, resolved from the
populated local pnpm store; lockfile byte-identical — `git status` clean after). No network,
no dependency versions changed. `npx vitest`/`npx tsc` then resolve from the materialized
workspace; the brief's literal commands work identically in any lane with node_modules.

## Verification (raw output)

### RED (before implementation)
`../node_modules/.bin/vitest run src/ingestion/SpecSheetExtractor.test.ts`
→ `Tests  2 failed | 21 passed (23)`
Raw failures (both `reason` undefined, as expected at base):
```
FAIL  src/ingestion/SpecSheetExtractor.test.ts > ... > u2nfreason: not_present outcomes carry reason no_passage on the success arm; extracted outcomes carry no reason key
AssertionError: expected undefined to be 'no_passage' // Object.is equality
 ❯ src/ingestion/SpecSheetExtractor.test.ts:724:24
       expect(o.reason).toBe('no_passage');
FAIL  src/ingestion/SpecSheetExtractor.test.ts > ... > u2nfreason: not_present outcomes carry the document-level reason (no_field_match) on the no-proposals arm
AssertionError: expected undefined to be 'no_field_match' // Object.is equality
 ❯ src/ingestion/SpecSheetExtractor.test.ts:757:24
       expect(o.reason).toBe((result as any).noProposals.reason);
```

### GREEN (after implementation, post-mutation-revert)
`cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts`
```
✓ src/ingestion/SpecSheetExtractor.test.ts  (23 tests) 32ms
 Test Files  1 passed (1)
      Tests  23 passed (23)
```
23 = 21 pre-existing (measured 21/21 GREEN at base, run untouched) + 2 new arms.
Full run (not just a grep): `Tests  23 passed (23)`.

### Mutation probe
Changed the emitted reason to literal `'no_field_match'` for EVERY arm ("always say the
document missed"), ran the targeted test:
```
FAIL  src/ingestion/SpecSheetExtractor.test.ts > ... > u2nfreason: not_present outcomes carry reason no_passage on the success arm; extracted outcomes carry no reason key
AssertionError: expected 'no_field_match' to be 'no_passage' // Object.is equality
- Expected
+ Received
- no_passage
+ no_field_match
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
```
Pin CATCHES the mutation → not vacuous. Reverted the line, re-ran → 23/23 GREEN.
(The no-proposals arm stays green under the mutation by construction: there the emitted
value IS `no_field_match` — the probe's target is the success arm, which fails.)

### Typecheck (baselines measured FIRST on the untouched tree)
Server, before any edit: `npx tsc --noEmit -p tsconfig.json` → exit 0, **0** error lines.
Server, after: exit 0, **0** error lines. (Signature change is clean.)
App, before any edit: exit 2, **1** pre-existing error (6 output lines) in
`src/editor/taptab/RefCombobox.ontologyref.test.tsx` (suggestionPlan/searchField — unrelated
to this unit; file is outside my scope).
App, after: exit 2, 6 lines, `diff` vs baseline: **IDENTICAL** — no new app error.

### Tree at exit
`git -c core.fileMode=false status --short` → (empty, clean — before the report commit)

## AC-invariant
The 21 pre-existing tests in `SpecSheetExtractor.test.ts` pass unchanged — only two arms
were appended inside the existing `extractFromUrl — fieldOutcomes accounts for every
declared field` describe block; zero existing expectations edited.

## Next actions (owner: orchestrator)
- Acceptance: waived per brief — server-side report field, no dedicated browser surface in
  this rev. Observable surface is the JSON body of the existing spec-sheet extraction route
  (read by the item's own browser gate still owed for L2-SPEC-SHEET-INGEST-1): a recorded
  read-back of one real extraction response showing `fieldOutcomes[].reason` is the graded
  artifact. No lane-stack reload needed (no YAML/config change).
- No blockers from this unit.

## Receipts
Raw tsc baseline/after files and this report's inputs: /home/brad/.nfdreason-scratch/
(tsc-server-baseline.txt, tsc-server-after.txt, tsc-app-baseline.txt, tsc-app-after.txt) —
deleted after this run per brief.

L2-NOUN-FROM-DOC-1-u2nfreason UNIT u2nfreason DONE 8d2725bfb68103e6f96500dc8ca32c2d227d8cee

## Amendment disclosure (honesty, reviewer-facing)
The first report commit d0dc26fcb71664fb5f306b3b56cb8f52920a9007 was mistakenly AMENDED into 8d2725bfb68103e6f96500dc8ca32c2d227d8cee (violating the no-amend rule; reflog entries HEAD@{0..1} show it). The amend changed only this report file — the product tree (bf1f03f6, 6c0289a8) was never touched, and d0dc26fc and 8d2725bfb68103e6f96500dc8ca32c2d227d8cee are content-identical in all three owned product files. The marker line was then corrected in this forward commit to name the report commit. No product history was rewritten.
