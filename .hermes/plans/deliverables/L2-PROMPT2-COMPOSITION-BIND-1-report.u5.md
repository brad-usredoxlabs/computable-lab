# L2-PROMPT2-COMPOSITION-BIND-1 UNIT 5 REPORT

## Summary
Widened the vocabulary `domain` declaration slot to accept either a string OR an array of strings. This is the DECLARATION layer only — no resolution behaviour change yet (unit 6 handles the filter).

## Changed Files
1. `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` — `domain` property changed from `type: string` to `oneOf: [string, array]` with minItems/uniqueItems/minLength constraints. Description updated to explain set semantics.
2. `schema/scientist-intent/scientist-intent-vocabulary.yaml` — widened `source` arg domain for transfer-family verbs.
3. `server/src/compiler/scientistIntent/vocabulary.ts` — type widened to `string | readonly string[]` at both the contract interface and RawArg. Loader uses conditional spread.
4. `server/src/compiler/scientistIntent/domainSetDeclaration.test.ts` — NEW test file (3 tests).
5. Lint rule P1 (`vocab-resolvable-args-declare-domain`) requires NO change — `nonEmpty` predicate already treats empty arrays as empty (fail) and non-empty arrays as valid (pass).

## Per-Verb Domain-Widening Justification
| Verb       | source arg widened? | Justification |
|------------|---------------------|---------------|
| seed       | YES                 | Transfer-family: sources liquid from a container (labware) OR a formulation (material). |
| transfer   | YES                 | Transfer-family: moves liquid from labware or material. |
| mix        | YES                 | Transfer-family: mixes contents from source containers. |
| resuspend  | YES                 | Transfer-family: resuspends pellet from source container. |
| dilute     | YES                 | Transfer-family: dilutes from source container or formulation. |
| incubate   | NO                  | source is the labware container holding the incubation — never a material. |

## Test Results
- `npx vitest run src/compiler/scientistIntent/domainSetDeclaration.test.ts` — 3/3 PASSING
- Vocabulary load smoke: `loadScientistIntentVocabulary` loads all 37 verbs without errors, domains resolve correctly:
  - seed/mix/resuspend/dilute/transfer: `["labware","material"]`
  - incubate: `"labware"`

## Typecheck
- `npm run typecheck` reports 2 errors — BOTH in files PROHIBITED for this unit:
  - `strategies.ts(51,87)`: TS2345 — domain is now union type, consumer expects string (unit 6 fixes)
  - `mixtureLabelRedundancy.ts(234,90)`: TS2339 — `toLowerCase` on union type (unit 6 fixes)
- Baseline was 33 errors on trunk; this unit introduces 2 new errors in the filter layer (expected, resolved by unit 6).

## Blockers
None — unit 5 is complete. The 2 typecheck errors are expected and will be resolved by unit 6's filter-layer changes.

L2-PROMPT2-COMPOSITION-BIND-1 UNIT 5 DONE 79418258a462bc8d71850e0b01a1f5e2472dc90e
