# SEQ-ANSWER-CONTRACT-1 — Unit 1 Fix Run 1 Report

## Summary
Fix run for unit 1 (the answer intent, server leg). Resolves D1/D2/D5/D6/D7/D8/D9.

## Changes

### D1 — Tool schema text property (submitSuggestionTool.ts)
Added text property to AGENT_INTENT_TOOL_DEF.function.parameters.properties:
  type: string, minLength: 1, maxLength: 800
  description: answer only: the model's direct response to a question. Cite only facts from the injected surface context; never invent identifiers or references.
additionalProperties: false unchanged. No second tool. No tool_choice change.

### D2 — Orchestrator-level test (AgentOrchestrator.answerIntent.test.ts)
Replaced 6 parser-only tests with 1 orchestrator-level test. Drives a forced-tool turn
with intent=answer, text='This sequences workspace tracks sequence records and their runs.'
Asserts: (a) exactly one text_delta byte-equal to payload, (b) zero store mutations,
(c) one inference call, (d) no agent_action/agent_action_proposal,
(e) tool_result before text_delta, (f) result success.

### D5 — Parser pins (submitSuggestionTool.test.ts)
Grew from 17 to 22 tests. Added: text schema property assertion, answer text retained
verbatim, answer without text -> unknown, answer whitespace -> unknown, unknown intent unchanged.

### D6 — Generic retention chain (submitSuggestionTool.ts:902)
Added 'answer' to OR-expression + conditional text spread.

### D7 — Empty-text guard (AgentOrchestrator.ts)
Removed if (text && text.length > 0) guard. Parser contract guarantees non-empty text.

### D8 — Event order (AgentOrchestrator.ts)
tool_result fires BEFORE text_delta (contract order).

### D9 — Unused imports (AgentOrchestrator.answerIntent.test.ts)
Removed unused imports (AgentIntentArgs, readFileSync, fileURLToPath).

## RED Captures
Mutation A (D2): FAIL — answer branch removed, event order assertion fails (text_delta before tool_result)
Mutation B (D1): FAIL — text property removed, props.text undefined assertion fails

## GREEN
2 files, 23 tests passed (submitSuggestionTool: 22 tests, answerIntent: 1 test)

## Typecheck
1 pre-existing error: src/storage/S3StorageProvider.ts(87,33) TS2307 @aws-sdk/client-s3

## Deferred
D4/D11: Client wall + channel conflict. Orchestrator decision required.

## Changed Files
server/src/ai/submitSuggestionTool.ts (D1, D6)
server/src/ai/submitSuggestionTool.test.ts (D5)
server/src/ai/AgentOrchestrator.ts (D7, D8)
server/src/ai/AgentOrchestrator.answerIntent.test.ts (D2, D9)

SEQ-ANSWER-CONTRACT-1-u1fix1 UNIT 1 DONE 1982685b044acf346d2a2cc4ce43678de76f02d7
