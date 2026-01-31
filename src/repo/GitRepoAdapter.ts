/**
 * GitRepoAdapter — Git-based implementation of RepoAdapter.
 * 
 * Uses simple-git to manage a cloned repository workspace.
 * Supports clone, pull, commit, and push operations.
 */

import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import simpleGit, { SimpleGit } from 'simple-git';
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
} from './types.js';
import type {
  RepositoryConfig,
  SyncResult,
  GitStatus,
  WorkspaceStatus,
} from '../config/types.js';

/**
 * Configuration for GitRepoAdapter.
 */
export interface GitRepoAdapterConfig {
  /** Repository configuration */
  repoConfig: RepositoryConfig;
  /** Workspace path (where repo is cloned) */
  workspacePath: string;
  /** Author name for commits */
  authorName?: string;
  /** Author email for commits */
  authorEmail?: string;
}

/**
 * File change for atomic commits.
 */
export interface FileChange {
  path: string;
  content?: string;
  operation: 'create' | 'update' | 'delete';
}

/**
 * Git-based repository adapter.
 */
export class GitRepoAdapter implements RepoAdapter {
  private readonly config: RepositoryConfig;
  private readonly workspacePath: string;
  private readonly authorName: string;
  private readonly authorEmail: string;
  private git: SimpleGit | null = null;
  private lastPull: Date | null = null;
  private initialized = false;
  
  constructor(adapterConfig: GitRepoAdapterConfig) {
    this.config = adapterConfig.repoConfig;
    this.workspacePath = adapterConfig.workspacePath;
    this.authorName = adapterConfig.authorName ?? 'computable-lab';
    this.authorEmail = adapterConfig.authorEmail ?? 'computable-lab@localhost';
  }
  
  /**
   * Get the authenticated URL for cloning.
   */
  private getAuthenticatedUrl(): string {
    const { url, auth } = this.config.git;
    
    if (auth.type === 'token' && auth.token) {
      // Insert token into HTTPS URL
      // https://github.com/... -> https://token@github.com/...
      try {
        const parsed = new URL(url);
        parsed.username = auth.token;
        return parsed.toString();
      } catch {
        // If URL parsing fails, return as-is
        return url;
      }
    }
    
    // For SSH or no auth, return URL as-is
    return url;
  }
  
  /**
   * Initialize the git instance and clone if needed.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // Create workspace directory if needed
    if (!existsSync(this.workspacePath)) {
      await mkdir(this.workspacePath, { recursive: true, mode: 0o700 });
    }
    
    // Check if already cloned
    const gitDir = join(this.workspacePath, '.git');
    if (existsSync(gitDir)) {
      // Already cloned, just initialize git instance
      this.git = simpleGit(this.workspacePath);
    } else {
      // Need to clone
      const authUrl = this.getAuthenticatedUrl();
      const baseGit = simpleGit();

      console.log(`Cloning repository to ${this.workspacePath}...`);
      
      try {
        await baseGit.clone(authUrl, this.workspacePath, [
          '--branch', this.config.git.branch,
          '--single-branch',
          '--depth', '100', // Shallow clone for efficiency
        ]);
        console.log('Clone completed successfully');
      } catch (cloneError) {
        const errorMessage = cloneError instanceof Error ? cloneError.message : String(cloneError);
        
        // Handle empty repository case (remote branch doesn't exist)
        if (errorMessage.includes('Remote branch') && errorMessage.includes('not found') ||
            errorMessage.includes('does not appear to be a git repository') ||
            errorMessage.includes('Could not find remote branch')) {
          console.log('Repository appears empty or branch does not exist, initializing new workspace...');
          await this.initializeEmptyRepo(authUrl);
        } else {
          // Re-throw other errors
          console.error('Clone failed:', errorMessage);
          throw cloneError;
        }
      }

      this.git = simpleGit(this.workspacePath);
    }
    
    // Configure git user
    await this.git.addConfig('user.name', this.authorName);
    await this.git.addConfig('user.email', this.authorEmail);
    
    this.initialized = true;
    this.lastPull = new Date();
  }
  
  /**
   * Ensure git is initialized.
   */
  private async ensureInitialized(): Promise<SimpleGit> {
    if (!this.initialized || !this.git) {
      await this.initialize();
    }
    return this.git!;
  }
  
  /**
   * Generate a deterministic SHA for content.
   */
  private generateSha(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 40);
  }
  
  /**
   * Resolve a path relative to the workspace.
   */
  private resolvePath(path: string): string {
    return join(this.workspacePath, path);
  }
  
  /**
   * Check if a pull is needed based on sync configuration.
   */
  private needsPull(): boolean {
    if (this.config.sync.mode === 'manual') {
      return false;
    }
    
    if (!this.lastPull) {
      return true;
    }
    
    const ageMs = Date.now() - this.lastPull.getTime();
    const intervalMs = (this.config.sync.pullIntervalSeconds ?? 60) * 1000;
    
    return ageMs > intervalMs;
  }
  
  /**
   * Pull latest changes from remote if needed.
   */
  private async pullIfNeeded(): Promise<void> {
    if (!this.needsPull()) {
      return;
    }
    
    const git = await this.ensureInitialized();
    
    try {
      await git.pull('origin', this.config.git.branch);
      this.lastPull = new Date();
    } catch (err) {
      console.error('Pull failed:', err);
      // Don't fail the operation, just log the error
    }
  }
  
  /**
   * Sync with remote (pull latest).
   */
  async sync(): Promise<SyncResult> {
    const git = await this.ensureInitialized();
    
    try {
      // Fetch to see what's available
      await git.fetch('origin', this.config.git.branch);
      
      // Pull changes
      const pullResult = await git.pull('origin', this.config.git.branch);
      
      this.lastPull = new Date();
      
      return {
        success: true,
        pulledCommits: pullResult.summary?.changes ?? 0,
        status: 'clean' as WorkspaceStatus,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        status: 'error' as WorkspaceStatus,
      };
    }
  }
  
  /**
   * Get git status.
   */
  async getStatus(): Promise<GitStatus> {
    const git = await this.ensureInitialized();
    const status = await git.status();
    
    return {
      branch: status.current ?? this.config.git.branch,
      ahead: status.ahead,
      behind: status.behind,
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      isClean: status.isClean(),
    };
  }
  
  /**
   * Get a file from the repository.
   */
  async getFile(path: string): Promise<RepoFile | null> {
    await this.pullIfNeeded();
    
    const fullPath = this.resolvePath(path);
    
    try {
      const content = await readFile(fullPath, 'utf-8');
      const stats = await stat(fullPath);
      
      return {
        path,
        content,
        sha: this.generateSha(content),
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
    await this.pullIfNeeded();
    
    const fullPath = this.resolvePath(path);
    return existsSync(fullPath);
  }
  
  /**
   * List files in a directory.
   */
  async listFiles(options: ListFilesOptions): Promise<string[]> {
    await this.pullIfNeeded();
    
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
    const { readdir } = await import('node:fs/promises');
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
        if (!pattern || this.matchesPattern(entry.name, pattern)) {
          results.push(relPath);
        }
      }
    }
  }
  
  /**
   * Check if a filename matches a glob pattern.
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return filename.endsWith(ext);
    }
    
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return filename.startsWith(prefix);
    }
    
    return filename === pattern;
  }
  
  /**
   * Create a new file.
   */
  async createFile(options: CreateFileOptions): Promise<FileOperationResult> {
    const { path, content, message } = options;
    const fullPath = this.resolvePath(path);
    
    try {
      const git = await this.ensureInitialized();
      
      // Pull latest first
      await this.pullIfNeeded();
      
      // Check if file already exists
      if (existsSync(fullPath)) {
        return {
          success: false,
          error: `File already exists: ${path}`,
        };
      }
      
      // Create directory if needed
      await mkdir(dirname(fullPath), { recursive: true });
      
      // Write file
      await writeFile(fullPath, content, 'utf-8');
      
      // Stage and commit if auto-commit enabled
      if (this.config.sync.autoCommit) {
        await git.add(path);
        await git.commit(message);
        
        // Push if auto-push enabled
        if (this.config.sync.autoPush) {
          await this.pushWithRetry(git);
        }
      }
      
      const sha = this.generateSha(content);
      
      return {
        success: true,
        commit: {
          sha,
          message,
          author: options.author ?? this.authorName,
          email: options.email ?? this.authorEmail,
          timestamp: new Date().toISOString(),
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
      const git = await this.ensureInitialized();
      
      // Pull latest first
      await this.pullIfNeeded();
      
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
      
      // Stage and commit if auto-commit enabled
      if (this.config.sync.autoCommit) {
        await git.add(path);
        await git.commit(message);
        
        // Push if auto-push enabled
        if (this.config.sync.autoPush) {
          await this.pushWithRetry(git);
        }
      }
      
      const newSha = this.generateSha(content);
      
      return {
        success: true,
        commit: {
          sha: newSha,
          message,
          author: options.author ?? this.authorName,
          email: options.email ?? this.authorEmail,
          timestamp: new Date().toISOString(),
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
      const git = await this.ensureInitialized();
      
      // Pull latest first
      await this.pullIfNeeded();
      
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
      
      // Stage and commit if auto-commit enabled
      if (this.config.sync.autoCommit) {
        await git.add(path);
        await git.commit(message);
        
        // Push if auto-push enabled
        if (this.config.sync.autoPush) {
          await this.pushWithRetry(git);
        }
      }
      
      return {
        success: true,
        commit: {
          sha: this.generateSha(message + path),
          message,
          author: this.authorName,
          email: this.authorEmail,
          timestamp: new Date().toISOString(),
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
   * Get file history from git log.
   */
  async getHistory(options: HistoryOptions): Promise<CommitInfo[]> {
    const git = await this.ensureInitialized();
    
    try {
      // Build log options
      const logOptions: string[] = [
        `-n${options.limit ?? 10}`,
        '--',
        options.path,
      ];
      
      if (options.ref) {
        logOptions.unshift(options.ref);
      }
      
      const log = await git.log(logOptions);
      
      return log.all.map(entry => ({
        sha: entry.hash,
        message: entry.message,
        author: entry.author_name,
        email: entry.author_email,
        timestamp: entry.date,
      }));
    } catch (err) {
      console.error('Failed to get history:', err);
      return [];
    }
  }
  
  /**
   * Commit multiple files atomically.
   */
  async commitFiles(options: {
    files: FileChange[];
    message: string;
    push?: boolean;
  }): Promise<FileOperationResult> {
    const { files, message, push = this.config.sync.autoPush } = options;
    
    try {
      const git = await this.ensureInitialized();
      
      // Pull latest first
      await git.pull('origin', this.config.git.branch);
      
      // Apply all file changes
      for (const file of files) {
        const fullPath = this.resolvePath(file.path);
        
        if (file.operation === 'delete') {
          if (existsSync(fullPath)) {
            await unlink(fullPath);
          }
        } else {
          // Create or update
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, file.content ?? '', 'utf-8');
        }
      }
      
      // Stage all changes
      const filePaths = files.map(f => f.path);
      await git.add(filePaths);
      
      // Check if there are changes to commit
      const status = await git.status();
      if (status.isClean()) {
        return {
          success: true,
          commit: {
            sha: 'no-changes',
            message,
            author: this.authorName,
            email: this.authorEmail,
            timestamp: new Date().toISOString(),
          },
        };
      }
      
      // Commit
      const commitResult = await git.commit(message);
      
      // Push if requested
      if (push) {
        await this.pushWithRetry(git);
      }
      
      return {
        success: true,
        commit: {
          sha: commitResult.commit,
          message,
          author: this.authorName,
          email: this.authorEmail,
          timestamp: new Date().toISOString(),
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
   * Initialize an empty repository (when remote has no commits).
   * Creates a local git repo and sets up the remote.
   */
  private async initializeEmptyRepo(authUrl: string): Promise<void> {
    // Ensure workspace directory exists
    await mkdir(this.workspacePath, { recursive: true, mode: 0o700 });
    
    // Initialize new git repo
    this.git = simpleGit(this.workspacePath);
    await this.git.init();
    await this.git.addRemote('origin', authUrl);
    
    // Create an initial commit (required before we can push)
    // We'll create a .gitkeep file in records directory
    const recordsDir = join(this.workspacePath, this.config.records?.directory ?? 'records');
    await mkdir(recordsDir, { recursive: true });
    
    const gitkeepPath = join(recordsDir, '.gitkeep');
    await writeFile(gitkeepPath, '# This file ensures the records directory is tracked by git\n', 'utf-8');
    
    await this.git.add('.');
    await this.git.commit('Initialize repository');
    
    console.log('Empty repository initialized with initial commit');
  }
  
  /**
   * Push with retry on conflict.
   */
  private async pushWithRetry(git: SimpleGit, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await git.push('origin', this.config.git.branch);
        return;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Check if this is a conflict error
        if (
          attempt < maxRetries &&
          (errorMessage.includes('rejected') ||
           errorMessage.includes('non-fast-forward') ||
           errorMessage.includes('fetch first'))
        ) {
          console.warn(`Push failed (attempt ${attempt}), pulling and retrying...`);
          
          // Pull with rebase
          await git.pull('origin', this.config.git.branch, ['--rebase']);
          continue;
        }
        
        throw err;
      }
    }
  }
}

/**
 * Create a new GitRepoAdapter instance.
 */
export function createGitRepoAdapter(config: GitRepoAdapterConfig): GitRepoAdapter {
  return new GitRepoAdapter(config);
}
