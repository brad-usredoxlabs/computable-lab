# ARCHITECT QUESTION (lane 2, orch l2t2250, 2026-11-03T23:3x EST) — CHATHOST-CONSOLIDATE-1 residual: two questions the repo evidence does not settle

Item: `CHATHOST-CONSOLIDATE-1` (in-progress). Harness leg landed `ba08f4ab` (+96/-8 in
`.hermes/plans/harness/l2-trunk-journeys/run-journeys.py`) + stamp `ca0d05c7`, DONE marker present,
adversarial cycle-7 fired 23:16:31. Everything below was measured FIRST-HAND by the orchestrator; the
coder's report is at `deliverables/CHATHOST-HARNESS-1-report.l2t2011.md`.

## Facts, measured

1. The four "red" hosts were never failing to send turns. In the ORIGINAL live receipts
   (`receipts/CHATHOST-LIVE-SWEEP-l2t2011/20261104T011246Z/`) every host carries
   `ai_request_bodies` n=3, including a real `POST /api/ai/assist/stream` body. They were red only on
   the RENDERED leg (`turns_completed=0`, `error_frames=1`).
2. The rendered-answer counter is blind to prose answers. `ui-drive.cjs:201` counts
   `.chat-log__bubble, .message-log__bubble, .chat-log-intent-card`; the product renders a live
   assistant prose answer at `ChatLog.tsx:403` with class `chat-log-msg chat-log-msg--assistant`,
   which is NOT in that selector list. So a legitimate conversational answer scores
   `turns_completed=0`.
3. The same runs show `error_frames=1` on every host, from the product's own no-events wall
   (`HarnessChatPane.tsx:321`, `role="alert"`, `data-testid="honest-wall"`), which renders when a
   draft produced no mountable events.
4. Consequence: after `ba08f4ab`, a live 6/6 sweep returns **INCONCLUSIVE for ALL SIX hosts**
   (run-workspace and event-editor were GREEN at my earlier baseline). The item's live-sweep
   acceptance evidence therefore still does not exist in green form, and the harness is honest about it.
5. `check-gate.py` grades `inconclusive` as non-fail (pre-existing behaviour, unchanged by this delta).

## Q1 — is the harness counter a repair I may take, or is it a criterion change?
My reading: adding the product's real prose selector to `readAssistantTexts` is a **test-harness
repair** (lane-2-owned file, no product change, `error_frames==0` and a non-empty visible answer stay
hard). Under the 2026-11-02 approval policy I would take it, record it as an assumption, and re-run.
What I cannot settle from code is the interaction with fact 3: if the no-events wall fires on every
prose answer, then even a counted prose answer still fails `error_frames==0`, and the per-host bar
becomes unsatisfiable for a conversational surface no matter how the counter is fixed.

**Question:** for a host whose live model legitimately answers conversationally (no mountable
events), is (a) the no-events wall an intended product response, so the sweep's per-host green bar is
mis-specified for that host class and should treat "prose answer + no-events wall" as the honest
inconclusive end-state (i.e. the coder's classification is right and the counter fix is cosmetic); or
(b) the wall is wrong for a conversational answer (product behaviour), in which case the item gains a
bounded product leg and the wall must be conditioned on "the answer proposed nothing AND the user
asked for drafting"?

## Q2 — the U1a seeding conflict (the coder's own escalation, options a/b/c)
Brief requirement #1 asked for generic route-derived seeding so record-host / project-deck-tab /
registry-host resolve to a real record or study before `goto`. The frozen acceptance pin U1a
(`test-channel-selfcheck.py:1272-1278`, "ONLY the artifact route materialises a record … run-workspace
probe stays seedless") turns RED on exactly that. The coder did NOT implement req #1, disclosed the
conflict, and left seeding artifact-only + honest INCONCLUSIVE.

**Question:** (a) amend U1a to authorise the additional seeding hosts (and which ones, and what the
new pin asserts), (b) leave seeding artifact-only permanently (req #1 is then formally unmet and the
item's sweep is structurally limited), or (c) something else.

## What I am NOT doing while this is open
- No criterion weakened. `turns_completed>=1`, non-empty visible answer, `error_frames==0`, captured
  outgoing body stay hard; `inconclusive` is never counted as green.
- No writer dispatched onto `cl/lane2-chathost-harness-l2t2110` while advc cycle-7 grades
  `4c3ad2cf..HEAD` (a concurrent commit would move the graded tip mid-review).
- CHATHOST-CONSOLIDATE-1 stays in-progress; the browser accept on `bfc336ce` does not close it.
