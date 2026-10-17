# W2-11 D4 — post-decision measurement (orch l2t0230, 2026-10-13 ~03:00 EDT)

Trunk a28d9789-era lane; live lane DB at :3093. Decision adopted:
W2-11-d4-deckreview-empty-decision.md (VERDICT (c), staged).

Probe: tmp-orch/probe-d4-additions-v2-l2t0230.py — replays the EXACT text the D4
thread localizes (promoted-family 17 steps -> protocolTextFromSource shape,
895 chars) through POST /api/intent/compile-from-prompt, ask branch + answered
branch (answers = {family axisId: branch-1 rack} — matches the handler shape
IntentCompileFromPromptHandlers.ts:113,128; ask branch returns needsAnswers=True
with the family axes, i.e. the ask leg is healthy).

RESULT — 3 consecutive answered draws (plus the earlier v1 mis-shape run):
- ALL FOUR answered draws returned 422 NEEDS_CLARIFICATION with a HELD bundle
  (keys clarifications + localMacro + terminalArtifacts present).
- Dominant bar: reason 'unknown-noun' on 'BashingBead Lysis Module' (draws 2-3)
  / 'lysis module' (draw 1) — the SPINE-4 noun seam offers only
  "Create local term" candidates (confidence 0.05) at actionLocation
  add_material.target / shake.labware.
- macro actions vary 16-21 per draw (model non-determinism confirmed);
  labware-ish labels seen across draws: '96-well block', 'BashingBead Lysis
  Module', 'heating block', 'magnetic rack', 'new 96-well plate',
  'supernatant from 96-well block'.
- Held terminalArtifacts keys: directives, events, gaps, protocolIntent —
  NO labware fields (decision fact 5 confirmed first-hand: a 422 held fold
  yields an empty deck review by construction).
- events: 0, labwareAdditions: ABSENT on every draw.

Read: run-4's 'complete-with-empty-deck' and today's 'held-422' are BOTH live
failure shapes; the small-model draw decides which. Harness fix (a) must (i)
retry the answered leg on a held 422 up to a bounded N (decision resume step 2),
and (ii) on a completing draw, deck review populates ONLY if >=1 macro labware
hint is zero-match. Macro labels like '96-well block' / 'heating block' /
'magnetic rack' are NOT in the live LAB inventory (seed rows match '96-well
plate', 'sample_plate', 'reagent reservoir' aliases) -> a completing draw TODAY
can yield additions from the zero-match arm WITHOUT any fixture edit. The
unknown-noun bar on the lysis module is the draw-dependent blocker.

Debt/next: implement bounded retry + verify a completing draw yields
labwareAdditions non-empty headlessly BEFORE gate 5. No assertion changed.
