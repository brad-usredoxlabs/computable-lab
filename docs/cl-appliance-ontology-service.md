# cl-appliance ontology lookup service

This document is for developers and AI agents writing code that resolves
biomedical entities (genes, chemicals, anatomy, taxa, NCI concepts)
through the computable lab appliance. It describes the HTTP endpoint
the appliance exposes, the request/response contracts, and the
recommended usage pattern for the on-box AI panel.

Companion to [`cl-appliance-plr-bridge.md`](./cl-appliance-plr-bridge.md)
(plate-reader bridge).

## What the service is

The cl-appliance ships a thin FastAPI service called `ontology-service`
that wraps the [Ontology Access Kit (OAK)](https://github.com/INCATools/ontology-access-kit)
over pre-built SQLite snapshots of biomedical ontologies. The snapshots
come from [BBOP S3](https://s3.amazonaws.com/bbop-sqlite/) and live at
`/var/lib/cla-ontologies/<name>.db` on the appliance. The service is
deliberately small: lookup, search, parent/child traversal. No
reasoning, no inference, no graph holding RAM.

Designed for two consumer patterns:

1. **AI tool-use.** The on-box AI panel registers the endpoints below as
   tools the model can call to ground entity mentions, expand
   acronyms, find canonical IDs, or walk hierarchies.
2. **Direct programmatic use.** Other backend code (e.g. cla-lab's
   compiler, validation passes, or future labos-style adapters) can
   call the same endpoints to resolve free-text inputs to ontology
   identifiers.

## Configuration in cla-lab

The service binds to `127.0.0.1:8766` on the appliance — loopback only.
Set a single base URL when calling from cla-lab's backend:

```ts
const ONTOLOGY_BASE_URL =
  process.env.CLA_ONTOLOGY_SERVICE_URL ?? 'http://127.0.0.1:8766';
```

No auth is required — the service trusts anything on the loopback.
There's no analogue to the records-repo PAT.

`LABOS_ONTOLOGY_BASE_URL` would be a sensible name if the appliance
ever exposes the same shape as a `labos-bridge` flavored env var; for
now there's no established convention.

## Bundled ontologies

| Key | Source | What it's good for |
|---|---|---|
| `chebi` | ChEBI (chemical entities) | Compounds, reagents, buffers (water, DMSO, ATP, etc.) |
| `go` | Gene Ontology | Biological processes, molecular functions, cellular components |
| `ncit` | NCI Thesaurus | Cancer-domain terms, clinical concepts, drug categories |
| `uberon` | Uberon | Anatomy across species |
| `ncbitaxon` | NCBI Taxonomy | Organisms (Homo sapiens = `NCBITaxon:9606`, etc.) |

Each ontology key is the path segment in URLs (`/ontologies/chebi/...`).
The set is configurable via the appliance's `appliance.lock.yaml`; if
your site needs a different ontology, ask the appliance maintainer to
add it.

## Endpoint contract

CURIEs (`CHEBI:15377`, `GO:0006915`, etc.) live in URL path segments.
The colon is a reserved character — encode it as `%3A` in HTTP clients
that don't tolerate it raw. Examples below show both forms.

### `GET /health`

Readiness probe; cheap. Lists which ontologies are present on disk and
which adapter caches are warm.

```json
{
  "ready": true,
  "db_dir": "/var/lib/cla-ontologies",
  "ontologies": ["chebi", "go", "ncbitaxon", "ncit", "uberon"],
  "loaded": ["chebi"]
}
```

`ready: false` means the DB dir is empty (provisioning hasn't completed
or the operator wiped it). All endpoints will return 404 in that state.

### `GET /ontologies`

Same as `health.ontologies`. Use it when the caller just wants to
discover what's available.

```json
{ "ontologies": ["chebi", "go", "ncbitaxon", "ncit", "uberon"] }
```

### `GET /ontologies/{name}/terms/{curie}`

Full term record. Use this when you have a CURIE and want label /
definition / synonyms / direct parents.

```http
GET /ontologies/chebi/terms/CHEBI%3A15377
```

```json
{
  "id": "CHEBI:15377",
  "label": "water",
  "definition": "An oxygen hydride consisting of an oxygen atom that is covalently bonded to two hydrogen atoms",
  "synonyms": ["H(2)O", "hydrogen hydroxide", "Wasser", "agua", "aqua", "H2O", "oxidane", "..."],
  "parents": ["CHEBI:33693", "CHEBI:37176", "CHEBI:52625"]
}
```

`definition`, `synonyms`, `parents` may be empty / null for terms where
the source ontology doesn't have that data. `label` is required — its
absence means `404 Term not found`.

### `GET /ontologies/{name}/search?q=&limit=`

Text search across **labels and synonyms**, substring + case-insensitive.

```http
GET /ontologies/ncit/search?q=melanoma&limit=5
```

```json
{
  "q": "melanoma",
  "results": [
    { "id": "NCIT:C103113", "label": "NCI CTEP SDC Melanoma Sub-Category Terminology" },
    { "id": "NCIT:C103862", "label": "Allogeneic Irradiated Melanoma Cell Vaccine CSF470" },
    { "id": "NCIT:C104492", "label": "BAGE Gene" },
    { "id": "NCIT:C104493", "label": "BAGE wt Allele" },
    { "id": "NCIT:C104494", "label": "B Melanoma Antigen 1" }
  ]
}
```

`limit` defaults to 20, max 200. Results are returned in
adapter-internal order (essentially CURIE-sorted, not ranked by
relevance). If you need a single best match, sort/filter client-side.

The user query is regex-escaped before being submitted to OAK, so
special characters like `+`, `(`, `[` are safe to send raw.

### `GET /ontologies/{name}/ancestors/{curie}`

Transitive parents over `rdfs:subClassOf`. Use this to walk from a
specific term up to its categories.

```http
GET /ontologies/chebi/ancestors/CHEBI%3A15377?limit=10
```

```json
{
  "id": "CHEBI:15377",
  "ancestors": [
    { "id": "CHEBI:23367", "label": "molecular entity" },
    { "id": "CHEBI:24431", "label": "chemical entity" },
    { "id": "CHEBI:24651", "label": "hydroxides" },
    { "id": "CHEBI:24835", "label": "inorganic molecular entity" },
    { "id": "CHEBI:25806", "label": "oxygen molecular entity" }
  ]
}
```

`limit` defaults to 500, max 10000. Excludes the queried CURIE itself.

### `GET /ontologies/{name}/descendants/{curie}`

Transitive children over `rdfs:subClassOf`. Useful for "give me every
specific kind of X under the category Y."

```http
GET /ontologies/go/descendants/GO%3A0006915?limit=5
```

```json
{
  "id": "GO:0006915",
  "descendants": [
    { "id": "GO:1990086", "label": "lens fiber cell apoptotic process" },
    { "id": "GO:0002901", "label": "mature B cell apoptotic process" },
    { "id": "GO:0070246", "label": "natural killer cell apoptotic process" },
    { "id": "GO:1900200", "label": "mesenchymal cell apoptotic process involved in metanephros development" },
    { "id": "GO:1905288", "label": "vascular associated smooth muscle cell apoptotic process" }
  ]
}
```

Warning: descendants can be enormous on top-level concepts. NCBITaxon's
`/descendants/NCBITaxon:2` (Bacteria) returns hundreds of thousands of
rows; you almost certainly want to bound `limit` or query a deeper
node.

## Error responses

| HTTP | Shape | When |
|---|---|---|
| `400` | `{"detail": "Invalid ontology name: ..."}` | The `{name}` path segment contains characters other than `[a-z0-9_-]`. |
| `404` | `{"detail": "Ontology 'foo' not installed. Available: [...]"}` | The ontology key isn't present at `/var/lib/cla-ontologies/<name>.db`. |
| `404` | `{"detail": "Term not found: CHEBI:9999999"}` | The CURIE isn't in the ontology (or has no `rdfs:label`). |
| `500` | `{"detail": "ancestors failed: ..."}` | OAK raised on the underlying SQLite query. Check `journalctl -u ontology-service`. |

## Recommended usage patterns

### Tool-use registration for the AI panel

A reasonable starting set of tools to expose to the model (OpenAI-tool
shape):

```jsonc
[
  {
    "type": "function",
    "function": {
      "name": "ontology_search",
      "description": "Search a biomedical ontology by text. Returns up to `limit` matching terms by label or synonym. Use for grounding free-text mentions to canonical CURIEs.",
      "parameters": {
        "type": "object",
        "properties": {
          "ontology": { "enum": ["chebi", "go", "ncit", "uberon", "ncbitaxon"] },
          "q": { "type": "string" },
          "limit": { "type": "integer", "default": 10, "maximum": 50 }
        },
        "required": ["ontology", "q"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "ontology_term",
      "description": "Look up a CURIE in a biomedical ontology. Returns label, definition, synonyms, and direct parent CURIEs.",
      "parameters": {
        "type": "object",
        "properties": {
          "ontology": { "enum": ["chebi", "go", "ncit", "uberon", "ncbitaxon"] },
          "curie": { "type": "string", "description": "Compact URI like CHEBI:15377" }
        },
        "required": ["ontology", "curie"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "ontology_ancestors",
      "description": "Get transitive parent terms (rdfs:subClassOf) of a CURIE, ordered for browsing toward root. Use to expand 'what category is X in?'",
      "parameters": {
        "type": "object",
        "properties": {
          "ontology": { "enum": ["chebi", "go", "ncit", "uberon", "ncbitaxon"] },
          "curie": { "type": "string" },
          "limit": { "type": "integer", "default": 50, "maximum": 500 }
        },
        "required": ["ontology", "curie"]
      }
    }
  }
]
```

Tool handlers should map directly to the HTTP endpoints, return the
JSON payload to the model, and not paginate further (the model can
re-call with a larger limit if needed).

### Resolving a free-text mention to a single CURIE

For batched / scripted use (e.g. cla-lab's compiler resolving material
names in a protocol):

1. `GET /ontologies/{ont}/search?q=<text>&limit=5`
2. If a single exact label match: use that CURIE.
3. Otherwise: surface the top N to the operator (or the AI) for
   disambiguation. Don't auto-pick the first result — search is
   adapter-order, not relevance-ranked.

### Walking up to a category boundary

Use `/ancestors/{curie}` with a meaningful `limit` and stop when you
hit a category you care about. Example: "is this term a kind of
metabolite?" — fetch ancestors, look for `CHEBI:25212`.

For high-frequency traversal, consider caching results client-side;
each call is sub-millisecond, but they add up.

## What this service does NOT do (yet)

- **No reasoning.** Equivalence, intersections, restrictions, etc. are
  not exposed. Use OAK directly if you need that.
- **No cross-ontology mapping.** Each ontology is queried in isolation.
  Mapping (`CHEBI:15377` ↔ `NCIT:C29816`?) needs SSSOM mappings, which
  aren't bundled.
- **No write surface.** The service is read-only. Maintaining the
  appliance's curated subset in cla-lab's
  `schema/registry/ontology-terms/*.yaml` is a separate workflow.
- **No relevance ranking.** Search returns adapter-order results
  (essentially CURIE-sorted), not ranked by best match. Sort client-
  side if you need better.
- **No streaming.** Endpoints are synchronous JSON. Big descendant
  queries can take a few hundred ms — bound `limit` to keep latency
  predictable.

## Source

- Service: `services/ontology-service/` in
  [brad-usredoxlabs/cl-appliance](https://github.com/brad-usredoxlabs/cl-appliance).
- Role: `roles/ontology-service/` (downloads SQLite snapshots from
  BBOP, installs the venv, renders the unit).
- Ontology snapshots: [BBOP SQLite bucket](https://s3.amazonaws.com/bbop-sqlite/).
- OAK upstream: [INCATools/ontology-access-kit](https://github.com/INCATools/ontology-access-kit).
