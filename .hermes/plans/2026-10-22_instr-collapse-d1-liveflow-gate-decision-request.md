# DECISION REQUEST — INSTR-COLLAPSE-1 D1: live Gemini active-read flow fails the declared gate closed (cycle-2 blocker)

Item: INSTR-COLLAPSE-1 (lane 1), C2. Date: 2026-10-22 16:50 EDT (tick l1t1640).
Cycle-2 adversarial review VERDICT: fix -> the binding protocol routes this to you
(cycle-2 exhausted; this defect needs a ruling, not a coder free-pick).
Answer path (write it here): .hermes/plans/2026-10-22_instr-collapse-d1-liveflow-gate-decision.md

## The tension (both of your prior rulings are correct; they now collide)

1. ORCH cycle-1 ruling (2026-10-22): "retype the Gemini producer ref to equipment IN
   THIS item — no defer; trunk must never ship a flow violating its own declared
   schemas." DONE + orch-verified first-hand: InstrumentApplianceJob.ts:136-145 emits
   type: equipment id: EQP-PLATE-READER; contract suite 5/5 green (orch's own vitest
   run), seed gained equipmentClassRef CL:plate_reader (declarative, AS-IC1F1-1);
   the sidecar/measurement schema pins validate; zero residual type:'instrument'
   producers.
2. YOUR OQ-1 decision (.hermes/plans/2026-10-22_instr-collapse-oq1-capability-gate-
   decision.md): the measurement gate resolves the verb from the PRODUCING READ
   EVENT's data; "measurement with no eventGraphRef/readEventRef FAILS CLOSED with
   code capability_gate_verb_unresolvable — a silent pass would make the gate
   theater and is rejected by design."

RESULT (reviewer PROBE 2, corroborated by orch code-reading of
server/src/capabilities/DeclaredCapabilityGate.ts:135-141 and by the coder's own
contract test): the chatbot-compiled Gemini appliance job (ChatbotCompilePasses.ts
:3577-3587 -> createGeminiEmActiveReadJob) builds a job.request carrying ONLY
adapterId/instrumentRef/outputPath/parameters — no readEventRef, no eventGraphRef
(gemini-active-read-request.schema.yaml declares only those 4 properties).
MeasurementActiveControlService.performActiveRead (:239-249) spreads them onto the
ingest payload; with no event chain the read-event-verb resolver returns undefined;
the gate fails closed; POST instrument-appliance-jobs execute -> 400
capability_gate_verb_unresolvable. The live flow is "no longer violating its schema,
now honestly rejected by its own gate" — cycle-2 reviewer ruled this still fails
mandate #1 ("interim-broken live flow unacceptable").

## Evidence

- Cycle-2 review (full probes quoted): /home/brad/.hermes/cl/lanes/1/advreview-instrcollapse1-l1t1330.md
  (§3 PROBE 2; D1; O1; O2; O3).
- Fix report: /home/brad/.hermes/cl/lanes/1/instr-collapse-1-fix1-report-l1t1130.md (STATUS: complete).
- Worktree: /mnt/vast/home/brad/git/wt/instr-collapse-1-lane1-l1t0755
  branch cl/lane1-instr-collapse-1-l1t0755 HEAD 816060c1 (git -c core.fileMode=false).
- Orch self-verify 16:44: 5 gate/contract suites 43/43 green; server tsc exit 0
  (artifacts/INSTR-COLLAPSE-1/orch-selfverify-tsc-l1t1640.txt).
- The graph-driven UI flow (ReadPlateModal from the deck/event-editor) DOES supply
  readEventRef+eventGraphRef from UI state and passes the gate — only the
  chatbot-compiled job path lacks the chain.

## Options to rule on (reviewer's three, plus what each costs)

(A) PRODUCER CARRIES A REAL VERB CHAIN. The gemini job/request must carry
    readEventRef+eventGraphRef data. Requires investigating whether the
    chatbot-compile/run-workspace context has (or should mint) a real read-event +
    event-graph for the run; if none exists, minting one is NEW product behavior —
    say so and scope it. Must remain data-driven; no TS verb literal, no
    device-name special-case in the interpreter (H1/H2 stand).
(B) DECLARED-DATA SCOPING. A YAML-level change to the annotation so the
    appliance/active-read measurement host is scoped out of the gate (e.g. the gate
    rides a different slot/host, or measurement-context carries the verb for this
    path). This AMENDS your fail-closed design — you own whether it does.
(C) ACCEPT THE FAIL-CLOSED 400 FOR THIS FLOW as the designed honest outcome
    (consistent with your OQ-1 residual), close D1 as working-as-designed, and open
    an explicit FOLLOW-UP item "Gemini chatbot active-read carries its read-event
    chain" (candidate: fold into INSTR-COLLAPSE-2 or a new item you name). Trunk
    then ships an honest error, not a fake success — matches the project hard-stop —
    but mandate #1's letter ("live flow broken") is overridden by your blessing.
(D) PIN/GATE SEQUENCING reconsideration (reviewer's third escape).

## Also rule on (O1 from the review — id-convention collateral)

Three Gemini ids now exist: `instrument/gemini-em` (ReadPlateModal.tsx:55-57,124
positional emitter, app side, COLLAPSE-2 surface), `EQP-GEMINI-EM` (producer slug
fallback, unreachable per O2), `EQP-PLATE-READER` (producer gemini constant).
Name the canonical convention so COLLAPSE-2 retargets ReadPlateModal to match
(C4 already owns that file).

## Constraints on any answer

- No TS verb literal / device-name policy in the gate interpreter.
- No weakening of the fail-FILE pins or assertion deletion.
- C3/C5 boundary: kind deletion stays COLLAPSE-2.
- D2 (MINOR, report overstatement) rides the next fix run regardless of your pick.

## Fallback

No answer at the next lane-1 tick -> COLLAPSE-1 stays in-progress unmerged (the
cycle-2 fix verdict stands unexecuted — the orch does not pick A/B/C/D itself, that
is your decision), and the question is posted to Brad as a structured pending-human
blocker with this packet.
