# Top 10 Principles of Computable-Lab

> The foundational principles that distinguish computable-lab from laboratory information management hacks. These principles govern how the system is designed, how data is captured, and how the AI reasons over experimental knowledge.

**Last Updated:** 2026-06-19
**Author:** Brad (computable-lab founder)
**Status:** Canonical — these are the principles that define the project.

---

## 1. Context Is Everything in Biology

Context creates materials. Context creates effects. A positive control is not a chemical — it is a complete biological system in a specific state. Rotenone ≠ ROS. Rotenone requires: viable mammalian cells + functional mitochondria + culture medium + perturbation + detection method. Without all components, the control does not exist.

## 2. Context Creates Materials

Conditioned medium is not "medium" — it is the context that created it. Adipocytes + DMEM → 48h → 2×10⁶ cells/5mL → differentiated = the material. You cannot describe the thing without describing its provenance. "Conditioned medium" is meaningless without: what cells, what starting medium, how many hours, how many cells, what volume, differentiated or proliferating.

## 3. The Knowledge Layer Captures WHY, Not WHERE

A control works because the context contains all necessary components (living system + functional machinery + perturbation + detection). Not because it sits in well A1. The AI reasons over the full context graph, not well positions. When proposing evidence: "supports assertion because context contains all necessary components for [role] and measurement shows [quantitative result]."

## 4. Materials Are a Provenance Hierarchy

Concept ≠ Formulation ≠ Instance ≠ Aliquot ≠ Composition. Clofibrate (concept) ≠ 1mM in DMSO (formulation) ≠ weighed 43.2mg on 2024-03-15 (instance) ≠ cryobox A1 (aliquot). Each layer adds provenance. Biological materials have temporal state (passage number, differentiation state). Compositions have components at specified concentrations. Derived materials (conditioned medium, cell lysate) are defined by their biological context of creation. Never collapse the hierarchy.

## 5. Controlled Vocabularies Over Free Text

Without controlled vocabularies, we are pushed back into Babel. Nouns are ontology terms. New concepts get CURIE-style local namespace (`cf:ROS`, `cf:PPARalpha`, `cf:conditioned-medium`). The AI always prefers ontology terms over free text, and suggests CURIE-style local terms when a new concept arises. Ontology search exists in this repo (`server/src/foundry/`) and locally in `cl-appliance`.

## 6. Declarative Rules, Imperative Drools

If it can be data, it MUST be data. Declarative = YAML files that describe WHAT is true. Imperative = code that reads data files and creates records. Business logic lives in lint YAML. Code never makes policy decisions — it follows the rules declared in data.

```
Data (YAML) → Schema (YAML) → Lint (YAML) → Code reads all three → Creates records → Lints records
```

## 7. YAML Is King

Data files must be readable by both humans AND computers. Schemas, lint specs, UI specs, configuration, records — all YAML. Human-readable. Machine-parsable. No binary configs. If it can be expressed as data, it must be expressed as data.

## 8. The Hard Boundary: Never Hardcode

If the system can fake something by hardcoding it, that is a hard stop. The system MUST work if all hardcoded values are instantly ripped out. No passwords, no API keys, no test data, no stub responses, no mock configurations baked into code. The AI stops and asks the user — it does NOT fabricate.

## 9. Code Creates Records, Records Are Linted

The pipeline: Data → Schema → Lint → Code reads all three → Creates records → Lints records. Code never validates business logic — it follows rules declared in data files. Ajv is the single validation authority. No fake validation, no runtime Ajv mutation.

## 10. Schema-Driven Design

Every record type has three YAML specs: schema (structural validation), lint (business rules), UI (rendering hints). Before editing TypeScript, identify what belongs in schema/lint/UI specs. Specs first, code second. No hard-coded domain logic in TypeScript. No schema-name branching. No inline business rules.

---

## Examples

### Example: What Creates a Positive Control for ROS?

```
Rotenone alone                          → nothing happens
Rotenone + DMEM                         → nothing happens
Rotenone + dead cells                   → nothing happens
Rotenone + living cells, dead mito      → nothing happens
Rotenone + living cells, functional mito + CellROX dye + plate reader at 644/665
                                        → ROS detected ✓
```

The knowledge layer captures:
- **Context** = HepG2 + DMEM/10%FBS + rotenone + CellROX dye + 37°C
- **Context-Role** = "positive-control" (requires: living system + functional machinery + perturbation + detection)
- **Assertion** = "This context produces elevated ROS"
- **Measurement-Context** = source=plate, instrument=SpectraMax, channel=644/665
- **Evidence** = "Fluorescence 3.2x over vehicle control (CV=8%, n=8 wells)"

**Hacks say:** "Well A1 is the positive control."

**Computable-lab says:** "This context — HepG2 cells with functional mitochondria, treated with rotenone at 10µM, detected via CellROX Far Red — produces elevated ROS. I assert this. Here's the evidence from the measurement."

### Example: Conditioned Medium as a Material

```
Adipocytes + DMEM → 48h → 2x10^6 cells/5mL → differentiated
  → Context of creation → Conditioned medium (MATERIAL)
  → Now add to HepG2 → What happens?
```

The conditioned medium **is** the context. You can't describe the material without describing its provenance.

---

## How the AI Applies These Principles

1. **Reason over context graphs**, not well positions
2. **Distinguish material provenance layers** (concept ≠ formulation ≠ instance ≠ aliquot)
3. **Use ontology terms** over free text; suggest CURIE-style local terms
4. **Follow the declarative/imperative split** — business logic in lint YAML
5. **Stop and ask the user** when missing configuration — never fabricate
6. **Propose evidence** by referencing complete context: "supports assertion because context contains all necessary components for [role] and measurement shows [quantitative result]"

---

## References

- `CLAUDE.md` — non-negotiable rules enforced by AI
- `docs/knowledge-layer-canonical-example.md` — PPARα → ROS hypothesis worked through the full record graph
- `schema/knowledge/` — knowledge layer schemas (claim, context, assertion, evidence, context-role)
- `schema/lab/` — lab schemas (measurement-context, well-group)
- `server/src/foundry/` — ontology search infrastructure
- `cl-appliance/` — local ontology search (neighboring repo)
