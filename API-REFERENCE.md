# computable-lab API & MCP Reference

Complete reference for the REST API and MCP server. The backend runs Fastify with all services sharing a single `AppContext`. The MCP server runs in-process at `/mcp` (Streamable HTTP) and also via stdio (`npm run mcp`).

---

## Table of Contents

1. [Core Types](#core-types)
2. [REST API Endpoints](#rest-api-endpoints) (includes [AI Agent](#ai-agent))
3. [MCP Tools](#mcp-tools)
4. [MCP Resources](#mcp-resources)
5. [MCP Prompts](#mcp-prompts)
6. [Domain Schemas](#domain-schemas)

---

## Core Types

### RecordEnvelope\<T\>

The universal record container. **recordId lives ONLY in the envelope, never smuggled into the payload.**

```typescript
interface RecordEnvelope<T = unknown> {
  recordId: string;     // Canonical identity (e.g., "STU-000003")
  schemaId: string;     // Governing schema (e.g., "studies/study")
  payload: T;           // Schema-validated data
  meta?: RecordMeta;    // Git/repo-derived metadata
}

interface RecordMeta {
  createdAt?: string;   // ISO 8601
  createdBy?: string;   // User or agent identifier
  updatedAt?: string;   // ISO 8601
  commitSha?: string;   // Git commit SHA
  path?: string;        // Repo file path
  contentSha?: string;  // Blob hash
  kind?: string;        // From payload.kind
}
```

### ValidationResult / LintResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;       // JSON pointer (e.g., "/title")
  message: string;
  keyword: string;    // JSON Schema keyword (e.g., "required", "type")
  params?: Record<string, unknown>;
}

interface LintResult {
  valid: boolean;
  violations: LintViolation[];
  summary?: LintSummary;
}

interface LintViolation {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  path?: string;
}
```

### Ref (Discriminated Reference)

All cross-record links use `Ref`. The `kind` field discriminates between internal records and external ontology terms.

```typescript
// Record reference (internal)
{
  kind: "record",
  id: "MAT-HEPG2",           // Record ID
  type: "material",           // Record type (required)
  label?: "HepG2 cells"       // Display label (optional)
}

// Ontology reference (external)
{
  kind: "ontology",
  id: "CL:0000182",           // CURIE (required)
  namespace: "CL",            // Ontology prefix (required)
  label: "hepatocyte",        // Display label (required)
  uri?: "http://purl.obolibrary.org/obo/CL_0000182"
}
```

### RecordMutationResponse

Returned by create, update, and delete operations (both REST and MCP).

```typescript
interface RecordMutationResponse {
  success: boolean;
  record?: RecordEnvelope;
  validation?: ValidationResult;
  lint?: LintResult;
  commit?: { sha: string; message: string; timestamp: string };
  error?: string;
}
```

---

## REST API Endpoints

Base URL: `http://localhost:3000/api`

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |

**Response:** `{ status: "ok" | "degraded" | "error", timestamp: string, components?: { schemas?: { loaded: number }, lintRules?: { loaded: number }, ai?: { available: boolean, inferenceUrl: string, model: string } } }`

---

### Records

| Method | Path | Description |
|--------|------|-------------|
| GET | `/records` | List records |
| GET | `/records/:id` | Get record by ID |
| POST | `/records` | Create record |
| PUT | `/records/:id` | Update record |
| DELETE | `/records/:id` | Delete record |

#### GET /records

**Query:** `kind?`, `schemaId?`, `idPrefix?`, `limit?` (number), `offset?` (number)

**Response:** `{ records: RecordEnvelope[], total?: number, limit?: number, offset?: number }`

#### GET /records/:id

**Query:** `validate?` ("true" to include), `lint?` ("true" to include)

**Response:** `{ record: RecordEnvelope, validation?: ValidationResult, lint?: LintResult }`

**Errors:** 404 not found

#### POST /records

**Body:** `{ schemaId: string, payload: unknown, message?: string }`

Payload must contain `recordId` or `id` field.

**Response (201):** `RecordMutationResponse`

**Errors:** 400 (missing fields), 409 (already exists), 422 (validation/lint failed)

#### PUT /records/:id

**Body:** `{ payload: unknown, expectedSha?: string, message?: string }`

`expectedSha` enables optimistic locking — returns 409 on mismatch.

**Response:** `RecordMutationResponse`

**Errors:** 400, 404, 409 (SHA mismatch), 422

#### DELETE /records/:id

**Query:** `expectedSha?`

**Response:** `{ success: boolean, commit?: { sha, message, timestamp } }`

**Errors:** 404, 409

---

### Schemas

| Method | Path | Description |
|--------|------|-------------|
| GET | `/schemas` | List all schemas |
| GET | `/schemas/:id` | Get schema by $id (URL-encoded) |
| GET | `/schemas/by-path/:path` | Get schema by file path (URL-encoded) |

#### GET /schemas

**Response:** `{ schemas: [{ id, path, dependencyCount, title?, description? }], total: number }`

#### GET /schemas/:id

**Response:** `{ id, path, schema: object, dependencies: string[], dependents: string[] }`

---

### Validation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/validate` | Structural validation only |
| POST | `/lint` | Business rule lint only |
| POST | `/validate-full` | Both validation + lint |

#### POST /validate

**Body:** `{ schemaId: string, payload: unknown }`

**Response:** `{ schemaId, valid: boolean, errors: ValidationError[] }`

#### POST /lint

**Body:** `{ payload: unknown, schemaId?: string }`

**Response:** `{ valid: boolean, violations: LintViolation[], summary?, schemaId? }`

#### POST /validate-full

**Body:** `{ schemaId: string, payload: unknown }`

**Response:** `{ validation: ValidateResponse, lint: LintResponse }`

---

### UI Specs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ui/specs` | List all UI specs |
| GET | `/ui/schema/:schemaId` | Get UI spec for a schema |
| GET | `/ui/record/:recordId` | Get record + UI spec + schema for rendering |

#### GET /ui/record/:recordId

**Response:** `{ record: RecordEnvelope, uiSpec: UISpec | null, schema: object }`

---

### Git Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/git/status` | Current git status |
| POST | `/git/commit-push` | Commit and optionally push |
| POST | `/git/sync` | Pull from remote |
| POST | `/git/push` | Push to remote |

#### POST /git/commit-push

**Body:** `{ message: string, files?: FileChange[], push?: boolean }`

**Response:** `{ success, commit?: { sha, message, timestamp }, pushed?, error? }`

---

### Tree Navigation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tree/studies` | Study/experiment/run hierarchy |
| GET | `/tree/records?runId=` | Records linked to a run |
| GET | `/tree/inbox` | Unfiled records |
| GET | `/tree/search?q=&kind=&limit=` | Full-text record search |
| POST | `/records/:id/file` | File record into a run |
| POST | `/index/rebuild` | Rebuild record index |

#### POST /records/:id/file

**Body:** `{ runId: string }`

**Response:** `{ success: boolean, newPath?: string, error?: string }`

---

### Library

| Method | Path | Description |
|--------|------|-------------|
| GET | `/library/search?q=&types=&limit=` | Search library records |
| GET | `/library/stats` | Library index statistics |
| GET | `/library/:type?limit=&offset=` | List records of a library type |
| POST | `/library/promote` | Promote ontology term to local record |
| POST | `/library/reindex` | Rebuild library index |

**Valid types:** material, labware, assay, reagent, buffer, cell_line, collection, context

#### POST /library/promote

**Body:** `{ ontologyRef: { id, namespace, label, uri? }, type: string, id?: string, additionalProperties?: object }`

**Response (201):** `{ success, record?, error? }`

---

### Ontology

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ontology/search?q=&ontologies=&limit=` | Search EBI OLS4 |

**Response:** `{ results: [{ id, label, namespace, uri, ontology, description }], total }`

---

### LabOS Execution Extensions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/execution/orchestrate` | One-shot guarded compile/validate/execute |
| GET | `/execution/health/adapters` | Adapter readiness/probe health summary |
| GET | `/execution/sidecar/contracts` | Sidecar contract manifest (Assist/Gemini schemas) |
| GET | `/execution/sidecar/contracts/diagnostics` | Sidecar contract readiness diagnostics |
| GET | `/execution/sidecar/contracts/examples` | Canonical sidecar contract sample payloads |
| POST | `/execution/sidecar/contracts/self-test` | Sidecar contract conformance self-test |
| POST | `/execution/sidecar/contracts/self-test/persist` | Run self-test and persist sidecar-contract-report |
| POST | `/execution/sidecar/contracts/validate` | Validate payload against a sidecar contract schema |
| POST | `/execution/sidecar/contracts/validate-batch` | Validate multiple payloads against sidecar contracts |
| POST | `/execution/sidecar/contracts/gate` | Evaluate sidecar contract readiness gate |
| GET | `/execution/workers/leases` | Worker lease owner/expiry/status view |
| GET | `/execution/ops/snapshot` | Consolidated execution operations snapshot |
| GET | `/execution/failure-runbook` | Failure code runbook guidance |
| GET | `/execution/incidents` | List execution incidents |
| POST | `/execution/incidents/scan` | Scan and create deduplicated incidents |
| POST | `/execution/incidents/:id/ack` | Acknowledge incident |
| POST | `/execution/incidents/:id/resolve` | Resolve incident |
| GET | `/execution/incidents/summary` | Aggregate incident counts by status/severity/type |
| GET | `/execution/incidents/worker/status` | Incident scan worker status |
| POST | `/execution/incidents/worker/start` | Start incident scan worker |
| POST | `/execution/incidents/worker/takeover` | Force lease takeover and start incident scan worker |
| POST | `/execution/incidents/worker/stop` | Stop incident scan worker |
| POST | `/execution/incidents/worker/run-once` | Run one incident scan cycle |
| POST | `/execution/recovery/reconcile` | Force reconciliation cycle for running executions |
| GET | `/execution/retry-worker/status` | Transient retry worker status |
| POST | `/execution/retry-worker/start` | Start transient retry worker |
| POST | `/execution/retry-worker/takeover` | Force lease takeover and start transient retry worker |
| POST | `/execution/retry-worker/stop` | Stop transient retry worker |
| POST | `/execution/retry-worker/run-once` | Run one transient retry cycle |
| POST | `/execution/poller/takeover` | Force lease takeover and start execution poller |
| POST | `/execution-runs/:id/resolve` | Manual terminal state resolution override |
| GET | `/execution/parameters/schema` | Runtime execution parameter schema by target |
| POST | `/execution/parameters/validate` | Validate execution parameters without running |
| GET | `/measurements/active-read/schema` | Active-read parameter schema by adapter |
| POST | `/measurements/active-read/validate` | Validate active-read parameters without running |

Background worker runtime state is persisted as `execution-worker-state` records (poller, retry worker, incident worker), with lease metadata to reduce duplicate loop ownership across processes.

---

### Protocol

| Method | Path | Description |
|--------|------|-------------|
| POST | `/protocols/from-event-graph` | Extract a reusable `protocol` record from an `event-graph` record |
| GET | `/protocols/:id/load` | Load a protocol record for editor usage |
| POST | `/protocols/:id/bind` | Bind protocol roles/parameters and create a `planned-run` |

`POST /protocols/from-event-graph` body:
- `eventGraphId` (required): source event-graph recordId
- `title` (optional): protocol title override
- `tags` (optional): additional tags

Response (`201`): `{ success: true, recordId: "PRT-000001" }`

---

## MCP Tools

All MCP tools return `CallToolResult` — either `jsonResult(data)` or `errorResult(message)`. Error results have `isError: true`.

LabOS runtime parameter tools:
- `protocol_save_from_event_graph`
- `protocol_load`
- `protocol_list`
- `protocol_bind`
- `execution_orchestrate`
- `adapter_health_check`
- `execution_failure_runbook`
- `execution_incidents_list`
- `execution_incidents_scan`
- `execution_incident_ack`
- `execution_incident_resolve`
- `execution_incidents_summary`
- `execution_incident_worker_status`
- `execution_incident_worker_start`
- `execution_incident_worker_takeover`
- `execution_incident_worker_stop`
- `execution_incident_worker_run_once`
- `execution_recovery_reconcile`
- `execution_retry_worker_status`
- `execution_retry_worker_start`
- `execution_retry_worker_takeover`
- `execution_retry_worker_stop`
- `execution_retry_worker_run_once`
- `execution_worker_leases`
- `execution_ops_snapshot`
- `execution_sidecar_contracts`
- `execution_sidecar_contract_diagnostics`
- `execution_sidecar_contract_examples`
- `execution_sidecar_contract_self_test`
- `execution_sidecar_contract_self_test_persist`
- `execution_sidecar_contract_validate`
- `execution_sidecar_contract_validate_batch`
- `execution_sidecar_contract_gate`
- `execution_poller_takeover`
- `execution_run_resolve`
- `execution_parameter_schema`
- `execution_parameter_validate`
- `measurement_active_read_schema`
- `measurement_active_read_validate`

### Record & Schema Management

#### record_get
| Param | Type | Description |
|-------|------|-------------|
| `recordId` | string (required) | Record identifier |

**Returns:** Full `RecordEnvelope`

#### record_list
| Param | Type | Description |
|-------|------|-------------|
| `kind` | string? | Filter by record kind |
| `schemaId` | string? | Filter by schema ID |
| `limit` | number? | Max results (default 50) |
| `offset` | number? | Pagination offset |

**Returns:** `{ records: RecordEnvelope[], total }`

#### record_create
| Param | Type | Description |
|-------|------|-------------|
| `schemaId` | string (required) | Schema ID |
| `payload` | object (required) | Record data (must contain `id` or `recordId`) |
| `message` | string? | Commit message |

**Returns:** `{ success, envelope, validation, lint, error }` — validation + lint always included for AI self-correction.

#### record_update
| Param | Type | Description |
|-------|------|-------------|
| `recordId` | string (required) | Record to update |
| `payload` | object (required) | Updated data |
| `message` | string? | Commit message |

**Returns:** Same as `record_create`

#### record_delete
| Param | Type | Description |
|-------|------|-------------|
| `recordId` | string (required) | Record to delete |

**Returns:** `{ success, error }`

#### record_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Search query |
| `limit` | number? | Max results (default 50) |

**Returns:** `{ results, total }`

#### schema_list
No params. **Returns:** `{ schemas: [{ id, path, dependencyCount, dependentCount }], total }`

#### schema_get
| Param | Type | Description |
|-------|------|-------------|
| `schemaId` | string (required) | Schema $id |

**Returns:** `{ id, path, schema, dependencies, dependents }`

---

### Validation

#### validate_payload
| Param | Type | Description |
|-------|------|-------------|
| `schemaId` | string (required) | Schema to validate against |
| `payload` | object (required) | Data to validate |

**Returns:** `ValidationResult`

#### lint_payload
| Param | Type | Description |
|-------|------|-------------|
| `payload` | object (required) | Data to lint |
| `schemaId` | string? | Scope lint rules |

**Returns:** `LintResult`

#### validate_full
| Param | Type | Description |
|-------|------|-------------|
| `schemaId` | string (required) | Schema ID |
| `payload` | object (required) | Data to validate + lint |

**Returns:** `{ valid, validation, lint }`

---

### Tree Navigation

#### tree_studies
No params. **Returns:** Study hierarchy with experiments, runs, and record counts per run:
```json
{ "studies": [{ "recordId", "title", "experiments": [{ "recordId", "title", "runs": [{ "recordId", "title", "recordCounts": { "eventGraphs", "plates", "claims", "materials", "contexts", "attachments", "other" } }] }] }] }
```

#### tree_records_for_run
| Param | Type | Description |
|-------|------|-------------|
| `runId` | string (required) | Run record ID |

**Returns:** `{ records, total }`

#### tree_inbox
No params. **Returns:** `{ records, total }`

#### tree_file_record
| Param | Type | Description |
|-------|------|-------------|
| `recordId` | string (required) | Record to file |
| `runId` | string (required) | Target run |

**Returns:** `{ success, newPath }`

---

### Library

#### library_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string? | Search name, id, keywords |
| `type` | string? | Library type filter |
| `limit` | number? | Max results (default 50) |

**Returns:** `{ results: [{ recordId, schemaId, name }], total }`

#### library_promote
| Param | Type | Description |
|-------|------|-------------|
| `ontologyRef` | `{ id, namespace, label, uri? }` (required) | Ontology term |
| `type` | string (required) | Library type |

**Returns:** Same as `record_create`

---

### Git

#### git_status
No params. **Returns:** `{ branch, modified, staged, untracked, ahead, behind }`

#### git_commit
| Param | Type | Description |
|-------|------|-------------|
| `message` | string (required) | Commit message |
| `push` | boolean? | Push after commit (default true) |

**Returns:** `{ success, commit: { sha, message, author, timestamp }, error }`

#### git_history
| Param | Type | Description |
|-------|------|-------------|
| `path` | string? | File path (default: repo root) |
| `limit` | number? | Max commits (default 20) |

**Returns:** `{ commits, total }`

---

### External Knowledge Bases

All external tools have 15-second timeouts and return errors on timeout.

#### NCBI E-utilities

##### pubmed_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | PubMed query (supports MeSH, boolean, field tags) |
| `limit` | number? | Max results (default 10, max 50) |

**Returns:** `{ results: [{ pmid, title, authors, journal, pubDate, doi, url }], total }`

##### pubmed_fetch
| Param | Type | Description |
|-------|------|-------------|
| `pmid` | string (required) | PubMed ID |

**Returns:** `{ pmid, title, authors, journal, pubDate, doi, abstract, url }`

##### ncbi_gene_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Gene symbol, name, or keyword |
| `organism` | string? | Filter (e.g., "Homo sapiens", "9606") |
| `limit` | number? | Max results (default 10, max 20) |

**Returns:** `{ results: [{ geneId, symbol, fullName, organism, taxId, summary, aliases, chromosome, mapLocation, url }], total }`

##### ncbi_sequence_fetch
| Param | Type | Description |
|-------|------|-------------|
| `accession` | string (required) | NCBI accession (e.g., "NM_000600.5") |
| `db` | "nucleotide" \| "protein" (required) | Database |
| `format` | "fasta" \| "genbank"? | Return format (ignored when asRecord=true) |
| `asRecord` | boolean? | Return sequence.schema.yaml-compliant payload |

**Returns (standard):** `{ accession, db, title, organism, length, sequence, url }`

**Returns (asRecord=true):**
```json
{
  "record": {
    "kind": "sequence",
    "id": "SEQ-NM_000600.5",
    "label": "...",
    "alphabet": "dna",
    "residues": "ATCG...",
    "length": 1234,
    "identifiers": [{ "system": "refseq", "value": "NM_000600.5", "url": "..." }],
    "description": "Homo sapiens — ..."
  },
  "schemaId": "bio/sequence",
  "_hint": "Pass record as payload and schemaId to record_create"
}
```

#### UniProt

##### uniprot_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | UniProt query (e.g., "IL6 AND organism_id:9606") |
| `reviewed` | boolean? | Restrict to Swiss-Prot only |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ accession, entryId, proteinName, geneName, organism, taxId, length, function, url }], total }`

##### uniprot_fetch
| Param | Type | Description |
|-------|------|-------------|
| `accession` | string (required) | UniProt accession (e.g., "P05231") |
| `includeSequence` | boolean? | Include amino acid sequence |
| `asRecord` | boolean? | Return sequence.schema.yaml-compliant payload |

**Returns (standard):** `{ accession, entryId, proteinName, geneNames, organism, taxId, function, subcellularLocations, goTerms: [{ id, term }], pdbStructures, sequenceLength, sequence?, url }`

**Returns (asRecord=true):** Same shape as `ncbi_sequence_fetch` asRecord — `{ record, schemaId: "bio/sequence", _hint }` with `alphabet: "protein"`, UniProt + PDB identifiers.

#### RCSB Protein Data Bank

##### pdb_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Text query (e.g., "insulin receptor") |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ pdbId, title, method, resolution, releaseDate, url }], total }`

##### pdb_fetch
| Param | Type | Description |
|-------|------|-------------|
| `pdbId` | string (required) | PDB ID (e.g., "4HHB") |

**Returns:** `{ pdbId, title, method, resolution, releaseDate, primaryCitation: { title, journal, year, doi }, polymerEntities: [{ entityId, description, type, organism, length }], ligands: [{ entityId, description, compId }], url }`

#### Reactome

##### reactome_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Search query |
| `species` | string? | Filter by species |
| `types` | string? | Comma-separated: Pathway, Reaction, Complex, Protein |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ stId, name, type, species, summation, compartment, url }], total }`

##### reactome_pathway
| Param | Type | Description |
|-------|------|-------------|
| `stId` | string (required) | Reactome stable ID (e.g., "R-HSA-449147") |

**Returns:** `{ stId, name, type, species, compartments, summation, subEvents: [{ stId, name, type }], references: [{ title, pubmedId, journal, year }], url }`

##### reactome_participants
| Param | Type | Description |
|-------|------|-------------|
| `stId` | string (required) | Reactome event ID |

**Returns:** `{ stId, participants: [{ peStId, displayName, type, refEntities: [{ dbId, name, identifier, database, url }] }] }`

#### ChEBI

##### chebi_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Compound name, synonym, or ChEBI ID |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ chebiId, name, description, uri, url }], total }`

##### chebi_fetch
| Param | Type | Description |
|-------|------|-------------|
| `chebiId` | string (required) | ChEBI ID (e.g., "CHEBI:16236" or "16236") |

**Returns:** `{ chebiId, name, description, synonyms, formula, monoisotopicMass, inchiKey, inchi, smiles, uri, url }`

#### PubChem

##### pubchem_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Name, SMILES, InChI, or formula |
| `searchType` | "name" \| "smiles" \| "inchi" \| "formula"? | Default: "name" |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ cid, iupacName, formula, molecularWeight, canonicalSmiles, inchiKey, url }], total }`

##### pubchem_fetch
| Param | Type | Description |
|-------|------|-------------|
| `cid` | number (required) | PubChem CID (e.g., 2244 for aspirin) |

**Returns:** `{ cid, iupacName, formula, molecularWeight, exactMass, canonicalSmiles, isomericSmiles, inchi, inchiKey, xLogP, tpsa, hBondDonors, hBondAcceptors, synonyms, description, url }`

#### Europe PMC

##### europepmc_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Europe PMC syntax (AUTH:, TITLE:, boolean) |
| `openAccess` | boolean? | Restrict to open access |
| `source` | string? | MED, PMC, PPR (preprints), etc. |
| `limit` | number? | Max results (default 10, max 25) |

**Returns:** `{ results: [{ id, source, pmid, pmcid, doi, title, authorString, journal, pubYear, isOpenAccess, inPMC, citedByCount, abstract, url, fullTextUrl }], total }`

##### europepmc_citations
| Param | Type | Description |
|-------|------|-------------|
| `pmid` | string? | PubMed ID |
| `pmcid` | string? | PMC ID |
| `doi` | string? | DOI |
| `limit` | number? | Max results (default 10, max 25) |

At least one of pmid/pmcid/doi required.

**Returns:** `{ sourceId, sourceDb, citations: [{ id, source, title, authorString, journal, pubYear, doi }], total }`

##### europepmc_references
| Param | Type | Description |
|-------|------|-------------|
| `pmid` | string? | PubMed ID |
| `pmcid` | string? | PMC ID |
| `limit` | number? | Max results (default 25, max 50) |

**Returns:** `{ sourceId, sourceDb, references: [{ id, source, title, authorString, journal, pubYear, doi }], total }`

#### Ontology (OBO / OLS4)

##### ontology_search
| Param | Type | Description |
|-------|------|-------------|
| `query` | string (required) | Min 2 characters |
| `ontologies` | string? | Comma-separated prefixes (e.g., "chebi,efo") |
| `limit` | number? | Max results (default 10, max 50) |

8-second timeout.

**Returns:** `{ results: [{ id, label, namespace, uri, ontology, description }], total }`

---

## MCP Resources

| URI Template | Description | MIME Type |
|--------------|-------------|-----------|
| `schema://{schemaId}` | Full JSON Schema definition | application/json |
| `record://{recordId}` | Full RecordEnvelope as JSON | application/json |

Both support `list` (discover available IDs) and `read` (fetch by ID) operations.

---

## MCP Prompts

### create_record
| Arg | Type | Description |
|-----|------|-------------|
| `schemaId` | string (required) | Schema type to create |

Returns guidance with schema structure, required fields, constraints, and instructions for calling `record_create`.

### study_overview
| Arg | Type | Description |
|-----|------|-------------|
| `studyId` | string (required) | Study record ID |

Returns structured markdown overview: study info, experiment list, runs, record counts per type.

---

## Domain Schemas

### FAIRCommon Mixin

Inherited by most schemas via `allOf: [{ $ref: "../core/common.schema.yaml#/$defs/FAIRCommon" }]`.

Fields: `id`, `title`, `description`, `license`, `relatedIdentifiers` (string[]), `keywords` (string[]), `createdAt` (readOnly), `createdBy` (readOnly), `updatedAt` (readOnly), `@context` (readOnly), `@id` (readOnly), `@type` (readOnly).

### bio/sequence

Neutral biological sequence literal. Meaning is expressed through Claims/Assertions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"sequence"` | yes | Discriminator |
| `id` | string | yes | e.g., "SEQ-000123" |
| `alphabet` | enum | yes | dna, rna, protein, iupac_dna, iupac_rna |
| `residues` | string | yes | Raw sequence (uppercase, no whitespace) |
| `label` | string | no | Human-friendly name |
| `description` | string | no | |
| `topology` | enum | no | linear (default), circular |
| `strandedness` | enum | no | single, double, unknown (default) |
| `length` | integer | no | Convenience; derivable from residues |
| `canonicalization` | object | no | `{ rules, canonical_residues, checksum: { algo, value } }` |
| `identifiers` | array | no | `[{ system, value, url? }]` — genbank, refseq, uniprot, etc. |
| `notes` | object | no | Non-semantic UI notes |

### bio/sequence-interval

Neutral location primitive: interval on a parent sequence.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"sequence_interval"` | yes | Discriminator |
| `id` | string | yes | e.g., "INT-000042" |
| `on_sequence` | Ref | yes | Parent sequence |
| `start` | integer | yes | 1-based inclusive |
| `end` | integer | yes | 1-based inclusive |
| `label` | string | no | |
| `description` | string | no | |
| `coordinate_system` | `"1-based-inclusive"` | no | Fixed for now |
| `strand` | enum | no | +, -, na, unknown (default) |
| `corresponds_to_sequence` | Ref | no | Child sequence node |
| `provenance` | object | no | `{ identifiers, citations }` |
| `notes` | object | no | |

### studies/study

| Field | Type | Required |
|-------|------|----------|
| `kind` | `"study"` | yes |
| `recordId` | string | yes |
| `title` | string | yes |
| `shortSlug` | string | yes |
| `state` | enum | no — draft, in_progress, accepted, superseded, archived |
| `description` | string | no |
| `tags` | string[] | no |
| `primaryClaimIds` | string[] | no |
| `attachments` | FileRef[] | no |

### lab/material

| Field | Type | Required |
|-------|------|----------|
| `kind` | `"material"` | yes |
| `id` | string | yes |
| `name` | string | yes |
| `domain` | enum | yes — cell_line, chemical, media, reagent, organism, sample, other |
| `class` | Ref[] | no — ontology classifications |
| `tags` | string[] | no |

### knowledge/claim

| Field | Type | Required |
|-------|------|----------|
| `kind` | `"claim"` | yes |
| `id` | string | yes |
| `statement` | string | yes |
| `subject` | Ref | yes |
| `predicate` | Ref | yes |
| `object` | Ref | yes |

### knowledge/assertion

| Field | Type | Required |
|-------|------|----------|
| `kind` | `"assertion"` | yes |
| `id` | string | yes |
| `claim_ref` | Ref | yes |
| `statement` | string | yes |
| `scope` | object | yes — `{ control_context?, treated_context? }` (both Ref) |
| `outcome` | object | no — `{ measure, target, direction, effect_size }` |
| `evidence_refs` | Ref[] | no |

---

### AI Agent

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/draft-events` | Draft events via AI agent (synchronous) |
| POST | `/ai/draft-events/stream` | Draft events via AI agent (SSE stream) |

These endpoints are only available when the `ai` section is present in `config.yaml` and the inference endpoint is reachable.

#### Configuration

```yaml
ai:
  inference:
    baseUrl: https://api.openai.com/v1    # Any OpenAI-compatible endpoint
    model: gpt-4o                          # Model name
    apiKey: sk-...                          # API key (optional for local endpoints)
    timeoutMs: 120000                       # Per-completion timeout (default 120s)
    maxTokens: 4096                         # Max tokens per completion (default 4096)
    temperature: 0.1                        # Sampling temperature (default 0.1)
  agent:
    maxTurns: 15                            # Max tool-calling round trips (default 15)
    maxToolCallsPerTurn: 5                  # Max tool calls per turn (default 5)
    systemPromptPath: prompts/event-graph-agent.md  # System prompt template
```

Works with any OpenAI-compatible provider (OpenAI, Groq, Together, Fireworks, OpenRouter, vLLM, etc.). The agent never connects to external services directly — it calls tools locally via the ToolBridge.

#### POST /ai/draft-events

Synchronous endpoint. Runs the full agent loop and returns the result.

**Body:**

```json
{
  "prompt": "Add 10µL of DMSO to wells A1-A6",
  "context": {
    "labwares": [{ "labwareId": "PL-001", "labwareType": "96-well", "name": "Assay Plate", "addressing": { "type": "grid", "rows": ["A","B","C","D","E","F","G","H"], "columns": ["1","2","3","4","5","6","7","8","9","10","11","12"] } }],
    "eventSummary": { "totalEvents": 0, "recentEvents": [] },
    "vocabPackId": "default",
    "availableVerbs": [{ "verb": "add_material", "eventKind": "primitive" }]
  }
}
```

**Context fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `labwares` | LabwareSummary[] | yes | Current labware definitions |
| `eventSummary` | object | yes | `{ totalEvents, recentEvents: EventSummary[] }` |
| `vocabPackId` | string | yes | Active vocabulary pack ID |
| `availableVerbs` | VerbSummary[] | yes | Available verbs from vocab pack |
| `selectedWells` | object | no | `{ labwareId, wells: string[] }` |
| `runId` | string | no | Run this event graph belongs to |
| `eventGraphId` | string | no | Event graph record ID (if saved) |

**Response (200):** `AgentResult`

```json
{
  "success": true,
  "events": [{
    "eventId": "evt-001",
    "event_type": "primitive",
    "verb": "add_material",
    "vocabPackId": "default",
    "details": { "material": { "kind": "record", "id": "MAT-DMSO", "type": "material" }, "targets": [{ "labwareId": "PL-001", "wells": ["A1","A2","A3","A4","A5","A6"] }], "volume": { "value": 10, "unit": "µL" } },
    "provenance": { "actor": "ai-agent", "timestamp": "2026-02-14T12:00:00Z", "method": "automated", "actionGroupId": "grp-abc" }
  }],
  "notes": ["Resolved DMSO to MAT-DMSO via library_search"],
  "usage": {
    "promptTokens": 2400,
    "completionTokens": 800,
    "totalTokens": 3200,
    "turns": 3,
    "toolCalls": 2
  }
}
```

**Error responses:**

- 400: `{ error: "INVALID_REQUEST", message: "prompt is required" }`
- 500: `{ error: "AGENT_ERROR", message: "..." }`

**AgentResult fields:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the agent completed successfully |
| `events` | PlateEventProposal[] | Proposed events for preview |
| `notes` | string[] | Human-readable notes from the agent |
| `unresolvedRefs` | OntologyRefProposal[] | Ontology terms not yet in the local library |
| `error` | string | Error message if the agent failed |
| `clarificationNeeded` | string | Question back to the user if more info is needed |
| `usage` | object | `{ promptTokens, completionTokens, totalTokens, turns, toolCalls }` |

#### POST /ai/draft-events/stream

Same request body as `/ai/draft-events`. Returns Server-Sent Events (SSE) for real-time progress.

**Response:** `Content-Type: text/event-stream`

Event types:

| Event type | Shape | Description |
|------------|-------|-------------|
| `status` | `{ type: "status", message }` | Progress messages (e.g., "Turn 1...") |
| `tool_call` | `{ type: "tool_call", tool, args }` | Agent is calling a tool |
| `tool_result` | `{ type: "tool_result", tool, success, durationMs }` | Tool call completed |
| `thinking` | `{ type: "thinking", content }` | Agent reasoning (if model supports it) |
| `draft` | `{ type: "draft", events }` | Intermediate event proposals |
| `done` | `{ type: "done", result: AgentResult }` | Final result |
| `error` | `{ type: "error", message }` | Error during processing |

#### Agent Tool Allowlist

The agent can only use read-only tools (16 total). Write operations are denied.

**Allowed tools:** `record_get`, `record_list`, `record_search`, `schema_get`, `validate_payload`, `lint_payload`, `library_search`, `ontology_search`, `chebi_search`, `chebi_fetch`, `pubchem_search`, `ncbi_gene_search`, `uniprot_search`, `tree_studies`, `tree_records_for_run`

#### Architecture

The agent does not connect to external services directly. The flow is:

1. Browser sends prompt + editor context to the backend
2. AgentOrchestrator sends prompt + tool **definitions** (JSON schemas) to the cloud AI
3. Cloud AI responds with tool call requests
4. Orchestrator executes tools **locally** via ToolBridge → ToolRegistry (same code as MCP tools)
5. Tool results are sent back to the cloud AI
6. Repeat until the AI returns a final response with proposed events

---

## Common Patterns

**Record ID conventions:** `STU-` (study), `EXP-` (experiment), `RUN-` (run), `MAT-` (material), `SEQ-` (sequence), `INT-` (interval), `CLM-` (claim), `ASN-` (assertion), `COL-` (collection), `CTX-` (context).

**ID field:** Studies use `recordId`; most other schemas use `id`. The envelope always uses `recordId`.

**Pagination:** REST uses `limit` + `offset` query params. MCP tools use `limit` param (offset varies by tool).

**asRecord pattern:** `ncbi_sequence_fetch` and `uniprot_fetch` accept `asRecord: true` to return a `sequence.schema.yaml`-compliant payload that can be passed directly to `record_create` with `schemaId: "bio/sequence"`.

**Validation is dual-layer:** Structural validation (Ajv, JSON Schema) + business rule lint (declarative YAML DSL). Both are returned inline on create/update for immediate self-correction.
