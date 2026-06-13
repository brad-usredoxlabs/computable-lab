/**
 * EmbeddedGitRepoAdapter — durable local-first Git repository.
 *
 * The adapter owns a local bare repository plus a managed working tree. It has
 * no network dependency: record writes commit to the worktree and push to the
 * local bare `origin`, giving appliance deployments Git history without a
 * GitHub/Gitea/GitLab service.
 */

import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import simpleGit, { type SimpleGit } from 'simple-git';
import type {
  CommitInfo,
  CreateFileOptions,
  DeleteFileOptions,
  FileOperationResult,
  HistoryOptions,
  ListFilesOptions,
  RepoAdapter,
  RepoFile,
  UpdateFileOptions,
} from './types.js';
import type { GitStatus, SyncResult, WorkspaceStatus } from '../config/types.js';
import type { FileChange } from './GitRepoAdapter.js';

export interface EmbeddedGitRepoAdapterConfig {
  repoId: string;
  dataDir: string;
  branch?: string;
  recordsDir?: string;
  authorName?: string;
  authorEmail?: string;
}

function generateSha(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 40);
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (!pattern) return true;
  if (pattern.startsWith('*.')) return filename.endsWith(pattern.slice(1));
  if (pattern.endsWith('*')) return filename.startsWith(pattern.slice(0, -1));
  return filename === pattern;
}

export class EmbeddedGitRepoAdapter implements RepoAdapter {
  readonly mode = 'embedded-git';
  readonly bareRepoPath: string;
  readonly worktreePath: string;

  private readonly repoId: string;
  private readonly branch: string;
  private readonly recordsDir: string;
  private readonly authorName: string;
  private readonly authorEmail: string;
  private git: SimpleGit | null = null;
  private initialized = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(config: EmbeddedGitRepoAdapterConfig) {
    this.repoId = config.repoId;
    this.branch = config.branch ?? 'main';
    this.recordsDir = config.recordsDir ?? 'records';
    this.authorName = config.authorName ?? 'computable-lab';
    this.authorEmail = config.authorEmail ?? 'computable-lab@localhost';
    this.bareRepoPath = join(config.dataDir, 'repos', `${this.repoId}.git`);
    this.worktreePath = join(config.dataDir, 'worktrees', this.repoId);
  }

  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mkdir(dirname(this.bareRepoPath), { recursive: true, mode: 0o700 });
    await mkdir(dirname(this.worktreePath), { recursive: true, mode: 0o700 });

    if (!existsSync(join(this.bareRepoPath, 'HEAD'))) {
      await simpleGit().raw(['init', '--bare', this.bareRepoPath]);
    }

    if (!existsSync(join(this.worktreePath, '.git'))) {
      await mkdir(this.worktreePath, { recursive: true, mode: 0o700 });
      const git = simpleGit(this.worktreePath);
      await git.init();
      await git.addRemote('origin', this.bareRepoPath).catch(async () => {
        await git.remote(['set-url', 'origin', this.bareRepoPath]);
      });
      this.git = git;
    } else {
      this.git = simpleGit(this.worktreePath);
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((remote) => remote.name === 'origin');
      if (!origin) await this.git.addRemote('origin', this.bareRepoPath);
      else if (origin.refs.fetch !== this.bareRepoPath) await this.git.remote(['set-url', 'origin', this.bareRepoPath]);
    }

    const git = this.git;
    await git.addConfig('user.name', this.authorName);
    await git.addConfig('user.email', this.authorEmail);
    await git.raw(['checkout', '-B', this.branch]);

    const hasHead = await this.hasHead(git);
    if (!hasHead) {
      const recordsDir = join(this.worktreePath, this.recordsDir);
      await mkdir(recordsDir, { recursive: true });
      await writeFile(join(recordsDir, '.gitkeep'), '# Embedded computable-lab records repository\n', 'utf-8');
      await git.add('.');
      await git.commit('Initialize embedded records repository');
      await git.push(['-u', 'origin', this.branch]);
    } else {
      const originBranch = await git.raw(['ls-remote', '--heads', 'origin', this.branch]).catch(() => '');
      if (originBranch.trim()) {
        await git.raw(['branch', '--set-upstream-to', `origin/${this.branch}`, this.branch]).catch(() => undefined);
      } else {
        await git.push(['-u', 'origin', this.branch]);
      }
    }

    this.initialized = true;
    console.log(`Embedded Git records repository ready: worktree=${this.worktreePath} bare=${this.bareRepoPath}`);
  }

  private async ensureInitialized(): Promise<SimpleGit> {
    if (!this.initialized || !this.git) await this.initialize();
    return this.git!;
  }

  private async hasHead(git: SimpleGit): Promise<boolean> {
    try {
      await git.raw(['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  private resolvePath(path: string): string {
    return join(this.worktreePath, path);
  }

  async getFile(path: string): Promise<RepoFile | null> {
    await this.ensureInitialized();
    const fullPath = this.resolvePath(path);
    try {
      const content = await readFile(fullPath, 'utf-8');
      const stats = await stat(fullPath);
      return { path, content, sha: generateSha(content), size: stats.size, encoding: 'utf-8' };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      await stat(this.resolvePath(path));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async listFiles(options: ListFilesOptions): Promise<string[]> {
    await this.ensureInitialized();
    const { directory, pattern, recursive = false } = options;
    const results: string[] = [];
    try {
      await this.listFilesRecursive(this.resolvePath(directory), directory, pattern, recursive, results);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return results;
  }

  private async listFilesRecursive(absDir: string, relDir: string, pattern: string | undefined, recursive: boolean, results: string[]): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (recursive) await this.listFilesRecursive(join(absDir, entry.name), relPath, pattern, recursive, results);
      } else if (entry.isFile() && (!pattern || matchesPattern(entry.name, pattern))) {
        results.push(relPath);
      }
    }
  }

  async createFile(options: CreateFileOptions): Promise<FileOperationResult> {
    return this.withWriteLock(async () => {
      await this.ensureInitialized();
      if (await this.fileExists(options.path)) return { success: false, error: `File already exists: ${options.path}` };
      await mkdir(dirname(this.resolvePath(options.path)), { recursive: true });
      await writeFile(this.resolvePath(options.path), options.content, 'utf-8');
      return this.commitPaths([options.path], options.message, options.author, options.email);
    });
  }

  async updateFile(options: UpdateFileOptions): Promise<FileOperationResult> {
    return this.withWriteLock(async () => {
      await this.ensureInitialized();
      const existing = await this.getFile(options.path);
      if (!existing) return { success: false, error: `File not found: ${options.path}` };
      if (existing.sha !== options.sha) return { success: false, error: `SHA mismatch: expected ${options.sha}, got ${existing.sha}` };
      await writeFile(this.resolvePath(options.path), options.content, 'utf-8');
      return this.commitPaths([options.path], options.message, options.author, options.email);
    });
  }

  async deleteFile(options: DeleteFileOptions): Promise<FileOperationResult> {
    return this.withWriteLock(async () => {
      await this.ensureInitialized();
      const existing = await this.getFile(options.path);
      if (!existing) return { success: false, error: `File not found: ${options.path}` };
      if (existing.sha !== options.sha) return { success: false, error: `SHA mismatch: expected ${options.sha}, got ${existing.sha}` };
      await unlink(this.resolvePath(options.path));
      return this.commitPaths([options.path], options.message);
    });
  }

  async getHistory(options: HistoryOptions): Promise<CommitInfo[]> {
    const git = await this.ensureInitialized();
    const log = await git.log({ file: options.path, maxCount: options.limit ?? 20 });
    return log.all.map((entry) => ({
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      email: entry.author_email,
      timestamp: entry.date,
    }));
  }

  async getStatus(): Promise<GitStatus> {
    const git = await this.ensureInitialized();
    const status = await git.status();
    return {
      branch: status.current ?? this.branch,
      ahead: status.ahead,
      behind: status.behind,
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      isClean: status.isClean(),
    };
  }

  async sync(): Promise<SyncResult> {
    const git = await this.ensureInitialized();
    try {
      await git.pull('origin', this.branch).catch(() => undefined);
      await git.push('origin', this.branch);
      return { success: true, pulledCommits: 0, pushedCommits: 0, status: 'clean' as WorkspaceStatus };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), status: 'error' as WorkspaceStatus };
    }
  }

  async commitFiles(options: { files: FileChange[]; message: string; push?: boolean }): Promise<{ success: boolean; commit?: CommitInfo; error?: string }> {
    return this.withWriteLock(async () => {
      await this.ensureInitialized();
      const paths: string[] = [];
      for (const file of options.files) {
        paths.push(file.path);
        const fullPath = this.resolvePath(file.path);
        if (file.operation === 'delete') {
          if (existsSync(fullPath)) await unlink(fullPath);
        } else {
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, file.content ?? '', 'utf-8');
        }
      }
      if (paths.length === 0 && options.push) {
        await this.pushToBare();
        return { success: true };
      }
      return this.commitPaths(paths.length ? paths : ['.'], options.message || 'Update embedded records repository');
    });
  }

  private async commitPaths(paths: string[], message: string, author?: string, email?: string): Promise<FileOperationResult> {
    const git = await this.ensureInitialized();
    try {
      if (author) await git.addConfig('user.name', author);
      if (email) await git.addConfig('user.email', email);
      await git.add(paths);
      const status = await git.status();
      if (status.isClean()) return { success: true };
      const commit = await git.commit(message);
      await this.pushToBare();
      return {
        success: true,
        commit: {
          sha: commit.commit,
          message,
          author: author ?? this.authorName,
          email: email ?? this.authorEmail,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (author) await git.addConfig('user.name', this.authorName).catch(() => undefined);
      if (email) await git.addConfig('user.email', this.authorEmail).catch(() => undefined);
    }
  }

  private async pushToBare(): Promise<void> {
    const git = await this.ensureInitialized();
    await git.push(['-u', 'origin', this.branch]);
  }
}

export function createEmbeddedGitRepoAdapter(config: EmbeddedGitRepoAdapterConfig): EmbeddedGitRepoAdapter {
  return new EmbeddedGitRepoAdapter(config);
}
