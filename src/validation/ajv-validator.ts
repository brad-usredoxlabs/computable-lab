import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { JSONSchema, ValidationResult, ValidationError, Validator } from '../types/common';
import { AjvBackend } from './contracts';

/**
 * Error thrown when attempting to remove a format (not supported)
 */
class NotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotSupportedError';
  }
}

/**
 * Ajv-based validator implementation
 */
export class AjvValidator implements Validator, AjvBackend {
  private ajv: Ajv;
  private compiledValidators = new Map<string, ValidateFunction>();

  constructor(options: { allErrors?: boolean; verbose?: boolean; strict?: boolean | "log"; coerceTypes?: boolean | "array" } = {}) {
    this.ajv = new Ajv({
      allErrors: options.allErrors ?? true,
      verbose: options.verbose ?? true,
      strict: options.strict ?? true,
      validateFormats: true,
      coerceTypes: options.coerceTypes ?? false
    });

    // Add common formats
    addFormats(this.ajv);
  }

  /**
   * Validate data against schema
   */
  validate(data: unknown, schema: JSONSchema): ValidationResult {
    const validatorId = this.getSchemaId(schema);
    let validateFn = this.compiledValidators.get(validatorId);

    if (!validateFn) {
      validateFn = this.ajv.compile(schema);
      this.compiledValidators.set(validatorId, validateFn);
    }

    const valid = !!validateFn(data);
    const errors: ValidationError[] = [];

    if (!valid && validateFn.errors) {
      validateFn.errors.forEach(error => {
        errors.push(this.transformAjvError(error, data));
      });
    }

    return {
      valid,
      errors,
      warnings: [],
      info: []
    };
  }

  /**
   * Validate schema against meta-schema (correct implementation)
   */
  validateSchema(schema: JSONSchema): ValidationResult {
    const valid = this.ajv.validateSchema(schema);
    const errors: ValidationError[] = [];

    if (!valid && this.ajv.errors) {
      for (const err of this.ajv.errors) {
        errors.push(this.transformAjvError(err as ErrorObject, schema));
      }
    }

    return {
      valid,
      errors,
      warnings: [],
      info: []
    };
  }

  /**
   * Add schema to validator pool
   */
  addSchema(uri: string, schema: JSONSchema): void {
    this.ajv.addSchema(schema, uri);
    // Don't clear compiledValidators here - they're cached by schema content, not URI
  }

  /**
   * Remove schema from validator pool
   */
  removeSchema(uri: string): void {
    this.ajv.removeSchema(uri);
    // Don't clear compiledValidators here - they're cached by schema content, not URI
  }

  /**
   * Check if schema is in validator pool
   */
  hasSchema(uri: string): boolean {
    return this.ajv.getSchema(uri) !== undefined;
  }

  /**
   * Get compiled validator for URI (AjvBackend interface)
   */
  getValidator(uri: string): ValidateFunction | undefined {
    return this.ajv.getSchema(uri);
  }

  /**
   * Validate data against schema by URI (AjvBackend interface)
   */
  validateByUri(uri: string, data: unknown): ValidationResult {
    const validateFn = this.getValidator(uri);
    if (!validateFn) {
      return {
        valid: false,
        errors: [{
          schemaPath: '',
          dataPath: '',
          message: `No schema found for URI: ${uri}`,
          keyword: 'missing',
          type: 'reference'
        }],
        warnings: [],
        info: []
      };
    }

    const valid = !!validateFn(data);
    const errors: ValidationError[] = [];

    if (!valid && validateFn.errors) {
      validateFn.errors.forEach(error => {
        errors.push(this.transformAjvError(error, data));
      });
    }

    return {
      valid,
      errors,
      warnings: [],
      info: []
    };
  }

  /**
   * Add custom format
   */
  addFormat(name: string, format: any): void {
    this.ajv.addFormat(name, format);
  }

  /**
   * Remove custom format - not supported (throws NotSupportedError)
   */
  removeFormat(name: string): void {
    throw new NotSupportedError(`Format removal is not supported. Formats are treated as startup configuration and should not be modified at runtime.`);
  }

  /**
   * Get compiled validator for schema (Validator interface)
   */
  getValidatorForSchema(schema: JSONSchema): (data: unknown) => ValidationResult {
    return (data: unknown) => this.validate(data, schema);
  }

  /**
   * Clear all compiled validators
   */
  clear(): void {
    this.compiledValidators.clear();
  }

  /**
   * Get schema ID for caching
   */
  private getSchemaId(schema: JSONSchema): string {
    if (schema.$id) {
      return schema.$id;
    }
    // Use canonical JSON string for stable cache key
    return this.getCanonicalSchemaString(schema);
  }

  /**
   * Get canonical JSON string for schema
   */
  private getCanonicalSchemaString(schema: unknown): string {
    const canonical = this.canonicalizeSchema(schema);
    return JSON.stringify(canonical);
  }

  /**
   * Canonicalize schema for stable cache key
   */
  private canonicalizeSchema(schema: unknown): unknown {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.canonicalizeSchema(item));
    }

    const canonical: Record<string, unknown> = {};
    const keys = Object.keys(schema).sort();
    
    for (const key of keys) {
      canonical[key] = this.canonicalizeSchema((schema as Record<string, unknown>)[key]);
    }
    
    return canonical;
  }

  /**
   * Transform Ajv error to our ValidationError format
   */
  private transformAjvError(error: ErrorObject, data: unknown): ValidationError {
    const validationError: ValidationError = {
      schemaPath: error.schemaPath || '',
      dataPath: error.instancePath || '',
      message: error.message || 'Unknown error',
      keyword: error.keyword,
      type: this.getErrorType(error.keyword)
    };

    // Only add value if it's defined (section 7.2 compliance)
    if (error.instancePath !== undefined) {
      const v = this.extractValue(error.instancePath, data);
      if (v !== undefined) {
        validationError.value = v;
      }
    }

    // Only add schema if it's defined (section 7.2 compliance)
    if (error.schema !== undefined) {
      validationError.schema = error.schema;
    }

    return validationError;
  }

  /**
   * Extract value from data using JSONPath
   */
  private extractValue(instancePath: string, data: unknown): unknown {
    if (!instancePath || instancePath === '/') {
      return data;
    }

    const pathParts = instancePath.split('/').filter(Boolean);
    let value = data;

    for (const part of pathParts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get error type from keyword
   */
  private getErrorType(keyword: string): string {
    const typeMap: Record<string, string> = {
      'type': 'structure',
      'format': 'format',
      'required': 'structure',
      'additionalProperties': 'structure',
      'pattern': 'format',
      'minimum': 'constraint',
      'maximum': 'constraint',
      'minLength': 'constraint',
      'maxLength': 'constraint',
      'enum': 'constraint',
      'const': 'constraint',
      'oneOf': 'structure',
      'anyOf': 'structure',
      'allOf': 'structure',
      'not': 'structure',
      'if': 'structure',
      'then': 'structure',
      'else': 'structure',
      'dependentRequired': 'structure',
      'dependentSchemas': 'structure',
      'prefixItems': 'structure',
      'items': 'structure',
      'contains': 'structure',
      'properties': 'structure',
      'patternProperties': 'structure',
      'additionalItems': 'structure',
      'unevaluatedItems': 'structure',
      'unevaluatedProperties': 'structure',
      'propertyNames': 'structure',
      'dependencies': 'structure'
    };

    return typeMap[keyword] || 'unknown';
  }
}

/**
 * Factory function to create Ajv validator
 */
export function createAjvValidator(options: { allErrors?: boolean; verbose?: boolean; strict?: boolean | "log"; coerceTypes?: boolean | "array" } = {}): AjvValidator {
  return new AjvValidator(options);
}