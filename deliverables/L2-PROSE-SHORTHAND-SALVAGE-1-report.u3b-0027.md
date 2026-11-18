# L2-PROSE-SHORTHAND-SALVAGE-1 Unit u3b Report

## Task
Make the forced-tool-choice downgrade attributable: when `allowAutomaticToolChoice` relaxes a forced choice (qwen+thinking path, or the provider-400 compatibility retry), emit one log line naming the reason and set an optional, absent-by-default signal on the non-streaming response the caller receives.

## Changed Files
1. `server/src/ai/InferenceClient.ts` (+27/-8 lines)
   - `normalizeRequest` takes optional `downgradeInfo` mutable per-call object
   - Qwen+thinking path: warns and fills `downgradeInfo.reason` when downgrade fires
   - Provider-400 retry path: warns and fills `downgradeInfo.reason` when retry downgrade fires
   - `completeOnce`: creates per-request `downgradeInfo`, threads to `fetchCompletion`, attaches `toolChoiceDowngraded` to response only when `reason` is present
   - `completeStream`: passes `streamDowngradeInfo` to `fetchCompletion` for logging only (no chunk field)

2. `server/src/ai/types.ts` (+2 lines)
   - Added `toolChoiceDowngraded?: { reason: 'qwen-thinking' | 'provider-400-tool-choice'; model: string }` to `CompletionResponse`

3. `server/src/ai/InferenceClient.toolChoiceDowngrade.test.ts` (new, 138 lines)
   - Case 1: qwen+thinking forced tool -> body has auto, warn emitted, response carries signal
   - Case 2: non-qwen forced tool -> no downgrade, no warn, field absent
   - Case 3: provider-400 tool_choice retry -> one retry, one warn, response carries provider reason

## Verification Results

### New test file (3 tests, all pass)
```
Test Files  1 passed (1)
Tests  3 passed (3)
```

### Existing baseline tests (19 tests, all pass)
```
Test Files  2 passed (2)
Tests  19 passed (19)
```

### All InferenceClient tests (29 tests, all pass)
```
Test Files  4 passed (4)
Tests  29 passed (29)
```

### Typecheck
```
cd server && npx tsc --noEmit -p .
```
Exit code 0, zero errors.

## Design Decisions
- Per-request mutable object (`downgradeInfo: Record<string, unknown>`) threads downgrade info without module-level state
- `toolChoiceDowngraded` field is omitted entirely when no downgrade occurred (respects `exactOptionalPropertyTypes`)
- Streaming path logs the downgrade but does not attach to chunks (as specified)
- Warn prefix `[inference] tool_choice downgraded` matches existing `console.warn` precedent at line 211
- The qwen path now checks `allowAutomaticToolChoice` return value to avoid double-warn on no-op (non-forced requests)
- Two reason values: `'qwen-thinking'` and `'provider-400-tool-choice'`

## Notes
- Total lines: 29 (InferenceClient.ts diff) + 2 (types.ts diff) + 138 (new test) = 169 lines, within 180 budget
- 3 files changed, within budget
- Streaming caller cannot see the signal in chunks; only the blocking `complete()` response carries `toolChoiceDowngraded`

[prose c4marker] Provenance: 73517587 is the commit that first carried this report and the C4 code; the token order of the marker below was corrected in the follow-up commit that carries this sentence, which changed no product file.
L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c4marker DONE 735175872b54f383d44fd9d68fcc01e85f66267a
