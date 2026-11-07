# SEQ-ANSWER-CONTRACT-1 u2r2 Report

## fix1 — Adversarial defects D1 (BLOCKER) and D2 (MAJOR)

### D1: target-aware same-surface guard
**Defect:** The MISSING_TARGET guard at compileWorkspaceAction.ts:660-662 fired for ALL same-surface open-surface requests, regardless of whether a target was supplied. This regressed 3 pre-existing green witnesses (P36 targeted sequence-tab frame, :217/:245, T5 :479).

**Fix:** Added `&& proposalObj.target === undefined` to the guard condition. The guard now only fires when NO target is present — a target makes it a valid navigation. Updated adjacent comment.

**Files changed:** server/src/ai/compileWorkspaceAction.ts

**Witness:** Added test "same-surface open-surface WITH target -> ok:true (target-aware guard)" to compileWorkspaceAction.test.ts. Non-vacuous — fails on pre-fix code because the guard returns MISSING_TARGET before target resolution.

### D2: raw surface into requestingSurface (OQ1 absent)
**Defect:** AgentOrchestrator.ts:3567 spread `surfaceName` (which is `surface ?? 'default'` at line 1322) into requestingSurface, so requestingSurface was NEVER undefined. This broke OQ1 contract where requestingSurface must be absent when the request carries no surface.

**Fix:** Changed line 3567 to pass raw `surface` instead of `surfaceName`. Line 1322 and all other surfaceName sites untouched.

**Files changed:** server/src/ai/AgentOrchestrator.ts

### Verification
- compileWorkspaceAction.test.ts: 33/33 green (was 32, +1 new test)
- AgentOrchestrator.sequencesAgentAction.test.ts: 14/14 green (was 11 passed, 3 failed)
- Typecheck: server tsc --noEmit exits 0, 0 errors
- AgentOrchestrator.workspaceAction.test.ts: 11/11 green (10 pre-existing + 1 OQ1 witness)
- Spec §7 five-file set: 84/84 green

### Commits
1. c4cd0d89 — SEQ-ANSWER u2r2 fix1 D1: target-aware same-surface guard
2. e4fe547a — SEQ-ANSWER u2r2 fix1 D2: raw surface into requestingSurface (OQ1 absent)

SEQ-ANSWER-CONTRACT-1-u2r2-fix1 UNIT unit DONE e4fe547aaeb76124995453ae980fdadd47045a6e

## fix2 — advc cycle 3 D1 (MINOR, paperwork)

### What a2a329f3 added
One witness in AgentOrchestrator.workspaceAction.test.ts (+22 lines):
- `import * as compileModule from './compileWorkspaceAction.js';` (spy import)
- Test "OQ1: surface-less request passes compileWorkspaceAction deps WITHOUT requestingSurface key" (:351), which spies on compileWorkspaceAction, runs a surface-less intent turn, and asserts at :366 that the key is absent.

### What the witness pins
The `requestingSurface` KEY IS ABSENT for a surface-less request, asserted with the `in` operator (`expect('requestingSurface' in depsArg).toBe(false)`). This rejects `{ requestingSurface: undefined }` under exactOptionalPropertyTypes — the contract requires the key to be absent, not merely undefined.

### Two-mutant evidence
- Mutant A (value-only substitution of `surfaceName` for `surface` in the spread): EQUIVALENT mutant, stays GREEN because `surfaceName === surface` whenever `surface !== undefined`.
- Mutant B (full-arm revert of e4fe547a, restoring `surfaceName !== undefined ? { requestingSurface: surfaceName }`): RED at :366 — the key is present with `'default'`, failing the OQ1 assertion.

### Commit
3. a2a329f3 — SEQ-ANSWER u2r2 fix2: OQ1 witness test (AgentOrchestrator.workspaceAction.test.ts)

SEQ-ANSWER-CONTRACT-1-u2r2-fix2 UNIT unit DONE a2a329f3355362a8cbda9a0fc6cfcad797caffbe

SEQ-ANSWER-CONTRACT-1-u2r2fix3 UNIT unit DONE ffba16ae61d31dd7372a0d5c3a5eb6cdec1ba9c4
