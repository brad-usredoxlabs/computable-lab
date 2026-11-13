# L2-ONTOLOGY-ANCHOR-SOURCES-1 refsuppress — report (lane 2, l2t0945)

Worktree: /home/brad/cl-wt/L2-ONTOLOGY-refsuppress-lane2
Branch: cl/lane2-ontology-refsuppress-0945
Base: 5670fc4f91df463c780a8eadb4d72e51393878c6

## Unit
refsuppress: an ontology-ref field must stop offering the lab-local vocabulary
tier, because a local row commits a bare string that `ontology_ref` (`type: object`,
schema/workflow/labware-definition.schema.yaml:46-47) always rejects (422). Source:
adversarial review of ldefsave-u1, finding [F2] ("UX-only: the picker offers an
option the schema will always reject"). Chosen direction: suppress the tier (option
1 of the review's two lawful directions) once, in the shared combobox, so every
consumer (ObjectWidget ref sub-field, ChipComboboxWidget) is covered at once.
Schema/YAML untouched and still PROHIBITED as-is; nothing here is data-driven.

## Decisions (resolved from code, not intent)
- Reused the existing per-field plan switch idiom from 29df6dfc
  (`includeLocalObo = sources.includes('local-obo')`): one derived constant
  `offerLocalTier`, no second switch, no touch to `sources`/`useOls`/`includeLocalObo`.
- Gated only the `enabled:` argument of `useTagSuggestions`. The real hook returns an
  EMPTY list when disabled (useTagSuggestions.ts:47-51/80), so no hand-filtering of
  `localResults` is needed; dropdown items, headers, keyboard order and the
  ontology commit arm are untouched.
- Default preserved: `undefined !== 'ontology-ref'`, so a plan with no `valueShape`
  still offers the local tier (existing test "defaults to local-only sources…").
- The test mocks honour `enabled` exactly like the real hooks, otherwise the gate
  would be unmeasurable through the mock.

## Step 1 — RED (new pin file)
Added `app/src/editor/taptab/RefCombobox.ontologyref.test.tsx` — harness SHAPE copied
from RefCombobox.test.tsx, not imported from it. Case (a) `valueShape: 'ontology-ref'`
(sources ['local','ols']) → no `Local vocabulary` header/local row, ontology row present.
Case (b) `valueShape: 'ref'` → local tier still offered.

RAW RED on the pre-fix tree:

```
 ❯ src/editor/taptab/RefCombobox.ontologyref.test.tsx  (2 tests | 1 failed) 102ms
   ❯ ... > offers ontology rows only when the plan valueShape is ontology-ref
     → expected <li class="group-header" …(1)></li> to be null
 FAIL ... AssertionError: expected <li class="group-header" …(1)></li> to be null
 ❯ src/editor/taptab/RefCombobox.ontologyref.test.tsx:91:52
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

## Step 2 — the change (product)
`app/src/editor/taptab/RefCombobox.tsx`, +5/-1:
`const offerLocalTier = suggestionPlan?.valueShape !== 'ontology-ref';`
`enabled: offerLocalTier && query.length >= 1,`

## Step 3 — mutation probe (on the final compacted pin file)
Mutated exactly `enabled: offerLocalTier && query.length >= 1` → `enabled: query.length >= 1`
(derived constant kept). RAW:

```
FAIL  src/editor/taptab/RefCombobox.ontologyref.test.tsx > RefCombobox ontology-ref local-tier suppression > offers ontology rows only when valueShape is ontology-ref
AssertionError: expected <li class="group-header" …(1)></li> to be null
 ❯ src/editor/taptab/RefCombobox.ontologyref.test.tsx:43:52
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```
Gate is load-bearing (not vacuous). Product file reverted immediately; re-run green.

## VERIFY (raw, final tree)
New pins — `cd app && npx vitest run src/editor/taptab/RefCombobox.ontologyref.test.tsx`:
```
 Test Files  1 passed (1)
       Tests  2 passed (2)
```

No-regression — `cd app && npx vitest run src/editor/taptab/RefCombobox.test.tsx`:
```
 ❯ src/editor/taptab/RefCombobox.test.tsx  (8 tests | 2 failed) 151ms
   ❯ ... > commits structured value with provenance on Enter for ontology result
   ❯ ... > respects ontologies restriction from suggestionPlan
 Test Files  1 failed (1)
       Tests  2 failed | 6 passed (8)
```
EXACTLY the measured baseline (2 failed / 6 passed, same two pre-existing names,
mock drift on the resolve hook). Zero new failures; the file was not touched.

Typecheck (`npx tsc --noEmit`, run although not required): 13 pre-existing
module-resolution errors in the tree; the only `src/editor/taptab/` ones are the
known `prosemirror-view` (tabNavPlugin.ts:7) and `ajv/dist/2020.js`
(ObjectWidget.nested.test.tsx:53) link errors. ZERO errors naming RefCombobox.tsx
or anything introduced here.

Tree clean at exit (`git -c core.fileMode=false status --short`):
```
(empty)
```

## Diff
`git diff --stat 5670fc4f..HEAD` → 3 files: RefCombobox.tsx (+5/-1),
RefCombobox.ontologyref.test.tsx (new, 54 lines), this report. Code lines added
total 60 (product 6 added diff lines incl. the comment; test 54) — within the
<= 60 budget. No new dependency, no schema/YAML/server/config change, no other
worktree touched.

## Acceptance / next
AC1-AC3 are NOT graded here (normal tier: no per-unit browser gate; the next
ONTOLOGY journey milestone covers AC1-AC3 on :5193). Review containment: ONE
independent review of this shared-widget option-boundary change before merge.
Resume condition for that review: this branch @ 7cfe4726 (green pin + baseline).

L2-ONTOLOGY-ANCHOR-SOURCES-1-refsuppress UNIT unit DONE 7cfe47264bb84a26d851188f876255c521b226da
