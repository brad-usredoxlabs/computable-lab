# SEQ-ANSWER-CONTRACT-1 Unit 2 (R2) — Report

## Scope
MISSING_TARGET envelope contract for same-surface target-less open-surface.
The server must reject a target-less open-surface when the surface equals the
requesting turn's surface, with an actionable diagnostic naming the surface's
declared tabs.

## Changed Files (3)
1. server/src/ai/compileWorkspaceAction.ts — added `requestingSurface?: string` to deps,
   MISSING_TARGET check in open-surface arm before target resolution.
2. server/src/ai/compileWorkspaceAction.test.ts — amended existing leg at :306 to same-surface
   case, added different-surface ok test, added no-requestingSurface ok test.
3. server/src/ai/AgentOrchestrator.ts — one-line conditional spread wiring requestingSurface
   from surfaceName into compileDeps.

## Verification
- Test run: `cd server && npx vitest run src/ai/compileWorkspaceAction.test.ts`
  → 32 passed (32), Test Files 1 passed (1)
- Typecheck: `cd server && npx tsc --noEmit -p .`
  → 1 error TS (pre-existing in S3StorageProvider.ts, unchanged)
- Git status: clean tree at exit
- Commit: 0061f35cd9e94d7d54e1bf27a32bff454e8e46f3

## Reviewer Bait Verification
- exactOptionalPropertyTypes: requestingSurface uses conditional spread in orchestrator,
  optional in interface, no undefined literals in tests. PASS.
- Hardcode boundary: no surface/tab literals in compileWorkspaceAction.ts diff. PASS.
- Contract weakening: different-surface leg (1b) and no-requestingSurface leg (1c) present
  alongside amended :306 leg. PASS.
- Diagnostic code: same-surface uses MISSING_TARGET, no-surface stays UNSUPPORTED_SURFACE. PASS.
- Ajv dump: message is actionable sentence, test asserts no 'must have required property'. PASS.
- Scope R3: submitSuggestionTool.ts, intent enum, answer branch untouched. PASS.
- Orchestrator wiring: exactly 1 hit of requestingSurface in AgentOrchestrator.ts. PASS.

SEQ-ANSWER-CONTRACT-1-u2r2 UNIT 2 DONE 0061f35cd9e94d7d54e1bf27a32bff454e8e46f3
