# CODER REPORT — COERCION-PINS (lane 2, l2t1315)

- Branch: cl/COERCION-PINS-lane2-l2t1315
- Base: 19eb8aa7ed13918abd0515bf47f9b3c77b75b2b4 (cl/integration-2 trunk HEAD at dispatch)
- Head: 85055369 (test pins + comment-only clarification; 2 files, +106 lines)
- Verdict: DONE. Pin (a) turned GREEN immediately with ZERO production change —
  the ruling explicitly sanctions shipping the pins alone. No production code was
  touched, so no RED was manufactured.

## What changed (git diff restricted to the two named files)

1. `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` (+98 lines, two new pins):
   - "refuses a COERCED prose raw-events payload on the shorthand surface — the
     intent-inferred event_graph routes to the AS-4 refusal, the raw payload is
     never compiled". Driven through the prose-recovery leg: stub model answers
     with `content` = `{"events":[{event_type,verb…}]}` and NO tool call,
     `forceDraftTool` on, surface `workspace.deck`. The stub's single response
     repeats (stubModel clamps to the last spec), so the re-ask is answered with
     the same prose raw events and the repeat refusal ends the turn.
     Asserts: the coercion leg actually ran ("Parsed the draft from the model's
     text" status); >=1 refusal status event (exactly 2 observed); re-ask carries
     the `event_shorthand` demand; result.success=false with the honest
     "cannot draft … refused again" error; the error does NOT match "could not be
     repaired" nor "scientist-intent schema" (the :2266 path is NOT the terminal
     diagnostic); zero compiled events; payload string 'invented' absent from the
     result; no termManifest; `runChatbotCompile` spy never called; 2 model calls.
   - "an explicit intent:'event_graph' NATIVE call on the shorthand surface still
     routes to the AS-4 refusal (COERCION-PINS regression guard for the :217/:252
     pins)". Same repeat-refusal shape, plus asserts the prose-coercion leg did
     NOT run (native call). GREEN unchanged as expected.
2. `server/src/ai/coerceAgentIntent.ts` (+8 lines, COMMENT ONLY): docstring on the
   `event_graph` INTENT_KEYS entry — the inferred `event_graph` is a ROUTING LABEL
   consumed by the AS-4 refusal on shorthand-drafting surfaces, not a permission to
   draft legacy events there; retirement belongs to the last-surface-moves task.
   NO change to INTENT_KEYS values, inferAgentIntent, enums, or any production logic.

## PIN DRIFT: none found

Every ruling-time cite was re-opened in this worktree (base 19eb8aa7) and matches
reality exactly:
- AS-4 refusal arm: AgentOrchestrator.ts:2306-2353 (arm starts :2317) — verified.
- "could not be repaired" message: AgentOrchestrator.ts:2266 — verified.
- Prose coercion entry: AgentOrchestrator.ts:1909-1918 (coerceDraftArgsFromContent
  at :1909, coerceToAgentIntentArgs at :1918; slow-path twin at :1996-2002) — verified.
- Existing pins: shorthandChat.test.ts:217 and :252 — verified (line content checked).
- coerceAgentIntent.ts:20 (INTENT_KEYS.event_graph), :62-70 (inferAgentIntent) — verified.
- FORCED_DRAFT_TOOL_INSTRUCTION now at :510 (ruling cited :509-526/:523 — same block,
  trivially shifted; OUT OF SCOPE, untouched).
Trunk at dispatch was 19eb8aa7 (spec's "1d74fde3" was the pre-rebind pin); the worktree
branch was created off cl/integration-2 HEAD as instructed.

## Baselines measured at MY base commit (19eb8aa7), in this worktree

- server tsc (`npx tsc --noEmit` from server/): 0 error-TS lines, exit 0.
  After my edits: 0 error-TS lines, exit 0; sorted base/head error lists are
  byte-identical (diff empty) — zero new errors.
- Targeted vitest BEFORE edits: AgentOrchestrator.shorthandChat.test.ts 16/16,
  coerceAgentIntent.test.ts 9/9 — 25/25 green.
- Targeted vitest AFTER edits: shorthandChat 18/18 (16 existing + 2 new),
  coerceAgentIntent 9/9 — 27/27 green.
- Neighbor regression run (coercion-adjacent suites, unchanged files):
  coerceDraftArgs.test.ts 10/10, AgentOrchestrator.protocolEditRecovery.test.ts
  4/4 — combined 4 files, 41/41 tests passed.

## Evidence the prose pin is non-vacuous (real run log, vitest stderr)

    [agent 7pif0z] recovered draft args from content as agent_intent (intent inferred); skipped the second call
    [agent 7pif0z] refused raw event_graph on shorthand surface workspace.deck; re-asking for shorthand
    [agent 7pif0z] refused a REPEAT raw event_graph on shorthand surface workspace.deck; ending the turn with the honest cannot-draft failure

The inferred-label coercion route ran and terminated in the refusal; the legacy
compile spy was never called. The native-guard pin (agent 54hmv8) shows the same
two-refusal shape with no "recovered draft args from content" line.

## Worktree environment notes (for orchestrator verification)

- The pre-created worktree lacked the lane-sync state (my OWN-11 lesson: baselines
  read WRONG without it). I reproduced it: 60 symlinks for the lane-exclude
  server/src+app/src entries (schema entries already tracked at trunk; none needed
  copying), plus `node_modules -> computable-lab/node_modules`,
  `server/node_modules -> computable-lab/server/node_modules`, and
  `server/schema -> ../schema` (matching cl-integration-2's own layout — without
  it the scientist-intent vocabulary triplet is invisible from the server cwd and
  shorthandChat tests fail at collect). The three node_modules/schema links were
  appended to /home/brad/.hermes/cl/lanes/2/lane-exclude so they can never be
  staged. `git status --porcelain` is clean; only the two named files show in the
  diff.
- All git commands used `-c core.fileMode=false`.

## OUT-OF-SCOPE compliance

No edits outside the two named files. event_graph stays in the enum and INTENT_KEYS;
no precompile/deterministicOnly change; FORCED_DRAFT_TOOL_INSTRUCTION untouched;
nothing about model choice/profiles/compliance probes; protocol-review untouched.
No frozen-path edits.

COERCION-PINS DONE 85055369
