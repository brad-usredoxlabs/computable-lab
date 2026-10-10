# HANDOFF - lane 2 - 2026-10-10T08:35 EDT (orch tick l2t0810, invoked ~08:10)

HEADLINE: W2-8 coder LIVE and FORWARD (session 20261010_072053_73c8cb grew 196->236 msgs since
l2t0750; first 2 tracked edits landed uncommitted). W2-8 adversarial c1 prompt PRE-STAGED.
W2-9's four OQs RULED and written into its draft with first-hand merged-trunk verification.
W2-7 fix run stays QUEUED behind W2-8 on the fleet coder slot. No coder dispatched this tick
(fleet-single: pid file = W2-8, kill -0 confirms alive).

## 1. RECONCILE (first-hand)
- W2-8 coder: bash 3711552 alive (kill -0), cl-coder state.db session 20261010_072053_73c8cb
  236 msgs (196 at 07:57 checkpoint) = forward motion. Worktree wt/W2-8-lane2-l2t0630 HEAD
  529b787d, 2 tracked files modified UNCOMMITTED (contract = single commit at end). Log
  logs/coder-W2-8-l2t0630.log 0 B (buffered-until-exit pitfall). Elapsed ~74 min at checkpoint;
  expected exit ~08:45-10:00; 2x ~09:15, 3x ~10:45 (rule 7b). NOT re-dispatched.
- Fleet coder lock: pid file line 'W2-8-lane2-l2t0630 coder-bash=3711552 hermes=3711608';
  flock FREE (dispatch-instant semantics only - see AS-LANE2-FLEETLOCK incident).
- W2-7: worktree wt/W2-7-lane2-l2t0550 at cf7d548a untouched (per l2t0750 verification); fix
  prompt prompts/coder-W2-7-fix-c1-l2t0715.txt + c2 template prompts/
  review-W2-7-adversarial-c2-TEMPLATE-l2t0750.txt both fully staged. NOT dispatched (W2-8 owns
  the slot).
- Trunk TIP 7ac648b8 (l2t0750 handoff docs). Stack :3093 /api/health 200 + :5193 200.
- BRAD-PACKET-spine7-spine8: ANSWERED 2026-10-09 (approve both; SPINE-7/8 both DONE now). Not
  re-asked. PROTO-AI-13: corpus re-check - still absent/insufficient in
  /home/brad/.computable-lab/worktrees/main/records/ scan; stays todo, corpus-gated, no action.

## 2. TICK WORK
a. W2-8 adversarial c1 prompt PRE-STAGED: prompts/review-W2-8-adversarial-TEMPLATE-l2t0810-c1.txt
   - 13-arm hunt list derived from spec S8 bait (retire!=delete call-site grep; XDR payload
   preservation + key:undefined; YAML silence / rung re-mint ban; rung literals; normalizePayload
   intent-step probe; stale-save race; anchor out-of-range; SAID immutability violation-spy;
   question relocation + family axes; client.ts one-method discipline + empty server diff;
   FAKE-GREEN report integrity incl. app tsc SET vs /tmp/l2t2230-tsc-app.txt pin; ownership hard
   stops; W5 gate-spec seeding integrity). Base 529b787d three-dot; report path token <TICK>;
   targeted vitest FROM app/; spec md5 eb9fa8a8 verified.
b. W2-9 OQ RULES appended to its draft (under task-list.lock; end of
   .hermes/plans/2026-10-10_0110-W2-9-review-ai-panel-spec-DRAFT-l2t0030.md):
   OQ1=(a) additive 'protocol-review' AiSurface + delegate to buildSystemPrompt when
   attachedProtocol present (delegate site verified at server/src/ai/systemPrompt.ts:408);
   OQ2=(a) confirmed by l2t0715 promo note (draft body kind 'protocol' at merged W2-6);
   OQ3=RESOLVED BY THE MERGE - ai.semanticPass block merged exactly as re-ruled
   (server/src/config/types.ts:189 + loader.ts:376-379 validation +
   server/src/ingestion/vendor-protocol/SemanticPass seam resolveSemanticPassInference -
   all verified first-hand on trunk): the settings section binds ai.semanticPass keys ONLY,
   never the active-profile activate route; no new knob, no re-rule;
   OQ4=(a) backend.log surface line as grounding receipt leg, T5 unit pin.
   NOTE the file path correction: SemanticFamilyPass.ts lives under
   server/src/ingestion/vendor-protocol/ (the W2-9 draft cite :65 for the seam was pipeline/ -
   the seam exists, path differs; promotion note wording at f19cfa95-era checked).
c. W2-8 task block checkpoint note inserted under queue lock. This handoff committed.

## 3. QUEUE / NEXT TICK (ordered)
a. POLL W2-8 (2x ~09:15 / 3x ~10:45): on log 'EXITED code=0' + 'W28 DONE <sha>' ->
   (1) ADVERSARIAL C1 from the staged template (replace <TICK>, unique report path reviews/
       review-W2-8-adversarial-l2t<tick>-c1.md, OpenRouter deepseek, log logs/
       review-W2-8-adv-c1-l2t<tick>.log);
   (2) IN PARALLEL dispatch W2-7 FIX to the fleet coder (pid-file free check first: kill -0
       3711552 GONE; flock -n acquire; prompt prompts/coder-W2-7-fix-c1-l2t0715.txt; NEW log
       logs/coder-W2-7-fix-c1-attempt2-<tick>.log; pid file 'W2-7-fix-c1 ...'). Expected 40-60
       min. On fix exit -> c2 gate from staged template; two-cycle terminal.
   (3) On W2-8 adv ACCEPT: orch self-verify (open real diff; targeted app vitest in worktree +
       merged trunk; app tsc error SET vs /tmp/l2t2230-tsc-app.txt pin, set-equality;
       candidateToProtocolPayload( grep empty in app/src; app unit fail-SET vs claim base) ->
       merge --no-ff -> restart stack background (UI files landed; spec plans NO YAML) ->
       BROWSER GATE vs :5193 spec S10 verbatim (receipts/W2-8-SAID-MEANT-SURFACE/<ts>/;
       corrected-nav-facts precedent prompts/review-W2-3-browser-l2t2200-tier2.txt; real routes
       /ingestion/vendor-pdf/:recordId, /record/:recordId; NO /project/:study/record/<id>;
       W5 spec carries its own idempotent seeding leg; tier ladder rule 6c if a shot dies).
b. After W2-8 merge: W2-9 promotion gate MET -> promote spec (OQ rules above are the rulings;
   attach merged-shape bindings; re-derive CAMT cites at merged trunk tip), bootstrap worktree
   background (~6-8 min NFS), dispatch coder when the fleet slot frees (W2-7 fix/c2 arc first
   or second per exit order - whoever is ready).
c. W2-10 promotes after W2-7 merge (deps W2-6+W2-7): resolve N6 CAMTs at merged trunk, append
   note, promote, queue. W2-11 gated on W2-7..W2-10.
d. PROTO-AI-13 corpus: passive check each tick only.

## assumptions:
NEW: AS-LANE2-W29-OQ-RULINGS-SETTLED (OQ1(a)/OQ2(a)/OQ3-merge-resolved/OQ4(a) recorded in the
  W2-9 draft; evidence = first-hand trunk reads of systemPrompt.ts:408, types.ts:189,
  loader.ts:376-379, SemanticFamilyPass seam; discharges the open-OQ half of
  AS-LANE2-W29-OQ-RULINGS - the ruling record now lives in the draft itself).
NEW: AS-LANE2-W29-SPECFAMILY-PASS-PATH-CITE-DRIFT (W2-9 draft cites
  server/src/compiler/pipeline/SemanticFamilyPass.ts:65; the merged file is
  server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts - seam real, path stale; fix at
  W2-9 promotion, coder must not chase the old path).
DISCHARGED: none fully.
CARRIED OPEN (unchanged unless noted): AS-LANE2-W27-OQ2-RULED-AT-MERGE, AS-LANE2-W27-OQ-RULINGS,
AS-LANE2-W27-WORKTREE-BOOTSTRAP-ORCH (live until W2-7 acceptance), AS-LANE2-W27-MANIFEST-PIN-STALE
(value sourced: blob 58c447eb - use for c2/self-verify, never 873e1343),
AS-LANE2-W28-WORKTREE-BOOTSTRAP-ORCH, AS-LANE2-W28-OQ-RULINGS, AS-LANE2-W29-OQ-RULINGS (see NEW),
AS-LANE2-W210-OQ-RULINGS, AS-LANE2-W211-OQ-RULINGS, AS-LANE2-W211-COMPOSED-PRE-DEPS,
AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM, AS-LANE2-APP-TSC-PIN-47-24,
AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE, AS-LANE2-S2-TSC-PIN-27, AS-LANE2-SPINE6-R1/R2,
AS-LANE2-PBCH9-CROSSRUN-GATE-DISCLOSURE, AS-LANE2-W21-COLLISION-FINDINGS-DEFERRED,
AS-LANE2-CODER-HARNESS-COMPRESSION-DEATH (standing), AS-LANE2-COMPOSER-LOG-BUFFER-FALSE-DEATH
(standing), AS-LANE2-W2x-COMPOSED-PRE-DEPS, AS-LANE2-W23-LEGACY-LITERAL-WRITE-FREEZE,
AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE, AS-LANE2-W24-CANDIDATE-WHEN-GUARD-ADVISORY,
AS-LANE2-W26-COMPOSER-EMPTY-PROMPT-ABORT, AS-LANE2-W210-PRE-DEPS,
AS-LANE2-FLEETLOCK-DISPATCH-ONLY-INCIDENT (standing rule: kill -0 pid check before ANY coder
dispatch). No credentials recorded. No open evidence-debt entries.

## Baseline facts (carry forward)
- Trunk TIP 7ac648b8 (docs) over 02e0333a over 248e9b0c; W2-7 candidate cf7d548a (+fix pending)
  NOT merged; W2-8 branch wt/W2-8-lane2-l2t0630 off 529b787d.
- Pins: server tsc 26 /tmp/l2t0415-tsc-server.txt; app tsc 34 /tmp/l2t2230-tsc-app.txt; scoped
  fail-file SET 11 files /tmp/l2t2310-w25-baseline-failfiles.txt; goldens 15; MANIFEST blob
  58c447eb; health schemas 192 / lintRules 81; :3093 health at /api/health.
- Specs: W2-7 promoted md5 4fdc584d; W2-8 canonical md5 eb9fa8a8 (PROMOTION RECORD M1-M10);
  W2-9 draft + l2t0715 promo note + l2t0810 OQ rulings; W2-10 draft with promotion notes;
  W2-11 draft md5 13bdc236 pre-reviewed.
- PITFALLS standing: worktree excludes need `git config --worktree`; worktree add NFS 6-8 min
  background; vitest FROM package dir; cl-lane-stack restart BLOCKING -> background; hermes -z
  logs buffer until exit; pgrep -f matches own cmdline; flock != run lock (kill -0 pid check
  MANDATORY); heredoc-in-flock quoting: use python via stdin for task-list edits.

## Budget
Invoked ~08:10, checkpointed ~08:35 (~25 min). Arc: reconcile W2-8 first-hand (alive, forward,
2 uncommitted edits) + W2-7 untouched + trunk/stack/Brad-packet/corpus checks -> staged W2-8
adv c1 prompt (13-arm hunt) -> W2-9 OQ rulings verified first-hand and recorded -> task-list
note under lock -> this handoff. Live model sessions: W2-8 coder only (fleet-single). No coder
dispatched (fleet rule). W2-7 fix + W2-8 adv gate + W2-9 promotion all fully staged for the
next tick.
