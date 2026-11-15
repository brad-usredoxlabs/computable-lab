# L2-P1-ABSENCE-PROBE-TIERS-1 — u2precision (fix cycle 2)

Item: L2-P1-ABSENCE-PROBE-TIERS-1, unit u2precision (2 of 2)
Branch: cl/lane2-absence-probe-tiers-1
Worktree: /home/brad/cl-wt/L2-P1-ABSENCE-PROBE-TIERS-1-lane2
Base: 8d09eef6be153617d53680cdceceff3fd8f5398f
Decision: .hermes/plans/decisions/ABSENCE-RENDERING-AND-PROBE-TIERS-l2-20261114.md ruling 2

## Fixes

F1 (BLOCKER) — definition tier claimed "A definition exists in the registry" from a
BARE HEAD-WORD probe hit: `EMPTY_TURN_LABWARE_HEAD` pushes "plate" as a probe form, and
`searchDefinitionByHint("plate")` matches 5 seed definitions via `name.includes` (score 50).
A genuinely unknown noun ("coral reef plate") therefore got state-2 wording.
Fix in `server/src/ai/clarifications.ts` (definition-tier loop only): compute the
candidate's bare head word and `continue` over the form equal to it (case-insensitive),
so `definitionHeld` requires a NON-head form to hit. RECORD-tier loop untouched.

F2 (MAJOR) — pin (c) used "cryobox", whose head matched nothing, so it could not see F1.
Pin (c) now uses "Put the sample into the coral reef plate." and asserts the verbatim
state-3 reason. Proven RED at base HEAD before the source fix (see below).

F4 (marker) — this report's final line uses the required token order
`<item> UNIT u2precision DONE <sha>`.

## Changed files

- server/src/ai/clarifications.ts — skip bare-head definition form (ruling 2 comment)
- server/src/ai/clarifications.probeTiers.test.ts — pin (c) now head-word-bearing unknown noun
- .hermes/reports/L2-P1-ABSENCE-PROBE-TIERS-1-u2precision-report.md (this file)

## Verification (raw)

RED first — pin (c) changed to "coral reef plate" at base source:
```
FAIL src/ai/clarifications.probeTiers.test.ts > ... > (c) neither tier: the verbatim state-3 reason is kept
AssertionError: expected 'A definition exists in the registry, …' to match /^Not in this lab's records:/
+ Received: "A definition exists in the registry, with no record in this lab's store (not lab stock): sample into the coral reef plate"
 Tests  1 failed | 3 passed (4)
```

GREEN after the clarifications.ts change:
```
 ✓ src/ai/clarifications.probeTiers.test.ts  (4 tests) 10ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Record tier unchanged:
```
 ✓ src/ai/clarifications.emptyTurn.test.ts  (15 tests) 6ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Typecheck (`cd server && npx tsc --noEmit`): 6 errors, all pre-existing Fastify
`request.parts`/`request.file` decorator typing in AIHandlers/AiIngestionHandlers/
ExtractProtocolHandler/sequenceRoutes. Delta 0.

`git status --short`: clean (see final marker commit).

## Acceptance

- AC1: "coral reef plate" in an un-stocked lab -> state-3 verbatim reason (pin (c), green).
- AC2: full seed display names still read state 2 (pin (d), 35 candidates, floor >= 30, green).
- AC3: record tier unchanged — pins (a)(b) green; clarifications.emptyTurn 15/15 green.

## Notes / residual risk

A turn whose ONLY extracted candidate is exactly the bare head word (e.g. "Place the plate
on the deck.") now reads state 3 even if a definition contains "plate". This is the intended
precision trade per brief: a bare head word cannot ground a registry-presence claim about a
specific noun. Pin (d) is unaffected because its forms are full display names (score >= 90).

L2-P1-ABSENCE-PROBE-TIERS-1 UNIT u2precision DONE 7c21af669a1799cd2eb8166176ba8e3d2a86f7c8
