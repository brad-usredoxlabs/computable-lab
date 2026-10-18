<!-- PROMOTED 2026-10-18T16:30 EDT by orch l2t1610 from
     specs-draft/2026-10-18_W211-QUAL-1-spec-draft-l2t1510.md (composer run
     l2t1510 completed at 16:00 — the 'died' diagnosis was wrong; its draft
     landed at 15:59. The l2t1550 retry draft completed too at 16:14 and is
     KEPT as cross-check; the l2t1510 text is canonical).
     Orchestrator rulings at promotion:
       OQ-1: n=5 x 3 prompts ADOPTED (recommendation).
       OQ-2: headless-primary + ONE UI-witness draw per prompt ADOPTED
             (recommendation). Browser-only n=15 rejected (duplicates
             MACH-1's gate, ~10x wall time).
       OQ-3: sanctioned baseline identity = qwen3.8-thunderbeast on
             thunderbeast:8080 — CAPTURED LIVE at promotion 16:22 EDT
             (GET :3093 /api/config -> activeProfile qwen3.8-thunderbeast;
             no activation needed — live already matches). Worker captures
             verbatim and STOPs on mismatch.
       SEQUENCE: first cohort run AFTER HEDGE-TYPE-1 + SAMPLE-CARD-1 merge
             (pre-run gate item 2, adopted). Smoke may run earlier read-only.
     Evidence debt AS-LANE2-QUAL1-COMPOSER-DUMP-PROBES CLOSED at promotion:
     every load-bearing locator spot-checked live by orch 16:2x EDT (spec.mjs
     :888/:909/:939/:950/:1038/:1052; resolveNounsPass :435; VocabHandlers
     MINTABLE :45; configHandlers :212/:520; r2 fixture file exists;
     compile-from-prompt route registered; shadow-router n=317 last ts
     2026-10-16T20:22Z; deps ANSWER-BIND-1/ANSWER-SURFACE-1 merge markers
     present; p_min literal in both drafts, zero numeric).
-->
# W211-QUAL-1 SPEC DRAFT — Budgeted live-model qualification: completion-after-legitimate-answers on the golden routes (report, not gate)

Composer: cl-spec-composer, lane 2 (run l2t1510). Composed 2026-10-18; locators
pinned at trunk `cl/integration-2 @ c7fdee02`; composition ended with trunk
advanced to `d7978164`/`80a2fd87` (docs-only handoff commits — re-verified
first-hand: c7fdee02 is an ancestor of HEAD, code tip unchanged, so all code
locators below stand; re-pin line numbers at the dispatch tip as always).
Every file/line below was opened personally with read_file/search_files/terminal
against /mnt/vast/home/brad/git/cl-integration-2 and the lane dirs; no scout
output is relied on. All git via `git -c core.fileMode=false` (NFS mode-bit noise).

STATUS: DRAFT — pending orchestrator review; not dispatchable until promoted.

## GOAL (one sentence)

Run a pre-registered, BUDGETED, non-gating qualification of the REAL natural-
language producer (frozen ZYMO-style texts through the live lane stack, answers
via the real surfaces / the A5h idiom) and deliver ONE report per requalification
whose verdict line gates feature PROMOTION — never machinery merges, never
retry-until-green, never a re-run policy invented after the fact.

## THE BINDING PRINCIPLE (cite, do not re-litigate)

W211-GATE-RESHAPE — Brad ruled YES 2026-10-18; the ruling text lives in the
task-list block `id: W211-GATE-RESHAPE` (task-list.md :9510-9561; there is NO
separate `2026-10-18_W211-GATE-RESHAPE.ruling.md` file — grep-verified; the
block IS the ruling record). Operative sentences for this spec:

- "Budgeted model-quality qualification (pre-declared sample/interaction
  budget, success = completion-after-legitimate-answers, no retry-until-green)
  gates feature PROMOTION, not machinery merges."
- "0/5 completing runs block promotion; reproducible unanswerable-surface /
  erased-answer / fabricated-fact block categorically regardless of averages."
- "success = completion-after-legitimate-clarification (NOT clarification-free
  rate, gamable by silent guessing)."

Complementarity with the machine gate (W211-MACH-1,
`.hermes/plans/2026-10-18_W211-MACH-1-golden-fixture-spec.md`, promoted with
OQ1-A/OQ2-probe/OQ3-adopted): MACH-1 proves the MACHINERY deterministically
(producer replaced at its wire boundary, byte-stable deck md5, cl-browser-
reviewer VERDICT: accept). QUAL-1 proves the PRODUCER's stochastic quality
(live model, no determinism claims). QUAL-1 must NEVER assert or require
byte-stability, must never merge-gate, and must never duplicate MACH-1's
fixture-fidelity legs; it consumes the SAME seeds (D4_PROMPT lineage, the
merged golden fixture text, the `[[kind:id|label]]` A5h idiom, pl-clarify /
pl-submit-answers surfaces) at the live-producer boundary. W2-11's amended
closure (task-list.md :5909-5912 + :9282-9295): closure = MACH-1 accept +
QUAL-1 report DELIVERED (any honest verdict); the report's verdict gates
promotion only.

## ACCEPTANCE CRITERIA (verbatim from the task list 'verified by')

> Spec review (cohort/budget/success-definition pre-declared, no post-hoc
> rerun policy) + the baseline REPORT with per-draw receipts and an explicit
> verdict line ("qualification PASS at p_min=__/ PROMOTION BLOCKED at n=__ /
> CATEGORICAL defect named: ..."). Delivery of the report (any honest verdict)
> satisfies W2-11's QUAL leg per the amendment header; promotion decisions are
> Brad's, not the pipeline's.

And verbatim from `description` — everything this spec must PIN: the prompt
set; model + config identity (endpoint + build); cohort size n; per-draw
interaction budget; success definition = completion with semantically correct
output after bounded legitimate clarification; uncertainty bound; p_min left
BLANK for Brad; secondary metrics (action fidelity, invalid-wire rate, question
burden, repeated questions, UNANSWERABLE categorical, binding stability);
fresh vocabulary state per cohort; per-draw logs + fact-set md5s as receipts;
requalification triggers (model/config change, resolution-mechanism change);
14 W2-11 gate runs + r2 .cycles as the pre-baseline section.

## WHAT THIS IS / IS NOT

- NOT a worker code task against the repo. Deliverables (eval script + prompts
  + config pins + report) live under the LANE DIR; ZERO product/app edits —
  the trunk worktree must be provably untouched at the end.
- NOT a merge gate. It never blocks a merge; it produces a report.
- NOT retry-until-green: every draw counts, including stalls and errors; there
  is no "re-run that one because it looked flaky" (see NO-RERUN POLICY).
- A defect found here spawns a NAMED FIX TASK in the report; the eval is never
  "fixed" to make the defect disappear (task block verbatim: "a defect found
  here spawns named fix tasks, it does not 'fix' the eval").

## FILE LOCATIONS (in scope / out of scope)

IN SCOPE (all under the lane dir; created by this item):
- `/home/brad/.hermes/cl/lanes/2/eval/w211-qual-1/` — driver + prompts + pins:
  - `driver.mjs` (the cohort driver; node >= 20, no new deps — plain fetch)
  - `prompts/p1.txt p2.txt p3.txt` (frozen prompt set, see PROMPT SET)
  - `expectations/p1.json p2.json p3.json` (pre-registered expected-fact /
    expected-fidelity tables + legitimate-answer tables; orchestrator-reviewed
    BEFORE any cohort run, md5-frozen with the prompts)
  - `capture-config.mjs` (identity capture; writes config-pin.json)
  - `README.md` (how to run; requalification trigger checklist)
- `/home/brad/.hermes/cl/lanes/2/receipts/W211-QUAL-1/<UTC-stamp>/` — receipts
  (smoke + each cohort + report). Report file: `.../REPORT.md`.
- Optional docs-only deliverable in the repo (orchestrator promotes):
  `.hermes/plans/2026-10-18_W211-QUAL-1-baseline-report.md`.

EXPLICITLY OUT OF SCOPE: `server/src/**`, `app/src/**`, `app/e2e/**`,
`schema/**`, `prompts/**`, repo `config.yaml` (READ only, never PATCH/PUT),
the task list, stacks (never restart; never touch :3001/:5174; :3093/:5193 are
the eval target but are orchestrator-owned — no config mutation, no activate
call, no restart). The retired D4 arm in `app/e2e/w2-11-campaign-demo.spec.mjs`
is CITED, never edited (MACH-1 owns its skip-marking).

## PRE-RUN GATE (must hold before ANY cohort draw)

1. Deps merged: `git -c core.fileMode=false log --oneline | grep -iE 'ANSWER-BIND-1|ANSWER-SURFACE-1'` -> two markers (both merged per handoff 2026-10-18_1155).
2. RECOMMENDED (OQ-recommendation, orchestrator sanctions): the FIRST baseline
   run happens AFTER HEDGE-TYPE-1 + SAMPLE-CARD-1 merge. Running before them
   re-measures the known-defective hedge bar (W28-A5i: 0/5 byte-identical
   slot-less survivors at step0 probe l2t1210) — an honest but information-free
   0/n. If the orchestrator sanctions an early run anyway, the report states
   the tip sha and the known-defect context; it is still a valid pre-baseline.
3. Stack healthy at the served tip (:3093 200, :5193 200, served = trunk — the
   standard per-tick served check, orchestrator-confirmed).
4. Identity captured + sanctioned (see CONFIG IDENTITY).

## CONFIG IDENTITY — how to pin endpoint + build (capture procedure)

Run `capture-config.mjs` ONCE per cohort (and at smoke); it writes
`<receipts>/config-pin.json` and the run's every per-draw log carries that
file's md5. Captured, all read-only:

1. Active AI profile + resolved inference from the LIVE backend:
   `curl -s http://localhost:3093/api/config` (GET /api/config,
   server/src/api/handlers/configHandlers.ts:212) -> `ai.activeProfile`,
   resolved inference baseUrl/model/temperature.
2. Profile table: `curl -s http://localhost:3093/api/config/ai/profiles`
   (configHandlers.ts:520).
3. Endpoint build: `curl -s <baseUrl>/models` (OpenAI-compatible; per profile,
   e.g. http://thunderbeast:8080/v1/models) -> model id/version list from the
   serving host. Record verbatim.
4. Build sha: `git -C /mnt/vast/home/brad/git/cl-integration-2 -c core.fileMode=false rev-parse HEAD` (served = trunk; orchestrator confirmed per tick) + `md5sum` of the worktree `config.yaml` (current lane tip has `ai.activeProfile: DS-v4.1-OR`, profiles incl. `qwen3.8-thunderbeast` (thunderbeast:8080, qwen3.8-flash-next, temperature 0.1) and `qwen3.6-appliance-2`; the LIVE active profile is whatever step 1 reports — the file can lag the product-activated state, cf. the l2t0354 activation precedent).
5. Data-repo vocabulary state: GET inventory rows relevant to the prompt set
   (the F1 probe's `live-inventory-rows.json` pattern from
   wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/) + md5 of the
   sorted recordId list — the fact-set md5 baseline for state-drift detection.
6. shadowRouter telemetry path exists (record n and last ts from
   /home/brad/.computable-lab-lane2/shadow-router/events.jsonl; currently
   n=317, last ts 2026-10-16T20:22Z — CITE, never write).

RULE: the worker NEVER calls POST /api/config/ai/profiles/:name/activate or
PATCH /api/config (configHandlers.ts:603/:routes exist; they are not this
item's seam). If the live identity (step 1) differs from the identity the
orchestrator sanctioned at promotion time, STOP and report — do not switch.
Requalification is exactly "this pin file changed."

OQ-3 (recommendation): first baseline should be captured at whichever profile
is live on :3093 at cohort time and recorded verbatim; given gate history the
orchestrator may prefer to sanction `qwen3.8-thunderbeast` (the profile the
PROTO-AI-9 precheck and prior lane gates exercised) by activating it ORCH-side
BEFORE the cohort — activation is orchestrator-owned, not worker. Either way
the pin file is the truth of the run.

## PROMPT SET (frozen, pre-registered, md5-pinned before any cohort draw)

Natural-language ZYMO-style protocol texts, sent as `protocolText` on
POST /api/intent/compile-from-prompt (route verified:
server/src/api/handlers/IntentCompileFromPromptHandlers.ts:514). Three prompts,
each run n times (see COHORT). The set is frozen (md5 into
`prompts/manifest.json`) BEFORE the first draw, reviewed by the orchestrator,
and never edited after the first draw — a needed edit = new qualification.

- P1 = the architect-ruled D4_PROMPT VERBATIM (app/e2e/w2-11-campaign-demo.spec.mjs
  :888-899; 10 lines, "Manual zymoBIOMICS-style prep on the bench...", seeded
  inventory, one intentionally-unmatched 'magnetic rack'). Extract verbatim;
  it is the seed of the whole lineage and the pre-baseline is measured with it.
- P2 = the W211-MACH-1 golden fixture's natural-language text, lifted from the
  merged `app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml` AT ITS MERGED
  SHA (the four obligation classes: role-unique noun, genuine ambiguity,
  unknown noun, gap fact). If MACH-1 has not merged at the sanctioned run, the
  orchestrator either defers QUAL-1 or substitutes a prompt they authored
  themselves — the worker never invents P2 content.
- P3 = the r2 gate's scientist protocolText: extract verbatim from the r2
  tier-2 receipt fixture `fixture-CAN-protocol-1791692042751.json` in
  /home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-18_0630-a5d-r2-tier2/
  (the 3-line fixture behind the F1 probe, logs/step0-probe-f1-l2t1330.log
  line 1: `fixture=CAN-protocol-1791692042751 protocolText_lines=3 chars=61`,
  5 draws 1/5 complete). This is the known-hard slot-less-hedge shape.

Alongside each prompt, `expectations/<id>.json` pre-registers, per prompt:
(a) the expected first-draw fact set (labels/reasons/actionLocation shapes —
seeded from gate-14 + r2 + F1 + probeA evidence, NOT guessed); (b) the LEGITIMATE
ANSWER for each expected fact: ambiguous-noun -> `[[labware:<id>|<label>]]` or
`[[material:<id>|<label>]]` pick from the clarification's OWN candidates (A5h
idiom, ClarificationPicker.answerFromMention emits exactly this), material
unknown-noun -> the governed mint act (POST /vocab/mint {refKind:'material'}),
labware unknown-noun -> /l no-mint-floor answer (SAMPLE-CARD-1 class; NEVER
mint labware — material-only floor, VocabHandlers MINTABLE:45, A5h Q3 third
reaffirmation), gap facts -> the F1/spec.mjs GAP_ANSWERS precedent
(spec.mjs :939-946, e.g. /centrifug/ -> "4000 rpm for 2 min"); (c) the fidelity
expectations (expected actions + key parameters, planted facts' landing slots).
An UNEXPECTED fact (not in the pre-registered table) is answered by its own
clarification prompt as data (`Scientist answer to: <ask>` — spec.mjs :950-951
precedent) and COUNTED as a repeated/burden fact, never skipped.

## COHORT DESIGN

- n = 5 draws per prompt x 3 prompts = 15 draws per requalification (OQ-1).
- One cohort = (prompt, n draws), draws run SEQUENTIALLY against :3093 —
  draws are independent samples of the same pipeline state, run back-to-back
  like the F1 probe (5 draws, 8-14 s per compile response).
- FRESH VOCARY STATE PER COHORT (task-block requirement), implemented honestly:
  - BEFORE each cohort, capture the vocabulary/inventory snapshot (pin step 5)
    and record its md5; DIFF against the previous cohort's snapshot; attach the
    diff to the cohort receipts.
  - Do NOT nonce the unknown nouns. A nonce would mutate the frozen prompt text
    and destroy pre-registration (this DIVERGES from the MACH-1 reviewer-bait
    advice on purpose: MACH is a determinism gate that owns its fixture; QUAL
    owns a pre-registered measurement).
  - State contamination is MEASURED, not hidden: if a prompt's expected
    unknown-noun already has a record from a prior cohort/legacy mint (the
    `MAT-microcentrifuge-tube-sgzg` permanent-residue precedent, A5h Q1.3),
    the inventory pre-check FLAGS the cohort "state-contaminated for <noun>";
    the noun resolving-from-store is still scored on completion+fidelity, but
    the coverage loss is stated in the report. Contamination NEVER justifies
    deleting records — the data repo (/home/brad/.computable-lab/worktrees/main)
    is orchestrator/Brad-owned; the worker only flags.
  - LIVE-INVENTORY SEED STATE MATTERS — the DECK-FOLD-1 trap (spec.mjs
    :1038-1041 warning, verbatim): seeding resolvable records for nouns you
    want as zero-match flips hints into resolvedLabwares that deriveDeckLabware
    ignores. Corollary for QUAL: the cohort writes NOTHING to /api/records
    except the mint acts its answers legitimately take (product mint path
    only). No seeding, no scrubbing, no cleanup-delete of prior mints.
- Ordering: P1, P2, P3 fixed; a state-mutating mint from P1 (material-only) may
  legitimately make P3's overlapping nouns known — flag via the per-cohort diff.

## PER-DRAW INTERACTION BUDGET (the MAX_REDRAW-class cap — concrete number)

Per draw, a hard budget of:
- compile round-trips <= 4 (first draw + at most 3 bounded clarification
  rounds),
- answer acts per round <= 8 (sum of picks + mints + gap answers),
- stall classification: a round whose unknown/unclear set does not STRICTLY
  SHRINK versus the previous round, twice running (i.e. rounds r, r+1, r+2 with
  no strict shrink across the pair-steps), classifies the draw STALL
  immediately — do not spend remaining budget (mirrors spec.mjs :909-912's
  "strict shrink two cycles running" discipline),
- any HTTP shape outside {200 complete, 200 gap, 422 NEEDS_CLARIFICATION}
  classifies the draw INVALID-WIRE (counted, budget spent).

Justification: the retired D4 arm used MAX_REDRAW = 5 (spec.mjs :1052) with an
8-cycle honest-mint loop; gate-14 and the r2 trail show every non-converged
stall failing the strict-shrink rule by round 2-3 (drift 4->6->6->6, draws 3
and 4 byte-identical, A5h — arithmetically inconvergable), while the F1
completing draw converged at round 1. 4 round-trips = 2 generous real
convergence rounds + 1 to confirm stall; >3 answered rounds has NEVER once
converged in the pre-baseline (14 runs + 4 cycles + 5 F1 draws), so a larger
cap only buys the appearance of effort. Worst-case spend: 15 draws x 4 = 60
compile round-trips (+ one branch-question extraction call per unanswered
round-trip; handler makes exactly two LLM calls per unanswered round-trip) —
tens of minutes of endpoint time, bounded and honest.
Rationale + cap are PRE-DECLARED here; violating them mid-run is a spec
breach, not a tuning decision.

## SUCCESS DEFINITION (pinned; the only primary metric)

A draw SUCCEEDS iff, within budget, its FINAL compile response is HTTP 200
with `outcome: 'complete'` and `clarifications: []` (zero surviving facts —
the verified blocker shape: blocked == clarifications.length > 0 at
server/src/compiler/resolution/resolveNounsPass.ts, blocked-bar re-pinned to
:435 at tip per the MACH-1 promotion note; 200-'gap' is NOT success for QUAL —
gap means a fact is carried, and QUAL's success is completion after bounded
LEGITIMATE clarification), AND fidelity holds:
1. expected actions + key parameters present and correct in the returned
   intent per `expectations/<id>.json` (action fidelity, first-hand in the
   response body, not "actions exist");
2. every legitimate answer sent is traceable in the recomputed intent
   (ANSWER-BIND-1 slot / resolvedByLabel-equivalent — coder pins exact key
   from the merged code, cited) — an answer present in the request but absent
   from the intent = ERASED ANSWER (categorical blocker class);
3. no fact lands that neither the prompt nor a sent answer supports
   (FABRICATED FACT — categorical blocker class);
4. no planted stated fact silently discarded or default-invented (compare the
   expectation table's facts against the final intent).
Clarification-free completion still counts as success but is NOT the rate
measured (the ruling bars that gamification explicitly).

Primary metric: `k/n` successful draws per prompt and pooled; the report's
verdict line is drawn by BRAD at p_min (BLANK — see REPORT TEMPLATE). Per the
ruling, k=0 at n=5 for any prompt = PROMOTION BLOCKED at that prompt regardless
of p_min, and the report states that line itself (it is a ruling, not a
threshold).

## SECONDARY METRICS (exactly the task-block set)

1. ACTION FIDELITY — per successful draw, expected-action/parameter table pass
   (already in success 1); report per-prompt fidelity rate AND list every
   fidelity miss verbatim (fidelity misses inside an otherwise-complete draw
   still mark the draw's fidelity sub-column FAIL even if success counted —
   report both counts, never blend).
2. INVALID-WIRE RATE — draws classified INVALID-WIRE / n, with the errorClass
   per draw (schema-rejected envelope, parse failure, 500 INTENT_COMPILE_FAILED,
   timeout; shadow-router events.jsonl uses the parse/errorClass vocabulary —
   reuse those class names).
3. QUESTION BURDEN — mean clarification facts on the FIRST draw per cohort;
   pre-baseline comparison: the r2 drift shape 4->6->6->6 and F1's 2-fact sets
   (state both as context, no threshold).
4. REPEATED QUESTIONS — facts re-asked across rounds WITHIN a draw (label
   appears in round r and r+1) — count per draw + the labels; distinct from
   metric 6: this includes never-answered re-asks (producer/answer-coverage
   instability).
5. UNANSWERABLE (CATEGORICAL) — a clarification fact with NO valid answer act
   on any real surface (no /l record, no /m floor for a non-material refKind,
   a gap fact whose own prompt is not a string answer) is UNANSWERABLE; if it
   REPRODUCES (>=2 draws, or 2 rounds of the same draw with identical shape
   md5) it is filed as a named defect TICKET IN THE REPORT regardless of the
   average. This is the A5h inconvergable class; it blocks promotion
   categorically.
6. BINDING STABILITY — an ANSWERED label re-asked on the next round = defect
   (task block: "answered label re-asking = defect"). Count, name every
   instance (label, round, answer sent, request id), and file each as a defect
   ticket (this is ANSWER-BIND-1's own failure signature — an erased-answer /
   binding-instability categorical class).

## NO-RERUN POLICY (pre-declared, closes the gamable holes)

- One draw = one draw. Stalls, invalid-wires, and failures are FINAL for that
  draw's slot; the cohort never replaces a draw, never "excludes" a bad draw,
  never runs n+1 "for balance". Infra death (stack down mid-cohort, endpoint
  host offline) is the ONLY abort condition: the cohort is aborted, the partial
  receipts preserved and labeled partial, and the requalification re-planned
  at orchestrator level — never silently restarted to a clean slate mid-cohort.
- The report carries this paragraph so a reviewer can check it against receipts.

## RECEIPTS FORMAT (task block: per-draw logs + fact-set md5s)

Mirror the two proven precedents (r2 trail.json + F1 step0 log):
- `<receipts>/<cohort>/draw-<k>.json` per draw: {draw k, prompt id + prompt
  md5, startedAt/endedAt, config-pin md5, inventory-snapshot md5, rounds:
  [{round, reqId (backend-paired), http, outcome, seconds, facts:
  [{label, reason, actionLocation?}], factsetMd5, answersSent (verbatim body
  answers map), picks, mints}], finalClass: complete|gap|stall|invalid-wire|
  error, fidelity: {expected/actual table + pass}, budgetUsed {roundTrips,
  answerActs}}.
- fact-set md5 = md5 of the canonical JSON: sorted array of
  `{label, reason, actionLocation||null}` objects, no whitespace — stable
  across rounds/draws for comparison (the r2 `md5s.txt` + byte-identical-draws
  precedent). Write a flat `factsets.md5.txt` per cohort.
- `<receipts>/<cohort>/backend-log-excerpt.txt` — reqId-paired backend lines
  per draw (r2 discipline).
- `<receipts>/<cohort>/inventory-diff.json` — vocabulary delta from cohort
  start (mints taken, nothing else expected).
- Screenshots ONLY for the UI-witness draws (OQ-2): PNGs + console-error list.
- Nothing in the repo; `git -C /mnt/vast/home/brad/git/cl-integration-2 -c
  core.fileMode=false status --porcelain` must be EMPTY at run end (paste into
  report).

## PRE-BASELINE SECTION (in the report; CITE, re-run NOTHING)

The report's section 1 = the qualification's history, referenced by path:
- The 14 W2-11 gate runs: /home/brad/.hermes/cl/receipts/W2-11-ZYMO-GOLDEN-DEMO/
  (gates 1..14 dirs incl. 2026-10-12_1610-gate1-tier2, 2026-10-12_2110-run3,
  2026-10-13_0000-probe-d4-surface, 2026-10-13_2040-run13, 2026-10-14_0350-run14,
  d4-precheck-v3) + task-list D4 precheck-v3 note ("6 draws A-F never two-
  consecutive-CLEAN").
- r2 .cycles: /home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/
  2026-10-18_0630-a5d-r2-tier2/trail.json (`cycles` key, n=4 draws, unknown-set
  drift 4->6->6->6; draws 3/4 byte-identical md5s e38d83ea.../323d5d0a... per
  W28-A5h) + md5s.txt + REPORT.md.
- F1 probe: /home/brad/.hermes/cl/lanes/2/logs/step0-probe-f1-l2t1330.log
  (complete=1/5, the 61-char slot-less fixture).
- shadow-router: /home/brad/.computable-lab-lane2/shadow-router/events.jsonl
  n=317, last ts 2026-10-16T20:22Z (context only; router is NOT this producer).
State the pre-baseline honest headline: raw-draw drift 4->6->6->6, never two
consecutive clean, one completing draw in F1's 5.

## REPORT TEMPLATE (deliver once per requalification)

REPORT.md sections: (0) identity block — config-pin.json contents + md5, trunk
sha, prompt manifest md5s, sanctioned-run note; (1) pre-baseline (above);
(2) cohort results — per prompt k/n success with CLOPPER-PEARSON exact 95%
interval (the UNCERTAINTY BOUND, n=5 stated with each number; pooled k/n too),
six secondary metrics with per-instance name-lists; (3) categorical findings —
every UNANSWERABLE / erased-answer / fabricated-fact / binding-instability
instance with draw/round/reqId/factsetMd5, each with a NAMED FIX TASK proposed
(task-block: spawns named fix tasks, does not fix the eval); (4) state-drift
appendix — inventory diffs, contamination flags; (5) no-rerun attestation;
(6) VERDICT LINE, exactly one of (p_min BLANK — the worker delivers `p_min=__`
literally; Brad fills it at report time — inventing a number here is a spec
breach):

```
qualification PASS at p_min=__ (observed: P1 k/5 [lo,hi], P2 k/5 [lo,hi], P3 k/5 [lo,hi], pooled k/15 [lo,hi])
PROMOTION BLOCKED at n=__ (k=0 completing draw at some prompt — ruling-automatic, independent of p_min)
CATEGORICAL defect named: <UNANSWERABLE|ERASED-ANSWER|FABRICATED-FACT|BINDING-INSTABILITY>: <one-line, ticket name>
```

Plus the standing label the whole report must carry (ruling, MACH-1 mirror):
"budgeted qualification REPORT, live producer; not a merge gate; promotion
decision belongs to Brad (p_min holder)."

## REQUALIFICATION TRIGGERS (re-run ONLY on these; one report per trigger)

1. MODEL/CONFIG CHANGE — the config-pin.json content changes: active profile,
   endpoint baseUrl, serving-host /models identity/build, profile temperature/
   maxTokens, or the served trunk's ai-wiring files change.
2. RESOLUTION-MECHANISM CHANGE — any trunk merge touching:
   server/src/compiler/resolution/** (resolveNounsPass, resolutionEngine),
   server/src/api/handlers/IntentCompileFromPromptHandlers.ts
   (composeAnsweredPrompt / the two-LLM-call shape), the clarificationAdapter/
   ClarificationPicker surface tables, or the mint handlers.
3. Orchestrator may call an EXTRA requalification deliberately (e.g. after the
   HEDGE-TYPE-1/SAMPLE-CARD-1 pair lands, if the baseline was run pre-fix);
   never more than one report per trigger, never a re-run "to check".

## FIRST TARGETED CHECK (proves the approach early — run before any cohort)

`node /home/brad/.hermes/cl/lanes/2/eval/w211-qual-1/driver.mjs --mode=smoke
--prompt=p1 --out /home/brad/.hermes/cl/lanes/2/receipts/W211-QUAL-1/smoke-<ts>/`

Expected (all of it, else do NOT start the cohort):
- exit 0; prints `SMOKE OK`;
- writes `config-pin.json` (activeProfile + baseUrl + model + trunk sha +
  inventory md5 all non-empty), `draw-1.json`, `factsets.md5.txt`;
- draw-1 is a 422 NEEDS_CLARIFICATION (P1 against seeded inventory always
  clarifies pre-baseline — if smoke comes back 200 complete or 500, the stack
  or pin is wrong: STOP, report, no cohort);
- smoke draw IS NOT PART OF ANY COHORT (budget n is untouched by smoke;
  smoke's mints, if any, are inventory diffs flagged into the next cohort's
  pre-check — one more reason smoke runs P1 first and alone).

## VERIFICATION COMMANDS (complete; expected outputs)

No repo files change, so the repo suites are unchanged-baseline checks:
1. `node --check /home/brad/.hermes/cl/lanes/2/eval/w211-qual-1/driver.mjs`
   -> silent, exit 0. Same for capture-config.mjs.
2. Smoke (above) -> `SMOKE OK`, exit 0.
3. Cohort: `node .../driver.mjs --mode=cohort --prompts=p1,p2,p3 --out
   /home/brad/.hermes/cl/lanes/2/receipts/W211-QUAL-1/<ts>/` -> exit 0; prints
   per-cohort `PROMPT pN: k/5 complete (budget spent: RT=x AY=y)` lines and
   `COHORT DONE`; writes REPORT.md whose verdict line contains the literal
   `p_min=__`.
4. Completeness audit: per cohort, `ls draw-*.json | wc -l` == 5 exactly (not
   5-or-more, not 4); every draw-*.json validates against the receipts-format
   field list (driver emits `AUDIT OK` from `driver.mjs --mode=audit`).
5. Zero-product-edit proof: `git -C /mnt/vast/home/brad/git/cl-integration-2
   -c core.fileMode=false status --porcelain` -> EMPTY; plus
   `git -C ... diff --stat c7fdee02..HEAD` untouched by this item (no commits).
6. No repo suites to run (nothing under test/changed); the app/server baselines
   (app full-run fail-file band 60-62, server tsc 0, app tsc file-set comm
   EMPTY per handoff l2t1510 trunk-debt) are trivially unchanged — say so in
   the report, don't re-run.

## WORKER CONTRACT

- Executor: cl-coder (or an orchestrator-run driver — QUAL is eval, not code
  review; orchestrator's choice at promotion). ONE worker; no fleet-lock coder
  overlap with the live W211-MACH-1 / SAMPLE-CARD-1 / HEDGE-TYPE-1 chain
  (queue behind them; smoke may run read-only any time, cohort runs when the
  stack is quiet — the cohort's own traffic must not interleave with another
  worker's backend turns or the reqId pairing is poisoned).
- Worktree (docs/report path only if orchestrator wants it in-repo):
  `/mnt/vast/home/brad/git/wt/W211-QUAL-1-lane2-l2t<ts>`, branch
  `feat/W211-QUAL-1-lane2-l2t<ts>` off the THEN trunk tip of cl/integration-2;
  ZERO product commits expected — worst case a docs-only commit under
  .hermes/plans/. All eval artifacts live OUTSIDE the repo (lane dir above).
- Unique deliverables: eval dir `eval/w211-qual-1/` (shared, version-
  controlled by md5 manifest + git-ignored lane dir), receipts
  `receipts/W211-QUAL-1/<UTC-stamp>-<l2t id>/`, report inside that dir at
  `REPORT.md`; report copy `.hermes/plans/W211-QUAL-1-report.wip-l2t<ts>.md`
  (worktree) if in-repo path chosen.
- End stdout exactly: `W211-QUAL-1 DONE <sha|lane>` (lane = no repo commit;
  orchestrator promotes from the lane dir).
- Never: edit trunk, restart stacks, PATCH/PUT/activate config, seed or delete
  records, touch :3001/:5174, mint refKind != 'material', re-run a draw slot,
  choose a p_min, or edit prompts/expectations after the first cohort draw.

## REVIEWER BAIT (anticipated adversarial review — pre-empt these)

- p_min invention: grep the report for a NUMERIC p_min — there must be none;
  the literal `p_min=__` must appear. The k=0/PROMOTION-BLOCKED line is the
  ONLY self-asserted blocking (it is the ruling verbatim, not a threshold).
- Retry-until-green smell: receipts audit draw count == n EXACTLY; report
  contains the no-rerun attestation; any draw count > n or a "replaced draw"
  sentence is the reviewer's kill-shot — the driver is written so it CANNOT
  overwrite draw-k.json once written (fail loud on collision).
- Clarification-free gamification: success counts completions AFTER answers;
  a clarification-free draw counts but the report shows both columns
  (with-answer successes vs silent completions) so a silent-guess producer
  can't launder a 5/5.
- Nonce temptation: no prompt mutation after freeze — `prompts/manifest.json`
  md5s must match the per-draw recorded prompt md5; mismatch = invalid run.
  (Explicit divergence from MACH-1's per-cohort-fresh-noun bait: QUAL measures
  a pre-registered text; the state-contamination flag + inventory diff is the
  honest substitute. If the reviewer demands true freshness, that is a data-
  repo scrub decision for Brad, not a worker trick — flag as OQ-1 companion.)
- DECK-FOLD-1 / inventory writes: `inventory-diff.json` must show ONLY
  product-minted MAT- records (refKind material). Any other delta (deletions,
  labware, non-mint writes) = run invalid.
- Labware mint trap: any mint with refKind != 'material', or any mint act for
  an `actionLocation.argument:'labware'` fact, is a defect finding + invalid
  answer act, never a workaround (material-only floor, A5h Q3).
- Erased-answer blindness: success requires trace 2 (answers visible in the
  recomputed intent), not merely "final draw was 200" — a draw that completes
  by the model ignoring the answer is FAIL with FABRICATED-FACT/ERASED-ANSWER
  named. The report's fidelity tables are per-draw, not aggregated.
- Fact-set md5 canonicalization: md5 is over the CANONICAL sorted minimal
  projection, so "identical drift" claims (r2-style) are comparable; raw-body
  md5s would flap on timestamps — state the projection in the report appendix.
- exactOptionalPropertyTypes: backend-only (CLAUDE.md rule 6); this item
  touches no TS in the repo; the .mjs driver must still model absent-vs-empty
  honestly (e.g. omit `actionLocation` when the fact has none, never null-vs-
  undefined drift inside the same run's canonicalization).
- YAML-reload trap: N/A by design (no YAML edits, no restart) — say so; a
  reviewer should see zero stack-restart evidence in receipts.
- Ontology terms: prose names `[[labware:id|label]]` / `[[material:id|label]]`
  A5h idiom exactly; `outcome:'complete'` vs `outcome:'gap'` vs
  `needs-clarification` verbatim; reasons `ambiguous-noun` / `unknown-noun` /
  `not-stated` verbatim (scientist-intent unresolved-fact shapes;
  `actionLocation {actionIndex,action,argument}` — verified live in
  probeA-run1.json); never paraphrase enum values in metrics.
- Scope creep toward MACH-1: the report must NOT claim determinism, byte-
  stability, or "the machinery works" (that's MACH-1's verdict); if QUAL's
  machinery legs fail (e.g. mint 500s), it files the defect and keeps drawing.

## OPEN QUESTIONS (recommendations; orchestrator rulings at promotion)

- OQ-1 COHORT SIZE: recommend n=5 per prompt x 3 prompts = 15 draws. Checked:
  the ruling's blocking language is 0/5; F1 ran n=5; gate-14's failure was
  quality not sample size; n=10 roughly halves an already-huge exact CI (at
  k=3/5 CI is about [0.12,0.86]; at k=6/10 about [0.26,0.81] — marginal
  information for 2x endpoint time and 2x state-drift exposure). If Brad wants
  a tighter bound for the promotion decision, n=10 on P1 only is the
  cheapest upgrade; this spec's budget math scales linearly.
- OQ-2 SURFACE OF ANSWERS: recommend headless-primary (answers through
  POST /api/intent/compile-from-prompt's own answers map — the exact payload
  the real surface sends per ProtocolLocalizationThread handleClarificationPick
  :382-396 + composeAnsweredPrompt, the retired-D4/r2 replay precedent) PLUS
  one UI-witness draw per prompt (cl-browser-reviewer or scripted playwright on
  :5193: pl-clarify cards -> pl-submit-answers -> A5h idioms) to prove the
  headless seam is faithful. Checked: task block says "via the real surfaces /
  the A5h idiom" — ambiguous; full-browser n=15 is ~10x wall-time and duplicates
  MACH-1's browser gate; the headless replay IS the product's data-binding path
  (THREAD-ASK-1 answer binding), only the mouse is missing. If the orchestrator
  rules browser-only, the budget section stands but the run must be re-planned
  for ~1 coder-shift, and the UI-witness rows collapse into the cohort.
- OQ-3 IDENTITY SANCTION: which profile is the baseline identity — whatever
  :3093 has live (capture verbatim; history says it has drifted: qwen3.8-
  thunderbeast at l2t0354 activation vs DS-v4.1-OR in config.yaml at
  c7fdee02) or an orchestrator-sanctioned activation before the cohort
  (orch-owned POST activate, then capture)? Checked: configHandlers
  :212/:520/:603 routes exist; the config file lags live activation; gate-14
  history predates both profiles' current configs. Recommendation: orch
  sanctions explicitly at promotion; worker captures whatever is live and
  STOPs on mismatch with the sanctioned identity.
