# SPEC — SH-QC-1-OQ1: Server held-intent leak — shorthand heldIntents must clear on UI Cancel
Lane 2 · campaign ai-protocol-edit-and-router · minted from architect-ratified OQ1 (SH-QC-1 spec §9 F-3)
Spec author: orchestrator l2t1730, 2026-10-16. Worker: cl-coder. Server-only. No UI surface change.

## The leak (verified by orchestrator on trunk 4feb3f50 today)
- `server/src/ai/shorthandChat.ts`: `heldIntents` Map at :325 (module-level, conversation-keyed).
  Hold happens via the set path at :328-332 (with the MAX_HELD_CONVERSATIONS oldest-evict at :328-330).
  The ONLY removal primitive is `takeHeldShorthandIntent(key)` (:336, destructive pop).
- Take sites: `server/src/ai/AgentOrchestrator.ts:1267` and `:1751` — BOTH on the
  clarification-answers fold path only.
- `server/src/api/routes.ts` registers the AI surface (grep `aiHandlers.` — :657-661:
  /ai/draft-events, /ai/draft-events/stream, /ai/assist/stream, /api context warm GET/POST).
  There is NO cancel/clear route. Client-side cancel (`app/.../AiTabPanel.tsx:1109
  sidebarDispatch({type:'cancel'})`, chatReducer `stream-cancelled`) is purely local —
  nothing reaches the server.
- Consequence: a scientist who CANCELS a proposal keeps a server-held intent; a later
  clarification answer on the same conversation folds the CANCELLED intent in
  (`AgentOrchestrator.ts:1253`-area fold arm takes whatever is held). The scientist loses
  authority over what the AI keeps.

## The fix (smallest honest mechanism)
1. `shorthandChat.ts`: export `clearHeldShorthandIntent(key: string): boolean` — deletes the
   entry, returns whether one existed. Non-destructive of any other key. Mirror the export
   style of `takeHeldShorthandIntent`.
2. One new route on the EXISTING AI handler registration block (routes.ts, same
   `aiHandlers.*.bind` pattern, adjacent to :657-661):
   `POST /ai/shorthand/cancel` — body carries the conversation identity the held key is built
   from. FIND the conversation-key derivation first (`factRequestId`/conversationKey
   construction in shorthandChat.ts + how AgentOrchestrator computes `conversationKey` at
   :1267/:1751) and reuse EXACTLY that derivation from the request body — do not invent a
   second key scheme. Response: 200 `{ cleared: boolean }` (idempotent: clearing an
   already-clear conversation is a success, `cleared:false`).
   - Body validation via the existing pattern the other AI routes use (check
     `AIHandlers.ts` assistStream's body validation; keep the same error shape).
     exactOptionalPropertyTypes is ON: optional means absent OR value, never undefined.
   - No auth changes beyond whatever the sibling /ai/* routes already require — match them
     exactly, do not invent policy.
3. `AIHandlers.ts`: a `shorthandCancel` handler that resolves the conversation key from the
   validated body and calls `clearHeldShorthandIntent`. It must NOT touch anything else
   (no stream abort, no state beyond heldIntents — this is the smallest fix).
4. Do NOT wire the client. No app/ changes. (Client call-site wiring folds into the next
   UI-gated item per the task block: "no UI surface change -> NO browser gate".)

## Hard rules
- Zero hardcoded domain policy; no new emission channel; no YAML changes.
- Do not modify the take/fold path semantics (answer-path fold stays byte-identical;
  regression pins AgentOrchestrator.repeatEcho.test.ts P8/D4 guards must stay green —
  they assert heldIntents untouched on the retry arm).
- Files owned: server/src/ai/shorthandChat.ts; server/src/api/handlers/AIHandlers.ts;
  server/src/api/routes.ts; new server test file(s) alongside them. NOTHING else.

## RED-first acceptance (vitest, mirroring shorthandChat/assist test conventions — stub
llmClient/store, zero real model calls)
- R1: hold an intent for conversation K (drive the real hold path or use the exported hold
  helper the tests already use — see AgentOrchestrator.shorthandChat.test.ts:589 reHeld
  pattern), call the new cancel route/handler for K, then `takeHeldShorthandIntent(K)` ->
  null. Before the fix this must FAIL (intent still held).
- R2 end-to-end leak proof: hold via a real needs-clarification turn, send cancel, then
  submit a clarification answer on the same conversation -> the follow-up turn contains ZERO
  held-intent fold (the answer behaves as if nothing was held). Before the fix this FAILS.
- R3: cancel on an unknown/cleared conversation -> cleared:false, no throw, other
  conversations' held intents untouched (two keys, cancel one, the other still takes).
- R4 regression: existing answer-path fold green unchanged (the fold takes when NOT cancelled).
- Bars: `cd server && npx vitest run` on the touched test family green;
  `npm run typecheck -w server` baseline-clean (measure base first — the known baseline is
  the single AgentOrchestrator TS2339 pre-existing error);
  `git -c core.fileMode=false diff --stat` shows ONLY owned files, ZERO YAML.

## Evidence-debt note for the report
Record any assumption (e.g. the exact conversation-key derivation chosen, idempotence
semantics) in the report's Assumptions section.

## Deliverable
Report at .hermes/plans/SH-QC-1-OQ1-report.wip-l2t1730.md IN YOUR WORKTREE
(/mnt/vast/home/brad/git/wt/SH-QC-1-OQ1-lane2-l2t1730, branch cl/SH-QC-1-OQ1-lane2-l2t1730,
base 4feb3f50 = trunk). Commit code + report on the branch. End the report AND your final
message with the marker: SHQCOQ1 DONE <sha40>.
Known trunk pitfall: ZymoCampaignNegatives.test.ts fails at SUITE level on this base
(missing untracked datatypes/revision-ref.schema.yaml, lane-excluded) — pre-existing, NOT
yours, do not fix or copy the YAML.
