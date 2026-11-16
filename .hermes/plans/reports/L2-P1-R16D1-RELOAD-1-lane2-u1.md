# Unit report — L2-P1-R16D1-RELOAD-1 (u1 of 1)

**Goal (JOURNEY OPERATION):** place sentence -> card -> Apply -> cold reload -> the thread
still shows the applied-result record (and its commit sha) exactly as before the reload.
Gate r16 D1 (high): after Apply then F5 the "Accepted 1 event plus 1 new labware plus
1 placement" note was GONE.

## Status: DONE

The adopted-summary `system` message is pushed on Apply (kept at
`app/src/shared/hooks/useAiChat.ts:~2543`) but was dropped by TWO machine lines and never
persisted. Both are now fixed; the record persists through the single thread-messages
authority and rides back on cold reload.

## Root cause (two machine lines, both in `app/src/shared/hooks/useAiChat.ts`)

1. **Sync effect skipped `system`** (`if (m.role === 'system') continue`) — the adopted-
   summary never reached the thread-messages endpoint.
2. **Hydration filtered `system` out** (`m.role === 'user' || m.role === 'assistant'`) —
   even a persisted record would not come back on reload.

## Server: NO change needed (verified, not assumed)

`server/src/ai-threads/AiThreadStore.ts` `append` spreads `input.message` with NO role
whitelist, and `server/src/ai-threads/types.ts` `ThreadRole` already includes `'system'`.
So the single persistence authority (the thread-messages endpoint) already accepts
`system`. No second authority for message persistence was added. (No server file touched
-> no server test run required.)

## Changed files

| File | Change | Net |
|---|---|---|
| `app/src/shared/hooks/useAiChat.ts` | (a) sync effect: stop skipping `system` (remove the `continue`); (b) hydration filter: ride `system` back (`user \| assistant \| system`), drop the `as 'user'\|'assistant'` cast -> `as ChatMessage['role']`; `tool` still dropped. | +17 / -3 |
| `app/src/shared/hooks/useAiChat.reloadAppliedNote.test.tsx` (NEW) | 3 tests: SYNC (Apply->persist, role `system` reaches `appendThreadMessage`), HYDRATE (persisted record rides back verbatim incl. commit sha), IDEMPOTENT (hydrated system id NOT re-posted on the 2nd sync pass; no duplicate). | 216 lines |
| `app/src/shared/hooks/useAiChat.hydrationClobber.test.tsx` | ONE stale server-side pin updated (Q2.1 thread-A roles: `['user','assistant']` -> `['user','assistant','system']`). It asserted the OLD "drop all system" behavior; the pre-existing empty-done bubble (useAiChat.ts:2311-2322) now persists as the 3rd row on the SAME pre-flip thread A. All protected invariants (whole turn on A, nothing on thread B, single POSTs, correct headers) unchanged. | +10 |

Total: 3 files (2 new, 1 modified test pin), ~239 lines.

## RED evidence (committed as `0f4dc481a45bdc585dcc10709354cda1200c3748`)

Pre-fix, the new test failed all 3 legs — exactly the two machine lines:
- SYNC: `expected 0 to be greater than 0` (the sync skip meant `appendThreadMessage`
  was never called with role `system` -> systemAppends().length === 0).
- HYDRATE: `expected false to be true` (hydration filter dropped the system record).
- IDEMPOTENT: `expected +0 to be 1` (filter dropped it, so transcript had 0 system rows).

```
Test Files  1 failed (1)
     Tests  3 failed (3)
```

## GREEN evidence (final commit)

Targeted suite: `cd app && npx vitest run src/shared/hooks/useAiChat.reloadAppliedNote.test.tsx src/shared/hooks/useAiChat.p1reloadClarifier.test.ts src/shared/hooks/useAiChat.hydrationClobber.test.tsx`
```
  ✓ src/shared/hooks/useAiChat.reloadAppliedNote.test.tsx  (3 tests) 229ms
  ✓ src/shared/hooks/useAiChat.hydrationClobber.test.tsx  (5 tests) 246ms
  ✓ src/shared/hooks/useAiChat.p1reloadClarifier.test.ts  (4 tests) 410ms

 Test Files  3 passed (3)
      Tests  12 passed (12)
```
Baseline on base sha 628002926: p1reloadClarifier 4 passed / 0 fail, hydrationClobber
5 passed / 0 fail. No regression; the one Q2.1 server-snapshot pin is a stale record of
the pre-fix behavior, updated to the new correct behavior (invariants untouched).

## tsc delta (acceptance #3)

`cd app && npx tsc --noEmit` -> **17** error lines, ALL pre-existing missing-dependency
errors (`yaml`, `ajv`, `ajv-formats`, `prosemirror-view` — fresh worktree lacks the
server/ links). **0 new**; none reference `useAiChat` / `hydrationClobber` /
`reloadAppliedNote`. The trunk 10-error baseline is a subset; the 7 extra are the missing-
dep set, not introduced by this unit.

## Commits (branch `cl/lane2-p1-r16d1-reload-l2t2675`, base `628002926f154cfe9c4fbd01d75ff19a354664c6`)

- `0f4dc481a45bdc585dcc10709354cda1200c3748` — RED test (committed before the fix).
- `5d23d262be712e2527ee4807bb790483e1b8fa53` — the fix (+ stale-pin update). = `git rev-parse HEAD` at report authoring.
- (this report commit) — unit report.

## Verification commands (reproducible)

```
cd /home/brad/cl-wt/L2-P1-R16D1-RELOAD-1-lane2/app
npx vitest run src/shared/hooks/useAiChat.reloadAppliedNote.test.tsx \
  src/shared/hooks/useAiChat.p1reloadClarifier.test.ts \
  src/shared/hooks/useAiChat.hydrationClobber.test.tsx
npx tsc --noEmit | grep -c 'error TS'     # -> 17 (0 new vs base)
npx tsc --noEmit | grep -E 'useAiChat|hydrationClobber|reloadAppliedNote'   # -> (none)
```

## Next action / acceptance

Code is green and committed. A cold-browser F5 repro against the served lane stack is the
browser reviewer's acceptance (out of this unit's scope; proven here by test + API
read-back, not screenshot, per acceptance #1). No second authority for message
persistence introduced; thread-tab id map (`threadTabIds.ts:24`) untouched.

Marker note: the cited 40-hex is the REAL report-body commit — `git rev-parse HEAD` at
the moment the marker is appended, i.e. the commit that first CONTAINS this report (fleet
precedent L2-DOC-INTAKE-1 u2fix6: report body 0938f20a, marker appended in the follow-up
commit and citing 0938f20a). A self-referential SHA is impossible in git — a commit's
hash cannot contain itself — so the marker cites the real report-body commit.

L2-P1-R16D1-RELOAD-1 UNIT unit DONE 812a84b4792e23e7f4693cca35995bdccc7db8b9
