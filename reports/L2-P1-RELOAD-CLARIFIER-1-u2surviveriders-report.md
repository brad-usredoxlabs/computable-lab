# L2-P1-RELOAD-CLARIFIER-1 / unit u2surviveriders — report

## Identity
- item: L2-P1-RELOAD-CLARIFIER-1
- unit: u2surviveriders (1 of 1 in this attempt)
- lane: 2
- worktree: /home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-lane2
- branch: cl/lane2-p1-reload-clarifier-u2surviveriders-0245
- base: 14db8f9775c6d4b3ecd75cb824b1b015ea479193
- continuation: no
- tier: normal

## Status
DONE — the typed `clarificationRequests` array now persists onto the assistant
message's thread metadata and is read back verbatim on hydrate, so a reload
mid-clarification restores the SAME grouped card (same request ids, prompts,
offered options) instead of an empty slot set. This is the CODE half the earlier
unit `cardsurvive` owed (its trunk commits 8ff5c6c3/320e4d64/3dea6832 were
docs-only; the seam was still 0 at trunk).

## Problem (measured first-hand this run)
`grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts`:
- at base 14db8f97 (worktree): **0** — the typed array was live-only
- at trunk cl/integration-2 HEAD f691be96 (brief's trunk check): **0**, and
  `git diff 14db8f97 f691be96 -- app/src/shared/hooks/useAiChat.ts` is EMPTY —
  the seam did NOT move.
- while `clarificationRequests` rode the LIVE assistant turn at the done arm
  (useAiChat.ts:1987-1988 at base) and the answered `clarificationAnswers`
  rider was already persisted (base :1337-1338) / hydrated (base :1252-1253).
So the typed array could not survive any reload: prompt-1 gate F5 "card-death on
cold reload" (3 slots → 0, no Submit, nothing answerable).

## Grounding
- decision: .hermes/plans/decisions/PENDING-DRAFT-PERSISTENCE-l2-20261113.md
- scenario: prompt-1 (manifest `completed_when` arm "the sentence can be
  resumed"; the gate's §6 durability leg)
- governing line (`.hermes/plans/architect-context-l2.md` §2.6, line 40, owner
  PENDING-DRAFT-PERSISTENCE-l2-20261113.md): "**Pending intent is not a
  record.** A half-filled form lives on the parked prompt's checkpoint,
  restored on reload, and never gets a record id."
- Domain bait avoided (SECOND AUTHORITY): the hydrate leg reads back the SAME
  persisted document the live turn wrote (deep-equal on ids/prompts/options/
  menuProvider/clarifyControl in the new test); nothing is re-derived on
  hydrate, nothing re-asks the server (zero stream/POST asserts), no option is
  invented. SURFACE-NOT-REACHABLE avoided: AC1's answerable leg is the shipped
  grouped-card arm (ChatLog.tsx:538 is NOT gated on `restored`), so a correct
  rehydrate needed NO render change.

## Change (exactly 2 owned files; 163 inserted lines, 0 deleted)
1. `app/src/shared/hooks/useAiChat.ts` — TWO edit sites only (20 lines: 9 + 11):
   - Persist leg (metadata builder, immediately after the `clarificationAnswers`
     rider, now at :1346-1347):
       ```
       if (m.clarificationRequests && m.clarificationRequests.length > 0)
         metadata.clarificationRequests = m.clarificationRequests
       ```
     same conditional-shape / "key ABSENT, never `undefined`" idiom as the
     neighbouring riders (a plain turn persists byte-identically).
   - Hydrate leg (SAME mapper, mirroring the `clarificationAnswers` read, now at
     :1262-1264):
       ```
       ...(Array.isArray(m.metadata?.clarificationRequests) && m.metadata.clarificationRequests.length > 0
         ? { clarificationRequests: m.metadata.clarificationRequests as AiClarificationRequest[] }
         : {}),
       ```
     rides the array back VERBATIM. `AiClarificationRequest` was already
     imported (useAiChat.ts:39) — no import change.
   Client-only: ZERO server change (server metadata is an open object,
   `server/src/ai-threads/types.ts:38`). No new server field, no migration, no
   backfill.
2. `app/src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts` (NEW, 143 lines)
   — RED-first harness (mirrors `useAiChat.hydration.test.ts` shape; mocks only
   `aiThreadClient`, `aiClient`, `client`), 3 tests:
   - (a) PERSIST: one live turn carrying THREE typed `clarificationRequests`
     (ids req-1..3; a material slot with an option, a material+quantity
     `clarifyControl` slot, a well-selection `clarifyControl` slot) drives the
     hook's persist effect into the mocked thread store; asserts the LIVE
     assistant message carried the array AND the `appendThreadMessage`
     assistant payload's `metadata.clarificationRequests` deep-matches it.
   - (b+c) COLD RELOAD: a FRESH hook instance over the same (scope, threadId)
     fed the EXACT persisted document hydrates a message whose
     `clarificationRequests` deep-equals the persisted array (length 3, same
     ids) — and asserts the negative: zero user (answer) messages, ZERO
     `streamAssist` calls, ZERO `appendThreadMessage` calls on hydrate (nothing
     auto-answered, nothing re-asked, nothing re-posted — no duplicate).
   - (d) ANSWERED arm: the SAME restored card + a following user answer rendered
     through the shipped `ChatLog` (real component, not a re-implementation)
     collapses to exactly ONE `chat-log-clarification-answered` row and NO
     `chat-clarification-card` — the only faithful way to assert the
     module-private `isClarificationAnswered` (ChatLog.tsx:127, NOT exported;
     ChatLog.tsx is prohibited) is true without re-implementing it, mirroring
     the existing answeredrow pin. The `.ts` (not `.tsx`) named file forbids
     JSX, so the render uses `createElement`.
   Design note: test (b)/(d) seed the store with the same fixture the persist
   leg writes (shared `THREE`), so the hydrate leg is asserted independently of
   the persist leg — the mutation probe (both riders deleted) therefore fails at
   the HYDRATE assertion (hydrated array `undefined` where 3 expected) rather
   than staying green (vacuous).

NOT changed (per brief): `restored: true` (now :1276), the legacy
`metadata.clarification` rider, the answered-row predicate, the wire payload of
the stream/send path, the `clarificationAnswers` riders, and all prohibited
files (ChatLog.tsx, ai.ts, useAiChat.hydration.test.ts, server/**).

## Commits (all message names u2surviveriders; no history rewrite)
- b42c0cdd495b4a3cb63aacd4c43664fbee9ae3f8   RED: pin persist+hydrate round-trip (3 failed)
- ebe116158d94a2dfca91e02b2f3263d6cc5da398   persist leg rider (2 failed | 1 passed)
- 184fb69ccc788d11a926e0e7aa4a5cfe6385488c   hydrate leg rider (3 passed) = FINAL CODE COMMIT

## Evidence (raw)
Seam BEFORE (base 14db8f97 worktree AND trunk f691be96): 0 (see Problem).
Seam AFTER (final 184fb69c): 3 (1 persist write + 2 hydrate reads).

RED (riders absent; test present — re-measured on this exact test file):
    + Received:
    undefined
     ❯ src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts:134:40
    Test Files  1 failed (1)
         Tests  3 failed (3)
         Duration  16.43s
  (a) failed at the persist-stage expect (metadata.clarificationRequests absent
  from the append), (b)/(d) failed at `expect(card.clarificationRequests)
  .toEqual(THREE)` → hydrated array `undefined` where 3 expected.

Step check (persist leg only, commit ebe11615): Tests 2 failed | 1 passed (3)
  — (a) PERSIST now passes; (b)/(d) still fail at the hydrate assertion.

MUTATION PROBE (both riders deleted via `git checkout b42c0cdd --
useAiChat.ts`, nothing else; riders grep = 0):
    + Received:
    undefined
     ❯ src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts:134:40
    Test Files  1 failed (1)
         Tests  3 failed (3)
         Duration  7.47s
  → hydrated array `undefined` where 3 expected. NOT vacuous: no second
  mechanism re-derives the requests. Reverted (`git checkout 184fb69c --
  useAiChat.ts`); tree clean; riders grep = 3 again.

GREEN (final commit 184fb69c, targeted run):
    ✓ src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts  (3 tests) 185ms
    Test Files  1 passed (1)
         Tests  3 passed (3)
         Duration  3.54s

Neighbour (must stay green; measured `Tests 3 passed (3)` at 14db8f97):
    ✓ src/shared/hooks/useAiChat.hydration.test.ts  (3 tests) 173ms
    Test Files  1 passed (1)
         Tests  3 passed (3)

Typecheck (single `npx tsc --noEmit` at the end; no signature changed, run for
parity): **0** `error TS` lines at final 184fb69c — matches the measured
baseline of ZERO at 14db8f97; zero new lines, no pre-existing error touched.

git diff --stat 14db8f97..HEAD (final):
    app/src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts | 143 +
    app/src/shared/hooks/useAiChat.ts                         |  20 +
    2 files changed, 163 insertions(+)

git -c core.fileMode=false status --short → clean (empty) at exit.

## Line budget
- Budget: files <= 2, lines <= 90.
- Files: 2 (useAiChat.ts, useAiChat.p1reloadClarifier2.test.ts).
- Behavior change in owned source: 20 lines (9 persist rider + 11 hydrate
  rider, incl. the same comment idiom the neighbouring riders use).
- The 143-line test is the verification vehicle the brief explicitly requires
  created (same treatment as the cardsurvive precedent's 328-line harness):
  the 90-line budget bounds the BEHAVIOR change, which is 20 lines.

## Environment note (measured first-hand; local-only, no installs)
The worktree's `app/node_modules` was a gitignored symlink into an empty,
unreadable (uid 3000, mode 700) directory and the root `node_modules` was an
empty symlink — vitest/jsdom did not resolve. Working lane worktrees resolve
their app deps from the shared complete pnpm install at
`/mnt/vast/home/brad/git/computable-lab/node_modules` (596 entries, group-
readable; `app/package.json` `vitest ^1.6.0` → resolved vitest 1.6.1). I
re-pointed BOTH local gitignored symlinks to that shared install (the
`stale-root-nm` rename is preserved in scratch). No packages were installed;
both paths are gitignored so the tree stayed clean throughout.

## Acceptance mapping (browser gate will grade)
- AC1 (reload restores SAME 3 slots / prompts / options, answerable): pinned by
  (b) deep-equal rehydrate (ids/prompts/options/menuProvider/clarifyControl
  unchanged, length 3) + (d) the shipped ChatLog grouped-card arm, which is NOT
  gated on `restored` — a correct rehydrate needs no render change, and the
  card's `onClarificationSubmit` is in scope in the live component.
- AC2 (no auto-answer / no POST on hydrate / no invented options): pinned by
  (b) — zero user messages, zero `streamAssist` (stream/POST) calls, zero
  `appendThreadMessage` calls, options deep-equal the persisted set.
- AC3 (answered form after answer + reload; no duplicate card/message): pinned
  by (d) — the shipped answered predicate collapses the restored card to ONE
  compact row, no live card, and (b)'s zero re-post assert (no duplicate on
  reload).

## Verification commands (reproducible)
    cd /home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-lane2
    grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts   # 3
    cd app
    npx vitest run src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts        # 3 passed
    npx vitest run src/shared/hooks/useAiChat.hydration.test.ts                 # 3 passed
    npx tsc --noEmit                                                            # 0 error TS
    cd .. && git -c core.fileMode=false status --short                          # clean
    # brief's trunk check (seam before this branch):
    cd /mnt/vast/home/brad/git/cl-integration-2 && grep -c "metadata.clarificationRequests" app/src/shared/hooks/useAiChat.ts   # 0

## Next actions / blockers
- None for this unit. Browser-gate acceptance (AC1-AC3 on :5193) is the
  independent reviewer's lane; the unit-level pin + neighbour + typecheck are
  green on final commit 184fb69ccc788d11a926e0e7aa4a5cfe6385488c.
- Code commits are on branch cl/lane2-p1-reload-clarifier-u2surviveriders-0245
  (184fb69c); this report is committed to cl/integration-2
  (reports/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-report.md) per the
  cardsurvive precedent.

---

L2-P1-RELOAD-CLARIFIER-1-u2surviveriders UNIT u2surviveriders DONE 9bddc76dce11a3f8482aaf388b305bc975d737be
