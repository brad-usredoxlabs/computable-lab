# ADR-0002: Canonical RecordId, Derived @id

## Decision
recordId is canonical.
@id is derived.

## Rationale
Prevents drift, ensures determinism, enables refactoring.

## Consequences
Users cannot hand-edit graph identifiers.
