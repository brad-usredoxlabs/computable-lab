import { describe, expect, it } from 'vitest';
import {
  clarificationLoopMessage,
  clarificationSignature,
  detectClarificationLoop,
  normalizePrompt,
} from './clarificationLoop.js';
import {
  DRAFT_ARG_KEYS,
  draftArgCorrectionInstruction,
  draftArgDiagnostics,
  emptyDraftMessage,
  unknownDraftArgKeys,
} from './draftArgDiagnostics.js';

describe('draftArgDiagnostics — a dropped field is named, never silent', () => {
  it('names the invented `materials` field and says where the material belongs', () => {
    // The exact emission lfm-local repeated: materials:[{ref:'MSP-API-mu50x5z7'}]
    const args = { events: [{ event_type: 'add_material' }], materials: [{ ref: 'MSP-API-mu50x5z7' }] };
    expect(unknownDraftArgKeys(args)).toEqual(['materials']);
    const lines = draftArgDiagnostics(args);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('materials');
    expect(lines[0]).toContain('details.material_spec_ref');
  });

  it('stays silent for a clean draft', () => {
    for (const key of DRAFT_ARG_KEYS) {
      expect(draftArgDiagnostics({ [key]: [] })).toEqual([]);
    }
    expect(draftArgDiagnostics({})).toEqual([]);
    expect(draftArgDiagnostics(null)).toEqual([]);
  });

  it('falls back to a generic, still-actionable line for an unknown field', () => {
    const lines = draftArgDiagnostics({ events: [], wobble: 3 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('wobble');
    expect(lines[0]).toContain('not part of this tool’s arguments');
  });

  it('phrases the same diagnosis as an instruction for the model', () => {
    const instruction = draftArgCorrectionInstruction({ events: [], materials: [] });
    expect(instruction).toContain('Re-emit without `materials`');
    expect(draftArgCorrectionInstruction({ events: [] })).toBeUndefined();
  });
});

describe('clarificationLoop — the same question twice is reported, not repeated', () => {
  const ask = { prompt: 'Which material should be added to A1?', query: 'fenofibrate' };

  it('detects the second identical ask from the conversation history', () => {
    const history = [{ role: 'assistant', content: 'Which material should be added to A1?' }];
    const result = detectClarificationLoop({ requests: [ask], history });
    expect(result.looped).toBe(true);
    expect(result.repeated).toEqual([clarificationSignature(ask)]);
  });

  it('does not fire on the first ask', () => {
    expect(detectClarificationLoop({ requests: [ask], history: [] }).looped).toBe(false);
    expect(
      detectClarificationLoop({ requests: [ask], history: [{ role: 'user', content: 'hi' }] }).looped,
    ).toBe(false);
  });

  it('a genuinely different question is not a loop (the search seed is part of the identity)', () => {
    const history = [{ role: 'assistant', content: 'Which material should be added to A1?' }];
    const different = { prompt: 'Which material should be added to B7?', query: 'fenofibrate' };
    expect(detectClarificationLoop({ requests: [different], history }).looped).toBe(false);
  });

  it('the message states the problem and points at the way out', () => {
    const message = clarificationLoopMessage([clarificationSignature(ask)]);
    expect(message).toContain('clarification_loop');
    expect(message).toContain('applied directly');
  });

  it('normalizes wording noise before comparing', () => {
    expect(normalizePrompt('  Which   MATERIAL should be added? ')).toBe('which material should be added?');
  });
});

describe('emptyDraftMessage — no proposal is a failure with a cause', () => {
  it('names the output limit when the answer was cut off', () => {
    // Observed 2026-09-20: finish_reason "length", agent_intent with no fields,
    // run reported success=true / events=0, panel showed "no fields".
    const message = emptyDraftMessage({ truncated: true, hadArguments: false });
    expect(message).toContain('no proposal');
    expect(message).toContain('output limit');
    expect(message).toContain('max_tokens');
    expect(message).toContain('fewer wells');
  });

  it('names the empty tool call when the model sent no arguments at all', () => {
    const message = emptyDraftMessage({ truncated: false, hadArguments: false });
    expect(message).toContain('no proposal');
    expect(message).toContain('without any arguments');
    expect(message).toContain('Nothing was applied');
  });

  it('falls back to an actionable line for unusable arguments', () => {
    const message = emptyDraftMessage({ truncated: false, hadArguments: true });
    expect(message).toContain('no usable draft arguments');
    expect(message).toContain('Nothing was applied');
  });
});
