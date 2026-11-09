# Handoff — lane 2 · 2026-11-01T19:58 EDT (l2t1935 — GHOST-1 coder DONE->ADVC FIX(1 blocker, orch-confirmed), fix-2 staged behind stagger; CLARIFY-WEIRD CLOSED per ruling; PICKER-1 spec-composer LIVE)

## Reconcile (all first-hand)
- Trunk ebeda58c (docs tip above e6f31731); tree clean of tracked changes.
- GHOST-1 coder launcher 503330 + child 503334 EXITED; log closes with
  `L2-PROMPT1-GHOST-1 DONE 75a17dabed4ce4e447485dc68434e137cd0d4d60` + rc=0 19:33. Worktree
  wt/L2-PROMPT1-GHOST-1-lane2-l2t1810 clean at 75a17dab (RED 9ad125ee -> GREEN 75a17dab on
  e6f31731). Report has real RED (4 failed|9 passed) -> GREEN (11 files/63 tests) output,
  tsc 11==base-11 identical list, diff 10 files +442/-33 app-only zero YAML.
- Fleet slots: slot-0 lock HELD by lane-1 FAME5 (flock pid 532083, coder 551787/551791 ALIVE,
  started 19:34 — ps-confirmed twice); slot-1 flock FREE (stale FAMEONTO1 pid-file marker).
  tb-bg 0/1 flock FREE at tick start; slot-0 taken by PICKER-1 composer (see below).
- Backend :3093 health ok (199 schemas, ai available; root 404 is the URL, not a fault), :5193 200.
- Cards md5-swept: LEG-G b13139b7 UNCHANGED (brad-answer tag empty), FIXRUN3 8fdc840f UNCHANGED,
  MOUNT f65d32b6 UNCHANGED. TOKENSITE: the handoff's 74692e8b matches NEITHER current file —
  question file is cf7ea14e (mtime 2026-10-31 00:32, no brad-answer, no answer appended) and its
  companion ruling is 090d473c. Treating as unchanged/unanswered (mtime predates last sweep;
  74692e8b likely a mis-baselined digest); nothing re-asked. NEXT TICK: sweep cf7ea14e.

## Gate chain progress — L2-PROMPT1-GHOST-1 (UI item, still in-progress)
1. CODER RUN-1 DONE (above).
2. ADVC CYCLE-1 (cloud deepseek-v4.1-flash, reviews/L2-PROMPT1-GHOST-1-advc-l2t1935.md,
   log logs/advc-PROMPT1GHOST-c1-l2t1935.log): VERDICT: FIX — 1 BLOCKER:
   getWellEvents generic arm eventGraph.ts:1087 `if (details.labwareId) return details.labwareId
   === labwareId` DROPPED the wells-membership test the base had (:1003 three-liner). Explicit-ref
   events now match EVERY well of their labware in tooltip/history, disagreeing with the fill and
   breaking the strict-legacy-caller requirement. Base-vs-HEAD probe proven by reviewer; ORCH
   CONFIRMED first-hand at tip (sed 1080-1095 vs `git show e6f31731` :1003). Test gap: no
   unaffected-well case. Everything else ACCEPTED-clean (never-guess helper, one vocabulary,
   precedence pins, no hardcode, exactOptionalPropertyTypes, eventFocus:73 scope).
3. FIX RUN-2 STAGED, NOT LAUNCHED (stagger): prompt prompts/coder-PROMPT1GHOST-fix2-l2t1935.txt
   (defect verbatim + companion check on transfer/move_tube arms :1047/:1069 + red-first
   unaffected-well case + gate set), launcher
   launchers/run-coder-PROMPT1GHOST-fix2-l2t1935.sh (grabs slot-1 flock, 3-field pid file, log
   logs/coder-PROMPT1GHOST-fix2-l2t1935.log, appends report to the run-1 file, final line
   `L2-PROMPT1-GHOST-1 FIX2 DONE <sha>`). LAUNCH GATE: FAME5 (slot-0, started 19:34) dead OR
   >=60 min old (~20:34). Launch via systemd-run --user --collect as `--inner` unit.
4. After FIX2 DONE: advc cycle-2 (unique path reviews/L2-PROMPT1-GHOST-1-advc-c2-l2t<tick>.md)
   -> ACCEPT -> orch self-verify (vitest gate set + tsc on the worktree first-hand, diff review)
   -> merge --no-ff to cl/integration-2 -> stack restart only if YAML sneaks in (app-only, but
   vite serves app/ so a lane restart is cheap insurance) -> ORCH re-run scout drivers
   legB2.cjs+legC.cjs UNCHANGED vs receipts/PROMPT1-SCOUT-20261101/20261101T163744/ against
   :5193 -> BROWSER GATE (mandatory, ROUND-TRIP form: real Accept turn, request-body +
   grid-content + tooltip shots, cold reload; receipts
   receipts/L2-PROMPT1-GHOST-1/<ts>/) -> then status done + merge handoff.

## L2-CLARIFY-WEIRD-1 CLOSED (done)
Architect ruling decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md END-RULING landed 19:26
(unit cl-l2-architect-clarifyweird-l2t1915 exited). Q1 recon ACCEPTED per verified-by -> task
marked done (architect explicitly ruled "Orch: mark L2-CLARIFY-WEIRD-1 done"). Q2 amendments
MERGED into the list under queue lock: PICKER-1 gets (a) rank-policy-as-DATA on
schema/lab/material-profile.registry.yaml (hardcoded MATERIAL_CATEGORY_RANK deleted, absent
declaration => no ranking) + (b) W3 geometry must respect ChatLog.css:160-170 scroll-recovery
reason; CARD-1 gets W7 mint-label-concatenation leg (5) + W11-volume refuse-or-ask leg (6);
TARGET-1 ratified with D1 guardrail (enrich existing ChangesPanel rows, no second approval
surface); REGATE-1 deps CONFIRMED not widened (CARD/TARGET are not regate deps). Q4: probe mint
MAT-clarify-weird-probe-term-1b3i LEFT IN (Brad: all records test data; live W14 evidence).
Q3: no binding-decision conflicts; comparator reorders, never auto-answers.
PROPOSED-FOR-BRAD, NOT FILED (do not enqueue without Brad): W8 labware-mint doctrine,
W11-chrome narration paragraph (fold when chat-host next touched), deck-host tab-switch
card-loss UX.

## Dispatches this tick
- PICKER-1 spec-composer LIVE: tb-bg slot-0 (flock held, pid file PICKER1-573120-2026-11-01T19:43:19),
  systemd cl-l2-speccomp-picker1-l2t1935, log logs/speccomp-PICKER1-l2t1935.log, draft owed
  specs-draft/2026-11-01_1945-L2-CLARIFY-PICKER-1-spec-DRAFT.l2t1935.md ending `DRAFT COMPLETE`
  (~45-60 min expected; 2x ~20:43, 3x ~21:43 rule 7b). Orch reviews draft, folds amendments,
  promotes to .hermes/plans/ canonical path.
- Queue per ruling sequencing: PICKER-1 -> CARD-1 -> TARGET-1 -> REGATE-1. GHOST-1 fix-2 goes
  FIRST in the coder queue (its chain is furthest along).

## Cards / queue state
- Blocked (unchanged, no answer consumed): L2-LABSTATE-CONTENTS-1 (FIXRUN3),
  L2-WELLSET-TOKEN-EMIT-1 (TOKENSITE), L2-CHAT-UI-1-LEG-G + CHATHOST-SWEEP-1 (LEG-G),
  MOUNT-NONEVENT-1 (MOUNT). All on-change, never re-asked.
- In-progress live: L2-PROMPT1-GHOST-1 (fix-2 staged), L2-CLARIFY-PICKER-1 (spec draft in flight;
  NOT yet claimed for coding).

## assumptions (open evidence debt carried forward)
- AS-FLEETSLOT-PIDFILE-STALE reconfirmed AGAIN (slot-1 FAMEONTO1, tb-bg both stale markers; flock
  is truth). AS-B9B998CD-TRUNK-DIRECTFIX, AS-INTENTID-CMDLINE-PROMPT-CHECK-FIELD,
  AS-FIX4-STAGGER-VIA-AGE-NOT-EXIT unchanged.
- AS-PROMPT1GHOST-SPEC-NOPATH-STAMP unchanged (other-projection disagreements = new defect, not
  this item).
- NEW AS-GHOST-ADVC-BASE-COMPARISON-SCRATCH: baseline zero-new-failures established via /tmp
  scratch reverts (advc) and in-place stash/detach (coder); orch post-merge vitest+tsc re-run
  first-hand clears it (already in gate chain step 4).
- NEW observation (from advc, non-defect): deck placed-set (placements) vs grid placed-set
  (labwares map keys) could count differently if labwares holds non-placed instances —
  pre-existing, flag to architect only if the browser gate or PICKER work surfaces it.

## NEXT TICK (resume condition)
1. FAME5 slot-0 dead OR >=60 min since 19:34 (~20:34) -> launch
   launchers/run-coder-PROMPT1GHOST-fix2-l2t1935.sh via systemd-run --collect as --inner unit;
   then poll for `FIX2 DONE`/rc line in logs/coder-PROMPT1GHOST-fix2-l2t1935.log.
2. PICKER-1 draft landed -> audit cites first-hand (resolvers.ts ranks, registry
   clarification-policy block, ChatLog.css:160-170, ClarificationPicker canMint/showMintRow),
   fold into .hermes/plans/ spec, link in task block; ready to dispatch when a coder slot+stagger
   allows AND GHOST-1 fix-2 chain isn't holding both slots (two-coders-fleet-wide max).
3. GHOST-1 FIX2 marker -> advc cycle-2 -> ACCEPT -> orch verify -> merge -> driver re-run ->
   browser gate -> done + handoff.
4. Cards md5 sweep (b13139b7 / 8fdc840f / f65d32b6 / TOKENSITE question now cf7ea14e); consume
   any real brad-answer.
5. Health-check backend.log "Failed running" each tick.
