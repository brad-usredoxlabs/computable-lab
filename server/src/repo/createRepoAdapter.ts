/**
 * Factory function to create the appropriate RepoAdapter based on configuration.
 * 
 * - If git.url is provided → GitRepoAdapter (clone from remote)
 * - If git.url is empty → LocalRepoAdapter (local only)
 */

import type { RepositoryConfig } from '../config/types.js';
import type { RepoAdapter } from './types.js';
import { createGitRepoAdapter, GitRepoAdapter } from './GitRepoAdapter.js';
import { createLocalRepoAdapter } from './LocalRepoAdapter.js';

/**
 * Options for creating a repo adapter.
 */
export interface CreateRepoAdapterOptions {
  /** Repository configuration from config.yaml */
  repoConfig: RepositoryConfig;
  /** Path where workspace will be created (for GitRepoAdapter) or base path (for LocalRepoAdapter) */
  workspacePath: string;
  /** Author name for git commits (optional) */
  authorName?: string;
  /** Author email for git commits (optional) */
  authorEmail?: string;
}

/**
 * Create the appropriate RepoAdapter based on configuration.
 * 
 * This factory function examines the repository configuration and returns:
 * - GitRepoAdapter if a git URL is configured (enables clone, commit, push)
 * - LocalRepoAdapter if no git URL (local filesystem only)
 * 
 * The GitRepoAdapter is automatically initialized (cloned) before returning.
 * 
 * @param options - Configuration options
 * @returns Initialized RepoAdapter instance
 */
export async function createRepoAdapter(
  options: CreateRepoAdapterOptions
): Promise<RepoAdapter> {
  const { repoConfig, workspacePath, authorName, authorEmail } = options;
  
  // Check if we have a git URL configured
  const hasGitUrl = repoConfig.git?.url && repoConfig.git.url.trim().length > 0;
  
  if (hasGitUrl) {
    console.log(`Creating GitRepoAdapter for repository: ${repoConfig.id}`);
    console.log(`  Git URL: ${repoConfig.git.url}`);
    console.log(`  Branch: ${repoConfig.git.branch}`);
    console.log(`  Workspace: ${workspacePath}`);
    console.log(`  Auto-commit: ${repoConfig.sync?.autoCommit ?? false}`);
    console.log(`  Auto-push: ${repoConfig.sync?.autoPush ?? false}`);
    
    // Create GitRepoAdapter for remote repositories
    const gitAdapter = createGitRepoAdapter({
      repoConfig,
      workspacePath,
      authorName: authorName ?? 'computable-lab',
      authorEmail: authorEmail ?? 'computable-lab@localhost',
    });
    
    // Initialize (clone if needed)
    console.log('Initializing git workspace...');
    await gitAdapter.initialize();
    console.log('Git workspace ready');
    
    return gitAdapter;
  }
  
  // Use LocalRepoAdapter for local-only mode
  console.log(`Creating LocalRepoAdapter for repository: ${repoConfig.id}`);
  console.log(`  Base path: ${workspacePath}`);
  console.log('  Mode: local filesystem only (no git remote)');
  
  const localAdapter = createLocalRepoAdapter({
    basePath: workspacePath,
  });
  
  // Initialize local adapter (ensure directory exists)
  if (localAdapter.initialize) {
    await localAdapter.initialize();
  }
  
  return localAdapter;
}

/**
 * Type guard to check if an adapter is a GitRepoAdapter.
 */
export function isGitRepoAdapter(adapter: RepoAdapter): adapter is GitRepoAdapter {
  return 'sync' in adapter && 'getStatus' in adapter;
}
