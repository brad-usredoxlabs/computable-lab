# Schema Overhaul: Typed Relationships Between First-Class Objects

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Break the artificial ownership hierarchy (study → experiment → run) and replace it with typed, many-to-many relationships between first-class objects (projects, runs, claims) as the UI spec requires.

**Architecture:** The current schema uses embedded foreign keys (`run.studyId`, `run.experimentId`) to create a rigid parent-child hierarchy. The spec requires projects, runs, and claims to be first-class objects connected by typed relationships (Run tests Claim, Project investigates Claim, Run uses Protocol, etc.) rather than ownership. This plan introduces a `relationship.schema.yaml` record type that stores typed edges between objects, adds multi-project linking to runs (`projectIds[]`), and migrates the tree builder from hierarchy traversal to relationship-graph queries.

**Tech Stack:** JSON Schema 2020-12, YAML, TypeScript (exactOptionalPropertyTypes), Fastify, Ajv

---

## Current State — What Was Done vs What's Missing

### What the previous UI overhaul DID implement:
1. `run.schema.yaml`: `experimentId` made optional, `studyId` promoted to required (partial — runs still have a single `studyId`, not multi-project)
2. Claim schema already exists and is decoupled (`schema/knowledge/claim.schema.yaml`)
3. Lab entity schemas already exist and are decoupled (24 schemas in `schema/lab/`)
4. UI routes, collection views, typed workspace tabs all built

### What is MISSING (the actual schema gap):

**1. Runs still have a single `studyId` — not multi-project**
- Spec §2.2: "A run MAY link to multiple projects"
- Spec AC #4: "A run can link to multiple projects"
- Current: `run.schema.yaml` has `studyId: string` (singular, required)
- Need: `projectIds: string[]` (plural, optional) alongside or replacing `studyId`

**2. No typed relationship schema exists**
- Spec §2.5 defines typed relationships: "Run tests Claim", "Run supports Claim", "Project investigates Claim", "Run uses Protocol", etc.
- Spec §9.6: "Relationship editing SHOULD use verb-based controls: This run [supports ▼] [Claim 42]"
- Current: No `relationship.schema.yaml` or equivalent edge record type
- The only "relationships" are embedded foreign keys (`run.studyId`, `study.primaryClaimIds[]`, `experiment.claimIds[]`)

**3. No run-to-claim typed links**
- Spec AC #5: "A run can test, support, contradict, or qualify multiple claims"
- Spec §6.5: "A run SHOULD expose an evidence area where results can be connected to claims using typed relationships: Tests, Supports, Contradicts, Qualifies, Inconclusive for"
- Current: No field on `run.schema.yaml` for claim relationships. `study.primaryClaimIds[]` is just a list of IDs with no verb.

**4. No project-to-claim typed links**
- Spec §5.2 Claims section: "Aims to establish, Investigates, Depends on, Assumes, Potentially challenged, Recently changed"
- Current: `study.primaryClaimIds[]` is a flat list with no relationship type

**5. No run-to-project multi-link**
- Spec §2.2: "Neither runs nor claims have one canonical project parent"
- Current: `run.studyId` is singular — one project per run

**6. Server tree builder still assumes hierarchy**
- `IndexManager.ts:532+`: `buildStudyTree()` constructs `study → experiments → runs`
- Need: a flat runs list per project (via relationships), with experiments as optional saved views

**7. No server endpoint for relationship CRUD**
- Need: `POST /api/relationships`, `GET /api/relationships?sourceId=X&type=Y`, `DELETE /api/relationships/:id`

---

## Phased Implementation

### Phase 1: Relationship Schema — Define the Edge Record Type

### Task 1.1: Create `relationship.schema.yaml`

**Objective:** Define a schema for typed, directed edges between first-class objects.

**Files:**
- Create: `schema/knowledge/relationship.schema.yaml`

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/relationship.schema.yaml"
title: "Relationship"
description: >
  A typed, directed edge between two first-class objects (project, run, claim,
  protocol, material, labware, equipment, person). Relationships carry a verb
  that carries scientific meaning (e.g. "tests", "supports", "uses", "investigates").
  Relationships are themselves records — they are addressable, queryable, and
  can carry provenance (who created the relationship, when, and why).

type: object
unevaluatedProperties: false
allOf:
- $ref: "./common.schema.yaml#/$defs/FAIRCommon"

required: [ kind, recordId, sourceType, sourceId, targetType, targetId, verb ]

properties:
  kind:
    const: "relationship"

  recordId:
    type: string
    description: "Stable local identifier (e.g., REL-0001)."

  sourceType:
    type: string
    enum: [ project, run, claim, protocol, material, labware, equipment, person, document ]
    description: "The type of the source object."

  sourceId:
    type: string
    description: "Record ID of the source object."

  targetType:
    type: string
    enum: [ project, run, claim, protocol, material, labware, equipment, person, document ]
    description: "The type of the target object."

  targetId:
    type: string
    description: "Record ID of the target object."

  verb:
    type: string
    enum:
      # Run → Claim
      - tests
      - supports
      - contradicts
      - qualifies
      - inconclusive_for
      # Project → Claim
      - investigates
      - depends_on
      - aims_to_establish
      - assumes
      # Run → Resource
      - uses
      - operates
      # Run → Person
      - performed_by
      # Calibration → Instrument
      - evaluates
      # Generic
      - references
      - related_to
    description: "The typed relationship verb. Carries scientific meaning."

  note:
    type: string
    description: "Optional human-readable note about why this relationship exists."

  provenance:
    type: string
    enum: [ user_entered, derived, imported, ai_suggested_unreviewed, ai_suggested_accepted, generated_by_instrument, generated_by_compiler ]
    default: user_entered
    description: "How this relationship was established."
```

**Step 1: Verify schema loads**

Run: `cd /home/brad/git/computable-lab/server && npx tsx -e "import { loadAllSchemas } from './src/schema/loader'; loadAllSchemas({ basePath: '../schema', recursive: true }).then(s => console.log('Loaded', s.size, 'schemas')).catch(e => console.error(e))"`
Expected: "Loaded N schemas" (N should be 1 more than before, no errors)

**Step 2: Commit**

```bash
git add schema/knowledge/relationship.schema.yaml
git commit -m "feat(schema): add relationship.schema.yaml — typed edges between first-class objects"
```

### Task 1.2: Add `projectIds` to run schema

**Objective:** Allow runs to link to multiple projects, not just one.

**Files:**
- Modify: `schema/studies/run.schema.yaml`

**Step 1: Add `projectIds` array**

Add to the `properties` block after `studyId`:

```yaml
  projectIds:
    type: array
    description: "Projects this run is linked to. A run MAY link to multiple projects. When present, this replaces the singular studyId as the primary project link."
    items:
      type: string
    uniqueItems: true
```

Make `studyId` optional (remove from `required`) since `projectIds` can be the primary link instead:

```yaml
required:
- kind
- recordId
- status
# studyId and projectIds are mutually optional — at least one should
# be present in practice, but the schema doesn't enforce this (lint rules can).
```

**Step 2: Add a lint rule**

Create or modify `schema/studies/run.lint.yaml` to add a rule: "A run must have at least one of studyId or projectIds."

**Step 3: Verify schema loads**

Run: `cd /home/brad/git/computable-lab/server && npx tsx -e "import { loadAllSchemas } from './src/schema/loader'; loadAllSchemas({ basePath: '../schema', recursive: true }).then(s => console.log('Loaded', s.size, 'schemas')).catch(e => console.error(e))"`
Expected: PASS

**Step 4: Commit**

```bash
git add schema/studies/run.schema.yaml schema/studies/run.lint.yaml
git commit -m "feat(schema): add projectIds[] to runs — multi-project linking per spec §2.2"
```

### Task 1.3: Add `projectIds` and `claimRelationships` to study schema

**Objective:** Allow projects to carry typed claim relationships.

**Files:**
- Modify: `schema/studies/study.schema.yaml`

**Step 1: Add relationship fields**

Replace `primaryClaimIds` with a richer structure:

```yaml
  # Kept for backward compat — deprecated in favor of relationship records.
  primaryClaimIds:
    type: array
    description: "DEPRECATED: Use relationship records with verb=investigates/depends_on/aims_to_establish instead."
    items:
      type: string

  # New: typed claim relationships can be expressed inline (convenience)
  # or via relationship records (authoritative).
  claimRelationships:
    type: array
    description: "Inline typed relationships to claims. Authoritative relationships live as relationship records."
    items:
      type: object
      additionalProperties: false
      required: [ verb, claimId ]
      properties:
        verb:
          type: string
          enum: [ investigates, depends_on, aims_to_establish, assumes ]
        claimId:
          type: string
```

**Step 2: Commit**

```bash
git add schema/studies/study.schema.yaml
git commit -m "feat(schema): add claimRelationships[] to studies — typed project→claim links"
```

---

### Phase 2: Server-Side Relationship API

### Task 2.1: Add relationship CRUD endpoints

**Objective:** Server endpoints for creating, querying, and deleting relationships.

**Files:**
- Modify: `server/src/api/handlers/RecordHandlers.ts` (or create `RelationshipHandlers.ts`)
- Modify: `server/src/api/routes.ts`

**Endpoints:**
- `POST /api/relationships` — create a relationship record
- `GET /api/relationships?sourceId=X&sourceType=run&verb=tests` — query by source/verb
- `GET /api/relationships?targetId=Y` — query by target
- `DELETE /api/relationships/:recordId` — delete a relationship

Since relationships are just records (kind: "relationship"), the existing `POST /api/records` and `GET /api/records?kind=relationship` endpoints already work for create/list. But a convenience wrapper makes the API cleaner.

**Step 1: Add GET /api/relationships convenience endpoint**

In `server/src/api/routes.ts`:

```typescript
// Relationships — query typed edges between objects
fastify.get('/relationships', async (request, reply) => {
  const query = request.query as {
    sourceId?: string
    sourceType?: string
    targetId?: string
    targetType?: string
    verb?: string
  }
  // Use existing record search with kind=relationship + filters
  const results = await indexManager.search(undefined, 500)
  let filtered = results.filter(r => r.kind === 'relationship')
  if (query.sourceId) filtered = filtered.filter(r => {
    const p = r.payload as Record<string, unknown>
    return p.sourceId === query.sourceId
  })
  if (query.targetId) filtered = filtered.filter(r => {
    const p = r.payload as Record<string, unknown>
    return p.targetId === query.targetId
  })
  if (query.verb) filtered = filtered.filter(r => {
    const p = r.payload as Record<string, unknown>
    return p.verb === query.verb
  })
  return { relationships: filtered, total: filtered.length }
})
```

**Step 2: Add API client function**

In `app/src/shared/api/client.ts`:

```typescript
async listRelationships(filters: {
  sourceId?: string
  targetId?: string
  verb?: string
}): Promise<{ relationships: RecordEnvelope[]; total: number }> {
  const params = new URLSearchParams()
  if (filters.sourceId) params.set('sourceId', filters.sourceId)
  if (filters.targetId) params.set('targetId', filters.targetId)
  if (filters.verb) params.set('verb', filters.verb)
  return request(`/relationships?${params.toString()}`)
},
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/api/routes.ts app/src/shared/api/client.ts
git commit -m "feat(server): add GET /api/relationships endpoint + API client function"
```

---

### Phase 3: Update IndexManager for Flat Run Lists

### Task 3.1: Add `getRunsForProject` to IndexManager

**Objective:** Query runs linked to a project via `projectIds[]` OR `studyId`, without requiring the experiment hierarchy.

**Files:**
- Modify: `server/src/index/IndexManager.ts`

**Step 1: Add the method**

```typescript
/**
 * Get all runs linked to a project (study), checking both studyId
 * and projectIds[] for the link. Returns a flat list — no hierarchy.
 */
getRunsForProject(studyId: string): IndexEntry[] {
  return this.entries.filter(e => {
    if (e.kind !== 'run') return false
    // Check singular studyId (legacy)
    if (e.links?.studyId === studyId) return true
    // Check projectIds[] (new multi-project)
    const payload = e.payload as Record<string, unknown> | undefined
    const projectIds = payload?.projectIds
    if (Array.isArray(projectIds) && projectIds.includes(studyId)) return true
    return false
  })
}
```

**Step 2: Update TreeHandlers to include flat runs list**

In `server/src/api/handlers/TreeHandlers.ts`, the `getStudyTree` response should include a `runs: RunTreeNode[]` flat list alongside the existing `experiments` tree.

**Step 3: Commit**

```bash
git add server/src/index/IndexManager.ts server/src/api/handlers/TreeHandlers.ts
git commit -m "feat(server): add getRunsForProject — flat run list via projectIds or studyId"
```

---

### Phase 4: Update Frontend Types

### Task 4.1: Add `projectIds` to frontend run types

**Objective:** Update frontend type definitions to support multi-project runs.

**Files:**
- Modify: `app/src/types/tree.ts` — add `projectIds?: string[]` to `RunTreeNode`
- Modify: `app/src/shared/api/client.ts` — update any run-related interfaces

**Step 1: Update tree types**

In `app/src/types/tree.ts`:

```typescript
export interface RunTreeNode {
  recordId: string
  studyId: string
  experimentId?: string  // Now optional
  projectIds?: string[] // New: multi-project linking
  title: string
  // ... existing fields
}
```

**Step 2: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 3: Commit**

```bash
git add app/src/types/tree.ts
git commit -m "feat(app): add projectIds[] to RunTreeNode for multi-project runs"
```

---

## Files Likely to Change

| File | Change |
|------|--------|
| `schema/knowledge/relationship.schema.yaml` | Create — typed edge record type |
| `schema/studies/run.schema.yaml` | Modify — add `projectIds[]`, make `studyId` optional |
| `schema/studies/study.schema.yaml` | Modify — add `claimRelationships[]` |
| `server/src/api/routes.ts` | Modify — add GET /api/relationships endpoint |
| `app/src/shared/api/client.ts` | Modify — add `listRelationships()` function |
| `server/src/index/IndexManager.ts` | Modify — add `getRunsForProject()` method |
| `server/src/api/handlers/TreeHandlers.ts` | Modify — include flat runs list in tree response |
| `app/src/types/tree.ts` | Modify — add `projectIds` to RunTreeNode |

## Tests / Validation

1. Schema loads: `cd server && npx tsx -e "..."` — no errors
2. `npm run typecheck` — both workspaces pass
3. Create a relationship record: `POST /api/records { schemaId: relationship.schema.yaml, payload: { kind: "relationship", recordId: "REL-0001", sourceType: "run", sourceId: "RUN-001", targetType: "claim", targetId: "CLM-001", verb: "tests" } }` — succeeds
4. Query relationships: `GET /api/relationships?sourceId=RUN-001` — returns the relationship
5. Create a run with projectIds: `POST /api/records { schemaId: run.schema.yaml, payload: { kind: "run", recordId: "RUN-002", status: "planned", projectIds: ["STU-001", "STU-002"] } }` — succeeds (no studyId required)

## Risks, Tradeoffs, and Open Questions

1. **Backward compatibility**: Existing runs have `studyId` but not `projectIds`. The `getRunsForProject` method checks both, so existing runs still appear in their project. New runs can use `projectIds` for multi-project linking.

2. **studyId vs projectIds**: Should we keep `studyId` for backward compat, or migrate everything to `projectIds[]`? Recommendation: keep `studyId` as a convenience field that the IndexManager auto-populates from `projectIds[0]` when present. Lint rule can enforce "at least one of studyId or projectIds."

3. **Relationship records vs embedded links**: Relationship records are first-class — they're addressable, queryable, carry provenance, and can be created/deleted independently. Embedded links (like `study.primaryClaimIds[]`) are convenience fields. The spec says "Projects, runs and claims are all first-class objects, it is only metadata that connects them" — relationship records ARE that metadata.

4. **IndexManager rebuild**: The tree builder currently constructs study → experiments → runs. Adding a flat `runs` list per study is additive — it doesn't break the existing hierarchy view, just adds the flat list alongside it.

5. **Should experiments become relationship records?**: The spec says experiments should become "saved run views" (tags, saved views, named collections). This could be implemented as a `relationship` record with verb `grouped_in` linking runs to an experiment-named collection. But this is a bigger migration — the plan above keeps experiments as-is and just makes them optional.

6. **Migration of existing experiment links**: Existing runs with `experimentId` still work. No data migration is needed — the schema change is backward-compatible (experimentId is still a valid optional field, just not required).
