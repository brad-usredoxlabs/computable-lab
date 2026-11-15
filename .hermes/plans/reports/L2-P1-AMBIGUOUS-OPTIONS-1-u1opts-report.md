# L2-P1-AMBIGUOUS-OPTIONS-1 (u1opts) — report

Item: L2-P1-AMBIGUOUS-OPTIONS-1 — unit u1opts (1 of 1)
Worktree: /home/brad/cl-wt/L2-P1-AMBIGUOUS-OPTIONS-1-lane2
Branch: l2/p1-ambiguous-options-1
Base: 6340cea43eae585414d58d1093e144ce1a2c8043
Finding: gate r10 DEFECT 1 (prompt-1, "Place a 96-well plate on the deck.") — the
  engine ambiguous-noun card rendered options:[] although unresolvedFact.candidates
  carried the ordered engine records.
Decision: W28-OPTIONBIND-1 (scientistIntent/types.ts:119-127) — candidate `ref` =
  the engine's store-backed record id; never fabricate one.

## The fix (the seam, implemented exactly as the brief)

server/src/ai/shorthandChat.ts (ONE file, display mapper only):
- NEW helper `factCandidateOptions(fact)` (lines ~805-832, next to `factReadings`):
  a STRUCTURAL candidate read — the twin of `factReadings`. Reads
  `fact.candidates`; for EACH candidate carrying a NON-EMPTY STRING `ref`
  emits `{ id: candidate.ref, label: candidate.label }`, in candidate order.
  Candidates WITHOUT a string ref (mint affordances, tier>1 hits, non-string ref)
  render NO option (anti-fabrication: an option button must carry a real record
  handle — pin at resolutionEngine.optionRef.test.ts:7). No candidates => [].
- In `clarificationsFromUnresolvedFacts` (the return object of
  `facts.map((fact) => {...})`): `const candidateOptions = factCandidateOptions(fact);`
  computed near `const readings = factReadings(fact);` (line ~1037).
- The `options:` arm (line ~1185): `options: readings ? readings.map(...) : candidateOptions`
  — the READING arm's map is byte-identical (id/label/snippet unchanged);
  the domain-map menuProvider ('/l'/'/m') is UNCHANGED so the search menu still
  rides next to the buttons; facts with no candidates keep `options: []`
  byte-identically.

NO compiler change. resolutionEngine.ts, roleBinding*, forceMaterialClarifications.ts,
clarifications.ts, the fold logic, prompts, ids, menuProvider and allowCreateLocal are
all untouched. Answer handling NOT modified (ANSWER-BIND-1 flows `{id: recordId}` through
the existing choice-card idiom — verified working, no BLOCKED).

## Changed files (2)

1. server/src/ai/shorthandChat.ts  (the options arm + one helper)
2. server/src/ai/shorthandChat.ambiguousOptions.test.ts  (NEW — RED test)

`git diff --stat 6340cea43..HEAD`: 2 files changed, 129 insertions(+), 6 deletions(-).

## Verification (measured, from worktree root)

RED (failing test first, committed 38ea1fd527a5321c65c10d17098061ab00244e24):
  timeout 300 npx vitest run --root server server/src/ai/shorthandChat.ambiguousOptions.test.ts
  => Test Files 1 failed (1) | Tests 2 failed | 1 passed (3)
  The r10 shape (3 ref-carrying candidates) failed on options.length===3 / id=ref;
  the ref-less candidate test failed on the single-option expectation.

GREEN + regressions (final commit dcdb9177a7a3dffd2853714ddae818f4c638f1eb):
  timeout 400 npx vitest run --root server \
    server/src/ai/shorthandChat.ambiguousOptions.test.ts \
    server/src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts
  => Test Files 2 passed (2) | Tests 12 passed (12)
  NOTE: shorthandChat.optionArm.test.ts does NOT exist at base (brief: "if it does not
  exist at base, drop it from the list") — dropped. sameNounDedupe.uifix3 suite stays
  green (the readings arm + menuProvider are unchanged).

Typecheck:
  timeout 400 npm run typecheck -w server 2>&1 | tail -n 5
  => command failed (tsc --noEmit) with 6 PRE-EXISTING errors, ALL in files this change
     never touched: src/api/handlers/AIHandlers.ts (332,438,716),
     src/api/handlers/AiIngestionHandlers.ts (291),
     src/api/handlers/ExtractProtocolHandler.ts (63),
     src/sequences/sequenceRoutes.ts (37) — all "Property 'parts'/'file' does not exist
     on FastifyRequest" (fastify 5.8.5 installed vs ^5.7.2 in package.json — a Fastify
     type-version drift in the shared node_modules store, not a defect in this change).
  VERIFIED PRE-EXISTING: `git stash push server/src/ai/shorthandChat.ts` then
  `npx tsc --noEmit` => STILL exactly 6 errors (identical set), then `git stash pop`.
  ZERO errors in shorthandChat.ts or the new test file (grep 'shorthandChat|ambiguousOptions'
  on the tsc output => none). This change adds no type errors.

## Acceptance (all met)

1. NEW test proves: fact {label, reason:'ambiguous-noun', candidates:[>=1 with string refs]}
   maps to options where each option.id === candidate.ref and option.label === candidate.label,
   in candidate order. (r10 shape: 3 candidates -> 3 options, ids equal the refs in order.) PASS
2. Candidates without a (string) ref produce NO option (no fabricated ids). PASS
3. Facts with no candidates keep options: [] byte-identically; the readings arm and
   menuProvider are unchanged (sameNounDedupe.uifix3 suite stays green). PASS
4. Server typecheck: zero errors attributable to this change (6 pre-existing Fastify-typing
   errors in untouched handler files — confirmed identical with the change stashed).

## Next actions / remaining blockers

- None for the coder. Acceptance (browser/behaviour review) is a SEPARATE state — the
  independent reviewer owns it.
- OPTIONAL (orchestrator): the 6 pre-existing `npm run typecheck -w server` failures are
  fastify 5.8.5 typing drift in AIHandlers/AiIngestionHandlers/ExtractProtocolHandler/
  sequenceRoutes — outside this unit's scope; flag to the orchestrator as a lane-level
  hygiene item, not a defect of L2-P1-AMBIGUOUS-OPTIONS-1.

## Commits (shas read back with `git rev-parse HEAD`)

- RED    38ea1fd527a5321c65c10d17098061ab00244e24  "test: L2-P1-AMBIGUOUS-OPTIONS-1 RED — ..."
- GREEN  dcdb9177a7a3dffd2853714ddae818f4c638f1eb  "fix: L2-P1-AMBIGUOUS-OPTIONS-1 (u1opts) — ..."
- REPORT 124ac7ad0836bc7c6227d2438496ca3238b9519e  "docs: L2-P1-AMBIGUOUS-OPTIONS-1 u1opts report + DONE marker"
  (the report commit; this report's final revision references it — the marker line below names it).

L2-P1-AMBIGUOUS-OPTIONS-1 UNIT L2-P1-AMBIGUOUS-OPTIONS-1 DONE 124ac7ad0836bc7c6227d2438496ca3238b9519e
