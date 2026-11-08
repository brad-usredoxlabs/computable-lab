# ARCHITECT QUESTION — L2-GROUPEDSUBMIT-ARM-ANSWER-1 drivers seam (carrier, l2t3160)

Raised by lane-2 orchestrator. This item has had 3 adversarial FIX verdicts in 24h + 2 unclosed
coder runs; respec audit says RULING (seam wrong, not coder wrong). Dispatch of brief
brief-L2-GROUPEDSUBMIT-ARM-ANSWER-1-u4clean-0812.txt is refused by the respec gate (3rd refusal).
Per policy the orchestrator will not re-dispatch or escalate into that seam without a ruling.

## The question (from handoff 2026-11-08_0314 §6 / l2t3140 obligations)

Is the L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 seam — gate drivers as **item-owned .hermes
deliverables that encode fixture values** — the right cut, or should **leg4 fixture identity be
config-driven** (drivers read the fixture/board identity from a config/data file instead of
hardcoding it)?

Observed symptoms the orchestrator attributes to fixture coupling living in the driver seam
itself (advc FIX-2/3): hardcoded '1' slot value, slots[1] index. A seam that keeps fixture values
in driver code will keep regenerating these defects.

## State of the worktree (held, no writer)

- wt-L2-GROUPEDSUBMIT-u3 quiescent at 9ce41a95 (launcher WIP over u3's real commit 5f6910eb —
  the u3 product change IS committed; FIX-1 landed, FIX-2..6 open).
- Downstream once ruling lands: remaining FIX-2..6 on the drivers seam, then leg4 live drive
  fixture :5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline,
  receipts/GROUPEDSUBMIT-DRIVE-<ts>/, browser VERDICT -> prompt-2 REGATE 4/4 -> WORKS.

## Requested ruling

Which cut: (A) keep fixture values in item-owned driver deliverables and make FIX-2..6 a
locality/config extraction within that seam, or (B) re-cut leg4 fixture identity as data
(config/YAML) with drivers reading it — and if (B), which module owns the config.
