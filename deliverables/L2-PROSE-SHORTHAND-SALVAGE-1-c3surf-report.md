# L2-PROSE-SHORTHAND-SALVAGE-1 — unit c3surf (lane 2)

Worktree: /home/brad/cl-wt/L2-PROSE-C3SURF-lane2
Branch: cl/lane2-prose-salvage-c3surf-0245
Base checked at STEP 0: d716e5f5865c12e8f0e6384287f7ed94903879ed (clean status)

## Decision

Declared the two real shorthand-drafting surfaces, `event-editor` and
`run-workspace`, in `config/drafting/forced-tool-compliance.yaml` `surfaces:`
so the bounded zero-tool-call retry is reachable where drafting happens.
Membership is DATA only — no TypeScript branch, no new surface literal in
product code. The dead `workspace.deck` entry was annotated in place and kept
(AgentOrchestrator.repeatEcho.test.ts:334 positively asserts its presence),
with its maxRetries and nudge bytes unchanged. The `sequences` nudge was not
touched (added lines only; `git diff` shows no modification of line 25).

New entry nudges reuse the shipped event_shorthand envelope wording from the
workspace.deck nudge (`intent "event_shorthand"` + scientist-intent YAML in
`shorthand`) and carry the anti-claim sentence verbatim:
"Do not claim to have saved or changed anything; no action has executed."

## Changed files

- config/drafting/forced-tool-compliance.yaml (two entries added, dead-id
  annotation comment above `surface: workspace.deck`)
- server/src/ai/forcedToolCompliance.shipped.test.ts (NEW; 4 tests, loads the
  SHIPPED policy via `loadForcedToolCompliancePolicy()` with no path argument,
  looks entries up with the module's real `forcedToolComplianceEntry`)
- deliverables/L2-PROSE-SHORTHAND-SALVAGE-1-c3surf-report.md (this report)

Scaffold note (gitignored, no product bytes): this worktree had no
`server/node_modules` and no `server/schema|records|config` symlinks. Created
`server/node_modules -> /home/brad/git/cl-integration-2/server/node_modules`
(server/package.json md5 identical, c2f046c8e9e66d5a0fb20df9af5e51a7) and the
three `server/* -> ../*` symlinks the repo gitignores. No dependency install.

## Verification (raw)

1) RED at base (before the YAML edit) — `cd server && npx vitest run src/ai/forcedToolCompliance.shipped.test.ts`:

   ❯ src/ai/forcedToolCompliance.shipped.test.ts  (4 tests | 2 failed) 5ms
   FAIL ... declares event-editor: one retry, the event_shorthand envelope, the anti-claim clause
   AssertionError: expected null not to be null
   FAIL ... declares run-workspace: one retry, the event_shorthand envelope, the anti-claim clause
   AssertionError: expected null not to be null
   Test Files  1 failed (1)
        Tests  2 failed | 2 passed (4)

2) MUTATION PROBE (deleted exactly the two new `- surface:` entry blocks, nothing
   else): `Tests  2 failed | 2 passed (4)` with the same two "expected null not
   to be null" failures — sequences and workspace.deck pins still passed, so the
   test reads the shipped file. Restored with `git checkout --` and re-ran:

   ✓ src/ai/forcedToolCompliance.shipped.test.ts  (4 tests) 2ms
   Test Files  1 passed (1)
        Tests  4 passed (4)

3) Shipped pin after restore (same command): `Tests  4 passed (4)`,
   `Test Files  1 passed (1)`.

4) Regression pin — `cd server && npx vitest run src/ai/AgentOrchestrator.repeatEcho.test.ts`:

   FAIL ... > P8 (D4 guards): the retry arm never touches heldIntents — ...
   FAIL ... > P9a (CARD1-D2 positive, RED→GREEN): a same-thread answer suppresses the re-ask — ...
        Tests  2 failed | 9 passed (11)

   Failure set is exactly the measured pre-existing {P8, P9a}; pass count 9,
   unchanged. Not claimed as fixed, not caused by this unit.

5) `cd server && npx tsc --noEmit` → 0 output lines (0 errors).

6) `git -c core.fileMode=false status --short` → empty at exit.

## Commits

- 51c52716 test(L2-PROSE-SHORTHAND-SALVAGE-1 c3surf): RED pin on shipped forced-tool compliance surfaces
- 8ff94249 feat(L2-PROSE-SHORTHAND-SALVAGE-1 c3surf): declare event-editor + run-workspace in forced-tool compliance DATA

## Remaining

None. Live lane-stack behaviour was not claimed and no server was restarted
(policy loads per call; YAML changes need a lane-stack reload owned by the
orchestrator before any live verification).

L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c3surf DONE 8ff94249adbe41a2ac59c29afa7797fe107bae17
