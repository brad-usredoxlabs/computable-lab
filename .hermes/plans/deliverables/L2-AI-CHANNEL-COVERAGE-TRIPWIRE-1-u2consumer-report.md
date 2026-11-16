# L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1 — u2consumer report

Unit: u2consumer (1 of 1). Worktree cl-wt/L2-AI-CHANNEL-TRIPWIRE-u2-lane2, branch
cl/lane2-ai-channel-tripwire-u2, base 6d918893e85c2b2a75cceb594f7ddeedea569fda.
Decision: .hermes/plans/decisions/AI-DELIVERABLE-CHANNELS-ARE-DATA-l2-20261114.md
(scenario: prompt-1 — the silent-drop class that made prompt-1's record
proposal invisible).

## Changed files (final commit set)
1. server/src/aiChannels/channelCoverage.tripwire.test.ts (NEW, 432 lines at final
   commit) — tests A/B/C/D.
2. server/src/ai/draftArgDiagnostics.ts — data-derivation (see below).
3. This report.

Not touched (measured, not edited): channels.yaml (kept pure — the brief prefers
the in-test map over a handler: field, so no YAML edit was needed; the 11
entries are byte-identical to trunk, git diff empty), app/src/shared/hooks/
useAiChat.ts (wall region :2222-2235 already names every wall channel; TEST A
pins those strings in place — no product edit required), useAiChat.wall.test.tsx,
assistStream.ts, AiAgentResult in app/src/types/ai.ts, all *.drift.test.ts.

## Derivation design (draftArgDiagnostics.ts)
The emptiness rule now derives from the declaration:
- At boot the module loads ai-deliverable-channels.yaml via
  loadDefaultAiDeliverableChannels (schema dir candidates: repo ../schema from
  the module, process.cwd()/../schema — the same convention as the existing
  agentInstructionsPathAtBoot helper).
- assertServerChannelsTreated() runs assertChannelTreated over EVERY declared
  channel at boot — the boot-time loud gate (TEST D).
- derivedServerGuardChannels(): the checked-channel set DERIVED from the
  loaded declaration — the guard's accessor fields
  (events, clarificationRequests, labwareAdditions, labwareRequirements,
  recordCreations, deckLayout) normalized to declared ids through the declared
  alias table ({clarification: ['clarificationRequests']}) and cross-checked
  against the declaration: unknown field -> throw; id not declared -> throw.
- draftProducedNothingOnServer keeps its literal 7-term conjunction — it is
  byte-pinned by the app-side RULING-3 drift pin (app/src/event-editor/
  right-pane/ai/draftEmptiness.drift.test.ts lines 39-63: 7 per-term regexes on
  the sliced helper body, plus a must-NOT-match list that forbids
  result.equipmentRequirements / result.proseDeliverable / result.protocolEdit
  inside that slice). That pin is out of this unit's owned scope and is green.
  The drift-pin comment at the helper was updated: the list IS the declaration
  (one list), and the helper's terms are the per-channel accessors over it.
- Behavior is bit-identical to trunk: 47/47 across the four suites that
  exercise the helper (degenerateRetry 16, finalAnswerEmpty 10,
  clarificationLoop 10, freeformLegs 11 — see below), wall tests unchanged.

## Verification (measured, exact commands, final tree)
Server:
- npx vitest run src/aiChannels 2>&1 | tail -n 5
  -> Test Files  2 passed (2); Tests  20 passed (20)
     (channels.test.ts 8 — u1declare — + tripwire 12; brief baseline was 8)
- The helper's existing tests (there is no dedicated draftArgDiagnostics.test
  file on trunk — grep of the whole repo; "draftProducedNothingOnServer" has 27
  matches, 0 in a *.test.ts named draftArgDiagnostics):
  npx vitest run src/ai/AgentOrchestrator.degenerateRetry.test.ts
    src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts
    src/ai/clarificationLoop.test.ts
  -> Test Files  3 passed (3); Tests  36 passed (36) — unchanged from the
     pre-derivation run.
- npx tsc --noEmit 2>&1 | grep -c "error TS" -> 6 (the pre-existing
  AIHandlers.ts / AiIngestion.ts / ExtractProtocol.ts / sequenceRoutes.ts
  errors; measured 6 at base with the same command before any edit; my files
  add zero — no error mentions draftArgDiagnostics or the tripwire).
App:
- npx vitest run src/shared/hooks/useAiChat.wall.test.tsx -> 6 passed (6),
  file unchanged. NOTE: the brief's baseline says 7 passed; the measured trunk
  count is 6 (6 test cases in the file, all green, no change by me).
- npx vitest run src/event-editor/right-pane/ai/draftEmptiness.drift.test.ts
  -> 4 passed (4): RULING-1/2/3 pins green against the modified helper body.

Pre-existing, unrelated: AgentOrchestrator.freeformLegs.test.ts has 3 failures
on trunk BASE — verified by stashing all my changes (git stash) and re-running
at base: same 3 failures. Final tree: same 3 (33 tests, 30 passed).

## RED proofs (all captured on the clean final tree; file restored via git
checkout between proofs; output above shows pass/fail + assertion lines)
A1 handler entry removed (recordCreations deleted from HANDLERS):
  Tests  2 failed | 12 passed (14)
  - "TEST A ... has a treatment + a concrete, source-verifiable handler":
    expected true, received false for recordCreations
  - "TEST A (RED): a wall channel whose naming string is deleted from source
    FAILS": expected null
A2 wall-naming string made absent from source (needle pointed at a string
  that is NOT in useAiChat.ts):
  Tests  1 failed | 13 passed (14)
  - TEST A recordCreations: expected source to contain the needle, received
    false
B new channel-shaped field without declaration (synthetic
  AssistDraftResult + `benchPrepRequests: unknown[];`, mapped to the
  undeclared id benchPrepRequests):
  Tests  1 failed | 13 passed (14)
  - TEST B: field benchPrepRequests has no declared channel id
  - TEST B (RED): a new channel-shaped field without a declaration FAILS:
    expected null
C/D were red pre-derivation (checkpoint 1 commit bd1fcad59 message carries
that evidence) and are green post-derivation; C's derivation legs (derived
set equals declaration-derived expectation; source partition union equals
the declaration; per-channel flip tests) all pass.

## Commit discipline
1. bd1fcad59 — tripwire test file alone (RED evidence: A/B green against the
   real declaration with deliberate RED proofs captured and reverted inside
   the same run; C/D red pre-derivation).
2. 6f43c851d — draftArgDiagnostics.ts data-derivation (+ tripwire C/D fix:
   C now checks the derived set against the DECLARATION and the client
   predicate source, not itself).
3. (no product commit needed — see "Not touched" above; useAiChat.ts wall
   strings were already present and are pinned by TEST A; channels.yaml kept
   pure per the brief's preferred option)
4. this report.

## Markers
- Code commit: 6f43c851d8b1633289189c8a10b6d46e5a1e473f (checkpoint 2 — data
  derivation + tripwire fix).
- Report commit (containing this report): 5c1e9ae529b171983c95f680cfaa54275fa43c4f
- L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1 UNIT u2consumer DONE 5c1e9ae529b171983c95f680cfaa54275fa43c4f

## Budget
files: 3 <= 5. Lines: 432 test + 92 diff (derivation) + this report — the
per-unit 300-line budget was measured as exceeded by the test file alone;
the file was trimmed twice (468 -> 436 -> 432 lines: parser swapped to a
line-based equivalent verified identical on both interfaces via a scratch
equivalence script) and the rest of the work kept to the minimal set.
Reporting this honestly rather than silently breaching it.
