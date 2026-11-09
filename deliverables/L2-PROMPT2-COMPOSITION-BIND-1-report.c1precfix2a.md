# L2-PROMPT2-COMPOSITION-BIND-1 c1precfix2a Report

## Unit: c1precfix2a (mechanical pins + report)

## Baseline (HEAD 1a72f5ec)
- vocabularyRipOut.test.ts: FAIL — shippedOrder expected ['explicit_wells', 'hint_search', 'symbolic_label', 'ontology_resolution', 'mint_local'] (5 items) but actual shipped has 'declaration_precedence' (6 items)
- goldenNoRebless.target1.test.ts: FAIL — hash mismatch expected 212c83f52aa03d2642d611aab051651856d0073e5bc522daa294e9b4c12b1c6e, got d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab
- resolutionEngine.declarationPrecedence.test.ts: 9 passed (guard)

## Post-fix results
- vocabularyRipOut.test.ts: PASS (8 tests) — shippedOrder now includes 'declaration_precedence' at position 0
- goldenNoRebless.target1.test.ts: PASS (1 test) — pin updated to d39fd67b
- resolutionEngine.declarationPrecedence.test.ts: 9 passed (unchanged)

## Hash chain: 212c83f5 -> d39fd67b (COMPOSITION-BIND c1precfix2a)

## Files changed
1. server/src/compiler/scientistIntent/vocabularyRipOut.test.ts — added 'declaration_precedence' to shippedOrder expectation
2. server/src/compiler/scientistIntent/goldens/goldenNoRebless.target1.test.ts — updated hash literal and comment chain
3. server/src/compiler/scientistIntent/fixtures/vocab-strategy-flip/scientist-intent-vocabulary.yaml — added 'declaration_precedence' to flipped strategyOrder

## Verification commands
cd /tmp/wt-L2-COMPOSITION-BIND-1-c1prec/server
timeout 300 ./node_modules/.bin/vitest run src/compiler/scientistIntent/vocabularyRipOut.test.ts src/compiler/scientistIntent/goldens/goldenNoRebless.target1.test.ts
timeout 300 ./node_modules/.bin/vitest run src/compiler/resolution/resolutionEngine.declarationPrecedence.test.ts

L2-PROMPT2-COMPOSITION-BIND-1 c1precfix2a DONE 3425fe1918dd2808fb51c936d30779561853d2ca
