# L2-PROMPT2-COMPOSITION-BIND-1 — Unit c1precfix6 Report

## Summary
Three comment/prose fixes from advc review (L2-PROMPT2-COMPOSITION-BIND-1-advc-c1precfix5-l2t2700.md).
No behavior change, no test-expectation change.

## Defect Closures

### D1 (MAJOR) — strategies.ts:149, cost wording
- **Problem**: Comment claimed "Spine is gathered once per resolvable arg" — the engine
  actually gathers 2x on the bind path, 3x on the not-narrowed path. The sentence described
  engine-level cost but was positioned as a declaration_precedence strategy comment.
- **Fix**: Scoped to the strategy's own gather: "This strategy gathers the spine once, but".

### D2 (MINOR) — nounResolution.test.ts:348-349, fixture prose
- **Problem**: Prose claimed "Shipped strategyOrder runs hint_search first -> binds A" but
  line 363 asserts strategyOrder = ['declaration_precedence', ...] — contradiction.
- **Fix**: Reworded to "declaration_precedence contributes nothing for this fixture so
  hint_search is the first strategy that binds".

### D3 (MINOR) — commit discipline (report file)
- **Problem**: Amend loop on exit-marker SHA.
- **Fix**: Two-commit convention: code fix first (37208bb7), report as separate commit
  naming the parent SHA.

## Verification
- vitest: 16 tests PASS (byte-identical expectations)
- tsc --noEmit: 0 errors
- git diff --stat: 2 files changed, comment-only edits

L2-PROMPT2-COMPOSITION-BIND-1 UNIT c1precfix6 DONE 37208bb75e4b846bf058be81d901ddaece294ee6
