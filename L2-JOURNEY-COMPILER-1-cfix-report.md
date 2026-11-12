# L2-JOURNEY-COMPILER-1 / unit cmanifest — FIX cycle c2 (D-1 MAJOR, D-2 MINOR)

Item: L2-JOURNEY-COMPILER-1-cfix (lane 2, continuation of c1). TEST-ONLY fix.
Worktree: /home/brad/cl-wt/L2-JOURNEY-cmanifest-cfix-lane2
Branch: cl/l2-journey-cmanifest-cfix-l2t1810
Base: 65908003b176ef6cfe35dd1d892ca954c2d82600
HEAD (this fix): a214f37ad75fd2fb715c390691bd9b3fef59aca1
Commit message: "cmanifest cfix: structural pin asserts closed literal set + negative controls (D-1); capability_version_missing pin (D-2)"

## Changed files
- server/src/compiler/journey/journeyCompiler.test.ts — ONLY file changed.
  `git diff --name-only 65908003 HEAD` names exactly this one file.
  `git diff --stat`: 1 file changed, 83 insertions(+), 2 deletions(-) → 85 changed
  lines, within the 90-line budget.
- journeyCompiler.ts: byte-identical to base (not in the diff; never edited).

## D-1 (MAJOR) — structural pin strengthened
Replaced the three regex-only assertions in pin (e) by ADDING to them (the three
original `expect(source).not.toMatch(...)` lines are kept verbatim, never weakened):
1. `stringTokens()` — a comment/string-aware scanner over the product source that
   extracts EVERY quoted string literal (single, double, backtick — any quoting
   style) and EVERY unquoted object key (identifier directly before ':', keywords
   excluded so ternary ':' never poisons the set). Catches tables, arrays and
   `=== 'id'` comparisons that the old regexes missed (the M4 mutation class).
2. Exact-set assertions: the extracted literal set must EQUAL `CLOSED_LITERALS`
   and the extracted key set must EQUAL `CLOSED_KEYS` (sorted toBeEqual).
3. Three negative controls, each built by RUNTIME CONCATENATION inside the test so
   the test file itself carries no banned literal; each appends a mutant to a copy
   of the real source and asserts the SAME extractor REJECTS it (`toBe(true)`):
   (i) per-journey branch `if (plan.journey_id === '<journey-x assembled>')`,
   (ii) unquoted-key step-id table `const stepIdTable = { stepAlpha: 1, stepBeta: 2 }`,
   (iii) capability-id equality `if (step.capability_ref === '<ghost-cap assembled>')`.
   A mutant that passes the extractor makes its control fail the suite — the teeth.

### Closed-literal-set deviation from the task text (verified by reading the source)
The task named the closed set as 8 literals (7 values + './journeyDocumentLint.js').
Reading journeyCompiler.ts (75 lines) found the actual set is 11: the 8 named plus
three NON-ID literals, each confirmed to belong:
- './capabilityCatalogue.js' — type-only import specifier (source line 15);
- 'step ${step.id}: the admitted capability descriptor declares no version string'
  — the defensive version-gap diagnostic message (line 48); names no id.
- 'string' — the `typeof` tag of the version check (line 47).
Per the task instruction ("if your extraction finds MORE, READ the product source
and decide"), all three were added to the allowed set. No journey/step/capability
id was ever added. `CLOSED_KEYS` = 23 field/parameter/local names (no ids).

## D-2 (MINOR) — capability_version_missing pin
New pin 'refuses a catalogue descriptor with an empty version string under
journey_capability_version_missing', mirroring pin (d)'s shape:
- catalogue copy with `version: ''` on the 'transfer' descriptor;
- asserts `lintJourneyDocument(plan, emptyVersion).ok === true` FIRST (the version
  gap is the compiler's defensive contract — the lint checks membership, not
  version strings, so the fixture is unreachable via the loader);
- then `compileJourneyStructure` returns ok:false with EXACTLY ONE diagnostic:
  rule 'journey_capability_version_missing', step_id 'transfer', no manifest.

## Verification (all commands run in the worktree, all green)
1. `cd /home/brad/cl-wt/L2-JOURNEY-cmanifest-cfix-lane2/server && npx vitest run src/compiler/journey`
   → Test Files 6 passed (6); Tests 39 passed (39). journeyCompiler.test.ts: 6 tests
   (the 5 existing pins UNCHANGED + the new version-gap pin; structural pin
   strengthened in place). Baseline at base commit was 38 tests / 6 files.
2. `cd /home/brad/cl-wt/L2-JOURNEY-cmanifest-cfix-lane2/server && npx tsc --noEmit`
   → exit 0.
3. `git diff --name-only 65908003b176ef6cfe35dd1d892ca954c2d82600 HEAD`
   → server/src/compiler/journey/journeyCompiler.test.ts (only).
4. Mutation teeth: proven in-suite (each control asserts the extractor REJECTS its
   mutant; suite green only because all three do). A pre-run standalone node check
   of the same extractor on the clean source also confirmed: clean source is NOT
   rejected; all three mutants ARE rejected (literal 'step'/'Alpha' etc. outside
   closed sets).

## Acceptance mapping
1. vitest green, 5 pins unchanged + strengthened structural pin + new pin — DONE (39/39).
2. every string literal extracted; set equals closed vocabulary — DONE (11 literals + 23 keys).
3. three negative controls each assert the extractor REJECTS the mutant — DONE.
4. version-gap pin: gate.ok true asserted first; ok:false, exactly one diagnostic,
   rule + step id asserted — DONE.
5. tsc exit 0; journeyCompiler.ts byte-identical to HEAD/base — DONE.

## Next actions
- Orchestrator: no lane-stack reload required (no YAML/stack changes; test file only).
- Advc/browser reviewer: re-verify D-1/D-2 against this commit; acceptance criteria above.
- No YAML changes → no reload gate.

## Blockers
None.

L2-JOURNEY-COMPILER-1-cfix UNIT unit DONE a214f37ad75fd2fb715c390691bd9b3fef59aca1
