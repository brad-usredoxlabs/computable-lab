# L2-PROMPT2-COMPOSITION-BIND-1 / c1precfix3b — Closing verification leg

## Context
Advc c1precfix2 returned D1 BLOCKER: nounResolution.test.ts:381 pinned OLD shipped
vocabulary (LBW-A via hint_search first) which the declaration_precedence DATA flip
(1a72f5ec) made RED. Fix3 (c1precfix3) repointed two lines (committed 02c9b21e) but
exited DIRTY — one pin remained unhandled.

## The Fix
Line 381: changed expected binding from ['LBW-A'] to ['local:plate-B']
Line 360: updated test title to reflect the shipped outcome shift

## Measurement — Which Arm Binds
The shipped vocabulary has strategyOrder:
  [declaration_precedence, explicit_wells, hint_search, symbolic_label, ...]
declaration_precedence (tier 1, confidence 0.95) runs FIRST and finds the spine candidate
plate-B (matches declared formulation). hint_search (tier 2, confidence 0.7) runs THIRD but
declaration_precedence already bound plate-B.

VERDICT: arm is declaration_precedence — NOT hint-search regression.

## Mutation Proof
Pre-flip vocab (sha 212c83f5...) has strategyOrder:
  [explicit_wells, hint_search, symbolic_label, ontology_resolution, mint_local, ...]
NO declaration_precedence — hint_search runs before symbolic_label.

With pre-flip vocab, the test fails:
  expected ['local:plate-B'] to deeply equal ['LBW-A']
This proves the flip caused the change: pre-flip produces LBW-A (hint_search wins),
post-flip produces local:plate-B (declaration_precedence runs first).

Post-flip vocab restored: sha d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab

## Verification
nounResolution.test.ts: 16 passed (16)
resolutionEngine.declarationPrecedence.test.ts: 9 passed (9)
vocabulary.test.ts + vocabularyIdentityCollapse.test.ts: 6 passed (6)
sha256sum of vocab: d39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab (matches MANIFEST.yaml:110)
git status: only node_modules symlinks (expected)

## Changed Files
- server/src/compiler/resolution/nounResolution.test.ts (lines 360, 381)
- deliverables/L2-PROMPT2-COMPOSITION-BIND-1-report.c1precfix3b.md (this file)

L2-PROMPT2-COMPOSITION-BIND-1 UNIT c1precfix3b DONE bfb0de1c2ff62b873346358da1708f5792a7168b
