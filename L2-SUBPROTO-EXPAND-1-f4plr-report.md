# Report — L2-SUBPROTO-EXPAND-1, unit f4plr

## Summary
Extracted the `resolvePlannedRunId` resolver from `RunPlanGraphBuild.tsx` into a shared module, then wired `RunWorkspacePage.tsx` to resolve and pass the correct planned-run id to `RoleBindingProposalsPanel`. This fixes finding F4: the panel was mounted with the raw run id, received a 400 NOT_A_PLANNED_RUN refusal, and rendered nothing.

## Changed Files
- `app/src/run/plannedRunId.ts` (NEW, 16 lines) — extracted resolver verbatim from `RunPlanGraphBuild.tsx:35-43`
- `app/src/run/RunPlanGraphBuild.tsx` — deleted local resolver, imported from `./plannedRunId`
- `app/src/run/RunWorkspacePage.tsx` — added state + effect to resolve planned-run id, conditionally render panel with resolved id
- `app/src/run/RunWorkspacePage.proposals.test.tsx` (NEW, 215 lines) — 3 tests pinning the fix

## Verification
### Targeted tests (unit f4plr)
```
node node_modules/vitest/vitest.mjs run src/run/RunWorkspacePage.proposals.test.tsx
→ Test Files  1 passed (1), Tests  3 passed (3)
```

### Regression tests
```
node node_modules/vitest/vitest.mjs run src/run/RunWorkspacePage.surface.test.tsx src/run/RunPlanGraphBuild.test.tsx
→ Test Files  2 passed (2), Tests  9 passed (9)
```

### Typecheck
```
npx tsc --noEmit -p .
→ 0 errors in my files (11 pre-existing in server/editor modules, unchanged from baseline)
```

### Mutation Probes
1. Pass `runId` instead of `plannedRunId` → test (1) RED (called with 'RUN-1' instead of 'PLR-1') ✓
2. Delete `kind === 'planned-run'` branch from resolver → test (2) RED (self-PLR case failed) ✓
Both reverted before commit.

### Tree Status
```
git -c core.fileMode=false status --short
(clean — all committed)
```

## Exit
L2-SUBPROTO-EXPAND-1-f4plr UNIT f4plr DONE 2ecf1921c76ab03cf29b8a24a39be7b5d3dd7d66
