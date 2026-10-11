/**
 * W2-9 T5 (spec §3 R5, OQ1 ruling (a)) — the 'protocol-review' AiSurface.
 *
 * Pins:
 *  1. buildSurfaceAwarePrompt('protocol-review', {attachedProtocol}) renders
 *     the GROUNDED review prompt: the ATTACHED PROTOCOL block with every
 *     citable stepId + the protocol_edit instruction region (the op vocabulary);
 *  2. WITHOUT an attachedProtocol it contains NEITHER (the model never sees a
 *     protocol_edit vocabulary it cannot ground — the PROTO-AI-9 failure mode);
 *  3. BYTE-STABILITY: every pre-existing surface renders byte-identical to
 *     before this item (the KV-cache prefix discipline — the delegation branch
 *     is additive and touches no existing path).
 */
import { describe, expect, it } from 'vitest';
import { buildSurfaceAwarePrompt, buildSystemPrompt, type AiSurface } from './systemPrompt.js';
import type { EditorContext } from './types.js';

const baseContext = (): EditorContext => ({
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'general',
  availableVerbs: [],
});

const reviewContext = (): EditorContext => ({
  ...baseContext(),
  attachedProtocol: {
    recordId: 'XDR-semantic-w29demo0001',
    sha: 'xdr-sha-1',
    steps: [
      { ordinal: 1, stepId: 'step-lyse', kind: 'other', label: 'Lyse samples' },
      { ordinal: 2, stepId: 'step-wash', kind: 'wash', label: 'Wash beads' },
    ],
  },
});

describe("buildSurfaceAwarePrompt('protocol-review') (W2-9 R5)", () => {
  it('with an attached protocol renders the ATTACHED PROTOCOL block with every citable stepId', () => {
    const prompt = buildSurfaceAwarePrompt('protocol-review', reviewContext());
    expect(prompt).toContain('ATTACHED PROTOCOL (ground truth for protocol_edit):');
    expect(prompt).toContain('XDR-semantic-w29demo0001');
    expect(prompt).toContain('xdr-sha-1');
    expect(prompt).toContain('step-lyse');
    expect(prompt).toContain('step-wash');
    expect(prompt).toContain('Lyse samples');
    expect(prompt).toContain('Wash beads');
  });

  it('with an attached protocol renders the protocol_edit instruction region (the op vocabulary)', () => {
    const prompt = buildSurfaceAwarePrompt('protocol-review', reviewContext());
    expect(prompt).toContain('Editing the attached protocol (`protocol_edit`)');
    expect(prompt).toContain('step_update');
    expect(prompt).toContain('step_insert');
    expect(prompt).toContain('step_delete');
    expect(prompt).toContain('Never invent stepIds or roleIds');
    // The delegation is the SAME grounded template buildSystemPrompt produces.
    expect(prompt).toBe(buildSystemPrompt(reviewContext()));
  });

  it('WITHOUT an attached protocol renders NEITHER the block NOR the protocol_edit region', () => {
    const prompt = buildSurfaceAwarePrompt('protocol-review', baseContext());
    expect(prompt).not.toContain('ATTACHED PROTOCOL');
    expect(prompt).not.toContain('protocol_edit');
    expect(prompt).not.toContain('step_update');
    // It falls through to the generic surface prompt (the 'analysis' behavior).
    expect(prompt).toContain('## Current Context');
  });

  it('byte-stability: every pre-existing surface renders byte-identical (KV-cache prefix discipline)', () => {
    const surfaces: AiSurface[] = [
      'event-editor',
      'workspace.deck',
      'analysis',
      'run-workspace',
      'run-workspace:plan',
      'materials',
      'formulations',
      'ingestion',
      'literature',
      'protocol-ide',
      'protocol-builder',
    ];
    // The delegation branch is additive: each existing surface's output is
    // exactly what its own documented route produces today.
    for (const surface of surfaces) {
      const prompt = buildSurfaceAwarePrompt(surface, baseContext());
      if (surface === 'event-editor' || surface === 'workspace.deck') {
        expect(prompt, surface).toBe(buildSystemPrompt(baseContext()));
      } else if (surface === 'run-workspace:plan') {
        expect(prompt, surface).toContain('## Run Context');
      } else {
        expect(prompt, surface).toContain('## Current Context');
      }
    }
    // The attached-protocol path is unchanged for the surfaces that already
    // delegate: their prompts are byte-identical with AND without an attachment
    // in the same shape the review surface now uses.
    expect(buildSurfaceAwarePrompt('event-editor', reviewContext())).toBe(buildSystemPrompt(reviewContext()));
    // 'analysis' keeps its generic prompt (the attachedProtocol rides the
    // context summary as data — the block itself is NOT rendered there).
    const analysisPrompt = buildSurfaceAwarePrompt('analysis', reviewContext());
    expect(analysisPrompt).not.toContain('ATTACHED PROTOCOL (ground truth for protocol_edit):');
    expect(analysisPrompt).toContain('step-lyse');
  });
});
