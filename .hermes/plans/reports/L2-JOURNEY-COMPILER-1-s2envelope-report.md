# L2-JOURNEY-COMPILER-1 unit s2envelope (stage 2: the ready execution envelope) — report

Item: L2-JOURNEY-COMPILER-1-s2envelope | Lane 2 | worktree /tmp/wt-L2-JOURNEY-s2envelope
Branch: cl/lane2-journey-s2envelope-1846 | base: 7e43ac19d3e62e30fe9e1bbe6c13c60f512474f3

## Commits (this branch, base + 3)
- 77780aec L2-JOURNEY-COMPILER-1 s2envelope: RED pins for stage-2 envelope (module not found)
- bfa08399f5667aefdc2afeeb68be090cc36e2a15 — the code commit: both owned files, unit complete
- <this commit> docs(plan): L2-JOURNEY-COMPILER-1 s2envelope report + DONE marker

## Changed files (exactly the two owned files, both NEW; 249 lines total <= 300 budget)
- server/src/compiler/journey/journeyEnvelope.ts (106 lines) — compileJourneyEnvelope binds a
  READY step to the exact version each input port pins; checkEnvelopeFreshness re-runs the SAME
  private comparator (comparePinnedVersions) over envelope.bindings vs re-measured current.
  Fixed rule order, one diagnostic per refusal: step_unknown -> human_step -> input_unbound ->
  stale_input (all offenders, ascending index). No journey- literals, no switch, no id table,
  no lintJourneyDocument/validatePortBinding import (no second authority, no re-validation);
  no route, no policy, no persistence. document is unknown at the boundary, shaped locally and
  narrowed by typeof checks.
- server/src/compiler/journey/journeyEnvelope.test.ts (143 lines) — AC1-AC5 pins, 6 tests.

## Verification (RAW, run at bfa08399 and re-confirmed after the final state)
1. RED (before implementation, committed at 77780aec):
   `npx vitest run src/compiler/journey/journeyEnvelope.test.ts`
   -> FAIL ... Error: Failed to load url ./journeyEnvelope.js (resolved id: ./journeyEnvelope.js)
      Does the file exist? | Test Files 1 failed (1) | Tests no tests
2. Targeted (post-fix, re-run at 19:39):
   `npx vitest run src/compiler/journey/journeyEnvelope.test.ts`
   -> Test Files 1 passed (1) | Tests 6 passed (6) | Start at 19:39:12
3. Full suite (re-run at 19:39):
   `npx vitest run src/compiler/journey`
   -> Test Files 7 passed (7) | Tests 45 passed (45) | Start at 19:39:13
   Baseline at base 7e43ac19: Test Files 6 passed (6) | Tests 39 passed (39). 39 + 6 = 45, zero
   failures; the 6 existing files stayed green (no prohibited file touched).
4. `npx tsc --noEmit` -> exit 0, 0 errors (baseline at 7e43ac19 also exit 0).
5. `git -c core.fileMode=false status --short` -> clean at exit (only node_modules, gitignored).

## Mutation probe (raw)
Mutated the shared comparator: `if (entry.version !== port.version)` -> `if (false && entry.version !== port.version)`.
`npx vitest run src/compiler/journey/journeyEnvelope.test.ts`
-> FAIL ... AC3: an input-fed step compiles with matching versions and freshness catches a moved version
   AssertionError: expected true to be false (stale.valid must be false; received true) at line 105
   Test Files 1 failed (1) | Tests 1 failed | 5 passed (6)
AC3's stale + freshness case went RED exactly as required. File restored (patch reverted the same
line); `git -c core.fileMode=false status --short` showed only the two owned files; then committed
at bfa08399.

## AC evidence
- AC1: ready automatic step (no inputs) -> ok:true; envelope carries capability_ref 'transfer'
  and the manifest's capability_version '1.0.0'; bindings == [].
- AC2: human_in_the_loop step -> ok:false, exactly 1 diagnostic, rule journey_envelope_human_step,
  message names 'review'; no envelope. awaiting_producer_output alone is NOT a refusal (AC3 step
  'measure' is input-fed + NOT_READY at stage 1 yet compiles).
- AC3: fed step compiles, binding {port_index:0, declared_version:'v1', resolved_version:'v1'};
  checkEnvelopeFreshness unchanged -> {valid:true}; one version moved to 'v2' -> {valid:false}
  with rule journey_envelope_stale_input naming index 0, 'v1' and 'v2'.
- AC4: no resolved version for port 0 -> rule journey_envelope_input_unbound naming index 0 and
  step 'measure'; step id 'ghost-step' in neither manifest nor document -> rule
  journey_envelope_step_unknown naming it.
- AC5: test reads journeyEnvelope.ts source and pins: no `['"]journey-` literal, no quoted
  id-to-value table (`['"][a-z0-9_.-]+['"]\s*:`), no `switch (`, no `lintJourneyDocument`, no
  `validatePortBinding`.

## Decisions
- One private comparator (comparePinnedVersions) shared by compile and freshness — the two-copies
  defect the unit exists to prevent.
- checkEnvelopeFreshness compares current against the binding's resolved_version (what the envelope
  recorded as CURRENT at compile time): unchanged re-measure -> valid:true; a moved record ->
  STALE_INPUT naming the old resolved and the new current version (AC3).
- A port whose declared version is missing/blank is refused INPUT_UNBOUND (never defaulted); a
  bound port index missing or duplicated in the current set is INPUT_UNBOUND naming the first
  offending index; unbound wins over stale when both hold (single diagnostic).
- node_modules was absent in the worktree (gitignored); installed with the local pnpm store
  (`pnpm install --frozen-lockfile --prefer-offline`, 2.4s) — no dependencies added or changed.
- Marker convention: names the code commit bfa08399 (contains the full unit; real, verifiable —
  git rev-parse / git cat-file both pass). Precedent: u7css report named the code commit whose
  tree contained the unit; u6fix2 correction required the named sha to be one where
  `git cat-file -e <sha>:<report>` is rc 0 — the report commit below satisfies that for the
  report file, and bfa08399 satisfies it for every unit file it contains.

## Next actions / blockers
None for this unit. Leg "extended compile route" (route + UI) and L2-JOURNEY-POLICY-1
(authorization) remain later legs per the brief. No merge/push performed (out of scope).

L2-JOURNEY-COMPILER-1-s2envelope UNIT unit DONE bfa08399f5667aefdc2afeeb68be090cc36e2a15
