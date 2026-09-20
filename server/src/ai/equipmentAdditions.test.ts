/**
 * Retirement pin: the event_graph path no longer authors records.
 *
 * `equipmentAdditions` was a field inside intent `event_graph`, which is exactly why
 * the model never reached for it — a sub-field of the wrong intent, with no verb in
 * its name. Authoring now has its own intent (`create_record`, see
 * createRecordIntent.test.ts) and this file keeps the old shape from creeping back.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_INTENT_TOOL_DEF, SUBMIT_SUGGESTION_TOOL_DEF, parseSubmitSuggestionArgs } from './submitSuggestionTool.js';

const USAGE = { promptTokens: 1, completionTokens: 1 };

function props(def: { function: { parameters: unknown } }) {
  return (def.function.parameters as { properties: Record<string, unknown> }).properties;
}

describe('equipmentAdditions is retired', () => {
  it('is gone from the emission contract', () => {
    expect(props(SUBMIT_SUGGESTION_TOOL_DEF).equipmentAdditions).toBeUndefined();
    expect(props(AGENT_INTENT_TOOL_DEF).equipmentAdditions).toBeUndefined();
  });

  it('is no longer parsed out of an event_graph submission', () => {
    const result = parseSubmitSuggestionArgs(
      { intent: 'event_graph', equipmentAdditions: [{ name: 'Benchmark Incu-Mixer MP4' }] },
      USAGE,
      1,
      1,
    );
    expect(result.recordCreations ?? []).toEqual([]);
    // …and the submission is reported as unusable rather than silently accepted.
    expect(result.notes?.join(' ')).toContain('Unrecognized fields: equipmentAdditions');
  });
});
