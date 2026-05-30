/**
 * AjvValidator — Structural validation using Ajv.
 * 
 * CRITICAL RULES (from .clinerules):
 * - Ajv is the single authority for structural validation
 * - Configure Ajv ONCE at construction time (formats/keywords/options)
 * - Treat format registration as startup configuration, not mutable runtime state
 * - DO NOT depend on Ajv private/internal fields
 * - DO NOT rebuild Ajv instances as a workaround
 * 
 * This module:
 * - Wraps Ajv with a clean interface
 * - Converts Ajv errors to our ValidationError format
 * - Supports JSON Schema Draft 2020-12 and Draft-07
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { type ErrorObject, type ValidateFunction, type AnySchema } from 'ajv';
import addFormats from 'ajv-formats';
import type { ValidationResult, ValidationError } from '../types/common.js';
import type { Validator, ValidatorOptions } from './types.js';
import { closestMatch } from './closestMatch.js';

/**
 * Default validator options.
 */
const DEFAULT_OPTIONS: Required<ValidatorOptions> = {
  strict: true,
  addFormats: true,
  allowUnionTypes: true,
  discriminator: true,
};

/**
 * Convert an Ajv ErrorObject to our ValidationError format.
 */
function convertAjvError(error: ErrorObject): ValidationError {
  // Build the path from instancePath
  const path = error.instancePath || '/';
  
  // Get a readable message
  let message = error.message ?? 'Validation failed';
  // Teaching hint: a constructive nudge toward the fix (closest enum value,
  // what a missing field is, etc.). Populated where it helps convergence.
  let suggestion: string | undefined;

  // Enhance message based on keyword
  switch (error.keyword) {
    case 'required':
      if (error.params && 'missingProperty' in error.params) {
        message = `Missing required property: ${error.params.missingProperty}`;
        suggestion = `Add the "${error.params.missingProperty}" field.`;
      }
      break;
    case 'type':
      if (error.params && 'type' in error.params) {
        message = `Expected type: ${error.params.type}`;
      }
      break;
    case 'enum':
      if (error.params && 'allowedValues' in error.params) {
        const allowedValues = (error.params.allowedValues as unknown[]).map((v) => String(v));
        message = `Must be one of: ${allowedValues.join(', ')}`;
        if (typeof error.data === 'string') {
          const match = closestMatch(error.data, allowedValues);
          suggestion = match
            ? `You wrote "${error.data}" — did you mean "${match}"?`
            : `"${error.data}" is not allowed here; choose one of: ${allowedValues.join(', ')}.`;
        }
      }
      break;
    case 'const':
      if (error.params && 'allowedValue' in error.params) {
        message = `Must equal: ${error.params.allowedValue}`;
        suggestion = `Expected "${String(error.params.allowedValue)}".`;
      }
      break;
    case 'additionalProperties':
      if (error.params && 'additionalProperty' in error.params) {
        message = `Unknown property: ${error.params.additionalProperty}`;
        suggestion = `"${error.params.additionalProperty}" is not a recognized field — check for a typo or remove it.`;
      }
      break;
    case 'pattern':
      if (error.params && 'pattern' in error.params) {
        message = `Must match pattern: ${error.params.pattern}`;
      }
      break;
    case 'minLength':
      if (error.params && 'limit' in error.params) {
        message = `Must be at least ${error.params.limit} characters`;
      }
      break;
    case 'maxLength':
      if (error.params && 'limit' in error.params) {
        message = `Must be at most ${error.params.limit} characters`;
      }
      break;
    case 'minimum':
    case 'exclusiveMinimum':
      if (error.params && 'limit' in error.params) {
        message = `Must be >= ${error.params.limit}`;
      }
      break;
    case 'maximum':
    case 'exclusiveMaximum':
      if (error.params && 'limit' in error.params) {
        message = `Must be <= ${error.params.limit}`;
      }
      break;
    case 'minItems':
      if (error.params && 'limit' in error.params) {
        message = `Array must have at least ${error.params.limit} items`;
      }
      break;
    case 'maxItems':
      if (error.params && 'limit' in error.params) {
        message = `Array must have at most ${error.params.limit} items`;
      }
      break;
    case 'uniqueItems':
      message = 'Array items must be unique';
      break;
    case 'format':
      if (error.params && 'format' in error.params) {
        message = `Invalid format: expected ${error.params.format}`;
      }
      break;
  }
  
  return {
    path,
    message,
    keyword: error.keyword,
    ...(error.params !== undefined ? { params: error.params as Record<string, unknown> } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

/**
 * AjvValidator — Ajv-based structural validator.
 */
export class AjvValidator implements Validator {
  private readonly ajv: Ajv2020;
  
  /**
   * Create a new AjvValidator.
   * 
   * IMPORTANT: Ajv is configured ONCE at construction time.
   * Do not modify the Ajv instance after creation.
   */
  constructor(options: ValidatorOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // Create Ajv2020 instance with our options
    // Ajv2020 natively supports JSON Schema Draft 2020-12
    this.ajv = new Ajv2020({
      strict: opts.strict,
      strictRequired: false, // Disable strict required check for conditional schemas (if/then)
      allowUnionTypes: opts.allowUnionTypes,
      discriminator: opts.discriminator,
      allErrors: true, // Report all errors, not just the first
      verbose: true,   // Include data in errors for better messages
    });
    
    // Add standard formats if requested
    if (opts.addFormats) {
      addFormats(this.ajv);
    }
  }
  
  /**
   * Validate data against a schema.
   * 
   * @param data - The data to validate
   * @param schemaId - The $id of the schema to validate against
   * @returns ValidationResult with validity and errors
   */
  validate(data: unknown, schemaId: string): ValidationResult {
    const validateFn = this.ajv.getSchema(schemaId);
    
    if (validateFn === undefined) {
      return {
        valid: false,
        errors: [{
          path: '/',
          message: `Schema not found: ${schemaId}`,
          keyword: 'schema',
        }],
      };
    }
    
    const valid = validateFn(data);
    
    if (valid) {
      return { valid: true, errors: [] };
    }
    
    const errors = (validateFn.errors ?? []).map(convertAjvError);
    
    return { valid: false, errors };
  }
  
  /**
   * Validate data against an inline schema (not pre-registered).
   * 
   * @param data - The data to validate
   * @param schema - The schema object to validate against
   * @returns ValidationResult with validity and errors
   */
  validateWithSchema(data: unknown, schema: AnySchema): ValidationResult {
    try {
      const valid = this.ajv.validate(schema, data);
      
      if (valid) {
        return { valid: true, errors: [] };
      }
      
      const errors = (this.ajv.errors ?? []).map(convertAjvError);
      
      return { valid: false, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        errors: [{
          path: '/',
          message: `Schema error: ${message}`,
          keyword: 'schema',
        }],
      };
    }
  }
  
  /**
   * Add a schema to the validator.
   * 
   * @param schema - The schema object (must have $id or id parameter must be provided)
   * @param id - Optional explicit $id (uses schema.$id if not provided)
   */
  addSchema(schema: AnySchema, id?: string): void {
    if (id !== undefined) {
      this.ajv.addSchema(schema, id);
    } else {
      this.ajv.addSchema(schema);
    }
  }
  
  /**
   * Add multiple schemas to the validator.
   * 
   * @param schemas - Array of schema objects
   */
  addSchemas(schemas: AnySchema[]): void {
    for (const schema of schemas) {
      this.addSchema(schema);
    }
  }
  
  /**
   * Remove a schema from the validator.
   * 
   * @param id - The $id of the schema to remove
   */
  removeSchema(id: string): void {
    this.ajv.removeSchema(id);
  }
  
  /**
   * Check if a schema is loaded.
   * 
   * @param id - The $id of the schema
   */
  hasSchema(id: string): boolean {
    if (typeof id !== 'string' || id.length === 0) return false;
    return this.ajv.getSchema(id) !== undefined;
  }
  
  /**
   * Get a compiled schema by $id.
   * 
   * @param id - The $id of the schema
   * @returns The compiled ValidateFunction or undefined
   */
  getSchema(id: string): ValidateFunction | undefined {
    return this.ajv.getSchema(id);
  }
  
  /**
   * Compile a schema and return a validate function.
   * Useful for repeated validation against the same schema.
   * 
   * @param schema - The schema object
   * @returns A validate function
   */
  compile(schema: unknown): ValidateFunction {
    return this.ajv.compile(schema as object);
  }
}

/**
 * Create a new AjvValidator instance.
 */
export function createValidator(options?: ValidatorOptions): AjvValidator {
  return new AjvValidator(options);
}
