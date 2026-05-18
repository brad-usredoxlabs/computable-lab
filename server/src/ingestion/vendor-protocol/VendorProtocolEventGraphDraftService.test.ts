import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildVendorProtocolCompilePrompt,
  draftVendorProtocolEventGraph,
} from './VendorProtocolEventGraphDraftService.js';
import type { ProtocolCandidate } from './types.js';

function candidate(): ProtocolCandidate {
  return {
    kind: 'vendor-protocol-candidate',
    source: {
      documentId: 'doc-protocol-draft',
      filename: 'protocol.txt',
      title: 'Example Protocol',
      pageCount: 1,
    },
    title: 'Example Protocol',
    sections: [],
    materials: [{
      id: 'mat-binding-buffer',
      label: 'Binding Buffer',
      sourceText: 'Binding Buffer',
      provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
      confidence: 0.9,
    }],
    equipment: [{
      id: 'eq-magnet',
      label: 'magnetic stand',
      sourceText: 'magnetic stand',
      provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
      confidence: 0.8,
    }],
    labware: [{
      id: 'lw-plate',
      label: '96-well plate',
      sourceText: '96-well plate',
      provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
      confidence: 0.8,
    }],
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        sourceText: 'Add 100 ul Binding Buffer to the 96-well plate.',
        actions: [{
          actionKind: 'add',
          sourceText: 'Add 100 ul Binding Buffer to the 96-well plate.',
          material: 'Binding Buffer',
          volume: { raw: '100 ul', value: 100, unit: 'ul' },
          provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
        }],
        conditions: {},
        materials: ['Binding Buffer'],
        labware: ['96-well plate'],
        equipment: [],
        notes: [],
        branches: [],
        provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
        confidence: 0.9,
      },
      {
        id: 'step-2',
        stepNumber: 2,
        sourceText: 'Place the plate on a magnetic stand for 3 minutes.',
        actions: [{
          actionKind: 'magnetize',
          sourceText: 'Place the plate on a magnetic stand for 3 minutes.',
          equipment: 'magnetic stand',
          duration: { raw: '3 minutes', value: 3, unit: 'minutes' },
          provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
        }],
        conditions: { durations: [{ raw: '3 minutes', value: 3, unit: 'minutes' }] },
        materials: [],
        labware: ['plate'],
        equipment: ['magnetic stand'],
        notes: [],
        branches: [],
        provenance: { documentId: 'doc-protocol-draft', pageStart: 1 },
        confidence: 0.85,
      },
    ],
    tables: [],
    notes: [],
    outputs: [],
    diagnostics: [],
  };
}

describe('VendorProtocolEventGraphDraftService', () => {
  it('builds a compact compiler prompt from a protocol candidate', () => {
    const prompt = buildVendorProtocolCompilePrompt(candidate());

    expect(prompt).toContain('Protocol: Example Protocol');
    expect(prompt).toContain('Materials: Binding Buffer');
    expect(prompt).toContain('Labware: 96-well plate');
    expect(prompt).toContain('1. Add 100 ul Binding Buffer');
    expect(prompt).toContain('2. Place the plate on a magnetic stand');
  });

  it('runs an injected compiler and persists a draft event graph artifact', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-draft-'));
    try {
      const result = await draftVendorProtocolEventGraph({
        workspaceRoot,
        candidate: candidate(),
        compile: true,
        compileRunner: async () => ({
          outcome: 'complete',
          events: [{
            eventId: 'evt-add-1',
            event_type: 'add_material',
            details: { material: 'Binding Buffer', volume: '100 ul' },
          }],
          labwareAdditions: [{
            recordId: 'lbw-def-generic-96-well-plate',
            reason: 'compiled from vendor protocol',
            deckSlot: 'B2',
          }],
          unresolvedRefs: [],
          diagnostics: [],
          terminalArtifacts: {
            events: [],
            directives: [],
            gaps: [],
          },
        }),
      });

      expect(result.compileStatus).toBe('complete');
      expect(result.compile?.eventCount).toBe(1);
      expect(result.eventGraph.events).toHaveLength(1);
      expect(result.eventGraph.labwares[0]).toMatchObject({
        labwareType: 'lbw-def-generic-96-well-plate',
        deckSlot: 'B2',
      });
      expect(result.draftPath).toMatch(/^artifacts\/foundry\/protocol-event-graph-drafts\//);
      await expect(readFile(join(workspaceRoot, result.draftPath!), 'utf-8')).resolves.toContain('vendor-protocol-event-graph-draft');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
