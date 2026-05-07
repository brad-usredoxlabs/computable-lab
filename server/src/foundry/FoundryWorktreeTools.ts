import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { CompletionRequest, CompletionResponse, InferenceClient, ToolCall, ToolDefinition } from '../ai/types.js';

const execFileAsync = promisify(execFile);
const MAX_TOOL_RESULT_CHARS = 30_000;
const MAX_READ_CHARS = 40_000;
const DEFAULT_MAX_TOOL_ROUNDS = 16;

const WORKTREE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'worktree_search',
      description: 'Search the scratch worktree with ripgrep.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal or regex search query.' },
          path: { type: 'string', description: 'Optional repo-relative file or directory.' },
          maxResults: { type: 'number', description: 'Maximum matching lines to return, default 120.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_read',
      description: 'Read a repo-relative file from the scratch worktree with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repo-relative file path.' },
          startLine: { type: 'number', description: 'Optional 1-based start line.' },
          endLine: { type: 'number', description: 'Optional 1-based inclusive end line.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_list',
      description: 'List files under a directory in the scratch worktree.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional repo-relative directory, default repo root.' },
          maxFiles: { type: 'number', description: 'Maximum files to return, default 200.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_replace_lines',
      description: 'Replace an inclusive 1-based line range in a scratch worktree file. Use worktree_read first, then edit by current line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repo-relative file path.' },
          startLine: { type: 'number', description: '1-based start line.' },
          endLine: { type: 'number', description: '1-based inclusive end line.' },
          replacement: { type: 'string', description: 'Replacement text for the range. May be empty to delete the range.' },
        },
        required: ['path', 'startLine', 'endLine', 'replacement'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_write_file',
      description: 'Create or overwrite a repo-relative file in the scratch worktree.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repo-relative file path.' },
          content: { type: 'string', description: 'Full file contents.' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_run',
      description: 'Run a repo-local command in the scratch worktree. Use this for tests, type checks, git status, or focused inspection.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command executable, e.g. npm, npx, git, node, rg, sed.' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command arguments.' },
          cwd: { type: 'string', description: 'Optional repo-relative working directory.' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds, default 120000.' },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'worktree_diff',
      description: 'Return the current git diff from the scratch worktree.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback));
}

function safeRepoPath(root: string, requested: unknown, options: { allowRoot?: boolean } = {}): { rel: string; full: string } {
  if (typeof requested !== 'string' || (!options.allowRoot && !requested.trim())) {
    throw new Error('path must be a non-empty repo-relative string');
  }
  const raw = requested.trim() || '.';
  if (raw.startsWith('/') || raw.includes('\0')) throw new Error(`${raw}: invalid repo path`);
  const full = resolve(root, raw);
  const resolvedRoot = resolve(root);
  if (full !== resolvedRoot && !full.startsWith(`${resolvedRoot}/`)) throw new Error(`${raw}: path escapes worktree root`);
  const rel = relative(resolvedRoot, full);
  const parts = rel.split('/').filter(Boolean);
  if (
    parts.some((part) =>
      part === '.git'
      || part === 'node_modules'
      || part === 'dist'
      || part === 'coverage'
      || part === '.next'
      || part === '.turbo'
    )
  ) {
    throw new Error(`${raw}: path is excluded from worktree tools`);
  }
  return { rel, full };
}

function lineNumbered(content: string, startLine = 1, endLine?: number): string {
  const lines = content.split('\n');
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine ?? lines.length);
  const width = String(end).length;
  const out: string[] = [];
  for (let line = start; line <= end; line += 1) {
    out.push(`${String(line).padStart(width, '0')} | ${lines[line - 1] ?? ''}`);
  }
  return out.join('\n');
}

async function walkFiles(root: string, dir: string, limit: number, out: string[]): Promise<void> {
  if (out.length >= limit || !existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= limit) break;
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, full, limit, out);
    } else if (entry.isFile()) {
      out.push(relative(root, full));
    }
  }
}

function splitLinesForEdit(content: string): { lines: string[]; hadFinalNewline: boolean } {
  const hadFinalNewline = content.endsWith('\n');
  const lines = content.split('\n');
  if (hadFinalNewline) lines.pop();
  return { lines, hadFinalNewline };
}

/**
 * Normalize escaped newline sequences that survive JSON.parse.
 *
 * When the LLM double-escapes newlines in tool-call arguments (sending \\n
 * instead of \n), JSON.parse produces the literal two-character sequence
 * backslash + 'n' instead of an actual newline. This function converts those
 * literal escape sequences back into real control characters so that
 * worktree_replace_lines produces correctly line-broken output.
 */
function normalizeEscapedWhitespace(text: string): string {
  // Handle literal \n, \r, \t that survived JSON.parse (double-escaped input).
  // We do NOT touch \\ (actual backslash-backslash) because that's intentional.
  // Strategy: replace literal \n / \r / \t sequences with real characters,
  // but preserve \ (backslash followed by anything else) as-is.
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

async function gitDiff(worktreeRoot: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['diff', '--no-ext-diff', '--binary'], {
    cwd: worktreeRoot,
    maxBuffer: 1024 * 1024 * 16,
  });
  return stdout;
}

async function runWorktreeTool(worktreeRoot: string, toolCall: ToolCall): Promise<Record<string, unknown>> {
  const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;

  if (toolCall.function.name === 'worktree_search') {
    const query = typeof args['query'] === 'string' ? args['query'] : '';
    if (!query.trim()) throw new Error('query must be a non-empty string');
    const maxResults = clampInt(args['maxResults'], 120, 1, 400);
    const searchPath = typeof args['path'] === 'string' && args['path'].trim()
      ? safeRepoPath(worktreeRoot, args['path']).rel
      : '.';
    const rgArgs = ['--line-number', '--column', '--no-heading', '--max-count', String(maxResults), query, searchPath];
    try {
      const { stdout } = await execFileAsync('rg', rgArgs, { cwd: worktreeRoot, maxBuffer: 1024 * 1024 * 8 });
      return { ok: true, command: ['rg', ...rgArgs].join(' '), output: stdout.slice(0, MAX_TOOL_RESULT_CHARS) };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      if (err.code === 1) return { ok: true, command: ['rg', ...rgArgs].join(' '), output: '', note: 'no matches' };
      throw new Error(err.stderr || err.message || String(error));
    }
  }

  if (toolCall.function.name === 'worktree_read') {
    const { rel, full } = safeRepoPath(worktreeRoot, args['path']);
    const stats = await stat(full);
    if (!stats.isFile()) throw new Error(`${rel}: not a file`);
    const startLine = clampInt(args['startLine'], 1, 1, 1_000_000);
    const endLine = typeof args['endLine'] === 'number' ? clampInt(args['endLine'], startLine + 260, startLine, 1_000_000) : undefined;
    const content = await readFile(full, 'utf-8');
    return { ok: true, path: rel, output: lineNumbered(content, startLine, endLine).slice(0, MAX_READ_CHARS) };
  }

  if (toolCall.function.name === 'worktree_list') {
    const target = typeof args['path'] === 'string' && args['path'].trim() ? args['path'] : '.';
    const { rel, full } = safeRepoPath(worktreeRoot, target, { allowRoot: true });
    const stats = await stat(full);
    if (!stats.isDirectory()) throw new Error(`${rel}: not a directory`);
    const maxFiles = clampInt(args['maxFiles'], 200, 1, 800);
    const files: string[] = [];
    await walkFiles(resolve(worktreeRoot), full, maxFiles, files);
    return { ok: true, path: rel || '.', files };
  }

  if (toolCall.function.name === 'worktree_replace_lines') {
    const { rel, full } = safeRepoPath(worktreeRoot, args['path']);
    const stats = await stat(full);
    if (!stats.isFile()) throw new Error(`${rel}: not a file`);
    const startLine = clampInt(args['startLine'], 1, 1, 1_000_000);
    const endLine = clampInt(args['endLine'], startLine, startLine, 1_000_000);
    const replacement = normalizeEscapedWhitespace(
      typeof args['replacement'] === 'string' ? args['replacement'] : '',
    );
    const before = await readFile(full, 'utf-8');
    const { lines, hadFinalNewline } = splitLinesForEdit(before);
    if (startLine > lines.length + 1 || endLine > lines.length) {
      throw new Error(`${rel}: line range ${startLine}-${endLine} is outside file with ${lines.length} lines`);
    }
    const replacementLines = replacement.length > 0 ? replacement.replace(/\n$/, '').split('\n') : [];
    lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines);
    await writeFile(full, `${lines.join('\n')}${hadFinalNewline ? '\n' : ''}`, 'utf-8');
    return { ok: true, path: rel, changedRange: `${startLine}-${endLine}`, diff: (await gitDiff(worktreeRoot)).slice(0, MAX_TOOL_RESULT_CHARS) };
  }

  if (toolCall.function.name === 'worktree_write_file') {
    const { rel, full } = safeRepoPath(worktreeRoot, args['path']);
    const content = normalizeEscapedWhitespace(
      typeof args['content'] === 'string' ? args['content'] : '',
    );
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf-8');
    return { ok: true, path: rel, diff: (await gitDiff(worktreeRoot)).slice(0, MAX_TOOL_RESULT_CHARS) };
  }

  if (toolCall.function.name === 'worktree_run') {
    const command = typeof args['command'] === 'string' ? args['command'].trim() : '';
    if (!command || command.includes('/') || command.includes('\0')) throw new Error('command must be a bare executable name');
    const commandArgs = Array.isArray(args['args']) ? args['args'].filter((item): item is string => typeof item === 'string') : [];
    const cwd = typeof args['cwd'] === 'string' && args['cwd'].trim()
      ? safeRepoPath(worktreeRoot, args['cwd'], { allowRoot: true }).full
      : worktreeRoot;
    const timeoutMs = clampInt(args['timeoutMs'], 120_000, 1_000, 300_000);
    try {
      const { stdout, stderr } = await execFileAsync(command, commandArgs, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 12,
      });
      return {
        ok: true,
        command: [command, ...commandArgs].join(' '),
        stdout: stdout.slice(0, MAX_TOOL_RESULT_CHARS),
        stderr: stderr.slice(0, MAX_TOOL_RESULT_CHARS),
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      return {
        ok: false,
        command: [command, ...commandArgs].join(' '),
        exitCode: err.code,
        stdout: (err.stdout ?? '').slice(0, MAX_TOOL_RESULT_CHARS),
        stderr: (err.stderr ?? err.message ?? String(error)).slice(0, MAX_TOOL_RESULT_CHARS),
      };
    }
  }

  if (toolCall.function.name === 'worktree_diff') {
    return { ok: true, diff: (await gitDiff(worktreeRoot)).slice(0, MAX_TOOL_RESULT_CHARS) };
  }

  throw new Error(`${toolCall.function.name}: unsupported worktree tool`);
}

export async function completeWithWorktreeTools(input: {
  client: InferenceClient;
  request: CompletionRequest;
  worktreeRoot: string;
  maxToolRounds?: number;
}): Promise<CompletionResponse> {
  const messages = [...input.request.messages];
  const maxToolRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const response = await input.client.complete({
      ...input.request,
      messages,
      tools: [...(input.request.tools ?? []), ...WORKTREE_TOOLS],
      tool_choice: input.request.tool_choice ?? 'auto',
    });
    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    if (!message || toolCalls.length === 0) return response;
    messages.push(message);
    for (const toolCall of toolCalls.slice(0, 8)) {
      const started = Date.now();
      try {
        const result = await runWorktreeTool(input.worktreeRoot, toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ...result, durationMs: Date.now() - started }).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - started,
          }),
        });
      }
    }
  }

  return input.client.complete({
    ...input.request,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Tool budget is exhausted. Call worktree_diff if you changed files, then return final JSON with summary and remaining concerns.',
      },
    ],
    tool_choice: 'none',
  });
}

export async function readWorktreeDiff(worktreeRoot: string): Promise<string> {
  return gitDiff(worktreeRoot);
}
