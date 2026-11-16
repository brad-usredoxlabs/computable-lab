# L2-P1-AMBIGUITY-TIER-RULE-1 / unit u4fixture — report

- worktree: /home/brad/cl-wt/L2-AMBIGUITY-TIER-RULE-1-u4fixture-lane2
- branch: cl/lane2-ambtier-u4fixture-l2t2665 (base c8cdc9c00e4f92c49cd667733bd68a2c34958777)
- item: L2-P1-AMBIGUITY-TIER-RULE-1-u4fixture (1 of 1)
- grounding: L2-CLARIFY-TARGET-1 RULING l2t1200 R1.2 (quoted in brief; demoteUnstatedQuantities
  stripping an unstated declared quantity is CONTRACTED behavior — the fix is the fixture, not the demote path)

## Change (1 file, 4 insertions / 2 deletions)

File: server/src/ai/shorthandChat.foldNullArms.test.ts — the ONLY file touched.

1. Prompt at :488 (RUN_CHAT_REQUEST; used by both orchestrator turns at :518 and :540):
   - before: `prompt: '50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL across A1:A3 of the seeding plate',`
   - after:  `prompt: '50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL, 200 uL total, across A1:A3 of the seeding plate',`
   The density phrase ("200 HepG2 cells/uL") is kept — it is what the "HepG2 cells" composition
   card in CANONICAL_FACTS needs. The declared `volumeUl: 200` in LEG_YAML (:394) is UNCHANGED and
   now matches the stated volume ("200 uL total").
2. Comment at :384 (WHY block, anchor 1): the brief's 4 anchor lines kept verbatim; the closing
   sentence now states the volume-stated fix ("the prompt now STATES the declared volume (\"200 uL
   total\") so the demote adjudication keeps volumeUl instead of stripping it").

Untouched, verified via diff: CANONICAL_FACTS (:67-73), the :522 assertion `expect(requests.length).toBe(5)`,
all other LEG_YAML fields, all other tests, and every production file (demoteUnstatedQuantities.ts never
needed to be opened — the adjudication accepted the stated volume on the first run).

No-op sanity from the brief (u3red fact 4, no-op demote -> 12/12) is consistent with this root cause:
the 6th card was `volumeUl | missing-required-argument`, minted by the required-argument sweep after
demotion stripped the declared volume. Production behavior correct; fixture stale; fixture fixed.

## Verification (all run in this worktree, measured)

RED (re-measured at base c8cdc9c00 before the edit):
  cd server && npx vitest run src/ai/shorthandChat.foldNullArms.test.ts
  -> Test Files 1 failed (1); Tests 1 failed | 11 passed (12)
  -> FAIL at :522 `expected 6 to be 5` (the 6th card: volumeUl required-arg)

GREEN (after the edit):
  cd server && npx vitest run src/ai/shorthandChat.foldNullArms.test.ts
  -> Test Files 1 passed (1); Tests 12 passed (12)   (first attempt; no wording re-tune needed)

Neighbor (baseline 27/27, must stay):
  cd server && npx vitest run src/ai/demoteUnstatedQuantities.test.ts
  -> Tests 27 passed (27)

Typecheck — PRE-EXISTING FAILURE, not caused by this change:
  npm run typecheck -w server -> exit 2 with 6x TS2339 "Property 'parts' does not exist on type
  'FastifyRequest<...>'" in src/api/handlers/AIHandlers.ts (3), AiIngestionHandlers.ts (1),
  ExtractProtocolHandler.ts (1), and "Property 'file' does not exist" in
  src/sequences/sequenceRoutes.ts (1).
  Proven pre-existing: `git stash` (clean base) -> same 6 errors, exit 2; `diff` of the two error
  sets -> IDENTICAL-ERROR-SETS; `git stash pop` restored the change. The diff for this unit is
  comment lines + one string literal in a single test file and cannot produce TS2339 in four
  production handler files. The brief's "typecheck exit 0 baseline" claim is stale for this
  worktree; all four files are outside this unit's SCOPE (prohibited list), so this is reported,
  not fixed. Owner: whoever last touched those handlers / the lane orchestrator.

Commit: 206053fe979a366d41b3fd7b5bd0d8a12f0be85c
  "test(lane2): foldNullArms fixture states the declared volume (u4fixture) — demote adjudication keeps the canonical 5 cards; 12/12"

Next actions: none for this unit (single-unit dispatch). Remaining blocker (pre-existing, out of
scope): the 6 typecheck errors above — resume condition: a scoped brief fixing those handler files.

L2-P1-AMBIGUITY-TIER-RULE-1-u4fixture UNIT L2-P1-AMBIGUITY-TIER-RULE-1-u4fixture DONE 206053fe979a366d41b3fd7b5bd0d8a12f0be85c
