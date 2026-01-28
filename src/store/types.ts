/**
 * Types for Record Store.
 * 
 * The Record Store orchestrates:
 * - YAML parsing/serialization
 * - Schema validation (via Ajv)
 * - Lint validation (via LintEngine)
 * - File operations (via RepoAdapter)
 * 
 * It has NO schema-specific logic. Domain rules live in specs.
 */

import type { ValidationResult, LintResult } from '../types/common.js';
import type { RecordEnvelope, RecordMeta } from '../types/RecordEnvelope.js';

// Re-export for convenience
export type { RecordEnvelope, RecordMeta };

/**
 * Result of a store operation.
 */
export interface StoreResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The envelope (if operation produced one) */
  envelope?: RecordEnvelope;
  /** Validation result (if validation was performed) */
  validation?: ValidationResult;
  /** Lint result (if linting was performed) */
  lint?: LintResult;
  /** Error message (if operation failed) */
  error?: string;
  /** Commit info (if operation committed) */
  commit?: {
    sha: string;
    message: string;
    timestamp: string;
  };
}

/**
 * Filter options for listing records.
 */
export interface RecordFilter {
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
 * Options for creating a record.
 */
export interface CreateRecordOptions {
  /** The record envelope to create */
  envelope: RecordEnvelope;
  /** Commit message */
  message?: string;
  /** Skip validation (use with caution) */
  skipValidation?: boolean;
  /** Skip linting (use with caution) */
  skipLint?: boolean;
}

/**
 * Options for updating a record.
 */
export interface UpdateRecordOptions {
  /** The record envelope to update */
  envelope: RecordEnvelope;
  /** Expected SHA for optimistic locking */
  expectedSha?: string;
  /** Commit message */
  message?: string;
  /** Skip validation (use with caution) */
  skipValidation?: boolean;
  /** Skip linting (use with caution) */
  skipLint?: boolean;
}

/**
 * Options for deleting a record.
 */
export interface DeleteRecordOptions {
  /** Record ID to delete */
  recordId: string;
  /** Expected SHA for optimistic locking */
  expectedSha?: string;
  /** Commit message */
  message?: string;
}

/**
 * Options for getting a record.
 */
export interface GetRecordOptions {
  /** Record ID to get */
  recordId: string;
  /** Include validation result */
  validate?: boolean;
  /** Include lint result */
  lint?: boolean;
}

/**
 * RecordStore interface.
 */
export interface RecordStore {
  /**
   * Get a record by ID.
   */
  get(recordId: string): Promise<RecordEnvelope | null>;
  
  /**
   * Get a record with validation/lint results.
   */
  getWithValidation(options: GetRecordOptions): Promise<StoreResult>;
  
  /**
   * List records.
   */
  list(filter?: RecordFilter): Promise<RecordEnvelope[]>;
  
  /**
   * Create a new record.
   */
  create(options: CreateRecordOptions): Promise<StoreResult>;
  
  /**
   * Update an existing record.
   */
  update(options: UpdateRecordOptions): Promise<StoreResult>;
  
  /**
   * Delete a record.
   */
  delete(options: DeleteRecordOptions): Promise<StoreResult>;
  
  /**
   * Validate a record against its schema.
   */
  validate(envelope: RecordEnvelope): Promise<ValidationResult>;
  
  /**
   * Lint a record against rules.
   */
  lint(envelope: RecordEnvelope): Promise<LintResult>;
  
  /**
   * Check if a record exists.
   */
  exists(recordId: string): Promise<boolean>;
}

/**
 * Configuration for RecordStore.
 */
export interface RecordStoreConfig {
  /** Base directory for records (default: 'records') */
  baseDir?: string;
  /** Default commit author */
  author?: string;
  /** Default commit email */
  email?: string;
}
