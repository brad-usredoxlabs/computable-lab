# Handoff — lane 2 · 2026-11-02T00:50 EDT (l2t0015 — PICKER-1 resume DONE b2a17eed → advc c1 VERDICT: FIX (9 defects) → fix-run-1 LIVE; TARGET-1 spec RATIFIED + promoted)

## Reconcile (all first-hand; digest cl-reconcile.sh 2 @ 2026-11-02T00:17)
- Trunk 504d22bb; stack :3093 http=200, :5193 http=200. exa tripwire OK (present and consistent
  across lane1 / lane2 / canonical). Queue lock FREE, lane not paused.
- Task counts: todo 5 / in-progress 3 (L2-LABSTATE-CONTENTS-1, L2-WELLSET-TOKEN-EMIT-1,
  L2-CLARIFY-PICKER-1) / done 128. No live workers at open; all four semaphore slots FREE (every
  pidfile holder DEAD). AS-FLEETSLOT-PIDFILE-STALE reconfirmed (flock is truth).
- Newest handoff read first-hand: 2026-11-01_2345 (GHOST-1 done; PICKER-1 resume live; CARD-1
  spec ratified).

## PICKER-1 — resume run DONE, advc c1 FIX, fix-run-1 dispatched (slot-0)
- Resume run (unit cl-l2-coder-picker1-resume-l2t2310) finished: log carries the DONE marker
  `L2-CLARIFY-PICKER-1 DONE b2a17eed7718e499712d8d9becfa6f5662cea0dc`, CODER_EXITED rc=0
  2026-11-02T00:08:52. Launcher 1046517 + child 1046521 confirmed dead.
- Worktree wt/L2-CLARIFY-PICKER-1-lane2-l2t2110 clean at HEAD b2a17eed. Branch delta
  trunk...HEAD = 21 files, +1859/-234 (app + server + one registry YAML). Resume report
  deliverables/L2-CLARIFY-PICKER-1-report.resume-l2t2310.md (7665 B, 00:08).
- ADVERSARIAL REVIEW cycle-1 (unit cl-l2-advc-picker1-c1-l2t0015, EXITED rc=0 00:28:40):
  VERDICT **fix**. Reviewer ran the full gate set itself — slashMenu 8/81 PASS, 7-file picker set
  7/72 PASS, broad 43/357 PASS, server 10/78 PASS, app tsc 11 (none touched), server tsc 25 (none
  touched), grep-clean MATERIAL_CATEGORY_RANK, wire diff empty. Report
  reviews/L2-CLARIFY-PICKER-1-advc-c1-l2t0015.md. Classified PRODUCT BEHAVIOUR → coder fix run,
  not paperwork-fixer. 9 defects:
  - BLOCKER: clarifyPickerRanking.ts:200-202 hardcodes the composition never-default rule in TS;
    the registry `can_be_default` flag is decorative there — probe-proven.
  - MEDIUM (4): hardcoded `?? 0` fallback rank inverting the deleted `?? 10` (:192);
    consequence kind-words (material)/(material-spec) vs spec (concept)/formulation (:147-151);
    W5 wiki-markup STILL renders in the user bubble ChatLog.tsx:316 (SSR probe
    HAS_WIKI_MARKUP:true; the test is scoped past it); consequence test passes literals while the
    generator is untested (SlashSuggestionList.picker1.test.tsx:46-47).
  - LOW (4): dead firstDefaultFocusIndex (:276); self-comparing test
    clarifyPickerRanking.test.ts:193-200; consequence chrome leaks to doc-editor /m + pre-dedupe
    contains count (resolvers.ts:832); portal re-measure on own scroll
    (ClarificationPicker.tsx:479-491).
- CODER FIX RUN 1: unit cl-l2-coder-picker1-fix1-l2t0015; launcher 1200567 took slot-0 00:34:49
  (pidfile CLARIFYPICKER1-FIX1-1200567-2026-11-02T00:34:49), hermes child 1200575, prompt-carry
  verified in ps cmdline. Log logs/coder-CLARIFYPICKER1-fix1-l2t0015.log, prompt
  prompts/coder-CLARIFYPICKER1-fix1-l2t0015.txt, SAME worktree/branch; report target
  deliverables/L2-CLARIFY-PICKER-1-report.resume-l2t2310.md with a `## FIX RUN 1` section, marker
  `L2-CLARIFY-PICKER-1 FIX1 DONE <sha>`. Stagger honored (prior coder exited 00:08, 26 min prior;
  the other slot's pidfile stale-dead).
- ORCH RULINGS embedded in the fix prompt: D1 data-flag-only enforcement, TS backstop REMOVED
  (spec :103-104 + bait-4); D2 undeclared family = NO rank, declared convention last + YAML
  comment; D4 user-bubble mention-token formatting, wire sites stay zero-diff, ChatLog test
  asserts /[[material:/ empty on rendered output; D8 picker-only consequence flag + post-dedupe
  count.
- State at close: LIVE at budget expiry — NOT killed. Observed by marker / launcher liveness, not
  by re-dispatch.

## TARGET-1 — spec composed, audited, RATIFIED, promoted
- SPEC-COMPOSER (unit cl-l2-speccomp-target1-l2t0015) EXITED rc=0 00:37:44. Draft 37975 B at
  specs-draft/2026-11-02_0030-L2-CLARIFY-TARGET-1-spec-DRAFT.l2t0015.md ending DRAFT COMPLETE.
- AUDIT (first-hand at 504d22bb): frozen `volumeUl: 100` example sites spot-verified —
  submitSuggestionTool.ts:645 plus shorthandChat.ts:1345/:1378 (grep); NO compiler volume default
  (no `?? 100`, no DEFAULT_VOLUME); ChatPreviewCard.tsx:112/:114/:167 is the P7 surface
  (Drop/Include verbs). FINDING: the invented 100 is model-copied from the frozen prompt example,
  not a TS default.
- OQ RULES appended (appendix md5 456d8dcd8d978d6b4811b81f4fa27572): OQ1 APPROVED data-driven
  contractBlock delta (hand-edited prompt strings stay frozen; report must show before/after
  line); OQ2 provenance exemption at the CARD-1 seam riding answeredSlots, one-hunk-only else
  BLOCKED; OQ3 transcript mention-token route for P7 ids, additive resolvedMaterialRefs only on
  gate evidence.
- PROMOTED to .hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md, committed on trunk
  a410e106.
- Dispatch gate recorded: TARGET-1 coder base >= CARD-1 merge (queue order PICKER → CARD →
  TARGET → REGATE).

## Task-list writes (under queue lock)
- PICKER-1 status: resume DONE → advc c1 FIX + fix-run-1 live (ownership recorded: launcher
  1200567 / child 1200575 / worktree / branch).
- CARD-1 status: TARGET-1 composer live note (earlier edit); dispatch gate stays PICKER-1-merge.
- TARGET-1: spec path linked; status note = SPEC RATIFIED with OQ rules + dispatch gate base >=
  CARD-1 merge.
- assumptions.md: 3 new entries appended (AS-TARGET1-OQ1-CONTRACTBLOCK-DATA-DELTA,
  AS-TARGET1-OQ3-NO-ID-UNTIL-MATCHED, AS-PICKER1-D1-NO-TS-BACKSTOP).

## Cards / queue state
- Card sweep, no brad-answer content ANYWHERE (only empty `<brad-answer></brad-answer>` tags in
  LABSTATE-CONTENTS1-tokendata-fixrun2-brad-card.md and L2-CHAT-UI-1-LEG-G-approval-card.md).
  md5s: LABSTATE-CONTENTS1-tokendata-fixrun2 = 74692e8b (unchanged), LABSTATE-CONTENTS1-fixrun2 =
  20883e19, LABSTATE-FIXRUN3-boundary = 8fdc840f, WELLSET-RESOLVER-1 = 4ce9b89d, LEG-G =
  b13139b7 (unchanged). Nothing consumed; nothing re-asked.
- Blocked-on-human, unchanged, not re-asked: LABSTATE-CONTENTS-1 (74692e8b), WELLSET-TOKEN-EMIT-1
  (cf7ea14e tokensite question file), LEG-G (b13139b7).
- Queue order: PICKER-1 fix → advc c2 → ACCEPT → orch self-verify → merge --no-ff → stack RESTART
  (registry YAML changed!) → browser gate ROUND-TRIP → done → CARD-1 dispatch due-gate (spec
  promoted, coder base >= PICKER-1 merge) → TARGET-1 behind CARD-1.

## Corpus loop
- corpus-state.md unchanged: prompt-1 BUILDING (GHOST-1 merged+gated; PICKER-1 in fix cycle;
  REGATE-1 needs both merged). prompts 2-8 LOCKED. No state-machine move this tick — no recon
  landed, no re-gate due (PICKER-1 not merged).

## assumptions (open evidence debt carried forward)
- AS-PICKER1-D1-NO-TS-BACKSTOP (RULED this tick, carried): the composition never-default rule
  enforces ONLY via the registry `can_be_default` flag; no TS backstop. A catalog-label
  comma-misclassification of a plain reagent as composition is an architect call, not a coder
  fix — it is the BLOCKER's counterpart and fix-run-1 must remove the TS backstop, not widen it.
- AS-TARGET1-OQ1-CONTRACTBLOCK-DATA-DELTA: data-driven contractBlock delta approved; any diff at a
  hand-edited prompt-string site is a defect. Report must show the exact before/after contract
  line. Evidence debt OPEN until that report line exists.
- AS-TARGET1-OQ3-NO-ID-UNTIL-MATCHED: P7 rows render a record id ONLY from the transcript mention
  token; no-id rows are honest. A missing id on a legitimately-answered row is a SEPARATE reviewed
  hunk (resolvedMaterialRefs), not silent scope growth.
- AS-TARGET1-VOLUME-100-PROMPT-EXAMPLE-ORIGIN (NEW): the invented `volume: 100` has no TS default;
  it is model-copied from the byte-frozen prompt example. Fixing it must not edit those three
  string sites. Evidence debt OPEN — the browser evidence for the assumed-volume chip rides it.
- AS-TARGET1-SPEC-PINS-PREMERGE-TIP (NEW): the promoted spec's app line numbers are the pre-merge
  shape at 504d22bb (PICKER-1 b2a17eed and CARD-1 unmerged); every cite must be re-verified by
  the coder at its own base tip and the re-verified numbers recorded in its report.
- AS-PICKER1-FIX1-LIVE-AT-BUDGET (NEW): fix-run-1 is live at budget expiry and was NOT killed; the
  next tick adopts and observes it (marker / launcher liveness), never re-dispatches over it.
- AS-PICKER1-RESUME-ADOPTED-UNCOMMITTED still OPEN: the resume run's STEP-0 checkpoint carries the
  dead run-1 session's uncommitted diff; the reviewable unit is trunk...HEAD as one delta
  (21 files this tick). Advc c1 reviewed the branch, but this handoff does not establish that its
  defect sweep was author-blind — carry the delta-review obligation into c2/self-verify.
- AS-GHOST1-ACCEPT-NO-LABWAREID-STAMP unchanged (accepted event persists without
  details.labwareId; projection rides the computeLabwareStates single-placed-vessel fallback,
  gate-proven; a multi-offer deck showing this shape is a new defect, not a GHOST-1 regression).
- AS-PICKER1-OQ2-LAYER-VOCAB-READ unchanged (architect touch flag stands).
- AS-FLEETSLOT-PIDFILE-STALE reconfirmed again at open (all four holders dead; flocks FREE).
- AS-B9B998CD-TRUNK-DIRECTFIX, AS-INTENTID-CMDLINE-PROMPT-CHECK-FIELD,
  AS-FIX4-STAGGER-VIA-AGE-NOT-EXIT, AS-PROMPT1GHOST-SPEC-NOPATH-STAMP unchanged.
- AS-COMPOSER-DRAFT-NOT-VERIFIED: partially cleared — the load-bearing pins were spot-verified
  first-hand this tick (volume-100 example sites, no compiler volume default, P7 surface); the
  record does not establish a full cite-by-cite re-read of the draft. Carry as a screening-tier
  caveat, not an open debt, subject to the orchestrator's call.

## NEXT TICK (resume condition)
1. Poll logs/coder-CLARIFYPICKER1-fix1-l2t0015.log for `L2-CLARIFY-PICKER-1 FIX1 DONE <40sha>` or
   BLOCKED. Reconcile by marker + launcher PID 1200567 liveness + flock; do NOT re-dispatch while
   1200567/1200575 are alive. On DONE: advc c2 (unique report path) → ACCEPT → orch self-verify
   (spec's vitest set + tsc zero-new + grep-clean MATERIAL_CATEGORY_RANK) → merge --no-ff →
   RESTART (registry YAML changed!) → browser gate ROUND-TRIP per spec → done.
2. CARD-1: spec promoted; when PICKER-1 merges, dispatch coder base >= that merge; hold the coder
   to ONE AgentOrchestrator hunk (OQ3) and stop→BLOCKED beyond it.
3. TARGET-1: spec promoted at .hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md; coder
   base >= CARD-1 merge; coder re-verifies every cite at its own tip.
4. Cards md5 sweep (74692e8b / cf7ea14e / b13139b7); consume any real brad-answer text.
5. Health-check backend + exa tripwire each tick. REGATE-1 stays todo until GHOST-1 AND PICKER-1
   are merged (GHOST-1 met).
