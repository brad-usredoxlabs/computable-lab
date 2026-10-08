# HANDOFF - lane 2 - 2026-10-08T19:55 EDT (orch tick l2t1930, ~19:30-19:55)

Trunk code tip 0873c47b (docs tip 6c0ce1c2). Stack :3093/:5193 both 200. SPINE-4 coder exited
code=0; adversarial gate ran and returned FIX; fix-cycle-1 worker now LIVE on the fleet lock.

## WHAT THIS TICK DID

1. RECONCILED: SPINE-4 coder bash 3324671 + hermes 3324730 CONFIRMED GONE; log ended
   "SPINE-4 DONE / EXITED code=0" (~19:16, ran ~113 min, within expectation). 3 commits on
   branch spine-4-lane2-l2t1710 (68bec003 RED tests / 20fab6da feat / 178077a3 report),
   worktree clean, base 0873c47b = ancestor of HEAD (three-dot diff clean). Fleet coder lock
   released, re-acquired for the fix run (pid file records SPINE-4-fix1).
2. ADVERSARIAL GATE DISPATCHED + COMPLETED (~7 min): prompt prompts/advreview-SPINE-4-l2t1830.txt
   (pre-staged last tick), log logs/adv-SPINE-4-l2t1830.log, report
   reviews/review-SPINE-4-adversarial-l2t1830.md. VERDICT: fix — 1 blocker + 3 minors:
   - D1 [blocker]: production never injects a store-backed spine — compileScientistIntent.ts:137
     `spine: deps.spine ?? createResolveSpine({})` + call sites IntentCompileHandlers.ts:78 and
     intentCompile.ts:346 (via IntentCompileFromPromptHandlers.ts:163-169) pass no spine ->
     provider-less floor (localOnly spine: no tier 0/1 providers; OLS4 filtered by
     adapters.ts:79-84) FALSE-BARS every non-hintEligible resolvable noun (e.g. seed.material /
     add_material.material — vocabulary.yaml:23-24 domain material, NO hintEligible) ->
     needs-clarification + zero artifacts on terms that live in the record store. Live-path
     regression + the spec's forbidden degraded no-resolution mode.
     ORCH VERIFIED FIRST-HAND (read :137 + both call sites + vocabulary lines + server.ts:733
     canonical composition). Reviewer reproduced both directions with /tmp/spine4-probe.mts
     (route-like deps -> needs-clarification 'DMEM' unknown-noun; store-backed spine -> complete).
   - D2 [minor] = ownership-gate sign-off item. ORCH SIGN-OFF GIVEN this tick for the 3 disclosed
     files: CompileContracts.ts (OQ1a names it as THE union site), runChatbotCompile.ts (+6 type
     annotation, tsc-SET-identity necessity, probe-proven in coder report), ProtocolIntentLowering
     Characterization.test.ts (bar forces the compile leg; §7's "0 failed" mandates it).
   - D3 [minor]: MERGE arm at resolveNounsPass.ts:166-174 drops model candidates; coder's choice
     = dedupe-append or spec-accurate label-set-equivalence doc note (note preferred; "engine
     wins verbatim" IS the spec).
   - D4 [minor]: resolve_roles seam not exercised end-to-end with a REAL engine wells binding
     (SPINE-3 engine only sets addresses in the inBand===1 branch; multi-well clarifies upstream)
     — coverage gap from SPINE-3 engine policy, no SPINE-4 code action; recorded for SPINE-6 /
     PROTO-AI-13 awareness.
3. FIX CYCLE 1 DISPATCHED 19:47 (max 2 cycles): SAME worktree wt/SPINE-4-lane2-l2t1710, branch
   spine-4-lane2-l2t1710. bash pid 3603858 (fleet lock holder). Prompt
   prompts/coder-SPINE-4-fix1-l2t1945.txt: repair direction (a) = inject a real store-backed
   spine at BOTH production call sites via the canonical createResolveSpineFromContext
   composition (server.ts:733), RED-first mirrored-probe test, no silent provider-less floor;
   §7 ownership expanded ONLY for the injection wiring, every extra file justified in the fix
   report. Log logs/coder-SPINE-4-fix1-l2t1945.log; fix report
   <wt>/.hermes/plans/SPINE-4-fix1-report.wip-l2t1945.md; end-line marker "SPINE-4 FIX1 DONE".
4. PRE-STAGED for post-merge (instant claim next tick): SPINE-5 coder prompt
   prompts/coder-SPINE-5-l2t1935.txt (worktree/branch names fixed: wt/SPINE-5-lane2-l2t1935,
   branch spine-5-lane2-l2t1935 — supersedes spec §11 naming; claim gate §1 name-and-read of the
   5 merged files, §5 first check, fresh §8 SET captures on its own base; bindings = spec's
   appended l2t1735 OQ rulings). SPINE-5 spec promotion to canonical happens at claim.
5. SHADOW CORPUS: 84 lines (unchanged; PROTO-AI-13 needs >=500, stays todo). Readiness: 0
   due/changed blockers; AI-11/AI-12 human answers unchanged since 10-06, not re-asked.

## NEXT TICK (resume plan)

1. SPINE-4 fix1 worker bash 3603858: if log coder-SPINE-4-fix1-l2t1945.log ends
   "SPINE-4 FIX1 DONE / EXITED code=" -> adversarial RE-REVIEW (cycle 1 re-review; unique path
   reviews/review-SPINE-4-adversarial2-l2tXXXX.md; prompt focused on the D1 wiring diff +
   zero-new-drift: src/ai SET 10/21 identity, tsc SET 26/6 identity, chatbot pins, RED evidence
   of the mirrored-probe test). If STILL LIVE: expected duration ~60-90 min (smaller scope than
   the main run); 2x assessment ~21:15, 3x change-approach ~22:45 per 7b. STOP-AND-REPORT line
   -> route per spec stop boundaries.
2. On adv ACCEPT: orch self-verify myself (real diff incl. any injection-wiring files vs the
   justified list; targeted vitest from <wt>/server; tsc SET identity vs
   tmp-orch/trunk-tsc-set-l2t1735.txt 26/6; src/ai SET 10/21; app diff EMPTY) -> merge --no-ff
   into cl/integration-2 -> RESTART STACK background=true (scientist-intent-compile.yaml is
   registry YAML) -> compile smoke against :3093 -> mark SPINE-4 done + handoff.
3. SPINE-4 merged -> SPINE-5 claim IMMEDIATELY: promote
   .hermes/plans/2026-10-08_1620-SPINE-5-headless-compile-route-spec-DRAFT-l2t1620.md to
   canonical, bootstrap wt/SPINE-5-lane2-l2t1935 off the merge (7-symlink bootstrap incl.
   server/schema + trunk untracked 1:1, per SPINE-1/2/4 recipe), dispatch cl-coder under
   flock -n /home/brad/.hermes/cl/appliance2-coder.lock with prompts/coder-SPINE-5-l2t1935.txt
   (log logs/coder-SPINE-5-l2t1935.log — NOTE: the prompt's report path says wip-l2t1935; keep
   log/report paths unique). Also dispatch cl-spec-composer (thunderbeast, background) for the
   next ready item while SPINE-5 codes (candidates: PB-CH-9 runbook legs are specced; SPINE-6
   spec is pre-ruled but claim-gated on SPINE-5 — nothing NEW to compose until SPINE-5 merges;
   if nothing composable, skip the composer call, save the tokens).
4. If the fleet lock is held by a lane-1 coder at SPINE-5's claim moment: SPINE-5 waits (fleet
   single coder); PB-CH-9 remains sequenced behind the SPINE chain per the 16:35 queue ruling.
5. If fix1 STOP-AND-REPORTs or cycle 2 review returns FIX again with no new evidence/improvement:
   route to architect with the two review reports + fix report as evidence pack.

## assumptions:
CARRIED OPEN (unchanged count): AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM (live);
AS-LANE2-APP-TSC-PIN-47-24 (standing); AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE;
AS-LANE2-S2-TSC-PIN-27 (standing; measured 26/6 — SET identity is the gate);
AS-LANE2-PBCH6-ANR-UISPEC-GAP (EVIDENCE DEBT — disposition owed at PB-CH-9 close);
AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS (OPEN — re-check at SPINE-5/6).
NEW THIS TICK: AS-LANE2-SPINE4-D2-OWNERSHIP-SIGNOFF — orchestrator signed off the 3 files
outside spec §7's ownership regex (CompileContracts.ts, runChatbotCompile.ts +6, ProtocolIntent
LoweringCharacterization.test.ts) on the coder's disclosed justifications (OQ1a union site; tsc
SET-identity necessity with probe proof; bar-forced golden under §7's own "0 failed" command).
Evidence: adversarial report D2 + coder report §11. If the fix-run diff adds MORE undisclosed
files -> that is a blocker, not an assumption extension.
NEW: AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE — the resolve_roles authoritative-wells seam has no
end-to-end test with a real engine binding because SPINE-3's engine only emits addresses when a
role's in-band candidate set is exactly 1; multi-well clarifies at resolve_nouns. Assumed
acceptable for SPINE-4 (not introduced by it); must be revisited at SPINE-6 goldens (a wells
happy-path golden will exercise it) — evidence debt until then.

## Baseline facts (carry forward)
- Code tip 0873c47b; server tsc SET 26/6 (tmp-orch/trunk-tsc-set-l2t1735.txt); app tsc 47-out/
  34-err; src/ai fail-set 10 files/21 tests; SPINE-4 branch adds: 12 tracked files +2425/-46
  (808 of it is the vocab-required-flip TEST FIXTURE, not shipped schema — verified via
  --name-status).
- Standing: cl-lane-stack restart BLOCKING -> background=true; git -c core.fileMode=false;
  vitest from <wt>/server; `hermes -z` logs buffer until exit (0 B is normal); NFS
  untracked-mirror noise (grep -v '^??').
- Shadow telemetry corpus: /home/brad/.computable-lab-lane2/shadow-router/events.jsonl (84/500).
- Adversarial reviewer ran FAST (~7 min, OpenRouter deepseek-v4.1-flash) — budget adv gates at
  ~10 min, not 30.

## LIVE AT CHECKPOINT (none killed)
- cl-coder SPINE-4 FIX1 bash 3603858 (fleet lock holder; dispatched 19:47; expected exit
  ~20:45-21:15). Nothing else. Thunderbeast 1/4 (orch only).

## Budget
Invoked ~19:30, checkpoint ~19:55 (~25 min). Reconciliation + gate + verified-blocker + fix
dispatch + SPINE-5 pre-stage consumed it; fix1 observability starts next tick (log will be
buffered for a while). Exit — remaining actions depend on the live fix worker.
