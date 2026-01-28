import { 
  RepositoryAdapter, 
  RecordEnvelope, 
  QueryOptions, 
  QueryResult 
} from '../types/common';

/**
 * In-memory repository adapter (for testing and development)
 * Note: This is a temporary implementation. In production, this would
 * be replaced with a GitHub-based repository adapter.
 */
export class MemoryRepositoryAdapter implements RepositoryAdapter {
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
 * GitHub repository adapter (placeholder for future implementation)
 * This would interface with GitHub API to store/retrieve records
 */
export class GitHubRepositoryAdapter implements RepositoryAdapter {
  // This would be implemented with GitHub API calls
  // For now, it's a placeholder that throws an error

  async create(record: RecordEnvelope): Promise<RecordEnvelope> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async read(recordId: string): Promise<RecordEnvelope | undefined> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async update(recordId: string, data: Partial<RecordEnvelope>): Promise<RecordEnvelope | undefined> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async delete(recordId: string): Promise<boolean> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async listIds(): Promise<string[]> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async exists(recordId: string): Promise<boolean> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async count(): Promise<number> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async bulkSave(records: RecordEnvelope[]): Promise<void> {
    throw new Error('GitHub repository adapter not implemented');
  }

  async bulkDelete(recordIds: string[]): Promise<void> {
    throw new Error('GitHub repository adapter not implemented');
  }
}

/**
 * Factory function to create repository adapter
 */
export function createRepositoryAdapter(type: 'memory' | 'github' = 'memory'): RepositoryAdapter {
  switch (type) {
    case 'memory':
      return new MemoryRepositoryAdapter();
    case 'github':
      return new GitHubRepositoryAdapter();
    default:
      throw new Error(`Unknown repository adapter type: ${type}`);
  }
}

/**
 * Create memory repository adapter (default)
 */
export function createMemoryRepositoryAdapter(): RepositoryAdapter {
  return new MemoryRepositoryAdapter();
}

/**
 * Create GitHub repository adapter
 */
export function createGitHubRepositoryAdapter(repoUrl: string): RepositoryAdapter {
  return new GitHubRepositoryAdapter();
}