L2-PROMPT2-COMPOSITION-BIND-1 / c1precfix1b2 — Mutation Proof + Report
=====================================================================

UNIT: c1precfix1b2 (closing evidence leg of c1precfix1b)
Commit under proof: 1a72f5ec72341fa66e37b884e26775a4c1e9f094

Step 1 — Baseline (green)
  cd server && ./node_modules/.bin/vitest run src/compiler/resolution/resolutionEngine.declarationPrecedence.test.ts
  Test Files  1 passed (1)
       Tests  9 passed (9)

Step 2 — Identity
  git log --oneline -1: 1a72f5ec WIP AT EXIT (launcher auto-commit...)
  sha256sum schema/scientist-intent/scientist-intent-vocabulary.yaml:
  d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab

Step 3 — Mutation (revert to 6f2572bf pre-fix blob)
  git checkout 6f2572bf -- schema/scientist-intent/scientist-intent-vocabulary.yaml
  Test Files  1 failed (1)
       Tests  3 failed | 6 passed (9)
  Failing ids:
    - strategyOrder[0] is declaration_precedence in shipped vocabulary (line 211)
    - ambiguity.strategyRef is declaration_precedence in shipped vocabulary (line 215)
    - one declared candidate binds spec CURIE using shipped vocabulary directly (line 231)

Step 4 — Restore (back to 1a72f5ec)
  git checkout 1a72f5ec -- schema/scientist-intent/scientist-intent-vocabulary.yaml
  Test Files  1 passed (1)
       Tests  9 passed (9)
  sha256sum: d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab (matches MANIFEST:110)
  git status --short: only ?? app/node_modules, ?? server/node_modules

SHA comparison:
  Pre-fix (6f2572bf): 212c83f52aa03d2642d611aab051651856d0073e5bc522daa294e9b4c12b1c6e
  Post-fix (1a72f5ec): d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab

Shipped diff (commit 1a72f5ec):
  + strategyOrder[0]: declaration_precedence (Ruling 11a181c0 Q1)
  + ambiguity.strategyRef: declaration_precedence
  MANIFEST.yaml:110 sha256 updated to d39fd67b...

No product/test modification in this unit: git diff --stat 1a72f5ec..HEAD
  shows only c1precfix2a/c1precfix2b reports and test goldens — this report file is new.
  The c1precfix1b2 unit edits only this deliverable file.

Conclusion: Reverting the YAML to pre-fix blob causes exactly 3 failures (2 shipped-vocabulary-pins
+ 1 bind leg). Restoring returns all 9 to green. The DATA edit is load-bearing.

L2-PROMPT2-COMPOSITION-BIND-1 UNIT c1precfix1b2 DONE 1a72f5ec72341fa66e37b884e26775a4c1e9f094
