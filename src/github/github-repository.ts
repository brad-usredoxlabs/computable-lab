import { Octokit } from '@octokit/rest';
import { RepositoryError } from '../types/common';

/**
 * GitHub Repository Service
 * Handles all interactions with GitHub repositories for record storage
 */
export class GitHubRepository {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string = 'main'
  ) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Get repository information
   */
  async getRepository(): Promise<any> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });
      return response.data;
    } catch (error) {
      throw new RepositoryError(`Failed to get repository: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Check if a file exists in the repository
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw new RepositoryError(`Failed to check file existence: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        path,
        githubError: error
      });
    }
  }

  /**
   * Read a file from the repository
   */
  async readFile(path: string): Promise<string> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch
      });

      if ('content' in response.data && 'encoding' in response.data) {
        const content = Buffer.from(response.data.content, response.data.encoding as BufferEncoding).toString('utf-8');
        return content;
      }

      throw new RepositoryError(`File is not a regular file: ${path}`, {
        repository: `${this.owner}/${this.repo}`,
        path
      });
    } catch (error) {
      throw new RepositoryError(`Failed to read file: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        path,
        githubError: error
      });
    }
  }

  /**
   * Write a file to the repository
   */
  async writeFile(
    path: string,
    content: string,
    message: string,
    author?: { name: string; email: string }
  ): Promise<void> {
    try {
      // Check if file exists to determine if we need to create or update
      const exists = await this.fileExists(path);

      if (exists) {
        // Get current file SHA for update
        const currentFile = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
          ref: this.branch
        });

        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path,
          message,
          content: Buffer.from(content).toString('base64'),
          sha: 'sha' in currentFile.data ? currentFile.data.sha : undefined,
          author,
          committer: author,
          branch: this.branch
        });
      } else {
        // Create new file
        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path,
          message,
          content: Buffer.from(content).toString('base64'),
          author,
          committer: author,
          branch: this.branch
        });
      }
    } catch (error) {
      throw new RepositoryError(`Failed to write file: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        path,
        githubError: error
      });
    }
  }

  /**
   * Delete a file from the repository
   */
  async deleteFile(
    path: string,
    message: string,
    author?: { name: string; email: string }
  ): Promise<void> {
    try {
      // Get current file SHA for deletion
      const currentFile = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch
      });

      if ('sha' in currentFile.data) {
        await this.octokit.rest.repos.deleteFile({
          owner: this.owner,
          repo: this.repo,
          path,
          message,
          sha: currentFile.data.sha,
          author,
          committer: author,
          branch: this.branch
        });
      } else {
        throw new RepositoryError(`File SHA not found: ${path}`, {
          repository: `${this.owner}/${this.repo}`,
          path
        });
      }
    } catch (error) {
      throw new RepositoryError(`Failed to delete file: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        path,
        githubError: error
      });
    }
  }

  /**
   * List files in a directory (root level only)
   */
  async listFiles(path: string): Promise<Array<{ name: string; path: string; type: string; size?: number | undefined }>> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch
      });

      if (Array.isArray(response.data)) {
        return response.data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: 'size' in item ? item.size : undefined
        }));
      }

      return [];
    } catch (error) {
      if ((error as any).status === 404) {
        return [];
      }
      throw new RepositoryError(`Failed to list files: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        path,
        githubError: error
      });
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, sourceBranch: string = this.branch): Promise<void> {
    try {
      // Get the latest commit SHA from the source branch
      const { data: commit } = await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: sourceBranch
      });

      // Create the new branch
      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: commit.commit.sha
      });
    } catch (error) {
      throw new RepositoryError(`Failed to create branch: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`
      });
    } catch (error) {
      throw new RepositoryError(`Failed to delete branch: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Create a pull request
   * NOTE: These are workflow helper methods, not used by RepositoryAdapter
   */
  async createPullRequest(
    title: string,
    head: string,
    base: string = this.branch,
    body?: string
  ): Promise<number> {
    try {
      const response = await this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        head,
        base,
        body: body || undefined
      });
      return response.data.number;
    } catch (error) {
      throw new RepositoryError(`Failed to create pull request: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Get pull request information
   * NOTE: These are workflow helper methods, not used by RepositoryAdapter
   */
  async getPullRequest(prNumber: number): Promise<any> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      return response.data;
    } catch (error) {
      throw new RepositoryError(`Failed to get pull request: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Update a pull request
   * NOTE: These are workflow helper methods, not used by RepositoryAdapter
   */
  async updatePullRequest(
    prNumber: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed' }
  ): Promise<void> {
    try {
      await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        ...updates
      });
    } catch (error) {
      throw new RepositoryError(`Failed to update pull request: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Merge a pull request
   * NOTE: These are workflow helper methods, not used by RepositoryAdapter
   */
  async mergePullRequest(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
    commitTitle?: string,
    commitMessage?: string
  ): Promise<void> {
    try {
      await this.octokit.rest.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
        commit_title: commitTitle || undefined,
        commit_message: commitMessage || undefined
      });
    } catch (error) {
      throw new RepositoryError(`Failed to merge pull request: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Get repository branches
   */
  async getBranches(): Promise<Array<{ name: string; sha: string }>> {
    try {
      const response = await this.octokit.rest.repos.listBranches({
        owner: this.owner,
        repo: this.repo
      });
      return response.data.map(branch => ({
        name: branch.name,
        sha: branch.commit.sha
      }));
    } catch (error) {
      throw new RepositoryError(`Failed to get branches: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Get repository commits
   */
  async getCommits(branch?: string): Promise<Array<{ sha: string; message: string; author: { name: string; email: string } }>> {
    try {
      const response = await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        branch: branch || this.branch
      });
      return response.data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name || '',
          email: commit.commit.author?.email || ''
        }
      }));
    } catch (error) {
      throw new RepositoryError(`Failed to get commits: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Get repository root statistics (top-level files only)
   */
  async getRootStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    commitCount: number;
    branchCount: number;
  }> {
    try {
      const [files, commits, branches] = await Promise.all([
        this.listFiles(''),
        this.getCommits(),
        this.getBranches()
      ]);

      return {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
        commitCount: commits.length,
        branchCount: branches.length
      };
    } catch (error) {
      throw new RepositoryError(`Failed to get stats: ${this.extractErrorMessage(error)}`, {
        repository: `${this.owner}/${this.repo}`,
        githubError: error
      });
    }
  }

  /**
   * Extract error message from error object
   */
  private extractErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return String(error);
  }
}

/**
 * Factory function to create a GitHub repository service
 */
export function createGitHubRepository(
  token: string,
  owner: string,
  repo: string,
  branch: string = 'main'
): GitHubRepository {
  const octokit = new Octokit({
    auth: token
  });
  return new GitHubRepository(octokit, owner, repo, branch);
}