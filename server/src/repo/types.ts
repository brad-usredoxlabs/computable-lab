/**
 * Types for Repository Adapter.
 * 
 * The Repository Adapter provides text in/out via GitHub API.
 * It has NO domain semantics - just file operations.
 */

/**
 * File content from the repository.
 */
export interface RepoFile {
  /** File path relative to repo root */
  path: string;
  /** File content as string */
  content: string;
  /** SHA of the file (for updates/deletes) */
  sha: string;
  /** File size in bytes */
  size: number;
  /** File encoding (usually 'utf-8' or 'base64') */
  encoding: string;
}

/**
 * Information about a commit.
 */
export interface CommitInfo {
  /** Commit SHA */
  sha: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Author email */
  email?: string;
  /** Commit timestamp (ISO 8601) */
  timestamp: string;
  /** URL to the commit */
  url?: string;
}

/**
 * Options for listing files.
 */
export interface ListFilesOptions {
  /** Directory to list (relative to repo root) */
  directory: string;
  /** File pattern to match (glob-like, e.g., "*.yaml") */
  pattern?: string;
  /** Whether to list recursively */
  recursive?: boolean;
}

/**
 * Options for creating a file.
 */
export interface CreateFileOptions {
  /** File path relative to repo root */
  path: string;
  /** File content */
  content: string;
  /** Commit message */
  message: string;
  /** Branch name (default: main) */
  branch?: string;
  /** Author name (optional override) */
  author?: string;
  /** Author email (optional override) */
  email?: string;
}

/**
 * Options for updating a file.
 */
export interface UpdateFileOptions extends CreateFileOptions {
  /** SHA of the file being updated (required for GitHub API) */
  sha: string;
}

/**
 * Options for deleting a file.
 */
export interface DeleteFileOptions {
  /** File path relative to repo root */
  path: string;
  /** SHA of the file being deleted (required for GitHub API) */
  sha: string;
  /** Commit message */
  message: string;
  /** Branch name (default: main) */
  branch?: string;
}

/**
 * Options for getting file history.
 */
export interface HistoryOptions {
  /** File path */
  path: string;
  /** Maximum number of commits to return */
  limit?: number;
  /** SHA or branch to start from */
  ref?: string;
}

/**
 * Result of a file operation.
 */
export interface FileOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Commit info if successful */
  commit?: CommitInfo;
  /** Error message if failed */
  error?: string;
}

/**
 * Repository Adapter interface.
 * 
 * This interface abstracts the repository backend (GitHub, local filesystem, etc.)
 * All operations are text-based with no domain semantics.
 */
export interface RepoAdapter {
  /**
   * Get a file from the repository.
   * 
   * @param path - File path relative to repo root
   * @returns RepoFile or null if not found
   */
  getFile(path: string): Promise<RepoFile | null>;
  
  /**
   * Check if a file exists.
   * 
   * @param path - File path relative to repo root
   * @returns true if file exists
   */
  fileExists(path: string): Promise<boolean>;
  
  /**
   * List files in a directory.
   * 
   * @param options - List options (directory, pattern, recursive)
   * @returns Array of file paths
   */
  listFiles(options: ListFilesOptions): Promise<string[]>;
  
  /**
   * Create a new file.
   * 
   * @param options - Create options (path, content, message)
   * @returns Operation result with commit info
   */
  createFile(options: CreateFileOptions): Promise<FileOperationResult>;
  
  /**
   * Update an existing file.
   * 
   * @param options - Update options (path, content, message, sha)
   * @returns Operation result with commit info
   */
  updateFile(options: UpdateFileOptions): Promise<FileOperationResult>;
  
  /**
   * Delete a file.
   * 
   * @param options - Delete options (path, message, sha)
   * @returns Operation result with commit info
   */
  deleteFile(options: DeleteFileOptions): Promise<FileOperationResult>;
  
  /**
   * Get file history (commits that modified the file).
   * 
   * @param options - History options (path, limit)
   * @returns Array of commit info
   */
  getHistory(options: HistoryOptions): Promise<CommitInfo[]>;
  
  /**
   * Initialize the adapter (optional).
   * 
   * For GitRepoAdapter: clones the repository if not already cloned.
   * For LocalRepoAdapter: ensures the base directory exists.
   * 
   * This method is optional - adapters that don't need initialization
   * can omit this method.
   */
  initialize?(): Promise<void>;
}

/**
 * Configuration for GitHub Repository Adapter.
 */
export interface GitHubRepoConfig {
  /** Repository owner (user or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub personal access token */
  token: string;
  /** Default branch (default: 'main') */
  branch?: string;
  /** Base URL for GitHub API (default: 'https://api.github.com') */
  apiUrl?: string;
}

/**
 * Configuration for Local Repository Adapter.
 */
export interface LocalRepoConfig {
  /** Base directory for the repository */
  basePath: string;
}
