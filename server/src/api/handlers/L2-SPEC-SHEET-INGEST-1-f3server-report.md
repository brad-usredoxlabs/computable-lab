L2-SPEC-SHEET-INGEST-1 f3server — Implementation Report

UNIT: f3server (schema-driven payload-provenance injection)
BRANCH: cl/lane2-specsheet-doorb1-0114

PROBLEM:
  Handler injected createdAt/updatedAt/createdBy into every payload except
  material-instance/aliquot via a hardcoded kind list. labware-definition
  has additionalProperties:false with no createdAt/updatedAt/createdBy —
  Ajv 422d the create, blocking source provenance persistence.

FIX:
  Replaced hardcoded kind list with schema-driven check. Handler consults
  getSchemaProperties(schemaId) to determine accepted fields. Fallback to
  kind-based checks preserves exact old behavior when callback unavailable.

CHANGED FILES:
  1. server/src/api/handlers/RecordHandlers.ts (+24/-10 lines)
     - Added SchemaProvenanceCheck interface
     - Added getSchemaProperties to RecordHandlerSecurityOptions
     - Replaced injection logic at :774-789 with schema-driven decision
  2. server/src/api/handlers/RecordHandlers.provenanceInjection.test.ts (NEW, ~125 lines)
     - 5 tests: labware-definition, material-instance, aliquot, event-graph, protocol

VERIFICATION:
  1. cd server && node node_modules/vitest/vitest.mjs run src/api/handlers/RecordHandlers.provenanceInjection.test.ts -> 5/5 PASS
  2. cd server && node node_modules/vitest/vitest.mjs run src/api/handlers/ -> 178/178 PASS
  3. npm run typecheck -w server -> exit 0

NEXT ACTIONS:
  - Wire getSchemaProperties in server.ts/recordRoutes.ts for production

L2-SPEC-SHEET-INGEST-1-f3server UNIT unit DONE aeb66ba31cd79fbaf7da572e097cde8ed4ab6c16
