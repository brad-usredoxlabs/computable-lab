# ADR: Execution Planning Canonical Model

Date: 2026-02-28
Status: Accepted

## Context

`computable-lab` already contains a compile/execute pipeline:

- `planned-run` as run intent
- `robot-plan` as compiled platform artifact
- execution handlers and provider-backed runtime orchestration

The execution-planning spec in `tmp/robots.md` introduces two new declarative records:

- `execution_environment`: robot/workcell capability descriptor
- `execution_plan`: run-specific physical mapping and strategy

We need a canonical model that fits the current repository and preserves existing flows.

## Decision

Adopt `execution_environment` and `execution_plan` as first-class planning records in the workflow layer.

Canonical model:

1. `event_graph` encodes platform-agnostic semantic intent.
2. `execution_environment` encodes available hardware/capabilities/constraints.
3. `execution_plan` binds event graph intent to concrete placements/tool bindings/strategy.
4. target compilers emit platform artifacts (`robot-plan` + files) from validated planning inputs.

Compatibility decision:

- Keep existing `planned-run` and `robot-plan` flows operational during migration.
- New records follow existing repo conventions by carrying `kind` + `recordId`.
- New records also carry spec-aligned `type` + `id` for external compatibility.

## Consequences

- Planning intent becomes explicit, diffable, and auditable.
- Compiler implementations can be narrowed to deterministic validation + emission.
- Migration can proceed incrementally without breaking protocol binding and current compile APIs.

## Out of Scope (Sprint 1)

- API endpoints for execution-plan validate/emit
- orchestration refactor to require `execution_plan`
- frontend planning UI for `/labware-editor`
