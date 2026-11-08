# L2-VACUOUS-PINS-DEBT — unit u6d4fix1 report

## FIX: Hoist inline witnesses to consts

### Problem
4 TypeScript errors (TS2353) in `app/src/agent/proposalRowFacts.materialRef.test.ts` caused by inline
`proposalRowFact({...})` calls passing object literals with `kind: 'add_material'` — a property not
declared in the function's parameter type. The pre-existing pattern in the same file uses
`const event = { ... }` then `proposalRowFact(event)` which bypasses the excess property check.

### Fix
Hoisted each inline literal into a named const (`eventB`, `eventB2`, `eventC`, `eventB4`) and passed
the variable to `proposalRowFact()`. All properties including `kind` preserved byte-identical.
Zero product-code delta — only test file edited.

### Verification
1. `cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **10** (was 14, baseline restored)
2. `cd app && npx vitest run src/agent/proposalRowFacts.materialRef.test.ts` → **5 passed** (unchanged)
3. `git diff HEAD --stat` → 1 file changed, 12 insertions(+), 8 deletions(-)

### Changed files
- `app/src/agent/proposalRowFacts.materialRef.test.ts` — 4 hoists (lines ~62, ~94, ~106, ~133)

L2-L2-VACUOUS-PINS-DEBT UNIT u6d4fix1 DONE 8b256910d1c92ae8e7fc100b00c7e75508758f7a
