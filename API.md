# computable-lab API Reference

This document describes the REST API endpoints provided by the computable-lab kernel.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently no authentication is required (development mode).

---

## Health Check

### GET /health

Returns the server status and component counts.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-28T17:00:00.000Z",
  "components": {
    "schemas": { "loaded": 28 },
    "lintRules": { "loaded": 14 }
  }
}
```

---

## Records

### GET /records

List all records, optionally filtered by kind or schema.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `kind` | string | Filter by record kind (e.g., "study", "experiment") |
| `schemaId` | string | Filter by schema ID (URL-encoded) |
| `idPrefix` | string | Filter by record ID prefix |
| `limit` | number | Maximum records to return (default: 100) |
| `offset` | number | Offset for pagination (default: 0) |

**Response:**
```json
{
  "records": [
    {
      "recordId": "STU-000001",
      "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
      "payload": { ... },
      "meta": {
        "path": "records/studies/STU-000001__example.yaml"
      }
    }
  ],
  "total": 10,
  "offset": 0,
  "limit": 100
}
```

---

### GET /records/:id

Get a single record by ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The record ID |

**Response (200):**
```json
{
  "record": {
    "recordId": "STU-000001",
    "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
    "payload": {
      "$schema": "https://computable-lab.com/schema/studies/study.schema.yaml",
      "kind": "study",
      "recordId": "STU-000001",
      "title": "Example Study",
      "shortSlug": "example"
    },
    "meta": {
      "path": "records/studies/STU-000001__example.yaml"
    }
  }
}
```

**Response (404):**
```json
{
  "error": "RECORD_NOT_FOUND",
  "message": "Record not found: STU-999999"
}
```

---

### POST /records

Create a new record.

**Request Body:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "payload": {
    "kind": "study",
    "recordId": "STU-000002",
    "title": "New Study",
    "shortSlug": "new-study"
  },
  "message": "Create new study"
}
```

**Response (201):**
```json
{
  "success": true,
  "record": {
    "recordId": "STU-000002",
    "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
    "payload": { ... },
    "meta": {
      "path": "records/studies/STU-000002__new-study.yaml"
    }
  },
  "validation": {
    "valid": true,
    "errors": []
  },
  "lint": {
    "passed": true,
    "violations": []
  }
}
```

**Response (400 - Validation Error):**
```json
{
  "success": false,
  "error": "Validation failed",
  "validation": {
    "valid": false,
    "errors": [
      {
        "path": "/title",
        "message": "must be string"
      }
    ]
  }
}
```

---

### PUT /records/:id

Update an existing record.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The record ID |

**Request Body:**
```json
{
  "payload": {
    "kind": "study",
    "recordId": "STU-000001",
    "title": "Updated Title",
    "shortSlug": "example"
  },
  "message": "Update study title"
}
```

**Response (200):**
```json
{
  "success": true,
  "record": { ... },
  "validation": { "valid": true, "errors": [] },
  "lint": { "passed": true, "violations": [] }
}
```

---

### DELETE /records/:id

Delete a record.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The record ID |

**Response (200):**
```json
{
  "success": true
}
```

**Response (404):**
```json
{
  "error": "RECORD_NOT_FOUND",
  "message": "Record not found: STU-999999"
}
```

---

## Schemas

### GET /schemas

List all loaded schemas.

**Response:**
```json
{
  "schemas": [
    {
      "id": "https://computable-lab.com/schema/studies/study.schema.yaml",
      "title": "Study",
      "description": "A Study groups related Experiments...",
      "path": "studies/study.schema.yaml",
      "dependencyCount": 2
    }
  ],
  "total": 28
}
```

---

### GET /schemas/:id

Get a schema by $id.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | URL-encoded schema $id |

**Example:** `/schemas/https%3A%2F%2Fcomputable-lab.com%2Fschema%2Fstudies%2Fstudy.schema.yaml`

**Response (200):**
```json
{
  "id": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "path": "studies/study.schema.yaml",
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://computable-lab.com/schema/studies/study.schema.yaml",
    "title": "Study",
    "type": "object",
    "properties": { ... }
  },
  "dependencies": ["./common.schema.yaml"],
  "dependents": ["experiment.schema.yaml"]
}
```

---

### GET /schemas/by-path/:path

Get a schema by file path.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | URL-encoded file path |

**Example:** `/schemas/by-path/studies%2Fstudy.schema.yaml`

---

## Validation

### POST /validate

Validate a payload against a schema.

**Request Body:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "payload": {
    "kind": "study",
    "recordId": "STU-000001",
    "title": "Test Study"
  }
}
```

**Response:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "valid": true,
  "errors": []
}
```

**Response (invalid):**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "valid": false,
  "errors": [
    {
      "path": "/shortSlug",
      "message": "must have required property 'shortSlug'"
    }
  ]
}
```

---

### POST /lint

Lint a payload against business rules.

**Request Body:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "payload": {
    "kind": "study",
    "recordId": "STU-000001",
    "title": "Test Study",
    "shortSlug": "test"
  }
}
```

**Response:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "passed": true,
  "violations": []
}
```

---

### POST /validate-full

Run both structural validation and linting.

**Request Body:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "payload": { ... }
}
```

**Response:**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "validation": {
    "valid": true,
    "errors": []
  },
  "lint": {
    "passed": true,
    "violations": []
  }
}
```

---

## UI Specs

### GET /ui/specs

List all available UI specifications.

**Response:**
```json
{
  "specs": [
    {
      "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
      "hasFormSpec": true,
      "hasListSpec": true,
      "hasDetailSpec": false
    }
  ]
}
```

---

### GET /ui/schema/:schemaId

Get the UI spec for a schema.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `schemaId` | string | URL-encoded schema $id |

**Response (200):**
```json
{
  "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
  "spec": {
    "uiVersion": 1,
    "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
    "display": {
      "titleField": "$.title",
      "subtitleField": "$.shortSlug",
      "icon": "study"
    },
    "form": {
      "layout": "sections",
      "sections": [...]
    },
    "list": {
      "columns": [...]
    }
  }
}
```

**Response (404):**
```json
{
  "error": "UI_SPEC_NOT_FOUND",
  "message": "UI spec not found for schema: ..."
}
```

---

### GET /ui/record/:recordId

Get a record with its UI spec and schema (combined endpoint for rendering).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `recordId` | string | The record ID |

**Response (200):**
```json
{
  "record": {
    "recordId": "STU-000001",
    "schemaId": "https://computable-lab.com/schema/studies/study.schema.yaml",
    "payload": { ... },
    "meta": { ... }
  },
  "uiSpec": {
    "uiVersion": 1,
    "schemaId": "...",
    "form": { ... },
    "list": { ... }
  },
  "schema": {
    "$schema": "...",
    "type": "object",
    "properties": { ... }
  }
}
```

---

## Error Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": { ... }  // optional
}
```

**Common Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RECORD_NOT_FOUND` | 404 | Record with given ID doesn't exist |
| `SCHEMA_NOT_FOUND` | 404 | Schema with given ID doesn't exist |
| `UI_SPEC_NOT_FOUND` | 404 | UI spec for schema doesn't exist |
| `VALIDATION_FAILED` | 400 | Payload doesn't conform to schema |
| `LINT_FAILED` | 400 | Payload violates business rules |
| `INTERNAL_ERROR` | 500 | Server-side error |

---

## Content Types

- Request bodies: `application/json`
- Response bodies: `application/json`
- YAML is not accepted directly via API; records are stored as YAML internally

---

## Architecture Notes

This API follows these principles:

1. **Schema-Driven**: All validation and UI rendering is driven by schema specs
2. **No Business Logic in Code**: Business rules live in `*.lint.yaml` files
3. **Envelope-First**: `RecordEnvelope.recordId` is canonical identity
4. **Git as Authority**: All mutations go through the git repository adapter
5. **Deterministic**: All derivations (IDs, timestamps from commits) are reproducible
