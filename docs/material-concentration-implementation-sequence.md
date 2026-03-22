# Material Concentration Implementation Sequence

Date: 2026-03-21
Status: Draft

This document converts the concentration migration checklist into an execution sequence.

The goal is to ship concentration tracking incrementally, with each step producing usable value and a bounded review surface.

## Guiding Principles

1. Ship useful single-analyte behavior before multi-component composition.
2. Separate schema truth from UI polish from AI enrichment.
3. Prefer backward-compatible additions over schema-breaking rewrites.
4. Never block routine biology workflows on advanced chemistry metadata.
5. Preserve uncertainty rather than inventing conversions.

## Sequence Overview

1. PR1: Concentration datatype and material molecular weight
2. PR2: Formulation truth and API alignment
3. PR3: Add Material prefill from saved formulations
4. PR4: Well-state concentration engine for single-analyte flows
5. PR5: Scientific tooltip and context display
6. PR6: AI and MCP concentration-aware read path
7. PR7: Structured vendor-product composition
8. PR8: Vendor document ingestion and OCR-assisted extraction
9. PR9: Multi-component formulation and media support

## PR1: Concentration Datatype And Material Molecular Weight

### Goal

Create the schema foundation without changing runtime behavior yet.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/concentration.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/composition-entry.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/material.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/record.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaLoader.ts`
- `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.ts`
- `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.test.ts`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/material.ui.yaml`

### Deliverables

- dedicated concentration datatype with explicit `basis`
- reusable composition entry datatype
- optional `molecular_weight` on `material`
- schema loader and registry support
- tests proving schema registration and validation

### Exit Criteria

- new schemas validate
- existing material records remain valid
- material authoring can optionally store molecular weight

### Risk

Low. This is almost entirely additive.

## PR2: Formulation Truth And API Alignment

### Goal

Make `material-spec`, `material-instance`, `aliquot`, and `add_material` speak the same concentration language.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/lab/material-spec.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/material-instance.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/aliquot.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/recipe.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/workflow/events/plate-event.add-material.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/material-spec.ui.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/recipe.ui.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialLifecycleHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/material.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/events.ts`

### Deliverables

- all concentration-bearing schemas use the shared concentration datatype
- material prep handlers accept and persist typed concentration
- recipe output spec can carry explicit concentration and solvent truth
- frontend API types align with backend payloads

### Exit Criteria

- a simple stock such as `1 mM clofibrate in DMSO` can be created with structured concentration and solvent
- existing saved stocks continue to load

### Risk

Medium. This touches schema, API handlers, and frontend request shapes.

## PR3: Add Material Prefill From Saved Formulations

### Goal

Make the common user path work: selecting a saved stock should prefill concentration instead of asking users to type it again.

### Files

- `/home/brad/git/codex-cl/semantic-eln/src/components/events/forms/AddMaterialForm.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/events/ribbon/EventRibbon.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/events/forms/FormulationUsageModal.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialPicker.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/pages/FormulationsPage.tsx`

### Deliverables

- selecting a `material-spec` prefills concentration in Add Material
- concentration override remains possible but secondary
- formulation search results show concentration clearly

### Exit Criteria

- user can create `1 mM clofibrate in DMSO`
- user can add that stock to wells without re-entering `1 mM`

### Risk

Low to medium. Mostly UI behavior.

## PR4: Well-State Concentration Engine For Single-Analyte Flows

### Goal

Refactor well-state computation so concentrations propagate through add, transfer, and dilution for the single-analyte case.

### Files

- `/home/brad/git/codex-cl/semantic-eln/src/lib/eventGraph.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/lib/eventValidation.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/lib/formHelpers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/materials/AddMaterialSupport.ts`

### Deliverables

- internal component ledger for wells
- canonical volume and amount propagation
- computed effective concentration after transfer and dilution
- explicit `unknown` handling when concentration truth is missing

### Exit Criteria

- add 1 mM stock to a well and see 1 mM in well state
- transfer from a source well to a destination well and preserve source-derived concentration correctly
- dilute with solvent and see the computed lower concentration

### Risk

High. This is the first major behavior change.

### Notes

Do not attempt multi-component media here. Keep this PR narrowly scoped to single-analyte stocks and count/activity-per-volume support where already explicit.

## PR5: Scientific Tooltip And Context Display

### Goal

Expose computed concentration truth in the UI so users see actual scientific state instead of just event history.

### Files

- `/home/brad/git/codex-cl/semantic-eln/src/components/labware/WellTooltip.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/context/ContextPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/wellcontext/WellContextPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/wellcontext/WellContextPanelV2.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/pages/LabwareEventEditor.tsx`

### Deliverables

- tooltip shows total volume plus effective concentration per component
- context panels show scientific state first, event history second
- support display units:
  - molar
  - mass per volume
  - activity per volume
  - count per volume

### Exit Criteria

- hovering a well shows actual concentration values after dilution
- users no longer need to infer concentration from event history manually

### Risk

Medium. UI-facing, but backed by the new engine from PR4.

## PR6: AI And MCP Concentration-Aware Read Path

### Goal

Allow the AI to reason over concentration-bearing formulations and computed well state.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/aiPlanningTools.ts`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/materialCompositionTools.ts`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/wellStateTools.ts`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/index.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/ToolBridge.ts`
- `/home/brad/git/codex-cl/computable-lab/prompts/event-graph-agent.md`
- `/home/brad/git/codex-cl/computable-lab/prompts/material-system-rules.md`
- `/home/brad/git/codex-cl/semantic-eln/src/hooks/useAiChat.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/ai.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/systemPrompt.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/AgentOrchestrator.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/AgentOrchestrator.test.ts`

### Deliverables

- AI can inspect formulation concentration and well-state concentration
- AI can resolve phrases like “transfer from the clofibrate well” using structured well state
- AI can distinguish unknown concentration from known concentration

### Exit Criteria

- a concentration-bearing source well can be selected and used by the AI without follow-up guessing
- AI planning tools return structured concentration/composition summaries

### Risk

Medium. Read-only, but prompt and tool design can affect agent stability.

## PR7: Structured Vendor-Product Composition

### Goal

Make vendor products computationally useful without requiring OCR yet.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/lab/vendor-product.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/VendorSearchHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/material/VendorProductBuilderModal.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialDetailDrawer.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`

### Deliverables

- vendor products can store structured declared composition
- vendor search results can surface structured concentration metadata when upstream data exists
- UI can display declared vendor composition and provenance

### Exit Criteria

- a vendor reagent with known structured concentration can be added without manual re-entry

### Risk

Medium. Depends on upstream vendor data quality.

## PR8: Vendor Document Ingestion And OCR-Assisted Extraction

### Goal

Support products like RPMI 1640 whose concentrations often live in PDFs or scanned documents.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/file-ref.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/vendor-product.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/vendorDocumentTools.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/routes.ts`
- any new OCR/document extraction service entry points

### Deliverables

- document references with provenance
- PDF text extraction
- OCR extraction fallback
- structured composition draft with confidence and source-page metadata

### Exit Criteria

- a vendor PDF can be linked to a vendor product
- extracted composition can be reviewed before canonicalization

### Risk

High. OCR quality and table extraction are operationally noisy.

### Notes

Do not let this block earlier PRs. This is enrichment, not foundation.

## PR9: Multi-Component Formulation And Media Support

### Goal

Generalize the system from single-analyte stocks to media, buffers, and more complex formulations.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/lab/material-spec.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/lab/recipe.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/pages/FormulationsPage.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/lib/eventGraph.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/labware/WellTooltip.tsx`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/aiPlanningTools.ts`

### Deliverables

- structured composition for media and buffers
- per-component propagation through well-state engine
- vendor-derived media compositions such as RPMI 1640
- AI reasoning over multi-component sources

### Exit Criteria

- media can be represented as more than a name
- tooltip can show relevant components and concentrations without overwhelming the user

### Risk

High. This is the most complex semantic and UX layer.

## Suggested Milestones

### Milestone A: “Saved Stock Truth”

Includes:
- PR1
- PR2
- PR3

User-visible outcome:
- saved stocks have typed concentration and solvent
- Add Material prefills concentration from the saved stock

### Milestone B: “Scientific Well State”

Includes:
- PR4
- PR5

User-visible outcome:
- transfer and dilution update actual well concentrations
- mouseover and context panels show scientific state

### Milestone C: “AI Concentration Awareness”

Includes:
- PR6

User-visible outcome:
- AI can plan using actual source-well concentration context

### Milestone D: “Vendor And Media Enrichment”

Includes:
- PR7
- PR8
- PR9

User-visible outcome:
- vendor formulations and complex media become structured, searchable, and computable

## Recommended Team Execution Order

1. schema/backend pair on PR1 and PR2
2. frontend/product pair on PR3
3. backend/frontend pairing on PR4
4. frontend polish on PR5
5. AI/MCP workstream on PR6
6. vendor ingestion workstream on PR7 and PR8
7. multi-component formulation workstream on PR9

## Hard Dependency Graph

- PR1 before PR2
- PR2 before PR3
- PR2 before PR4
- PR4 before PR5
- PR4 before PR6
- PR7 before PR8
- PR7 before PR9
- PR4 before PR9

## What To Avoid

- Do not start with OCR.
- Do not make molecular weight mandatory.
- Do not make structured composition mandatory for every material or stock.
- Do not attempt multi-component media before single-analyte propagation is trustworthy.
- Do not expose raw internal canonical units directly in the UI.
