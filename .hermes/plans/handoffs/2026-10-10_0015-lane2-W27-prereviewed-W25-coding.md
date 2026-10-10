# HANDOFF - lane 2 - 2026-10-10T00:15 EDT (orch tick l2t2355, invoked ~23:50)

QUEUE STATE: W2-5 CODER LIVE (fleet-single, lock held). W2-8 composer LIVE (pre-deps).
W2-7 pre-review DONE + all 4 OQs RULED this tick. W2-3, W2-4 DONE. 0 due/changed blockers.
No Brad question pending. Thunderbeast 2/4 (orch + composer).

## 1. WORKERS LIVE AT CHECKPOINT
- W2-5 CODER: cl-coder (appliance-2). bash wrapper 2717479, bash 2717535, hermes python
  2717537 (ALIVE; state.db-wal mtime 00:11 = forward motion). Worktree wt/W2-5-lane2-l2t2310
  (branch off 78bee2c8; zero tracked edits at 00:07 check ~30 min in — baseline-capture
  phase, consistent with W2-3/W2-4 precedent). Log logs/coder-W2-5-l2t2310.log (0 B, buffers
  until exit). Final stdout line `W2-5 DONE <sha>`. Report (in worktree)
  .hermes/plans/W2-5-report.wip-l2t2310.md. Expected ~90-120 min from ~23:37 dispatch ->
  ~01:10-01:40; 2x ~02:45, 3x ~04:30 (rule 7b). Do NOT re-dispatch while 2717537 alive.
- W2-8 SPEC-COMPOSER: cl-spec-composer (thunderbeast). bash 2729455, hermes 2729513 (ALIVE;
  state.db-wal 00:11). DRAFT target .hermes/plans/
  2026-10-09_2340-W2-8-said-meant-surface-spec-DRAFT-l2t2310.md (NOT yet on disk at 00:05 —
  expected, writes at end). Ends stdout `W2-8 DRAFT DONE <lines>`. Expected ~45-60 min from
  ~23:40 -> ~00:25-00:40.

## 2. WHAT HAPPENED THIS TICK
- RECONCILED: both workers alive with live state.db evidence; no other in-progress; W2-5
  worktree clean at check (no premature commits). Stack :3093 /api/health ok (schemas:192
  lintRules:77 — pin unchanged, W2-5 activation will raise lintRules; expect +N at merge)
  and :5193 200. Note: /health 404s; the real probe is /api/health.
- PROTO-AI-13 shadow corpus re-check: STILL ABSENT (find /home/brad/.computable-lab) —
  corpus-gated, stays todo.
- W2-7 PRE-REVIEW DONE (the queued next action from l2t2310 handoff §3c), all load-bearing
  §0 cites verified FIRST-HAND at trunk 78bee2c8 (draft composed at b6f7095c, drift accepted):
  local-protocol.schema.yaml :11/:19/:88/:107-110; IntentAcceptHandlers.ts:77-82 choices
  precedent; merged local-protocol.lint.yaml R1 prov-local-choices-recorded (:38-63, nonEmpty
  only, isEmpty({}) fires); merged rung-vocabulary.yaml LOCAL_REALIZATION carrier declaration
  (:82+); ResolveBranchAxesPass BRANCH_RESOLUTION_MISSING :74; BranchResolver fail-loud
  :138-139; ProtocolCompiler branch_resolution write :710; compileScientistIntent deps.spine
  throw :140; LintEngine record-scope-only :126-128; SemanticVerbRef :669/ProtocolStep :749;
  MANIFEST pin real at server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:11 (draft's
  bare 'goldens/MANIFEST.yaml' is shorthand — noted for coder).
  OQ RULINGS (binding, pasted in the W2-7 task block): OQ1 = YES, W2-4 HARD DEP added to the
  task deps line. OQ2 = merged-W2-4 carrier verbatim, shape {axisId: value}, NO inline rung
  marker, NO third shape. OQ3 = (a) gate+labels depth; orch FIRST-HAND extra:
  createPlanDeckLayoutPass (ChatbotCompilePasses.ts:3300+) has ZERO profile refs
  (profile registry consumed only at :3001-3146 chatbot scale-plan region) -> deck pass
  ignoring the profile is EXPECTED per the draft's own bar, NOT an escalation; golden asserts
  tool/label closure, makes no deck-slot claim, zero MANIFEST touch. OQ4 = (a) upstream gate;
  chatbot 8-sample default stays, disclosed. DISCLOSURE (carried open): W2-7's run graph gets
  NO deck scale plan (derive_execution_scale_plan is chatbot-route only); wanting one later =
  amendment + MANIFEST re-bless DECISION.
- Task list under lock: W2-7 spec path linked (DRAFT, promote at W2-5+W2-6 merge), deps +=
  W2-4-PROVENANCE-LADDER, full ruling note appended. assumptions.md: AS-LANE2-W27-OQ-RULINGS
  appended.
- W2-9 orientation sniff (cheap, for the next composer brief when W2-8 draft lands):
  ProtocolReviewHostPage.tsx is 73 lines, AppShell leftPane={<VendorPdfReviewPage embedded/>},
  NO ai pane mounted (matches the task's 'verified gap' claim); AiTabPanel.tsx exists at
  app/src/event-editor/right-pane/ai/; app/src/settings/SettingsRoute.tsx is 35 lines (model
  setting likely rides ModelSwitcher/profile machinery elsewhere — composer must locate it);
  ExtractHandlers.ts has NO expectedSha today (W2-5's surface — W2-9's chat-edit locking
  binds CONFIRM-AGAINST-MERGED-TRUNK(W2-5)).

## 3. NEXT TICK (resume plan)
a. Observe logs/coder-W2-5-l2t2310.log for `W2-5 DONE <sha>` / 2717537 exit. On exit ->
   ADVERSARIAL c1 (cl-adversarial-reviewer, OpenRouter deepseek, unique report path
   reviews/review-W2-5-adversarial-l2t<tick>-c1.md). Pre-empt hunt: F-W25-1 files untouched
   (SchemaValidateDraftPass/PromotionCompileRunner/PromotionExtractionPasses), rung-strings
   absent, boot green with activated extraction-draft.lint.yaml, xdr-*/xpr-* no id collision,
   :1029+:1032 widening consistent, state-spoof arm T1(d), revisionOnEditKinds knob
   documented. ACCEPT -> orch self-verify: real diff vs 78bee2c8, targeted vitest per spec §6,
   fail-SET =={EGE,LPG}, server tsc multiset 26, MANIFEST empty, lintRules count == 77 + new
   xdr rule count. Merge --no-ff, restart stack (schema/lint YAML lands -> restart owed,
   background=true), health via /api/health, mark done. Headless -> NO browser gate.
b. On W2-8 composer exit: read DRAFT + §11 OQs, pre-review cites first-hand myself, rule OQs,
   paste in task block. Promotion gate = W2-5 + W2-6 merged. THEN commission W2-9 composer
   pre-deps using §2 orientation above + the W2-8 draft's shapes (CAMT).
c. After W2-5 merges: W2-6 PROMOTION pass (draft md5 1de8d4b2 verified unchanged 23:55; gate
   'W2-5 merge' opens; re-verify its §6 test-plan cites against post-W2-5 trunk BEFORE
   promoting; fleet coder then goes to W2-6 — W2-5 headless item may leave the slot sooner).
   W2-7 promotion needs W2-5 + W2-6 both merged (ruled).
d. PROTO-AI-13 corpus re-check each tick (absent 00:05).

## assumptions:
NEW: AS-LANE2-W27-OQ-RULINGS (live until W2-7 acceptance; rulings pasted in task block).
CARRIED OPEN (unchanged): AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM; AS-LANE2-APP-TSC-
PIN-47-24 (standing, currently 34); AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE;
AS-LANE2-S2-TSC-PIN-27; AS-LANE2-SPINE6-R1/R2; AS-LANE2-PBCH9-CROSSRUN-GATE-DISCLOSURE;
AS-LANE2-W21-COLLISION-FINDINGS-DEFERRED (F1-F6 + W2-2-F1); AS-LANE2-COMPOSER-LOG-BUFFER-
FALSE-DEATH (standing); AS-LANE2-W25/W26/W27-COMPOSED-PRE-DEPS (live); AS-LANE2-W26-OQ-
RULINGS (live until W2-6 acceptance); AS-LANE2-W25-WIDENING-SITE-CORRECTION (live until
W2-5 acceptance); AS-LANE2-W23-LEGACY-LITERAL-WRITE-FREEZE (informational); AS-LANE2-BROWSER-
REVIEWER-FABRICATED-ROUTE (standing); AS-LANE2-W24-CANDIDATE-WHEN-GUARD-ADVISORY;
AS-LANE2-W26-COMPOSER-EMPTY-PROMPT-ABORT (standing lesson). No credentials. No new
evidence-debt: every claim above is a first-hand read, ps output, git output, or quoted
worker-log/process evidence.

## Baseline facts (carry forward)
- Trunk TIP: ba3cddba (docs) over 78bee2c8 (docs) over W2-4 merge 7d301c1f over 10d06eda over
  W2-4 spec 038bcefc over W2-3 merge 2e672c1b.
- Pins: server tsc 26 /tmp/l2t2230-tsc-server.txt (multiset, strip coords); app tsc 34
  /tmp/l2t2230-tsc-app.txt; fail-file SET {EventGraphEquipmentSchema.test.ts,
  LabwarePhysicalGeometryData.test.ts}; goldens expect 15; MANIFEST sha 014ca71f...; health
  schemas:192 lintRules:77 (WILL move at W2-5 merge — expected increase == new xdr rule
  count). Health probe = /api/health (root /health 404s).
- NFS: git worktree add minutes-slow (background); cl-lane-stack.sh 2 restart BLOCKING ->
  background; hermes -z logs buffer until exit; git -c core.fileMode=false always.
- pgrep -f matches the tick's own cmdline — verify child PIDs.

## Budget
Invoked ~23:50, exited ~00:15 (~25 min, well inside 45). Arc: reconcile (both workers alive,
corpus absent), W2-7 pre-review first-hand (11 cite groups at 78bee2c8), OQ rulings +
task-list updates under lock, assumptions entry, W2-9 orientation sniff, this handoff. No
new dispatches (fleet coder locked by W2-5; W2-9 composer waits on W2-8 draft shapes).
