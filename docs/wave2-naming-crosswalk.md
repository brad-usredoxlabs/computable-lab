# W2-1 Naming Crosswalk — wave-2 semantic-protocol-family memo

Item: W2-1-NAMING-CROSSWALK (lane 2, cl/integration-2). Headless: no UI, no
browser gate. Machine crosswalk: `schema/registry/wave2-naming-crosswalk.yaml`.
Verb adjudication table: `schema/registry/wave2-verb-adjudication.yaml`.
Enforcement test: `server/src/schema/Wave2NamingCrosswalk.test.ts`.

Every claim below carries a real file:line I opened in the worktree
(/mnt/vast/home/brad/git/wt/W2-1-lane2-l2t1155, branch W2-1-lane2-l2t1155 off
cl/integration-2 @ cb4b8ee4).

## 1. The eight neighbor nouns — all resolve to EXISTING records (no 9th kind)

| Memo noun | Bound existing record | Evidence (file:line opened) | Ruling |
|---|---|---|---|
| Semantic Protocol Family | `protocol` (upgraded in place) | schema/workflow/protocol.schema.yaml:25 (`kind: const "protocol"`); :21 (`protocolLayer: const "universal"`) | D1 |
| Lab Realization Plan | `local-protocol` | schema/workflow/local-protocol.schema.yaml:28 (`kind: const "local-protocol"`) | D1 |
| branch axes | `protocol.branch_axes`, fed by protocol-decision-tree | protocol.schema.yaml:294 (`branch_axes:` -> `./datatypes/condition.schema.yaml#/$defs/BranchAxis`); local-protocol.schema.yaml:88 (`branch_resolution:` "Matches a protocol branch_axes[].axisId" :99); schema/workflow/protocol-decision-tree.schema.yaml:25 (kind const) | D1/D4 |
| SAID | `vendor-protocol-candidate` | schema/workflow/vendor-protocol-candidate.schema.yaml:15 (`kind: const "vendor-protocol-candidate"`); :6 ("document truth plus provenance, not a final executable protocol"); anchors = server/src/ingestion/vendor-protocol/StepPdfAnchor.ts (exists; StepPdfAnchor.test.ts alongside) | D3 |
| MEANT / draft semantic protocol | `protocol` governed by extraction-draft + extraction-promotion | extraction-draft.schema.yaml:18 (`kind: const "extraction-draft"`); extraction-promotion.schema.yaml:26 (`const: extraction-promotion`) | D3/D5 |
| execution-scale choices | `execution-scale-profile` | schema/workflow/execution-scale-profile.schema.yaml:28 (`kind: const "execution-scale-profile"`); registry data dir schema/registry/execution-scale-profiles/ (4 profiles incl. robot-assist-plus-96.yaml) | D9 |
| operation-template | `operation-template` | schema/workflow/operation-template.schema.yaml:18 | neighbor |
| phase-template | `phase-template` | schema/workflow/phase-template.schema.yaml:22 | neighbor |

"semantic operation" is likewise already half-present: protocol.steps[].semanticVerb
(protocol.schema.yaml:774-775) -> `$defs/SemanticVerbRef` (:669-685: ref with
`kind: const record` + `type: const verb-definition` + `canonical` +
`backendHints[]`), targeting record kind `verb-definition`
(schema/workflow/verb-definition.schema.yaml:20) with seed records
records/seed/verb-definition/verb-*.yaml (10 files: autoclave, heat, incubate,
microwave, read, rock, set, shake, sonicate, stir). The round-0 grounding
already says the step "is halfway to a semantic operation today"
(~/.hermes/specs/intake/2026-10-09_semantic-protocol-family/round-0-grounding.md:80).

## 2. NO new record kind — explicit declaration list

Per D1, the following are FORBIDDEN as record kinds and are declared as such in
`schema/registry/wave2-naming-crosswalk.yaml` (`forbidden_kinds:`):
semantic-protocol-family, realization-plan / lab-realization-plan,
semantic-extraction-ir / extraction-ir, provenance-ladder, said, meant,
constraint-class, quantity, provenance-rung. Wave-2 vocabulary (provenance
rungs, constraint classes, Quantity) lands as enum VALUES / datatype files /
registry data on existing records — never as kinds. The admission test asserts
none of these strings exists in the enumerated `properties.kind.const` set
across every schema/**/*.schema.yaml (128 kinds enumerated today).

## 3. Provenance ladder rungs (VENDOR / DERIVED / INFERRED_INVARIANT / LOCAL_REALIZATION)

Bound as new-vocab-pending-admission in the crosswalk (W2-4 will mint them as
data on existing records): VENDOR -> vendor-protocol-candidate facts
(vendor-protocol-candidate.schema.yaml:15); LOCAL_REALIZATION ->
local-protocol.branch_resolution choices (local-protocol.schema.yaml:88-106);
DERIVED / INFERRED_INVARIANT -> conclusions with evidence anchors on the
protocol family (kind `protocol`). "locally-validated" stays DERIVED (query
over runs/evidence), never an attestation field (D3, task-list WAVE-2 header).

## 4. Constraint classes and Quantity (W2-2 pre-check)

D6's classes (ratios, concentrations, per-unit doses, minima/maxima,
capacities, thresholds, ordering, completion conditions, vendor defaults) are
crosswalked as ONE pending constraint vocabulary (`cf:constraint-class`), as
data. Quantity is a GENUINELY-MISSING datatype: schema/lab/datatypes/ holds
only chemical-properties.schema.yaml (directory listing verified);
schema/core/datatypes/ has amount.schema.yaml (:6 `required: [value, unit]`),
concentration.schema.yaml (:9 `required: [value, unit, basis]`),
reference-ratio.schema.yaml — no value+unit+dimension Quantity. W2-2 must
check amount/concentration overlap before minting names (never two local terms
for one entity). Capability terms bind to the existing `equipment-capability`
kind (schema/workflow/equipment-capability.schema.yaml:21) — bead-beater
(D6) needs no new kind.

## 5. Verb adjudication — two vocabularies, ONE mapping table, never merged

Machine-extracted counts (parsed from YAML, re-derived by the test):
- scientist-intent enum ($defs/actionVerb, scientist-intent.schema.yaml:22): **31**
- scientist-intent-vocabulary.yaml (`verbs:` :12): **31**, set-equal AND
  order-equal to the enum (verified by parse; drift-guarded by
  vocabularyMirrorDrift.test.ts)
- verb-definition seed records (records/seed/verb-definition/): **10**
- operations.yaml (kind: operation-registry, :1; `operations:` :3): **27** —
  third neighboring vocabulary, named, never conflated
- verb-action-map.yaml (`mappings:` :2): **26** — synonym/ontology map, a
  fourth neighboring surface

Mapping (schema/registry/wave2-verb-adjudication.yaml): same_operation =
VERB-INCUBATE<->incubate, VERB-READ<->read, VERB-SHAKE<->shake (3);
protocol-semantic-only (no compiler verb) = autoclave, heat, microwave, rock,
set, sonicate, stir (7); enum-only (no verb-definition) = 28 verbs
(seed, mix, resuspend, dilute, count, add_material, create_container,
transfer, stain, fix, permeabilize, block, quench, label, transfect, aliquot,
wash, elute, harvest, passage, freeze, thaw, spin, pellet, serial_dilution,
media_swap_duplicate_columns, source_wells_to_duplicate_target_columns,
repeat_rows). 3+7=10 and 3+28=31 — the table partitions both sets exactly
(asserted by the test). Zero verbs added to either vocabulary.

## 6. FINDINGS — genuine collisions TODAY (recorded, NOT resolved)

- W2-1-F1 `heat`: verb-definition VERB-HEAT canonical `heat`
  (records/seed/verb-definition/verb-heat.yaml:4) vs operations.yaml `incubate`
  aliases incl. `heat` (schema/registry/operations.yaml:36).
- W2-1-F2 `set`: VERB-SET canonical `set` (verb-set.yaml:4) vs operations.yaml
  `add_material` aliases incl. `set` (operations.yaml:16).
- W2-1-F3 `shake`: first-class enum verb (scientist-intent.schema.yaml:31) AND
  verb-definition canonical (verb-shake.yaml:4), yet operations.yaml folds it
  as an ALIAS of `mix` (operations.yaml:47); absent from verb-action-map.yaml.
- W2-1-F4 `spin`/`pellet` vs `centrifuge`: enum verbs spin (:53) and pellet
  (:54) are operations.yaml ALIASES of `centrifuge` (operations.yaml:66-69),
  and `centrifuge` is not an enum verb.
- W2-1-F5 coverage gap: verb-action-map.yaml has 26 mappings vs 31 enum verbs;
  unmapped = shake + the 4 pattern macros (class: pattern at
  scientist-intent-vocabulary.yaml:660/698/732/763).
- W2-1-F6 `warm`: alias `warm` is assigned to TWO distinct operations —
  operations.yaml `incubate` aliases incl. `warm` (schema/registry/operations.yaml:36)
  AND `thaw` aliases [warm] (schema/registry/operations.yaml:252); thaw also
  `expands_to: [incubate]` (:251). Inverse shape of F1-F5 — one local alias
  term for two entities; recorded for architect adjudication.

These are "two local terms for one entity" cases found by machine enumeration
across the neighboring vocabularies (F6 is the inverse shape — one alias term
shared by two entities — recorded for the same architect adjudication). Per the
hard rules they are FINDINGS
(status: collision) in memo + crosswalk data; resolving them is an architect
call, not a coder call. No triplet, lint, or vocabulary verbs list was edited.

## 7. Admission check (data + enforcement)

The predicate lives in the crosswalk's `admission:` section: (1) resolve
through the crosswalk, (2) no collision with record-kind / operation-id /
scientist-intent-verb / verb-definition-canonical / verb-action-map-verb
(normalized lowercase, '-' == '_'), (3) carry a `cf:`-style CURIE plan
(pattern `^cf:[a-z0-9][a-z0-9-]*$`; convention per
specifications/computable-lab-principles.md:43 and
schema/registry/lab-profile/lab-profile.yaml:14
`ontologyNamespace: "cf"`). Enforcement is
server/src/schema/Wave2NamingCrosswalk.test.ts — generic set-comparison over
the data files only; deliberately-colliding fixtures (local-protocol as a NEW
term, verb duplicate `incubate`, canonical `rock`, operation id `centrifuge`,
unlisted `semantic-extraction-ir`) are flagged; clean fixtures (Quantity +
the four rungs + constraint-classes) pass; a missing CURIE plan is rejected.
