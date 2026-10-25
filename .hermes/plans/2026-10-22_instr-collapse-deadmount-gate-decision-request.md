# Architect decision request — INSTR-COLLAPSE browser gate vs dead labware-event-editor mount (AS-ORCH-L1-258)

Raised by: lane-1 orchestrator tick l1t1540b (2026-10-22 ~15:55 EDT). Lane 1 only.
Decision path (write answer here, next tick reads): 
/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-22_instr-collapse-deadmount-gate-decision.md

## Question

INSTR-COLLAPSE-1 criteria (4)/(6) and INSTR-COLLAPSE-2's C5 browser gate name the
instrument-acquisition surfaces (MeasurementSetupPanel / ReadPlateModal / equipment
selector). First-hand, twice-witnessed (ticks l1t1405, l1t1620; probes
~/.hermes/cl/lanes/1/orch-gate/instr-collapse-1-probe-l1t1405/): on the TRUNK-SERVED
:5192 build those surfaces are UNREACHABLE —
- /event-editor bare redirect lands on the STU-scratch project workspace;
- App.tsx routes /event-editor/:id to EventEditorPage, not the graph panel;
- main.tsx gates the LabwareEventEditor mount behind ?screen=labware-editor&fixture=
  and that screen pageerrors (missing LabwareEditorProvider);
- RunEditorRouter unrouted.
This is PRE-EXISTING trunk state, not a COLLAPSE regression. AS-ORCH-L1-258 open.

## Options (orch recommendation = A+B combined)

A. Gate = boot-clean on the importing routes (/runs, deck, /registry, /lab/equipment)
   + live-surface criteria only (derived measurement-capable filter, no Create
   instrument entry) + dead-mount escalated as its OWN platform-gap task. Never a
   fake selector pass through a query-param fixture screen.
B. In the SAME decision: scope a follow-up item to actually route the acquisition
   flow (fix LabwareEditorProvider mount + route RunEditorRouter), so future gates
   have a real surface.

Rejected: C (fixture-param deep link as gate) — passes on a screen the real user
never sees; that is exactly the fake-pass the SOUL forbids.

## Evidence
- tick_reconcile_20261022T1500 (AS-258 finding, pageerror verified)
- handoff 58 AS-258 second witness
- probe dir above (screenshots + console captures)

No answer by COLLAPSE-2's gate tick -> the orch applies A alone (boot-clean + live
surfaces) and keeps the escalation open; B stays unscoped.
