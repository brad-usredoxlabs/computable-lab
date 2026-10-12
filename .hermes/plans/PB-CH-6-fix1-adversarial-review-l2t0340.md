# Adversarial review — PB-CH-6 fix1 (lane 2, item l2t0250)

Reviewer: cl-adversarial-reviewer (decorrelated gate). Date: 2026-10-08 ~03:30 EDT.
Candidate: /mnt/vast/home/brad/git/wt/PB-CH-6-fix1-lane2-l2t0250
Branch: cl/PB-CH-6-fix1-lane2-l2t0250 @ 0ca15d95 (b4df539e tests, 6505495b feat, 0ca15d95 report)
Base: cl/integration-2 @ 6e7abc6f. Diff read with `git -c core.fileMode=false diff cl/integration-2...HEAD`.

Bindings read: spec .hermes/plans/2026-10-08_0250-PB-CH-6-accept-leg-compliance-fix-spec.md;
architect decision .../decisions/PB-CH-6-accept-leg-compliance-decision.md; coder report
.hermes/plans/PB-CH-6-fix1-report.wip-l2t0250.md. Every file in the diff was read in full.

============================================================================
## VERDICT SUMMARY
============================================================================

ACCEPT. No defect found in the introduced change. Gate ran the targeted tests, the full
scoped suite, and server tsc itself; all reproduce. Three PRE-EXISTING menu/schema
divergences are documented as non-blocking observations (out of F2's enumerated scope and
not introduced by this diff). Zero surface/kind literals in TS code paths.

============================================================================
## ACCEPTANCE CRITERIA (verbatim from spec) AND HOW EACH WAS CHECKED
============================================================================

F1.1 NEW server/prompts/workstate-compose-rules.md, byte-consistent with the tool envelope,
     stating: every tab {surface,target}; target term xor recordId (store-verified, never
     invent); one tab per named record; a surface NAME is never a target; never empty
     agent_intent; ONE worked full-envelope example; coins no surface words.
  CHECKED: read the md in full (7 lines, 1256 bytes). Paraphrase-verified every mandated
  bullet is present (lines 2-7). Worked example parsed by hand against
  schema/workflow/workstate-intent.schema.yaml: inner envelope {operation:"compose-workstate",
  tabs:[{surface,target:{recordId},title}], activeTab:{index:0}} — operation const ok, tabs
  minItems ok, tab required[surface,target] ok, recordId branch ok (recordId only,
  additionalProperties:false), title string ok, activeTab index branch ok, top-level
  additionalProperties:false ok. Example is schema-conformant. No surface word coined: the
  example uses the placeholder "<a registered surface id from the tool menu>"; test asserts
  absence of workspace.deck/protocol-builder/run-design/literature/event-editor. PASS.

F1.2 NEW config/drafting/workstate-composition.yaml — rules:{surfaces:[analysis,literature,
     protocol-builder], file: prompts/workstate-compose-rules.md}; absent=off; malformed
     throws; excludes workspace.deck; header documents every key.
  CHECKED: read the file. surfaces list exactly as prescribed; workspace.deck deliberately
  absent; header documents surfaces/file/absent/malformed/empty semantics and the deck
  exclusion. PASS.

F1.3 Loader module mirroring analysisReferenceGrounding.ts: per-call policy read, NO process
     cache; md via loadPromptTemplate; push at buildPrefixRequest beside groundingBlock;
     zero surface-name/kind literals in TS.
  CHECKED: read both files side by side. loadWorkstateRulesSection() reproduces the grounding
  reader contract line-for-line in structure: parse -> reject non-object; `rules` absent/null
  => null; `rules` non-object => throw; `surfaces` absent/null => null; `surfaces:[]` => null;
  nonEmptyStringList throws on non-string/empty; `file` non-empty string else throw. YAML is
  read on every call (readFileSync inside the function, no module-level YAML cache) — the
  between-call surfaces-flip test proves it. md goes through a module promptCache keyed by URL
  (same as grounding). Grep for surface/kind string literals in the new module returned NONE.
  Push site: AgentOrchestrator buildPrefixRequest (see parity below). PASS.

F2. workstate.tabs.items: required ['surface','target']; target oneOf term xor recordId, each
     branch additionalProperties:false (mirror workstate-intent.schema.yaml EXACTLY).
  CHECKED char-for-char vs the schema. Match on every enumerated point:
    schema tab items: type object, required [surface,target], target oneOf
      - {type object, additionalProperties false, required [term], properties {term string}}
      - {type object, additionalProperties false, required [recordId], properties {recordId string}}
    menu workstate tabs items: required ['surface','target'] present; target = {description,
      oneOf:[{type object, additionalProperties:false, required:['term'], properties:{term}},
             {type object, additionalProperties:false, required:['recordId'], properties:{recordId}}]}
  XOR semantics: a {term,recordId} object fails BOTH branches (extra prop forbidden by
  additionalProperties:false) => target invalid; {term} alone validates exactly one branch. XOR
  IS enforced. `title` is a TAB-level property, untouched, still declared => the menu does NOT
  forbid a schema-allowed title. `type:'object'` correctly dropped from the target node exactly
  as the schema's oneOf-only node. PASS.

F2 open.tabs. Spec: leave untouched UNLESS a schema requires it; if a schema requires it,
     mirror ONLY that.
  CHECKED: read schema/workflow/analysis-intent.schema.yaml. open.tabs.items: type object,
  additionalProperties:false, required [surface,target], target $ref #/$defs/targetRef (oneOf
  term xor recordId, each additionalProperties:false). analysisCompile.ts:370 calls
  deps.validate(intent, ANALYSIS_INTENT_SCHEMA_ID) via Ajv — so open.tabs IS envelope-validated.
  The coder's FINDING ("a schema DOES require [surface,target] on open.tabs.items") is TRUE;
  mirroring it is required, not over-reach. The menu open.tabs.items now carries required
  ['surface','target'] + the same oneOf target. PASS.

Tests (RED first). Loader unit arms; warm/real capture parity with membership arms
     (analysis yes, workspace.deck no) and prefix identity; submitSuggestionTool unit required
     lists; full gates.
  CHECKED: read both new test files in full; ran them myself (see commands). Real assertions,
  no tautologies. PASS.

Hard constraints. No stack restart; app/** untouched; workstate-intent.schema.yaml untouched;
     SURFACE_PREAMBLES/prompts untouched except the new md; exactOptionalPropertyTypes.
  CHECKED: diff --name-only lists exactly 8 files (report + 1 config + 1 md + 2 src + 2 tests +
  new module). `diff --stat ... -- app/` EMPTY. `diff --stat ... -- schema/` EMPTY.
  systemPrompt.ts NOT in the diff => SURFACE_PREAMBLES untouched. No restart claimed. The new
  push only assigns a string|null to a local and conditionally pushes; no optional property set
  to undefined. PASS.

============================================================================
## COMMANDS RUN AND REAL OUTPUT (my own runs, not the coder's claim)
============================================================================

1) Targeted tests (workdir candidate/server):
   $ npx vitest run src/ai/workstateComposeRules.test.ts \
       src/ai/submitSuggestionTool.workstateTarget.test.ts src/ai/analysisReferenceGrounding.test.ts
   -> Test Files 3 passed (3); Tests 39 passed (39); Duration 7.40s
      (includes the UNCHANGED PB-CH-10 analysisReferenceGrounding.test.ts — 20 tests pass, so
      the rules-block push did not disturb the grounding block or its degradation arms.)

2) Full scoped suite (workdir candidate/server):
   $ npx vitest run src/ai src/drafts
   -> Test Files 10 failed | 79 passed (89); Tests 21 failed | 711 passed (732); Errors 2
   FAIL-file set (10): AgentOrchestrator.bypass, AgentOrchestratorForwarding,
     AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
     ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
     submitSuggestionTool.tubeSchema  — identical to the report's known 10-file set.
   No new failing file; my two new test files are in the 79 passed.

3) server tsc (workdir candidate/server):
   $ npx tsc --noEmit
   -> 26 error ENTRY lines (27 physical lines: the first TS2322 wraps) across 6 files:
      AgentOrchestrator.ts (8), ProtocolIntakeHandlers.ts (2), RecordHandlers.ts (1),
      AuthoringGuard.ts (3), bootstrapAdmin.ts (1), RecordStoreImpl.ts (11).
      4 distinct codes (TS2322/TS2339/TS7006/TS2305). NONE in the changed files; NONE introduced
      by this diff. Matches the lane pin 26/6.

4) Scope:
   $ git -c core.fileMode=false diff cl/integration-2...HEAD --name-only  -> 8 files (in scope)
   $ git -c core.fileMode=false diff --stat cl/integration-2...HEAD -- app/    -> EMPTY
   $ git -c core.fileMode=false diff --stat cl/integration-2...HEAD -- schema/ -> EMPTY

5) Literal grep (new module + orchestrator):
   $ grep -nE "'(analysis|literature|protocol-builder)'|\"(analysis|literature|protocol-builder)\"" \
       server/src/ai/workstateComposeRules.ts   -> NONE
   (matches in that file are only inside doc comments referencing analysisReferenceGrounding.ts /
    analysis-composition.yaml — documentation, no branch; `defaultPolicyPath` is
    workstate-composition.yaml, no surface word.)

============================================================================
## ADVERSARIAL FINDINGS
============================================================================

F2 DIVERGENCE RISK (highest priority for this gate): CLEAN.
  - Menu does NOT forbid `title` (title stays a tab property; only the target object has
    additionalProperties:false, matching the schema).
  - XOR enforced correctly (verified by branch semantics above).
  - open.tabs mirror is justified: analysis-intent.schema.yaml open.tabs.items requires
    [surface,target] and analysisCompile validates that $id through Ajv. Not over-reach.

F1 POLICY-DATA CONTRACT: CLEAN. Absent=off, malformed throws, [] = off, per-call YAML read (no
  process cache; proven by the flip test) — semantics match analysisReferenceGrounding.ts.

PUSH ORDER / WARM-REAL PARITY: CLEAN. Push lives in buildPrefixRequest (AgentOrchestrator.ts
  :1064/:1074) which is the single render path; run() reuses it at :1443 (verified). Pinned
  order instruction, forced, grounding, rules asserted by indexOf in the capture test.
  Membership arms genuine (analysis/literature/protocol-builder present; workspace.deck and
  event-editor null); workspace.deck still receives its grounding block.

PUSH-SITE / WARM-CACHE subtlety: The rules block is pure policy text and identical for every
  listed surface/turn, so it does not vary between warm and real — parity holds by construction
  (also directly asserted: buildPrefixRequest content === real run() system content).

TOKEN BLOAT: rules md = 1256 bytes vs grounding md = 1166 bytes; ~1.2KB, "KB scale", not
  KB*10. Worked example field names/wrapper match the actual agent_intent tool envelope
  ({intent, workstate:{operation,tabs,activeTab}}) and are schema-conformant.

DEVIATION CHECK (md reword to avoid 'ANALYSIS REFERENCES'): LEGITIMATE, NOT a test weakening.
  analysisReferenceGrounding.test.ts is UNCHANGED (not in the diff). Its no-grounding capture
  arm runs on surface='analysis' (:370-383), which IS a rules surface, so a rules md containing
  the literal 'ANALYSIS REFERENCES' would have false-positived the not.toContain assertion. The
  coder reworded the MD ("shown to you in the reference list above"), not the test. The assertion
  still correctly detects grounding absence. My run: analysisReferenceGrounding.test.ts 20/20 pass.

TESTS: no tautology found. assertTargetMirror asserts concrete required/additionalProperties/
  type values; the "no surface words" arm asserts real absence; the parity arm asserts byte
  equality of warm vs real system content.

SCOPE: 8 files, all in scope. app/** untouched, schema/** untouched, SURFACE_PREAMBLES/
  systemPrompt.ts untouched. No stack restart claimed (none owned by coder).

============================================================================
## OBSERVATIONS (pre-existing, NOT introduced by this diff, out of F2's enumerated scope —
## reported for the record, non-blocking, not counted as defects)
============================================================================

OBS-1. The menu's workstate tab node still omits the schema's tab-level
  `additionalProperties:false` (and minLength on surface/term/recordId). Menu looser than
  schema — a tab with an extra property passes the menu but is rejected by Ajv. Pre-existing
  and outside F2's enumerated (required + target oneOf) scope; the same loose omissions exist
  for activeTab and for the analysis open item node.
OBS-2. buildWorkstateRulesBlockForSurface resolves rules.file as repo-root/server/<file> while
  the value already contains "prompts/". This matches the spec's literal value
  (file: prompts/workstate-compose-rules.md) and the file's own header comment; noted only
  because it differs cosmetically from the grounding module's hardcoded ../../prompts/ path
  (both resolve to server/prompts/). No functional divergence for the shipped value.

============================================================================
VERDICT: accept
