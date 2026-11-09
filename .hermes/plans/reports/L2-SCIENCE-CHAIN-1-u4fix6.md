# L2-PROMPT2-SCIENCE-CHAIN-1 — Unit u4fix6 Closeout Report

## (a) Identifiers

- Item: L2-PROMPT2-SCIENCE-CHAIN-1
- Unit: u4fix6
- Branch: cl/lane2-sciencechain-1-u4fix6
- Base sha: 5a18a95264f2755d76ffde2e82b5d4f8420b4dde
- Tip sha (current HEAD before this report): e158f7cfb8fe85a4fe6feb8ec9c0acc9b516d2cd

## (b) What Changed

The commit `5a18a952 u4fix6: fix material_ref and composition_snapshot shapes to match schema` corrects two emit sites that now funnel through `buildMaterialEmission` (ChatbotCompilePasses.ts:2627). That function returns:

- `material_ref` as `{ kind: 'record', type: 'material', id }` — a full typed CURIE reference, replacing the old bare `{ kind, id }` shape that lacked the required `type` field.
- `composition_snapshot` as `[{ component_ref: typedRef, role: 'other' }]` (lines :2636-:2637) — using `component_ref` (not `material_ref`) as the key per schema, and `role: 'other'` from the enum.

This is a SHAPE fix, not a semantic upgrade. The in-code comment at :2622-:2626 states that `role: 'other'` is the honest gap arm: the binding carries no composition role, so the original role information is intentionally discarded rather than guessed. The previous shapes (`material_ref` inside composition entries and `role: 'primary'`) failed Ajv schema validation; these corrected shapes pass.

## (c) Evidence

### Vitest — compositionShape test

```
RUN  v1.6.1 /tmp/wt-L2-PROMPT2-SCIENCE-CHAIN-1-u4/server

 ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.compositionShape.test.ts  (1 test) 134ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Command: `cd server && npx vitest run src/compiler/pipeline/passes/ChatbotCompilePasses.compositionShape.test.ts`

### TypeScript compiler check

Output line count: 0 (clean)

Command: `cd server && npx tsc --noEmit -p .`

### Git show

```
5a18a952 u4fix6: fix material_ref and composition_snapshot shapes to match schema
 .../ChatbotCompilePasses.compositionShape.test.ts  | 163 +++++++++++++++++++++
 .../pipeline/passes/ChatbotCompilePasses.ts        |  44 +++---
 2 files changed, 188 insertions(+), 19 deletions(-)
```

## (d) Paperwork Defect Disclosure

The launcher matched a STALE exit marker from `L2-SCIENCE-CHAIN-1-u4fix3.md` — the old u4fix3 report was the newest file in `.hermes/plans/reports/` and its marker was picked up as if it belonged to u4fix6. No u4fix6 report existed in `.hermes/plans/reports/` before this document. This report is the first u4fix6 artifact. The run did NOT exit with a valid u4fix6 marker; the code was committed and green, but the paperwork was missing.

## (e) Scope boundary

This report documents only the u4fix6 unit. No browser/UI claim is made. No item-level verdict is given — the item-level adversarial review on `u4fix5c + u4fix6` is the orchestrator's step.

L2-PROMPT2-SCIENCE-CHAIN-1-u4fix6closeout UNIT u4fix6 DONE 5a18a95264f2755d76ffde2e82b5d4f8420b4dde
