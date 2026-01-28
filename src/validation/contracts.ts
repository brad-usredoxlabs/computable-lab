import type { JSONSchema, ValidationResult } from '../types/common';
import type { ValidateFunction } from 'ajv';

export interface AjvBackend {
  validateSchema(schema: JSONSchema): ValidationResult;
  addSchema(uri: string, schema: JSONSchema): void;
  removeSchema(uri: string): void;
  getValidator(uri: string): ValidateFunction | undefined;
  validateByUri(uri: string, data: unknown): ValidationResult;
}

export class SchemaRegistrationError extends Error {
  constructor(
    public readonly uri: string,
    public readonly reason: string,
    public readonly ajvErrors?: any[]
  ) {
    super(`Schema registration failed for ${uri}: ${reason}`);
    this.name = 'SchemaRegistrationError';
  }
}

export class MissingDependencyError extends Error {
  constructor(
    public readonly uri: string,
    public readonly missing: string[],
    public readonly requiredBy: Record<string, string[]>
  ) {
    super(`Missing dependencies for schema ${uri}: ${missing.join(', ')}`);
    this.name = 'MissingDependencyError';
  }
}