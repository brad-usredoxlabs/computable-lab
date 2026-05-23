import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
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
    | 'model_reasoning'
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
  localToolNames?: readonly string[];
  extraTools?: FoundryToolAgentTool[];
  maxTurns?: number;
  maxTokens?: number;
  /**
   * Hard context window of the served model, in tokens. Used to bound the
   * transcript and size each turn's output budget so prompt + output never
   * exceeds it. Defaults to 131072.
   */
  maxContextTokens?: number;
  temperature?: number;
  tracePath?: string;
  requireCompletionPromise?: boolean;
  onProgress?: (event: FoundryToolAgentProgressEvent) => void | Promise<void>;
  /**
   * Optional callback invoked when the model returns bare text (no tool call,
   * no COMPLETE marker). The returned string, if any, is APPENDED to the
   * stock "Continue working" reminder for that turn. Used by fix-it to echo
   * the current verify diff back so rumination has concrete state to react to.
   * Failure is non-fatal — return undefined and the stock reminder still fires.
   */
  onBareTextResponse?: (turn: number) => Promise<string | undefined>;
}

export interface FoundryToolAgentTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<ToolExecution>;
}

export interface FoundryToolAgentResult {
  status: FoundryToolAgentStatus;
  finalText: string;
  turns: number;
  toolCalls: number;
  tracePath?: string;
}

export interface ToolExecution {
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
      description:
        'Read a UTF-8 text file from the working directory. Large files are truncated; '
        + 'use offset/limit to page through a big file (e.g. to reach code past the first '
        + 'chunk). Content is returned verbatim so you can copy exact text into edit_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path' },
          offset: { type: 'number', description: '1-based line number to start from. Defaults to 1.' },
          limit: { type: 'number', description: 'Maximum number of lines to return from offset.' },
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
  const enabledLocalTools = selectBuiltinTools(input.localToolNames);
  const extraTools = input.extraTools ?? [];
  const tools = mergeToolDefinitions(enabledLocalTools, extraTools.map((tool) => tool.definition));
  const extraToolHandlers = new Map(extraTools.map((tool) => [tool.definition.function.name, tool.handler]));
  let finalText = '';
  let toolCalls = 0;

  // Late, single-fire "commit an edit" nudge. NOT the old turn-5 hammer
  // (which caused premature wrong edits) — this fires once, well into the
  // budget, only if the model has investigated without ever editing. It
  // breaks the drift-to-the-cap-without-editing failure mode while leaving
  // ample turns afterward to verify and iterate. Disabled for tiny budgets
  // (tests) so it never preempts the soft "Continue working" nudge.
  let hasEdited = false;
  let editNudged = false;
  const EDIT_TOOL_NAMES = new Set(['edit_file', 'write_file']);
  // 0.3 (turn 18 of 60) — earlier than the old 0.6 because the new quant
  // tends to produce a small number of ENORMOUS bare-text rumination turns
  // (~30-40K chars each) rather than many short ones; we need to nudge BEFORE
  // the model burns half its budget on a single decision.
  const editNudgeDeadline = maxTurns >= 12 ? Math.floor(maxTurns * 0.3) : Number.POSITIVE_INFINITY;
  const editNudge = (t: number): string =>
    `You've used ${t} of ${maxTurns} turns and investigated a lot without editing yet. `
    + `You very likely have enough context now — commit your single best edit to an owned `
    + `file and run the verification command, leaving turns to see the result and iterate. `
    + `Prefer a concrete change over more reading; a critic reviews your diff afterward.`;
  const editNudgeDue = (turn: number): boolean =>
    requireCompletionPromise && !hasEdited && !editNudged && turn >= editNudgeDeadline;

  // Context-window guard. The transcript grows every turn (full tool outputs
  // re-sent each time); without this a long run 400s with "maximum context
  // length". Keep the estimated input under budget and size each turn's output
  // to fit, so prompt + output never exceeds the model window.
  const MODEL_CONTEXT_TOKENS = input.maxContextTokens ?? 131_072;
  const OUTPUT_TOKEN_BUDGET = input.maxTokens ?? 16_384;
  const INPUT_TOKEN_BUDGET = Math.max(8_000, MODEL_CONTEXT_TOKENS - OUTPUT_TOKEN_BUDGET - 8_000);
  const KEEP_RECENT_TOOL_RESULTS = 6;

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
        `You have these tools: ${tools.map((tool) => tool.function.name).join(', ') || '(none)'}.`,
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

      compactTranscript(messages, INPUT_TOKEN_BUDGET, KEEP_RECENT_TOOL_RESULTS);
      const buildRequest = (): CompletionRequest => {
        const inputTokensEst = estimateTranscriptTokens(messages);
        // Even after compaction, never request more output than the window
        // can hold alongside the current input.
        const dynamicMaxTokens = Math.max(
          1_024,
          Math.min(OUTPUT_TOKEN_BUDGET, MODEL_CONTEXT_TOKENS - inputTokensEst - 2_048),
        );
        return {
          model: input.model,
          messages: messages.map(cloneMessage),
          tools,
          tool_choice: 'auto',
          temperature: input.temperature ?? 0.2,
          max_tokens: dynamicMaxTokens,
          // Let the InferenceClient's construction-time enableThinking decide.
          // Hardcoding false here overrode the coder's deliberate opt-in and
          // silently kept thinking off — that bug shipped in 616459e and
          // burnt one run.
        };
      };
      // One retry for a context-length 400 OR a transient/oversized inference
      // failure. Both are helped by aggressively compacting (stub all tool
      // results) — it shrinks an oversized body and recovers a token undershoot.
      let response: CompletionResponse;
      {
        let retried = false;
        for (;;) {
          try {
            response = await input.client.complete(buildRequest());
            break;
          } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            const recoverable = isContextLengthError(errMessage) || isTransientInferenceError(errMessage);
            if (retried || !recoverable) throw err;
            retried = true;
            await trace(input.tracePath, { type: 'inference_retry', turn, error: errMessage });
            await progress(input, {
              phase: 'turn_started',
              message: 'Inference call failed; compacting transcript and retrying once',
              details: { turn },
            });
            compactTranscript(messages, INPUT_TOKEN_BUDGET, 0);
            await new Promise((r) => setTimeout(r, 750));
          }
        }
      }
      const choice = response.choices[0];
      const assistantMessage = choice?.message;
      if (!assistantMessage) {
        throw new Error('tool agent received no assistant message');
      }
      // Trace the FULL response (including reasoning_content / reasoning) so
      // the persisted trace captures the model's private thinking for debug.
      await trace(input.tracePath, { type: 'assistant', turn, message: assistantMessage });
      // Surface the model's reasoning as a progress event so the UI can show
      // "what the AI is thinking" per turn (rather than only tool names).
      const rawReasoning =
        (assistantMessage as { reasoning_content?: unknown; reasoning?: unknown }).reasoning_content
        ?? (assistantMessage as { reasoning_content?: unknown; reasoning?: unknown }).reasoning;
      if (typeof rawReasoning === 'string' && rawReasoning.length > 0) {
        const REASONING_PREVIEW_CHARS = 800;
        const preview = rawReasoning.length > REASONING_PREVIEW_CHARS
          ? `${rawReasoning.slice(0, REASONING_PREVIEW_CHARS)}…`
          : rawReasoning;
        await progress(input, {
          phase: 'model_reasoning',
          message: `Model reasoning (${rawReasoning.length} chars)`,
          details: { turn, chars: rawReasoning.length, preview },
        });
      }
      // …but strip reasoning_content / reasoning before pushing into the
      // outgoing transcript — reasoning is a one-shot output, not part of the
      // conversation history; echoing it back bloats prompt tokens every turn
      // and conflicts with provider conventions (OpenAI / Qwen3+).
      const { reasoning: _r, reasoning_content: _rc, ...assistantForHistory } = assistantMessage as ChatMessage & {
        reasoning?: unknown;
        reasoning_content?: unknown;
      };
      void _r; void _rc;
      messages.push(assistantForHistory as ChatMessage);

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
          const execution = await executeToolCall(call, args, { workdir }, extraToolHandlers);
          if (execution.ok && EDIT_TOOL_NAMES.has(call.function.name)) hasEdited = true;
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
        // Late nudge also fires on tool-only turns (the model can ruminate via
        // read/grep without ever returning bare text).
        if (editNudgeDue(turn)) {
          messages.push({ role: 'user', content: editNudge(turn) });
          editNudged = true;
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

      // Build the per-bare-text reminder. Append the caller's echo (e.g. the
      // current verify diff) so the model has concrete state to react to
      // instead of free-form rumination.
      let echo: string | undefined;
      if (input.onBareTextResponse) {
        try {
          echo = await input.onBareTextResponse(turn);
        } catch {
          // Non-fatal: stock reminder still fires.
        }
      }
      const echoSuffix = echo ? `\n\n${echo}` : '';
      if (editNudgeDue(turn)) {
        messages.push({ role: 'user', content: editNudge(turn) + echoSuffix });
        editNudged = true;
      } else {
        messages.push({
          role: 'user',
          content:
            `Continue working. If the declared verification command passes, output ${COMPLETE_MARKER} as the final line and stop. Otherwise make one targeted edit and re-verify.`
            + echoSuffix,
        });
      }
    }

    // Out of turns without completing. Spend one final no-tools call asking
    // for a SUCCINCT handoff so the next coder (senior this round, or the next
    // round) continues from the findings instead of re-deriving them. Replaces
    // the old behavior of forwarding whatever fragment the model last said.
    if (requireCompletionPromise) {
      try {
        compactTranscript(messages, INPUT_TOKEN_BUDGET, KEEP_RECENT_TOOL_RESULTS);
        const handoffResponse = await input.client.complete({
          model: input.model,
          messages: [
            ...messages.map(cloneMessage),
            {
              role: 'user',
              content:
                'You are out of turns and the task is NOT complete. Write a concise handoff '
                + '(<=200 words) for the next coder, who continues from your in-progress edits. '
                + 'Cover: (1) the root cause(s) you identified, (2) what you changed and where, '
                + '(3) what is still failing and why, (4) the single most promising next step. '
                + 'Prose only — no tool calls.',
            },
          ],
          temperature: input.temperature ?? 0.2,
          max_tokens: 1024,
          // Handoff is short prose; force thinking OFF here (we want a fast
          // 200-word summary, not deep reasoning). Independent of the
          // coder's main-loop thinking setting.
          enableThinking: false,
        });
        const summary = handoffResponse.choices[0]?.message?.content?.trim();
        if (summary) {
          finalText = summary;
          await progress(input, { phase: 'model_response', message: 'Coder wrote a handoff summary', details: { chars: summary.length } });
        }
      } catch (err) {
        await trace(input.tracePath, { type: 'handoff_summary_failed', error: err instanceof Error ? err.message : String(err) });
      }
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

const ELIDED_TOOL_OUTPUT = '[earlier tool output elided to stay within the model context window]';

// Rough token estimate. Deliberately conservative (~3.5 chars/token + a
// per-message overhead) so we trigger compaction a little early rather than
// undercount and 400. Exact tokenization isn't worth a dependency here.
function estimateMessageTokens(message: ChatMessage): number {
  let chars = typeof message.content === 'string' ? message.content.length : 0;
  if (message.tool_calls) {
    for (const call of message.tool_calls) chars += (call.function.arguments?.length ?? 0) + 32;
  }
  return Math.ceil(chars / 3.5) + 8;
}

function estimateTranscriptTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) total += estimateMessageTokens(message);
  return total;
}

// Bound the transcript so prompt + output stays under the model window. The
// loop re-sends the full history every turn with no built-in compaction, so a
// long run (especially repeated shell/test output) grows until the provider
// 400s with "maximum context length". Stub the oldest tool results first —
// they're the least relevant — while preserving each tool message (and its
// tool_call_id) so the assistant/tool pairing the provider requires stays
// intact. The system prompt, the user task prompt, and assistant turns are
// never elided.
function compactTranscript(
  messages: ChatMessage[],
  inputTokenBudget: number,
  keepRecentToolResults: number,
): void {
  if (estimateTranscriptTokens(messages) <= inputTokenBudget) return;
  const toolIndices = messages
    .map((message, index) => (message.role === 'tool' ? index : -1))
    .filter((index) => index >= 0);
  const keepFrom = Math.max(0, toolIndices.length - keepRecentToolResults);
  // Oldest stubbable first; fall through to the recent ones only if still over.
  const order = [...toolIndices.slice(0, keepFrom), ...toolIndices.slice(keepFrom)];
  for (const index of order) {
    if (estimateTranscriptTokens(messages) <= inputTokenBudget) break;
    const message = messages[index]!;
    if (message.content !== ELIDED_TOOL_OUTPUT) message.content = ELIDED_TOOL_OUTPUT;
  }
}

function isContextLengthError(message: string): boolean {
  return /maximum context length|context length|input_tokens/i.test(message);
}

// Transient/oversized inference failures that are worth one retry (not a clean
// 400 we can reason about). Seen in the wild: the architect endpoint dropping
// a ~350KB request body with "fetch failed … request body exceeded server
// limits", which previously killed the run outright.
function isTransientInferenceError(message: string): boolean {
  return /fetch failed|exceeded server limits|ECONNRESET|ETIMEDOUT|socket hang up|EPIPE|network|invalid or incomplete response|503|502|429/i.test(
    message,
  );
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

async function executeToolCall(
  call: ToolCall,
  args: Record<string, unknown>,
  ctx: ToolContext,
  extraToolHandlers: Map<string, FoundryToolAgentTool['handler']> = new Map(),
): Promise<ToolExecution> {
  const startedAt = Date.now();
  const extraHandler = extraToolHandlers.get(call.function.name);
  if (extraHandler) {
    return extraHandler(args);
  }
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

function selectBuiltinTools(localToolNames: readonly string[] | undefined): ToolDefinition[] {
  if (localToolNames === undefined) return BUILTIN_TOOLS;
  const allowed = new Set(localToolNames);
  return BUILTIN_TOOLS.filter((tool) => allowed.has(tool.function.name));
}

function mergeToolDefinitions(primary: ToolDefinition[], extra: ToolDefinition[]): ToolDefinition[] {
  const seen = new Set<string>();
  const merged: ToolDefinition[] = [];
  for (const tool of [...primary, ...extra]) {
    const name = tool.function.name;
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push(tool);
  }
  return merged;
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
    const rel = stringArg(args, 'path');
    const path = resolveInsideWorkdir(ctx.workdir, rel);
    const content = await readFile(path, 'utf-8');
    const lines = content.split('\n');
    const total = lines.length;
    const offset = Math.max(1, Math.floor(numberArg(args, 'offset') ?? 1));
    const explicitLimit = numberArg(args, 'limit');

    // Page from `offset`, but never return more than the char cap in one call.
    // A single file can exceed the model context (e.g. 138K-char pass files);
    // the old behaviour silently returned only the first ~60K chars with no
    // way to reach the rest, so the model would loop "the file is too long".
    const startIdx = Math.min(offset - 1, total);
    const window = explicitLimit !== undefined
      ? lines.slice(startIdx, startIdx + Math.max(1, Math.floor(explicitLimit)))
      : lines.slice(startIdx);

    // Return content verbatim (no line-number prefix) so the model can copy
    // exact text into edit_file. Cap each call at the char budget; the hint
    // tells the model the line offset to resume from for the rest.
    const out: string[] = [];
    let charCount = 0;
    let lastLine = startIdx - 1; // 0-based index of last included line
    for (let i = 0; i < window.length; i += 1) {
      const line = window[i]!;
      if (charCount + line.length + 1 > DEFAULT_MAX_READ_CHARS && out.length > 0) break;
      out.push(line);
      charCount += line.length + 1;
      lastLine = startIdx + i;
    }

    let body = out.join('\n');
    const shownThrough = lastLine + 1; // 1-based last line actually returned
    if (shownThrough < total) {
      body += `\n... [showed lines ${offset}-${shownThrough} of ${total}. `
        + `Read further with read_file(path="${rel}", offset=${shownThrough + 1}).]`;
    }
    return body || `(file has ${total} line(s); offset ${offset} is past the end)`;
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

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
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
