import { describe, expect, it, vi } from 'vitest';
import {
  createTagPromptPass,
  materializeSpans,
  parseRawTaggerOutput,
} from './PromptTagger';
import type { LlmClient } from '../pipeline/passes/ChatbotCompilePasses';

function makeState(prompt: string, mentions: unknown[] = []) {
  return {
    input: { prompt, mentions },
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

function makeLlmClient(content: string): LlmClient {
  return {
    complete: vi.fn(async () => ({
      choices: [{ message: { content } }],
    })),
  };
}

describe('PromptTagger', () => {
  it('materializes valid raw tag output into exact prompt spans', async () => {
    const prompt = 'Add 100uL to well A1 of the 12-well reservoir.';
    const pass = createTagPromptPass({
      llmClient: makeLlmClient(JSON.stringify({
        tags: [
          { kind: 'verb', text: 'Add' },
          { kind: 'quantity', text: '100uL' },
          { kind: 'well_address', text: 'A1' },
          { kind: 'noun_phrase', text: '12-well reservoir', candidateKinds: ['labware'] },
        ],
      })),
    });

    const result = await pass.run({ pass_id: 'tag_prompt', state: makeState(prompt) });
    const output = result.output as { tags: Array<{ text: string; span: [number, number] }> };

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(output.tags).toHaveLength(4);
    for (const tag of output.tags) {
      expect(prompt.slice(tag.span[0], tag.span[1])).toBe(tag.text);
    }
  });

  it('uses nthOccurrence to disambiguate repeated tag text', () => {
    const prompt = 'mix reservoir then transfer from reservoir';
    const result = materializeSpans(prompt, {
      tags: [{ kind: 'noun_phrase', text: 'reservoir', nthOccurrence: 2 }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.output.tags).toEqual([
      expect.objectContaining({
        text: 'reservoir',
        span: [33, 42],
      }),
    ]);
  });

  it('omits repeated tag text without nthOccurrence and emits a warning', () => {
    const result = materializeSpans('mix reservoir then transfer from reservoir', {
      tags: [{ kind: 'noun_phrase', text: 'reservoir' }],
    });

    expect(result.output.tags).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'tag_prompt_span_ambiguous',
      }),
    );
  });

  it('invalid JSON returns empty output plus warning diagnostic', () => {
    const result = parseRawTaggerOutput('{not json');

    expect(result.output.tags).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'tag_prompt_parse_error',
      }),
    );
  });

  it('shape mismatch returns empty output plus warning diagnostic', () => {
    const result = parseRawTaggerOutput(JSON.stringify({ tags: 'not an array' }));

    expect(result.output.tags).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'tag_prompt_shape_mismatch',
      }),
    );
  });

  it('preserves mention tags and trusted IDs from raw output', () => {
    const token = '[[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]]';
    const result = materializeSpans(`Add ${token} to A1`, {
      tags: [{
        kind: 'mention',
        text: token,
        mentionKind: 'aliquot',
        id: 'ALQ-PR9-TEST-CLO-001',
        label: 'Clofibrate stock tube',
      }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.output.tags[0]).toMatchObject({
      kind: 'mention',
      text: token,
      id: 'ALQ-PR9-TEST-CLO-001',
      span: [4, 4 + token.length],
    });
  });

  it('skips the LLM tagger when resolved mentions are already present', async () => {
    const llmClient = makeLlmClient(JSON.stringify({ tags: [{ kind: 'verb', text: 'Add' }] }));
    const pass = createTagPromptPass({ llmClient });

    const result = await pass.run({
      pass_id: 'tag_prompt',
      state: makeState(
        'Add [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to A1',
        [{ type: 'material', entityKind: 'aliquot', id: 'ALQ-PR9-TEST-CLO-001', label: 'Clofibrate stock tube' }],
      ),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ tags: [] });
    expect(llmClient.complete).not.toHaveBeenCalled();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        code: 'tag_prompt_skipped_for_resolved_mentions',
      }),
    );
  });
});
