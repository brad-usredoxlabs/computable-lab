import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { InferenceClient, CompletionRequest, CompletionResponse, ToolDefinition, ToolCall } from '../ai/types.js';
import { queryWorkbenchRetrieval } from './FoundryRetrieval.js';
import { boundedToolTranscript, extractInlineXmlToolCalls } from './FoundryToolBudget.js';

const execFileAsync = promisify(execFile);
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_READ_CHARS = 16_000;
const DEFAULT_MAX_TOOL_ROUNDS = 6;
const MAX_TRANSCRIPT_CHARS = Number(process.env['PROTOCOL_FOUNDRY_TOOL_TRANSCRIPT_CHARS'] ?? 220_000);

export interface FoundryBrowserToolContext {
  artifactRoot: string;
  workbenchRoot?: string;
  protocolId: string;
  variant: string;
  appBase?: string;
  apiBase?: string;
}

const CODEBASE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'codebase_retrieve',
      description: 'Use the agent-workbench retrieval index to get reranked codebase chunks for a focused compiler/precompiler question. Prefer this before broad codebase_read calls.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Focused natural-language or symbol query.' },
          topK: { type: 'number', description: 'Number of reranked chunks to return, default 6.' },
          candidateK: { type: 'number', description: 'Candidate pool before reranking, default topK * 3.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'codebase_search',
      description: 'Search the repository with ripgrep. Use this before patching if you need to locate symbols, tests, schemas, records, or call sites.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal or regex search query.' },
          path: { type: 'string', description: 'Optional repo-relative file or directory to search.' },
          maxResults: { type: 'number', description: 'Maximum matching lines to return, default 80.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'codebase_read',
      description: 'Read a repo-relative file or line slice. Use this to inspect exact code before writing structured edits.',
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
      name: 'codebase_list',
      description: 'List repo files under a directory. Use this to discover nearby tests, schemas, records, or modules.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional repo-relative directory, default repo root.' },
          maxFiles: { type: 'number', description: 'Maximum files to return, default 120.' },
        },
        additionalProperties: false,
      },
    },
  },
];

const BROWSER_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'foundry_browser_review_run',
      description: 'Run the deterministic Playwright browser review for the current protocol variant event graph, then write browser-review/<protocol>/<variant>/report.yaml and screenshots.',
      parameters: {
        type: 'object',
        properties: {
          proposalPath: {
            type: 'string',
            description: 'Optional proposal path. Defaults to artifactRoot/event-graphs/<protocolId>/<variant>.yaml. Relative paths are resolved under artifactRoot.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'foundry_browser_review_read',
      description: 'Read the current protocol variant browser-review report, including route, status, console errors, visual failures, labware checks, and screenshot filenames.',
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

function safeRepoPath(repoRoot: string, requested: unknown): { rel: string; full: string } {
  if (typeof requested !== 'string' || !requested.trim()) {
    throw new Error('path must be a non-empty repo-relative string');
  }
  if (requested.startsWith('/') || requested.includes('\0')) throw new Error(`${requested}: invalid repo path`);
  const full = resolve(repoRoot, requested);
  const root = resolve(repoRoot);
  if (full !== root && !full.startsWith(`${root}/`)) throw new Error(`${requested}: path escapes repo root`);
  const rel = relative(root, full);
  if (
    rel.split('/').some((part) =>
      part === '.git'
      || part === 'node_modules'
      || part === 'dist'
      || part === 'coverage'
      || part === '.next'
    )
  ) {
    throw new Error(`${requested}: path is excluded from codebase tools`);
  }
  return { rel, full };
}

function safeArtifactPath(context: FoundryBrowserToolContext, requested: unknown, fallback: string): string {
  const root = resolve(context.artifactRoot);
  const raw = typeof requested === 'string' && requested.trim() ? requested : fallback;
  if (raw.includes('\0')) throw new Error(`${raw}: invalid artifact path`);
  const full = raw.startsWith('/') ? resolve(raw) : resolve(root, raw);
  if (full !== root && !full.startsWith(`${root}/`)) throw new Error(`${raw}: path escapes artifact root`);
  return full;
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

async function readBrowserReport(context: FoundryBrowserToolContext): Promise<Record<string, unknown>> {
  const reportDir = join(context.artifactRoot, 'browser-review', context.protocolId, context.variant);
  const reportPath = join(reportDir, 'report.yaml');
  if (!existsSync(reportPath)) {
    return { ok: false, reportPath, error: 'browser review report does not exist yet' };
  }
  const report = await readFile(reportPath, 'utf-8');
  const screenshots = existsSync(reportDir)
    ? (await readdir(reportDir)).filter((file) => /^screenshot-.*\.png$/.test(file)).sort()
    : [];
  return {
    ok: true,
    reportPath,
    screenshots: screenshots.map((file) => join(reportDir, file)),
    output: report.slice(0, MAX_TOOL_RESULT_CHARS),
  };
}

async function runBrowserTool(
  repoRoot: string,
  context: FoundryBrowserToolContext,
  toolCall: ToolCall,
): Promise<Record<string, unknown>> {
  const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;

  if (toolCall.function.name === 'foundry_browser_review_read') {
    return readBrowserReport(context);
  }

  if (toolCall.function.name === 'foundry_browser_review_run') {
    const fallbackProposal = join('event-graphs', context.protocolId, `${context.variant}.yaml`);
    const proposalPath = safeArtifactPath(context, args['proposalPath'], fallbackProposal);
    if (!existsSync(proposalPath)) throw new Error(`${proposalPath}: proposal does not exist`);
    const workbenchRoot = context.workbenchRoot ?? resolve(repoRoot, '..', 'agent-workbench');
    const script = join(workbenchRoot, 'scripts', 'protocol_foundry_browser_review.cjs');
    if (!existsSync(script)) throw new Error(`${script}: browser review script not found`);
    const outDir = join(context.artifactRoot, 'browser-review', context.protocolId, context.variant);
    const reviewArgs = [script, '--repo-root', repoRoot, '--proposal', proposalPath, '--out', outDir];
    if (context.apiBase) reviewArgs.push('--api-base', context.apiBase);
    if (context.appBase) reviewArgs.push('--app-base', context.appBase);
    try {
      const { stdout, stderr } = await execFileAsync('node', reviewArgs, {
        cwd: workbenchRoot,
        timeout: 180_000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return {
        ok: true,
        command: ['node', ...reviewArgs].join(' '),
        stdout: stdout.slice(0, MAX_TOOL_RESULT_CHARS),
        stderr: stderr.slice(0, MAX_TOOL_RESULT_CHARS),
        report: await readBrowserReport(context),
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      return {
        ok: false,
        command: ['node', ...reviewArgs].join(' '),
        exitCode: err.code,
        stdout: (err.stdout ?? '').slice(0, MAX_TOOL_RESULT_CHARS),
        stderr: (err.stderr ?? err.message ?? String(error)).slice(0, MAX_TOOL_RESULT_CHARS),
        report: await readBrowserReport(context),
      };
    }
  }

  throw new Error(`${toolCall.function.name}: unsupported browser tool`);
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

async function runCodebaseTool(repoRoot: string, toolCall: ToolCall, options: { workbenchRoot?: string; profileName?: string } = {}): Promise<Record<string, unknown>> {
  const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
  if (toolCall.function.name === 'codebase_retrieve') {
    const query = typeof args['query'] === 'string' ? args['query'] : '';
    if (!query.trim()) throw new Error('query must be a non-empty string');
    return queryWorkbenchRetrieval({
      repoRoot,
      ...(options.workbenchRoot ? { workbenchRoot: options.workbenchRoot } : {}),
      query,
      topK: clampInt(args['topK'], 6, 1, 12),
      candidateK: clampInt(args['candidateK'], 18, 4, 80),
      profileName: options.profileName ?? process.env['PROTOCOL_FOUNDRY_RETRIEVAL_PROFILE'] ?? process.env['WORKBENCH_PROFILE'] ?? 'dgx-spark',
    });
  }

  if (toolCall.function.name === 'codebase_search') {
    const query = typeof args['query'] === 'string' ? args['query'] : '';
    if (!query.trim()) throw new Error('query must be a non-empty string');
    const maxResults = clampInt(args['maxResults'], 80, 1, 200);
    const searchPath = typeof args['path'] === 'string' && args['path'].trim()
      ? safeRepoPath(repoRoot, args['path']).rel
      : '.';
    const rgArgs = ['--line-number', '--column', '--no-heading', '--max-count', String(maxResults), query, searchPath];
    try {
      const { stdout } = await execFileAsync('rg', rgArgs, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 8 });
      return { ok: true, command: ['rg', ...rgArgs].join(' '), output: stdout.slice(0, MAX_TOOL_RESULT_CHARS) };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      if (err.code === 1) return { ok: true, command: ['rg', ...rgArgs].join(' '), output: '', note: 'no matches' };
      throw new Error(err.stderr || err.message || String(error));
    }
  }

  if (toolCall.function.name === 'codebase_read') {
    const { rel, full } = safeRepoPath(repoRoot, args['path']);
    const stats = await stat(full);
    if (!stats.isFile()) throw new Error(`${rel}: not a file`);
    const startLine = clampInt(args['startLine'], 1, 1, 1_000_000);
    const endLine = typeof args['endLine'] === 'number' ? clampInt(args['endLine'], startLine + 220, startLine, 1_000_000) : undefined;
    const content = await readFile(full, 'utf-8');
    return {
      ok: true,
      path: rel,
      output: lineNumbered(content, startLine, endLine).slice(0, MAX_READ_CHARS),
    };
  }

  if (toolCall.function.name === 'codebase_list') {
    const target = typeof args['path'] === 'string' && args['path'].trim() ? args['path'] : '.';
    const { rel, full } = safeRepoPath(repoRoot, target);
    const stats = await stat(full);
    if (!stats.isDirectory()) throw new Error(`${rel}: not a directory`);
    const maxFiles = clampInt(args['maxFiles'], 120, 1, 500);
    const files: string[] = [];
    await walkFiles(resolve(repoRoot), full, maxFiles, files);
    return { ok: true, path: rel || '.', files };
  }

  throw new Error(`${toolCall.function.name}: unsupported codebase tool`);
}

export async function completeWithCodebaseTools(input: {
  client: InferenceClient;
  request: CompletionRequest;
  repoRoot?: string;
  browserContext?: FoundryBrowserToolContext;
  maxToolRounds?: number;
}): Promise<CompletionResponse> {
  if (!input.repoRoot) return input.client.complete(input.request);
  const messages = [...input.request.messages];
  const maxToolRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const tools = [...CODEBASE_TOOLS, ...(input.browserContext ? BROWSER_TOOLS : [])];
  const workbenchRoot = input.browserContext?.workbenchRoot;
  const profileName = process.env['PROTOCOL_FOUNDRY_RETRIEVAL_PROFILE'] ?? process.env['WORKBENCH_PROFILE'] ?? 'dgx-spark';

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const response = await input.client.complete({
      ...input.request,
      messages: boundedToolTranscript({ messages, maxToolContentChars: MAX_TOOL_RESULT_CHARS, maxTranscriptChars: MAX_TRANSCRIPT_CHARS }),
      tools: [...(input.request.tools ?? []), ...tools],
      tool_choice: input.request.tool_choice ?? 'auto',
    });
    const message = response.choices[0]?.message;
    const inlineToolCalls = message?.tool_calls?.length ? [] : extractInlineXmlToolCalls(message?.content);
    const toolCalls = message?.tool_calls?.length ? message.tool_calls : inlineToolCalls;
    if (!message || toolCalls.length === 0) return response;
    messages.push(inlineToolCalls.length > 0 ? { ...message, content: null, tool_calls: inlineToolCalls } : message);
    for (const toolCall of toolCalls.slice(0, 6)) {
      const started = Date.now();
      try {
        const result = toolCall.function.name.startsWith('foundry_browser_review_') && input.browserContext
          ? await runBrowserTool(input.repoRoot, input.browserContext, toolCall)
          : await runCodebaseTool(input.repoRoot, toolCall, { ...(workbenchRoot ? { workbenchRoot } : {}), profileName });
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
      ...boundedToolTranscript({ messages, maxToolContentChars: MAX_TOOL_RESULT_CHARS, maxTranscriptChars: MAX_TRANSCRIPT_CHARS }),
      {
        role: 'user',
        content: 'Tool budget is exhausted. Return the best final answer now using the codebase evidence already gathered.',
      },
    ],
    tool_choice: 'none',
  });
}
