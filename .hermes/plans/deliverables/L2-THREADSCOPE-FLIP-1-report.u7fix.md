# L2-THREADSCOPE-FLIP-1 u7-fix report

## Defects Fixed

### D1: Gate setHydrationSeq inside if (!cancelled)
- File: app/src/shared/hooks/useAiChat.ts
- Moved setHydrationSeq((n) => n + 1) inside the if (!cancelled) { ... } block
- Both hydratedRef.current = true and setHydrationSeq are now gated together
- Commit: 0c5e6f87

### D2: Live scope header assertion + stale comment fix
- File: app/src/shared/hooks/useAiChat.threadscope.test.ts
- Added scope 'EVG-1' to P-e test so POSTs carry x-cl-thread-scope header
- Added assertion: posts.forEach(p => expect(p.headers?.['x-cl-thread-scope']).toBe('EVG-1'))
- Fixed stale comment: replaced ":1110" reference with ":1122-1124" / ":1128"
- Commit: 7ec50ef3

### D3: Report marker formatting
- D3 defect was the "UNIT unit" duplication in the exit marker line

## Verification

vitest useAiChat.threadscope.test.ts: 5 passed, 0 failed
tsc --noEmit: 10 errors (baseline unchanged)
git status: only owned files modified

## Changed Files
- app/src/shared/hooks/useAiChat.ts (D1)
- app/src/shared/hooks/useAiChat.threadscope.test.ts (D2)
- .hermes/plans/deliverables/L2-THREADSCOPE-FLIP-1-report.u7fix.md (this report)

L2-THREADSCOPE-FLIP-1-u7fix2 UNIT u7fix2 DONE 7ec50ef3c6858bfcd495fd3c57f81577555b01cd
