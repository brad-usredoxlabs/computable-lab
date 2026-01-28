import { 
  RepositoryAdapter, 
  RecordEnvelope, 
  QueryOptions, 
  QueryResult 
} from '../types/common';

/**
 * Repository interface for data persistence
 * This is a generic interface that can be implemented by different adapters
 */
export interface Repository {
  /** Create a new record */
  create(record: RecordEnvelope): Promise<RecordEnvelope>;
  
  /** Read a record by ID */
  read(recordId: string): Promise<RecordEnvelope | undefined>;
  
  /** Update an existing record */
  update(recordId: string, data: Partial<RecordEnvelope>): Promise<RecordEnvelope | undefined>;
  
  /** Delete a record */
  delete(recordId: string): Promise<boolean>;
  
  /** List all record IDs */
  listIds(): Promise<string[]>;
  
  /** Check if record exists */
  exists(recordId: string): Promise<boolean>;
  
  /** Count total records */
  count(): Promise<number>;
  
  /** Query records with filtering and pagination */
  query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>>;
  
  /** Bulk save records */
  bulkSave(records: RecordEnvelope[]): Promise<void>;
  
  /** Bulk delete records */
  bulkDelete(recordIds: string[]): Promise<void>;
}

/**
 * In-memory repository implementation (for testing and development)
 */
export class InMemoryRepository implements Repository {
  private records = new Map<string, RecordEnvelope>();

  async create(record: RecordEnvelope): Promise<RecordEnvelope> {
    this.records.set(record.recordId, record);
    return record;
  }

  async read(recordId: string): Promise<RecordEnvelope | undefined> {
    return this.records.get(recordId);
  }

  async update(recordId: string, data: Partial<RecordEnvelope>): Promise<RecordEnvelope | undefined> {
    const existing = this.records.get(recordId);
    if (!existing) {
      return undefined;
    }

    const updated: RecordEnvelope = {
      ...existing,
      ...data
    };

    // Handle meta property properly (section 7.2 compliance)
    if (data.meta !== undefined) {
      updated.meta = {
        ...existing.meta,
        ...data.meta
      };
      // Add updatedAt if not provided
      if (!updated.meta.updatedAt) {
        updated.meta.updatedAt = new Date().toISOString();
      }
    }

    this.records.set(recordId, updated);
    return updated;
  }

  async delete(recordId: string): Promise<boolean> {
    return this.records.delete(recordId);
  }

  async listIds(): Promise<string[]> {
    return Array.from(this.records.keys());
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    let records = Array.from(this.records.values());

    // Apply filters
    if (options?.filter) {
      records = records.filter(record => {
        for (const [key, value] of Object.entries(options.filter!)) {
          const recordValue = (record as any)[key];
          if (recordValue !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Apply sorting
    if (options?.sort) {
      records.sort((a, b) => {
        for (const sort of options.sort!) {
          const aValue = (a as any)[sort.field];
          const bValue = (b as any)[sort.field];
          const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          if (comparison !== 0) {
            return sort.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    }

    // Apply pagination
    let paginatedRecords = records;
    let pagination: QueryResult<RecordEnvelope>['pagination'];
    
    if (options?.pagination) {
      const { page, pageSize } = options.pagination;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      paginatedRecords = records.slice(start, end);

      pagination = {
        page,
        pageSize,
        totalPages: Math.ceil(records.length / pageSize),
        hasNext: page * pageSize < records.length,
        hasPrev: page > 1
      };
    }

    const result: QueryResult<RecordEnvelope> = {
      records: paginatedRecords,
      total: records.length
    };

    if (pagination) {
      result.pagination = pagination;
    }

    return result;
  }

  async bulkSave(records: RecordEnvelope[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.recordId, record);
    }
  }

  async bulkDelete(recordIds: string[]): Promise<void> {
    for (const recordId of recordIds) {
      this.records.delete(recordId);
    }
  }

  /**
   * Get all records (for testing)
   */
  async getAll(): Promise<RecordEnvelope[]> {
    return Array.from(this.records.values());
  }

  /**
   * Clear all records (for testing)
   */
  async clear(): Promise<void> {
    this.records.clear();
  }
}

/**
 * GitHub repository interface (placeholder for future implementation)
 */
export interface GitHubRepository extends Repository {
  /** Repository URL */
  readonly repoUrl: string;
  
  /** Branch name */
  readonly branch: string;
  
  /** GitHub authentication token */
  readonly token?: string;
}

/**
 * GitHub repository implementation (placeholder)
 */
export class GitHubRepositoryImpl implements GitHubRepository {
  constructor(
    public readonly repoUrl: string,
    public readonly branch: string,
    public readonly token?: string
  ) {
    // This would be implemented with GitHub API calls
    // For now, it's a placeholder that throws an error
  }

  async create(record: RecordEnvelope): Promise<RecordEnvelope> {
    throw new Error('GitHub repository not implemented');
  }

  async read(recordId: string): Promise<RecordEnvelope | undefined> {
    throw new Error('GitHub repository not implemented');
  }

  async update(recordId: string, data: Partial<RecordEnvelope>): Promise<RecordEnvelope | undefined> {
    throw new Error('GitHub repository not implemented');
  }

  async delete(recordId: string): Promise<boolean> {
    throw new Error('GitHub repository not implemented');
  }

  async listIds(): Promise<string[]> {
    throw new Error('GitHub repository not implemented');
  }

  async exists(recordId: string): Promise<boolean> {
    throw new Error('GitHub repository not implemented');
  }

  async count(): Promise<number> {
    throw new Error('GitHub repository not implemented');
  }

  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    throw new Error('GitHub repository not implemented');
  }

  async bulkSave(records: RecordEnvelope[]): Promise<void> {
    throw new Error('GitHub repository not implemented');
  }

  async bulkDelete(recordIds: string[]): Promise<void> {
    throw new Error('GitHub repository not implemented');
  }
}

/**
 * Factory function to create repository
 */
export function createRepository(type: 'memory' | 'github', options?: {
  repoUrl?: string;
  branch?: string;
  token?: string;
}): Repository {
  switch (type) {
    case 'memory':
      return new InMemoryRepository();
    case 'github':
      if (!options?.repoUrl || !options?.branch) {
        throw new Error('GitHub repository requires repoUrl and branch options');
      }
      return new GitHubRepositoryImpl(options.repoUrl, options.branch, options.token);
    default:
      throw new Error(`Unknown repository type: ${type}`);
  }
}

/**
 * Create in-memory repository (default)
 */
export function createMemoryRepository(): Repository {
  return new InMemoryRepository();
}

/**
 * Create GitHub repository
 */
export function createGitHubRepository(repoUrl: string, branch: string, token?: string): Repository {
  return new GitHubRepositoryImpl(repoUrl, branch, token);
}