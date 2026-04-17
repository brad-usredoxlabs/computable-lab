# Session Notes — 2026-04-16

Status: Non-authoritative. Transcript-adjacent notes to warm up a fresh session.
Read before resuming work on specs 50/60/70/80.

This file captures biology color, design heuristics, and decision context from the planning session that produced 10-charter, 20-event-graph-ir, 30-context, and 40-knowledge. The specs themselves are authoritative; this file is memory aid, not requirement.

---

## 1. Biology color that should shape downstream decisions

These are the concrete user-supplied examples that motivated specific design choices. Carry them forward — they're the ground truth check on whether a later decision is still coherent.

### 1.1 "Spin at 15,000g" means different things in different labs

Not every centrifuge can reach 15,000g. The rotor must be capable; the labware must be rated. **And** — the specific Eppendorf microfuge in this lab currently lives inside the 4°C fridge, so a spin in that fuge happens at 4°C whether or not the HLP specifies temperature.

**This motivates:**
- `lab-state` as a first-class record kind (50). The fuge-in-the-fridge is a lab-state fact, time-varying, that local-protocols reference.
- Capability matching in planned-run compile (50). "Can this rotor spin at 15,000g with this labware?"
- "Same verbs, same order" for local-protocol ↔ HLP (50). The local-protocol specifies *our* centrifuge; the HLP says what it does at a platform-agnostic level.

Design test: can the compiler tell you that your planned spin will be cold because the fuge is in the fridge? If not, something downstream of 50 is wrong.

### 1.2 DMSO tube + 10× clofibrate → new material

The canonical context-promotion motivator. A biologist pipettes 10 µL of a 10× clofibrate stock into a DMSO tube. They now have 1× clofibrate in DMSO. That thing has a composition, a preparation provenance, and a useful lifetime. It deserves a material-spec identity — but authoring that identity top-down first, before doing the work, is backwards.

**This motivates:** the entire context-promotion mechanism (30 §12). Every promoted artifact's SOP is its event subgraph.

Design test: can a biologist make a new thing on the bench, then click "promote" and get a first-class material-spec with preparation provenance? If promotion ever requires top-down authoring first, something is wrong.

### 1.3 "80% confluence" is not a number

One biologist's 80% confluence is another biologist's 60%. Confluence calls are expert judgments. The number isn't wrong, but it isn't ground truth either; it's a specific person's assertion on a specific day.

**This motivates:** dual-representation observed properties (30 §11, 40 §8). A value can be stored as `{value, assertion_ref}` when expert judgment is carrying weight. Disputing confluence means superseding/retracting the assertion, not silently overwriting the number.

Design test: if someone else looks at the same plate and reads 65%, the system should let them author a competing assertion without either value being destroyed.

### 1.4 Labs are serial; multi-channel pipettes are the exception

Biology labs don't parallelize like software does. One technician, one operation, in order. The *one* exception is the multi-channel pipette — a single gesture touching 8 or 12 or 96 wells at once.

**This motivates:** multi-channel events as atomic multi-well arrays (20 §7), not N parallel events. The graph reflects the authored gesture.

Design test: no concurrent-event semantics beyond multi-channel. Don't be seduced by someone's "we also run two centrifuges at once" edge case.

### 1.5 Aliquoting is a deliberate gesture, not just transferring N times

When a biologist says "aliquot," they mean: "I have a master stock; I am splitting it into N small tubes for long-term storage, to prevent freeze-thaw damage and contamination." This is **not** the same as "I'm going to pipette from the stock into N working wells."

**This motivates:** `aliquot` as a distinct verb (20 §4.3) that produces `ALQ-*` resources with their own identity and lifecycle. The compiler emits a diagnostic if `aliquot` is used where a series of `transfer` events is actually meant.

Design test: an aliquot tube in the freezer is a first-class thing a biologist can grab and use months later. If `ALQ-*` collapses into well-level composition, we lost the plot.

### 1.6 Graph scale

Worst-case example the user gave: an Opentrons protocol on a 96-well deepwell plate of samples (≤12 events/well), transferring to a 96-well PCR plate after DNA purification, serving as the source plate for 4× 384-well plates (≤6 events/plate). Large but tractable.

**This bounds:** no 100-events-per-well nightmare. The cache/invalidation/diff machinery (30 §§8–9, 60 caching) doesn't need to chase pathological scale.

### 1.7 Labware is single-physical-use

Once a tip has been used or a plate has been read, it's done. No wash-and-reuse modeling in v1.

**This affects:** the labware-instance lifecycle in 20 (lifecycle family) and 50 (capability matching).

### 1.8 Ontologies locally cached for performance

User floated caching ChEBI/GO/UBERON etc. locally even just for speed.

**This points at:** an implementation choice, not a spec-level commitment, but worth remembering when drafting 80 (mention resolution) — ontology lookups are a hot path.

---

## 2. User heuristics that are now load-bearing

Articulated explicitly during the session. These should guide every future decision.

### 2.1 "Every time I think something is simple enough to just make a registry file I get burnt. YAML records."

Applied to: context-roles (40 §4.2), predicates-that-aren't-ontology-triples, and probably anything future designs want to shortcut into a single flat YAML.

**Rule:** when in doubt between "registry entry" and "record kind," choose record kind. Registry = flat, unversioned, hard to cite. Record = versioned, commitable, citable, retractable.

### 2.2 "Worry about the biologists, not the developers."

Applied to: diagnostics (60 §3, biologist-readable templated messages over structured codes); ambiguity-resolution UX (80, chatbox primary); error messages in general.

**Rule:** when an API design is more convenient for implementors but more opaque for biologists, pay the implementation cost.

### 2.3 "It's biology. It's messy."

Applied to: data-driven YAML compile pipelines with conditional branches (60), not rigid orchestration.

**Rule:** the compiler is a tool for a messy domain. Pipelines should be branchable, overridable, extensible without TypeScript changes.

### 2.4 "I want the biology compiler to work for real biologists!!"

Applied to: ROS positive control as the forcing function (10 §4).

**Rule:** when in doubt, ask "can a bench biologist run this end-to-end and get what they need?" If not, re-spec.

### 2.5 "You are always eager to code."

Feedback given mid-session. Applied: I slowed down, wrote the authority map and skeleton before drafting prose, pushed back harder on the spec drafts themselves.

**Rule for resume:** design pushback first. If a fresh-session Claude catches itself racing to write code or prose before argument is complete, stop. The user actively wants the argument.

### 2.6 "Push back on me when my instincts are wrong."

Applied repeatedly. User is a biologist with architectural openness; the assistant's job is to bring architectural perspective without flattening biology intuition.

**Rule:** both are legitimate. Biology instinct + architectural perspective = correct design. Either alone = wrong.

---

## 3. Design philosophy baked into the suite

These are the principles the four drafted specs commit to. Don't drift from them in 50/60/70/80.

- **Verb-first, noun-second.** Events are primary; nouns are typed participants.
- **Events are cheap, identities are earned.** Every event is recorded. Only meaningful state gets promoted to a canonical identity.
- **Context is computed, never authored.** Biologists author events; the compiler computes contexts.
- **Knowledge and context are separable layers.** Contexts describe *what is*; knowledge describes *what we claim, assert, expect*.
- **Append-only everywhere.** Contexts, promoted artifacts, retractions, model versions — all append-only with supersedes. History is never mutated.
- **Compiler owns correctness.** UI and AI are clients, not peers.
- **Three layers of meaning are the right axis.** event-derived / model-derived / observed. *Not* deterministic-vs-biological.
- **YAML-in-Git, no database.** Durability is structural, not tagged.

---

## 4. Corrections I made to my own drafts during the session

Listing so a fresh session doesn't accidentally reintroduce them.

- Material hierarchy: draft said 3 levels, existing code has 5 (Concept / Formulation / Vendor Product / Instance / Aliquot). **5 is correct.**
- Layer naming: draft said "deterministic vs biological-expectation." Wrong axis. **Correct: event-derived / model-derived / observed.**
- Claim/assertion: I proposed collapsing them. User corrected — they are distinct. **Keep both; invert dependency; `claim_ref` becomes optional.**
- Predicates: I conflated ontology-triple predicates with context-role predicates. **They are different vocabularies. Ontology predicates → registry. Context-role predicates → YAML records with extended lint DSL.**
- Derivation-model naming: draft called it "biological-state-model." Too narrow — ideal-mixing, pH equilibration, dilution arithmetic all use the same engine. **Generalized to `derivation-model`; "biological" is metadata, not a layer.**
- CompilerKernel: initial instinct was to replace it. **Correct: extend it. Existing diagnostic/outcome machinery is preserved.**

---

## 5. What remains undrafted and what's known about each

Skeletons in `01-spec-suite.md`. Core decisions below.

### 5.1 — 50 protocol-lifecycle

Four distinct kinds: `high-level-protocol`, `local-protocol`, `planned-run`, `executed-run`. Plus `deviation` and `lab-state` as new kinds.

Key commitments from session:
- Local-protocol = `inherits_from: <HLP>` with structured overrides.
- Structural correspondence required: **same verbs, same order** between local and HLP.
- `lab-state` referenced by local-protocols for environmental assumptions; when lab-state changes, compiler cascades a flag.
- Planning/binding UX: chatbox-primary ambiguity resolution with clickable simple-case fixes.
- Deviation as separate record kind with severity.

Next-session strongest draft candidate if pushing through. Most biologist-facing spec.

### 5.2 — 60 compiler

Key commitments:
- Extend existing `CompilerKernel`, don't replace.
- Per-input-type entrypoints (`protocol-compile`, `local-protocol-compile`, `run-plan-compile`, `promotion-compile`, `extraction-compile`, `ingestion-compile`) sharing the kernel.
- Compile pipelines declared in YAML (`schema/registry/compile-pipelines/*.yaml`) with ordered passes, conditional branches, declared dependencies.
- Diagnostics biologist-readable primary; structured codes optional metadata.
- In-memory content-hash cache, no disk cache.
- Policy profiles (sandbox/tracked/regulated/notebook/GMP) modulate **severity**, not rules.
- Testing: golden-file primary, property-based for kernel invariants, per-pass unit tests.

Most architectural; benefits most from sleeping on 10-40 first. Commitments made in 20/30/40 that 60 must honor:
- Auto-populate assertion outcomes from context diffs (40 §5.4).
- `DM-ideal-mixing` is how transfer math is computed (20 §5.1, routes through 70).
- Predicate DSL for event preconditions is shared with context-role prerequisites (20 §6.3 ↔ 40 §4.3).

### 5.3 — 70 derivation-models

Key commitments:
- YAML multi-step worksheet: `inputs`, `steps` (named, ordered, per-step unit-checked), `output`.
- Math.js-style expressions with hard allowlist (`+`, `-`, `*`, `/`, `**`, `log`, `exp`, `min`, `max`, `clamp`, plus declared biology primitives).
- Append-only versioned; contexts pin versions.
- Domain-agnostic: ideal-mixing, growth, pH all use the same engine. "Biological" is metadata.
- Authoring: seed library + PR contributions from bench biologists.

### 5.4 — 80 AI pre-compiler

Key commitments:
- Model-agnostic architecture. Current deployment: Qwen3.5-9B local; configurable.
- Output is `extraction-draft` record kind (new), with candidate events/entities, confidence, ambiguity spans, source-artifact ref.
- Mention resolution extended to labware, protocols, claims, contexts (not just materials/equipment/people).
- UX: chatbox primary, clickable quick-fixes for simple single-select cases.
- AI outputs compiler-native structures; never freeform prose as canonical output.
- AI does not write canonical records directly.

---

## 6. Resume recommendations

1. **Start by reading `MEMORY.md` (auto-loaded) → this file → `00-authority-map.md` → `01-spec-suite.md` → spot-check the 4 drafted specs.** 15 minutes and you're fully oriented.

2. **If the user wants to draft more specs:** strongest next is **50** (protocol-lifecycle), because the commitments are clear and biologist-instinct-rich. **60** should come only after 50 is solid because 60's commitments depend on 50's shape. **70** and **80** can go in either order after that.

3. **If the user wants to validate before drafting more:** the best exercise is authoring a toy YAML event-graph for the ROS workflow against the 20/30/40 specs and seeing what breaks or feels wrong. This surfaces the gaps that writing more specs tonight would have papered over.

4. **Cleanup tasks that were deferred:**
   - Add deprecation banners to `specifications/*.md` files. Mechanical.
   - Update the auto-memory project file to point at `compiler-specs/` instead of `specifications/biology-compiler.md`.
   - Actually wire `carryover_policy` default into event schemas.
   - Create `schema/workflow/events/<family>.<verb>.schema.yaml` files for the new Phase 1 verbs not yet represented (`create_container`, `aliquot` as event, `seal`, `unseal`).

---

## 7. The 47-question list

Persisted in `/home/brad/47-question.sh`. The 9 load-bearing ones and their resolutions are in `01-spec-suite.md`. The other 38 are resolved in prose across the four drafted specs where they touch 10/20/30/40; the ones touching 50/60/70/80 live only in the transcript at `/home/brad/.claude/projects/-home-brad/15006882-8c26-416f-a94f-18093c4fd7f2.jsonl`.

If a decision feels unmoored when drafting 50/60/70/80, consult the transcript before guessing.
