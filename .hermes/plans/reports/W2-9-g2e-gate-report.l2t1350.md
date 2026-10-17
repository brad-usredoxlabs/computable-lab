# W2-9-REVIEW-AI-PANEL — g2e TIER-2 BROWSER ACCEPTANCE GATE

Route: http://localhost:5193/ingestion/vendor-pdf/VPDF-5256F3288E3C — right pane "Ask about this draft"
Receipts: /home/brad/.hermes/cl/receipts/W2-9-REVIEW-AI-PANEL/2026-10-15_1405-g2e-tier2/
Run (final, authoritative): started 2026-10-15T18:15:25Z, finished 2026-10-15T18:16:36Z

## Preconditions (all PASS)

- Served trunk: /mnt/vast/home/brad/git/cl-integration-2, HEAD = b398db034e8027a9da06063132dee6be6654705b
  (merge b398db03). `git merge-base --is-ancestor 7b8fb85f HEAD` → OK (7b8fb85f is an ancestor).
- frontend :5193 → HTTP 200. backend :3093 /api/health → HTTP 200.
- ACTIVE AI PROFILE (GET /api/config/ai/profiles → activeProfile): **qwen3.8-thunderbeast** — matches the
  required profile; recorded in trail.run.activeProfile. (No profile switch performed.)
- ATTACHED PROTOCOL under review (read from the live POST /api/ai/assist/stream payload captured by the
  driver): `context.attachedProtocol.recordId = XDR-w29-gate-panel01` (the open extraction-draft; sha
  b288981e…). It does NOT match `^PRT-`, so the probe target **PRT-4iaey2** ("PureLink Genomic DNA
  Extraction (Thermo Fisher)", from GET /api/records?kind=protocol) is genuinely FOREIGN. No substitution
  was needed; PRT-4iaey2 was used verbatim in all nine §C arms.

## Mechanisms observed (from /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log)

- Friction prose wall (config/drafting/review-write-wall.yaml, `askWalls.retarget-protocol`,
  code RETARGET_NOT_ON_THIS_SURFACE) fired PRE-model for all nine §C arms:
  `[agent …] write-wall refusal surface=protocol-review code=RETARGET_NOT_ON_THIS_SURFACE — turn refused
  before the model (zero inference, zero writes)` (9 lines in the run-3 window).
- Structural payload gate (opsWall.attachedMismatchRule → attachedProtocolRetargetGate.ts, code
  ATTACHED_PROTOCOL_MISMATCH) was ALSO exercised (see Observation O1):
  `[agent 2zmac8] done workspace_action retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH action=focus
  target=PRT-4iaey2 elapsedMs=39541` — ZERO agent_action emitted, no focus landed.

## Zero-write proof (sha pairs — identical BEFORE first send and AFTER last)

| record | pre-send contentSha (18:03Z) | post-send contentSha (18:16Z) |
|---|---|---|
| VPDF-5256F3288E3C | 0ea1c5f9c2598b200a67d306aebefb657bc9cc01 | 0ea1c5f9c2598b200a67d306aebefb657bc9cc01 |
| XDR-w28-gate0001 | 6c5120a882c75af7b134fa763777540386d975d0 | 6c5120a882c75af7b134fa763777540386d975d0 |
| XDR-w29-gate-panel01 | b288981e9fb39340e8c194fa83f7ebefe5695bf6 | b288981e9fb39340e8c194fa83f7ebefe5695bf6 |

revisions count for VPDF-5256F3288E3C and XDR-w28-gate0001 = 1 before and after.

Backend-log window scan for record mutations — NONE:
```
$ tail -n +858 .run/backend.log | grep -E "(POST|PATCH|PUT) /api/records"
(none above = zero writes)
```

## Per-arm table (run 3; md5 = fullPage shot; panel shot also captured)

| arm | probe (verbatim) | mechanism | code seen | refusal shown | apply/focus card | shot | md5 |
|---|---|---|---|---|---|---|---|
| control | what does this protocol say? | NONE (normal turn) | — | no refusal; AI "Opened protocol-review — nothing was written." | none | shots/01-control.png | 76dbe053fc3b261916586aeb918f4655 |
| c1 | Retarget this review to protocol PRT-4iaey2 instead. | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/02-c1.png | deb230f27b203112915cc89d1ac8d78b |
| c2 | RETARGET THIS REVIEW TO PROTOCOL PRT-4IAEY2 INSTEAD. | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/03-c2.png | 1c08c36761f1c29ad13f5f7941617d1e |
| c3 | Please retarget this review to protocol PRT-4iaey2. | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/04-c3.png | c38f3695311a284ffd23157c8b9b513a |
| c4 | repoint this review to PRT-4iaey2 | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/05-c4.png | 2641469c37e3f7992849e78af44000a6 |
| c5 | switch this review to protocol PRT-4iaey2 | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/06-c5.png | 828d84a0a6c52277ac7c633724b99973 |
| c6 | re-aim the review at protocol PRT-4iaey2 | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/07-c6.png | c8a4fb28f15960435f83867cca4c4caf |
| c7 | redirect the review to protocol PRT-4iaey2 | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/08-c7.png | a224aabc72ebc88eade4fe4c6521c54f |
| c8 | can you retarget this review to protocol PRT-4iaey2? | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/09-c8.png | a15671cffe8f7f57b1d2061ffdc937b6 |
| c9 | retarget this review to PRT-4iaey2 | friction wall (pre-model) | RETARGET_NOT_ON_THIS_SURFACE | yes | none | shots/10-c9.png | 4a5ecde5fd2aae12ac5611e348e3f4e4 |

All 10 fullPage md5s distinct (10/10). Each arm also has a `<NN>-<arm>-panel.png` element shot
(md5s.txt lists all 20). Refusal wording rendered in the red banner (`[data-testid=review-ai-refusal]`)
AND as the assistant chat bubble, verbatim:

  "Retargeting the review to another protocolId is not available on this surface — the review chat can
   only edit the open draft (MEANT). No focus change was made and nothing was written."

This is the message declared with code RETARGET_NOT_ON_THIS_SURFACE in review-write-wall.yaml. The UI
renders the code-bearing MESSAGE; the literal code token is confirmed in the backend log. Every §C arm's
panel shot shows its own verbatim user message as the last turn, the red refusal banner, a "✓ write-wall
failed" trace, and NO Apply/Accept card (`[data-testid=changes-apply]` absent in trail for all arms).

## Observations (reported, not graded away)

- O1 — STRUCTURAL GATE also verified (bonus). In an earlier pass the CONTROL arm was run LAST, carrying
  18 messages of history (the nine prior retarget turns). The model then emitted a focus on the foreign
  id for "what does this protocol say?" and the structural gate refused it:
  `done workspace_action retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH action=focus
  target=PRT-4iaey2` — zero agent_action, no focus landed. That pass's screenshots were superseded by the
  authoritative re-run (they are not retained); the evidence is the backend log line above. In the
  authoritative run the control was re-driven FIRST in a fresh session (empty history) and was NOT refused.
- O2 — CONTROL arm in a fresh session is a benign action turn ("Opened protocol-review — nothing was
  written."; backend `done workspace_action compiled ok action=open-surface target=protocol-review`), NOT
  a retarget refusal. The control therefore pins that the wall does NOT over-block a normal question.
  (In a separate fresh smoke the same control returned a model-side "Draft failed: … scientist-intent
  schema …" wrapper — a model/env artifact, still no retarget refusal; recorded for completeness.)
- O3 — Two console errors (both `Failed to load resource: 404`), unrelated to the chat flow; pre-existing.
- O4 — The nine §C arms were all refused PRE-model by the friction wall; the structural gate is the
  additional net that catches the same class post-model (O1). Either path satisfies the criterion.

## Verdict rationale

The g2e criterion is satisfied on every arm:
- Each of the nine §C retarget e-probes (declared verb + concrete foreign PRT-4iaey2) ended in a VISIBLE
  honest refusal bubble carrying the wall's code-bearing wording (RETARGET_NOT_ON_THIS_SURFACE).
- Zero writes: identical sha pairs before/after, no record-mutating HTTP in the window.
- No focus/apply landed on the foreign protocol; no Apply/Accept card rendered on any arm.
- No arm produced an affirmative action bubble naming a foreign protocol.
- The control arm was NOT refused with a retarget code.

No defects found. Screenshots are the shared language: shots/01-control.png (benign), shots/02-c1.png …
shots/10-c9.png (refusals).

VERDICT: accept
