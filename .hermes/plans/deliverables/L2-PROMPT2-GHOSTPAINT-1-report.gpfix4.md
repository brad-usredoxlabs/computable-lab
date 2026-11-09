# L2-PROMPT2-GHOSTPAINT-1 Report — gp-fix4 (delivery report)

## Measured HEAD: 1449c1409a85dc83d169f0c1644fbf944cdb91be

## Suite Results (measured at HEAD)

- `npx vitest run src/ai/AgentOrchestrator.ghostpaint1.fold.test.ts`: 3/3 passed (208ms)
- `npx vitest run src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts`: 7/7 passed (278ms)
- `npx tsc -p . --noEmit`: 0 errors (EXIT:0)

## Commit Chain

- `56046410` — gp-fix4 launcher WIP (ungated transport commit, earns no gradability credit)
- `71c8a76d` — u9: fail-safe sole deck placement + B7 anti-regression pin
- `76f1080c` — u9: report + exit marker
- `1449c140` — u9b: non-degenerate B2 concept/formulation arms

## Advc Cycle 5 Defect Resolution

**D1 (leg-2B suite RED at 56046410, 4/6): CLOSED.**
At 56046410 the suite was 2 failed / 4 passed: B1 expected 0 events to be >= 1, B2 hit Cannot read properties of undefined. Unit u9 (71c8a76d) fixed `applySoleDeckPlacement` to write nothing when the placement id has no matching deck entry, and added B7 as anti-regression pin. Measured at HEAD: 7/7 passed.

**D2 (raw-id fallback drop path + false comment): CLOSED.**
`server/src/ai/shorthandChat.ts` lines 1204-1214 now read:
- `let injectName: string | undefined;` — variable holds the resolved deck NAME or stays undefined
- Deck resolution guard at line 1209-1213: only sets `injectName` when a deck entry matches the sole placement id
- Injection guarded by `if (injectName)` at line 1232 — unresolved => no injection, event survives
- The false "preserves today's behavior" comment has been removed
The drop path no longer silently injects an unresolvable raw id while `result.success` stays true.

**D3 (degenerate B2): CLOSED by u9b.**
Unit u9b (1449c140) fixed the degenerate B2 by using two distinct refs: `MAT-clofibrate-formulation` (formulation) and `MAT-clofibrate-concept` (concept). The test now asserts `expect(answer1.ref.id).not.toBe(answer2.ref.id)` to guarantee non-degeneracy.

**D4 (fold test does not witness run() call site): STILL OPEN.**
The fold test (`AgentOrchestrator.ghostpaint1.fold.test.ts`) exercises `compileFoldedShorthand` directly by calling the exported function, but does not witness the actual `run()` call site at `AgentOrchestrator.ts:1490` where the full agent loop context, state guards, and conversation-scoped machinery would execute. Closing D4 requires a test that drives `run()` through the fold path, which exceeds the scope of this branch.

**D5 (missing gp-fix4 report / DONE marker): CLOSED by this file.**
This report provides the delivery evidence and DONE marker for the gp-fix4 sha.

## Changed Files (this unit: docs only)

- `.hermes/plans/deliverables/L2-PROMPT2-GHOSTPAINT-1-report.gpfix4.md` (new)

L2-PROMPT2-GHOSTPAINT-1 UNIT u9c DONE 1449c1409a85dc83d169f0c1644fbf944cdb91be
L2-PROMPT2-GHOSTPAINT-1-u9c UNIT unit DONE 1449c1409a85dc83d169f0c1644fbf944cdb91be
