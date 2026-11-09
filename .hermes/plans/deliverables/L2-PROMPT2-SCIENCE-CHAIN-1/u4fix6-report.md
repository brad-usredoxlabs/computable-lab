# L2-PROMPT2-SCIENCE-CHAIN-1 u4fix6 — Closeout Report

## Commits Landed (branch leg)
- 2b810bfe — emit material_ref + composition_snapshot in resolveRoles pass (compiler is the ONE emitter)
- a9fc71d9 — delete resolveLabelOnlyMaterials (second writer removed per ruling)
- 09599511 — delete scratch probe debug_compiler.mjs
- b8a64ca5 — launcher WIP auto-commit (contains fallback demotion skip in AgentOrchestrator.ts:3094)
- 5a18a952 — u4fix6: fix material_ref and composition_snapshot shapes to match schema (+163 test, 44 lines source)

## Verify Results
1. `npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts`
   Raw tail: `Tests  20 passed (20)` — baseline confirmed.
2. `grep -rn resolveLabelOnlyMaterials server/src`
   Raw tail: 0 hits (exit code 1) — function remains deleted per ruling SCIENCE-shorthand-materialref-l2t2650-ruling.md.
3. `npx vitest run src/compiler/pipeline/passes/ChatbotCompilePasses.compositionShape.test.ts`
   Raw tail: `✓ (1 test) 110ms — Test Files  1 passed (1)   Tests  1 passed (1)   Duration  1.37s` — compositionShape suite passes.
4. Advc probe (see ~/.hermes/cl/lanes/2/reviews/L2-PROMPT2-SCIENCE-CHAIN-1-advc-item-l2t2705.md): compiler emitted material_ref on 12/12 add_material events; enrichDraftResultEvents CHANGED compiler events: false (measured no-op / idempotent on the compiler path).

## WIP Auto-Commit Disclosure (b8a64ca5)
Commit b8a64ca5 is a launcher WIP auto-commit containing the fallback demotion skip:
`const demotion = fallbackCarryIntentId` / `? { doc: shorthandDoc, demoted: [], notes: [] }` /
`: demoteUnstatedQuantities(shorthandDoc, effectivePrompt);`
This shipped in a WIP auto-commit. It is accepted-with-note: the item-level advc must
review whether the fallback demotion skip aligns with the science-chain intent contract.
Do NOT modify the code in this closeout unit.

## Files Changed in This Closeout
- .hermes/plans/deliverables/L2-PROMPT2-SCIENCE-CHAIN-1/u4fix6-report.md (this file)
- .hermes/plans/reports/L2-SCIENCE-CHAIN-1.md (marker)

L2-PROMPT2-SCIENCE-CHAIN-1-u4fix6close UNIT unit DONE 5a18a952
