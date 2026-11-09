# L2-PROMPT2-SCIENCE-CHAIN-1 — u11foldfix Report

## Unit: u11foldfix

### Problem
The foldbind test destructured `compiled` from `bindFoldPicksOntoCompile()` return, but the helper returns `boundCompiled`. This caused both tests to fail with:
`TypeError: Cannot read properties of undefined (reading 'terminalArtifacts')`

### Fix
Changed destructure on lines 53 and 101:
- `const { compiled: boundCompiled, bound, unbound } = ...` → `const { boundCompiled, bound, unbound } = ...`

### Changed Files
- `server/src/ai/AgentOrchestrator.foldbind.test.ts` — 2 lines (lines 53 and 101)

### Verification
- `npx vitest run src/ai/AgentOrchestrator.foldbind.test.ts` → Tests 2 passed (2)
- `npx vitest run src/ai/materialBinding.test.ts` → Tests 11 passed (11) (baseline, no regression)

### Commit
ccfa999bab205136e59ae67faac5b617bb5e98aa

L2-PROMPT2-SCIENCE-CHAIN-1-u11foldfix UNIT u11foldfix DONE 406137be4b0dc3f0b5eda3142306069ea38d4e1c
### u11fix1 (cycle-2 fix: advc c1 D1/D2)
**D1 CLOSED** — `177746e7` adds the production-chain leg (`AgentOrchestrator.foldbind.test.ts`, +117/-2):
it drives `compileFoldedShorthand` + `bindFoldPicksOntoCompile` as the branch composes them (ghostpaint1
precedent); no synthetic compiled literal.
**D2 CLOSED** — `ac98b22b` adds the fold-path warn at `AgentOrchestrator.ts:1655`:
```ts
              if (foldBinding.unbound.length > 0) {
                console.warn(
                  `[agent ${tid}] fold-path ${foldBinding.unbound.length} clarification answer(s) could not be bound to an event: ` +
                    foldBinding.unbound.map((a) => a.requestId).join(', '),
                );
              }
```
WIP-commit sweep = environment artifact (2 `__pycache__` .pyc + 2 schema/registry yaml
materializations); content verified by the orchestrator.
**Verification** — `cd server && npx vitest run src/ai/AgentOrchestrator.foldbind.test.ts` -> 3 tests
passed (3/3). `grep -c 'could not be bound' server/src/ai/AgentOrchestrator.ts` -> 2 (model path +
fold-path :1655); bar 1 -> 2. MET.
**Commit:** 177746e7 (D1 leg), ac98b22b (D2 fold-path warn)

L2-PROMPT2-SCIENCE-CHAIN-1-u11fix1 UNIT u11fix1 DONE ac98b22ba62a35760418af209ebd4933ac47da3b
