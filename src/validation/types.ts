/**
 * Types for validation module.
 * 
 * These types define the interface for structural validation
 * using Ajv as the single authority.
 */

import type { AnySchema } from 'ajv';
import type { ValidationResult, ValidationError } from '../types/common.js';

// Re-export for convenience
export type { ValidationResult, ValidationError, AnySchema };

/**
 * Options for creating a validator instance.
 */
export interface ValidatorOptions {
  /** Whether to use strict mode (default: true) */
  strict?: boolean;
  /** Whether to add standard formats (default: true) */
  addFormats?: boolean;
  /** Whether to allow union types (default: true) */
  allowUnionTypes?: boolean;
  /** Whether to use discriminator keyword (default: true) */
  discriminator?: boolean;
}

/**
 * Interface for the Validator.
 * Ajv is the single authority for structural validation.
 */
export interface Validator {
  /**
   * Validate data against a schema.
   * 
   * @param data - The data to validate
   * @param schemaId - The $id of the schema to validate against
   * @returns ValidationResult with validity and errors
   */
  validate(data: unknown, schemaId: string): ValidationResult;
  
  /**
   * Add a schema to the validator.
   * 
   * @param schema - The schema object
   * @param id - Optional explicit $id (uses schema.$id if not provided)
   */
  addSchema(schema: AnySchema, id?: string): void;
  
  /**
   * Remove a schema from the validator.
   * 
   * @param id - The $id of the schema to remove
   */
  removeSchema(id: string): void;
  
  /**
   * Check if a schema is loaded.
   * 
   * @param id - The $id of the schema
   */
  hasSchema(id: string): boolean;
  
  /**
   * Get a compiled schema by $id.
   * 
   * @param id - The $id of the schema
   */
  getSchema(id: string): unknown;
}
