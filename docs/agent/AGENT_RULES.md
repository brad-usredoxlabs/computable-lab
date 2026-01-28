# Agent Rules — computable-lab

These rules are non-negotiable.
If a choice violates these rules, it is incorrect.

---

## 1. Prime Directive

**If something can be expressed as data, it must be expressed as data.**

Code exists only to:
- Load schemas
- Validate records
- Render UI from schema
- Execute state machines
- Perform GitHub CRUD
- Build derived graphs and indices

---

## 2. No Hard-Coded Business Logic

- Business rules MUST live in `*.lint.yaml`
- React components must never encode domain conditions
- Services must not branch on domain semantics

If logic appears in code, it must be:
- Generic
- Schema-driven
- Reusable across record types

---

## 3. Record Identity Rules

- `recordId` is canonical
- `@id` is always derived
- `@context` is always derived
- Users never edit derived fields

---

## 4. Schema Triplet Is Mandatory

Every schema MUST have:
- `*.schema.yaml`
- `*.ui.yaml`
- `*.lint.yaml`

If a feature cannot be implemented using this triplet,
the agent must stop and explain why.

---

## 5. File System and Naming

- Records live only under `computable-lab/records/`
- Schemas live only under `computable-lab/schema/`
- File naming: `RecordId__human-name.yaml`
- The human-name portion is cosmetic only

---

## 6. GitHub Is the Authority

- GitHub API is the source of truth
- No local DB may act as authority
- Local caches must be derived and disposable

---

## 7. Determinism and Purity

All derivations must be:
- Deterministic
- Pure functions
- Covered by tests

This includes:
- `@id`
- JSON-LD generation
- Graph edges
- Index construction

---

## 8. Allowed Stack

- TypeScript (strict)
- React (declarative only)
- Ajv (schema validation authority)
- XState (workflow execution)
- ESLint (code linting)
- JSON-LD libraries as needed

Avoid libraries that hide logic in configuration-less magic.

---

## 9. When in Doubt

Before writing code, ask:
> Can this be expressed as schema, lint, UI spec, or data?

If yes, do not write code.
