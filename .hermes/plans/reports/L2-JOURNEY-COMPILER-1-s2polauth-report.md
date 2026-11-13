# L2-JOURNEY-COMPILER-1 unit s2polauth

Worktree: `/home/brad/cl-wt/L2-JOURNEY-COMPILER-1-s2polauth-lane2`
Branch: `cl/lane2-journey-s2polauth-2247`, base `41273c9a`

## Change
`server/src/compiler/journey/journeyEnvelope.ts` gains a type-only import of
`PolicyActionDecision`/`PolicyDecisionDisposition`, the two `journey_envelope_authorization_*`
rules, `JourneyEnvelopeAuthorization`, an optional `authorization` member built by
conditional spread (never `authorization: undefined`), and the pure pair
`recordEnvelopeAuthorization` / `checkEnvelopeAuthorization` (missing record refused
first, then disposition flip; one diagnostic). No service import, no evaluator call.

New `server/src/compiler/journey/journeyEnvelopeAuthorization.test.ts` (first line
`// @vitest-environment node`) pins AC1-AC5. Existing four rules/signatures and
`journeyEnvelope.test.ts` untouched.

## AC legs
- AC1: record returns a NEW envelope; input not mutated; authorization carries
  `allowed` / `allowAutoCreate` / `run-override`; bindings identical by reference.
  Fixture precondition asserted: step READY, `manifest.not_ready === []`.
- AC2: unchanged decision -> `{ valid: true }`.
- AC3 forward: allowed -> blocked -> one `journey_envelope_authorization_flipped`,
  message names `allowed`, `blocked`, `run-override`.
- AC3 reverse: allowed -> needs-confirmation also flips (comparison, not deny-only).
- AC4: no recorded authorization -> one `journey_envelope_authorization_missing`
  naming step `transfer`.
- AC5: source contains no `PolicyProfileService`, `evaluateActions`,
  `resolveActiveProfile`, `needs-confirmation` literal or `switch (`.

## RED (before product change)
`npx vitest run src/compiler/journey/journeyEnvelopeAuthorization.test.ts`
raw: `Tests  5 failed | 1 passed (6)`; failures were
`TypeError: recordEnvelopeAuthorization is not a function` (3) and
`TypeError: checkEnvelopeAuthorization is not a function` (1) plus the AC5 token pin.

## Mutation probes (reverted; final commit has no product mutation)
- Mutant A `if (false)` for the disposition comparison:
  `Tests  2 failed | 4 passed (6)`; only both AC3 legs red.
- Mutant B deleted the missing-record branch:
  `Tests  1 failed | 5 passed (6)`; only AC4 red.
Both logs kept in `/home/brad/.cl-s2polauth-scratch/`.

## Verification (from `server/`)
- Targeted: `Test Files  1 passed (1)` / `Tests  6 passed (6)`.
- Directory: `Test Files  8 passed (8)` / `Tests  55 passed (55)` (baseline 7/49).
- `npx tsc --noEmit` -> no output, exit 0.
- `git -c core.fileMode=false status --short` -> empty after the report commit.

## Notes
The launcher's worktree `node_modules` symlink pointed at a partial install without
fastify; for typecheck it was repointed to the full same-repo install in
`L2-DOC-INTAKE-1-u1-lane2/node_modules` (gitignored, no product change).

L2-JOURNEY-COMPILER-1 UNIT 1 DONE 3f69bcf2f017d150bb33541690c77718d1488f7a
