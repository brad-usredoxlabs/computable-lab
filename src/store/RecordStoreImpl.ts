/**
 * RecordStoreImpl — Implementation of RecordStore.
 * 
 * This class orchestrates:
 * - YAML parsing/serialization (via RecordParser)
 * - Schema validation (via AjvValidator)
 * - Lint validation (via LintEngine)
 * - File operations (via RepoAdapter)
 * 
 * It has NO schema-specific logic. All domain rules live in specs.
 */

import type { ValidationResult, LintResult } from '../types/common.js';
import type { RecordEnvelope, RecordMeta } from '../types/RecordEnvelope.js';
import type { RepoAdapter } from '../repo/types.js';
import type { AjvValidator } from '../validation/AjvValidator.js';
import type { LintEngine } from '../lint/LintEngine.js';
import type {
  RecordStore,
  RecordStoreConfig,
  StoreResult,
  RecordFilter,
  CreateRecordOptions,
  UpdateRecordOptions,
  DeleteRecordOptions,
  GetRecordOptions,
} from './types.js';
import {
  parseRecord,
  serializeRecord,
} from './RecordParser.js';
import {
  generatePath,
  parseRecordPath,
} from '../repo/PathConvention.js';

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: Required<RecordStoreConfig> = {
  baseDir: 'records',
  author: 'record-store',
  email: 'store@computable-lab.com',
};

/**
 * RecordStoreImpl — Full implementation of RecordStore.
 */
export class RecordStoreImpl implements RecordStore {
  private readonly config: Required<RecordStoreConfig>;
  private readonly repo: RepoAdapter;
  private readonly validator: AjvValidator;
  private readonly lintEngine: LintEngine;
  
  // Cache: recordId -> { path, sha }
  private readonly pathCache: Map<string, { path: string; sha: string }> = new Map();
  
  constructor(
    repo: RepoAdapter,
    validator: AjvValidator,
    lintEngine: LintEngine,
    config: RecordStoreConfig = {}
  ) {
    this.repo = repo;
    this.validator = validator;
    this.lintEngine = lintEngine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Find the file path for a record by ID.
   * Searches the records directory for a matching file.
   */
  private async findRecordPath(recordId: string): Promise<{ path: string; sha: string } | null> {
    // Check cache first
    const cached = this.pathCache.get(recordId);
    if (cached) {
      // Verify file still exists
      const exists = await this.repo.fileExists(cached.path);
      if (exists) {
        return cached;
      }
      this.pathCache.delete(recordId);
    }
    
    // Search for the file
    const files = await this.repo.listFiles({
      directory: this.config.baseDir,
      pattern: '*.yaml',
      recursive: true,
    });
    
    for (const filePath of files) {
      const parsed = parseRecordPath(filePath);
      if (parsed?.recordId === recordId) {
        const file = await this.repo.getFile(filePath);
        if (file) {
          const entry = { path: filePath, sha: file.sha };
          this.pathCache.set(recordId, entry);
          return entry;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get a record by ID.
   */
  async get(recordId: string): Promise<RecordEnvelope | null> {
    const entry = await this.findRecordPath(recordId);
    if (!entry) {
      return null;
    }
    
    const file = await this.repo.getFile(entry.path);
    if (!file) {
      return null;
    }
    
    const result = parseRecord(file.content, entry.path);
    if (!result.success || !result.envelope) {
      return null;
    }
    
    // Add meta info
    return {
      ...result.envelope,
      meta: {
        ...result.envelope.meta,
        path: entry.path,
        commitSha: file.sha,
      },
    };
  }
  
  /**
   * Get a record with validation/lint results.
   */
  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = await this.get(options.recordId);
    
    if (!envelope) {
      return {
        success: false,
        error: `Record not found: ${options.recordId}`,
      };
    }
    
    const result: StoreResult = {
      success: true,
      envelope,
    };
    
    if (options.validate) {
      result.validation = await this.validate(envelope);
    }
    
    if (options.lint) {
      result.lint = await this.lint(envelope);
    }
    
    return result;
  }
  
  /**
   * List records.
   */
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    // Determine search directory
    const searchDir = filter?.kind 
      ? `${this.config.baseDir}/${filter.kind}`
      : this.config.baseDir;
    
    const files = await this.repo.listFiles({
      directory: searchDir,
      pattern: '*.yaml',
      recursive: !filter?.kind, // Recursive only if no kind filter
    });
    
    const envelopes: RecordEnvelope[] = [];
    
    for (const filePath of files) {
      // Apply prefix filter if specified
      if (filter?.idPrefix) {
        const parsed = parseRecordPath(filePath);
        if (!parsed?.recordId.startsWith(filter.idPrefix)) {
          continue;
        }
      }
      
      const file = await this.repo.getFile(filePath);
      if (!file) continue;
      
      const result = parseRecord(file.content, filePath);
      if (!result.success || !result.envelope) continue;
      
      // Apply schema filter if specified
      if (filter?.schemaId && result.envelope.schemaId !== filter.schemaId) {
        continue;
      }
      
      envelopes.push({
        ...result.envelope,
        meta: {
          ...result.envelope.meta,
          path: filePath,
          commitSha: file.sha,
        },
      });
      
      // Apply offset
      if (filter?.offset && envelopes.length <= filter.offset) {
        envelopes.shift();
        continue;
      }
      
      // Apply limit
      if (filter?.limit && envelopes.length >= filter.limit) {
        break;
      }
    }
    
    return envelopes;
  }
  
  /**
   * Create a new record.
   */
  async create(options: CreateRecordOptions): Promise<StoreResult> {
    const { envelope, message, skipValidation, skipLint } = options;
    
    // Check if record already exists
    const existing = await this.findRecordPath(envelope.recordId);
    if (existing) {
      return {
        success: false,
        error: `Record already exists: ${envelope.recordId}`,
      };
    }
    
    // Validate if not skipped
    let validation: ValidationResult | undefined;
    if (!skipValidation) {
      validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          success: false,
          validation,
          error: 'Validation failed',
        };
      }
    }
    
    // Lint if not skipped
    let lint: LintResult | undefined;
    if (!skipLint) {
      lint = await this.lint(envelope);
      if (!lint.valid) {
        return {
          success: false,
          lint,
          error: 'Lint failed with errors',
        };
      }
    }
    
    // Extract kind from payload
    const payload = envelope.payload as Record<string, unknown>;
    const kind = payload.kind as string || envelope.meta?.kind || 'unknown';
    const title = payload.title as string || payload.name as string || '';
    
    // Generate path
    const path = generatePath({
      recordId: envelope.recordId,
      kind,
      slug: title,
      baseDir: this.config.baseDir,
    });
    
    // Serialize to YAML
    const content = serializeRecord(envelope);
    
    // Create file
    const commitMessage = message || `Create ${envelope.recordId}`;
    const result = await this.repo.createFile({
      path,
      content,
      message: commitMessage,
      author: this.config.author,
      email: this.config.email,
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create file',
      };
    }
    
    // Update cache
    if (result.commit) {
      this.pathCache.set(envelope.recordId, { path, sha: result.commit.sha });
    }
    
    // Build meta without undefined values
    const newMeta: RecordMeta = {
      ...envelope.meta,
      path,
      ...(result.commit?.sha !== undefined ? { commitSha: result.commit.sha } : {}),
    };
    
    return {
      success: true,
      envelope: {
        ...envelope,
        meta: newMeta,
      },
      ...(validation !== undefined ? { validation } : {}),
      ...(lint !== undefined ? { lint } : {}),
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
    };
  }
  
  /**
   * Update an existing record.
   */
  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    const { envelope, expectedSha, message, skipValidation, skipLint } = options;
    
    // Find existing record
    const existing = await this.findRecordPath(envelope.recordId);
    if (!existing) {
      return {
        success: false,
        error: `Record not found: ${envelope.recordId}`,
      };
    }
    
    // Get current file to verify SHA
    const file = await this.repo.getFile(existing.path);
    if (!file) {
      return {
        success: false,
        error: `File not found: ${existing.path}`,
      };
    }
    
    // Check expected SHA if provided
    const sha = expectedSha || file.sha;
    if (expectedSha && file.sha !== expectedSha) {
      return {
        success: false,
        error: `SHA mismatch: expected ${expectedSha}, got ${file.sha}`,
      };
    }
    
    // Validate if not skipped
    let validation: ValidationResult | undefined;
    if (!skipValidation) {
      validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          success: false,
          validation,
          error: 'Validation failed',
        };
      }
    }
    
    // Lint if not skipped
    let lint: LintResult | undefined;
    if (!skipLint) {
      lint = await this.lint(envelope);
      if (!lint.valid) {
        return {
          success: false,
          lint,
          error: 'Lint failed with errors',
        };
      }
    }
    
    // Serialize to YAML
    const content = serializeRecord(envelope);
    
    // Update file
    const commitMessage = message || `Update ${envelope.recordId}`;
    const result = await this.repo.updateFile({
      path: existing.path,
      content,
      message: commitMessage,
      sha,
      author: this.config.author,
      email: this.config.email,
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to update file',
      };
    }
    
    // Update cache
    if (result.commit) {
      this.pathCache.set(envelope.recordId, { path: existing.path, sha: result.commit.sha });
    }
    
    // Build meta without undefined values
    const updatedMeta: RecordMeta = {
      ...envelope.meta,
      path: existing.path,
      ...(result.commit?.sha !== undefined ? { commitSha: result.commit.sha } : {}),
    };
    
    return {
      success: true,
      envelope: {
        ...envelope,
        meta: updatedMeta,
      },
      ...(validation !== undefined ? { validation } : {}),
      ...(lint !== undefined ? { lint } : {}),
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
    };
  }
  
  /**
   * Delete a record.
   */
  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    const { recordId, expectedSha, message } = options;
    
    // Find existing record
    const existing = await this.findRecordPath(recordId);
    if (!existing) {
      return {
        success: false,
        error: `Record not found: ${recordId}`,
      };
    }
    
    // Get current file to verify SHA
    const file = await this.repo.getFile(existing.path);
    if (!file) {
      return {
        success: false,
        error: `File not found: ${existing.path}`,
      };
    }
    
    // Check expected SHA if provided
    const sha = expectedSha || file.sha;
    if (expectedSha && file.sha !== expectedSha) {
      return {
        success: false,
        error: `SHA mismatch: expected ${expectedSha}, got ${file.sha}`,
      };
    }
    
    // Delete file
    const commitMessage = message || `Delete ${recordId}`;
    const result = await this.repo.deleteFile({
      path: existing.path,
      sha,
      message: commitMessage,
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to delete file',
      };
    }
    
    // Remove from cache
    this.pathCache.delete(recordId);
    
    return {
      success: true,
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
    };
  }
  
  /**
   * Validate a record against its schema.
   */
  async validate(envelope: RecordEnvelope): Promise<ValidationResult> {
    // Check if schema is loaded
    if (!this.validator.hasSchema(envelope.schemaId)) {
      return {
        valid: false,
        errors: [{
          path: '/',
          message: `Schema not found: ${envelope.schemaId}`,
          keyword: 'schema',
        }],
      };
    }
    
    return this.validator.validate(envelope.payload, envelope.schemaId);
  }
  
  /**
   * Lint a record against rules.
   */
  async lint(envelope: RecordEnvelope): Promise<LintResult> {
    return this.lintEngine.lint(envelope.payload, envelope.schemaId);
  }
  
  /**
   * Check if a record exists.
   */
  async exists(recordId: string): Promise<boolean> {
    const entry = await this.findRecordPath(recordId);
    return entry !== null;
  }
  
  /**
   * Clear the path cache.
   */
  clearCache(): void {
    this.pathCache.clear();
  }
}

/**
 * Create a new RecordStore instance.
 */
export function createRecordStore(
  repo: RepoAdapter,
  validator: AjvValidator,
  lintEngine: LintEngine,
  config?: RecordStoreConfig
): RecordStoreImpl {
  return new RecordStoreImpl(repo, validator, lintEngine, config);
}
