The new backend rule is: accepted event graphs should not persist bare ontology refs as addable materials. Ontology terms are concepts; the lab needs a local material record 
  that can carry status, provenance, domain, and future lab-specific metadata.                                                                                                  
                                                                                                                                                                                
  When an event graph is saved/accepted, normalizeEventGraphMaterialUsage runs in the record save path. For each add_material event it checks fields like:

  - material_ref
  - legacy materialId
  - composition_snapshot[].component_ref
  - material_source_requirement.material_ref
  - material_source_requirement.source_details.solvent_ref

  If any of those are { kind: "ontology", id: "CHEBI:..." }, the backend calls ensureLocalMaterialForOntology.

  That grounding function:

  1. Searches existing material records for a matching ontology CURIE in class[].
  2. If not found, searches by exact material name.
  3. If still not found, uses deterministic ID form like MAT-CHEBI-5001.
  4. If no record exists, creates a proposed local material record:
      - status: proposed
      - lifecycleId: lab-vocabulary-control
      - class: [{ kind: "ontology", id: CURIE, ... }]
      - provenance saying it was created from ontology grounding.

  Then the event is rewritten to use:

  {
    "kind": "record",
    "id": "MAT-CHEBI-5001",
    "type": "material",
    "label": "fenofibrate"
  }

  rather than the ontology ref directly.


  For mixtures like DMEM + 10% FBS, the backend also grounds component refs and can create a proposed material-spec from the composition snapshot, so the event points toward a
  reusable formulation layer instead of just a text label.

-----------------------------------------------

Implemented the material profile policy layer and wiring.                                                                                                                     
                                                                                                                                                                                
  What changed:                                                                                                                                                                 
                                                                                                                                                                                
  - Expanded schema/lab/material-profile.registry.yaml to the six v1 profiles: chemical, cell_line, media_composition, single_active_formulation, sample, other.
  - Added server profile loader/validator and lookup service.
  - Added material profile/grounding handlers and routes:
      - GET /api/materials/profiles
      - GET /api/materials/profiles/:profileId
      - POST /api/materials/ground-ontology

  - Wired profile registry into server startup.
  - Updated TapTab ref controls so local-material-required ontology selections call the backend grounding endpoint and store a local material record ref.
  - Marked app-owned fields readonly via profile/suggestion metadata.
  - Added API client methods for profile listing, profile lookup, and ontology grounding.
  - Aligned Add Material ontology routing with profile IDs, including EFO/CL-like cell terms and media terms.
  - Added server tests for profile loading, invalid controls, lookup, and grounding reuse/create behavior.

  Verification:

  - Passed: npm --prefix server run test:run -- src/materials/MaterialProfileRegistry.test.ts src/api/handlers/MaterialProfileHandlers.test.ts src/materials/
    AddMaterialSupport.test.ts

  - Passed: npm --prefix app run test:unit -- src/event-editor/material/AddMaterialModal.test.tsx src/editor/taptab/RefCombobox.test.tsx

---------------------------------------------------------


  Must Update                                                                                                                                                  17:12:21 [3/1921]
                                                                                                                                                                                
  - TapTab record editing: yes. This is the general record surface, so material fields need controlled metadata from schema/UI spec. 
   The key central pieces are app/src/editor/ 
    taptab/extensions/FieldRow.tsx, app/src/editor/taptab/RefCombobox.tsx, app/src/editor/taptab/RecordRefPicker.tsx, projection/document mapping, and the material UI specs.   
                                                                                                                                                                                
  - Event-editor Add Material modal: yes. This is the biologist’s fastest manual path. It should support volume, count, role, 
   and semantic routing into compound/cells/mixture/ sample builders. It should never emit a bare ontology ref as the final addable material.

  - AI chat clarification / material chooser: yes, but differently. It should insert structured ontology/material cards into the chat state, 
   not plain text. The AI route should still rely on the compiler/acceptance normalizer as the safety net.

  Centralize, Don’t Hand-Patch Every Screen

  - MaterialPicker and material builder modals should become the reusable “material intent” surface used by Add Material and other material-selection flows.
  - Schema/UI spec metadata should define whether a field is free text, ontology-controlled, local-record-required, app-owned/provenance-owned, etc. TapTab should obey that
    globally.

  - Accept/normalization path must remain the final enforcement layer. Even if a UI or AI path emits ontology, accept should ground it to a proposed local material record.

  Likely Secondary Paths

  - Event ribbon / inline event editing: needs review if it can edit add_material.details.material_ref. It should use the same material-ref control or be read-only for grounded
    refs.

  - FormulationsPage / standalone material pages: should converge on the same builders, especially for material-spec and formulation editing.
  - Serial dilution / plate operation planners: if they accept material refs directly, they should also use the same local-material-required picker.

  Probably No Major Update

  - Read-only inventory, well tooltip, knowledge rail, preview panels: mostly display paths. They should render local material labels/classes correctly but should not own
    material creation policy.

  - The canvas/deck ghosting path: it should consume normalized draft events, not decide material semantics.

  So the short answer: TapTab, Add Material modal, and AI clarification/material insertion all need updates. But the strategy should be: one shared material-ref/intent system,
  one schema-driven TapTab control layer, and one backend accept-time grounding policy.

