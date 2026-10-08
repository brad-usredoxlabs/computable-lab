# PB-CH-6 fix1 — coder report (lane 2, l2t0250)

Branch: cl/PB-CH-6-fix1-lane2-l2t0250 (off trunk 6e7abc6f).
Spec: .hermes/plans/2026-10-08_0250-PB-CH-6-accept-leg-compliance-fix-spec.md
Decision: /home/brad/.hermes/cl/lanes/2/decisions/PB-CH-6-accept-leg-compliance-decision.md (OPTION (a), F1+F2).

## What landed

F1 — WORKSTATE COMPOSE RULES block (policy in data):
- NEW server/prompts/workstate-compose-rules.md — rule text: every workstate tab
  is {surface, target}; target is {term} xor {recordId} (store-verified, never
  invented); one tab per record named; a surface NAME is never a target (bare
  surface focus routes to compose_analysis with a listed {recordId}); never an
  empty agent_intent; ONE worked full-envelope example. Coins NO surface words
  (the example uses the placeholder "<a registered surface id from the tool
  menu>").
- NEW config/drafting/workstate-composition.yaml — rules: { surfaces:
  [analysis, literature, protocol-builder], file: prompts/workstate-compose-rules.md };
  header documents every key; workspace.deck deliberately excluded; absent
  section = off; malformed-but-present throws; surfaces: [] = off (same ruling
  as the grounding section).
- NEW server/src/ai/workstateComposeRules.ts — mirrors analysisReferenceGrounding.ts:
  per-call YAML read (NO process cache), md via a loadPromptTemplate copy
  (process-cached; stack restart deploys md edits). Zero surface-name/kind
  literals; membership is the YAML's surfaces list. No store scan (the rules
  block is pure policy text — nothing to degrade).
- Push site: buildPrefixRequest in server/src/ai/AgentOrchestrator.ts, beside
  the groundingBlock push, pushed LAST. Pinned order: instruction, forced,
  grounding, rules (capture test asserts the index order).

F2 — tool-menu target alignment (reflection, not policy):
- server/src/ai/submitSuggestionTool.ts workstate.tabs.items: added
  required: ['surface','target']; target rewritten as oneOf [ {required:[term],
  additionalProperties:false}, {required:[recordId], additionalProperties:false} ]
  — exact mirror of schema/workflow/workstate-intent.schema.yaml (:35-61). The
  target node drops its old `type: 'object'` sibling key exactly like the schema
  (oneOf-only node).
- open.tabs.items (analysis envelope): the SCHEMA proves the requirement —
  analysis-intent.schema.yaml open.tabs.items has required [surface, target] +
  $ref targetRef (oneOf term xor recordId, additionalProperties:false). So the
  menu mirrors it too (pinned in a test). FINDING: a schema DOES require it on
  open.tabs.items; the mirror is required, not optional.
- workstate-intent.schema.yaml NOT touched. Parser untouched (verbatim
  retention intact — parseAgentIntentArgs tests still green). intentToolDef is
  still computed once at construction; reference identity unchanged.

Tests (RED first — both new files failed on pristine HEAD before the impl):
- NEW server/src/ai/workstateComposeRules.test.ts (15 tests): policy reader
  (real file arms, absent section, empty surfaces, malformed throws, per-call
  read proven by a between-call surfaces flip), membership arms (analysis
  present; workspace.deck/event-editor/undefined absent), no-surface-words
  check, capture arms (analysis/literature/protocol-builder get the block;
  workspace.deck does NOT but keeps its grounding block; event-editor absent),
  push-order pin, warm/real byte-identical parity.
- NEW server/src/ai/submitSuggestionTool.workstateTarget.test.ts (4 tests):
  required lists + oneOf mirror on workstate tabs and analysis open tabs, and
  the registry-rendered clone (buildAgentIntentToolDef) carries them too.

## Commands + real outputs

1. RED (before impl):
   npm run test:run -w server -- src/ai/workstateComposeRules.test.ts src/ai/submitSuggestionTool.workstateTarget.test.ts
   -> Test Files 2 failed (2); Tests 4 failed (4) (F2 required lists undefined;
   rules module absent).

2. GREEN (after impl):
   npm run test:run -w server -- src/ai/workstateComposeRules.test.ts src/ai/submitSuggestionTool.workstateTarget.test.ts
   -> Test Files 2 passed (2); Tests 19 passed (19)

3. Scoped suite:
   npm run test:run -w server -- src/ai src/drafts
   trunk baseline (pristine HEAD, captured before edits):
     Test Files  10 failed | 77 passed (87); Tests  21 failed | 692 passed (713); Errors 2
   after changes:
     Test Files  10 failed | 79 passed (89); Tests  21 failed | 711 passed (732); Errors 2
   FAIL-file SET (comm -3 trunk vs after: EMPTY):
     src/ai/AgentOrchestrator.bypass.test.ts
     src/ai/AgentOrchestratorForwarding.test.ts
     src/ai/AgentOrchestrator.golden.test.ts
     src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
     src/ai/AgentOrchestrator.tubeGate.test.ts
     src/ai/ChatbotCompileDeckSlot.test.ts
     src/ai/chatbotCompile.e2e.test.ts
     src/ai/InferenceClient.config.test.ts
     src/ai/materialFollowUp.test.ts
     src/ai/submitSuggestionTool.tubeSchema.test.ts
   (10-file known set, set-identical; +2 passing files = my two new test files.)

4. server tsc (npx tsc --noEmit in server/):
   trunk baseline: 26 error lines, 6 error files
   after: 26 error lines, 6 error files
   comm -3 of the file sets: EMPTY. comm -3 of position-normalized error lines
   (sed 's/([0-9]*,[0-9]*)//'): EMPTY.

5. app diff: git -c core.fileMode=false diff --stat HEAD -- app/ -> empty.

## assumptions:
- The spec file was not present in the worktree's .hermes/plans at dispatch; I
  read it from the trunk path (as instructed) and it arrived in the worktree via
  the lane-sync replication below.
- Lane worktree bootstrap: the worktree had only node_modules/schema symlinks;
  I replicated the trunk worktree's 99 untracked/ignored entries 1:1 (cp -a,
  symlinks as symlinks, per the lane convention) — comm -3 of
  `git status --porcelain -uall --ignored=matching` between trunk and lane is
  EMPTY (102/102 entries). Without this the tsc/suite baselines diverge.
- "pinned baseline 26 error lines / 6 error tokens" is read as 26 error lines
  across 6 error FILES (the lane pin convention; the 26 lines carry 4 distinct
  TS codes). Verified both ways: file-set comm -3 empty AND normalized-line
  comm -3 empty.
- F2 on open.tabs.items: the spec said mirror ONLY if a schema requires it.
  analysis-intent.schema.yaml open.tabs.items DOES require [surface, target] +
  targetRef oneOf — verified by reading the schema — so I mirrored it and
  pinned it in a test. FINDING REPORTED: yes, the analysis schema requires it.
- rules.file resolution: `prompts/workstate-compose-rules.md` resolves to
  server/prompts/workstate-compose-rules.md (repo-root/server/prompts — the
  same effective path the grounding module's ../../prompts/... URL uses).
- The rules block needs no store scan and therefore no scan-failure degradation
  arm (it carries no ground-truth ids); the grounding block's degradation
  behavior is untouched.
- Push order chosen and pinned: instruction, forced, grounding, rules (rules
  LAST, adjacent to FORCED_DRAFT_TOOL_INSTRUCTION).

## deviations:
- First draft of the rules md said "shown in the ANALYSIS REFERENCES block";
  that literal string broke the PB-CH-10 degradation test's
  not.toContain('ANALYSIS REFERENCES') assertion (a rules block must not smuggle
  the grounding heading into a no-grounding turn). Reworded the md to "shown to
  you in the reference list above" — the test was NOT weakened.
- The tool-menu `target` node drops its old `type: 'object'` key (the schema's
  target node is oneOf-only with no type). This is the exact mirror the spec
  asked for; noted because it changes the rendered JSON shape slightly.

## blockers: none.

## Not done (by design): no stack restart, no browser gate (coder lands
code+tests only; the orchestrator runs the residual receipts 1-5 post-merge).
