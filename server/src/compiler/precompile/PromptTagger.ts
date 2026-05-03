import type { ChatMessage, CompletionRequest } from '../../ai/types.js';
import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';
import type { LlmClient } from '../pipeline/passes/ChatbotCompilePasses.js';
import { renderPromptTemplate } from '../../registry/PromptTemplateRegistry.js';
import {
  RawTaggerOutputSchema,
  type MaterializedTaggerOutput,
  type MaterializedPromptTag,
  type RawPromptTag,
  type RawTaggerOutput,
} from './TaggerOutput.js';

export interface CreateTagPromptPassDeps {
  llmClient: LlmClient;
  model?: string;
}

export interface MaterializeSpansResult {
  output: MaterializedTaggerOutput;
  diagnostics: PassDiagnostic[];
}

let _cachedTagPromptSystemPrompt: string | null = null;

export function getTagPromptSystemPrompt(): string {
  if (_cachedTagPromptSystemPrompt === null) {
    _cachedTagPromptSystemPrompt = renderPromptTemplate('chatbot-compile.tagger.system');
  }
  return _cachedTagPromptSystemPrompt;
}

export function reloadTagPromptSystemPromptForTests(): void {
  _cachedTagPromptSystemPrompt = null;
}

export function parseRawTaggerOutput(raw: string, pass_id = 'tag_prompt'): {
  output: RawTaggerOutput;
  diagnostics: PassDiagnostic[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      output: { tags: [] },
      diagnostics: [{
        severity: 'warning',
        code: 'tag_prompt_parse_error',
        message: `tag_prompt response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        pass_id,
        details: { raw_preview: raw.slice(0, 300) },
      }],
    };
  }

  const result = RawTaggerOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      output: { tags: [] },
      diagnostics: [{
        severity: 'warning',
        code: 'tag_prompt_shape_mismatch',
        message: 'tag_prompt output shape mismatch',
        pass_id,
        details: { issues: result.error.issues.slice(0, 5) },
      }],
    };
  }

  return { output: result.data, diagnostics: [] };
}

export function materializeSpans(
  prompt: string,
  raw: RawTaggerOutput,
  pass_id = 'tag_prompt',
): MaterializeSpansResult {
  const diagnostics: PassDiagnostic[] = [];
  const tags: MaterializedPromptTag[] = [];

  for (const tag of raw.tags) {
    const matches = findOccurrences(prompt, tag.text);
    if (matches.length === 0) {
      diagnostics.push(spanDiagnostic('tag_prompt_span_not_found', tag, pass_id));
      continue;
    }

    const occurrence = tag.nthOccurrence;
    if (occurrence === undefined && matches.length > 1) {
      diagnostics.push(spanDiagnostic('tag_prompt_span_ambiguous', tag, pass_id, {
        occurrences: matches.length,
      }));
      continue;
    }

    const index = occurrence === undefined ? 0 : occurrence - 1;
    const span = matches[index];
    if (!span) {
      diagnostics.push(spanDiagnostic('tag_prompt_span_not_found', tag, pass_id, {
        requestedOccurrence: occurrence,
        occurrences: matches.length,
      }));
      continue;
    }

    if (prompt.slice(span[0], span[1]) !== tag.text) {
      diagnostics.push(spanDiagnostic('tag_prompt_span_roundtrip_failed', tag, pass_id, { span }));
      continue;
    }

    tags.push({ ...tag, span });
  }

  return { output: { tags }, diagnostics };
}

export function createTagPromptPass(deps: CreateTagPromptPassDeps): Pass {
  return {
    id: 'tag_prompt',
    family: 'parse' as const,
    async run({ pass_id, state }): Promise<PassResult> {
      const prompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      if (prompt.trim().length === 0) {
        return { ok: true, output: { tags: [] } satisfies MaterializedTaggerOutput };
      }

      const mentions = Array.isArray(state.input.mentions) ? state.input.mentions : [];
      if (mentions.length > 0) {
        return {
          ok: true,
          output: { tags: [] } satisfies MaterializedTaggerOutput,
          diagnostics: [{
            severity: 'info',
            code: 'tag_prompt_skipped_for_resolved_mentions',
            message: 'Resolved prompt mentions are present; deterministic precompile will use the raw prompt path.',
            pass_id,
          }],
        };
      }

      const messages: ChatMessage[] = [
        { role: 'system', content: getTagPromptSystemPrompt() },
        { role: 'user', content: JSON.stringify({ prompt }) },
      ];
      let response: Awaited<ReturnType<LlmClient['complete']>>;
      try {
        response = await deps.llmClient.complete({
          model: deps.model ?? 'claude-sonnet-4-6',
          messages,
          response_format: { type: 'json_object' },
        } as CompletionRequest);
      } catch (err) {
        return {
          ok: true,
          output: { tags: [] } satisfies MaterializedTaggerOutput,
          diagnostics: [{
            severity: 'warning',
            code: 'tag_prompt_llm_error',
            message: `tag_prompt LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
            pass_id,
          }],
        };
      }

      const raw = response.choices[0]?.message?.content ?? '';
      const parsed = parseRawTaggerOutput(raw, pass_id);
      const materialized = materializeSpans(prompt, parsed.output, pass_id);

      return {
        ok: true,
        output: materialized.output,
        diagnostics: [...parsed.diagnostics, ...materialized.diagnostics],
      };
    },
  };
}

function findOccurrences(text: string, needle: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  if (needle.length === 0) return spans;

  let cursor = 0;
  while (cursor <= text.length) {
    const start = text.indexOf(needle, cursor);
    if (start === -1) break;
    spans.push([start, start + needle.length]);
    cursor = start + needle.length;
  }
  return spans;
}

function spanDiagnostic(
  code: string,
  tag: RawPromptTag,
  pass_id: string,
  details: Record<string, unknown> = {},
): PassDiagnostic {
  return {
    severity: 'warning',
    code,
    message: `Could not materialize ${tag.kind} tag "${tag.text}"`,
    pass_id,
    details: {
      kind: tag.kind,
      text: tag.text,
      ...(tag.nthOccurrence !== undefined ? { nthOccurrence: tag.nthOccurrence } : {}),
      ...details,
    },
  };
}
