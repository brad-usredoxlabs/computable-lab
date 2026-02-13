/**
 * MCP tools for git operations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { RepoAdapter, CommitInfo } from '../../repo/types.js';
import type { GitStatus, SyncResult } from '../../config/types.js';
import { jsonResult, errorResult } from '../helpers.js';

interface GitCapableAdapter extends RepoAdapter {
  commitFiles(options: {
    files: Array<{ path: string; content: string; operation?: string }>;
    message: string;
    push?: boolean;
  }): Promise<{ success: boolean; commit?: CommitInfo; error?: string }>;
  getStatus(): Promise<GitStatus>;
  sync(): Promise<SyncResult>;
}

function isGitCapable(adapter: RepoAdapter): adapter is GitCapableAdapter {
  return typeof (adapter as GitCapableAdapter).commitFiles === 'function';
}

export function registerGitTools(server: McpServer, ctx: AppContext): void {
  // git_status — Get current repository status
  server.tool(
    'git_status',
    'Get the current git status: branch, modified/staged/untracked files, ahead/behind counts.',
    {},
    async () => {
      try {
        if (!isGitCapable(ctx.repoAdapter)) {
          return errorResult('Git operations not available (using local file adapter)');
        }
        const status = await ctx.repoAdapter.getStatus();
        return jsonResult(status);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // git_commit — Commit and optionally push changes
  server.tool(
    'git_commit',
    'Commit all staged changes and optionally push to remote.',
    {
      message: z.string().describe('Commit message'),
      push: z.boolean().optional().describe('Whether to push after commit (default true)'),
    },
    async (args) => {
      try {
        if (!isGitCapable(ctx.repoAdapter)) {
          return errorResult('Git operations not available (using local file adapter)');
        }

        if (!args.message.trim()) {
          return errorResult('Commit message is required');
        }

        const result = await ctx.repoAdapter.commitFiles({
          files: [],
          message: args.message,
          push: args.push ?? true,
        });

        return jsonResult({
          success: result.success,
          commit: result.commit,
          error: result.error,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // git_history — Get recent commit history
  server.tool(
    'git_history',
    'Get recent commit history for a file or the entire repository.',
    {
      path: z.string().optional().describe('File path to get history for (defaults to repo root)'),
      limit: z.number().optional().describe('Maximum commits to return (default 20)'),
    },
    async (args) => {
      try {
        const history = await ctx.repoAdapter.getHistory({
          path: args.path ?? '.',
          limit: args.limit ?? 20,
        });
        return jsonResult({ commits: history, total: history.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
