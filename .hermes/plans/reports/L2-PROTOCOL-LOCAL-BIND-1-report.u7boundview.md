# L2-PROTOCOL-LOCAL-BIND-1 — UNIT u7boundview Report

## Acceptance Criteria
Teach the run-surface role-binding panel to render the wire's `bound` state with its concrete target, so a role the run has already bound no longer displays as "no candidate".

## Changes Made

### 1. app/src/shared/api/client.ts (lines 2159-2165)
- Added `'bound'` to the `state` union: `'proposed' | 'ambiguous' | 'unbound' | 'bound'`
- Added optional `bound?: BindingCandidate` field to `RoleProposal` interface

### 2. app/src/run/RoleBindingProposalsPanel.tsx (lines 98-102)
- Added one render arm before the final else: when `role.state === 'bound'`, render `role.bound?.label` with lot number when present, or just 'bound' when `bound` is absent
- Diff stays within lines 82-102; did not touch docblock (lines 1-7), error handling (lines 44-62), proposed/ambiguous arms, or heading

### 3. app/src/run/RoleBindingProposalsPanel.bound.test.tsx (NEW)
- P1: Bound role with label and lot renders both, does not render "no candidate"
- P2: Bound role has no buttons (read-only, no selection/accept control)
- P3: Unbound role with stray `bound` payload still renders reason (state decides, not payload)

## RED-GREEN-REFACTOR

### RED (before product code changes)
Test file written with `state: 'bound'` and `bound` payload — TypeScript accepted the union widening, but the panel rendered "no candidate" for all non-proposed/non-ambiguous states:
- P1 FAILED: could not find "Reservoir A" (rendered "no candidate")
- P2 FAILED: same reason
- P3 PASSED: unbound state correctly rendered reason

### GREEN (after adding bound render arm and union widening)
- All 7 tests pass: 4 existing + 3 new
- Typecheck: no new errors (pre-existing errors in editor/ and server/ are unchanged)

## Mutation Probes

### M1: Delete the bound render arm (revert to single else)
Result: P1 and P2 RED (2 failed | 1 passed) — "Reservoir A" not found, "no candidate" displayed. PASSING mutation.

### M2: Payload-first precedence (`role.bound ? ... : state check`)
Result: P3 RED (1 failed | 2 passed) — stray payload rendered "Reservoir A" instead of reason. PASSING mutation. P3 is PROVING.

## Reviewer Bait Addresses
1. Optional-property honesty: `bound?: BindingCandidate` — P1 includes case where `bound` is absent, row still says "bound" not "no candidate"
2. Dangling/refusal precedence: P3 proves state decides, payload is display data only
3. Cross-branch merge surface: Diff stays out of lines 1-7 and 44-62 for u6alert merge compatibility
4. Hardcode boundary: No role ids, vendor names, or record ids in TS code
5. Read-only password: No accept/commit control added (that is u3accept)
6. Union drift: App now accepts 4 states while trunk server sends 3 — declared additive widening validated against accepted u4bindstate wire (advc c1 ACCEPT)
7. Test topology: Mocks `../shared/api/client` module-wide like existing test; no `// @vitest-environment jsdom` needed (sibling test runs under configured default)

## Verification Commands and Results
```
cd app && npx vitest run src/run/RoleBindingProposalsPanel.test.tsx src/run/RoleBindingProposalsPanel.bound.test.tsx
Test Files  2 passed (2) | Tests  7 passed (7)

cd app && npx tsc --noEmit -p .
(exit 2, pre-existing errors in editor/ and server/ only; zero new errors)
```

L2-PROTOCOL-LOCAL-BIND-1-u7boundview UNIT u7boundview DONE 90fd99a1e684ae7d772515d236e2ab45d05502bf
