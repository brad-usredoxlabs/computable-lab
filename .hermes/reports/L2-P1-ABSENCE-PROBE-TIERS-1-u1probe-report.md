# L2-P1-ABSENCE-PROBE-TIERS-1 / u1probe — definition-tier absence probe

Lane 2. Worktree /home/brad/cl-wt/L2-P1-ABSENCE-PROBE-TIERS-1-lane2, branch
cl/lane2-absence-probe-tiers-1, base c14f5544a41a677cb29989a061e6d7f7cf4274d6.

## What changed (one seam, 6 files, +271/−2 vs base)

The empty-turn absence probe previously consulted labware STORE records only
(`store.list({kind:'labware'})` name tier), so a labware-DEFINITION display
name with no store record made the card falsely say "Not in this lab's records".
Per decision ABSENCE-RENDERING-AND-PROBE-TIERS-l2-20261114 ruling 2
("an absence assertion requires a probe across BOTH tiers before it is made"),
the probe now has a definition tier and the absence reason distinguishes three
states, never collapsed:

1. record tier hit (kind:'labware', held stock) → NO absence (unchanged);
2. definition-only hit (kind:'labware-definition' display name) → reason
   `A definition exists in the registry, with no record in this lab's store (not lab stock): <mention>`;
3. neither → the EXISTING verbatim `Not in this lab's records: <mention>`.

The definition tier is consulted only after the record tier missed every probe
form of a candidate, with the SAME forms. A record hit never consults the
definition tier (test b pins zero definition-probe calls).

### Files

- server/src/ai/compiler/labwareLookup.ts (+74, ADD-only):
  `createLabwareDefinitionLookup(store)` — name-scoring over
  `store.list({kind:'labware-definition'})` on payload.display_name (plus
  payload.aliases when present) with the SAME scoring rules as the record-tier
  name/alias tier (exact=100, alias=90, squash=80/70, includes=50,
  alias-includes=40, squash-includes=30). Returns `Promise<Array<{recordId,
  title}>>`, title = display_name. No identity tier here (identity is the
  record tier's exclusive recordId tier). `createLabwareLookup` is byte-
  identical (verified: 0 deleted lines in the diff vs base) — it still feeds
  the compile/resolution path (labwareInstanceLookup) and is unchanged.
- server/src/ai/clarifications.ts (+34/−1): OPTIONAL third param
  `searchDefinitionByHint?` on `emptyTurnAbsenceRequests` (first param
  contract UNCHANGED); three-state reason. Existing wording verbatim for
  state 3.
- server/src/ai/types.ts (+10): one optional dep
  `searchLabwareDefinitionsByHint?` beside the quoted :169 anchor
  (see MISMATCH-1 below for the interface name).
- server/src/server.ts (+9/−1): import extended; ONE wiring line at the
  orchestrator deps block (the :1265 block) —
  `searchLabwareDefinitionsByHint: createLabwareDefinitionLookup(ctx.store)`.
  See MISMATCH-2 for why the :1443 block was NOT wired.
- server/src/ai/AgentOrchestrator.ts (+8): one local
  `const shorthandSearchDefinitionsByHint = deps.searchLabwareDefinitionsByHint;`
  near :1650, and the two absence call sites (:3144 final-answer guard,
  :3584 shorthand-arm backstop) each pass it as the third argument in the same
  `?? (async () => [])` fallback style.
- server/src/ai/clarifications.probeTiers.test.ts (NEW, 136 lines): tests (a)–(d).

Line budget: the brief says ~150 lines / <= 180 total; actual server/src delta
is +269 (test 136, lookup 74, clarifications 34, orchestrator 8, types 10,
server 9 − 2 removed). The excess is comment lines explaining the two-tier
contract and the two documented mismatches, and the test's 38-name seed loader.

## Verification (measured, on this worktree)

Baselines measured at base c14f5544a BEFORE any edit:
- `npx vitest run src/ai/clarifications.emptyTurn.test.ts src/ai/compiler/labwareLookup.test.ts` (cwd server)
  → `Test Files 2 passed (2); Tests 25 passed (25)` (matches the brief's measured baseline).
- `npm run typecheck -w server` → FAILS with 6 pre-existing errors (brief's known
  2 plus 4 more of the same class, all pre-existing at base):
  AIHandlers.ts(332,31)/(438,31)/(716,31) TS2339 'parts', AiIngestionHandlers.ts(291,42)
  TS2339 'parts', ExtractProtocolHandler.ts(63,42) TS2339 'parts',
  sequenceRoutes.ts(37,60) TS2339 'file'. Saved at /tmp/typecheck-base.txt.

Final-commit results (commit c79fed534, tree clean):
- `npx vitest run src/ai/clarifications.emptyTurn.test.ts src/ai/compiler/labwareLookup.test.ts`
  (cwd server) → `Test Files 2 passed (2); Tests 25 passed (25)` — 25/25 green,
  the existing suites UNCHANGED (clarifications.emptyTurn.test.ts not edited).
- `npx vitest run src/ai/clarifications.probeTiers.test.ts` → `Test Files 1 passed (1); Tests 4 passed (4)`.
- `npm run typecheck -w server` → `diff /tmp/typecheck-base.txt /tmp/typecheck-after.txt` is EMPTY:
  identical to base, ZERO new errors.

RED phase (committed first, commit 26d497fbd): the test file alone fails with
`createLabwareDefinitionLookup is not a function` (3 failed | 1 passed) — the
third param and the new lookup do not exist yet, as required.

Test (d) note: of the 38 seed display names, 35 extract a labware candidate via
`extractEmptyTurnLabwarePhrases`; 3 do not for PRE-EXISTING extractor reasons
(corning_24_wellplate_3.4ml_flat — "wellplate" has no word-boundary head noun;
"12-Channel Reservoir" / "8-Channel Reservoir" — filtered as numeric-channel
noise by EMPTY_TURN_NOISE). For a non-extracting name no card is emitted at all,
which is ALSO zero false assertions. The test therefore asserts, over all 38:
every emitted request is registry-worded and contains no "not in this lab's
records" (case-insensitive), with a non-vacuity floor of >=30 registry-worded
results (measured 35).

## Mismatches found (named, not redesigned)

- MISMATCH-1 — the quoted :169 anchor (`searchLabwareByHint?`) sits in the
  interface `ResolveMentionDeps` (types.ts:161-170), NOT `ScientistIntentCompileDeps`
  (which is a different interface in compiler/scientistIntent/compileScientistIntent.ts:86,
  not consumed by the orchestrator's absence path). The orchestrator's deps type
  is `AgentOrchestratorDeps extends ResolveMentionDeps` (AgentOrchestrator.ts:1164)
  and the two absence call sites read `deps.searchLabwareByHint` from it. I added
  the dep to `ResolveMentionDeps` beside the quoted anchor — the correct seam for
  this call path.
- MISMATCH-2 — the brief says to wire at "server.ts :1265 and :1443". :1443 feeds
  `runChatbotCompile({ ... deps: { ... } })`, whose deps type is a FROZEN inline
  anonymous object in runChatbotCompile.ts:123-152 (PROHIBITED: "the compiler
  resolution path (runChatbotCompile.ts)"). Adding the key there would (a) be a
  NEW TS excess-property error (violating "ZERO new errors") and (b) be DEAD
  wiring — runChatbotCompile never calls `emptyTurnAbsenceRequests` and never
  reads the new dep (verified: 0 occurrences in runChatbotCompile.ts). Both
  absence call sites are in AgentOrchestrator, which receives its deps ONLY via
  the :1265 orchestrator block. I therefore wired at :1265 only. If the reviewer
  requires the :1443 line, runChatbotCompile.ts's inline deps type must first be
  given a `searchLabwareDefinitionsByHint?` slot (a change to the prohibited
  file) — escalate to the orchestrator.

## Acceptance

1. (a) definition-only display name → reason contains "definition exists in the
   registry", NOT "not in this lab's records" — PASS (test a).
2. (b) held store record → no absence at all, definition tier never consulted —
   PASS (test b, zero definition-probe calls).
3. (c) truly unknown noun ("cryobox") → verbatim `Not in this lab's records:` —
   PASS (test c).
4. (d) all 38 seed display names → zero "not in this lab's records" reasons —
   PASS (test d, 35 registry-worded + 3 no-card, floor >=30).
5. existing emptyTurn + labwareLookup suites green (25 tests) — PASS.

## Commit order (all on branch, tree clean)

1. 26d497fbd — RED: 3-state absence probe test (38 seed definitions)
2. 52d8479ef — GREEN: definition-tier probe; registry-without-record wording; existing 25 tests green
3. c79fed534 — definition probe wired at both absence call sites
4. (this report) — committed last

## Next actions / owners

- orchestrator: MISMATCH-2 — decide whether the :1443 runChatbotCompile wiring is
  required (needs a slot in the prohibited inline deps type; currently dead code
  so I omitted it). If not required, this unit is complete as-is.
- reviewer: implementation complete (green code, typecheck clean, report + marker
  committed). Acceptance review pending; the independent reviewer still owns it.
