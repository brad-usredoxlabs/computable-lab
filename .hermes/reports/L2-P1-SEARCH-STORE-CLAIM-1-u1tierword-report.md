# L2-P1-SEARCH-STORE-CLAIM-1 u1tierword — report (lane 2)

Date: 2026-11-14 (EST)
Worktree: /home/brad/cl-wt/L2-P1-SEARCH-STORE-CLAIM-1-lane2
Branch: cl/lane2-search-store-claim-1-l2t2600, base deb71b2fde321b90182842c055287d36c296e140
Item: L2-P1-SEARCH-STORE-CLAIM-1 / unit u1tierword (1 of 1) / scenario prompt-1

## Outcome
DONE. One ternary branch in the offerability map: when `storeTier.status ===
'unavailable'` AND the entry does not declare `offerable: false`, `offer_reason`
now reads `lab store could not be read (<reason>) — stock unverified` instead of
the store-absence claim. When the store WAS searched, the old string is
byte-identical; the declared-`offerable: false` wording is untouched;
offerability verdicts are unchanged in every tier.

Grounding (architect-context-l2.md §0): "A search failure is not evidence that a
type must be created, and a search failure is not an absence. Report 'I could
not verify this product', never 'this product does not exist.'" The old wording
asserted "no record in the lab store" from a store that was never read.

## Commits (in order)
1. 8537d01b4 — RED: two new tests in labwareDefinitionSearch.test.ts
   (list() throws -> reason names 'store offline'; no store -> 'no-store'),
   asserting no hit claims "no record in the lab store" and a non-offerable
   hit names `stock unverified` + the store condition.
2. 974478b83 — GREEN: the fix in labwareDefinitionSearch.ts (7 insertions,
   1 deletion; file +8 lines).

## Files changed
- server/src/api/labwareDefinitionSearch.ts (the seam, ~:246-262)
- server/src/api/labwareDefinitionSearch.test.ts (+41 lines: one describe, 2 tests)
Budget: 2 files, ~49 added lines (<= 60).

## Verification (real outputs)
Baseline at base deb71b2fd (19 tests, before any change):
  `npx vitest run server/src/api/labwareDefinitionSearch.test.ts`
  -> Tests 19 passed (19)

RED (commit 8537d01b4, fix not yet applied):
  -> Tests 2 failed | 19 passed (21) — the two new pins failed at the
  `hits.every(...)` assertion (at base, all 19 non-offerable registry hits
  carry the "no record in the lab store" claim when the store is unavailable).

GREEN (commit 974478b83, final commit):
  -> Tests 21 passed (21), verified across 3 consecutive runs
  (last run 23:14:50 local; durations 9.1-11.3s each).

Typecheck at the final commit (no file changed after the check):
  `npm run typecheck -w server` -> exit 2 with EXACTLY the 6 pre-existing errors
  the brief lists: AIHandlers.ts(332,438,716) TS2339 'parts',
  AiIngestionHandlers.ts(291) TS2339 'parts',
  ExtractProtocolHandler.ts(63) TS2339 'parts',
  sequenceRoutes.ts(37) TS2339 'file'. Zero new errors.

Pre-existing test file pins kept green verbatim: AC2 no-store test
(storeTier {status:'unavailable', reason:'no-store'}, hits > 0) and AC2
list()-throws test (reason 'store offline') — both untouched.
AC2-searched pins (deepwell 'no'+'store' wording, store-backed offerable,
declared-off wording) — untouched and green.

## Environment notes (disclosed)
- Worktree had no node_modules; per prior lane practice (see persistence log,
  L2-P1-SEED-ENTRY-1 regflag) I symlinked node_modules + server/node_modules to
  /mnt/vast/home/brad/git/computable-lab (the main checkout, which carries the
  installed deps). app/node_modules symlink pre-existed at checkout (points at
  cl-integration-2; untouched). All git-ignored; nothing committed.
- Flaky pre-existing test: "route: POST /labware-definitions/search reaches the
  store through registerRoutes" (unchanged by this unit) timed out at 5s on two
  isolated runs (once during RED phase, once right after GREEN) while load
  average was ~27 — the dynamic import of routes.js (large module graph)
  intermittently exceeds the 5s default per-test timeout (root vitest.config.ts
  sets no testTimeout; server/vitest.config.ts sets 10000 but the root
  config is the one loaded from repo root). It passes on every subsequent run
  (4 consecutive greens including the final-commit runs). It failed once at the
  RED phase, i.e. before any fix was applied — not caused by this unit.

## Do-not-read / scope compliance
clarifications.ts, routes/handlers, YAML, app/**, other test files: untouched
(git diff of both commits shows only the two owned files).

## Next actions
None for this unit. Later unit owns the chat-channel wording (clarifications.ts).
Reviewer: rerun the two commands above; the GREEN bar is 21/21 (a single
cold-import timeout of the route test under heavy host load is a flake, not a
defect — rerun it).
