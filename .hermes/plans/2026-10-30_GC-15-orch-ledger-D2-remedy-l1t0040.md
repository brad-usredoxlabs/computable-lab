# GC-15 — ORCHESTRATOR-AUTHORED COMMIT LEDGER (D2 remedy artifact)

Token: l1t0040. Written by the lane-1 orchestrator per adversarial cycle-2 ruling V6
(/home/brad/.hermes/cl/reviews/GC15-adv2-l1t0012.md): D1 blocker CLOSED on first-hand evidence;
D2 (documentation-only ledger) remains open because the fix run died (engine admission expiry,
23:53:46) before writing its prescribed report — the remedy is this ledger itself. All entries
verified first-hand by the orchestrator (tick l1t0012) and independently by the cycle-2 reviewer.
This addendum supersedes the stale §7 of gc15-report-l1t2100.md (which quotes the PRE-FIX script).

## Lane data repo (/home/brad/.computable-lab-lane1/worktrees/main) — FULL commit sequence, oldest first

1. 202ef242  2026-10-29 22:36:39  Create analysis revision ANREV-000009
       (the GC-15 mint; +73, the original pre-fix entryScript — preserved here for provenance,
       reviewer O3 note: recoverable only from git, ANR-000025's referenced script)
2. c1b6a589  ~22:3x             (smoke chain) Create/update analysis run ANR-000025 — first smoke
3. 0774ac02  ~22:3x             Update analysis run ANR-000025 -> running   <-- the commit the
       original report §7 omitted (DEFECT-2 proper)
4. 64aa06d8  ~22:4x             Persist analysis artifact signal_trace -> DREF-000118
5. 1578246c  ~22:4x             Create analysis output artifact AOUT-000031
6. c65a1353  ~22:4x             Complete analysis ANR-000025 (status succeeded; AOUT-000031
       carries units ONLY on the AOUT record field -> cycle-1 DEFECT-1)
7. c7fe3120  2026-10-29 23:47:43  GC-15 FIX1: merge reader axis_units/value_units into the
       published signal_trace value dict (+63/-14 on ANREV-000009's entryScript; in-place PUT
       update, A6 target stays ANREV-000009; zero literals preserved — units copied from
       reader output, orch + reviewer independently verified no 'min'/'pA' literals)
8. d2827801  23:48:15  Create analysis run ANR-000026
9. 2f7300db  23:48:19  Update analysis run ANR-000026 -> running
10. 2776e32b 23:48:22  Persist analysis artifact signal_trace -> DREF-000119
       (vast: analysis-artifacts/ANR-000026/signal_trace, 2,693,496 B,
        sha-verified via DREF contentHash)
11. a7ece111 23:48:22  Create analysis output artifact AOUT-000032 (dataKind signal)
12. 5cd728d7 23:48:22  Complete analysis ANR-000026 (succeeded; engineProvenance.adapter
       python-entry-script; input DREF-000008 = FID1A.CH; 72,801 points; axis_units=min /
       value_units=pA INSIDE the published value -> Compare consumer xUnit/yUnit resolve)

Code repo /mnt/vast/home/brad/git/cl-integration-1: ZERO tracked source edits in the whole
window (status --porcelain clean of non-?? entries; reviewer reproduced the same check).

## Consumer-seam witness (DEFECT-1 closure)
GET /api/analysis-artifacts/AOUT-000032/content -> 200; content keys: axis, axis_units=min,
channel=FID1A, format=agilent-chemstation-ch-v181, n_points=72801, reader
computable_lab_d_reader 1.0.0, value_units=pA, values(72801). traceModel.ts:111-112
AXIS_UNIT_KEYS/VALUE_UNIT_KEYS resolve -> UNIT_UNDECLARED gone; AOUT-000031 read as control
(units absent from its value).

## Rulings closing out
- RC10 (written report): SATISFIED by the mint report gc15-report-l1t2100.md (STATUS: complete,
  GC15 DREADER DONE 202ef242...). The fix-run report was a fix-prompt deliverable, not a spec
  deliverable; this ledger is its substitute as the cycle-2 reviewer's ruling directs ("the remedy
  is the ledger artifact itself").
- Reviewer observations O3-O6 recorded (immutability/documentation mismatch, `|`->`>` scalar,
  meta.commitSha non-resolvable, ctx.input vs prose) — all pre-existing framework behaviours,
  none a defect of this diff; O3 carries a forward recommendation (mint a parent-chained revision
  next time rather than in-place PUT on a revision-kind record).

GC-15 CLOSED by the orchestrator 2026-10-30T00:4x: D1 closed at cycle 2, D2 remedied by this
artifact, no code merge (data repo is its own trunk), A6 target = ANREV-000009 (smoke witnesses
ANR-000026 / AOUT-000032 / DREF-000119).
