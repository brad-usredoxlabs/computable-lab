# Material Concentration Migration Checklist

Date: 2026-03-21
Status: Draft

This checklist turns the concentration ADR into a concrete migration plan across `computable-lab` and `semantic-eln`.

## Phase 1: Schema And Validation Foundation

### New schema files

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/concentration.schema.yaml`
  Add a dedicated concentration datatype with `value`, `unit`, and `basis`.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/composition-entry.schema.yaml`
  Add a reusable structured composition entry schema for formulations, vendor products, and measured instances.

### Existing schema files to update

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/material.schema.yaml`
  Add optional `molecular_weight` and reserve room for future intrinsic physical properties.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/material-spec.schema.yaml`
  Replace loose concentration usage with the new concentration datatype and add optional `composition[]`.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/vendor-product.schema.yaml`
  Add `declared_composition[]`, `source_documents[]`, and `extraction_provenance`. Keep existing free-text `formulation`.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/material-instance.schema.yaml`
  Update `concentration` to use the shared concentration datatype and add optional measured composition fields.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/aliquot.schema.yaml`
  Align aliquot concentration/composition handling with `material-instance`.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/recipe.schema.yaml`
  Add optional output concentration/composition validation hooks and richer role typing where needed.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/workflow/events/plate-event.add-material.schema.yaml`
  Point `concentration` at the new concentration datatype and tighten unit expectations.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/workflow/events/plate-event.transfer.schema.yaml`
  If absent or too weak, confirm transfer schema has enough structure to support downstream concentration propagation.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/core/record.schema.yaml`
  Register any new schema references if needed.

### Optional UI schema overlays

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/material.ui.yaml`
  Show molecular weight only for relevant material domains and explain that it is optional.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/material-spec.ui.yaml`
  Support simple stock authoring first, then advanced composition editing.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/recipe.ui.yaml`
  Surface output concentration and solvent in a scientist-friendly way.

## Phase 2: Backend Domain Logic And APIs

### Shared types and schema loading

- [ ] `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaLoader.ts`
  Ensure new concentration and composition schemas load correctly.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.ts`
  Confirm registry coverage and any overlay interactions for new schema files.

### Material prep and lifecycle services

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
  Compute output spec concentration from recipe data when possible, validate concentration units, and persist declared formulation truth.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialLifecycleHandlers.ts`
  Propagate concentration and composition into material instances, aliquots, and derivations.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/materials/AddMaterialSupport.ts`
  Preserve spec- and vendor-derived concentration truth when implicit instances are minted.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/handlers/LibraryHandlers.ts`
  Expose concentration-aware summaries for records shown in the browser and search layers if needed.

### Vendor search and enrichment

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/routes.ts`
  Add routes for vendor document fetch and composition extraction if adopted.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/handlers/VendorSearchHandlers.ts`
  Extend vendor search results to include structured formulation metadata when the upstream source provides it.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
  Accept structured vendor composition on create/update, not just free-text formulation.

### New concentration utilities

- [ ] `/home/brad/git/codex-cl/computable-lab/src/lib/concentration/units.ts`
  Create a canonical unit conversion library for concentration and amount propagation.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/lib/concentration/normalization.ts`
  Normalize user-entered or imported concentration units to canonical computation units.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/lib/concentration/display.ts`
  Format concentrations back into biologist-friendly display units.

## Phase 3: MCP And AI Planning Tools

### Existing MCP tools to extend

- [ ] `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/aiPlanningTools.ts`
  Add concentration-aware material, formulation, and inventory summaries. Return structured composition, solvent, and computed available concentration where known.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/ai/ToolBridge.ts`
  Allow new read-only composition and well-state tools for the agent.

- [ ] `/home/brad/git/codex-cl/computable-lab/prompts/event-graph-agent.md`
  Teach the agent to trust structured concentration/composition state over guesswork.

- [ ] `/home/brad/git/codex-cl/computable-lab/prompts/material-system-rules.md`
  Add explicit rules for concentration provenance, missing molecular weight, and unknown concentration truth.

### New MCP tools to add

- [ ] `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/materialCompositionTools.ts`
  Read-only tools:
  - `material_get_properties`
  - `material_spec_get_composition`
  - `vendor_product_get_composition`

- [ ] `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/wellStateTools.ts`
  Read-only tools:
  - `well_state_get`
  - `well_state_for_selection`

- [ ] `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/vendorDocumentTools.ts`
  Read-only enrichment tools:
  - `vendor_product_fetch_documents`
  - `pdf_text_extract`
  - `pdf_ocr_extract`
  - `composition_extract_from_document`

- [ ] `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/index.ts`
  Register any new concentration- and document-related tools.

### OCR / document provenance

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/file-ref.schema.yaml`
  Confirm document references are sufficient for PDF/image provenance; extend if extraction metadata must be embedded.

- [ ] `/home/brad/git/codex-cl/computable-lab/schema/lab/vendor-product.schema.yaml`
  Store extraction provenance, confidence, and source-page references for imported composition tables.

## Phase 4: Frontend Data Model And API Types

### Shared API client types

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`
  Add typed concentration/composition request and response shapes for formulations, vendor products, instances, and well-state APIs.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/types/material.ts`
  Add frontend helpers for molecular weight and concentration-capable material metadata.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/types/events.ts`
  Replace loose concentration typing with the shared concentration shape and update event summaries if needed.

## Phase 5: Formulation And Material Authoring UX

### Material authoring

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialBuilderModal.tsx`
  Add optional molecular weight input for chemical-like materials only.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/VendorProductBuilderModal.tsx`
  Support structured vendor concentration/composition when available, while preserving lightweight manual entry.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialDetailDrawer.tsx`
  Show molecular weight, declared composition, measured composition, and provenance clearly.

### Formulation authoring

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/pages/FormulationsPage.tsx`
  Make target concentration and solvent first-class fields for simple stock creation, then support advanced component editing.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialPicker.tsx`
  Surface formulation concentration more clearly in search results and mention previews.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/events/forms/FormulationUsageModal.tsx`
  Explain when concentration comes from the saved stock versus batch-level overrides.

### Instance and aliquot authoring

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/MaterialInstanceBuilderModal.tsx`
  Allow measured concentration entry and display inherited concentration from the source spec or vendor product.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/AliquotSplitModal.tsx`
  Preserve concentration/composition on aliquot creation.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/material/DerivedMaterialBuilderModal.tsx`
  Support derived materials with inherited or measured concentration truth where applicable.

## Phase 6: Event Authoring And Well Computation

### Add Material and transfer UX

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/events/forms/AddMaterialForm.tsx`
  Prefill concentration from the selected spec or instance. Make manual override optional, not the primary path.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/events/forms/TransferForm.tsx`
  Ensure transfer authoring does not ask users to restate concentration that should already propagate from source well state.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/events/ribbon/EventRibbon.tsx`
  Mirror the same concentration prefill and display logic used in the dedicated forms.

### Well-state engine

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/lib/eventGraph.ts`
  Refactor from label-based material entries to a component ledger with canonical amounts and derived effective concentrations.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/lib/eventValidation.ts`
  Add concentration-aware validation such as missing source truth, impossible conversion, or mixed unknown states.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/lib/formHelpers.ts`
  Add concentration formatting, parsing, and display helpers for the UI.

## Phase 7: Scientific Display In Tooltips And Context Panels

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/labware/WellTooltip.tsx`
  Replace the current mostly event/accounting display with computed per-component effective concentrations and solvent fractions.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/context/ContextPanel.tsx`
  Show current computed concentration truth for selected subjects, not just event history.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/wellcontext/WellContextPanel.tsx`
  Align legacy view with the new well-state model or deprecate it.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/wellcontext/WellContextPanelV2.tsx`
  Make this the primary scientific state view for concentrations, counts, and activity-based components.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/pages/LabwareEventEditor.tsx`
  Ensure the event editor uses computed concentration-aware context for mouseover, side panels, and AI state snapshots.

## Phase 8: AI Context And End-To-End Planning

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/hooks/useAiChat.ts`
  Extend AI context further if needed so the agent sees concentration-rich source and target state for planning.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/types/ai.ts`
  Keep AI request context aligned with structured well-state and composition-aware planning data.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/ai/systemPrompt.ts`
  Render composition and concentration-rich editor state without overwhelming the model.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/ai/AgentOrchestrator.ts`
  Preserve concise concentration-aware conversational summaries across follow-up turns.

## Phase 9: Tests

### Schema and backend tests

- [ ] `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.test.ts`
  Add coverage for new concentration and composition schemas.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
  Add create/update coverage for material, material-spec, vendor-product, and add-material concentration persistence.

- [ ] `/home/brad/git/codex-cl/computable-lab/src/ai/AgentOrchestrator.test.ts`
  Add concentration-aware planning cases and ambiguity handling for source wells.

### Frontend tests

- [ ] `/home/brad/git/codex-cl/semantic-eln/e2e/labware-editor.spec.ts`
  Add an end-to-end case where a concentration-bearing source well is transferred and the tooltip reflects the resulting dilution.

- [ ] `/home/brad/git/codex-cl/semantic-eln/e2e/schemas-records.spec.ts`
  Add concentration-bearing formulation and vendor-product record flows.

- [ ] `/home/brad/git/codex-cl/semantic-eln/src/components/labware/WellTooltip.test.tsx`
  Add component-level concentration display coverage if the component gets isolated tests.

## Decision Rules During Migration

- [ ] Preserve backward compatibility for existing free-text or simple concentration records where possible.
- [ ] Never invent molar conversions without molecular weight.
- [ ] Prefer showing `unknown` over false precision.
- [ ] Keep simple single-analyte stock creation fast and low-friction.
- [ ] Make structured multi-component composition optional but first-class.
