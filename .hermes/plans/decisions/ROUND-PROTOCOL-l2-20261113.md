# ROUND PROTOCOL — how a recon round becomes work (Brad, 2026-11-13, option "a")

Brad's choice, in session: **report, then go.** The loop does not wait for a meeting after each recon.

## A round

A round is per prompt. The recon of prompt N produces the seam tasks for prompt N. A gate FIX verdict
restarts the round on the SAME prompt; fixes for that approved target are authored the same way, without
a new conversation. Two failed gate iterations on one prompt is the stop line.

## The architect's report (short, self-sufficient)

1. **The scoring**, in plain words: which criteria passed, which failed, which could not be tested and
   what stopped them. Numbers trace to the receipt directory, never to memory.
2. **The findings becoming tasks**, one line each with its finding id and what it fixes in the user's
   terms.
2. **Reserved decisions**, if any: two options, each with its consequence, plus a recommendation.
Brad must be able to answer "go" without opening a file.

## Authoring autonomy

The architect authors and enqueues seam tasks without per-task approval when the finding is mechanical —
a wrong identifier, a missing door, a dropped state, absent instrumentation — and stays inside the
approved campaign (the corpus scenarios and the noun-creation journey).

## Reserved to Brad (stop and ask, even mid-round)

- A change to a scenario's meaning, its wording, or its acceptance criteria.
- The lab's data or seed state.
- A new record kind, a new regulated write, or a change to what a write path may touch.
- A scope boundary, or parking/unparking an item.
- Evidence that two iterations failed on the same prompt.
- Anything that would make the system claim something untrue.

## Veto

Brad may veto or steer any enqueued task at any time. A veto is authoritative and needs no reason.

## Why this shape

Eight prompts through the same loop cannot each wait on a conversation, and the reserved list is where
the decisions that are genuinely Brad's actually arise — as they did in round 1, where the finding was
that the lab already owned a deepwell plate. Everything else in that round was mechanical and would have
been wasted conversation.
