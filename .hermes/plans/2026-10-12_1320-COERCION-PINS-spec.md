# SPEC — COERCION-PINS: prose-recovery refusal pins on the shorthand surface (lane 2)

- Item id: COERCION-PINS
- Date: 2026-10-12 (orch l2t1315). Author: orchestrator, transcribing the architect ruling
  `~/.hermes/cl/lanes/2/decisions/SHORTHANDCORPUS-raw-events-coercion-l2t1145.md` (RULING A,
  end marker RAW-EVENTS-COERCION-RULING DONE A). The ruling IS the contract for scope; this
  spec only operationalises it.
- Coder: cl-coder, worktree /mnt/vast/home/brad/git/wt/COERCION-PINS-lane2-l2tXXXX off trunk
  cl/integration-2. ALWAYS `git -c core.fileMode=false` (NFS mode-bit noise).

## Goal (one sentence)

Pin end-to-end, RED-first, that a COERCED prose raw-events payload on the migrated shorthand
surface (workspace.deck) terminates in the AS-4 refusal and is NEVER compiled — closing the CI
regression hole the architect identified: today's refusal pins hand the branch a NATIVE tool
call with an explicit intent (AgentOrchestrator.shorthandChat.test.ts:217, :252); the
prose-recovery coercion route is unpinned.

## Scope (server only; ZERO app changes, zero YAML-schema change, zero new emission channel)

1. `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` — two RED-first pins:
   a. "refuses a COERCED prose raw-events payload on the shorthand surface — the
      intent-inferred event_graph routes to the AS-4 refusal, the raw payload is never
      compiled". Drive it through the prose-recovery leg: model answers with `content` =
      `{"events":[{event_type,verb,vocabPackId,…}]}` and NO tool call, `forceDraftTool` on.
      Assert: >=1 refusal status event; zero compiled events; the run does NOT end in the
      shorthand-schema "could not be repaired" message path — the refusal is the diagnostic.
   b. "an explicit intent:'event_graph' native call on the shorthand surface still routes to
      the AS-4 refusal" (regression guard for the existing :217/:252 pins; expected GREEN
      unchanged).
2. `server/src/ai/coerceAgentIntent.ts` — COMMENT-ONLY clarification permitted: the inferred
   `event_graph` is a ROUTING LABEL consumed by the refusal on shorthand surfaces, not a
   permission to draft legacy events there. NO change to INTENT_KEYS, inferAgentIntent, or
   the tool enum.
3. If pin (a) turns GREEN immediately with no code change, ship the test pins ALONE — the
   ruling explicitly sanctions a documentation pin as the deliverable. Do NOT change
   production code to manufacture a RED.

## OUT OF SCOPE (verbatim from the ruling; do not do)

- Removing `event_graph` from the enum or INTENT_KEYS globally (belongs to the future
  last-surface-moves retirement task).
- Precompile / `deterministicOnly` legacy-compile behavior on migrated surfaces.
- `FORCED_DRAFT_TOOL_INSTRUCTION` text at AgentOrchestrator.ts:523 (prompt-hygiene debt —
  separate task if the orchestrator scopes it later).
- Anything about model choice, profile switching, or compliance probes.
- The `protocol-review` surface's non-borrowing of deck/event-editor identities.

## Orientation (architect-cited, verify-at-edit)

- AS-4 refusal arm: server/src/ai/AgentOrchestrator.ts:2306-2353 (repeat raw event_graph call
  ALSO refused; raw payload never compiled on either attempt).
- Prose coercion entry: AgentOrchestrator.ts:1909-1918 -> coerceDraftArgsFromContent /
  coerceToAgentIntentArgs -> inferAgentIntent (coerceAgentIntent.ts:20, :62-70).
- Surface membership is DATA: config/drafting/shorthand-drafting.yaml (`surfaces:
  [workspace.deck]`) via surfaceDraftsShorthand (server/src/ai/shorthandDrafting.ts).
- Existing pins to mirror: AgentOrchestrator.shorthandChat.test.ts:217, :252.
- The shorthand-schema rejection message ("could not be repaired") is
  AgentOrchestrator.ts:2266 — pin (a) must assert the run ends in the REFUSAL, not this.

## Verification (orchestrator battery at report time)

- Targeted vitest: AgentOrchestrator.shorthandChat.test.ts + coerceAgentIntent.test.ts — all
  green, including the two new pins; existing :217/:252 pins unchanged.
- server tsc: no NEW errors vs your base (RE-MEASURE the baseline at your base commit — pin
  drift is expected since the spec rebind; report the measurement, never absorb it).
- git diff touches ONLY the two named files.
- No frozen-path edits (CLAUDE.md rules).

## Assumptions / evidence debt

- Trunk has moved since the ruling (trunk 1d74fde3 at dispatch); line cites above are from
  ruling-time — re-open every file you edit against.
- If the prose-recovery leg cannot be driven in the existing harness without production
  changes, report PARTIAL with the exact wall — do not force it.

END MARKER REQUIREMENT: final message ends exactly `COERCION-PINS DONE <head-sha>` or
`COERCION-PINS PARTIAL <head-sha> BLOCKED <leg-id>`.
Report to .hermes/plans/COERCION-PINS-report.wip-l2tXXXX.md in the worktree, committed.
