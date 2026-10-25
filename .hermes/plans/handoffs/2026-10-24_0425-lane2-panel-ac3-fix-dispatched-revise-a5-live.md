# LANE 2 HANDOFF — l2t0310 (2026-10-24T04:25 EDT) — PANEL gate-5 tier-2 VALID verdict (AC3 fix dispatched), REVISE-GHOST-1 attempt-5 LIVE, env defects found+fixed

Trunk: 5005e4e9 (docs tip; code tip 2b51a472 — NO merges this tick). Stack UP
:3093/:5193 = 200; served candidate confirmed (AiTabPanel + ChainProposalCard
modules fetched live from :5193). Brad's stack untouched. Two workers live at
exit (coder fix-1 queued on fleet FIFO; tier-1 browser gate a5). Queue: no
ready todo item (ROLE-AXES-1 / CFG-UNION-1 remain Brad-approval-blocked, md5
unchanged, NOT re-asked).

## RECONCILE (start of tick ~03:12)
- PANEL gate-3 (l2t0230 unit) had EXITED 03:0x with rc=0 but a two-line log
  ("Protocol tab stuck loading") and NO trail/receipts -> invalid submission,
  superseded by this tick's diagnosis below. No other worker alive fleet-wide;
  fleet coder lock free (flock -n proved).

## WORK THIS TICK
1. PANEL gate 1-4 FAILURE CLASS ROOT-CAUSED first-hand (orch Playwright probes
   probe-protocol-tab/deck-l2t0310.mjs):
   - The clarification surface MOUNTS at /deck/EVG-a5-fixture-method/RUN-2026-
     09-19-run-vwr8 (pl-protocol-text + pl-localize-btn present, zero console
     errors). The run-page 'Protocol' NAV TAB hangs 'Loading protocols…'
     because GET /api/protocols/<runId>/steps 400s NOT_A_PROTOCOL on a run id —
     pre-existing NON-PANEL defect, follow-up candidate, never a gate criterion.
     All prior gate attempts died on that wrong navigation.
   - ENV DEFECT: app playwright 1.59.1 wants headless-shell build 1217 (NOT
     installed; `npx playwright install` pulls an ubuntu24.04 fallback that
     doesn't produce it). Working idiom = executablePath
     chromium-1248/chrome-linux64/chrome, script run inside the app dir.
     Pinned into every gate prompt from gate-4 on.
2. GATE-4 (tier-1, deck route + exec pin) exited 03:51 INVALID: VERDICT fix
   with NO trail.json and the cited screenshot nonexistent; its 'surface
   absent' claim contradicts the orch probe. Rule 6c ladder -> GATE-5 TIER-2
   (cloud OpenRouter deepseek-v4.1-flash) with receipts mandate + stale-draft
   discard instruction. GATE-5 RENDERED A VALID VERDICT: fix 04:10 with real
   receipts (trail 49 lines, 8 shots, held-422 captures, network.jsonl):
   AC1 PASS / AC2 PASS / AC4 PASS / AC3 FAIL [HIGH] — vendor disclosure never
   renders: vendor-product candidate degraded to 'Unspecified level' because
   server resolver KIND_LEVEL omits vendor-product (orch-verified first-hand:
   providers/records.ts:25-31; grep level:'vendor-product' = tests only).
   AC1/2/4 evidence BANKED in receipts/MATRES-PANEL/2026-10-24_0405-gate5-tier2/.
3. FIX RUN 1 DISPATCHED 04:21 (server resolver-home amendment per spec OQ-3;
   ONE mapping line + RED-first provider test; formulation-level observation
   explicitly out of scope): worktree wt/MATRES-PANEL-fix1-lane2-l2t0310,
   branch cl/lane2-matres-panel-fix1-l2t0310 (node_modules symlinked — the NFS
   worktree add exceeded 300s twice; run in background + symlink, WORKTREE_READY
   marker in logs/worktree-fix1-l2t0310.log). Queue unit cl-l2-matrespanel-
   fix1-0310 holds the fleet flock until coder exit; log logs/coder-MATRESPANEL-
   fix1-l2t0310.log; report deliverables/MATRES-PANEL-fix1-report.l2t0310.md.
4. REVISE-GHOST-1 attempt-5 gate LIVE 04:22 (vision slot free at that moment):
   tier-1, prompt prompts/gate-REVISEGHOST1-a5-l2t0310.txt (run-page chat
   entry, exec pin, F1-reachability premise post ANSWER-FOLD-NULL-1 merge,
   ruling-(b) hold sub-assert form, gate-5 receipts mandate).

## NEXT TICK (priority order)
1. FIX RUN 1 exit -> ADVC CYCLE-2 gate (scope = fix commit only; report
   reviews/MATRES-PANEL-advc2-l2t<tick>.md; cloud OpenRouter). On ACCEPT:
   self-verify (provider test + src/resolve suite set-diff vs trunk + tsc
   server) -> merge -> restart stack (server code change; tsx watch reloads
   .ts, but restart anyway per YAML-discipline habit only if YAML touched —
   fix-1 touches none) -> RE-GATE AC3 ONLY at TIER-2 (gate-5 prompt, receipts
   dir suffix -ac3-regate); AC1/2/4 need not re-run unless the diff can touch
   them (it can't: server mapping + test only). Done = AC3 accept + banked
   AC1/2/4 + advc accept + orch verify.
2. REVISE-GHOST-1 a5 verdict read (receipts/REVISE-GHOST-1/*-a5/): accept ->
   item done + obligation closes; fix -> defect list back to owning coder
   (branch cl/lane2-revise-ghost-1-l2t2050 worktree, fleet FIFO); invalid/
   no-receipts -> tier ladder (tier-2 openrouter, same prompt). 2x-escalation
   due ~05:15; expected done ~04:50-05:10.
3. CHAIN gate-1 (prompt staged prompts/gate-MATRESCHAIN-g1-l2t0230.txt — NOW
   ALSO add the exec pin + deck/run entry notes from l2t0310 before dispatch)
   queues third in vision FIFO.
4. MIXFRAC-1 gate obligations from handoff l2t0855 — carry unchanged.
5. Follow-up candidates for Brad's next campaign card (do NOT invent tasks):
   (a) run-page Protocol nav tab /api/protocols/<runId>/steps 400 NOT_A_PROTOCOL
   hang; (b) resolver material-spec->Concept canonicalization (formulation
   candidates never render in a Formulation group); (c) R2 role-gap card
   prompt-text rider.

## Open obligations (carried)
- PANEL browser gate: OPEN — AC3 fix cycle live (AC1/2/4 banked, gate-5).
- CHAIN browser gate: OPEN (prompt staged, needs exec-pin add + slot).
- REVISE-GHOST-1 browser-gate attempt 5: OPEN (live this tick).
- MIXFRAC-1 gate obligations: carry unchanged.

## assumptions:
- AS-PANEL-GATE4-DECK-ROUTE [NEW, debt FALSE after gate-5 read] — surface
  mounts at deck route; run-page Protocol nav-tab hang = pre-existing non-panel
  defect. Confirmed by gate-5 riding exactly that route with real receipts.
- AS-LANE2-PLAYWRIGHT-EXEC-PIN [NEW, debt FALSE] — exec-pin chromium-1248 +
  run from app dir is THE working idiom; bare launch() dies (build 1217 absent).
- AS-PANEL-GATE5-DRIVE-RECON [NEW, debt FALSE] — deck hold/answer drive is the
  valid opener; slots==server-held facts (2/3/3) per counter-recon ruling.
- AS-PANEL-AC3-RESOLVER-HOME-FIX [NEW, debt FALSE] — AC3 fix = resolver
  KIND_LEVEL vendor-product mapping per OQ-3; client untouched.
- AS-PANEL-SPEC-LEVEL-FORMULATION-OBS [NEW, debt FALSE] — material-spec->
  Concept observation logged for ELIG home, not scored.
- AS-APP-TSC-BASELINE-28 carried; AS-LANE2-CHAIN-CARD-LOCATION carried;
  AS-PANEL-GATE2-ROOTCAUSE-ASK-PROTOCOL carried (superseded-in-part by
  GATE5-DRIVE-RECON: axes[] is expected; the deck axes flow is the opener).
- CARRIED as applicable: AS-LANE2-PANEL-TSC-DIFF-PROVISIONING,
  AS-LANE2-PANEL-GATE-NEWRUN-ON-FIX, AS-LANE2-CHAIN-DEFECTS-ORCH-VERIFIED,
  AS-LANE2-CHAIN-OQ2-CORRECTION, AS-ANSWERFOLD-FIXTURE-FRACTIONS,
  AS-LANE2-FULFIL-CWD-CONVENTION, AS-LANE2-FIX2-FIFO-ORDER,
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY,
  AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY, AS-PROTOAI13-MENU-DRIFT-NEW-PREREG.

## live-worker checkpoint at exit (~04:25 EDT; ~75 min wall)
- CODER FIX-1 QUEUED (not yet lock-holder at 04:23 — flock waiting): systemd
  cl-l2-matrespanel-fix1-0310; do NOT dispatch another coder while the queue
  unit lives (fleet-single rule holds through the flock wait). Coder expected
  ~40-90 min after lock acquisition (worktree may still have been copying at
  dispatch — logs/worktree-fix1-l2t0310.log WORKTREE_READY gates it).
- BROWSER GATE LIVE: cl-l2-gate-reviseghost1-a5-l2t0310 (tier-1, started
  04:22; expected ~04:50-05:10; 2x ~05:15; 3x ~06:00 -> tier ladder).
- Trunk HEAD 5005e4e9 (code tip 2b51a472); stack UP :3093/:5193 = 200.
- No Brad stack touched; no model services touched.

## CHECKPOINT AMENDMENT (same tick, 04:27): the queue unit's .git-presence gate
passed while the NFS checkout was still at ~41% (git writes the .git pointer
before Updating files) — coder dispatch raced the copy. Mitigation: the coder
orients ~15-30 min first and the copy completes in the background
(log: logs/worktree-fix1-l2t0310.log; WORKTREE_READY marker appended after
symlinks). NEXT TICK: before accepting fix-1 output, verify
`ls $W/server/src | wc -l` is full-tree sized and the fix diff touches ONLY
the provider file + test; a partial-tree artifact = invalidate, re-dispatch on
a verified tree (do not merge a diff cut against an incomplete checkout).
