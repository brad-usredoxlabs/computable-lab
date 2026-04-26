# Protocol IDE Anchor Stability Implementation Sequence

Date: 2026-04-26
Status: Draft — ready for execution

This document specifies Stage A0 of the Protocol IDE feedback-loop work: the data model for stable anchors and phases. Stage A0 is a precondition for Stage A1 (real LLM compile pass that consumes feedback) and Stage A2 (reconciliation pass + orphan UI). Neither A1 nor A2 are in scope here.

The motivating problem: today the Protocol IDE accepts user comments anchored to event-graph nodes by positional ID (`event:0042`). Across re-compiles those IDs are unstable, so comments orphan or misattach. Without stable anchors the feedback loop cannot accumulate signal across reruns, which means the compiler cannot meaningfully learn from prior corrections.

The solution: declare phases as a first-class protocol concept, derive a stable semantic key for every event-graph node from a small per-verb identity declaration, and migrate comment anchors to a polymorphic `anchors[]` array that combines node identity, source-document citation, and snapshot context.

## Guiding Principles

1. Schema-first. Identity rules live in YAML on the verb definitions, not in TypeScript branching.
2. Conservative identity. Anything that could plausibly change as a refinement (volumes, concentrations, equipment, exact wells) is a parameter, not identity. Snapshot fields carry the parameter context for reviewers.
3. Source-document anchors are the durable floor. Where a comment originates from a citation, the source anchor accompanies the node anchor as backup.
4. Additive over breaking. New fields default to optional; lints start as warnings and tighten when the producer side is in place.
5. Test data is disposable. No migration scripts. If existing session/event-graph records become invalid under the new schema, regenerate or discard them.

## Sequence Overview

1. PR1: Phase template library (additive records and schema)
2. PR2: Phases inline on protocols (modifies protocol schema)
3. PR3: Verb semantic inputs and derivation registry (modifies verb-definition schema, updates 27 verb records)
4. PR4: Event-graph node semantic keys (modifies event-graph schema, adds key-computation utility)
5. PR5: Comment anchors restructured as `anchors[]` (modifies session schema)

PRs 1–3 are independent and can be sequenced in any order. PR4 depends on PR1 (phase concept) and PR3 (verb identity declarations). PR5 depends on PR4 (semantic key shape).

Out of scope for this sequence:
- LLM compile pass that consumes the rolling summary or anchored feedback (Stage A1).
- Reconciliation pass that reattaches orphaned comments after re-compile (Stage A2).
- Any UI changes beyond minimal display of new fields.
- Curation surface for promoting comments to lint rules (Stage C).

## PR1: Phase Template Library

### Goal

Introduce `phase-template` as a record type and seed the canonical phase library so PR2 has something to reference.

### Files

- `/home/brad/git/computable-lab/schema/workflow/phase-template.schema.yaml` (new)
- `/home/brad/git/computable-lab/schema/workflow/phase-template.lint.yaml` (new)
- `/home/brad/git/computable-lab/schema/workflow/phase-template.ui.yaml` (new)
- `/home/brad/git/computable-lab/server/src/schema/SchemaRegistry.ts` (register the new schema)
- `/home/brad/git/computable-lab/server/src/schema/SchemaRegistry.test.ts` (registration test)
- `/home/brad/git/computable-lab/records/workflow/PHASE-*.yaml` (15 new seed records, listed below)

### Schema shape

`phase-template`:

- `id` (string, matches `^PHASE-[A-Z0-9-]+$`)
- `kind` (const `phase-template`)
- `canonical` (string slug, e.g. `cell-plating`)
- `label` (display name, e.g. `Cell Plating`)
- `description` (string, one to three sentences explaining what the phase represents)
- `domain` (string, one of `cell-biology`, `biochemistry`, `molecular-biology`, `general`)

### Seed records

Author one record per row, file naming `PHASE-<SLUG>__<canonical>.yaml`:

| ID | Canonical | Label | Domain | Description |
|---|---|---|---|---|
| `PHASE-PREPARATION` | `preparation` | Preparation | `general` | Prep work before the experiment proper begins (dilutions, aliquoting, equipment setup). |
| `PHASE-CELL-PLATING` | `cell-plating` | Cell Plating | `cell-biology` | Seeding cells into culture plates. |
| `PHASE-ACCLIMATE` | `acclimate` | Acclimate | `cell-biology` | Allow cells or samples to equilibrate after a manipulation (commonly overnight post-plating). |
| `PHASE-COMPOUND-ADDITION` | `compound-addition` | Compound Addition | `cell-biology` | Add drugs, treatments, or perturbagens to samples. |
| `PHASE-TREATMENT-INCUBATE` | `treatment-incubate` | Treatment Incubation | `cell-biology` | Hold samples post-treatment for the biological response window. |
| `PHASE-WASH` | `wash` | Wash | `general` | Replace media or buffer to remove non-bound material. |
| `PHASE-FIXATION` | `fixation` | Fixation | `cell-biology` | Fix cells or tissue (formalin, methanol, etc.) for downstream staining or imaging. |
| `PHASE-STAIN` | `stain` | Stain | `cell-biology` | Apply dyes, antibodies, or other labels. |
| `PHASE-LYSIS` | `lysis` | Lysis | `general` | Break cells open for content extraction. |
| `PHASE-EXTRACTION` | `extraction` | Extraction | `biochemistry` | Isolate analyte from lysate (RNA, protein, metabolite). |
| `PHASE-AMPLIFICATION` | `amplification` | Amplification | `molecular-biology` | PCR, qPCR, isothermal amplification. |
| `PHASE-PLATE-READ` | `plate-read` | Plate Read | `general` | Quantitative readout on a plate reader (absorbance, fluorescence, luminescence). |
| `PHASE-IMAGING` | `imaging` | Imaging | `cell-biology` | Microscopy or other image-based readout. |
| `PHASE-QUANTIFICATION` | `quantification` | Quantification | `biochemistry` | Concentration measurement (NanoDrop, Qubit, Bradford, etc.). |
| `PHASE-CLEANUP` | `cleanup` | Cleanup | `general` | Post-experiment teardown, waste disposal, equipment reset. |

### Lint rules

- `id` matches the prefix pattern.
- `canonical` is unique across the phase-template registry.
- `domain` is one of the four allowed values.

### Exit Criteria

- New schema validates and registers.
- All 15 seed records pass schema and lint.
- Tests cover registration and at least one seed record load.

### Risk

Low. Pure addition. No existing records affected.

## PR2: Phases Inline On Protocols

### Goal

Add the `phases` declaration to protocols and require every event/step to reference a phase. Backfill existing test protocols.

### Files

- `/home/brad/git/computable-lab/schema/workflow/protocol.schema.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/protocol.lint.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/protocol.ui.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/local-protocol.schema.yaml` (modify if local-protocol carries its own event list)
- `/home/brad/git/computable-lab/schema/workflow/local-protocol.lint.yaml` (modify accordingly)
- Existing `records/workflow/*.protocol.yaml` and any local-protocol records used in tests (backfill phases)
- Tests covering phase validation and the lint rules

### Schema additions

On `protocol`:

```
phases:
  type: array
  items:
    type: object
    required: [id, label, ordinal]
    properties:
      id:           # human-readable slug, unique within this protocol
        type: string
        pattern: ^[a-z][a-z0-9-]*$
      label:
        type: string
      description:
        type: string
      ordinal:
        type: integer
        minimum: 1
      templateRef:  # optional pointer to a phase-template record
        type: string
        pattern: ^PHASE-[A-Z0-9-]+$
```

On every event/step within a protocol (and within `local-protocol` if applicable):

```
phaseId:
  type: string
  description: id of the phase this event belongs to (must match a phase declared on the parent protocol)
```

For PR2 specifically, `phaseId` is required on new records but starts as optional in the schema. Lint warns when missing; PR4 tightens it once the seed protocols are backfilled.

### Lint rules

- Phase ids unique within a protocol.
- Phase ordinals contiguous starting at 1.
- Every event's `phaseId` resolves to a declared phase on the same protocol.
- If `templateRef` set, must resolve to an existing `phase-template` record.

### Backfill

For every test protocol record under `records/workflow/`:

- Inspect events; group them into the canonical phases from PR1 by domain context.
- Add a `phases` block with appropriate `templateRef` values where canonical templates apply.
- Add `phaseId` to each event.

If a test protocol has no obvious phase decomposition, declare a single `phase: general` with no template reference and assign every event to it. Acceptable as a minimum.

### Exit Criteria

- Schema and lints updated.
- All test protocol records pass schema validation and lint without warnings.
- Tests cover the four lint rules.

### Risk

Medium. Backfill is mechanical but touches every existing protocol record.

## PR3: Verb Semantic Inputs And Derivation Registry

### Goal

Establish the registry of derivation functions and declare per-verb `semanticInputs` for all 27 existing verb-definition records. This unblocks PR4's semantic-key computation.

### Files

- `/home/brad/git/computable-lab/schema/registry/derivations/derivation.schema.yaml` (new)
- `/home/brad/git/computable-lab/schema/registry/derivations/*.yaml` (new, one per derivation function, listed below)
- `/home/brad/git/computable-lab/schema/workflow/verb-definition.schema.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/verb-definition.lint.yaml` (new if missing, else modify)
- `/home/brad/git/computable-lab/records/workflow/VERB-*.yaml` (modify all 27)
- `/home/brad/git/computable-lab/server/src/protocol/derivations/index.ts` (new — TS implementations of each derivation function, indexed by name)
- `/home/brad/git/computable-lab/server/src/protocol/derivations/*.test.ts` (per-function tests)

### Derivation registry shape

`derivation` record:

- `id` (string, matches `^DRV-[A-Z0-9-]+$`)
- `kind` (const `derivation`)
- `canonical` (string slug — the function name referenced from verb declarations)
- `description` (string, one paragraph explaining behavior)
- `inputType` (string, e.g. `formulation`, `labware-instance`, `program`, `string`)
- `returnType` (string, e.g. `string`, `string-multiset`)

### Seed derivation records

| canonical | inputType | returnType | Description |
|---|---|---|---|
| `labware_role` | `labware-instance` | `string` | Returns the user-given role/handle of a labware instance (e.g. `reagents-reservoir`). For auto-generated labware, returns the synthetic `auto:<derived-from>:<purpose>` form. |
| `active_ingredients` | `formulation` | `string-multiset` | Walks the formulation graph and returns the sorted multiset of active substance IDs, joined with `+` as a slug. Stops at any node that has its own record id (named materials are treated as single substances). Excludes solvents. For pure-vehicle formulations (no actives), returns the synthetic token `vehicle:<solvent_id>`. |
| `solvent` | `formulation` | `string` | Returns the solvent substance id of a formulation. (Not used for identity per current verb seeds, but available for future use.) |
| `substance_id` | `substance` | `string` | Pass-through for verbs that take a substance reference directly without formulation wrapping. |
| `program_id` | `program` | `string` | For verbs with named programs (thermal cycling). Returns canonical program id; specific time/temp parameters within the program are not identity. |
| `modality` | `string` | `string` | For verbs with a modality field (read, image, measure). Returns the raw modality value (e.g. `absorbance`, `fluorescence`, `brightfield`). |
| `passthrough` | `string` | `string` | Identity function — returns the field value as-is. Used for simple string-typed identity components. |

Each derivation gets a backing TS implementation under `server/src/protocol/derivations/`. The index file exports a name-keyed dispatch map. The map is the only thing the semantic-key computation in PR4 uses.

### Verb-definition schema additions

Add to `verb-definition.schema.yaml`:

```
semanticInputs:
  type: array
  items:
    type: object
    required: [name, derivedFrom, required]
    properties:
      name:
        type: string
        description: identity component name (e.g. substance, sourceRole)
      derivedFrom:
        type: object
        required: [input, fn]
        properties:
          input:
            type: string
            description: name of the field on the verb invocation
          fn:
            type: string
            pattern: ^[a-z][a-z_]*$
            description: name of a registered derivation function
      required:
        type: boolean
```

### Verb-definition lint rules

- Each `semanticInputs[].derivedFrom.fn` must reference a registered derivation.
- Each `semanticInputs[].name` is unique within a verb's `semanticInputs`.

### Per-verb seed declarations

Update each VERB-* record with a `semanticInputs` block. Final declarations after all decisions:

| Verb | Identity Inputs |
|---|---|
| `VERB-TRANSFER` | `substance` ← `active_ingredients(formulation)` required; `sourceRole` ← `labware_role(source)` required; `destRole` ← `labware_role(destination)` required |
| `VERB-ASPIRATE` | `substance` ← `active_ingredients(formulation)` optional; `sourceRole` ← `labware_role(source)` required |
| `VERB-DISPENSE` | `substance` ← `active_ingredients(formulation)` optional; `destRole` ← `labware_role(destination)` required |
| `VERB-MIX` | `targetRole` ← `labware_role(target)` required |
| `VERB-DILUTE` | `substance` ← `active_ingredients(formulation)` required; `targetRole` ← `labware_role(target)` required |
| `VERB-WASH` | `targetRole` ← `labware_role(target)` required |
| `VERB-CENTRIFUGE` | `targetRole` ← `labware_role(target)` required |
| `VERB-PELLET` | `targetRole` ← `labware_role(target)` required; `substance` ← `active_ingredients(substanceRef)` optional |
| `VERB-RESUSPEND` | `targetRole` ← `labware_role(target)` required |
| `VERB-INCUBATE` | `targetRole` ← `labware_role(target)` required |
| `VERB-HEAT` | `targetRole` ← `labware_role(target)` required |
| `VERB-COOL` | `targetRole` ← `labware_role(target)` required |
| `VERB-THERMAL-CYCLE` | `targetRole` ← `labware_role(target)` required; `program` ← `program_id(programRef)` required |
| `VERB-SEAL` | `targetRole` ← `labware_role(target)` required |
| `VERB-UNSEAL` | `targetRole` ← `labware_role(target)` required |
| `VERB-LABEL` | `targetRole` ← `labware_role(target)` required |
| `VERB-STORE` | `targetRole` ← `labware_role(target)` required; `locationRole` ← `passthrough(locationId)` required |
| `VERB-DISPOSE` | `targetRole` ← `labware_role(target)` required |
| `VERB-FILTER` | `targetRole` ← `labware_role(source)` required; `substance` ← `active_ingredients(formulation)` optional |
| `VERB-HOMOGENIZE` | `targetRole` ← `labware_role(target)` required |
| `VERB-LYSE` | `targetRole` ← `labware_role(target)` required |
| `VERB-SONICATE` | `targetRole` ← `labware_role(target)` required |
| `VERB-VORTEX` | `targetRole` ← `labware_role(target)` required |
| `VERB-MEASURE` | `targetRole` ← `labware_role(target)` required; `measurementType` ← `modality(measurementType)` required |
| `VERB-READ` | `targetRole` ← `labware_role(target)` required; `readModality` ← `modality(modality)` required |
| `VERB-IMAGE` | `targetRole` ← `labware_role(target)` required; `imagingMode` ← `modality(mode)` required |
| `VERB-WEIGH` | `targetRole` ← `labware_role(target)` required; `substance` ← `active_ingredients(substanceRef)` optional |

If a verb invocation lacks an `optional` input, the derivation is skipped and that component is absent from the semantic key. If a `required` input is missing, the verb invocation is invalid (lint error from PR4).

### Exit Criteria

- Derivation schema and seed records validate.
- Verb-definition schema gains `semanticInputs` field.
- All 27 VERB-* records updated and pass lint.
- TS derivation functions implemented and unit-tested.

### Risk

Medium. The 27 record edits are mechanical given the table above. The TS derivation functions need careful handling of the formulation walk for `active_ingredients` (must respect named-material boundaries and handle vehicle-only formulations).

## PR4: Event-Graph Node Semantic Keys

### Goal

Add `semanticKey` and `semanticKeyComponents` to event-graph nodes. Implement the key-computation utility that consumes a node + its parent protocol's phases + the verb's semanticInputs declaration and produces the canonical key.

This PR does **not** wire the key into the existing compile pipeline. Stage A1 will do that. PR4 only ships the schema, lint, and the standalone utility.

### Files

- `/home/brad/git/computable-lab/schema/workflow/event-graph.schema.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/event-graph.lint.yaml` (new if missing, else modify)
- `/home/brad/git/computable-lab/schema/workflow/event-graph.ui.yaml` (modify — add a debug disclosure for the key)
- `/home/brad/git/computable-lab/server/src/protocol/SemanticKeyBuilder.ts` (new)
- `/home/brad/git/computable-lab/server/src/protocol/SemanticKeyBuilder.test.ts` (new)
- `/home/brad/git/computable-lab/server/src/compiler/material/MaterialCompiler.ts` (export `slugify` for reuse if not already, otherwise import)

### Schema additions

On each event node within `event-graph.schema.yaml`:

```
semanticKey:
  type: string
  pattern: ^EVT-[a-z0-9-]+$
  description: deterministic identity slug for this event, derived from semanticKeyComponents
semanticKeyComponents:
  type: object
  required: [verb, identity, phaseId, ordinal]
  properties:
    verb:
      type: string
      description: canonical verb name (lowercase)
    identity:
      type: object
      additionalProperties:
        oneOf:
          - { type: string }
          - { type: array, items: { type: string } }
      description: keyed by semanticInputs[].name from the verb declaration; values may be a string or sorted multiset
    phaseId:
      type: string
      description: id of the phase this event belongs to
    ordinal:
      type: integer
      minimum: 1
      description: 1-based ordinal among events within the same phase that share the same (verb, identity) tuple
```

Both fields are **optional** in the schema for PR4 (existing test event graphs lack them). Lint warns when missing. PR5 and Stage A1 progressively tighten this.

### Key derivation rules

`SemanticKeyBuilder` consumes:

- A single event node (with its raw fields)
- The verb-definition record (for `semanticInputs`)
- The parent protocol's phase declarations (to confirm `phaseId`)
- The list of all events in the same graph (to compute `ordinal`)

It produces:

- `semanticKeyComponents`: populated by running each `semanticInputs` derivation against the node's fields. Multi-valued returns (from `active_ingredients`) are stored as sorted arrays.
- `semanticKey`: deterministic slug `EVT-<slugify(verb-identity-phase-ordinal)>` where the identity portion concatenates components in the order declared on the verb, joined by `-`. Multi-valued components join with `+` before being passed to slugify (so `[clofibrate, fenofibrate, gemfibrozil]` becomes `clofibrate+fenofibrate+gemfibrozil`).

Use the existing `slugify` from `MaterialCompiler.ts` for the final slug step (consistency with `MAT-` and `MSP-` IDs already minted).

Example for the canonical clofibrate transfer:

```
semanticKeyComponents:
  verb: transfer
  identity:
    substance: [clofibrate]
    sourceRole: reagents-reservoir
    destRole: cell-plate
  phaseId: dose-administration
  ordinal: 1
semanticKey: EVT-transfer-clofibrate-reagents-reservoir-cell-plate-dose-administration-1
```

For a 3-drug cocktail:

```
identity:
  substance: [clofibrate, fenofibrate, gemfibrozil]   # sorted
semanticKey: EVT-transfer-clofibrate-fenofibrate-gemfibrozil-reagents-reservoir-cell-plate-dose-administration-1
```

### Auto-generated labware naming

If the compiler ever introduces a labware instance with no user-given role, the role must follow the convention `auto:<derived-from-role>:<purpose>` (e.g. `auto:reagents-reservoir:staging`). This convention must be reproducible across reruns. PR4 does not introduce auto-labware itself — but the `labware_role` derivation must recognize and pass through these synthetic roles unchanged.

### Lint rules

- If `semanticKey` is present, `semanticKeyComponents` must also be present and produce the same slug.
- If both are present, semanticKey is unique within the graph.
- If both are present, `verb` matches a known verb-definition.
- If both are present, `phaseId` resolves to a phase on the source protocol.
- All four lints emit warnings (not errors) for PR4. They become errors after Stage A1 ensures every new event has the fields populated.

### UI changes

Minimal: in the event-graph node detail panel, add a collapsible "Identity" section showing `semanticKey` and the components dictionary. Read-only. Used for debugging.

### Exit Criteria

- Schema gains the two fields.
- `SemanticKeyBuilder` correctly computes keys for at least these cases:
  - Single-substance transfer
  - Multi-substance cocktail transfer
  - Vehicle-only transfer
  - Verb with no substance (centrifuge, incubate)
  - Verb with modality (read, image, thermal-cycle)
  - Auto-generated labware role
- Lint warnings fire when expected.

### Risk

Medium-high. The semantic-key computation is the load-bearing logic. Test coverage matters. The named-material boundary in `active_ingredients` is the most likely place for subtle bugs — make sure tests cover hierarchical formulations (formulation containing formulations).

## PR5: Comment Anchors As `anchors[]`

### Goal

Migrate `feedbackComments[].anchor` (singular) to `feedbackComments[].anchors[]` (array of polymorphic anchors), supporting node, source, and phase anchor kinds. Add the snapshot field on node anchors.

### Files

- `/home/brad/git/computable-lab/schema/workflow/protocol-ide-session.schema.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/protocol-ide-session.lint.yaml` (modify)
- `/home/brad/git/computable-lab/schema/workflow/protocol-ide-session.ui.yaml` (modify)
- `/home/brad/git/computable-lab/server/src/protocol/ProtocolIdeFeedbackService.ts` (update to write the new anchor shape on `submitFeedback`)
- `/home/brad/git/computable-lab/server/src/protocol/ProtocolIdeFeedbackService.test.ts` (update fixtures and assertions)
- `/home/brad/git/computable-lab/server/src/api/handlers/ProtocolIdeHandlers.ts` (update request body validation for the feedback endpoint)
- `/home/brad/git/computable-lab/server/src/api/handlers/ProtocolIdeHandlers.test.ts` (update test bodies)
- `/home/brad/git/computable-lab/app/src/protocol-ide/ProtocolIdeShell.tsx` (update comment submission to send the new shape)
- `/home/brad/git/computable-lab/app/src/protocol-ide/ProtocolIdeGraphReviewSurface.tsx` (update comment-badge rendering for the new shape)
- `/home/brad/git/computable-lab/app/src/shared/api/client.ts` (update `submitProtocolIdeFeedback` body type)

### Schema shape

Replace `anchor` on each comment with:

```
anchors:
  type: array
  minItems: 1
  items:
    oneOf:
      - type: object
        required: [kind, semanticKey, snapshot]
        properties:
          kind: { const: node }
          semanticKey: { type: string, pattern: ^EVT-[a-z0-9-]+$ }
          instanceId:
            type: string
            description: advisory — the instance id at comment time; not authoritative
          snapshot:
            type: object
            description: full serialized node payload at comment time
            additionalProperties: true
      - type: object
        required: [kind, documentRef, page]
        properties:
          kind: { const: source }
          documentRef: { type: string }
          page: { type: integer, minimum: 1 }
          region:
            type: object
            properties:
              x: { type: number }
              y: { type: number }
              width: { type: number }
              height: { type: number }
      - type: object
        required: [kind, phaseId]
        properties:
          kind: { const: phase }
          phaseId: { type: string }
```

The first entry in `anchors[]` is the **primary** anchor (clicking the comment scrolls/jumps to that). Subsequent entries are auxiliary (e.g. a node anchor with a source anchor as backup).

### Lint rules

- Every comment has at least one anchor.
- Each anchor's `kind` is one of `node`, `source`, `phase`.
- For `node` anchors: `semanticKey` matches the slug pattern; `snapshot` is non-empty.
- For `source` anchors: `documentRef` resolves to an existing document record.
- For `phase` anchors: `phaseId` resolves to a phase on the session's source protocol.
- **Warning** (not error) if a comment has a `node` anchor and the comment was originally created from a source citation but no `source` anchor accompanies it.

### Backend changes

`ProtocolIdeFeedbackService.submitFeedback`:

- Accept the new structured anchor in the request body.
- Capture the snapshot for node anchors at submission time by looking up the latest event-graph node payload by `semanticKey`.
- Write `anchors: [...]` (not `anchor: {...}`) to the session record.

`buildRollingSummary`:

- Continue producing a string summary, but reference anchors by `semanticKey` (not the old positional id) when annotating each line.

### Frontend changes

`ProtocolIdeShell.tsx` `handleSubmitFeedback`:

- Construct the new anchor shape from the user's selection (graph node click → node anchor with semanticKey lookup; source citation click → source anchor; phase header click → phase anchor).
- Multi-anchor case: when commenting on a graph node that originated from a citation, send both anchors.

`ProtocolIdeGraphReviewSurface.tsx`:

- Render comments using the primary anchor (`anchors[0]`) for positioning.
- Show auxiliary anchors as small icons in the comment detail card.

### Test data

Per the project lead's direction: no migration script. Existing session records in test data become invalid and should be discarded or manually edited. PR5 does not need to handle backward-compatible reads of old `anchor: {...}` shape.

### Exit Criteria

- Schema accepts the new anchor shape.
- Lint rules fire as documented.
- Submitting feedback via the API persists the new shape.
- Frontend submits and renders the new shape.
- All Protocol IDE tests pass with updated fixtures.

### Risk

Medium. Touches frontend, backend, and schema together. The snapshot capture is the trickiest part — it requires resolving a `semanticKey` to the current event-graph node payload, which depends on PR4 having shipped a working `SemanticKeyBuilder`.

## Cross-cutting Notes

### What this sequence enables (Stage A1 preview, not in scope)

Once A0 is merged, Stage A1 can:

- Replace the echo `project` pass in `ProtocolIdeProjectionService` with a real LLM call.
- Pass the structured `accumulatedCorrections` (derived from anchored comments) into the compile prompt.
- Instruct the compile pass to populate `semanticKey` on every output event node, preserving keys from the prior graph where the step is unchanged.

A1 will tighten the lint warnings introduced in PR4 and PR5 to errors.

### What is deliberately not changed

- The `rollingIssueSummary` string field on sessions stays. Stage A1 will continue to read it as a fallback but will prefer structured `accumulatedCorrections` when present.
- The pipeline definition at `schema/registry/compile-pipelines/local-protocol-compile.yaml` is untouched.
- No new compile passes; no LLM integration; no model selection.

### Testing approach

Each PR ships with vitest coverage matching the existing project conventions. New schemas get registration tests in `SchemaRegistry.test.ts`. New TS modules get colocated `*.test.ts`. End-to-end Playwright coverage of the Protocol IDE flow is out of scope for A0 — defer to A1 when the compiler actually consumes the new fields.

### Out-of-scope decisions captured for future work

- Phase nesting (sub-phases): not supported in v1; can be added without breaking the flat case.
- Property-level anchors (commenting on a parameter within a node, or a single compound within a mixture): deferred to v2. Comments today land on the step; specificity lives in the comment body.
- Reconciliation pass for orphaned anchors after re-compile: Stage A2 work.
- Curation UI for promoting comments to lint rules: Stage C work.
