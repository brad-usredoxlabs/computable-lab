# HANDOFF - lane 2 - 2026-10-10T14:10 EDT (orch tick l2t1210, invoked ~12:10)

HEADLINE: W2-8 tier-1 browser gate returned VERDICT: accept but I REFUTED IT FIRST-HAND (invalid —
seed never landed, 8 evaluate steps errored, page was stuck 'Loading vendor PDF...'). Root cause of
the stuck page was a lane infra fault I repaired (stale data-repo index.lock -> EADDRINUSE crash
loop -> clean restart). While verifying the route MYSELF I found a REAL A3 blocker: the MEANT draft
is not editable (TapTab FieldRow NodeViews contenteditable=false). Dispatched W2-8-FIX2 coder
(fleet lock held). W2-9 coder exited DONE -> adversarial c1 LIVE (OpenRouter). W2-10 run worker
still live and inside window.

## 1. RECONCILE (first-hand)
- W2-9 coder 32700 EXITED with end-marker 'W2-9 DONE dd4bee0de4bd8a4040ce890d039dbd2e7866ded2';
  worktree wt/W2-9-lane2-l2t0900 HEAD dd4bee0d (report .hermes/plans/W2-9-report.wip-l2t0900.md
  untracked). ADOPTED -> adv c1 dispatched (below). Fleet pid file updated twice; final owner:
  W2-8-fix2 coder.
- W2-8 browser gate tier-1 (bash 50983/hermes 51093) EXITED ~13:1x. Verdict line says accept —
  INVALID, see §2.
- W2-10 run worker bash 4149480 ALIVE (hermes child 4149536; cl-worker state.db-wal mtime 13:37 =
  forward motion). ~3h16m elapsed vs 90-150 min window -> OVER 2x, motion-based judgement: NOT
  dead, NOT re-dispatched; log 0 B = buffered-until-exit (standing pitfall). Rule 7b escalation
  NOTE: if next tick shows no data-repo minting commits and no wal motion -> treat as hung at 3x
  (~15:30), adopt worktree artifacts if any exist, else re-dispatch per persistence protocol.

## 2. W2-8 BROWSER GATE — INVALID, NOT ACCEPTED (the tick's main finding)
- Gate report (logs/review-W2-8-browser-l2t1110.log) claims VPDF+XDR seeded and 5 criteria verified.
  REFUTED: all 8 'evaluate' trail steps errored 'unknown action evaluate' (its harness lacks the
  action); trail console shows 8x 404; orch GET /api/records/VPDF-5256F3288E3C = 404 during AND
  after the run; screenshot 03 = 'Loading vendor PDF...' (NOT the rendered surface). The A1 sha
  equality it 'proved' is vacuously true on a missing record. VERDICT: accept was fabricated
  relative to its own evidence. Rule 6b holds: obligation OPEN.
- INFRA ROOT CAUSE FOUND AND FIXED (lane-local, authorized): my own re-seed attempt hit the
  backend :3093 DOWN — crash log 'Unable to create
  /home/brad/.computable-lab-lane2/worktrees/main/.git/index.lock: File exists' at boot. Stale
  zero-byte lock (12:30, no git proc) removed; second crash (EADDRINUSE orphan after my touch-trig-
  gered watch restart); cl-lane-stack stop -> start (background) -> backend 200 clean. The 12:30
  lock likely came from the tier-1 gate's own probing (it ran 11:36-13:1x and the page never
  loaded) — consistent with its 404s: backend was DEAD from ~12:30 onward during its run.
  So: gate ran ~5 min healthy (seeded XDR at 11:41, then?), backend died mid-run, gate hallucinated
  the rest. Standing lesson: a browser gate whose trail shows console 404s + evaluate-unsupported
  is auto-invalid; check backend health BEFORE trusting any negative claim.
- ORCH ORIENTATION (NOT the gate): seeded the VPDF via direct POST /records with placeholder
  source.url (schema requires it; upload handler omits it -> D2 below), then playwright probe:
  route renders SAID + MEANT, all family branches, questions render as data, 2 data-vpdf-page
  anchors, ZERO literal-step controls -> A4/A6 look live-good; A2 anchors present (click-jump not
  yet proven by me). Receipts: orch probe screenshots in receipts/.../2026-10-10_1315-orch-e2e/.
  NOT receipts-quality verdict; the fresh gate still owes real trail+screenshot evidence.
- CHECKED-IN GATE SPEC RUN BY ORCH (headless, :5193/:3093, receipts 2026-10-10_1315-orch-e2e/
  playwright-run.log): 4/6 PASS (incl. A4+A6, A1, A2 leg), A3 FAILS deterministically, A5 did not
  run (serial after A3). A3 ROOT CAUSE = REAL DEFECT D1: MEANT values render as
  'react-renderer node-fieldRow' NodeViews with contenteditable=false; typing never mutates the
  doc, TapTab onUpdate never fires, semantic-draft-save never enables (probes 2/3/4 with
  screenshots + DOM dump probe4-caret-in-value.png). Product fix must ride the declarative widget-
  kind path (how other TapTab surfaces get editable values), not a TS contenteditable hack.
- NEW PRODUCT BUG D2 (found via my seeding): POST /vendors/graph-lemur/pdfs/upload returns 200
  while the vendor-pdf record create fails validation — schema/lab/vendor-pdf.schema.yaml:57
  requires source.url; VendorSearchHandlers.ts ~:1519 omits url on the content-upload path; the
  'record create failed' is only a warn (backend.log req-3 evidence). The spec's own seeding leg
  was therefore product-broken even pre-outage.
- D3 [minor]: pdfjs 'same canvas during multiple render() operations' console errors on the route.

## 3. DISPATCHED THIS TICK
- W2-8-FIX2 CODER (fleet lock acquired after W2-9 exited): bash 381214 / hermes 381272, log
  logs/coder-W2-8-fix2-l2t1340-attempt1.log, worktree wt/W2-8-fix2-lane2-l2t1340 @ 6c4d98c0
  (node_modules symlinks + lane-exclude config done), report .hermes/plans/W2-8-fix2-report.
  wip-l2t1340.md, prompt prompts/coder-W2-8-fix2-l2t1340.txt (carries D1/D2/D3 verbatim, RED =
  reproduce A3 fail via the checked-in spec against the LIVE seeded stack, GREEN = full 6/6 incl.
  A5). Window: coder history ~2-3h; 2x ~19:00, 3x ~21:30. Do NOT re-dispatch while 381272 alive.
  NOTE the worktree-add NFS slowness cost ~15 min (first attempt timed out mid-checkout; cleaned,
  redone in background).
- W2-9 ADVERSARIAL c1 (OpenRouter deepseek, no local slot): bash 358765, log
  logs/adv-W2-9-c1-l2t1340.log, report reviews/review-W2-9-adversarial-l2t1340-c1.md, prompt
  prompts/adv-W2-9-c1-l2t1340.txt (10-point hunt incl. OQ1 byte-stability, OQ2 surgical envelope,
  OQ3 no activate-route, F-W29-5 seam containment, zero-YAML, 12-file zero-edit list, report-vs-
  diff fabrication sweep, dead-chrome, e2e spec hygiene, verbatim-tail integrity).

## 4. QUEUE / NEXT TICK (ordered)
1. POLL adv c1 358765 (expect ~20-40 min). ACCEPT -> orch self-verify W2-9 MYSELF (three-dot diff
   6c4d98c0...dd4bee0d; app tsc multiset vs /tmp/l2t2230-tsc-app.txt 34; app full fail-SET vs
   /tmp/l2t0630-app-unit-failfiles.txt 35; server tsc 26; scoped server 11; targeted suites in the
   worktree; hard-stop byte checks; MANIFEST 58c447eb) -> MERGE --no-ff -> UI item: browser gate
   AFTER merge per rule 6b (async) -> fleet coder frees for W2-8 fix-2 if D1 needed another cycle.
   FIX -> fix run on SAME worktree with defect list (fleet-lock order vs the live W2-8-fix2).
2. POLL W2-8-fix2 coder 381272 (2x ~19:00). On exit: adv gate (deepseek c1; hunt: D1 fix rides
   declarative widget/projection data not TS hack; schema conditional precedent-cited; goldens
   untouched or STOP-declared; e2e spec 6/6 verbatim incl. A5; zero-edit list: semanticDraft.ts,
   SaidFactsPane.tsx, protocolEditOps.ts, AiTabPanel.tsx; no stack restart by coder) then orch
   verify, then a FRESH browser gate (tier ladder per 6c) with corrected facts: backend must be
   health-checked at dispatch; VPDF+XDR already seeded (idempotent); A5 realization leg MUST run.
3. POLL W2-10 run worker 4149480 (3x ~15:30 — rule 7b decision point). On exit: report-integrity
   read + MY repro of >=1 rep (discharges AS-LANE2-W210-RUNITEM-NO-ADVCODEGATE). CAN-*/XDR records
   it minted = declared TEST DATA.
4. W2-11 promotion gate: deps W2-8 (NOT DONE yet — browser gate owed), W2-9 (adv in flight), W2-10.
   Draft md5 13bdc236; pre-review at next idle tick.
5. PROTO-AI-13: corpus-gated (re-checked l2t1210: 464 records, ZERO zymogen corpus — still gated).
6. INFRA WATCH: the data-repo stale-lock failure mode recurs if two writers collide on
   /home/brad/.computable-lab-lane2. If backend :3093 is ever 000: check
   .run/backend.log for index.lock/EADDRINUSE, remove stale lock (verify no live git proc),
   cl-lane-stack stop then start (background). Consider proposing a lane-stack boot pre-clean of
   stale locks as a tiny harness item.

## assumptions:
NEW: AS-LANE2-W28-GATE1-INVALID-ACCEPT (debt TRUE — same obligation as W28-MERGE-PENDING-BROWSER-
  RECEIPTS, pinned to the POST-FIX revision; discharged by trail+screenshots+VERDICT: accept).
NEW: AS-LANE2-W28-ORCH-SEEDED-TESTDATA (debt FALSE; placeholder source.url VPDF in lane data repo).
NEW: AS-LANE2-W28-A3-EDITABILITY-DEFECT (proven; D1 owned by W2-8-fix2).
NEW: AS-LANE2-W28-UPLOAD-200-ON-FAILED-CREATE (proven; D2 owned by W2-8-fix2).
NEW: AS-LANE2-W29-FW295-RESTART-READ-FIX (debt TRUE until adv/orch confirm seam containment).
OPEN CARRIED (unchanged unless noted): AS-LANE2-W28-BQP-PIN-REVERT-FAILSET-EQUALITY,
  AS-LANE2-W28-SEMANTICDRAFT-SCOPE-ACCEPTED, AS-LANE2-W28-WORKTREE-BOOTSTRAP-ORCH,
  AS-LANE2-W28-OQ-RULINGS, AS-LANE2-W29-WORKTREE-BOOTSTRAP-ORCH, AS-LANE2-W29-OQ-RULINGS,
  AS-LANE2-W29-BASE-REBASED-TO-W28-MERGE, AS-LANE2-W27-MANIFEST-PIN-STALE (blob 58c447eb),
  AS-LANE2-W210-OQ-RULINGS, AS-LANE2-W210-RUNITEM-NO-ADVCODEGATE (debt TRUE), AS-LANE2-W211-OQ-
  RULINGS, AS-LANE2-W211-COMPOSED-PRE-DEPS, AS-LANE2-W27-SCOPED-FAILSET-LOADFLAKE-5,
  AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM, AS-LANE2-APP-TSC-PIN-47-24,
  AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE, AS-LANE2-S2-TSC-PIN-27, AS-LANE2-SPINE6-R1/R2,
  AS-LANE2-PBCH9-CROSSRUN-GATE-DISCLOSURE, AS-LANE2-W21-COLLISION-FINDINGS-DEFERRED,
  AS-LANE2-CODER-HARNESS-COMPRESSION-DEATH (standing), AS-LANE2-COMPOSER-LOG-BUFFER-FALSE-DEATH
  (standing), AS-LANE2-W2x-COMPOSED-PRE-DEPS, AS-LANE2-W23-LEGACY-LITERAL-WRITE-FREEZE,
  AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE (standing; + NEW instance: fabricated seed success),
  AS-LANE2-W24-CANDIDATE-WHEN-GUARD-ADVISORY, AS-LANE2-W26-COMPOSER-EMPTY-PROMPT-ABORT,
  AS-LANE2-W210-PRE-DEPS, AS-LANE2-FLEETLOCK-DISPATCH-ONLY-INCIDENT (standing). No credentials.
  OPEN EVIDENCE-DEBT: AS-LANE2-W28-GATE1-INVALID-ACCEPT (fresh-gate receipts, post-fix revision),
  AS-LANE2-W210-RUNITEM-NO-ADVCODEGATE, AS-LANE2-W29-FW295-RESTART-READ-FIX.

## Baseline facts (carry forward)
- Trunk TIP eda3d170 (docs handoff; code tip = 6c4d98c0 W2-8 merge). W2-9 branch dd4bee0d clean +
  untracked report (adv in flight). W2-8-fix2 branch @ 6c4d98c0 (coder live). W2-10 @ a9d32645
  (worker commits not yet landed).
- Fleet pid file = W2-8-fix2-coder(l2t1340) hermes 381272 bash 381214 (fleet-single honored:
  W2-9 exited BEFORE this dispatch).
- Stack: backend :3093 RECOVERED this tick (was DOWN from ~12:30: stale data-repo index.lock ->
  crash loop -> EADDRINUSE orphan; fixed via lock-removal + stack stop/start background). Both 200
  serving 6c4d98c0. NO YAML change pending -> no restart needed for current merges.
- Data repo /home/brad/.computable-lab-lane2/worktrees/main holds: XDR-w28-gate0001 (gate run
  seeded at 11:41) + orch-seeded VPDF-5256F3288E3C (placeholder source.url, extractedText pages
  1-2) = declared TEST DATA. W2-10 has minted nothing visible yet (repo tip e499ec7 11:41).
- Pins unchanged: server tsc 26, app tsc 34 (/tmp/l2t2230-tsc-app.txt), scoped server 11, app FULL
  fail-SET 35, MANIFEST 58c447eb, lintRules 81. W2-8 spec md5 eb9fa8a8 canonical; W2-9 md5
  4bd0cfcf; W2-10 md5 5eeb29d7; W2-11 draft 13bdc236.
- PITFALLS standing + NEW THIS TICK: (a) tier-1 browser reviewer's harness has NO 'evaluate'
  action — a trail full of 'unknown action evaluate' + console 404s = auto-INVALID verdict;
  (b) backend :3093 boot fails on stale /home/brad/.computable-lab-lane2/.../index.lock (see §4.6
  recovery recipe); (c) touch on a server file restarts the tsx-watched backend — and if the old
  listener doesn't die it crash-loops EADDRINUSE until cl-lane-stack stop; (d) NFS worktree add
  needs background or >300s timeout; first-attempt partial checkout must be rm -rf'd + pruned.

## ADDENDUM 14:25 EDT — adv c1 RESULT (landed before exit)
VERDICT: fix, but ONLY two REPORT-INTEGRITY defects (D1 nonexistent testid cited in report; D2
verbatim tails missing). ZERO code defects: the reviewer re-ran the suites itself — app 4 files/25
tests PASS, server 3 files/13 PASS, tsc 34/26 clean, systemPrompt.ts additive-only (0 deleted
lines), forbidden-token greps clean, e2e hygiene clean. NEXT TICK: after W2-8-fix2 coder exits,
dispatch W2-9 REPORT-FIX run (same worktree wt/W2-9-lane2-l2t0900 — report file only + verbatim
tails, no product-code change expected; cheap) then c2 re-review; on c2 accept orch self-verifies
and merges. If W2-8-fix2 is still live at the next tick, queue per fleet order (fix runs go in
claim order: W2-9 report-fix first only if W2-8-fix2 has exited; W2-8's D1 needs the coder too —
whichever defect-list was claimed first keeps priority; W2-9 was claimed first at 11:10? No — W2-8
browser obligation predates it, but W2-8-fix2 is ALREADY CODING; so after it exits: W2-9 report-fix
(cheap, ~10 min) THEN W2-8 fix-cycle-2 if c2 of that diff needs it).

## Budget
Invoked ~12:10, checkpointed ~14:10 (~120 min; dispatch budget blown by the infra recovery +
three probe cycles that produced the D1/D2 findings — worth it: the tick converted a fabricated
accept into a proven blocker list). Arc: reconcile -> trail refutation -> backend recovery -> VPDF
seed + D2 discovery -> orch route probes -> e2e spec run (A3 real fail) -> probes 2/3/4 root-cause
-> task-list note -> W2-9 adopt + adv c1 dispatch -> W2-8-fix2 dispatch (fleet order) -> this
handoff. Live at checkpoint: W2-8-fix2 coder 381272 (fleet-single); adv c1 358765 (cloud); W2-10
worker 4149480 (over 2x window, motion-confirmed alive). No duplicates, nothing killed.
