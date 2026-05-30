import { describe, expect, it } from 'vitest';
import { parseSubmitSuggestionArgs, SUBMIT_SUGGESTION_TOOL_DEF } from './submitSuggestionTool.js';

const USAGE = { promptTokens: 10, completionTokens: 20 };

describe('parseSubmitSuggestionArgs', () => {
  it('parses events with a CURIE material into a grounded proposal', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          {
            verb: 'add_material',
            details: { volume_uL: 10 },
            materials: [{ slot: 'reagent', ref: { curie: 'CHEBI:5001' } }],
          },
        ],
        notes: ['ok'],
      },
      USAGE,
      2,
      3,
    );
    expect(r.success).toBe(true);
    expect(r.events).toHaveLength(1);
    const ev = r.events![0]!;
    expect(ev.verb).toBe('add_material');
    expect(ev.materials).toEqual([{ slot: 'reagent', ref: { curie: 'CHEBI:5001' } }]);
    expect(ev.provenance.actor).toBe('ai-agent');
    expect(ev.eventId).toBeTruthy();
    expect(r.notes).toEqual(['ok']);
    expect(r.usage?.totalTokens).toBe(30);
    expect(r.usage?.turns).toBe(2);
  });

  it('parses the mint variant for an ungrounded material', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          { verb: 'add_material', materials: [{ ref: { mint: { label: 'HepG2', domain: 'cell_line' } } }] },
        ],
      },
      USAGE,
      1,
      1,
    );
    expect(r.events![0]!.materials).toEqual([{ ref: { mint: { label: 'HepG2', domain: 'cell_line' } } }]);
  });

  it('captures a clarification with no events', () => {
    const r = parseSubmitSuggestionArgs(
      {
        clarification: {
          prompt: 'Which fenofibrate form?',
          entityType: 'material',
          options: [{ id: 'a', label: 'acid' }, { id: 'b', label: 'ester', snippet: 'CHEBI:…' }],
        },
      },
      USAGE,
      1,
      0,
    );
    expect(r.success).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.clarification?.options).toHaveLength(2);
    expect(r.clarification?.prompt).toContain('fenofibrate');
  });

  it('parses labwareAdditions', () => {
    const r = parseSubmitSuggestionArgs(
      { labwareAdditions: [{ recordId: 'LW-1', reason: 'needed' }, { reason: 'no id' }] },
      USAGE,
      1,
      0,
    );
    expect(r.labwareAdditions).toEqual([{ recordId: 'LW-1', reason: 'needed' }]);
  });

  it('degrades gracefully on malformed input', () => {
    const r = parseSubmitSuggestionArgs(
      { events: 'not-an-array', materials: 42, clarification: { prompt: 'x' } },
      USAGE,
      1,
      0,
    );
    expect(r.success).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.clarification).toBeUndefined(); // missing options/entityType
  });

  it('skips events without a verb and ignores invalid material refs', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          { details: {} }, // no verb → skipped
          { verb: 'transfer', materials: [{ ref: {} }, { ref: { curie: '' } }, { ref: { curie: 'CHEBI:1' } }] },
        ],
      },
      USAGE,
      1,
      0,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events![0]!.materials).toEqual([{ ref: { curie: 'CHEBI:1' } }]);
  });

  it('exposes a well-formed tool definition', () => {
    expect(SUBMIT_SUGGESTION_TOOL_DEF.type).toBe('function');
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.name).toBe('submit_suggestion');
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters).toHaveProperty('properties.events');
  });
});
