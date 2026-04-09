# Material Identity and Resolution

Status: Living document
Date: 2026-04-07
Authors: Brad (domain lead), Claude (architect)
Related: `docs/adr-material-concentration-end-to-end.md`

## 1. The Problem

Biology has an identity problem. The same material is known by many names, and the same name can refer to different things. A biologist typing "clofibrate" might mean the acid form, the ethyl ester, or the sodium salt — each with different ChEBI identifiers, molecular weights, and solubility profiles. They type "F. praus" and mean _Faecalibacterium prausnitzii_ but nobody can spell that consistently. They type "lysis buffer" and mean a proprietary Thermo Fisher product that exists in no ontology.

This is not a data-entry problem. It is a disambiguation problem that sits at the core of reproducible experimental design. If the system cannot resolve what the biologist means, nothing downstream — formulations, concentrations, well state, execution plans — can be trusted.

Computable-lab treats material identity resolution as a first-class concern.

## 2. The Material Hierarchy

Materials exist at five levels of specificity. Each level materializes from the one above it, but only when context demands it.

```
Level 1 — Concept         Material
                           "Clofibrate"
                           kind: material, domain: chemical
                           class: [CHEBI:3750], MW: 242.70 g/mol
                           synonyms, definition, tags

Level 2 — Formulation     Material Spec
                           "1 mM Clofibrate in DMSO"
                           kind: material-spec
                           material_ref → MAT-CLOFIBRATE
                           formulation: { concentration, solvent_ref, composition }

Level 3 — Commercial      Vendor Product
                           "Sigma-Aldrich C6643, Clofibrate ≥98%"
                           kind: vendor-product
                           material_ref → MAT-CLOFIBRATE
                           vendor, catalog_number, declared_composition

Level 4 — Instance        Material Instance
                           "The 500 µL tube on shelf 3"
                           kind: material-instance
                           material_spec_ref → MSP-CLO-1MM-DMSO
                           status: available, lot, storage

Level 5 — Lot / Aliquot   Aliquot
                           "Aliquot from batch 2026-03-15"
                           kind: aliquot
                           material_spec_ref, volume, lot
```

### Level 1: Material (Concept)

A Material is a semantic identity — not a physical thing. "Clofibrate" is a concept. You cannot pipette it. You cannot put it in a freezer. It is the answer to the question "what biological entity are we talking about?"

A Material carries:
- **Ontology classification** (`class` array of OntologyRefs) — the disambiguation anchor
- **Intrinsic properties** (molecular weight, chemical formula, CAS number) — needed for formulation math
- **Synonyms and definition** ��� pulled from ontology sources, used for search
- **Domain** (chemical, cell_line, media, reagent, organism, sample, other) ��� governs which property groups are relevant

Materials are **ontology-backed when possible, vendor-backed when not.** A well-characterized chemical gets a ChEBI reference. A proprietary lysis buffer gets its identity from a vendor catalog entry. Both are Materials.

### Level 2: Material Spec (Formulation)

A Material Spec answers "in what form do we use this material?" It is a reusable, abstract description of a preparation — not a physical batch.

Two patterns:

**Pattern A — Solute in solvent (single principal component):**
```yaml
name: "1 mM Clofibrate in DMSO"
material_ref: MAT-CLOFIBRATE
formulation:
  concentration: { value: 1, unit: mM, basis: molar }
  solvent_ref: MAT-DMSO
```

The system can auto-derive this from a Material + concentration + solvent choice, using the material's molecular weight for molar calculations.

**Pattern B — Functional blend (multi-component):**
```yaml
name: "RPMI 1640 with 10% FBS"
material_ref: MAT-RPMI-1640
formulation:
  composition:
    - component_ref: MAT-RPMI-1640, role: solvent, concentration: { ... }
    - component_ref: MAT-FBS, role: additive, concentration: { value: 10, unit: "% v/v", basis: volume_fraction }
    - component_ref: MAT-PEN-STREP, role: additive, concentration: { value: 1, unit: "% v/v", basis: volume_fraction }
```

There is no principal component. The formulation creates a function (viable cell culture environment) from a blend of ingredients, each with a role.

### Level 3: Vendor Product (Commercial Source)

A Vendor Product records where a material comes from commercially. It links to a Material and optionally carries:
- Structured declared composition (extracted from vendor datasheets, with provenance and confidence)
- Documents (product sheets, certificates of analysis, SDSs)
- Catalog number, grade, package size

Vendor Products can exist at two relationship levels:
- **Source for a raw material:** Sigma sells clofibrate powder. The VendorProduct links to MAT-CLOFIBRATE. It is procurement metadata.
- **Source for a formulation:** Cayman sells a screening library plate with 1 mM clofibrate in DMSO pre-plated. The VendorProduct links to a Material and implies a MaterialSpec.

### Level 4: Material Instance (Physical Thing)

A Material Instance is a concrete, physical thing in the lab — a bottle, a tube, a flask. It is created when:
- A biologist prepares a stock from a recipe
- The system auto-generates an implicit instance when a formulation is used in a protocol run
- A vendor product is received into inventory

Instances carry batch-specific truth: actual volume, lot number, storage location, preparation date.

### Level 5: Aliquot (Subdivided Instance)

An Aliquot is a portion of an instance dispensed into a specific container. It inherits identity from its parent instance/spec but tracks its own volume and status.

### Progressive Materialization

The hierarchy materializes top-down, but **only as context demands:**

1. Biologist types "clofibrate" → system resolves to Material (Level 1)
2. Biologist says "1 mM" → system creates MaterialSpec (Level 2), inferring DMSO as solvent
3. Biologist adds it to a well in a run → system creates implicit MaterialInstance (Level 4) and Aliquot (Level 5) automatically
4. When the biologist reaches for the physical tube, the system prompts for lot/date (Level 4/5 enrichment)

The biologist never explicitly creates instances or aliquots. They think in concepts and concentrations. The system handles the rest.

## 3. The Three Search Sources

When a biologist types into a material field, the system searches three sources in priority order:

### Source 1: Local Materials (already resolved)

Search the local record store for Material, MaterialSpec, VendorProduct, MaterialInstance, and Aliquot records matching the query.

- **Endpoint:** `GET /materials/search?q=<query>`
- **Returns:** Records classified as saved-stock, vendor-reagent, prepared-material, biological-derived, or concept-only
- **Display priority:** saved-stock > vendor-reagent > prepared-material > concept-only
- **Why first:** If we already have it, use it. No disambiguation needed.

### Source 2: Ontologies (formal scientific terms)

Search external ontology services (EBI OLS4) for terms matching the query. This is the primary disambiguation source for well-characterized pure substances.

- **Endpoint:** `GET /ontology/search?q=<query>&ontologies=<list>`
- **Sources:** ChEBI (chemicals), CL (cell types), GO (gene ontology), NCBITaxon (organisms), and others
- **Returns:** Term label, IRI, definition, synonyms, cross-references
- **Why second:** Ontologies provide the formal identity anchor. If the material isn't local yet, an ontology term is the gold standard for creating one.

### Source 3: Vendor Catalogs (commercial products)

Search vendor product catalogs (Thermo Fisher, Sigma-Aldrich, Cayman Chemical) for matching products. This is the catch-all — many things labs use have no ontology entry.

- **Endpoint:** `GET /vendors/search?q=<query>&vendors=thermo,sigma`
- **Returns:** Product name, vendor, catalog number, declared concentration (parsed from description), product URL
- **Why third:** Vendor catalogs are the broadest source. When something isn't in an ontology ��� proprietary buffers, kits, pre-made media — it is on a vendor website.

### When Each Source Matters

| Material type | Local | Ontology | Vendor |
|---|---|---|---|
| Well-characterized chemical (clofibrate) | If previously used | ChEBI | Sigma, Thermo |
| Cell line (HepG2) | If previously used | CL, CLO | ATCC, Thermo |
| Proprietary product (Thermo lysis buffer) | If previously used | Not found | Thermo |
| Culture media (RPMI 1640) | If previously used | ChEBI (partially) | Sigma, Thermo |
| Custom blend (lab's own buffer recipe) | If previously made | Not found | Not found |

For custom blends, the biologist authors the formulation directly in the recipe card — no external search needed.

## 4. The Resolution Flow

### 4.1 Material Combobox: From Query to Resolved Reference

The material combobox is the primary entry point for material identity in the system. It appears wherever a `material_ref`, `solvent_ref`, or `component_ref` field exists.

```
User types "clofib..."
    │
    ├─ Local search returns MAT-CLOFIBRATE
    │   → User selects it → Done. Ref: { kind: record, id: MAT-CLOFIBRATE, type: material }
    │
    ├─ No local match. Ontology search returns CHEBI:3750 "clofibrate"
    │   → User selects it
    │   → Confirmation panel opens (definition, synonyms, xrefs)
    │   → User confirms
    │   → System creates Material record:
    │       { kind: material, name: "Clofibrate", domain: chemical,
    │         class: [{ kind: ontology, id: CHEBI:3750, ... }],
    │         molecular_weight: { value: 242.70, unit: g/mol },
    │         definition: "...", synonyms: [...] }
    │   → Ref: { kind: record, id: MAT-CLOFIBRATE, type: material }
    │
    └─ No local or ontology match. Vendor search returns Thermo Cat#87787 "Lysis Buffer"
        → User selects it
        → System creates Material record + VendorProduct record
        → Ref: { kind: record, id: MAT-LYSIS-BUFFER, type: material }
```

The combobox always produces a `RecordRef` pointing to a Material. The ontology and vendor steps are how new Materials enter the system.

### 4.2 Confirmation and Review

When a user selects an ontology term that is not yet local, the system must confirm identity before creating a record. This is the OntologySidebar flow:

1. **Show the term details:** label, IRI, definition, synonyms, cross-references, source ontology
2. **Let the user verify:** "Is this the clofibrate you mean? Not the sodium salt (CHEBI:75061)?"
3. **Pre-populate the Material record:** name from label, definition from OLS, synonyms from OLS, molecular weight from OLS (if chemical domain)
4. **User confirms → record created**

For vendor products without ontology equivalents, a similar review step shows: product name, vendor, catalog number, description, declared formulation. The Material record created may have no ontology classification — its identity comes from the vendor catalog.

### 4.3 From Concept to Formulation

Once a Material exists, the next step is typically formulation. The biologist has selected "clofibrate" — now they specify concentration.

**Simple case (solute in solvent):**
1. User selects concentration: 1 mM
2. System checks: does clofibrate have molecular_weight? Yes (242.70 g/mol) → molar concentration is valid
3. System asks/infers solvent: DMSO (default for hydrophobic small molecules, or learned from prior material-specs in the system)
4. System creates or finds MaterialSpec: "1 mM Clofibrate in DMSO"

**What the system can auto-derive from MW + concentration:**
- Mass of solute per unit volume (mg/mL)
- Mass needed for a target batch volume
- Dilution ratios from a stock concentration

**Complex case (functional blend):**
The FormulationsPage recipe card handles this — the user adds multiple ingredients with roles and concentrations. This is not a combobox concern; it is an authoring surface concern.

### 4.4 From Formulation to Instance

When a MaterialSpec is used in a protocol run (added to a well, referenced in an execution plan), the system auto-creates a MaterialInstance:

- If the user explicitly selected a prepared tube → use that instance
- If the user selected a saved stock (MaterialSpec) → create an implicit instance with `tags: [implicit, ad_hoc]`
- If the user later physically prepares the stock → the system prompts for lot/date to enrich the instance

This is the "lazy tracking" principle: don't force inventory workflows up front. Prompt for provenance when it matters.

## 5. Editing Surfaces

### 5.1 TapTab (Generic Record Editor)

TapTab is the rich-text-feeling editor for record types that don't need a specialized surface. It renders from UISpec definitions (`*.ui.yaml` files).

**TapTab handles:**
- Equipment, Person, Training Records, Competency Authorizations — simple field editing
- Material records (concept layer) — identity, classification, properties
- Protocols — structured but not formulation-complex

**Material fields in TapTab** (e.g., `material_ref`, `solvent_ref`, `equipmentRef`, `personRef`) need to invoke the appropriate picker component based on the field's ref type.

### 5.2 FormulationsPage (Recipe Card)

The FormulationsPage at `/formulations` is the specialized authoring surface for recipes and formulations. It already provides:

- Ingredient grid with material/spec/vendor-product picker (using MaterialPicker)
- Role typing (solute, solvent, diluent, additive, buffer_component, activity_source, cells, matrix)
- Source state tracking (solid, liquid, stock_solution, formulation, cells)
- Stock concentration + target contribution inputs
- MW-based formulation math (via `formulationMath.ts`)
- Procedure steps (ordered instructions)
- AI copilot (draft from text, suggest missing fields, explain calculations, flatten composition)
- Prepare Batch drawer for instantiation
- Inventory tracking of prepared instances

### 5.3 Event Graph Editor (Protocol Instantiation)

The LabwareEventEditor at `/labware-editor` is where protocols are instantiated as concrete plate events. It uses MaterialPicker for the add-material event form, with FormulationUsageModal for capturing vendor/lot provenance when a saved stock is selected.

### 5.4 What TapTab Needs from the Material Infrastructure

TapTab's current RefCombobox is disconnected from all of the above infrastructure. It uses `useTagSuggestions` (keyword search across all records) and `useOLSSearch` (direct OLS query) — neither of which is the right search for material or record ref fields.

TapTab needs two distinct picker behaviors:

**For material-typed refs** (`material_ref`, `solvent_ref`, `component_ref`):
- Use the existing material search infrastructure: `/materials/search` + `/ontology/search` + `/vendors/search`
- Support the ontology → Material creation flow (OntologySidebar + MaterialBuilder)
- Support the vendor → Material + VendorProduct creation flow
- Reuse or adapt `MaterialPicker` and its modal family

**For simple record refs** (`personRef`, `equipmentRef`, `trainingMaterialRef`, etc.):
- Use `/tree/search?kind=<type>&q=<query>` for type-scoped record search
- Simple dropdown, no ontology, no sidebar, no creation flow
- Display: record title + ID

## 6. Search Infrastructure (Current State)

### Server Endpoints

| Endpoint | Purpose | Used by |
|---|---|---|
| `GET /materials/search` | Full-text search across materials, specs, vendor products, instances, aliquots | MaterialPicker, useMaterialSearch |
| `GET /vendors/search` | Live search against Thermo Fisher, Sigma-Aldrich | MaterialPicker (live), VendorProductBuilderModal |
| `GET /ontology/search` | Proxied EBI OLS4 search | useMaterialSearch |
| `GET /tree/search` | General record search across all record types | Not yet used by TapTab |
| `GET /tags/suggest` | Tag/keyword frequency aggregation | RefCombobox (incorrectly) |
| `POST /records` | Create any record by schemaId | MaterialBuilderModal, VendorProductBuilderModal |

### Frontend Components

| Component | Purpose | Location |
|---|---|---|
| `MaterialPicker` | Smart material search dropdown with three-section results, live vendor search, ontology fallback | `app/src/editor/material/MaterialPicker.tsx` |
| `MaterialBuilderModal` | Create Material record from OLS term (pre-populates name, definition, synonyms, MW) | `app/src/editor/material/MaterialBuilderModal.tsx` |
| `VendorProductBuilderModal` | Create VendorProduct + Material from vendor search result | `app/src/editor/material/VendorProductBuilderModal.tsx` |
| `MaterialInstanceBuilderModal` | Create MaterialInstance from spec or vendor product | `app/src/editor/material/MaterialInstanceBuilderModal.tsx` |
| `useMaterialSearch` | Combined local + OLS search hook with dedup | `app/src/editor/hooks/useMaterialSearch.ts` |
| `OntologySidebar` | Slide-in panel for reviewing ontology term before creation | `app/src/editor/taptab/OntologySidebar.tsx` |
| `RefCombobox` | TapTab's current combobox (disconnected from above infrastructure) | `app/src/editor/taptab/RefCombobox.tsx` |

### What is Connected vs. Disconnected

**Connected (FormulationsPage, Event Graph Editor):**
- MaterialPicker → useMaterialSearch → /materials/search + /ontology/search
- MaterialPicker → live vendor search → /vendors/search
- MaterialPicker → MaterialBuilderModal → POST /records (create Material)
- MaterialPicker → VendorProductBuilderModal → POST /records (create VendorProduct)
- AddMaterialForm → FormulationUsageModal → lot/provenance capture
- Backend → AddMaterialSupport → implicit instance creation

**Disconnected (TapTab):**
- RefCombobox → useTagSuggestions → /tags/suggest (wrong endpoint)
- RefCombobox → useOLSSearch → direct EBI OLS4 (bypasses server proxy)
- OntologySidebar → addLocalVocabTerm stub (no persistence)
- No connection to /materials/search, /vendors/search, /tree/search
- No connection to MaterialBuilderModal or VendorProductBuilderModal
- No connection to AddMaterialSupport or implicit instance creation

## 7. Design Principles

### 7.1 The Biologist is Not a Data Clerk

The system must never require the user to understand the material hierarchy. They think in terms of "I need clofibrate at 1 mM." The system resolves that intent through the hierarchy — concept, formulation, instance, lot — invisibly.

### 7.2 Progressive Materialization

Create records only when context demands them. Don't force a biologist to create a Material, then a MaterialSpec, then a MaterialInstance before they can add something to a well. Let them say what they mean and let the system build the chain.

### 7.3 Disambiguation Over Data Entry

The combobox is not a search box — it is a disambiguation tool. Its job is to resolve the user's intent to a specific, unambiguous identity. Ontology terms, vendor products, and local records are all just evidence the system uses to answer "what do you mean?"

### 7.4 Local First, External on Demand

Always search local records first. If the lab has used clofibrate before, show it immediately. Only go to ontologies and vendor catalogs when the local store doesn't have a match. This is both faster and more relevant — local records reflect the lab's actual vocabulary.

### 7.5 Every Material Gets a Record

Nothing enters a formulation, protocol, or well by ontology IRI alone. Ontology terms and vendor products are **sources of truth for creating Material records**, not substitutes for them. Every ref in a formulation points to a local record.

### 7.6 Honest Uncertainty

If the system doesn't know the molecular weight, it cannot offer molar concentration calculations. If the vendor's declared composition was OCR'd from a PDF, the confidence score travels with it. The system prefers "I don't know" over false precision.

### 7.7 Smart Defaults, Confirm When Ambiguous

DMSO is the default solvent for hydrophobic small molecules. The system should suggest it but confirm. If prior material-specs exist for the same material, learn from them. If the material domain is `media`, don't suggest a single-solute formulation pattern — offer the composition editor.

## 8. Open Questions and Future Work

### 8.1 Vendor API Expansion
Currently Thermo Fisher and Sigma-Aldrich are supported via scraping/typeahead APIs. Cayman Chemical is supported for library plate maps via the ingestion pipeline. Additional vendor integrations (ATCC for cell lines, Corning for labware, etc.) will follow the same pattern: MCP tool for AI-driven search, shared library for direct app use.

### 8.2 AI-Assisted Material Resolution
The MCP server already exposes material search, ontology search, and vendor document extraction tools. Future work: an AI agent that watches the user's material selection and proactively suggests "Did you mean the acid form? The ester form is CHEBI:3750, the acid is CHEBI:39113."

### 8.3 Formulation Templates and Learning
When a lab repeatedly makes "1 mM X in DMSO" for different compounds X, the system should learn this pattern and offer it as a template. "You've made 12 stocks at 1 mM in DMSO — use this as a template for clofibrate?"

### 8.4 Batch Preparation Workflows
The FormulationsPage's Prepare Batch drawer handles single-batch preparation. Multi-batch, serial dilution, and plate-scale preparation workflows are future extensions.

### 8.5 Array Field Editing in TapTab
The `class` array on Material, `composition` array on MaterialSpec, and `input_roles` array on Recipe are currently not editable in TapTab. Array field support is a prerequisite for full Material and MaterialSpec editing in the generic editor.

### 8.6 Cross-Record Queries
"Which personnel are qualified to run protocol X on equipment Y?" requires joining across training-record, competency-authorization, equipment-training-requirement, person, and protocol records. This is a query/view layer concern beyond single-record editing, and will require dedicated UI surfaces.
