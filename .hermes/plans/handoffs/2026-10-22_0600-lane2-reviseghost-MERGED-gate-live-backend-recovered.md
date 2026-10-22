# LANE 2 HANDOFF — l2t0530 (2026-10-22T06:00 EDT) — REVISE-GHOST-1 MERGED + BROWSER GATE LIVE; BACKEND RECOVERED FROM STALE INDEX.LOCK; MIXROLE-1 BRAD CARD FILED

Trunk tip: 2c9fbb3d (code tip 66cb7915 = REVISE-GHOST-1 merge). Stack: RECOVERED this tick
(backend was DOWN at tick start; see recovery), both ports 200 boot-verified, :5193 serves the
merged candidate.

## RECOVERY (first-hand, this tick)
- Backend :3093 was DEAD at 05:31 (status http=000). Root cause: stale zero-byte
  /home/brad/.computable-lab-lane2/worktrees/main/.git/index.lock dated 02:49 (known crash class,
  2026-10-17 precedent): no git process held it, backend.log showed the tsx --watch process died
  on "Failed to start server: GitError ... index.lock File exists" during a data-repo checkout.
  Two zombie tsx --watch supervisor trees from Oct 17/20 were still parked on the failed file.
  Removed the stale lock, restarted via cl-lane-stack.sh 2 restart (background — blocking script).
  Boot-verified: 199 schemas loaded, :3093 /api/records 200 (2.28 MB cold store took ~90 s to
  first response — slow-store warmup, not a hang), :5193 200, served AiTabPanel module contains
  the honest-wall markup. NOTE: data-repo shows 3 deleted record files uncommitted (pre-existing
  harvest leftovers; not touched).

## RECONCILE (first-hand)
- REVISE-GHOST-1: coder exited prior tick; ADVC c1 report landed 05:14 (before this tick's
  start): reviews/REVISE-GHOST-1-advc1-l2t0420.md VERDICT: accept, 0 CRIT/MAJOR + 5 non-blocking
  observations (O1 dead export clearAcceptedShorthandBindings shorthandChat.ts:448; O2 hunk-range
  justification accepted; O3 wall slot placement defensible; O4 wall wording can over-claim on
  non-draft success turns [AgentOrchestrator.ts:2985-2987]; O5 report RED-count nit). Base-control
  probes in the report reproduce RED at base for both new legs (reviseReuse assertion + honestWall
  missing-testid) — the new tests are load-bearing, accepted by advc.
- MIXFRAC-1: fleet coder LIVE, queue bash pid 3210419 (elapsed 2h08 incl. queue wait; acquired
  slot 05:05:14 off fcc24539, ancestor = current trunk tip at acquisition). hermes pid 3487392
  observed mid-run doing §2 cite re-verification greps; worktree evidence dir shows RED probe
  red1-compositionFractions + regenerated full-server baselines + NEW deliverables already on
  disk (config/drafting/composition-fraction-convention.yaml, compositionFractions.ts,
  normalizeScientistIntent edits) — forward motion first-hand, NOT stalled (elapsed-in-slot ~55 min
  at checkpoint, 1x ~06:05-07:05 window per coder history). Do NOT re-dispatch while 3210419 alive.
- COMPOSER MIXROLE-1: EXITED code=0 05:30:24 (ran ~85 min, inside the changed-approach 3x —
  finished before it mattered). Draft on disk, reviewed first-hand this tick (see WORK).
- PROTO-AI-13 recount 05:55 first-hand: n=325/500, last ts 2026-10-22T07:16:09.673Z UTC — FLAT
  3rd since streak break; INSUFFICIENT-side, no action.

## WORK THIS TICK
1. ADVC VERDICT ADJUDICATED: accept (report integrity spot-checked: scope audit, commit-order
   check, RED-control runs all with outputs in the report).
2. ORCH SELF-VERIFICATION (all first-hand, worktree wt/REVISE-GHOST-1-lane2-l2t2050 @ 4903ec61):
   shorthandChat.reviseReuse 3/3 PASS; shorthandChat 8 files/63 tests PASS; server typecheck
   EXIT 0; app AiTabPanel 14 files/92 tests PASS; app tsc 28 lines == trunk 28 lines;
   AgentOrchestrator diff ADDITIVE-ONLY (0 '-' lines; hunks @@82/@@1290/@@1342/@@2591 only —
   :3728 legacy hold NOT touched, verified by reading the block at its new :3759 position);
   diff --name-only = 9 files all §3 IN + docs.
3. MERGED --no-ff: trunk ec697e80 -> 66cb7915 (clean; MIXFRAC-1 runs on disjoint files — its §12
   surfaces simpleVerbs/normalize/goldens/composition-entry, none in this diff). Post-merge trunk
   re-run shorthandChat 63/63 PASS. Report promoted canonical .hermes/plans/REVISE-GHOST-1-report.md
   (commit 2c9fbb3d).
4. BROWSER GATE DISPATCHED (rule 6b async, tier-1): unit cl-l2-gate-reviseghost1-0530 (systemd
   --user, survives tick), cl-browser-reviewer profile. Prompt prompts/review-REVISEGHOST1-gate-
   l2t0530.txt encodes: criteria verbatim from spec §4C (positive: canonical utterance -> cards
   answered -> draft ghosts -> revise prompt -> ghosts REMOUNT measured via DOM rects + readable
   revised composition; negative: nonsense-noun hold -> cards visible OR honest-wall OR honest
   failure line, never empty-plate-happy-panel, input survives), run-page route
   /runs/EXR-LANE2-AI10 (record verified present in the served store), '.chat-page__msg' BANNED
   selector, deterministic-playwright-only mandate (prior interactive-gate failure class), 6-send
   budget, negative claims require screenshot + backend.log [agent ...] done-line corroboration.
   Log lanes/2/logs/review-REVISEGHOST1-gate-l2t0530.log (GATE EXITED code=N). Receipts
   /home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-22_0530/. Expected ~30-45 min:
   2x ~06:35, 3x ~07:20 -> rule 6c tier ladder (tier-2 = -m deepseek/deepseek-v4.1-flash
   --provider openrouter on the same profile).
5. MIXROLE-1 spec draft reviewed first-hand (root facts re-verified myself at trunk: ledger enum
   composition-entry.schema.yaml:15-22 has no dissociation member; wire mirror
   scientist-intent.schema.yaml:197 byte-mirrors it; material-system-rules.md:141 literally TEACHES
   the wrong exemplar `Thermo trypsin-EDTA role: solvent`; grep confirms zero dissociat/enzym/
   trypsin role vocabulary repo-wide outside gene-ontology annotations). BRAD RULING CARD FILED
   (watched): decisions/MIXROLE1-c-enum-ruling-request-l2t0530.md (branch A honest-`other` vs
   branch B dissociation_reagent EC 3.4.21.4 vs (C) other term). Dispatch gates on it; OQ-A/B/C
   ratifications + fleet-slot + dispatch-base placeholders stay in the §0 promotion block.
   Fleet placement per composer §9: AFTER CELLRATE-1 merge (shared file material-system-rules.md —
   CELLRATE-1 owns :151-153 hunks, MIXROLE owns :141/:149).

## QUEUE STATE / FLEET ORDER (restated, binding)
NOW: MIXFRAC-1 coder holds the fleet slot. REVISE-GHOST-1 code merged; browser gate in flight.
After MIXFRAC-1: CELLRATE-1 -> MIXROLE-1 (needs Brad (c) ruling + CELLRATE-1 merge; §9 shared-file
order) -> FULFIL (amend gate spot-checked @ 78eb4cd1; re-spot-check only if merges touch
attestation/receiving/lint/config paths) -> PANEL (+ browser gate, after coder windows) -> CHAIN
gate.

## NEXT TICK (priority order)
1. Gate log GATE EXITED -> read receipts/REVISE-GHOST-1/2026-10-22_0530/report.md + trail.json;
   audit negative claims against screenshots + backend.log (the tier-1/2 invalid-report classes:
   zero-screenshot negatives, wrong-selector negatives, refuted surface claims). accept -> mark
   REVISE-GHOST-1 DONE + task-list flip + handoff. fix -> defect list + absolute screenshot paths
   to a fix coder run (queues FIFO behind MIXFRAC-1 for the fleet slot).
2. MIXFRAC-1 log EXITED (coder-MIXFRAC1-l2t0310.log) -> advc gate (unique suffix l2t<tick>, spec
   path in task block, worktree wt/MIXFRAC-1-lane2-l2t0310 branch cl/lane2-mixfrac1-l2t0310,
   report .hermes/plans/MIXFRAC-1-report.wip-l2t0310.md); NOTE §14 adds composition-entry.schema.
   yaml change -> on merge, stack restart REQUIRED before any live-endpoint re-verify.
3. Harvest MIXROLE-1 Brad card (ANSWER: line); if ruled, fill §0, promote spec, queue per fleet
   order after CELLRATE-1.
4. PROTO-AI-13 recount every tick (n=325/500 flat 3rd, last ts 07:16:09.673Z).

## Blockers / open obligations
- No lane-2 hard blocker. Brad cards watched (not re-asked, silence != approval): APPENDONLY
  array-replace escalation; MIXFRAC-1 OQ-1 RESOLVED (harvested); MIXROLE-1 (c) enum NEW card
  l2t0530; CELLRATE-1 OQ-3 wording Brad-overrulable.
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY + AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY (both clear at main-promotion reconciliation).
- REVISE-GHOST-1 browser-gate obligation: MERGE ALREADY DONE (66cb7915, pinned served rev
  2c9fbb3d) — explicit open obligation until real receipts VERDICT: accept; never auto-accept.
- advc observations O1/O4 recorded for a future hygiene item; NOT gating, not folded silently.
- FULFIL amendment gate satisfied @ 78eb4cd1, carried until FULFIL dispatch.
- PANEL browser gate post-ELIG-merge unblocked but must not overlap coder windows or the live
  gate on the vision slot.

## assumptions:
- CARRIED, IN FORCE: AS-ELIG-FIX2-SCOPE-READ, AS-FULLSUITE-GONE4-FLAKY,
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY [evidence debt], AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY [evidence debt], AS-LOCKFILE-STALENESS, AS-CELLRATE-OQ2-OQ3-RULINGS,
  AS-CELLRATE-SEQUENCING-PRECOMMIT, AS-MIXFRAC1-AMEND-PROMOTED-BINDING,
  AS-REVISEGHOST-OQ1-RULED, AS-REVISEGHOST-FLEET-SLOT, AS-REVISEGHOST-USECHATTHREAD-PATH,
  AS-REVISEGHOST-COMPOSER-LEG-NUMBERS, AS-REVISEGHOST-CODER-COMPLETE-PENDING-GATES (discharged
  at merge; superseded by AS-REVISEGHOST-MERGED-GATE-PENDING below),
  AS-MIXFRAC1-OQ1-RULING-HARVESTED, AS-MIXFRAC1-OQ2-OQ3-OQ4-RATIFIED,
  AS-FULFIL-REVERIFY-PATCHES-BINDING, AS-ELIG-NO-FILE-OVERLAP-RECV, AS-CHAIN-OQ-RULINGS,
  AS-RECV-D6-VENDORSCAN-RULED, AS-CHAIN-ACCEPTS-RIDE-RAIL-A, AS-RECV-OQ2-RATIFIED,
  AS-RECV-OQ1-DEFERRED, AS-RECV-OQ3-GOVERNANCE, AS-RECV-NO-BROWSER-GATE,
  AS-ATTEST-DISPATCH-UNDER-DEFAULTS, AS-ATTEST-OQ-RULINGS, AS-ATTEST-NO-BROWSER-GATE,
  AS-REPLAY-PARTIAL-CLAIM, AS-REPLAY-READONLY-LANE-REPO, AS-ELIG-SCREENING-NOT-AUTHORITY,
  AS-ELIG-DEP-DISCHARGED, AS-LANE2-UIWITNESS-ORCH-SCRIPTED, AS-LANE2-WITNESS-NO-ACCEPT,
  AS-LANE2-ORPHAN-RESTART, AS-LANE2-OPTIONBIND-TSC-BASELINE-0, AS-FULFIL-OQ1-FORMULA-QUEUED,
  AS-RECV-MERGE-FLAKE-FOUNDRY, AS-APPENDONLY-ARRAYS-REPLACE (escalated; lane protected),
  AS-ELIG-WT-DRAFTCHANGES-LEFTOVER-UNTRACKED, AS-MIXFRAC1-RUNNING-FIFO (in force: base
  fcc24539, REVISE-GHOST-1 merge disjoint), AS-MIXFRAC1-NO-STACK-RESTART-CODER,
  AS-FULFIL-AMENDGATE-SPOTCHECKED-AT-78EB4CD1.
- NEW: AS-REVISEGHOST-MERGED-GATE-PENDING — merged at 66cb7915 on advc+orch gates; done-gate is
  the browser receipts verdict (rule 6b), pinned rev 2c9fbb3d.
  AS-STALE-INDEXLOCK-OWNERLESS-CLEARED — 02:49 zero-byte data-repo index.lock with no holder
  removed per 2026-10-17 precedent; backend boots clean post-removal (boot-verified).
  AS-MIXROLE-DRAFT-OQABC-DEFAULTS — if Brad is silent at MIXROLE dispatch time, defaults are
  Branch A + 422-bar kept + no vendor mirror (spec §10); these are spec-level defaults, the (c)
  ENUM itself still gates dispatch — a worker never picks a golden's role.

## live-worker checkpoint at exit (~06:00 EDT; ~30 min of 45 used)
- Fleet coder slot: OURS — MIXFRAC-1 (queue bash pid 3210419, hermes 3487392, RED-phase evidence
  on disk, base fcc24539, branch cl/lane2-mixfrac1-l2t0310; log lanes/2/logs/coder-MIXFRAC1-
  l2t0310.log; ~55 min in-slot: 2x ~07:05, 3x ~08:05).
- Vision slot: REVISE-GHOST-1 browser gate tier-1 LIVE (unit cl-l2-gate-reviseghost1-0530, started
  05:51; log lanes/2/logs/review-REVISEGHOST1-gate-l2t0530.log; 2x ~06:35, 3x ~07:20 -> 6c ladder).
- Thunderbeast: composer idle (MIXROLE-1 done); orchestrator self.
- OpenRouter: idle (advc c1 consumed).
