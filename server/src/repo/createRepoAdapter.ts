/**
 * Factory function to create the appropriate RepoAdapter based on configuration.
 *
 * - remote-git → GitRepoAdapter (clone from remote)
 * - embedded-git → EmbeddedGitRepoAdapter (durable local bare repo)
 * - local-filesystem → LocalRepoAdapter (plain files; dev/testing escape hatch)
 */

import type { RepositoryConfig } from '../config/types.js';
import type { RepoAdapter } from './types.js';
import { createGitRepoAdapter, GitRepoAdapter } from './GitRepoAdapter.js';
import { createLocalRepoAdapter } from './LocalRepoAdapter.js';
import { createEmbeddedGitRepoAdapter } from './EmbeddedGitRepoAdapter.js';

/**
 * Options for creating a repo adapter.
 */
export interface CreateRepoAdapterOptions {
  /** Repository configuration from config.yaml */
  repoConfig: RepositoryConfig;
  /** Path where workspace will be created (remote Git) or base path (local filesystem) */
  workspacePath: string;
  /** Durable local application data directory for embedded Git repositories */
  dataDir?: string;
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
  const { repoConfig, workspacePath, dataDir, authorName, authorEmail } = options;
  const hasGitUrl = repoConfig.git?.url && repoConfig.git.url.trim().length > 0;
  const mode = repoConfig.mode ?? (hasGitUrl ? 'remote-git' : 'embedded-git');

  if (mode === 'remote-git') {
    if (!hasGitUrl) {
      throw new Error(`Repository ${repoConfig.id} is configured for remote-git but git.url is empty`);
    }
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

  if (mode === 'local-filesystem') {
    console.log(`Creating LocalRepoAdapter for repository: ${repoConfig.id}`);
    console.log(`  Base path: ${workspacePath}`);
    console.log('  Mode: local filesystem only (no git history)');

    const localAdapter = createLocalRepoAdapter({
      basePath: workspacePath,
    });

    if (localAdapter.initialize) {
      await localAdapter.initialize();
    }

    return localAdapter;
  }

  console.log(`Creating EmbeddedGitRepoAdapter for repository: ${repoConfig.id}`);
  console.log(`  Data dir: ${dataDir ?? workspacePath}`);
  console.log(`  Branch: ${repoConfig.git.branch}`);
  console.log('  Mode: durable local Git (no network remote)');

  const embeddedAdapter = createEmbeddedGitRepoAdapter({
    repoId: repoConfig.id,
    dataDir: dataDir ?? workspacePath,
    branch: repoConfig.git.branch,
    recordsDir: repoConfig.records?.directory,
    authorName: authorName ?? 'computable-lab',
    authorEmail: authorEmail ?? 'computable-lab@localhost',
  });

  await embeddedAdapter.initialize();
  return embeddedAdapter;
}

/**
 * Type guard to check if an adapter is a GitRepoAdapter.
 */
export function isGitRepoAdapter(adapter: RepoAdapter): adapter is GitRepoAdapter {
  return 'sync' in adapter && 'getStatus' in adapter;
}
