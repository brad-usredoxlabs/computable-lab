# L2-P1-RELOAD-CLARIFIER-1 / u2surviveriders — paperwork closeout (2026-11-14)

Item L2-P1-RELOAD-CLARIFIER-1-u2rp-report-l2t2390.txt — unit u2surviveriders (1 of 1). Worktree
/home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-lane2, branch
cl/lane2-p1-reload-clarifier-u2surviveriders-0245, base 14db8f9775c6d4b3ecd75cb824b1b015ea479193.
Paperwork-only continuation: the code was already delivered (3 commits below); the original run
printed its marker in the session log but filed no report -> the launcher recorded
EXIT-MARKER-LOG-ONLY. This report + marker commit close that note.

Code commits — verbatim `git log --oneline 14db8f97..HEAD`:
b42c0cdd u2surviveriders RED: pin typed clarificationRequests persist+hydrate round-trip (3 failed: metadata absent / hydrated undefined)
ebe11615 u2surviveriders persist leg: ride typed clarificationRequests into assistant-message metadata (key ABSENT when none, never undefined)
184fb69c u2surviveriders hydrate leg: read metadata.clarificationRequests back onto the hydrated message (verbatim, no re-derive, no re-ask)
Full shas: b42c0cdd495b4a3cb63aacd4c43664fbee9ae3f8, ebe116158d94a2dfca91e02b2f3263d6cc5da398, 184fb69ccc788d11a926e0e7aa4a5cfe6385488c (HEAD).

What the persist/hydrate legs do (evidence: the 3 commit diffs only; no further source read):
b42c0cdd pins the round-trip RED: new file app/src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts
(143 lines; 3 tests failed at RED: metadata absent / hydrated undefined). ebe11615 (persist leg, +9
in useAiChat.ts): the persist path rides the typed clarificationRequests the live done arm carried on
the message, verbatim, into assistant-message persisted metadata; the key is ABSENT (never
undefined) when the turn carried no requests, so a plain turn persists byte-identically. 184fb69c
(hydrate leg, +11, same file): the hydrate path reads metadata.clarificationRequests back verbatim
onto the hydrated message (conditional-spread idiom) — no re-derive on hydrate, no re-ask; the
grouped-card arm (ChatLog.tsx:538) is NOT gated on `restored`, so no render change. Net: a cold
reload mid-clarification restores the SAME grouped card (same request ids, prompts, offered
options). Scenario: prompt-1 durability leg (reload mid-journey restores pending clarification
intent).

Verification (on code HEAD 184fb69c; the paperwork commits touch no source/test file):
`cd app && npx vitest run src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts` — raw output:

```
RUN  v1.6.1 /home/brad/cl-wt/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-lane2/app

(node:2765213) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ src/shared/hooks/useAiChat.p1reloadClarifier2.test.ts  (3 tests) 187ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  03:58:59
   Duration  13.00s (transform 289ms, setup 1.13s, collect 2.49s, tests 187ms, environment 8.17s, prepare 614ms)
```

Typecheck (app, tsc --noEmit via legacy-store tsc 5.9.3 — the shared store's .bin/tsc shim is broken,
its typescript package absent): final 184fb69c -> exit 2 with 30 pre-existing errors; base 14db8f97
-> exit 2 with 30 errors; the error sets are byte-identical (diff empty) -> 0 new errors; none in
the changed files (useAiChat.ts, useAiChat.p1reloadClarifier2.test.ts).

Files this unit adds (2 commits; no source/test file changed in either):
1. .hermes/plans/reports/L2-P1-RELOAD-CLARIFIER-1-u2surviveriders-report.md (this report — commit 1)
2. the same file, final marker line appended (commit 2)

This report closes the launcher's EXIT-MARKER-LOG-ONLY note for unit u2surviveriders.
