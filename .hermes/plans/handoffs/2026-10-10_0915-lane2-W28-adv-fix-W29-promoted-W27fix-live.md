# HANDOFF - lane 2 - 2026-10-10T09:15 EDT (orch tick l2t0850, invoked ~08:50)

HEADLINE: W2-8 coder EXITED DONE 430be924 (14 files, +2167/-303, compaction survived); adversarial
C1 returned VERDICT: fix (2 major + 2 minor) — fix run STAGED, queued behind the LIVE W2-7 fix
coder (fleet-single, pid 3908554 confirmed forward at 09:12 editing the defect files). W2-9 spec
PROMOTED to canonical (trunk 9860f0bf) + worktree bootstrapped + coder prompt staged. W2-8 done
gate stays open: adv c2 -> self-verify -> merge -> browser gate spec §10.

## 1. RECONCILE (first-hand)
- W2-8 coder EXITED ~08:53 code=0, end-marker 'W28 DONE 430be924d066...'. Worktree HEAD == that
  sha; base 529b787d ancestor of trunk. Boundary checks orch-ran: server/schema/goldens diff LINES
  = 0; candidateToProtocolPayload( non-module callers = 0.
- W2-8 ADV C1 (hermes 3907574) EXITED ~09:04 with a FULL stdout verdict; report promoted path:
  reviews/review-W2-8-adversarial-l2tl2t0850-c1.md. VERDICT: fix. Defects: (1 major) forbidden
  1-line edit to BranchQuestionsPanel.test.tsx:125 (stale pin 'not pre-built' -> shipped wording;
  revert per gate — orch rules the baseline-failure handling, see assumptions); (2 major) mandated
  app/e2e/w28-said-meant-surface.spec.mjs + checked-in fixture ABSENT (spec §3 W5/§7, hunt 13);
  (3 minor) semanticDraft.ts/.test.ts outside the enumerated owned set — ACCEPTED by orch
  (scope-ruling); (4 minor) report §CLAUSE 3 misattribution — fix in report.
  Gate ran real verification: 8 files/74 targeted tests green, app tsc SET-equal to the 34-line
  pin, hard-stops byte-untouched, client.ts = the one sanctioned method.
- W2-7 FIX coder ATTEMPT-2 LIVE: cl-coder hermes pid 3908554 (flock acquired 08:55; pid file
  'W2-7-fix-c1(attempt2 l2t0850) coder-hermes=3908554'). Worktree W2-7-lane2-l2t0550 dirty in
  EXACTLY the defect-listed files (robot-realization.policy.yaml, realizeScientistIntent.ts/.test.ts)
  as of 09:12. Prompt prompts/coder-W2-7-fix-c1-l2t0715.txt, log logs/
  coder-W2-7-fix-c1-attempt2-l2t0850.log (0 B — buffered-until-exit), end-marker 'W2-7-FIX DONE
  <sha>'. Expected exit ~09:55-10:30; 2x ~10:45, 3x ~12:35 (rule 7b). Attempt-1 history: exited
  143 after ~13 s (SIGTERM, zero work — worktree untouched; do not confuse with this run).
- W2-7 branch: cf7d548a + fix commit pending; adv c1 was VERDICT fix (4 defects), fix = cycle 1.
  c2 gate template staged per l2t0740/0805 handoffs (prompts/ review-W2-7 c2 template).
- Trunk TIP 9860f0bf (W2-9 promotion docs commit over b153573b). Stack :3093/:5193 200. No product
  code merged this tick.
- BRAD-PACKET-spine7-spine8: answered 2026-10-09; not re-asked. PROTO-AI-13 corpus: passive check
  — /home/brad/.computable-lab/worktrees/main/records/ still 66 records, no Zymogen-class corpus.

## 2. TICK WORK
a. W2-8 adv C1 dispatched at pinned sha 430be924 (template l2t0810 + pinned-sha tail; note the
   <TICK> substitution produced 'l2tl2t0850' in the report filename — cosmetic).
b. Orch ruling on defects 3/4 BEFORE the fix run (defect 3 accepted with declared rationale in the
   fix prompt; defect 4 report-only). Defects 1/2 ride the fix verbatim per gate text.
c. W2-9 promoted: cp draft -> .hermes/plans/2026-10-10_0900-W2-9-review-ai-panel-spec.md (md5
   4bd0cfcf), promotion cites re-verified first-hand at tip (systemPrompt.ts:405-409 delegate
   site; surfaces.yaml:83 protocol-review; OQ2 body-kind closed). Trunk commit 9860f0bf.
d. W2-9 worktree wt/W2-9-lane2-l2t0900 bootstrapped (NFS ~8 min), clean at 9860f0bf; node_modules
   symlinks (root/app/server -> computable-lab), core.fileMode=false + excludesFile
   lane-exclude-W2-9-l2t0900 set --worktree. Coder prompt STAGED prompts/coder-W2-9-l2t0900.txt
   (headless, OQ rulings pasted, baselines incl. server tsc 26-pin + scoped fail-SET 11-file pin,
   end-marker 'W2-9 DONE <sha>').
e. W2-8 fix prompt STAGED prompts/coder-W2-8-fix-c1-l2t0910.txt (end-marker 'W2-8-FIX DONE <sha>';
   NEW log logs/coder-W2-8-fix-c1-attempt<tick>.log at dispatch; BQP-revert fail-SET equality
   proof demanded; e2e spec must ship with committed fixture, F-W28-5).
f. Task-list notes appended under lock (W2-8 coder-exit + adv-verdict + W2-9 promotion blocks).

## 3. QUEUE / NEXT TICK (ordered)
1. POLL W2-7 fix coder (pid 3908554; 2x ~10:45 rule 7b). On 'W2-7-FIX DONE <sha>': c2 adversarial
   gate (staged template, NEW report/log paths). On ACCEPT: orch self-verify (open real fix diff;
   targeted scientistIntent suites incl. realizationGolden + noBypass; determinism 3-leg incl
   YAML-reload; verb-literal grep 0; server tsc multiset 26==pin; scoped fail-SET == 11-file pin;
   MANIFEST 58c447eb untouched) -> merge --no-ff into trunk -> docs commit. NO browser gate (W2-7
   is server-only; check spec §10 — if it names no UI, record that explicitly like AI-8).
2. WHEN the coder slot frees: dispatch W2-8 FIX RUN first (it unblocks the near-done item), then
   W2-9 coder (queue per prompts/coder-W2-9-l2t0900.txt; worktree ready). ONE at a time, flock +
   kill -0 pid-file check, pid file updated at each dispatch.
3. On W2-8 fix exit: c2 gate (template + pinned fix sha; hunt list adds: BQP.test.tsx byte-==base,
   e2e spec present + self-contained + committed fixture, semanticDraft files DECLARED under the
   orch scope ruling — must not be deleted). On c2 ACCEPT: orch self-verify (targeted app vitest
   worktree + merged trunk; tsc SET vs pin; full app fail-SET vs coder §0 35-file capture),
   merge --no-ff -> restart stack (BACKGROUND) -> BROWSER GATE spec §10 verbatim, receipts
   receipts/W2-8-SAID-MEANT-SURFACE/<ts>/, corrected-nav-facts precedent
   prompts/review-W2-3-browser-l2t2200-tier2.txt (real routes /ingestion/vendor-pdf/:recordId,
   /record/:recordId; NO /project/:study/record/...; tier ladder rule 6c). Done ONLY on VERDICT:
   accept with receipts.
4. W2-10 promotion gate: after W2-7 MERGES (deps W2-6+W2-7): resolve N6 CAMTs at merged trunk,
   append note, promote draft 2026-10-10_0140-W2-10-...-DRAFT-l2t0130.md, bootstrap worktree.
5. PROTO-AI-13: passive corpus check only. No Zymogen corpus in the data repo yet.

## assumptions:
NEW: AS-LANE2-W28-SEMANTICDRAFT-SCOPE-ACCEPTED (orch scope-ruling; cleared on c2 accept if files
  ride the ruling). AS-LANE2-W28-BQP-PIN-REVERT-FAILSET-EQUALITY (revert reintroduces a KNOWN
  pre-existing BranchQuestionsPanel.test.tsx failure; acceptance = fail-SET equality vs coder §0
  35-file capture, not zero-failures; the stale pin is a separate cheap item).
  AS-LANE2-W29-WORKTREE-BOOTSTRAP-ORCH (live until W2-9 acceptance).
DISCHARGED: AS-LANE2-W28-CODER-COMPACTED-MIDRUN (coder completed despite compaction — exit DONE
  with full §6 evidence; watch resolved, standing AS-LANE2-CODER-HARNESS-COMPRESSION-DEATH
  guidance unchanged).
CARRIED OPEN (unchanged unless noted): AS-LANE2-W29-OQ-RULINGS-SETTLED, AS-LANE2-W27-OQ2-
  RULED-AT-MERGE, AS-LANE2-W27-OQ-RULINGS, AS-LANE2-W27-WORKTREE-BOOTSTRAP-ORCH (live until W2-7
  acceptance), AS-LANE2-W27-MANIFEST-PIN-STALE (use blob 58c447eb, never 873e1343),
  AS-LANE2-W28-WORKTREE-BOOTSTRAP-ORCH, AS-LANE2-W28-OQ-RULINGS, AS-LANE2-W29-OQ-RULINGS,
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
- Trunk TIP 9860f0bf (docs) over b153573b/75cd4ab2; W2-7 candidate cf7d548a + fix pending NOT
  merged; W2-8 branch wt/W2-8-lane2-l2t0630 @ 430be924 + fix pending NOT merged (adv c1 = fix).
  W2-9 worktree wt/W2-9-lane2-l2t0900 @ 9860f0bf ready, coder NOT yet dispatched.
- Pins: server tsc 26 /tmp/l2t0415-tsc-server.txt; app tsc 34 /tmp/l2t2230-tsc-app.txt; scoped
  fail-file SET 11 files /tmp/l2t2310-w25-baseline-failfiles.txt; goldens 15; MANIFEST blob
  58c447eb; health schemas 192 / lintRules 81; :3093 health at /api/health. W2-8 coder's fresh
  app-unit capture: 35-file fail-set /tmp/l2t0630-app-unit-failfiles.txt (24th line =
  BranchQuestionsPanel.test.tsx pre-existing).
- Specs: W2-7 promoted md5 4fdc584d; W2-8 canonical md5 eb9fa8a8; W2-9 canonical md5 4bd0cfcf;
  W2-10 draft with promotion notes; W2-11 draft md5 13bdc236 pre-reviewed.
- PITFALLS standing: worktree excludes need `git config --worktree`; worktree add NFS 6-8 min
  background; vitest FROM package dir; cl-lane-stack restart BLOCKING -> background; hermes -z
  logs buffer until exit; pgrep -f matches own cmdline; flock != run lock (kill -0 pid check
  MANDATORY); heredoc-in-flock quoting: use python via stdin for task-list edits; session
  message_count can DROP on harness compaction — check last_activity + mtimes, not death; NEW:
  a hermes -z one-shot's own log can look dead mid-run (buffered) — the ADV gate finished and
  its full stdout appeared only at exit; do not re-dispatch on 0 B logs.

## Budget
Invoked 08:50, checkpointed ~09:15 (~25 min). Arc: reconcile (W2-8 coder EXITED DONE -> boundary
checks) -> adv c1 dispatch (pinned sha) -> W2-7 fix dispatch under flock (slot free check first)
-> W2-9 spec promotion + worktree bootstrap + coder prompt staged -> adv verdict fix -> W2-8 fix
prompt staged with orch rulings -> task-list notes + assumptions -> this handoff. Live model
sessions: W2-7 fix coder only (fleet-single, forward). W2-8 fix + W2-9 coder fully staged.
