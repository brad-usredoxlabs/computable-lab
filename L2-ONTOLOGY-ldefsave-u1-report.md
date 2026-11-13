# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit ldefsave-u1 (lane 2)

Make the labware-definition create door SAVE (g4/g6 DEFECT A+B). Fixed DECLARATIVELY
(ui spec data + schema data) — NO kind-branch in RecordCreatePanel.tsx.

## Worktree / branch / base
- worktree: /home/brad/cl-wt/L2-ONTOLOGY-ldefsave-lane2
- branch: cl/lane2-ontology-ldefsave-0820
- base: 641b17c3904d2199238710bc48fa75bd2832bea8

## Which change (DECISIVE — smaller lawful change)
- DEFECT B: WIDENED the schema. `ontology_ref` (additionalProperties:false,
  required [kind,id] unchanged) now declares the optional canonical ref-object
  keys `namespace`, `label`, `uri`. `uri` is IRI-patterned and present only when
  an IRI (matches the ref widget's `{kind:'ontology', id, namespace, label, uri?}`
  commit, refSelectionValue.ts — the canonical ref shape is untouched). The CURIE
  pattern on `id` is kept.
- DEFECT A: chose the SMALLER lawful change = DROPPED `recordId`, `type`,
  `topology`, `capacity` from the schema `required` list (now `[kind, id,
  display_name]`). All four STAY declared and value-constrained as optional
  properties, so a complete import/seed still validates fully. Rationale:
  - recordId is SPINE identity — knowledge kinds carry the AUTHOR's `id`
    (GC-16 D-A: never client-fabricated); the server derives recordId from the
    author id via extractRecordId's id-fallback (server/src/types/RecordEnvelope.ts).
  - `type` is a const redundant with `kind` (auto-satisfied only when sent).
  - `topology`/`capacity` are optional structural facts supplied by import/
    authoring, not by the minimal create door.
  This is the only way the GATE TARGET (name + identifier + anchor -> 201) works
  without client code: the create form collects only display_name + id (+ vendor +
  ontology_ref), and its required marks now match the schema's required list.

## Files changed (3 of max 4; 147 insertions / 4 deletions — within the 150-line budget)
1. schema/workflow/labware-definition.schema.yaml (schema data fix — steps 1)
   - required: [kind, id, display_name] (was [kind, recordId, type, id, display_name, topology, capacity])
   - ontology_ref: + optional namespace / label / uri (uri IRI-patterned)
2. schema/workflow/labware-definition.ui.yaml (ui spec fix — step 2)
   - Header documents the declarative DEFECT-A decision (required list + why).
   - Field comments annotate the required marks and the DEFECT-B resolution.
   - Field SET unchanged: display_name(text,req) id(text,req) ontology_ref(ref,
     optional) vendor(text,optional). No hidden const field added (not needed).
3. server/src/ui/LabwareDefinitionUiSpec.test.ts (test — step 3)
   - 5 baseline pins unchanged + 5 new SAVE pins that run the REAL projected
     create-door payload through the REAL AjvValidator (same SchemaLoader +
     AjvValidator construction as LabwareDefinitionAnchor.test.ts):
     1. door payload (name + author id + anchor microplate LWO:0000120, canonical
        ref object) validates server-side (AC1);
     2. canonical ref keys namespace/label/uri no longer Unknown properties
        (DEFECT B, AC2: ontology_ref.id == "LWO:0000120" survives);
     3. an unanchored definition still validates (optionality preserved, AC3);
     4. a malformed CURIE anchor is still refused (CURIE pattern kept);
     5. the schema required list is pinned to [kind, id, display_name].

## Verification (all executed in this worktree)
- `npm run test:run -w server -- LabwareDefinitionUiSpec` => 10 passed (5 baseline + 5 new). (baseline measured 5 passed)
- `npm run test:run -w server -- LabwareDefinitionAnchor` => 5 passed (13/39 seed labware-definition records validate; my required change does not regress them).
- Both together => Test Files 2 passed, Tests 15 passed.
- `python3 -c "import yaml; yaml.safe_load(open('schema/workflow/labware-definition.schema.yaml'))"` => OK
- `python3 -c "import yaml; yaml.safe_load(open('schema/workflow/labware-definition.ui.yaml'))"` => OK
- Python asserts: schema.required == [kind, id, display_name]; ontology_ref
  required [kind,id] + additionalProperties false; ref props == {kind,id,namespace,label,uri};
  uri pattern matches an LWO IRI.
- `npm run typecheck -w server` (tsc --noEmit) => clean.
- `git diff --stat <base>` => ONLY the 3 owned files; no RecordCreatePanel.tsx / taptab ref files / other paths touched.

## Acceptance status
1. Create through the labware-definition door validates server-side: the projected
   payload (name + author id + anchor microplate LWO:0000120) is proven 2xx-equivalent
   by a server-side vitest that validates it against the real schema — no Missing-required
   and no Unknown-property errors. (The live POST 201 + GET-readback is the LATER
   GATE TARGET, not part of this unit's acceptance; the server-side Ajv proof stands in for it.)
2. ontology_ref.id == "LWO:0000120" survives validation; namespace/label/uri are no
   longer Unknown properties. (AC2 pin #2.)
3. LabwareDefinitionUiSpec.test.ts fully green incl. new pins (10/10); an unanchored
   definition still validates (optionality preserved). (pin #3.)

## Owner / resume
- Owner: cl-coder (lane 2). No blockers. Nothing left dirty.
- Implementation complete. Acceptance (live 201/GET-readback via the /record/new
  door) is owned by the independent browser reviewer + orchestrator lane reload
  (YAML changes require the orchestrator to reload the lane stack before live verify).
- Next action (orchestrator): reload lane stack; run the g4/g6 gate browser leg.

## Commit chain (this unit)
- 074ee749  step 1 — schema data fix (DEFECT A+B)
- 2689881a  step 2 — ui spec data (DEFECT A+B, declarative)
- f5da440b  step 3 — save pins for the create door (DEFECT A+B)
- 3ab05921  tighten comments to the 150-line budget (behavior-neutral)

L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT ldefsave-u1 DONE <sha>
