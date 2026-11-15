# L2-P1-AMBIGUITY-TIER-RULE-1 u2wire — report (lane 2)

Item: L2-P1-AMBIGUITY-TIER-RULE-1-u2wire (unit 1 of 1). Fix of advc defect D1
(FIX-FUNCTIONAL, report /home/brad/.hermes/cl/lanes/2/reviews/L2-P1-AMBIGUITY-TIER-RULE-1-u1tier2-advc-c1-l2t2652.md):
the merged u1tier2 candidatePrecedence rule was UNREACHABLE in production —
createResolveSpineFromContext (ResolveSpine.ts:279) builds
createRecordProvider(ctx.store) with NO kinds argument, and DEFAULT_KINDS had
no 'labware-definition'. Fix: one array entry + one RED-first pin test.

## Changed files
- server/src/resolve/providers/records.ts — +1 line: 'labware-definition' appended
  after 'labware' in DEFAULT_KINDS (lines 15-23). KIND_LEVEL untouched (levels stay
  'unknown' via existing fallback; rule keys off termKind, not level).
- server/src/resolve/providers/records.defaultKinds.test.ts — NEW, 80 lines:
  in-memory RecordsFixtureStore (idiom of records.test.ts:54-57), two envelopes
  (LBW-LEGACY-T2 kind labware/name; LBW-DEF-T2 kind labware-definition/display_name),
  createRecordProvider(store) with NO kinds argument; asserts hit local:LBW-DEF-T2
  with termKind 'labware-definition' AND that the legacy hit is still present
  (precedence drop stays in the strategy layer).

## Commits (branch cl/lane2-ambiguity-tier-u2wire-l2t2653, base ede4b7ecc5cf)
1. RED  6dc48a4201995ee8cb8ec541fba025b637d33058 — new test only (80 insertions)
2. GREEN e123d922ce156fb828aabbf26c48e84d041571c6 — records.ts 1-line fix

## Verification (all on the named commits)
- RED @ 6dc48a42: `cd server && npx vitest run src/resolve/providers/records.defaultKinds.test.ts`
  -> 1 file failed / 1 test failed: AssertionError: expected undefined not to be undefined
  (no hit for local:LBW-DEF-T2; DEFAULT_KINDS lacked the kind at that commit).
- GREEN @ e123d922: same command -> Test Files 1 passed (1); Tests 1 passed (1).
- Regression @ e123d922: `npx vitest run src/resolve/providers/records.test.ts src/compiler/resolution/resolutionEngine.tierPrecedence.test.ts`
  -> 2 files passed; 14 tests passed (records.test.ts 9, tierPrecedence 5).
- Typecheck @ e123d922: `npm run typecheck -w server` from worktree root -> exactly
  6 errors, all pre-existing baseline (AIHandlers.ts x3, AiIngestionHandlers.ts x1,
  ExtractProtocolHandler.ts x1, sequenceRoutes.ts x1, all Fastify drift TS2339); delta 0.
- Acceptance: (1) default provider surfaces labware-definition with termKind; (2) legacy
  hit still present; (3) GREEN + regression green + typecheck delta 0. All met.

## Scope
Owned 2 files / 81 changed lines (80 + 1). Nothing else touched; no KIND_LEVEL entry,
no mapping list, no YAML, no app/, ResolveSpine.ts/strategies.ts/resolutionEngine.ts untouched.

## Next actions
None for this unit. Lane/orchestrator: live stack reload not required (TS code, no YAML).
Acceptance review: re-run the two vitest commands + typecheck above on e123d922.
L2-P1-AMBIGUITY-TIER-RULE-1-u2wire UNIT u2wire DONE f839f3f1f0368de628bfa1ddf49c0a2d99478cf4
