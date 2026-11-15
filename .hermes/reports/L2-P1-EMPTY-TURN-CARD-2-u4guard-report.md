# L2-P1-EMPTY-TURN-CARD-2 — unit 4 (u4guard) report

Lane 2 worktree: /home/brad/cl-wt/L2-P1-EMPTY-TURN-CARD-2-u4-lane2
Branch: cl/lane2-etc2-u4guard-l2t2590 · base: 515c43a94764c0b11409610bead39a8f6282e2e7

## What changed (seam: AgentOrchestrator.ts final-answer guard, ~:3130-3176)

The final-answer guard's condition carried `!(result.notes?.length ?? 0)`, so ANY
notes-bearing turn BYPASSED the guard: a notes prose naming a labware the lab does
not hold exited success with zero clarificationRequests (gate r9 defect 2, legC2
e018cfe4 "Nunc CryoBox 12x12" — persisted with NO metadata at all).

Fix (the one seam):
- Guard condition: `!isDocDiscussionTurn && result.success &&
  draftProducedNothingOnServer(result)` — the notes clause moved OUT of the
  condition.
- Inside, `emptyTurnAbsenceRequests(effectivePrompt,
  shorthandSearchLabwareByHint ?? (async () => []))` is called once (2-arg form,
  the CURRENT file's signature at base; no PROBE-TIERS 3rd param here).
- No-notes arm: byte-identical behavior — `success: false` +
  `emptyDraftMessage({truncated, hadArguments: false, noToolCall: true})` + the
  conditional spread `...(emptyTurnAbsence.length > 0 ? { clarificationRequests:
  emptyTurnAbsence } : {})`.
- Notes-bearing arm (NEW): `else if (emptyTurnAbsence.length > 0)` → attach
  `clarificationRequests: emptyTurnAbsence` beside the notes. success stays TRUE,
  NO error, no new message vocabulary. Key absent (never undefined) when no noun
  misses (the else-if gate).

Untouched per scope: shorthand backstop (~:3590-3609, attaches the card
unconditionally — still green), emptyTurnAbsenceRequests itself, clarifications.ts.

Files (2 changed, 149 insertions / 12 deletions vs base):
- server/src/ai/AgentOrchestrator.ts (guard block only; 32 ins / 12 del)
- server/src/ai/agentOrchestrator.emptyTurnGuard.notes.test.ts (NEW, 117 lines —
  mounts the REAL final-answer seam: content-only assistant message, no
  tool_calls, finish_reason 'stop', forceDraftTool:false, no attachments →
  parseAgentFinalResponse arm; real createLabwareLookup store probe, not a stub)

Worktree-only (gitignored, not committed): server/node_modules + node_modules
symlinks → /mnt/vast/home/brad/git/cl-integration-2 layout; server/schema →
../schema (trunk layout mirror per the item's NOTE — fresh worktrees lack them).

## RED (committed 3689f268c, before the fix)

`npx vitest run src/ai/agentOrchestrator.emptyTurnGuard.notes.test.ts`:
Test Files 1 failed (1) · Tests 1 failed | 2 passed (3)
AC1: expect(result.clarificationRequests).toHaveLength(1) → "Target cannot be null
or undefined." (success true, notes 1, events 0, clarificationRequests undefined —
exactly the persisted-metadata defect). AC2a/AC2b passed on base (unchanged shapes).

## GREEN (on final commit 7c6e02fd6...)

`npx vitest run src/ai/agentOrchestrator.emptyTurnGuard.notes.test.ts
src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts src/ai/clarifications.emptyTurn.test.ts`
→ ✓ 15 + ✓ 3 + ✓ 9 = Tests 27 passed (27), 3 files passed.

## AC map

1. Notes-bearing zero-event turn + absent labware noun ⇒ card: GREEN test AC1 —
   result.success=true, error undefined, notes.length=1, events 0,
   clarificationRequests length 1, kind 'labware', menuProvider '/l',
   absence.mention "Nunc CryoBox 12x12", reason "Not in this lab's records: Nunc
   CryoBox 12x12", options []. (RED on base: clarificationRequests undefined.)
2. Notes-bearing turn, noun resolves (store holds "Nunc CryoBox 12x12" labware
   record — name-tier hit) or no labware noun: AC2a/AC2b — success true, no
   error, notes preserved, 'clarificationRequests' key ABSENT.
3. Truly-empty no-notes named-cause error path unchanged: AgentOrchestrator.
   finalAnswerEmpty.test.ts 9/9 green (CARD-1 pins + u1emptycard pins + u2mentionfix
   shorthand backstop pin) and clarifications.emptyTurn.test.ts 15/15 green.
4. Typecheck: `npm run typecheck -w server` — 6 errors on base (AIHandlers x3,
   AiIngestionHandlers, ExtractProtocolHandler, sequenceRoutes), identical 6 on
   final commit; diff of the error lists empty ⇒ delta 0.
   Full ai suite `npx vitest run src/ai`: base 43 failed | 1328 passed (1371);
   final 43 failed | 1331 passed (1374). Per-file failed sets identical (diffed,
   only ms timings differ) ⇒ failing delta 0; +3 passed = the new u4guard legs.

## Commits

- 3689f268c test(L2-P1-EMPTY-TURN-CARD-2 u4): RED — notes-bearing empty turn drops the absence card
- 7c6e02fd6 fix(L2-P1-EMPTY-TURN-CARD-2 u4): the final-answer empty-turn guard reaches the named-absence CARD on notes-bearing turns (card beside the notes, no error)  ← tip at report time

## Remaining / notes

None. Browser/acceptance review is the reviewer's; the client renders
result.clarificationRequests as cards (gate defect 2 was "not a client render
omission" — the channel object now exists server-side).

L2-P1-EMPTY-TURN-CARD-2-u4guard UNIT L2-P1-EMPTY-TURN-CARD-2-u4guard DONE e40e4d7d30ba802ba7236c20cc1eeb46e9b42acf
