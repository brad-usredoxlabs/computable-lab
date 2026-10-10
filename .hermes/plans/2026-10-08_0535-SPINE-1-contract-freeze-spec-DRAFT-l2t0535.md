# SPINE-1 — Freeze the resolution/clarification contracts and inventory the verb union as data
Spec draft (lane 2, l2t0535) — 2026-10-08. Trunk verified at 18e7b670 (contains c1e9e1e6).
Worker: cl-senior. Headless, server-only. NO UI, NO browser gate.

## 1. Purpose (why-block, verbatim intent from the task list)
One contract before consumers move. SPINE-1 is CHARACTERIZATION-FIRST, CONTRACT-ONLY:
write failing tests that pin TODAY's behavior of scientist-intent parsing, normalization
hint-preservation (sourceHint/targetHint/labwareHint), and labware-hint lowering
(ProtocolIntentLowering labwareCandidates + deckSlot) BEFORE anything moves; then extend the
scientist-intent contract (schema-validated, backward compatible) with argument-location
identity, expected-domain slots, and the clarification candidate shape; and freeze the real
verb set as an explicit fixture — the migration baseline. These pins are what let SPINE-3
change hint handling without regressing the working labware path. This wraps the EXISTING
ScientistIntent/parseScientistIntent seam; it adds NO second language, NO resolver API, NO
resolution engine (that is SPINE-3), NO verb-vocabulary YAML extraction (SPINE-2), NO pipeline
pass (SPINE-4), NO route change (SPINE-5).

## 2. VERIFIED file map (every line opened on 18e7b670; scout-free)

### 2.1 ScientistIntent / parseScientistIntent
- server/src/compiler/scientistIntent/types.ts — the wire contract types.
  - ScientistIntentActionKind union: types.ts:12-47. **VERIFIED COUNT: 31 verbs** (counted
    by extraction of every quoted literal in the union: 31). The task's "31" is TRUE today.
  - Action value with hint fields: types.ts:49-81 — source? :53, sourceHint? :54,
    sourceWells? :55, target? :56, targetHint? :57, targetWells? :58, labware? :59,
    labwareHint? :60 (all optional strings; exactOptionalPropertyTypes on server —
    server/tsconfig.json:13).
  - Clarification shape ALREADY EXISTS: ScientistIntentUnresolvedFact
    {label, reason, candidates?: [{label, confidence?}]} — types.ts:83-87.
  - ScientistIntent {kind, version:'0.1.0', intentId, sourcePrompt?, actions, unresolved}:
    types.ts:89-96; version constant SCIENTIST_INTENT_VERSION '0.1.0' :99; guard
    isScientistIntent :115-121.
- server/src/compiler/scientistIntent/parseScientistIntent.ts — Ajv sole authority.
  - Schema $id constant :16-17; validator cached in a MODULE-LEVEL singleton _validator
    :19-32 (reads schema/workflow/scientist-intent.schema.yaml from process.cwd()/schema —
    server/schema is a symlink to the repo schema/ dir; verified). YAML-RELOAD TRAP, see §8.
  - ScientistIntentValidationError :34-41.
  - KNOWN_ACTIONS set: parseScientistIntent.ts:43-50 — **VERIFIED COUNT: 31** (extracted:
    31, includes 'seed'), set-equal to the types.ts union (symmetric diff empty, verified).
  - normalizeDocument :52-106 — the silent-drop filter: unknown action names dropped :67;
    string fields kept only if non-blank via a whitelist that INCLUDES source/target/
    sourceHint/targetHint/labware/labwareHint :69-75; sourceWells/targetWells arrays :76-78;
    finite numbers :79-83; volume passthrough :84; params passthrough :85. unresolved
    normalization keeps {label,reason} + candidates only when non-empty :88-104 (confidence
    kept only when typeof number :95).
  - parseScientistIntent :112-137: YAML parse -> object check -> Ajv validate (schema is
    the gate; normalizeDocument drops unknown actions AFTER validation passes — belt and
    braces, both pin them).

### 2.2 The JSON schema + lint pair (contract home)
- schema/workflow/scientist-intent.schema.yaml (166 lines):
  - $id :2; additionalProperties:false :11; required [intentId, actions] :12-14.
  - action enum :36-71 — **VERIFIED COUNT: 31** (parsed the enum with the yaml lib: 31,
    symmetric diff vs the types.ts union EMPTY — they agree today).
  - symbolic label fields source/sourceHint/sourceWells/target/targetHint/targetWells/
    labware/labwareHint :73-96; quantities :98-137; params open object :135-137.
  - unresolved[] shape :139-166: required [label, reason]; candidates[] items required
    [label], confidence type number minimum 0 maximum 1 :164-166 — the confidence SCALE is
    already declared here (0..1); SPINE-1 must state it is a declared scale, NOT claimed
    calibrated.
- schema/workflow/scientist-intent.lint.yaml — 2 rules today (serial-dilution-requires-factor
  :13-28, symbolic-labels-non-empty :31-45); header :1-7 states per-action branching is NOT
  expressible in the scalar DSL — business policy additions go HERE, never TS branches
  (server/src/lint/LintEngine.ts:5 "Business rules MUST live in *.lint.yaml, NOT in code";
  discovery via server/src/lint/LintSpecLoader.ts:13 '.lint.yaml').

### 2.3 Normalization hint-preservation (what SPINE-1 must pin)
- server/src/compiler/scientistIntent/normalizeScientistIntent.ts:
  - ScientistIntentNormalized {protocolIntent?, candidateEvents, unresolvedRefs} :26-30.
  - PATTERN_ACTIONS set (the 4 geometric macros) :33.
  - firstString priority order: ['source','sourceHint'] :107/:167,
    ['target','targetHint'] :108/:168, ['labware','labwareHint'] :109/:169 — HINT IS ONLY
    USED WHEN THE PRIMARY LABEL IS ABSENT/BLANK. Pin this precedence.
  - toCandidateEvent :102-153: event.source_labware / destination_labware+target_labware_id
    / labware+labware_id :110-118; param key mappings table :121-139; params spread without
    overwriting :146-150.
  - toPattern :50-79 puts targetHint/labwareHint into pattern params :68-69;
    serialDilutionPattern :81-100 maps action.target->params.targetHint and
    action.source->params.sourceHint :90-91 (NOTE: for serial_dilution the raw symbolic
    labels become *Hint params — a real behavior quirk, pin it).
  - symbolicLabels map -> labwareInstances :159-196: id===label, labwareHint=label, role
    source/target, resolutionStatus 'candidate' — FIRST-ROLE-WINS via updateSymbol :242-245
    (existing role never overwritten). Quirk at :172: the harvest/passage/transfer ternary
    returns 'target' on BOTH arms — characterize, do not "fix" here.
  - unresolved facts become unresolvedRefs {kind:'unresolved_symbol',label,reason} :198-204
    — NOTE: candidates are DROPPED at this step (the normalized type has no candidates
    field, :29). Pin this as today's boundary; SPINE-3's engine is what will carry them.
- server/src/compiler/scientistIntent/liftScientistIntent.ts — verb synonyms
  ACTION_SYNONYMS :32 (aspirate/dispense->transfer, centrifuge/pellet->spin, dry->incubate,
  repeat_cycle->mix, …); canonicalActionName :103-106. The 31-verb inventory is CANONICAL
  verbs only; synonym coverage is characterization-adjacent, already pinned by
  scientistIntent.test.ts:268-296.

### 2.4 Labware-hint lowering (labwareCandidates + deckSlot)
- server/src/compiler/protocolIntent/ProtocolIntentLowering.ts:
  - ProtocolIntentLoweredCandidateLabware {hint, reason?, deckSlot?} :14-18 (exactOptional-
    PropertyTypes: compact() :31-35 strips undefined before return — the repo pattern).
  - candidateLabware() :194-202 — hint = labware.resolvedRecordId ?? labware.labwareHint
    :196; reason = role-bearing string :197-199; deckSlot carried when present :200.
  - lowerProtocolIntentLabwareCandidates :204-223 — labwareInstances first, then tips
    (:206-213) and waste (:214-221) ONLY when they carry a deckSlot.
  - pass createLowerProtocolIntentPass :310-381 — id 'lower_protocol_intent', reads
    'ai_precompile' :316; blockers suppress operation lowering but STILL emit
    candidateLabwares :338-344 (pin this: candidates survive blockers).
- server/src/compiler/protocolIntent/ProtocolIntent.ts — labware instance fields:
  labwareHint :72, deckSlot? :73, resolutionStatus? :78, resolvedRecordId? :79; tips/waste
  deckSlot? :128,:136.
- Downstream consumers of deckSlot (pin as the boundary, touch NONE of it):
  - resolve_labware pass: ChatbotCompilePasses.ts createLabwareResolvePass :1537, id
    'resolve_labware' :1541; merges ai_precompile + lower_protocol_intent candidateLabwares
    :1543-1548; zero-match -> labwareAdditions with deckSlot carried :1584-1592; one-match
    resolve + placement-on-slot :1594-1604; multi-match picks top + 'ambiguous_labware_hint'
    info diagnostic :1606-1620.
  - plan_deck_layout createPlanDeckLayoutPass :3222, first-wins-on-conflict pinning :3237-3244.
- The synthetic seam: server/src/compiler/scientistIntent/compileScientistIntent.ts
  buildRegistry :81-116 — synthetic 'ai_precompile' pass returns the normalized object
  :85-89 (NO candidateLabwares from normalizeScientistIntent — on the scientist-intent path
  candidates exist ONLY via lower_protocol_intent). Declared pipeline:
  schema/registry/compile-pipelines/scientist-intent-compile.yaml.
- Prompt-side verb lists (also copies of the 31; SPINE-2 deletes them as authority, SPINE-1
  only records them): intentCompile.ts INTENT_COMPILE_SYSTEM_PROMPT (starts :56) verb block
  :80-85;
  INTENT_ACTIONS :140-146 — **VERIFIED COUNT: 31**.

## 3. Characterization test plan (RED-first)
Existing fixtures/tests (all VERIFIED passing on trunk right now — 27 tests, 2 files):
- server/src/compiler/scientistIntent/scientistIntent.test.ts — 20 tests: THREE_ACTION
  3-action fixture :8-23; full-vocab accept :35-50; unknown-action reject :52-58; normalize
  folds :65-90; small-LLM driver mocks :92-215; lift tests :268-340; branch-questions
  :342-382. Inline YAML strings, no external fixtures for this module (the
  server/src/compiler/pipeline/fixtures/*.yaml set belongs to the prompt-eval harness —
  do NOT reuse; it is a different contract).
- server/src/compiler/protocolIntent/ProtocolIntentLowering.test.ts — 7 tests; the
  candidate-labware lowering pin is test :47-83; blocker-emits-candidates :239, :310.
- server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts — route-level (SPINE-5's
  turf; do not extend here).

New test files (RED first — land failing tests + fixture in the same commit as the schema
extension, but verify each RED test is red for the RIGHT reason first):

1. server/src/compiler/scientistIntent/scientistIntentContract.test.ts
   named test ids matching the verified-by names:
   - 'scientist-intent-contract.compatibility': re-validates EVERY inline fixture body from
     scientistIntent.test.ts (THREE_ACTION, the 9-verb doc, the lift outputs, tool-call
     payloads) against the EXTENDED schema with zero errors — all current fixtures pass
     unchanged. Harness style: server/src/schema/ProtocolProseFieldsSchema.test.ts (explicit
     schema load + createValidator({strict:false}) per test, NOT the cached singleton —
     see reviewer bait).
   - 'verb-inventory': reads server/src/compiler/scientistIntent/fixtures/
     verb-inventory.yaml (new, see §6) and asserts, in-test, three equalities:
     fixture verbs == the types.ts union (import ScientistIntentActionKind is a type —
     extract by importing INTENT_ACTIONS? NO: parse the union text out of types.ts with the
     same regex the spec author used, OR assert against a runtime-visible list). Recommended
     implementation: read types.ts source, extract /export type ScientistIntentActionKind
     = ...;/ literals, expect set == fixture == schema enum (parse
     schema/workflow/scientist-intent.schema.yaml with the 'yaml' lib like §2.2 was
     verified) == KNOWN_ACTIONS == INTENT_ACTIONS (import from intentCompile.js — it is a
     runtime const). Assert LENGTH 31 AND set equality, so adding/removing anywhere trips.
   - characterization pins: hint precedence (source beats non-blank sourceHint; blank-string
     source dropped by normalizeDocument :74 so sourceHint SURVIVES — pin exactly this),
     serial_dilution label->*Hint params quirk, first-role-wins symbolicLabels, unresolved
     candidates dropped at normalize (:198-204), unknown-action double-reject (Ajv + KNOWN).

2. server/src/compiler/scientistIntent/clarificationContract.test.ts
   - 'clarification-contract.argument-location': after §4 extension, an unresolved entry may
     carry optional {actionIndex, action, argument} and the parse round-trip preserves it
     exactly under exactOptionalPropertyTypes (absent !== undefined: assert
     Object.keys / 'in', NOT toEqual-with-undefined). Malformed (actionIndex non-integer,
     action not in the 31, argument blank) => ScientistIntentValidationError with the
     offending instancePath named. A fabricated action value ('evaporate') in an
     unresolved.argument-location IS REJECTED (this is the "fabricated canonical refs
     rejected" half — the verb enum is the fabrication gate at the contract layer).
   - confidence: 0..1 accepted, 1.5 and -0.1 rejected, ABSENT accepted; test comment states
     the scale is DECLARED, not calibrated (schema :164-166).

3. server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts —
   sibling to the existing lowering test (do NOT edit the existing file's pins):
   - 'characterization.hint-to-candidate': ProtocolIntent with labwareInstances carrying
     labwareHint + deckSlot variants -> lowerProtocolIntentLabwareCandidates emits
     {hint: resolvedRecordId ?? labwareHint, reason, deckSlot?}; tips/waste WITHOUT deckSlot
     are absent (:207, :215 continue-guards).
   - 'characterization.deckSlot-passthrough': end-to-end through compileScientistIntent with
     a stubbed searchLabwareByHint — deckSlot reaching labwareAdditions when a hint
     resolves (ChatbotCompilePasses.ts:1598-1603) and first-wins on two hints claiming one
     slot. NOTE: on the scientist-intent path normalizeScientistIntent NEVER sets deckSlot
     (§2.4) — pin that too (deckSlot arrives only via ProtocolIntent resources / the
     deterministic precompile path, DeterministicPrecompilePass.ts:42,:294).
   - 'characterization.blockers-keep-candidates': validation blocker -> zero events,
     candidateLabwares STILL present (:338-344).

## 4. Contract extension shape (schema-validated, backward compatible)
All three extensions land as OPTIONAL properties on the existing schema objects + matching
optional fields on the TS types. Existing documents validate and normalize byte-identically.
1. Argument-location identity — on unresolved items (the clarification IS the unresolved
   fact; no second clarification object):
     actionLocation?: { actionIndex?: integer >= 0,
                        action?: string (the 31-verb enum — same enum ref),
                        argument?: string minLength 1 }   # e.g. 'source' | 'target' | 'labware' | param name
   Schema-validated against the same verb enum => fabricated verbs rejected (§3.2).
   TS: ScientistIntentUnresolvedFact gains actionLocation?: {…all optional members}.
   Backward compat: absent today, ignored by normalizeDocument's unresolved fold TODAY —
   SPINE-1 must extend normalizeDocument :88-104 to PRESERVE actionLocation (and
   candidates, see open question Q1 ruling) on the parsed document (parse-level), while the
   normalizeScientistIntent unresolvedRefs boundary (§2.3) may stay candidates-dropped —
   pin that split in the characterization test, SPINE-3 widens it.
2. Expected-domain slots — on action items: expectedSourceDomain? / expectedTargetDomain? /
   expectedLabwareDomain?: string (free-text domain tag, minLength 1). Declaration ONLY:
   nothing consumes them until SPINE-2's vocabulary YAML references them and SPINE-3's
   engine evaluates them; the schema description says so. NO knowledge-layer ontology term
   validation fires in SPINE-1 (see open questions).
3. Clarification candidate shape — ALREADY on the schema (:139-166) and types (:83-87).
   SPINE-1 adds NO field here; it FREEZES it: verb-inventory-style test asserts the schema
   candidates item == {label required, confidence optional 0..1, additionalProperties
   false, unevaluatedProperties false} so SPINE-3 cannot silently widen it.
exactOptionalPropertyTypes discipline: every optional field is written with conditional
spread (types.ts:109 pattern, parseScientistIntent.ts:102 pattern,
ProtocolIntentLowering.ts compact()). Never `x: undefined`.

## 5. Acceptance criteria (verbatim from the task list 'verified by')
  scientist-intent-contract.compatibility (all current fixtures pass unchanged);
  clarification-contract.argument-location (action+argument unambiguous; malformed/fabricated
  canonical refs rejected; confidence scale declared, not claimed calibrated);
  characterization artifacts committed showing current hint->candidate->deckSlot behavior;
  verb-inventory fixture == 31, diffed against types.ts union in-test.
Plus repo gates: `npm run typecheck -w server` — no new errors beyond the pin (§7);
targeted vitest files green; no changes to app/**.

## 6. Placement rules (repo conventions, verified)
- Tests: vitest include src/**/*.test.ts, cwd server (server/vitest.config.ts). Contract
  tests go ALONGSIDE their module: server/src/compiler/scientistIntent/*.test.ts
  (scientistIntent.test.ts precedent). Lowering characterization goes beside
  ProtocolIntentLowering.test.ts. Harness style for schema-loading tests:
  server/src/schema/ProtocolProseFieldsSchema.test.ts (per-test fresh validator — REQUIRED,
  see bait).
- Verb inventory fixture: server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml
  — mirrors the existing sibling-fixtures convention (server/src/compiler/pipeline/
  fixtures/*.yaml live next to their runner tests; no __fixtures__ under scientistIntent
  today, this creates it). Format: `version: 1` + `verbs: [ … 31 … ]` sorted EXACTLY in
  types.ts declaration order (order is part of the pin — the migration baseline).
  Header comment: "SPINE-1 migration baseline; SPINE-2 moves authority to vocabulary YAML;
  this file changes only together with a deliberate vocabulary change."
- Schema/lint YAML: extensions go in schema/workflow/scientist-intent.schema.yaml; any
  cross-field business rule (e.g. "actionLocation.argument must name a field present on
  the action at actionIndex" IF it proves un-expressible in JSON Schema) goes in
  schema/workflow/scientist-intent.lint.yaml, NEVER a TS conditional (LintEngine.ts:5).
  Do NOT add new lint rules for things the schema enum/required already express.
- No new route, no handler edits, no app/ edits, no prompt edits (prompt verb-list deletion
  is SPINE-2). Out of scope explicitly: IntentCompileFromPromptHandlers.ts, runChatbotCompile.ts,
  ChatbotCompilePasses.ts (read-only pins), liftScientistIntent.ts, schema/registry/
  compile-pipelines/scientist-intent-compile.yaml, ALL of app/.

## 7. Baselines the coder must respect (re-verified by the composer on 18e7b670)
- Server tsc: `npm run typecheck -w server` => EXACTLY 26 error lines across 6 files
  (AgentOrchestrator.ts 8, RecordStoreImpl.ts 11, AuthoringGuard.ts 3, ProtocolIntakeHandlers.ts 2,
  RecordHandlers.ts 1, bootstrapAdmin.ts 1). Zero NEW error lines allowed. The exit code is
  non-zero by design — compare counts, don't demand green.
- App tsc: 47 error lines / 24 files pin (handoff 2026-10-08_0035 baseline facts; the app
  tree must stay untouched so this pin is trivially stable — still RUN it once and record).
- Full-app suite: 53-failing-file SET identity (identity of the failing-file SET, not the
  count). Only relevant if app/** changed — it must not; record N/A + app tsc line instead.
- src/ai server fail-file set: `npx vitest run src/ai` from server =>
  "Test Files  10 failed | 72 passed (82) / Tests  21 failed | 625 passed (646)" — VERIFIED
  by the composer today. SPINE-1 must not change this set (it doesn't touch src/ai; run it
  once at the end anyway).
- NFS: every git command is `git -c core.fileMode=false …`. Stale-.mjs-cache: run fresh paths.
- Playwright cwd gotchas: N/A — no UI in this item.
- Lane stack :3093/:5193 restart after YAML edits is the ORCHESTRATOR's job (tsx --watch
  does NOT reload YAML); the coder does not restart the stack.

## 8. Reviewer bait (expect these in the adversarial review; pre-empt them)
1. exactOptionalPropertyTypes sites: actionLocation and its sub-fields, expected*Domain,
   candidates[].confidence, deckSlot, reason. Any `foo: bar ?? undefined` or
   `{actionLocation: undefined}` is a REVIEW FAIL. Tests must assert key ABSENCE
   (not.toHaveProperty / Object.keys) for absentals, not toMatchObject-with-undefined.
2. YAML-reload trap A (validator cache): parseScientistIntent.ts:19-32 caches the compiled
   schema in a module singleton. Contract tests MUST NOT assert schema-extension behavior
   through parseScientistIntent's singleton in the same vitest process as older imports
   unless the extension is already on disk (it will be, same commit — but a test that MUTATES
   schema text in-memory cannot reuse it). Use the ProtocolProseFieldsSchema fresh-validator
   pattern for negative/edge cases; use the real parseScientistIntent for the compatibility
   test (that is the whole point — the cached singleton is production's behavior).
3. YAML-reload trap B: the stack does not reload YAML — if the coder curls :3093 mid-work
   it sees stale schema; do not treat that as a defect, and do not restart the stack.
4. The 31 count lives in FIVE places (types.ts:12-47, schema enum :36-71, KNOWN_ACTIONS
   :43-50, INTENT_ACTIONS :140-146, prompt string :80-85). The verb-inventory test pins
   fixture + the first FOUR (runtime-extractable); the prompt string is asserted with a
   `toContain` per verb. A reviewer WILL check the test fails when one copy diverges —
   make it fail on divergence by diffing sets, not just lengths. Hardcode boundary: SPINE-1
   must NOT delete the TS copies (that's SPINE-2); the inventory fixture is data, the test
   is the drift-check.
5. Ontology terms: expected*Domain values in SPINE-1 are free-text tags. If the reviewer
   demands knowledge-layer term validation now, the answer is §4.2 — SPINE-2's vocabulary
   YAML is what will declare domains; validating tags before their vocabulary exists is the
   second-policy-home failure the lint DSL header forbids. (If ontology canonical-example
   reading is requested: docs/knowledge-layer-canonical-example.md — this item declares
   SLOTS, consumes no claim/context/assertion semantics.)
6. Do not "fix" the quirks §2 lists (:172 both-arms-'target' ternary, candidates dropped at
   normalize :198-204, first-role-wins) — they are CHARACTERIZATIONS. A fix belongs to
   SPINE-3/4 and would break the parity test SPINE-3 must pass.
7. Verb inventory order: sorted-alphabetically would silently pass a set-equality test yet
   lose the declaration-order baseline. Pin declaration order AND set equality.
8. normalizeDocument silently drops unknown actions AFTER Ajv passes (unreachable via
   schema? No — enum rejects first; the KNOWN_ACTIONS filter is defense-in-depth). Test both
   layers so a future enum-widening without KNOWN_ACTIONS update is caught (the diff test
   does this; say why in a comment or the reviewer will ask).

## 9. Worker contract
- Worktree: wt/SPINE-1-lane2-l2t0535 off cl/integration-2 (lane trunk; base >= c1e9e1e6,
  expected tip 18e7b670). Branch same name.
- Deliverable report (unique path): .hermes/plans/SPINE-1-report.wip-l2t0535.md — must
  contain: RED evidence (first-failing output of each new test BEFORE the schema change),
  GREEN final run, the five-list verb-count table with counts, tsc before/after pins, the
  src/ai fail-file set output line, and the characterization artifact list.
- Expected diff surface: schema/workflow/scientist-intent.schema.yaml;
  server/src/compiler/scientistIntent/{types.ts,parseScientistIntent.ts,
  normalizeScientistIntent.ts ONLY if §4/§3.1 demands the candidates-preservation split,
  else untouched}; new: fixtures/verb-inventory.yaml + the three test files named in §3;
  possibly schema/workflow/scientist-intent.lint.yaml. Nothing else. git diff must show
  zero app/** changes.
- First targeted check (prove the approach early, run FIRST):
  cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run \
    src/compiler/scientistIntent/scientistIntent.test.ts \
    src/compiler/protocolIntent/ProtocolIntentLowering.test.ts
  => "Test Files 2 passed / Tests 27 passed" (verified by composer today). Then write the
  verb-inventory test and make it GREEN against current code before anything RED-first —
  the inventory is a freeze, not a change.
- Verification commands (final, from repo root):
  cd server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent/ProtocolIntentLowering.test.ts src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts
    => all files pass, 0 failures.
  cd server && npx vitest run src/ai => "Test Files  10 failed | 72 passed (82)" set-identical.
  npm run typecheck -w server => 26 error lines / 6 files, none in owned files.
  npm run typecheck -w app => 47/24 (untouched tree).

## 10. Open questions + recommended rulings (orchestrator: approve or override)
Q1. Where do argument-location + candidates live on the NORMALIZED object? Today
  normalizeScientistIntent.unresolvedRefs drops candidates (:29,:198-204). Recommended:
  SPINE-1 preserves candidates+actionLocation ONLY on the parsed ScientistIntent
  (parse-level contract) and adds a characterization test pinning the normalize-level drop;
  widening unresolvedRefs is SPINE-3's first move (it owns the engine that consumes
  candidates). Why: SPINE-1 must not change downstream pass inputs at all — zero behavioral
  diff is the freeze. Checked: normalizeScientistIntent.ts:26-30,198-204;
  compileScientistIntent.ts gatherGaps :118-137 (gap message would change if reason/candidates
  merged now).
Q2. expected-domain slot granularity: one tag per argument (expectedSourceDomain etc.) vs a
  map argumentName->domain. Recommended: the three fixed optional tags (source/target/
  labware), because the wire schema is additionalProperties:false per action and a free map
  re-introduces exactly the "policy in ad-hoc keys" pattern the campaign kills; SPINE-2's
  vocabulary YAML will declare per-verb per-argument domains and can add slots then. Checked:
  schema :29-33 (additionalProperties/unevaluatedProperties false), action fields §2.1.
Q3. Should verb-inventory also freeze the ACTION_SYNONYMS map (liftScientistIntent.ts:32)?
  Recommended: NO — the synonyms are an extraction-lifter surface, not the wire contract;
  they already have behavior tests (scientistIntent.test.ts:268-296) and SPINE-2 will decide
  their data home. Freezing them here would make SPINE-2's rip-out test (removing a verb
  flips prompt+parser with zero TS edits) need two fixtures for one contract. Checked:
  liftScientistIntent.ts:32-106, intentCompile.ts:140-146.

COMPOSER DONE
