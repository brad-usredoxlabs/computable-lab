# L2-JOURNEY-COMPILER-1 / unit s2inval — report (lane 2)

Worktree: /home/brad/cl-wt/L2-JOURNEY-COMPILER-1-s2inval-lane2
Branch: cl/lane2-journey-s2inval-2011 (base c340ecef7f004bb394e36992668a3f236b08084e)
Status: DONE. 2 commits (RED pin, then product+pin) + this report commit.

## What was delivered (the seam only)
- `server/src/compiler/journey/journeyCompiler.ts` (+33/-1 in the final commit):
  - `JourneyEnvelopeInvalidation { step_id, rule, message }` (declared shape).
  - `invalidations?: JourneyEnvelopeInvalidation[]` on `CompiledJourneyManifest`
    (exactOptionalPropertyTypes: absent, never `undefined`).
  - `export function recordEnvelopeInvalidation(manifest, invalidation): CompiledJourneyManifest`
    — pure, never mutates the argument: appends the entry, marks the named step
    `status: 'NOT_READY'`, adds the closed reason `stale_input` only if absent
    (no duplicates), recomputes `not_ready` with the SAME `status !== 'READY'`
    filter, document order. `journey_id`/`revision`/other steps ride through.
  - `JourneyNotReadyReason` gains exactly one member: `'stale_input'`.
- `server/src/compiler/journey/journeyCompiler.test.ts` (+68/-12 in the final commit):
  - 3 new tests (AC1, AC2, AC3) replacing the RED probe body.
  - Closed-vocabulary pin extended (exact-set, no wildcard, no deletion).
- Owned files = exactly these 2. No other file touched. journeyEnvelope.ts and all
  PROHIBITED files untouched (verified at the code commit:
  `git diff c340ecef..d1a0458c --stat` = 2 files, 131 insertions(+), 5 deletions(-);
  the report file is carried by the separate report commit that follows).

## Vocabulary-pin extensions (what was added and why)
The pin's extractor scans only (a) string literals and (b) unquoted object keys,
and asserts exact-set equality. Measured delta from the new product code:
- `stale_input` — CLOSED_LITERALS: the one new closed reason literal, written in
  the product source (closed-vocabulary member, not an id).
- `invalidations` — CLOSED_KEYS: the declared manifest field (object key).
- `invalidation` — CLOSED_KEYS: the declared function parameter (object key).
- `message` — CLOSED_KEYS: the declared `JourneyEnvelopeInvalidation` field (object key).
NOT added (deliberate, with reasoning stated in the test file's pin comment):
`JourneyEnvelopeInvalidation` and `recordEnvelopeInvalidation` are type/function
IDENTIFIERS, not string-literal or object-key tokens the extractor scans; because
the pin is an exact-set match, adding them to the lists would break the guard.
Both names are declared vocabulary members, declared in the product source.

## RED phase (raw failure, commit d5705d4b)
`cd server && npx vitest run src/compiler/journey/journeyCompiler.test.ts`:
```
 FAIL  ... journeyCompiler.test.ts > compileJourneyStructure > RED probe (unit s2inval): the manifest can carry a stage-2 envelope invalidation
TypeError: recordEnvelopeInvalidation is not a function
 ❯ src/compiler/journey/journeyCompiler.test.ts:224:22
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```
Also a type error pre-product: TS2305 module has no exported member
'recordEnvelopeInvalidation', and the manifest type has no `invalidations` member.

## Acceptance legs (all green at d1a0458c)
- AC1: manifest reads back with `not_ready` exactly the ids whose status !== READY
  (['measure'], document order); after `recordEnvelopeInvalidation` the step is
  NOT_READY, `stale_input` appears exactly once, one `invalidations` entry names
  step id / rule / message verbatim; other step + journey_id + revision unchanged.
- AC2: second call (same step, rule) → exactly ONE stale_input reason
  (`[ 'stale_input', 'stale_input' ]` is the red case), and the input manifest is
  never mutated — asserted by deep-equality against a snapshot taken BEFORE the
  calls (the brief's "deep-equality of the original object after the call" is
  tautological if measured post-hoc; the pre-snapshot form is the live assertion;
  both snapshot forms are asserted).
- AC3: all pre-existing assertions pass unmodified except the two closed lists;
  a freshly compiled manifest with no invalidation carries NO `invalidations`
  key (`'invalidations' in manifest === false`).

## MUTATION PROBE (run and reverted)
Applied to the committed product file: removed the duplicate guard so the reason
is appended unconditionally —
  - final code: `const stale = step.reasons.includes('stale_input');
                 const reasons: JourneyNotReadyReason[] = stale ? step.reasons : [...step.reasons, 'stale_input'];`
  - probe:      `const reasons: JourneyNotReadyReason[] = [...step.reasons, 'stale_input'];`
  (note: the brief's literal probe line `if (!reasons.includes('stale_input'))
   reasons.push('stale_input')` was not present in the final code — an early draft
   used exactly that line but MUTATED THE INPUT MANIFEST, which AC2's pre-snapshot
   deep-equality caught; the fix builds a fresh array, which also carries the
   same guard semantics the probe targets.)
Raw summary with the probe applied:
```
 ❯ ... > AC2: a second refusal for the same step and rule adds no duplicate stale_input reason and does not mutate the input manifest
   → expected [ 'stale_input', 'stale_input' ] to have a length of 1 but got 2
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
AC2 (the no-duplicate-reason leg) is red; AC1 stays green because a single call
still contains `stale_input` once — the AC1/AC2 legs together fail the reverted
behaviour (AC2 is the leg that pins the dedupe). The pin is not vacuous.
Revert proof (after `git checkout -- server/src/compiler/journey/journeyCompiler.ts`):
```
$ git -c core.fileMode=false status --short
(empty — clean)
$ grep -n MUTATION-PROBE-SCRATCH server/src/compiler/journey/journeyCompiler.ts
NO_SCRATCH_LEFT
$ cd server && npx vitest run src/compiler/journey/journeyCompiler.test.ts
 Tests  9 passed (9)
```

## VERIFY BEFORE EXIT (raw outputs at d1a0458c2bb7fbda3281aa49aa1e92b7639054c2)
- Targeted run ONLY:
  `cd server && npx vitest run src/compiler/journey/journeyCompiler.test.ts`
  → `Test Files  1 passed (1)` / `Tests  9 passed (9)` (baseline 6 + 3 new).
- Directory baseline check (per composer's measured 7 files / 45 at base):
  `cd server && npx vitest run src/compiler/journey/`
  → `Test Files  7 passed (7)` / `Tests  48 passed (48)` (45 + 3 new, nothing red).
- Typecheck (one run, allowed because a .ts signature changed):
  `cd server && npm run typecheck` → `tsc --noEmit` exit 0, no `error TS` lines.
  (One transient TS2322 during development — a ternary widening a literal to
  string[] — fixed by a `JourneyNotReadyReason[]` annotation; final run is 0.)
- Clean tree: `git -c core.fileMode=false status --short` → empty at exit.

## Toolchain note
The worktree had NO node_modules (the launcher guarantee was absent; every sibling
worktree either has none or symlinks the NFS mount /mnt/vast, which this assignment
prohibits). I did not install NEW dependencies: `npm ci` materialized exactly the
committed package-lock.json from the local 3.1G npm cache (/home/brad/.npm).
node_modules is gitignored (`.gitignore:5-6`), so the tree stayed clean.

## Scratch
Scratch kept OUTSIDE /tmp: /home/brad/.s2inval-scratch/extractor.mjs (verbatim
mirror of the pin's stringTokens extractor, used to MEASURE the vocabulary delta
before extending the lists). Deleted at exit.

## Next actions / remaining blockers
- None for this unit. Follow-up work owned by OTHER units (prohibited here):
  wiring the stage-2 freshness refusal (checkEnvelopeFreshness diagnostics) into
  `recordEnvelopeInvalidation` at the served-run boundary, and the route/envelope
  surfaces — journeyEnvelope.ts is under adversarial review (advc c1) and must not
  be touched by this unit.
- Orchestrator: no YAML changed, so no lane-stack reload is required.

## Marker
UNIT L2-JOURNEY-COMPILER-1-s2inval DONE d1a0458c2bb7fbda3281aa49aa1e92b7639054c2
L2-JOURNEY-COMPILER-1-s2inval UNIT unit DONE d1a0458c2bb7fbda3281aa49aa1e92b7639054c2
