/**
 * Types for the HTTP API layer.
 * 
 * These types define request/response structures for the REST API.
 * They MUST NOT contain schema-specific logic or business rules.
 */

import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { ValidationResult, LintResult } from '../types/common.js';

// ============================================================================
// Error Response
// ============================================================================

/**
 * Standard error response.
 */
export interface ApiError {
  /** Error type/code */
  error: string;
  /** Human-readable message */
  message: string;
  /** Additional details (optional) */
  details?: unknown;
}

// ============================================================================
// Record Endpoints
// ============================================================================

/**
 * Request to create a record.
 */
export interface CreateRecordRequest {
  /** Schema ID to validate against */
  schemaId: string;
  /** Record payload (the data to store) */
  payload: unknown;
  /** Commit message (optional) */
  message?: string;
}

/**
 * Request to update a record.
 */
export interface UpdateRecordRequest {
  /** Updated payload */
  payload: unknown;
  /** Expected SHA for optimistic locking (optional) */
  expectedSha?: string;
  /** Commit message (optional) */
  message?: string;
}

/**
 * Query parameters for listing records.
 */
export interface ListRecordsQuery {
  /** Filter by record kind */
  kind?: string;
  /** Filter by schema ID */
  schemaId?: string;
  /** Filter by ID prefix */
  idPrefix?: string;
  /** Maximum records to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Response for a single record.
 */
export interface RecordResponse {
  /** The record envelope */
  record: RecordEnvelope;
  /** Validation result (if requested) */
  validation?: ValidationResult;
  /** Lint result (if requested) */
  lint?: LintResult;
}

/**
 * Response for creating/updating a record.
 */
export interface RecordMutationResponse {
  /** Whether the operation succeeded */
  success: boolean;
  /** The created/updated record */
  record?: RecordEnvelope;
  /** Validation result */
  validation?: ValidationResult;
  /** Lint result */
  lint?: LintResult;
  /** Commit info */
  commit?: {
    sha: string;
    message: string;
    timestamp: string;
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Response for listing records.
 */
export interface ListRecordsResponse {
  /** Array of record envelopes */
  records: RecordEnvelope[];
  /** Total count (if available) */
  total?: number;
  /** Offset used */
  offset?: number;
  /** Limit used */
  limit?: number;
}

// ============================================================================
// Schema Endpoints
// ============================================================================

/**
 * Summary of a schema for listing.
 */
export interface SchemaSummary {
  /** Schema $id */
  id: string;
  /** Schema title (if available) */
  title?: string;
  /** Schema description (if available) */
  description?: string;
  /** File path */
  path: string;
  /** Number of dependencies */
  dependencyCount: number;
}

/**
 * Full schema response.
 */
export interface SchemaResponse {
  /** Schema $id */
  id: string;
  /** File path */
  path: string;
  /** The full schema object */
  schema: unknown;
  /** Direct dependencies */
  dependencies: string[];
  /** Schemas that depend on this one */
  dependents: string[];
}

/**
 * Response for listing schemas.
 */
export interface ListSchemasResponse {
  /** Array of schema summaries */
  schemas: SchemaSummary[];
  /** Total count */
  total: number;
}

// ============================================================================
// Validation Endpoints
// ============================================================================

/**
 * Request to validate a payload.
 */
export interface ValidateRequest {
  /** Schema ID to validate against */
  schemaId: string;
  /** Payload to validate */
  payload: unknown;
}

/**
 * Response from validation.
 */
export interface ValidateResponse extends ValidationResult {
  /** Schema ID used */
  schemaId: string;
}

/**
 * Request to lint a payload.
 */
export interface LintRequest {
  /** Schema ID (optional, filters rules) */
  schemaId?: string;
  /** Payload to lint */
  payload: unknown;
}

/**
 * Response from linting.
 */
export interface LintResponse extends LintResult {
  /** Schema ID used (if provided) */
  schemaId?: string;
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Health check response.
 */
export interface HealthResponse {
  /** Status */
  status: 'ok' | 'degraded' | 'error';
  /** Timestamp */
  timestamp: string;
  /** Component statuses */
  components?: {
    schemas?: { loaded: number };
    lintRules?: { loaded: number };
    ai?: { available: boolean; inferenceUrl: string; model: string; provider?: string; error?: string };
  };
}

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * Server configuration options.
 */
export interface ServerConfig {
  /** HTTP port (default: 3001) */
  port?: number;
  /** HTTP host (default: '0.0.0.0') */
  host?: string;
  /** Base path for records (default: 'records') */
  recordsDir?: string;
  /** Base path for schemas (default: 'schema') */
  schemaDir?: string;
  /** Enable CORS (default: true) */
  cors?: boolean;
  /** Log level (default: 'info') */
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}
