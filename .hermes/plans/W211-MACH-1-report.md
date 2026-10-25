# W211-MACH-1 — merge-time evidence report (ORCH-AUTHORED per adversarial c1 D1 adjudication)

> Authored by the orchestrator, not the coder (adjudication D1,
> reviews/advc-W211MACH1-c1-l2t2030.md). Every fact below is either read
> first-hand by the orchestrator or reproduced by the orchestrator/adversarial
> reviewer with the raw receipt path named. Coder sessions:
> 34c601bb -> d7a3a284 (G1 GREEN) -> 51958e01 (harness completion) ->
> aea12351 (fix1: advc c1 D2/D3/D5/D6). Base 5cdfb8d0, tip aea12351, branch
> feat/W211-MACH-1-lane2-l2t1210.

## What the item delivers
Deterministic golden-fixture machine for W2-11 step 0: frozen Zymo intent
fixture (sha-pinned), integrity vitest gate, and the G1 Playwright leg proving
ask-axes -> held cards -> picks -> mint -> deck review -> accept end-to-end
with a byte-stable deck and canonical compile. e2e-only scope by design: zero
product/src paths (three-dot scope residue EMPTY, verified by coder, advc c2,
and orchestrator independently).

## Determinism evidence (orchestrator-recomputed, not taken on report)
- Three green G1 runs pre-fix: app/e2e/receipts/w211-mach1-l2t1330/run-{1,2,3}.raw
  each '1 passed'; deck md5 c45096014e9bd6053e83b5dd89b20ce1 x3;
  canonicalCompileSha 41500602713bde26345e2eb013ad3f336af26c80c02c48b6ccca6c6b81880d2b x3.
- Fix1 re-run (SEAM-A private stack, orch stack untouched):
  app/e2e/receipts/w211-mach1-l2t1740/fix1/G1-green-at-fix1.raw '1 passed';
  ORCH RECOMPUTED md5sum g1-deck-content.json = c45096014e9bd6053e83b5dd89b20ce1
  (matches the proven bar) and read g1-final-compile-sha.json: canonicalCompileSha
  identical to run-1/2/3, rawCompileSha legitimately differs (eventIds recorded) —
  the named honest exception in the spec.
- Screenshots g1-01..06 committed beside the receipts.

## Gates
- Integrity vitest: 8/8 GREEN at aea12351 — run by advc c2 AND by the
  orchestrator at 22:00 EDT (raw in this session; drift leg proven RED-first
  against a temp desync NOT committed: PROVENANCE.md FIX RUN + fixture at
  pinned temperatureC 37 verified at tip by both reviewers and the orchestrator).
- node --check app/e2e/w2-11-campaign-demo.spec.mjs exit 0 (orchestrator, 22:00).
- Adversarial: c1 VERDICT fix (6 MINOR, 0 MAJOR) -> fix1 -> c2 VERDICT accept
  ("No new MAJOR defect... no product path was touched", residual O1/O2 MINOR
  observations below).

## Adjudications (orchestrator, binding)
- D1: this report is the merge-time evidence artifact (orch-authored, flagged).
- D4 / class-(d) card bar: 3-of-4 ACCEPTED per the promoted spec's own OQ2
  escape hatch; the 4th card (non-noun gap reason) has NO answerable card
  surface today — evidence in fixture obligations[3] + PROVENANCE BLOCKED-ON-FIX
  note; expectedCard:false pinned honestly. Follow-up task W211-GAPCARD-1
  REGISTERED in the lane task list. Assumption
  AS-LANE2-MACH1-GAPCARD-3OF4-ACCEPTED (reversible: e2e-only merge).
- D2 fix accepted as CITATION CLOSURE (advc c2): .hermes/plans/w211-step0/
  red-answered-facts-prebind1-note.md cites the merge-base proof — orchestrator
  independently ran `git merge-base --is-ancestor b52f5dfc 534f7e5f` -> exit 1
  (534f7e5f is pre-BIND-1, exactly as the note claims).

## Browser clause (rule 6b — OPEN obligation, not auto-accepted)
The spec's cl-browser-reviewer clause on the run/event-editor surfaces is
RIDDEN by the W28-A5d r3 gate (same surfaces, same served stack). If r3 has not
produced receipts covering these surfaces at merge time, the obligation stays
OPEN in the task block and carries in every handoff until r3 renders a real
VERDICT.

## Residual MINOR observations (advc c2; non-blocking, not fixed in-item)
- O1: fixture fidelity block still carries expectedActions/expectedAnswers
  strings consumed only by length/non-emptiness pins; the asserted bar IS
  fixture-driven (expectedMacro/expectedActionCount). Optional cleanup: drive
  the human-readable bars off expectedMacro or delete expectedActions.
- O2: no committed raw for the 8-test green integrity run (PROVENANCE quotes it
  inline; advc c2 + orch reproduced 8/8 green at tip).

## Trunk-debt posture
No schema/lint YAML in the diff -> no stack restart required. App full-run
fail-file band unchanged (e2e/.mjs legs are outside vitest project). Server
untouched.
