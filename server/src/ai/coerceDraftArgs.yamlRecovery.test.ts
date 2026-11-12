import { describe, expect, it } from 'vitest';
import { coerceDraftArgsFromContent, recoverDraftArgsFromContent } from './AgentOrchestrator.js';
import { parseShorthandForChat } from './shorthandChat.js';

// L2-PROSE-SHORTHAND-SALVAGE-1 C1: the YAML arm of prose recovery. The
// document contract is NOT restated here — Ajv (parseShorthandForChat) is the
// sole authority; these legs only pin that the recovery path feeds it.
const DOCUMENT_YAML = `intentId: seed-hepg2
actions:
  - action: add_material
    material: DMEM
    volumeUl: 100
    targetWells: [A1]
`;

// One invalid enum value: `teleport_sample` is outside the closed verb enum.
const INVALID_ENUM_YAML = `intentId: seed-hepg2
actions:
  - action: teleport_sample
    material: DMEM
`;

const PROSE_MENTIONING_KEY =
  'The document needs a top-level intentId and an actions list, but this sentence is prose.';

/** The validator's OWN reason — never re-derived by the recovery path. */
function validatorReason(yaml: string): string {
  try {
    parseShorthandForChat(yaml);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('fixture must be rejected by parseShorthandForChat');
}

describe('YAML shorthand recovery (C1)', () => {
  it('recovers a fenced ```yaml scientist-intent document as event_shorthand args', () => {
    const result = recoverDraftArgsFromContent('```yaml\n' + DOCUMENT_YAML + '```');
    expect(result.args).toEqual({ intent: 'event_shorthand', shorthand: DOCUMENT_YAML.trim() });
    expect(result.recoveredFrom?.driver).toBe('yaml-shorthand');
  });

  it('recovers a BARE document with the same top-level keys identically', () => {
    const result = recoverDraftArgsFromContent(DOCUMENT_YAML);
    expect(result.args).toEqual({ intent: 'event_shorthand', shorthand: DOCUMENT_YAML.trim() });
    expect(result.recoveredFrom?.driver).toBe('yaml-shorthand');
  });

  it('does not recover a prose paragraph that merely mentions "intentId"', () => {
    expect(() => coerceDraftArgsFromContent(PROSE_MENTIONING_KEY)).not.toThrow();
    expect(coerceDraftArgsFromContent(PROSE_MENTIONING_KEY)).toBeNull();
    const result = recoverDraftArgsFromContent(PROSE_MENTIONING_KEY);
    expect(result.args).toBeNull();
    expect(result.recoveredFrom).toBeNull();
  });

  it('REFUSES an invalid enum value, carrying the validator reason and no args', () => {
    const result = recoverDraftArgsFromContent('```yaml\n' + INVALID_ENUM_YAML + '```');
    expect(result.args).toBeNull();
    expect(result.recoveredFrom).toBeNull();
    expect(result.refusal).toBeTruthy();
    expect(result.refusal).toContain(validatorReason(INVALID_ENUM_YAML));
    // and the coercer never hands a refused document to the compiler
    expect(coerceDraftArgsFromContent('```yaml\n' + INVALID_ENUM_YAML + '```')).toBeNull();
  });

  it('JSON-in-prose recovery is unchanged (still classifies fenced-json)', () => {
    const payload = '{"intent":"event_shorthand","shorthand":"intentId: x\\nactions: []"}';
    const result = recoverDraftArgsFromContent('```json\n' + payload + '\n```');
    expect(result.args).toEqual(JSON.parse(payload) as Record<string, unknown>);
    expect(result.recoveredFrom?.driver).toBe('fenced-json');
    expect(coerceDraftArgsFromContent(payload)).toEqual(JSON.parse(payload) as Record<string, unknown>);
  });
});
