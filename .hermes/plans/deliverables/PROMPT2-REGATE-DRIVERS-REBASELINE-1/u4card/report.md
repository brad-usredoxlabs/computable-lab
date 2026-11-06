# L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 UNIT 4 Report

## Context
u3diag verdict (C): server returns 3 clarificationRequests (options: [], menuProvider: "/m") in a done frame, but the client never paints `[data-testid="chat-clarification-card"]`. Three driver patches failed; this unit produces a deterministic in-process pin and fix.

## RED Test: ChatLog.regate.u4card.test.tsx
Created with verbatim leg3 wire bytes from curl-sse.log:
- 3 clarificationRequests (options: [], menuProvider: "/m", kind: "material")
- Request IDs: unresolved-c-de6a0cf836, unresolved-c-7b715dbc5f, unresolved-c-14f8b8158a
- message.content = result.clarification.prompt (first request's prompt)

Test 1: leg3 done frame with clean thread (user → assistant with 3 requests)
  - PASS: card renders, 3 slots present, NOT answered.

Test 2: S1 fix — user turn separated by non-user message must NOT suppress the card
  - Thread: assistant clarification → system message → user turn
  - PASS: card renders because the user message is NOT immediately following.

## Suspect Diagnosis
- **S1 ChatLog.tsx:117 isClarificationAnswered** — CONFIRMED BUG.
  Old code: `messages.slice(index + 1).some((m) => m.role === 'user')`
  This checks ANY user message after the clarification, not just the immediate answer.
  In the event-editor thread-scoped pane, thread hydration can place earlier user
  turns that are NOT the answer to this clarification. The `slice().some()` predicate
  finds them and marks the card as "answered", replacing it with the compact row.
  
  Fix: `messages[index + 1]?.role === 'user'` — only the immediately following message
  counts as the answer. This is the correct adjacency rule: the answer IS the next turn
  by construction (HarnessChatPane sends the answer as the next chat turn).

- **S2 useAiChat.ts:1768** — EXONERATED. The conditional spread is correct.
  `...(result.clarificationRequests?.length ? { clarificationRequests: ... } : {})`
  properly adds the field when requests exist.

- **S3 ChatLog.tsx:522-523** — EXONERATED. HarnessChatPane.tsx:402 supplies
  onClarificationSubmit, so the guard cannot be the live cause.

## Changed Files
1. `app/src/agent/ChatLog.tsx` — 1 line changed (isClarificationAnswered)
2. `app/src/agent/ChatLog.regate.u4card.test.tsx` — NEW (2 tests, ~80 lines)

## Verification
- `npx vitest run src/agent/ChatLog.regate.u4card.test.tsx` → 2 passed (1 file)
- `npx vitest run src/agent/ChatLog.grouped.card1.test.tsx` → 6 passed (regression)
- `npx vitest run src/agent/ChatLog.answeredrow.reload.card1.test.tsx` → 2 passed (regression)
- No typecheck needed (no signature/prop type changes)

## Blockers
None. The S1 fix resolves the client-side card suppression. Live browser verification
(u5) remains to confirm the fix renders in :5193.

L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1-u4card UNIT 4 DONE add05e6cb7f49ecee4911b6742f2278ea449ee8a
