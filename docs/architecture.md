# computable-lab — Architecture

## Overview

computable-lab is composed of deterministic, replaceable layers.

---

## Modules

### Schema Registry
Loads and exposes schema triplets.

### Repo Adapter
Abstract interface with GitHub implementation.

### Validation Engine
Ajv-based structural validation.

### Lint Engine
Declarative rule execution across records.

### UI Renderer
Schema-driven forms and views.

### Graph Builder
JSON-LD generation and indexing.

---

## Testing Strategy

- Golden fixtures for schemas
- Deterministic derivation tests
- No UI snapshot tests for logic
