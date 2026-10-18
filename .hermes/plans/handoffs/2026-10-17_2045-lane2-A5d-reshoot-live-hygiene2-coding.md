# LANE 2 HANDOFF — l2t1935 (2026-10-17T20:45 EDT)

Trunk: cl/integration-2 @ b6eddd7d (tip = docs commit; code tip 7ed172e2, bead_beat
merged). Stack :3093/:5193 healthy, profile qwen3.8-thunderbeast ACTIVE (verified
20:12 EDT). Fleet coder lock HELD by lane-2 HYGIENE-2 (pidfile
/home/brad/.hermes/cl/appliance2-coder.pid: flock shell 497863 + coder 497864).

## What happened this tick
- ADOPTED the architect decision: decisions/W28-A5g-postmerge-caution-fired-decision.md
  landed 19:53 (ARCHITECT DONE, pid exited). VERDICT (a): the 422 unknown-noun bar on
  lysis-reagent is CORRECT BY DESIGN (resolveNounsPass.ts:326-343 + SPINE-4 atomic
  bar, all cited first-hand by the architect). (b) informational-tier and (c)
  fixture-amendment REJECTED on code grounds. Re-shoot must ANSWER via the shipped
  mint affordance with the decision's Q2 cycle (8-cycle cap, per-cycle log, strict-
  shrink rule, free-form hedges = draw-dependent hedging covered by MAX_REDRAW,
  fabrication/fixture edits forbidden).
- DISPATCHED the A5d TIER-2 re-shoot gate: cl-browser-reviewer profile,
  -m deepseek/deepseek-v4.1-flash (openrouter), bash 453645 / hermes 453734, log
  lanes/2/logs/review-W28A5d-l2t1935-tier2.log, prompt prompts/
  review-W28A5d-l2t1935-tier2-reshoot.txt (decision Q2 encoded verbatim-bonded),
  receipts receipts/W2-8-SAID-MEANT-SURFACE/2026-10-17_2020-a5d-tier2-reshoot/.
  Live at checkpoint (9 min in; fixtures/ + shots/ + trail.json already growing =
  forward motion). Expected ~30-45 min; 7b: 2x=~21:10, 3x=~22:00. DO NOT
  re-dispatch while 453734 alive.
- COMPOSER HYGIENE-2 finished (~20:32, exit path: state.db last activity 96 msgs/59
  calls; draft COMPOSER DONE). Orch verified FIRST-HAND at b6eddd7d: :60 bullet and
  :321 records-clause are the exact OLD strings; file-wide event_graph grep matches
  the spec's out-of-scope map; only workstateComposeRules.test.ts pins the anchor.
  OQs adjudicated (OQ-1 residue accepted, no new task; OQ-2 accepted low-risk;
  OQ-3 canonical baseline = delta-0 at coder's own base, composer measured 0 at
  b6eddd7d). SPEC PROMOTED .hermes/plans/2026-10-17_HYGIENE-2-surface-neutral-
  instruction-spec.md (PROMOTION NOTE appended).
- CODER HYGIENE-2 DISPATCHED under the fleet lock (acquired ~20:38): worktree
  wt/HYGIENE-2-lane2-l2t1935 branch cl/HYGIENE-2-lane2-l2t1935 off b6eddd7d
  (bootstrap: worktree add survived NFS, symlinks node_modules/server-node_modules/
  server-schema/cl-lane-stack.sh replicated, core.fileMode=false set, clean status,
  HEAD b6eddd7d). hermes pid 497864, log lanes/2/logs/coder-HYGIENE2-l2t1935.log,
  report .hermes/plans/HYGIENE-2-report.wip-l2t1935.md in the worktree, prompt
  prompts/coder-HYGIENE2-l2t1935.txt. Expected 30-60 min (tiny text change;
  suite-dominated); 7b: 2x=~21:50, 3x=~23:00. Server-only item: NO browser gate.
- UCX-2 recon scout DONE: tmp-orch/scout-ucx2-recon-l2t1935.md (routes table,
  OpenTabsContext API + 30+ consumers, no URL<->tab state today, openSurface/
  surfaceRoute sites). Orch spot-check REFUTED one claim: scout said RecordHostPage
  does NOT use OpenTabs — it DOES (RecordHostPage.tsx:15,31,80: navigateActiveTab
  registers record-edit tabs, "deep-link restore Phase 4.3"). The task-list's
  "Wave-3 /record/:id tab-opening precedent" is real and lives there. UCX-2 spec
  must cite RecordHostPage.tsx:76-90 as the precedent, not the scout's (4).

## Workers live at handoff
- cl-browser-reviewer gate: bash 453645 / hermes 453734 (see above; cloud tier, no
  local slot contention).
- cl-coder HYGIENE-2: pid 497864 under flock shell 497863 (fleet lock HELD; the
  flock wrapper releases the lock and logs LOCK RELEASED to appliance2-coder.log
  when the coder exits).

## NEXT TICK
1. Gate report receipts/W2-8-SAID-MEANT-SURFACE/2026-10-17_2020-a5d-tier2-reshoot/
   REPORT.md: accept -> promote report, close W2-8-A5g (mark done) + the W2-8 A5
   accept-leg obligation, handoff; fix -> defect list back per SOP (no coder needed
   for gate-side mint issues — defects in the answer-card UX route to a coder run);
   BLOCKED -> rule 6c ladder/suspect-harness per SOP. Verify receipts first-hand
   (md5s.txt, >=2 shots viewed, trail cycle log matches decision Q2 shape).
2. On 'HYGIENE2 DONE <sha>' in the coder log: adversarial gate FIRST
   (reviews/advc-HYGIENE2-c1-l2t<t>.md, OpenRouter deepseek-v4.1-flash; give it the
   spec's reviewer-bait section) -> orch self-verify (targeted 9-file suite, quote
   promptBudget line 47134/46/47180, server suite tail, tsc delta-0, zero app/
   paths) -> merge --no-ff into trunk -> NO restart needed (TS-only, no YAML) ->
   mark done + handoff. Coder exit releases the fleet lock; do not re-dispatch
   while 497864 alive.
3. Then MINT-FLOOR-UI-1 next (fleet lock free): answer the mint-floor OQ INSIDE its
   spec (decision options A/B in THREAD-ASK-1 spec §OPEN QUESTION — Option A is the
   shipped status quo; a ruling to B is a domain-policy change that needs Brad, so
   the spec-composer brief must say: default ruling = keep material-only floor
   (status quo = the answer), and the deliverable is the picker de-dup; cite repro-A
   evidence tmp-orch/repro-a-A5g-postmerge-l2t1835.txt (duplicate mint rows API-side)
   and the decision artifact §fact 6). Duplicate-row mechanics: RefPicker.tsx:116-120/
   389 (single pinned mintCandidate) vs the clarification '/m' menu (slashMenu/
   resolvers.ts:63-83 tier-5 mint row keyed mint:<q>) — the duplication observed is
   in the clarification picker path; composer must locate the exact merge site.
4. Then UCX-1 (multi-select toolbar; composer brief: SequenceResults.tsx is analysis
   output, NOT the record list; the library list is SequencesPage.tsx:134 navPane;
   the existing batch machinery is the Analysis-tab collection checkbox set :103;
   selection must cooperate with applyAgentAction), then UCX-2 (scout recon above,
   with the RecordHostPage correction).
5. PROTO-AI-13 recount: last n=317/500 FLAT; recount from
   /home/brad/.computable-lab-lane2/shadow-router/events.jsonl (INSUFFICIENT-side,
   no action).

## Blockers / open obligations
- W2-8-A5g: in-progress, gated on the live tier-2 re-shoot VERDICT (pinned at
  7ed172e2). W2-8 parent A5 obligation closes only on that accept. Criteria
  UNCHANGED.
- HYGIENE-2: in coder; merge track obligations above are an explicit open debt.
- W2-11: QUEUED FOR BRAD (gate-14 stall clause) — unchanged, not re-asked.
- PROTO-AI-13: INSUFFICIENT-side.
- microcentrifuge-tube ambiguous-noun sub-investigation: fold into post-A5 triage
  (unchanged).
- EVIDENCE DEBT: none open. Reviewer NOTE F3 (temperatureC/duration not read by
  beadBeatExpander, spec-prescribed copy) — latent smell, follow-on only if a
  bead-beat parameters clarification ever needs machine consumption.

## assumptions:
- AS-LANE2-A5G-LOWERS-AS-MIX (carried, unchanged): bead_beat lowers to event_type
  'mix'; merged, advc accepted.
- AS-LANE2-REPROA-CAUTION-NAMED-FACT (carried, CLOSED this tick): the CAUTION's
  named facts were routed; architect decision (a) discharges it — the named facts
  are: lysis-reagent bars deterministically and must be MINT-ANSWERED; the two
  free-form hedges bar only when drawn (architect fact 5) and are covered by
  MAX_REDRAW, never by fabrication.
- AS-LANE2-HYGIENE2-BASELINE-DELTA0 (this tick, orch): canonical typecheck rule for
  HYGIENE-2 = delta-0 against the coder's own base (composer measured tsc --noEmit
  = 0 at b6eddd7d); the '21 lines' figure in older notes is the APP tsc surface,
  not server — adjudicated, recorded in the spec's PROMOTION NOTE.
- AS-LANE2-SCOUT-UCX2-REFUTED-ONE-CLAIM (this tick, orch): scout claim (4) 'no
  /record/:id tab-opening precedent' is FALSE — RecordHostPage.tsx:15/31/80 uses
  useOptionalOpenTabs().navigateActiveTab for deep-link tab registration (verified
  first-hand). UCX-2 spec must use the corrected precedent.
- AS-LANE2-MINTFLOOR-OQ-DEFAULT-A (this tick, orch, pre-emptive for MINT-FLOOR-UI-1
  spec composition only): the mint-floor OQ stays a Brad domain-policy call;
  composing MINT-FLOOR-UI-1 does NOT presume Option B — the picker de-dup ships
  under the status-quo floor. No product-behavior change is assumed.
