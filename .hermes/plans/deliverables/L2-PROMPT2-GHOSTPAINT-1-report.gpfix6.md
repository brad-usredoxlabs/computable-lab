# L2-PROMPT2-GHOSTPAINT-1 — gp-fix6 report (advc cycle-6 defects D2, D1)

## Defects Fixed

### D2 — Untrack node_modules symlinks

Two absolute-path symlinks were accidentally tracked in commit 1449c140:
- `app/node_modules` -> `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`
- `server/node_modules` -> `/mnt/vast/home/brad/git/cl-integration-2/server/node_modules`

Fix: `git rm --cached` removed the index entries. On-disk symlinks preserved for local testing.

Commit: `379112e4`

### D1 — Non-tautological B2 concept-vs-formulation test

The original B2 test used the same label `Formulated Clofibrate DMSO` for both arms
(formulation and concept), so the folded docs were byte-identical despite different
ref ids. The `expect(ev1.labwareId).toBe(ev2.labwareId)` assertion was tautological —
no implementation change could make it fail.

Fix: arm 2 (concept) now uses the concept label `'Clofibrate'` instead of the
formulation label. This produces genuinely different folded documents and compiled
events. Added `reuseBindings: folded.bindings` to both compiles (production parity).
Added assertions that the events differ in `details.material` while agreeing on
`details.labwareId`.

Commit: `05915e19`

## Changed Files

1. `app/node_modules` — removed from index (D2)
2. `server/node_modules` — removed from index (D2)
3. `server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts` — B2 test rewritten (D1)

## RAW Verification

### D2: node_modules untracked
```
$ git ls-files app/node_modules server/node_modules
(empty — symlinks no longer tracked)
```

### D1: Test suite passes
```
$ npx vitest run src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts
✓ src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts (7 tests)
Test Files  1 passed (1)
Tests  7 passed (7)
```

### Wider shorthand set (pre-existing failures unchanged)
```
$ npx vitest run src/ai/shorthandChat
Test Files  4 failed | 12 passed (16)
Tests  4 failed | 87 passed (91)
```

### TypeScript
```
$ npx tsc --noEmit
TSC_EXIT=0
```

### Mutation verification (neutralize reuseBindings)
```
Mutated compileShorthandDeterministically to ignore reuseBindings:
B2 test FAILS — 1 failed | 6 passed
Restored original: B2 test PASSES — 7 passed
```

L2-PROMPT2-GHOSTPAINT-1-gpfix6 UNIT unit DONE 05915e1900000000000000000000000000000000
