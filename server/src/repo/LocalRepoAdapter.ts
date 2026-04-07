/**
 * LocalRepoAdapter — Local filesystem implementation of RepoAdapter.
 * 
 * This adapter is primarily for testing and local development.
 * It simulates commit info since local filesystem has no git semantics.
 */

import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  RepoAdapter,
  RepoFile,
  CommitInfo,
  ListFilesOptions,
  CreateFileOptions,
  UpdateFileOptions,
  DeleteFileOptions,
  HistoryOptions,
  FileOperationResult,
  LocalRepoConfig,
} from './types.js';

/**
 * Generate a deterministic SHA for content.
 */
function generateSha(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 40);
}

/**
 * Generate a timestamp for commit info.
 */
function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Check if a filename matches a glob pattern.
 * Supports simple patterns: *.yaml, *.json, etc.
 */
function matchesPattern(filename: string, pattern: string): boolean {
  if (!pattern) return true;
  
  // Simple glob matching
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // .yaml
    return filename.endsWith(ext);
  }
  
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return filename.startsWith(prefix);
  }
  
  return filename === pattern;
}

/**
 * Local filesystem implementation of RepoAdapter.
 */
export class LocalRepoAdapter implements RepoAdapter {
  private readonly basePath: string;
  private readonly author: string;
  private readonly email: string;
  
  constructor(config: LocalRepoConfig) {
    this.basePath = config.basePath;
    this.author = 'local-adapter';
    this.email = 'local@localhost';
  }

  /**
   * Initialize the adapter by ensuring the base directory exists.
   */
  async initialize(): Promise<void> {
    await mkdir(this.basePath, { recursive: true }).catch(() => {
      // Directory already exists, ignore error
    });
  }

  /**
   * Resolve a path relative to the base directory.
   */
  private resolvePath(path: string): string {
    return join(this.basePath, path);
  }
  
  /**
   * Get a file from the local filesystem.
   */
  async getFile(path: string): Promise<RepoFile | null> {
    const fullPath = this.resolvePath(path);
    
    try {
      const content = await readFile(fullPath, 'utf-8');
      const stats = await stat(fullPath);
      
      return {
        path,
        content,
        sha: generateSha(content),
        size: stats.size,
        encoding: 'utf-8',
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
  
  /**
   * Check if a file exists.
   */
  async fileExists(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);
    
    try {
      await stat(fullPath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }
  
  /**
   * List files in a directory.
   */
  async listFiles(options: ListFilesOptions): Promise<string[]> {
    const { directory, pattern, recursive = false } = options;
    const fullDir = this.resolvePath(directory);
    const results: string[] = [];
    
    try {
      await this.listFilesRecursive(fullDir, directory, pattern, recursive, results);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
    
    return results;
  }
  
  /**
   * Recursive helper for listing files.
   */
  private async listFilesRecursive(
    absDir: string,
    relDir: string,
    pattern: string | undefined,
    recursive: boolean,
    results: string[]
  ): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        if (recursive) {
          await this.listFilesRecursive(
            join(absDir, entry.name),
            relPath,
            pattern,
            recursive,
            results
          );
        }
      } else if (entry.isFile()) {
        if (!pattern || matchesPattern(entry.name, pattern)) {
          results.push(relPath);
        }
      }
    }
  }
  
  /**
   * Create a new file.
   */
  async createFile(options: CreateFileOptions): Promise<FileOperationResult> {
    const { path, content, message } = options;
    const fullPath = this.resolvePath(path);
    
    try {
      // Check if file already exists
      const exists = await this.fileExists(path);
      if (exists) {
        return {
          success: false,
          error: `File already exists: ${path}`,
        };
      }
      
      // Create directory if needed
      await mkdir(dirname(fullPath), { recursive: true });
      
      // Write file
      await writeFile(fullPath, content, 'utf-8');
      
      const sha = generateSha(content);
      
      return {
        success: true,
        commit: {
          sha,
          message,
          author: options.author ?? this.author,
          email: options.email ?? this.email,
          timestamp: generateTimestamp(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Update an existing file.
   */
  async updateFile(options: UpdateFileOptions): Promise<FileOperationResult> {
    const { path, content, message, sha } = options;
    const fullPath = this.resolvePath(path);
    
    try {
      // Check if file exists
      const existing = await this.getFile(path);
      if (!existing) {
        return {
          success: false,
          error: `File not found: ${path}`,
        };
      }
      
      // Verify SHA matches (optimistic locking)
      if (existing.sha !== sha) {
        return {
          success: false,
          error: `SHA mismatch: expected ${sha}, got ${existing.sha}`,
        };
      }
      
      // Write file
      await writeFile(fullPath, content, 'utf-8');
      
      const newSha = generateSha(content);
      
      return {
        success: true,
        commit: {
          sha: newSha,
          message,
          author: options.author ?? this.author,
          email: options.email ?? this.email,
          timestamp: generateTimestamp(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Delete a file.
   */
  async deleteFile(options: DeleteFileOptions): Promise<FileOperationResult> {
    const { path, message, sha } = options;
    const fullPath = this.resolvePath(path);
    
    try {
      // Check if file exists
      const existing = await this.getFile(path);
      if (!existing) {
        return {
          success: false,
          error: `File not found: ${path}`,
        };
      }
      
      // Verify SHA matches
      if (existing.sha !== sha) {
        return {
          success: false,
          error: `SHA mismatch: expected ${sha}, got ${existing.sha}`,
        };
      }
      
      // Delete file
      await unlink(fullPath);
      
      return {
        success: true,
        commit: {
          sha: generateSha(message + path), // Deterministic delete SHA
          message,
          author: this.author,
          email: this.email,
          timestamp: generateTimestamp(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Get file history.
   * Note: Local adapter has no git history, returns empty array.
   */
  async getHistory(_options: HistoryOptions): Promise<CommitInfo[]> {
    // Local filesystem has no commit history
    // Return empty array
    return [];
  }
}

/**
 * Create a new LocalRepoAdapter instance.
 */
export function createLocalRepoAdapter(config: LocalRepoConfig): LocalRepoAdapter {
  return new LocalRepoAdapter(config);
}
