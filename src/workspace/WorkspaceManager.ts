/**
 * WorkspaceManager - Manages ephemeral git workspaces for repositories.
 * 
 * Each configured repository gets a workspace directory where:
 * - The repo is cloned (shallow clone for efficiency)
 * - Changes are made, committed, and pushed
 * - The workspace is disposable and can be recreated
 */

import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  RepositoryConfig,
  Workspace,
  WorkspaceStatus,
} from '../config/types.js';

/**
 * Workspace manager configuration.
 */
export interface WorkspaceManagerConfig {
  /** Base directory for all workspaces */
  baseDir: string;
  /** Maximum age of stale workspaces before cleanup (ms) */
  maxWorkspaceAgeMs?: number;
}

/**
 * Workspace manager state.
 */
interface WorkspaceState {
  workspace: Workspace;
  config: RepositoryConfig;
  initialized: boolean;
}

/**
 * WorkspaceManager implementation.
 */
export class WorkspaceManager {
  private readonly baseDir: string;
  private readonly maxWorkspaceAgeMs: number;
  private readonly workspaces: Map<string, WorkspaceState> = new Map();
  
  constructor(config: WorkspaceManagerConfig) {
    this.baseDir = config.baseDir;
    this.maxWorkspaceAgeMs = config.maxWorkspaceAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  }
  
  /**
   * Generate a deterministic workspace path for a repository.
   */
  private getWorkspacePath(repoId: string, gitUrl: string): string {
    // Create a hash of the git URL to ensure unique paths even if IDs collide
    const urlHash = createHash('sha256')
      .update(gitUrl || repoId)
      .digest('hex')
      .slice(0, 8);
    
    return join(this.baseDir, `${repoId}-${urlHash}`);
  }
  
  /**
   * Ensure the base workspace directory exists.
   */
  async ensureBaseDir(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }
  
  /**
   * Get or create a workspace for a repository configuration.
   */
  async getWorkspace(repoConfig: RepositoryConfig): Promise<Workspace> {
    const existing = this.workspaces.get(repoConfig.id);
    if (existing) {
      return existing.workspace;
    }
    
    // Create new workspace state
    const path = this.getWorkspacePath(repoConfig.id, repoConfig.git.url);
    const workspace: Workspace = {
      repoId: repoConfig.id,
      path,
      lastSync: null,
      status: 'uninitialized',
    };
    
    this.workspaces.set(repoConfig.id, {
      workspace,
      config: repoConfig,
      initialized: false,
    });
    
    return workspace;
  }
  
  /**
   * Initialize a workspace (create directory structure).
   * Note: Actual git clone is handled by GitRepoAdapter.
   */
  async initWorkspace(repoId: string): Promise<Workspace> {
    const state = this.workspaces.get(repoId);
    if (!state) {
      throw new Error(`Workspace not found for repository: ${repoId}`);
    }
    
    await this.ensureBaseDir();
    
    // Create workspace directory if it doesn't exist
    if (!existsSync(state.workspace.path)) {
      await mkdir(state.workspace.path, { recursive: true, mode: 0o700 });
    }
    
    state.initialized = true;
    return state.workspace;
  }
  
  /**
   * Update workspace status.
   */
  updateStatus(repoId: string, status: WorkspaceStatus, error?: string): void {
    const state = this.workspaces.get(repoId);
    if (state) {
      state.workspace.status = status;
      if (error !== undefined) {
        state.workspace.error = error;
      } else {
        delete state.workspace.error;
      }
      if (status === 'clean') {
        state.workspace.lastSync = new Date();
      }
    }
  }
  
  /**
   * Get workspace status by repository ID.
   */
  getStatus(repoId: string): Workspace | null {
    const state = this.workspaces.get(repoId);
    return state?.workspace ?? null;
  }
  
  /**
   * Get all workspace statuses.
   */
  getAllStatuses(): Map<string, Workspace> {
    const result = new Map<string, Workspace>();
    for (const [id, state] of this.workspaces) {
      result.set(id, state.workspace);
    }
    return result;
  }
  
  /**
   * Check if a workspace is initialized.
   */
  isInitialized(repoId: string): boolean {
    const state = this.workspaces.get(repoId);
    return state?.initialized ?? false;
  }
  
  /**
   * Check if a workspace exists on disk.
   */
  async workspaceExists(repoId: string): Promise<boolean> {
    const state = this.workspaces.get(repoId);
    if (!state) return false;
    
    return existsSync(state.workspace.path);
  }
  
  /**
   * Delete a workspace from disk.
   */
  async deleteWorkspace(repoId: string): Promise<void> {
    const state = this.workspaces.get(repoId);
    if (!state) return;
    
    if (existsSync(state.workspace.path)) {
      await rm(state.workspace.path, { recursive: true, force: true });
    }
    
    state.initialized = false;
    state.workspace.status = 'uninitialized';
    state.workspace.lastSync = null;
  }
  
  /**
   * Clean up stale workspaces.
   * Removes workspaces that haven't been synced in maxWorkspaceAgeMs.
   */
  async cleanup(): Promise<string[]> {
    const now = Date.now();
    const cleaned: string[] = [];
    
    // Clean up tracked workspaces
    for (const [repoId, state] of this.workspaces) {
      if (state.workspace.lastSync) {
        const age = now - state.workspace.lastSync.getTime();
        if (age > this.maxWorkspaceAgeMs) {
          await this.deleteWorkspace(repoId);
          cleaned.push(repoId);
        }
      }
    }
    
    // Clean up orphaned directories
    if (existsSync(this.baseDir)) {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      const trackedPaths = new Set(
        Array.from(this.workspaces.values()).map(s => s.workspace.path)
      );
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = join(this.baseDir, entry.name);
          if (!trackedPaths.has(dirPath)) {
            // Check directory age
            try {
              const stats = await stat(dirPath);
              const age = now - stats.mtimeMs;
              if (age > this.maxWorkspaceAgeMs) {
                await rm(dirPath, { recursive: true, force: true });
                cleaned.push(`orphan:${entry.name}`);
              }
            } catch {
              // Ignore stat errors
            }
          }
        }
      }
    }
    
    return cleaned;
  }
  
  /**
   * Clean up all workspaces (for shutdown).
   */
  async cleanupAll(): Promise<void> {
    for (const repoId of this.workspaces.keys()) {
      await this.deleteWorkspace(repoId);
    }
  }
}

/**
 * Create a new WorkspaceManager instance.
 */
export function createWorkspaceManager(config: WorkspaceManagerConfig): WorkspaceManager {
  return new WorkspaceManager(config);
}
