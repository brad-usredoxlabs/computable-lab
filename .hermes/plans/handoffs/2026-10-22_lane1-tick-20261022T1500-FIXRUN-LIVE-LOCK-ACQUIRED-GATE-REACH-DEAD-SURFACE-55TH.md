# Handoff — lane 1 tick 2026-10-22 15:00 → COLLAPSE-1 fix-run LIVE (fleet lock ours 13:55); browser-gate REACH finding: the C1/C2 panel surface does NOT mount on any current trunk route — 55th

Author: orchestrator cron tick l1t1405 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 untouched this tick.

## Reconcile (first-hand)

- FLEET LOCK IS OURS: our queue unit cl-l1-coder-instrcol1-fix1-l1t1130 (bash 302236)
  acquired the appliance2 lock at 13:55:14 (LOCK-ACQUIRED in
  logs/coder-INSTRCOLLAPSE1-fix1-l1t1130.log; lock pid-file names
  INSTR-COLLAPSE-1-FIX1(l1t1130) pid:302236). Lane-2's MIXFRAC1-RESUME3 (hermes
  248693) is GONE — no escalation needed; our FIFO wait (since 11:28) resolved normally.
- CODER ALIVE WITH MOTION: hermes pid 691973 (child of 302236), started ~13:55, 30 min
  elapsed at 14:30 check, state.db mtime 14:15 (write motion), CPU time accruing.
  Branch already shows 0430bd71 "merge(lane1): fold trunk docs commits (fix1 prep)" —
  the brief's FIRST step done. No fix commits yet, no report file yet
  (instr-collapse-1-fix1-report-l1130.md absent). Do NOT re-dispatch. Expected
  duration per coder history ~2-4h (cycle-1 was ~4h incl. queue); idle-past-deadline
  = no state.db mtime motion across two ticks.
- Cycle-2 adversarial waiter healthy: cl-l1-wait-adv-instrcol1-c2-l1t1330 pid 440019,
  watching 302236, fires on "STATUS: complete" in
  instr-collapse-1-fix1-report-l1t1130.md. Survives tick exit.
- Trunk 3ea74fed (docs-only since 2d1f3ff7; fail-FILE baseline pin @ 2d1f3ff7, 89
  fail-files, stands). Clean except M pnpm-lock.yaml (AS-ORCH-L1-248).
- Lane stack :3092/:5192 both 200. Decision watch qms8c-cleanbreak md5 8b67f579
  UNCHANGED — not re-asked. No open Brad asks.
- Branch code-state spot-check: InstrumentApplianceJob.ts:126 still emits
  type:'instrument' at HEAD (defect 1 not yet fixed as of 14:30 — coder is early in
  the run). Merge-pin tsc baselines from handoff-54 stand (server 0, app delta-0/24).

## BROWSER-GATE REACH FINDING (this tick, orch-authored probes — MATERIAL)

The C1+C2 app diff touches 9 files, of which the create-form surfaces
(MeasurementSetupPanel via ReadoutContextPanel) mount ONLY inside
app/src/graph/LabwareEventEditor.tsx (editorMode === 'readouts', :3733/:3740).
Probes against the TRUNK-SERVED :5192 (so this is pre-existing, NOT a C1/C2 regression):

1. /event-editor/:evgId (EVG-PDT adipogenesis + EVG-API spec-first) REDIRECTS to
   /project/STU-scratch/event-graph/... (ProjectWorkspacePage deck) — ReadoutContextPanel
   never renders. ?mode=readouts does not change this.
2. /runs/:runId mounts run/RunWorkspacePage (Protocol Planning / Design / Execute);
   clicking Design does NOT surface a "Readouts" mode button. graph/RunEditorRouter.tsx
   (the route that mounts LabwareEventEditor) is imported by NOBODY in app/src
   (first-hand grep; only self/test refs). main.tsx's other LabwareEventEditor mount
   is the fixture screen (?screen=labware-editor&fixture=...) which CRASHES white:
   "useLabwareEditor must be used within a LabwareEditorProvider" (main.tsx:14 renders
   LabwareEventEditor without the provider — pre-existing trunk bug, pageerror verified).
3. => On the CURRENT trunk build there is NO reachable route that mounts
   MeasurementSetupPanel/ReadPlateModal. The handoff-54 "navigate via a real event-graph
   id" assumption is FALSIFIED by this tick's probes (trail + shots:
   /home/brad/.hermes/cl/lanes/1/orch-gate/instr-collapse-1-probe-l1t1405/trail.json;
   probe script scripts/orch-gate-probe-instrcol1-l1t1405.js).

Consequence for the post-merge gate (DECISION FOR THE MERGE TICK, recorded not resolved):
- Criterion "(equipment-ref measurement setup renders + persists, no broken instrument
  selector)" cannot be exercised via the panel UI if the surface stays unreachable.
  That unreachability is PRE-EXISTING (proven on trunk-served build) — a C1/C2 diff
  cannot regress a surface that never mounts. The 6 app files (client.ts types,
  useBiologyMode/useResultsMode/RoleAssignmentPanel/MeasurementContextList one-line
  ref-field renames) compile into /runs and deck flows that DO render.
- Gate options, in order: (a) after merge, RE-PROBE the merged build — the fix-run or
  a later leg may change mount wiring (RunEditorRouter adoption); (b) if still dead,
  the honest browser evidence = app still boots clean on the routes that import the
  touched modules (/runs/:runId, deck, /registry, /lab/equipment showing
  EQP-QUANTSTUDIO5) + console-clean, and the DEAD-MOUNT condition is escalated as an
  EXISTING platform gap (structured blocker on the gate, owner architect: "measurement
  readouts surface unreachable — RunEditorRouter unrouted + fixture-screen provider
  bug"), NOT charged to COLLAPSE-1 and NOT grounds to weaken criteria silently.
  Two-attempt rule applies before escalation.
- Do NOT let a reviewer "pass" the equipment-selector criterion by judging a surface
  it never mounted. Negative claims must follow the reviewer reliability rule.

## Queue state after this tick

INSTR-COLLAPSE-1 in-progress — fix-run LIVE (fleet lock ours; cycle-2 waiter armed;
tsc pins in hand; gate-reach finding recorded above).
INSTR-COLLAPSE-2 todo (spec promoted; deps COLLAPSE-1 merge + fleet slot). No other
todo items; no spec-composer commissioned (no next item in this wave — not invented).

## NEXT TICK checklist

1. Reconcile coder 691973: state.db mtime + branch git log + report file. If report
   exists with STATUS: complete, the waiter fires cycle-2 adv review on its own; if
   the waiter already fired, read the review report path from
   advreview-instrcollapse1-cycle2-l1t1330*. Check coder DEAD only via gone-PID +
   log/report state. If dead without report: resume per queue-instr-collapse-1-fix1
   brief with suffix -retry1.
2. On cycle-2 VERDICT: accept -> orch self-verify: server tsc on post-fix HEAD (pre-fix
   pin exit 0), head fail-FILE comm-empty vs 89-file pin, spec greps, defect-1
   end-to-end proof re-checked by eye, merge --no-ff, YAML shipped => stack restart,
   then BROWSER GATE per the reach options above (re-probe merged build FIRST; if
   surface still dead, gate = boot-clean on importing routes + dead-mount blocker to
   architect; receipts /home/brad/.hermes/cl/receipts/INSTR-COLLAPSE-1/). VERDICT: fix
   -> fix cycle 2 of max 2 (unique paths); 3rd -> architect packet.
3. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (fleet lock + queue lock; spec
   2026-10-22_instr-collapse-2-kind-deletion-spec.md — RE-PIN every file:line at claim;
   branch off post-COLLAPSE-1 trunk).
4. Follow-ups (unchanged): AS-ORCH-L1-236 open (narrowed); F-1 residual; engine-initial-
   state fallback + LifecycleHandlers.ts:58 literal; ProtocolCompileMonolithPass OBS-B;
   pnpm-lock.yaml reconciliation (AS-ORCH-L1-248); AS-253 posture stands (clean);
   NEW follow-up: fixture-screen LabwareEditorProvider crash + RunEditorRouter
   unrouted (folded into the gate-reach decision, above).

## assumptions:

New this tick:
- AS-ORCH-L1-258: the dead MeasurementSetupPanel mount is PRE-EXISTING trunk state
  (probed trunk-served :5192, not a branch build); evidence-debt: must be RE-PROBED on
  the post-merge build before it is used to shape the gate. If the probe was somehow
  served a stale checkout, the debt is cleared by the re-probe, refuted by a mounting
  panel.
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119; 137 residual; 154; 201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228
(historical); 229; 230; 236 (OPEN, narrowed); 238; 239; 240; 241; 242; 243; 247; 248; 249
(superseded by heal); 250; 251; 252; 253; 254 (superseded by 256); 255 (in force); 256;
257.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (MINE): cl-coder fix-run hermes pid 691973 under queue unit 302236
  (lock holder, pid-file records INSTR-COLLAPSE-1-FIX1(l1t1130)). Release of the fleet
  lock happens when 302236 exits. Alive w/ motion at 14:30.
- WAITER (MINE): cl-l1-wait-adv-instrcol1-c2-l1t1330 pid 440019, survives tick exit.
- No browser gate live; no new dispatches this tick (fleet coder slot occupied by our
  own fix-run; scout slot intentionally not consumed — reach questions answered by
  first-hand orch probes instead).
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk 3ea74fed + this handoff commit; clean except M pnpm-lock.yaml.
