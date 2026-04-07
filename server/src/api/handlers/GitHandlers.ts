/**
 * GitHandlers — API handlers for git operations (commit, push, sync, status).
 * 
 * Provides endpoints for batched commits and push operations.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RepoAdapter, CommitInfo } from '../../repo/types.js';
import type { GitStatus, SyncResult } from '../../config/types.js';
import type { FileChange } from '../../repo/GitRepoAdapter.js';

/**
 * Request body for commit-push endpoint.
 */
export interface CommitPushRequest {
  /** Commit message */
  message: string;
  /** Optional: specific files to include (if omitted, commits all staged changes) */
  files?: FileChange[];
  /** Whether to push after commit (default: true) */
  push?: boolean;
}

/**
 * Response from commit-push endpoint.
 */
export interface CommitPushResponse {
  success: boolean;
  commit?: CommitInfo | undefined;
  error?: string | undefined;
  pushed?: boolean | undefined;
}

/**
 * Response from git status endpoint.
 */
export interface GitStatusResponse {
  success: boolean;
  status?: GitStatus | undefined;
  error?: string | undefined;
}

/**
 * Response from git sync endpoint.
 */
export interface GitSyncResponse {
  success: boolean;
  result?: SyncResult | undefined;
  error?: string | undefined;
}

/**
 * Extended repo adapter interface for git operations.
 */
interface GitCapableAdapter extends RepoAdapter {
  commitFiles(options: {
    files: FileChange[];
    message: string;
    push?: boolean;
  }): Promise<{ success: boolean; commit?: CommitInfo; error?: string }>;
  getStatus(): Promise<GitStatus>;
  sync(): Promise<SyncResult>;
}

/**
 * Check if repo adapter supports git operations.
 */
function isGitCapable(adapter: RepoAdapter): adapter is GitCapableAdapter {
  return typeof (adapter as GitCapableAdapter).commitFiles === 'function';
}

/**
 * Git handlers class.
 */
export class GitHandlers {
  private adapter: RepoAdapter;
  
  constructor(repoAdapter: RepoAdapter) {
    this.adapter = repoAdapter;
  }
  
  /**
   * POST /git/commit-push
   * 
   * Commit staged changes and optionally push to remote.
   */
  async commitAndPush(
    request: FastifyRequest<{ Body: CommitPushRequest }>,
    reply: FastifyReply
  ): Promise<CommitPushResponse> {
    if (!isGitCapable(this.adapter)) {
      reply.code(501);
      return {
        success: false,
        error: 'Git operations not available (using local file adapter)',
      };
    }
    
    const { message, files, push = true } = request.body;
    
    if (!message || message.trim() === '') {
      reply.code(400);
      return {
        success: false,
        error: 'Commit message is required',
      };
    }
    
    try {
      const result = await this.adapter.commitFiles({
        files: files || [],
        message,
        push,
      });
      
      if (!result.success) {
        reply.code(500);
        return {
          success: false,
          error: result.error || 'Commit failed',
        };
      }
      
      return {
        success: true,
        commit: result.commit,
        pushed: push,
      };
    } catch (err) {
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * GET /git/status
   * 
   * Get current git status (branch, modified files, etc).
   */
  async getStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<GitStatusResponse> {
    if (!isGitCapable(this.adapter)) {
      reply.code(501);
      return {
        success: false,
        error: 'Git operations not available (using local file adapter)',
      };
    }
    
    try {
      const status = await this.adapter.getStatus();
      
      return {
        success: true,
        status,
      };
    } catch (err) {
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * POST /git/sync
   * 
   * Pull latest changes from remote.
   */
  async sync(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<GitSyncResponse> {
    if (!isGitCapable(this.adapter)) {
      reply.code(501);
      return {
        success: false,
        error: 'Git operations not available (using local file adapter)',
      };
    }
    
    try {
      const result = await this.adapter.sync();
      
      return {
        success: result.success,
        result,
        error: result.error || undefined,
      };
    } catch (err) {
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * POST /git/push
   * 
   * Push committed changes to remote.
   */
  async push(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ success: boolean; error?: string | undefined }> {
    if (!isGitCapable(this.adapter)) {
      reply.code(501);
      return {
        success: false,
        error: 'Git operations not available (using local file adapter)',
      };
    }
    
    try {
      // Use commitFiles with empty files array and push=true to just push
      const result = await this.adapter.commitFiles({
        files: [],
        message: '', // Won't actually commit since no changes
        push: true,
      });
      
      return {
        success: result.success,
        error: result.error || undefined,
      };
    } catch (err) {
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Create a new GitHandlers instance.
 */
export function createGitHandlers(repoAdapter: RepoAdapter): GitHandlers {
  return new GitHandlers(repoAdapter);
}
