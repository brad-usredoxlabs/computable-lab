# computable-lab — Agent Context

## What This Repo Is

A declarative, schema-first system for laboratory records and knowledge.

---

## Runtime Layers

1. Schema Registry
2. Repository Adapter (GitHub)
3. Validation + Lint Engine
4. Graph + Search (derived)

---

## Invariants

- recordId is canonical
- @id is derived
- schemas define meaning
- lint defines rules
- UI renders data
- code interprets, never decides

---

## What NOT to Do

- Do not encode business rules in React
- Do not infer semantics from filenames
- Do not create mutable authoritative state
- Do not bypass schema validation
