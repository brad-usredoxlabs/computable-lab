import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  ChatMessage,
  CompletionRequest,
  InferenceClient,
  ToolCall,
  ToolDefinition,
} from '../ai/types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_TURNS = 40;
const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 30_000;
const DEFAULT_MAX_READ_CHARS = 60_000;
const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
const COMPLETE_MARKER = '<promise>COMPLETE</promise>';

export type FoundryToolAgentStatus = 'complete' | 'max-turns' | 'stopped' | 'failed';

export interface FoundryToolAgentProgressEvent {
  source: 'tool-agent';
  phase:
    | 'started'
    | 'turn_started'
    | 'tool_started'
    | 'tool_finished'
    | 'model_response'
    | 'complete'
    | 'max_turns'
    | 'failed';
  message: string;
  details?: Record<string, unknown>;
}

export interface FoundryToolAgentInput {
  client: InferenceClient;
  model: string;
  workdir: string;
  prompt: string;
  systemPrompt?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  tracePath?: string;
  requireCompletionPromise?: boolean;
  onProgress?: (event: FoundryToolAgentProgressEvent) => void | Promise<void>;
}

export interface FoundryToolAgentResult {
  status: FoundryToolAgentStatus;
  finalText: string;
  turns: number;
  toolCalls: number;
  tracePath?: string;
}

interface ToolExecution {
  ok: boolean;
  content: string;
  durationMs: number;
}

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

interface ToolContext {
  workdir: string;
}

const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a bash command in the working directory and return stdout plus stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Bash command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the working directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a complete UTF-8 text file. Creates parent directories as needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path' },
          content: { type: 'string', description: 'Complete file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace one exact string in a text file. The old_string must appear exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path' },
          old_string: { type: 'string', description: 'Exact text to replace' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at a path. Directories end with /.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path. Defaults to working directory.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description: "Find files matching a simple glob pattern such as 'src/**/*.ts'.",
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' },
          path: { type: 'string', description: 'Base directory. Defaults to working directory.' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents with rg. Returns matching lines with paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          path: { type: 'string', description: 'File or directory. Defaults to working directory.' },
          include: { type: 'string', description: "Optional glob filter, for example '*.ts'." },
        },
        required: ['pattern'],
      },
    },
  },
];

export function foundryToolAgentTools(): ToolDefinition[] {
  return BUILTIN_TOOLS;
}

export async function runFoundryToolAgent(input: FoundryToolAgentInput): Promise<FoundryToolAgentResult> {
  const workdir = resolve(input.workdir);
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  const requireCompletionPromise = input.requireCompletionPromise ?? true;
  let finalText = '';
  let toolCalls = 0;

  await progress(input, {
    phase: 'started',
    message: `Tool agent starting in ${workdir}`,
    details: { workdir, maxTurns },
  });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        input.systemPrompt?.trim() || 'You are a local coding agent.',
        `Working directory: ${workdir}`,
        `You have these tools: ${BUILTIN_TOOLS.map((tool) => tool.function.name).join(', ')}.`,
        requireCompletionPromise
          ? `When all acceptance criteria are met, output ${COMPLETE_MARKER} as the absolute last line.`
          : '',
      ].filter(Boolean).join('\n\n'),
    },
    { role: 'user', content: input.prompt },
  ];

  await trace(input.tracePath, { type: 'start', workdir, model: input.model, maxTurns });

  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      await progress(input, { phase: 'turn_started', message: `Model turn ${turn}/${maxTurns}`, details: { turn } });
      await trace(input.tracePath, { type: 'turn_started', turn });

      const request: CompletionRequest = {
        model: input.model,
        messages: messages.map(cloneMessage),
        tools: BUILTIN_TOOLS,
        tool_choice: 'auto',
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 16_384,
        enableThinking: false,
      };
      const response = await input.client.complete(request);
      const choice = response.choices[0];
      const assistantMessage = choice?.message;
      if (!assistantMessage) {
        throw new Error('tool agent received no assistant message');
      }
      messages.push(assistantMessage);
      await trace(input.tracePath, { type: 'assistant', turn, message: assistantMessage });

      const calls = assistantMessage.tool_calls ?? [];
      if (calls.length > 0) {
        for (const call of calls) {
          toolCalls += 1;
          const args = parseToolArgs(call);
          await progress(input, {
            phase: 'tool_started',
            message: `Calling ${call.function.name}`,
            details: { tool: call.function.name, args: summarizeArgs(args) },
          });
          const execution = await executeToolCall(call, args, { workdir });
          await progress(input, {
            phase: 'tool_finished',
            message: `${call.function.name} ${execution.ok ? 'finished' : 'failed'} in ${execution.durationMs}ms`,
            details: {
              tool: call.function.name,
              ok: execution.ok,
              durationMs: execution.durationMs,
              preview: execution.content.slice(0, 400),
            },
          });
          await trace(input.tracePath, {
            type: 'tool_result',
            turn,
            toolCallId: call.id,
            tool: call.function.name,
            args,
            result: execution,
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: execution.content,
          });
        }
        continue;
      }

      finalText = assistantMessage.content ?? '';
      await progress(input, {
        phase: 'model_response',
        message: finalText.includes(COMPLETE_MARKER) ? 'Model reported completion' : 'Model returned a text response',
        details: { turn, chars: finalText.length },
      });

      if (!requireCompletionPromise || finalText.includes(COMPLETE_MARKER)) {
        await progress(input, {
          phase: 'complete',
          message: 'Tool agent complete',
          details: { turns: turn, toolCalls },
        });
        await trace(input.tracePath, { type: 'complete', turns: turn, toolCalls, finalText });
        return result('complete', finalText, turn, toolCalls, input.tracePath);
      }

      messages.push({
        role: 'user',
        content: `Continue working. If all acceptance criteria are met, output ${COMPLETE_MARKER} as the final line. Otherwise use tools to make progress.`,
      });
    }

    await progress(input, {
      phase: 'max_turns',
      message: `Tool agent reached max turns (${maxTurns})`,
      details: { toolCalls },
    });
    await trace(input.tracePath, { type: 'max_turns', turns: maxTurns, toolCalls, finalText });
    return result('max-turns', finalText, maxTurns, toolCalls, input.tracePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await progress(input, { phase: 'failed', message, details: { toolCalls } });
    await trace(input.tracePath, { type: 'failed', error: message, toolCalls });
    return result('failed', message, Math.min(maxTurns, messages.filter((m) => m.role === 'assistant').length), toolCalls, input.tracePath);
  }
}

function result(
  status: FoundryToolAgentStatus,
  finalText: string,
  turns: number,
  toolCalls: number,
  tracePath: string | undefined,
): FoundryToolAgentResult {
  return {
    status,
    finalText,
    turns,
    toolCalls,
    ...(tracePath ? { tracePath } : {}),
  };
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.reasoning !== undefined ? { reasoning: message.reasoning } : {}),
    ...(message.reasoning_content !== undefined ? { reasoning_content: message.reasoning_content } : {}),
    ...(message.tool_call_id !== undefined ? { tool_call_id: message.tool_call_id } : {}),
    ...(message.tool_calls !== undefined
      ? {
          tool_calls: message.tool_calls.map((call) => ({
            id: call.id,
            type: call.type,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
        }
      : {}),
  };
}

async function progress(input: FoundryToolAgentInput, event: Omit<FoundryToolAgentProgressEvent, 'source'>): Promise<void> {
  await input.onProgress?.({ source: 'tool-agent', ...event });
}

async function trace(path: string | undefined, entry: Record<string, unknown>): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf-8');
}

function parseToolArgs(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    summary[key] = typeof value === 'string' && value.length > 200
      ? `${value.slice(0, 200)}...`
      : value;
  }
  return summary;
}

async function executeToolCall(call: ToolCall, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecution> {
  const startedAt = Date.now();
  const handler = TOOL_HANDLERS[call.function.name];
  if (!handler) {
    return { ok: false, content: `error: unknown tool ${call.function.name}`, durationMs: Date.now() - startedAt };
  }
  try {
    const content = await handler(args, ctx);
    return { ok: !content.startsWith('error:'), content, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      content: `error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  }
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  shell: async (args, ctx) => {
    const command = stringArg(args, 'command');
    if (!command) return 'error: command is required';
    const { stdout, stderr } = await execFileAsync('bash', ['-lc', command], {
      cwd: ctx.workdir,
      timeout: DEFAULT_TOOL_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 8,
    });
    return truncate([stdout, stderr].filter(Boolean).join('\n') || '(no output)');
  },

  read_file: async (args, ctx) => {
    const path = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path'));
    const content = await readFile(path, 'utf-8');
    return truncate(content, DEFAULT_MAX_READ_CHARS);
  },

  write_file: async (args, ctx) => {
    const path = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path'));
    const content = stringArg(args, 'content');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
    return `wrote ${content.length} byte(s) to ${relative(ctx.workdir, path)}`;
  },

  edit_file: async (args, ctx) => {
    const path = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path'));
    const oldString = stringArg(args, 'old_string');
    const newString = stringArg(args, 'new_string');
    if (!oldString) return 'error: old_string is required';
    const content = await readFile(path, 'utf-8');
    const count = countOccurrences(content, oldString);
    if (count === 0) return `error: old_string not found in ${relative(ctx.workdir, path)}`;
    if (count > 1) return `error: old_string found ${count} times in ${relative(ctx.workdir, path)}`;
    await writeFile(path, content.replace(oldString, newString), 'utf-8');
    return `edited ${relative(ctx.workdir, path)} (replaced 1 occurrence)`;
  },

  list_directory: async (args, ctx) => {
    const path = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path') || '.');
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
      .join('\n') || '(empty directory)';
  },

  glob_files: async (args, ctx) => {
    const pattern = stringArg(args, 'pattern');
    if (!pattern) return 'error: pattern is required';
    const base = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path') || '.');
    const regex = globToRegex(pattern);
    const files = await listFiles(base, 500);
    const matches = files
      .map((file) => relative(base, file).replace(/\\/g, '/'))
      .filter((file) => regex.test(file));
    return matches.slice(0, 200).join('\n') || '(no matches)';
  },

  grep: async (args, ctx) => {
    const pattern = stringArg(args, 'pattern');
    if (!pattern) return 'error: pattern is required';
    const path = resolveInsideWorkdir(ctx.workdir, stringArg(args, 'path') || '.');
    const include = stringArg(args, 'include');
    const rgArgs = ['-n', '--color', 'never'];
    if (include) rgArgs.push('--glob', include);
    rgArgs.push(pattern, path);
    try {
      const { stdout, stderr } = await execFileAsync('rg', rgArgs, {
        cwd: ctx.workdir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return truncate([stdout, stderr].filter(Boolean).join('\n') || '(no matches)');
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      if (err.code === 1) return '(no matches)';
      return truncate(`error: ${err.message ?? 'rg failed'}\n${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim());
    }
  },
};

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

function resolveInsideWorkdir(workdir: string, path: string): string {
  if (!path) throw new Error('path is required');
  const resolved = resolve(workdir, path);
  const rel = relative(workdir, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`path escapes workdir: ${path}`);
}

function truncate(text: string, maxChars = DEFAULT_MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated at ${maxChars} chars]`;
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = text.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

async function listFiles(root: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    if (out.length >= limit) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        out.push(full);
      } else {
        const info = await stat(full).catch(() => undefined);
        if (info?.isFile()) out.push(full);
      }
    }
  }
  await visit(root);
  return out;
}

function globToRegex(pattern: string): RegExp {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    const next = pattern[i + 1];
    if (ch === '*' && next === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(ch);
    }
  }
  source += '$';
  return new RegExp(source);
}

function escapeRegex(ch: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}
