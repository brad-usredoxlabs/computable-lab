import { 
  RecordEnvelope, 
  ValidationResult, 
  LintResult,
  QueryOptions,
  QueryResult,
  CreateResult,
  ReadResult,
  UpdateResult,
  DeleteResult,
  RepositoryAdapter,
  RecordId
} from '../types/common';
import { SchemaRegistry } from '../registry/schema-registry';
import { AjvValidator } from './ajv-validator';
import { LintEngine } from './lint-engine';
import { LintRuleSpec } from './types';
import { BaseCrud, BaseCrudOperations } from '../storage/base-crud';

/**
 * Validation Framework - Comprehensive validation system
 * Combines structural validation, business rules, and cross-schema validation
 */
export class ValidationFramework {
  private schemaRegistry: SchemaRegistry;
  private validator: AjvValidator;
  private lintEngine: LintEngine;
  private crud: BaseCrudOperations;

  constructor(
    schemaRegistry: SchemaRegistry,
    validator: AjvValidator,
    lintEngine: LintEngine,
    crud: BaseCrudOperations
  ) {
    this.schemaRegistry = schemaRegistry;
    this.validator = validator;
    this.lintEngine = lintEngine;
    this.crud = crud;
  }

  /**
   * Validate a record envelope comprehensively
   */
  async validateRecord(envelope: RecordEnvelope): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    // 1. Structural validation
    const structuralValidation = await this.validator.validate(envelope.data, 
      this.schemaRegistry.get(envelope.schemaId)!);
    results.push(structuralValidation);

    // 2. Business rules validation
    const lintValidation = await this.lintEngine.validateSchema(envelope.schemaId, envelope.data, {});
    results.push(lintValidation);

    // 3. Cross-schema validation
    const crossValidation = await this.validateCrossSchemaConstraints(envelope);
    results.push(crossValidation);

    // 4. Reference validation
    const referenceValidation = await this.validateReferences(envelope);
    results.push(referenceValidation);

    return this.combineValidationResults(results);
  }

  /**
   * Validate cross-schema constraints
   */
  private async validateCrossSchemaConstraints(envelope: RecordEnvelope): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    // Extract references from the record data
    const references = this.extractReferences(envelope.data);

    // Validate each reference
    for (const ref of references) {
      try {
        const readResult = await this.crud.read(ref.recordId);
        if (!readResult.found) {
          errors.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Referenced record not found: ${ref.recordId}`,
            value: ref.value,
            keyword: 'missing_reference',
            type: 'constraint'
          });
          continue;
        }

        const referencedEnvelope = readResult.envelope!;

        // Check if referenced record has the expected schema
        if (ref.expectedSchema && referencedEnvelope.schemaId !== ref.expectedSchema) {
          errors.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Expected schema ${ref.expectedSchema}, but found ${referencedEnvelope.schemaId}`,
            value: ref.value,
            keyword: 'schema_mismatch',
            type: 'constraint'
          });
        }

        // Check if referenced record has the expected type
        if (ref.expectedType && !this.isTypeMatch(referencedEnvelope.data, ref.expectedType)) {
          warnings.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Referenced record type mismatch: expected ${ref.expectedType}`,
            value: ref.value,
            keyword: 'type_mismatch',
            type: 'constraint'
          });
        }
      } catch (error) {
        errors.push({
          schemaPath: [],
          dataPath: ref.path,
          message: `Error validating reference: ${error}`,
          value: ref.value,
          keyword: 'reference_error',
          type: 'constraint'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: info as any[]
    };
  }

  /**
   * Validate record references
   */
  private async validateReferences(envelope: RecordEnvelope): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    // Extract references from the record data
    const references = this.extractReferences(envelope.data);

    // Validate each reference
    for (const ref of references) {
      try {
        const readResult = await this.crud.read(ref.recordId);
        if (!readResult.found) {
          errors.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Referenced record not found: ${ref.recordId}`,
            value: ref.value,
            keyword: 'missing_reference',
            type: 'constraint'
          });
          continue;
        }

        const referencedEnvelope = readResult.envelope!;

        // Check if referenced record has the expected schema
        if (ref.expectedSchema && referencedEnvelope.schemaId !== ref.expectedSchema) {
          errors.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Expected schema ${ref.expectedSchema}, but found ${referencedEnvelope.schemaId}`,
            value: ref.value,
            keyword: 'schema_mismatch',
            type: 'constraint'
          });
        }

        // Check if referenced record has the expected type
        if (ref.expectedType && !this.isTypeMatch(referencedEnvelope.data, ref.expectedType)) {
          warnings.push({
            schemaPath: [],
            dataPath: ref.path,
            message: `Referenced record type mismatch: expected ${ref.expectedType}`,
            value: ref.value,
            keyword: 'type_mismatch',
            type: 'constraint'
          });
        }
      } catch (error) {
        errors.push({
          schemaPath: [],
          dataPath: ref.path,
          message: `Error validating reference: ${error}`,
          value: ref.value,
          keyword: 'reference_error',
          type: 'constraint'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: info as any[]
    };
  }

  /**
   * Extract references from record data
   */
  private extractReferences(data: any): Array<{
    path: string;
    value: any;
    recordId: string;
    expectedSchema?: string;
    expectedType?: string;
  }> {
    const references: Array<{
      path: string;
      value: any;
      recordId: string;
      expectedSchema?: string;
      expectedType?: string;
    }> = [];

    const traverse = (obj: any, path: string = ''): void => {
      if (typeof obj !== 'object' || obj === null) return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (key === '$ref' && typeof value === 'string') {
          // Handle JSON-LD references
          const match = value.match(/^#(.+)$/);
          if (match) {
            references.push({
              path: currentPath,
              value,
              recordId: match[1]
            });
          }
        } else if (key === 'id' && typeof value === 'string') {
          // Handle direct ID references
          references.push({
            path: currentPath,
            value,
            recordId: value
          });
        } else if (typeof value === 'object') {
          traverse(value, currentPath);
        }
      }
    };

    traverse(data);
    return references;
  }

  /**
   * Check if data matches expected type
   */
  private isTypeMatch(data: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof data === 'string';
      case 'number':
        return typeof data === 'number';
      case 'boolean':
        return typeof data === 'boolean';
      case 'array':
        return Array.isArray(data);
      case 'object':
        return typeof data === 'object' && data !== null && !Array.isArray(data);
      default:
        return true; // Unknown type, assume match
    }
  }

  /**
   * Combine multiple validation results
   */
  private combineValidationResults(results: ValidationResult[]): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    for (const result of results) {
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (result.info) {
        info.push(...result.info);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: info as any[]
    };
  }

  /**
   * Validate a collection of records
   */
  async validateCollection(envelopes: RecordEnvelope[]): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    // Validate each record individually
    for (const envelope of envelopes) {
      const result = await this.validateRecord(envelope);
      results.push(result);
    }

    // Validate collection-level constraints
    const collectionValidation = await this.validateCollectionConstraints(envelopes);
    results.push(collectionValidation);

    return this.combineValidationResults(results);
  }

  /**
   * Validate collection-level constraints
   */
  private async validateCollectionConstraints(envelopes: RecordEnvelope[]): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    // Check for duplicate record IDs
    const idCounts = new Map<string, number>();
    for (const envelope of envelopes) {
      const count = idCounts.get(envelope.recordId) || 0;
      idCounts.set(envelope.recordId, count + 1);
    }

    for (const [recordId, count] of idCounts) {
      if (count > 1) {
        errors.push({
          schemaPath: [],
          dataPath: '',
          message: `Duplicate record ID: ${recordId}`,
          value: recordId,
          keyword: 'duplicate_id',
          type: 'constraint'
        });
      }
    }

    // Check for schema consistency
    const schemaCounts = new Map<string, number>();
    for (const envelope of envelopes) {
      const count = schemaCounts.get(envelope.schemaId) || 0;
      schemaCounts.set(envelope.schemaId, count + 1);
    }

    // Add info about schema distribution
    for (const [schemaId, count] of schemaCounts) {
      info.push({
        schemaPath: [],
        dataPath: '',
        message: `Schema ${schemaId} appears ${count} times`,
        value: count,
        keyword: 'schema_distribution',
        type: 'info'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: info as any[]
    };
  }

  /**
   * Validate query results
   */
  async validateQueryResult(result: QueryResult<RecordEnvelope>): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    // Validate all records in the result
    for (const envelope of result.records) {
      const validation = await this.validateRecord(envelope);
      results.push(validation);
    }

    // Validate pagination metadata
    const paginationValidation = this.validatePaginationMetadata(result.pagination);
    results.push(paginationValidation);

    return this.combineValidationResults(results);
  }

  /**
   * Validate pagination metadata
   */
  private validatePaginationMetadata(pagination: any): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    // Check pagination consistency
    if (pagination.page && pagination.pageSize) {
      const expectedTotal = (pagination.page - 1) * pagination.pageSize + pagination.records.length;
      if (expectedTotal > pagination.total) {
        warnings.push({
          schemaPath: [],
          dataPath: '',
          message: `Pagination inconsistency: expected at least ${expectedTotal} records, found ${pagination.total}`,
          value: { expected: expectedTotal, actual: pagination.total },
          keyword: 'pagination_inconsistency',
          type: 'warning'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info: info as any[]
    };
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(): Promise<{
    totalRecords: number;
    validationResults: ValidationResult[];
    schemaDistribution: Record<string, number>;
    errorDistribution: Record<string, number>;
  }> {
    // This would typically query all records and analyze validation results
    // For now, return empty statistics
    return {
      totalRecords: 0,
      validationResults: [],
      schemaDistribution: {},
      errorDistribution: {}
    };
  }

  /**
   * Create a validation report
   */
  async createValidationReport(envelope: RecordEnvelope): Promise<{
    record: RecordEnvelope;
    validation: ValidationResult;
    lint: LintResult;
    timestamp: string;
    version: string;
  }> {
    const validation = await this.validateRecord(envelope);
    const lint = await this.lintEngine.validateSchema(envelope.schemaId, envelope.data, {});

    return {
      record: envelope,
      validation,
      lint,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Batch validate multiple records
   */
  async batchValidate(envelopes: RecordEnvelope[]): Promise<{
    results: ValidationResult[];
    summary: {
      total: number;
      valid: number;
      invalid: number;
      errors: number;
      warnings: number;
    };
  }> {
    const results: ValidationResult[] = [];
    let errors = 0;
    let warnings = 0;

    for (const envelope of envelopes) {
      const result = await this.validateRecord(envelope);
      results.push(result);
      errors += result.errors.length;
      warnings += result.warnings.length;
    }

    return {
      results,
      summary: {
        total: envelopes.length,
        valid: envelopes.length - results.filter(r => !r.valid).length,
        invalid: results.filter(r => !r.valid).length,
        errors,
        warnings
      }
    };
  }
}

/**
 * Factory function to create validation framework
 */
export function createValidationFramework(
  schemaRegistry: SchemaRegistry,
  validator: AjvValidator,
  lintEngine: LintEngine,
  crud: BaseCrudOperations
): ValidationFramework {
  return new ValidationFramework(schemaRegistry, validator, lintEngine, crud);
}