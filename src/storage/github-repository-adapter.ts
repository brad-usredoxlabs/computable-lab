import { RepositoryAdapter, RecordEnvelope, QueryOptions, QueryResult } from '../types/common';
import { GitHubRepository } from '../github/github-repository';
import { createGitHubRepository } from '../github/github-repository';

/**
 * GitHub-backed repository adapter for storing records as YAML files
 */
export class GitHubRepositoryAdapter implements RepositoryAdapter {
  private githubRepo: GitHubRepository;
  private owner: string;
  private repo: string;

  constructor(owner: string, repo: string, githubRepo?: GitHubRepository) {
    this.owner = owner;
    this.repo = repo;
    this.githubRepo = githubRepo || createGitHubRepository('', owner, repo);
  }

  /**
   * Create a new record
   */
  async create(record: RecordEnvelope): Promise<RecordEnvelope> {
    const path = this.getRecordPath(record.recordId);
    const content = this.serializeRecord(record);
    
    await this.githubRepo.writeFile(path, content, `Create record ${record.recordId}`, {
      name: 'System',
      email: 'system@computable-lab.local'
    });

    return record;
  }

  /**
   * Read a record by ID
   */
  async read(recordId: string): Promise<RecordEnvelope | undefined> {
    const path = this.getRecordPath(recordId);
    
    try {
      const content = await this.githubRepo.readFile(path);
      return this.deserializeRecord(content);
    } catch (error) {
      // File not found is not an error
      if (error instanceof Error && error.message.includes('404')) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Update an existing record
   */
  async update(recordId: string, data: Partial<RecordEnvelope>): Promise<RecordEnvelope | undefined> {
    const existing = await this.read(recordId);
    if (!existing) {
      return undefined;
    }

    const updated = { ...existing, ...data };
    const path = this.getRecordPath(recordId);
    const content = this.serializeRecord(updated);
    
    await this.githubRepo.writeFile(path, content, `Update record ${recordId}`, {
      name: 'System',
      email: 'system@computable-lab.local'
    });

    return updated;
  }

  /**
   * Delete a record
   */
  async delete(recordId: string): Promise<boolean> {
    const path = this.getRecordPath(recordId);
    
    try {
      await this.githubRepo.deleteFile(path, `Delete record ${recordId}`, {
        name: 'System',
        email: 'system@computable-lab.local'
      });
      return true;
    } catch (error) {
      // File not found is not an error
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all record IDs
   */
  async listIds(): Promise<string[]> {
    const path = 'records/';
    const files = await this.githubRepo.listFiles(path);
    
    return files
      .filter(file => file.name.endsWith('.yaml') || file.name.endsWith('.yml'))
      .map(file => file.name.replace(/\.(yaml|yml)$/, ''));
  }

  /**
   * Check if a record exists
   */
  async exists(recordId: string): Promise<boolean> {
    const path = this.getRecordPath(recordId);
    
    try {
      await this.githubRepo.readFile(path);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Count total records
   */
  async count(): Promise<number> {
    const ids = await this.listIds();
    return ids.length;
  }

  /**
   * Query records with filtering and pagination
   */
  async query(options?: QueryOptions): Promise<QueryResult<RecordEnvelope>> {
    const allRecords = await this.getAllRecords();
    let filtered = [...allRecords];

    // Apply filters
    if (options?.filter) {
      filtered = filtered.filter(record => this.matchesFilter(record, options.filter!));
    }

    // Apply sorting
    if (options?.sort) {
      filtered.sort((a, b) => {
        for (const sort of options.sort!) {
          const aValue = this.getNestedValue(a.data, sort.field);
          const bValue = this.getNestedValue(b.data, sort.field);
          
          if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    // Apply pagination
    let paginated = filtered;
    if (options?.pagination) {
      const { page, pageSize } = options.pagination;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      paginated = filtered.slice(start, end);
    }

    // Apply field selection
    if (options?.fields) {
      paginated = paginated.map(record => this.selectFields(record, options.fields!));
    }

    const pagination = options?.pagination ? {
      page: options.pagination.page,
      pageSize: options.pagination.pageSize,
      totalPages: Math.ceil(filtered.length / options.pagination.pageSize),
      hasNext: options.pagination.page * options.pagination.pageSize < filtered.length,
      hasPrev: options.pagination.page > 1
    } : undefined;

    return {
      records: paginated,
      total: filtered.length,
      pagination
    };
  }

  /**
   * Bulk save records
   */
  async bulkSave(records: RecordEnvelope[]): Promise<void> {
    const operations = records.map(record => 
      this.create(record).catch(error => {
        if (error instanceof Error && error.message.includes('already exists')) {
          return this.update(record.recordId, record);
        }
        throw error;
      })
    );

    await Promise.all(operations);
  }

  /**
   * Bulk delete records
   */
  async bulkDelete(recordIds: string[]): Promise<void> {
    const operations = recordIds.map(recordId => 
      this.delete(recordId).catch(error => {
        // Ignore errors for non-existent records
        if (error instanceof Error && error.message.includes('404')) {
          return;
        }
        throw error;
      })
    );

    await Promise.all(operations);
  }

  /**
   * Get the file path for a record
   */
  private getRecordPath(recordId: string): string {
    return `records/${recordId}.yaml`;
  }

  /**
   * Serialize a record to YAML
   */
  private serializeRecord(record: RecordEnvelope): string {
    return `# Record: ${record.recordId}
# Schema: ${record.schemaId}
# Created: ${record.meta?.createdAt || new Date().toISOString()}
# Updated: ${new Date().toISOString()}

${JSON.stringify(record.data, null, 2)}`;
  }

  /**
   * Deserialize YAML to a record
   */
  private deserializeRecord(content: string): RecordEnvelope {
    const lines = content.split('\n');
    const metadata: Record<string, string> = {};
    
    // Parse metadata
    for (const line of lines) {
      if (line.startsWith('# ') && line.includes(':')) {
        const [key, value] = line.substring(2).split(':');
        if (key && value) {
          metadata[key.trim().toLowerCase().replace(/\s+/g, '-')] = value.trim();
        }
      }
    }

    // Find the JSON data (skip metadata and empty lines)
    const jsonStart = lines.findIndex(line => line.trim() && !line.startsWith('#'));
    const jsonData = lines.slice(jsonStart).join('\n');
    
    const data = JSON.parse(jsonData);
    
    return {
      recordId: metadata['record'] || 'unknown',
      schemaId: metadata['schema'] || 'unknown',
      data,
      meta: {
        createdAt: metadata['created'],
        updatedAt: metadata['updated'],
        createdBy: metadata['created-by'] || 'system'
      }
    };
  }

  /**
   * Get all records from the repository
   */
  private async getAllRecords(): Promise<RecordEnvelope[]> {
    const ids = await this.listIds();
    const records = await Promise.all(
      ids.map(id => this.read(id).catch(() => undefined))
    );
    
    return records.filter((record): record is RecordEnvelope => record !== undefined);
  }

  /**
   * Check if a record matches filter criteria
   */
  private matchesFilter(record: RecordEnvelope, filter: Record<string, any>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      const recordValue = this.getNestedValue(record.data, key);
      return recordValue === value;
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Select specific fields from a record
   */
  private selectFields(record: RecordEnvelope, fields: { include?: string[]; exclude?: string[] }): RecordEnvelope {
    if (fields.include) {
      const result: any = {};
      fields.include.forEach(field => {
        const value = this.getNestedValue(record.data, field);
        if (value !== undefined) {
          this.setNestedValue(result, field, value);
        }
      });
      return { ...record, data: result };
    }

    if (fields.exclude) {
      const result = { ...record.data };
      fields.exclude.forEach(field => {
        this.setNestedValue(result, field, undefined);
      });
      return { ...record, data: result };
    }

    return record;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}

/**
 * Factory function to create GitHub repository adapter
 */
export function createGitHubRepositoryAdapter(owner: string, repo: string, githubRepo?: GitHubRepository): GitHubRepositoryAdapter {
  return new GitHubRepositoryAdapter(owner, repo, githubRepo);
}