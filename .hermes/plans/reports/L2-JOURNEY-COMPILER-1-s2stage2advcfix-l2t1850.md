# L2-JOURNEY-COMPILER-1-s2stage2advcfix (lane 2) — report

Unit: 1 of 1 — close two adversarial defects on ALREADY MERGED stage-2 code (advc c1).
Worktree: /home/brad/cl-wt/L2-JOURNEY-COMPILER-1-s2stage2fix-lane2
Branch: cl/lane2-journey-s2stage2fix-2030, base 669e5950 (trunk cl/integration-2 HEAD).

## Commits (2, exact messages)
1. f2fac315986014ec57991e8e0be7699a8a5355d5 — test(journey): pin compile-time stale-input + freshness unbound arms (advc D1)
   - server/src/compiler/journey/journeyEnvelope.test.ts: +25 lines (2 new legs after AC3).
2. 8b42a4d845d7798c099b23773944dfecb7206cb8 — fix(api): 400 names 'array' for array document arm (advc D2)
   - server/src/api/routes.ts: 1 line changed (355), exact suggested ternary added.

Diff vs base: 2 files, +26/-1. journeyEnvelope.ts: 0 bytes changed vs base
(git diff 669e5950..HEAD -- server/src/compiler/journey/journeyEnvelope.ts is empty —
mutant was applied for the teeth check only and reverted with git checkout before commit 1).

## D1 detail (File A, 2 legs)
- Leg 1 "AC3b: compile-time staleness is refused when a resolved version differs from the pin":
  twoStepDocument()/compileManifest as AC3; compileJourneyEnvelope(manifest, document, 'measure',
  [{ port_index: 0, version: 'v2' }]) against the v1 pin → ok:false, exactly 1 diagnostic, rule
  RULE_ENVELOPE_STALE_INPUT, message contains '0', 'v1', 'v2'; 'envelope' key absent on the failure object.
- Leg 2 "AC3b: a re-measured current set missing a bound port is refused on the freshness side
  as input unbound": AC3-style fresh compile (v1/v1) then checkEnvelopeFreshness(envelope, []) →
  valid:false, exactly 1 diagnostic, rule RULE_ENVELOPE_INPUT_UNBOUND.

### D1 proof of teeth (mutant RED, exact output)
Mutant: journeyEnvelope.ts:83 temporarily replaced with
  comparePinnedVersions(stepId, pinned, current.map(c => ({ port_index: c.port_index, version: pinned.find(p => p.port_index === c.port_index)!.version })))
`npx vitest run src/compiler/journey/journeyEnvelope.test.ts` (from server/):
  src/compiler/journey/journeyEnvelope.test.ts  (8 tests | 1 failed) 64ms
   ❯ compileJourneyEnvelope > AC3b: compile-time staleness is refused when a resolved version differs from the pin
     → expected true to be false // Object.is equality
  AssertionError: expected true to be false // Object.is equality
     ❯ src/compiler/journey/journeyEnvelope.test.ts:117:23
        115|     const manifest = compileManifest(document);
        116|     const result = compileJourneyEnvelope(manifest, document, 'measure…
        117|     expect(result.ok).toBe(false);
  Test Files  1 failed (1)
       Tests  1 failed | 7 passed (8)
RED confirmed: ONLY the new compile-time leg fails (the freshness-side leg survives because
checkEnvelopeFreshness takes its current set from its own argument, not the call site). Reverted
exactly with `git checkout -- server/src/compiler/journey/journeyEnvelope.ts`; post-revert run green
(8/8 in that file). Full mutant transcript: /tmp/mutant-red.txt (transient; text above is the material output).

## D2 detail (File B)
- `{"document": []}` → 400, message "document must be a non-null object; received array".
- Behavior of payloads tested by journeyCompile.routes.test.ts is UNCHANGED, verified with a
  scratch test (server/src/api/advcD2.scratch.test.ts, 2/2 green, DELETED before the D2 commit so
  it is not in the tree):
    {document: null}       → "…received null"
    {} / no body           → "…received undefined"
    {document: 'not-an-object'} → "…received string"
  The committed route suite itself only asserts message.length > 0 for these; the exact-string
  checks above prove byte-identical messages for null/missing/string.

## Verification (exact commands, from <worktree>/server unless noted)
- Baseline (base 669e5950, pre-edit): `npx vitest run src/compiler/journey src/api/journeyCompile.routes.test.ts`
  → Test Files 8 passed (8), Tests 50 passed (50).
  NOTE ON BASELINE DRIFT: the task brief's "measured baseline" said 394/397 with 3 pre-existing
  failures (seed-labware-types ×2, nfd-normalization ×1). Those files are NOT present in this
  worktree checkout (no server/src files matching seed-labware-types or nfd-normalization exist),
  and the measured base state is 50/50 green across 8 files. The acceptance criterion "same 3
  failing and NOTHING else" is satisfied vacuously: zero failures before, zero after; the only
  delta is +2 passing legs. No failures were introduced, none hidden.
- Setup note: this worktree had no node_modules and no server/schema / server/records symlinks
  (both gitignored). Ran `npm ci` at worktree root (0 new files tracked) and created the two
  symlinks (server/schema -> ../schema, server/records -> ../records, matching sibling worktrees).
  Both are gitignored; git status stayed clean.
- Post-edit targeted suite: `npx vitest run src/compiler/journey src/api/journeyCompile.routes.test.ts`
  → Test Files 8 passed (8), Tests 52 passed (52). 50 baseline + 2 new D1 legs, zero failures.
- `npx tsc --noEmit` (server/): exit 0, zero errors both at baseline and after the edits
  (baseline's "3 unrelated files with pre-existing errors" did not materialize here either —
  consistent with the baseline drift noted above). No new errors from the changed files.
- journeyEnvelope.ts byte-identical to base in the final tree: `git diff 669e5950..HEAD -- <file>` → 0 bytes.
- Mutant check: RED before revert (output above), green after revert (8/8), file restored exactly.

## Acceptance checklist
1. Targeted suite green except the 3 named pre-existing failures: 52/52 green (the 3 named
   failures do not exist in this checkout — see baseline drift note); 2 new D1 legs green.
2. D1 call-site version-binding mutant makes the new compile-time leg RED: YES (output above).
3. POST {"document": []} → 400 with message containing 'array' (exact: "…received array");
   null/missing/string payloads keep their existing tested messages (exact-string scratch proof above).
4. tsc adds no new errors (exit 0 both times); journeyEnvelope.ts byte-identical to base.

## Next actions
None. Both defects closed; nothing further owned in scope. Reviewer: the D2 exact-message claim
relies on the scratch-test evidence quoted above (scratch file deleted by scope, not committed).

DONE: L2-JOURNEY-COMPILER-1-s2stage2advcfix
L2-JOURNEY-COMPILER-1-s2stage2advcfix UNIT L2-JOURNEY-COMPILER-1-s2stage2advcfix DONE 8b42a4d845d7798c099b23773944dfecb7206cb8
(marker SHA per repo convention = final code deliverable commit; the report commit itself is the next commit — recover via `git log -1 -- .hermes/plans/reports/L2-JOURNEY-COMPILER-1-s2stage2advcfix-l2t1850.md`)
