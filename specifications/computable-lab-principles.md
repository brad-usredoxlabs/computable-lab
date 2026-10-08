# Foundational Principles of Computable-Lab

> The foundational principles that distinguish computable-lab from laboratory information management hacks. These principles govern how the system is designed, how data is captured, and how the AI reasons over experimental knowledge.

**Last Updated:** 2026-10-04
**Author:** Brad (computable-lab founder)
**Status:** Canonical — these are the principles that define the project.

Every agent must read this document on startup, regardless of its model, harness, or tool-specific instruction files. These principles govern every workflow and page. Supporting specifications elaborate this contract; the foundational requirements must remain here where every agent encounters them.

---

## The Problem We're Solving

Instrument vendors capture data but lock it into proprietary software. One license. One user. One physical computer. The data exists, but the user cannot express their freedom to analyze it, share it, or connect it to other experiments. This is a 1990s licensing strategy carried into the AI era.

Computable-lab is the alternative: **your data, your ontology, your knowledge layer**. Not trapped in binary files behind a paywall. Not siloed by vendor ecosystem. The data belongs to the scientist, expressed in open formats, queryable by AI, portable across instruments.

These principles exist because biology is complicated, and vendor software treats it like a CSV export.

## The Point

The whole point is to answer one question — **"what happened in the lab today?"** — in a way that is stimulating, not penalizing. There is no prewritten script; experiments are made up day to day, testing truth-for-the-day. Record each day faithfully, and as a few days become weeks, become months, become years, they compound into real knowledge.

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

## 8. Data Sovereignty Over Vendor Lock-in

Your experimental data belongs to you, not to a vendor's software ecosystem. Proprietary formats trap data in silos — one license, one user, one machine. Computable-lab liberates data: open YAML records, portable across instruments, queryable without paywalls. The system ingests from vendor software (pyLabRobot bridges the gap) but exports to open formats. The scientist controls the data, not the license manager.

## 9. The Hard Boundary: Never Hardcode

If the system can fake something by hardcoding it, that is a hard stop. The system MUST work if all hardcoded values are instantly ripped out. No passwords, no API keys, no test data, no stub responses, no mock configurations baked into code. The AI stops and asks the user — it does NOT fabricate.

## 10. Code Creates Records, Records Are Linted

The pipeline: Data → Schema → Lint → Code reads all three → Creates records → Lints records. Code never validates business logic — it follows rules declared in data files. Ajv is the single validation authority. No fake validation, no runtime Ajv mutation.

## 11. Schema-Driven Design

Every record type has three YAML specs: schema (structural validation), lint (business rules), UI (rendering hints). Before editing TypeScript, identify what belongs in schema/lint/UI specs. Specs first, code second. No hard-coded domain logic in TypeScript. No schema-name branching. No inline business rules.

## 12. Declarative Page Invocation: AI Proposes; the Compiler Projects; the Scientist Accepts

**In every workflow, the user should be able to tell the AI what they want, and the AI should be able to invoke the appropriate workflow and redraw the screen around that request.** This is foundational to computable-lab. It applies to page navigation, page composition, forms, event graphs, protocol editing, sequence analysis, tool setup, and every other AI-driven interaction. A request can span pages and operations, independently of the page currently open.

The AI expresses the requested page invocation, context, layout, proposed values, and actions as declarative structured intent. The system's UI and operation definitions describe what can be invoked and rendered. New capabilities extend those definitions so both human and AI interactions can use them. The AI can select and compose the screens needed to fulfill the user's request; the deterministic compiler determines their valid interpretation.

**Every AI return that invokes a page or proposes an action must pass through the deterministic compiler before it is ghosted onto the screen.** This applies equally to navigation and scientific operations. The compiler resolves references and context, normalizes intent, validates schemas and lint, applies policy, and produces the page projection and action plan. A schema-valid AI response alone does not authorize rendering an actionable proposal or executing it. Missing capabilities or facts become visible compiler diagnostics.

```
User request → AI declarative page/workflow invocation → Deterministic compiler
             → Ghosted native page → Accept / Reject / Revise with the AI
```

The compiled proposal redraws the actual page: the user sees the requested sequence in its sequence controls, the proposed events in their graph, or the requested workflow in its appropriate native review surface. The page makes proposed values, context, and effects visible and keeps review controls accessible. Rendering this page is a preview of the requested invocation; it does not commit records or execute the proposed work.

The user always has three paths:

1. **Accept:** invoke or commit exactly the compiled, reviewed proposal through the ordinary authorized paths. Recheck source versions and policy before applying it. Acceptance requires no additional AI round trip and never expands the reviewed action plan.
2. **Reject:** discard the proposal and restore the prior working page, context, and unsaved values. No proposed records or operations are committed.
3. **Revise:** edit the ghosted values directly or send the proposal back to the AI with modifications. Direct edits recompile deterministically. AI revisions receive the current proposal, user corrections, and compiler diagnostics, then pass through the compiler again before being ghosted for another review.

Pending, invalid, stale, or policy-blocked proposals cannot be accepted. Superseded AI responses cannot redraw a newer working state. Existing authorization, provenance, immutable revision, and QMS signoff requirements remain authoritative; accepting an AI proposal does not grant a regulated approval.

**Every new AI-driven workflow must implement this request → compile → ghost → review loop.** Existing native review surfaces, including event previews and the protocol ChangesPanel, implement the same principle in their own form. The universal requirement applies now; the adoption inventory must accurately identify surfaces still awaiting implementation. See [AI drafting, declarative page invocation, and native UI projection](ai-drafting-and-ui-projection.md) for implementation contracts and adoption status.

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
7. **Liberate data from vendor lock-in** — ingest from proprietary formats, export to open YAML, keep the scientist in control
8. **Invoke pages and workflows declaratively** from the user's request, including the context, controls, and operations needed across pages
9. **Compile every proposed invocation before ghosting it** into the native UI; let the user accept, reject, or revise it, and recompile every revision before review

---

## References

- [Architecture of record](architecture-of-record.md) — what is implemented today vs specified-not-shipped, the four pillars, the superseded-ideas ledger, and the "where truth lives" index. Read before authoring or implementing against any pillar; §7 ledger items are dead ideas and must not be resurrected.
- [AI drafting, declarative page invocation, and native UI projection](ai-drafting-and-ui-projection.md) — implementation contract and adoption inventory for principle 12
- `docs/knowledge-layer-canonical-example.md` — PPARα → ROS hypothesis worked through the full record graph
- `schema/knowledge/` — knowledge layer schemas (claim, context, assertion, evidence, context-role)
- `schema/lab/` — lab schemas (measurement-context, well-group)
- `server/src/foundry/` — ontology search infrastructure
- `cl-appliance/` — local ontology search (neighboring repo)
