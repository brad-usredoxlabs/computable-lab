# RULING — L2-CLARIFY-CARD-1 change 3b (W11 volume gate) boundary
Architect ruling, lane 2, 2026-11-02T07:47 EDT packet (l2t0747), Q1.
Packet: decisions/l2t0747-architect-question-packet.md.

## RULING: (a) DEFER change 3b (V1 + V2, as a unit) to L2-CLARIFY-TARGET-1.

No boundary exception is authorized for CARD-1. The orchestrator proceeds:
adversarial-gate changes 1/2/3a at HEAD 8cec354dac31fd1c9cf32a1f4721725f16b3afdb,
self-verify, merge the partial branch, TARGET-1's dispatch gate opens, and
TARGET-1 owns the ENTIRE W11 volume gate (V1 + V2 + the assumed-value chip).

## Why

1. W11's PRIMARY owner is already TARGET-1. The routing ruling files
   CARD-1 as "Covers P4+P5 / W6,W9,W12,W14" and TARGET-1 as "Covers P6+P7 /
   W11,W13" (decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md:65, :87-88).
   Amendment (6) folded W11 into CARD-1 only as the refuse-or-ask gate leg,
   with the explicit coordination note "the CHIP lives in TARGET-1"
   (same file :78-79). A refusal gate whose other disjunct (the chip) lives
   in the next task is a half of one behaviour split across two branches;
   deferral reunites it with its owner.

2. V1-alone is a ruled-bad state, and a CARD-1 fix run would ship exactly
   that state's prerequisites without the whole. OQ3 ruled "V1-only does NOT
   satisfy ruling amendment (6): an INVENTED volumeUl satisfies a required-flag
   bar, so the T7 silent-stage path survives without provenance-in-the-compile"
   (spec .hermes/plans/2026-11-01_2330-L2-CLARIFY-CARD-1-spec.md:522-523).
   Option (b) authorizes the shorthandChat.ts passthrough + the
   foldNullArms.test.ts:516 touch (report "Blocked leg" items 1-2,
   /mnt/vast/home/brad/git/cl-integration-2/deliverables/L2-CLARIFY-CARD-1-report.l2t0230.md:203-230)
   — i.e. grows CARD-1's contract mid-flight past the shape its ratification
   and its single approved AgentOrchestrator hunk allowed (spec:519-528). OQ3's
   STOP clause exists for exactly this discovery; the coder obeyed it
   correctly (log CODER_EXITED rc=0, "STOP and end with BLOCKED, do not
   improvise", spec:528). Honoring the STOP is cheaper than relitigating the
   boundary on a half-built branch.

3. The fix belongs where the seam is already owned. TARGET-1's spec OQ2 was
   ruled: "The provenance exemption lives at CARD-1's seam riding the existing
   answered-slot channel (resolveNounsPass.ts:117-123) ... TARGET-1 implements
   it ONLY if CARD-1's merged shape lacks it — ONE hunk"
   (.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md:496). After the
   deferral, CARD-1's merged shape WILL lack shipped provenance, so TARGET-1's
   own ratified OQ2 is exactly the vehicle: the V1 flip, the V2 effectivePrompt
   threading, the foldNullArms LEG_YAML fix (foldNullArms.test.ts:384-405's
   add_material omits volumeUl), the golden blast-radius enumeration
   (spec:278-281), the chip, and the exemption all land on ONE branch, in ONE
   boundary, re-pinned at TARGET-1's own base tip. TARGET-1 already declares
   the volume slot editable at shorthandChat.ts:968-1093 (:38) and the card
   request builder at :857-917 (:39) — the passthrough hunk and its tests are
   the same files TARGET-1 must open anyway. Two branches touching
   shorthandChat.ts fold logic + the vocabulary YAML is a serialization
   liability for zero benefit.

4. Idempotency: changes 1/2/3a are green at six gates with the OQ2 replay
   captured (report:46-85). Holding merged lane value hostage to the one leg
   that cannot ship inside its ratified shape is the worse failure mode.

## What DONE requires for the merged CARD-1

- The merge report and the task-list block state EXPLICITLY that change 3b
  (W11 volume gate, V1+V2) was DEFERRED to TARGET-1 by this ruling; the
  merged CARD-1 does NOT claim W11. `add_material.volumeUl.required` stays
  `false` on trunk at the CARD-1 merge — that is a fact of record, not a
  regression (schema/scientist-intent/scientist-intent-vocabulary.yaml, the
  TARGET-1 spec pin table :33 anticipated exactly this).
- Changes 1/2/3a acceptance is unchanged: grouped card + single Submit + one
  answered row (W6/P4), mint honesty (W9/W14/W5/W7), the deterministic
  slot-coverage gate (W12 A1+A2). The 10-draw instrument stays the authority
  on the T1/T2 nondeterminism per the OQ2 ruling (report:77-85).
- No new leg, no fix run on this branch. If adversarial review finds a defect
  in changes 1/2/3a, the ordinary cycle rules apply; 3b stays out.

## Does the W11 refuse-or-ask criterion move verbatim into TARGET-1? YES.

TARGET-1's acceptance criteria must carry, verbatim in substance, routing
amendment (6) (CLARIFY-WEIRD-routing-l2t1915-ruling.md:75-79): "a prompt
naming no volume must fire a card or refuse, per L2-CLARIFY-TARGET-1's
data-declared assumed-value chip — never silently stage an invented number."
Concretely, TARGET-1's gate must show, on the live surface:
  (i) V1 leg — a document omitting add_material volume produces a
      missing-required-argument card (the required-flag flip, YAML not TS,
      spec:438-441 data-vs-code rule carried forward);
  (ii) V2 leg — the T7 shape ("Add DMEM to A1", no volume in the prompt)
      yields a card or the declared assumed-value chip — never a silent
      staged `volumeUl: 100` (the frozen-example copying origin,
      submitSuggestionTool.ts:635-647, stays frozen);
  (iii) the foldNullArms.test.ts:516 expectation updated as part of the flip's
      declared blast radius, plus the golden enumeration.
The orch composer folds this into TARGET-1's spec at promotion (its
"Sibling boundaries" already cite CARD-1's refuse-or-ask gate,
2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md:14-15). The W11 truth-table row
stays red until TARGET-1's browser gate proves (i)-(iii).

Deferred, not descoped: nothing in amendment (6) is dropped — its owner
simply becomes singular.

END-RULING
