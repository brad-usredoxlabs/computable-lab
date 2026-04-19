# 81 — Protocol Extraction Candidate Shape

Status: Authoritative
Date: 2026-04-19
Depends on: 80-ai-pre-compiler, 60-compiler

---

## 1. Purpose

This spec fixes the canonical shape of a `target_kind: protocol` candidate inside an `extraction-draft` record. Vendor protocols often contain multiple starting-material branches ("if plant matter, do X; if cell culture, do Y"). The extraction pipeline must emit **one protocol candidate per variant**, not one per PDF. This document defines the JSON/YAML structure that protocol candidates must conform to, including how to represent sections, steps, variants, and the conditional starting-material logic that gates them. It also clarifies that reagents, consumables, and equipment are **separate extraction candidates** with their own `target_kind` values, referenced from protocol steps via mention tokens. This shape becomes the contract that the protocol extractor prompt (spec 008), any protocol-validation layer, and the promotion UI (spec 029) all follow.

## 2. The Candidate.draft Shape

A protocol candidate's `draft` field must conform to the following structure. All fields are required unless marked optional.

```yaml
display_name: string              # e.g., "NAb Spin Column Purification (Cell Culture)"
variant_label: string | null      # e.g., "cell culture", "plant matter", or null if no branches
starting_material:
  description: string             # e.g., "Mammalian cell culture, 5×10⁶ cells"
  kind_hint?: string              # optional hint: "cell-culture", "plant-matter", "tissue", etc.
sections:
  - heading: string               # e.g., "Sample Preparation", "Extraction", "Elution"
    evidence_span?: string        # optional: verbatim text from source that justifies this section
    steps:
      - order: number             # 1, 2, 3, ... within the section
        action: string            # verb: "add", "transfer", "incubate", "wash", "centrifuge", etc.
        description: string       # free-text, verbatim from source if possible
        mentions: string[]        # Mention tokens — references to separate material/equipment candidates
        duration_min?: number     # optional duration in minutes
        temperature_c?: number    # optional temperature in Celsius
        evidence_span: string     # REQUIRED: verbatim text from source that justifies this step
        uncertainty?:             # optional confidence indicator
          | 'low'
          | 'medium'
          | 'high'
          | 'unresolved'
          | 'inferred'
report:
  unresolved_refs: string[]       # branches or references the extractor could not resolve
  notes: string[]                 # any notes for the reviewer
```

### 2.1 Field Semantics

- **`display_name`**: A human-readable name for this protocol variant. Should include the variant label if present (e.g., "NAb Spin Column Purification (Cell Culture)").
- **`variant_label`**: Identifies which starting-material branch this candidate represents. `null` if the protocol has no branching.
- **`starting_material`**: Describes the starting material for this variant. The `kind_hint` is a machine-readable tag for filtering/sorting.
- **`sections[]`**: Logical groupings of steps. Each section has a heading and an array of steps.
- **`steps[]`**: Individual protocol steps. Each step must have an `evidence_span` — the exact text from the source document that justifies this step.
- **`mentions[]`**: An array of mention tokens that reference separate material/equipment/labware candidates. These tokens match the `display_name` field of those candidates.
- **`report.unresolved_refs[]`**: If the source contains ambiguous or unresolvable branches, list them here.
- **`report.notes[]`**: Any additional context for reviewers.

## 3. Multi-Variant Rule

Vendor protocols frequently contain conditional logic based on starting material. This section defines the rules for handling such cases.

### 3.1 One Candidate Per Variant

**The extractor MUST emit one `{ target_kind: 'protocol' }` candidate per distinct starting-material branch.**

Example: A vendor PDF contains:
> "If your starting material is plant matter, grind 500 mg in liquid nitrogen. If your starting material is mammalian cell culture, pellet 5×10⁶ cells at 500×g."

The extractor must produce **two** protocol candidates:
1. `variant_label: "plant matter"` with the grinding steps
2. `variant_label: "cell culture"` with the pelleting steps

### 3.2 Shared Materials and Equipment Are Separate Candidates

Shared reagents, consumables, and equipment MUST appear as **separate candidates** with their own `target_kind` values:

- `target_kind: "material-spec"` for reagents and consumables
- `target_kind: "equipment-spec"` for instruments and devices
- `target_kind: "labware-spec"` for labware definitions

These material/equipment/labware candidates are referenced from protocol step `mentions[]` by the `display_name` used in the material candidate.

**Example:** If both variants use "PBS Buffer" and "Spin Column Kit", the extractor produces:
- One `material-spec` candidate with `display_name: "PBS Buffer"`
- One `equipment-spec` candidate with `display_name: "Spin Column Kit"`
- Two `protocol` candidates (one per variant), each referencing these via `mentions: ["PBS Buffer", "Spin Column Kit"]`

### 3.3 Handling Ambiguous Prose

If a prose passage is ambiguous (e.g., "depending on your sample type..."), the extractor must:

1. Produce one candidate per **resolvable** branch
2. List unresolvable branches in `report.unresolved_refs[]`

Example:
> "The protocol varies depending on sample type. For some samples, use Method A; for others, use Method B."

If the extractor cannot determine which samples map to which method, it should:
- Emit candidates for any branches it can resolve
- Add `"sample type mapping unclear"` to `report.unresolved_refs[]`

## 4. Worked Example

### 4.1 Input Prose (from a vendor PDF)

```
NAb Spin Column Purification Protocol

Starting Material Preparation:

If starting from plant matter:
  1. Grind 500 mg of fresh plant tissue in liquid nitrogen to a fine powder.
  2. Transfer the powder to a 1.5 mL microcentrifuge tube.
  3. Add 600 μL of Lysis Buffer and vortex for 30 seconds.
  4. Proceed to Step 5.

If starting from mammalian cell culture:
  1. Harvest 5×10⁶ cells by centrifugation at 500×g for 5 minutes.
  2. Discard supernatant and resuspend pellet in 100 μL PBS.
  3. Add 500 μL of Lysis Buffer and vortex for 30 seconds.
  4. Proceed to Step 5.

Common Steps:

5. Incubate at 65°C for 10 minutes.
6. Add 200 μL of ethanol and mix well.
7. Transfer the sample to a Spin Column and centrifuge at 8,000×g for 1 minute.
8. Wash the column with 500 μL of Wash Buffer.
9. Elute with 100 μL of Elution Buffer.
```

### 4.2 Expected Candidate Set

The extractor should produce **four** candidates:

#### Candidate 1: Protocol (Plant Matter Variant)
```yaml
target_kind: protocol
draft:
  display_name: "NAb Spin Column Purification (Plant Matter)"
  variant_label: "plant matter"
  starting_material:
    description: "Fresh plant tissue, 500 mg"
    kind_hint: "plant-matter"
  sections:
    - heading: "Sample Preparation"
      evidence_span: "If starting from plant matter: Grind 500 mg..."
      steps:
        - order: 1
          action: "grind"
          description: "Grind 500 mg of fresh plant tissue in liquid nitrogen to a fine powder"
          mentions: []
          evidence_span: "Grind 500 mg of fresh plant tissue in liquid nitrogen"
        - order: 2
          action: "transfer"
          description: "Transfer the powder to a 1.5 mL microcentrifuge tube"
          mentions: ["1.5 mL microcentrifuge tube"]
          evidence_span: "Transfer the powder to a 1.5 mL microcentrifuge tube"
        - order: 3
          action: "add"
          description: "Add 600 μL of Lysis Buffer and vortex for 30 seconds"
          mentions: ["Lysis Buffer"]
          duration_min: 0.5
          evidence_span: "Add 600 μL of Lysis Buffer and vortex for 30 seconds"
        - order: 4
          action: "incubate"
          description: "Incubate at 65°C for 10 minutes"
          mentions: []
          duration_min: 10
          temperature_c: 65
          evidence_span: "Incubate at 65°C for 10 minutes"
    - heading: "Common Steps"
      steps:
        - order: 5
          action: "add"
          description: "Add 200 μL of ethanol and mix well"
          mentions: ["ethanol"]
          evidence_span: "Add 200 μL of ethanol and mix well"
        - order: 6
          action: "transfer"
          description: "Transfer the sample to a Spin Column and centrifuge at 8,000×g for 1 minute"
          mentions: ["Spin Column"]
          duration_min: 1
          evidence_span: "Transfer the sample to a Spin Column and centrifuge at 8,000×g for 1 minute"
        - order: 7
          action: "wash"
          description: "Wash the column with 500 μL of Wash Buffer"
          mentions: ["Wash Buffer"]
          evidence_span: "Wash the column with 500 μL of Wash Buffer"
        - order: 8
          action: "elute"
          description: "Elute with 100 μL of Elution Buffer"
          mentions: ["Elution Buffer"]
          evidence_span: "Elute with 100 μL of Elution Buffer"
  report:
    unresolved_refs: []
    notes: []
```

#### Candidate 2: Protocol (Cell Culture Variant)
```yaml
target_kind: protocol
draft:
  display_name: "NAb Spin Column Purification (Cell Culture)"
  variant_label: "cell culture"
  starting_material:
    description: "Mammalian cell culture, 5×10⁶ cells"
    kind_hint: "cell-culture"
  sections:
    - heading: "Sample Preparation"
      evidence_span: "If starting from mammalian cell culture..."
      steps:
        - order: 1
          action: "centrifuge"
          description: "Harvest 5×10⁶ cells by centrifugation at 500×g for 5 minutes"
          mentions: []
          duration_min: 5
          evidence_span: "Harvest 5×10⁶ cells by centrifugation at 500×g for 5 minutes"
        - order: 2
          action: "resuspend"
          description: "Discard supernatant and resuspend pellet in 100 μL PBS"
          mentions: ["PBS"]
          evidence_span: "resuspend pellet in 100 μL PBS"
        - order: 3
          action: "add"
          description: "Add 500 μL of Lysis Buffer and vortex for 30 seconds"
          mentions: ["Lysis Buffer"]
          duration_min: 0.5
          evidence_span: "Add 500 μL of Lysis Buffer and vortex for 30 seconds"
        - order: 4
          action: "incubate"
          description: "Incubate at 65°C for 10 minutes"
          mentions: []
          duration_min: 10
          temperature_c: 65
          evidence_span: "Incubate at 65°C for 10 minutes"
    - heading: "Common Steps"
      steps:
        # Same steps as plant matter variant (orders 5-8)
        - order: 5
          action: "add"
          description: "Add 200 μL of ethanol and mix well"
          mentions: ["ethanol"]
          evidence_span: "Add 200 μL of ethanol and mix well"
        - order: 6
          action: "transfer"
          description: "Transfer the sample to a Spin Column and centrifuge at 8,000×g for 1 minute"
          mentions: ["Spin Column"]
          duration_min: 1
          evidence_span: "Transfer the sample to a Spin Column and centrifuge at 8,000×g for 1 minute"
        - order: 7
          action: "wash"
          description: "Wash the column with 500 μL of Wash Buffer"
          mentions: ["Wash Buffer"]
          evidence_span: "Wash the column with 500 μL of Wash Buffer"
        - order: 8
          action: "elute"
          description: "Elute with 100 μL of Elution Buffer"
          mentions: ["Elution Buffer"]
          evidence_span: "Elute with 100 μL of Elution Buffer"
  report:
    unresolved_refs: []
    notes: []
```

#### Candidate 3: Material Spec (Shared Reagent)
```yaml
target_kind: material-spec
draft:
  display_name: "Lysis Buffer"
  description: "Lysis buffer for sample preparation"
  # ... other material-spec fields
```

#### Candidate 4: Equipment Spec (Shared Consumable)
```yaml
target_kind: equipment-spec
draft:
  display_name: "Spin Column"
  description: "Spin column for purification"
  # ... other equipment-spec fields
```

## 5. Why One-Candidate-Per-Variant

The design choice to emit one protocol candidate per variant (rather than one per PDF with internal branching) is driven by several practical considerations:

### 5.1 Reviewer Operates on One Concrete Variant at a Time

When a biologist reviews an extraction, they are typically working with a specific sample type. If the protocol has plant matter and cell culture variants, the reviewer working on a plant sample only needs to see and validate the plant matter variant. Presenting a single monolithic protocol with internal branching forces the reviewer to mentally parse and validate all branches simultaneously, increasing cognitive load and the risk of missing errors in less-familiar branches.

### 5.2 Promotion Produces One Canonical Protocol Per Variant

The promotion-compile pipeline (spec 60) is designed to emit one canonical record per candidate. If a protocol candidate contains internal branching, the promotion step would need to either:
1. Emit a single canonical with embedded conditionals (complex downstream consumers must handle branching)
2. Split the canonical at promotion time (adding complexity to the promotion logic)

By emitting one candidate per variant, the promotion path is uniform: each candidate → one canonical. Downstream consumers (execution engines, analysis pipelines) receive a single, unambiguous protocol to execute.

### 5.3 Traceability to Source Is Clearer Per-Variant

Each variant candidate carries its own `evidence_span` fields that point directly to the source text for that variant's steps. When a canonical protocol is promoted, the provenance chain is:
- Canonical protocol → extraction-promotion record → extraction-draft candidate → specific source passages

If variants were bundled together, the evidence spans would be intermingled, making it harder to trace which source passage justifies which step in which variant.

### 5.4 Independent Variant Lifecycle Management

Different variants may have different lifecycles. A plant matter protocol might be validated and promoted while the cell culture variant is still under review, or vice versa. Separate candidates enable:
- Independent promotion/rejection decisions per variant
- Per-variant versioning and supersession
- Variant-specific annotations and notes

### 5.5 Consistency with Material/Equipment Separation

This design mirrors the separation of concerns for materials and equipment. Just as reagents are not inlined into protocol steps but are separate candidates referenced by mention tokens, variants are not inlined into a single protocol but are separate candidates. Both patterns follow the principle: **one candidate, one concrete entity**.

## 6. What MUST NOT Go in a Protocol Candidate

The following patterns are explicitly forbidden in protocol candidates:

### 6.1 Reagents as Inlined Blobs

**Wrong:**
```yaml
steps:
  - action: "add"
    description: "Add 500 μL of Lysis Buffer (catalog #12345, Sigma-Aldrich, 500 mL bottle)"
```

**Right:**
```yaml
steps:
  - action: "add"
    description: "Add 500 μL of Lysis Buffer"
    mentions: ["Lysis Buffer"]
```
The Lysis Buffer should be a separate `material-spec` candidate.

### 6.2 Equipment as Free-Text Inside Steps

**Wrong:**
```yaml
steps:
  - action: "centrifuge"
    description: "Centrifuge in Eppendorf 5427R centrifuge at 500×g"
```

**Right:**
```yaml
steps:
  - action: "centrifuge"
    description: "Centrifuge at 500×g for 5 minutes"
    mentions: ["Eppendorf 5427R"]
```
The centrifuge should be a separate `equipment-spec` candidate.

### 6.3 Branching Inside a Step

**Wrong:**
```yaml
steps:
  - action: "prepare"
    description: "If plant matter: grind; if cell culture: pellet"
```

**Right:**
Create separate protocol candidates per variant, each with variant-specific steps.

### 6.4 Duplicate Steps Across Variants When They're Actually Shared

If a step is truly identical across variants (e.g., "Incubate at 65°C for 10 minutes"), it should appear in **each** variant's candidate. Do not attempt to deduplicate by creating a "shared steps" section — variants are independent candidates. (Note: A `shared_step_refs[]` field is reserved for v2 if cross-variant deduplication becomes necessary.)

## 7. Relationship to Other Specs

### 7.1 Compiler-Spec 80 (AI Pre-Compiler)

This spec is a specialization of the `extraction-draft` shape defined in spec 80. The `extraction-draft` record contains an array of `candidates[]`, each with a `target_kind` and a `draft` body. This spec defines the structure of that `draft` body when `target_kind: "protocol"`.

### 7.2 Schema: `schema/workflow/protocol.schema.yaml`

The canonical `protocol` record (the output of promotion) has its own schema defined in `schema/workflow/protocol.schema.yaml`. The protocol candidate's `draft` field is a precursor to that canonical shape — it may contain additional fields (like `evidence_span`, `uncertainty`) that are used during extraction and review but may be transformed or stripped during promotion.

### 7.3 Schema: `schema/workflow/extraction-draft.schema.yaml`

The `extraction-draft` schema defines the envelope that contains protocol candidates. This spec defines the inner structure of protocol candidates within that envelope. The two specs must be consistent: the `extraction-draft` schema declares that candidates have a `draft` field of type `object`, and this spec defines what that object looks like for `target_kind: "protocol"`.

### 7.4 Related Extraction Prompts

- **spec 008**: Protocol extractor prompt (`server/src/extract/prompts/protocol.md`) — this spec is the contract that the prompt must produce
- **spec 009**: Equipment-spec extractor prompt
- **spec 010**: Labware-spec extractor prompt
- **spec 011**: Context extractor prompt

These prompts should reference this spec to ensure their output conforms to the expected shapes.

---

## Appendix A. Terminology

- **Variant**: A distinct branch of a protocol gated on starting material or other conditional factors
- **Mention token**: A string that references a separate material/equipment/labware candidate by its `display_name`
- **Evidence span**: The verbatim text from the source document that justifies a step or section
- **Unresolved ref**: A reference or branch that the extractor could not resolve to a concrete value

## Appendix B. Validation Rules

1. Every step MUST have an `evidence_span` — this is non-optional
2. `variant_label` MUST be `null` if the protocol has no branching; otherwise it MUST be a non-empty string
3. Every mention token in `steps[].mentions[]` MUST correspond to a separate candidate with a matching `display_name` in the same `extraction-draft`
4. Step `order` values MUST be unique within a section and MUST be positive integers

---

*This spec is authoritative. Any deviation requires a spec amendment.*
