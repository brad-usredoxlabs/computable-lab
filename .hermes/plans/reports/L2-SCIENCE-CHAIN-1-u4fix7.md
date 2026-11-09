# L2-PROMPT2-SCIENCE-CHAIN-1 — Unit u4fix7 Report

## Scope
Comment/prose corrections only — zero executable behaviour or product source changes.

## Defects Addressed (from advc l2t2705)
1. **MAJOR** — server/src/ai/AgentOrchestrator.shorthandChat.test.ts:711-734: D1 pin comment falsely claimed the wire was load-bearing ("NON-VACUOUS", "makes it RED"). Fixed: title + comment now state compiler is the emitter and the wire is an idempotent pass-through.
2. **MINOR** — server/src/ai/materialRefLabels.ts:796: doc claimed "no second writer" while enrichAddMaterialRefs has latent writes at :481, :523. Fixed: comment scopes "no second writer" to the compiler path and acknowledges latent capability on non-compiler events.
3. **MINOR (process)** — u4fix6-report.md verify block omitted compositionShape suite and advc probe. Fixed: appended items 3 and 4.

## Files Changed
- server/src/ai/AgentOrchestrator.shorthandChat.test.ts (test title + comment prose)
- server/src/ai/materialRefLabels.ts (doc comment only)
- .hermes/plans/deliverables/L2-PROMPT2-SCIENCE-CHAIN-1/u4fix6-report.md (verify block extended)

## Verify Results
1. `npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts` — Tests 20 passed (20)
2. `npx vitest run src/compiler/pipeline/passes/ChatbotCompilePasses.compositionShape.test.ts` — Tests 1 passed (1)
3. git diff --stat HEAD~3 — only the 3 files above changed

## Commits
1. 2f217d98 — correct D1 pin justification to measured idempotent-wire reality (advc MAJOR)
2. c1ddc9e1 — scope the no-second-writer comment to the compiler path (advc MINOR)
3. (this commit) — verify-block + report

L2-PROMPT2-SCIENCE-CHAIN-1 UNIT u4fix7 DONE c1ddc9e1
