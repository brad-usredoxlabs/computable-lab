# Handoff — lane 1 tick 2026-10-29 12:00-12:35 (dispatched 10:40 window) · GC-13 GATE2 VERDICT: fix (all content criteria PASS) · ACL fixture repairs applied · GATEFIX3 CODER LIVE slot-0 · GC-14 trust anchor PROVEN first-hand — 157th

## Reconciliation (first-hand)

- Browser gate2 unit browsereview-GC13g2-l1t1035 exited 11:34 with a full trail:
  report.md (19.5KB) + trail.json + 3 plan files + shots in main/partC/partD.
  ORCH RECEIPT AUDIT (browser-gate-receipt-audit.md) PASSED before consuming the
  verdict: md5 sweep (3 duplicate pairs = the report-declared intentional
  settled-state re-shots, disclosed), live cite-checks of the reviewer's negatives
  (ANR-000013 outputArtifactRefs = AOUT-000019/20/21 confirmed; ANR-TEST-GC13-
  214258 outputArtifactRefs null/absent confirmed; per-id 404 counter from
  trail.json matches the report's D3 breakdown exactly: ENG x4, SMP x2, GCM x2,
  ISEN-u2cv4r x1).
- No coder was live at tick start (PIDs 3211236 / 3083032 both gone; both slot
  flocks FREE-verified). Lane stack 200/200; :3001/:5174 untouched all tick.

## GC-13 gate2 outcome

VERDICT: fix — but this is a RENDERING-ONLY remainder: G1 G2 G3 G4 G5 G6 G7 P1 P2
ALL PASS (both gatefix2 pins hold: refusal arm has no kind chip, no ISEN-typed
provenance hop); G8 FAIL on 8 GC-origin console 404s. Gate-1 defects D3/D4/D5
confirmed closed with settled-state re-shots (partD).

Defects + dispositions:
- D1 (med) hand-off UNSTYLED on the GC-12 results surface. Orch verified cause
  first-hand at ea479a43: zero css imports in GcEvidenceHandoff.tsx /
  GcProvenancePanel.tsx; all gc-ev__/gc-prov__ rules live in
  GcEvidenceRunPage.css scoped under .gc-evidence-run (36 rules), which only
  /gc-run renders. -> coder (gatefix3).
- D2 (med) provenance fact labels collide with values; standards-table cells
  unstyled (GcEvidenceRunPage.css:215-223 is color-only). -> coder (gatefix3).
- D3 (med) unresolved-ref hop renders the loud NOT_FOUND arm AND a dead
  /record/<id> anchor. TWO ARMS: fixture/ACL arm RESOLVED BY ORCH THIS TICK
  (see below); the never-anchor-on-failed-fetch code arm -> coder (gatefix3).
- D4 (low) created-bundle id name != criterion's EVD-TEST-G13B2 name.
  ADJUDICATED BY ORCH: the gate criterion's naming was illustrative; the form's
  generated id shape (EVD-GC13-<run>-<ts36>) is correctly shaped and the
  readback 200 passed. Spec naming amended; NO code change. (Recorded as an
  assumption with the evidence-debt rule: this amendment is mine, not Brad's.)

## ORCH FIXTURE/ACL REPAIRS (TEST data; all re-probed 200 as the gate identity)

The 8 console 404s were ACL artifacts, NOT missing records — all four ids exist on
disk in the lane store:
- ACL-ENG-PYCAL01-L1T2305 PUT editor grant USR-LOCAL-ADMIN (owner USR-BRAD) -> 200
- ACL-ISEN-U2CV4R PUT editor grant -> 200
- ACL-GCM-DEMO-AOAC-FAME PUT (as owner USR-QMS-ADMIN) editor grant -> 200
- ACL-SMP-D2K8O6 (existed, grants: []) PUT editor grant -> 200
Readback: ENG-PYCAL01-L1T2305 / SMP-d2k8o6 / GCM-DEMO-AOAC-FAME / ISEN-u2cv4r all
200 as USR-LOCAL-ADMIN.

## GATEFIX3 CODER (LIVE at checkpoint)

- Worktree /mnt/vast/home/brad/git/wt/gc-13-gatefix3-lane1-l1t1150 off ea479a43,
  synced (linked=54 skipped=65 src-missing=0 noise=0).
- Unit run-GC13gf3-l1t1150 (KillMode=process), launcher
  launch-GC13-gatefix3-l1t1150.sh, SLOT-0 flock acquired 12:31:57, real coder
  PID 3555027 in the pid file (GC13GF3-3555027-2026-10-29T12:31:57-04:00).
  Stagger was open (fleet newest stamp 09:27 > 60 min, both prior PIDs gone).
- Prompt prompts/coder-GC13-gatefix3-l1t1150.txt (defects D1/D2/D3-code-arm
  verbatim, RED-first, tsc floor 11, stop boundary = no new affordance).
- Report gc13-gatefix3-report-l1t1150.md; marker 'GC13GATEFIX3 DONE <full-sha>'.
- Expected duration ~40-90 min (gatefix class); 2x = ~3h, 3x escalation per 7b.
- Slot-1 FREE; do NOT launch a second coder (stagger: slot-0 started 12:31:57 —
  next coder launch no earlier than ~13:32 unless 3555027 is gone).

## GC-14 PRE-FLIGHT — trust anchor PROVEN (spec OQ-1 CLEARED)

First-targeted-check executed first-hand at trunk ea479a43 (GC-13 code merged;
browser acceptance still pending — GC-14 PROMOTION stays gated):
- Register route requires `entryRef` (draft payload superseded; RunSheetHandlers
  auth order 404->401->403, denied-before-mint confirmed by live 403s as
  USR-LOCAL-ADMIN and USR-QMS-ADMIN on ISEN-d2k8o6).
- As USR-BRAD: 200, ACQP-000002, 21 files, DREF-000029..000049; EVERY
  contentHash BYTE-MATCHED independent sha256sum (21/21, incl. nested
  ACQ.M/ DA.M/ members; FID1A.CH a13bcd0e...21300 reproduced).
- NAS re-witnessed: 12 top-level .D under machine1, RES35077-4.D/-5.D present;
  :3092 storageDevices = [vast, gc-fid-nas].
- Full addendum (payload shape, A3 identity/WRITE implication, superseded draft
  cites, hygiene-window stamping rule) appended to
  drafts/2026-10-28_GC-14-acceptance-dossier.l1t1640.draft.md.

## NEXT TICK — in order

1. Poll logs/coder-GC13-gatefix3-l1t1150.log + report marker. On exit ->
   DELTA adv gate (ea479a43..HEAD, unique report path under
   ~/.hermes/cl/reviews/) -> orch self-verify (app vitest src/run, tsc floor 11,
   open the real diff) -> merge --no-ff into cl/integration-1 -> restart lane
   stack only if YAML changed (expected: NO YAML) -> confirm :5192 serves the
   merged module -> GATE3 re-shot of the failed/styled legs (G2/D1, G3+G4/D2,
   G8 console-clean + the styling screenshots, single identity USR-LOCAL-ADMIN,
   receipts GC-13/<new-ts>-gate3/) -> on VERDICT: accept mark GC-13 DONE with
   receipt cites, promote GC-14 dossier.
2. Fixture residue note for the reviewer prompt: gate2 minted
   EVD-GC13-ANR000013-mvtnco1b (+ mvtnb0ve pre-existing) — GC-13's OWN test data;
   harmless, no cleanup (A4).
3. GC-14 dossier promotion checklist is now unblocked-by-design: NAS ok,
   register route proven, DNA clause green (94a8c0ed), lint floors live. Only
   the GC-13 browser ACCEPT gates it.
4. Ops: reviews land in ~/.hermes/cl/reviews/; slot pid files carry ISO stamps.

## assumptions:

- AS-L1T1235-1 (orch): gate2's 8 console 404s are ACL artifacts, fully repaired
  by the four ACL grants (evidence: 200 readbacks as gate identity). Residual
  code-side gap (dead anchor on fetch-fail) is covered by gatefix3 D3; if any 404
  survives gate3, re-open as a data defect, not an assumption. evidence_debt=true
  — cleared by gate3 G8 console-clean receipt.
- AS-L1T1235-2 (orch): D4 id-naming adjudicated as spec-wording, not product
  defect (form generates correctly-shaped ids; readback 200). If Brad wants
  EVD-TEST-* naming, that is a small product change, not a gate failure.
  evidence_debt=false.
- AS-L1T1235-3 (orch, OPEN): GC-13 merged at aa9bd8d5 on code-track hard gates
  with the browser gate as an explicit OPEN obligation (rule 6b). Carried from
  AS-L1T1035-1 (renamed for this tick). evidence_debt=true — cleared by gate3
  VERDICT: accept.
- Carried open: AS-L1T0530-3, AS-L1T0400-2 (both clear at GC-13 browser accept,
  same clearance event as AS-L1T1235-3), AS-L1T1235-1, AS-L1T1235-3.
  CLEARED this tick: none formally; gate2 closed the G6/G7 evidence lines inside
  AS-L1T0935-1's follow-through (console rule was G8's, which FAILED — stays
  open via AS-L1T1235-1).
