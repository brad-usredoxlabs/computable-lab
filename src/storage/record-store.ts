import { 
  RecordEnvelope, 
  RecordStore, 
  ValidationResult, 
  LintResult, 
  QueryOptions, 
  QueryResult,
  SchemaRegistry,
  Validator,
  LintEngine,
  RepositoryAdapter
} from '../types/common';
import { createAjvValidator } from '../validation/ajv-validator';
import { createLintEngine } from '../validation/lint-engine';
import { createSchemaRegistry } from '../registry/schema-registry';
import { createRepositoryAdapter, createGitHubRepositoryAdapter, createMemoryRepositoryAdapter } from './repository-adapter';

/**
 * Record Store - Centralized record management that composes:
 * - RepositoryAdapter (GitHub authority)
 * - SchemaRegistry (Schema management)
 * - AjvValidator (Schema validation)
 * - LintEngine (Business rule validation)
 */
export class RecordStoreImpl implements RecordStore {
  private schemaRegistry: SchemaRegistry;
  private validator: Validator;
  private lintEngine: LintEngine;
  private repository: RepositoryAdapter;

  constructor(repository?: RepositoryAdapter) {
    this.schemaRegistry = createSchemaRegistry();
    this.validator = createAjvValidator();
    this.lintEngine = createLintEngine(this.schemaRegistry);
    this.repository = repository || createRepositoryAdapter();
  }

  /**
   * Create a new record
   */
  async create(schemaId: string, data: unknown): Promise<{
    record: RecordEnvelope;
    validation: ValidationResult;
    lint?: LintResult;
  }> {
    // Validate schema exists
    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      throw new Error(`Schema ${schemaId} not found`);
    }

    // Create record envelope
    const record: RecordEnvelope = {
      recordId: this.generateRecordId(),
      schemaId,
      data,
      meta: {
        createdAt: new Date().toISOString(),
        createdBy: 'system' // Would be user context in real implementation
      }
    };

    // Validate against schema
    const validation = this.validator.validate(data, schema);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Run lint validation
    const lint = await this.lintEngine.validateSchema(schemaId, data, {});

    // Save to repository
    await this.repository.create(record);

    // Only include lint if there are violations (section 7.2 compliance)
    const result: {
      record: RecordEnvelope;
      validation: ValidationResult;
      lint?: LintResult;
    } = {
      record,
      validation
    };

    if (!lint.valid) {
      result.lint = {
        passed: lint.valid,
        errors: lint.violations,
        warnings: lint.warnings,
        info: lint.info,
        executionTime: 0
      };
    }

    return result;
  }

  /**
   * Read a record by ID
   */
  async read(recordId: string): Promise<RecordEnvelope | undefined> {
    return await this.repository.read(recordId);
  }

  /**
   * Update an existing record
   */
  async update(recordId: string, data: unknown): Promise<{
    record: RecordEnvelope;
    validation: ValidationResult;
    lint?: LintResult;
  }> {
    // Read existing record
    const existing = await this.repository.read(recordId);
    if (!existing) {
      throw new Error(`Record ${recordId} not found`);
    }

    // Validate schema exists
    const schema = this.schemaRegistry.get(existing.schemaId);
    if (!schema) {
      throw new Error(`Schema ${existing.schemaId} not found`);
    }

    // Create updated record envelope
    const updated: RecordEnvelope = {
      ...existing,
      data,
      meta: {
        ...existing.meta,
        updatedAt: new Date().toISOString()
      }
    };

    // Validate against schema
    const validation = this.validator.validate(data, schema);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Run lint validation
    const lint = await this.lintEngine.validateSchema(existing.schemaId, data, {});

    // Update in repository
    await this.repository.update(recordId, updated);

    // Only include lint if there are violations (section 7.2 compliance)
    const result: {
      record: RecordEnvelope;
      validation: ValidationResult;
      lint?: LintResult;
    } = {
      record: updated,
      validation
    };

    if (!lint.valid) {
      result.lint = {
        passed: lint.valid,
        errors: lint.violations,
        warnings: lint.warnings,
        info: lint.info,
        executionTime: 0
      };
    }

    return result;
  }

  /**
   * Delete a record
   */
  async delete(recordId: string): Promise<boolean> {
    return await this.repository.delete(recordId);
  }

  /**
   * Query records
   */
  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    return await this.repository.query(options);
  }

  /**
   * Get record statistics
   */
  async getStats(): Promise<{
    total: number;
    bySchema: Record<string, number>;
    oldest?: Date;
    newest?: Date;
  }> {
    const allRecords = await this.repository.getAll();
    const bySchema: Record<string, number> = {};
    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const record of allRecords) {
      // Count by schema
      bySchema[record.schemaId] = (bySchema[record.schemaId] || 0) + 1;

      // Track dates
      if (record.meta?.createdAt) {
        const date = new Date(record.meta.createdAt);
        if (!oldest || date < oldest) oldest = date;
        if (!newest || date > newest) newest = date;
      }
    }

    const result: {
      total: number;
      bySchema: Record<string, number>;
      oldest?: Date;
      newest?: Date;
    } = {
      total: allRecords.length,
      bySchema
    };

    if (oldest) result.oldest = oldest;
    if (newest) result.newest = newest;

    return result;
  }

  /**
   * Get all records (for testing/development)
   */
  async getAll(): Promise<RecordEnvelope[]> {
    return await this.repository.getAll();
  }

  /**
   * Check if record exists
   */
  async exists(recordId: string): Promise<boolean> {
    return await this.repository.exists(recordId);
  }

  /**
   * Count total records
   */
  async count(): Promise<number> {
    return await this.repository.count();
  }

  /**
   * Clear all records (for testing/development)
   */
  async clear(): Promise<void> {
    const allIds = await this.repository.listIds();
    await this.repository.bulkDelete(allIds);
  }

  /**
   * Generate a unique record ID
   */
  private generateRecordId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get schema registry (for external use)
   */
  getSchemaRegistry(): SchemaRegistry {
    return this.schemaRegistry;
  }

  /**
   * Get lint engine (for external use)
   */
  getLintEngine(): LintEngine {
    return this.lintEngine;
  }

  /**
   * Get repository adapter (for external use)
   */
  getRepository(): RepositoryAdapter {
    return this.repository;
  }
}

/**
 * Factory function to create record store
 */
export function createRecordStore(repository?: RepositoryAdapter): RecordStore {
  return new RecordStoreImpl(repository);
}

/**
 * Create record store with GitHub repository adapter
 */
export function createGitHubRecordStore(repoUrl: string): RecordStore {
  const repository = createGitHubRepositoryAdapter(repoUrl);
  return createRecordStore(repository);
}

/**
 * Create record store with in-memory repository adapter (for testing)
 */
export function createMemoryRecordStore(): RecordStore {
  const repository = createMemoryRepositoryAdapter();
  return createRecordStore(repository);
}