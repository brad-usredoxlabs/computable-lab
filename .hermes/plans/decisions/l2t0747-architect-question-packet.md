# Architect decision packet — lane 2, 2026-11-02T07:47 EDT (l2t0747)
TWO bounded rulings requested. Write each to its own ruling file (below). Do not change scope beyond these questions.

## Q1 — L2-CLARIFY-CARD-1: W11 volume-gate leg (change 3b) boundary
Facts (first-hand from coder log + worktree):
- Coder exited BLOCKED (rc=0) 2026-11-02T05:59. Changes 1 (P4 grouped card), 2 (mint honesty W9/W14/W5/W7), 3a (W12 material gate A1+A2) are committed and green (six gates) at HEAD 8cec354dac31fd1c9cf32a1f4721725f16b3afdb on wt/L2-CLARIFY-CARD-1-lane2-l2t0230, branch cl/lane2-clarifycard-1-l2t0230 (base 66b141b5 = PICKER-1 merge, ancestor of trunk).
- Report: /home/brad/.hermes/cl/lanes/2/deliverables/L2-CLARIFY-CARD-1-report.l2t0230.md
- Spec (OQ rulings appendix binding): /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-11-01_2330-L2-CLARIFY-CARD-1-spec.md
- Blocker for change 3b: (V1) flipping volumeUl.required breaks server/src/ai/shorthandChat.foldNullArms.test.ts:516 — outside the coder's approved boundary; spec OQ3 rules V1-alone insufficient. (V2) prompt-provenance needs an effectivePrompt threading passthrough hunk in shorthandChat.ts beyond the single approved AgentOrchestrator hunk — spec OQ3 says STOP, which the coder obeyed.
- Context: TARGET-1 (L2-CLARIFY-TARGET-1, spec .hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md, dispatch gate = CARD-1 merge) already owns the assumed-volume CHIP for W11; the architect amendment to CARD-1 assigned CARD-1 only "the refuse-or-ask gate for missing volume".

RULE (write to decisions/CARD1-W11-volume-boundary-l2t0747-ruling.md): choose
(a) DEFER change 3b (V1+V2) to TARGET-1 — orch then adversarially gates changes 1/2/3a, merges the partial branch, TARGET-1's dispatch gate opens and TARGET-1 owns the whole W11 volume gate; or
(b) AUTHORIZE the boundary exception (shorthandChat.ts passthrough hunk + foldNullArms.test.ts:516 touch) as a CARD-1 fix run.
State which, why, and what DONE requires for the merged CARD-1 (does the W11 refuse-or-ask criterion move verbatim into TARGET-1's acceptance criteria?). END-RULING.

## Q2 — Corpus2 Prompt-2 recon: task filing + the blob-bar contract
Facts:
- Recon report: /home/brad/.hermes/cl/receipts/PROMPT2-SCOUT-20261102/20261102T053516/report.md (drivers + shots + request bodies in the same dir). 9 works / 2 missing / 2 blocked-wrong. Prompt-1 is WORKS; prompt-2 is the active prompt.
- Findings: F1 BLOCKED-WRONG deterministic re-compile after a card answer drops details.labwareId -> deck ghost paints 0 wells in 3/4 drives (previewProjection.collectEventLabwareIds vs eventGraph.ts:951 fallback). F2 MISSING concentration: materialRefLabels.ts:683 builds composition_snapshot only when refs.length>1, so a bound formulation's composition/concentration/solvent never reaches the event tooltip ("final concentration" never statable). F3 MISSING no DMSO row / no share-of-mixture (fractions fill only from an explicit snapshot source). F4 BLOCKED-WRONG: turn 1 returns the unrealized-mixture-blob-material card + zero events even though MSP-PR9-TEST-CLO-1MM "1 mM Clofibrate in DMSO" exists with 1 mM + DMSO solvent — the blob bar is pinned authoritative by declaredArgumentReachability.test.ts; the scout explicitly says corpus expectation vs product contract NEEDS an architect ruling.
- Scout's highest-value call: F2 (server-side expansion into composition_snapshot; client dilution math already exists).
- Data caveat from scout: legacy 200 uL composite on the current event graph makes E-B3/E-B4 literally unjudgeable; re-drive needs a fresh graph carrying only 100 uL DMEM.

RULE (write to decisions/PROMPT2-recon-task-filing-l2t0747-ruling.md): file the task set for prompt-2 against F1-F4: how many tasks, what each owns (which F-ids), boundaries, and the F4 contract decision (does a named stock formulation with concentration+solvent BYPASS the blob bar, i.e. does the blob bar apply only when the noun resolves to no testable formulation? state the rule in data-declared terms). Cite F-ids; order vs the pending CARD-1/TARGET-1/CHATHOST queue. Note whether the data caveat needs a fixture task. END-RULING.

HARD RULES: read-only interrogation of /mnt/vast/home/brad/git/cl-integration-2 and lane artifacts; NEVER edit any repo, task-list, or corpus-state; no model-service touches; small turns.
