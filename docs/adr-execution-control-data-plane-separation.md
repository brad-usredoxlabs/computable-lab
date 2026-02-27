# ADR: Execution Control/Data Plane Separation

Status: Accepted
Date: 2026-02-24

## Context

`computable-lab` owns semantic records, schema validation, and compilation (`planned-run` -> `robot-plan`).
Execution concerns (hardware drivers, retries around runtime transport, SDK coupling) should be replaceable and not embedded as a hard dependency in the semantic backend.

## Decision

1. `computable-lab` is the control plane.
2. Execution providers are abstracted behind an `ExecutionProvider` interface.
3. Provider routing is configuration-driven (`execution.mode`: `local|remote|hybrid` with optional per-adapter overrides).
4. Runtime lifecycle is tracked in `execution-run`/`instrument-log`/`execution-incident` records.
5. `planned-run` remains semantic intent and is not mutated by runtime status transitions.

## Consequences

Positive:
- Execution implementations (Python reference, vendor service, other orchestrators) become swappable.
- Semantic layer remains stable even when execution stack changes.
- Hybrid migration is possible adapter-by-adapter.

Tradeoffs:
- Additional provider abstraction and mode configuration complexity.
- Remote provider dispatch requires contract/task endpoints (next phase).

## Rollout

1. Introduce provider abstraction and mode flags.
2. Keep local provider as default for backward compatibility.
3. Add remote dispatch provider and executor-facing task APIs in next phase.
4. Deprecate local process execution for production.
