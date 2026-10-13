# HANDOFF l2t2230 (CHECKPOINT, 45-min soft budget reached) — lane 2 — 2026-10-13T00:05 EDT
# Supersedes 2026-10-12_2130. Trunk cl/integration-2 tip: 6fd44915 (orch harness fix D4
# surface+roles) on a48ba37c. Stack :3093/:5193 both 200 (no YAML product change; no restart).

COMPLETED THIS TICK:
1. RECONCILED all prior live workers: G2d tier-1 exited (invalid-route BLOCKED, adjudicated
   last tick's exit correction), composer EXITED DONE (draft on disk, log COMPOSER DONE
   26192), no coder live at tick start.
2. D4 ROOT CAUSE PROVEN (the run3 hypothesis CONFIRMED + a SECOND gap found):
   (a) protocol-localization-details mounts ONLY in ProtocolTabPanel via RightPane, which
       the app renders ONLY on deck/event-editor surfaces; /runs/:runId is RunWorkspacePage
       and has NO protocol tab (App.tsx:193). The A5 fixture deck route works because its
       EVG carries links.runId + methodContext.protocolRef (tier-2 trail proved the goto).
   (b) SECOND gap: extractUniversalProtocolSetup (ProtocolTabPanel.tsx:302-327) returns
       null unless payload.roles exists -> the promoted family (from the role-less frozen
       draft) rendered the disclosure CLOSED, thread mounted-but-inert (probe 1:
       detCount=1 detOpen=false thread=1). Also: PLR pointed at a DEAD CAN id
       (CAN-protocol-1791838343388 404s — promotion non-idempotence against the D2-edited
       draft minted .1791839280914 and .1791854126768; the ledger has both XPRs).
   Orchestrator probe (tmp-orch/probe-d4-surface-l2t2230.mjs, receipts
   W2-11-ZYMO-GOLDEN-DEMO/2026-10-13_0000-probe-d4-surface/): after EVG-w211-gate seed +
   PLR repoint + family roles PUT, the deck surface renders details OPEN + thread +
   pl-clarify with 0 console errors.
3. HARNESS FIX COMMITTED 6fd44915 (orch-owned class, l2t1615/l2t1735 precedent): seedRun
   now idempotently declares the roles the robot answers name (sample_plate,
   reagent_reservoir, bead_beater, lysis_solution — the same identity-bearing shape the A5
   family carries), seeds/repoints EVG-w211-gate + PLR to THIS run's promoted family; D4
   navs /deck/EVG-w211-gate/RUN-w211-gate + clicks the Protocol tab. ASSERTIONS UNCHANGED.
   Live-data repair applied to the lane DB too (PLR + both CAN families roles, EVG seed).
4. GATE RUN 4 LAUNCHED (background proc_791176f9c000 pid 4147747, log
   logs/w211-gate-full-l2t2230-run4.log, app/receipts/): PRECHECK+D1+D2+D3 PASS (D3 37.7s,
   all refusal legs green). D4 ADVANCED PAST the run-3 wall: localization thread +
   branch-axes answers + compile + deck-review gate ALL render; FAILS NOW one layer deeper:
   'the deck review must offer labware placements' — 0 checkboxes in pl-deck-review.
   deriveDeckLabware folds terminalArtifacts.labwareAdditions + labwareRequirements; both
   empty. Cause (traced in code): resolve_labware emits labwareAdditions ONLY from
   candidateLabwares (ai_precompile/lower_protocol_intent outputs); the scientist-intent
   shorthand pipeline carries no candidateLabwares producer, so the localized macro's
   compile yields zero additions/requirements. THIS IS THE SAME DEFECT CLASS the A5d tier-2
   gate hit (pl-accept gated on >=1 preview, lane has ZERO labware-design records;
   AS-LANE2-W28-A5D-ACCEPT-GATE-BY-DESIGN adjudication: the accept gate is by-design; the
   blocker is fixture/seed or a missing producer, not A5FIX code).
5. SHORTHAND-COMP-1 spec COMPOSER EXITED DONE -> load-bearing claims spot-verified first-
   hand (expandWellTokens exported at wellRange.ts:38; shorthandResultFromCompile lacks
   labwareAdditions while compileScientistIntent:288-294 puts them on terminalArtifacts;
   addMaterialExpander volume arms at :335-351, transferExpander object-volume read :438).
   PROMOTED canonical: .hermes/plans/2026-10-12_shorthand-comp-1-volume-wellrange-mixture-
   spec.md. OQ defaults ACCEPTED as recommended (OQ1 bundle interim cue-bar; OQ2 default
   write-back, STOP if unreachable; OQ3 proceed + time the suite). Coder NOT dispatched this
   tick: lane-1's OLIGO-AI-1 took the fleet lock at 23:11 (pid 4013654, DEAD at ~00:00
   check; pidfile stale — next tick: clear and dispatch SHORTHAND-COMP-1 off trunk).
6. PROTO-AI-13 NOT recounted this tick (budget); carry-forward: n=188/500 INSUFFICIENT-side.

LIVE WORKERS at exit: gate run 4 playwright proc proc_791176f9c000 (bash pid 4147747) —
  it had already printed its summary (1 failed D4, 4 passed, 2 did-not-run) BEFORE this
  checkpoint: i.e. run 4 FINISHED with the deck-review finding above; no live workers.
  Verify the process is gone next tick (ps -p 4147747) before anything touches app/receipts.
  No coder (fleet lock pidfile OLIGO-AI-1 STALE — pid 4013654 gone), no reviewer live.

QUEUE / NEXT TICK (priority):
(1) CLEAR the stale fleet pidfile (flock is free; pidfile owner pid gone) and DISPATCH
    cl-coder SHORTHAND-COMP-1 off trunk tip (spec: canonical path above; worktree
    wt/SHORTHAND-COMP-1-lane2-<TS>; unique report .hermes/plans/reports/SHORTHAND-COMP-1-
    report.l2t<TS>.md). Top-of-queue per Brad's 2026-10-10 priority ruling.
(2) W2-11 D4 deck-review gap — decide fixture-seed vs producer:
    (a) FIRST measure cheaply (orch): run the localized macro's compile through
        POST /api/intent/compile headlessly and inspect terminalArtifacts keys; confirm
        labwareAdditions/labwareRequirements truly absent for the zymo macro (matches A5d's
        zero-preview finding).
    (b) Check how the GOLDEN suite (ZymoCampaignGoldenE2E.test.ts) gets deck labware into
        the review list — it passed at W2-5/W2-8 with deck placements; find what producer
        fed labwareRequirements there (grep the golden for labwareRequirements/robot
        profile closure — the golden compiles via realizeAndCompile, a DIFFERENT producer
        path that DOES close roles to labware via the robot profile). If the ONE-SHOT chat
        localization path has no such producer, this is a PRODUCT GAP (the accept gate the
        spec pins can never open on the chat path with an empty labware inventory) -> route
        to architect as a bounded decision (deck-review-empty-on-one-shot-path) with the
        run-4 evidence + A5d receipts; do NOT weaken the D4 assertion, do NOT seed
        labware-DESIGN records speculatively (measure what the resolver matches first —
        the A5d next-check rule).
    (c) If a seed makes it legitimate (resolver matches a seeded labware record), seed it
        harness-side and run gate 5.
(3) A5e (W2-8 accept leg): same dependency as (2b) — the deck-resolver measurement serves
    BOTH. Then tier-2 re-shoot.
(4) G2e re-shoot per l2t2010 exit correction: seed an OPEN un-promoted XDR bound to
    VPDF-5256F3288E3C + use the /ingestion/vendor-pdf/ route; deterministic
    Playwright-only brief.
(5) PROTO-AI-13 recount each tick (n=188).

assumptions:
- AS-LANE2-W211-D4-DECK-SURFACE-ORCH-HARNESS-L2T2230 (CLOSED this tick — probe-verified:
  deck route + roles make the thread live; run 4 rode it into the review gate).
- NEW AS-LANE2-W211-GATE-RUN4-DECKREVIEW-EMPTY-L2T2230 (open, evidence debt: gate run
  green or architect ruling): D4's zero-checkbox deck review attributed (code-traced,
  headless compile not yet run) to the one-shot localization path emitting no
  labwareAdditions/labwareRequirements — same class as A5d's zero-preview. Assertions
  unchanged; no speculative seed.
- NEW AS-LANE2-FLEET-PIDFILE-STALE-L2T2230: appliance2-coder.pid shows OLIGO-AI-1
  pid 4013654; pid VERIFIED gone at 00:00 — pidfile is stale bookkeeping, next dispatch
  overwrites it per the flock protocol (the flock itself was never held by the dead pid).
- Carried open (unchanged): AS-LANE2-W28-GATE1-INVALID-ACCEPT (until A5e accept receipt),
  AS-LANE2-W28-A5D-ACCEPT-GATE-BY-DESIGN (measured resolver this tick's (2b)/(3)),
  AS-LANE2-W211-GATE-HARNESS-ORCH-OWNED (closes at gate accept), W211-MAGWASH2-KIND,
  W211-LANESYNC-SYMLINK-LOADER-GAP, W28A5FIX-EVIDENCE-LISTS-COMMITTED, SEMANTICPASS-DEBT,
  EXA-CREDENTIAL-DEAD [BRAD-side], WS6-R3/R2, BROWSER-REVIEWER-FABRICATED-ROUTE,
  SHORTHANDCORPUS-CLI-VERBATIM, SHORTHANDCHAT-CRIT4/GATE1/GATE3, BASELINE-PROBE,
  W289-PROMPT-REBUILT, W211-ORCH-APPLIED-DOC-NITS. SHORTHAND-COMP-1 spec PROMOTED
  (assumption entry closes at coder dispatch with OQ defaults).

blocker: none blocking lane flow (coder lock flock free; W2-11 D4 gap is the named open
  obligation above, work continues next tick via (2a) measurement).
next check: (1) ps -p 4147747 gone?; (2) headless compile of the localized macro ->
  terminalArtifacts keys; (3) golden-suite labwareRequirements producer; then dispatch
  decisions follow the queue.
