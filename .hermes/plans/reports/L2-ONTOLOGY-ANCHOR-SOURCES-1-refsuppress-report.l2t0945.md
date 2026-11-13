# L2-ONTOLOGY-ANCHOR-SOURCES-1 refsuppress — report (lane 2, l2t0945)

Worktree: /home/brad/cl-wt/L2-ONTOLOGY-refsuppress-lane2
Branch: cl/lane2-ontology-refsuppress-0945
Base: 5670fc4f91df463c780a8eadb4d72e51393878c6

## Unit
refsuppress: an ontology-ref field must stop offering the lab-local vocabulary
tier, because a local row commits a bare string that `ontology_ref` (`type: object`,
schema/workflow/labware-definition.schema.yaml:46-47) always rejects (422). Source:
adversarial review of ldefsave-u1, finding [F2]. Chosen direction: suppress the
tier (option 1 of the review's two lawful directions) at the shared combobox, so
every consumer (ObjectWidget ref sub-field, ChipComboboxWidget) gets it at once.
Schema stays PROHIBITED-as-is; not relaxed.

## Decisions
- Reuse the existing per-field, plan-driven switch idiom from 29df6dfc
  (`includeLocalObo = sources.includes('local-obo')`): one derived constant
  `offerLocalTier`, no second switch, no touch to sources/useOls/local-obo.
- Gate only the `enabled:` argument of `useTagSuggestions`; the real hook returns
  an EMPTY list when disabled (useTagSuggestions.ts:47-51), so no hand filtering
  of `localResults` is needed and the dropdown/header/nav code is untouched.
- Default preserved: a plan with no `valueShape` (`undefined !== 'ontology-ref'`)
  still offers the local tier.
- No change to the ontology commit arm, keyboard order, allowCreate floor.

## Step 1 — RED (new pin file)
Added `app/src/editor/taptab/RefCombobox.ontologyref.test.tsx` (harness shape
copied from RefCombobox.test.tsx, not imported; useTagSuggestions/useResolveOntology
mocks honour `enabled` exactly as the real hooks do).
Case (a) valueShape 'ontology-ref' → no "Local vocabulary"/local row, ontology row present.
Case (b) valueShape 'ref' → local tier still offered.

RAW RED on the pre-fix tree:

```
 ❯ src/editor/taptab/RefCombobox.ontologyref.test.tsx  (2 tests | 1 failed) 102ms
   ❯ ... > offers ontology rows only when the plan valueShape is ontology-ref
     → expected <li class="group-header" …(1)></li> to be null
 FAIL  ... AssertionError: expected <li class="group-header" …(1)></li> to be null
 ❯ src/editor/taptab/RefCombobox.ontologyref.test.tsx:91:52
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```
