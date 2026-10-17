/**
 * QMS7-7 FIX1 (adv-review D4) — envelope-shape LOCKSTEP test.
 *
 * The record-drafting envelope has two declarations: the compile-side
 * RECORD_DRAFT_ENVELOPE_SCHEMA (recordDraftCompile.ts — Ajv authority,
 * additionalProperties:false, required [operation,kind,fields]) and the
 * model-facing `recordDraft` tool-def property (submitSuggestionTool.ts).
 * Two authorities for one contract drift. This test pins them in lockstep:
 * the tool-def property's required keys and additionalProperties:false MUST
 * equal the compile-side envelope's, every tool-declared property must exist
 * in the envelope with the same structural type, and the envelope may carry
 * ONLY the compiler-injected extras (requestId — the workstate-intent
 * precedent). The compile-side schema is NEVER weakened to satisfy this test.
 *
 * RED at the fix base: the tool-def recordDraft property declares neither
 * `required` nor `additionalProperties:false` — the lockstep assertions fail.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_INTENT_TOOL_DEF } from '../ai/submitSuggestionTool.js';
import { RECORD_DRAFT_ENVELOPE_SCHEMA } from './recordDraftCompile.js';

type Shape = {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  const?: string;
  enum?: string[];
  minLength?: number;
  properties?: Record<string, Shape>;
};

const envelope = RECORD_DRAFT_ENVELOPE_SCHEMA as Shape;
const toolParams = AGENT_INTENT_TOOL_DEF.function.parameters as Shape;
const toolRecordDraft = toolParams.properties?.recordDraft;

describe('record-drafting envelope lockstep — tool-def property vs compile-side schema (QMS7-7 D4)', () => {
  it('the tool-def recordDraft property exists and is an object shape', () => {
    expect(toolRecordDraft).toBeDefined();
    expect(toolRecordDraft?.type).toBe('object');
  });

  it('required keys are IDENTICAL on both sides (no looser model-facing contract)', () => {
    expect(toolRecordDraft?.required).toEqual(envelope.required);
    // The compile-side authority stays exactly [operation, kind, fields].
    expect(envelope.required).toEqual(['operation', 'kind', 'fields']);
  });

  it('additionalProperties:false on BOTH sides — neither side accepts smuggled keys', () => {
    expect(toolRecordDraft?.additionalProperties).toBe(false);
    expect(envelope.additionalProperties).toBe(false);
  });

  it('every tool-declared property exists in the compile-side envelope with the same structural type', () => {
    const toolProps = toolRecordDraft?.properties ?? {};
    const envelopeProps = envelope.properties ?? {};
    for (const [key, shape] of Object.entries(toolProps)) {
      const twin = envelopeProps[key];
      expect(twin, `envelope is missing the tool-declared property "${key}"`).toBeDefined();
      expect(twin!.type).toBe(shape.type);
    }
  });

  it('the envelope carries NO extra properties beyond the compiler-injected requestId', () => {
    const toolKeys = Object.keys(toolRecordDraft?.properties ?? {}).sort();
    const envelopeKeys = Object.keys(envelope.properties ?? {}).sort();
    const extras = envelopeKeys.filter((k) => !toolKeys.includes(k));
    expect(extras).toEqual(['requestId']);
  });

  it('the verb is the same closed vocabulary on both sides (const vs single-value enum)', () => {
    expect(envelope.properties?.operation?.const).toBe('compose-record');
    expect(toolRecordDraft?.properties?.operation?.enum).toEqual(['compose-record']);
  });

  it('kind and fields shapes match on both sides', () => {
    expect(toolRecordDraft?.properties?.kind?.minLength).toBe(envelope.properties?.kind?.minLength);
    expect(toolRecordDraft?.properties?.kind?.type).toBe(envelope.properties?.kind?.type);
    expect(toolRecordDraft?.properties?.fields?.type).toBe(envelope.properties?.fields?.type);
  });
});
