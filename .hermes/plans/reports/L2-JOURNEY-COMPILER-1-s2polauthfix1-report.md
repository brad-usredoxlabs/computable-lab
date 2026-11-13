# L2-JOURNEY-COMPILER-1 — unit s2polauthfix1 (advc c1 D1)

## Scope
Owned file changed: `server/src/compiler/journey/journeyEnvelopeAuthorization.test.ts` (test-only pin).
No product file changed. `journeyEnvelope.ts` was mutated only inside the probe and restored
byte-identically (`git checkout --`, diff --stat afterwards shows only the test file).

## Change (fix for advc c1 D1)
The fixture built `BLOCKED`/`CONFIRM` by spreading `ALLOWED`, so both the recorded and the
re-evaluated origin were `'run-override'` and `toContain('run-override')` was satisfied by either
side — the reviewer deleted the product's `(origin ${decision.origin.profileId})` fragment and the
suite stayed green. Fixed by giving the re-evaluated decisions a distinct origin and asserting BOTH ids:

- `BLOCKED`  = `{ ...ALLOWED, disposition: 'blocked', origin: { ...ALLOWED.origin, profileId: 'org-default' } }`
- `CONFIRM`  = `{ ...ALLOWED, disposition: 'needs-confirmation', origin: { ...ALLOWED.origin, profileId: 'org-default' } }`
  (scope/scopeId/priority retained via spread of `ALLOWED.origin`; no `undefined`, no optional widening)
- AC3 forward leg: added `expect(message).toContain('org-default');` alongside the existing
  `'allowed'`, `'blocked'`, `'run-override'` assertions.
- AC3 reverse leg: added `expect(message).toContain('run-override');` and
  `expect(message).toContain('org-default');` alongside `'allowed'`, `'needs-confirmation'`.
- AC1, AC2, AC4, AC5, `flipOf`, catalogue/fixture document untouched. Test count still 6 (no 7th test).

## Verification — raw output

### 1. Targeted test after the change
```
$ cd server && npx vitest run src/compiler/journey/journeyEnvelopeAuthorization.test.ts
RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-COMPILER-1-s2polauth-lane2/server

 ✓ src/compiler/journey/journeyEnvelopeAuthorization.test.ts  (6 tests) 56ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:36
   Duration  552ms (transform 43ms, setup 0ms, collect 67ms, tests 56ms, environment 0ms, prepare 57ms)
```

### 2. MUTATION PROBE (the deliverable)
Mutation A applied exactly: in `server/src/compiler/journey/journeyEnvelope.ts:137` the seven-token
fragment ` (origin ${decision.origin.profileId})` deleted from the template string, nothing else
(measured: fragment occurrences in file = 1; `git diff --stat` showed `1 file changed, 1 insertion(+), 1 deletion(-)`).

```
$ cd server && npx vitest run src/compiler/journey/journeyEnvelopeAuthorization.test.ts
 FAIL  src/compiler/journey/journeyEnvelopeAuthorization.test.ts > journey envelope authorization > AC3: allowed->blocked flips and names both dispositions and origins
AssertionError: expected 'step transfer: recorded disposition allowed (origin run-override) no longer matches the re-evaluated disposition blocked' to contain 'org-default'

- Expected
+ Received

- org-default
+ step transfer: recorded disposition allowed (origin run-override) no longer matches the re-evaluated disposition blocked

 ❯ src/compiler/journey/journeyEnvelopeAuthorization.test.ts:85:21
     83|     expect(message).toContain('blocked');
     84|     expect(message).toContain('run-override');
     85|     expect(message).toContain('org-default');
       |                     ^
     86|   });

 FAIL  src/compiler/journey/journeyEnvelopeAuthorization.test.ts > journey envelope authorization > AC3: allowed->needs-confirmation also flips (a comparison, not deny-only)
AssertionError: expected 'step transfer: recorded disposition allowed (origin run-override) no longer matches the re-evaluated disposition needs-confirmation' to contain 'org-default'

 ❯ src/compiler/journey/journeyEnvelopeAuthorization.test.ts:93:21

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
   Start at  23:27:39
   Duration  568ms (transform 48ms, setup 0ms, collect 73ms, tests 63ms, environment 0ms, prepare 67ms)
```
MUTANT KILLED — the two AC3 legs fail, exactly the predicted `Tests 2 failed | 4 passed (6)`.

### 3. Restore + re-run (product byte-identical)
```
$ git checkout -- server/src/compiler/journey/journeyEnvelope.ts
$ git -c core.fileMode=false status --short
M server/src/compiler/journey/journeyEnvelopeAuthorization.test.ts

$ cd server && npx vitest run src/compiler/journey/journeyEnvelopeAuthorization.test.ts
 ✓ src/compiler/journey/journeyEnvelopeAuthorization.test.ts  (6 tests) 58ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:42
   Duration  567ms

$ git -c core.fileMode=false diff --stat
 .../src/compiler/journey/journeyEnvelopeAuthorization.test.ts | 11 +++++++++--
 1 file changed, 9 insertions(+), 2 deletions(-)

$ grep -c org-default server/src/compiler/journey/journeyEnvelope.ts
0
```
No product path in status/diff; `'org-default'` exists only in the test fixture (HARDCODE BOUNDARY held).

### 4. Typecheck
```
$ cd server && npx tsc --noEmit
(zero lines)
EXIT=0
```

## Decisions / notes
- `git checkout --` restore used (allowed); no reset/amend/rebase, no dependency install.
- Scratch dir `/home/brad/.s2polauthfix1-scratch` not needed and not created.
- AC5 source scan still passes: product has no second authority and no `needs-confirmation` literal.

## Next actions
None for this unit; ready for adversarial re-review (the probe receipt above is the acceptance object).

L2-JOURNEY-COMPILER-1 UNIT s2polauthfix1 DONE <SHA_PLACEHOLDER>
