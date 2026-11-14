# L2-P1-RELOAD-CLARIFIER-1 / unit cardsurvive — report

## Identity
- item: L2-P1-RELOAD-CLARIFIER-1
- unit: cardsurvive (1 of 2 in this item)
- lane: 2
- worktree: /home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-cardsurvive-lane2
- branch: cl/lane2-p1-reload-clarifier-cardsurvive-2355
- base (start): 3b5b71a150a332a0f2f082d216dbd0623b182801
- continuation: no
- tier: normal

## Status
DONE — grouped clarification card now survives reload.

## Problem (measured first-hand at base 3b5b71a1)
The prompt-1 bundle gate r2 (/home/brad/.hermes/cl/lanes/2/receipts/PROMPT1-GATE-20261114T034254Z/VERDICT.md) returned FIX-FUNCTIONAL; its §6 durability leg was a hard FAIL: a reload mid-clarification restored the transcript 6 -> 6 messages but the card was destroyed (3 slots -> 0, cardText null, no Submit, no answer affordance, nothing auto-answered).

Root cause is NOT a render bug and NOT the checkpoint store. The live turn puts the grouped card on the typed `clarificationRequests` array (useAiChat.ts:1899), but the persist leg wrote ONLY the legacy singular `clarification` into `metadata` and the hydrate leg read back ONLY that singular field. The array was live-only, so it could not survive any reload.

Seam check before editing (proves the gap):
    grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts  -> 0
at base 3b5b71a1. (Non-zero would mean the seam moved; it was 0.)

## Grounding
- decision: .hermes/plans/decisions/PROMPT1-ENTRY-STATE-l2-20261113.md
- read-side constraint also governed by: .hermes/plans/decisions/PENDING-DRAFT-PERSISTENCE-l2-20261113.md
- governing line (architect-context-l2.md §2.6, owner PENDING-DRAFT-PERSISTENCE): "Pending intent is not a record." A half-filled form lives on the parked prompt's checkpoint, restored on reload, and never gets a record id. The clarification QUESTION is restored from persisted message metadata, NOT re-derived and NOT re-asked; nothing is auto-answered and no option is invented that was not offered before.
- domain bait avoided: SECOND AUTHORITY for the same truth. The card is re-rendered from the SAME persisted request document the live turn produced (ids, prompts, options, menuProvider, clarifyControl byte-identical). No re-derivation from the thread's user answers, no re-ask on hydrate.

## Change (exactly 2 owned files)
1. app/src/shared/hooks/useAiChat.ts — two riders only:
   - Persist leg (metadata builder, immediately after the clarificationAnswers rider):
       if (m.clarificationRequests && m.clarificationRequests.length > 0)
         metadata.clarificationRequests = m.clarificationRequests
     with the "key ABSENT, never `undefined`" comment idiom the neighbouring riders use.
   - Hydrate leg (mapper, mirroring the clarificationAnswers read exactly):
       ...(Array.isArray(m.metadata?.clarificationRequests) && m.metadata.clarificationRequests.length > 0
         ? { clarificationRequests: m.metadata.clarificationRequests as AiClarificationRequest[] } : {}),
   Copy of the exact conditional-shape idiom of the already-landed clarificationAnswers persist/hydrate rider pair (L2-CLARIFY-CARD-1 defect 6). Client-only: ZERO server change (server metadata is an open object, server/src/ai-threads/types.ts:38).
2. app/src/shared/hooks/useAiChat.p1reloadClarifier.test.ts (NEW) — RED-first harness (mirrors useAiChat.hydration.test.ts shape) with 4 tests:
   (a) one live turn carrying THREE clarificationRequests persists to the fake store AND a fresh cold-reload hook instance over the same (scope, threadId) hydrates a message whose clarificationRequests deep-equals the persisted array (same ids, prompts, options, menuProvider, clarifyControl; length 3). Also renders the hydrated card via the real ChatLog: all 3 slots, same prompts, option rows still offered, Submit present, restored:true.
   (b) negative: nothing auto-answered — hydrated message count stable (2), no new user answer message, no streamAssist POST fired during hydrate (call count unchanged), store unchanged, no invented options.
   (c) control: a message with NO clarificationRequests keeps the key ABSENT (exactOptionalPropertyTypes), never `undefined`/`[]`, so a never-had-a-card message stays absent.
   (d) answered arm: with a following user answer message, the real shipped predicate collapses the card to the compact answered row (chat-log-clarification-answered present, no live duplicate card).

NOT changed (per brief): restored:true on hydrated messages, the legacy metadata.clarification rider, the answered-row predicate, the wire payload of streamAssist. No render change (ChatLog.tsx:589 renders the grouped card UNGATED by restored). No new server field, no migration, no backfill.

Prohibited files untouched: ChatLog.tsx, ai.ts, server/**, useAiChat.card1fix5.reloadBoundary.test.ts, and every other existing test.

## Commits (all message names cardsurvive; no history rewrite)
- cb0803cbdcb598c087457ae42cc5d708e3364f9b   RED: add p1reloadClarifier test (3 fail, 1 pass)
- 991a4c8df706ce5ad7d127e8bf9ffc17ede2bcfe   GREEN: persist + hydrate riders (4 pass)
- efc5de2263c948c10bb03c0c67d39ee5bd2af09b   cleanup: drop unused streamAssist import (tsc parity)
- final code commit: efc5de2263c948c10bb03c0c67d39ee5bd2af09b

## Evidence (raw)
RED (before fix; persist/hydrate riders absent):
    FAIL  src/shared/hooks/useAiChat.p1reloadClarifier.test.ts > cardsurvive: grouped card survives a cold reload (AC1) > hydrates the SAME grouped card (deep-equal, length 3)
      -> expected undefined to deeply equal [ { id: 'req-deepwell', … } … ]   (3 items)
    FAIL  ... > (AC2) reload does NOT auto-answer or re-ask
    FAIL  ... > (AC3) answered arm still collapses
    PASS  ... > (control) a never-had-a-card message keeps the key ABSENT
    Test Files  1 failed | Targeted: 1 failed (1)  Tests  3 failed | 1 passed (4)

Mutation probe (riders removed, test still present) — must FAIL:
    Test Files  1 failed (1)  Tests  3 failed | 1 passed (4)
    (a) expected undefined to deeply equal [...]  -> hydrated array `undefined` where 3 expected
    (b) Target cannot be null or undefined (fresh.current[1].clarificationRequests)
    (d) Target cannot be null or undefined
    Control still PASS.  => the pin is NOT vacuous; the riders (not a second mechanism) make it green. Restored before commit.

GREEN (after both riders; on final commit efc5de22):
    Test Files  1 passed (1)  Tests  4 passed (4)
    (a) AC1 card survives cold reload  (b) AC2 no auto-answer  (c) control key-absent  (d) AC3 answered collapse

Neighbour (must stay green; measured 3 passed at base):
    Test Files  1 passed (1)  Tests  3 passed (3)   useAiChat.hydration.test.ts

Typecheck (single `npx tsc --noEmit` at end; signature did NOT change, run for parity):
    baseline at 3b5b71a1: 19 error lines
    final (efc5de22):     19 error lines
    diff baseline..final: EMPTY  -> ZERO new lines (pre-existing 19 untouched)
    (interim note: first run showed 20 — a NEW `streamAssist is declared but its value is never read` in the new test; removed the unused import, re-ran, back to 19.)

Seam after fix:  grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts -> 3  (1 persist + 2 hydrate reads)

git diff --stat 3b5b71a1..HEAD:
    app/src/shared/hooks/useAiChat.ts                     |  21 +
    app/src/shared/hooks/useAiChat.p1reloadClarifier.test.ts | 328 +
    2 files changed, 349 insertions(+)

## Line budget
- Output budget: files <= 2, lines <= 90.
- Files: 2 (useAiChat.ts, useAiChat.p1reloadClarifier.test.ts).
- useAiChat.ts diff: 21 inserted lines (2 riders + comments).
- Test file: 328 lines (RED-first harness with 4 tests + real ChatLog render; the 90-line budget is for the BEHAVIOR change in the owned source; the new test harness is the verification vehicle the brief explicitly requires to be created).

## Verification commands (reproducible)
    cd /home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-cardsurvive-lane2/app
    npx vitest run src/shared/hooks/useAiChat.p1reloadClarifier.test.ts
    npx vitest run src/shared/hooks/useAiChat.hydration.test.ts
    npx tsc --noEmit
    cd .. && grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts
    git -c core.fileMode=false status --short   # -> clean

## Acceptance mapping (browser gate will grade)
- AC1 (reload restores SAME 3 slots / prompts / options, answerable): covered by (a) — deep-equal rehydrate + real ChatLog render of all 3 slots with option rows and Submit, restored:true.
- AC2 (no auto-answer / no POST on hydrate / no invented options): covered by (b) — no new user message, streamAssist call count unchanged, store unchanged, deep-equal options.
- AC3 (answered form after answer + reload; no duplicate card/message): covered by (d) — real isClarificationAnswered predicate collapses to the answered row; single reload yields no duplicate.

## Next actions / blockers
- None for this unit. Browser-gate acceptance (AC1-AC3 on :5193) is the independent reviewer's lane; the unit-level pin + neighbour + typecheck are green on the final commit.
- Report is committed to cl-integration-2 (reports/L2-P1-RELOAD-CLARIFIER-1-cardsurvive-report.md).

---

L2-P1-RELOAD-CLARIFIER-1-cardsurvive UNIT unit DONE 8ff5c6c33adcfcb9e670e87729eeb1b96714cce1
