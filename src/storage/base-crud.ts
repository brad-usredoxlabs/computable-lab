import { 
  RecordEnvelope, 
  QueryOptions, 
  QueryResult, 
  ValidationResult, 
  LintResult,
  CreateResult,
  ReadResult,
  UpdateResult,
  DeleteResult,
  RepositoryAdapter,
  RecordId
} from '../types/common';
import { SchemaRegistry } from '../registry/schema-registry';
import { AjvValidator } from '../validation/ajv-validator';
import { LintEngine } from '../validation/lint-engine';

/**
 * Base CRUD operations interface - envelope-first approach
 */
export interface BaseCrudOperations {
  /** Create a new record envelope */
  create(envelope: RecordEnvelope): Promise<CreateResult<RecordEnvelope>>;
  
  /** Read a record envelope by ID */
  read(recordId: RecordId): Promise<ReadResult<RecordEnvelope>>;
  
  /** Update an existing record envelope */
  update(recordId: RecordId, envelope: RecordEnvelope): Promise<UpdateResult<RecordEnvelope>>;
  
  /** Delete a record */
  delete(recordId: RecordId): Promise<DeleteResult>;
  
  /** Query record envelopes with filtering and pagination */
  query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>>;
  
  /** Validate a record envelope */
  validate(envelope: RecordEnvelope): Promise<ValidationResult>;
  
  /** Run lint validation on a record envelope */
  lint(envelope: RecordEnvelope): Promise<LintResult>;
}

/**
 * Abstract base class for CRUD operations
 * This class follows the layer boundaries rule and only orchestrates operations
 */
export abstract class BaseCrud implements BaseCrudOperations {
  protected schemaRegistry: SchemaRegistry;
  protected validator: AjvValidator;
  protected lintEngine: LintEngine;
  protected repository: RepositoryAdapter;

  constructor(
    schemaRegistry: SchemaRegistry,
    validator: AjvValidator,
    lintEngine: LintEngine,
    repository: RepositoryAdapter
  ) {
    this.schemaRegistry = schemaRegistry;
    this.validator = validator;
    this.lintEngine = lintEngine;
    this.repository = repository;
  }

  /**
   * Create a new record envelope
   */
  async create(envelope: RecordEnvelope): Promise<CreateResult<RecordEnvelope>> {
    try {
      // Validate record envelope
      const validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          envelope,
          validation,
          error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      // Save to repository
      await this.repository.create(envelope);

      // Run lint validation
      const lint = await this.lint(envelope);

      return {
        envelope,
        validation,
        ...(lint.passed === false ? { lint } : {})
      };
    } catch (error) {
      return {
        envelope,
        validation: { valid: false, errors: [], warnings: [], info: [] },
        error: `Failed to create record: ${error}`
      };
    }
  }

  /**
   * Read a record envelope by ID
   */
  async read(recordId: RecordId): Promise<ReadResult<RecordEnvelope>> {
    try {
      const envelope = await this.repository.read(recordId);
      if (!envelope) {
        return {
          found: false,
          record: undefined,
          envelope: undefined
        };
      }

      return {
        envelope,
        found: true,
        record: envelope
      };
    } catch (error) {
      return {
        found: false,
        record: undefined,
        envelope: undefined
      };
    }
  }

  /**
   * Update an existing record envelope
   */
  async update(recordId: RecordId, envelope: RecordEnvelope): Promise<UpdateResult<RecordEnvelope>> {
    try {
      // Validate record envelope
      const validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          envelope,
          updated: false,
          validation,
          error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      // Update in repository
      await this.repository.update(recordId, envelope);

      // Run lint validation
      const lint = await this.lint(envelope);

      return {
        envelope,
        updated: true,
        validation,
        ...(lint.passed === false ? { lint } : {})
      };
    } catch (error) {
      return {
        envelope,
        updated: false,
        error: `Failed to update record: ${error}`
      };
    }
  }

  /**
   * Delete a record
   */
  async delete(recordId: RecordId): Promise<DeleteResult> {
    try {
      const success = await this.repository.delete(recordId);
      return {
        deleted: success
      };
    } catch (error) {
      return {
        deleted: false,
        error: `Failed to delete record: ${error}`
      };
    }
  }

  /**
   * Query record envelopes with filtering and pagination
   */
  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    try {
      const result = await this.repository.query(options);
      return result;
    } catch (error) {
      throw new Error(`Failed to query records: ${error}`);
    }
  }

  /**
   * Validate a record envelope
   */
  async validate(envelope: RecordEnvelope): Promise<ValidationResult> {
    const schema = this.schemaRegistry.get(envelope.schemaId);
    if (!schema) {
      return {
        valid: false,
        errors: [{
          schemaPath: [],
          dataPath: [],
          message: `Schema not found: ${envelope.schemaId}`,
          value: undefined,
          keyword: 'missing'
        }],
        warnings: [],
        info: []
      };
    }

    return this.validator.validate(envelope.data, schema);
  }

  /**
   * Run lint validation on a record envelope
   */
  async lint(envelope: RecordEnvelope): Promise<LintResult> {
    return this.lintEngine.validateSchema(envelope.schemaId, envelope.data, {});
  }
}

/**
 * Factory function to create a CRUD service
 */
export function createCrudService(
  schemaRegistry: SchemaRegistry,
  validator: AjvValidator,
  lintEngine: LintEngine,
  repository: RepositoryAdapter
): BaseCrudOperations {
  return new class extends BaseCrud {
    constructor() {
      super(schemaRegistry, validator, lintEngine, repository);
    }
  }();
}

/**
 * Helper functions for ergonomic data-only operations
 */
export class CrudHelpers {
  /**
   * Create a record envelope from data and metadata
   */
  static createEnvelope(
    schemaId: string,
    recordId: RecordId,
    data: unknown,
    meta?: Record<string, any>
  ): RecordEnvelope {
    return {
      recordId,
      schemaId,
      data,
      meta
    };
  }

  /**
   * Create a new record with data and explicit metadata
   */
  static async create(
    schemaId: string,
    recordId: RecordId,
    data: unknown,
    meta: Record<string, any>,
    crud: BaseCrudOperations
  ): Promise<CreateResult<RecordEnvelope>> {
    const envelope = this.createEnvelope(schemaId, recordId, data, meta);
    return crud.create(envelope);
  }

  /**
   * Update a record with new data and explicit metadata
   */
  static async update(
    recordId: RecordId,
    schemaId: string,
    data: unknown,
    meta: Record<string, any>,
    crud: BaseCrudOperations
  ): Promise<UpdateResult<RecordEnvelope>> {
    const envelope = this.createEnvelope(schemaId, recordId, data, meta);
    return crud.update(recordId, envelope);
  }
}