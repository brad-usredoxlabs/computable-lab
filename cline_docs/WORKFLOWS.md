# Agent Workflows — computable-lab

These workflows must be followed mechanically.

---

## Workflow: Add a New Record Type

1. Create schema triplet:
   - `thing.schema.yaml`
   - `thing.ui.yaml`
   - `thing.lint.yaml`

2. Register schema in schema registry

3. Add at least one example record

4. Add validation tests:
   - valid record passes
   - invalid record fails

5. Confirm UI renders from `ui.yaml`

6. Confirm JSON-LD derivation works

---

## Workflow: Add a Business Rule

1. Attempt to express rule in `*.lint.yaml`
2. If impossible, extend lint engine GENERICALLY
3. Add failing fixture
4. Add passing fixture
5. Add lint tests
6. Do not modify UI or React logic

---

## Workflow: Edit Records via GitHub

1. Use RepoAdapter only
2. No domain branching
3. Ensure commit messages are meaningful
4. Never expose secrets

---

## Workflow: Build Graph / Index

1. Load all records
2. Validate schemas
3. Derive JSON-LD deterministically
4. Build graph edges
5. Store outputs under `derived/`
6. Ensure rebuildability

---

## Workflow: Implement UI Feature

1. Modify `*.ui.yaml` first
2. Extend renderer only if generic
3. No domain conditionals in JSX
4. Validate against lint errors
