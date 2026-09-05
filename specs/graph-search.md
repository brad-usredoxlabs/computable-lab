# Computable Lab Graph Search Engine

## Technical Specification v0.1

### Status

Draft architecture specification

### Purpose

The Computable Lab Graph Search Engine provides a single query layer over the laboratory event/evidence graph.

It is designed to serve two equally important clients:

1. **Human users**, through a graphical search, filtering, selection, and exploration interface.
2. **AI agents**, through an MCP server exposing structured graph-query operations.

Both clients operate on the same underlying query engine and receive the same canonical graph objects, provenance, relationships, and evidence paths.

The system should allow a laboratory user to move seamlessly between:

**find → inspect → select → ask → act**

without translating laboratory objects into filenames, database tables, record IDs, or verbose natural-language descriptions.

---

# 1. Design Goals

## 1.1 One query engine, multiple clients

The human UI and MCP server MUST be clients of the same graph-query service.

There should not be a separate "AI search system" and "user search system."

A query issued through the UI and an equivalent query issued by an agent should produce equivalent result sets.

---

## 1.2 Query the graph instead of loading the graph

Agents MUST NOT require the entire laboratory graph in model context.

Instead, agents should be able to request:

* specific objects
* neighborhoods
* paths
* descendants
* ancestors
* lineage
* evidence chains
* aggregates
* filtered collections
* summaries

This makes the graph effectively an external structured memory system.

---

## 1.3 Preserve provenance

Every returned fact SHOULD retain enough provenance to answer:

* Where did this value come from?
* What event produced it?
* Which sample/material/object did it refer to?
* Which instrument was involved?
* Who performed the action?
* Which protocol or procedure governed it?
* Which upstream events contributed to it?
* Which evidence supports this conclusion?

Search results should therefore be capable of returning both:

**the answer**

and

**the evidence path supporting the answer.**

---

## 1.4 Human interaction should not require graph-language knowledge

The graph model may internally involve nodes, edges, predicates, traversals, or typed relationships.

The ordinary user SHOULD instead interact with familiar concepts such as:

* samples
* wells
* plates
* runs
* compounds
* instruments
* people
* assays
* measurements
* results
* controls
* protocols

The UI should translate ordinary filtering and navigation into graph operations.

---

## 1.5 Query results are actionable

A query result is not merely something to read.

Any returned object or collection SHOULD be selectable and usable as input to a subsequent action.

Example:

1. Search for wells meeting criteria.
2. Select five wells.
3. Tell the AI: "Add compound X to these wells."
4. The selected graph object IDs become explicit context.
5. The AI produces the appropriate proposed event graph.
6. The existing compiler validates that event graph.

Thus:

**query result → selection → prompt → event-graph emission**

becomes a native workflow.

---

# 2. System Architecture

```text
                   ┌─────────────────────────┐
                   │ Computable Lab Event /  │
                   │ Evidence Graph          │
                   └────────────┬────────────┘
                                │
                     ┌──────────▼───────────┐
                     │ Graph Query Service  │
                     │                     │
                     │ resolve             │
                     │ filter              │
                     │ traverse            │
                     │ path                │
                     │ lineage             │
                     │ aggregate           │
                     │ provenance          │
                     └──────┬────────┬─────┘
                            │        │
                ┌───────────▼──┐  ┌──▼────────────┐
                │ Human UI     │  │ MCP Server    │
                │              │  │               │
                │ Find         │  │ Agent tools   │
                │ Filters      │  │ Structured    │
                │ Tables       │  │ graph access  │
                │ Plate views  │  │               │
                │ Selection    │  │               │
                └──────┬───────┘  └──────┬────────┘
                       │                 │
                       └────────┬────────┘
                                │
                     ┌──────────▼───────────┐
                     │ AI / User Actions   │
                     │                     │
                     │ proposed events     │
                     │ analysis            │
                     │ reports             │
                     │ graph mutations     │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │ Existing Computable │
                     │ Lab Compiler        │
                     └──────────────────────┘
```

The query engine is primarily read-oriented.

Graph mutation should continue to occur through the existing validated event-graph/compiler pathway rather than allowing arbitrary direct graph writes.

---

# 3. Canonical Graph Model

The query engine does not define a new source of truth.

It operates over the existing Computable Lab graph.

Example object types may include:

```text
Person
Organization
Instrument
InstrumentState
Calibration
MaintenanceEvent
Protocol
Procedure
Assay
Run
Plate
Well
Container
Sample
Material
Compound
Reagent
Lot
Operation
Observation
Measurement
Result
Control
StandardCurve
Analysis
Claim
Document
File
Location
EnvironmentalCondition
```

Relationships are typed.

Examples:

```text
performed_by
performed_on
used
contains
derived_from
aliquot_of
located_in
generated
measured
produced
followed_by
preceded_by
governed_by
supports
contradicts
calibrated_by
validated_by
member_of
applied_to
selected_from
```

The exact ontology is outside the scope of this v0.1 spec.

The query layer MUST treat graph type information as machine-readable schema rather than requiring client applications to hard-code every relationship.

---

# 4. Query Model

The query system should expose a domain-oriented structured query representation.

A textual graph language may later be offered as an advanced interface, but it SHOULD NOT be the fundamental public API.

The canonical query should be representable as structured data.

Example conceptual query:

```json
{
  "from": {
    "type": "Well"
  },
  "where": [
    {
      "relationship": "contains",
      "target": {
        "type": "Material",
        "name": "rotenone"
      }
    },
    {
      "path": [
        "followed_by"
      ],
      "target": {
        "type": "Measurement",
        "channel": "FITC"
      }
    }
  ],
  "return": [
    "well",
    "treatment",
    "measurement"
  ],
  "include_provenance": true
}
```

This representation can be translated internally into:

* Cypher
* Gremlin
* SPARQL
* SQL over graph tables
* a custom traversal engine

without exposing the backend implementation to clients.

---

# 5. Core Query Primitives

## 5.1 Resolve

Resolve human/domain identifiers into canonical graph objects.

Examples:

```text
"plate 421"
"Brad"
"rotenone"
"MagPix"
"well A7"
"assay X"
```

Possible operation:

```text
resolve(term, type?, scope?)
```

Returns candidate objects with canonical IDs.

---

## 5.2 Get object

Retrieve an object and selected properties.

```text
get(object_id, fields?, relationships?)
```

Example:

```text
get("well:98217")
```

---

## 5.3 Filter

Find objects of a specified type matching property conditions.

```text
find(
    type,
    filters,
    scope?,
    limit?,
    order?
)
```

Example:

```text
find Well
where plate = plate:421
and treatment = rotenone
```

---

## 5.4 Traverse

Follow graph relationships from one or more starting objects.

```text
traverse(
    start,
    relationship,
    direction?,
    depth?,
    target_type?
)
```

Example:

```text
sample
→ derived_from
→ parent_sample
```

---

## 5.5 Path

Find meaningful paths between graph objects.

```text
path(
    from,
    to,
    relationship_types?,
    max_depth?
)
```

Example:

```text
Result
→ generated_by
→ Measurement
→ performed_on
→ Instrument
→ calibrated_by
→ Calibration
```

---

## 5.6 Neighborhood

Return a bounded subgraph surrounding one or more objects.

```text
neighborhood(
    objects,
    depth,
    relationship_types?,
    object_types?,
    limits?
)
```

Particularly useful for agents.

---

## 5.7 Lineage

Retrieve upstream or downstream derivation history.

```text
lineage(
    object,
    direction,
    depth?,
    include_operations?
)
```

Examples:

```text
sample lineage

result lineage

derived material lineage
```

---

## 5.8 Evidence

Return evidence supporting a proposition or claim.

```text
evidence(
    subject,
    predicate?,
    claim?,
    evidence_types?,
    depth?
)
```

Example:

```text
evidence(
    person = Alice,
    claim = "competent to perform assay X"
)
```

Potential evidence path:

```text
Alice
→ performed
→ Assay X run
→ produced
→ expected positive-control response
→ agreed_with
→ standard curve
```

---

## 5.9 Aggregate

Perform calculations over query results.

```text
aggregate(
    query,
    group_by?,
    measures
)
```

Supported measures should initially include:

```text
count
sum
mean
median
min
max
stddev
first
last
distinct_count
```

Example:

```text
mean ROS response
grouped by compound
```

---

## 5.10 Exists

Efficiently determine whether matching evidence exists.

```text
exists(query)
```

Useful for agents performing conditional reasoning.

---

# 6. Result Model

All queries SHOULD return a standardized envelope.

Example:

```json
{
  "query_id": "qry_018329",
  "result_type": "collection",
  "objects": [],
  "relationships": [],
  "provenance": [],
  "summary": {
    "count": 37
  }
}
```

A result may represent:

```text
object
collection
subgraph
path
aggregate
scalar
boolean
```

---

# 7. Collections as First-Class Objects

An important v0.1 concept is that a query result can be represented by a persistent or ephemeral collection handle.

Example:

```text
collection:q_018329
```

The collection may represent:

```text
37 wells
8 samples
12 assay runs
5 calibration events
```

This allows subsequent requests to operate on a result without resending every member.

Example:

```text
User searches:
"all wells treated with oligomycin"

→ collection:1842
```

The user then selects five rows:

```text
selection:927
```

The selection contains:

```text
well:101
well:102
well:117
well:121
well:140
```

The user can then say:

```text
"Add rotenone to these."
```

The AI receives:

```json
{
  "prompt": "Add rotenone to these.",
  "selection": "selection:927"
}
```

It can resolve the exact graph objects without natural-language ambiguity.

---

# 8. Scope

Queries SHOULD support explicit scope.

Possible scopes:

```text
global lab graph
current project
current experiment
current run
current plate
current selection
current object
saved collection
time interval
```

Example:

```json
{
  "scope": {
    "type": "Run",
    "id": "run:421"
  }
}
```

Human UI actions SHOULD automatically establish scope.

If the user is viewing:

```text
Experiment 19
  → Run 421
    → Plate 1
```

then Find may initially search inside Plate 1.

The user can broaden scope intentionally.

---

# 9. UI Specification

## 9.1 Find panel

The primary user-facing graph search interface is **Find**.

Potential sidebar layout:

```text
AI
Find
Search
Details
Protocol
```

Definitions:

```text
AI
Natural-language reasoning and actions.

Find
Search internal Computable Lab graph and artifacts.

Search
External/web/scientific research.

Details
Properties and relationships for the selected object.

Protocol
Relevant procedure/protocol context.
```

---

## 9.2 Search box

Users may enter natural-language or structured queries.

Examples:

```text
wells treated with rotenone

runs Bradley performed last month

all measurements generated on the MagPix

samples derived from batch X

results where positive control failed

calibrations supporting this instrument
```

The UI translates the request into the structured query representation.

The generated interpretation SHOULD be inspectable.

---

# 10. Result Views

The same graph query may be rendered differently based on result type.

Supported v0.1 views SHOULD include:

### Table

Default generic result representation.

### Plate

Used when results contain wells.

### Object list

Used for samples, instruments, people, runs, etc.

### Detail view

Used for a single graph object.

### Lineage view

Used for provenance and derivation chains.

### Evidence view

Used for claim-support chains.

### Aggregate view

Used for grouped and calculated results.

A node-link visualization MAY exist but SHOULD NOT be the default user experience.

---

# 11. Relationship Expansion

A table-like result SHOULD allow users to expose properties belonging to related graph objects.

Example:

```text
Result
────────────────────────────────
Sample
ROS value
Date
```

The user requests:

```text
Instrument
Operator
Compound
Lot
```

These appear as additional columns.

Conceptually:

```text
Result
→ generated_by Measurement
→ performed_on Instrument
```

becomes:

```text
Sample | ROS | Date | Instrument
```

The user does not specify SQL join semantics.

The query engine determines graph traversal and multiplicity.

If a relationship is one-to-many, the UI SHOULD explicitly represent that cardinality rather than silently duplicating rows.

Possible representations include:

```text
nested values
expandable rows
aggregates
explode-to-rows
linked collection
```

---

# 12. Saved Views

Queries MAY be saved as named views.

Example:

```text
"Current rotenone experiments"
```

A saved view contains the query definition rather than a copied result set.

Opening the view re-executes the query against the current graph.

Saved views may optionally include:

```text
column layout
sorting
grouping
visualization preference
scope
aggregates
```

---

# 13. MCP Server

The MCP server exposes the graph query engine to agents.

Initial MCP tools SHOULD be small and composable rather than exposing a giant general-purpose query tool only.

Proposed v0.1 MCP surface:

```text
lab.resolve
lab.get
lab.find
lab.traverse
lab.path
lab.neighborhood
lab.lineage
lab.aggregate
lab.evidence
lab.get_collection
```

---

# 14. MCP Tool Examples

## lab.resolve

Input:

```json
{
  "term": "MagPix",
  "type": "Instrument"
}
```

Output:

```json
{
  "matches": [
    {
      "id": "instrument:19",
      "type": "Instrument",
      "name": "Luminex MagPix"
    }
  ]
}
```

---

## lab.find

Input:

```json
{
  "type": "Well",
  "where": [
    {
      "field": "treatment.name",
      "operator": "=",
      "value": "rotenone"
    }
  ],
  "scope": {
    "type": "Experiment",
    "id": "experiment:42"
  }
}
```

---

## lab.neighborhood

Input:

```json
{
  "objects": [
    "result:8137"
  ],
  "depth": 2
}
```

Used when an agent needs surrounding context.

---

## lab.evidence

Input:

```json
{
  "subject": "person:51",
  "claim": "competent_to_perform",
  "object": "assay:ROS-001"
}
```

Returns evidence paths supporting the claim.

---

# 15. Agent Interaction Model

The preferred agent workflow is iterative.

Instead of:

```text
LOAD ENTIRE LAB GRAPH
→ model context
→ reason
```

the agent performs:

```text
resolve objects
      ↓
find likely matches
      ↓
inspect relevant objects
      ↓
traverse selected relationships
      ↓
retrieve evidence or lineage
      ↓
reason over compact result
```

Example:

User:

```text
Why was this ROS result unusually high?
```

Agent:

```text
lab.get(result)
```

then:

```text
lab.neighborhood(result, depth=2)
```

then perhaps:

```text
lab.lineage(sample)
```

and:

```text
lab.find(
    comparable results,
    same assay,
    same treatment
)
```

The model receives only the data needed for the analysis.

---

# 16. Natural-Language Query Planner

Natural-language requests SHOULD be converted into the canonical structured query representation.

The LLM is acting as a **query planner**, not as the graph execution engine.

Example:

User:

```text
Show me rotenone wells where mitochondrial potential fell but ROS didn't rise.
```

Model produces something equivalent to:

```text
Find wells
where:
    treatment = rotenone

join:
    mitochondrial-potential measurement
    ROS measurement

condition:
    MMP < relevant baseline/control
    ROS <= relevant baseline/control
```

The deterministic graph engine executes the query.

This follows the same architectural principle as the Computable Lab compiler:

**AI proposes structured intent; deterministic software validates and executes it.**

---

# 17. Query Validation

The query engine MUST validate:

```text
object types
relationship types
field existence
operator compatibility
scope validity
cardinality
permissions
aggregation validity
resource limits
```

Invalid model-generated queries should produce structured errors that the agent can repair.

Example:

```json
{
  "error": "invalid_relationship",
  "relationship": "measured_with",
  "from_type": "Sample",
  "allowed_relationships": [
    "measured_by",
    "derived_from",
    "contained_in"
  ]
}
```

This permits automatic agent retry.

---

# 18. Query Explain

Every query SHOULD optionally support:

```text
explain = true
```

The engine then returns a human-readable interpretation.

Example:

```text
Find Well objects within Run 421 that contain a Material
named rotenone and that have a subsequent fluorescence
measurement using the FITC channel.
```

This is useful for:

* user trust
* agent debugging
* ontology development
* query planner testing

---

# 19. Evidence Graph and QMS

The graph query engine should make QMS evidence directly computable.

Instead of requiring separate administrative records whenever the underlying operational graph already contains the evidence, queries can answer questions such as:

```text
Who has repeatedly performed assay X successfully?

Which operators have produced acceptable controls?

Which instrument was used for this reported value?

Was the instrument operating inside its validated state?

Which calibration supports this measurement?

Which reagent lot produced these results?

Which runs deviated from the protocol?

Which evidence establishes operator competency?

Which evidence establishes assay reproducibility?
```

Example competency path:

```text
Person
→ performed
→ assay run
→ produced
→ control measurement
→ satisfied
→ acceptance criterion
```

Repeated successful paths provide direct empirical evidence of competency.

This allows Computable Lab to move toward:

**competency proven through actions**

rather than

**competency assumed from completion of paperwork.**

The graph does not eliminate required documentation.

It makes existing operational evidence queryable, inspectable, and reusable instead of duplicating the same facts across independent bureaucratic records.

---

# 20. Instrument State as Evidence

The same mechanism may support instrument-state claims.

Example evidence chain:

```text
Instrument
→ performed
→ reference measurement
→ produced
→ accepted value
→ within
→ expected tolerance
```

This evidence can support conclusions about continued instrument performance.

However, operational performance evidence should not automatically replace legally or scientifically required calibration procedures.

The system should distinguish:

```text
formal calibration status

versus

empirical evidence of continued acceptable performance
```

Both may be represented in the graph.

---

# 21. Security and Permissions

The query engine MUST respect object-level or scope-level permissions.

An MCP-connected model must never gain access to graph objects unavailable to the invoking user.

Every query executes under an authenticated principal.

Conceptually:

```text
user
→ session
→ permissions
→ graph query
```

Query-result handles and saved collections MUST inherit those permissions.

---

# 22. Mutation Boundary

The graph search engine SHOULD NOT initially provide unrestricted mutation operations.

Agents may query freely within their permissions.

Actions that alter laboratory state should pass through the existing Computable Lab event compiler.

Preferred flow:

```text
graph query
     ↓
selected objects
     ↓
user instruction
     ↓
AI proposes event graph
     ↓
compiler validation
     ↓
user / policy approval
     ↓
execution
     ↓
new canonical events
```

This gives agents a powerful read layer without bypassing deterministic safety and validation.

---

# 23. Backend Independence

The public query abstraction SHOULD remain independent of the storage/query backend.

Candidates may include:

```text
Neo4j / Cypher

Memgraph / Cypher

PostgreSQL with graph-oriented schema

Apache AGE

Gremlin-compatible graph stores

RDF / SPARQL

custom event-graph traversal engine
```

The v0.1 system should first define:

```text
canonical object semantics
query semantics
result semantics
MCP API
UI behavior
```

Then map those semantics onto whichever storage technology proves most appropriate.

This prevents backend-specific query language decisions from becoming part of the Computable Lab product contract.

---

# 24. Implementation Layers

Recommended separation:

```text
Layer 1
Canonical event/evidence graph

Layer 2
Graph storage adapter

Layer 3
Canonical query representation

Layer 4
Query planner / validator

Layer 5
Query execution engine

Layer 6
Result and collection service

Layer 7A
Human Find UI

Layer 7B
MCP server

Layer 8
AI reasoning / action system
```

Only the storage adapter should need substantial changes if the graph backend changes.

---

# 25. Minimal v0.1 Feature Set

The first implementation does not need arbitrary graph-language completeness.

A useful v0.1 can ship with:

```text
resolve

get object

filter by type/property

traverse one or more relationships

bounded neighborhood

upstream/downstream lineage

path between known objects

basic aggregates

collections / selections

provenance

query scopes

MCP access

table result view

plate/well result view

relationship-column expansion
```

This is enough to support a large fraction of laboratory search and agent context retrieval.

---

# 26. Deferred Features

Not required for v0.1:

```text
full Cypher-compatible language

arbitrary recursive graph algorithms

centrality/community detection

graph embeddings

vector similarity over every object

automatic ontology induction

cross-lab federation

general graph mutation through MCP

complex statistical pipelines

distributed graph computation
```

These can be layered in later.

---

# 27. Example End-to-End Workflow

User opens an experiment.

They choose **Find** and enter:

```text
show wells treated with oligomycin
where ROS increased by less than 10%
```

The query planner generates the structured query.

The query engine returns:

```text
17 wells
```

The user sees them highlighted on a plate.

They select five.

The current context now contains:

```text
selection:883
```

The user enters in the AI panel:

```text
Add rotenone to these and remeasure ROS after 30 minutes.
```

The AI asks the graph engine for relevant details about the selected wells if necessary.

It then emits a proposed event graph containing:

```text
5 dispense operations

wait 30 minutes

ROS measurement operation
```

The normal Computable Lab compiler validates:

```text
volumes
materials
well identity
instrument compatibility
protocol constraints
event ordering
```

The user approves execution.

The resulting operations become new events in the same graph.

Those events immediately become searchable through Find and MCP.

This closes the loop:

```text
GRAPH
  ↓
QUERY
  ↓
SELECTION
  ↓
AI
  ↓
COMPILED ACTION
  ↓
EVENTS
  ↓
GRAPH
```

---

# 28. Product Principle

The core product principle is:

> The laboratory graph should not merely record what happened. It should be the address space through which humans and agents understand, select, reason about, and act upon the laboratory.

The graph query engine therefore serves as the bridge between:

```text
laboratory history
laboratory state
human interface
AI context
QMS evidence
automation
```

Rather than building separate databases, dashboards, training-record systems, search indexes, agent memories, and workflow selectors for each function, Computable Lab can expose one event/evidence graph through a consistent query abstraction.

That abstraction becomes a foundational platform service.

---

# 29. v0.1 Architectural Decision

For v0.1, Computable Lab SHOULD define its own **domain-level query AST/API**, but SHOULD NOT build its own low-level graph database or graph query language.

The preferred architecture is:

```text
Computable Lab query AST
            ↓
query compiler / adapter
            ↓
existing graph-capable storage engine
```

This preserves control over laboratory semantics while avoiding the cost of implementing query planning, indexing, graph traversal, persistence, and optimization from scratch.

Cypher-compatible storage is likely a strong initial implementation target because its pattern-matching semantics map naturally to the event/evidence graph, but this should remain an implementation choice rather than the public Computable Lab query contract.

---

# 30. Immediate Engineering Deliverables

A first engineering spike should implement:

1. A canonical `GraphQuery` schema.
2. A canonical `GraphResult` schema.
3. `resolve`, `get`, `find`, `traverse`, `lineage`, and `aggregate`.
4. Stable graph object IDs.
5. Ephemeral collection/selection IDs.
6. Provenance propagation.
7. One storage adapter.
8. A minimal MCP server exposing those primitives.
9. A Find UI with table and plate representations.
10. Selection-to-AI context injection.
11. A natural-language-to-GraphQuery planner.
12. Validation and repair errors suitable for agent retry.

A successful spike should demonstrate this complete workflow:

```text
Natural-language Find
        ↓
structured graph query
        ↓
graph execution
        ↓
plate/table results
        ↓
user selects objects
        ↓
AI receives canonical selection
        ↓
AI proposes event graph
        ↓
existing compiler validates it
```

If that works cleanly, the architecture has proved the central concept.
