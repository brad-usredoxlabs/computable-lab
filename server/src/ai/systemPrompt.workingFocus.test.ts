/**
 * PB-CH-4 — the WORKING FOCUS prompt block (matrix row "workingFocus reaches
 * the prompt"). The context-gap fix is inert unless the MODEL sees it: the
 * request's typed `workingFocus` renders as one block beside the ATTACHED
 * PROTOCOL block, ONLY when present, citing protocolId + stepId so "the step
 * I'm looking at" resolves to exactly that step and the model never invents one.
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

const BASE = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['transfer'],
};

describe('buildSystemPrompt — WORKING FOCUS block (PB-CH-4)', () => {
  it('renders the block only when workingFocus is present, citing protocolId + stepId', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      workingFocus: { protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate', ordinal: 2 },
    });

    expect(prompt).toContain('WORKING FOCUS:');
    expect(prompt).toContain('Step 2 — Read plate');
    expect(prompt).toContain('stepId step-read');
    expect(prompt).toContain('protocol PRT-000123');
    expect(prompt).toContain('never invent one');
  });

  it('renders no WORKING FOCUS block when workingFocus is absent (byte-stable prefix otherwise)', () => {
    const prompt = buildSystemPrompt(BASE);
    expect(prompt).not.toContain('WORKING FOCUS');
  });

  it('renders the ordinal as ? when the focus carries none (no invented number)', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      workingFocus: { protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate' },
    });
    expect(prompt).toContain('WORKING FOCUS:');
    expect(prompt).toContain('Step ? — Read plate');
  });
});
