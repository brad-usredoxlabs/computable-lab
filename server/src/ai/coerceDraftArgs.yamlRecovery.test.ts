import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** Write a temp recovery-policy DATA file (the loader's injectable path seam). */
function tempPolicy(yaml: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'cl-draft-policy-'));
  const path = join(dir, 'draft-content-recovery.yaml');
  writeFileSync(path, yaml);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

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

  // advc C1 D1: the DATA gate is `enabled`, not just the shape pairing. Under a
  // mutation that ignores the policy (`declaredDraftDriver -> 'yaml-shorthand'`)
  // this leg goes RED; at HEAD it stays green.
  it('does NOT recover a declared-but-disabled shape (`enabled: false` gates the arm)', () => {
    const { path, cleanup } = tempPolicy(`shapes:
  - shape: fenced-json
    driver: fenced-json
    enabled: true
  - shape: fenced-yaml
    driver: yaml-shorthand
    enabled: false
`);
    try {
      for (const content of ['```yaml\n' + DOCUMENT_YAML + '```', DOCUMENT_YAML]) {
        const result = recoverDraftArgsFromContent(content, path);
        expect(result.args).toBeNull();
        expect(result.recoveredFrom).toBeNull();
        expect(coerceDraftArgsFromContent(content, path)).toBeNull();
      }
    } finally {
      cleanup();
    }
  });

  // advc C1 D3: the shape/driver vocabularies are CLOSED and fail closed by
  // decision — a DATA row outside the unions is a loud error naming what is accepted.
  it('fails CLOSED on DATA naming a shape outside the closed vocabulary', () => {
    const { path, cleanup } = tempPolicy(`shapes:
  - shape: prose-jsonl
    driver: yaml-shorthand
    enabled: true
`);
    try {
      expect(() => recoverDraftArgsFromContent(DOCUMENT_YAML, path))
        .toThrow(/`shape` must be one of tool-envelope, fenced-json, fenced-yaml, bare-yaml/);
    } finally {
      cleanup();
    }
  });

  it('fails CLOSED on DATA naming a driver outside the closed vocabulary', () => {
    const { path, cleanup } = tempPolicy(`shapes:
  - shape: fenced-yaml
    driver: yaml-json
    enabled: true
`);
    try {
      expect(() => recoverDraftArgsFromContent(DOCUMENT_YAML, path))
        .toThrow(/`driver` must be one of tool-envelope, fenced-json, yaml-shorthand/);
    } finally {
      cleanup();
    }
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
    // NAMED: the validator's own row names the offending verb, not a generic
    // "validation failed" — the gate's C1 refusal arm was a swallowed reason.
    expect(result.refusal).toContain('teleport_sample');
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
