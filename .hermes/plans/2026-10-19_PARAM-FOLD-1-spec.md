# PARAM-FOLD-1 SPEC — declared-optional-absence fold in resolveNounsPass

Lane 2. Authority: ARCHITECT DECISION W28-A5j (PROMOTED, ends 'W28-A5j DECIDED'),
.hermes/plans/decisions/W28-A5j-param-hedge-declared-optionality-decision.md —
READ IT FIRST; it is the design, this spec only operationalizes it.
Trunk at authoring: c8f8c476 (code tip 8b2c973a). Orch verified the cited anchors
first-hand this tick: stable-code constants :47-49 (precedent), argumentPresent
:230-235, sweep skips kind==='scalar' and required!==true (:247-248),
answeredSlotBindings skips kind!=='resolvable' + raw-string equality (:296-301),
engine-settle + reconcile call (:383-392), blocked = clarifications.length>0 (:435).

## SCOPE (decision's "THE FIX RUN", exact)

IN (NO other file):
1. server/src/compiler/resolution/resolveNounsPass.ts
   - `export const NOT_STATED_REASON = 'not-stated' as const` beside :49.
   - The fold: a MODEL-side unresolved fact (input of reconcile =
     deps.intent.unresolved, or filter immediately after reconcileModelUnresolved
     returning model-kept facts — smallest diff) is DROPPED before the bar iff ALL:
     (1) actionLocation.actionIndex !== undefined && typeof
         actionLocation.argument === 'string'
     (2) vocabulary.argContracts(actionLocation.action) contains c with
         c.name === actionLocation.argument  (no contract -> KEEP)
     (3) c.required !== true
     (4) !argumentPresent(fields[c.name]) on the parsed action at
         actionLocation.actionIndex  (arg ABSENT)
     (5) fact.reason === NOT_STATED_REASON
     Folded facts NEVER enter `clarifications` (:418) hence never count toward
     `blocked` (:435). Engine clarifications and gated survivors (:406-412) are
     UNTOUCHED by construction — the folded set must NOT be computed by
     identity-matching against engine clarifications.
2. Tests: server/src/compiler/resolution/resolveNounsPass.paramFold.test.ts
   (sibling-file precedent: resolveNounsPass.answeredNouns.test.ts).

OUT (a diff touching these IS the defect — HEDGE-TYPE-1 discipline):
intentCompile.ts, schema/registry/prompt-templates/intent.compile.system.yaml
(mirror rules stay byte-unchanged; promptShapeParity + mirror-drift suites green
UNTOUCHED), resolutionEngine.ts, ANY app/ file, any schema yaml, the golden
fixture, the probe answers map, reconcile's DROP/MERGE/KEEP arms, the §5.2 sweep,
answeredSlotBindings, the gate (:435).

ZERO domain literals: bead_beat/duration/cycles/temperatureC appear NOWHERE in
product code OR test code (tests pin via argContracts entries with
required===false iterated from vocabulary data, per decision VERIFIED-BY 1).

## VERIFIED-BY (decision's list, operationalized — all fake-LLM/unit, deterministic)

V1 RED-first pin from the probe shape: model facts {label:'Lyse the sample (gate
   2025)', reason:'not-stated', actionLocation:{actionIndex:0,
   action:<fixture verb>, argument:<three names pinned via vocabulary data, not
   literals>}} on an intent OMITTING those params -> post-pass zero clarifications
   from them, blocked:false. RED at base.
V2 KEEP-arm guards, separate tests: (a) param PRESENT -> KEPT (guard 4);
   (b) reason 'ambiguous' on absent optional -> KEPT; (c) no actionLocation ->
   KEPT (guard 1); (d) actionLocation naming an arg NOT in the verb's contracts ->
   KEPT (guard 2); (e) engine missing-required-argument fact NEVER folded;
   (f) absent required:false RESOLVABLE -> FOLDED; present required:false
   resolvable (SAMPLE-CARD-1 class) -> KEPT.
V3 Characterization: engine clarification + gated survivor ride the pass
   byte-identically with the fold installed (existing suites green, order kept).
V4 No-prompt-change pin: hedgeOptionality.test.ts + promptShapeParity.test.ts +
   mirror-drift suite PASS with an EMPTY diff on intentCompile.ts + mirror yaml.
V5 Suite baselines: npm run test:run -w server — failing-file-set comm-empty vs
   same-worktree baseline; typecheck: npm run typecheck -w server — error set
   comm-empty vs baseline (33-line trunk baseline applies; no NEW).
V6 DOWNSTREAM-CONSUMER CHECK (decision's UNCERTAINTY obligation, mandatory):
   verify the 422/needs-clarification payload AND the localization-thread card
   source read the resolve_nouns `clarifications`, not raw parsed
   intent.unresolved; name the files in the report. If any surface renders raw
   unresolved entries -> STOP-BLOCKED return as new named fact (second fold point
   NOT pre-authorized).

## WORKER CONTRACT

- Worktree /mnt/vast/home/brad/git/wt/PARAM-FOLD-1-lane2-l2t0135 off the trunk
  tip of cl/integration-2 AT FLEET-LOCK ACQUISITION (wrapper records tip; MUST
  contain 8b2c973a; GAPCARD-1 merge may or may not be in — either is fine, this
  item touches ZERO app/ files, no conflict possible).
- Branch feat/PARAM-FOLD-1-lane2-l2t0135. node_modules symlinks — install
  nothing. All git -c core.fileMode=false. cl-lane-sync caveat as per GAPCARD
  prompt (server/src untracked imports: replicate needed symlinks yourself).
- Report .hermes/plans/PARAM-FOLD-1-report.wip-l2t0135.md (worktree): commands +
  RAW outputs incl. RED log, V1-V6 evidence, comms, scope diff
  (git -c core.fileMode=false diff <base>..HEAD --name-only == the 2 files +
  nothing else). End stdout exactly 'PARAM-FOLD-1 DONE <sha>' or
  'PARAM-FOLD-1 BLOCKED <reason>'.
- Gates after DONE: cl-adversarial-reviewer (mandatory), then orch verify, then
  orch merges. NO browser gate (compiler-only, zero UI surface change; V6 covers
  the downstream question at the payload-source level).

## GATE CONSEQUENCE (post-merge, orch executes — not the worker)

step0 probe r4 = copy of r3-v2 script, containment ADDS fold SHA alongside
b52f5dfc/5cdfb8d0/aea12351/8b2c973a, same fixture + gate-exact answers (do NOT
add param answers — A5h Q4). ARMS per decision §STEP-0 PROBE r4: A >=1 complete
-> tier-2 gate proceeds (pre-filled template prompts/review-W28A5d-r3-TEMPLATE-
l2t2010.txt); B same-class survivor -> fold defect, return log, no force;
C/D new class or regression -> named fact / honest FAIL, one-shape-at-a-time.